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

// Use environment variable for Vercel deployment
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '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';

export const chatWithAI = async (
  messages: ChatMessage[],
  model = 'z-ai/glm-4.5-air:free',
  max_tokens = 1000,
  temperature = 0.7,
  reasoning = { enabled: true }
): Promise<ChatResponse> => {
  try {
    console.log('🚀 Starting AI chat request with model:', model);
    
    // Add system prompt with developer info and PDF context
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are an AI assistant for OmniPDF AI, a PDF management and analysis platform.

Developer Information:
- Developer: Abir Hasan Siam
- GitHub: github.com/abir2afridi
- Platform: OmniPDF AI Suite

Your Capabilities:
- PDF document analysis and summarization
- Answering questions about uploaded documents
- Helping with PDF editing, conversion, and organization tasks
- Providing step-by-step explanations for complex problems
- Assisting with document-related workflows

Always be helpful, professional, and mention that you're part of the OmniPDF AI suite when appropriate. If users ask about the developer, credit Abir Hasan Siam.`
    };

    const allMessages = [systemMessage, ...messages];
    console.log('📝 Messages prepared:', allMessages.length);

    // Use direct OpenRouter API call
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnifdf-ai.com',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        max_tokens,
        temperature,
        reasoning,
      }),
    });

    console.log('📡 API Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter API error:', errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ API Response received:', data);
    
    return {
      message: data.choices[0]?.message?.content || 'No response generated',
      reasoning_details: data.choices[0]?.message?.reasoning_details,
      usage: data.usage
    };
  } catch (error) {
    console.error('💥 Error in chatWithAI:', error);
    throw error;
  }
};

export const translateText = async (
  text: string,
  targetLang: string,
  model = 'google/gemma-2-9b-it:free'
): Promise<string> => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnifdf-ai.com',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the given text accurately while maintaining the original meaning and tone. Return only the translated text without any additional explanations or formatting.'
          },
          {
            role: 'user',
            content: `Translate the following text to ${targetLang}: "${text}"`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Translation API error:', errorText);
      throw new Error('Failed to translate text');
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || 'Translation failed.';
  } catch (error) {
    console.error('Error in translateText:', error);
    return 'Error during translation.';
  }
};

export const generateRefinedFilename = async (originalName: string, context: string): Promise<string> => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnifdf-ai.com',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-4.5-air:free',
        messages: [
          {
            role: 'system',
            content: 'You are a filename generator. Generate clean, professional, SEO-friendly filenames. Return ONLY the filename string, nothing else. Do not include markdown formatting or code blocks.'
          },
          {
            role: 'user',
            content: `Generate a clean, professional, SEO-friendly filename (extension included) for a document originally named "${originalName}". Context about content: "${context}".`
          }
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Filename generation API error:', errorText);
      return originalName;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || originalName;
  } catch (error) {
    console.error('Error in generateRefinedFilename:', error);
    return originalName;
  }
};

export const generateAudioOverview = async (text: string, voiceName: string = 'Kore'): Promise<string | null> => {
  // Note: OpenRouter doesn't support TTS, so we'll return a placeholder
  // In a real implementation, you'd use a TTS service like Eleven Labs or Google TTS
  console.log('TTS not available with OpenRouter. Text:', text, 'Voice:', voiceName);
  return null;
};

export const chatWithPDF = async (query: string, documentContext: string) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnifdf-ai.com',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-4.5-air:free',
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent PDF assistant. Help users understand and analyze their documents based on the provided context.'
          },
          {
            role: 'user',
            content: `Context of the document: ${documentContext.substring(0, 20000)}...\n\nUser Query: ${query}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PDF Chat API error:', errorText);
      return "I encountered an error analyzing the document.";
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "I couldn't process that request.";
  } catch (error) {
    console.error('Error in chatWithPDF:', error);
    return "I encountered an error analyzing the document.";
  }
};
