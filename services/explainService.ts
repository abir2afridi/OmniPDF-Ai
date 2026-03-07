/**
 * explainService.ts — Explain Document Service (Multi-format RAG & Analysis)
 * 
 * Supported: PDF, DOCX, TXT
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions && !GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const DEFAULT_MODEL = 'z-ai/glm-4.5-air:free';

export type ExplanationMode = 'simple' | 'student' | 'professional';

export interface DocumentInfo {
    name: string;
    type: string;
    size: number;
    text: string;
    pages: { number: number; text: string }[];
}

export interface ExplanationResult {
    summary: string;
    keyPoints: string[];
    concepts: { term: string; explanation: string }[];
    definitions: { term: string; definition: string }[];
}

/**
 * Extracts text from PDF, DOCX or TXT
 */
export async function extractDocumentText(file: File, onProgress?: (pct: number) => void): Promise<DocumentInfo> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') {
        return extractFromPDF(file, onProgress);
    } else if (ext === 'docx') {
        return extractFromDOCX(file, onProgress);
    } else if (ext === 'txt') {
        return extractFromTXT(file, onProgress);
    } else {
        throw new Error('Unsupported file format. Please upload PDF, DOCX, or TXT.');
    }
}

async function extractFromPDF(file: File, onProgress?: (pct: number) => void): Promise<DocumentInfo> {
    const bytes = await file.arrayBuffer();
    const pdf = await getDocument({ data: bytes }).promise;
    const pages: { number: number; text: string }[] = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        pages.push({ number: i, text });
        fullText += text + '\n\n';
        onProgress?.(Math.round((i / pdf.numPages) * 100));
    }

    return { name: file.name, type: 'pdf', size: file.size, text: fullText, pages };
}

async function extractFromDOCX(file: File, onProgress?: (pct: number) => void): Promise<DocumentInfo> {
    onProgress?.(10);
    const mammoth = await import('mammoth');
    onProgress?.(30);
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    onProgress?.(100);

    const text = result.value;
    // For DOCX, we treat it as a single page or split by double newlines for pseudo-pages
    const pages = text.split('\n\n\n').map((t, i) => ({ number: i + 1, text: t.trim() }));

    return { name: file.name, type: 'docx', size: file.size, text, pages };
}

async function extractFromTXT(file: File, onProgress?: (pct: number) => void): Promise<DocumentInfo> {
    onProgress?.(50);
    const text = await file.text();
    onProgress?.(100);
    const pages = [{ number: 1, text }];
    return { name: file.name, type: 'txt', size: file.size, text, pages };
}

/**
 * AI Analysis API call
 */
export async function analyzeDocument(text: string, mode: ExplanationMode): Promise<ExplanationResult> {
    if (!OPENROUTER_KEY) throw new Error('API key missing');

    const prompts = {
        simple: "Explain this document like I'm 5 years old. Use very simple language.",
        student: "Provide a step-by-step explanation for a student. Focus on learning themes.",
        professional: "Provide a detailed professional analysis and executive summary."
    };

    const systemPrompt = `You are an expert document analyst. Analyze the provided text and return a JSON object with:
    - summary: A concise overview based on the selected mode.
    - keyPoints: An array of 5 major takeaways.
    - concepts: An array of {term, explanation} objects for complex ideas.
    - definitions: An array of {term, definition} for difficult vocabulary found in text.
    
    Mode: ${prompts[mode]}
    Respond ONLY with valid JSON.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://omnipdf-ai.com',
            'X-Title': 'OmniPDF AI Explain',
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Text: ${getRelevantChunks(text, 15000)}` }
            ],
            response_format: { type: 'json_object' }
        })
    });

    const data = await response.json();
    try {
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    } catch (e) {
        throw new Error('Failed to parse AI response.');
    }
}

/**
 * Chat with Document logic
 */
export async function chatWithDocument(docText: string, query: string, history: any[]): Promise<string> {
    if (!OPENROUTER_KEY) throw new Error('API key missing');

    const systemPrompt = `You are a helpful AI assistant. You have access to a document's content. 
    Use the provided text to answer the user's questions. If the answer is not in the text, say you don't know based on the document.
    
    Document Context (excerpts): ${getRelevantChunks(docText, 10000)}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: query }
            ]
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Quick action analysis
 */
export async function quickExplain(text: string, action: 'paragraph' | 'page' | 'takeaways'): Promise<string> {
    const prompts = {
        paragraph: "Explain this paragraph in simple terms.",
        page: "Summarize this page concisely.",
        takeaways: "List the 3 most important takeaways from this text."
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant.' },
                { role: 'user', content: `${prompts[action]}\n\nText: ${text}` }
            ]
        })
    });

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Helper: Get representative chunks from text if it's too long
 */
function getRelevantChunks(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;

    // Head, Middle, Tail sampling for better overview
    const third = Math.floor(maxLen / 3);
    const head = text.slice(0, third);
    const mid = text.slice(Math.floor(text.length / 2) - third / 2, Math.floor(text.length / 2) + third / 2);
    const tail = text.slice(-third);

    return `[START] ${head} ... [MIDDLE] ${mid} ... [END] ${tail}`;
}
