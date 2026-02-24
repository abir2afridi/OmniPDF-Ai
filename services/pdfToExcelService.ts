/**
 * pdfToExcelService.ts — PDF → XLSX Conversion Service (client-side)
 *
 * Pipeline:
 *   PDF  ──[pdfjs getTextContent]──▶ TextItem[] per page (x, y, fontSize, text)
 *        ──[detectColumns]──▶ column X-boundaries via gap analysis
 *        ──[buildRows]──▶ TextItem[] → Row[] (Y-cluster → cells by column)
 *        ──[ExcelJS Workbook]──▶ one Worksheet per PDF page
 *        ──[Workbook.xlsx.writeBuffer()]──▶ ArrayBuffer → Blob → download
 *
 * Architecture note:
 *   True PDF→Excel (preserving merged cells, formulas, charts) requires
 *   server-side tools (tabula-java, camelot, pdfplumber). This service does
 *   best-effort spatial table reconstruction from text positions.
 *   The service function is swap-ready: replace convertPdfToExcel with a
 *   fetch() to a backend when available.
 *
 * Dependencies:
 *   - pdfjs-dist  (already installed)
 *   - exceljs     (already installed)
 */

import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import ExcelJS from 'exceljs';

// ── Worker guard (set by pdfService.ts too) ───────────────────────────────────
if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfToExcelOptions {
    /** 0-based page indices to include. Omit = all pages. */
    selectedPages?: number[];
    /** Whether to put every page in its own sheet. Default: true */
    oneSheetPerPage?: boolean;
    /** Output file name without extension. Default: derived from PDF name */
    outputName?: string;
    /** Progress callback [0–100] */
    onProgress?: (p: number) => void;
}

export interface PdfToExcelResult {
    blob: Blob;
    outputName: string;         // without .xlsx
    sheetsCreated: number;
    totalRows: number;
    fileSizeBytes: number;
}

export interface BatchPdfToExcelResult {
    succeeded: { fileName: string; result: PdfToExcelResult }[];
    failed: { fileName: string; error: string }[];
}

/** Raw text item as extracted from PDF.js */
interface RawItem {
    str: string;
    x: number;
    y: number;          // flipped so top-of-page = small y
    w: number;          // item width
    fontSize: number;
    bold: boolean;
}

/** One logical cell: a run of text at a column position */
interface Cell {
    text: string;
    col: number;          // 0-based column index
    bold: boolean;
    fontSize: number;
}

/** One row of cells */
interface TableRow {
    y: number;
    cells: Cell[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export const PDF_TO_XLS_MAX_MB = 100;
export const PDF_TO_XLS_MAX_PAGES = 200;

export function validatePdfForExcel(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > PDF_TO_XLS_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${PDF_TO_XLS_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── PDF Loading ───────────────────────────────────────────────────────────────

async function openPdf(file: File): Promise<PDFDocumentProxy> {
    const buf = await file.arrayBuffer();
    return getDocument({ data: buf }).promise;
}

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractItems(pdf: PDFDocumentProxy, pageIdx: number): Promise<RawItem[]> {
    const page = await pdf.getPage(pageIdx + 1);
    const content = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const pageH = vp.height;

    const items: RawItem[] = [];
    for (const raw of content.items) {
        if (!('str' in raw) || !raw.str.trim()) continue;
        const it = raw as any;
        const [, , , scaleY, tx, ty] = it.transform ?? [1, 0, 0, 1, 0, 0];
        const fontSize = Math.abs(scaleY);
        const x = tx;
        const y = Math.round((pageH - ty) * 10) / 10;
        const fname = (it.fontName ?? '').toLowerCase();
        const bold = /bold|black|heavy|demi/i.test(fname);
        items.push({ str: it.str.trim(), x, y, w: it.width ?? 0, fontSize, bold });
    }
    return items;
}

// ── Column detection ──────────────────────────────────────────────────────────

/**
 * Cluster X positions into column boundaries using gap analysis.
 * Returns sorted column X-start positions.
 */
function detectColumnBoundaries(items: RawItem[]): number[] {
    if (items.length === 0) return [];

    // Collect all unique x values, sort
    const xs = Array.from(new Set(items.map(it => Math.round(it.x)))).sort((a, b) => a - b);
    if (xs.length <= 1) return xs;

    // Find significant gaps (> 20pt) to delineate columns
    const colBounds: number[] = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
        if (xs[i] - xs[i - 1] > 20) colBounds.push(xs[i]);
    }
    return colBounds;
}

/** Map an item's X position to the nearest column index */
function assignColumn(x: number, colBounds: number[]): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < colBounds.length; i++) {
        const d = Math.abs(x - colBounds[i]);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
}

// ── Row building ──────────────────────────────────────────────────────────────

/**
 * Group items into rows (by Y proximity ±4pt) then assign cells to columns.
 */
function buildRows(items: RawItem[], colBounds: number[]): TableRow[] {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => a.y - b.y);
    const rowGroups: RawItem[][] = [];
    let current = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].y - sorted[i - 1].y) <= 4) {
            current.push(sorted[i]);
        } else {
            rowGroups.push(current);
            current = [sorted[i]];
        }
    }
    rowGroups.push(current);

    return rowGroups.map(group => {
        const byCol = new Map<number, { text: string[]; bold: boolean; fontSize: number }>();
        for (const it of group) {
            const col = colBounds.length > 0 ? assignColumn(it.x, colBounds) : 0;
            if (!byCol.has(col)) byCol.set(col, { text: [], bold: it.bold, fontSize: it.fontSize });
            byCol.get(col)!.text.push(it.str);
        }
        const cells: Cell[] = [];
        for (const [col, data] of byCol) {
            cells.push({ col, text: data.text.join(' '), bold: data.bold, fontSize: data.fontSize });
        }
        cells.sort((a, b) => a.col - b.col);
        return { y: group[0].y, cells };
    });
}

// ── ExcelJS sheet builder ─────────────────────────────────────────────────────

/**
 * Write rows into an ExcelJS Worksheet.
 * Returns number of rows written.
 */
function writeSheet(
    sheet: ExcelJS.Worksheet,
    rows: TableRow[],
    colCount: number,
): number {
    if (rows.length === 0) return 0;

    // Detect header row (first row, often bold or larger font)
    const firstRow = rows[0];
    const isHeaderRow = firstRow.cells.length > 0 &&
        (firstRow.cells.some(c => c.bold) || firstRow.cells[0].fontSize > 11);

    let xlsRowIdx = 1;
    let totalRows = 0;

    for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const xlRow = sheet.getRow(xlsRowIdx);
        const isHdr = ri === 0 && isHeaderRow;

        // Build an array of cell values, indexed by column
        const cellArr: (string | null)[] = Array(colCount).fill(null);
        for (const cell of row.cells) {
            cellArr[cell.col] = cell.text || null;
        }

        // Write cells
        for (let ci = 0; ci < colCount; ci++) {
            const xlCell = xlRow.getCell(ci + 1);
            xlCell.value = cellArr[ci] ?? '';

            // Style
            xlCell.font = {
                name: 'Calibri',
                size: isHdr ? 11 : 10,
                bold: isHdr ? true : (row.cells.find(c => c.col === ci)?.bold ?? false),
                color: { argb: isHdr ? 'FF1E3A5F' : 'FF2D2D2D' },
            };

            if (isHdr) {
                xlCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE8F0FE' },
                };
                xlCell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
                xlCell.alignment = { vertical: 'middle', wrapText: false };
            }

            xlCell.border = {
                top: { style: 'thin', color: { argb: 'FFD0D7DE' } },
                left: { style: 'thin', color: { argb: 'FFD0D7DE' } },
                bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } },
                right: { style: 'thin', color: { argb: 'FFD0D7DE' } },
            };
        }

        xlRow.height = isHdr ? 22 : 18;
        xlRow.commit();
        xlsRowIdx++;
        totalRows++;
    }

    // Auto-fit columns (heuristic: max text length × 1.2 character units)
    for (let ci = 0; ci < colCount; ci++) {
        let maxLen = 10;
        for (const row of rows) {
            const cell = row.cells.find(c => c.col === ci);
            if (cell?.text) maxLen = Math.max(maxLen, cell.text.length);
        }
        sheet.getColumn(ci + 1).width = Math.min(Math.max(maxLen * 1.1, 10), 60);
    }

    return totalRows;
}

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert a PDF file to an Excel (.xlsx) Blob.
 * Each PDF page becomes one worksheet (when oneSheetPerPage = true, default).
 * Swap this function body for a `fetch()` call when a backend is ready.
 */
export async function convertPdfToExcel(
    file: File,
    options: PdfToExcelOptions = {},
): Promise<PdfToExcelResult> {
    const err = validatePdfForExcel(file);
    if (err) throw new Error(err);

    const {
        oneSheetPerPage = true,
        outputName: rawName,
        onProgress,
    } = options;

    onProgress?.(2);

    let pdf: PDFDocumentProxy;
    try {
        pdf = await openPdf(file);
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted or encrypted.`);
    }

    const total = pdf.numPages;
    const pageIndices = options.selectedPages?.length
        ? options.selectedPages.filter(i => i >= 0 && i < total)
        : Array.from({ length: total }, (_, i) => i);

    if (pageIndices.length === 0) throw new Error('No valid pages selected.');
    if (pageIndices.length > PDF_TO_XLS_MAX_PAGES)
        throw new Error(`Too many pages selected (max ${PDF_TO_XLS_MAX_PAGES}).`);

    onProgress?.(5);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OmniPDF';
    workbook.created = new Date();
    workbook.title = rawName ?? file.name.replace(/\.pdf$/i, '');

    let totalRowsAll = 0;
    let sheetsCreated = 0;

    // If all-pages-in-one-sheet mode, collect first
    const combinedRows: TableRow[] = [];
    let combinedCols = 0;

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        onProgress?.(5 + Math.round((pi / pageIndices.length) * 85));

        let items: RawItem[];
        try {
            items = await extractItems(pdf, pageIdx);
        } catch {
            // Skip unreadable pages
            continue;
        }

        if (items.length === 0) continue;

        const colBounds = detectColumnBoundaries(items);
        const rows = buildRows(items, colBounds);
        const colCount = colBounds.length || 1;

        if (oneSheetPerPage) {
            const sheetName = `Page ${pageIdx + 1}`.slice(0, 31);
            const sheet = workbook.addWorksheet(sheetName, {
                pageSetup: { fitToPage: true, fitToWidth: 1 },
                properties: { defaultRowHeight: 18 },
            });
            const written = writeSheet(sheet, rows, colCount);
            totalRowsAll += written;
            sheetsCreated++;
        } else {
            // Accumulate for single sheet
            for (const row of rows) combinedRows.push(row);
            combinedCols = Math.max(combinedCols, colCount);
        }
    }

    // Single sheet mode
    if (!oneSheetPerPage && combinedRows.length > 0) {
        const sheet = workbook.addWorksheet('PDF Content', {
            pageSetup: { fitToPage: true, fitToWidth: 1 },
            properties: { defaultRowHeight: 18 },
        });
        const written = writeSheet(sheet, combinedRows, combinedCols || 1);
        totalRowsAll += written;
        sheetsCreated = 1;
    }

    // If nothing was extracted
    if (sheetsCreated === 0) {
        const sheet = workbook.addWorksheet('Empty');
        sheet.getCell('A1').value = 'No extractable text found in the selected pages.';
        sheet.getCell('A1').font = { italic: true, color: { argb: 'FF888888' } };
        sheetsCreated = 1;
    }

    onProgress?.(93);

    const base = sanitizeName(rawName ?? file.name.replace(/\.pdf$/i, ''));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    onProgress?.(100);

    return {
        blob,
        outputName: base,
        sheetsCreated,
        totalRows: totalRowsAll,
        fileSizeBytes: blob.size,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchConvertPdfToExcel(
    files: File[],
    options: Omit<PdfToExcelOptions, 'outputName' | 'onProgress'> = {},
    onJobProgress?: (name: string, p: number) => void,
): Promise<BatchPdfToExcelResult> {
    const succeeded: BatchPdfToExcelResult['succeeded'] = [];
    const failed: BatchPdfToExcelResult['failed'] = [];

    for (const file of files) {
        try {
            const result = await convertPdfToExcel(file, {
                ...options,
                outputName: file.name.replace(/\.pdf$/i, ''),
                onProgress: p => onJobProgress?.(file.name, p),
            });
            succeeded.push({ fileName: file.name, result });
        } catch (err: any) {
            failed.push({ fileName: file.name, error: err?.message ?? 'Unknown error' });
        }
    }
    return { succeeded, failed };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return (s || 'spreadsheet')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'spreadsheet';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
