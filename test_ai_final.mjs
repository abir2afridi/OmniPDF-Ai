
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log('🚀 Invoking updated ai-chat Edge Function...');
    try {
        const { data, error } = await supabase.functions.invoke('ai-chat', {
            body: {
                messages: [{ role: 'user', content: 'Say hello in 5 words.' }],
                // Not specifying model to use the new default: google/gemini-2.0-flash-exp:free
            }
        });

        if (error) {
            console.error('❌ Error:', error);
        } else {
            console.log('✅ Success! Data:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('💥 Exception:', err);
    }
}

test();
