import { GoogleGenAI, Modality } from "@google/genai";

// Lazy initialize client to prevent top-level crash if env var is missing
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  // Strictly check that apiKey is a non-empty string
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error("API Key is missing or invalid. Please check your environment configuration.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateRefinedFilename = async (originalName: string, context: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a clean, professional, SEO-friendly filename (extension included) for a document originally named "${originalName}". 
      Context about content: "${context}". 
      Return ONLY the filename string, nothing else. Do not include markdown formatting or code blocks.`,
    });
    return response.text?.trim() || originalName;
  } catch (error) {
    console.error("AI Naming Error:", error);
    return originalName;
  }
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following text to ${targetLang}. Maintain professional tone. Return only the translated text.
      
      Text: "${text}"`,
    });
    return response.text || "Translation failed.";
  } catch (error) {
    console.error("Translation Error:", error);
    return "Error during translation.";
  }
};

export const generateAudioOverview = async (text: string, voiceName: string = 'Kore'): Promise<string | null> => {
  try {
    const ai = getAiClient();
    // Using Gemini TTS model with specified voice
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

export const chatWithPDF = async (query: string, documentContext: string) => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an intelligent PDF assistant. 
            Context of the document: ${documentContext.substring(0, 20000)}...
            
            User Query: ${query}`,
    });
    return response.text;
  } catch (e) {
    console.error(e);
    return "I encountered an error analyzing the document.";
  }
}