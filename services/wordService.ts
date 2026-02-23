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
  body { padding: 25.4mm 25.4mm 25.4mm 25.4mm; } /* A4 margins */
  h1, h2, h3, h4, h5, h6 { margin: 0.6em 0 0.3em; font-weight: 700; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p  { margin: 0 0 0.5em; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #bbb; padding: 4px 8px; }
  th { background: #f0f0f0; font-weight: 700; }
  ul, ol { margin: 0.3em 0 0.3em 1.5em; padding: 0; }
  li { margin-bottom: 0.2em; }
  img { max-width: 100%; height: auto; }
  a { color: #1a5fb4; text-decoration: underline; }
  blockquote { margin: 0.5em 0 0.5em 1em; padding-left: 0.8em; border-left: 3px solid #ccc; color: #555; }
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

    // Create an off-screen iframe at A4 proportions
    const PAGE_W_PX = 794;  // ~210mm at 96dpi
    const PAGE_H_PX = 1123; // ~297mm at 96dpi
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

        // Small tick so the browser can lay out
        await new Promise<void>(resolve => setTimeout(resolve, 80));
        onProgress?.(55);

        // ── 5. Rasterise via html2canvas ─────────────────
        const h2c = await import('html2canvas');
        const h2cDefault = (h2c as any).default ?? h2c;

        const bodyEl = doc.body;
        const fullHeight = Math.max(bodyEl.scrollHeight, PAGE_H_PX);

        const canvas = await h2cDefault(bodyEl, {
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

        // ── 6. Slice canvas into A4 pages and build PDF ──
        const { jsPDF } = await import('jspdf');
        const pdfW = pageFormat === 'letter' ? 215.9 : pageFormat === 'legal' ? 215.9 : 210;
        const pdfH = pageFormat === 'letter' ? 279.4 : pageFormat === 'legal' ? 355.6 : 297;
        const isLandscape = orientation === 'landscape';
        const pw = isLandscape ? pdfH : pdfW;
        const ph = isLandscape ? pdfW : pdfH;

        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: pageFormat,
            compress: true,
        });

        const canvasWidthMM = pw;
        const mmPerPx = canvasWidthMM / (PAGE_W_PX * scale);
        const pageHeightPx = ph / mmPerPx;
        const totalPages = Math.ceil((canvas.height) / pageHeightPx);

        for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage([pw, ph], orientation);

            // Slice current page strip from canvas
            const sliceCanvas = document.createElement('canvas');
            const sliceH = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceH;
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.drawImage(canvas, 0, page * pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

            const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.92);
            pdf.addImage(sliceDataUrl, 'JPEG', 0, 0, pw, sliceH * mmPerPx);
        }

        onProgress?.(95);
        const pdfBytes = pdf.output('arraybuffer');
        onProgress?.(100);

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
