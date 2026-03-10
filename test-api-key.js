// Test script to verify OpenRouter API key is working
const OPENROUTER_API_KEY = import.meta.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function testAPI() {
    console.log('🔑 Testing OpenRouter API...');
    console.log('API Key exists:', !!OPENROUTER_API_KEY);
    console.log('API Key length:', OPENROUTER_API_KEY?.length || 0);
    
    if (!OPENROUTER_API_KEY) {
        console.error('❌ API Key is missing!');
        return;
    }

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://omnipdf-ai.com',
                'X-Title': 'OmniPDF AI Test',
            },
            body: JSON.stringify({
                model: 'z-ai/glm-4.5-air:free',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Say "API is working" in response.' },
                ],
                max_tokens: 50,
                temperature: 0.3,
            }),
        });

        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', response.status, errorText);
            return;
        }

        const data = await response.json();
        console.log('✅ API Response:', data.choices?.[0]?.message?.content);
        console.log('✅ API is working correctly!');
    } catch (error) {
        console.error('❌ Network error:', error);
    }
}

testAPI();
