import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function benchmarkAI() {
  const testCases = [
    { query: 'Hello', description: 'Simple greeting' },
    { query: 'How can you help me with PDFs?', description: 'Help request' },
    { query: 'What is PDF?', description: 'Simple question' },
    { query: 'Explain OCR in 2 sentences', description: 'Technical question' }
  ];

  console.log('🚀 AI Response Time Benchmark\n');

  for (const testCase of testCases) {
    const startTime = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{ role: 'user', content: testCase.query }]
        }
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (error) {
        console.log(`❌ ${testCase.description}: ${responseTime}ms - ERROR: ${error.message}`);
      } else {
        console.log(`✅ ${testCase.description}: ${responseTime}ms - ${data?.message?.length || 0} chars`);
      }
    } catch (err) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      console.log(`💥 ${testCase.description}: ${responseTime}ms - EXCEPTION: ${err.message}`);
    }

    // Wait 2 seconds between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n📊 Benchmark completed!');
}

benchmarkAI();
