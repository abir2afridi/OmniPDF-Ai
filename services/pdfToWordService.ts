/**
 * pdfToWordService.ts — PDF → DOCX Conversion Service (client-side)
 *
 * Architecture:
 *   PDF file  ──[pdfjs-dist]──▶ text items per page (with position, font, size)
 *             ──[groupLines]──▶ logical line groups via Y-coordinate clustering
 *             ──[classifyLine]──▶ paragraph / heading / table / list
 *             ──[docx lib]──▶ proper Office Open XML .docx
 *             ──[Packer.toBlob]──▶ Blob ready for download
 *
 * Important note:
 *   Pixel-perfect layout reconstruction is only achievable server-side
 *   (e.g. LibreOffice headless, pdf2docx). This service does best-effort
 *   text extraction + semantic structure inference from font size/weight cues.
 *   The service layer is swap-ready: replace `convertPdfToWord` with a
 *   fetch() call to a backend endpoint when one is available.
 *
 * Dependencies:
 *   - pdfjs-dist  (already installed)
 *   - docx        (npm install docx)
 */

import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import {
    Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak,
    AlignmentType, LineRuleType,
} from 'docx';

// ── PDF.js worker (re-guard, already set up in pdfService.ts) ────────────────
if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfToWordOptions {
    /** 0-based page indices to convert. Omit = convert all pages. */
    selectedPages?: number[];
    /** Output file name without extension. Default: derived from PDF name */
    outputName?: string;
    /** Progress callback [0–100] */
    onProgress?: (p: number) => void;
}

export interface PdfToWordResult {
    blob: Blob;
    outputName: string;   // without .docx
    pageCount: number;    // pages actually converted
    wordCount: number;
    fileSizeBytes: number;
}

/** A single text item from PDF.js */
interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontName: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
}

/** A logical text line = cluster of items sharing the same Y coordinate */
interface TextLine {
    items: TextItem[];
    y: number;
    avgFontSize: number;
    maxFontSize: number;
    isBold: boolean;
    isItalic: boolean;
    text: string;
    indent: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

export const PDF_TO_WORD_MAX_MB = 100;
export const PDF_TO_WORD_MAX_PAGES = 300;

export function validatePdfForWord(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > PDF_TO_WORD_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${PDF_TO_WORD_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── PDF Loading ───────────────────────────────────────────────────────────────

async function loadPdf(file: File): Promise<PDFDocumentProxy> {
    const buffer = await file.arrayBuffer();
    return getDocument({ data: buffer }).promise;
}

// ── Text extraction ───────────────────────────────────────────────────────────

/** Extract raw text items from a single PDF page */
async function extractPageItems(
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
): Promise<TextItem[]> {
    const page = await pdfDoc.getPage(pageIndex + 1); // 1-based
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    const items: TextItem[] = [];

    for (const raw of content.items) {
        if (!('str' in raw) || !raw.str.trim()) continue;
        const item = raw as any;

        // Transform matrix: [scaleX, shearY, shearX, scaleY, transX, transY]
        const [, , , scaleY, tx, ty] = item.transform ?? [1, 0, 0, 1, 0, 0];
        const fontSize = Math.abs(scaleY);
        const x = tx;
        const y = pageHeight - ty;   // flip Y so top-of-page = small y

        const fname = (item.fontName ?? '').toLowerCase();
        const bold = /bold|black|heavy|demi/i.test(fname);
        const italic = /italic|oblique/i.test(fname);

        items.push({
            str: item.str,
            x,
            y: Math.round(y * 10) / 10,
            width: item.width ?? 0,
            height: fontSize,
            fontName: item.fontName ?? '',
            fontSize,
            bold,
            italic,
        });
    }

    return items;
}

// ── Line grouping ──────────────────────────────────────────────────────────────

/**
 * Group items into logical lines by Y coordinate proximity (±3pt threshold).
 */
function groupIntoLines(items: TextItem[]): TextLine[] {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: TextItem[][] = [];
    let current: TextItem[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (Math.abs(curr.y - prev.y) <= 3) {
            current.push(curr);
        } else {
            lines.push(current);
            current = [curr];
        }
    }
    lines.push(current);

    return lines.map(lineItems => {
        const sortedX = [...lineItems].sort((a, b) => a.x - b.x);
        const text = sortedX.map(it => it.str).join('').trim();
        const maxFontSize = Math.max(...lineItems.map(it => it.fontSize));
        const avgFontSize = lineItems.reduce((s, it) => s + it.fontSize, 0) / lineItems.length;
        const isBold = lineItems.some(it => it.bold);
        const isItalic = lineItems.every(it => it.italic);
        const indent = Math.min(...lineItems.map(it => it.x));
        const y = lineItems[0].y;
        return { items: sortedX, y, avgFontSize, maxFontSize, isBold, isItalic, text, indent };
    }).filter(l => l.text.length > 0);
}

// ── Line classification ───────────────────────────────────────────────────────

type LineKind = 'h1' | 'h2' | 'h3' | 'paragraph' | 'list' | 'blank';

function classifyLine(line: TextLine, bodyFontSize: number): LineKind {
    if (!line.text) return 'blank';
    const ratio = line.maxFontSize / (bodyFontSize || 12);
    if (ratio >= 1.6 || (line.isBold && ratio >= 1.3)) return 'h1';
    if (ratio >= 1.3 || (line.isBold && ratio >= 1.1)) return 'h2';
    if (line.isBold && ratio >= 1.0) return 'h3';
    if (/^[\u2022\u25cf\u2013\-\*]\s/.test(line.text)) return 'list';
    return 'paragraph';
}

/** Estimate body font size from modal font size across all lines */
function estimateBodyFontSize(lines: TextLine[]): number {
    const counts = new Map<number, number>();
    for (const l of lines) {
        const s = Math.round(l.avgFontSize);
        counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let mode = 12, best = 0;
    for (const [size, count] of counts) {
        if (count > best) { best = count; mode = size; }
    }
    return mode;
}

// ── DOCX generation ───────────────────────────────────────────────────────────

/**
 * Convert a TextLine to a docx Paragraph with appropriate styling.
 */
function lineToParagraph(line: TextLine, kind: LineKind, bodyFontSize: number): Paragraph {
    // Build TextRun children from individual items to preserve bold/italic spans
    const runs = line.items.map(item =>
        new TextRun({
            text: item.str,
            bold: item.bold,
            italics: item.italic,
            size: Math.round(item.fontSize * 2),    // docx uses half-points
            font: 'Calibri',
        })
    );

    const headingMap = {
        h1: HeadingLevel.HEADING_1,
        h2: HeadingLevel.HEADING_2,
        h3: HeadingLevel.HEADING_3,
    };

    const isHeading = kind === 'h1' || kind === 'h2' || kind === 'h3';

    return new Paragraph({
        children: runs,
        heading: isHeading ? headingMap[kind] : undefined,
        bullet: kind === 'list' ? { level: 0 } : undefined,
        alignment: AlignmentType.LEFT,
        spacing: {
            after: kind === 'paragraph' ? 120 : 80,
            line: 276,
            lineRule: LineRuleType.AUTO,
        },
        indent: {
            left: kind === 'list' ? 720 : 0,
        },
    });
}

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert a PDF file to a .docx Blob.
 * Pure client-side — no uploads, no server required.
 * Swap `convertPdfToWord` for a fetch() call when a backend is available.
 */
export async function convertPdfToWord(
    file: File,
    options: PdfToWordOptions = {},
): Promise<PdfToWordResult> {
    const errMsg = validatePdfForWord(file);
    if (errMsg) throw new Error(errMsg);

    const { onProgress, outputName: rawName } = options;

    onProgress?.(2);
    let pdfDoc: PDFDocumentProxy;
    try {
        pdfDoc = await loadPdf(file);
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted or encrypted.`);
    }

    const totalPages = pdfDoc.numPages;
    const pageIndices = options.selectedPages?.length
        ? options.selectedPages.filter(i => i >= 0 && i < totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

    if (pageIndices.length === 0) throw new Error('No valid pages selected.');
    if (pageIndices.length > PDF_TO_WORD_MAX_PAGES)
        throw new Error(`Too many pages (max ${PDF_TO_WORD_MAX_PAGES}). Select a range.`);

    onProgress?.(5);

    // ── Extract text from each page
    const allPageParagraphs: Paragraph[] = [];
    let wordCount = 0;

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        onProgress?.(5 + Math.round((pi / pageIndices.length) * 80));

        let items: TextItem[];
        try {
            items = await extractPageItems(pdfDoc, pageIdx);
        } catch {
            // Skip unreadable pages gracefully
            allPageParagraphs.push(
                new Paragraph({
                    children: [new TextRun({ text: `[Page ${pageIdx + 1} could not be read]`, italics: true, color: 'FF0000' })],
                })
            );
            continue;
        }

        const lines = groupIntoLines(items);
        const bodySize = estimateBodyFontSize(lines);

        for (const line of lines) {
            const kind = classifyLine(line, bodySize);
            if (kind === 'blank') continue;
            allPageParagraphs.push(lineToParagraph(line, kind, bodySize));
            wordCount += line.text.split(/\s+/).length;
        }

        // Page break between pages (not after the last one)
        if (pi < pageIndices.length - 1) {
            allPageParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
        }
    }

    onProgress?.(88);

    // ── Build DOCX
    const base = sanitizeName(rawName ?? file.name.replace(/\.pdf$/i, ''));

    const doc = new Document({
        creator: 'OmniPDF',
        title: base,
        description: `Converted from ${file.name} by OmniPDF`,
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Calibri',
                        size: 24,   // 12pt
                    },
                },
                heading1: {
                    run: { bold: true, size: 36, font: 'Calibri' },
                    paragraph: { spacing: { after: 160 } },
                },
                heading2: {
                    run: { bold: true, size: 28, font: 'Calibri' },
                    paragraph: { spacing: { after: 120 } },
                },
                heading3: {
                    run: { bold: true, size: 24, font: 'Calibri' },
                    paragraph: { spacing: { after: 80 } },
                },
            },
        },
        sections: [{
            children: allPageParagraphs,
        }],
    });

    onProgress?.(94);
    const blob = await Packer.toBlob(doc);
    onProgress?.(100);

    return {
        blob,
        outputName: base,
        pageCount: pageIndices.length,
        wordCount,
        fileSizeBytes: blob.size,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export interface BatchPdfToWordResult {
    succeeded: { fileName: string; result: PdfToWordResult }[];
    failed: { fileName: string; error: string }[];
}

export async function batchConvertPdfToWord(
    files: File[],
    options: Omit<PdfToWordOptions, 'outputName' | 'onProgress'> = {},
    onJobProgress?: (fileName: string, p: number) => void,
): Promise<BatchPdfToWordResult> {
    const succeeded: BatchPdfToWordResult['succeeded'] = [];
    const failed: BatchPdfToWordResult['failed'] = [];

    for (const file of files) {
        try {
            const result = await convertPdfToWord(file, {
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
    return (s || 'document')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'document';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
