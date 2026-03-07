/**
 * ExplainDocument.tsx — AI-Powered Document Explanation
 * 
 * Side-by-side layout:
 * [ Left: Document Viewer ] | [ Right: AI Analysis Panel ]
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    BookOpen, Sparkles, FileText, ChevronRight, MessageSquare,
    Lightbulb, HelpCircle, ListChecks, ArrowLeft, Download,
    Languages, Volume2, Copy, Check, Loader2, Search,
    GraduationCap, Briefcase, Zap, Info, Play, Pause
} from 'lucide-react';
import {
    extractDocumentText, analyzeDocument, quickExplain,
    ExplanationMode, DocumentInfo, ExplanationResult
} from '../services/explainService';

interface Props {
    onBack?: () => void;
}

export const ExplainDocument: React.FC<Props> = ({ onBack }) => {
    const [file, setFile] = useState<File | null>(null);
    const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
    const [mode, setMode] = useState<ExplanationMode>('simple');
    const [analysis, setAnalysis] = useState<ExplanationResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [activeTab, setActiveTab] = useState<'overview' | 'concepts' | 'chat'>('overview');
    const [selectedText, setSelectedText] = useState('');
    const [quickResult, setQuickResult] = useState<string | null>(null);
    const [isQuickProcessing, setIsQuickProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatProcessing, setIsChatProcessing] = useState(false);

    const viewerRef = useRef<HTMLDivElement>(null);
    const synth = window.speechSynthesis;

    const handleChatSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || isChatProcessing || !docInfo) return;

        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsChatProcessing(true);

        try {
            const { chatWithDocument } = await import('../services/explainService');
            const response = await chatWithDocument(docInfo.text, userMsg, chatMessages);
            setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (err: any) {
            console.error(err);
            setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that question." }]);
        } finally {
            setIsChatProcessing(false);
        }
    };

    // ── Render Helpers ────────────────────────────────────────────────────────

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setIsProcessing(true);
        try {
            const info = await extractDocumentText(f, setProgress);
            setDocInfo(info);
            const res = await analyzeDocument(info.text, mode);
            setAnalysis(res);
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Failed to process document");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleModeChange = async (newMode: ExplanationMode) => {
        if (!docInfo || isProcessing) return;
        setMode(newMode);
        setIsProcessing(true);
        try {
            const res = await analyzeDocument(docInfo.text, newMode);
            setAnalysis(res);
        } catch (err: any) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Interaction ───────────────────────────────────────────────────────────

    const handleTextSelection = () => {
        const sel = window.getSelection()?.toString().trim();
        if (sel && sel.length > 10) {
            setSelectedText(sel);
        } else {
            setSelectedText('');
        }
    };

    const runQuickExplain = async (action: 'paragraph' | 'takeaways' | 'page') => {
        if (!selectedText || isQuickProcessing) return;
        setIsQuickProcessing(true);
        setQuickResult(null);
        try {
            const res = await quickExplain(selectedText, action);
            setQuickResult(res);
        } catch (err) {
            console.error(err);
        } finally {
            setIsQuickProcessing(false);
        }
    };

    const exportToPDF = async () => {
        if (!analysis || !docInfo) return;
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text('Document Explanation', 20, 20);
        doc.setFontSize(12);
        doc.text(`Source: ${docInfo.name}`, 20, 30);
        doc.text(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`, 20, 36);

        let y = 50;
        doc.setFontSize(16);
        doc.text('Executive Summary', 20, y);
        y += 10;
        doc.setFontSize(10);
        const splitSummary = doc.splitTextToSize(analysis.summary, 170);
        doc.text(splitSummary, 20, y);
        y += splitSummary.length * 5 + 10;

        doc.setFontSize(16);
        doc.text('Key Takeaways', 20, y);
        y += 10;
        doc.setFontSize(10);
        analysis.keyPoints.forEach((point, i) => {
            const splitPoint = doc.splitTextToSize(`${i + 1}. ${point}`, 170);
            doc.text(splitPoint, 20, y);
            y += splitPoint.length * 5 + 5;
        });

        doc.save(`OmniPDF_Explanation_${docInfo.name.split('.')[0]}.pdf`);
    };

    const speak = (text: string) => {
        if (isSpeaking) {
            synth.cancel();
            setIsSpeaking(false);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        synth.speak(utterance);
    };

    // ── Render Helpers ────────────────────────────────────────────────────────

    if (!docInfo && !isProcessing) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-2xl text-center"
                >
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20">
                        <BookOpen size={40} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Explain Document</h1>
                    <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
                        Upload any PDF, Word, or Text document and get a clear, AI-powered explanation tailored to your needs.
                    </p>

                    <label className="group relative block cursor-pointer">
                        <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleUpload} />
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-2xl p-12 transition-all group-hover:border-indigo-500 group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-900/10">
                            <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Drop document or click to browse</p>
                            <p className="text-sm text-gray-400 mt-2">Supports PDF, DOCX, TXT (up to 50MB)</p>
                        </div>
                    </label>

                    <div className="grid grid-cols-3 gap-4 mt-12">
                        {[
                            { icon: <Zap className="text-amber-500" />, title: 'ELI5', desc: 'Simple terms' },
                            { icon: <GraduationCap className="text-blue-500" />, title: 'Student', desc: 'Detailed study' },
                            { icon: <Briefcase className="text-purple-500" />, title: 'Pro', desc: 'Elite analysis' },
                        ].map((m, i) => (
                            <div key={i} className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-left">
                                <div className="mb-2">{m.icon}</div>
                                <div className="font-bold text-sm text-gray-900 dark:text-white">{m.title}</div>
                                <div className="text-[10px] text-gray-500">{m.desc}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        );
    }

    if (isProcessing) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-8">
                <div className="w-full max-w-md text-center">
                    <div className="relative w-24 h-24 mx-auto mb-8">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <BookOpen className="text-indigo-500 animate-pulse" size={32} />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold dark:text-white mb-2">Analyzing Document...</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">Reading pages and extracting knowledge.</p>
                    <div className="h-2 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-indigo-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs font-mono text-indigo-500 mt-3">{progress}% Completion</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#0a0a0f]">
            {/* Toolbar */}
            <header className="h-16 border-b border-gray-100 dark:border-gray-800/50 flex items-center px-4 gap-4 sticky top-0 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-md z-10">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    <ArrowLeft size={20} className="text-gray-500" />
                </button>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                        <FileText size={16} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold dark:text-white truncate max-w-[200px]">{docInfo?.name}</h2>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{docInfo?.type} Document</p>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
                    {(['simple', 'student', 'professional'] as ExplanationMode[]).map((m) => (
                        <button
                            key={m}
                            onClick={() => handleModeChange(m)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === m
                                ? 'bg-white dark:bg-gray-800 text-indigo-500 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                    ))}
                </div>

                <button
                    onClick={exportToPDF}
                    className="p-2 text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                    title="Export explanation as PDF"
                >
                    <Download size={18} />
                </button>
            </header>

            <main className="flex-1 flex overflow-hidden">
                {/* Left: Document Viewer */}
                <section className="flex-1 overflow-y-auto p-8 relative scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800" onMouseUp={handleTextSelection}>
                    <div className="max-w-3xl mx-auto space-y-6">
                        {docInfo?.pages.map((page) => (
                            <div key={page.number} className="relative group">
                                <div className="absolute -left-12 top-0 flex flex-col items-center gap-2 select-none group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] font-mono text-gray-300 dark:text-gray-700">PAGE {page.number}</span>
                                    <button
                                        onClick={() => { setSelectedText(page.text); runQuickExplain('page'); }}
                                        className="p-1.5 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-400 hover:text-indigo-500 hover:border-indigo-500 transition-all opacity-0 group-hover:opacity-100"
                                        title="Summarize this page"
                                    >
                                        <Zap size={10} />
                                    </button>
                                </div>
                                <div className="text-gray-800 dark:text-gray-300 leading-relaxed text-lg font-serif">
                                    {page.text}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Floating Context Menu */}
                    <AnimatePresence>
                        {selectedText && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-2 flex gap-1 z-50 ring-1 ring-black/5"
                            >
                                <button
                                    onClick={() => runQuickExplain('paragraph')}
                                    className="flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl transition-all"
                                >
                                    <Sparkles size={16} />
                                    <span className="text-xs font-bold">Explain This</span>
                                </button>
                                <button
                                    onClick={() => runQuickExplain('takeaways')}
                                    className="flex items-center gap-2 px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl transition-all"
                                >
                                    <ListChecks size={16} />
                                    <span className="text-xs font-bold">Takeaways</span>
                                </button>
                                <div className="w-px bg-gray-100 dark:bg-gray-800 mx-1" />
                                <button
                                    onClick={() => setSelectedText('')}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <Check size={16} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                {/* Right: AI Panel */}
                <aside className="w-[400px] border-l border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-[#0a0a0f] flex flex-col">
                    <div className="p-4 flex gap-2 border-b border-gray-100 dark:border-gray-800/50">
                        {[
                            { id: 'overview', icon: <Info size={14} />, label: 'Overview' },
                            { id: 'concepts', icon: <Lightbulb size={14} />, label: 'Concepts' },
                            { id: 'chat', icon: <MessageSquare size={14} />, label: 'Ask AI' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id as any)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === t.id
                                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 pb-24">
                        <AnimatePresence mode="wait">
                            {activeTab === 'overview' && (
                                <motion.div
                                    key="overview"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    {/* Quick Result Shadow */}
                                    {quickResult && (
                                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setQuickResult(null)} className="text-indigo-400 hover:text-indigo-600"><Check size={14} /></button>
                                            </div>
                                            <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                                                <Zap size={14} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Focus Insight</span>
                                            </div>
                                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed italic">"{quickResult}"</p>
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                <Volume2 size={12} className="text-indigo-500" /> Executive Summary
                                            </h3>
                                            <button
                                                onClick={() => speak(analysis?.summary || '')}
                                                className={`p-1.5 rounded-full ${isSpeaking ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100'} transition-colors`}
                                            >
                                                {isSpeaking ? <Pause size={12} /> : <Play size={12} />}
                                            </button>
                                        </div>
                                        <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 text-sm leading-relaxed text-gray-700 dark:text-gray-400">
                                            {analysis?.summary}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                            <ListChecks size={14} className="text-indigo-500" /> Key Takeaways
                                        </h3>
                                        <ul className="space-y-2">
                                            {analysis?.keyPoints.map((point, i) => (
                                                <motion.li
                                                    initial={{ opacity: 0, x: 10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.1 }}
                                                    key={i}
                                                    className="flex gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800"
                                                >
                                                    <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                        {i + 1}
                                                    </span>
                                                    <span className="text-xs text-gray-600 dark:text-gray-400 leading-tight">{point}</span>
                                                </motion.li>
                                            ))}
                                        </ul>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'concepts' && (
                                <motion.div
                                    key="concepts"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-4">Deep Dive Concepts</h3>
                                        <div className="space-y-3">
                                            {analysis?.concepts.map((c, i) => (
                                                <div key={i} className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-50 dark:border-gray-800/50">
                                                    <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">{c.term}</div>
                                                    <p className="text-xs text-gray-500 leading-relaxed">{c.explanation}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-4">Terminology Glossary</h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            {analysis?.definitions.map((d, i) => (
                                                <div key={i} className="p-3 bg-purple-50/30 dark:bg-purple-900/10 rounded-xl border border-purple-100/50 dark:border-purple-800/20">
                                                    <span className="font-bold text-xs text-purple-600 dark:text-purple-400">{d.term}: </span>
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">{d.definition}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'chat' && (
                                <motion.div
                                    key="chat"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="h-full flex flex-col"
                                >
                                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-hide p-2 min-h-[300px]">
                                        {chatMessages.length === 0 && (
                                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 mb-4">
                                                <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                                                    <MessageSquare size={14} />
                                                    <span className="text-xs font-bold uppercase tracking-widest">Doc-Link AI</span>
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                                    Ask me specific questions about the content above. I have the full context loaded.
                                                </p>
                                            </div>
                                        )}

                                        {chatMessages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-800 rounded-tl-none shadow-sm'
                                                    }`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}

                                        {isChatProcessing && (
                                            <div className="flex justify-start">
                                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {chatMessages.length === 0 && [
                                            "What is the main conclusion?",
                                            "Does it mention any financial risks?",
                                            "Who is the target audience?"
                                        ].map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setChatInput(q); }}
                                                className="w-full text-left p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-indigo-500 transition-all text-xs text-gray-500"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>

                                    <form onSubmit={handleChatSubmit} className="mt-4 relative">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Type your question..."
                                            disabled={isChatProcessing}
                                            className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none pr-10 disabled:opacity-50"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isChatProcessing || !chatInput.trim()}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 hover:text-indigo-600 disabled:opacity-50"
                                        >
                                            <Zap size={16} />
                                        </button>
                                    </form>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default ExplainDocument;
