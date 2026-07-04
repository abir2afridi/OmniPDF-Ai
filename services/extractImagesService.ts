/**
 * extractImagesService.ts — PDF Embedded-Image Extractor (client-side)
 *
 * Strategy:
 *   For each requested page:
 *   1. Load page via pdfjs-dist
 *   2. Walk the operator list for paintImageXObject / paintInlineImageXObject
 *   3. Pull the decoded ImageData from the page's commonObjs/objs cache
 *   4. Draw the ImageData onto a hidden canvas
 *   5. Export canvas as PNG or JPEG (caller's choice) → blob URL
 *
 * Limitations:
 *   - Images embedded via Form XObjects (nested) are detected but may
 *     not be fully decoded by pdfjs in all cases.
 *   - Mask-only images (1-bit stencil) are skipped.
 *   - True vector graphics (paths, text as vector) are not "images" —
 *     use the PDF→JPG module if you want page-renders.
 *
 * Swap note:
 *   The `extractImagesFromPdf` function is swap-ready: replace its body
 *   with a fetch() to a server-side route (pdfimages, pdf-lib, pdfplumber)
 *   for deeper extraction including Form XObjects and soft-mask images.
 *
 * Dependencies (already installed):
 *   - pdfjs-dist
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

async function loadPdfjs() {
    const pdfjsLib = await import('pdfjs-dist');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return pdfjsLib;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImageFormat = 'png' | 'jpeg';

export interface ExtractedImage {
    id: string;      // unique across session
    pageIndex: number;      // 0-based PDF page
    pageLabel: string;      // "Page N"
    name: string;      // auto-generated filename (no ext)
    width: number;      // original pixel width
    height: number;      // original pixel height
    format: ImageFormat; // format exported to
    blobUrl: string;      // object URL for preview & download
    blob: Blob;        // raw blob
    sizeBytes: number;
}

export interface ExtractOptions {
    /** 0-based page indices. Omit = all pages. */
    selectedPages?: number[];
    /** Output format for each extracted image. Default: 'png' */
    format?: ImageFormat;
    /** JPEG quality [0-1]. Only used when format='jpeg'. Default: 0.92 */
    jpegQuality?: number;
    /** Progress callback 0–100 */
    onProgress?: (p: number) => void;
}

export interface ExtractResult {
    images: ExtractedImage[];
    totalPages: number;
    scannedPages: number;
    /** Pages that had no extractable raster images */
    emptyPages: number[];
}

export interface BatchExtractResult {
    succeeded: { fileName: string; result: ExtractResult }[];
    failed: { fileName: string; error: string }[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export const EXTRACT_MAX_MB = 100;
export const EXTRACT_MAX_PAGES = 300;

export function validatePdfForExtract(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > EXTRACT_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${EXTRACT_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
const nextId = () => `img_${Date.now()}_${++_seq}`;

// ── Image extraction for a single page ───────────────────────────────────────

/**
 * Walk operator list for a page, pull ImageData objects from the pdfjs
 * internal resource cache, and render each to a canvas.
 */
async function extractFromPage(
    page: PDFPageProxy,
    pageIdx: number,
    format: ImageFormat,
    quality: number,
    baseName: string,
    imgIdx: { n: number },
): Promise<ExtractedImage[]> {
    const results: ExtractedImage[] = [];

    // We need pdfjs to fully decode images; render to an offscreen canvas
    // then walk objs to pull individual images.
    // pdfjs exposes image data through the operatorList + commonObjs/objs.

    let opList: any;
    try {
        opList = await (page as any).getOperatorList();
    } catch {
        return [];
    }

    const OPS = (await import('pdfjs-dist')).OPS;

    // Build a set of image keys referenced on this page
    const imageKeys = new Set<string>();
    for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
            const key = opList.argsArray[i]?.[0];
            if (typeof key === 'string') imageKeys.add(key);
        }
    }

    if (imageKeys.size === 0) return [];

    // Ensure resource objects are loaded (pdfjs lazily loads them)
    // We trigger a full render to an offscreen canvas so pdfjs populates objs
    const vp = page.getViewport({ scale: 0.1 }); // tiny render just to populate cache
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    try {
        await page.render({
            canvasContext: canvas.getContext('2d')!,
            viewport: vp,
        }).promise;
    } catch { /* ignore render errors */ }

    // Access the page's internal object store
    const objs: any = (page as any).objs;
    const commonObjs: any = (page as any).commonObjs;

    for (const key of imageKeys) {
        // pdfjs stores decoded images in either objs or commonObjs
        let imgData: any = null;
        try {
            if (objs?.has(key)) imgData = objs.get(key);
            else if (commonObjs?.has(key)) imgData = commonObjs.get(key);
        } catch { continue; }

        if (!imgData) continue;

        // Extract pixel data — pdfjs may store it in various formats
        let pixelData: Uint8ClampedArray | Uint8Array | ArrayLike<number> | null = null;
        let w = 0, h = 0;

        // Case 1: imgData has data/width/height directly
        if (imgData.data && typeof imgData.data === 'object' && imgData.width && imgData.height) {
            pixelData = imgData.data;
            w = imgData.width;
            h = imgData.height;
        }
        // Case 2: imgData.imgData (nested)
        else if (imgData.imgData?.data && typeof imgData.imgData?.data === 'object' && imgData.imgData?.width && imgData.imgData?.height) {
            pixelData = imgData.imgData.data;
            w = imgData.imgData.width;
            h = imgData.imgData.height;
        }
        // Case 3: imgData.bitmap (ImageBitmap)
        else if (imgData.bitmap instanceof ImageBitmap) {
            w = imgData.bitmap.width;
            h = imgData.bitmap.height;
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = w; tmpCanvas.height = h;
            const ctx = tmpCanvas.getContext('2d')!;
            ctx.drawImage(imgData.bitmap, 0, 0);
            const id = ctx.getImageData(0, 0, w, h);
            pixelData = id.data;
        }
        // Case 4: HTMLImageElement
        else if (imgData instanceof HTMLImageElement || imgData?.tagName === 'IMG') {
            w = imgData.naturalWidth || imgData.width;
            h = imgData.naturalHeight || imgData.height;
            if (w > 0 && h > 0) {
                const tmpC = document.createElement('canvas');
                tmpC.width = w; tmpC.height = h;
                const ctx = tmpC.getContext('2d')!;
                ctx.drawImage(imgData, 0, 0);
                pixelData = ctx.getImageData(0, 0, w, h).data;
            }
        }
        // Case 5: imgData has bytes/pixels getter (pdfjs internal stream)
        else if (imgData.getBytes && typeof imgData.getWidth === 'function') {
            w = imgData.getWidth();
            h = imgData.getHeight();
            const bytes = imgData.getBytes();
            if (bytes && w > 0 && h > 0) {
                pixelData = new Uint8Array(bytes);
            }
        }

        if (!pixelData || w <= 0 || h <= 0) continue;
        // Skip 1×1 px images (color space markers, masks)
        if (w <= 1 && h <= 1) continue;

        // Paint onto a canvas
        let imgCanvas: HTMLCanvasElement;
        try {
            imgCanvas = document.createElement('canvas');
            imgCanvas.width = w;
            imgCanvas.height = h;
            const ctx = imgCanvas.getContext('2d')!;
            // pixelData may be Uint8ClampedArray (RGBA) or Uint8Array (RGB)
            let rgba: Uint8ClampedArray;
            if (pixelData.length === w * h * 4) {
                rgba = pixelData instanceof Uint8ClampedArray ? pixelData : new Uint8ClampedArray(pixelData);
            } else if (pixelData.length === w * h * 3) {
                rgba = new Uint8ClampedArray(w * h * 4);
                for (let p = 0, q = 0; p < pixelData.length; p += 3, q += 4) {
                    rgba[q] = pixelData[p];
                    rgba[q + 1] = pixelData[p + 1];
                    rgba[q + 2] = pixelData[p + 2];
                    rgba[q + 3] = 255;
                }
            } else if (pixelData.length === w * h) {
                rgba = new Uint8ClampedArray(w * h * 4);
                for (let p = 0, q = 0; p < pixelData.length; p++, q += 4) {
                    rgba[q] = rgba[q + 1] = rgba[q + 2] = pixelData[p];
                    rgba[q + 3] = 255;
                }
            } else {
                continue;
            }
            ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
        } catch { continue; }

        // Export to blob
        let blob: Blob;
        try {
            blob = await new Promise<Blob>((res, rej) => {
                imgCanvas.toBlob(
                    b => b ? res(b) : rej(new Error('toBlob returned null')),
                    format === 'jpeg' ? 'image/jpeg' : 'image/png',
                    quality,
                );
            });
        } catch { continue; }

        const ext = format === 'jpeg' ? 'jpg' : 'png';
        const name = `${baseName}_p${pageIdx + 1}_img${String(imgIdx.n).padStart(3, '0')}`;
        imgIdx.n++;

        results.push({
            id: nextId(),
            pageIndex: pageIdx,
            pageLabel: `Page ${pageIdx + 1}`,
            name,
            width: w,
            height: h,
            format,
            blobUrl: URL.createObjectURL(blob),
            blob,
            sizeBytes: blob.size,
        });
    }

    return results;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Extract all raster images embedded in a PDF file.
 * Swap the body of this function for a fetch() when a backend is available.
 */
export async function extractImagesFromPdf(
    file: File,
    options: ExtractOptions = {},
): Promise<ExtractResult> {
    const err = validatePdfForExtract(file);
    if (err) throw new Error(err);

    const {
        format = 'png',
        jpegQuality = 0.92,
        onProgress,
    } = options;

    onProgress?.(2);

    let pdf: PDFDocumentProxy;
    try {
        const pdfjsLib = await loadPdfjs();
        pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted or encrypted.`);
    }

    const total = pdf.numPages;
    const pageIndices = options.selectedPages?.length
        ? options.selectedPages.filter(i => i >= 0 && i < total)
        : Array.from({ length: total }, (_, i) => i);

    if (pageIndices.length === 0) throw new Error('No valid pages selected.');
    if (pageIndices.length > EXTRACT_MAX_PAGES)
        throw new Error(`Too many pages (max ${EXTRACT_MAX_PAGES}).`);

    onProgress?.(5);

    const baseName = sanitizeName(file.name.replace(/\.pdf$/i, ''));
    const allImages: ExtractedImage[] = [];
    const emptyPages: number[] = [];
    const imgIdx = { n: 1 };

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        onProgress?.(5 + Math.round((pi / pageIndices.length) * 90));

        let page: PDFPageProxy;
        try {
            page = await pdf.getPage(pageIdx + 1);
        } catch { emptyPages.push(pageIdx); continue; }

        const imgs = await extractFromPage(page, pageIdx, format, jpegQuality, baseName, imgIdx);
        if (imgs.length === 0) emptyPages.push(pageIdx);
        allImages.push(...imgs);

        // Allow the event-loop to breathe between pages
        await new Promise(r => setTimeout(r, 0));
    }

    onProgress?.(100);

    return {
        images: allImages,
        totalPages: total,
        scannedPages: pageIndices.length,
        emptyPages,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchExtractImages(
    files: File[],
    options: Omit<ExtractOptions, 'onProgress'> = {},
    onJobProgress?: (name: string, p: number) => void,
): Promise<BatchExtractResult> {
    const succeeded: BatchExtractResult['succeeded'] = [];
    const failed: BatchExtractResult['failed'] = [];

    for (const file of files) {
        try {
            const result = await extractImagesFromPdf(file, {
                ...options,
                onProgress: p => onJobProgress?.(file.name, p),
            });
            succeeded.push({ fileName: file.name, result });
        } catch (err: any) {
            failed.push({ fileName: file.name, error: err?.message ?? 'Unknown error' });
        }
    }
    return { succeeded, failed };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/** Revoke all blob URLs for a list of images — call when component unmounts */
export function revokeImageUrls(images: ExtractedImage[]): void {
    for (const img of images) {
        try { URL.revokeObjectURL(img.blobUrl); } catch { /* ignore */ }
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function sanitizeName(s: string): string {
    return (s || 'document')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'document';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
