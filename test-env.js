// Test environment variable loading
console.log('🔍 Testing environment variable loading...');
console.log('import.meta.env.OPENROUTER_API_KEY:', import.meta.env.OPENROUTER_API_KEY ? '✅ Loaded' : '❌ Missing');
console.log('import.meta.env.OPENROUTER_API_KEY length:', import.meta.env.OPENROUTER_API_KEY?.length || 0);
console.log('import.meta.env.OPENROUTER_API_KEY starts with sk-or:', import.meta.env.OPENROUTER_API_KEY?.startsWith('sk-or-') ? '✅ Correct format' : '❌ Wrong format');

// Test a simple API call
const testAPI = async () => {
    const OPENROUTER_API_KEY = import.meta.env.OPENROUTER_API_KEY;
    
    if (!OPENROUTER_API_KEY) {
        console.error('❌ API Key still missing!');
        return;
    }
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
                    { role: 'user', content: 'Say "Authentication working"' }
                ],
                max_tokens: 50,
            }),
        });
        
        console.log('📡 API Response Status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ API Success:', data.choices?.[0]?.message?.content);
        } else {
            const error = await response.text();
            console.error('❌ API Error:', response.status, error);
        }
    } catch (error) {
        console.error('❌ Network Error:', error.message);
    }
};

testAPI();
