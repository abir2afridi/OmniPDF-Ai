import { supabase } from '../lib/supabase'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_details?: any;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  reasoning?: { enabled: boolean };
}

interface ChatResponse {
  message: string;
  reasoning_details?: any;
  usage?: any;
}

// Simple in-memory cache for common queries (client-side)
const responseCache = new Map<string, { response: string, timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

// Common query patterns and their cached responses
const COMMON_RESPONSES = {
  'hello': 'Hello! I\'m your AI assistant for OmniPDF AI, a PDF management and analysis platform. I\'m here to help you with all your PDF-related tasks including document analysis, answering questions about uploaded files, PDF editing, conversion, and organization. How can I assist you today?',
  'hi': 'Hi there! I\'m your AI assistant for OmniPDF AI. I can help you analyze PDFs, answer questions about documents, convert files, and organize your PDF workflows. What would you like to do?',
  'help': 'I can help you with:\n• PDF document analysis and summarization\n• Answering questions about uploaded documents\n• PDF editing, conversion, and organization\n• Step-by-step guidance for PDF tasks\n• Troubleshooting PDF issues\n\nWhat specific task can I help you with?',
  'what can you do': 'As your OmniPDF AI assistant, I can:\n• Analyze and summarize PDF documents\n• Answer questions about PDF content\n• Help with PDF conversions (Word, Excel, PowerPoint, images)\n• Assist with PDF editing and organization\n• Provide guidance on PDF security and accessibility\n• Troubleshoot PDF issues\n\nWhat would you like to work on?',
  'how are you': 'I\'m doing great and ready to help you with your PDF needs! I\'m an AI assistant specifically designed for OmniPDF AI to help you with document analysis, conversion, and organization. What can I help you with today?'
};

// Streaming response support for better UX
export const chatWithAIStreaming = async (
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  model = 'meta-llama/llama-3.2-1b-instruct:free',
  max_tokens = 800
): Promise<ChatResponse> => {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase()?.trim();

  // Check cached responses first (instant)
  if (lastMessage) {
    // Check common responses
    for (const [pattern, response] of Object.entries(COMMON_RESPONSES)) {
      if (lastMessage.includes(pattern) || lastMessage === pattern) {
        console.log('⚡ Streaming instant response from cache:', pattern);
        onChunk?.(response);
        return {
          message: response,
          reasoning_details: null,
          usage: { cached: true }
        };
      }
    }

    // Check dynamic cache
    const cached = responseCache.get(lastMessage);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('⚡ Streaming response from dynamic cache');
      onChunk?.(cached.response);
      return {
        message: cached.response,
        reasoning_details: null,
        usage: { cached: true }
      };
    }
  }

  // For streaming, use the fastest model only
  try {
    console.log('🌊 Starting streaming AI chat request');

    const { data, error } = await supabase.functions.invoke('ai-chat-stream', {
      body: {
        messages,
        model,
        max_tokens,
        stream: true
      }
    });

    if (error) {
      console.error('❌ Streaming error, falling back to regular chat:', error);
      return chatWithAI(messages, model, max_tokens);
    }

    // Handle streaming response
    let fullResponse = '';
    if (data?.chunks) {
      for (const chunk of data.chunks) {
        fullResponse += chunk;
        onChunk?.(chunk);
      }
    } else {
      fullResponse = data?.message || 'No response';
      onChunk?.(fullResponse);
    }

    // Cache the response
    if (lastMessage && !responseCache.has(lastMessage)) {
      responseCache.set(lastMessage, {
        response: fullResponse,
        timestamp: Date.now()
      });
    }

    return {
      message: fullResponse,
      reasoning_details: data?.reasoning_details,
      usage: { ...data?.usage, streamed: true }
    };
  } catch (error) {
    console.error('💥 Streaming failed, using regular chat:', error);
    return chatWithAI(messages, model, max_tokens);
  }
};

export const chatWithAI = async (
  messages: ChatMessage[],
  model = 'meta-llama/llama-3.2-1b-instruct:free', // Fastest available model
  max_tokens = 800, // Reduced for speed
  temperature = 0.7
): Promise<ChatResponse> => {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase()?.trim();

  // Check for cached responses first (instant response)
  if (lastMessage) {
    // Check common responses
    for (const [pattern, response] of Object.entries(COMMON_RESPONSES)) {
      if (lastMessage.includes(pattern) || lastMessage === pattern) {
        console.log('⚡ Instant response from cache:', pattern);
        return {
          message: response,
          reasoning_details: null,
          usage: { cached: true }
        };
      }
    }

    // Check dynamic cache
    const cached = responseCache.get(lastMessage);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('⚡ Response from dynamic cache');
      return {
        message: cached.response,
        reasoning_details: null,
        usage: { cached: true }
      };
    }
  }
  const fallbackModels = [
    'z-ai/glm-4.5-air:free', // Primary - confirmed working
    'stepfun/step-3.5-flash:free' // Secondary - confirmed working with reasoning
  ];

  let lastError: any = null;

  for (const currentModel of fallbackModels) {
    try {
      console.log('🚀 Starting AI chat request via Supabase Edge Function with model:', currentModel)
      console.log('📝 Messages prepared:', messages.length)

      // Call Supabase Edge Function instead of direct API
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages,
          model: currentModel,
          max_tokens,
          temperature
        }
      })

      if (error) {
        console.error(`❌ Error with model ${currentModel}:`, error)
        lastError = error;
        continue; // Try next model
      }

      console.log('✅ Edge Function response received:', data)

      const response = {
        message: data?.message || 'No response generated',
        reasoning_details: data?.reasoning_details,
        usage: data?.usage
      };

      // Cache the response for future use (only if not already cached)
      if (lastMessage && !responseCache.has(lastMessage)) {
        responseCache.set(lastMessage, {
          response: response.message,
          timestamp: Date.now()
        });
        console.log('💾 Response cached for future use');
      }

      return response;
    } catch (error) {
      console.error(`💥 Error with model ${currentModel}:`, error)
      lastError = error;
      continue; // Try next model
    }
  }

  // All models failed - provide helpful user message
  console.error('All AI models failed, providing user-friendly error message')

  const helpfulMessage = `I'm currently experiencing high demand and all AI services are temporarily unavailable. This usually resolves quickly.

**What you can try:**
• Wait 1-2 minutes and try again
• Refresh the page
• Check your internet connection

**Alternative:** I can still help you with basic PDF guidance and tips even when AI services are busy.

For technical support, you can contact the development team.

_This is not a permanent issue - AI services typically resume within a few minutes._`

  return {
    message: helpfulMessage,
    reasoning_details: null,
    usage: { error: 'all_models_failed', fallback: true }
  };
};

export const translateText = async (
  text: string,
  targetLang: string,
  model = 'z-ai/glm-4.5-air:free'
): Promise<string> => {
  const fallbackModels = [
    'z-ai/glm-4.5-air:free',
    'stepfun/step-3.5-flash:free'
  ];

  let lastError: any = null;

  for (const currentModel of fallbackModels) {
    try {
      console.log(`🌍 Trying translation with model: ${currentModel}`)
      
      const { data, error } = await supabase.functions.invoke('ai-translate', {
        body: {
          text,
          targetLang,
          model: currentModel
        }
      })

      if (error) {
        console.error(`❌ Translation error with ${currentModel}:`, error)
        lastError = error;
        
        // If rate limited, wait and retry
        if (error.message?.includes('429') || error.status === 429) {
          console.log('⏳ Rate limited, trying next model...')
          continue;
        }
        continue;
      }

      console.log('✅ Translation successful:', data)
      return data?.translatedText || 'Translation failed.'
    } catch (error) {
      console.error(`💥 Translation exception with ${currentModel}:`, error)
      lastError = error;
      continue;
    }
  }

  // All models failed - provide helpful fallback
  console.error('All translation models failed, providing fallback')
  
  // Simple translation fallback for common languages
  const simpleTranslations = {
    Spanish: {
      Hello: 'Hola',
      'How are you': 'Cómo estás',
      'Thank you': 'Gracias',
      'Goodbye': 'Adiós'
    },
    French: {
      Hello: 'Bonjour',
      'How are you': 'Comment allez-vous',
      'Thank you': 'Merci',
      'Goodbye': 'Au revoir'
    },
    German: {
      Hello: 'Hallo',
      'How are you': 'Wie geht es dir',
      'Thank you': 'Danke',
      'Goodbye': 'Auf Wiedersehen'
    }
  };
  
  // Try to find a simple fallback translation
  const lowerText = text.toLowerCase();
  const langMap = simpleTranslations[targetLang];
  
  if (langMap) {
    for (const [english, translation] of Object.entries(langMap)) {
      if (lowerText.includes(english.toLowerCase())) {
        console.log('🔄 Using simple fallback translation')
        return text.replace(new RegExp(english, 'gi'), translation as string);
      }
    }
  }

  return `Translation temporarily unavailable. AI services are rate limited. Please try again in a few minutes.\n\nOriginal text: "${text}"\nTarget language: ${targetLang}`;
};

export const generateRefinedFilename = async (originalName: string, context: string): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('ai-rename', {
      body: {
        originalName,
        context
      }
    })

    if (error) {
      console.error('Filename generation Edge Function error:', error)
      return originalName
    }

    return data?.filename || originalName
  } catch (error) {
    console.error('Error in generateRefinedFilename:', error)
    return originalName
  }
};

export const generateAudioOverview = async (text: string, voiceName: string = 'Kore'): Promise<string | null> => {
  // Note: This will use a separate TTS Edge Function
  console.log('TTS functionality via Edge Function. Text:', text, 'Voice:', voiceName);
  return null;
};

export const chatWithPDF = async (query: string, documentContext: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('chat-with-pdf', {
      body: {
        query,
        documentContext
      }
    })

    if (error) {
      console.error('PDF Chat Edge Function error:', error)
      return "I encountered an error analyzing the document."
    }

    return data?.response || "I couldn't process that request."
  } catch (error) {
    console.error('Error in chatWithPDF:', error)
    return "I encountered an error analyzing the document."
  }
};
