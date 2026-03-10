import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testOptimizedAI() {
  try {
    console.log('🧪 Testing optimized AI service...');
    
    const startTime = Date.now();
    
    const messages = [
      {
        role: 'user',
        content: 'Hello, can you help me with PDF analysis? Please be quick.'
      }
    ];

    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages,
        model: 'meta-llama/llama-3.2-1b-instruct:free',
        max_tokens: 500, // Reduced for speed
        temperature: 0.7
      }
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`✅ Success in ${responseTime}ms:`, data);
    console.log('Response length:', data?.message?.length || 0, 'characters');
  } catch (err) {
    console.error('💥 Exception:', err);
  }
}

testOptimizedAI();
