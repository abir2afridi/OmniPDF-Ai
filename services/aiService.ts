interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

interface ChatResponse {
  message: string;
  usage?: any;
}

const responseCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 5;

const COMMON_RESPONSES: Record<string, string> = {
  'hello': 'Hello! I\'m your AI assistant for OmniPDF AI, a PDF management and analysis platform. I\'m here to help you with all your PDF-related tasks including document analysis, answering questions about uploaded files, PDF editing, conversion, and organization. How can I assist you today?',
  'hi': 'Hi there! I\'m your AI assistant for OmniPDF AI. I can help you analyze PDFs, answer questions about documents, convert files, and organize your PDF workflows. What would you like to do?',
  'help': 'I can help you with:\n• PDF document analysis and summarization\n• Answering questions about uploaded documents\n• PDF editing, conversion, and organization\n• Step-by-step guidance for PDF tasks\n• Troubleshooting PDF issues\n\nWhat specific task can I help you with?',
  'what can you do': 'As your OmniPDF AI assistant, I can:\n• Analyze and summarize PDF documents\n• Answer questions about PDF content\n• Help with PDF conversions (Word, Excel, PowerPoint, images)\n• Assist with PDF editing and organization\n• Provide guidance on PDF security and accessibility\n• Troubleshoot PDF issues\n\nWhat would you like to work on?',
  'how are you': 'I\'m doing great and ready to help you with your PDF needs! I\'m an AI assistant specifically designed for OmniPDF AI to help you with document analysis, conversion, and organization. What can I help you with today?'
};

function getCacheKey(messages: ChatMessage[]): string | null {
  const last = messages[messages.length - 1]?.content?.toLowerCase()?.trim();
  return last || null;
}

function checkCache(key: string): string | null {
  for (const [pattern, response] of Object.entries(COMMON_RESPONSES)) {
    if (key.includes(pattern) || key === pattern) return response;
  }
  const cached = responseCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.response;
  }
  return null;
}

function setCache(key: string, response: string) {
  if (!responseCache.has(key)) {
    responseCache.set(key, { response, timestamp: Date.now() });
  }
}

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

async function sendChat(messages: ChatMessage[], opts: ChatRequest & { stream?: boolean } = {}) {
  const { model = 'openrouter/free', max_tokens = 800, temperature = 0.7, stream = false } = opts;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'OmniPDF AI',
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature, stream }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text || res.statusText}`);
  }

  if (stream) {
    return res.body;
  }

  return res.json();
}

export const chatWithAIStreaming = async (
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  model = 'openrouter/free',
  max_tokens = 800
): Promise<ChatResponse> => {
  const cacheKey = getCacheKey(messages);
  if (cacheKey) {
    const cached = checkCache(cacheKey);
    if (cached) {
      onChunk?.(cached);
      return { message: cached, usage: { cached: true } };
    }
  }

  try {
    const streamRes = await sendChat(messages, { model, max_tokens, stream: true }) as ReadableStream<Uint8Array>;
    const reader = streamRes.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            onChunk?.(content);
          }
        } catch { }
      }
    }

    if (cacheKey) setCache(cacheKey, fullResponse);
    return { message: fullResponse || 'No response' };
  } catch (error) {
    console.error('Streaming failed, using regular chat:', error);
    return chatWithAI(messages, model, max_tokens);
  }
};

export const chatWithAI = async (
  messages: ChatMessage[],
  model = 'openrouter/free',
  max_tokens = 800,
  temperature = 0.7
): Promise<ChatResponse> => {
  const cacheKey = getCacheKey(messages);
  if (cacheKey) {
    const cached = checkCache(cacheKey);
    if (cached) return { message: cached, usage: { cached: true } };
  }

  const models = [model, 'openrouter/free', 'z-ai/glm-4.5-air:free', 'stepfun/step-3.5-flash:free'];
  let lastError: any = null;

  for (const currentModel of models) {
    for (let retry = 0; retry <= 2; retry++) {
      try {
        const result = await sendChat(messages, { model: currentModel, max_tokens, temperature });

        const content = (result as any).choices?.[0]?.message?.content;
        if (content) {
          if (cacheKey) setCache(cacheKey, content);
          return { message: content, usage: { model: currentModel } };
        }
        lastError = new Error('Empty response');
      } catch (error: any) {
        lastError = error;
        const isRateLimit = error.message?.includes('429') || error.status === 429;
        if (isRateLimit && retry < 2) {
          await new Promise(r => setTimeout(r, Math.pow(2, retry) * 1000));
          continue;
        }
        break;
      }
    }
  }

  console.error('All AI models failed');
  return {
    message: `I'm currently experiencing high demand and all AI services are temporarily unavailable. This usually resolves quickly.

**What you can try:**
• Wait 1-2 minutes and try again
• Refresh the page
• Check your internet connection

**Alternative:** I can still help you with basic PDF guidance and tips even when AI services are busy.

For technical support, you can contact the development team.

_This is not a permanent issue - AI services typically resume within a few minutes._`,
    usage: { error: 'all_models_failed', fallback: true }
  };
};

export const translateText = async (
  text: string,
  targetLang: string,
  model = 'openrouter/free'
): Promise<string> => {
  const messages: ChatMessage[] = [
    { role: 'system', content: `You are a translator. Translate the following text to ${targetLang}. Return ONLY the translated text, no explanations.` },
    { role: 'user', content: text }
  ];

  const models = [model, 'openrouter/free', 'z-ai/glm-4.5-air:free', 'stepfun/step-3.5-flash:free'];

  for (const currentModel of models) {
    try {
      const result = await sendChat(messages, { model: currentModel });
      const content = (result as any).choices?.[0]?.message?.content;
      if (content) return content;
    } catch (error) {
      console.error(`Translation error with ${currentModel}:`, error);
    }
  }

  return `Translation temporarily unavailable. AI services are rate limited. Please try again in a few minutes.\n\nOriginal text: "${text}"\nTarget language: ${targetLang}`;
};

export const generateRefinedFilename = async (originalName: string, context: string): Promise<string> => {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You generate concise, descriptive filenames based on document context. Return ONLY the filename with extension, no explanation.' },
      { role: 'user', content: `Original filename: "${originalName}"\nContext: ${context}\n\nGenerate a better filename:` }
    ];

    const result = await sendChat(messages, { model: 'openrouter/free', max_tokens: 100 });
    const content = (result as any).choices?.[0]?.message?.content;
    return content?.trim() || originalName;
  } catch (error) {
    console.error('Error in generateRefinedFilename:', error);
    return originalName;
  }
};

export const generateAudioOverview = async (_text: string, _voiceName: string = 'Kore'): Promise<string | null> => {
  console.log('TTS functionality not available via OpenRouter');
  return null;
};

export const chatWithPDF = async (query: string, documentContext: string) => {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a PDF document analysis assistant. Answer questions based on the provided document context.' },
      { role: 'user', content: `Document context:\n${documentContext}\n\nQuestion: ${query}` }
    ];

    const result = await sendChat(messages, { model: 'openrouter/free' });
    const content = (result as any).choices?.[0]?.message?.content;
    return content || "I couldn't process that request.";
  } catch (error) {
    console.error('Error in chatWithPDF:', error);
    return "I encountered an error analyzing the document.";
  }
};
