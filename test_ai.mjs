
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQsImV4cCI6MjA4NzQyMzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log('🚀 Invoking ai-chat Edge Function...');
    try {
        const { data, error } = await supabase.functions.invoke('ai-chat', {
            body: {
                messages: [{ role: 'user', content: 'Hello, who are you?' }],
                model: 'z-ai/glm-4.5-air:free',
                max_tokens: 100,
                temperature: 0.7,
                reasoning: { enabled: true }
            }
        });

        if (error) {
            console.error('❌ Error returned from Edge Function:');
            console.error(JSON.stringify(error, null, 2));

            // Attempt to get more details if it's a response error
            if (error instanceof Error && 'context' in error) {
                console.log('Error context found');
            }
        } else {
            console.log('✅ Success! Data:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('💥 Unexpected exception:', err);
    }
}

test();
