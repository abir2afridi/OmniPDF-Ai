/**
 * ChatPDF.tsx — AI Chat with PDF
 *
 * Cyan/teal brand · Streaming responses · Source citations
 * Upload → Ingest → Chat conversational loop
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    MessageSquare, Upload, FileText, Send, X, Copy, Check,
    Download, Trash2, Loader2, ArrowLeft, Sparkles, BookOpen,
    ListChecks, HelpCircle, BarChart3, Lightbulb, ChevronDown,
    StopCircle, RefreshCw,
} from 'lucide-react';
import {
    ChatMessage, ChunkSource, IndexedDocument,
    validateChatFile, ingestDocument, streamChat,
    exportConversation, queryCache,
} from '../services/chatPdfService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props { onBack?: () => void; }
interface Toast { id: string; type: 'success' | 'error' | 'info'; msg: string; }
type Phase = 'upload' | 'processing' | 'ready';

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const QUICK_ACTIONS = [
    { label: 'Summarize', icon: BookOpen, query: 'Provide a comprehensive summary of this entire document.' },
    { label: 'Key Points', icon: ListChecks, query: 'What are the key points and main arguments in this document?' },
    { label: 'FAQ', icon: HelpCircle, query: 'Generate a list of frequently asked questions about this document with answers.' },
    { label: 'Data & Stats', icon: BarChart3, query: 'What data, statistics, or numerical findings are mentioned in this document?' },
    { label: 'Explain Simply', icon: Lightbulb, query: 'Explain the most complex or technical parts of this document in simple terms.' },
];

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem: React.FC<{ t: Toast; onDismiss: () => void }> = ({ t, onDismiss }) => {
    useEffect(() => { const tid = setTimeout(onDismiss, 4000); return () => clearTimeout(tid); }, [onDismiss]);
    const bg = t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-emerald-500' : 'bg-cyan-500';
    return (
        <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }}
            className={`${bg} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 max-w-xs`}>
            <span className="flex-1">{t.msg}</span>
            <button onClick={onDismiss} className="opacity-70 hover:opacity-100"><X size={14} /></button>
        </motion.div>
    );
};

// ── Markdown Renderer ─────────────────────────────────────────────────────────

function renderMd(text: string): string {
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/20 dark:bg-black/40 rounded-lg p-3 my-2 text-xs overflow-x-auto font-mono"><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^\s*[•\-]\s+(.+)/gm, '<div class="flex gap-2 ml-2"><span class="text-cyan-500">•</span><span>$1</span></div>')
        .replace(/^\s*(\d+)\.\s+(.+)/gm, '<div class="flex gap-2 ml-2"><span class="text-cyan-500 font-semibold">$1.</span><span>$2</span></div>')
        .replace(/\n/g, '<br/>');
}

// ── Main Component ────────────────────────────────────────────────────────────

export const ChatPDF: React.FC<Props> = ({ onBack }) => {
    const [phase, setPhase] = useState<Phase>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [doc, setDoc] = useState<IndexedDocument | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [progress, setProgress] = useState({ pct: 0, stage: '' });
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const toast = useCallback((type: Toast['type'], msg: string) => {
        setToasts(p => [...p, { id: uid(), type, msg }]);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isStreaming]);

    // ── File handling ─────────────────────────────────────────────────────────

    const handleFile = useCallback(async (f: File) => {
        const err = validateChatFile(f);
        if (err) { toast('error', err); return; }
        setFile(f);
        setPhase('processing');
        setProgress({ pct: 0, stage: 'Starting…' });

        try {
            const indexed = await ingestDocument(f, (pct, stage) => setProgress({ pct, stage }));
            setDoc(indexed);
            setMessages([{
                id: 'welcome', role: 'assistant',
                content: `I've analyzed **${indexed.filename}** — ${indexed.pageCount} pages, ${indexed.wordCount.toLocaleString()} words, ${indexed.chunkCount} indexed sections (${indexed.extractMethod.toUpperCase()}).\n\nAsk me anything about this document, or try a quick action below!`,
                timestamp: Date.now(),
            }]);
            setPhase('ready');
            toast('success', 'Document indexed and ready for chat!');
            setTimeout(() => inputRef.current?.focus(), 300);
        } catch (e: any) {
            toast('error', e.message || 'Failed to process document.');
            setPhase('upload');
        }
    }, [toast]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    }, [handleFile]);

    const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
    }, [handleFile]);

    // ── Send message ──────────────────────────────────────────────────────────

    const sendMessage = useCallback(async (query?: string) => {
        const q = (query || input).trim();
        if (!q || !doc || isStreaming) return;
        setInput('');

        const userMsg: ChatMessage = { id: uid(), role: 'user', content: q, timestamp: Date.now() };
        const aiMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };

        setMessages(p => [...p, userMsg, aiMsg]);
        setIsStreaming(true);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        await streamChat(
            q, doc, messages,
            (token) => {
                setMessages(p => {
                    const copy = [...p];
                    const last = copy[copy.length - 1];
                    if (last && last.role === 'assistant') {
                        copy[copy.length - 1] = { ...last, content: last.content + token };
                    }
                    return copy;
                });
            },
            (sources) => {
                setMessages(p => {
                    const copy = [...p];
                    const last = copy[copy.length - 1];
                    if (last && last.role === 'assistant') {
                        copy[copy.length - 1] = { ...last, sources };
                    }
                    return copy;
                });
            },
            () => {
                setMessages(p => {
                    const copy = [...p];
                    const last = copy[copy.length - 1];
                    if (last) copy[copy.length - 1] = { ...last, isStreaming: false };
                    return copy;
                });
                setIsStreaming(false);
                abortRef.current = null;
            },
            (err) => {
                toast('error', err);
                setMessages(p => {
                    const copy = [...p];
                    const last = copy[copy.length - 1];
                    if (last && last.role === 'assistant') {
                        copy[copy.length - 1] = { ...last, content: `⚠️ ${err}`, isStreaming: false };
                    }
                    return copy;
                });
                setIsStreaming(false);
            },
            ctrl.signal,
        );
    }, [input, doc, messages, isStreaming, toast]);

    const stopStreaming = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    const copyText = useCallback((text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    const clearChat = useCallback(() => {
        if (!doc) return;
        queryCache.clear();
        setMessages([{
            id: 'welcome', role: 'assistant',
            content: `Chat cleared. I still have **${doc.filename}** loaded. Ask me anything!`,
            timestamp: Date.now(),
        }]);
    }, [doc]);

    const newDocument = useCallback(() => {
        queryCache.clear();
        setPhase('upload'); setFile(null); setDoc(null); setMessages([]); setInput('');
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }, [sendMessage]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 relative overflow-hidden">
            {/* Toasts */}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
                <AnimatePresence>
                    {toasts.map(t => <ToastItem key={t.id} t={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} />)}
                </AnimatePresence>
            </div>

            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shrink-0">
                {onBack && (
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <ArrowLeft size={18} className="text-gray-500" />
                    </button>
                )}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <MessageSquare size={16} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">Chat with PDF</h1>
                        {doc && <p className="text-[10px] text-gray-500 dark:text-gray-400">{doc.filename} · {doc.pageCount}p · {doc.chunkCount} chunks</p>}
                    </div>
                </div>
                <div className="flex-1" />
                {phase === 'ready' && (
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => exportConversation(messages, doc?.filename || 'document')}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500" title="Export chat">
                            <Download size={16} />
                        </button>
                        <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500" title="Clear chat">
                            <Trash2 size={16} />
                        </button>
                        <button onClick={newDocument} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors">
                            New PDF
                        </button>
                    </div>
                )}
            </header>

            {/* ── Upload Phase ──────────────────────────────────────────────── */}
            {phase === 'upload' && (
                <div className="flex-1 flex items-center justify-center p-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-lg">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/25">
                                <MessageSquare size={28} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Chat with your PDF</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Upload a document and ask questions. AI-powered answers with page references.</p>
                        </div>

                        <label
                            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={onDrop}
                            className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
                                ${isDragOver
                                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 scale-[1.02]'
                                    : 'border-gray-300 dark:border-gray-700 hover:border-cyan-400 dark:hover:border-cyan-600 bg-white dark:bg-gray-900 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30'
                                }`}
                        >
                            <input type="file" accept=".pdf" className="hidden" onChange={onFileInput} />
                            <Upload size={32} className={`mx-auto mb-3 ${isDragOver ? 'text-cyan-500' : 'text-gray-400'}`} />
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Drop your PDF here or click to browse</p>
                            <p className="text-xs text-gray-400">PDF files up to 50 MB</p>
                        </label>

                        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                            {[
                                { icon: '🔍', label: 'Smart Search', desc: 'BM25 retrieval' },
                                { icon: '📄', label: 'Page Refs', desc: 'Source citations' },
                                { icon: '⚡', label: 'Streaming', desc: 'Real-time answers' },
                            ].map(f => (
                                <div key={f.label} className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                                    <div className="text-lg mb-1">{f.icon}</div>
                                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{f.label}</div>
                                    <div className="text-[10px] text-gray-400">{f.desc}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* ── Processing Phase ─────────────────────────────────────────── */}
            {phase === 'processing' && (
                <div className="flex-1 flex items-center justify-center p-6">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md text-center">
                        <Loader2 size={40} className="mx-auto mb-4 text-cyan-500 animate-spin" />
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Analyzing Document</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{file?.name}</p>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 mb-2 overflow-hidden">
                            <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                                initial={{ width: 0 }} animate={{ width: `${progress.pct}%` }} transition={{ duration: 0.3 }} />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{progress.stage} ({progress.pct}%)</p>
                    </motion.div>
                </div>
            )}

            {/* ── Chat Phase ───────────────────────────────────────────────── */}
            {phase === 'ready' && (
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        <AnimatePresence initial={false}>
                            {messages.map((m) => (
                                <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] md:max-w-[70%] ${m.role === 'user'
                                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                                        : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm'
                                        }`}>
                                        {m.role === 'assistant' ? (
                                            <>
                                                <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed [&_pre]:my-2 [&_code]:text-cyan-600 dark:[&_code]:text-cyan-400 [&_strong]:text-gray-900 dark:[&_strong]:text-white"
                                                    dangerouslySetInnerHTML={{ __html: renderMd(m.content || '') }} />
                                                {m.isStreaming && (
                                                    <span className="inline-flex gap-1 mt-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </span>
                                                )}
                                                {/* Sources */}
                                                {!m.isStreaming && m.sources && m.sources.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">📌 Sources</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {[...new Set<number>(m.sources.flatMap(s => {
                                                                const arr: number[] = [];
                                                                for (let p = s.pageStart; p <= s.pageEnd; p++) arr.push(p);
                                                                return arr;
                                                            }))].sort((a, b) => a - b).map(p => (
                                                                <span key={p} className="px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-900/30 text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
                                                                    Page {p}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Copy button */}
                                                {!m.isStreaming && m.content && m.id !== 'welcome' && (
                                                    <div className="mt-2 flex gap-1">
                                                        <button onClick={() => copyText(m.content, m.id)}
                                                            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-500 transition-colors">
                                                            {copiedId === m.id ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-sm leading-relaxed">{m.content}</p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Quick Actions — show after welcome only */}
                        {messages.length === 1 && !isStreaming && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                                className="flex flex-wrap gap-2 justify-center pt-2">
                                {QUICK_ACTIONS.map(a => (
                                    <button key={a.label} onClick={() => sendMessage(a.query)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-cyan-400 dark:hover:border-cyan-600 hover:text-cyan-600 dark:hover:text-cyan-400 hover:shadow-sm transition-all">
                                        <a.icon size={14} />
                                        {a.label}
                                    </button>
                                ))}
                            </motion.div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3">
                        <div className="max-w-3xl mx-auto flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask a question about your document…"
                                rows={1}
                                className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all max-h-32"
                                style={{ minHeight: '40px' }}
                                disabled={isStreaming}
                            />
                            {isStreaming ? (
                                <button onClick={stopStreaming}
                                    className="shrink-0 w-10 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors">
                                    <StopCircle size={18} />
                                </button>
                            ) : (
                                <button onClick={() => sendMessage()}
                                    disabled={!input.trim()}
                                    className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-all">
                                    <Send size={18} />
                                </button>
                            )}
                        </div>
                        <p className="text-center text-[10px] text-gray-400 mt-1.5">
                            AI answers are based on document content. Verify critical information.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

export default ChatPDF;
