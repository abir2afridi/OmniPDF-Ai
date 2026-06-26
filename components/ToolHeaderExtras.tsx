import React, { useState, useEffect, useContext } from 'react';
import { Sun, Moon } from 'lucide-react';
import { AppContext } from '../App';

export const ToolHeaderExtras: React.FC = () => {
  const { theme, setTheme } = useContext(AppContext);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-1 lg:mx-2" />
      <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        {' '}
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-brand-500/50 transition-all"
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </button>
    </>
  );
};
