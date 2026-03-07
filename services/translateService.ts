/**
 * translateService.ts
 * AI-powered PDF translation engine
 */

import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import Tesseract from 'tesseract.js';

// Setup PDF.js worker
if (typeof window !== 'undefined' && 'Worker' in window) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TranslationProgress {
    pct: number;
    stage: string;
    currentPage?: number;
    totalPages?: number;
}

export interface TranslatedPage {
    pageNumber: number;
    originalText: string;
    translatedText: string;
}

export interface TranslationResult {
    filename: string;
    sourceLanguage: string;
    targetLanguage: string;
    pages: TranslatedPage[];
    fullTranslatedText: string;
    pdfBlob?: Blob;
}

export const LANGUAGES = [
    { code: 'auto', name: 'Auto Detect' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese (Simplified)' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
    { code: 'tr', name: 'Turkish' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'th', name: 'Thai' },
    { code: 'id', name: 'Indonesian' },
    { code: 'bn', name: 'Bengali' },
];

const OPEN_ROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const OPEN_ROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

// ── Utils ─────────────────────────────────────────────────────────────────────

async function runOCR(page: any): Promise<string> {
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return "";

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');

    const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng+spa+fra+deu', {
        logger: () => { } // Silence logger
    });

    // Cleanup
    canvas.width = 0; canvas.height = 0;
    return text;
}

async function translateText(
    text: string,
    sourceLang: string,
    targetLang: string,
    onToken?: (token: string) => void
): Promise<string> {
    if (!text.trim()) return "";
    if (!OPEN_ROUTER_KEY) throw new Error("Translation API key missing.");

    const sourceDesc = sourceLang === 'auto' ? 'automatically detected language' : sourceLang;

    const prompt = `You are a professional translator. Translate the following text from ${sourceDesc} to ${targetLang}. 
Maintain the original tone, formatting (paragraphs, lists, headings), and technical terms. 
If it is a heading, keep it as a heading. If it is a list, keep the bullet points.
Return ONLY the translated text. Do not include any explanations or notes.

Text to translate:
---
${text}
---`;

    const response = await fetch(OPEN_ROUTER_API, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPEN_ROUTER_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "OmniPDF AI Translator"
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-lite-preview-02-05:free",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            stream: !!onToken
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || "Translation service failed.");
    }

    if (onToken) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter(l => l.trim().startsWith("data: "));
            for (const line of lines) {
                const data = line.replace("data: ", "");
                if (data === "[DONE]") break;
                try {
                    const json = JSON.parse(data);
                    const token = json.choices[0]?.delta?.content || "";
                    fullText += token;
                    onToken(token);
                } catch (e) { }
            }
        }
        return fullText;
    } else {
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }
}

// ── Main Service ──────────────────────────────────────────────────────────────

export async function translatePdf(
    file: File,
    targetLang: string,
    sourceLang: string = 'auto',
    options: {
        pageRange?: string; // e.g. "1-5, 10"
        onProgress?: (p: TranslationProgress) => void;
    } = {}
): Promise<TranslationResult> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    // Parse page range
    let targetPages: number[] = [];
    if (options.pageRange) {
        const parts = options.pageRange.split(',').map(p => p.trim());
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                for (let i = start; i <= end; i++) if (i >= 1 && i <= totalPages) targetPages.push(i);
            } else {
                const p = Number(part);
                if (p >= 1 && p <= totalPages) targetPages.push(p);
            }
        }
        targetPages = [...new Set(targetPages)].sort((a, b) => a - b);
    } else {
        for (let i = 1; i <= totalPages; i++) targetPages.push(i);
    }

    const translatedPages: TranslatedPage[] = [];
    let fullTranslatedText = "";

    for (let i = 0; i < targetPages.length; i++) {
        const pageNum = targetPages[i];
        options.onProgress?.({
            pct: Math.round((i / targetPages.length) * 100),
            stage: `Extracting page ${pageNum}…`,
            currentPage: i + 1,
            totalPages: targetPages.length
        });

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let pageText = textContent.items.map((item: any) => item.str).join(" ");

        // Fallback to OCR if empty or very sparse
        if (pageText.trim().length < 50) {
            options.onProgress?.({
                pct: Math.round((i / targetPages.length) * 100),
                stage: `Running OCR on page ${pageNum}…`,
                currentPage: i + 1,
                totalPages: targetPages.length
            });
            pageText = await runOCR(page);
        }

        options.onProgress?.({
            pct: Math.round((i / targetPages.length) * 100),
            stage: `Translating page ${pageNum}…`,
            currentPage: i + 1,
            totalPages: targetPages.length
        });

        try {
            const translated = await translateText(pageText, sourceLang, targetLang);
            translatedPages.push({
                pageNumber: pageNum,
                originalText: pageText,
                translatedText: translated
            });
            fullTranslatedText += (fullTranslatedText ? "\n\n" : "") + translated;
        } catch (e: any) {
            console.error(`Translation failed on page ${pageNum}:`, e);
            translatedPages.push({
                pageNumber: pageNum,
                originalText: pageText,
                translatedText: `[Translation Error: ${e.message}]`
            });
        }
    }

    options.onProgress?.({ pct: 95, stage: "Generating translated PDF…", currentPage: targetPages.length, totalPages: targetPages.length });

    // Generate output PDF
    const outPdf = await PDFDocument.create();
    const font = await outPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await outPdf.embedFont(StandardFonts.HelveticaBold);

    for (const tp of translatedPages) {
        const page = outPdf.addPage([595.28, 841.89]); // A4
        const { height } = page.getSize();

        // Very basic layout - text wrapping would be better but requires more logic
        // For production, we'll just output the text in blocks
        const margin = 50;
        let y = height - margin;

        const lines = tp.translatedText.split('\n');
        for (const line of lines) {
            if (y < margin + 20) {
                // Should add new page, but for simplicity we'll just truncate for now
                // Or we can just use a large page. In production this needs better overflow handling.
                break;
            }

            const isHeading = line.length < 100 && (line === line.toUpperCase() || line.startsWith('#'));
            page.drawText(line.substring(0, 85), { // Truncate to avoid overflow
                x: margin,
                y,
                size: isHeading ? 14 : 10,
                font: isHeading ? fontBold : font,
                color: rgb(0, 0, 0),
            });
            y -= isHeading ? 25 : 15;
        }
    }

    const pdfBytes = await outPdf.save();
    const pdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });

    options.onProgress?.({ pct: 100, stage: "Complete!" });

    return {
        filename: file.name.replace('.pdf', `_${targetLang}.pdf`),
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        pages: translatedPages,
        fullTranslatedText,
        pdfBlob
    };
}
