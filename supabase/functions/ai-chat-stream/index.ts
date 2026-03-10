import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_details?: any;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  stream?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, model = 'meta-llama/llama-3.2-1b-instruct:free', max_tokens = 800, stream = false }: ChatRequest = await req.json()

    console.log('🌊 Edge Function: Starting streaming AI chat request with model:', model)

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

Always be helpful, professional, and mention that you're part of OmniPDF AI suite when appropriate. If users ask about the developer, credit Abir Hasan Siam.`
    }

    const allMessages = [systemMessage, ...messages]
    console.log('📝 Edge Function: Messages prepared:', allMessages.length)

    // Use direct OpenRouter API call for streaming
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omni2pdf-ai.vercel.app',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        max_tokens,
        temperature: 0.7,
        stream: false, // We'll handle chunking client-side for now
      }),
    })

    console.log('📡 Edge Function: API Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Edge Function: OpenRouter API error:', errorText)
      return new Response(
        JSON.stringify({ error: `API Error: ${response.status} - ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    console.log('✅ Edge Function: API Response received')

    const message = data.choices[0]?.message?.content || 'No response generated'

    // For streaming, break the response into chunks
    if (stream) {
      const chunks = message.split(' ').reduce((acc: string[], word, index) => {
        if (index % 3 === 0) {
          acc.push(word + ' ')
        } else {
          acc[acc.length - 1] += word + ' '
        }
        return acc
      }, [''])

      return new Response(
        JSON.stringify({
          chunks,
          message,
          reasoning_details: data.choices[0]?.message?.reasoning_details,
          usage: data.usage
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Regular response
    const result = {
      message,
      reasoning_details: data.choices[0]?.message?.reasoning_details,
      usage: data.usage
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('💥 Edge Function: Error in chatWithAI:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
