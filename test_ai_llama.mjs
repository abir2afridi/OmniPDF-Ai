import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAI() {
  try {
    console.log('🧪 Testing AI service with Llama model...');
    
    const messages = [
      {
        role: 'user',
        content: 'Hello, can you help me with PDF analysis?'
      }
    ];

    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages,
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        max_tokens: 1000,
        temperature: 0.7
      }
    });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Success:', data);
  } catch (err) {
    console.error('💥 Exception:', err);
  }
}

testAI();
