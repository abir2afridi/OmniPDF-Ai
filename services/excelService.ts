/**
 * excelService.ts — Excel → PDF Conversion Service (client-side)
 *
 * Pipeline:
 *   .xlsx / .xls  ──[ExcelJS]──▶  Sheet data (cells, styles, merged)
 *                 ──[HTML render]──▶  Styled HTML table per sheet
 *                 ──[html2canvas]──▶  Canvas bitmap
 *                 ──[jsPDF]──▶  Multi-page PDF bytes
 *
 * Design contract:
 *  - Pure engine — never downloads. Caller owns download & UI.
 *  - Returns ExcelConversionResult per workbook.
 *  - API-swap-ready: swap renderSheets() with a fetch() to a real backend.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SheetInfo {
    name: string;
    index: number;
    rowCount: number;
    colCount: number;
}

export interface ExcelConversionOptions {
    /** Which sheet indexes to include (0-based). Default: all. */
    sheetIndexes?: number[];
    /** Output filename prefix (without .pdf). Defaults to workbook basename. */
    outputPrefix?: string;
    /** jsPDF page format. Default: 'a4' */
    pageFormat?: 'a4' | 'letter' | 'legal';
    /** Page orientation. Default: 'landscape' (better for spreadsheets) */
    orientation?: 'portrait' | 'landscape';
    /** html2canvas scale. 1 = 96dpi, 2 = 192dpi. Default: 1.5 */
    scale?: number;
    onProgress?: (p: number) => void;
}

export interface ExcelConversionResult {
    bytes: Uint8Array;
    outputName: string;
    pageCount: number;
    sheets: SheetInfo[];
    includedSheets: SheetInfo[];
    originalSize: number;
    outputSize: number;
}

export interface BatchExcelResult {
    succeeded: ExcelConversionResult[];
    failed: { fileName: string; error: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel',                                            // .xls
    'application/msexcel',
    'application/x-msexcel',
    'application/x-ms-excel',
]);
const ALLOWED_EXTS = new Set(['.xlsx', '.xls']);
export const EXCEL_MAX_FILE_MB = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'spreadsheet';
}

export function isExcelFile(file: File): boolean {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTS.has(ext);
}

function validateFile(file: File): void {
    if (!isExcelFile(file))
        throw new Error(`"${file.name}" is not a valid Excel file (.xlsx or .xls).`);
    if (file.size > EXCEL_MAX_FILE_MB * 1024 * 1024)
        throw new Error(`"${file.name}" exceeds the ${EXCEL_MAX_FILE_MB} MB limit.`);
    if (file.size === 0)
        throw new Error(`"${file.name}" is empty.`);
}

export function validateExcelFile(file: File): string | null {
    try { validateFile(file); return null; }
    catch (e: any) { return e.message; }
}

// ── Color helpers ─────────────────────────────────────────────────────────────

/** ExcelJS ARGB "FFRRGGBB" → css "#RRGGBB" */
function argbToCss(argb: string | undefined): string | null {
    if (!argb || argb.length < 6) return null;
    const hex = argb.length === 8 ? argb.slice(2) : argb; // strip alpha
    if (hex === '000000' || hex === 'FFFFFF' || hex === 'ffffff') {
        return argb.length === 8 ? `#${hex}` : null; // only return if explicit
    }
    return `#${hex}`;
}

/** ExcelJS border style → CSS border string */
function borderStyle(b: any): string {
    if (!b || !b.style) return '';
    const width = b.style === 'thin' ? '1px' : b.style === 'medium' ? '2px' : b.style === 'thick' ? '3px' : '1px';
    const color = argbToCss(b.color?.argb) ?? '#999';
    return `${width} solid ${color}`;
}

// ── Sheet → HTML renderer ─────────────────────────────────────────────────────

async function sheetToHtml(workbook: any, sheetIndex: number): Promise<string> {
    const sheet = workbook.worksheets[sheetIndex];
    if (!sheet) return '<p>(Empty sheet)</p>';

    const merges = new Map<string, { r: number; c: number; rs: number; cs: number }>();

    // Parse merge ranges
    sheet.mergeCells && Object.keys(sheet._merges || {}).forEach((key: string) => {
        const m = sheet._merges[key];
        if (m) {
            const { top, left, bottom, right } = m;
            merges.set(`${top},${left}`, { r: top, c: left, rs: bottom - top + 1, cs: right - left + 1 });
        }
    });

    const covered = new Set<string>(); // cells that are part of a merge but not the origin

    // Pre-scan merge info to mark covered cells
    merges.forEach(({ r, c, rs, cs }) => {
        for (let dr = 0; dr < rs; dr++) {
            for (let dc = 0; dc < cs; dc++) {
                if (dr === 0 && dc === 0) continue;
                covered.add(`${r + dr},${c + dc}`);
            }
        }
    });

    // Determine used dimensions
    const lastRow = sheet.lastRow?.number ?? 1;
    const lastCol = sheet.lastColumn?.number ?? 1;
    const MAX_COLS = Math.min(lastCol, 60);
    const MAX_ROWS = Math.min(lastRow, 500);

    // Column widths
    const colWidths: string[] = [];
    for (let c = 1; c <= MAX_COLS; c++) {
        const col = sheet.getColumn(c);
        const w = col.width ?? 8;
        colWidths.push(`${Math.round(w * 7)}px`); // ~7px per character width unit
    }

    let html = `<div style="overflow-x:auto;margin-bottom:16px;">`;
    html += `<p style="font-size:9pt;font-weight:900;color:#555;margin:0 0 4px;letter-spacing:0.04em;text-transform:uppercase">${sheet.name}</p>`;
    html += `<table style="border-collapse:collapse;font-size:9pt;font-family:'Calibri','Segoe UI',Arial,sans-serif;width:100%;table-layout:fixed">`;
    html += `<colgroup>${colWidths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`;

    for (let r = 1; r <= MAX_ROWS; r++) {
        const row = sheet.getRow(r);
        const rowH = row.height ? `height:${Math.round(row.height * 1.33)}px;` : '';
        html += `<tr style="${rowH}">`;

        for (let c = 1; c <= MAX_COLS; c++) {
            const key = `${r},${c}`;
            if (covered.has(key)) continue;

            const cell = row.getCell(c);
            const mergeInfo = merges.get(key);

            // Style extraction
            const fill = cell.fill as any;
            const font = cell.font as any;
            const alignment = cell.alignment as any;
            const borders = cell.border as any;

            let bgColor = '';
            if (fill?.type === 'pattern' && fill?.fgColor?.argb) {
                const c2 = argbToCss(fill.fgColor.argb);
                if (c2) bgColor = `background:${c2};`;
            }

            const bold = font?.bold ? 'font-weight:700;' : '';
            const italic = font?.italic ? 'font-style:italic;' : '';
            const underline = font?.underline ? 'text-decoration:underline;' : '';
            const strike = font?.strike ? 'text-decoration:line-through;' : '';
            const fColor = font?.color?.argb ? `color:${argbToCss(font.color.argb) ?? 'inherit'};` : '';
            const fSize = font?.size ? `font-size:${font.size}pt;` : '';

            const hAlign = alignment?.horizontal === 'right' ? 'text-align:right;'
                : alignment?.horizontal === 'center' ? 'text-align:center;' : '';
            const vAlign = alignment?.vertical === 'middle' ? 'vertical-align:middle;'
                : alignment?.vertical === 'bottom' ? 'vertical-align:bottom;' : 'vertical-align:top;';
            const wrap = alignment?.wrapText ? 'white-space:pre-wrap;word-break:break-word;' : 'white-space:nowrap;overflow:hidden;';

            const bTop = borders?.top ? `border-top:${borderStyle(borders.top)};` : 'border-top:1px solid #e5e7eb;';
            const bBottom = borders?.bottom ? `border-bottom:${borderStyle(borders.bottom)};` : 'border-bottom:1px solid #e5e7eb;';
            const bLeft = borders?.left ? `border-left:${borderStyle(borders.left)};` : 'border-left:1px solid #e5e7eb;';
            const bRight = borders?.right ? `border-right:${borderStyle(borders.right)};` : 'border-right:1px solid #e5e7eb;';

            const style = `padding:3px 5px;${bgColor}${bold}${italic}${underline}${strike}${fColor}${fSize}${hAlign}${vAlign}${wrap}${bTop}${bBottom}${bLeft}${bRight}`;

            const rowSpan = mergeInfo ? ` rowspan="${mergeInfo.rs}"` : '';
            const colSpan = mergeInfo ? ` colspan="${mergeInfo.cs}"` : '';

            // Cell value
            let value = '';
            const cv = cell.value;
            if (cv === null || cv === undefined) {
                value = '';
            } else if (typeof cv === 'object') {
                if ('richText' in cv) {
                    // Rich text
                    value = (cv as any).richText
                        .map((rt: any) => {
                            const rfBold = rt.font?.bold ? '<strong>' : '';
                            const rfBoldClose = rt.font?.bold ? '</strong>' : '';
                            return `${rfBold}${String(rt.text ?? '')}${rfBoldClose}`;
                        })
                        .join('');
                } else if ('result' in cv) {
                    value = String((cv as any).result ?? '');
                } else if ('error' in cv) {
                    value = `<span style="color:#dc2626">#ERR</span>`;
                } else if (cv instanceof Date) {
                    value = cv.toLocaleDateString();
                } else {
                    value = String(cv);
                }
            } else if (typeof cv === 'number') {
                // Respect numeric format
                const numFmt = cell.numFmt;
                if (numFmt && (numFmt.includes('$') || numFmt.includes('€') || numFmt.includes('£'))) {
                    value = cv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else if (numFmt && numFmt.includes('%')) {
                    value = (cv * 100).toFixed(1) + '%';
                } else {
                    value = cv.toLocaleString();
                }
            } else if (typeof cv === 'boolean') {
                value = cv ? 'TRUE' : 'FALSE';
            } else {
                value = String(cv);
            }

            html += `<td style="${style}"${rowSpan}${colSpan}>${value}</td>`;
        }

        html += '</tr>';
    }

    html += '</table>';
    if (lastRow > MAX_ROWS || lastCol > MAX_COLS) {
        html += `<p style="font-size:8pt;color:#9ca3af;margin:2px 0">⚠ Showing first ${MAX_ROWS} rows × ${MAX_COLS} cols of ${lastRow} × ${lastCol}</p>`;
    }
    html += '</div>';
    return html;
}

// ── Page inspection (before converting) ──────────────────────────────────────

export async function getWorkbookSheets(file: File): Promise<SheetInfo[]> {
    validateFile(file);
    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new (ExcelJS as any).Workbook();
    const buf = await file.arrayBuffer();
    await wb.xlsx.load(buf);
    return (wb.worksheets as any[]).map((ws: any, i: number) => ({
        name: ws.name,
        index: i,
        rowCount: ws.lastRow?.number ?? 0,
        colCount: ws.lastColumn?.number ?? 0,
    }));
}

// ── Core conversion ───────────────────────────────────────────────────────────

export async function convertExcelToPDF(
    file: File,
    options: ExcelConversionOptions = {}
): Promise<ExcelConversionResult> {
    const {
        sheetIndexes,
        outputPrefix,
        pageFormat = 'a4',
        orientation = 'landscape',
        scale = 1.5,
        onProgress,
    } = options;

    // 1. Validate
    validateFile(file);
    onProgress?.(5);

    // 2. Load workbook
    let wb: any;
    try {
        const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
        wb = new (ExcelJS as any).Workbook();
        const buf = await file.arrayBuffer();
        await wb.xlsx.load(buf);
    } catch (err: any) {
        if (file.name.toLowerCase().endsWith('.xls')) {
            throw new Error(`"${file.name}" is a legacy .xls file. Please save it as .xlsx in Excel and re-upload.`);
        }
        throw new Error(`Cannot parse "${file.name}": ${err?.message ?? 'corrupted or unsupported file'}`);
    }
    onProgress?.(20);

    const allSheets: SheetInfo[] = (wb.worksheets as any[]).map((ws: any, i: number) => ({
        name: ws.name, index: i,
        rowCount: ws.lastRow?.number ?? 0,
        colCount: ws.lastColumn?.number ?? 0,
    }));

    // 3. Filter sheets
    const selectedIndexes = sheetIndexes ?? allSheets.map((_, i) => i);
    const includedSheets = allSheets.filter(s => selectedIndexes.includes(s.index));
    if (includedSheets.length === 0) throw new Error('No sheets selected for conversion.');

    // 4. Render each sheet to HTML
    const sheetHtmls: string[] = [];
    for (let i = 0; i < includedSheets.length; i++) {
        const html = await sheetToHtml(wb, includedSheets[i].index);
        sheetHtmls.push(html);
        onProgress?.(20 + Math.round(((i + 1) / includedSheets.length) * 30));
    }

    // 5. Build full document HTML
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 9pt; }
  body { padding: 10px 12px; }
  table { page-break-inside: avoid; }
  div + div { margin-top: 24px; border-top: 2px solid #e5e7eb; padding-top: 12px; }
</style>
</head><body>${sheetHtmls.join('\n')}</body></html>`;

    onProgress?.(55);

    // 6. Mount iframe for layout
    const PAGE_W_PX = 1122; // A4 landscape ~297mm at 96dpi
    const PAGE_H_PX = 794;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        position:fixed;top:-9999px;left:-9999px;
        width:${PAGE_W_PX}px;height:${PAGE_H_PX}px;
        border:none;overflow:hidden;visibility:hidden;`;
    document.body.appendChild(iframe);

    try {
        const doc = iframe.contentDocument!;
        doc.open(); doc.write(fullHtml); doc.close();
        await new Promise<void>(res => setTimeout(res, 100));
        onProgress?.(65);

        // 7. Rasterise
        const h2c = await import('html2canvas');
        const h2cFn = (h2c as any).default ?? h2c;

        const body = doc.body;
        const fullH = Math.max(body.scrollHeight, PAGE_H_PX);

        const canvas = await h2cFn(body, {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            width: PAGE_W_PX,
            height: fullH,
            windowWidth: PAGE_W_PX,
            windowHeight: fullH,
            logging: false,
        });
        onProgress?.(82);

        // 8. Slice canvas → jsPDF pages
        const { jsPDF } = await import('jspdf');
        const isL = orientation === 'landscape';
        const pdfW = pageFormat === 'letter' ? (isL ? 279.4 : 215.9) : pageFormat === 'legal' ? (isL ? 355.6 : 215.9) : (isL ? 297 : 210);
        const pdfH = pageFormat === 'letter' ? (isL ? 215.9 : 279.4) : pageFormat === 'legal' ? (isL ? 215.9 : 355.6) : (isL ? 210 : 297);

        const pdf = new jsPDF({ orientation, unit: 'mm', format: pageFormat, compress: true });

        const mmPerPx = pdfW / (PAGE_W_PX * scale);
        const pageHeightPx = pdfH / mmPerPx;
        const totalPages = Math.ceil(canvas.height / pageHeightPx);

        for (let p = 0; p < totalPages; p++) {
            if (p > 0) pdf.addPage([pdfW, pdfH], orientation);
            const sliceH = Math.min(pageHeightPx, canvas.height - p * pageHeightPx);
            const sc = document.createElement('canvas');
            sc.width = canvas.width; sc.height = Math.ceil(sliceH);
            const ctx = sc.getContext('2d')!;
            ctx.drawImage(canvas, 0, p * pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            pdf.addImage(sc.toDataURL('image/jpeg', 0.90), 'JPEG', 0, 0, pdfW, sliceH * mmPerPx);
        }

        onProgress?.(97);
        const pdfBytes = pdf.output('arraybuffer');
        onProgress?.(100);

        const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.(xlsx?|XLS[XM]?)$/i, ''));
        return {
            bytes: new Uint8Array(pdfBytes),
            outputName: `${base}.pdf`,
            pageCount: totalPages,
            sheets: allSheets,
            includedSheets,
            originalSize: file.size,
            outputSize: pdfBytes.byteLength,
        };
    } finally {
        document.body.removeChild(iframe);
    }
}

// ── Batch conversion ──────────────────────────────────────────────────────────

export async function batchConvertExcelToPDF(
    files: File[],
    options: Omit<ExcelConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: ExcelConversionResult, index: number) => void;
        onFileError?: (fileName: string, error: string, index: number) => void;
    } = {}
): Promise<BatchExcelResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: ExcelConversionResult[] = [];
    const failed: { fileName: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertExcelToPDF(file, {
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
