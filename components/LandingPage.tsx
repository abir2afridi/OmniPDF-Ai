import React from 'react';
import {
    Shield, Zap, Globe, Cpu, Check,
    ArrowRight, FileText, Lock, Bot,
    Layers, Download, Star, ChevronRight, Wand2
} from 'lucide-react';
import { motion } from 'motion/react';

interface LandingPageProps {
    onStart: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
    return (
        <div className="flex-1 bg-[#f3f1ea] dark:bg-[#0f0f1a] overflow-y-auto custom-scrollbar">
            {/* Hero Section */}
            <section className="relative pt-20 pb-32 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 text-brand-600 dark:text-brand-300 text-sm font-bold mb-8"
                    >
                        <Star className="w-4 h-4 fill-current" />
                        <span>Trusted by 2M+ Professionals Worldwide</span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-6xl md:text-8xl font-black mb-8 tracking-tight text-gray-900 dark:text-white leading-[1.1]"
                    >
                        Master Your Documents <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 dark:from-brand-400 dark:via-indigo-400 dark:to-purple-400">With Next-Gen AI</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed"
                    >
                        OmniPDF is the all-in-one AI suite to edit, convert, and secure your documents.
                        Local-first security, pixel-perfect editing, and intelligent document analysis.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <button
                            onClick={onStart}
                            className="px-10 py-5 bg-brand-600 text-white rounded-2xl text-lg font-black shadow-2xl shadow-brand-500/30 hover:bg-brand-500 hover:-translate-y-1 transition-all flex items-center gap-3 group"
                        >
                            Get Started for Free
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button className="px-10 py-5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white rounded-2xl text-lg font-bold hover:bg-gray-50 dark:hover:bg-white/10 transition-all">
                            Watch Demo
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Feature Grid */}
            <section className="py-24 bg-[#f3f1ea] dark:bg-[#161625]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold dark:text-white mb-4">Powerful Tools for Every Workflow</h2>
                        <p className="text-gray-500 dark:text-gray-400">Everything you need to manage your documents in one unified platform.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            { icon: Wand2, title: 'AI Intelligence', desc: 'Summarize long documents, rewrite text, and chat with your PDFs using Gemini Pro.', color: 'text-purple-500', bg: 'bg-purple-500/10' },
                            { icon: Lock, title: 'Military-Grade Security', desc: 'Encrypt your documents with AES-256 and process everything locally for maximum privacy.', color: 'text-blue-500', bg: 'bg-blue-500/10' },
                            { icon: Cpu, title: 'OCR Processing', desc: 'Transform scanned documents into searchable, editable text with proprietary OCR technology.', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { icon: Layers, title: 'Unified Workspace', desc: 'Merge, split, and organize pages with an intuitive drag-and-drop interface.', color: 'text-orange-500', bg: 'bg-orange-500/10' },
                            { icon: Globe, title: 'Global Translation', desc: 'Instantly translate complex legal and technical documents into over 100 languages.', color: 'text-brand-500', bg: 'bg-brand-500/10' },
                            { icon: Zap, title: 'Lightning Speed', desc: 'Processed and optimized for speed. Handle massive documents in seconds, not minutes.', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                        ].map((f, i) => (
                            <motion.div
                                whileHover={{ y: -10 }}
                                key={i}
                                className="p-8 bg-white dark:bg-[#1e1e2e] rounded-3xl border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-xl transition-all"
                            >
                                <div className={`w-14 h-14 rounded-2xl ${f.bg} ${f.color} flex items-center justify-center mb-6`}>
                                    <f.icon className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold dark:text-white mb-3">{f.title}</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold dark:text-white mb-4">Simple, Transparent Pricing</h2>
                        <p className="text-gray-500 dark:text-gray-400">Choose the plan that fits your professional needs.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {/* Free Plan */}
                        <div className="p-10 bg-white dark:bg-[#1e1e2e] rounded-3xl border border-gray-200 dark:border-white/5 shadow-sm">
                            <h3 className="text-xl font-bold dark:text-white mb-2">Free</h3>
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-black dark:text-white">$0</span>
                                <span className="text-gray-500 font-medium">/month</span>
                            </div>
                            <ul className="space-y-4 mb-8">
                                {[
                                    'Up to 5MB file size',
                                    'Basic PDF Converter',
                                    'Merge & Split tools',
                                    'Community Support'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                                        <Check className="w-4 h-4 text-emerald-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <button className="w-full py-4 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all">
                                Sign Up Free
                            </button>
                        </div>

                        {/* Pro Plan */}
                        <div className="p-10 bg-white dark:bg-[#1e1e2e] rounded-3xl border-2 border-brand-500 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 px-4 py-1 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-bl-xl">Most Popular</div>
                            <h3 className="text-xl font-bold dark:text-white mb-2">Pro</h3>
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-black dark:text-white">$19</span>
                                <span className="text-gray-500 font-medium">/month</span>
                            </div>
                            <ul className="space-y-4 mb-8">
                                {[
                                    'Unlimited file size',
                                    'Full AI Suite (Gemini Pro)',
                                    'Advanced OCR & Redaction',
                                    'Priority 24/7 Support',
                                    'Custom E-Signatures'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-sm text-gray-900 dark:text-gray-200">
                                        <Check className="w-4 h-4 text-brand-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <button className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-500 transition-all">
                                Get Pro Access
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-20 border-t border-gray-100 dark:border-white/5">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white font-black">OP</div>
                        <span className="text-xl font-bold dark:text-white">OmniPDF</span>
                    </div>
                    <div className="flex gap-8 text-sm font-medium text-gray-500">
                        <a href="#" className="hover:text-brand-500">Privacy Policy</a>
                        <a href="#" className="hover:text-brand-500">Terms of Service</a>
                        <a href="#" className="hover:text-brand-500">API Documentation</a>
                        <a href="#" className="hover:text-brand-500">Contact Us</a>
                    </div>
                    <div className="text-sm text-gray-400">
                        © 2024 OmniPDF AI Suite. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};
