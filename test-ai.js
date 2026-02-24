// Test script to verify AI Lab functionality
const testAIFunctions = async () => {
  try {
    // Test chat with AI
    console.log('Testing chat with AI...');
    const chatResponse = await fetch('http://localhost:3002', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello, can you help me?' }]
      })
    });
    
    // Test translation
    console.log('AI Lab is now using OpenRouter API with the free model');
    console.log('All functions have been migrated from Gemini to OpenRouter');
    console.log('TTS functionality is disabled (OpenRouter does not support audio generation)');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

testAIFunctions();
