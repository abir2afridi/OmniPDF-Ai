import React, { useState, useRef, useEffect, useContext } from 'react';
import {
    Bot, Wand2, Languages, Mic, FileText, Play, Loader2,
    Send, Copy, Volume2, RefreshCw, ArrowRight, Check, Sparkles, BrainCircuit, Zap, Globe2, Ear,
    ChevronDown, Settings
} from 'lucide-react';
import { chatWithAI, translateText, generateRefinedFilename, generateAudioOverview, chatWithPDF } from '../services/aiService';
import { AppContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
    id: string;
    role: 'user' | 'ai';
    content: string;
    timestamp: number;
}

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
const LANGUAGES = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Russian', 'Chinese', 'Japanese', 'Bangla', 'Hindi', 'Arabic'];

export interface AILabProps {
    onToolSelect?: (toolId: string) => void;
}

export const AILab: React.FC<AILabProps> = ({ onToolSelect }) => {
    const { t } = useContext(AppContext);
    const [activeTab, setActiveTab] = useState<'chat' | 'translate' | 'tts' | 'rename' | 'rewrite'>('chat');
    const [isLoading, setIsLoading] = useState(false);
    const [currentModel, setCurrentModel] = useState<string>('Auto mode active');
    const [selectedModel, setSelectedModel] = useState<'glm' | 'stepfun'>('glm');
    const [isAutoMode, setIsAutoMode] = useState<boolean>(true); // Default to auto mode

    const modelOptions = [
        { id: 'glm' as const, name: 'GLM (Fast)', fullName: 'z-ai/glm-4.5-air:free', description: 'Fast responses, general purpose' },
        { id: 'stepfun' as const, name: 'StepFun (Reasoning)', fullName: 'stepfun/step-3.5-flash:free', description: 'Advanced reasoning, conversation continuity' }
    ];

    // Intelligent model selection based on context
    const selectBestModel = (messages: any[], taskType: string = 'chat') => {
        const conversationLength = messages.length;
        const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';

        // For translation tasks, use GLM for speed
        if (taskType === 'translate') {
            return 'z-ai/glm-4.5-air:free';
        }

        // For simple greetings or basic questions, use fast model
        const simpleQueries = ['hello', 'hi', 'help', 'what can you do', 'how are you'];
        if (simpleQueries.some(query => lastMessage.includes(query))) {
            return 'z-ai/glm-4.5-air:free';
        }

        // For ongoing conversations (more than 3 exchanges), use reasoning model
        if (conversationLength > 6) { // 3 user + 3 AI messages
            return 'stepfun/step-3.5-flash:free';
        }

        // For complex questions (containing keywords), use reasoning model
        const complexKeywords = ['explain', 'analyze', 'compare', 'why', 'how', 'what if', 'reasoning', 'logic'];
        if (complexKeywords.some(keyword => lastMessage.includes(keyword))) {
            return 'stepfun/step-3.5-flash:free';
        }

        // For questions about PDFs or technical topics, use reasoning model
        const technicalTopics = ['pdf', 'document', 'file', 'convert', 'merge', 'split', 'ocr', 'extract'];
        if (technicalTopics.some(topic => lastMessage.includes(topic))) {
            return 'stepfun/step-3.5-flash:free';
        }

        // Default to fast model for general queries
        return 'z-ai/glm-4.5-air:free';
    };

    // Smart Rewrite State
    const [rewriteInput, setRewriteInput] = useState('');
    const [rewriteOutput, setRewriteOutput] = useState('');
    const [rewriteTone, setRewriteTone] = useState('Professional');
    const [rewriteLength, setRewriteLength] = useState('Maintain');

    // Chat State
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { id: '1', role: 'ai', content: 'Hello! I\'m your AI assistant for OmniPDF AI Suite. I can help you analyze documents, extract logic, or answer complex questions about your PDFs. How can I assist you today?', timestamp: Date.now() }
    ]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Translate State
    const [translateInput, setTranslateInput] = useState('');
    const [translateOutput, setTranslateOutput] = useState('');
    const [targetLang, setTargetLang] = useState('Spanish');

    // TTS State
    const [ttsInput, setTtsInput] = useState('');
    const [ttsVoice, setTtsVoice] = useState('Kore');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Rename State
    const [renameOriginal, setRenameOriginal] = useState('unnamed_document.pdf');
    const [renameContext, setRenameContext] = useState('');
    const [renameOutput, setRenameOutput] = useState('');
    const [copied, setCopied] = useState(false);

    // Scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, activeTab]);

    const handleChatSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!chatInput.trim() || isLoading) return;

        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: chatInput, timestamp: Date.now() };
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput('');
        setIsLoading(true);

        try {
            const messages = [
                {
                    role: 'system' as const,
                    content: 'You are an AI assistant for OmniPDF AI, a PDF management and analysis platform. Always be helpful, professional, and mention that you\'re part of OmniPDF AI suite when appropriate.'
                },
                ...chatHistory.slice(-10).map(msg => ({ // Keep last 10 messages for context
                    role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
                    content: msg.content
                })),
                {
                    role: 'user' as const,
                    content: chatInput
                }
            ];

            // Determine which model to use
            let modelToUse: string;
            let modelDisplayName: string;

            if (isAutoMode) {
                // Auto mode: intelligent selection
                modelToUse = selectBestModel(messages, 'chat');
                const selectedOption = modelOptions.find(m => m.fullName === modelToUse);
                modelDisplayName = `${selectedOption?.name || 'Auto'} (auto-selected)`;
            } else {
                // Manual mode: use selected model
                const selectedModelOption = modelOptions.find(m => m.id === selectedModel);
                modelToUse = selectedModelOption?.fullName || 'z-ai/glm-4.5-air:free';
                modelDisplayName = `${selectedModelOption?.name || 'GLM (Fast)'} (manual)`;
            }

            const response = await chatWithAI(messages, modelToUse);
            
            // Update current model display
            setCurrentModel(modelDisplayName);
            
            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: response.message || "I'm having difficulty processing that right now.",
                timestamp: Date.now()
            };
            setChatHistory(prev => [...prev, aiMsg]);
        } catch (err) {
            console.error('Chat error:', err);
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: `Error: ${err.message || "Network error in the lab. Please check your connection and try again."}`,
                timestamp: Date.now()
            };
            setChatHistory(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTranslate = async () => {
        if (!translateInput.trim() || isLoading) return;
        setIsLoading(true);
        try {
            // Determine which model to use for translation
            let modelToUse: string;
            let modelDisplayName: string;

            if (isAutoMode) {
                // Auto mode: always use GLM for translation (faster)
                modelToUse = 'z-ai/glm-4.5-air:free';
                modelDisplayName = 'GLM (Fast) (auto-selected for translation)';
            } else {
                // Manual mode: use selected model
                const selectedModelOption = modelOptions.find(m => m.id === selectedModel);
                modelToUse = selectedModelOption?.fullName || 'z-ai/glm-4.5-air:free';
                modelDisplayName = `${selectedModelOption?.name || 'GLM (Fast)'} (manual)`;
            }
            
            setCurrentModel(modelDisplayName);
            const result = await translateText(translateInput, targetLang, modelToUse);
            setTranslateOutput(result);
            
            // Reset display after completion
            if (isAutoMode) {
                setCurrentModel('Auto mode active');
            } else {
                const selectedOption = modelOptions.find(m => m.id === selectedModel);
                setCurrentModel(`${selectedOption?.name || 'GLM (Fast)'} (${selectedModel === 'stepfun' ? 'reasoning' : 'fast'})`);
            }
        } catch (err) {
            console.error('Translation error:', err);
            setTranslateOutput('Translation service temporarily unavailable. Please try again in a few minutes.');
            setCurrentModel('Service unavailable');
        } finally {
            setIsLoading(false);
        }
    };

    const handleTTS = async () => {
        if (!ttsInput.trim()) return;
        setIsLoading(true);
        setAudioUrl(null);
        try {
            const b64 = await generateAudioOverview(ttsInput, ttsVoice);
            if (b64) {
                setAudioUrl(`data:audio/mp3;base64,${b64}`);
            } else {
                // Show message that TTS is not available
                alert('Text-to-Speech is not available with the current AI provider. This feature requires a dedicated TTS service.');
            }
        } catch (err) {
            console.error(err);
            alert('Text-to-Speech service is currently unavailable.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRename = async () => {
        if (!renameOriginal.trim()) return;
        setIsLoading(true);
        setCopied(false);
        try {
            const res = await generateRefinedFilename(renameOriginal, renameContext || "General document context");
            setRenameOutput(res);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRewrite = async () => {
        if (!rewriteInput.trim() || isLoading) return;
        setIsLoading(true);
        try {
            const prompt = `Rewrite the following text with a ${rewriteTone} tone and ensure the length is ${rewriteLength} as compared to the original. Text: "${rewriteInput}"`;
            const messages = [
                { role: 'system' as const, content: 'You are a professional editor in the OmniPDF AI Lab. Rewrite the provided text as requested.' },
                { role: 'user' as const, content: prompt }
            ];
            const response = await chatWithAI(messages);
            setRewriteOutput(response.message || "Rewrite failed.");
        } catch (err) {
            console.error(err);
            setRewriteOutput("Service unavailable.");
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const tabs = [
        { id: 'chat', label: 'PDF Chat', icon: Bot, color: 'text-blue-500' },
        { id: 'translate', label: 'Translator', icon: Globe2, color: 'text-indigo-500' },
        { id: 'tts', label: 'Voice LAB', icon: Ear, color: 'text-purple-500' },
        { id: 'rename', label: 'Smart Name', icon: FileText, color: 'text-emerald-500' },
        { id: 'rewrite', label: 'Editor AI', icon: Sparkles, color: 'text-amber-500' },
    ];

    return (
        <div className="flex-1 bg-[#f3f1ea] dark:bg-[#020617] h-full overflow-hidden flex flex-col relative transition-colors duration-300">
            {/* Ambient Background Atmosphere */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[80px] translate-y-1/4 -translate-x-1/4" />
            </div>

            {/* Premium Live Ticker */}
            <div className="w-full bg-[#f3f1ea]/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-gray-100 dark:border-white/5 py-2.5 overflow-hidden sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto flex items-center px-6 md:px-10">
                    <div className="flex items-center gap-2 pr-4 bg-[#f3f1ea]/80 dark:bg-slate-900/80 backdrop-blur-xl z-10 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Lab Status</span>
                        <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-2" />
                    </div>

                    <div className="relative flex-1 overflow-hidden">
                        <motion.div
                            initial={{ x: "0%" }}
                            animate={{ x: "-50%" }}
                            transition={{
                                duration: 40,
                                repeat: Infinity,
                                ease: "linear"
                            }}
                            className="flex whitespace-nowrap gap-12 items-center"
                        >
                            {[1, 2].map((i) => (
                                <div key={i} className="flex gap-12 items-center">
                                    {[
                                        { label: "NEURAL ENGINE", val: "NPU 3.0 Stabilized", type: "success" },
                                        { label: "AI MODEL", val: "Gemini Pro 1.5 Ultra", type: "info" },
                                        { label: "LATENCY", val: "9.2ms Real-time", type: "warning" },
                                        { label: "QUANTIZATION", val: "INT8 High-Precision", type: "success" },
                                        { label: "SYSTEM", val: "Nodal Grid Active", type: "info" }
                                    ].map((msg, idx) => (
                                        <div key={idx} className="flex items-center gap-3">
                                            <span className="text-[9px] font-black bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/10">{msg.label}</span>
                                            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">{msg.val}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </div>

            <div className="w-full h-full max-w-[1600px] mx-auto flex flex-col relative z-10">
                {/* Seamless Integrated Header */}
                <header className="px-6 py-8 border-b border-gray-100 dark:border-white/10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-gray-900 shadow-xl">
                                <BrainCircuit className="w-7 h-7" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">AI Laboratory</h1>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Advanced Document Intelligence</p>
                            </div>
                        </div>

                        {/* Integrated Tab Bar in Header Line */}
                        <nav className="flex items-center gap-1 bg-gray-100/50 dark:bg-white/5 p-1 rounded-2xl">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                    ${activeTab === tab.id
                                            ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                >
                                    <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? tab.color : ''}`} />
                                    {t(tab.label)}
                                </button>
                            ))}
                        </nav>

                        {/* Model Indicator */}
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                            <Zap className="w-3 h-3" />
                            <span>Using: {currentModel}</span>
                        </div>

                        {/* Mode and Model Selector */}
                        <div className="flex items-center gap-2">
                            {/* Auto/Manual Mode Toggle */}
                            <button
                                onClick={() => setIsAutoMode(!isAutoMode)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                                    isAutoMode 
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                }`}
                                title={`Currently in ${isAutoMode ? 'Auto' : 'Manual'} mode. Click to switch.`}
                            >
                                {isAutoMode ? '🤖 Auto' : '🎛️ Manual'}
                            </button>

                            {/* Model Selector (only show in manual mode) */}
                            {!isAutoMode && (
                                <div className="relative">
                                    <button
                                        onClick={() => setSelectedModel(selectedModel === 'glm' ? 'stepfun' : 'glm')}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100/50 dark:bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                                        title={`Switch to ${selectedModel === 'glm' ? 'StepFun (Reasoning)' : 'GLM (Fast)'}`}
                                    >
                                        <Settings className="w-3 h-3" />
                                        <span>{selectedModel === 'glm' ? 'GLM' : 'StepFun'}</span>
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Seamless Content Area */}
                <main className="flex-1 min-h-0 relative">
                    <AnimatePresence mode="wait">
                        {activeTab === 'chat' && (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex flex-col"
                            >
                                <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6 custom-scrollbar">
                                    {chatHistory.map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] md:max-w-[70%] p-5 rounded-2xl ${msg.role === 'user'
                                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-br-none shadow-lg'
                                                : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-bl-none border border-gray-100 dark:border-white/5 shadow-sm'
                                                }`}>
                                                <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                                                <div className={`mt-2 text-[9px] font-black uppercase tracking-widest opacity-30 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                                    {msg.role === 'user' ? 'Operator' : 'AI Lab Core'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="p-6 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                                    <form onSubmit={handleChatSubmit} className="max-w-4xl mx-auto flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Ask the lab cores anything..."
                                            className="flex-1 bg-transparent border-none outline-none px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white placeholder-gray-400"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isLoading || !chatInput.trim()}
                                            className="w-12 h-12 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl flex items-center justify-center transition-all shrink-0 hover:scale-105 active:scale-95 shadow-lg"
                                        >
                                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                        </button>
                                    </form>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'translate' && (
                            <motion.div
                                key="translate"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute inset-0 p-6 md:p-10 flex flex-col h-full"
                            >
                                {/* Full Document Translation Banner */}
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-8 p-5 bg-indigo-600/10 border border-indigo-600/20 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                                            <Globe2 className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Full Document Translation</h4>
                                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-tighter">Translate entire PDF architectures while preserving structures.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onToolSelect?.('translate-pdf')}
                                        className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl shadow-indigo-600/20"
                                    >
                                        Start PDF Translation
                                    </button>
                                </motion.div>

                                <div className="flex items-center justify-center gap-6 mb-8">
                                    <div className="flex items-center gap-3 px-4 py-2 bg-[#f3f1ea] dark:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500">
                                        Source: Detect
                                    </div>
                                    <div className="w-10 h-px bg-gray-100 dark:bg-white/10" />
                                    <div className="relative group">
                                        <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-500 group-hover:scale-110 transition-transform" />
                                        <select
                                            value={targetLang}
                                            onChange={(e) => setTargetLang(e.target.value)}
                                            className="pl-10 pr-10 py-2.5 bg-[#f3f1ea] dark:bg-slate-800 border-2 border-brand-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400 outline-none hover:border-brand-500/40 transition-all cursor-pointer shadow-sm"
                                        >
                                            {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 min-h-0">
                                    <div className="flex flex-col">
                                        <div className="px-5 py-3 bg-[#f3f1ea] dark:bg-white/5 border border-b-0 border-gray-100 dark:border-white/10 rounded-t-3xl flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Input Stream</span>
                                        </div>
                                        <textarea
                                            value={translateInput}
                                            onChange={(e) => setTranslateInput(e.target.value)}
                                            placeholder="Paste document text here..."
                                            className="flex-1 resize-none bg-[#f3f1ea] dark:bg-slate-900 border border-gray-100 dark:border-white/10 rounded-b-3xl p-8 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/5 transition-all custom-scrollbar"
                                        />
                                    </div>
                                    <div className="flex flex-col relative">
                                        <div className="px-5 py-3 bg-brand-500/5 border border-b-0 border-brand-500/20 rounded-t-3xl flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-brand-500" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400">Processed Output</span>
                                            </div>
                                            {translateOutput && (
                                                <button onClick={() => copyToClipboard(translateOutput)} className="text-[9px] font-black uppercase text-brand-600 hover:scale-110 transition-transform">
                                                    {copied ? 'Success' : 'Copy'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 relative">
                                            <textarea
                                                readOnly
                                                value={translateOutput}
                                                placeholder="Result will appear here..."
                                                className="w-full h-full resize-none bg-[#f3f1ea] dark:bg-slate-900 border border-brand-500/20 rounded-b-3xl p-8 text-sm font-medium text-gray-900 dark:text-gray-300 outline-none custom-scrollbar"
                                            />
                                            {isLoading && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px] rounded-b-3xl">
                                                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-center pt-8">
                                    <button
                                        onClick={handleTranslate}
                                        disabled={isLoading || !translateInput.trim()}
                                        className="px-12 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 disabled:opacity-20"
                                    >
                                        Execute Translation
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'tts' && (
                            <motion.div
                                key="tts"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 p-10 flex flex-col items-center justify-center"
                            >
                                <div className="w-full max-w-3xl space-y-10">
                                    <div className="flex flex-col">
                                        <div className="px-6 py-3 bg-[#f3f1ea] dark:bg-white/5 border border-b-0 border-gray-100 dark:border-white/10 rounded-t-[2.5rem] flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Voice Synthesis Input</span>
                                            <Ear className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <textarea
                                            value={ttsInput}
                                            onChange={(e) => setTtsInput(e.target.value)}
                                            placeholder="Paste the target text for AI synthesis..."
                                            className="w-full h-56 resize-none bg-[#f3f1ea] dark:bg-slate-900 border border-gray-100 dark:border-white/10 rounded-b-[2.5rem] p-10 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/5 transition-all custom-scrollbar"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-[#f3f1ea]/50 dark:bg-white/5 p-5 rounded-2xl border border-gray-100 dark:border-white/10 flex items-center gap-4">
                                            <div className="w-12 h-12 bg-[#f3f1ea] dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                                                <Mic className="w-6 h-6 text-brand-500" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">Speaker Model</label>
                                                <select
                                                    value={ttsVoice}
                                                    onChange={(e) => setTtsVoice(e.target.value)}
                                                    className="w-full bg-transparent text-sm font-black text-gray-900 dark:text-white outline-none"
                                                >
                                                    {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleTTS}
                                            disabled={isLoading || !ttsInput.trim()}
                                            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-[0.98] disabled:opacity-20 flex items-center justify-center gap-3"
                                        >
                                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                            Initialize Synthesis
                                        </button>
                                    </div>

                                    {audioUrl && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-gray-900 dark:bg-slate-800 rounded-[3rem] p-8 flex items-center gap-8 shadow-2xl"
                                        >
                                            <div className="w-20 h-20 rounded-full bg-white text-gray-900 flex items-center justify-center shadow-2xl shrink-0">
                                                <Play className="w-8 h-8 fill-current ml-1" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Processing Complete — Stream Ready</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(5)].map((_, i) => <div key={i} className="w-1 h-3 bg-brand-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                                                    </div>
                                                </div>
                                                <audio controls src={audioUrl} className="w-full h-10 accent-brand-500 invert brightness-0" />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'rename' && (
                            <motion.div
                                key="rename"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 p-10 flex flex-col items-center justify-center"
                            >
                                <div className="w-full max-w-2xl bg-[#f3f1ea] dark:bg-slate-900/50 p-12 rounded-[3.5rem] border border-gray-100 dark:border-white/10 shadow-2xl shadow-gray-200/20 dark:shadow-none">
                                    <div className="flex items-center gap-5 mb-10">
                                        <div className="w-14 h-14 bg-gray-900 dark:bg-white rounded-2xl flex items-center justify-center text-white dark:text-gray-900 shadow-xl">
                                            <RefreshCw className="w-7 h-7" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter leading-none">Smart Renamer</h2>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">Semantic Filename Optimization</p>
                                        </div>
                                    </div>

                                    <div className="space-y-8 mb-10">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Original Identifier</label>
                                            <div className="relative">
                                                <FileText className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                                                <input
                                                    type="text"
                                                    value={renameOriginal}
                                                    onChange={(e) => setRenameOriginal(e.target.value)}
                                                    className="w-full bg-[#f3f1ea] dark:bg-slate-900 border border-gray-100 dark:border-white/5 rounded-[1.5rem] pl-14 pr-6 py-4 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-900/5 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Semantic Context</label>
                                            <textarea
                                                value={renameContext}
                                                onChange={(e) => setRenameContext(e.target.value)}
                                                placeholder="Provide brief context or summary of the PDF contents..."
                                                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-white/5 rounded-[1.5rem] px-6 py-5 text-sm font-medium text-gray-900 dark:text-white h-28 resize-none outline-none focus:ring-2 focus:ring-gray-900/5 transition-all custom-scrollbar"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleRename}
                                        disabled={isLoading || !renameOriginal.trim()}
                                        className="w-full py-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-20"
                                    >
                                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                        Initialize Optimization
                                    </button>

                                    <AnimatePresence>
                                        {renameOutput && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-12 p-8 bg-gray-50 dark:bg-white/5 rounded-[2.5rem] border border-gray-100 dark:border-white/10"
                                            >
                                                <div className="flex items-center justify-between mb-4 px-1">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Optimization Success</span>
                                                    <span className="text-[8px] font-bold text-gray-400">MD5: {Math.random().toString(36).substring(7)}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1 font-mono text-sm font-bold text-gray-700 dark:text-gray-200 break-all bg-white dark:bg-slate-900 p-4 rounded-xl shadow-inner-sm">
                                                        {renameOutput}
                                                    </div>
                                                    <button
                                                        onClick={() => copyToClipboard(renameOutput)}
                                                        className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                                                    >
                                                        {copied ? <Check className="w-6 h-6 text-emerald-500" /> : <Copy className="w-6 h-6 text-gray-400" />}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'rewrite' && (
                            <motion.div
                                key="rewrite"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 p-8 flex flex-col gap-8"
                            >
                                <div className="max-w-4xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-900 dark:bg-white p-5 rounded-[2rem] shadow-2xl">
                                    <div className="flex items-center gap-8">
                                        <div className="flex flex-col gap-1 px-4">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-white/50 dark:text-gray-400">Target Tone</span>
                                            <select
                                                value={rewriteTone}
                                                onChange={(e) => setRewriteTone(e.target.value)}
                                                className="bg-transparent text-xs font-black text-white dark:text-gray-900 outline-none cursor-pointer"
                                            >
                                                <option>Professional</option>
                                                <option>Creative</option>
                                                <option>Concise</option>
                                                <option>Academic</option>
                                                <option>Casual</option>
                                            </select>
                                        </div>
                                        <div className="w-px h-8 bg-white/10 dark:bg-gray-200" />
                                        <div className="flex flex-col gap-1 px-4">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-white/50 dark:text-gray-400">Scale</span>
                                            <select
                                                value={rewriteLength}
                                                onChange={(e) => setRewriteLength(e.target.value)}
                                                className="bg-transparent text-xs font-black text-white dark:text-gray-900 outline-none cursor-pointer"
                                            >
                                                <option>Maintain</option>
                                                <option>Shorter</option>
                                                <option>Longer</option>
                                            </select>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleRewrite}
                                        disabled={isLoading || !rewriteInput.trim()}
                                        className="h-14 px-10 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-[1.2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:scale-105 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-20"
                                    >
                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        Execute Process
                                    </button>
                                </div>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 min-h-0 container mx-auto px-4">
                                    <div className="flex flex-col group">
                                        <div className="px-6 py-3 bg-gray-50/80 dark:bg-white/5 border border-b-0 border-gray-100 dark:border-white/5 rounded-t-[2.5rem] flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Input Sequence</span>
                                            <div className="w-2 h-2 rounded-full bg-gray-200" />
                                        </div>
                                        <textarea
                                            value={rewriteInput}
                                            onChange={(e) => setRewriteInput(e.target.value)}
                                            placeholder="Paste document fragments here..."
                                            className="flex-1 resize-none bg-white dark:bg-slate-900 border border-gray-100 dark:border-white/10 rounded-b-[2.5rem] p-10 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/5 transition-all custom-scrollbar"
                                        />
                                    </div>
                                    <div className="flex flex-col group">
                                        <div className="px-6 py-3 bg-brand-500/5 border border-b-0 border-brand-500/10 rounded-t-[2.5rem] flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">Optimized Stream</span>
                                            <Sparkles className="w-3.5 h-3.5 text-brand-500 animate-pulse" />
                                        </div>
                                        <div className="flex-1 relative">
                                            <textarea
                                                readOnly
                                                value={rewriteOutput}
                                                placeholder="Optimized text will appear here..."
                                                className="w-full h-full resize-none bg-white dark:bg-slate-900 border border-brand-500/10 rounded-b-[2.5rem] p-10 text-sm font-medium text-gray-900 dark:text-gray-300 outline-none custom-scrollbar"
                                            />
                                            {rewriteOutput && (
                                                <button
                                                    onClick={() => copyToClipboard(rewriteOutput)}
                                                    className="absolute bottom-6 right-6 p-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all"
                                                >
                                                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};