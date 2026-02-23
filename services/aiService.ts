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

const OPENROUTER_API_KEY = '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';

export const chatWithAI = async (
  messages: ChatMessage[],
  model = 'arcee-ai/trinity-large-preview:free',
  max_tokens = 1000,
  temperature = 0.7,
  reasoning = { enabled: true }
): Promise<ChatResponse> => {
  try {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();
    return {
      message: data.choices[0]?.message?.content || 'No response generated',
      reasoning_details: data.choices[0]?.message?.reasoning_details,
      usage: data.usage
    };
  } catch (error) {
    console.error('Error in chatWithAI:', error);
    throw error;
  }
};

export const translateText = async (
  text: string, 
  targetLang: string,
  model = 'arcee-ai/trinity-large-preview:free'
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
