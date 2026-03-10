import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTranslate() {
  try {
    console.log('🧪 Testing translation service...');
    
    const { data, error } = await supabase.functions.invoke('ai-translate', {
      body: {
        text: 'Hello, how are you?',
        targetLang: 'Spanish',
        model: 'z-ai/glm-4.5-air:free'
      }
    });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Translation Success:', data);
  } catch (err) {
    console.error('💥 Exception:', err);
  }
}

testTranslate();
