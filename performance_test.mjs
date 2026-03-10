import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsagndlatqwzzsjqbqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWduZGxhdHF3enpzanFicXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0MzQzNH0.f0zYG2T4kSjoTk9zO5Jv_NB4mdq7QHy5egB6HhCeQWo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function performanceTest() {
  console.log('🚀 AI Performance Enhancement Test\n');

  const testCases = [
    { query: 'hello', description: 'Cached greeting (instant)', expected: 'instant' },
    { query: 'What can you do?', description: 'Cached help request (instant)', expected: 'instant' },
    { query: 'Explain how PDF compression works', description: 'New technical query (AI response)', expected: 'ai' }
  ];

  let totalTime = 0;
  let instantCount = 0;
  let aiCount = 0;

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
      totalTime += responseTime;

      if (error) {
        console.log(`❌ ${testCase.description}: ${responseTime}ms - ERROR`);
      } else {
        const isCached = data?.usage?.cached;
        const responseType = isCached ? '⚡ INSTANT' : '🤖 AI';

        if (isCached) instantCount++;
        else aiCount++;

        console.log(`${responseType} ${testCase.description}: ${responseTime}ms - ${data?.message?.length || 0} chars`);
      }
    } catch (err) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      totalTime += responseTime;
      console.log(`💥 ${testCase.description}: ${responseTime}ms - EXCEPTION`);
    }

    // Brief pause between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Performance Results:');
  console.log(`Total response time: ${totalTime}ms`);
  console.log(`Average response time: ${(totalTime / testCases.length).toFixed(0)}ms`);
  console.log(`Instant responses: ${instantCount}`);
  console.log(`AI responses: ${aiCount}`);
  console.log(`Performance improvement: ~${((6901 - (totalTime / testCases.length)) / 6901 * 100).toFixed(0)}% faster than baseline`);
}

performanceTest();
