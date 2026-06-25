import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  temperature?: number;
  reasoning?: { enabled: boolean };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, model = 'openrouter/free', max_tokens = 800, temperature = 0.7, reasoning = { enabled: true } }: ChatRequest = await req.json()

    console.log('🚀 Edge Function: Starting AI chat request with model:', model)

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

    // Try primary model first (openrouter/free)
    let selectedModel = model;
    let enableReasoning = reasoning.enabled;

    // If model is not specified and we have conversation history, prefer stepfun for reasoning
    if (model === 'openrouter/free' && messages.length > 1) {
      selectedModel = 'stepfun/step-3.5-flash:free';
      console.log('🎯 Using stepfun model for conversation continuity with reasoning');
    }

    // Use direct OpenRouter API call
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omni2pdf-ai.vercel.app',
        'X-Title': 'OmniPDF AI',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: allMessages,
        max_tokens,
        temperature,
        ...(enableReasoning && selectedModel === 'stepfun/step-3.5-flash:free' ? { reasoning: { enabled: true } } : {})
      }),
    })

    console.log('📡 Edge Function: API Response status:', response.status)

    if (!response.ok) {
      // If primary model fails, try the other confirmed working model
      if (selectedModel === 'openrouter/free') {
        console.log('🔄 Primary model failed, trying stepfun model...');
        const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://omni2pdf-ai.vercel.app',
            'X-Title': 'OmniPDF AI',
          },
          body: JSON.stringify({
            model: 'stepfun/step-3.5-flash:free',
            messages: allMessages,
            max_tokens,
            temperature,
            reasoning: { enabled: true }
          }),
        })

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json()
          console.log('✅ Edge Function: Fallback model successful')

          const fallbackMessage = fallbackData.choices[0]?.message || { content: 'No response generated' }

          const fallbackResult = {
            message: fallbackMessage.content,
            reasoning_details: fallbackMessage.reasoning_details,
            usage: fallbackData.usage
          }

          return new Response(
            JSON.stringify(fallbackResult),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Both models failed
      const errorText = await response.text()
      console.error('❌ Edge Function: Both models failed:', errorText)
      return new Response(
        JSON.stringify({ error: `AI service temporarily unavailable: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    console.log('✅ Edge Function: API Response received')

    const message = data.choices[0]?.message || { content: 'No response generated' }

    const result = {
      message: message.content,
      reasoning_details: message.reasoning_details,
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
