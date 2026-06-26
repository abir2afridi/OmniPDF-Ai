/**
 * wordService.ts — Word → PDF Conversion Service (client-side)
 *
 * Pipeline:
 *   DOCX / DOC  ──[mammoth.js]──▶  Rich HTML  ──[jsPDF+html2canvas]──▶  PDF bytes
 *
 * Design contract:
 *  - Pure conversion engine; never downloads. Caller owns download & UI.
 *  - Returns WordConversionResult (bytes + metadata) per file.
 *  - API-swap-ready: replace `convertSingleFile` implementation with a
 *    fetch() call to a real backend and the rest of the module is unchanged.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WordConversionOptions {
    /** Output filename prefix (without .pdf). Defaults to original basename. */
    outputPrefix?: string;
    /** Quality scale for html2canvas rasterisation (1 = 96dpi, 2 = 192dpi). Default: 2 */
    scale?: number;
    /** jsPDF page format. Default: 'a4' */
    pageFormat?: 'a4' | 'letter' | 'legal';
    /** Page orientation. Default: 'portrait' */
    orientation?: 'portrait' | 'landscape';
    onProgress?: (p: number) => void;
}

export interface WordConversionResult {
    /** Output PDF bytes */
    bytes: Uint8Array;
    /** Suggested output filename */
    outputName: string;
    /** Number of pages in the resulting PDF */
    pageCount: number;
    /** Original file size in bytes */
    originalSize: number;
    /** Output PDF size in bytes */
    outputSize: number;
    /** Extracted HTML from the Word document (for preview) */
    html: string;
}

export interface BatchConversionResult {
    succeeded: WordConversionResult[];
    failed: { fileName: string; error: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.ms-word',
]);
const ALLOWED_EXTS = new Set(['.docx', '.doc']);
const MAX_FILE_MB = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'document';
}

function isWordFile(file: File): boolean {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTS.has(ext);
}

function validateFile(file: File): void {
    if (!isWordFile(file))
        throw new Error(`"${file.name}" is not a Word document (.docx or .doc).`);
    if (file.size > MAX_FILE_MB * 1024 * 1024)
        throw new Error(`"${file.name}" exceeds the ${MAX_FILE_MB} MB limit.`);
    if (file.size === 0)
        throw new Error(`"${file.name}" is empty.`);
}

/** Inject baseline print-friendly styles into a document's <head> */
function buildStyledHtml(bodyHtml: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
    line-height: 1.5;
  }
  body { padding: 20mm 20mm 20mm 20mm; }
  h1, h2, h3, h4, h5, h6 { margin: 0.6em 0 0.3em; font-weight: 700; break-after: avoid; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p  { margin: 0 0 0.5em; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4px 8px; }
  th { background: #f0f0f0; font-weight: 700; }
  ul, ol { margin: 0.3em 0 0.3em 1.5em; padding: 0; }
  li { margin-bottom: 0.2em; }
  img { max-width: 100%; height: auto; break-inside: avoid; }
  a { color: #1a5fb4; text-decoration: underline; }
  blockquote { margin: 0.5em 0 0.5em 1em; padding-left: 0.8em; border-left: 3px solid #ccc; color: #555; break-inside: avoid; }
  pre, code { font-family: 'Consolas', monospace; font-size: 9pt; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
  @page { size: A4; margin: 0; }
</style>
</head><body>${bodyHtml}</body></html>`;
}

// ── Core single-file conversion ───────────────────────────────────────────────

/**
 * Convert one Word file to PDF bytes.
 * Returns WordConversionResult — does NOT download.
 */
export async function convertWordToPDF(
    file: File,
    options: WordConversionOptions = {}
): Promise<WordConversionResult> {
    const {
        outputPrefix,
        scale = 2,
        pageFormat = 'a4',
        orientation = 'portrait',
        onProgress,
    } = options;

    // ── 1. Validate ──────────────────────────────────────
    validateFile(file);
    onProgress?.(5);

    // ── 2. Read bytes ────────────────────────────────────
    let arrayBuffer: ArrayBuffer;
    try {
        arrayBuffer = await file.arrayBuffer();
    } catch {
        throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`);
    }
    onProgress?.(15);

    // ── 3. Extract HTML via mammoth ──────────────────────
    let extractedHtml = '';
    try {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml(
            { arrayBuffer },
            {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Title'] => h1.doc-title:fresh",
                    "p[style-name='Subtitle'] => h2.doc-subtitle:fresh",
                    "b => strong",
                    "i => em",
                    "u => u",
                ],
                convertImage: mammoth.images.imgElement((image) => {
                    return image.read('base64').then((base64) => ({
                        src: `data:${image.contentType};base64,${base64}`,
                    }));
                }),
            }
        );
        extractedHtml = result.value || '<p>(Empty document)</p>';
    } catch (err: any) {
        // .doc (legacy binary) may fail in mammoth — fallback to text extraction hint
        if (file.name.toLowerCase().endsWith('.doc')) {
            throw new Error(
                `"${file.name}" is a legacy .doc file. For best results, save it as .docx in Microsoft Word and re-upload.`
            );
        }
        throw new Error(`Failed to parse "${file.name}": ${err?.message || 'Unknown error'}`);
    }
    onProgress?.(40);

    // ── 4. Mount hidden iframe for accurate rendering ─────
    const styledHtml = buildStyledHtml(extractedHtml);

    const PAGE_W_PX = 794;
    const PAGE_H_PX = 1123;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: ${PAGE_W_PX}px; height: ${PAGE_H_PX}px;
        border: none; overflow: hidden; visibility: hidden;
    `;
    document.body.appendChild(iframe);

    try {
        const doc = iframe.contentDocument!;
        doc.open();
        doc.write(styledHtml);
        doc.close();

        await new Promise<void>(resolve => setTimeout(resolve, 100));
        onProgress?.(55);

        const h2cMod = await import('html2canvas');
        const h2c = (h2cMod as any).default ?? h2cMod;
        const { jsPDF } = await import('jspdf');

        const bodyEl = doc.body;
        const fullHeight = Math.max(bodyEl.scrollHeight, PAGE_H_PX);

        // ── Render ONE perfect canvas — text/images at correct size ──
        const canvas = await h2c(bodyEl, {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            width: PAGE_W_PX,
            height: fullHeight,
            windowWidth: PAGE_W_PX,
            windowHeight: fullHeight,
            logging: false,
        });
        onProgress?.(80);

        // ── Find clean page breaks by scanning canvas pixels ──
        const pdfW = pageFormat === 'letter' ? 215.9 : pageFormat === 'legal' ? 215.9 : 210;
        const pdfH = pageFormat === 'letter' ? 279.4 : pageFormat === 'legal' ? 355.6 : 297;
        const isLandscape = orientation === 'landscape';
        const pw = isLandscape ? pdfH : pdfW;
        const ph = isLandscape ? pdfW : pdfH;
        const MARGIN_MM = 20;
        const contentW = pw - 2 * MARGIN_MM;
        const contentH = ph - 2 * MARGIN_MM;
        const mmPerPx = contentW / (PAGE_W_PX * scale);
        const pageHeightPx = contentH / mmPerPx;

        const ctx = canvas.getContext('2d')!;
        const cw = canvas.width;
        const ch = canvas.height;

        // Check if a horizontal row of pixels is "clean" (mostly white background)
        function isCleanRow(y: number): boolean {
            if (y < 0 || y >= ch) return true;
            const rowData = ctx.getImageData(0, y, cw, 1).data;
            let nonBg = 0;
            for (let x = 0; x < rowData.length; x += 16) { // sample every 4th pixel
                const r = rowData[x], g = rowData[x + 1], b = rowData[x + 2], a = rowData[x + 3];
                if (a > 10 && (r < 240 || g < 240 || b < 240)) nonBg++;
            }
            return nonBg < 5; // <5 non-white pixels = clean row
        }

        // For a given cut position, scan ±searchRange to find nearest clean gap
        function findCleanCut(cutY: number, searchRange: number): number {
            // First check if cutY itself is clean
            if (isCleanRow(cutY)) return cutY;
            // Search downward (prefer keeping content on current page)
            for (let d = 1; d <= searchRange; d++) {
                if (isCleanRow(cutY + d)) return cutY + d;
                if (isCleanRow(cutY - d)) return cutY - d;
            }
            return cutY; // fallback: exact cut
        }

        const cutPoints: number[] = [0];
        let pos = 0;
        while (pos + pageHeightPx < ch) {
            const idealCut = Math.round(pos + pageHeightPx);
            const cleanCut = findCleanCut(idealCut, Math.round(pageHeightPx * 0.08)); // search ±8% of page
            cutPoints.push(cleanCut);
            pos = cleanCut;
        }
        cutPoints.push(ch);

        const totalPages = cutPoints.length - 1;
        const pdf = new jsPDF({ orientation, unit: 'mm', format: pageFormat, compress: true });

        for (let p = 0; p < totalPages; p++) {
            if (p > 0) pdf.addPage([pw, ph], orientation);

            const yStart = cutPoints[p];
            const yEnd = cutPoints[p + 1];
            const sliceH = yEnd - yStart;

            const sc = document.createElement('canvas');
            sc.width = cw;
            sc.height = sliceH;
            sc.getContext('2d')!.drawImage(canvas, 0, yStart, cw, sliceH, 0, 0, cw, sliceH);

            pdf.addImage(sc.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM, contentW, sliceH * mmPerPx);
        }

        onProgress?.(100);
        const pdfBytes = pdf.output('arraybuffer');

        const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.(docx?|DOC[XY]?)$/i, ''));
        return {
            bytes: new Uint8Array(pdfBytes),
            outputName: `${base}.pdf`,
            pageCount: totalPages,
            originalSize: file.size,
            outputSize: pdfBytes.byteLength,
            html: extractedHtml,
        };

    } finally {
        document.body.removeChild(iframe);
    }
}

// ── Batch conversion ──────────────────────────────────────────────────────────

/**
 * Convert multiple Word files to individual PDFs.
 * Processes sequentially to avoid memory pressure.
 * Returns both succeeded results and failed entries.
 */
export async function batchConvertWordToPDF(
    files: File[],
    options: Omit<WordConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: WordConversionResult, index: number) => void;
        onFileError?: (fileName: string, error: string, index: number) => void;
    } = {}
): Promise<BatchConversionResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: WordConversionResult[] = [];
    const failed: { fileName: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertWordToPDF(file, {
                ...convOpts,
                onProgress: (p) => onFileProgress?.(file.name, p),
            });
            succeeded.push(result);
            onFileComplete?.(result, i);
        } catch (err: any) {
            const msg = err?.message || 'Unknown error';
            failed.push({ fileName: file.name, error: msg });
            onFileError?.(file.name, msg, i);
        }
    }

    return { succeeded, failed };
}

// ── Validation helper (usable in UI) ─────────────────────────────────────────

export function validateWordFile(file: File): string | null {
    try { validateFile(file); return null; }
    catch (e: any) { return e.message; }
}

export { MAX_FILE_MB as WORD_MAX_FILE_MB, isWordFile };
