import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSimple() {
  try {
    console.log('🧪 Testing simple AI call...');
    
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
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

testSimple();
