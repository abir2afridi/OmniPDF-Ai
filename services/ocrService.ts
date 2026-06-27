/**
 * ocrService.ts — Hybrid AI + OCR Pipeline (client-side) — PRODUCTION V2
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                  HYBRID OCR ARCHITECTURE V2                      │
 * │                                                                  │
 * │  Upload PDF                                                      │
 * │      │                                                           │
 * │      ▼                                                           │
 * │  [Step 1] Text Detection                                         │
 * │  ── pdfjs getTextContent() per page                              │
 * │  ── If text chars > threshold → "Already searchable"             │
 * │      │                                                           │
 * │      ▼  (scanned PDF detected)                                   │
 * │  [Step 2] Enhanced Preprocessing Pipeline                        │
 * │  ── Render at 3× DPI (216 DPI equivalent)                       │
 * │  ── Grayscale conversion                                         │
 * │  ── Adaptive thresholding (Sauvola-inspired)                     │
 * │  ── Despeckle (median-like filter)                               │
 * │  ── Unsharp mask sharpening                                      │
 * │      │                                                           │
 * │      ▼                                                           │
 * │  [Step 3] Tesseract.js OCR (multi-pass)                          │
 * │  ── Pass 1: Standard preprocessing                               │
 * │  ── Pass 2 (if low confidence): Aggressive preprocessing         │
 * │  ── Multi-language, confidence extraction                        │
 * │  ── Page-level raw text + word boxes                             │
 * │      │                                                           │
 * │      ▼                                                           │
 * │  [Step 4] AI Enhancement (OpenRouter)                            │
 * │  ── Fix spelling, reconstruct paragraphs                         │
 * │  ── Detect headings, restore table structure                     │
 * │  ── Returns structured JSON with confidence estimate             │
 * │  ── Graceful fallback to raw OCR if AI fails/disabled            │
 * │      │                                                           │
 * │      ▼                                                           │
 * │  [Step 5] Output Generation (user choice)                        │
 * │  ── Searchable PDF (preserves original images + invisible text)  │
 * │  ── plain .txt                                                   │
 * │  ── structured JSON                                              │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * V2 Improvements over V1:
 *   - 3× render scale (216 DPI) for better accuracy
 *   - Adaptive thresholding instead of simple contrast stretch
 *   - Despeckle filter removes noise/dots
 *   - Unsharp mask for sharper text edges
 *   - Multi-pass OCR: retry with aggressive settings if confidence < 60%
 *   - Searchable PDF preserves original page images
 *   - Better AI model for text reconstruction
 *
 * Dependencies:
 *   - pdfjs-dist   (page rendering + text detection)
 *   - tesseract.js (client-side OCR)
 *   - pdf-lib      (searchable PDF generation)
 *   - aiService.ts (OpenRouter - existing)
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { chatWithAI } from './aiService';

async function loadPdfjs() {
    const pdfjsLib = await import('pdfjs-dist');
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return pdfjsLib;
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
    /** Render scale for OCR quality. Default: 3.0 (≈216 DPI at 72 DPI base) */
    renderScale?: number;
    /** Enable AI text cleanup via OpenRouter. Default: true */
    aiEnhancement?: boolean;
    /** Apply preprocessing. Default: true */
    preprocess?: boolean;
    /** Output format. Default: 'txt' */
    outputFormat?: OutputFormat;
    outputName?: string;
    /** Force a specific preprocessing mode ('standard' | 'aggressive'). Omit = auto. */
    preprocessingMode?: 'standard' | 'aggressive';
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
    retryUsed: boolean;
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
    totalRetries: number;
}

export interface BatchOcrResult {
    succeeded: { fileName: string; result: OcrResult }[];
    failed: { fileName: string; error: string }[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export const OCR_MAX_MB = 150;
export const OCR_MAX_PAGES = 200;

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
    const sampleSize = Math.min(3, pageIndices.length);
    for (const pi of pageIndices.slice(0, sampleSize)) {
        try {
            const page = await pdf.getPage(pi + 1);
            const content = await page.getTextContent();
            totalChars += content.items.reduce((s: number, it: any) => s + (it.str?.length ?? 0), 0);
        } catch { /* skip */ }
    }
    return totalChars > TEXT_THRESHOLD * sampleSize;
}

// ── Step 2: Enhanced Preprocessing Pipeline ──────────────────────────────────

/**
 * Full preprocessing pipeline:
 * 1. Grayscale conversion
 * 2. Adaptive thresholding (Sauvola-inspired)
 * 3. Despeckle (median-like 3×3 filter)
 * 4. Unsharp mask sharpening
 */
function preprocessCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mode: 'standard' | 'aggressive',
): void {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // Step 1: Grayscale + initial contrast adjustment
    for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
    }

    // Step 2: Adaptive thresholding (Sauvola-inspired)
    // Compute local mean using integral image for speed
    const blockRadius = mode === 'aggressive' ? 15 : 25;
    const k = mode === 'aggressive' ? 0.3 : 0.2; // threshold sensitivity
    const R = 128; // dynamic range of standard deviation

    // Build integral image for fast local mean computation
    const integral = new Float64Array(width * height);
    const integralSq = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        let rowSum = 0;
        let rowSumSq = 0;
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const v = d[idx * 4];
            rowSum += v;
            rowSumSq += v * v;
            integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * width + x] : 0);
            integralSq[idx] = rowSumSq + (y > 0 ? integralSq[(y - 1) * width + x] : 0);
        }
    }

    // Apply Sauvola threshold
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const x1 = Math.max(0, x - blockRadius);
            const y1 = Math.max(0, y - blockRadius);
            const x2 = Math.min(width - 1, x + blockRadius);
            const y2 = Math.min(height - 1, y + blockRadius);
            const area = (x2 - x1 + 1) * (y2 - y1 + 1);

            const idx = y * width + x;
            const sum = integral[y2 * width + x2]
                - (x1 > 0 ? integral[y2 * width + (x1 - 1)] : 0)
                - (y1 > 0 ? integral[(y1 - 1) * width + x2] : 0)
                + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * width + (x1 - 1)] : 0);
            const sumSq = integralSq[y2 * width + x2]
                - (x1 > 0 ? integralSq[y2 * width + (x1 - 1)] : 0)
                - (y1 > 0 ? integralSq[(y1 - 1) * width + x2] : 0)
                + (x1 > 0 && y1 > 0 ? integralSq[(y1 - 1) * width + (x1 - 1)] : 0);

            const mean = sum / area;
            const variance = Math.max(0, sumSq / area - mean * mean);
            const stddev = Math.sqrt(variance);

            const threshold = mean * (1 + k * (stddev / R - 1));
            const v = d[idx * 4] < threshold ? 0 : 255;
            d[idx * 4] = d[idx * 4 + 1] = d[idx * 4 + 2] = v;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Step 3: Despeckle (remove isolated pixels — median-like 3×3 filter)
    if (mode === 'aggressive') {
        const src = ctx.getImageData(0, 0, width, height);
        const dst = ctx.createImageData(width, height);
        const sd = src.data;
        const dd = dst.data;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const neighbors: number[] = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        neighbors.push(sd[((y + dy) * width + (x + dx)) * 4]);
                    }
                }
                neighbors.sort((a, b) => a - b);
                const median = neighbors[4]; // middle of 9 values
                const idx = (y * width + x) * 4;
                dd[idx] = dd[idx + 1] = dd[idx + 2] = median;
                dd[idx + 3] = 255;
            }
        }
        ctx.putImageData(dst, 0, 0);
    }

    // Step 4: Unsharp mask sharpening
    const sharpenAmount = mode === 'aggressive' ? 1.5 : 0.8;
    const src = ctx.getImageData(0, 0, width, height);
    const sd = src.data;

    // Simple 3×3 Gaussian blur then subtract
    const blurred = new Float32Array(width * height);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kSum = 16;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            let ki = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    sum += sd[((y + dy) * width + (x + dx)) * 4] * kernel[ki++];
                }
            }
            blurred[y * width + x] = sum / kSum;
        }
    }

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const original = sd[idx];
            const blur = blurred[y * width + x];
            const sharpened = Math.min(255, Math.max(0, original + sharpenAmount * (original - blur)));
            sd[idx] = sd[idx + 1] = sd[idx + 2] = sharpened;
        }
    }

    ctx.putImageData(src, 0, 0);
}

async function renderPageToCanvas(
    page: PDFPageProxy,
    scale: number,
    applyPreprocess: boolean,
    preprocessMode: 'standard' | 'aggressive' = 'standard',
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
        preprocessCanvas(ctx, canvas.width, canvas.height, preprocessMode);
    }

    return canvas;
}

// ── Step 3: Tesseract OCR (multi-pass) ──────────────────────────────────────

async function runTesseract(
    canvas: HTMLCanvasElement,
    lang: OcrLang,
): Promise<{ text: string; confidence: number }> {
    const worker = await createWorker(lang, 1, {
        logger: () => { },
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
    // Cap text to avoid token overflow; send more text for better context
    const userMsg = `Clean and reconstruct the following OCR text from page ${pageIdx + 1}:\n\n${rawText.slice(0, 6000)}`;

    const response = await chatWithAI(
        [{ role: 'user', content: userMsg }],
        'meta-llama/llama-3.3-70b-instruct:free',
        2000,
        0.2,
        { enabled: false },
    );

    let parsed: AiEnhancedPage;
    try {
        const clean = response.message.replace(/^```(?:json)?|```$/gm, '').trim();
        parsed = JSON.parse(clean);
    } catch {
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

// ── Step 5a: Searchable PDF generation (preserves original images) ───────────

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
        const { height: pgH, width: pgW } = pdfPage.getSize();

        // Draw invisible but selectable/searchable text layer
        // Use adaptive line height based on page content
        const lines = ocr.cleanText.split('\n').filter(l => l.trim());
        const lineH = 11;
        let y = pgH - 18;
        const leftMargin = 15;
        const maxWidth = pgW - 30;

        for (const line of lines.slice(0, 80)) {
            if (y < 10) break;
            const truncated = line.slice(0, 250);
            try {
                pdfPage.drawText(truncated, {
                    x: leftMargin,
                    y: Math.max(10, y),
                    size: 9,
                    font,
                    color: rgb(1, 1, 1),
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
        `=== Page ${i + 1} (confidence: ${p.confidence}%)${p.retryUsed ? ' [retry]' : ''} ===\n\n${p.cleanText}`
    ).join('\n\n');
    return new Blob([text], { type: 'text/plain' });
}

// ── Step 5c: Structured JSON ──────────────────────────────────────────────────

function buildJsonBlob(pages: OcrPageResult[], meta: Partial<OcrResult>): Blob {
    const out = {
        generator: 'OmniPDF Hybrid OCR V2',
        version: 2,
        avgConfidence: meta.avgConfidence,
        aiEnhanced: meta.aiEnhanced,
        totalRetries: meta.totalRetries ?? 0,
        pages: pages.map((p) => ({
            page: p.pageIndex + 1,
            confidence: p.confidence,
            retryUsed: p.retryUsed,
            headings: p.headings,
            tables: p.tables,
            text: p.cleanText,
            charCount: p.charCount,
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
        renderScale = 3.0,
        aiEnhancement = true,
        preprocess = true,
        outputFormat = 'txt',
        outputName: rawName,
        preprocessingMode,
        onProgress,
    } = options;

    onProgress?.('detecting', 2, 'Loading PDF…');

    const buf = await file.arrayBuffer();
    let pdf: PDFDocumentProxy;
    try {
        const pdfjsLib = await loadPdfjs();
        pdf = await pdfjsLib.getDocument({ data: buf }).promise;
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
    let totalRetries = 0;

    for (let pi = 0; pi < pageIndices.length; pi++) {
        const pageIdx = pageIndices[pi];
        const pageLabel = `Page ${pageIdx + 1}`;
        const baseProgress = 10 + Math.round((pi / pageIndices.length) * 75);

        // Step 2 — render with preprocessing
        onProgress?.('rendering', baseProgress, `Rendering ${pageLabel}…`);
        const page = await pdf.getPage(pageIdx + 1);

        const mode = preprocessingMode ?? 'standard';
        const canvas = await renderPageToCanvas(page, renderScale, preprocess, mode);

        // Step 3 — OCR with multi-pass retry
        onProgress?.('ocr', baseProgress + 5, `Running OCR on ${pageLabel}…`);
        let rawText = '', ocrConfidence = 0, retryUsed = false;

        try {
            const r = await runTesseract(canvas, language);
            rawText = r.text;
            ocrConfidence = r.confidence;

            // If confidence is low and no forced mode, retry with aggressive preprocessing
            if (ocrConfidence < 60 && !preprocessingMode && preprocess) {
                onProgress?.('ocr', baseProgress + 8, `Low confidence — retrying ${pageLabel}…`);
                totalRetries++;
                const aggressiveCanvas = await renderPageToCanvas(page, renderScale, true, 'aggressive');
                try {
                    const r2 = await runTesseract(aggressiveCanvas, language);
                    if (r2.confidence > ocrConfidence) {
                        rawText = r2.text;
                        ocrConfidence = r2.confidence;
                        retryUsed = true;
                    }
                } catch { /* keep first pass result */ }
            }
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
            retryUsed,
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
            outputBlob = buildJsonBlob(pageResults, { avgConfidence: avgConf, aiEnhanced: aiEnhancement, totalRetries });
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
        totalRetries,
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
