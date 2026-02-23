import React, { useContext } from 'react';
import {
    TrendingUp, HardDrive, Zap, Clock, CreditCard,
    ArrowUpRight, ArrowDownRight, CheckCircle2,
    Download, Filter, Calendar, FileText, MoreVertical,
    ShieldCheck, Wand2, PenTool
} from 'lucide-react';
import { AppContext } from '../App';
import { motion } from 'motion/react';

export const Analytics: React.FC = () => {
    const { t } = useContext(AppContext);

    const stats = [
        { label: 'Processing Speed', value: '1.4s', trend: '-12%', trendUp: false, icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: 'Storage Usage', value: '422MB', trend: '+5%', trendUp: true, icon: HardDrive, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { label: 'AI Tokens Used', value: '2.4M', trend: '+18%', trendUp: true, icon: Zap, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        { label: 'Success Rate', value: '99.9%', trend: 'Stable', trendUp: true, icon: CheckCircle2, color: 'text-brand-500', bg: 'bg-brand-500/10' },
    ];

    const recentFiles = [
        { name: 'Q3_Financial_Summary_Final.pdf', type: 'PDF/A • OCR', date: '2 hours ago', size: '2.4 MB', status: 'Completed', icon: FileText, iconColor: 'text-blue-500' },
        { name: 'Contract_Revision_12.pdf', type: 'Signed • Encrypted', date: '5 hours ago', size: '1.1 MB', status: 'Secured', icon: ShieldCheck, iconColor: 'text-emerald-500' },
        { name: 'Marketing_Strategy_2024.pdf', type: 'AI Summary', date: 'Yesterday', size: '4.8 MB', status: 'Analyzed', icon: Wand2, iconColor: 'text-purple-500' },
        { name: 'Feedback_Report_Oct.pdf', type: 'Merge • Split', date: '2 days ago', size: '12.5 MB', status: 'Processed', icon: PenTool, iconColor: 'text-orange-500' },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-[#020617] relative scroll-smooth">
            {/* Background Blobs */}
            <div className="bg-blob -top-40 -left-40 opacity-20 dark:opacity-10 pointer-events-none" />
            <div className="bg-blob bg-blob-2 -bottom-40 -right-40 opacity-20 dark:opacity-10 pointer-events-none" />

            <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 pb-32 relative z-10 space-y-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-brand-600 rounded-2xl shadow-xl shadow-brand-500/20 text-white">
                            <TrendingUp className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">System Insight</h1>
                            <p className="text-gray-500 dark:text-gray-400 font-medium leading-tight">Live telemetry and document processing analytics</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10 transition-all">
                            <Calendar className="w-4 h-4" />
                            Last 30 Days
                        </button>
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-500 shadow-xl shadow-brand-500/20 transition-all">
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>

                {/* User Card & Plan */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="lg:col-span-2 glass-card rounded-2xl p-6 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/5 flex flex-col md:flex-row gap-6 items-center"
                    >
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-500 to-purple-600 p-1">
                                <div className="w-full h-full rounded-full bg-white dark:bg-[#1e1e2e] flex items-center justify-center overflow-hidden border-4 border-white dark:border-[#262636]">
                                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="Avatar" className="w-full h-full object-cover" />
                                </div>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 border-4 border-white dark:border-[#262636] flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Alex Riverside</h2>
                            <p className="text-brand-600 dark:text-brand-400 font-semibold">Pro Subscriber</p>
                            <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4">
                                <div className="px-4 py-2 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Member Since</p>
                                    <p className="text-sm font-semibold">Jan 2024</p>
                                </div>
                                <div className="px-4 py-2 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Total Processed</p>
                                    <p className="text-sm font-semibold">1,248 Files</p>
                                </div>
                            </div>
                        </div>
                        <div className="w-full md:w-auto">
                            <button className="w-full md:w-auto px-6 py-3 bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white font-bold hover:shadow-lg transition-all">
                                Edit Profile
                            </button>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="glass-card rounded-2xl p-6 bg-gradient-to-br from-brand-600 to-indigo-700 text-white relative overflow-hidden shadow-2xl shadow-brand-500/20"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                        <div className="relative z-10 h-full flex flex-col">
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-white/20 rounded-xl">
                                    <CreditCard className="w-6 h-6 " />
                                </div>
                                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-widest">Active</span>
                            </div>
                            <h3 className="text-xl font-bold mb-1">Pro Individual</h3>
                            <p className="text-white/70 text-sm mb-6">Billed monthly. Next payment of $19.00 on Nov 24, 2024.</p>

                            <div className="mt-auto space-y-3">
                                <button className="w-full py-3 bg-white text-brand-600 rounded-xl font-bold hover:bg-white/90 transition-all flex items-center justify-center gap-2">
                                    Upgrade Plan
                                </button>
                                <p className="text-center text-[10px] text-white/50 uppercase font-bold tracking-widest">Manage Subscription</p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Stats Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            className="glass-card rounded-2xl p-6 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/5 hover:border-brand-500/30 transition-all group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                                    <stat.icon className="w-6 h-6" />
                                </div>
                                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${stat.trendUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {stat.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {stat.trend}
                                </div>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{stat.label}</p>
                            <h4 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h4>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Bottom Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Chart Placeholder */}
                    <div className="lg:col-span-2 glass-card rounded-2xl p-6 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/5">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Processing Trends</h3>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 mr-4">
                                    <div className="w-3 h-3 rounded-full bg-brand-500" />
                                    <span className="text-xs text-gray-500 font-medium">Efficiency</span>
                                </div>
                                <select className="bg-gray-100 dark:bg-white/5 border-none rounded-lg px-3 py-1 text-xs font-bold focus:ring-0">
                                    <option>Weekly</option>
                                    <option>Monthly</option>
                                </select>
                            </div>
                        </div>

                        {/* Visual Chart Mockup */}
                        <div className="h-64 flex items-end justify-between gap-2 px-2 relative">
                            {/* Grid Lines */}
                            <div className="absolute inset-x-0 bottom-0 h-full flex flex-col justify-between pointer-events-none opacity-20">
                                {[1, 2, 3, 4].map(l => <div key={l} className="w-full h-px bg-gray-400 dark:bg-white" />)}
                            </div>

                            {[45, 60, 40, 80, 55, 90, 70, 85, 40, 60, 50, 75].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                                    className="flex-1 bg-gradient-to-t from-brand-600/80 to-brand-400 rounded-t-lg relative group"
                                >
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                        {h}% Optimized
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="flex justify-between mt-4 px-2 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                            <span>Mon</span>
                            <span>Tue</span>
                            <span>Wed</span>
                            <span>Thu</span>
                            <span>Fri</span>
                            <span>Sat</span>
                            <span>Sun</span>
                        </div>
                    </div>

                    {/* Activity List */}
                    <div className="glass-card rounded-2xl p-6 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/5 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">File History</h3>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
                                <Filter className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>

                        <div className="flex-1 space-y-4">
                            {recentFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-4 group cursor-pointer">
                                    <div className={`p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 ${file.iconColor} group-hover:scale-105 transition-transform`}>
                                        <file.icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-brand-500 transition-colors">{file.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{file.type}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                                            <span className="text-[10px] text-gray-500 dark:text-gray-400">{file.date}</span>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-all">
                                        <MoreVertical className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button className="mt-8 py-3 w-full border border-gray-200 dark:border-white/5 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
                            View Full History
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
