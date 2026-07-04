import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppContext } from '../App';
import { Sun, Moon } from 'lucide-react';

interface HeaderProps {
  icon?: React.ElementType;
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ icon: Icon, title }) => {
  const { theme, setTheme } = useContext(AppContext);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="hidden lg:flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-white/5 shrink-0 sticky top-0 z-50 bg-[#f3f1ea] dark:bg-[#020617]">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-9 h-9 bg-gray-900 dark:bg-white rounded-[5px] flex items-center justify-center text-white dark:text-gray-900 shadow-lg">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden sm:block text-xs font-mono text-gray-500 dark:text-gray-400 tabular-nums">
          {now.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          {' · '}
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="group relative flex items-center justify-center w-8 h-8 rounded-[5px] bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-brand-500/50 transition-all duration-300 overflow-hidden"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <AnimatePresence mode="wait">
            {theme === 'dark' ? (
              <motion.div
                key="sun"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Sun className="w-4 h-4 text-yellow-500" />
              </motion.div>
            ) : (
              <motion.div
                key="moon"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Moon className="w-4 h-4 text-gray-600" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </header>
  );
};
