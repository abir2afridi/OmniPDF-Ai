/**
 * Automata Theory AI Solver Service
 * - Accepts PDF, DOCX, TXT, image files
 * - Extracts text (OCR for images)
 * - Sends to OpenRouter AI with automata-specific prompt
 * - Returns structured solution with automata JSON data for custom SVG rendering
 */

import mammoth from 'mammoth';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const FALLBACK_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-v3:free',
  'meta-llama/llama-4-scout:free',
  'google/gemma-3-12b-it:free',
];

// ── File Text Extraction ─────────────────────────────────────────────────────

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return pdfjsLib;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += `\n--- Page ${i} ---\n${content.items.map((item: any) => item.str).join(' ')}`;
  }
  return text.trim();
}

export async function extractTextFromDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function extractTextFromTXT(file: File): Promise<string> {
  return file.text();
}

export async function extractTextFromImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(`[IMAGE_CONTENT: data:image/${file.name.split('.').pop()};base64,${base64}]`);
    };
    reader.readAsDataURL(file);
  });
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return extractTextFromPDF(file);
  if (ext === 'docx' || ext === 'doc') return extractTextFromDOCX(file);
  if (ext === 'txt') return extractTextFromTXT(file);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return extractTextFromImage(file);
  return file.text();
}

// ── AI Call ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export async function askAutomataAI(
  messages: ChatMessage[],
  opts?: { model?: string; max_tokens?: number }
): Promise<string> {
  const model = opts?.model || FALLBACK_MODELS[0];
  const max_tokens = opts?.max_tokens || 12000;

  for (const m of [model, ...FALLBACK_MODELS]) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OmniPDF AI - Automata Solver',
        },
        body: JSON.stringify({ model: m, messages, max_tokens, temperature: 0.3 }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`Model ${m} failed:`, text);
        continue;
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from AI.';
    } catch (e) {
      console.warn(`Model ${m} error:`, e);
      continue;
    }
  }
  throw new Error('All AI models failed. Please check your API key or try again later.');
}

// ── Automata JSON Types ─────────────────────────────────────────────────────

export interface AutomataTransition {
  from: string;
  symbol: string;
  to: string;
}

export interface AutomataData {
  label: string;
  states: string[];
  alphabet: string[];
  transitions: AutomataTransition[];
  start: string;
  accept: string[];
}

// ── System Prompt ────────────────────────────────────────────────────────────

export const AUTOMATA_SYSTEM_PROMPT = `You are an expert Automata Theory tutor and solver.

========== CRITICAL RULES ==========

1. Solve EVERY SINGLE QUESTION from the uploaded file. Count them first.
2. After your text solution for EACH question, output the automaton data as JSON.
3. Each automaton gets its OWN JSON block.
4. NEVER skip a question. NEVER skip an automaton diagram.

========== OUTPUT FORMAT ==========

For each question, output:

## Question X: [title]

**Solution:**
[Your step-by-step explanation here]

**Automaton:**
\`\`\`automata
{"label":"Question X","states":["q0","q1"],"alphabet":["a","b"],"transitions":[{"from":"q0","symbol":"a","to":"q1"}],"start":"q0","accept":["q1"]}
\`\`\`

========== AUTOMATA JSON RULES ==========

- "label": must be "Question X" matching the question number
- "states": array of state names like ["q0","q1","q2"]
- "alphabet": array of input symbols like ["a","b"] or ["0","1"]
- "transitions": array of {from, symbol, to} objects
  - For NFA: multiple transitions with same from+symbol allowed (goes to different states)
  - For epsilon transitions: use "ε" as the symbol
- "start": the start state name
- "accept": array of accept/final state names

========== EXAMPLES ==========

Example 1 - DFA for strings ending with "00":
\`\`\`automata
{"label":"DFA for strings ending with 00","states":["q0","q1","q2"],"alphabet":["0","1"],"transitions":[{"from":"q0","symbol":"0","to":"q1"},{"from":"q0","symbol":"1","to":"q0"},{"from":"q1","symbol":"0","to":"q2"},{"from":"q1","symbol":"1","to":"q0"},{"from":"q2","symbol":"0","to":"q2"},{"from":"q2","symbol":"1","to":"q0"}],"start":"q0","accept":["q2"]}
\`\`\`

Example 2 - NFA for strings containing "ab":
\`\`\`automata
{"label":"NFA for strings containing ab","states":["q0","q1","q2"],"alphabet":["a","b"],"transitions":[{"from":"q0","symbol":"a","to":"q0"},{"from":"q0","symbol":"b","to":"q0"},{"from":"q0","symbol":"a","to":"q1"},{"from":"q1","symbol":"b","to":"q2"}],"start":"q0","accept":["q2"]}
\`\`\`

Example 3 - NFA with epsilon:
\`\`\`automata
{"label":"NFA with epsilon","states":["q0","q1","q2"],"alphabet":["a","b"],"transitions":[{"from":"q0","symbol":"ε","to":"q1"},{"from":"q1","symbol":"a","to":"q2"}],"start":"q0","accept":["q2"]}
\`\`\`

========== SUMMARY ==========
- Solve every question
- Every question that builds/converts an automaton MUST have a \`\`\`automata JSON block
- Text explanation comes first, then the JSON automata block
- Number questions clearly`;

// ── Extract automata JSON from AI response ──────────────────────────────────

export function extractAutomataData(text: string): AutomataData[] {
  const regex = /```automata\s*\n?([\s\S]*?)```/g;
  const results: AutomataData[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const data = JSON.parse(jsonStr);
      if (data.states && data.transitions && data.start) {
        results.push({
          label: data.label || `Automaton ${results.length + 1}`,
          states: data.states,
          alphabet: data.alphabet || [],
          transitions: data.transitions,
          start: data.start,
          accept: data.accept || [],
        });
      }
    } catch (e) {
      console.warn('Failed to parse automata JSON:', e);
    }
  }
  return results;
}
