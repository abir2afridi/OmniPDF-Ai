import React, { useContext, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AppContext } from '../App';
import { Header } from './Header';
import {
    Shield, Bot, Layers, Cpu, ArrowUpRight, CheckCircle2,
    FileText, Scissors, Minimize2, ShieldCheck, Wand2, Type,
    Languages, Download, Zap, PenTool, LayoutGrid, Search, Lock, UserCheck, TrendingUp,
    Smartphone, Monitor, Apple, Globe, QrCode, Share2, ExternalLink
} from 'lucide-react';

export const About: React.FC = () => {
    const { t } = useContext(AppContext);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('desktop');

    useEffect(() => {
        const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', () => setIsInstalled(true));
        const ua = navigator.userAgent.toLowerCase();
        if (/android/.test(ua)) setPlatform('android');
        else if (/iphone|ipad/.test(ua)) setPlatform('ios');
        else setPlatform('desktop');
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setIsInstalled(true);
        setDeferredPrompt(null);
    };

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
        <div className="flex-1 bg-[#f3f1ea] dark:bg-slate-900 h-full overflow-y-auto custom-scrollbar transition-colors duration-300 flex flex-col">
            <Header icon={FileText} title="About" />
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
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
                            "APP AVAILABLE: INSTALL AS PWA NOW",
                            "LATENCY: 1.2S",
                            "ENCRYPTION: AES-256 BIT",
                            "OCR PRECISION: 99.98%",
                            "MODELS: GPT-4.0 OPS",
                            "INFRASTRUCTURE: DISTRIBUTED",
                            "SYSTEM STATUS: OPTIMAL",
                            "AI CAPACITY: NEURAL LEVEL 4",
                            "APP AVAILABLE: INSTALL AS PWA NOW",
                            "LATENCY: 1.2S",
                            "ENCRYPTION: AES-256 BIT",
                            "OCR PRECISION: 99.98%",
                            "MODELS: GPT-4.0 OPS",
                            "INFRASTRUCTURE: DISTRIBUTED"
                        ].map((text, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className={`w-1.5 h-1.5 rounded-full ${text.includes('APP AVAILABLE') ? 'bg-emerald-500 animate-pulse' : 'bg-brand-500'}`} />
                                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${text.includes('APP AVAILABLE') ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
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
                                <div className="w-16 h-16 rounded-[5px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center shadow-xl">
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
                                <div key={i} className="p-6 rounded-[5px] bg-white/5 border border-white/10 backdrop-blur-sm">
                                    <p className="text-[9px] font-black text-brand-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                    <p className="text-2xl font-black">{stat.val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Download Our App Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="space-y-12"
                >
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                            <Smartphone className="w-3.5 h-3.5 text-brand-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-600 dark:text-brand-400">Available Now</span>
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black text-gray-900 dark:text-white tracking-tight">
                            Download <span className="text-brand-500">OmniPDF AI</span>
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 font-medium text-lg max-w-2xl mx-auto">
                            Install OmniPDF AI on your device for instant access. Works as a Progressive Web App — no app store needed.
                        </p>
                    </div>

                    {/* Install Button */}
                    <div className="flex justify-center">
                        {isInstalled ? (
                            <div className="flex items-center gap-3 px-8 py-4 rounded-[5px] bg-emerald-500/10 border border-emerald-500/20">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">App Installed Successfully</span>
                            </div>
                        ) : deferredPrompt ? (
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleInstall}
                                className="flex items-center gap-3 px-10 py-4 rounded-[5px] bg-brand-500 text-white font-bold text-lg shadow-xl shadow-brand-500/30 hover:bg-brand-600 transition-colors"
                            >
                                <Download className="w-5 h-5" />
                                Install App on This Device
                            </motion.button>
                        ) : (
                            <div className="flex items-center gap-3 px-8 py-4 rounded-[5px] bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                <Globe className="w-5 h-5 text-gray-400" />
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Open in browser to install</span>
                            </div>
                        )}
                    </div>

                    {/* Platform Instructions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                icon: Smartphone,
                                title: "Android",
                                active: platform === 'android',
                                steps: [
                                    "Tap the menu (3 dots) in Chrome",
                                    "Select 'Install app' or 'Add to Home Screen'",
                                    "Confirm — OmniPDF AI is now installed!"
                                ]
                            },
                            {
                                icon: Apple,
                                title: "iOS / iPhone",
                                active: platform === 'ios',
                                steps: [
                                    "Tap the Share button (square + arrow)",
                                    "Scroll down and tap 'Add to Home Screen'",
                                    "Tap 'Add' — app icon appears on home screen"
                                ]
                            },
                            {
                                icon: Monitor,
                                title: "Desktop / Laptop",
                                active: platform === 'desktop',
                                steps: [
                                    "Click the install icon in the address bar",
                                    "Or go to menu → 'Install OmniPDF AI'",
                                    "App opens in its own window — no browser tabs"
                                ]
                            }
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                viewport={{ once: true }}
                                className={`p-8 rounded-[5px] border transition-all ${
                                    item.active
                                        ? 'bg-brand-500/5 border-brand-500/20 ring-1 ring-brand-500/10'
                                        : 'bg-white/50 dark:bg-white/[0.02] border-gray-100 dark:border-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-5">
                                    <div className={`w-10 h-10 rounded-[5px] flex items-center justify-center ${
                                        item.active
                                            ? 'bg-brand-500 text-white'
                                            : 'bg-gray-100 dark:bg-white/5 text-gray-400'
                                    }`}>
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900 dark:text-white">{item.title}</h3>
                                        {item.active && (
                                            <span className="text-[9px] font-bold text-brand-500 uppercase tracking-widest">Your Device</span>
                                        )}
                                    </div>
                                </div>
                                <ol className="space-y-3">
                                    {item.steps.map((step, j) => (
                                        <li key={j} className="flex items-start gap-3">
                                            <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-[9px] font-black text-gray-400 shrink-0 mt-0.5">{j + 1}</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed">{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </motion.div>
                        ))}
                    </div>

                    {/* App Features Strip */}
                    <div className="flex flex-wrap justify-center gap-4 pt-4">
                        {[
                            { icon: Zap, label: "Lightning Fast" },
                            { icon: ShieldCheck, label: "100% Private" },
                            { icon: Globe, label: "Works Offline" },
                            { icon: Minimize2, label: "Tiny Install Size" },
                        ].map((f, i) => (
                            <div key={i} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/60 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5">
                                <f.icon className="w-3.5 h-3.5 text-brand-500" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{f.label}</span>
                            </div>
                        ))}
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
            </div>
        </div >
    );
};
