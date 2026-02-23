import React, { useContext, useState, useMemo } from 'react';
import { PDFTool, ToolCategory } from '../types';
import { ArrowRight, Sparkles, Search, X, LayoutGrid, Files, PenTool, Shield, Zap } from 'lucide-react';
import { AppContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  tools: PDFTool[];
  onSelectTool: (tool: PDFTool) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ tools, onSelectTool }) => {
  const { t } = useContext(AppContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ToolCategory | 'all'>('all');

  const categories = [
    ToolCategory.ORGANIZE,
    ToolCategory.CONVERT,
    ToolCategory.EDIT,
    ToolCategory.SECURITY,
    ToolCategory.AI
  ];

  const filteredTools = useMemo(() => {
    let result = tools;
    if (searchQuery) {
      result = result.filter(tool =>
        t(tool.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (activeCategory !== 'all' && !searchQuery) {
      result = result.filter(tool => tool.category === activeCategory);
    }
    return result;
  }, [tools, searchQuery, activeCategory, t]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24
      }
    }
  };

  const categoryIcons: Record<string, any> = {
    [ToolCategory.ORGANIZE]: Files,
    [ToolCategory.CONVERT]: ArrowRight,
    [ToolCategory.EDIT]: PenTool,
    [ToolCategory.SECURITY]: Shield,
    [ToolCategory.AI]: Zap,
  };

  const renderToolCard = (tool: PDFTool) => (
    <motion.button
      variants={itemVariants}
      key={tool.id}
      onClick={() => onSelectTool(tool)}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="group glass-card rounded-2xl p-5 text-left transition-all duration-300 hover:shadow-xl relative overflow-hidden border border-white/20 dark:border-white/5 bg-white/70 dark:bg-slate-800/40 backdrop-blur-lg"
    >
      <div className={`absolute -top-10 -right-10 w-24 h-24 rounded-full blur-[40px] opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${tool.color}`} />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tool.color} bg-opacity-10 dark:bg-opacity-20 shadow-sm group-hover:scale-105 transition-transform duration-500 ring-1 ring-white/10`}>
            <tool.icon className={`w-5 h-5 ${tool.color.replace('bg-', 'text-')}`} />
          </div>
          <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-brand-600 dark:text-brand-400">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-gray-900 dark:text-white font-bold text-base mb-1.5 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors tracking-tight">
            {t(tool.name)}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2 font-medium">
            {tool.description}
          </p>
        </div>
      </div>
    </motion.button>
  );

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8fafc] dark:bg-[#020617] relative scroll-smooth overflow-x-hidden">
      {/* Premium Live Ticker */}
      <div className="w-full bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-gray-100 dark:border-white/5 py-2.5 overflow-hidden sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center px-6 md:px-10">
          <div className="flex items-center gap-2 pr-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl z-10 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Live Status</span>
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
                    { label: "AI ENGINE", val: "Neural 2.0 Stabilized", type: "success" },
                    { label: "LATENCY", val: "12.4ms Optimized", type: "info" },
                    { label: "ENCRYPTION", val: "AES-256 Active", type: "warning" },
                    { label: "TRAFFIC", val: "52K+ Sessions Active", type: "success" },
                    { label: "SYSTEM", val: "All Nodes Operational", type: "info" }
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

      {/* Subtle Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[800px] h-[500px] bg-brand-500/5 dark:bg-brand-500/5 rounded-full blur-[120px] -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 dark:bg-indigo-500/5 rounded-full blur-[100px] translate-x-1/4" />
      </div>

      <div className="max-w-[1600px] mx-auto px-6 md:px-10 lg:px-12 py-12 md:py-16 relative z-10">
        {/* Balanced Hero Section */}
        <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-8 mb-12 md:mb-16">
          <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-sm mb-6"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                {t('Intelligence Suite 2.0')}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black mb-4 tracking-tighter text-gray-900 dark:text-white leading-[1.1]"
            >
              All Your <span className="text-brand-600 dark:text-brand-400">PDF Tools</span> <br className="hidden md:block" />
              In One Place.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-xl"
            >
              {t('A professional suite to search, edit, convert and secure your documents with precision and speed.')}
            </motion.p>
          </div>

          <div className="w-full md:w-[380px] shrink-0">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="relative group"
            >
              <div className="relative flex items-center bg-white dark:bg-slate-900/90 border border-gray-200 dark:border-white/10 rounded-2xl p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
                <div className="flex items-center justify-center w-10 h-10 bg-gray-50 dark:bg-white/5 rounded-xl ml-1 text-gray-400">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  placeholder={t('Search 20+ tools...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none w-full text-base text-gray-900 dark:text-white placeholder-gray-400 py-2.5 px-4 font-bold"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl mr-1 transition-all"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Categories Section */}
        <div className="mb-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap items-center gap-2"
          >
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeCategory === 'all'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900'
                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500'
                }`}
            >
              {t('All')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeCategory === cat
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900'
                  : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 hover:border-gray-300'
                  }`}
              >
                {t(cat)}
              </button>
            ))}
          </motion.div>
        </div>

        {/* Content Section */}
        <div className="space-y-12">
          {searchQuery || activeCategory !== 'all' ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="space-y-8"
            >
              <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/10 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {searchQuery ? t('Search Results') : t(activeCategory)}
                </h2>
                <span className="bg-gray-100 dark:bg-white/5 text-gray-500 px-2 py-0.5 rounded text-[10px] font-bold">
                  {filteredTools.length}
                </span>
              </div>

              {filteredTools.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                  {filteredTools.map(renderToolCard)}
                </div>
              ) : (
                <div className="text-center py-20 bg-gray-50/50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200">
                  <Search className="w-8 h-8 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">{t('No tools matched your search')}</p>
                </div>
              )}
            </motion.div>
          ) : (
            categories.map((category) => {
              const categoryTools = tools.filter(tool => tool.category === category);
              if (categoryTools.length === 0) return null;

              return (
                <div key={category} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">
                      {t(category)}
                    </h2>
                    <div className="h-px bg-gray-100 dark:bg-white/10 flex-1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {categoryTools.map(renderToolCard)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Scaled Down CTA CTA */}
        <div className="mt-24 mb-12">
          <div className="relative rounded-3xl overflow-hidden p-8 md:p-12 text-center bg-gray-900 dark:bg-black group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/20 rounded-full blur-[80px]" />
            <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
              <Sparkles className="w-8 h-8 text-yellow-400 mb-6" />
              <h2 className="text-2xl md:text-3xl font-black text-white mb-4 tracking-tight">
                {t('Ready to Upgrade?')}
              </h2>
              <p className="text-gray-400 text-sm md:text-base mb-8 font-medium">
                {t('Join 50K+ professionals using OmniPDF AI.')}
              </p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-2 px-8 py-3 bg-white text-gray-900 rounded-xl font-bold text-sm hover:scale-105 transition-transform"
              >
                {t('Get Started')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div >
    </div >
  );
};