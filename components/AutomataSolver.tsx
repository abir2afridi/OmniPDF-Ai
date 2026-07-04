/**
 * AutomataTheorySolver — 5-tab Automata Theory tool
 *
 *   DFA         — Build, visualize, test Deterministic Finite Automata
 *   NFA         — Build, visualize, test Non-deterministic FA (ε-transitions)
 *   Regex → NFA — Thompson's construction
 *   NFA → DFA   — Subset construction
 *   DFA Minimize — Table-filling algorithm
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Circle, Zap, Code, ArrowRightLeft, Wand2, Play, Plus, Trash2,
  ArrowRight, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Info, Download,
  Upload, RotateCcw, Loader2, ChevronDown, ChevronUp, X, Bot,
  FileText, Image, File, Send, Sparkles, Copy,
} from 'lucide-react';
import { ToolHeaderExtras } from './ToolHeaderExtras';
import { PDFTool } from '../types';
import {
  extractTextFromFile, askAutomataAI, AUTOMATA_SYSTEM_PROMPT,
  extractAutomataData, type AutomataData,
} from '../services/automataAiService';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'dfa' | 'nfa' | 'regex2nfa' | 'nfa2dfa' | 'dfaMin' | 'aiSolve';
type ToastType = 'success' | 'error' | 'info' | 'warn';

interface Toast { id: string; type: ToastType; message: string; }

interface Props { onBack?: () => void; initialTab?: string; activeTool?: PDFTool; }

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Automata types ────────────────────────────────────────────────────────────

interface DFATransition { from: string; symbol: string; to: string; }
interface NFATransition { from: string; symbol: string; to: string; } // symbol = 'ε' for epsilon
interface DFA { states: string[]; alphabet: string[]; transitions: DFATransition[]; start: string; accept: string[]; }
interface NFA { states: string[]; alphabet: string[]; transitions: NFATransition[]; start: string; accept: string[]; }
interface SimulationStep { state: string; remaining: string; symbol: string | null; accepted: boolean; }

const DEFAULT_DFA: DFA = { states: ['q0', 'q1', 'q2'], alphabet: ['0', '1'], transitions: [], start: 'q0', accept: ['q2'] };
const DEFAULT_NFA: NFA = { states: ['q0', 'q1', 'q2'], alphabet: ['a', 'b'], transitions: [], start: 'q0', accept: ['q2'] };

// ── Toast ─────────────────────────────────────────────────────────────────────

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => (
  <motion.div layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: 60, scale: 0.9 }}
    className={`flex items-start gap-3 px-4 py-3 rounded-[5px] shadow-xl max-w-sm text-sm font-medium border backdrop-blur-md pointer-events-auto
      ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
        : toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/60 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
          : toast.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/60 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
            : 'bg-indigo-50 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-200'}`}>
    {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
    {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
    {toast.type === 'warn' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
    {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
    <span className="flex-1 leading-snug">{toast.message}</span>
    <button onClick={onDismiss}><X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" /></button>
  </motion.div>
);

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ReactNode; color: string; activeBg: string; activeText: string; activeBorder: string }[] = [
  { key: 'dfa', label: 'DFA', icon: <Circle className="w-3.5 h-3.5" />, color: 'emerald', activeBg: 'bg-emerald-100 dark:bg-emerald-900/30', activeText: 'text-emerald-700 dark:text-emerald-300', activeBorder: 'border-emerald-500' },
  { key: 'nfa', label: 'NFA', icon: <Zap className="w-3.5 h-3.5" />, color: 'violet', activeBg: 'bg-violet-100 dark:bg-violet-900/30', activeText: 'text-violet-700 dark:text-violet-300', activeBorder: 'border-violet-500' },
  { key: 'regex2nfa', label: 'Regex → NFA', icon: <Code className="w-3.5 h-3.5" />, color: 'indigo', activeBg: 'bg-indigo-100 dark:bg-indigo-900/30', activeText: 'text-indigo-700 dark:text-indigo-300', activeBorder: 'border-indigo-500' },
  { key: 'nfa2dfa', label: 'NFA → DFA', icon: <ArrowRightLeft className="w-3.5 h-3.5" />, color: 'amber', activeBg: 'bg-amber-100 dark:bg-amber-900/30', activeText: 'text-amber-700 dark:text-amber-300', activeBorder: 'border-amber-500' },
  { key: 'dfaMin', label: 'DFA Minimize', icon: <Wand2 className="w-3.5 h-3.5" />, color: 'rose', activeBg: 'bg-rose-100 dark:bg-rose-900/30', activeText: 'text-rose-700 dark:text-rose-300', activeBorder: 'border-rose-500' },
  { key: 'aiSolve', label: 'AI Solve', icon: <Bot className="w-3.5 h-3.5" />, color: 'cyan', activeBg: 'bg-cyan-100 dark:bg-cyan-900/30', activeText: 'text-cyan-700 dark:text-cyan-300', activeBorder: 'border-cyan-500' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AutomataTheorySolver: React.FC<Props> = ({ onBack, initialTab, activeTool }) => {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'dfa');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (type: ToastType, message: string) => {
    const t: Toast = { id: uid(), type, message };
    setToasts(p => [...p.slice(-4), t]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 5000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f3f1ea] dark:bg-[#1e1e2e] overflow-hidden relative">
      {/* Toasts */}
      <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={() => setToasts(p => p.filter(x => x.id !== t.id))} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 lg:px-6 py-4 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-[5px] transition-colors text-gray-500 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className={`${activeTool?.toImageUrl ? 'h-8 w-auto px-1.5' : 'w-8 h-8'} rounded-[5px] flex items-center justify-center ${activeTool?.color || 'bg-indigo-500'} bg-opacity-10 dark:bg-opacity-20 overflow-hidden gap-1 shrink-0`}>
            {activeTool?.imageUrl ? (
              <>
                <img src={activeTool.imageUrl} alt={activeTool.name} className="w-5 h-5 object-contain" />
                {activeTool.toImageUrl && (
                  <>
                    <span className="text-[10px] font-bold text-gray-400">→</span>
                    <img src={activeTool.toImageUrl} alt="To" className="w-5 h-5 object-contain" />
                  </>
                )}
              </>
            ) : (
              <Wand2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black dark:text-white tracking-tight truncate">Automata Theory Solver</h1>
            <p className="text-[11px] text-gray-400 font-medium hidden sm:block truncate">DFA · NFA · Regex Conversion · Minimization</p>
          </div>
        </div>
        <div className="flex items-center gap-1 lg:gap-2 shrink-0">
          <ToolHeaderExtras />
        </div>
      </div>

      {/* Tab bar — pill buttons */}
      <div className="shrink-0 flex overflow-x-auto px-2 lg:px-6 py-3 gap-2 bg-[#f3f1ea] dark:bg-[#262636] border-b border-gray-100 dark:border-white/5">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 lg:px-4 py-2 rounded-[5px] text-[10px] lg:text-xs font-black uppercase tracking-wider transition-all border whitespace-nowrap shrink-0
                ${active
                  ? `${t.activeBg} ${t.activeText} ${t.activeBorder}`
                  : 'bg-[#f3f1ea]/50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 hover:border-gray-300 dark:hover:border-white/20'}`}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">
          {tab === 'dfa' && <DFATab key="dfa" toast={toast} />}
          {tab === 'nfa' && <NFATab key="nfa" toast={toast} />}
          {tab === 'regex2nfa' && <Regex2NFATab key="regex2nfa" toast={toast} />}
          {tab === 'nfa2dfa' && <NFA2DFATab key="nfa2dfa" toast={toast} />}
          {tab === 'dfaMin' && <DFAMinTab key="dfaMin" toast={toast} />}
          {tab === 'aiSolve' && <AISolveTab key="aiSolve" toast={toast} />}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DFA TAB
// ═══════════════════════════════════════════════════════════════════════════════

const DFATab: React.FC<{ toast: (t: ToastType, m: string) => void }> = ({ toast }) => {
  const [states, setStates] = useState<string[]>(['q0', 'q1', 'q2']);
  const [alphabet, setAlphabet] = useState<string[]>(['0', '1']);
  const [transitions, setTransitions] = useState<DFATransition[]>([]);
  const [start, setStart] = useState('q0');
  const [accept, setAccept] = useState<string[]>(['q2']);
  const [newState, setNewState] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [fromState, setFromState] = useState('');
  const [toState, setToState] = useState('');
  const [testString, setTestString] = useState('');
  const [simSteps, setSimSteps] = useState<SimulationStep[]>([]);
  const [simResult, setSimResult] = useState<boolean | null>(null);
  const [showTransEditor, setShowTransEditor] = useState(true);
  const [showSim, setShowSim] = useState(false);

  const addState = () => {
    const s = newState.trim();
    if (!s) return;
    if (states.includes(s)) { toast('warn', `State "${s}" already exists.`); return; }
    setStates(p => [...p, s]);
    setNewState('');
    toast('success', `State "${s}" added.`);
  };

  const removeState = (s: string) => {
    if (s === start) { toast('error', 'Cannot remove start state.'); return; }
    setStates(p => p.filter(x => x !== s));
    setAccept(p => p.filter(x => x !== s));
    setTransitions(p => p.filter(t => t.from !== s && t.to !== s));
    toast('info', `State "${s}" removed.`);
  };

  const addSymbol = () => {
    const s = newSymbol.trim();
    if (!s || s.length !== 1) { toast('warn', 'Symbol must be a single character.'); return; }
    if (alphabet.includes(s)) { toast('warn', `Symbol "${s}" already exists.`); return; }
    setAlphabet(p => [...p, s]);
    setNewSymbol('');
    toast('success', `Symbol "${s}" added.`);
  };

  const addTransition = () => {
    if (!fromState || !newSymbol || !toState) { toast('warn', 'Fill all transition fields.'); return; }
    if (!states.includes(fromState) || !states.includes(toState)) { toast('error', 'Invalid state.'); return; }
    if (!alphabet.includes(newSymbol)) { toast('error', `Symbol "${newSymbol}" not in alphabet.`); return; }
    const exists = transitions.some(t => t.from === fromState && t.symbol === newSymbol);
    if (exists) { toast('warn', 'Transition already defined.'); return; }
    setTransitions(p => [...p, { from: fromState, symbol: newSymbol, to: toState }]);
    toast('success', `δ(${fromState}, ${newSymbol}) = ${toState}`);
  };

  const removeTransition = (idx: number) => {
    setTransitions(p => p.filter((_, i) => i !== idx));
  };

  const toggleAccept = (s: string) => {
    setAccept(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  };

  const simulate = () => {
    if (!testString) { toast('warn', 'Enter a test string.'); return; }
    const path: SimulationStep[] = [];
    let current = start;
    let remaining = testString;
    path.push({ state: current, remaining, symbol: null, accepted: false });

    for (let i = 0; i < testString.length; i++) {
      const sym = testString[i];
      if (!alphabet.includes(sym)) {
        setSimSteps(path);
        setSimResult(false);
        toast('error', `Symbol "${sym}" not in alphabet.`);
        return;
      }
      const tr = transitions.find(t => t.from === current && t.symbol === sym);
      if (!tr) {
        path.push({ state: current, remaining: testString.slice(i), symbol: sym, accepted: false });
        setSimSteps(path);
        setSimResult(false);
        return;
      }
      current = tr.to;
      path.push({ state: current, remaining: testString.slice(i + 1), symbol: sym, accepted: false });
    }

    const accepted = accept.includes(current);
    path[path.length - 1].accepted = accepted;
    setSimSteps(path);
    setSimResult(accepted);
    toast(accepted ? 'success' : 'error', accepted ? `Accepted! Ended in ${current}` : `Rejected. Ended in ${current}`);
  };

  const loadExample = () => {
    setStates(['q0', 'q1', 'q2']);
    setAlphabet(['0', '1']);
    setTransitions([
      { from: 'q0', symbol: '0', to: 'q1' },
      { from: 'q0', symbol: '1', to: 'q0' },
      { from: 'q1', symbol: '0', to: 'q2' },
      { from: 'q1', symbol: '1', to: 'q0' },
      { from: 'q2', symbol: '0', to: 'q2' },
      { from: 'q2', symbol: '1', to: 'q2' },
    ]);
    setStart('q0');
    setAccept(['q2']);
    toast('info', 'Example DFA loaded (strings ending with "00").');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black dark:text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-[5px] bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Circle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          Deterministic Finite Automaton
        </h2>
        <button onClick={loadExample}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-[5px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors flex items-center gap-1">
          <Upload className="w-3 h-3" /> Example
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: States + Alphabet + Transitions */}
        <div className="space-y-4">
          {/* States */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">States &amp; Alphabet</p>
            <div className="flex gap-2">
              <input value={newState} onChange={e => setNewState(e.target.value)} onKeyDown={e => e.key === 'Enter' && addState()}
                placeholder="New state (e.g. q3)" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-400 font-mono" />
              <button onClick={addState}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[5px] transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {states.map(s => (
                <span key={s} className={`inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-xs font-mono font-bold border
                  ${s === start ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : accept.includes(s) ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300'}`}>
                  {s === start && <span className="text-[8px] text-emerald-500">→</span>}
                  {s}
                  {accept.includes(s) && <span className="text-[8px] text-emerald-500">*</span>}
                  {s !== start && (
                    <button onClick={() => removeState(s)} className="text-red-400 hover:text-red-600 ml-0.5">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Alphabet</p>
              <div className="flex gap-2">
                <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSymbol()}
                  placeholder="Symbol" className="w-20 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-400 font-mono" />
                <button onClick={addSymbol}
                  className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[5px] transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {alphabet.map(s => (
                  <span key={s} className="inline-flex items-center px-2 py-1 rounded-[5px] text-xs font-mono font-bold border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300">
                    {s}
                    <button onClick={() => setAlphabet(p => p.filter(x => x !== s))} className="text-red-400 hover:text-red-600 ml-1"><Trash2 className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Transitions */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transitions</p>
              <button onClick={() => setShowTransEditor(v => !v)} className="text-gray-400 hover:text-gray-600">
                {showTransEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {showTransEditor && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <select value={fromState} onChange={e => setFromState(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">From</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={newSymbol} onChange={e => setNewSymbol(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">Sym</option>
                    {alphabet.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={toState} onChange={e => setToState(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">To</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={addTransition}
                  className="w-full px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" /> Add Transition
                </button>
                {/* Transition table */}
                {transitions.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black uppercase text-gray-400">
                          <th className="px-2 py-1 text-left">From</th>
                          <th className="px-2 py-1 text-left">Symbol</th>
                          <th className="px-2 py-1 text-left">To</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {transitions.map((t, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-white/5">
                            <td className="px-2 py-1.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{t.from}</td>
                            <td className="px-2 py-1.5 font-mono">{t.symbol}</td>
                            <td className="px-2 py-1.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{t.to}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button onClick={() => removeTransition(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Start & Accept */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Start &amp; Accept States</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-bold dark:text-white block mb-1">Start state</label>
                <select value={start} onChange={e => setStart(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none font-mono">
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold dark:text-white block mb-1">Accept states <span className="text-[10px] font-normal text-gray-400">(click to toggle)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {states.map(s => (
                    <button key={s} onClick={() => toggleAccept(s)}
                      className={`px-2 py-1 rounded-[5px] text-xs font-mono font-bold border transition-all
                        ${accept.includes(s) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-500'}`}>
                      {s} {accept.includes(s) ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Visualize + Simulate */}
        <div className="space-y-4">
          {/* Visualize */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transition Diagram</p>
            <DFAVisual states={states} transitions={transitions} start={start} accept={accept} />
          </div>

          {/* Simulate */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Test String</p>
              <button onClick={() => setShowSim(v => !v)} className="text-gray-400 hover:text-gray-600">
                {showSim ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {showSim && (
              <>
                <div className="flex gap-2">
                  <input value={testString} onChange={e => setTestString(e.target.value)} onKeyDown={e => e.key === 'Enter' && simulate()}
                    placeholder="e.g. 10010" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-emerald-400 font-mono" />
                  <button onClick={simulate}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[5px] transition-colors flex items-center gap-1">
                    <Play className="w-3.5 h-3.5" /> Run
                  </button>
                </div>
                {simResult !== null && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-[5px] text-xs font-bold ${simResult ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30'}`}>
                    {simResult ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {simResult ? 'Accepted' : 'Rejected'}
                  </div>
                )}
                {simSteps.length > 0 && (
                  <div className="space-y-1">
                    {simSteps.map((step, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-[5px]
                        ${i === simSteps.length - 1 && simResult !== null
                          ? simResult ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-red-50 dark:bg-red-900/10'
                          : ''}`}>
                        <span className="text-gray-400 w-4">{i === 0 ? '→' : i === simSteps.length - 1 ? '✓' : ' '}</span>
                        <span className={`font-bold ${step.state === start ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {step.state}
                        </span>
                        {step.symbol !== null && (
                          <span className="text-gray-400">──<span className="text-amber-600 dark:text-amber-400 mx-0.5">{step.symbol}</span>──▶</span>
                        )}
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500 text-[10px]">"{step.remaining}"</span>
                        {accept.includes(step.state) && <span className="text-[8px] text-emerald-500">*accept</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="font-bold dark:text-white">States:</span><span className="text-gray-500 font-mono">{states.length}</span></div>
              <div className="flex items-center gap-2"><span className="font-bold dark:text-white">Alphabet:</span><span className="text-gray-500 font-mono">{alphabet.length}</span></div>
              <div className="flex items-center gap-2"><span className="font-bold dark:text-white">Transitions:</span><span className="text-gray-500 font-mono">{transitions.length}</span></div>
              <div className="flex items-center gap-2"><span className="font-bold dark:text-white">Accept:</span><span className="text-gray-500 font-mono">{accept.length}</span></div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── DFA Visual ────────────────────────────────────────────────────────────────

const DFAVisual: React.FC<{ states: string[]; transitions: DFATransition[]; start: string; accept: string[] }> = ({ states, transitions, start, accept }) => {
  if (states.length === 0) return <p className="text-xs text-gray-400 text-center py-8">No states defined.</p>;
  const r = 24;
  const cx = 180, cy = 120;
  const positions: Record<string, { x: number; y: number }> = {};
  states.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / states.length - Math.PI / 2;
    positions[s] = { x: cx + 100 * Math.cos(angle), y: cy + 100 * Math.sin(angle) };
  });

  return (
    <div className="bg-gray-50 dark:bg-black/20 rounded-[5px] border border-gray-100 dark:border-white/5 overflow-hidden flex items-center justify-center">
      <svg viewBox="0 0 360 240" className="w-full h-48">
        {/* Start arrow */}
        <line x1={positions[start]?.x - 50 || 0} y1={positions[start]?.y || 0} x2={(positions[start]?.x || 0) - r} y2={positions[start]?.y || 0}
          stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" markerEnd="url(#arrowG)" />
        <defs>
          <marker id="arrowG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-emerald-500" />
          </marker>
        </defs>
        {/* Transitions */}
        {transitions.map((t, i) => {
          const from = positions[t.from], to = positions[t.to];
          if (!from || !to) return null;
          if (t.from === t.to) {
            return <path key={i} d={`M ${from.x} ${from.y - r} C ${from.x + 30} ${from.y - 50}, ${from.x - 30} ${from.y - 50}, ${from.x} ${from.y - r}`}
              fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />;
          }
          const dx = to.x - from.x, dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / dist, uy = dy / dist;
          const x1 = from.x + ux * r, y1 = from.y + uy * r;
          const x2 = to.x - ux * r, y2 = to.y - uy * r;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />
              <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" className="fill-current text-amber-600 dark:text-amber-400" fontWeight="bold" fontFamily="monospace">{t.symbol}</text>
            </g>
          );
        })}
        {/* States */}
        {states.map(s => {
          const p = positions[s];
          if (!p) return null;
          const isStart = s === start;
          const isAccept = accept.includes(s);
          return (
            <g key={s}>
              <circle cx={p.x} cy={p.y} r={r} fill="white" stroke={isAccept ? '#10b981' : '#9ca3af'} strokeWidth="2" className="dark:fill-[#262636]" />
              {isAccept && <circle cx={p.x} cy={p.y} r={r - 4} fill="none" stroke="#10b981" strokeWidth="1.5" />}
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fontFamily="monospace" className="fill-current text-gray-700 dark:text-gray-200">{s}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NFA TAB
// ═══════════════════════════════════════════════════════════════════════════════

const NFATab: React.FC<{ toast: (t: ToastType, m: string) => void }> = ({ toast }) => {
  const [states, setStates] = useState<string[]>(['q0', 'q1', 'q2']);
  const [alphabet, setAlphabet] = useState<string[]>(['a', 'b']);
  const [transitions, setTransitions] = useState<NFATransition[]>([]);
  const [start, setStart] = useState('q0');
  const [accept, setAccept] = useState<string[]>(['q2']);
  const [newState, setNewState] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [fromState, setFromState] = useState('');
  const [toState, setToState] = useState('');
  const [testString, setTestString] = useState('');
  const [simSteps, setSimSteps] = useState<SimulationStep[]>([]);
  const [simResult, setSimResult] = useState<boolean | null>(null);
  const [simPaths, setSimPaths] = useState<string[][]>([]);
  const [showTransEditor, setShowTransEditor] = useState(true);

  const addState = () => {
    const s = newState.trim();
    if (!s) return;
    if (states.includes(s)) { toast('warn', `State "${s}" already exists.`); return; }
    setStates(p => [...p, s]);
    setNewState('');
    toast('success', `State "${s}" added.`);
  };

  const removeState = (s: string) => {
    if (s === start) { toast('error', 'Cannot remove start state.'); return; }
    setStates(p => p.filter(x => x !== s));
    setAccept(p => p.filter(x => x !== s));
    setTransitions(p => p.filter(t => t.from !== s && t.to !== s));
    toast('info', `State "${s}" removed.`);
  };

  const addSymbol = () => {
    const s = newSymbol.trim();
    if (!s || s.length !== 1) { toast('warn', 'Symbol must be a single character.'); return; }
    if (s === 'ε') { toast('warn', 'Use the ε button for epsilon transitions.'); return; }
    if (alphabet.includes(s)) { toast('warn', `Symbol "${s}" already exists.`); return; }
    setAlphabet(p => [...p, s]);
    setNewSymbol('');
  };

  const addEpsilonTransition = () => {
    if (!fromState || !toState) { toast('warn', 'Select from and to states.'); return; }
    if (!states.includes(fromState) || !states.includes(toState)) { toast('error', 'Invalid state.'); return; }
    const exists = transitions.some(t => t.from === fromState && t.symbol === 'ε' && t.to === toState);
    if (exists) { toast('warn', 'Epsilon transition already exists.'); return; }
    setTransitions(p => [...p, { from: fromState, symbol: 'ε', to: toState }]);
    toast('success', `ε-transition: ${fromState} → ${toState}`);
  };

  const addTransition = () => {
    if (!fromState || !newSymbol || !toState) { toast('warn', 'Fill all fields.'); return; }
    if (!states.includes(fromState) || !states.includes(toState)) { toast('error', 'Invalid state.'); return; }
    if (!alphabet.includes(newSymbol)) { toast('error', `Symbol "${newSymbol}" not in alphabet.`); return; }
    setTransitions(p => [...p, { from: fromState, symbol: newSymbol, to: toState }]);
    toast('success', `δ(${fromState}, ${newSymbol}) → {${toState}}`);
  };

  const removeTransition = (idx: number) => setTransitions(p => p.filter((_, i) => i !== idx));
  const toggleAccept = (s: string) => setAccept(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  // Epsilon closure
  const epsilonClosure = useCallback((stateSet: Set<string>): Set<string> => {
    const closure = new Set(stateSet);
    const stack = [...stateSet];
    while (stack.length > 0) {
      const s = stack.pop()!;
      for (const t of transitions) {
        if (t.from === s && t.symbol === 'ε' && !closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      }
    }
    return closure;
  }, [transitions]);

  // NFA move
  const move = useCallback((stateSet: Set<string>, symbol: string): Set<string> => {
    const result = new Set<string>();
    for (const s of stateSet) {
      for (const t of transitions) {
        if (t.from === s && t.symbol === symbol) result.add(t.to);
      }
    }
    return result;
  }, [transitions]);

  const simulate = () => {
    if (!testString) { toast('warn', 'Enter a test string.'); return; }
    let current = epsilonClosure(new Set([start]));
    const allPaths: string[][] = [[start]];
    const steps: SimulationStep[] = [{ state: [...current].join(','), remaining: testString, symbol: null, accepted: false }];

    for (let i = 0; i < testString.length; i++) {
      const sym = testString[i];
      if (!alphabet.includes(sym)) {
        setSimSteps(steps);
        setSimResult(false);
        toast('error', `Symbol "${sym}" not in alphabet.`);
        return;
      }
      const moved = move(current, sym);
      current = epsilonClosure(moved);
      steps.push({ state: [...current].join(','), remaining: testString.slice(i + 1), symbol: sym, accepted: false });
    }

    const accepted = [...current].some(s => accept.includes(s));
    steps[steps.length - 1].accepted = accepted;
    setSimSteps(steps);
    setSimResult(accepted);
    setSimPaths(allPaths);
    toast(accepted ? 'success' : 'error', accepted ? 'Accepted!' : 'Rejected.');
  };

  const loadExample = () => {
    setStates(['q0', 'q1', 'q2', 'q3']);
    setAlphabet(['a', 'b']);
    setTransitions([
      { from: 'q0', symbol: 'a', to: 'q0' },
      { from: 'q0', symbol: 'b', to: 'q0' },
      { from: 'q0', symbol: 'a', to: 'q1' },
      { from: 'q1', symbol: 'b', to: 'q2' },
      { from: 'q2', symbol: 'b', to: 'q3' },
    ]);
    setStart('q0');
    setAccept(['q3']);
    toast('info', 'Example NFA loaded: (a|b)*abb');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black dark:text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-[5px] bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </span>
          Non-deterministic Finite Automaton
        </h2>
        <button onClick={loadExample}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-[5px] bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors flex items-center gap-1">
          <Upload className="w-3 h-3" /> Example
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">States &amp; Alphabet</p>
            <div className="flex gap-2">
              <input value={newState} onChange={e => setNewState(e.target.value)} onKeyDown={e => e.key === 'Enter' && addState()}
                placeholder="New state" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-violet-400 font-mono" />
              <button onClick={addState} className="px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-[5px] transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {states.map(s => (
                <span key={s} className={`inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-xs font-mono font-bold border
                  ${s === start ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                    : accept.includes(s) ? 'border-violet-400 bg-violet-50/50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400'
                      : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300'}`}>
                  {s === start && '→'}{s}{accept.includes(s) && '*'}
                  {s !== start && <button onClick={() => removeState(s)} className="text-red-400 hover:text-red-600 ml-0.5"><Trash2 className="w-2.5 h-2.5" /></button>}
                </span>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Alphabet</p>
              <div className="flex gap-2">
                <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSymbol()}
                  placeholder="Symbol" className="w-20 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-violet-400 font-mono" />
                <button onClick={addSymbol} className="px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-[5px] transition-colors"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {alphabet.map(s => (
                  <span key={s} className="inline-flex items-center px-2 py-1 rounded-[5px] text-xs font-mono font-bold border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300">
                    {s}
                    <button onClick={() => setAlphabet(p => p.filter(x => x !== s))} className="text-red-400 hover:text-red-600 ml-1"><Trash2 className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Transitions */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transitions</p>
              <button onClick={() => setShowTransEditor(v => !v)} className="text-gray-400 hover:text-gray-600">
                {showTransEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {showTransEditor && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <select value={fromState} onChange={e => setFromState(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">From</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={newSymbol} onChange={e => setNewSymbol(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">Sym</option>
                    {alphabet.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={toState} onChange={e => setToState(e.target.value)}
                    className="px-2 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none font-mono">
                    <option value="">To</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={addTransition} className="flex-1 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Add Transition
                  </button>
                  <button onClick={addEpsilonTransition} className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1">
                    <span className="font-mono">ε</span> Add ε
                  </button>
                </div>
                {transitions.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black uppercase text-gray-400">
                          <th className="px-2 py-1 text-left">From</th>
                          <th className="px-2 py-1 text-left">Symbol</th>
                          <th className="px-2 py-1 text-left">To</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {transitions.map((t, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-white/5">
                            <td className="px-2 py-1.5 font-mono font-bold text-violet-600 dark:text-violet-400">{t.from}</td>
                            <td className={`px-2 py-1.5 font-mono ${t.symbol === 'ε' ? 'text-purple-600 dark:text-purple-400 font-bold' : ''}`}>{t.symbol}</td>
                            <td className="px-2 py-1.5 font-mono font-bold text-violet-600 dark:text-violet-400">{t.to}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button onClick={() => removeTransition(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Start & Accept */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Start &amp; Accept States</p>
            <div>
              <label className="text-xs font-bold dark:text-white block mb-1">Start state</label>
              <select value={start} onChange={e => setStart(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none font-mono">
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold dark:text-white block mb-1">Accept states</label>
              <div className="flex flex-wrap gap-1.5">
                {states.map(s => (
                  <button key={s} onClick={() => toggleAccept(s)}
                    className={`px-2 py-1 rounded-[5px] text-xs font-mono font-bold border transition-all
                      ${accept.includes(s) ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-500'}`}>
                    {s} {accept.includes(s) ? '✓' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transition Diagram</p>
            <NFAVisual states={states} transitions={transitions} start={start} accept={accept} />
          </div>

          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Test String</p>
            <div className="flex gap-2">
              <input value={testString} onChange={e => setTestString(e.target.value)} onKeyDown={e => e.key === 'Enter' && simulate()}
                placeholder="e.g. abb" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-violet-400 font-mono" />
              <button onClick={simulate}
                className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-[5px] transition-colors flex items-center gap-1">
                <Play className="w-3.5 h-3.5" /> Run
              </button>
            </div>
            {simResult !== null && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-[5px] text-xs font-bold ${simResult ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30'}`}>
                {simResult ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {simResult ? 'Accepted' : 'Rejected'}
              </div>
            )}
            {simSteps.length > 0 && (
              <div className="space-y-1">
                {simSteps.map((step, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-[5px]
                    ${i === simSteps.length - 1 && simResult !== null ? simResult ? 'bg-violet-50 dark:bg-violet-900/10' : 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                    <span className="text-gray-400 w-4">{i === 0 ? '→' : i === simSteps.length - 1 ? '✓' : ' '}</span>
                    <span className="font-bold text-violet-600 dark:text-violet-400">{'{ '}{step.state}{' }'}</span>
                    {step.symbol !== null && (
                      <span className="text-gray-400">──<span className="text-amber-600 dark:text-amber-400 mx-0.5">{step.symbol}</span>──▶</span>
                    )}
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-500 text-[10px]">"{step.remaining}"</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── NFA Visual ────────────────────────────────────────────────────────────────

const NFAVisual: React.FC<{ states: string[]; transitions: NFATransition[]; start: string; accept: string[] }> = ({ states, transitions, start, accept }) => {
  if (states.length === 0) return <p className="text-xs text-gray-400 text-center py-8">No states defined.</p>;
  const r = 24;
  const cx = 180, cy = 120;
  const positions: Record<string, { x: number; y: number }> = {};
  states.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / states.length - Math.PI / 2;
    positions[s] = { x: cx + 100 * Math.cos(angle), y: cy + 100 * Math.sin(angle) };
  });

  return (
    <div className="bg-gray-50 dark:bg-black/20 rounded-[5px] border border-gray-100 dark:border-white/5 overflow-hidden flex items-center justify-center">
      <svg viewBox="0 0 360 240" className="w-full h-48">
        <defs>
          <marker id="arrowV" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-violet-500" />
          </marker>
          <marker id="arrowP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-purple-500" />
          </marker>
        </defs>
        <line x1={(positions[start]?.x || 0) - 50} y1={positions[start]?.y || 0} x2={(positions[start]?.x || 0) - r} y2={positions[start]?.y || 0}
          stroke="currentColor" strokeWidth="1.5" className="text-violet-500" markerEnd="url(#arrowV)" />
        {transitions.map((t, i) => {
          const from = positions[t.from], to = positions[t.to];
          if (!from || !to) return null;
          if (t.from === t.to) {
            return <path key={i} d={`M ${from.x} ${from.y - r} C ${from.x + 30} ${from.y - 50}, ${from.x - 30} ${from.y - 50}, ${from.x} ${from.y - r}`}
              fill="none" stroke="currentColor" strokeWidth="1.5" className={t.symbol === 'ε' ? 'text-purple-500' : 'text-violet-400'} />;
          }
          const dx = to.x - from.x, dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          const x1 = from.x + ux * r, y1 = from.y + uy * r;
          const x2 = to.x - ux * r, y2 = to.y - uy * r;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5"
                className={t.symbol === 'ε' ? 'text-purple-500' : 'text-violet-400'} />
              <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fontWeight="bold" fontFamily="monospace"
                className={t.symbol === 'ε' ? 'fill-current text-purple-600 dark:text-purple-400' : 'fill-current text-amber-600 dark:text-amber-400'}>{t.symbol}</text>
            </g>
          );
        })}
        {states.map(s => {
          const p = positions[s];
          if (!p) return null;
          const isAccept = accept.includes(s);
          return (
            <g key={s}>
              <circle cx={p.x} cy={p.y} r={r} fill="white" stroke={isAccept ? '#8b5cf6' : '#9ca3af'} strokeWidth="2" className="dark:fill-[#262636]" />
              {isAccept && <circle cx={p.x} cy={p.y} r={r - 4} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />}
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fontFamily="monospace" className="fill-current text-gray-700 dark:text-gray-200">{s}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGEX → NFA TAB (Thompson's Construction)
// ═══════════════════════════════════════════════════════════════════════════════

const EXAMPLES = [
  { label: 'a(b|c)*', regex: 'a(b|c)*' },
  { label: '(a|b)*abb', regex: '(a|b)*abb' },
  { label: '(ab|cd)*', regex: '(ab|cd)*' },
  { label: 'a*b', regex: 'a*b' },
  { label: '(a|b)*', regex: '(a|b)*' },
];

interface NFAFragment { start: string; accept: string; transitions: NFATransition[]; }

const Regex2NFATab: React.FC<{ toast: (t: ToastType, m: string) => void }> = ({ toast }) => {
  const [input, setInput] = useState('(a|b)*abb');
  const [result, setResult] = useState<NFA | null>(null);
  const [error, setError] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const toPostfix = (regex: string): string => {
    const precedence: Record<string, number> = { '|': 1, '.': 2, '*': 3, '+': 3, '?': 3 };
    const output: string[] = [];
    const stack: string[] = [];

    const insertConcat = (r: string): string => {
      let out = '';
      for (let i = 0; i < r.length; i++) {
        const c = r[i];
        if (c === '(' || c === '|') {
          out += c;
        } else if (c === ')' || c === '*') {
          out += c;
        } else if (c === '+' || c === '?') {
          out += c;
        } else {
          if (out.length > 0 && out[out.length - 1] !== '(' && out[out.length - 1] !== '|' && c !== '(' && c !== '|') {
            out += '.';
          }
          out += c;
        }
      }
      return out;
    };

    const expanded = insertConcat(regex);

    for (const c of expanded) {
      if (c === '(') {
        stack.push(c);
      } else if (c === ')') {
        while (stack.length && stack[stack.length - 1] !== '(') output.push(stack.pop()!);
        stack.pop();
      } else if (c in precedence) {
        while (stack.length && stack[stack.length - 1] !== '(' && precedence[stack[stack.length - 1]] >= precedence[c]) {
          output.push(stack.pop()!);
        }
        stack.push(c);
      } else {
        output.push(c);
      }
    }
    while (stack.length) output.push(stack.pop()!);
    return output.join('');
  };

  const buildNFA = (postfix: string): NFAFragment => {
    let counter = 0;
    const state = () => `q${counter++}`;
    const stack: NFAFragment[] = [];

    for (const c of postfix) {
      if (c === '.') {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push({
          start: a.start,
          accept: b.accept,
          transitions: [...a.transitions, ...b.transitions, { from: a.accept, symbol: 'ε', to: b.start }],
        });
      } else if (c === '|') {
        const b = stack.pop()!;
        const a = stack.pop()!;
        const s = state(), ac = state();
        stack.push({
          start: s, accept: ac,
          transitions: [
            { from: s, symbol: 'ε', to: a.start },
            { from: s, symbol: 'ε', to: b.start },
            ...a.transitions,
            ...b.transitions,
            { from: a.accept, symbol: 'ε', to: ac },
            { from: b.accept, symbol: 'ε', to: ac },
          ],
        });
      } else if (c === '*') {
        const a = stack.pop()!;
        const s = state(), ac = state();
        stack.push({
          start: s, accept: ac,
          transitions: [
            { from: s, symbol: 'ε', to: a.start },
            { from: s, symbol: 'ε', to: ac },
            ...a.transitions,
            { from: a.accept, symbol: 'ε', to: a.start },
            { from: a.accept, symbol: 'ε', to: ac },
          ],
        });
      } else if (c === '+') {
        const a = stack.pop()!;
        const s = state(), ac = state();
        stack.push({
          start: s, accept: ac,
          transitions: [
            { from: s, symbol: 'ε', to: a.start },
            ...a.transitions,
            { from: a.accept, symbol: 'ε', to: a.start },
            { from: a.accept, symbol: 'ε', to: ac },
          ],
        });
      } else if (c === '?') {
        const a = stack.pop()!;
        const s = state(), ac = state();
        stack.push({
          start: s, accept: ac,
          transitions: [
            { from: s, symbol: 'ε', to: a.start },
            { from: s, symbol: 'ε', to: ac },
            ...a.transitions,
            { from: a.accept, symbol: 'ε', to: ac },
          ],
        });
      } else {
        const s = state(), ac = state();
        stack.push({
          start: s, accept: ac,
          transitions: [{ from: s, symbol: c, to: ac }],
        });
      }
    }
    return stack[0];
  };

  const convert = useCallback(() => {
    if (!input.trim()) { toast('warn', 'Enter a regular expression.'); return; }
    setError('');
    setIsConverting(true);
    try {
      const postfix = toPostfix(input);
      const frag = buildNFA(postfix);
      const allStates = new Set<string>();
      const allSymbols = new Set<string>();
      frag.transitions.forEach(t => { allStates.add(t.from); allStates.add(t.to); if (t.symbol !== 'ε') allSymbols.add(t.symbol); });

      const sortedStates = [...allStates].sort();
      const nfa: NFA = {
        states: sortedStates,
        alphabet: [...allSymbols].sort(),
        transitions: frag.transitions,
        start: frag.start,
        accept: [frag.accept],
      };
      setResult(nfa);
      toast('success', `NFA built with ${sortedStates.length} states.`);
    } catch (e: any) {
      setError(e.message || 'Invalid regex.');
      toast('error', e.message || 'Invalid regex.');
    } finally {
      setIsConverting(false);
    }
  }, [input, toast]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black dark:text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-[5px] bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </span>
          Regular Expression → NFA (Thompson's Construction)
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: Input */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Regular Expression</p>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && convert()}
              placeholder="e.g. (a|b)*abb" className="w-full px-3 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-sm dark:text-white outline-none focus:ring-2 focus:ring-indigo-400 font-mono" />
            {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
            <button onClick={convert} disabled={isConverting}
              className="w-full px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1.5">
              {isConverting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Convert to NFA
            </button>
          </div>

          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Examples</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex => (
                <button key={ex.regex} onClick={() => setInput(ex.regex)}
                  className="px-2.5 py-1.5 text-[11px] font-mono rounded-[5px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-200 dark:border-indigo-500/20">
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversion steps explanation */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Thompson's Construction</p>
            <div className="space-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              <p><span className="font-bold text-indigo-600 dark:text-indigo-400">Literal:</span> Single character → two states with transition</p>
              <p><span className="font-bold text-indigo-600 dark:text-indigo-400">Concatenation (ab):</span> Connect first NFA's accept to second's start with ε</p>
              <p><span className="font-bold text-indigo-600 dark:text-indigo-400">Union (a|b):</span> New start/accept with ε-branches to each sub-NFA</p>
              <p><span className="font-bold text-indigo-600 dark:text-indigo-400">Kleene Star (a*):</span> New start/accept with ε-loops back and bypass</p>
            </div>
          </div>
        </div>

        {/* RIGHT: Result */}
        <div className="space-y-4">
          {result && (
            <>
              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">NFA Transition Diagram</p>
                <NFAVisual states={result.states} transitions={result.transitions} start={result.start} accept={result.accept} />
              </div>

              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">NFA Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="font-bold dark:text-white">States:</span> <span className="text-gray-500 font-mono">{result.states.length}</span></div>
                  <div><span className="font-bold dark:text-white">Alphabet:</span> <span className="text-gray-500 font-mono">{result.alphabet.join(', ')}</span></div>
                  <div><span className="font-bold dark:text-white">Start:</span> <span className="text-gray-500 font-mono">{result.start}</span></div>
                  <div><span className="font-bold dark:text-white">Accept:</span> <span className="text-gray-500 font-mono">{result.accept.join(', ')}</span></div>
                  <div><span className="font-bold dark:text-white">Transitions:</span> <span className="text-gray-500 font-mono">{result.transitions.length}</span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-gray-400 border-b border-gray-100 dark:border-white/5">
                        <th className="px-2 py-1 text-left">From</th>
                        <th className="px-2 py-1 text-left">Symbol</th>
                        <th className="px-2 py-1 text-left">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.transitions.map((t, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-white/5">
                          <td className="px-2 py-1.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.from}</td>
                          <td className={`px-2 py-1.5 font-mono ${t.symbol === 'ε' ? 'text-purple-600 dark:text-purple-400 font-bold' : ''}`}>{t.symbol}</td>
                          <td className="px-2 py-1.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!result && (
            <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-[5px] bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                <Code className="w-6 h-6 text-indigo-400" />
              </div>
              <p className="text-sm font-bold dark:text-white">Enter a regex to convert</p>
              <p className="text-xs text-gray-400">Supports: a-z, 0-9, |, *, +, ?, (), concatenation</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NFA → DFA TAB (Subset Construction)
// ═══════════════════════════════════════════════════════════════════════════════

const NFA2DFATab: React.FC<{ toast: (t: ToastType, m: string) => void }> = ({ toast }) => {
  const [nfaInput, setNfaInput] = useState('');
  const [dfaResult, setDfaResult] = useState<DFA | null>(null);
  const [conversionTable, setConversionTable] = useState<{ from: string; symbol: string; to: string }[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [showTable, setShowTable] = useState(true);

  // Parse simple NFA definition: state,symbol->state | state,eps->state per line
  const parseNfaInput = (input: string): NFA => {
    const lines = input.trim().split('\n').filter(l => l.trim());
    const states = new Set<string>();
    const alphabet = new Set<string>();
    const nfaTransitions: NFATransition[] = [];
    let start = '', accept: string[] = [];

    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('START:')) { start = l.slice(6).trim(); continue; }
      if (l.startsWith('ACCEPT:')) { accept = l.slice(7).split(',').map(s => s.trim()); continue; }

      // Parse: q0,a->q1 or q0,eps->q1
      const arrowIdx = l.indexOf('->');
      if (arrowIdx === -1) continue;
      const left = l.slice(0, arrowIdx).trim();
      const toState = l.slice(arrowIdx + 2).trim();
      const commaIdx = left.indexOf(',');
      if (commaIdx === -1) continue;
      const fromState = left.slice(0, commaIdx).trim();
      const sym = left.slice(commaIdx + 1).trim();

      states.add(fromState);
      states.add(toState);
      nfaTransitions.push({ from: fromState, symbol: sym === 'eps' ? 'ε' : sym, to: toState });
      if (sym !== 'eps' && sym !== 'ε') alphabet.add(sym);
    }

    if (!start) start = [...states][0] || '';
    if (states.size === 0) throw new Error('No states defined. Use format: q0,a->q1');
    return { states: [...states].sort(), alphabet: [...alphabet].sort(), transitions: nfaTransitions, start, accept };
  };

  const subsetConstruction = useCallback((nfa: NFA): { dfa: DFA; table: { from: string; symbol: string; to: string }[] } => {
    const epsilonClosure = (stateSet: Set<string>): Set<string> => {
      const closure = new Set(stateSet);
      const stack = [...stateSet];
      while (stack.length > 0) {
        const s = stack.pop()!;
        for (const t of nfa.transitions) {
          if (t.from === s && t.symbol === 'ε' && !closure.has(t.to)) {
            closure.add(t.to);
            stack.push(t.to);
          }
        }
      }
      return closure;
    };

    const move = (stateSet: Set<string>, symbol: string): Set<string> => {
      const result = new Set<string>();
      for (const s of stateSet) {
        for (const t of nfa.transitions) {
          if (t.from === s && t.symbol === symbol) result.add(t.to);
        }
      }
      return result;
    };

    const setKey = (s: Set<string>) => [...s].sort().join(',');

    const startClosure = epsilonClosure(new Set([nfa.start]));
    const unmarked: Set<string>[] = [startClosure];
    const visited = new Set<string>([setKey(startClosure)]);
    const dfaTransitions: DFATransition[] = [];
    const convTable: { from: string; symbol: string; to: string }[] = [];
    const stateMap = new Map<string, string>();
    let stateCounter = 0;
    stateMap.set(setKey(startClosure), `S${stateCounter++}`);

    while (unmarked.length > 0) {
      const current = unmarked.shift()!;
      const currentKey = setKey(current);
      const currentName = stateMap.get(currentKey)!;

      for (const sym of nfa.alphabet) {
        const moved = move(current, sym);
        const closure = epsilonClosure(moved);
        const closureKey = setKey(closure);

        if (closure.size === 0) continue;

        convTable.push({ from: currentName, symbol: sym, to: `[${closureKey}]` });

        if (!visited.has(closureKey)) {
          visited.add(closureKey);
          stateMap.set(closureKey, `S${stateCounter++}`);
          unmarked.push(closure);
        }
        dfaTransitions.push({ from: currentName, symbol: sym, to: stateMap.get(closureKey)! });
      }
    }

    // Fix conversion table with actual names
    const fixedTable = convTable.map(row => ({
      ...row,
      to: stateMap.get(setKey(epsilonClosure(new Set(row.to.slice(1, -1).split(','))))) || row.to,
    }));

    const dfaStates = [...stateMap.values()];
    const dfaAccept = dfaStates.filter(name => {
      const key = [...stateMap.entries()].find(([, v]) => v === name)?.[0] || '';
      const nfaStates = new Set(key.split(','));
      return [...nfaStates].some(s => nfa.accept.includes(s));
    });

    return {
      dfa: { states: dfaStates, alphabet: nfa.alphabet, transitions: dfaTransitions, start: dfaStates[0], accept: dfaAccept },
      table: fixedTable,
    };
  }, []);

  const convert = useCallback(() => {
    if (!nfaInput.trim()) { toast('warn', 'Enter NFA definition.'); return; }
    setIsConverting(true);
    try {
      const nfa = parseNfaInput(nfaInput);
      const { dfa, table } = subsetConstruction(nfa);
      setDfaResult(dfa);
      setConversionTable(table);
      toast('success', `DFA built with ${dfa.states.length} states.`);
    } catch (e: any) {
      toast('error', e.message || 'Failed to parse NFA.');
    } finally {
      setIsConverting(false);
    }
  }, [nfaInput, toast, subsetConstruction]);

  const loadExample = () => {
    setNfaInput(`START: q0
ACCEPT: q2
q0,a->q1
q0,a->q0
q0,b->q0
q1,b->q2`);
    setDfaResult(null);
    setConversionTable([]);
    toast('info', 'NFA (a|b)*abb loaded.');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black dark:text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-[5px] bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ArrowRightLeft className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </span>
          NFA → DFA (Subset Construction)
        </h2>
        <button onClick={loadExample}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-[5px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors flex items-center gap-1">
          <Upload className="w-3 h-3" /> Example
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: Input */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">NFA Definition</p>
            <textarea value={nfaInput} onChange={e => setNfaInput(e.target.value)}
              placeholder={"q0,a->q1\nq0,b->q0\nq1,a->q2\nq2,b->q2\nSTART: q0\nACCEPT: q2"}
              className="w-full h-40 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none focus:ring-2 focus:ring-amber-400 font-mono resize-none" />
            <p className="text-[10px] text-gray-400">Format: <code className="bg-gray-100 dark:bg-white/5 px-1 rounded">q0,a→q1</code> per line. Use <code className="bg-gray-100 dark:bg-white/5 px-1 rounded">eps</code> for ε-transitions.</p>
            <button onClick={convert} disabled={isConverting}
              className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1.5">
              {isConverting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Convert to DFA
            </button>
          </div>

          {/* Algorithm explanation */}
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Subset Construction Algorithm</p>
            <div className="space-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              <p><span className="font-bold text-amber-600 dark:text-amber-400">1.</span> Compute ε-closure of start state</p>
              <p><span className="font-bold text-amber-600 dark:text-amber-400">2.</span> For each unmarked subset and each input symbol, compute move + ε-closure</p>
              <p><span className="font-bold text-amber-600 dark:text-amber-400">3.</span> Create DFA state for each new subset discovered</p>
              <p><span className="font-bold text-amber-600 dark:text-amber-400">4.</span> A DFA state is accepting if its subset contains any NFA accepting state</p>
            </div>
          </div>
        </div>

        {/* RIGHT: Result */}
        <div className="space-y-4">
          {dfaResult && (
            <>
              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Resulting DFA</p>
                <DFAVisual states={dfaResult.states} transitions={dfaResult.transitions} start={dfaResult.start} accept={dfaResult.accept} />
              </div>

              {/* Conversion table */}
              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Subset Construction Table</p>
                  <button onClick={() => setShowTable(v => !v)} className="text-gray-400 hover:text-gray-600">
                    {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {showTable && conversionTable.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black uppercase text-gray-400 border-b border-gray-100 dark:border-white/5">
                          <th className="px-2 py-1 text-left">DFA State</th>
                          <th className="px-2 py-1 text-left">Symbol</th>
                          <th className="px-2 py-1 text-left">Next DFA State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversionTable.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-white/5">
                            <td className="px-2 py-1.5 font-mono font-bold text-amber-600 dark:text-amber-400">{row.from}</td>
                            <td className="px-2 py-1.5 font-mono">{row.symbol}</td>
                            <td className="px-2 py-1.5 font-mono font-bold text-amber-600 dark:text-amber-400">{row.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">DFA Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="font-bold dark:text-white">States:</span> <span className="text-gray-500 font-mono">{dfaResult.states.length}</span></div>
                  <div><span className="font-bold dark:text-white">Alphabet:</span> <span className="text-gray-500 font-mono">{dfaResult.alphabet.join(', ')}</span></div>
                  <div><span className="font-bold dark:text-white">Transitions:</span> <span className="text-gray-500 font-mono">{dfaResult.transitions.length}</span></div>
                  <div><span className="font-bold dark:text-white">Accept:</span> <span className="text-gray-500 font-mono">{dfaResult.accept.join(', ')}</span></div>
                </div>
              </div>
            </>
          )}

          {!dfaResult && (
            <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-[5px] bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <ArrowRightLeft className="w-6 h-6 text-amber-400" />
              </div>
              <p className="text-sm font-bold dark:text-white">Enter an NFA to convert</p>
              <p className="text-xs text-gray-400">Each line: q0,a→q1 (use "eps" for ε-transitions)</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DFA MINIMIZE TAB (Table-Filling Algorithm)
// ═══════════════════════════════════════════════════════════════════════════════

const DFAMinTab: React.FC<{ toast: (t: ToastType, m: string) => void }> = ({ toast }) => {
  const [dfaInput, setDfaInput] = useState('');
  const [originalDFA, setOriginalDFA] = useState<DFA | null>(null);
  const [minDFA, setMinDFA] = useState<DFA | null>(null);
  const [markTable, setMarkTable] = useState<Record<string, boolean>>({});
  const [equivClasses, setEquivClasses] = useState<string[][]>([]);
  const [showMarkTable, setShowMarkTable] = useState(true);
  const [isMinimizing, setIsMinimizing] = useState(false);

  const parseDfaInput = (input: string): DFA => {
    const lines = input.trim().split('\n').filter(l => l.trim());
    const states = new Set<string>();
    const alphabet = new Set<string>();
    const dfaTransitions: DFATransition[] = [];
    let start = '', accept: string[] = [];

    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('START:')) { start = l.slice(6).trim(); continue; }
      if (l.startsWith('ACCEPT:')) { accept = l.slice(7).split(',').map(s => s.trim()); continue; }

      const arrowIdx = l.indexOf('->');
      if (arrowIdx === -1) continue;
      const left = l.slice(0, arrowIdx).trim();
      const toState = l.slice(arrowIdx + 2).trim();
      const commaIdx = left.indexOf(',');
      if (commaIdx === -1) continue;
      const fromState = left.slice(0, commaIdx).trim();
      const sym = left.slice(commaIdx + 1).trim();

      states.add(fromState);
      states.add(toState);
      dfaTransitions.push({ from: fromState, symbol: sym, to: toState });
      alphabet.add(sym);
    }

    if (!start) start = [...states][0] || '';
    if (states.size === 0) throw new Error('No states defined.');
    return { states: [...states].sort(), alphabet: [...alphabet].sort(), transitions: dfaTransitions, start, accept };
  };

  const minimizeDFA = useCallback((dfa: DFA): { minimized: DFA; marks: Record<string, boolean>; classes: string[][] } => {
    const n = dfa.states.length;
    const stateIdx: Record<string, number> = {};
    dfa.states.forEach((s, i) => { stateIdx[s] = i; });

    // Table-filling: distinguish pairs
    const dist: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    const marks: Record<string, boolean> = {};

    // Step 1: Mark pairs (accept, non-accept)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = dfa.states[i], sj = dfa.states[j];
        const key = `${si},${sj}`;
        if (dfa.accept.includes(si) !== dfa.accept.includes(sj)) {
          dist[i][j] = dist[j][i] = true;
          marks[key] = true;
        }
      }
    }

    // Step 2: Iteratively mark
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (dist[i][j]) continue;
          for (const sym of dfa.alphabet) {
            const ti = dfa.transitions.find(t => t.from === dfa.states[i] && t.symbol === sym);
            const tj = dfa.transitions.find(t => t.from === dfa.states[j] && t.symbol === sym);
            if (!ti || !tj) continue;
            const di = stateIdx[ti.to], dj = stateIdx[tj.to];
            if (di !== undefined && dj !== undefined && dist[di][dj]) {
              dist[i][j] = dist[j][i] = true;
              marks[`${dfa.states[i]},${dfa.states[j]}`] = true;
              changed = true;
              break;
            }
          }
        }
      }
    }

    // Step 3: Equivalence classes
    const classes: string[][] = [];
    const assigned = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (assigned.has(i)) continue;
      const cls = [dfa.states[i]];
      assigned.add(i);
      for (let j = i + 1; j < n; j++) {
        if (assigned.has(j)) continue;
        if (!dist[i][j]) {
          cls.push(dfa.states[j]);
          assigned.add(j);
        }
      }
      classes.push(cls.sort());
    }

    // Build minimized DFA
    const classRep: Record<string, string> = {};
    classes.forEach(cls => {
      cls.forEach(s => { classRep[s] = cls[0]; });
    });

    const minStates = classes.map(cls => cls[0]).sort();
    const minStart = classRep[dfa.start];
    const minAccept = [...new Set(dfa.accept.map(s => classRep[s]))].filter(Boolean);
    const minTransitions: DFATransition[] = [];
    const seenTransitions = new Set<string>();

    for (const cls of classes) {
      for (const sym of dfa.alphabet) {
        const tr = dfa.transitions.find(t => t.from === cls[0] && t.symbol === sym);
        if (tr) {
          const to = classRep[tr.to];
          const key = `${cls[0]},${sym}`;
          if (!seenTransitions.has(key)) {
            seenTransitions.add(key);
            minTransitions.push({ from: cls[0], symbol: sym, to });
          }
        }
      }
    }

    const minimized: DFA = { states: minStates, alphabet: dfa.alphabet, transitions: minTransitions, start: minStart, accept: minAccept };
    return { minimized, marks, classes };
  }, []);

  const minimize = useCallback(() => {
    if (!dfaInput.trim()) { toast('warn', 'Enter DFA definition.'); return; }
    setIsMinimizing(true);
    try {
      const dfa = parseDfaInput(dfaInput);
      setOriginalDFA(dfa);
      const { minimized, marks, classes } = minimizeDFA(dfa);
      setMinDFA(minimized);
      setMarkTable(marks);
      setEquivClasses(classes);
      toast('success', `DFA minimized: ${dfa.states.length} → ${minimized.states.length} states.`);
    } catch (e: any) {
      toast('error', e.message || 'Failed to parse DFA.');
    } finally {
      setIsMinimizing(false);
    }
  }, [dfaInput, toast, minimizeDFA]);

  const loadExample = () => {
    setDfaInput(`START: A
ACCEPT: C,D
A,0->B
A,1->C
B,0->B
B,1->D
C,0->B
C,1->C
D,0->B
D,1->C`);
    setOriginalDFA(null);
    setMinDFA(null);
    setMarkTable({});
    setEquivClasses([]);
    toast('info', 'DFA example loaded.');
  };

  const stateColor = (states: string[], s: string) => {
    const idx = states.indexOf(s);
    const colors = ['emerald', 'violet', 'indigo', 'amber', 'rose', 'cyan', 'orange'];
    return colors[idx % colors.length];
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black dark:text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-[5px] bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </span>
          DFA Minimization (Table-Filling)
        </h2>
        <button onClick={loadExample}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-[5px] bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center gap-1">
          <Upload className="w-3 h-3" /> Example
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: Input */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">DFA Definition</p>
            <textarea value={dfaInput} onChange={e => setDfaInput(e.target.value)}
              placeholder={"A,0->B\nA,1->C\nB,0->B\nB,1->D\nC,0->B\nC,1->C\nD,0->B\nD,1->C\nSTART: A\nACCEPT: C,D"}
              className="w-full h-40 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[5px] text-xs dark:text-white outline-none focus:ring-2 focus:ring-rose-400 font-mono resize-none" />
            <p className="text-[10px] text-gray-400">Format: <code className="bg-gray-100 dark:bg-white/5 px-1 rounded">A,0→B</code> per line</p>
            <button onClick={minimize} disabled={isMinimizing}
              className="w-full px-4 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-bold rounded-[5px] transition-colors flex items-center justify-center gap-1.5">
              {isMinimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Minimize DFA
            </button>
          </div>

          <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Table-Filling Algorithm</p>
            <div className="space-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              <p><span className="font-bold text-rose-600 dark:text-rose-400">1.</span> Mark all (p,q) pairs where p is accepting and q is not</p>
              <p><span className="font-bold text-rose-600 dark:text-rose-400">2.</span> For each unmarked pair (p,q), mark it if δ(p,a) and δ(q,a) are marked for some symbol a</p>
              <p><span className="font-bold text-rose-600 dark:text-rose-400">3.</span> Repeat until no more markings possible</p>
              <p><span className="font-bold text-rose-600 dark:text-rose-400">4.</span> Merge unmarked (equivalent) states into single states</p>
            </div>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="space-y-4">
          {originalDFA && minDFA && (
            <>
              {/* Marking table */}
              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Distinguishing Table</p>
                  <button onClick={() => setShowMarkTable(v => !v)} className="text-gray-400 hover:text-gray-600">
                    {showMarkTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {showMarkTable && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black uppercase text-gray-400">
                          <th className="px-2 py-1"></th>
                          {originalDFA.states.map(s => (
                            <th key={s} className="px-2 py-1 text-center font-mono">{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {originalDFA.states.map((si, i) => (
                          <tr key={si} className="border-t border-gray-100 dark:border-white/5">
                            <td className="px-2 py-1.5 font-mono font-bold text-rose-600 dark:text-rose-400">{si}</td>
                            {originalDFA.states.map((sj, j) => {
                              if (j <= i) return <td key={sj} className="px-2 py-1.5 text-center text-gray-300">—</td>;
                              const key = `${si},${sj}`;
                              const isMarked = markTable[key] || false;
                              return (
                                <td key={sj} className={`px-2 py-1.5 text-center font-bold ${isMarked ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {isMarked ? '×' : '○'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span><span className="text-red-500 font-bold">×</span> = Distinguishable (marked)</span>
                  <span><span className="text-emerald-500 font-bold">○</span> = Equivalent (unmarked)</span>
                </div>
              </div>

              {/* Equivalence classes */}
              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Equivalence Classes</p>
                <div className="flex flex-wrap gap-2">
                  {equivClasses.map((cls, i) => (
                    <div key={i} className={`px-3 py-1.5 rounded-[5px] text-xs font-mono font-bold border border-${stateColor(originalDFA.states, cls[0])}-300 dark:border-${stateColor(originalDFA.states, cls[0])}-500/30 bg-${stateColor(originalDFA.states, cls[0])}-50 dark:bg-${stateColor(originalDFA.states, cls[0])}-900/20 text-${stateColor(originalDFA.states, cls[0])}-700 dark:text-${stateColor(originalDFA.states, cls[0])}-300`}>
                      {'{' + cls.join(', ') + '}'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Original vs Minimized */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Original DFA</p>
                  <DFAVisual states={originalDFA.states} transitions={originalDFA.transitions} start={originalDFA.start} accept={originalDFA.accept} />
                  <div className="text-center text-xs font-bold dark:text-white">{originalDFA.states.length} states</div>
                </div>
                <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Minimized DFA</p>
                  <DFAVisual states={minDFA.states} transitions={minDFA.transitions} start={minDFA.start} accept={minDFA.accept} />
                  <div className="text-center text-xs font-bold dark:text-white">{minDFA.states.length} states</div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Minimization Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="font-bold dark:text-white">Original states:</span> <span className="text-gray-500 font-mono">{originalDFA.states.length}</span></div>
                  <div><span className="font-bold dark:text-white">Minimized states:</span> <span className="text-gray-500 font-mono">{minDFA.states.length}</span></div>
                  <div><span className="font-bold dark:text-white">States removed:</span> <span className="text-gray-500 font-mono">{originalDFA.states.length - minDFA.states.length}</span></div>
                  <div><span className="font-bold dark:text-white">Reduction:</span> <span className="text-gray-500 font-mono">{originalDFA.states.length > 0 ? Math.round((1 - minDFA.states.length / originalDFA.states.length) * 100) : 0}%</span></div>
                </div>
              </div>
            </>
          )}

          {!originalDFA && (
            <div className="bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-[5px] bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-rose-400" />
              </div>
              <p className="text-sm font-bold dark:text-white">Enter a DFA to minimize</p>
              <p className="text-xs text-gray-400">Uses Hopcroft's table-filling algorithm</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// AI SOLVE TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  automata?: AutomataData[];
}

const AISolveTab: React.FC<{ toast: (type: ToastType, msg: string) => void }> = ({ toast }) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleFiles = async (newFiles: FileList | File[]) => {
    const fileArr = Array.from(newFiles);
    setFiles(prev => [...prev, ...fileArr]);
    setExtracting(true);

    try {
      let allText = '';
      for (const f of fileArr) {
        const text = await extractTextFromFile(f);
        allText += `\n\n📄 ${f.name}:\n${text}`;
      }
      setExtractedText(prev => prev + allText);
      toast('success', `Extracted text from ${fileArr.length} file(s).`);
    } catch (e: any) {
      toast('error', `Failed to extract text: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const sendMessage = async () => {
    if (!input.trim() && !extractedText.trim()) return;
    if (loading) return;

    const userMsg: AIMessage = {
      role: 'user',
      content: input.trim() || 'Solve all automata questions from the uploaded file. Show step-by-step solutions with diagrams for each question.',
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const fileContext = extractedText.trim()
        ? `\n\n===== UPLOADED FILE CONTENT START =====\nThe user has uploaded the following file(s). ALL questions come from these files. You MUST analyze the content below and solve every question found.\n${extractedText}\n===== UPLOADED FILE CONTENT END =====\n\nIMPORTANT: The questions are in the file content above. Read them carefully and solve each one with step-by-step explanations and diagrams.`
        : '';

      const questionPart = input.trim()
        ? `\n\nUser instruction: ${input.trim()}`
        : '';

      const fullUserMessage = `${fileContext}${questionPart || '\n\nPlease solve all automata theory questions from the uploaded file(s) above. Show complete step-by-step solutions with state diagrams.'}`;

      const aiMessages = [
        { role: 'system' as const, content: AUTOMATA_SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: fullUserMessage },
      ];

      const response = await askAutomataAI(aiMessages, { max_tokens: 12000 });
      const automata = extractAutomataData(response);

      setMessages(prev => [...prev, { role: 'assistant', content: response, automata }]);
    } catch (e: any) {
      toast('error', e.message || 'AI request failed.');
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast('success', 'Copied to clipboard.');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full max-h-[calc(100vh-200px)]">

      {/* File Upload Area */}
      <div className="shrink-0 mb-4">
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-cyan-300 dark:border-cyan-700 rounded-[5px] p-6 text-center cursor-pointer hover:border-cyan-500 dark:hover:border-cyan-500 transition-colors bg-white dark:bg-[#262636]"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
          {extracting ? (
            <div className="flex items-center justify-center gap-2 text-cyan-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-bold">Extracting text...</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto mb-2 text-cyan-500" />
              <p className="text-sm font-bold dark:text-white">Drop PDF, DOCX, TXT, or Image files here</p>
              <p className="text-[11px] text-gray-400 mt-1">or click to browse • AI will analyze and solve automata questions</p>
            </>
          )}
        </div>

        {/* Uploaded files list */}
        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-[5px] text-xs">
                {f.type.includes('pdf') ? <FileText className="w-3.5 h-3.5 text-cyan-600" /> :
                  f.type.includes('image') ? <Image className="w-3.5 h-3.5 text-cyan-600" /> :
                    <File className="w-3.5 h-3.5 text-cyan-600" />}
                <span className="font-bold text-cyan-800 dark:text-cyan-300 max-w-[120px] truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} className="text-cyan-400 hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#262636] border border-gray-100 dark:border-white/5 rounded-[5px] p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 mx-auto mb-3 text-cyan-500 opacity-40" />
            <p className="text-sm font-bold dark:text-white">Automata Theory AI Solver</p>
            <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto">
              Upload a file with automata questions or type your question below.
              AI will solve it step-by-step with diagrams.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {['Convert regex (a|b)*abb to NFA', 'Minimize this DFA', 'Design DFA for strings ending with 01', 'Is this language regular?'].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-[5px] text-[11px] font-bold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-[5px] px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-500">AI Solver</span>
                </div>
              )}
              <div className={msg.role === 'user' ? 'text-white' : 'dark:text-gray-200'}>
                {msg.content.split('\n').map((line, j) => {
                  if (line.startsWith('```mermaid')) return null;
                  if (line.startsWith('```')) return null;
                  if (line.startsWith('---')) return <hr key={j} className="my-2 border-gray-200 dark:border-white/10" />;
                  if (line.startsWith('**') && line.endsWith('**')) return <p key={j} className="font-bold mt-2">{line.replace(/\*\*/g, '')}</p>;
                  if (line.startsWith('- ')) return <li key={j} className="ml-4 list-disc text-xs">{line.slice(2)}</li>;
                  if (line.match(/^\d+\./)) return <li key={j} className="ml-4 list-decimal text-xs">{line}</li>;
                  return <p key={j} className="leading-relaxed">{line || <br />}</p>;
                })}
              </div>

              {/* Render Automata diagrams from JSON data */}
              {msg.automata && msg.automata.length > 0 && (
                <div className="mt-3 space-y-3">
                  {msg.automata.map((auto, ai) => (
                    <div key={ai}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">{auto.label}</p>
                      <AutomataDiagram data={auto} />
                    </div>
                  ))}
                </div>
              )}

              {msg.role === 'assistant' && (
                <button onClick={() => copyMessage(msg.content)}
                  className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-500 transition-colors">
                  <Copy className="w-3 h-3" /> Copy
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-[5px] px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
              <span className="text-xs font-bold text-gray-400">Solving...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 mt-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask an automata question or describe the problem..."
          className="flex-1 px-4 py-2.5 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/10 rounded-[5px] text-sm font-medium dark:text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={loading || (!input.trim() && !extractedText.trim())}
          className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-[5px] transition-colors shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

// ── Mermaid Diagram Renderer (client-side) ──────────────────────────────────

// ── Custom SVG Automata Diagram Renderer ─────────────────────────────────────

const AutomataDiagram: React.FC<{ data: AutomataData }> = ({ data }) => {
  const { states, transitions, start, accept } = data;

  // Layout: arrange states in a circle
  const width = Math.max(320, states.length * 80);
  const height = Math.max(220, states.length * 60);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;

  const statePositions: Record<string, { x: number; y: number }> = {};
  states.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / states.length - Math.PI / 2;
    statePositions[s] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  // Group transitions by from+to to merge labels
  const transitionMap = new Map<string, string[]>();
  transitions.forEach(t => {
    const key = `${t.from}->${t.to}`;
    if (!transitionMap.has(key)) transitionMap.set(key, []);
    transitionMap.get(key)!.push(t.symbol);
  });

  const r = 22; // state circle radius

  return (
    <div className="bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-white/10 rounded-[5px] p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full max-w-md mx-auto" style={{ minHeight: 160 }}>
        {/* Start arrow */}
        {statePositions[start] && (
          <>
            <defs>
              <marker id={`arrow-${start}`} viewBox="0 0 10 10" refX="10" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
              </marker>
            </defs>
            <line
              x1={statePositions[start].x - radius - 20}
              y1={statePositions[start].y}
              x2={statePositions[start].x - r - 2}
              y2={statePositions[start].y}
              stroke="#6b7280" strokeWidth="2" markerEnd={`url(#arrow-${start})`}
            />
            <text
              x={statePositions[start].x - radius - 25}
              y={statePositions[start].y + 4}
              textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="monospace">start</text>
          </>
        )}

        {/* Transitions */}
        {Array.from(transitionMap.entries()).map(([key, symbols]) => {
          const [from, to] = key.split('->');
          const fromPos = statePositions[from];
          const toPos = statePositions[to];
          if (!fromPos || !toPos) return null;

          const label = symbols.join(', ');
          const isSelfLoop = from === to;

          if (isSelfLoop) {
            // Self-loop: arc above the state
            const loopX = fromPos.x;
            const loopY = fromPos.y - r - 18;
            return (
              <g key={key}>
                <path
                  d={`M ${fromPos.x - 12} ${fromPos.y - r + 2} C ${fromPos.x - 20} ${loopY - 15}, ${fromPos.x + 20} ${loopY - 15}, ${fromPos.x + 12} ${fromPos.y - r + 2}`}
                  fill="none" stroke="#6b7280" strokeWidth="1.5"
                  markerEnd="url(#arrow-gray)"
                />
                <rect x={loopX - 16} y={loopY - 10} width={Math.max(label.length * 8, 24)} height="16" rx="3"
                  fill="white" stroke="none" className="dark:fill-[#1e1e2e]" />
                <text x={loopX} y={loopY + 2} textAnchor="middle" fontSize="11" fontWeight="bold"
                  fill="#6b7280" fontFamily="monospace">{label}</text>
              </g>
            );
          }

          // Normal transition: arrow between two different states
          const dx = toPos.x - fromPos.x;
          const dy = toPos.y - fromPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / dist;
          const ny = dy / dist;

          // Start from edge of source circle, end at edge of target circle
          const x1 = fromPos.x + nx * r;
          const y1 = fromPos.y + ny * r;
          const x2 = toPos.x - nx * r;
          const y2 = toPos.y - ny * r;

          // Check if reverse transition exists to offset labels
          const reverseKey = `${to}->${from}`;
          const hasReverse = transitionMap.has(reverseKey);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const offsetX = hasReverse ? -ny * 12 : 0;
          const offsetY = hasReverse ? nx * 12 : 0;

          return (
            <g key={key}>
              <defs>
                <marker id={`arrow-${from}-${to}`} viewBox="0 0 10 10" refX="10" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
                </marker>
              </defs>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#6b7280" strokeWidth="1.5" markerEnd={`url(#arrow-${from}-${to})`} />
              <rect x={midX + offsetX - (label.length * 4)} y={midY + offsetY - 8}
                width={Math.max(label.length * 8, 16)} height="16" rx="3"
                fill="white" stroke="none" className="dark:fill-[#1e1e2e]" />
              <text x={midX + offsetX} y={midY + offsetY + 4} textAnchor="middle" fontSize="11" fontWeight="bold"
                fill="#6b7280" fontFamily="monospace">{label}</text>
            </g>
          );
        })}

        {/* States */}
        {states.map(s => {
          const pos = statePositions[s];
          const isAccept = accept.includes(s);
          return (
            <g key={s}>
              <circle cx={pos.x} cy={pos.y} r={r}
                fill={isAccept ? '#ecfdf5' : '#f9fafb'}
                stroke={isAccept ? '#10b981' : '#374151'} strokeWidth="2"
                className={isAccept ? 'dark:fill-emerald-900/30 dark:stroke-emerald-500' : 'dark:fill-white/5 dark:stroke-gray-400'}
              />
              {isAccept && (
                <circle cx={pos.x} cy={pos.y} r={r - 4}
                  fill="none" stroke={isAccept ? '#10b981' : '#374151'} strokeWidth="1.5"
                  className={isAccept ? 'dark:stroke-emerald-500' : 'dark:stroke-gray-400'}
                />
              )}
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="12" fontWeight="bold"
                fill="#111827" fontFamily="monospace"
                className="dark:fill-white">{s}</text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#f9fafb" stroke="#374151" strokeWidth="1.5" className="dark:fill-white/5 dark:stroke-gray-400" /></svg>
          State
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" /><circle cx="7" cy="7" r="3" fill="none" stroke="#10b981" strokeWidth="1" className="dark:stroke-emerald-500" /></svg>
          Accept
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="14"><line x1="2" y1="7" x2="12" y2="7" stroke="#6b7280" strokeWidth="1.5" /><polygon points="12,4 14,7 12,10" fill="#6b7280" /></svg>
          Transition
        </span>
      </div>
    </div>
  );
};

export default AutomataTheorySolver;
