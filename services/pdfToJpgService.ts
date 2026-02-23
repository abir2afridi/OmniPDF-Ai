/**
 * pdfToJpgService.ts — PDF → JPG Conversion Service (client-side)
 *
 * Pipeline:
 *   PDF file ──[pdfjs-dist]──▶ per-page canvas rendering
 *            ──[canvas.toDataURL / toBlob]──▶ JPEG/PNG bytes
 *
 * Design contract:
 *  - Pure engine — never downloads. Caller owns download & UI.
 *  - Returns ConvertedPage[] (one per selected page) or PageImage for thumbnails.
 *  - API-swap-ready: replace renderPage() with a fetch() to a real backend.
 *  - Reusable by: Batch, Split, Extract-Images, or any page-preview feature.
 *
 * Depends on:
 *  - pdfjs-dist (already in package.json)
 *  - Worker configured globally by pdfService.ts via GlobalWorkerOptions.workerSrc
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Ensure worker is set (pdfService.ts may already have done this, but be safe)
if (typeof GlobalWorkerOptions !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export type JpgQualityPreset = 'low' | 'medium' | 'high' | 'maximum';

/** Render scale presets — DPI equivalents */
export const QUALITY_SCALE: Record<JpgQualityPreset, number> = {
    low: 1.0,  // ~96 dpi
    medium: 1.5,  // ~144 dpi
    high: 2.0,  // ~192 dpi
    maximum: 3.0,  // ~288 dpi
};

export const QUALITY_JPEG_FACTOR: Record<JpgQualityPreset, number> = {
    low: 0.65,
    medium: 0.82,
    high: 0.92,
    maximum: 0.98,
};

/** One rendered page image */
export interface ConvertedPage {
    /** 1-based page number */
    pageNumber: number;
    /** Data URL (image/jpeg or image/png) */
    dataUrl: string;
    /** Raw Blob — for download or ZIP */
    blob: Blob;
    /** Pixel width */
    width: number;
    /** Pixel height */
    height: number;
    /** File size in bytes */
    size: number;
}

export interface PdfToJpgOptions {
    /** 1-based page numbers to convert. Defaults to all pages. */
    pageNumbers?: number[];
    /** Quality preset. Default: 'high' */
    quality?: JpgQualityPreset;
    /** Output image format. Default: 'jpeg' */
    format?: ImageFormat;
    /** Output filename prefix (no extension). Defaults to PDF basename. */
    outputPrefix?: string;
    /** Called with progress [0-100] as pages are rendered */
    onProgress?: (p: number) => void;
    /** Called after each page is done */
    onPageDone?: (page: ConvertedPage, index: number) => void;
}

export interface PdfToJpgResult {
    pages: ConvertedPage[];
    outputPrefix: string;
    totalPages: number;
    convertedPages: number;
    format: ImageFormat;
}

export interface BatchPdfToJpgResult {
    succeeded: { file: File; result: PdfToJpgResult }[];
    failed: { file: File; error: string }[];
}

/** Lightweight page metadata returned before full conversion */
export interface PdfPageMeta {
    pageNumber: number;      // 1-based
    width: number;           // px at scale=1
    height: number;          // px at scale=1
    thumbnail: string;       // data URL (jpeg, small)
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set(['application/pdf']);
const ALLOWED_EXT = '.pdf';
export const PDF_MAX_FILE_MB = 200;

// Thumbnail canvas width (px)
const THUMB_W = 180;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'pdf-image';
}

export function isPdfFile(file: File): boolean {
    const ext = ('.' + (file.name.split('.').pop() ?? '')).toLowerCase();
    return ALLOWED_TYPES.has(file.type) || ext === ALLOWED_EXT;
}

function validateFile(file: File): void {
    if (!isPdfFile(file))
        throw new Error(`"${file.name}" is not a PDF file.`);
    if (file.size > PDF_MAX_FILE_MB * 1024 * 1024)
        throw new Error(`"${file.name}" exceeds the ${PDF_MAX_FILE_MB} MB limit.`);
    if (file.size === 0)
        throw new Error(`"${file.name}" is empty.`);
}

export function validatePdfForImage(file: File): string | null {
    try { validateFile(file); return null; }
    catch (e: any) { return e.message; }
}

/** canvas → Blob (Promise wrapper) */
function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality: number): Promise<Blob> {
    const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob returned null'));
        }, mime, quality);
    });
}

// ── Page metadata (thumbnails) ─────────────────────────────────────────────────

/**
 * Load a PDF and return lightweight metadata + small thumbnail for every page.
 * Used to populate the page-selection UI without full conversion.
 */
export async function getPdfPageMeta(
    file: File,
    onProgress?: (p: number) => void
): Promise<PdfPageMeta[]> {
    validateFile(file);
    const bytes = await file.arrayBuffer();
    const pdfDoc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const total = pdfDoc.numPages;
    const metas: PdfPageMeta[] = [];

    for (let i = 1; i <= total; i++) {
        const page = await pdfDoc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = THUMB_W / vp1.width;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        metas.push({
            pageNumber: i,
            width: Math.round(vp1.width),
            height: Math.round(vp1.height),
            thumbnail: canvas.toDataURL('image/jpeg', 0.70),
        });
        onProgress?.(Math.round((i / total) * 100));
    }
    return metas;
}

// ── Core single-file conversion ────────────────────────────────────────────────

/**
 * Render selected (or all) pages of a PDF to JPEG/PNG images.
 * Returns ConvertedPage[] — does NOT download anything.
 */
export async function convertPdfToImages(
    file: File,
    options: PdfToJpgOptions = {}
): Promise<PdfToJpgResult> {
    const {
        pageNumbers,
        quality = 'high',
        format = 'jpeg',
        outputPrefix,
        onProgress,
        onPageDone,
    } = options;

    validateFile(file);
    onProgress?.(3);

    // Load via pdfjs
    let pdfDoc: any;
    try {
        const bytes = await file.arrayBuffer();
        pdfDoc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    } catch (err: any) {
        throw new Error(`Cannot open "${file.name}": ${err?.message ?? 'file may be corrupted or encrypted.'}`);
    }
    onProgress?.(10);

    const totalPages = pdfDoc.numPages;
    const targetPages = pageNumbers
        ? pageNumbers.filter(n => n >= 1 && n <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

    if (targetPages.length === 0)
        throw new Error('No valid pages selected for conversion.');

    const scale = QUALITY_SCALE[quality];
    const jpegQuality = QUALITY_JPEG_FACTOR[quality];
    const pages: ConvertedPage[] = [];

    for (let si = 0; si < targetPages.length; si++) {
        const pageNum = targetPages[si];
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;

        // White background for JPEG (transparent would show as black)
        if (format === 'jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, jpegQuality);
        const blob = await canvasToBlob(canvas, format, jpegQuality);

        const converted: ConvertedPage = {
            pageNumber: pageNum,
            dataUrl,
            blob,
            width: canvas.width,
            height: canvas.height,
            size: blob.size,
        };

        pages.push(converted);
        onPageDone?.(converted, si);
        onProgress?.(10 + Math.round(((si + 1) / targetPages.length) * 88));
    }

    onProgress?.(100);

    const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.pdf$/i, ''));
    return {
        pages,
        outputPrefix: base,
        totalPages,
        convertedPages: pages.length,
        format,
    };
}

// ── Batch conversion ───────────────────────────────────────────────────────────

export async function batchConvertPdfToImages(
    files: File[],
    options: Omit<PdfToJpgOptions, 'outputPrefix' | 'onProgress' | 'onPageDone'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (file: File, result: PdfToJpgResult, index: number) => void;
        onFileError?: (file: File, error: string, index: number) => void;
    } = {}
): Promise<BatchPdfToJpgResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: BatchPdfToJpgResult['succeeded'] = [];
    const failed: BatchPdfToJpgResult['failed'] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertPdfToImages(file, {
                ...convOpts,
                onProgress: p => onFileProgress?.(file.name, p),
            });
            succeeded.push({ file, result });
            onFileComplete?.(file, result, i);
        } catch (err: any) {
            const msg = err?.message ?? 'Unknown error';
            failed.push({ file, error: msg });
            onFileError?.(file, msg, i);
        }
    }
    return { succeeded, failed };
}

// ── ZIP helper ─────────────────────────────────────────────────────────────────

/**
 * Pack multiple ConvertedPage blobs into a JSZip and return the zip Blob.
 * Caller is responsible for triggering the download.
 */
export async function packPagesToZip(
    pages: ConvertedPage[],
    prefix: string,
    format: ImageFormat
): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
    const folder = zip.folder(prefix) ?? zip;

    for (const page of pages) {
        const name = `${prefix}_page${String(page.pageNumber).padStart(3, '0')}.${ext}`;
        folder.file(name, page.blob);
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
}
