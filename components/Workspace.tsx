import React, { useState, useCallback, useContext, useRef } from 'react';
import {
  Upload, File, X, Check, ArrowRight, Settings2,
  RotateCw, Trash2, Download, Eye, Layers,
  Wand2, Shield, Lock, FileText, Share2,
  Plus, Search, GripVertical, PenTool, Unlock, ArrowUpDown
} from 'lucide-react';
import { PDFTool, UploadedFile } from '../types';
import { AppContext as MainContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

interface WorkspaceProps {
  activeTool: PDFTool | null;
  files: UploadedFile[];
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
  onUpdateFile: (id: string, updates: Partial<UploadedFile>) => void;
  onClear: () => void;
  onReorder: (files: UploadedFile[]) => void;
  onExport: () => void;
  toolOptions: any;
  onOptionChange: (key: string, value: any) => void;
  editAction: string | null;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  activeTool, files, onUpload, onDelete, onUpdateFile,
  onClear, onReorder, onExport, toolOptions,
  onOptionChange, editAction
}) => {
  const { t } = useContext(MainContext);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const getExportLabel = () => {
    if (!activeTool) return t('Download All');
    if (activeTool.id === 'merge') return 'Merge & Download';
    if (activeTool.id === 'split') return 'Split & Download';
    if (activeTool.id === 'compress') return 'Compress & Download';
    if (activeTool.id === 'rotate') return 'Save Rotated';
    if (activeTool.id === 'pdf-to-jpg') return 'Convert to JPG';
    if (activeTool.id === 'jpg-to-pdf') return 'Convert to PDF';
    return `Run ${activeTool.name}`;
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(Array.from(e.dataTransfer.files));
    }
  }, [onUpload]);

  const selectedFile = files.find(f => f.id === selectedFileId) || (files.length > 0 ? files[0] : null);

  const renderEmptyState = () => (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-[2.5rem] transition-all duration-500 m-8 relative overflow-hidden group
          ${isDragging
          ? 'border-brand-500 bg-brand-500/10 scale-[0.98]'
          : 'border-gray-200 dark:border-white/5 bg-[#f3f1ea] dark:bg-[#11111b]'}`}
    >
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="w-24 h-24 bg-gradient-to-tr from-brand-600 to-indigo-600 rounded-3xl shadow-2xl shadow-brand-500/30 flex items-center justify-center mb-8 rotate-3 group-hover:rotate-0 transition-transform duration-500">
          <Upload className="w-10 h-10 text-white animate-pulse" />
        </div>

        <h2 className="text-3xl md:text-4xl font-black dark:text-white mb-4 tracking-tight">
          {activeTool ? `${t(activeTool.name)}` : t('Start Your Project')}
        </h2>

        <p className="text-gray-500 dark:text-gray-400 mb-10 max-w-sm text-center font-medium leading-relaxed">
          {t('A professional environment for focused document architecture.')} <br />
          {t('Drag & drop your vision here.')}
        </p>

        <label className="group/btn relative px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer overflow-hidden">
          <span className="relative z-10">{t('Select Project Source')}</span>
          <div className="absolute inset-0 bg-brand-500 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
          <input type="file" multiple className="hidden" onChange={(e) => e.target.files && onUpload(Array.from(e.target.files))} />
        </label>

        <div className="mt-12 flex items-center gap-8 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
          <div className="flex flex-col items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-widest">Secured</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Lock className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-widest">Private</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Wand2 className="w-4 h-4" />
            <span className="text-[8px] font-black uppercase tracking-widest">AI Ready</span>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const renderFileGrid = () => (
    <div className="flex-1 flex flex-col p-4 lg:p-8 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${activeTool?.color || 'bg-brand-500'} bg-opacity-10 dark:bg-opacity-20 shadow-inner ring-1 ring-white/10`}>
            {activeTool ? <activeTool.icon className={`w-6 h-6 ${activeTool.color.replace('bg-', 'text-')}`} /> : <File className="w-6 h-6 text-brand-500" />}
          </div>
          <div>
            <h1 className="text-2xl font-black dark:text-white tracking-tight">{activeTool ? t(activeTool.name) : t('Workspace')}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{files.length} {files.length === 1 ? 'Object' : 'Objects'} in stack</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClear}
            className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
          >
            Purge Session
          </button>

          <div className="h-8 w-px bg-gray-200 dark:bg-white/10 mx-2" />

          <label className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest bg-[#f3f1ea] dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-brand-500 dark:hover:border-brand-500/50 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95">
            <Plus className="w-3.5 h-3.5" /> Import More
            <input ref={addMoreInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && onUpload(Array.from(e.target.files))} />
          </label>

          <button
            onClick={onExport}
            className="px-8 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 ring-1 ring-white/20"
          >
            <Download className="w-3.5 h-3.5" /> {getExportLabel()}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-6 overflow-hidden">
        {/* Sidebar List */}
        <div className="xl:col-span-1 bg-[#f3f1ea]/50 dark:bg-[#11111b]/50 backdrop-blur-xl rounded-[1.5rem] border border-gray-200 dark:border-white/5 flex flex-col overflow-hidden shadow-2xl shadow-black/5">
          <div className="p-5 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Object Queue</span>
            {activeTool?.id === 'merge' && files.length > 1 && (
              <div className="flex items-center gap-1 text-[8px] font-black text-brand-500 uppercase tracking-widest bg-brand-500/10 px-2 py-0.5 rounded-full">
                <ArrowUpDown className="w-2.5 h-2.5" /> Reorder Active
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {files.map((file) => (
              <motion.div
                layout
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`group flex items-center gap-4 p-4 rounded-[1.25rem] transition-all cursor-pointer relative
                                ${selectedFileId === file.id
                    ? 'bg-white dark:bg-white/10 border-brand-500/50 dark:border-brand-500/50 border shadow-xl shadow-brand-500/10'
                    : 'hover:bg-white dark:hover:bg-white/5 border border-transparent'}`}
              >
                <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ring-1 ring-black/5 dark:ring-white/5
                                ${file.type.includes('pdf') ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-[13px] font-black truncate dark:text-gray-100 uppercase tracking-tight">{file.name}</p>
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type.split('/')[1].toUpperCase()}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
                  className="absolute right-3 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white text-red-500 rounded-xl transition-all shadow-lg shadow-red-500/20"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}

            <label className="w-full py-6 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-[1.25rem] text-gray-400 hover:border-brand-500 dark:hover:border-brand-500/30 hover:text-brand-500 hover:bg-brand-500/5 transition-all flex flex-col items-center gap-2 group cursor-pointer mt-4">
              <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Add New Source</span>
              <input type="file" multiple className="hidden" onChange={(e) => e.target.files && onUpload(Array.from(e.target.files))} />
            </label>
          </div>
        </div>

        {/* Main Preview / Processing Area */}
        <div className="xl:col-span-3 bg-white/30 dark:bg-[#11111b]/30 backdrop-blur-sm rounded-[2rem] border border-gray-200 dark:border-white/5 flex flex-col overflow-hidden shadow-2xl relative group">
          <div className="flex-1 overflow-auto custom-scrollbar p-12 lg:p-20 flex items-center justify-center relative">
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '24px 24px' }} />

            <AnimatePresence mode="wait">
              {selectedFile ? (
                <motion.div
                  key={selectedFile.id}
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -30, scale: 0.9 }}
                  className="w-full max-w-3xl aspect-[1/1.414] bg-white dark:bg-[#1e1e2e] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.25)] rounded-2xl flex flex-col relative ring-1 ring-black/5 dark:ring-white/5"
                  style={{ transform: `rotate(${selectedFile.rotation || 0}deg)` }}
                >
                  {/* Header of Paper */}
                  <div className="h-16 border-b border-gray-100 dark:border-white/5 flex items-center px-8">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-white/5 mr-4" />
                    <div className="w-40 h-3 rounded bg-gray-100 dark:bg-white/5" />
                  </div>

                  {/* Content Content */}
                  <div className="flex-1 p-12 space-y-6">
                    <div className="w-2/3 h-4 rounded bg-gray-100 dark:bg-white/10" />
                    <div className="w-full h-4 rounded bg-gray-100 dark:bg-white/10" />
                    <div className="w-full h-4 rounded bg-gray-100 dark:bg-white/10" />
                    <div className="w-full h-4 bg-gray-100 dark:bg-white/10 rounded" />

                    <div className="grid grid-cols-2 gap-4 pt-8">
                      <div className="aspect-video bg-gray-100 dark:bg-white/10 rounded" />
                      <div className="aspect-video bg-gray-100 dark:bg-white/10 rounded" />
                    </div>

                    <div className="w-1/2 h-4 rounded bg-gray-100 dark:bg-white/10" />
                    <div className="w-full h-40 bg-gray-100 dark:bg-white/10 rounded" />
                  </div>

                  {/* Tool-specific Overlay layers */}
                  {activeTool?.id === 'protect' && toolOptions.password && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center bg-brand-600/10 backdrop-blur-[1px] pointer-events-none"
                    >
                      <div className="bg-white/90 dark:bg-gray-900/90 p-8 rounded-3xl shadow-2xl border border-brand-500/30 flex flex-col items-center animate-pulse">
                        <Lock className="w-16 h-16 text-brand-600 mb-4" />
                        <span className="text-xl font-bold text-brand-900 dark:text-white">File Protected</span>
                        <span className="text-xs text-brand-500 font-mono mt-2">AES-256 Encryption Active</span>
                      </div>
                    </motion.div>
                  )}

                  {activeTool?.id === 'sign' && toolOptions.signatureText && (
                    <motion.div
                      drag
                      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                      className="absolute bottom-20 right-20 p-4 border-2 border-dashed border-brand-400 rounded-lg cursor-move bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm group/sig"
                    >
                      <span
                        className="text-3xl"
                        style={{
                          fontFamily: "'Dancing Script', cursive",
                          color: toolOptions.signatureColor || '#000'
                        }}
                      >
                        {toolOptions.signatureText}
                      </span>
                      <div className="absolute -top-6 left-0 bg-brand-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover/sig:opacity-100 transition-opacity uppercase tracking-widest">
                        Your Signature
                      </div>
                    </motion.div>
                  )}

                  {activeTool?.id === 'unlock' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px]">
                      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-xs w-full">
                        <Unlock className="w-10 h-10 text-amber-500 mb-4 mx-auto" />
                        <h4 className="text-sm font-bold text-center mb-4">This file is password protected</h4>
                        <input
                          type="password"
                          placeholder="Enter Password"
                          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-center focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                        <button className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-xl text-xs font-bold transition-colors">
                          Unlock & Edit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Floating Action Buttons for the file - Premium Style */}
                  <div className="absolute top-6 -right-16 flex flex-col gap-3 group-hover:right-6 transition-all duration-500">
                    <button className="w-12 h-12 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl text-gray-500 hover:text-brand-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
                      <RotateCw className="w-5 h-5" />
                    </button>
                    <button className="w-12 h-12 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl text-gray-500 hover:text-brand-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
                      <Settings2 className="w-5 h-5" />
                    </button>
                    <button className="w-12 h-12 bg-red-500 border border-red-600 rounded-2xl shadow-[0_10px_20px_rgba(239,68,68,0.3)] text-white hover:scale-110 active:scale-95 transition-all flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {activeTool?.id === 'edit' && (
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/20 to-transparent flex justify-center pb-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-full px-6 py-3 shadow-2xl flex items-center gap-4">
                        <span className="text-xs font-bold dark:text-gray-300">Editing Mode</span>
                        <div className="w-px h-6 bg-gray-200 dark:bg-white/10" />
                        <button className="p-1.5 bg-brand-500 text-white rounded-lg shadow-lg"><FileText className="w-4 h-4" /></button>
                        <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"><PenTool className="w-4 h-4" /></button>
                        <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"><Wand2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <p className="text-gray-400">Select a file to preview</p>
              )}
            </AnimatePresence>
          </div>

          {/* Premium Status Bar */}
          <div className="h-16 border-t border-gray-100 dark:border-white/5 flex items-center justify-between px-10 bg-[#f3f1ea]/50 dark:bg-[#0a0a0f]/50 backdrop-blur-xl">
            <div className="flex items-center gap-10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-50" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Secure Live Buffer</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Format</span>
                <span className="bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white px-2 py-0.5 rounded text-[10px] font-black">ISO 32000-1</span>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Magnification</span>
                  <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-lg px-2 py-1 ring-1 ring-black/5 dark:ring-white/5">
                    <span className="text-[10px] font-black dark:text-white">100%</span>
                  </div>
                </div>
                <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
                <div className="flex items-center gap-2 text-gray-400">
                  <Layers className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Context L1</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-white/10">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors cursor-pointer">
                  <Search className="w-4 h-4" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors cursor-pointer">
                  <Share2 className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 bg-[#f3f1ea] dark:bg-[#1e1e2e] flex flex-col h-full overflow-hidden transition-colors duration-300">
      {files.length === 0 ? renderEmptyState() : renderFileGrid()}
    </div>
  );
};