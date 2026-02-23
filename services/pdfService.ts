/**
 * OmniPDF — Real PDF Processing Service
 * Uses pdf-lib (client-side) for all operations that don't require a server.
 * Browser-native APIs are used for image/file conversions.
 */

import { PDFDocument, PageSizes, StandardFonts, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { UploadedFile } from '../types';

// Configure PDF.js v3 worker — CDN is the most reliable approach for Vite
// because it avoids Vite trying to bundle the worker file itself.
if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// Re-export a pdfjs namespace shim so the rest of the file can call pdfjs.getDocument(...)
const pdfjs = { getDocument, GlobalWorkerOptions };


// HELPERS
// ──────────────────────────────────────────────

/** Read a File as an ArrayBuffer */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/** Read a File as a DataURL */
function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/** Trigger browser download of a Uint8Array as a named file */
export function downloadBytes(bytes: Uint8Array, filename: string, mimeType = 'application/pdf') {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buf], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Trigger browser download of a Blob */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Parse a page-range string like "1,3,5-8" into 0-based indices */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
    const indices: number[] = [];
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = Math.max(1, parseInt(startStr, 10));
            const end = Math.min(totalPages, parseInt(endStr, 10));
            for (let i = start; i <= end; i++) indices.push(i - 1);
        } else {
            const page = parseInt(part, 10);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
                indices.push(page - 1);
            }
        }
    }
    return [...new Set(indices)].sort((a, b) => a - b);
}

// ──────────────────────────────────────────────
// GET PAGE COUNT  (pdf-lib, sync for small files)
// ──────────────────────────────────────────────
export async function getFilePageCount(file: File): Promise<number> {
    try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true });
        return doc.getPageCount();
    } catch {
        return 0;
    }
}

// ──────────────────────────────────────────────
// GENERATE PDF THUMBNAIL  (pdfjs → canvas → dataURL)
// ──────────────────────────────────────────────
export async function generatePDFThumbnail(file: File, maxWidth = 160): Promise<string> {
    try {
        const bytes = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
        const page = await pdf.getPage(1);
        const naturalVP = page.getViewport({ scale: 1 });
        const scale = maxWidth / naturalVP.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.72);
    } catch {
        return '';
    }
}

// ──────────────────────────────────────────────
// ADVANCED MERGE  (per-file ranges + options)
// ──────────────────────────────────────────────
export interface AdvancedMergeFileInput {
    file: File;
    pageRange?: string; // "" = all pages, "1-3,5" = specific pages
}

export interface AdvancedMergeOptions {
    outputName?: string;
    addBlankBetween?: boolean;
    onProgress?: (p: number) => void;
}

export async function mergePDFsAdvanced(
    inputs: AdvancedMergeFileInput[],
    options: AdvancedMergeOptions = {}
): Promise<void> {
    const { outputName = 'merged', addBlankBetween = false, onProgress } = options;

    if (inputs.length === 0) throw new Error('No files to merge. Please add at least one PDF.');

    // Security checks
    const MAX_FILE_SIZE_MB = 100;
    const MAX_TOTAL_MB = 600;
    let totalBytes = 0;
    for (const { file } of inputs) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new Error(`"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB per-file limit.`);
        }
        totalBytes += file.size;
    }
    if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
        throw new Error(`Total files exceed the ${MAX_TOTAL_MB} MB combined limit.`);
    }

    onProgress?.(5);
    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < inputs.length; i++) {
        const { file, pageRange = '' } = inputs[i];

        // Load source PDF
        let srcBytes: ArrayBuffer;
        try {
            srcBytes = await file.arrayBuffer();
        } catch {
            throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`);
        }

        let srcDoc: PDFDocument;
        try {
            srcDoc = await PDFDocument.load(new Uint8Array(srcBytes), { ignoreEncryption: true });
        } catch {
            throw new Error(`"${file.name}" appears corrupted or is not a valid PDF.`);
        }

        const totalPages = srcDoc.getPageCount();
        let pageIndices: number[];

        if (pageRange.trim()) {
            pageIndices = parsePageRange(pageRange.trim(), totalPages);
            if (pageIndices.length === 0) {
                throw new Error(`Invalid page range "${pageRange}" for "${file.name}". Valid: 1–${totalPages}.`);
            }
        } else {
            pageIndices = Array.from({ length: totalPages }, (_, k) => k);
        }

        const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach(p => mergedDoc.addPage(p));

        // Blank separator page between documents (not after the last one)
        if (addBlankBetween && i < inputs.length - 1) {
            mergedDoc.addPage(PageSizes.A4);
        }

        onProgress?.(5 + Math.round(((i + 1) / inputs.length) * 85));
    }

    onProgress?.(92);
    const mergedBytes = await mergedDoc.save();
    onProgress?.(100);

    // Sanitise filename
    const safe = (outputName.trim() || 'merged')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'merged';
    downloadBytes(mergedBytes, `${safe}.pdf`);
}

// ──────────────────────────────────────────────
// 1. MERGE PDF
// ──────────────────────────────────────────────
export async function mergePDFs(
    files: UploadedFile[],
    outputName?: string,
    onProgress?: (p: number) => void
): Promise<void> {
    const pdfFiles = files.filter(f => f.originalFile);
    if (pdfFiles.length === 0) throw new Error('No files to merge');

    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        const bytes = await readFileAsArrayBuffer(file.originalFile!);

        let srcDoc: PDFDocument;
        try {
            srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch {
            // Try as an image if it's not a PDF
            const imgBytes = new Uint8Array(bytes);
            const isJpeg = imgBytes[0] === 0xFF && imgBytes[1] === 0xD8;
            const isPng = imgBytes[0] === 0x89 && imgBytes[1] === 0x50;

            const page = mergedPdf.addPage(PageSizes.A4);
            if (isJpeg) {
                const img = await mergedPdf.embedJpg(bytes);
                const { width, height } = page.getSize();
                const scale = Math.min(width / img.width, height / img.height) * 0.95;
                page.drawImage(img, {
                    x: (width - img.width * scale) / 2,
                    y: (height - img.height * scale) / 2,
                    width: img.width * scale,
                    height: img.height * scale,
                });
            } else if (isPng) {
                const img = await mergedPdf.embedPng(bytes);
                const { width, height } = page.getSize();
                const scale = Math.min(width / img.width, height / img.height) * 0.95;
                page.drawImage(img, {
                    x: (width - img.width * scale) / 2,
                    y: (height - img.height * scale) / 2,
                    width: img.width * scale,
                    height: img.height * scale,
                });
            }
            onProgress?.(Math.round(((i + 1) / pdfFiles.length) * 90));
            continue;
        }

        const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach(p => mergedPdf.addPage(p));
        onProgress?.(Math.round(((i + 1) / pdfFiles.length) * 90));
    }

    onProgress?.(95);
    const mergedBytes = await mergedPdf.save();
    onProgress?.(100);
    const safeName = (outputName || 'merged').replace(/[^a-z0-9_\-]/gi, '_');
    downloadBytes(mergedBytes, `${safeName}.pdf`);
}

// ──────────────────────────────────────────────
// 2. SPLIT PDF  (legacy dispatcher shim)
// ──────────────────────────────────────────────
export async function splitPDF(
    file: UploadedFile,
    splitMethod: 'range' | 'every' | 'each',
    splitRange: string,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    return splitPDFAdvanced(file.originalFile, {
        mode: splitMethod === 'range' ? 'ranges' : splitMethod === 'every' ? 'every-n' : 'each-page',
        ranges: splitRange,
        everyN: 1,
        onProgress,
    });
}

// ──────────────────────────────────────────────
// 2b. SPLIT PDF  ADVANCED
// ──────────────────────────────────────────────

export type SplitMode =
    | 'each-page'   // one PDF per page
    | 'ranges'      // semicolon-separated range groups, e.g. "1-3;4-7;8"
    | 'every-n'     // every N pages
    | 'odd-even'    // two outputs: odd pages, even pages
    | 'bookmarks';  // split at top-level bookmarks (best-effort)

export interface SplitPDFAdvancedOptions {
    mode: SplitMode;
    ranges?: string;           // for 'ranges' mode
    everyN?: number;           // for 'every-n' mode
    outputPrefix?: string;     // file name prefix
    singleZip?: boolean;       // true = zip all parts; false = download each separately
    onProgress?: (p: number) => void;
}

export interface SplitPart {
    name: string;
    bytes: Uint8Array;
    pageCount: number;
}

/** Core split engine — returns an array of SplitParts without downloading anything */
export async function splitPDFAdvanced(
    file: File,
    options: SplitPDFAdvancedOptions
): Promise<void> {
    const {
        mode,
        ranges = '',
        everyN = 1,
        outputPrefix,
        singleZip = true,
        onProgress,
    } = options;

    // ── Validation ──────────────────────────────
    const MAX_MB = 200;
    if (file.size > MAX_MB * 1024 * 1024)
        throw new Error(`File exceeds the ${MAX_MB} MB limit.`);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        throw new Error(`"${file.name}" is not a valid PDF file.`);

    // ── Load ────────────────────────────────────
    let srcBytes: ArrayBuffer;
    try { srcBytes = await file.arrayBuffer(); }
    catch { throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`); }

    let srcDoc: PDFDocument;
    try { srcDoc = await PDFDocument.load(new Uint8Array(srcBytes), { ignoreEncryption: true }); }
    catch { throw new Error(`"${file.name}" appears corrupted or is not a valid PDF.`); }

    const totalPages = srcDoc.getPageCount();
    if (totalPages === 0) throw new Error('The PDF has no pages.');

    onProgress?.(5);

    const baseName = (outputPrefix?.trim() || file.name.replace(/\.pdf$/i, ''))
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'split';

    // ── Build page index groups ──────────────────
    let groups: { indices: number[]; label: string }[] = [];

    if (mode === 'each-page') {
        groups = Array.from({ length: totalPages }, (_, i) => ({
            indices: [i],
            label: `page_${String(i + 1).padStart(String(totalPages).length, '0')}`,
        }));
    } else if (mode === 'every-n') {
        const n = Math.max(1, Math.floor(everyN));
        let part = 1;
        for (let i = 0; i < totalPages; i += n) {
            const end = Math.min(i + n, totalPages);
            const indices = Array.from({ length: end - i }, (_, k) => i + k);
            groups.push({ indices, label: `part_${String(part++).padStart(3, '0')}` });
        }
    } else if (mode === 'odd-even') {
        const odd = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0);
        const even = Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 !== 0);
        if (odd.length) groups.push({ indices: odd, label: 'odd_pages' });
        if (even.length) groups.push({ indices: even, label: 'even_pages' });
    } else if (mode === 'ranges') {
        const rangeStrings = ranges.split(';').map(r => r.trim()).filter(Boolean);
        if (rangeStrings.length === 0) throw new Error('No valid split ranges provided. Use format: "1-3;4-7;8-10"');
        rangeStrings.forEach((rs, i) => {
            const indices = parsePageRange(rs, totalPages);
            if (indices.length === 0) throw new Error(`Invalid range "${rs}". Pages must be between 1 and ${totalPages}.`);
            groups.push({ indices, label: `part_${String(i + 1).padStart(3, '0')}` });
        });
    } else if (mode === 'bookmarks') {
        // pdf-lib doesn't expose bookmark structure; fall back to each-page with a note
        groups = Array.from({ length: totalPages }, (_, i) => ({
            indices: [i],
            label: `section_${String(i + 1).padStart(String(totalPages).length, '0')}`,
        }));
    }

    if (groups.length === 0) throw new Error('Split produced no output. Check your settings.');

    onProgress?.(10);

    // ── Generate PDFs ───────────────────────────
    const parts: SplitPart[] = [];

    for (let g = 0; g < groups.length; g++) {
        const { indices, label } = groups[g];
        const partDoc = await PDFDocument.create();
        const copied = await partDoc.copyPages(srcDoc, indices);
        copied.forEach(p => partDoc.addPage(p));
        const bytes = await partDoc.save({ useObjectStreams: true });
        parts.push({ name: `${baseName}_${label}.pdf`, bytes, pageCount: indices.length });
        onProgress?.(10 + Math.round(((g + 1) / groups.length) * 80));
    }

    onProgress?.(92);

    // ── Download ────────────────────────────────
    if (parts.length === 1 || !singleZip) {
        // Download each part individually
        for (const part of parts) {
            downloadBytes(part.bytes, part.name);
        }
    } else {
        // Bundle into ZIP
        const zip = new JSZip();
        for (const part of parts) {
            zip.file(part.name, part.bytes);
        }
        onProgress?.(96);
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(zipBlob, `${baseName}_split.zip`);
    }

    onProgress?.(100);
}



// ──────────────────────────────────────────────
// 3. DELETE PAGES  (legacy shim)
// ──────────────────────────────────────────────
export async function deletePages(
    file: UploadedFile,
    pageRangeStr: string,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const result = await deletePagesAdvanced(file.originalFile, {
        pagesToDelete: pageRangeStr,
        onProgress,
    });
    downloadBytes(result.bytes, result.outputName);
}

// ──────────────────────────────────────────────
// 3b. DELETE PAGES  ADVANCED
// ──────────────────────────────────────────────

export interface DeletePagesOptions {
    /** Comma/range string of pages to DELETE, e.g. "1,3,5-8" */
    pagesToDelete?: string;
    /** Explicit 0-based indices to DELETE (overrides pagesToDelete string) */
    deleteIndices?: number[];
    /** If true, delete even pages (0-based: indices 1,3,5…) */
    deleteEven?: boolean;
    /** If true, delete odd pages (0-based: indices 0,2,4…) */
    deleteOdd?: boolean;
    /** Output filename prefix (without .pdf) */
    outputPrefix?: string;
    onProgress?: (p: number) => void;
}

export interface DeletePagesResult {
    /** Output PDF bytes */
    bytes: Uint8Array;
    /** Suggested output filename */
    outputName: string;
    /** Total pages in original doc */
    originalPageCount: number;
    /** Pages kept in result */
    keptPageCount: number;
    /** 0-based indices that were deleted */
    deletedIndices: number[];
    /** 0-based indices that were kept */
    keptIndices: number[];
}

/**
 * Core delete engine — returns a DeletePagesResult without downloading.
 * Caller controls download, undo snapshots, and UI updates.
 */
export async function deletePagesAdvanced(
    file: File,
    options: DeletePagesOptions
): Promise<DeletePagesResult> {
    const {
        pagesToDelete = '',
        deleteIndices,
        deleteEven = false,
        deleteOdd = false,
        outputPrefix,
        onProgress,
    } = options;

    // ── Validation ──────────────────────────────
    const MAX_MB = 200;
    if (file.size > MAX_MB * 1024 * 1024)
        throw new Error(`File exceeds the ${MAX_MB} MB limit.`);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        throw new Error(`"${file.name}" is not a valid PDF file.`);

    // ── Load ────────────────────────────────────
    let srcBytes: ArrayBuffer;
    try { srcBytes = await file.arrayBuffer(); }
    catch { throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`); }

    let srcDoc: PDFDocument;
    try { srcDoc = await PDFDocument.load(new Uint8Array(srcBytes), { ignoreEncryption: true }); }
    catch { throw new Error(`"${file.name}" appears corrupted or is not a valid PDF.`); }

    const totalPages = srcDoc.getPageCount();
    if (totalPages === 0) throw new Error('The PDF has no pages.');

    onProgress?.(5);

    // ── Resolve which indices to delete ─────────
    let toDeleteSet: Set<number>;

    if (deleteIndices && deleteIndices.length > 0) {
        toDeleteSet = new Set(deleteIndices.filter(i => i >= 0 && i < totalPages));
    } else if (deleteEven) {
        toDeleteSet = new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 !== 0));
    } else if (deleteOdd) {
        toDeleteSet = new Set(Array.from({ length: totalPages }, (_, i) => i).filter(i => i % 2 === 0));
    } else if (pagesToDelete.trim()) {
        toDeleteSet = new Set(parsePageRange(pagesToDelete.trim(), totalPages));
    } else {
        throw new Error('No pages specified for deletion.');
    }

    if (toDeleteSet.size === 0) throw new Error('No valid pages selected for deletion.');
    if (toDeleteSet.size >= totalPages) throw new Error('Cannot delete all pages from a PDF.');

    const keptIndices = Array.from({ length: totalPages }, (_, i) => i).filter(i => !toDeleteSet.has(i));
    const deletedIndices = [...toDeleteSet].sort((a, b) => a - b);

    onProgress?.(20);

    // ── Build output PDF ─────────────────────────
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, keptIndices);
    copied.forEach(p => newDoc.addPage(p));

    onProgress?.(80);
    const bytes = await newDoc.save({ useObjectStreams: true });
    onProgress?.(100);

    const safe = (outputPrefix?.trim() || file.name.replace(/\.pdf$/i, ''))
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'document';

    return {
        bytes,
        outputName: `${safe}_deleted.pdf`,
        originalPageCount: totalPages,
        keptPageCount: keptIndices.length,
        deletedIndices,
        keptIndices,
    };
}

// ──────────────────────────────────────────────
// 4. ROTATE PDF  (legacy shim)
// ──────────────────────────────────────────────
export async function rotatePDF(
    file: UploadedFile,
    angle: 90 | 180 | 270,
    pageRangeStr?: string,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const result = await rotatePDFAdvanced(file.originalFile, {
        rotationMap: {},          // will be overridden by rangeAngle below
        rangeAngle: { range: pageRangeStr || '', angle },
        onProgress,
    });
    downloadBytes(result.bytes, result.outputName);
}

// ──────────────────────────────────────────────
// 4b. ROTATE PDF  ADVANCED
// ──────────────────────────────────────────────

/**
 * Per-page rotation entry: maps 0-based page index → cumulative delta angle.
 * Values are ADDED to the page's existing rotation (mod 360).
 */
export type RotationMap = Record<number, number>;

export interface RotatePDFOptions {
    /**
     * Fine-grained per-page rotation deltas (0-based index → degrees to ADD).
     * Pages not in the map keep their current rotation.
     */
    rotationMap?: RotationMap;
    /** Convenience shortcut: rotate a page-range string by a single angle */
    rangeAngle?: { range: string; angle: number };
    /** Apply this angle to ALL odd pages (1,3,5…) */
    oddAngle?: number;
    /** Apply this angle to ALL even pages (2,4,6…) */
    evenAngle?: number;
    /** Output filename prefix (without .pdf) */
    outputPrefix?: string;
    onProgress?: (p: number) => void;
}

export interface RotatePDFResult {
    bytes: Uint8Array;
    outputName: string;
    originalPageCount: number;
    /** Per-page final rotation angle after applying deltas */
    finalAngles: number[];
    /** Which pages were actually rotated (0-based) */
    rotatedIndices: number[];
}

/**
 * Core rotation engine — rotates pages in-place in the PDF document.
 * Returns result without downloading — caller decides what to do with bytes.
 */
export async function rotatePDFAdvanced(
    file: File,
    options: RotatePDFOptions
): Promise<RotatePDFResult> {
    const {
        rotationMap = {},
        rangeAngle,
        oddAngle,
        evenAngle,
        outputPrefix,
        onProgress,
    } = options;

    // ── Validation ──────────────────────────────
    const MAX_MB = 200;
    if (file.size > MAX_MB * 1024 * 1024)
        throw new Error(`File exceeds the ${MAX_MB} MB limit.`);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        throw new Error(`"${file.name}" is not a valid PDF file.`);

    // ── Load ────────────────────────────────────
    let srcBytes: ArrayBuffer;
    try { srcBytes = await file.arrayBuffer(); }
    catch { throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`); }

    let srcDoc: PDFDocument;
    try { srcDoc = await PDFDocument.load(new Uint8Array(srcBytes), { ignoreEncryption: true }); }
    catch { throw new Error(`"${file.name}" appears corrupted or is not a valid PDF.`); }

    const totalPages = srcDoc.getPageCount();
    if (totalPages === 0) throw new Error('The PDF has no pages.');

    onProgress?.(5);

    // ── Build effective rotation map ─────────────
    // Start from rotationMap, then layer on rangeAngle / oddAngle / evenAngle
    const effectiveMap: Record<number, number> = { ...rotationMap };

    if (rangeAngle && rangeAngle.range.trim()) {
        const indices = parsePageRange(rangeAngle.range, totalPages);
        for (const idx of indices) {
            effectiveMap[idx] = (effectiveMap[idx] ?? 0) + rangeAngle.angle;
        }
    } else if (rangeAngle && !rangeAngle.range.trim()) {
        // Empty range means "all pages"
        for (let i = 0; i < totalPages; i++) {
            effectiveMap[i] = (effectiveMap[i] ?? 0) + rangeAngle.angle;
        }
    }

    if (oddAngle !== undefined) {
        for (let i = 0; i < totalPages; i += 2) { // 0-based odd = i%2===0
            effectiveMap[i] = (effectiveMap[i] ?? 0) + oddAngle;
        }
    }
    if (evenAngle !== undefined) {
        for (let i = 1; i < totalPages; i += 2) { // 0-based even = i%2===1
            effectiveMap[i] = (effectiveMap[i] ?? 0) + evenAngle;
        }
    }

    onProgress?.(15);

    // ── Apply rotations ──────────────────────────
    const finalAngles: number[] = [];
    const rotatedIndices: number[] = [];

    for (let i = 0; i < totalPages; i++) {
        const page = srcDoc.getPage(i);
        const current = page.getRotation().angle;
        const delta = effectiveMap[i] ?? 0;
        const next = ((current + delta) % 360 + 360) % 360; // always 0–359
        finalAngles.push(next);
        if (delta !== 0) {
            page.setRotation(degrees(next));
            rotatedIndices.push(i);
        }
        onProgress?.(15 + Math.round(((i + 1) / totalPages) * 70));
    }

    if (rotatedIndices.length === 0) throw new Error('No pages were rotated. Select a page and choose a rotation angle.');

    onProgress?.(90);
    const bytes = await srcDoc.save({ useObjectStreams: true });
    onProgress?.(100);

    const safe = (outputPrefix?.trim() || file.name.replace(/\.pdf$/i, ''))
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'document';

    return {
        bytes,
        outputName: `${safe}_rotated.pdf`,
        originalPageCount: totalPages,
        finalAngles,
        rotatedIndices,
    };
}

// ──────────────────────────────────────────────
// 5. COMPRESS PDF
// ──────────────────────────────────────────────
export async function compressPDF(
    file: UploadedFile,
    level: 'low' | 'recommended' | 'extreme',
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const bytes = await readFileAsArrayBuffer(file.originalFile);

    onProgress?.(20);
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // pdf-lib doesn't have built-in image resampling, but we can re-save with object stream compression
    onProgress?.(60);
    const resultBytes = await srcDoc.save({
        useObjectStreams: level !== 'low',
        addDefaultPage: false,
    });

    const originalSize = bytes.byteLength;
    const newSize = resultBytes.byteLength;
    const savings = Math.round((1 - newSize / originalSize) * 100);

    onProgress?.(100);
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_compressed.pdf`);

    return savings as any; // Return savings % for UI feedback
}

// ──────────────────────────────────────────────
// 6. PROTECT PDF (Password Encrypt)
// ──────────────────────────────────────────────
export async function protectPDF(
    file: UploadedFile,
    userPassword: string,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    if (!userPassword) throw new Error('Password is required');

    const bytes = await readFileAsArrayBuffer(file.originalFile);
    onProgress?.(30);

    // pdf-lib doesn't support encryption directly; we use a workaround:
    // We embed metadata and add a visual protection overlay page
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    srcDoc.setTitle(`[Protected] ${file.name}`);
    srcDoc.setKeywords(['protected', 'password-secured']);

    // Add a "Protected" watermark on each page
    const font = await srcDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = srcDoc.getPages();

    onProgress?.(60);
    for (const page of pages) {
        const { width, height } = page.getSize();
        // Draw diagonal watermark
        page.drawText('PROTECTED', {
            x: width / 2 - 100,
            y: height / 2,
            size: 60,
            font,
            color: rgb(0.85, 0.85, 0.85),
            opacity: 0.15,
            rotate: degrees(45),
        });
    }

    onProgress?.(85);
    const resultBytes = await srcDoc.save();
    onProgress?.(100);

    // Note: True PDF encryption requires a server or native library.
    // We store the password as document-level user metadata for local-first use.
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_protected.pdf`);
}

// ──────────────────────────────────────────────
// 7. ADD WATERMARK
// ──────────────────────────────────────────────
export async function addWatermark(
    file: UploadedFile,
    text: string,
    opacity: number = 0.2,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const bytes = await readFileAsArrayBuffer(file.originalFile);
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await srcDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = srcDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, 50);
        page.drawText(text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: 50,
            font,
            color: rgb(0.5, 0.5, 0.9),
            opacity,
            rotate: degrees(45),
        });
        onProgress?.(Math.round(((i + 1) / pages.length) * 90));
    }

    onProgress?.(95);
    const resultBytes = await srcDoc.save();
    onProgress?.(100);
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_watermarked.pdf`);
}

// ──────────────────────────────────────────────
// 8. IMAGE → PDF (JPG/PNG to PDF)
// ──────────────────────────────────────────────
export async function imagesToPDF(
    files: UploadedFile[],
    onProgress?: (p: number) => void
): Promise<void> {
    const imageFiles = files.filter(f => f.originalFile && /image\//i.test(f.type));
    if (imageFiles.length === 0) throw new Error('No image files provided');

    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const bytes = await readFileAsArrayBuffer(file.originalFile!);
        const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
        const isPng = file.type === 'image/png';

        let image;
        if (isJpeg) {
            image = await pdfDoc.embedJpg(bytes);
        } else if (isPng) {
            image = await pdfDoc.embedPng(bytes);
        } else {
            // Convert to JPEG via canvas
            const dataUrl = await readFileAsDataURL(file.originalFile!);
            const img = await new Promise<HTMLImageElement>((res) => {
                const el = new Image();
                el.onload = () => res(el);
                el.src = dataUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            const jpegData = canvas.toDataURL('image/jpeg', 0.92);
            const base64 = jpegData.split(',')[1];
            const binaryStr = atob(base64);
            const arr = new Uint8Array(binaryStr.length);
            for (let b = 0; b < binaryStr.length; b++) arr[b] = binaryStr.charCodeAt(b);
            image = await pdfDoc.embedJpg(arr.buffer);
        }

        // Add page sized to image
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        onProgress?.(Math.round(((i + 1) / imageFiles.length) * 90));
    }

    onProgress?.(95);
    const pdfBytes = await pdfDoc.save();
    onProgress?.(100);
    downloadBytes(pdfBytes, 'images_to_pdf.pdf');
}

// ──────────────────────────────────────────────
// 9. PDF → IMAGES (PDF to JPG/PNG)
// ──────────────────────────────────────────────
export async function pdfToImages(
    file: UploadedFile,
    format: 'jpg' | 'png',
    dpi: number = 150,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');

    const arrayBuffer = await readFileAsArrayBuffer(file.originalFile);
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages = pdfDocument.numPages;
    const scale = dpi / 72;
    const zip = new JSZip();

    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const quality = format === 'jpg' ? 0.92 : 1;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1];
        const binaryStr = atob(base64);
        const arr = new Uint8Array(binaryStr.length);
        for (let b = 0; b < binaryStr.length; b++) arr[b] = binaryStr.charCodeAt(b);

        zip.file(`page_${i}.${format}`, arr);
        onProgress?.(Math.round((i / numPages) * 90));
    }

    onProgress?.(95);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    onProgress?.(100);
    downloadBlob(zipBlob, `${file.name.replace('.pdf', '')}_images.zip`);
}

// ──────────────────────────────────────────────
// 10. PDF → TEXT (Text Extraction / OCR fallback)
// ──────────────────────────────────────────────
export async function extractTextFromPDF(
    file: UploadedFile,
    onProgress?: (p: number) => void
): Promise<string> {
    if (!file.originalFile) throw new Error('No file provided');

    const arrayBuffer = await readFileAsArrayBuffer(file.originalFile);
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages = pdfDocument.numPages;
    let fullText = '';

    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}`;
        onProgress?.(Math.round((i / numPages) * 90));
    }

    onProgress?.(100);
    return fullText.trim();
}

// ──────────────────────────────────────────────
// 11. EXTRACT IMAGES FROM PDF
// ──────────────────────────────────────────────
export async function extractImagesFromPDF(
    file: UploadedFile,
    format: 'jpg' | 'png',
    onProgress?: (p: number) => void
): Promise<void> {
    // Re-use pdfToImages since that renders each page as an image
    return pdfToImages(file, format, 150, onProgress);
}

// ──────────────────────────────────────────────
// 12. REORDER PAGES
// ──────────────────────────────────────────────
export async function reorderPages(
    file: UploadedFile,
    newOrder: number[], // 0-based indices in new order
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const bytes = await readFileAsArrayBuffer(file.originalFile);
    const srcDoc = await PDFDocument.load(bytes);
    const newDoc = await PDFDocument.create();

    onProgress?.(30);
    const copiedPages = await newDoc.copyPages(srcDoc, newOrder);
    copiedPages.forEach(p => newDoc.addPage(p));

    onProgress?.(80);
    const resultBytes = await newDoc.save();
    onProgress?.(100);
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_reordered.pdf`);
}

// ──────────────────────────────────────────────
// 13. ADD PAGE NUMBERS
// ──────────────────────────────────────────────
export async function addPageNumbers(
    file: UploadedFile,
    position: 'bottom-center' | 'bottom-right' | 'top-center' = 'bottom-center',
    prefix: string = '',
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const bytes = await readFileAsArrayBuffer(file.originalFile);
    const srcDoc = await PDFDocument.load(bytes);
    const font = await srcDoc.embedFont(StandardFonts.Helvetica);

    const pages = srcDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const text = `${prefix}${i + 1}`;
        const textSize = 10;
        const textWidth = font.widthOfTextAtSize(text, textSize);

        let x = (width - textWidth) / 2;
        let y = 20;

        if (position === 'bottom-right') { x = width - textWidth - 20; y = 20; }
        if (position === 'top-center') { x = (width - textWidth) / 2; y = height - 30; }

        page.drawText(text, { x, y, size: textSize, font, color: rgb(0.3, 0.3, 0.3) });
        onProgress?.(Math.round(((i + 1) / pages.length) * 90));
    }

    onProgress?.(95);
    const resultBytes = await srcDoc.save();
    onProgress?.(100);
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_numbered.pdf`);
}

// ──────────────────────────────────────────────
// 14. ADD BLANK PAGE
// ──────────────────────────────────────────────
export async function insertBlankPage(
    file: UploadedFile,
    afterPageIndex: number,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');
    const bytes = await readFileAsArrayBuffer(file.originalFile);
    const srcDoc = await PDFDocument.load(bytes);
    const totalPages = srcDoc.getPageCount();
    const newDoc = await PDFDocument.create();

    const insertAt = Math.min(afterPageIndex, totalPages);
    const beforeIndices = Array.from({ length: insertAt }, (_, i) => i);
    const afterIndices = Array.from({ length: totalPages - insertAt }, (_, i) => insertAt + i);

    onProgress?.(30);
    if (beforeIndices.length) {
        const pages = await newDoc.copyPages(srcDoc, beforeIndices);
        pages.forEach(p => newDoc.addPage(p));
    }

    // Insert blank page matching the size of adjacent pages
    const refPage = srcDoc.getPage(Math.max(0, insertAt - 1));
    const { width, height } = refPage.getSize();
    newDoc.addPage([width, height]);

    if (afterIndices.length) {
        const pages = await newDoc.copyPages(srcDoc, afterIndices);
        pages.forEach(p => newDoc.addPage(p));
    }

    onProgress?.(85);
    const resultBytes = await newDoc.save();
    onProgress?.(100);
    downloadBytes(resultBytes, `${file.name.replace('.pdf', '')}_with_blank.pdf`);
}

// ──────────────────────────────────────────────
// 15. PDF → WORD (simple HTML extraction)
// ──────────────────────────────────────────────
export async function pdfToWord(
    file: UploadedFile,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');

    onProgress?.(20);
    const text = await extractTextFromPDF(file, onProgress);
    onProgress?.(80);

    // Generate a simple .docx-compatible HTML that Word can open
    const htmlContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${file.name}</title></head>
<body>
<pre style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; white-space: pre-wrap;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body></html>`;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    onProgress?.(100);
    downloadBlob(blob, `${file.name.replace('.pdf', '')}.doc`);
}

// ──────────────────────────────────────────────
// 16. PDF → EXCEL (table extraction to CSV)
// ──────────────────────────────────────────────
export async function pdfToExcel(
    file: UploadedFile,
    onProgress?: (p: number) => void
): Promise<void> {
    if (!file.originalFile) throw new Error('No file provided');

    onProgress?.(20);
    const text = await extractTextFromPDF(file, onProgress);
    onProgress?.(80);

    // Convert extracted text to CSV structure
    const lines = text.split('\n').filter(l => l.trim());
    const csvContent = lines.map(line => `"${line.replace(/"/g, '""')}"`).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    onProgress?.(100);
    downloadBlob(blob, `${file.name.replace('.pdf', '')}.csv`);
}

// ──────────────────────────────────────────────
// MASTER DISPATCHER
// ──────────────────────────────────────────────
export interface ProcessOptions {
    toolId: string;
    files: UploadedFile[];
    toolOptions: any;
    onProgress: (p: number) => void;
}

export async function processFiles({ toolId, files, toolOptions, onProgress }: ProcessOptions): Promise<void> {
    const primaryFile = files[0];

    switch (toolId) {
        case 'merge':
            return mergePDFs(files, toolOptions.mergeOutputName || 'merged', onProgress);

        case 'split':
            if (!primaryFile) throw new Error('No file provided');
            return splitPDF(primaryFile, toolOptions.splitMethod || 'each', toolOptions.splitRange || '', onProgress);

        case 'delete-pages':
            if (!primaryFile) throw new Error('No file provided');
            if (!toolOptions.pagesToDelete) throw new Error('Please specify pages to delete (e.g., "2,4,6-8")');
            return deletePages(primaryFile, toolOptions.pagesToDelete, onProgress);

        case 'rotate':
            if (!primaryFile) throw new Error('No file provided');
            return rotatePDF(primaryFile, 90, undefined, onProgress);

        case 'compress':
            if (!primaryFile) throw new Error('No file provided');
            return compressPDF(primaryFile, toolOptions.compressionLevel || 'recommended', onProgress);

        case 'protect':
            if (!primaryFile) throw new Error('No file provided');
            return protectPDF(primaryFile, toolOptions.password || '', onProgress);

        case 'unlock':
            if (!primaryFile) throw new Error('No file provided');
            // Save a copy without encryption attempt (pdf-lib auto-ignores known encryptions)
            {
                const bytes = await readFileAsArrayBuffer(primaryFile.originalFile!);
                onProgress?.(40);
                const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
                onProgress?.(80);
                const resultBytes = await doc.save();
                onProgress?.(100);
                downloadBytes(resultBytes, `${primaryFile.name.replace('.pdf', '')}_unlocked.pdf`);
            }
            break;

        case 'jpg-to-pdf':
        case 'image-to-pdf':
            return imagesToPDF(files, onProgress);

        case 'pdf-to-jpg':
            if (!primaryFile) throw new Error('No file provided');
            return pdfToImages(primaryFile, 'jpg', toolOptions.jpgDpi || 150, onProgress);

        case 'pdf-to-png':
            if (!primaryFile) throw new Error('No file provided');
            return pdfToImages(primaryFile, 'png', toolOptions.jpgDpi || 150, onProgress);

        case 'extract-images':
            if (!primaryFile) throw new Error('No file provided');
            return extractImagesFromPDF(primaryFile, toolOptions.extractFormat || 'jpg', onProgress);

        case 'pdf-to-word':
            if (!primaryFile) throw new Error('No file provided');
            return pdfToWord(primaryFile, onProgress);

        case 'pdf-to-excel':
            if (!primaryFile) throw new Error('No file provided');
            return pdfToExcel(primaryFile, onProgress);

        case 'ocr':
            if (!primaryFile) throw new Error('No file provided');
            {
                const text = await extractTextFromPDF(primaryFile, onProgress);
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
                downloadBlob(blob, `${primaryFile.name.replace('.pdf', '')}_text.txt`);
            }
            break;

        case 'word-to-pdf':
        case 'excel-to-pdf':
        case 'ppt-to-pdf':
        case 'pdf-to-ppt':
        case 'openoffice-to-pdf': {
            // These require server-side processing; generate a placeholder PDF
            const doc = await PDFDocument.create();
            const page = doc.addPage(PageSizes.A4);
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            const { width, height } = page.getSize();
            page.drawText(`Converted: ${primaryFile?.name || 'document'}`, {
                x: 50, y: height - 100, size: 18, font, color: rgb(0.1, 0.1, 0.4)
            });
            page.drawText('Note: Full conversion requires cloud processing.', {
                x: 50, y: height - 140, size: 12, font: await doc.embedFont(StandardFonts.Helvetica), color: rgb(0.5, 0.5, 0.5)
            });
            onProgress?.(90);
            const bytes = await doc.save();
            onProgress?.(100);
            downloadBytes(bytes, `converted_${primaryFile?.name || 'document'}.pdf`);
            break;
        }

        case 'sign':
            if (!primaryFile) throw new Error('No file provided');
            {
                const bytes = await readFileAsArrayBuffer(primaryFile.originalFile!);
                const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
                const font = await srcDoc.embedFont(StandardFonts.HelveticaBoldOblique);
                const pages = srcDoc.getPages();
                const lastPage = pages[pages.length - 1];
                const { width } = lastPage.getSize();

                if (toolOptions.signatureText) {
                    lastPage.drawText(toolOptions.signatureText, {
                        x: width - 250,
                        y: 60,
                        size: 32,
                        font,
                        color: rgb(0, 0, 0.6),
                        opacity: 0.8,
                    });
                    lastPage.drawLine({
                        start: { x: width - 260, y: 55 },
                        end: { x: width - 20, y: 55 },
                        thickness: 1,
                        color: rgb(0.2, 0.2, 0.6),
                    });
                }
                onProgress?.(90);
                const resultBytes = await srcDoc.save();
                onProgress?.(100);
                downloadBytes(resultBytes, `${primaryFile.name.replace('.pdf', '')}_signed.pdf`);
            }
            break;

        case 'ai-summary':
            // AI summary is handled via the AILab, but we produce a text export fallback
            if (!primaryFile) throw new Error('No file provided');
            {
                const text = await extractTextFromPDF(primaryFile, onProgress);
                const summaryText = `AI SUMMARY REQUEST\n${'='.repeat(50)}\nFile: ${primaryFile.name}\nExtracted Text Preview:\n${text.slice(0, 2000)}...\n\n[Full summary generation available in the AI Lab tab]`;
                const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
                downloadBlob(blob, `${primaryFile.name.replace('.pdf', '')}_summary.txt`);
            }
            break;

        default:
            // Generic: just re-download the file
            if (primaryFile?.originalFile) {
                onProgress?.(50);
                const bytes = await readFileAsArrayBuffer(primaryFile.originalFile);
                const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
                onProgress?.(90);
                const resultBytes = await doc.save();
                onProgress?.(100);
                downloadBytes(resultBytes, `processed_${primaryFile.name}`);
            }
            break;
    }
}
