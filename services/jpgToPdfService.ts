/**
 * jpgToPdfService.ts — Images → PDF Conversion Service (client-side)
 *
 * Pipeline:
 *   Image files ──[FileReader]──▶ data URL / ArrayBuffer
 *               ──[HTMLImageElement]──▶ natural dimensions
 *               ──[canvas]──▶ JPEG bytes (for PNG/WebP/etc.)
 *               ──[pdf-lib embedJpg]──▶ embedded image
 *               ──[PDFDocument.addPage]──▶ one page per image
 *               ──[pdfDoc.save()]──▶ Uint8Array PDF bytes
 *
 * Design:
 *  - Pure engine: no downloads, no UI side-effects.
 *  - Reusable by Merge, Batch, or future API endpoint.
 *  - Supports JPEG, PNG, WebP, GIF, BMP (via canvas re-encode to JPEG).
 *
 * Dependencies: pdf-lib (already in package.json)
 */

import { PDFDocument, PageSizes, rgb } from 'pdf-lib';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PageSize = 'a4' | 'letter' | 'legal' | 'a3' | 'fit';
export type PageOrientation = 'portrait' | 'landscape';
export type FitMode = 'contain' | 'fill' | 'original';

export interface JpgToPdfOptions {
    /** Page size preset. 'fit' = match image natural size. Default: 'a4' */
    pageSize?: PageSize;
    /** Orientation (ignored when pageSize is 'fit'). Default: 'portrait' */
    orientation?: PageOrientation;
    /** Page margin in pt (1 pt = 1/72 inch). Default: 36 (~0.5 in) */
    marginPt?: number;
    /** How to fit the image on the page. Default: 'contain' */
    fitMode?: FitMode;
    /** Background fill color in hex. Default: '#ffffff' */
    background?: string;
    /** Output filename without extension. Defaults to 'images' */
    outputName?: string;
    /** Progress callback [0-100] */
    onProgress?: (p: number) => void;
}

export interface JpgToPdfResult {
    bytes: Uint8Array;
    outputName: string;   // without .pdf
    pageCount: number;
    fileSizeBytes: number;
}

export interface BatchJpgToPdfResult {
    succeeded: { jobName: string; result: JpgToPdfResult }[];
    failed: { jobName: string; error: string }[];
}

/** Metadata loaded from an image file before conversion */
export interface ImageMeta {
    file: File;
    dataUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    /** Whether pdf-lib can embed natively (true = JPEG, false = needs canvas re-encode) */
    isNativeJpeg: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** pdf-lib PageSizes are in pts [w, h] in portrait */
const PAGE_DIMS: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
    a4: PageSizes.A4,
    letter: PageSizes.Letter,
    legal: PageSizes.Legal,
    a3: PageSizes.A3,
};

export const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml',
]);
export const ALLOWED_IMAGE_EXTS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif',
]);
export const IMG_MAX_FILE_MB = 50;
export const IMG_MAX_COUNT = 200;

// ── Validation ─────────────────────────────────────────────────────────────────

export function isImageFile(file: File): boolean {
    if (ALLOWED_IMAGE_TYPES.has(file.type)) return true;
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    return ALLOWED_IMAGE_EXTS.has(ext);
}

export function validateImageFile(file: File): string | null {
    if (!isImageFile(file))
        return `"${file.name}" is not a supported image (JPG, PNG, WebP, BMP, GIF, TIFF).`;
    if (file.size > IMG_MAX_FILE_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${IMG_MAX_FILE_MB} MB per-image limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── Image loading ──────────────────────────────────────────────────────────────

/** Load a File into an HTMLImageElement and extract metadata */
export function loadImageMeta(file: File): Promise<ImageMeta> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Cannot read "${file.name}"`));
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const img = new window.Image();
            img.onerror = () => reject(new Error(`"${file.name}" is corrupted or unsupported.`));
            img.onload = () => {
                const isNativeJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
                    || file.name.toLowerCase().endsWith('.jpg')
                    || file.name.toLowerCase().endsWith('.jpeg');
                resolve({
                    file,
                    dataUrl,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    isNativeJpeg,
                });
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}

/** Load metadata for multiple images, returning results and errors separately */
export async function loadAllImageMeta(
    files: File[],
    onProgress?: (p: number) => void,
): Promise<{ loaded: ImageMeta[]; errors: { file: File; error: string }[] }> {
    const loaded: ImageMeta[] = [];
    const errors: { file: File; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        try {
            const meta = await loadImageMeta(files[i]);
            loaded.push(meta);
        } catch (err: any) {
            errors.push({ file: files[i], error: err?.message ?? 'Failed to load image' });
        }
        onProgress?.(Math.round(((i + 1) / files.length) * 100));
    }
    return { loaded, errors };
}

// ── Canvas re-encode ───────────────────────────────────────────────────────────

/**
 * Re-encode any image (PNG, WebP, BMP…) to JPEG bytes via canvas.
 * Required because pdf-lib only has embedJpg and embedPng.
 * For PNG we use embedPng directly; for anything else → JPEG via canvas.
 */
async function imageToEmbedBytes(
    meta: ImageMeta,
    background: string,
): Promise<{ bytes: Uint8Array; isPng: boolean }> {
    const isPng = meta.file.type === 'image/png'
        || meta.file.name.toLowerCase().endsWith('.png');

    if (meta.isNativeJpeg || isPng) {
        // Read raw bytes directly
        const ab = await meta.file.arrayBuffer();
        return { bytes: new Uint8Array(ab), isPng };
    }

    // Rasterise via canvas → JPEG
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onerror = () => reject(new Error(`Cannot rasterise "${meta.file.name}"`));
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = background || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('Canvas toBlob returned null')); return; }
                blob.arrayBuffer().then(ab => resolve({ bytes: new Uint8Array(ab), isPng: false }));
            }, 'image/jpeg', 0.95);
        };
        img.src = meta.dataUrl;
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return (s || 'images')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'images';
}

/** Compute page dimensions in pts given a PageSize + orientation */
export function resolvePageDims(
    pageSize: PageSize,
    orientation: PageOrientation,
    imgW: number,
    imgH: number,
): [number, number] {
    if (pageSize === 'fit') {
        // 1 px ≈ 0.75 pt  (96 dpi → 72 pt/in)
        const ptW = imgW * 0.75;
        const ptH = imgH * 0.75;
        return [ptW, ptH];
    }
    const [w, h] = PAGE_DIMS[pageSize];
    return orientation === 'landscape' ? [h, w] : [w, h];
}

/** Scale image to fit inside a box, maintaining aspect ratio */
function scaleToFit(
    imgW: number, imgH: number,
    boxW: number, boxH: number,
): { w: number; h: number } {
    const scale = Math.min(boxW / imgW, boxH / imgH);
    return { w: imgW * scale, h: imgH * scale };
}

// ── Core conversion ────────────────────────────────────────────────────────────

/**
 * Convert an ordered list of ImageMeta objects into a single PDF.
 * Does NOT download — returns bytes to caller.
 */
export async function convertImagesToPdf(
    images: ImageMeta[],
    options: JpgToPdfOptions = {},
): Promise<JpgToPdfResult> {
    if (images.length === 0) throw new Error('No images provided.');

    const {
        pageSize = 'a4',
        orientation = 'portrait',
        marginPt = 36,
        fitMode = 'contain',
        background = '#ffffff',
        outputName = 'images',
        onProgress,
    } = options;

    onProgress?.(2);
    const pdfDoc = await PDFDocument.create();
    onProgress?.(5);

    for (let i = 0; i < images.length; i++) {
        const meta = images[i];

        // ── Resolve page size
        const [pageW, pageH] = resolvePageDims(pageSize, orientation, meta.naturalWidth, meta.naturalHeight);

        // ── Embed image
        let embedBytes: Uint8Array;
        let isPng = false;
        try {
            const res = await imageToEmbedBytes(meta, background);
            embedBytes = res.bytes;
            isPng = res.isPng;
        } catch (err: any) {
            throw new Error(`Failed to process "${meta.file.name}": ${err?.message}`);
        }

        let embedded: Awaited<ReturnType<typeof pdfDoc.embedJpg>>;
        try {
            embedded = isPng
                ? await pdfDoc.embedPng(embedBytes)
                : await pdfDoc.embedJpg(embedBytes);
        } catch {
            // PNG embed might fail for corrupted or unusual PNGs — try JPEG fallback
            try {
                embedded = await pdfDoc.embedJpg(embedBytes);
            } catch (err2: any) {
                throw new Error(`Cannot embed "${meta.file.name}" into PDF: ${err2?.message}`);
            }
        }

        // ── Add page
        const page = pdfDoc.addPage([pageW, pageH]);

        // ── Draw background
        if (background && background !== '#ffffff') {
            const [rv, gv, bv] = hexToRgb1(background);
            page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(rv, gv, bv) });
        }

        // ── Position image
        const usableW = pageW - marginPt * 2;
        const usableH = pageH - marginPt * 2;

        let drawW: number, drawH: number, drawX: number, drawY: number;

        if (fitMode === 'fill') {
            // Stretch to fill usable area — ignores aspect ratio
            drawW = usableW;
            drawH = usableH;
            drawX = marginPt;
            drawY = marginPt;
        } else if (fitMode === 'original') {
            // Use natural pixel size → pt conversion
            drawW = Math.min(meta.naturalWidth * 0.75, usableW);
            drawH = Math.min(meta.naturalHeight * 0.75, usableH);
            drawX = marginPt + (usableW - drawW) / 2;
            drawY = marginPt + (usableH - drawH) / 2;
        } else {
            // 'contain' — default: scale down to fit, preserve aspect ratio
            const scaled = scaleToFit(meta.naturalWidth, meta.naturalHeight, usableW, usableH);
            drawW = scaled.w;
            drawH = scaled.h;
            drawX = marginPt + (usableW - drawW) / 2;
            drawY = marginPt + (usableH - drawH) / 2;
        }

        page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });
        onProgress?.(5 + Math.round(((i + 1) / images.length) * 90));
    }

    onProgress?.(97);
    const pdfBytes = await pdfDoc.save();
    const outName = sanitizeName(outputName);
    onProgress?.(100);

    return {
        bytes: new Uint8Array(pdfBytes),
        outputName: outName,
        pageCount: images.length,
        fileSizeBytes: pdfBytes.byteLength,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

/** Convert multiple independent image sets, each producing its own PDF */
export async function batchConvertImagesToPdf(
    jobs: { jobName: string; images: ImageMeta[]; options?: JpgToPdfOptions }[],
    onJobProgress?: (jobName: string, p: number) => void,
): Promise<BatchJpgToPdfResult> {
    const succeeded: BatchJpgToPdfResult['succeeded'] = [];
    const failed: BatchJpgToPdfResult['failed'] = [];

    for (const job of jobs) {
        try {
            const result = await convertImagesToPdf(job.images, {
                ...job.options,
                outputName: job.jobName,
                onProgress: p => onJobProgress?.(job.jobName, p),
            });
            succeeded.push({ jobName: job.jobName, result });
        } catch (err: any) {
            failed.push({ jobName: job.jobName, error: err?.message ?? 'Unknown error' });
        }
    }
    return { succeeded, failed };
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**  '#rrggbb' → [r, g, b] each in [0, 1] */
function hexToRgb1(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Human-readable file size */
export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

export { PAGE_DIMS };
