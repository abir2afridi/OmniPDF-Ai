
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log('🚀 Testing z-ai/glm-4.5-air:free via Edge Function...');
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseKey
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'Say hello' }],
            model: 'z-ai/glm-4.5-air:free'
        })
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response Body:', text);
}

test();
