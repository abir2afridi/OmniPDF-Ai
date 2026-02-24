import React, { useContext, useState, useEffect } from 'react';
import { Settings, Bot, Layers, Command, LayoutGrid, TrendingUp, UserCheck, LogOut, ShieldCheck, Sparkles, History, ChevronDown, User, Info, PhoneCall, HelpCircle, CreditCard } from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { AppView } from '../types';
import { AppContext } from '../App';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, onClose, onLogout }) => {
  const { t } = useContext(AppContext);
  const [isHovered, setIsHovered] = useState(false);

  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isUserFeaturesExpanded, setIsUserFeaturesExpanded] = useState(false);
  const [isSupportExpanded, setIsSupportExpanded] = useState(false);

  // User Profile State
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setUser(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const navItems = [
    { id: AppView.DASHBOARD, icon: LayoutGrid, label: t('All Tools'), color: 'text-indigo-500' },
    { id: AppView.WORKSPACE, icon: Layers, label: t('Workspace'), color: 'text-purple-500' },
    { id: AppView.AI_LAB, icon: Bot, label: t('AI Lab'), color: 'text-emerald-500' },
    { id: AppView.ANALYTICS, icon: TrendingUp, label: t('Analytics'), color: 'text-amber-500' },
    { id: AppView.E_SIGN, icon: UserCheck, label: t('E-Sign'), color: 'text-rose-500' },
    { id: AppView.HISTORY, icon: History, label: t('History'), color: 'text-blue-500' },
    {
      id: 'USER_FEATURES',
      icon: Command,
      label: t('User Features'),
      color: 'text-brand-500',
      subItems: [
        { id: AppView.SETTINGS_ACCOUNT, label: t('Account'), icon: User },
        { id: AppView.SETTINGS_WORKSPACE, label: t('Workspace'), icon: ShieldCheck },
        { id: AppView.SETTINGS_BILLING, label: t('Billing & Plans'), icon: CreditCard },
      ]
    },
    {
      id: AppView.SETTINGS,
      icon: Settings,
      label: t('Settings'),
      color: 'text-gray-500',
    },
    {
      id: 'SUPPORT',
      icon: HelpCircle,
      label: t('About & Support'),
      color: 'text-brand-400',
      subItems: [
        { id: AppView.ABOUT, label: t('About'), icon: Info },
        { id: AppView.CONTACT, label: t('Contact'), icon: PhoneCall },
      ]
    },
  ];

  const sidebarWidth = (isHovered || isOpen) ? 260 : 88;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
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
        initial={false}
        animate={{ width: sidebarWidth }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsSettingsExpanded(false);
        }}
        className={`fixed inset-y-0 left-0 z-[70] flex flex-col py-6 
          bg-[#210c6e] dark:bg-[#210c6e] backdrop-blur-2xl border-r border-white/10 shadow-[20px_0_40px_rgba(0,0,0,0.02)]
          lg:relative lg:translate-x-0 transition-opacity duration-300
          ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Dynamic Logo Section */}
        <div className={`mb-10 px-2 flex items-center h-20`}>
          <div className="relative shrink-0 flex-none w-16 flex justify-center">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView(AppView.DASHBOARD)}
              className="w-14 h-14 rounded-xl cursor-pointer relative overflow-hidden flex items-center justify-center p-0"
            >
              <DotLottieReact
                src="https://lottie.host/daa1f232-6d5d-4fe3-8f24-cfce746869a9/aQCuSzLOPd.lottie"
                loop
                autoplay
                className="w-full h-full scale-[1.5]"
              />
            </motion.div>
            <div className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 border-2 border-[#210c6e]"></span>
            </div>
          </div>

          <AnimatePresence>
            {(isHovered || isOpen) && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="-ml-1 whitespace-nowrap overflow-hidden flex-1"
              >
                <h3 className="text-sm font-black text-white leading-tight tracking-tight">OmniPDF <span className="text-brand-400">AI</span></h3>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500">Live Status</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* High Fidelity Navigation */}
        <nav className="flex-1 flex flex-col gap-1.5 w-full px-4 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isSettings = item.id === AppView.SETTINGS;
            const isMainActive = currentView === item.id || (isSettings && currentView.startsWith('SETTINGS_'));

            return (
              <div key={item.id} className="w-full">
                <button
                  onClick={() => {
                    const isUserFeatures = item.id === 'USER_FEATURES';
                    const isSupport = item.id === 'SUPPORT';
                    if (isSettings) {
                      setView(AppView.SETTINGS_GENERAL);
                    } else if (isUserFeatures) {
                      if (isHovered || isOpen) {
                        setIsUserFeaturesExpanded(!isUserFeaturesExpanded);
                      }
                    } else if (isSupport) {
                      if (isHovered || isOpen) {
                        setIsSupportExpanded(!isSupportExpanded);
                      }
                    } else {
                      setView(item.id as AppView);
                    }
                    if (window.innerWidth < 1024 && onClose && !isUserFeatures && !isSupport) onClose();
                  }}
                  className={`group relative flex items-center w-full h-11 rounded-xl transition-all duration-300
                    ${isMainActive
                      ? 'text-white bg-white/15 shadow-inner'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <div className={`shrink-0 w-10 flex justify-center transition-all duration-300 ${isMainActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                    <item.icon className={`w-4.5 h-4.5 ${isMainActive ? `text-brand-400 drop-shadow-[0_0_8px_currentColor]` : ''}`} />
                  </div>

                  <AnimatePresence>
                    {(isHovered || isOpen) && (
                      <motion.span
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        className="ml-1 text-[10px] font-black uppercase tracking-[0.12em] whitespace-nowrap flex-1 text-left"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {(isHovered || isOpen) && (item.id === 'USER_FEATURES' || item.id === 'SUPPORT') && (
                    <motion.div
                      animate={{ rotate: (item.id === 'USER_FEATURES' ? isUserFeaturesExpanded : isSupportExpanded) ? 180 : 0 }}
                      className="mr-3"
                    >
                      <ChevronDown className="w-3 h-3 text-brand-400 opacity-50" />
                    </motion.div>
                  )}

                  {isMainActive && !isSettingsExpanded && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute right-2.5 w-1 h-1 rounded-full bg-brand-400 shadow-lg shadow-brand-400/40"
                    />
                  )}
                </button>

                {/* Sub-menu rendering */}
                <AnimatePresence>
                  {(isHovered || isOpen) && item.id === 'USER_FEATURES' && isUserFeaturesExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col ml-6 mt-1 gap-1 border-l border-white/10 shadow-sm rounded-r-xl"
                    >
                      {item.subItems?.map((sub) => {
                        const isSubActive = currentView === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => {
                              setView(sub.id);
                              if (window.innerWidth < 1024 && onClose) onClose();
                            }}
                            className={`flex items-center w-full h-9 pl-4 pr-4 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200 gap-3
                              ${isSubActive
                                ? 'text-brand-400 bg-white/5'
                                : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                          >
                            {sub.icon && <sub.icon className="w-3 h-3" />}
                            <span className="flex-1 text-left">{sub.label}</span>
                            {isSubActive && (
                              <div className="w-1 h-1 rounded-full bg-brand-500" />
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {(isHovered || isOpen) && item.id === 'SUPPORT' && isSupportExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col ml-6 mt-1 gap-1 border-l border-white/10 shadow-sm rounded-r-xl"
                    >
                      {item.subItems?.map((sub) => {
                        const isSubActive = currentView === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => {
                              setView(sub.id);
                              if (window.innerWidth < 1024 && onClose) onClose();
                            }}
                            className={`flex items-center w-full h-9 pl-4 pr-4 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200 gap-3
                              ${isSubActive
                                ? 'text-brand-400 bg-white/5'
                                : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                          >
                            {sub.icon && <sub.icon className="w-3 h-3" />}
                            <span className="flex-1 text-left">{sub.label}</span>
                            {isSubActive && (
                              <div className="w-1 h-1 rounded-full bg-brand-500" />
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 flex flex-col w-full px-4">
          <div className="h-px w-full bg-white/10 mb-6" />

          {user ? (
            <div className={`relative group flex items-center h-14`}>
              <div className="shrink-0 w-10 flex justify-center">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-500 p-[1.5px] shadow-xl">
                  <div className="w-full h-full rounded-xl bg-[#210c6e] overflow-hidden flex items-center justify-center font-bold text-white uppercase text-xs">
                    {(user.user_metadata?.avatar_url || user.user_metadata?.picture) ? (
                      <img
                        src={user.user_metadata.avatar_url || user.user_metadata.picture}
                        alt="User"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      user.user_metadata?.full_name?.substring(0, 2) || user.email?.substring(0, 2)
                    )}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {(isHovered || isOpen) && (
                  <motion.div
                    initial={{ opacity: 0, x: -2 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -2 }}
                    className="ml-1 overflow-hidden flex-1"
                  >
                    <h4 className="text-[9px] font-black text-white uppercase tracking-widest truncate">{user.user_metadata?.full_name || 'User'}</h4>
                    <p className="text-[7px] font-bold text-emerald-500 uppercase tracking-widest truncate">{user.email}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(isHovered || isOpen) && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onLogout}
                    title="Log Out"
                    className="p-1.5 ml-1 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-lg transition-colors shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className={`relative group flex items-center h-14`}>
              <div className="shrink-0 w-10 flex justify-center">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/5 flex items-center justify-center text-gray-400">
                  <User className="w-4 h-4" />
                </div>
              </div>
              <AnimatePresence>
                {(isHovered || isOpen) && (
                  <motion.div
                    initial={{ opacity: 0, x: -2 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -2 }}
                    className="ml-1 overflow-hidden flex-1"
                  >
                    <h4 className="text-[9px] font-black text-white uppercase tracking-widest truncate">Guest Account</h4>
                    <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest">Sign in to save</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
};