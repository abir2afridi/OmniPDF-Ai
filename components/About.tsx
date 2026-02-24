import React, { useContext } from 'react';
import { motion } from 'motion/react';
import { AppContext } from '../App';
import {
    Shield, Bot, Layers, Cpu, ArrowUpRight, CheckCircle2,
    FileText, Scissors, Minimize2, ShieldCheck, Wand2, Type,
    Languages, Download, Zap, PenTool, LayoutGrid, Search, Lock, UserCheck, TrendingUp
} from 'lucide-react';

export const About: React.FC = () => {
    const { t } = useContext(AppContext);

    const detailedTools = [
        {
            category: "Intelligent AI Lab",
            icon: Bot,
            description: "Next-generation cognitive processing for documents.",
            tools: [
                { name: "AI Chat & Analysis", detail: "Interact with your PDFs using RAG technology. Ask questions, extract data, and get insights instantly." },
                { name: "Global Translation", detail: "Preserve layouts while translating documents into 50+ languages with neural accuracy." },
                { name: "Smart Summarization", detail: "Condense thousands of pages into executive bullet points using context-aware LLMs." },
                { name: "Voice Synthesis", detail: "Convert document text into natural-sounding speech for hands-free consumption." }
            ]
        },
        {
            category: "PDF Orchestration",
            icon: Layers,
            description: "Precision tools for document structure management.",
            tools: [
                { name: "Advanced Merger", detail: "Combine multiple PDFs, images, and Office docs into a single, optimized file." },
                { name: "Precision Splitter", detail: "Extract specific ranges, split by size, or separate every page with one click." },
                { name: "Smart Compression", detail: "Drastically reduce file size while maintaining high-fidelity visual quality." },
                { name: "OCR Engine Level 4", detail: "Transform scanned images and non-selectable PDFs into fully searchable, editable text." }
            ]
        },
        {
            category: "Universal Converter",
            icon: Cpu,
            description: "Seamless format transformation with zero data loss.",
            tools: [
                { name: "Office to PDF", detail: "Convert Word (DOCX), Excel (XLSX), and PowerPoint (PPTX) with 1:1 layout retention." },
                { name: "PDF to Editable", detail: "Reverse engineer PDFs back into editable Word or Excel sheets for data manipulation." },
                { name: "Image Pipeline", detail: "Convert PDFs to high-resolution JPG/PNG or transform photos into professional PDFs." },
                { name: "HTML/Web to PDF", detail: "Capture entire web pages or HTML strings into perfectly formatted PDF documents." }
            ]
        },
        {
            category: "Enterprise Security",
            icon: Shield,
            description: "Military-grade protection and legal compliance.",
            tools: [
                { name: "E-Sign & Request", detail: "Sign documents biometrically or send requests to multiple parties for secure execution." },
                { name: "Password & Encryption", detail: "Apply AES-256 bit encryption and manage user permissions for opening/printing." },
                { name: "Redaction Tool", detail: "Permanently scrub sensitive information from documents before sharing." },
                { name: "Watermark & Stamp", detail: "Add dynamic, transparent watermarks or professional stamps for brand identity." }
            ]
        }
    ];

    return (
        <div className="flex-1 bg-[#f3f1ea] dark:bg-slate-900 h-full overflow-y-auto custom-scrollbar p-6 md:p-12 transition-colors duration-300">
            <div className="max-w-5xl mx-auto space-y-32 py-10 md:py-20">
                {/* Brand Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-brand-500 rounded-[1.25rem] flex items-center justify-center text-white font-black text-2xl shadow-2xl shadow-brand-500/30">
                            OP
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-[0.5em] text-brand-500">OmniPDF AI Suite</div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400">Documentation & Feature Guide / v2.4.0</div>
                        </div>
                    </div>
                    <h1 className="text-6xl md:text-9xl font-black tracking-tighter text-gray-900 dark:text-white leading-[0.8]">
                        Technical <br />
                        <span className="text-transparent border-b-4 border-brand-500" style={{ WebkitTextStroke: '2px currentColor' }}>Capability.</span>
                    </h1>
                </motion.div>

                {/* Live System Ticker */}
                <div className="overflow-hidden whitespace-nowrap border-y border-gray-200 dark:border-white/5 py-4 bg-white/30 dark:bg-white/2">
                    <motion.div
                        initial={{ x: 0 }}
                        animate={{ x: "-50%" }}
                        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                        className="flex items-center gap-12 w-fit px-12"
                    >
                        {[
                            "SYSTEM STATUS: OPTIMAL",
                            "AI CAPACITY: NEURAL LEVEL 4",
                            "LATENCY: 1.2S",
                            "ENCRYPTION: AES-256 BIT",
                            "OCR PRECISION: 99.98%",
                            "MODELS: GPT-4.0 OPS",
                            "INFRASTRUCTURE: DISTRIBUTED",
                            "SYSTEM STATUS: OPTIMAL",
                            "AI CAPACITY: NEURAL LEVEL 4",
                            "LATENCY: 1.2S",
                            "ENCRYPTION: AES-256 BIT",
                            "OCR PRECISION: 99.98%",
                            "MODELS: GPT-4.0 OPS",
                            "INFRASTRUCTURE: DISTRIBUTED"
                        ].map((text, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-900 dark:text-white">
                                    {text}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* Detailed Feature Sections */}
                <div className="space-y-40">
                    {detailedTools.map((section, sIdx) => (
                        <motion.section
                            key={sIdx}
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true, margin: "-100px" }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-12"
                        >
                            <div className="lg:col-span-4 space-y-6">
                                <div className="w-16 h-16 rounded-3xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center shadow-xl">
                                    <section.icon className="w-8 h-8" />
                                </div>
                                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{section.category}</h2>
                                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg leading-relaxed">
                                    {section.description}
                                </p>
                            </div>

                            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
                                {section.tools.map((tool, tIdx) => (
                                    <motion.div
                                        key={tIdx}
                                        initial={{ opacity: 0, x: 20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        transition={{ delay: tIdx * 0.1 }}
                                        viewport={{ once: true }}
                                        className="group space-y-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white group-hover:text-brand-500 transition-colors">
                                                {tool.name}
                                            </h3>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-medium pl-4 border-l border-gray-100 dark:border-white/5 group-hover:border-brand-500/30 transition-colors">
                                            {tool.detail}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>
                    ))}
                </div>

                {/* Infrastructure Highlight */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="p-12 md:p-20 rounded-[4rem] bg-gray-900 text-white relative overflow-hidden"
                >
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                        <div className="space-y-6">
                            <h2 className="text-4xl font-black leading-tight">Built for <span className="text-brand-400">Industrial</span> Scale.</h2>
                            <p className="text-gray-400 text-lg font-medium leading-relaxed">
                                Our backend infrastructure utilizes distributed processing clusters to ensure that whether you're converting one page or ten thousand, the performance remains consistent.
                            </p>
                            <div className="flex flex-wrap gap-4 pt-4">
                                <div className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">Distributed GPU Cloud</div>
                                <div className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">Edge Node Processing</div>
                                <div className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">AES-GCM Encryption</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            {[
                                { label: "Average Latency", val: "1.2s" },
                                { label: "Success Rate", val: "99.98%" },
                                { label: "Daily Tasks", val: "250K+" },
                                { label: "AI Precision", val: "Level 4" }
                            ].map((stat, i) => (
                                <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                                    <p className="text-[9px] font-black text-brand-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                    <p className="text-2xl font-black">{stat.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Deep Technical Footer */}
                <div className="pt-20 border-t border-gray-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">All Systems Operational</span>
                        </div>
                        <p className="text-[9px] font-bold text-gray-400 max-w-xs leading-relaxed uppercase tracking-widest">
                            OmniPDF AI Suite is a trademark of Omni Labs Inc. Designed and engineered for high-availability document environments.
                        </p>
                    </div>
                    <div className="flex gap-12 text-[10px] font-black uppercase tracking-widest text-gray-900 dark:text-white">
                        <a href="#" className="hover:text-brand-500 transition-colors">API Docs</a>
                        <a href="#" className="hover:text-brand-500 transition-colors">Open Source</a>
                        <a href="#" className="hover:text-brand-500 transition-colors">Security Audit</a>
                    </div>
                </div>
            </div>
        </div >
    );
};
