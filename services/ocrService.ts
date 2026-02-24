/**
 * ocrService.ts — Hybrid AI + OCR Pipeline (client-side)
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  HYBRID OCR ARCHITECTURE                    │
 * │                                                             │
 * │  Upload PDF                                                 │
 * │      │                                                      │
 * │      ▼                                                      │
 * │  [Step 1] Text Detection                                    │
 * │  ── pdfjs getTextContent() per page                         │
 * │  ── If text chars > threshold → "Already searchable"        │
 * │      │                                                      │
 * │      ▼  (scanned PDF detected)                              │
 * │  [Step 2] Page Render → Canvas                              │
 * │  ── pdfjs render at 2× DPI (high res for accuracy)          │
 * │  ── Canvas contrast boost (ImageData manipulation)          │
 * │      │                                                      │
 * │      ▼                                                      │
 * │  [Step 3] Tesseract.js OCR                                  │
 * │  ── Multi-language, confidence extraction                   │
 * │  ── Page-level raw text + word boxes                        │
 * │      │                                                      │
 * │      ▼                                                      │
 * │  [Step 4] AI Enhancement (OpenRouter)                       │
 * │  ── Fix spelling, reconstruct paragraphs                    │
 * │  ── Detect headings, restore table structure                │
 * │  ── Returns structured JSON with confidence estimate        │
 * │  ── Graceful fallback to raw OCR if AI fails/disabled       │
 * │      │                                                      │
 * │      ▼                                                      │
 * │  [Step 5] Output Generation (user choice)                   │
 * │  ── Searchable PDF (pdf-lib text layer overlay)             │
 * │  ── plain .txt                                              │
 * │  ── structured JSON                                         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Swap note:
 *   Replace `runTesseract()` body with a fetch() to your backend
 *   (Tesseract CLI / EasyOCR / PaddleOCR) for higher accuracy.
 *   The AI enhancement layer & output generation remain unchanged.
 *
 * Dependencies:
 *   - pdfjs-dist   (page rendering + text detection)
 *   - tesseract.js (client-side OCR)
 *   - pdf-lib      (searchable PDF generation)
 *   - aiService.ts (OpenRouter - existing)
 */

import {
    getDocument, GlobalWorkerOptions,
    type PDFDocumentProxy, type PDFPageProxy,
} from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { chatWithAI } from './aiService';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OcrLang =
    | 'eng' | 'fra' | 'deu' | 'spa' | 'ita' | 'por'
    | 'rus' | 'chi_sim' | 'chi_tra' | 'ara' | 'jpn' | 'kor'
    | 'hin' | 'ben' | 'tur' | 'pol' | 'nld' | 'swe' | 'nor' | 'dan';

export type OutputFormat = 'txt' | 'pdf' | 'json';

export interface OcrOptions {
    /** 0-based page indices. Omit = all pages. */
    selectedPages?: number[];
    language?: OcrLang;
    /** Render scale for OCR quality. Default: 2.5 (≈180 DPI at 72 DPI base) */
    renderScale?: number;
    /** Enable AI text cleanup via OpenRouter. Default: true */
    aiEnhancement?: boolean;
    /** Apply contrast boost preprocessing. Default: true */
    preprocess?: boolean;
    outputFormat?: OutputFormat;
    outputName?: string;
    onProgress?: (stage: OcrStage, percent: number, detail?: string) => void;
}

export type OcrStage =
    | 'detecting' | 'rendering' | 'ocr' | 'enhancing' | 'building' | 'done';

export interface OcrPageResult {
    pageIndex: number;
    rawText: string;
    cleanText: string;
    confidence: number;  // 0–100 from Tesseract
    aiConfidence: number | null;
    headings: string[];
    tables: string[][];
    charCount: number;
}

export interface OcrResult {
    pages: OcrPageResult[];
    allText: string;
    avgConfidence: number;
    alreadyHasText: boolean;
    outputBlob: Blob;
    outputName: string;
    format: OutputFormat;
    aiEnhanced: boolean;
    tokenUsage?: { prompt: number; completion: number };
}

export interface BatchOcrResult {
    succeeded: { fileName: string; result: OcrResult }[];
    failed: { fileName: string; error: string }[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export const OCR_MAX_MB = 100;
export const OCR_MAX_PAGES = 100;

export function validatePdfForOcr(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > OCR_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${OCR_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── Language catalogue ────────────────────────────────────────────────────────

export const OCR_LANGUAGES: Record<OcrLang, string> = {
    eng: 'English',
    fra: 'French',
    deu: 'German',
    spa: 'Spanish',
    ita: 'Italian',
    por: 'Portuguese',
    rus: 'Russian',
    chi_sim: 'Chinese (Simplified)',
    chi_tra: 'Chinese (Traditional)',
    ara: 'Arabic',
    jpn: 'Japanese',
    kor: 'Korean',
    hin: 'Hindi',
    ben: 'Bengali',
    tur: 'Turkish',
    pol: 'Polish',
    nld: 'Dutch',
    swe: 'Swedish',
    nor: 'Norwegian',
    dan: 'Danish',
};

// ── Step 1: Detect existing text ──────────────────────────────────────────────

const TEXT_THRESHOLD = 50; // chars per page to consider "already has text"

async function detectTextLayer(pdf: PDFDocumentProxy, pageIndices: number[]): Promise<boolean> {
    let totalChars = 0;
    for (const pi of pageIndices.slice(0, 3)) { // sample first 3 pages
        try {
            const page = await pdf.getPage(pi + 1);
            const content = await page.getTextContent();
            totalChars += content.items.reduce((s: number, it: any) => s + (it.str?.length ?? 0), 0);
        } catch { /* skip */ }
    }
    return totalChars > TEXT_THRESHOLD * Math.min(3, pageIndices.length);
}

// ── Step 2: Preprocessing — render + contrast boost ──────────────────────────

async function renderPageToCanvas(
    page: PDFPageProxy,
    scale: number,
    applyPreprocess: boolean,
): Promise<HTMLCanvasElement> {
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    if (applyPreprocess) {
        // Contrast & grayscale boost for better OCR accuracy
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            // Grayscale
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // Contrast stretch: map [0,200] → [0,255], [200,255] → [200,255]
            const v = gray < 128 ? Math.max(0, gray - 20) : Math.min(255, gray + 20);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    return canvas;
}

// ── Step 3: Tesseract OCR ─────────────────────────────────────────────────────

async function runTesseract(
    canvas: HTMLCanvasElement,
    lang: OcrLang,
): Promise<{ text: string; confidence: number }> {
    const worker = await createWorker(lang, 1, {
        logger: () => { },             // silence verbose Tesseract logs
        errorHandler: () => { },
    });
    try {
        const { data } = await worker.recognize(canvas);
        return { text: (data.text ?? '').trim(), confidence: Math.round(data.confidence ?? 0) };
    } finally {
        await worker.terminate();
    }
}

// ── Step 4: AI enhancement ────────────────────────────────────────────────────

interface AiEnhancedPage {
    clean_text: string;
    headings: string[];
    tables_detected: string[][];
    confidence_estimate: number;
}

const AI_OCR_SYSTEM_PROMPT = `You are a document reconstruction AI. Your job is to clean OCR-extracted text from scanned documents.

Rules:
- Fix obvious spelling errors caused by OCR (e.g. "rn" misread as "m", "l" as "1")
- Reconstruct broken paragraphs (join lines that belong together)
- Detect headings (ALL CAPS or lines under 60 chars followed by a blank line)
- Restore table-like structures where columns are tab/space-separated
- Preserve original meaning — do NOT hallucinate or invent content
- Do NOT summarize — return the full cleaned text
- Return ONLY valid JSON, no markdown fences

JSON schema:
{
  "clean_text": "full cleaned text as a single string",
  "headings": ["list of detected heading strings"],
  "tables_detected": [["row1col1","row1col2"],["row2col1","row2col2"]],
  "confidence_estimate": 0-100
}`;

async function aiEnhancePage(
    rawText: string,
    pageIdx: number,
): Promise<{ result: AiEnhancedPage; usage: { prompt: number; completion: number } }> {
    const userMsg = `Clean and reconstruct the following OCR text from page ${pageIdx + 1}:\n\n${rawText.slice(0, 4000)}`; // cap to avoid token overflow

    const response = await chatWithAI(
        [{ role: 'user', content: userMsg }],
        'arcee-ai/trinity-large-preview:free',
        1500,
        0.2, // low temp for faithful reconstruction
        { enabled: false },
    );

    let parsed: AiEnhancedPage;
    try {
        // Strip possible markdown fences from model response
        const clean = response.message.replace(/^```(?:json)?|```$/gm, '').trim();
        parsed = JSON.parse(clean);
    } catch {
        // Fallback: treat raw response as clean_text
        parsed = {
            clean_text: response.message,
            headings: [],
            tables_detected: [],
            confidence_estimate: 60,
        };
    }

    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    return {
        result: parsed,
        usage: { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0 },
    };
}

// ── Step 5a: Searchable PDF generation ───────────────────────────────────────

async function buildSearchablePdf(
    originalBytes: Uint8Array,
    pages: OcrPageResult[],
): Promise<Blob> {
    const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pdfPages = doc.getPages();

    for (const ocr of pages) {
        const pdfPage = pdfPages[ocr.pageIndex];
        if (!pdfPage) continue;
        const { height: pgH } = pdfPage.getSize();

        // Overlay text at position 0,0 with opacity 0 — invisible but selectable/searchable
        const lines = ocr.cleanText.split('\n').filter(l => l.trim());
        const lineH = 12;
        let y = pgH - 20;
        for (const line of lines.slice(0, 60)) { // cap at 60 lines per page
            try {
                pdfPage.drawText(line.slice(0, 200), {
                    x: 10,
                    y: Math.max(10, y),
                    size: 10,
                    font,
                    color: rgb(1, 1, 1), // white = invisible
                    opacity: 0,
                });
            } catch { /* skip malformed chars */ }
            y -= lineH;
        }
    }

    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes], { type: 'application/pdf' });
}

// ── Step 5b: Plain text ───────────────────────────────────────────────────────

function buildTxtBlob(pages: OcrPageResult[]): Blob {
    const text = pages.map((p, i) =>
        `=== Page ${i + 1} (confidence: ${p.confidence}%) ===\n\n${p.cleanText}`
    ).join('\n\n');
    return new Blob([text], { type: 'text/plain' });
}

// ── Step 5c: Structured JSON ──────────────────────────────────────────────────

function buildJsonBlob(pages: OcrPageResult[], meta: Partial<OcrResult>): Blob {
    const out = {
        generator: 'OmniPDF Hybrid OCR',
        avgConfidence: meta.avgConfidence,
        aiEnhanced: meta.aiEnhanced,
        pages: pages.map((p) => ({
            page: p.pageIndex + 1,
            confidence: p.confidence,
            headings: p.headings,
            tables: p.tables,
            text: p.cleanText,
        })),
    };
    return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
}

// ── Core function ─────────────────────────────────────────────────────────────

export async function runOcr(
    file: File,
    options: OcrOptions = {},
): Promise<OcrResult> {
    const err = validatePdfForOcr(file);
    if (err) throw new Error(err);

    const {
        language = 'eng',
        renderScale = 2.5,
        aiEnhancement = true,
        preprocess = true,
        outputFormat = 'txt',
        outputName: rawName,
        onProgress,
    } = options;

    onProgress?.('detecting', 2, 'Loading PDF…');

    const buf = await file.arrayBuffer();
    let pdf: PDFDocumentProxy;
    try {
        pdf = await getDocument({ data: buf }).promise;
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted or encrypted.`);
    }

    const totalPages = pdf.numPages;
    const pageIndices = options.selectedPages?.length
        ? options.selectedPages.filter(i => i >= 0 && i < totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

    if (pageIndices.length === 0) throw new Error('No valid pages selected.');
    if (pageIndices.length > OCR_MAX_PAGES)
        throw new Error(`Too many pages selected (max ${OCR_MAX_PAGES}).`);

    // Step 1 — detect existing text
    onProgress?.('detecting', 8, 'Checking for existing text layer…');
    const alreadyHasText = await detectTextLayer(pdf, pageIndices);

    const pageResults: OcrPageResult[] = [];
    let totalConfidence = 0;
    let totalTokenPrompt = 0;
    let totalTokenCompletion = 0;

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        const pageLabel = `Page ${pageIdx + 1}`;
        const baseProgress = 10 + Math.round((pi / pageIndices.length) * 75);

        // Step 2 — render
        onProgress?.('rendering', baseProgress, `Rendering ${pageLabel}…`);
        const page = await pdf.getPage(pageIdx + 1);
        const canvas = await renderPageToCanvas(page, renderScale, preprocess);

        // Step 3 — OCR
        onProgress?.('ocr', baseProgress + 5, `Running OCR on ${pageLabel}…`);
        let rawText = '', ocrConfidence = 0;
        try {
            const r = await runTesseract(canvas, language);
            rawText = r.text;
            ocrConfidence = r.confidence;
        } catch (e: any) {
            rawText = `[OCR failed for ${pageLabel}: ${e?.message}]`;
            ocrConfidence = 0;
        }

        // Step 4 — AI enhancement
        let cleanText = rawText;
        let aiConf: number | null = null;
        let headings: string[] = [];
        let tables: string[][] = [];

        if (aiEnhancement && rawText.trim().length > 20) {
            onProgress?.('enhancing', baseProgress + 8, `AI enhancing ${pageLabel}…`);
            try {
                const { result, usage } = await aiEnhancePage(rawText, pageIdx);
                cleanText = result.clean_text || rawText;
                headings = result.headings || [];
                tables = result.tables_detected || [];
                aiConf = result.confidence_estimate ?? null;
                totalTokenPrompt += usage.prompt;
                totalTokenCompletion += usage.completion;
            } catch {
                // AI failed — silent fallback to raw OCR
                cleanText = rawText;
            }
        }

        totalConfidence += ocrConfidence;

        pageResults.push({
            pageIndex: pageIdx,
            rawText,
            cleanText,
            confidence: ocrConfidence,
            aiConfidence: aiConf,
            headings,
            tables,
            charCount: cleanText.length,
        });

        // Breathe between pages
        await new Promise(r => setTimeout(r, 0));
    }

    const avgConf = pageIndices.length > 0 ? Math.round(totalConfidence / pageIndices.length) : 0;
    const baseName = sanitizeName(rawName ?? file.name.replace(/\.pdf$/i, ''));

    // Step 5 — build output
    onProgress?.('building', 90, 'Building output…');

    let outputBlob: Blob;
    let outputExt: string;
    switch (outputFormat) {
        case 'pdf':
            outputBlob = await buildSearchablePdf(new Uint8Array(buf), pageResults);
            outputExt = 'pdf';
            break;
        case 'json':
            outputBlob = buildJsonBlob(pageResults, { avgConfidence: avgConf, aiEnhanced: aiEnhancement });
            outputExt = 'json';
            break;
        default:
            outputBlob = buildTxtBlob(pageResults);
            outputExt = 'txt';
    }

    onProgress?.('done', 100, 'Done');

    return {
        pages: pageResults,
        allText: pageResults.map(p => p.cleanText).join('\n\n'),
        avgConfidence: avgConf,
        alreadyHasText,
        outputBlob,
        outputName: `${baseName}_ocr.${outputExt}`,
        format: outputFormat,
        aiEnhanced: aiEnhancement,
        tokenUsage: { prompt: totalTokenPrompt, completion: totalTokenCompletion },
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchRunOcr(
    files: File[],
    options: Omit<OcrOptions, 'onProgress'>,
    onJobProgress?: (name: string, stage: OcrStage, p: number) => void,
): Promise<BatchOcrResult> {
    const succeeded: BatchOcrResult['succeeded'] = [];
    const failed: BatchOcrResult['failed'] = [];

    for (const file of files) {
        try {
            const result = await runOcr(file, {
                ...options,
                onProgress: (stage, p) => onJobProgress?.(file.name, stage, p),
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
    return (s || 'ocr_output')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'ocr_output';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}
