import React, { useContext, useState, useEffect, useCallback } from 'react';
import {
  History as HistoryIcon, Search, FileText, Trash2, Filter,
  TrendingUp, Clock, ShieldCheck, Loader2
} from 'lucide-react';
import { AppContext } from '../App';
import { Header } from './Header';
import { motion, AnimatePresence } from 'motion/react';
import { getUserHistory, deleteHistoryEntry, HistoryEntry } from '../services/historyService';

interface HistoryProps {
  userId?: string;
}

export const History: React.FC<HistoryProps> = ({ userId }) => {
  const { t } = useContext(AppContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [downloads, setDownloads] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!userId) {
      setDownloads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const entries = await getUserHistory(userId);
    setDownloads(entries);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (entryId: string) => {
    await deleteHistoryEntry(entryId);
    setDownloads(prev => prev.filter(d => d.id !== entryId));
  };

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredDownloads = downloads.filter(d =>
    d.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.toolName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#f3f1ea] dark:bg-[#020617] h-full overflow-y-auto custom-scrollbar relative transition-colors duration-300">
      {/* Ambient background atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] translate-y-1/4 -translate-x-1/4" />
      </div>

      <Header icon={HistoryIcon} title="History" />

      {/* Premium Live Ticker */}
      <div className="w-full bg-[#f3f1ea]/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-gray-100 dark:border-white/5 py-2.5 overflow-hidden sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center px-6 md:px-10">
          <div className="flex items-center gap-2 pr-4 bg-[#f3f1ea]/80 dark:bg-slate-900/80 backdrop-blur-xl z-10 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">History Core</span>
            <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-2" />
          </div>

          <div className="relative flex-1 overflow-hidden">
            <motion.div
              initial={{ x: "0%" }}
              animate={{ x: "-50%" }}
              transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
              className="flex whitespace-nowrap gap-12 items-center"
            >
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-12 items-center text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-[5px] border border-gray-200 dark:border-white/10">
                    <ShieldCheck className="w-3 h-3 text-brand-500" /> DATA PERSISTENCE: {downloads.length} ENTRIES
                  </span>
                  <span className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-[5px] border border-gray-200 dark:border-white/10">
                    <Clock className="w-3 h-3 text-indigo-500" /> RETENTION: 7 DAYS ACTIVE
                  </span>
                  <span className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-[5px] border border-gray-200 dark:border-white/10">
                    <TrendingUp className="w-3 h-3 text-emerald-500" /> QUEUE: 0 ITEMS PENDING
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-12 md:py-16 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-16">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-sm mb-6"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Archive Vault</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 dark:text-white tracking-tighter mb-4"
            >
              Download <span className="text-brand-600">History</span>.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-500 dark:text-gray-400 font-medium leading-relaxed"
            >
              Track and manage all your processed documents from the last 7 days. High-speed access to your archive.
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20"
            >
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">History entries are automatically deleted after 7 days.</span>
            </motion.div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <div className="relative w-full sm:w-[320px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="text"
                placeholder="Search processed files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-brand-500/5 transition-all"
              />
            </div>
            <button className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-[5px] text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gray-900/10 shrink-0 border-none">
              <Filter className="w-4 h-4" /> Filter Archive
            </button>
          </div>
        </div>

        {/* History Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/70 dark:bg-slate-800/40 backdrop-blur-xl rounded-[2.5rem] border border-white/20 dark:border-white/5 overflow-hidden shadow-2xl shadow-gray-200/50 dark:shadow-none"
        >
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-24 text-center">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-4" />
                <h3 className="text-gray-900 dark:text-white font-black text-xl mb-2">Loading History</h3>
                <p className="text-gray-400 font-medium">Fetching your download records...</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Document</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Tool</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Size</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Timestamp</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Status</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  <AnimatePresence mode="popLayout">
                    {filteredDownloads.map((doc, idx) => (
                      <motion.tr
                        key={doc.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + (idx * 0.05) }}
                        className="group hover:bg-gray-50/50 dark:hover:bg-white/2 transition-colors"
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 bg-brand-500/10 dark:bg-brand-500/20 rounded-[5px] flex items-center justify-center text-brand-600 dark:text-brand-400 shadow-sm group-hover:scale-110 transition-transform">
                              <FileText className="w-5.5 h-5.5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{doc.fileName}</div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{doc.toolName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-sm font-bold text-brand-600 dark:text-brand-400">{doc.toolName}</td>
                        <td className="px-8 py-6 text-sm font-bold text-gray-500 dark:text-gray-400 font-mono tracking-tight">{doc.fileSize}</td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-gray-700 dark:text-gray-300">{formatDate(doc.timestamp)}</div>
                          <div className="text-[10px] font-bold text-gray-400 mt-0.5">{formatTime(doc.timestamp)}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex justify-center">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                              doc.status === 'completed'
                                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20'
                            }`}>
                              {doc.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center justify-end gap-2 text-gray-400">
                            <div className="w-px h-6 bg-gray-100 dark:bg-white/10 mx-1" />
                            <button
                              onClick={() => doc.id && handleDelete(doc.id)}
                              className="p-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 rounded-[5px] transition-all group/trash"
                            >
                              <Trash2 className="w-4.5 h-4.5 group-hover/trash:scale-110 transition-transform" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            )}

            {!loading && filteredDownloads.length === 0 && (
              <div className="py-24 text-center">
                <Search className="w-12 h-12 text-gray-200 dark:text-white/5 mx-auto mb-4" />
                <h3 className="text-gray-900 dark:text-white font-black text-xl mb-2">
                  {searchQuery ? 'No Records Found' : 'No Downloads Yet'}
                </h3>
                <p className="text-gray-400 font-medium">
                  {searchQuery
                    ? 'No results match your current search query.'
                    : 'Process and download documents to see your history here.'}
                </p>
              </div>
            )}
          </div>

          {/* Footer of card */}
          <div className="px-8 py-6 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Showing <span className="text-gray-900 dark:text-white">{filteredDownloads.length}</span> of <span className="text-gray-900 dark:text-white">{downloads.length}</span> items
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
