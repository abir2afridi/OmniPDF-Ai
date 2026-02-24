import React, { useContext } from 'react';
import {
    Plus, Search, Filter, MoreVertical,
    CheckCircle2, Clock, AlertCircle,
    Mail, Download, Share2, Printer,
    Eye, History, UserCheck, ShieldCheck
} from 'lucide-react';
import { AppContext } from '../App';
import { motion } from 'motion/react';

export const ESign: React.FC = () => {
    const { t } = useContext(AppContext);

    const requests = [
        { id: '1', title: 'Employment Contract - John Doe', status: 'Completed', date: '2024-05-20', signer: 'john.doe@email.com', urgency: 'High' },
        { id: '2', title: 'NDA - Tech Corp', status: 'Pending', date: '2024-05-19', signer: 'legal@techcorp.com', urgency: 'Medium' },
        { id: '3', title: 'Project Proposal #42', status: 'Expired', date: '2024-05-15', signer: 'client@example.com', urgency: 'Low' },
        { id: '4', title: 'Tax Forms 2023', status: 'Completed', date: '2024-05-10', signer: 'finance@hq.com', urgency: 'High' },
    ];

    const stats = [
        { label: 'Active Requests', value: '12', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'Completed', value: '48', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: 'Pending Review', value: '5', icon: Eye, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { label: 'Security Level', value: 'Highest', icon: ShieldCheck, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    ];

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f3f1ea] dark:bg-[#020617] relative scroll-smooth flex flex-col p-8">
            {/* Background Blobs */}
            <div className="bg-blob -top-40 -left-40 opacity-20 dark:opacity-10 pointer-events-none" />
            <div className="bg-blob bg-blob-2 -bottom-40 -right-40 opacity-20 dark:opacity-10 pointer-events-none" />

            <div className="max-w-7xl mx-auto w-full relative z-10 space-y-8 flex-1 flex flex-col">
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-brand-600 rounded-2xl shadow-xl shadow-brand-600/20 text-white">
                            <UserCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">E-Sign Command</h1>
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Next-generation digital agreement orchestration</p>
                        </div>
                    </div>
                    <button className="flex items-center gap-3 px-8 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-2xl shadow-brand-500/30 transition-all active:scale-95 group">
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                        New Signature Request
                    </button>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    {stats.map((stat, i) => (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
                            key={stat.label}
                            className="glass-morphism p-6 rounded-[2rem] border border-white/20 dark:border-white/5 relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <stat.icon className="w-16 h-16" />
                            </div>
                            <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center mb-6 shadow-sm`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                            <p className="text-3xl font-black dark:text-white tracking-tighter">{stat.value}</p>
                        </motion.div>
                    ))}
                </div>

                <main className="flex-1 flex flex-col glass-morphism rounded-[2.5rem] border border-white/40 dark:border-white/10 overflow-hidden shadow-2xl bg-white/40 dark:bg-white/5 backdrop-blur-3xl min-h-[500px]">
                    <div className="p-6 border-b border-gray-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-4">
                        <div className="relative flex-1 min-w-[300px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by document name, email or status..."
                                className="w-full pl-11 pr-4 py-3 bg-[#f3f1ea] dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-[#f3f1ea] dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 transition-all border border-gray-200 dark:border-white/10">
                                <Filter className="w-4 h-4" /> Filters
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-[#f3f1ea] dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 transition-all border border-gray-200 dark:border-white/10">
                                <History className="w-4 h-4" /> Export Audit Log
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-white/5 bg-[#f3f1ea]/50 dark:bg-white/5">
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Document</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recipient</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sent Date</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Urgency</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                {requests.map((doc, i) => (
                                    <motion.tr
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 + (i * 0.05) }}
                                        key={doc.id}
                                        className="group hover:bg-gray-50/80 dark:hover:bg-brand-500/5 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                                                    <Mail className="w-5 h-5 text-brand-600" />
                                                </div>
                                                <span className="text-sm font-bold dark:text-white group-hover:text-brand-600 transition-colors">{doc.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                                    {doc.signer[0].toUpperCase()}
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{doc.signer}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm
                                            ${doc.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                                    doc.status === 'Pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                                                        'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                                                {doc.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-xs text-gray-500 font-medium">{doc.date}</td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${doc.urgency === 'High' ? 'bg-red-500' : doc.urgency === 'Medium' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                                <span className="text-xs font-semibold">{doc.urgency}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-brand-500 transition-all shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-white/10" title="View Detail"><Eye className="w-4 h-4" /></button>
                                                <button className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-brand-500 transition-all shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-white/10" title="Download Audit Trail"><Download className="w-4 h-4" /></button>
                                                <button className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-brand-500 transition-all shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-white/10" title="Re-send Notification"><Share2 className="w-4 h-4" /></button>
                                                <button className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-500 transition-all shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-white/10" title="Void Request"><AlertCircle className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        <span>Showing 4 of 28 requests</span>
                        <div className="flex gap-2">
                            <button className="px-3 py-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:text-brand-500 transition-colors">Prev</button>
                            <button className="px-3 py-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:text-brand-500 transition-colors">Next</button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};
