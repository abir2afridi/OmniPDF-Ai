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

export const chatWithAI = async (
  messages: ChatMessage[],
  model = 'z-ai/glm-4.5-air:free',
  max_tokens = 2000,
  temperature = 0.7
): Promise<ChatResponse> => {
  try {
    console.log('🚀 Starting AI chat request via Supabase Edge Function with model:', model)
    console.log('📝 Messages prepared:', messages.length)

    // Call Supabase Edge Function instead of direct API
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages,
        model,
        max_tokens,
        temperature
      }
    })

    if (error) {
      console.error('❌ Supabase Edge Function error:', error)
      throw new Error(`Edge Function Error: ${error.message}`)
    }

    console.log('✅ Edge Function response received:', data)

    return {
      message: data?.message || 'No response generated',
      reasoning_details: data?.reasoning_details,
      usage: data?.usage
    }
  } catch (error) {
    console.error('💥 Error in chatWithAI:', error)
    throw error
  }
};

export const translateText = async (
  text: string,
  targetLang: string,
  model = 'z-ai/glm-4.5-air:free'
): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('ai-translate', {
      body: {
        text,
        targetLang,
        model
      }
    })

    if (error) {
      console.error('Translation Edge Function error:', error)
      throw new Error('Failed to translate text')
    }

    return data?.translatedText || 'Translation failed.'
  } catch (error) {
    console.error('Error in translateText:', error)
    return 'Error during translation.'
  }
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
