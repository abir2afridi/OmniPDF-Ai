import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  User, Globe, Shield, CreditCard,
  HardDrive, Save, LogOut, Laptop, Check, Crown,
  RefreshCcw, Search, ChevronDown, X
} from 'lucide-react';
import { AppContext } from '../App';

type SettingsTab = 'general' | 'account' | 'workspace' | 'billing';

interface LanguageOption {
  value: string;
  label: string;
}

const languages: LanguageOption[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: 'Mandarin Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Mandarin Chinese (Traditional)' },
  { value: 'es', label: 'Spanish' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ko', label: 'Korean' },
  { value: 'it', label: 'Italian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ur', label: 'Urdu' },
  { value: 'fa', label: 'Persian (Farsi)' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'th', label: 'Thai' },
  { value: 'pl', label: 'Polish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ro', label: 'Romanian' },
  { value: 'el', label: 'Greek' },
  { value: 'cs', label: 'Czech' },
  { value: 'sv', label: 'Swedish' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'he', label: 'Hebrew' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'tl', label: 'Filipino (Tagalog)' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'hr', label: 'Croatian' },
  { value: 'sr', label: 'Serbian' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'lv', label: 'Latvian' },
  { value: 'et', label: 'Estonian' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ne', label: 'Nepali' },
  { value: 'si', label: 'Sinhala' },
];

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredLanguages = languages.filter(lang =>
    lang.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedLanguage = languages.find(lang => lang.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (langValue: string) => {
    onChange(langValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Interface Language ({languages.length} languages)</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-gray-50 dark:bg-[#1e1e2e] border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 text-left text-gray-900 dark:text-white focus:outline-none focus:border-brand-500 flex items-center justify-between"
      >
        <span>{selectedLanguage?.label || 'Select Language'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#262636] border border-gray-200 dark:border-white/10 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search languages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-[#1e1e2e] border border-gray-200 dark:border-white/10 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredLanguages.length > 0 ? (
              filteredLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleSelect(lang.value)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 text-sm text-gray-900 dark:text-white flex items-center justify-between"
                >
                  <span>{lang.label}</span>
                  {value === lang.value && <Check className="w-4 h-4 text-brand-500" />}
                </button>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                No languages found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Consume Global Context
  const { theme, setTheme, language, setLanguage, t } = useContext(AppContext);

  // Local Settings State (Not Global)
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [notifications, setNotifications] = useState(true);
  const [autoDelete, setAutoDelete] = useState(true);
  const [compressionDefault, setCompressionDefault] = useState('recommended');

  // UI State
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveMessage, setShowSaveMessage] = useState(false);

  // Load local preference settings
  useEffect(() => {
    const savedDateFormat = localStorage.getItem('omni_date_format') || 'MM/DD/YYYY';
    const savedNotifications = localStorage.getItem('omni_notifications') === 'false' ? false : true;
    const savedAutoDelete = localStorage.getItem('omni_auto_delete') === 'false' ? false : true;
    const savedCompression = localStorage.getItem('omni_compression') || 'recommended';

    setDateFormat(savedDateFormat);
    setNotifications(savedNotifications);
    setAutoDelete(savedAutoDelete);
    setCompressionDefault(savedCompression);
  }, []);

  const handleChangeLocal = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setIsDirty(true);
  };

  const handleSave = () => {
    localStorage.setItem('omni_date_format', dateFormat);
    localStorage.setItem('omni_notifications', String(notifications));
    localStorage.setItem('omni_auto_delete', String(autoDelete));
    localStorage.setItem('omni_compression', compressionDefault);

    setIsDirty(false);
    setShowSaveMessage(true);
    setTimeout(() => setShowSaveMessage(false), 3000);
  };

  const handleCancel = () => {
    // Reload from local storage
    setDateFormat(localStorage.getItem('omni_date_format') || 'MM/DD/YYYY');
    setIsDirty(false);
  };

  const tabs = [
    { id: 'general', label: t('General') || 'General', icon: Globe },
    { id: 'account', label: t('Account') || 'Account', icon: User },
    { id: 'workspace', label: t('Workspace') || 'Workspace', icon: Laptop },
    { id: 'billing', label: t('Billing & Plans') || 'Billing & Plans', icon: CreditCard },
  ];

  return (
    <div className="flex-1 overflow-hidden flex bg-gray-50 dark:bg-[#020617] transition-colors duration-300 relative">
      {/* Background atmosphere */}
      <div className="bg-blob opacity-10 dark:opacity-[0.07] -top-40 right-0 pointer-events-none" />

      {/* Settings Sidebar */}
      <div className="w-64 glass-morphism border-r border-white/20 dark:border-white/5 flex flex-col pt-8 transition-colors duration-300 z-10 shrink-0">
        <div className="px-6 mb-8">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{t('Settings')}</h2>
          <p className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-widest">Configuration</p>
        </div>
        <nav className="flex-1 px-4 space-y-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 text-sm font-bold
                ${activeTab === tab.id
                  ? 'bg-brand-600 text-white shadow-xl shadow-brand-600/25'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : ''}`} />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-4 mt-auto border-t border-white/20 dark:border-white/5">
          <button className="w-full flex items-center gap-3 px-4 py-3 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 rounded-2xl transition-all duration-300 text-sm font-bold">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12 z-10">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-10 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
                {tabs.find(tb => tb.id === activeTab)?.label}
              </h1>
              <p className="text-gray-400 text-sm font-medium mt-1">Manage your preferences and account details.</p>
            </div>
            {showSaveMessage && (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/10">
                <Check className="w-4 h-4" /> Changes Saved!
              </div>
            )}
          </div>

          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Appearance</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Dark Mode */}
                  <div
                    onClick={() => setTheme('dark')}
                    className={`border-2 rounded-lg p-4 bg-[#1e1e2e] cursor-pointer relative transition-all hover:shadow-lg
                        ${theme === 'dark' ? 'border-brand-500 shadow-brand-500/20' : 'border-gray-200 dark:border-white/10'}
                    `}
                  >
                    {theme === 'dark' && <div className="absolute top-2 right-2 text-brand-500"><Check className="w-4 h-4" /></div>}
                    <div className="h-20 bg-[#11111b] rounded mb-3 border border-white/10"></div>
                    <span className="text-sm font-medium text-white">Dark Mode</span>
                  </div>

                  {/* Light Mode */}
                  <div
                    onClick={() => setTheme('light')}
                    className={`border-2 rounded-lg p-4 bg-gray-100 cursor-pointer relative transition-all hover:shadow-lg
                        ${theme === 'light' ? 'border-brand-500 shadow-brand-500/20' : 'border-gray-200 dark:border-white/10'}
                    `}
                  >
                    {theme === 'light' && <div className="absolute top-2 right-2 text-brand-500"><Check className="w-4 h-4" /></div>}
                    <div className="h-20 bg-white rounded mb-3 border border-gray-300"></div>
                    <span className="text-sm font-medium text-gray-900">Light Mode</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Language & Region</h3>
                <div className="space-y-4">
                  <LanguageSelector
                    value={language}
                    onChange={(value) => setLanguage(value)}
                  />
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Date Format</label>
                    <select
                      value={dateFormat}
                      onChange={(e) => handleChangeLocal(setDateFormat, e.target.value)}
                      className="w-full bg-gray-50 dark:bg-[#1e1e2e] border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500"
                    >
                      <option>MM/DD/YYYY</option>
                      <option>DD/MM/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ACCOUNT TAB */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 flex items-center gap-6 shadow-sm">
                <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center text-2xl font-bold text-white border-4 border-gray-50 dark:border-[#1e1e2e]">
                  JD
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">John Doe</h3>
                  <p className="text-gray-500 dark:text-gray-400">john.doe@example.com</p>
                  <div className="mt-2 flex gap-2">
                    <span className="px-2 py-1 bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-xs rounded-full border border-brand-200 dark:border-brand-500/20 font-medium">Pro Plan</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 text-xs rounded-full border border-green-200 dark:border-green-500/20 font-medium">Verified</span>
                  </div>
                </div>
                <button className="px-4 py-2 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300">
                  Edit Profile
                </button>
              </div>

              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Security</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-100 dark:bg-brand-500/10 rounded-lg text-brand-600 dark:text-brand-400"><Shield className="w-5 h-5" /></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">Add an extra layer of security to your account.</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-brand-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 dark:bg-red-500/10 rounded-lg text-red-600 dark:text-red-400"><LogOut className="w-5 h-5" /></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Active Sessions</p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">You are logged in on 2 devices.</p>
                      </div>
                    </div>
                    <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline">Manage</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WORKSPACE TAB */}
          {activeTab === 'workspace' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Processing Defaults</h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Default Compression Level</label>
                    <div className="flex gap-2">
                      {['Extreme', 'Recommended', 'Less'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleChangeLocal(setCompressionDefault, opt.toLowerCase())}
                          className={`flex-1 py-2 rounded-lg text-sm border transition-all
                                            ${compressionDefault === opt.toLowerCase()
                              ? 'bg-brand-600 border-brand-500 text-white'
                              : 'bg-gray-50 dark:bg-[#1e1e2e] border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/20'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-delete Files</p>
                      <p className="text-xs text-gray-500">Automatically delete uploaded files from server after 2 hours.</p>
                    </div>
                    <div
                      onClick={() => handleChangeLocal(setAutoDelete, !autoDelete)}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${autoDelete ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${autoDelete ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Browser Notifications</p>
                      <p className="text-xs text-gray-500">Get notified when large batch processes finish.</p>
                    </div>
                    <div
                      onClick={() => handleChangeLocal(setNotifications, !notifications)}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${notifications ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${notifications ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cloud Storage Integration</h3>
                <div className="space-y-3">
                  {['Google Drive', 'Dropbox', 'OneDrive'].map(service => (
                    <div key={service} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-white/5">
                      <div className="flex items-center gap-3">
                        <HardDrive className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-white">{service}</span>
                      </div>
                      <button className="px-3 py-1 text-xs border border-gray-200 dark:border-white/10 rounded hover:bg-gray-200 dark:hover:bg-white/5 transition-colors text-gray-700 dark:text-gray-300">Connect</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BILLING TAB */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="bg-gradient-to-br from-brand-700 to-brand-900 dark:from-brand-900 dark:to-[#262636] rounded-xl border border-brand-500/30 p-6 relative overflow-hidden text-white shadow-lg">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Crown className="w-32 h-32 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-5 h-5 text-yellow-400 fill-current" />
                    <span className="text-sm font-bold text-yellow-400 tracking-wider uppercase">Current Plan</span>
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-1">OmniPDF Pro</h2>
                  <p className="text-brand-100 text-sm mb-6">$12.00 / month • Renews on Oct 24, 2025</p>

                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white text-brand-900 font-bold rounded-lg hover:bg-gray-100 transition-colors shadow">
                      Manage Subscription
                    </button>
                    <button className="px-4 py-2 bg-brand-800/50 text-white border border-brand-500/30 font-medium rounded-lg hover:bg-brand-800 transition-colors">
                      View Invoices
                    </button>
                  </div>
                </div>
              </div>

              {/* Usage */}
              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Usage this month</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400">Tasks Processed</span>
                      <span className="text-gray-900 dark:text-white">342 / 5000</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-[#1e1e2e] h-2 rounded-full overflow-hidden">
                      <div className="w-[7%] h-full bg-brand-500 rounded-full"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400">AI Credits</span>
                      <span className="text-gray-900 dark:text-white">1,250 / 10,000</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-[#1e1e2e] h-2 rounded-full overflow-hidden">
                      <div className="w-[12%] h-full bg-purple-500 rounded-full"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 dark:text-gray-400">Cloud Storage</span>
                      <span className="text-gray-900 dark:text-white">2.1 GB / 50 GB</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-[#1e1e2e] h-2 rounded-full overflow-hidden">
                      <div className="w-[4%] h-full bg-emerald-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white dark:bg-[#262636] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Payment Method</h3>
                  <button className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium">+ Add Method</button>
                </div>
                <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-white/5">
                  <div className="w-12 h-8 bg-white rounded flex items-center justify-center border border-gray-200 dark:border-transparent">
                    <div className="text-blue-800 font-bold italic text-xs">VISA</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-white font-medium">Visa ending in 4242</p>
                    <p className="text-xs text-gray-500">Expires 12/28</p>
                  </div>
                  <span className="px-2 py-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded uppercase font-bold">Default</span>
                </div>
              </div>
            </div>
          )}

          {/* Save Actions */}
          <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-white/20 dark:border-white/10 sticky bottom-0 glass-morphism dark:bg-[#020617]/80 py-4 px-2 rounded-2xl">
            <button
              onClick={handleCancel}
              disabled={!isDirty}
              className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${isDirty ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className={`px-8 py-3 rounded-2xl font-black text-sm shadow-xl flex items-center gap-2 transition-all duration-300 active:scale-95
                    ${isDirty
                  ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/30 cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'}
                `}
            >
              <Save className="w-4 h-4" /> Save Changes
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};