import React, { useContext } from 'react';
import { Home, Settings, Bot, Layers, Command, LayoutGrid, TrendingUp, UserCheck, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { AppView } from '../types';
import { AppContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, onClose }) => {
  const { t } = useContext(AppContext);

  const navItems = [
    { id: AppView.DASHBOARD, icon: LayoutGrid, label: t('All Tools'), color: 'text-indigo-500' },
    { id: AppView.WORKSPACE, icon: Layers, label: t('Workspace'), color: 'text-purple-500' },
    { id: AppView.AI_LAB, icon: Bot, label: t('AI Lab'), color: 'text-emerald-500' },
    { id: AppView.ANALYTICS, icon: TrendingUp, label: t('Analytics'), color: 'text-amber-500' },
    { id: AppView.E_SIGN, icon: UserCheck, label: t('E-Sign'), color: 'text-rose-500' },
    { id: AppView.SETTINGS, icon: Settings, label: t('Settings'), color: 'text-gray-500' },
  ];

  const containerVariants = {
    hidden: { x: -100, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 20,
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { x: -20, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay - High Fidelity */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={`fixed inset-y-0 left-0 z-[70] w-[88px] flex flex-col items-center py-6 transition-all duration-700
          bg-white/80 dark:bg-slate-900/90 backdrop-blur-2xl border-r border-gray-100 dark:border-white/5 shadow-[20px_0_40px_rgba(0,0,0,0.02)]
          lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Dynamic Logo Section */}
        <div className="mb-10 relative group px-2">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setView(AppView.DASHBOARD)}
            className="w-14 h-14 bg-gradient-to-tr from-brand-600 to-indigo-600 rounded-[1.25rem] shadow-2xl shadow-brand-500/30 text-white flex items-center justify-center cursor-pointer relative overflow-hidden ring-4 ring-brand-500/10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)]" />
            <Command className="w-7 h-7 relative z-10" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-md">
              <Sparkles className="w-3 h-3 text-brand-600" />
            </div>
          </motion.div>

          {/* Pulsating Indicator for "Online/Live" */}
          <div className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white dark:border-slate-900"></span>
          </div>
        </div>

        {/* High Fidelity Navigation */}
        <nav className="flex-1 flex flex-col gap-4 w-full px-3">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <motion.button
                key={item.id}
                variants={itemVariants}
                onClick={() => {
                  setView(item.id);
                  if (window.innerWidth < 1024 && onClose) onClose();
                }}
                className={`group relative flex flex-col items-center justify-center w-full py-4 rounded-2xl transition-all duration-300
                  ${isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
              >
                {/* Active "Liquid" Indicator */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-bg"
                      className="absolute inset-0 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl z-0"
                      transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                      initial={false}
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10 flex flex-col items-center">
                  <motion.div
                    animate={isActive ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <item.icon className={`w-5 h-5 mb-1.5 transition-all duration-300 
                      ${isActive ? `drop-shadow-[0_0_8px_currentColor]` : 'group-hover:scale-110'}`}
                    />
                  </motion.div>
                  <span className={`text-[8px] font-black uppercase tracking-[0.1em] transition-all duration-300
                    ${isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}>
                    {item.label}
                  </span>
                </div>

                {/* Left Accent Strip */}
                {isActive && (
                  <motion.div
                    layoutId="accent-strip"
                    className="absolute -left-1 w-1.5 h-8 bg-brand-600 dark:bg-brand-500 rounded-r-full shadow-lg shadow-brand-500/40"
                  />
                )}

                {/* Premium Hover Card (Tooltip) */}
                <div className="hidden lg:block absolute left-full ml-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 pointer-events-none z-[100]">
                  <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-2xl border border-white/10 dark:border-black/5 whitespace-nowrap flex items-center gap-3">
                    <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                    {item.label}
                  </div>
                  {/* Tooltip Chevron */}
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 dark:bg-white rotate-45" />
                </div>
              </motion.button>
            );
          })}
        </nav>

        {/* User Workspace Section */}
        <div className="mt-auto pt-6 flex flex-col items-center gap-6 w-full px-2">
          <div className="h-px w-10 bg-gray-100 dark:bg-white/5" />

          <motion.div
            whileHover={{ scale: 1.1 }}
            className="relative group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-500 p-[1.5px] shadow-xl">
              <div className="w-full h-full rounded-2xl bg-white dark:bg-slate-900 overflow-hidden border-2 border-transparent">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Abir"
                  alt="User"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Status Indicator */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>

            {/* Account Tooltip */}
            <div className="hidden lg:block absolute bottom-0 left-full ml-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 pointer-events-none z-[100]">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-gray-100 dark:border-white/10 w-48">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-wider">Premium Access</h4>
                    <p className="text-[8px] font-bold text-gray-400">Pro Account Active</p>
                  </div>
                </div>
                <button className="w-full py-2 bg-gray-50 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                  <LogOut className="w-3 h-3" />
                  {t('Logout') || 'Log Out'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.aside>
    </>
  );
};