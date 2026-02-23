import React, { useState, useMemo, useCallback, useEffect, useContext, createContext } from 'react';
import {
  Files, Scissors, ArrowRightLeft, FileText, Image,
  Lock, Wand2, PenTool, Search, Type, Grid, Shield,
  Unlock, Eraser, RotateCw, Hammer, Layers, FileSpreadsheet,
  Presentation, FileJson, FileCode, BookOpen, Printer, Monitor, Loader2, Menu, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { RightDock } from './components/RightDock';
import { Dashboard } from './components/Dashboard';
import { Workspace } from './components/Workspace';
import { ESign } from './components/ESign';
import { AILab } from './components/AILab';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { History } from './components/History';
import { Login } from './components/Login';
import { AppView, PDFTool, ToolCategory, UploadedFile } from './types';
import { processFiles } from './services/pdfService';
import { supabase } from './lib/supabase';
import { MergePDF } from './components/MergePDF';
import { SplitPDF } from './components/SplitPDF';
import { DeletePages } from './components/DeletePages';
import { RotatePDF } from './components/RotatePDF';
import { WordToPDF } from './components/WordToPDF';
import { ExcelToPDF } from './components/ExcelToPDF';
import { PowerPointToPDF } from './components/PowerPointToPDF';
import { PDFToJPG } from './components/PDFToJPG';
import { JPGToPDF } from './components/JPGToPDF';
import { PDFToWord } from './components/PDFToWord';

// --- Context Setup ---
interface AppContextType {
  theme: string;
  setTheme: (theme: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string) => string;
}

export const AppContext = createContext<AppContextType>({
  theme: 'dark',
  setTheme: () => { },
  language: 'en',
  setLanguage: () => { },
  t: (key) => key,
});

// Dictionary
const translations: Record<string, Record<string, string>> = {
  'en': {
    'All Tools': 'All Tools',
    'Workspace': 'Workspace',
    'AI Lab': 'AI Lab',
    'Analytics': 'Analytics',
    'E-Sign': 'E-Sign',
    'Settings': 'Settings',
    'Logout': 'Log Out',
    'Premium Access': 'Premium Access',
    'Pro Account Active': 'Pro Account Active',
    'OmniPDF AI Suite': 'OmniPDF AI Suite',
    'New Project': 'New Project',
    'Convert to PDF': 'Convert to PDF',
    'Convert from PDF': 'Convert from PDF',
    'Organize': 'Organize',
    'Intelligence Suite 2.0': 'Intelligence Suite 2.0',
    'All Professional Tools': 'All Professional Tools',
    'A comprehensive intelligence suite for all your document needs. Search, edit, convert and secure with precision.': 'A comprehensive intelligence suite for all your document needs. Search, edit, convert and secure with precision.',
    'Trusted by 50K+ Professionals': 'Trusted by 50K+ Professionals',
    'Search for any tool (e.g. merge, word, sign)...': 'Search for any tool (e.g. merge, word, sign)...',
    'Search Results': 'Search Results',
    'found': 'found',
    'No tools found': 'No tools found',
    'Try searching for something else': 'Try searching for something else',
    'Ready to experience the future of PDF?': 'Ready to experience the future of PDF?',
    'Join thousands of users who have already upgraded their workflow with OmniPDF AI.': 'Join thousands of users who have already upgraded their workflow with OmniPDF AI.',
    'Get Started Now': 'Get Started Now',
    'Beta Access': 'Beta Access',
    'Intelligence Suite 2.0 — Beta Access': 'Intelligence Suite 2.0 — Beta Access',
    'Work with Absolute Clarity.': 'Work with Absolute Clarity.',
    'Experience the most powerful AI document toolkit ever built. Create, convert, and master your PDF workflows with one unified intelligence suite.': 'Experience the most powerful AI document toolkit ever built. Create, convert, and master your PDF workflows with one unified intelligence suite.',
    'Search 20+ professional tools...': 'Search 20+ professional tools...',
    'Active Tools': 'Active Tools',
    'No tools matched your criteria': 'No tools matched your criteria',
    'Try adjusting your filters or search query': 'Try adjusting your filters or search query',
    'Ready to Upgrade Your Vision?': 'Ready to Upgrade Your Vision?',
    'Join the elite circle of over 50,000 professionals who trust OmniPDF AI for their most critical document architectures.': 'Join the elite circle of over 50,000 professionals who trust OmniPDF AI for their most critical document architectures.',
    'View Enterprise': 'View Enterprise',
    'Edit': 'Edit',
    'Security': 'Security',
    'AI Magic': 'AI Magic',
    'Drag & Drop files here': 'Drag & Drop files here',
    'or click below to browse': 'or click below to browse',
    'Select Files': 'Select Files',
    'Merge PDF': 'Merge PDF',
    'Split PDF': 'Split PDF',
    'Delete Pages': 'Delete Pages',
    'Rotate PDF': 'Rotate PDF',
    'Compress PDF': 'Compress PDF',
    'Repair PDF': 'Repair PDF',
    'Protect PDF': 'Protect PDF',
    'Unlock PDF': 'Unlock PDF',
    'Sign PDF': 'Sign PDF',
    'Redact PDF': 'Redact PDF',
    'Word to PDF': 'Word to PDF',
    'Excel to PDF': 'Excel to PDF',
    'PowerPoint to PDF': 'PowerPoint to PDF',
    'JPG to PDF': 'JPG to PDF',
    'PDF to Word': 'PDF to Word',
    'PDF to Excel': 'PDF to Excel',
    'PDF to Powerpoint': 'PDF to Powerpoint',
    'PDF to JPG': 'PDF to JPG',
    'PDF to PNG': 'PDF to PNG',
    'Extract PDF Images': 'Extract PDF Images',
    'PDF to PDF/A': 'PDF to PDF/A',
    'Edit PDF': 'Edit PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Flatten PDF',
    'AI Summary': 'AI Summary'
  },
  'es': {
    'All Tools': 'Herramientas',
    'Workspace': 'Espacio de Trabajo',
    'AI Lab': 'Laboratorio IA',
    'Settings': 'Configuración',
    'OmniPDF AI Suite': 'Suite OmniPDF IA',
    'New Project': 'Nuevo Proyecto',
    'Convert to PDF': 'Convertir a PDF',
    'Convert from PDF': 'Convertir desde PDF',
    'Organize': 'Organizar',
    'Edit': 'Editar',
    'Security': 'Seguridad',
    'AI Magic': 'Magia IA',
    'Drag & Drop files here': 'Arrastra y suelta archivos aquí',
    'or click below to browse': 'o haz clic abajo para buscar',
    'Select Files': 'Seleccionar Archivos',
    'Merge PDF': 'Unir PDF',
    'Split PDF': 'Dividir PDF',
    'Delete Pages': 'Eliminar Páginas',
    'Rotate PDF': 'Rotar PDF',
    'Compress PDF': 'Comprimir PDF',
    'Repair PDF': 'Reparar PDF',
    'Protect PDF': 'Proteger PDF',
    'Unlock PDF': 'Desbloquear PDF',
    'Sign PDF': 'Firmar PDF',
    'Redact PDF': 'Redactar PDF',
    'Word to PDF': 'Word a PDF',
    'Excel to PDF': 'Excel a PDF',
    'PowerPoint to PDF': 'PowerPoint a PDF',
    'JPG to PDF': 'JPG a PDF',
    'PDF to Word': 'PDF a Word',
    'PDF to Excel': 'PDF a Excel',
    'PDF to Powerpoint': 'PDF a Powerpoint',
    'PDF to JPG': 'PDF a JPG',
    'PDF to PNG': 'PDF a PNG',
    'Extract PDF Images': 'Extraer Imágenes',
    'PDF to PDF/A': 'PDF a PDF/A',
    'Edit PDF': 'Editar PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Aplanar PDF',
    'AI Summary': 'Resumen IA'
  },
  'fr': {
    'All Tools': 'Tous les outils',
    'Workspace': 'Espace de travail',
    'AI Lab': 'Labo IA',
    'Settings': 'Paramètres',
    'OmniPDF AI Suite': 'Suite OmniPDF IA',
    'New Project': 'Nouveau Projet',
    'Convert to PDF': 'Convertir en PDF',
    'Convert from PDF': 'Convertir depuis PDF',
    'Organize': 'Organiser',
    'Edit': 'Modifier',
    'Security': 'Sécurité',
    'AI Magic': 'Magie IA',
    'Drag & Drop files here': 'Glissez et déposez les fichiers ici',
    'or click below to browse': 'ou cliquez ci-dessous pour parcourir',
    'Select Files': 'Choisir des fichiers',
    'Merge PDF': 'Fusionner PDF',
    'Split PDF': 'Diviser PDF',
    'Delete Pages': 'Supprimer Pages',
    'Rotate PDF': 'Pivoter PDF',
    'Compress PDF': 'Compresser PDF',
    'Repair PDF': 'Réparer PDF',
    'Protect PDF': 'Protéger PDF',
    'Unlock PDF': 'Déverrouiller PDF',
    'Sign PDF': 'Signer PDF',
    'Redact PDF': 'Biffer PDF',
    'Word to PDF': 'Word en PDF',
    'Excel to PDF': 'Excel en PDF',
    'PowerPoint to PDF': 'PowerPoint en PDF',
    'JPG to PDF': 'JPG en PDF',
    'PDF to Word': 'PDF en Word',
    'PDF to Excel': 'PDF en Excel',
    'PDF to Powerpoint': 'PDF en Powerpoint',
    'PDF to JPG': 'PDF en JPG',
    'PDF to PNG': 'PDF en PNG',
    'Extract PDF Images': 'Extraire Images',
    'PDF to PDF/A': 'PDF en PDF/A',
    'Edit PDF': 'Modifier PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Aplatir PDF',
    'AI Summary': 'Résumé IA'
  },
  'bn': {
    'All Tools': 'সকল টুলস',
    'Workspace': 'ওয়ার্কস্পেস',
    'AI Lab': 'এআই ল্যাব',
    'Settings': 'সেটিংস',
    'OmniPDF AI Suite': 'অমনিপিডিএফ এআই',
    'New Project': 'নতুন প্রজেক্ট',
    'Convert to PDF': 'PDF এ রূপান্তর',
    'Convert from PDF': 'PDF থেকে রূপান্তর',
    'Organize': 'সাজান',
    'Edit': 'এডিট',
    'Security': 'নিরাপত্তা',
    'AI Magic': 'এআই ম্যাজিক',
    'Drag & Drop files here': 'ফাইলগুলো এখানে আনুন',
    'or click below to browse': 'অথবা ব্রাউজ করতে ক্লিক করুন',
    'Select Files': 'ফাইল নির্বাচন করুন',
    'Merge PDF': 'PDF একত্র করুন',
    'Split PDF': 'PDF আলাদা করুন',
    'Delete Pages': 'পাতা মুছুন',
    'Rotate PDF': 'PDF ঘুরান',
    'Compress PDF': 'PDF ছোট করুন',
    'Repair PDF': 'PDF মেরামত করুন',
    'Protect PDF': 'পাসওয়ার্ড দিন',
    'Unlock PDF': 'পাসওয়ার্ড সরান',
    'Sign PDF': 'স্বাক্ষর দিন',
    'Redact PDF': 'তথ্য লুকান',
    'Word to PDF': 'Word থেকে PDF',
    'Excel to PDF': 'Excel থেকে PDF',
    'PowerPoint to PDF': 'PPT থেকে PDF',
    'JPG to PDF': 'JPG থেকে PDF',
    'PDF to Word': 'PDF থেকে Word',
    'PDF to Excel': 'PDF থেকে Excel',
    'PDF to Powerpoint': 'PDF থেকে PPT',
    'PDF to JPG': 'PDF থেকে JPG',
    'PDF to PNG': 'PDF থেকে PNG',
    'Extract PDF Images': 'ছবি বের করুন',
    'PDF to PDF/A': 'PDF/A তে রূপান্তর',
    'Edit PDF': 'PDF এডিট',
    'OCR PDF': 'OCR টেক্সট',
    'Flatten PDF': 'ফ্ল্যাটেন PDF',
    'AI Summary': 'এআই সারাংশ'
  },
  'de': {
    'All Tools': 'Alle Tools',
    'Workspace': 'Arbeitsbereich',
    'AI Lab': 'KI Labor',
    'Settings': 'Einstellungen',
    'OmniPDF AI Suite': 'OmniPDF KI Suite',
    'New Project': 'Neues Projekt',
    'Convert to PDF': 'In PDF konvertieren',
    'Convert from PDF': 'Von PDF konvertieren',
    'Organize': 'Organisieren',
    'Edit': 'Bearbeiten',
    'Security': 'Sicherheit',
    'AI Magic': 'KI Magie',
    'Drag & Drop files here': 'Dateien hier ziehen und ablegen',
    'or click below to browse': 'oder klicken Sie unten zum Durchsuchen',
    'Select Files': 'Dateien auswählen',
    'Merge PDF': 'PDF zusammenführen',
    'Split PDF': 'PDF teilen',
    'Delete Pages': 'Seiten löschen',
    'Rotate PDF': 'PDF drehen',
    'Compress PDF': 'PDF komprimieren',
    'Repair PDF': 'PDF reparieren',
    'Protect PDF': 'PDF schützen',
    'Unlock PDF': 'PDF entsperren',
    'Sign PDF': 'PDF signieren',
    'Redact PDF': 'PDF redigieren',
    'Word to PDF': 'Word zu PDF',
    'Excel to PDF': 'Excel zu PDF',
    'PowerPoint to PDF': 'PowerPoint zu PDF',
    'JPG to PDF': 'JPG zu PDF',
    'PDF to Word': 'PDF zu Word',
    'PDF to Excel': 'PDF zu Excel',
    'PDF to Powerpoint': 'PDF zu Powerpoint',
    'PDF to JPG': 'PDF zu JPG',
    'PDF to PNG': 'PDF zu PNG',
    'Extract PDF Images': 'PDF-Bilder extrahieren',
    'PDF to PDF/A': 'PDF zu PDF/A',
    'Edit PDF': 'PDF bearbeiten',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF reduzieren',
    'AI Summary': 'KI Zusammenfassung'
  },
  'hi': {
    'All Tools': 'सभी उपकरण',
    'Workspace': 'कार्यक्षेत्र',
    'AI Lab': 'एआई प्रयोगशाला',
    'Settings': 'सेटिंग्स',
    'OmniPDF AI Suite': 'ओमनीपीडीएफ एआई सूट',
    'New Project': 'नया प्रोजेक्ट',
    'Convert to PDF': 'PDF में बदलें',
    'Convert from PDF': 'PDF से बदलें',
    'Organize': 'व्यवस्थित करें',
    'Edit': 'संपादित करें',
    'Security': 'सुरक्षा',
    'AI Magic': 'एआई मैजिक',
    'Drag & Drop files here': 'फ़ाइलों को यहाँ खींचें और छोड़ें',
    'or click below to browse': 'या ब्राउज़ करने के लिए नीचे क्लिक करें',
    'Select Files': 'फ़ाइलें चुनें',
    'Merge PDF': 'PDF मर्ज करें',
    'Split PDF': 'PDF विभाजित करें',
    'Delete Pages': 'पेज हटाएं',
    'Rotate PDF': 'PDF घुमाएं',
    'Compress PDF': 'PDF संपीड़ित करें',
    'Repair PDF': 'PDF मरम्मत करें',
    'Protect PDF': 'PDF सुरक्षित करें',
    'Unlock PDF': 'PDF अनलॉक करें',
    'Sign PDF': 'PDF पर हस्ताक्षर करें',
    'Redact PDF': 'PDF संपादित करें',
    'Word to PDF': 'Word से PDF',
    'Excel to PDF': 'Excel से PDF',
    'PowerPoint to PDF': 'PowerPoint से PDF',
    'JPG to PDF': 'JPG से PDF',
    'PDF to Word': 'PDF से Word',
    'PDF to Excel': 'PDF से Excel',
    'PDF to Powerpoint': 'PDF से Powerpoint',
    'PDF to JPG': 'PDF से JPG',
    'PDF to PNG': 'PDF से PNG',
    'Extract PDF Images': 'PDF छवियां निकालें',
    'PDF to PDF/A': 'PDF से PDF/A',
    'Edit PDF': 'PDF संपादित करें',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF समतल करें',
    'AI Summary': 'एआई सारांश'
  },
  'ar': {
    'All Tools': 'جميع الأدوات',
    'Workspace': 'مساحة العمل',
    'AI Lab': 'مختبر الذكاء الاصطناعي',
    'Settings': 'الإعدادات',
    'OmniPDF AI Suite': 'حزمة OmniPDF AI',
    'New Project': 'مشروع جديد',
    'Convert to PDF': 'تحويل إلى PDF',
    'Convert from PDF': 'تحويل من PDF',
    'Organize': 'تنظيم',
    'Edit': 'تعديل',
    'Security': 'الأمان',
    'AI Magic': 'سحر الذكاء الاصطناعي',
    'Drag & Drop files here': 'اسحب وأفلت الملفات هنا',
    'or click below to browse': 'أو انقر أدناه للتصفح',
    'Select Files': 'اختر الملفات',
    'Merge PDF': 'دمج PDF',
    'Split PDF': 'تقسيم PDF',
    'Delete Pages': 'حذف الصفحات',
    'Rotate PDF': 'تدوير PDF',
    'Compress PDF': 'ضغط PDF',
    'Repair PDF': 'إصلاح PDF',
    'Protect PDF': 'حماية PDF',
    'Unlock PDF': 'فتح PDF',
    'Sign PDF': 'توقيع PDF',
    'Redact PDF': 'تحرير PDF',
    'Word to PDF': 'Word إلى PDF',
    'Excel to PDF': 'Excel إلى PDF',
    'PowerPoint to PDF': 'PowerPoint إلى PDF',
    'JPG to PDF': 'JPG إلى PDF',
    'PDF to Word': 'PDF إلى Word',
    'PDF to Excel': 'PDF إلى Excel',
    'PDF to Powerpoint': 'PDF إلى Powerpoint',
    'PDF to JPG': 'PDF إلى JPG',
    'PDF to PNG': 'PDF إلى PNG',
    'Extract PDF Images': 'استخراج صور PDF',
    'PDF to PDF/A': 'PDF إلى PDF/A',
    'Edit PDF': 'تعديل PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'تسوية PDF',
    'AI Summary': 'ملخص الذكاء الاصطناعي'
  },
  'ru': {
    'All Tools': 'Все инструменты',
    'Workspace': 'Рабочее пространство',
    'AI Lab': 'Лаборатория ИИ',
    'Settings': 'Настройки',
    'OmniPDF AI Suite': 'Набор OmniPDF AI',
    'New Project': 'Новый проект',
    'Convert to PDF': 'Конвертировать в PDF',
    'Convert from PDF': 'Конвертировать из PDF',
    'Organize': 'Организовать',
    'Edit': 'Редактировать',
    'Security': 'Безопасность',
    'AI Magic': 'Магия ИИ',
    'Drag & Drop files here': 'Перетащите файлы сюда',
    'or click below to browse': 'или нажмите ниже для просмотра',
    'Select Files': 'Выбрать файлы',
    'Merge PDF': 'Объединить PDF',
    'Split PDF': 'Разделить PDF',
    'Delete Pages': 'Удалить страницы',
    'Rotate PDF': 'Повернуть PDF',
    'Compress PDF': 'Сжать PDF',
    'Repair PDF': 'Восстановить PDF',
    'Protect PDF': 'Защитить PDF',
    'Unlock PDF': 'Разблокировать PDF',
    'Sign PDF': 'Подписать PDF',
    'Redact PDF': 'Редактировать PDF',
    'Word to PDF': 'Word в PDF',
    'Excel to PDF': 'Excel в PDF',
    'PowerPoint to PDF': 'PowerPoint в PDF',
    'JPG to PDF': 'JPG в PDF',
    'PDF to Word': 'PDF в Word',
    'PDF to Excel': 'PDF в Excel',
    'PDF to Powerpoint': 'PDF в Powerpoint',
    'PDF to JPG': 'PDF в JPG',
    'PDF to PNG': 'PDF в PNG',
    'Extract PDF Images': 'Извлечь изображения из PDF',
    'PDF to PDF/A': 'PDF в PDF/A',
    'Edit PDF': 'Редактировать PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Сгладить PDF',
    'AI Summary': 'Резюме ИИ'
  },
  'ja': {
    'All Tools': 'すべてのツール',
    'Workspace': 'ワークスペース',
    'AI Lab': 'AIラボ',
    'Settings': '設定',
    'OmniPDF AI Suite': 'OmniPDF AIスイート',
    'New Project': '新規プロジェクト',
    'Convert to PDF': 'PDFに変換',
    'Convert from PDF': 'PDFから変換',
    'Organize': '整理',
    'Edit': '編集',
    'Security': 'セキュリティ',
    'AI Magic': 'AIマジック',
    'Drag & Drop files here': 'ファイルをここにドラッグ＆ドロップ',
    'or click below to browse': 'または下をクリックして参照',
    'Select Files': 'ファイルを選択',
    'Merge PDF': 'PDFを結合',
    'Split PDF': 'PDFを分割',
    'Delete Pages': 'ページを削除',
    'Rotate PDF': 'PDFを回転',
    'Compress PDF': 'PDFを圧縮',
    'Repair PDF': 'PDFを修復',
    'Protect PDF': 'PDFを保護',
    'Unlock PDF': 'PDFのロック解除',
    'Sign PDF': 'PDFに署名',
    'Redact PDF': 'PDFを編集',
    'Word to PDF': 'WordからPDF',
    'Excel to PDF': 'ExcelからPDF',
    'PowerPoint to PDF': 'PowerPointからPDF',
    'JPG to PDF': 'JPGからPDF',
    'PDF to Word': 'PDFからWord',
    'PDF to Excel': 'PDFからExcel',
    'PDF to Powerpoint': 'PDFからPowerpoint',
    'PDF to JPG': 'PDFからJPG',
    'PDF to PNG': 'PDFからPNG',
    'Extract PDF Images': 'PDF画像を抽出',
    'PDF to PDF/A': 'PDFからPDF/A',
    'Edit PDF': 'PDFを編集',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDFを平坦化',
    'AI Summary': 'AI要約'
  },
  'ko': {
    'All Tools': '모든 도구',
    'Workspace': '작업 공간',
    'AI Lab': 'AI 연구실',
    'Settings': '설정',
    'OmniPDF AI Suite': 'OmniPDF AI 스위트',
    'New Project': '새 프로젝트',
    'Convert to PDF': 'PDF로 변환',
    'Convert from PDF': 'PDF에서 변환',
    'Organize': '정리',
    'Edit': '편집',
    'Security': '보안',
    'AI Magic': 'AI 마법',
    'Drag & Drop files here': '파일을 여기로 드래그 앤 드롭',
    'or click below to browse': '또는 아래를 클릭하여 찾아보기',
    'Select Files': '파일 선택',
    'Merge PDF': 'PDF 병합',
    'Split PDF': 'PDF 분할',
    'Delete Pages': '페이지 삭제',
    'Rotate PDF': 'PDF 회전',
    'Compress PDF': 'PDF 압축',
    'Repair PDF': 'PDF 복구',
    'Protect PDF': 'PDF 보호',
    'Unlock PDF': 'PDF 잠금 해제',
    'Sign PDF': 'PDF 서명',
    'Redact PDF': 'PDF 편집',
    'Word to PDF': 'Word에서 PDF로',
    'Excel to PDF': 'Excel에서 PDF로',
    'PowerPoint to PDF': 'PowerPoint에서 PDF로',
    'JPG to PDF': 'JPG에서 PDF로',
    'PDF to Word': 'PDF에서 Word로',
    'PDF to Excel': 'PDF에서 Excel로',
    'PDF to Powerpoint': 'PDF에서 Powerpoint로',
    'PDF to JPG': 'PDF에서 JPG로',
    'PDF to PNG': 'PDF에서 PNG로',
    'Extract PDF Images': 'PDF 이미지 추출',
    'PDF to PDF/A': 'PDF에서 PDF/A로',
    'Edit PDF': 'PDF 편집',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF 평탄화',
    'AI Summary': 'AI 요약'
  },
  'tr': {
    'All Tools': 'Tüm Araçlar',
    'Workspace': 'Çalışma Alanı',
    'AI Lab': 'AI Laboratuvarı',
    'Settings': 'Ayarlar',
    'OmniPDF AI Suite': 'OmniPDF AI Paketi',
    'New Project': 'Yeni Proje',
    'Convert to PDF': 'PDF\'ye Dönüştür',
    'Convert from PDF': 'PDF\'den Dönüştür',
    'Organize': 'Düzenle',
    'Edit': 'Düzenle',
    'Security': 'Güvenlik',
    'AI Magic': 'AI Büyüsü',
    'Drag & Drop files here': 'Dosyaları buraya sürükleyip bırakın',
    'or click below to browse': 'veya taramak için aşağıya tıklayın',
    'Select Files': 'Dosyaları Seç',
    'Merge PDF': 'PDF Birleştir',
    'Split PDF': 'PDF Böl',
    'Delete Pages': 'Sayfaları Sil',
    'Rotate PDF': 'PDF Döndür',
    'Compress PDF': 'PDF Sıkıştır',
    'Repair PDF': 'PDF Onar',
    'Protect PDF': 'PDF Koru',
    'Unlock PDF': 'PDF Kilidini Aç',
    'Sign PDF': 'PDF İmzala',
    'Redact PDF': 'PDF Düzenle',
    'Word to PDF': 'Word\'den PDF\'ye',
    'Excel to PDF': 'Excel\'den PDF\'ye',
    'PowerPoint to PDF': 'PowerPoint\'ten PDF\'ye',
    'JPG to PDF': 'JPG\'den PDF\'ye',
    'PDF to Word': 'PDF\'den Word\'e',
    'PDF to Excel': 'PDF\'den Excel\'e',
    'PDF to Powerpoint': 'PDF\'den Powerpoint\'e',
    'PDF to JPG': 'PDF\'den JPG\'ye',
    'PDF to PNG': 'PDF\'den PNG\'ye',
    'Extract PDF Images': 'PDF Görsellerini Çıkar',
    'PDF to PDF/A': 'PDF\'den PDF/A\'ya',
    'Edit PDF': 'PDF Düzenle',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF Düzleştir',
    'AI Summary': 'AI Özeti'
  },
  'it': {
    'All Tools': 'Tutti gli Strumenti',
    'Workspace': 'Spazio di Lavoro',
    'AI Lab': 'Laboratorio AI',
    'Settings': 'Impostazioni',
    'OmniPDF AI Suite': 'Suite OmniPDF AI',
    'New Project': 'Nuovo Progetto',
    'Convert to PDF': 'Converti in PDF',
    'Convert from PDF': 'Converti da PDF',
    'Organize': 'Organizza',
    'Edit': 'Modifica',
    'Security': 'Sicurezza',
    'AI Magic': 'Magia AI',
    'Drag & Drop files here': 'Trascina i file qui',
    'or click below to browse': 'oppure clicca sotto per sfogliare',
    'Select Files': 'Seleziona File',
    'Merge PDF': 'Unisci PDF',
    'Split PDF': 'Dividi PDF',
    'Delete Pages': 'Elimina Pagine',
    'Rotate PDF': 'Ruota PDF',
    'Compress PDF': 'Comprimi PDF',
    'Repair PDF': 'Ripara PDF',
    'Protect PDF': 'Proteggi PDF',
    'Unlock PDF': 'Sblocca PDF',
    'Sign PDF': 'Firma PDF',
    'Redact PDF': 'Modifica PDF',
    'Word to PDF': 'Word a PDF',
    'Excel to PDF': 'Excel a PDF',
    'PowerPoint to PDF': 'PowerPoint a PDF',
    'JPG to PDF': 'JPG a PDF',
    'PDF to Word': 'PDF a Word',
    'PDF to Excel': 'PDF a Excel',
    'PDF to Powerpoint': 'PDF a Powerpoint',
    'PDF to JPG': 'PDF a JPG',
    'PDF to PNG': 'PDF a PNG',
    'Extract PDF Images': 'Estrai Immagini PDF',
    'PDF to PDF/A': 'PDF a PDF/A',
    'Edit PDF': 'Modifica PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Appiattisci PDF',
    'AI Summary': 'Riepilogo AI'
  },
  'pt': {
    'All Tools': 'Todas as Ferramentas',
    'Workspace': 'Espaço de Trabalho',
    'AI Lab': 'Laboratório IA',
    'Settings': 'Configurações',
    'OmniPDF AI Suite': 'Suite OmniPDF IA',
    'New Project': 'Novo Projeto',
    'Convert to PDF': 'Converter para PDF',
    'Convert from PDF': 'Converter do PDF',
    'Organize': 'Organizar',
    'Edit': 'Editar',
    'Security': 'Segurança',
    'AI Magic': 'Magia IA',
    'Drag & Drop files here': 'Arraste os arquivos aqui',
    'or click below to browse': 'ou clique abaixo para navegar',
    'Select Files': 'Selecionar Arquivos',
    'Merge PDF': 'Mesclar PDF',
    'Split PDF': 'Dividir PDF',
    'Delete Pages': 'Excluir Páginas',
    'Rotate PDF': 'Girar PDF',
    'Compress PDF': 'Comprimir PDF',
    'Repair PDF': 'Reparar PDF',
    'Protect PDF': 'Proteger PDF',
    'Unlock PDF': 'Desbloquear PDF',
    'Sign PDF': 'Assinar PDF',
    'Redact PDF': 'Editar PDF',
    'Word to PDF': 'Word para PDF',
    'Excel to PDF': 'Excel para PDF',
    'PowerPoint to PDF': 'PowerPoint para PDF',
    'JPG to PDF': 'JPG para PDF',
    'PDF to Word': 'PDF para Word',
    'PDF to Excel': 'PDF para Excel',
    'PDF to Powerpoint': 'PDF para Powerpoint',
    'PDF to JPG': 'PDF para JPG',
    'PDF to PNG': 'PDF para PNG',
    'Extract PDF Images': 'Extrair Imagens PDF',
    'PDF to PDF/A': 'PDF para PDF/A',
    'Edit PDF': 'Editar PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Aplanar PDF',
    'AI Summary': 'Resumo IA'
  },
  'vi': {
    'All Tools': 'Tất cả Công cụ',
    'Workspace': 'Không gian Làm việc',
    'AI Lab': 'Phòng thí nghiệm AI',
    'Settings': 'Cài đặt',
    'OmniPDF AI Suite': 'Bộ OmniPDF AI',
    'New Project': 'Dự án Mới',
    'Convert to PDF': 'Chuyển đổi thành PDF',
    'Convert from PDF': 'Chuyển đổi từ PDF',
    'Organize': 'Tổ chức',
    'Edit': 'Chỉnh sửa',
    'Security': 'Bảo mật',
    'AI Magic': 'Phép màu AI',
    'Drag & Drop files here': 'Kéo thả tệp vào đây',
    'or click below to browse': 'hoặc nhấp bên dưới để duyệt',
    'Select Files': 'Chọn Tệp',
    'Merge PDF': 'Hợp nhất PDF',
    'Split PDF': 'Chia tách PDF',
    'Delete Pages': 'Xóa Trang',
    'Rotate PDF': 'Xoay PDF',
    'Compress PDF': 'Nén PDF',
    'Repair PDF': 'Sửa chữa PDF',
    'Protect PDF': 'Bảo vệ PDF',
    'Unlock PDF': 'Mở khóa PDF',
    'Sign PDF': 'Ký PDF',
    'Redact PDF': 'Chỉnh sửa PDF',
    'Word to PDF': 'Word sang PDF',
    'Excel to PDF': 'Excel sang PDF',
    'PowerPoint to PDF': 'PowerPoint sang PDF',
    'JPG to PDF': 'JPG sang PDF',
    'PDF to Word': 'PDF sang Word',
    'PDF to Excel': 'PDF sang Excel',
    'PDF to Powerpoint': 'PDF sang Powerpoint',
    'PDF to JPG': 'PDF sang JPG',
    'PDF to PNG': 'PDF sang PNG',
    'Extract PDF Images': 'Trích xuất Hình ảnh PDF',
    'PDF to PDF/A': 'PDF sang PDF/A',
    'Edit PDF': 'Chỉnh sửa PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Làm phẳng PDF',
    'AI Summary': 'Tóm tắt AI'
  },
  'ur': {
    'All Tools': 'تمام ٹولز',
    'Workspace': 'ورک اسپیس',
    'AI Lab': 'AI لیب',
    'Settings': 'ترتیبات',
    'OmniPDF AI Suite': 'OmniPDF AI سوٹ',
    'New Project': 'نیا پروجیکٹ',
    'Convert to PDF': 'PDF میں تبدیل کریں',
    'Convert from PDF': 'PDF سے تبدیل کریں',
    'Organize': 'منظم کریں',
    'Edit': 'ترمیم کریں',
    'Security': 'سیکیورٹی',
    'AI Magic': 'AI جادو',
    'Drag & Drop files here': 'فائلیں یہاں گھسیٹیں اور چھوڑیں',
    'or click below to browse': 'یا براؤز کرنے کے لیے نیچے کلک کریں',
    'Select Files': 'فائلیں منتخب کریں',
    'Merge PDF': 'PDF ضم کریں',
    'Split PDF': 'PDF تقسیم کریں',
    'Delete Pages': 'صفحات حذف کریں',
    'Rotate PDF': 'PDF گھمائیں',
    'Compress PDF': 'PDF کمپریس کریں',
    'Repair PDF': 'PDF مرمت کریں',
    'Protect PDF': 'PDF محفوظ کریں',
    'Unlock PDF': 'PDF ان لاک کریں',
    'Sign PDF': 'PDF پر دستخط کریں',
    'Redact PDF': 'PDF ترمیم کریں',
    'Word to PDF': 'Word سے PDF',
    'Excel to PDF': 'Excel سے PDF',
    'PowerPoint to PDF': 'PowerPoint سے PDF',
    'JPG to PDF': 'JPG سے PDF',
    'PDF to Word': 'PDF سے Word',
    'PDF to Excel': 'PDF سے Excel',
    'PDF to Powerpoint': 'PDF سے Powerpoint',
    'PDF to JPG': 'PDF سے JPG',
    'PDF to PNG': 'PDF سے PNG',
    'Extract PDF Images': 'PDF تصاویر نکالیں',
    'PDF to PDF/A': 'PDF سے PDF/A',
    'Edit PDF': 'PDF ترمیم کریں',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF ہموار کریں',
    'AI Summary': 'AI خلاصہ'
  },
  'fa': {
    'All Tools': 'همه ابزارها',
    'Workspace': 'فضای کاری',
    'AI Lab': 'آزمایشگاه هوش مصنوعی',
    'Settings': 'تنظیمات',
    'OmniPDF AI Suite': 'مجموعه OmniPDF AI',
    'New Project': 'پروژه جدید',
    'Convert to PDF': 'تبدیل به PDF',
    'Convert from PDF': 'تبدیل از PDF',
    'Organize': 'سازماندهی',
    'Edit': 'ویرایش',
    'Security': 'امنیت',
    'AI Magic': 'جادوی هوش مصنوعی',
    'Drag & Drop files here': 'فایل‌ها را اینجا بکشید و رها کنید',
    'or click below to browse': 'یا برای مرور کلیک کنید',
    'Select Files': 'انتخاب فایل‌ها',
    'Merge PDF': 'ادغام PDF',
    'Split PDF': 'تقسیم PDF',
    'Delete Pages': 'حذف صفحات',
    'Rotate PDF': 'چرخش PDF',
    'Compress PDF': 'فشرده‌سازی PDF',
    'Repair PDF': 'تعمیر PDF',
    'Protect PDF': 'محافظت از PDF',
    'Unlock PDF': 'باز کردن قفل PDF',
    'Sign PDF': 'امضای PDF',
    'Redact PDF': 'ویرایش PDF',
    'Word to PDF': 'Word به PDF',
    'Excel to PDF': 'Excel به PDF',
    'PowerPoint to PDF': 'PowerPoint به PDF',
    'JPG to PDF': 'JPG به PDF',
    'PDF to Word': 'PDF به Word',
    'PDF to Excel': 'PDF به Excel',
    'PDF to Powerpoint': 'PDF به Powerpoint',
    'PDF to JPG': 'PDF به JPG',
    'PDF to PNG': 'PDF به PNG',
    'Extract PDF Images': 'استخراج تصاویر PDF',
    'PDF to PDF/A': 'PDF به PDF/A',
    'Edit PDF': 'ویرایش PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'صاف کردن PDF',
    'AI Summary': 'خلاصه هوش مصنوعی'
  },
  'zh-CN': {
    'All Tools': '所有工具',
    'Workspace': '工作区',
    'AI Lab': 'AI实验室',
    'Settings': '设置',
    'OmniPDF AI Suite': 'OmniPDF AI套件',
    'New Project': '新项目',
    'Convert to PDF': '转换为PDF',
    'Convert from PDF': '从PDF转换',
    'Organize': '整理',
    'Edit': '编辑',
    'Security': '安全',
    'AI Magic': 'AI魔法',
    'Drag & Drop files here': '将文件拖放到此处',
    'or click below to browse': '或点击下方浏览',
    'Select Files': '选择文件',
    'Merge PDF': '合并PDF',
    'Split PDF': '分割PDF',
    'Delete Pages': '删除页面',
    'Rotate PDF': '旋转PDF',
    'Compress PDF': '压缩PDF',
    'Repair PDF': '修复PDF',
    'Protect PDF': '保护PDF',
    'Unlock PDF': '解锁PDF',
    'Sign PDF': '签署PDF',
    'Redact PDF': '编辑PDF',
    'Word to PDF': 'Word转PDF',
    'Excel to PDF': 'Excel转PDF',
    'PowerPoint to PDF': 'PowerPoint转PDF',
    'JPG to PDF': 'JPG转PDF',
    'PDF to Word': 'PDF转Word',
    'PDF to Excel': 'PDF转Excel',
    'PDF to Powerpoint': 'PDF转Powerpoint',
    'PDF to JPG': 'PDF转JPG',
    'PDF to PNG': 'PDF转PNG',
    'Extract PDF Images': '提取PDF图片',
    'PDF to PDF/A': 'PDF转PDF/A',
    'Edit PDF': '编辑PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': '展平PDF',
    'AI Summary': 'AI摘要'
  },
  'zh-TW': {
    'All Tools': '所有工具',
    'Workspace': '工作區',
    'AI Lab': 'AI實驗室',
    'Settings': '設定',
    'OmniPDF AI Suite': 'OmniPDF AI套件',
    'New Project': '新專案',
    'Convert to PDF': '轉換為PDF',
    'Convert from PDF': '從PDF轉換',
    'Organize': '整理',
    'Edit': '編輯',
    'Security': '安全',
    'AI Magic': 'AI魔法',
    'Drag & Drop files here': '將檔案拖放至此處',
    'or click below to browse': '或點擊下方瀏覽',
    'Select Files': '選擇檔案',
    'Merge PDF': '合併PDF',
    'Split PDF': '分割PDF',
    'Delete Pages': '刪除頁面',
    'Rotate PDF': '旋轉PDF',
    'Compress PDF': '壓縮PDF',
    'Repair PDF': '修復PDF',
    'Protect PDF': '保護PDF',
    'Unlock PDF': '解鎖PDF',
    'Sign PDF': '簽署PDF',
    'Redact PDF': '編輯PDF',
    'Word to PDF': 'Word轉PDF',
    'Excel to PDF': 'Excel轉PDF',
    'PowerPoint to PDF': 'PowerPoint轉PDF',
    'JPG to PDF': 'JPG轉PDF',
    'PDF to Word': 'PDF轉Word',
    'PDF to Excel': 'PDF轉Excel',
    'PDF to Powerpoint': 'PDF轉Powerpoint',
    'PDF to JPG': 'PDF轉JPG',
    'PDF to PNG': 'PDF轉PNG',
    'Extract PDF Images': '提取PDF圖片',
    'PDF to PDF/A': 'PDF轉PDF/A',
    'Edit PDF': '編輯PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': '扁平化PDF',
    'AI Summary': 'AI摘要'
  },
  'th': {
    'All Tools': 'เครื่องมือทั้งหมด',
    'Workspace': 'พื้นที่ทำงาน',
    'AI Lab': 'ห้องทดลอง AI',
    'Settings': 'การตั้งค่า',
    'OmniPDF AI Suite': 'ชุด OmniPDF AI',
    'New Project': 'โปรเจคใหม่',
    'Convert to PDF': 'แปลงเป็น PDF',
    'Convert from PDF': 'แปลงจาก PDF',
    'Organize': 'จัดระเบียบ',
    'Edit': 'แก้ไข',
    'Security': 'ความปลอดภัย',
    'AI Magic': 'เวทย์มนตร์ AI',
    'Drag & Drop files here': 'ลากและวางไฟล์ที่นี่',
    'or click below to browse': 'หรือคลิกด้านล่างเพื่อเรียกดู',
    'Select Files': 'เลือกไฟล์',
    'Merge PDF': 'รวม PDF',
    'Split PDF': 'แบ่ง PDF',
    'Delete Pages': 'ลบหน้า',
    'Rotate PDF': 'หมุน PDF',
    'Compress PDF': 'บีบอัด PDF',
    'Repair PDF': 'ซ่อมแซม PDF',
    'Protect PDF': 'ปกป้อง PDF',
    'Unlock PDF': 'ปลดล็อก PDF',
    'Sign PDF': 'ลงนาม PDF',
    'Redact PDF': 'แก้ไข PDF',
    'Word to PDF': 'Word เป็น PDF',
    'Excel to PDF': 'Excel เป็น PDF',
    'PowerPoint to PDF': 'PowerPoint เป็น PDF',
    'JPG to PDF': 'JPG เป็น PDF',
    'PDF to Word': 'PDF เป็น Word',
    'PDF to Excel': 'PDF เป็น Excel',
    'PDF to Powerpoint': 'PDF เป็น Powerpoint',
    'PDF to JPG': 'PDF เป็น JPG',
    'PDF to PNG': 'PDF เป็น PNG',
    'Extract PDF Images': 'แยกภาพจาก PDF',
    'PDF to PDF/A': 'PDF เป็น PDF/A',
    'Edit PDF': 'แก้ไข PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'ทำให้ PDF แบน',
    'AI Summary': 'สรุป AI'
  },
  'pl': {
    'All Tools': 'Wszystkie narzędzia',
    'Workspace': 'Przestrzeń robocza',
    'AI Lab': 'Laboratorium AI',
    'Settings': 'Ustawienia',
    'OmniPDF AI Suite': 'Pakiet OmniPDF AI',
    'New Project': 'Nowy projekt',
    'Convert to PDF': 'Konwertuj na PDF',
    'Convert from PDF': 'Konwertuj z PDF',
    'Organize': 'Organizuj',
    'Edit': 'Edytuj',
    'Security': 'Bezpieczeństwo',
    'AI Magic': 'Magia AI',
    'Drag & Drop files here': 'Przeciągnij i upuść pliki tutaj',
    'or click below to browse': 'lub kliknij poniżej, aby przeglądać',
    'Select Files': 'Wybierz pliki',
    'Merge PDF': 'Scal PDF',
    'Split PDF': 'Podziel PDF',
    'Delete Pages': 'Usuń strony',
    'Rotate PDF': 'Obróć PDF',
    'Compress PDF': 'Kompresuj PDF',
    'Repair PDF': 'Napraw PDF',
    'Protect PDF': 'Chroń PDF',
    'Unlock PDF': 'Odblokuj PDF',
    'Sign PDF': 'Podpisz PDF',
    'Redact PDF': 'Edytuj PDF',
    'Word to PDF': 'Word do PDF',
    'Excel to PDF': 'Excel do PDF',
    'PowerPoint to PDF': 'PowerPoint do PDF',
    'JPG to PDF': 'JPG do PDF',
    'PDF to Word': 'PDF do Word',
    'PDF to Excel': 'PDF do Excel',
    'PDF to Powerpoint': 'PDF do Powerpoint',
    'PDF to JPG': 'PDF do JPG',
    'PDF to PNG': 'PDF do PNG',
    'Extract PDF Images': 'Wyciągnij obrazy z PDF',
    'PDF to PDF/A': 'PDF do PDF/A',
    'Edit PDF': 'Edytuj PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Spłaszcz PDF',
    'AI Summary': 'Podsumowanie AI'
  },
  'uk': {
    'All Tools': 'Всі інструменти',
    'Workspace': 'Робочий простір',
    'AI Lab': 'Лабораторія ШІ',
    'Settings': 'Налаштування',
    'OmniPDF AI Suite': 'Набір OmniPDF AI',
    'New Project': 'Новий проект',
    'Convert to PDF': 'Конвертувати в PDF',
    'Convert from PDF': 'Конвертувати з PDF',
    'Organize': 'Організувати',
    'Edit': 'Редагувати',
    'Security': 'Безпека',
    'AI Magic': 'Маґія ШІ',
    'Drag & Drop files here': 'Перетягніть файли сюди',
    'or click below to browse': 'або натисніть нижче для перегляду',
    'Select Files': 'Виберіть файли',
    'Merge PDF': 'Об\'єднати PDF',
    'Split PDF': 'Розділити PDF',
    'Delete Pages': 'Видалити сторінки',
    'Rotate PDF': 'Повернути PDF',
    'Compress PDF': 'Стиснути PDF',
    'Repair PDF': 'Відновити PDF',
    'Protect PDF': 'Захистити PDF',
    'Unlock PDF': 'Розблокувати PDF',
    'Sign PDF': 'Підписати PDF',
    'Redact PDF': 'Редагувати PDF',
    'Word to PDF': 'Word у PDF',
    'Excel to PDF': 'Excel у PDF',
    'PowerPoint to PDF': 'PowerPoint у PDF',
    'JPG to PDF': 'JPG у PDF',
    'PDF to Word': 'PDF у Word',
    'PDF to Excel': 'PDF у Excel',
    'PDF to Powerpoint': 'PDF у Powerpoint',
    'PDF to JPG': 'PDF у JPG',
    'PDF to PNG': 'PDF у PNG',
    'Extract PDF Images': 'Витягти зображення з PDF',
    'PDF to PDF/A': 'PDF у PDF/A',
    'Edit PDF': 'Редагувати PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Згладити PDF',
    'AI Summary': 'Резюме ШІ'
  },
  'nl': {
    'All Tools': 'Alle hulpmiddelen',
    'Workspace': 'Werkruimte',
    'AI Lab': 'AI Lab',
    'Settings': 'Instellingen',
    'OmniPDF AI Suite': 'OmniPDF AI Suite',
    'New Project': 'Nieuw project',
    'Convert to PDF': 'Converteren naar PDF',
    'Convert from PDF': 'Converteren van PDF',
    'Organize': 'Organiseren',
    'Edit': 'Bewerken',
    'Security': 'Beveiliging',
    'AI Magic': 'AI magie',
    'Drag & Drop files here': 'Sleep bestanden hierheen',
    'or click below to browse': 'of klik hieronder om te bladeren',
    'Select Files': 'Selecteer bestanden',
    'Merge PDF': 'PDF samenvoegen',
    'Split PDF': 'PDF splitsen',
    'Delete Pages': 'Pagina\'s verwijderen',
    'Rotate PDF': 'PDF draaien',
    'Compress PDF': 'PDF comprimeren',
    'Repair PDF': 'PDF repareren',
    'Protect PDF': 'PDF beschermen',
    'Unlock PDF': 'PDF ontgrendelen',
    'Sign PDF': 'PDF ondertekenen',
    'Redact PDF': 'PDF bewerken',
    'Word to PDF': 'Word naar PDF',
    'Excel to PDF': 'Excel naar PDF',
    'PowerPoint to PDF': 'PowerPoint naar PDF',
    'JPG to PDF': 'JPG naar PDF',
    'PDF to Word': 'PDF naar Word',
    'PDF to Excel': 'PDF naar Excel',
    'PDF to Powerpoint': 'PDF naar Powerpoint',
    'PDF to JPG': 'PDF naar JPG',
    'PDF to PNG': 'PDF naar PNG',
    'Extract PDF Images': 'PDF-afbeeldingen extraheren',
    'PDF to PDF/A': 'PDF naar PDF/A',
    'Edit PDF': 'PDF bewerken',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF afvlakken',
    'AI Summary': 'AI samenvatting'
  },
  'ro': {
    'All Tools': 'Toate instrumentele',
    'Workspace': 'Spațiu de lucru',
    'AI Lab': 'Laborator AI',
    'Settings': 'Setări',
    'OmniPDF AI Suite': 'Suită OmniPDF AI',
    'New Project': 'Proiect nou',
    'Convert to PDF': 'Convertește în PDF',
    'Convert from PDF': 'Convertește din PDF',
    'Organize': 'Organizează',
    'Edit': 'Editează',
    'Security': 'Securitate',
    'AI Magic': 'Magie AI',
    'Drag & Drop files here': 'Trage și plasează fișierele aici',
    'or click below to browse': 'sau fă clic mai jos pentru a răsfoi',
    'Select Files': 'Selectează fișiere',
    'Merge PDF': 'Îmbină PDF',
    'Split PDF': 'Împarte PDF',
    'Delete Pages': 'Șterge pagini',
    'Rotate PDF': 'Rotește PDF',
    'Compress PDF': 'Comprimă PDF',
    'Repair PDF': 'Repară PDF',
    'Protect PDF': 'Protejează PDF',
    'Unlock PDF': 'Deblochează PDF',
    'Sign PDF': 'Semnează PDF',
    'Redact PDF': 'Editează PDF',
    'Word to PDF': 'Word în PDF',
    'Excel to PDF': 'Excel în PDF',
    'PowerPoint to PDF': 'PowerPoint în PDF',
    'JPG to PDF': 'JPG în PDF',
    'PDF to Word': 'PDF în Word',
    'PDF to Excel': 'PDF în Excel',
    'PDF to Powerpoint': 'PDF în Powerpoint',
    'PDF to JPG': 'PDF în JPG',
    'PDF to PNG': 'PDF în PNG',
    'Extract PDF Images': 'Extrage imagini din PDF',
    'PDF to PDF/A': 'PDF în PDF/A',
    'Edit PDF': 'Editează PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Aplatișează PDF',
    'AI Summary': 'Rezumat AI'
  },
  'el': {
    'All Tools': 'Όλα τα εργαλεία',
    'Workspace': 'Χώρος εργασίας',
    'AI Lab': 'Εργαστήριο AI',
    'Settings': 'Ρυθμίσεις',
    'OmniPDF AI Suite': 'Σουίτα OmniPDF AI',
    'New Project': 'Νέο έργο',
    'Convert to PDF': 'Μετατροπή σε PDF',
    'Convert from PDF': 'Μετατροπή από PDF',
    'Organize': 'Οργάνωση',
    'Edit': 'Επεξεργασία',
    'Security': 'Ασφάλεια',
    'AI Magic': 'Μαγεία AI',
    'Drag & Drop files here': 'Σύρετε και αφήστε τα αρχεία εδώ',
    'or click below to browse': 'ή κάντε κλικ παρακάτω για περιήγηση',
    'Select Files': 'Επιλέξτε αρχεία',
    'Merge PDF': 'Συγχώνευση PDF',
    'Split PDF': 'Διαχωρισμός PDF',
    'Delete Pages': 'Διαγραφή σελίδων',
    'Rotate PDF': 'Περιστροφή PDF',
    'Compress PDF': 'Συμπίεση PDF',
    'Repair PDF': 'Επιδιόρθωση PDF',
    'Protect PDF': 'Προστασία PDF',
    'Unlock PDF': 'Ξεκλείδωμα PDF',
    'Sign PDF': 'Υπογραφή PDF',
    'Redact PDF': 'Επεξεργασία PDF',
    'Word to PDF': 'Word σε PDF',
    'Excel to PDF': 'Excel σε PDF',
    'PowerPoint to PDF': 'PowerPoint σε PDF',
    'JPG to PDF': 'JPG σε PDF',
    'PDF to Word': 'PDF σε Word',
    'PDF to Excel': 'PDF σε Excel',
    'PDF to Powerpoint': 'PDF σε Powerpoint',
    'PDF to JPG': 'PDF σε JPG',
    'PDF to PNG': 'PDF σε PNG',
    'Extract PDF Images': 'Εξαγωγή εικόνων PDF',
    'PDF to PDF/A': 'PDF σε PDF/A',
    'Edit PDF': 'Επεξεργασία PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Εξομάλυνση PDF',
    'AI Summary': 'Περίληψη AI'
  },
  'cs': {
    'All Tools': 'Všechny nástroje',
    'Workspace': 'Pracovní prostor',
    'AI Lab': 'AI laboratoř',
    'Settings': 'Nastavení',
    'OmniPDF AI Suite': 'OmniPDF AI sada',
    'New Project': 'Nový projekt',
    'Convert to PDF': 'Převést na PDF',
    'Convert from PDF': 'Převést z PDF',
    'Organize': 'Organizovat',
    'Edit': 'Upravit',
    'Security': 'Zabezpečení',
    'AI Magic': 'AI magie',
    'Drag & Drop files here': 'Přetáhněte soubory sem',
    'or click below to browse': 'nebo klikněte níže pro procházení',
    'Select Files': 'Vybrat soubory',
    'Merge PDF': 'Sloučit PDF',
    'Split PDF': 'Rozdělit PDF',
    'Delete Pages': 'Smazat stránky',
    'Rotate PDF': 'Otočit PDF',
    'Compress PDF': 'Komprimovat PDF',
    'Repair PDF': 'Opravit PDF',
    'Protect PDF': 'Chránit PDF',
    'Unlock PDF': 'Odemknout PDF',
    'Sign PDF': 'Podepsat PDF',
    'Redact PDF': 'Upravit PDF',
    'Word to PDF': 'Word do PDF',
    'Excel to PDF': 'Excel do PDF',
    'PowerPoint to PDF': 'PowerPoint do PDF',
    'JPG to PDF': 'JPG do PDF',
    'PDF to Word': 'PDF do Word',
    'PDF to Excel': 'PDF do Excel',
    'PDF to Powerpoint': 'PDF do Powerpoint',
    'PDF to JPG': 'PDF do JPG',
    'PDF to PNG': 'PDF do PNG',
    'Extract PDF Images': 'Extrahovat obrázky z PDF',
    'PDF to PDF/A': 'PDF do PDF/A',
    'Edit PDF': 'Upravit PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Vyrovnat PDF',
    'AI Summary': 'AI shrnutí'
  },
  'sv': {
    'All Tools': 'Alla verktyg',
    'Workspace': 'Arbetsyta',
    'AI Lab': 'AI-laboratorium',
    'Settings': 'Inställningar',
    'OmniPDF AI Suite': 'OmniPDF AI-svit',
    'New Project': 'Nytt projekt',
    'Convert to PDF': 'Konvertera till PDF',
    'Convert from PDF': 'Konvertera från PDF',
    'Organize': 'Organisera',
    'Edit': 'Redigera',
    'Security': 'Säkerhet',
    'AI Magic': 'AI-magi',
    'Drag & Drop files here': 'Dra och släpp filer här',
    'or click below to browse': 'eller klicka nedan för att bläddra',
    'Select Files': 'Välj filer',
    'Merge PDF': 'Slå samman PDF',
    'Split PDF': 'Dela PDF',
    'Delete Pages': 'Ta bort sidor',
    'Rotate PDF': 'Rotera PDF',
    'Compress PDF': 'Komprimera PDF',
    'Repair PDF': 'Reparera PDF',
    'Protect PDF': 'Skydda PDF',
    'Unlock PDF': 'Lås upp PDF',
    'Sign PDF': 'Signera PDF',
    'Redact PDF': 'Redigera PDF',
    'Word to PDF': 'Word till PDF',
    'Excel to PDF': 'Excel till PDF',
    'PowerPoint to PDF': 'PowerPoint till PDF',
    'JPG to PDF': 'JPG till PDF',
    'PDF to Word': 'PDF till Word',
    'PDF to Excel': 'PDF till Excel',
    'PDF to Powerpoint': 'PDF till Powerpoint',
    'PDF to JPG': 'PDF till JPG',
    'PDF to PNG': 'PDF till PNG',
    'Extract PDF Images': 'Extrahera PDF-bilder',
    'PDF to PDF/A': 'PDF till PDF/A',
    'Edit PDF': 'Redigera PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Platta till PDF',
    'AI Summary': 'AI-sammanfattning'
  },
  'hu': {
    'All Tools': 'Összes eszköz',
    'Workspace': 'Munkaterület',
    'AI Lab': 'AI labor',
    'Settings': 'Beállítások',
    'OmniPDF AI Suite': 'OmniPDF AI csomag',
    'New Project': 'Új projekt',
    'Convert to PDF': 'Konvertálás PDF-be',
    'Convert from PDF': 'Konvertálás PDF-ből',
    'Organize': 'Szervezés',
    'Edit': 'Szerkesztés',
    'Security': 'Biztonság',
    'AI Magic': 'AI varázslat',
    'Drag & Drop files here': 'Húzza ide a fájlokat',
    'or click below to browse': 'vagy kattintson alább a böngészéshez',
    'Select Files': 'Fájlok kiválasztása',
    'Merge PDF': 'PDF egyesítése',
    'Split PDF': 'PDF felosztása',
    'Delete Pages': 'Oldalak törlése',
    'Rotate PDF': 'PDF forgatása',
    'Compress PDF': 'PDF tömörítése',
    'Repair PDF': 'PDF javítása',
    'Protect PDF': 'PDF védelme',
    'Unlock PDF': 'PDF feloldása',
    'Sign PDF': 'PDF aláírása',
    'Redact PDF': 'PDF szerkesztése',
    'Word to PDF': 'Word PDF-be',
    'Excel to PDF': 'Excel PDF-be',
    'PowerPoint to PDF': 'PowerPoint PDF-be',
    'JPG to PDF': 'JPG PDF-be',
    'PDF to Word': 'PDF Word-be',
    'PDF to Excel': 'PDF Excel-be',
    'PDF to Powerpoint': 'PDF Powerpoint-ba',
    'PDF to JPG': 'PDF JPG-be',
    'PDF to PNG': 'PDF PNG-be',
    'Extract PDF Images': 'PDF képek kinyerése',
    'PDF to PDF/A': 'PDF PDF/A-ba',
    'Edit PDF': 'PDF szerkesztése',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF lapítása',
    'AI Summary': 'AI összefoglaló'
  },
  'no': {
    'All Tools': 'Alle verktøy',
    'Workspace': 'Arbeidsområde',
    'AI Lab': 'AI-laboratorium',
    'Settings': 'Innstillinger',
    'OmniPDF AI Suite': 'OmniPDF AI-suite',
    'New Project': 'Nytt prosjekt',
    'Convert to PDF': 'Konverter til PDF',
    'Convert from PDF': 'Konverter fra PDF',
    'Organize': 'Organiser',
    'Edit': 'Rediger',
    'Security': 'Sikkerhet',
    'AI Magic': 'AI-magi',
    'Drag & Drop files here': 'Dra og slipp filer her',
    'or click below to browse': 'eller klikk nedenfor for å bla gjennom',
    'Select Files': 'Velg filer',
    'Merge PDF': 'Slå sammen PDF',
    'Split PDF': 'Del PDF',
    'Delete Pages': 'Slett sider',
    'Rotate PDF': 'Roter PDF',
    'Compress PDF': 'Komprimer PDF',
    'Repair PDF': 'Reparer PDF',
    'Protect PDF': 'Beskytt PDF',
    'Unlock PDF': 'Lås opp PDF',
    'Sign PDF': 'Signer PDF',
    'Redact PDF': 'Rediger PDF',
    'Word to PDF': 'Word til PDF',
    'Excel to PDF': 'Excel til PDF',
    'PowerPoint to PDF': 'PowerPoint til PDF',
    'JPG to PDF': 'JPG til PDF',
    'PDF to Word': 'PDF til Word',
    'PDF to Excel': 'PDF til Excel',
    'PDF to Powerpoint': 'PDF til Powerpoint',
    'PDF to JPG': 'PDF til JPG',
    'PDF to PNG': 'PDF til PNG',
    'Extract PDF Images': 'Trekk ut PDF-bilder',
    'PDF to PDF/A': 'PDF til PDF/A',
    'Edit PDF': 'Rediger PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Flatt PDF',
    'AI Summary': 'AI-sammendrag'
  },
  'sk': {
    'All Tools': 'Všetky nástroje',
    'Workspace': 'Pracovný priestor',
    'AI Lab': 'AI laboratórium',
    'Settings': 'Nastavenia',
    'OmniPDF AI Suite': 'OmniPDF AI súprava',
    'New Project': 'Nový projekt',
    'Convert to PDF': 'Konvertovať na PDF',
    'Convert from PDF': 'Konvertovať z PDF',
    'Organize': 'Organizovať',
    'Edit': 'Upraviť',
    'Security': 'Zabezpečenie',
    'AI Magic': 'AI mágia',
    'Drag & Drop files here': 'Pretiahnite súbory sem',
    'or click below to browse': 'alebo kliknite nižšie na prehľadanie',
    'Select Files': 'Vybrať súbory',
    'Merge PDF': 'Zlúčiť PDF',
    'Split PDF': 'Rozdeliť PDF',
    'Delete Pages': 'Odstrániť stránky',
    'Rotate PDF': 'Otočiť PDF',
    'Compress PDF': 'Komprimovať PDF',
    'Repair PDF': 'Opraviť PDF',
    'Protect PDF': 'Chrániť PDF',
    'Unlock PDF': 'Odomknúť PDF',
    'Sign PDF': 'Podpísať PDF',
    'Redact PDF': 'Upraviť PDF',
    'Word to PDF': 'Word do PDF',
    'Excel to PDF': 'Excel do PDF',
    'PowerPoint to PDF': 'PowerPoint do PDF',
    'JPG to PDF': 'JPG do PDF',
    'PDF to Word': 'PDF do Word',
    'PDF to Excel': 'PDF do Excel',
    'PDF to Powerpoint': 'PDF do Powerpoint',
    'PDF to JPG': 'PDF do JPG',
    'PDF to PNG': 'PDF do PNG',
    'Extract PDF Images': 'Extrahovať obrázky z PDF',
    'PDF to PDF/A': 'PDF do PDF/A',
    'Edit PDF': 'Upraviť PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Vyrovnať PDF',
    'AI Summary': 'AI súhrn'
  },
  'bg': {
    'All Tools': 'Всички инструменти',
    'Workspace': 'Работно пространство',
    'AI Lab': 'AI лаборатория',
    'Settings': 'Настройки',
    'OmniPDF AI Suite': 'OmniPDF AI комплект',
    'New Project': 'Нов проект',
    'Convert to PDF': 'Конвертиране в PDF',
    'Convert from PDF': 'Конвертиране от PDF',
    'Organize': 'Организиране',
    'Edit': 'Редактиране',
    'Security': 'Сигурност',
    'AI Magic': 'AI магия',
    'Drag & Drop files here': 'Плъзнете и пуснете файлове тук',
    'or click below to browse': 'или кликнете по-долу за разглеждане',
    'Select Files': 'Изберете файлове',
    'Merge PDF': 'Обединяване на PDF',
    'Split PDF': 'Разделяне на PDF',
    'Delete Pages': 'Изтриване на страници',
    'Rotate PDF': 'Завъртане на PDF',
    'Compress PDF': 'Компресиране на PDF',
    'Repair PDF': 'Поправка на PDF',
    'Protect PDF': 'Защита на PDF',
    'Unlock PDF': 'Отключване на PDF',
    'Sign PDF': 'Подписване на PDF',
    'Redact PDF': 'Редактиране на PDF',
    'Word to PDF': 'Word към PDF',
    'Excel to PDF': 'Excel към PDF',
    'PowerPoint to PDF': 'PowerPoint към PDF',
    'JPG to PDF': 'JPG към PDF',
    'PDF to Word': 'PDF към Word',
    'PDF to Excel': 'PDF към Excel',
    'PDF to Powerpoint': 'PDF към Powerpoint',
    'PDF to JPG': 'PDF към JPG',
    'PDF to PNG': 'PDF към PNG',
    'Extract PDF Images': 'Извличане на PDF изображения',
    'PDF to PDF/A': 'PDF към PDF/A',
    'Edit PDF': 'Редактиране на PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Изравняване на PDF',
    'AI Summary': 'AI резюме'
  },
  'hr': {
    'All Tools': 'Svi alati',
    'Workspace': 'Radni prostor',
    'AI Lab': 'AI laboratorij',
    'Settings': 'Postavke',
    'OmniPDF AI Suite': 'OmniPDF AI paket',
    'New Project': 'Novi projekt',
    'Convert to PDF': 'Pretvori u PDF',
    'Convert from PDF': 'Pretvori iz PDF',
    'Organize': 'Organiziraj',
    'Edit': 'Uredi',
    'Security': 'Sigurnost',
    'AI Magic': 'AI magija',
    'Drag & Drop files here': 'Povucite i ispustite datoteke ovdje',
    'or click below to browse': 'ili kliknite ispod za pregledavanje',
    'Select Files': 'Odaberite datoteke',
    'Merge PDF': 'Spoji PDF',
    'Split PDF': 'Razdvoji PDF',
    'Delete Pages': 'Izbriši stranice',
    'Rotate PDF': 'Rotiraj PDF',
    'Compress PDF': 'Sažmi PDF',
    'Repair PDF': 'Popravi PDF',
    'Protect PDF': 'Zaštiti PDF',
    'Unlock PDF': 'Otključaj PDF',
    'Sign PDF': 'Potpiši PDF',
    'Redact PDF': 'Uredi PDF',
    'Word to PDF': 'Word u PDF',
    'Excel to PDF': 'Excel u PDF',
    'PowerPoint to PDF': 'PowerPoint u PDF',
    'JPG to PDF': 'JPG u PDF',
    'PDF to Word': 'PDF u Word',
    'PDF to Excel': 'PDF u Excel',
    'PDF to Powerpoint': 'PDF u Powerpoint',
    'PDF to JPG': 'PDF u JPG',
    'PDF to PNG': 'PDF u PNG',
    'Extract PDF Images': 'Izdvoji PDF slike',
    'PDF to PDF/A': 'PDF u PDF/A',
    'Edit PDF': 'Uredi PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Izravnaj PDF',
    'AI Summary': 'AI sažetak'
  },
  'sr': {
    'All Tools': 'Svi alati',
    'Workspace': 'Radni prostor',
    'AI Lab': 'AI laboratorija',
    'Settings': 'Podešavanja',
    'OmniPDF AI Suite': 'OmniPDF AI paket',
    'New Project': 'Novi projekat',
    'Convert to PDF': 'Konvertuj u PDF',
    'Convert from PDF': 'Konvertuj iz PDF',
    'Organize': 'Organizuj',
    'Edit': 'Izmeni',
    'Security': 'Bezbednost',
    'AI Magic': 'AI magija',
    'Drag & Drop files here': 'Prevucite i otpustite fajlove ovde',
    'or click below to browse': 'ili kliknite ispod za pregledanje',
    'Select Files': 'Izaberite fajlove',
    'Merge PDF': 'Spoji PDF',
    'Split PDF': 'Podeli PDF',
    'Delete Pages': 'Obriši stranice',
    'Rotate PDF': 'Rotiraj PDF',
    'Compress PDF': 'Kompresuj PDF',
    'Repair PDF': 'Popravi PDF',
    'Protect PDF': 'Zaštiti PDF',
    'Unlock PDF': 'Otključaj PDF',
    'Sign PDF': 'Potpiši PDF',
    'Redact PDF': 'Izmeni PDF',
    'Word to PDF': 'Word u PDF',
    'Excel to PDF': 'Excel u PDF',
    'PowerPoint to PDF': 'PowerPoint u PDF',
    'JPG to PDF': 'JPG u PDF',
    'PDF to Word': 'PDF u Word',
    'PDF to Excel': 'PDF u Excel',
    'PDF to Powerpoint': 'PDF u Powerpoint',
    'PDF to JPG': 'PDF u JPG',
    'PDF to PNG': 'PDF u PNG',
    'Extract PDF Images': 'Izdvoji PDF slike',
    'PDF to PDF/A': 'PDF u PDF/A',
    'Edit PDF': 'Izmeni PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Poravnaj PDF',
    'AI Summary': 'AI sažetak'
  },
  'lt': {
    'All Tools': 'Visi įrankiai',
    'Workspace': 'Darbo sritis',
    'AI Lab': 'AI laboratorija',
    'Settings': 'Nustatymai',
    'OmniPDF AI Suite': 'OmniPDF AI rinkinys',
    'New Project': 'Naujas projektas',
    'Convert to PDF': 'Konvertuoti į PDF',
    'Convert from PDF': 'Konvertuoti iš PDF',
    'Organize': 'Organizuoti',
    'Edit': 'Redaguoti',
    'Security': 'Saugumas',
    'AI Magic': 'AI magija',
    'Drag & Drop files here': 'Nutempkite failus čia',
    'or click below to browse': 'arba spustelėkite žemiau naršyti',
    'Select Files': 'Pasirinkti failus',
    'Merge PDF': 'Sulieti PDF',
    'Split PDF': 'Padalinti PDF',
    'Delete Pages': 'Ištrinti puslapius',
    'Rotate PDF': 'Pasukti PDF',
    'Compress PDF': 'Suspausti PDF',
    'Repair PDF': 'Pataisyti PDF',
    'Protect PDF': 'Apsaugoti PDF',
    'Unlock PDF': 'Atrakinti PDF',
    'Sign PDF': 'Pasirašyti PDF',
    'Redact PDF': 'Redaguoti PDF',
    'Word to PDF': 'Word į PDF',
    'Excel to PDF': 'Excel į PDF',
    'PowerPoint to PDF': 'PowerPoint į PDF',
    'JPG to PDF': 'JPG į PDF',
    'PDF to Word': 'PDF į Word',
    'PDF to Excel': 'PDF į Excel',
    'PDF to Powerpoint': 'PDF į Powerpoint',
    'PDF to JPG': 'PDF į JPG',
    'PDF to PNG': 'PDF į PNG',
    'Extract PDF Images': 'Ištraukti PDF vaizdus',
    'PDF to PDF/A': 'PDF į PDF/A',
    'Edit PDF': 'Redaguoti PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Išlyginti PDF',
    'AI Summary': 'AI santrauka'
  },
  'lv': {
    'All Tools': 'Visi rīki',
    'Workspace': 'Darbavieta',
    'AI Lab': 'AI laboratorija',
    'Settings': 'Iestatījumi',
    'OmniPDF AI Suite': 'OmniPDF AI komplekts',
    'New Project': 'Jauns projekts',
    'Convert to PDF': 'Konvertēt uz PDF',
    'Convert from PDF': 'Konvertēt no PDF',
    'Organize': 'Organizēt',
    'Edit': 'Rediģēt',
    'Security': 'Drošība',
    'AI Magic': 'AI maģija',
    'Drag & Drop files here': 'Velciet un nometiet failus šeit',
    'or click below to browse': 'vai noklikšķiniet zemāk, lai pārlūkotu',
    'Select Files': 'Izvēlēties failus',
    'Merge PDF': 'Apvienot PDF',
    'Split PDF': 'Sadalīt PDF',
    'Delete Pages': 'Dzēst lapas',
    'Rotate PDF': 'Pagriezt PDF',
    'Compress PDF': 'Saspiest PDF',
    'Repair PDF': 'Salabot PDF',
    'Protect PDF': 'Aizsargāt PDF',
    'Unlock PDF': 'Atbloķēt PDF',
    'Sign PDF': 'Parakstīt PDF',
    'Redact PDF': 'Rediģēt PDF',
    'Word to PDF': 'Word uz PDF',
    'Excel to PDF': 'Excel uz PDF',
    'PowerPoint to PDF': 'PowerPoint uz PDF',
    'JPG to PDF': 'JPG uz PDF',
    'PDF to Word': 'PDF uz Word',
    'PDF to Excel': 'PDF uz Excel',
    'PDF to Powerpoint': 'PDF uz Powerpoint',
    'PDF to JPG': 'PDF uz JPG',
    'PDF to PNG': 'PDF uz PNG',
    'Extract PDF Images': 'Izvilkt PDF attēlus',
    'PDF to PDF/A': 'PDF uz PDF/A',
    'Edit PDF': 'Rediģēt PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Nolīdzināt PDF',
    'AI Summary': 'AI kopsavilkums'
  },
  'et': {
    'All Tools': 'Kõik tööriistad',
    'Workspace': 'Tööala',
    'AI Lab': 'AI labor',
    'Settings': 'Seaded',
    'OmniPDF AI Suite': 'OmniPDF AI komplekt',
    'New Project': 'Uus projekt',
    'Convert to PDF': 'Teisenda PDF-ks',
    'Convert from PDF': 'Teisenda PDF-st',
    'Organize': 'Korralda',
    'Edit': 'Muuda',
    'Security': 'Turvalisus',
    'AI Magic': 'AI maagia',
    'Drag & Drop files here': 'Lohista failid siia',
    'or click below to browse': 'või klõpsa allpool sirvimiseks',
    'Select Files': 'Vali failid',
    'Merge PDF': 'Ühenda PDF',
    'Split PDF': 'Jaga PDF',
    'Delete Pages': 'Kustuta lehed',
    'Rotate PDF': 'Pööra PDF',
    'Compress PDF': 'Tihenda PDF',
    'Repair PDF': 'Paranda PDF',
    'Protect PDF': 'Kaitse PDF',
    'Unlock PDF': 'Ava PDF',
    'Sign PDF': 'Allkirjasta PDF',
    'Redact PDF': 'Muuda PDF',
    'Word to PDF': 'Word PDF-ks',
    'Excel to PDF': 'Excel PDF-ks',
    'PowerPoint to PDF': 'PowerPoint PDF-ks',
    'JPG to PDF': 'JPG PDF-ks',
    'PDF to Word': 'PDF Word-ks',
    'PDF to Excel': 'PDF Excel-ks',
    'PDF to Powerpoint': 'PDF Powerpoint-ks',
    'PDF to JPG': 'PDF JPG-ks',
    'PDF to PNG': 'PDF PNG-ks',
    'Extract PDF Images': 'Väljavõte PDF pildid',
    'PDF to PDF/A': 'PDF PDF/A-ks',
    'Edit PDF': 'Muuda PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Tasanda PDF',
    'AI Summary': 'AI kokkuvõte'
  },
  'af': {
    'All Tools': 'Alle gereedskap',
    'Workspace': 'Werkruimte',
    'AI Lab': 'AI laboratorium',
    'Settings': 'Instellings',
    'OmniPDF AI Suite': 'OmniPDF AI suite',
    'New Project': 'Nuwe projek',
    'Convert to PDF': 'Omskakel na PDF',
    'Convert from PDF': 'Omskakel van PDF',
    'Organize': 'Organiseer',
    'Edit': 'Wysig',
    'Security': 'Sekuriteit',
    'AI Magic': 'AI magie',
    'Drag & Drop files here': 'Sleep en laat val lêers hier',
    'or click below to browse': 'of klik hieronder om te blaai',
    'Select Files': 'Kies lêers',
    'Merge PDF': 'Voeg PDF saam',
    'Split PDF': 'Skei PDF',
    'Delete Pages': 'Verwyder bladsye',
    'Rotate PDF': 'Roteer PDF',
    'Compress PDF': 'Komprimeer PDF',
    'Repair PDF': 'Herstel PDF',
    'Protect PDF': 'Beskerm PDF',
    'Unlock PDF': 'Ontsluit PDF',
    'Sign PDF': 'Teken PDF',
    'Redact PDF': 'Wysig PDF',
    'Word to PDF': 'Word na PDF',
    'Excel to PDF': 'Excel na PDF',
    'PowerPoint to PDF': 'PowerPoint na PDF',
    'JPG to PDF': 'JPG na PDF',
    'PDF to Word': 'PDF na Word',
    'PDF to Excel': 'PDF na Excel',
    'PDF to Powerpoint': 'PDF na Powerpoint',
    'PDF to JPG': 'PDF na JPG',
    'PDF to PNG': 'PDF na PNG',
    'Extract PDF Images': 'Onttrek PDF beelde',
    'PDF to PDF/A': 'PDF na PDF/A',
    'Edit PDF': 'Wysig PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Vlak PDF',
    'AI Summary': 'AI opsomming'
  },
  'sw': {
    'All Tools': 'Zana zote',
    'Workspace': 'Sehemu ya kazi',
    'AI Lab': 'Maabara ya AI',
    'Settings': 'Mipangilio',
    'OmniPDF AI Suite': 'OmniPDF AI kifurushi',
    'New Project': 'Mradi mpya',
    'Convert to PDF': 'Badilisha kuwa PDF',
    'Convert from PDF': 'Badilisha kutoka PDF',
    'Organize': 'Panga',
    'Edit': 'Hariri',
    'Security': 'Usalama',
    'AI Magic': 'Uchawi wa AI',
    'Drag & Drop files here': 'Buruta na uache faili hapa',
    'or click below to browse': 'au bonyeza chini kutafuta',
    'Select Files': 'Chagua faili',
    'Merge PDF': 'Unganisha PDF',
    'Split PDF': 'Gawanya PDF',
    'Delete Pages': 'Futa kurasa',
    'Rotate PDF': 'Zungusha PDF',
    'Compress PDF': 'Kandamiza PDF',
    'Repair PDF': 'Rekebisha PDF',
    'Protect PDF': 'Linda PDF',
    'Unlock PDF': 'Fungua PDF',
    'Sign PDF': 'Tia sahihi PDF',
    'Redact PDF': 'Hariri PDF',
    'Word to PDF': 'Word kwenda PDF',
    'Excel to PDF': 'Excel kwenda PDF',
    'PowerPoint to PDF': 'PowerPoint kwenda PDF',
    'JPG to PDF': 'JPG kwenda PDF',
    'PDF to Word': 'PDF kwenda Word',
    'PDF to Excel': 'PDF kwenda Excel',
    'PDF to Powerpoint': 'PDF kwenda Powerpoint',
    'PDF to JPG': 'PDF kwenda JPG',
    'PDF to PNG': 'PDF kwenda PNG',
    'Extract PDF Images': 'Chomoa picha za PDF',
    'PDF to PDF/A': 'PDF kwenda PDF/A',
    'Edit PDF': 'Hariri PDF',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'Lainisha PDF',
    'AI Summary': 'Muhtasari wa AI'
  },
  'ne': {
    'All Tools': 'सबै उपकरणहरू',
    'Workspace': 'कार्यक्षेत्र',
    'AI Lab': 'AI प्रयोगशाला',
    'Settings': 'सेटिङहरू',
    'OmniPDF AI Suite': 'OmniPDF AI सूट',
    'New Project': 'नयाँ परियोजना',
    'Convert to PDF': 'PDF मा रूपान्तरण गर्नुहोस्',
    'Convert from PDF': 'PDF बाट रूपान्तरण गर्नुहोस्',
    'Organize': 'व्यवस्थित गर्नुहोस्',
    'Edit': 'सम्पादन गर्नुहोस्',
    'Security': 'सुरक्षा',
    'AI Magic': 'AI जादू',
    'Drag & Drop files here': 'फाइलहरू यहाँ तान्नुहोस् र छोड्नुहोस्',
    'or click below to browse': 'वा ब्राउज गर्न तल क्लिक गर्नुहोस्',
    'Select Files': 'फाइलहरू चयन गर्नुहोस्',
    'Merge PDF': 'PDF मर्ज गर्नुहोस्',
    'Split PDF': 'PDF विभाजन गर्नुहोस्',
    'Delete Pages': 'पृष्ठहरू मेटाउनुहोस्',
    'Rotate PDF': 'PDF घुमाउनुहोस्',
    'Compress PDF': 'PDF संकुचन गर्नुहोस्',
    'Repair PDF': 'PDF मर्मत गर्नुहोस्',
    'Protect PDF': 'PDF सुरक्षित गर्नुहोस्',
    'Unlock PDF': 'PDF अनलक गर्नुहोस्',
    'Sign PDF': 'PDF मा हस्ताक्षर गर्नुहोस्',
    'Redact PDF': 'PDF सम्पादन गर्नुहोस्',
    'Word to PDF': 'Word बाट PDF',
    'Excel to PDF': 'Excel बाट PDF',
    'PowerPoint to PDF': 'PowerPoint बाट PDF',
    'JPG to PDF': 'JPG बाट PDF',
    'PDF to Word': 'PDF बाट Word',
    'PDF to Excel': 'PDF बाट Excel',
    'PDF to Powerpoint': 'PDF बाट Powerpoint',
    'PDF to JPG': 'PDF बाट JPG',
    'PDF to PNG': 'PDF बाट PNG',
    'Extract PDF Images': 'PDF छविहरू निकाल्नुहोस्',
    'PDF to PDF/A': 'PDF बाट PDF/A',
    'Edit PDF': 'PDF सम्पादन गर्नुहोस्',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF समतल गर्नुहोस्',
    'AI Summary': 'AI सारांश'
  },
  'si': {
    'All Tools': 'සියලුම මෙවලම්',
    'Workspace': 'කාර්යාලය',
    'AI Lab': 'AI පර්යේෂණාගාරය',
    'Settings': 'සැකසීම්',
    'OmniPDF AI Suite': 'OmniPDF AI කට්ටලය',
    'New Project': 'නව ව්යාපෘතිය',
    'Convert to PDF': 'PDF වෙත පරිවර්තනය කරන්න',
    'Convert from PDF': 'PDF වෙතින් පරිවර්තනය කරන්න',
    'Organize': 'සකස් කරන්න',
    'Edit': 'සංස්කරණය කරන්න',
    'Security': 'ආරක්ෂාව',
    'AI Magic': 'AI මායාව',
    'Drag & Drop files here': 'ගොනු මෙහි ඇදගෙන එන්න',
    'or click below to browse': 'හෝ බ්රවුස් කිරීමට පහළ ක්ලික් කරන්න',
    'Select Files': 'ගොනු තෝරන්න',
    'Merge PDF': 'PDF ඒකාබද්ධ කරන්න',
    'Split PDF': 'PDF බෙදන්න',
    'Delete Pages': 'පිටු මකන්න',
    'Rotate PDF': 'PDF හරවන්න',
    'Compress PDF': 'PDF සම්පීඩනය කරන්න',
    'Repair PDF': 'PDF රිපරිනාම කරන්න',
    'Protect PDF': 'PDF ආරක්ෂා කරන්න',
    'Unlock PDF': 'PDF අගුළු ගෑලින්න',
    'Sign PDF': 'PDF අත්සන් කරන්න',
    'Redact PDF': 'PDF සංස්කරණය කරන්න',
    'Word to PDF': 'Word වෙතින් PDF',
    'Excel to PDF': 'Excel වෙතින් PDF',
    'PowerPoint to PDF': 'PowerPoint වෙතින් PDF',
    'JPG to PDF': 'JPG වෙතින් PDF',
    'PDF to Word': 'PDF වෙතින් Word',
    'PDF to Excel': 'PDF වෙතින් Excel',
    'PDF to Powerpoint': 'PDF වෙතින් Powerpoint',
    'PDF to JPG': 'PDF වෙතින් JPG',
    'PDF to PNG': 'PDF වෙතින් PNG',
    'Extract PDF Images': 'PDF පින්තූර ලබා ගන්න',
    'PDF to PDF/A': 'PDF වෙතින් PDF/A',
    'Edit PDF': 'PDF සංස්කරණය කරන්න',
    'OCR PDF': 'OCR PDF',
    'Flatten PDF': 'PDF පැතලි කරන්න',
    'AI Summary': 'AI සාරාංශය'
  }
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [activeTool, setActiveTool] = useState<PDFTool | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('en');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // State to bridge RightDock buttons with Workspace actions
  const [editAction, setEditAction] = useState<{ type: 'undo' | 'redo' | 'delete' | null, timestamp: number }>({ type: null, timestamp: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const t = useCallback((key: string) => {
    return translations[language]?.[key] || key;
  }, [language]);

  const handleTriggerEditAction = (type: 'undo' | 'redo' | 'delete') => {
    setEditAction({ type, timestamp: Date.now() });
  };

  // Centralized Tool Options
  const [toolOptions, setToolOptions] = useState({
    jpgDpi: 150,
    compressionLevel: 'recommended',
    pagesToDelete: '',
    password: '',
    splitRange: '',
    splitMethod: 'range',
    extractFormat: 'jpg',
    ocrLanguage: 'eng',
    signatureText: '',
    signatureColor: '#000000',
    conversionMode: 'flow',
    pptQuality: 'high',
    currentEditTool: 'move', // move, text, draw, image, whiteout, shape, highlight, stamp
    editColor: '#000000',
    editBrushSize: 3,
    editFontSize: 16,
    editFontFamily: 'Helvetica',
    editFontStyle: 'Normal',
    editShapeType: 'rectangle', // rectangle, circle, line, arrow
    editFillColor: 'transparent',
    editStrokeColor: '#000000',
    editStrokeWidth: 2,
    editOpacity: 1,
    editTextAlign: 'left', // left, center, right
    editStampText: 'APPROVED', // Default stamp
    summaryLength: 'medium',
    excelExtraction: 'tables',
    jpgOrientation: 'auto',
    jpgMargin: 'small',
    jpgSize: 'fit',
    protectEditPassword: '',
    protectAllowPrinting: true,
    protectAllowCopying: true,
    protectEncryption: '256-aes',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  const handleOptionChange = (key: string, value: any) => {
    setToolOptions(prev => ({ ...prev, [key]: value }));
  };

  // Define Tools
  const tools: PDFTool[] = useMemo(() => [
    // Organize
    { id: 'merge', name: 'Merge PDF', description: 'Combine multiple PDFs into one unified document.', icon: Files, category: ToolCategory.ORGANIZE, color: 'bg-red-500' },
    { id: 'split', name: 'Split PDF', description: 'Extract pages or split into separate files.', icon: Scissors, category: ToolCategory.ORGANIZE, color: 'bg-red-500' },
    { id: 'delete-pages', name: 'Delete Pages', description: 'Remove unwanted pages from your PDF.', icon: Eraser, category: ToolCategory.ORGANIZE, color: 'bg-red-500' },
    { id: 'rotate', name: 'Rotate PDF', description: 'Rotate your PDF pages permanently.', icon: RotateCw, category: ToolCategory.ORGANIZE, color: 'bg-red-500' },

    // Convert To PDF
    { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert DOC & DOCX to PDF.', icon: FileText, category: ToolCategory.CONVERT, color: 'bg-blue-500' },
    { id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Convert XLS & XLSX spreadsheets to PDF.', icon: FileSpreadsheet, category: ToolCategory.CONVERT, color: 'bg-green-500' },
    { id: 'ppt-to-pdf', name: 'PowerPoint to PDF', description: 'Convert PPT & PPTX slideshows to PDF.', icon: Presentation, category: ToolCategory.CONVERT, color: 'bg-orange-500' },
    { id: 'jpg-to-pdf', name: 'JPG to PDF', description: 'Convert JPG, PNG, BMP, TIFF images to PDF.', icon: Image, category: ToolCategory.CONVERT, color: 'bg-yellow-500' },
    { id: 'openoffice-to-pdf', name: 'OpenOffice to PDF', description: 'Convert ODT, ODS, ODP to PDF.', icon: Monitor, category: ToolCategory.CONVERT, color: 'bg-gray-600' },

    // Convert From PDF
    { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF to editable Word documents.', icon: FileText, category: ToolCategory.CONVERT, color: 'bg-blue-600' },
    { id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Convert PDF tables to Excel spreadsheets.', icon: FileSpreadsheet, category: ToolCategory.CONVERT, color: 'bg-green-600' },
    { id: 'pdf-to-ppt', name: 'PDF to Powerpoint', description: 'Convert PDF to PowerPoint slides.', icon: Presentation, category: ToolCategory.CONVERT, color: 'bg-orange-600' },
    { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Convert PDF pages to images.', icon: Image, category: ToolCategory.CONVERT, color: 'bg-yellow-600' },
    { id: 'extract-images', name: 'Extract PDF Images', description: 'Scrape all images from a PDF file.', icon: Image, category: ToolCategory.CONVERT, color: 'bg-purple-500' },

    // Edit
    { id: 'edit', name: 'Edit PDF', description: 'Add text, shapes, and annotations to PDF.', icon: PenTool, category: ToolCategory.EDIT, color: 'bg-indigo-500' },
    { id: 'ocr', name: 'OCR PDF', description: 'Make scanned PDFs searchable and selectable.', icon: Search, category: ToolCategory.EDIT, color: 'bg-teal-500' },
    { id: 'compress', name: 'Compress PDF', description: 'Reduce file size while maintaining quality.', icon: Grid, category: ToolCategory.EDIT, color: 'bg-pink-500' },

    // Security
    { id: 'protect', name: 'Protect PDF', description: 'Encrypt your PDF with a password.', icon: Lock, category: ToolCategory.SECURITY, color: 'bg-gray-800' },
    { id: 'unlock', name: 'Unlock PDF', description: 'Remove password security from PDF.', icon: Unlock, category: ToolCategory.SECURITY, color: 'bg-gray-500' },
    { id: 'sign', name: 'Sign PDF', description: 'Add your signature to documents.', icon: PenTool, category: ToolCategory.SECURITY, color: 'bg-blue-800' },

    // AI
    { id: 'ai-summary', name: 'AI Summary', description: 'Get concise summaries using Gemini AI.', icon: Wand2, category: ToolCategory.AI, color: 'bg-fuchsia-600' },
  ], []);

  const handleToolSelect = (tool: PDFTool | null) => {
    setActiveTool(tool);
    if (tool) {
      setCurrentView(AppView.WORKSPACE);
    }
  };

  const handleUpload = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      size: f.size,
      type: f.type,
      uploadDate: Date.now(),
      status: 'ready',
      progress: 100,
      originalFile: f
    }));
    setFiles(prev => [...prev, ...uploadedFiles]);
  };

  const handleDelete = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateFile = (id: string, updates: Partial<UploadedFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleClear = () => setFiles([]);

  const handleReorder = (reorderedFiles: UploadedFile[]) => setFiles(reorderedFiles);

  const handleExport = async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      await processFiles({
        toolId: activeTool?.id || 'merge',
        files,
        toolOptions,
        onProgress: (p) => setProcessingProgress(p),
      });
    } catch (err: any) {
      console.error('Processing error:', err);
      alert(`Error: ${err?.message || 'Processing failed. Please try again.'}`);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingProgress(0);
      }, 600);
    }
  };

  if (isAuthenticated === null) {
    return null;
  }

  const protectedViews = [
    AppView.AI_LAB,
    AppView.HISTORY,
    AppView.SETTINGS_ACCOUNT,
    AppView.SETTINGS_WORKSPACE,
    AppView.SETTINGS_BILLING
  ];

  if (!isAuthenticated && protectedViews.includes(currentView as AppView)) {
    return <Login onBack={() => setCurrentView(AppView.DASHBOARD)} />;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentView(AppView.DASHBOARD);
  };

  return (
    <AppContext.Provider value={{ theme, setTheme, language, setLanguage, t }}>
      <div className="flex h-screen w-screen bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-300">
        <Sidebar
          currentView={currentView}
          setView={setCurrentView}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Mobile Header */}
          <header className="lg:hidden h-16 glass-morphism dark:bg-slate-900/60 flex items-center justify-between px-6 z-40 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-black text-xs">OP</div>
              <span className="font-black tracking-tighter text-lg">{t('OmniPDF AI Suite')}</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
          </header>

          <main className="flex-1 overflow-hidden relative flex flex-col">
            {currentView === AppView.DASHBOARD && (
              <Dashboard tools={tools} onSelectTool={handleToolSelect} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'merge' && (
              <MergePDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'split' && (
              <SplitPDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'delete' && (
              <DeletePages onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'rotate' && (
              <RotatePDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'word-to-pdf' && (
              <WordToPDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'excel-to-pdf' && (
              <ExcelToPDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'ppt-to-pdf' && (
              <PowerPointToPDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'pdf-to-jpg' && (
              <PDFToJPG onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'jpg-to-pdf' && (
              <JPGToPDF onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id === 'pdf-to-word' && (
              <PDFToWord onBack={() => handleToolSelect(null)} />
            )}

            {currentView === AppView.WORKSPACE && activeTool?.id !== 'merge' && activeTool?.id !== 'split' && activeTool?.id !== 'delete' && activeTool?.id !== 'rotate' && activeTool?.id !== 'word-to-pdf' && activeTool?.id !== 'excel-to-pdf' && activeTool?.id !== 'ppt-to-pdf' && activeTool?.id !== 'pdf-to-jpg' && activeTool?.id !== 'jpg-to-pdf' && activeTool?.id !== 'pdf-to-word' && (
              <div className="flex flex-1 overflow-hidden">
                <Workspace
                  activeTool={activeTool}
                  files={files}
                  onUpload={handleUpload}
                  onDelete={handleDelete}
                  onUpdateFile={handleUpdateFile}
                  onClear={handleClear}
                  onReorder={handleReorder}
                  onExport={handleExport}
                  toolOptions={toolOptions}
                  onOptionChange={handleOptionChange}
                  editAction={editAction}
                />
                <RightDock
                  activeTool={activeTool}
                  onToolSelect={handleToolSelect}
                  tools={tools}
                  onExport={handleExport}
                  toolOptions={toolOptions}
                  onOptionChange={handleOptionChange}
                  onBatchRotate={(angle) => {
                    setFiles(prev => prev.map(f => {
                      // Update global rotation for file
                      return { ...f, rotation: (f.rotation || 0) + angle };
                    }));
                  }}
                  onTriggerEditAction={handleTriggerEditAction}
                />

                {/* Overlay for processing */}
                <AnimatePresence>
                  {isProcessing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
                    >
                      <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="bg-white dark:bg-[#1e1e2e] p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/10"
                      >
                        <div className="relative w-24 h-24 mx-auto mb-8">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-white/5" />
                            <motion.circle
                              cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
                              strokeLinecap="round" strokeDasharray="283"
                              animate={{ strokeDashoffset: 283 - (283 * processingProgress) / 100 }}
                              className="text-brand-500"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold dark:text-white">{processingProgress}%</span>
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold mb-2 dark:text-white">
                          {processingProgress < 100 ? 'Processing...' : 'Almost Done!'}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">
                          {activeTool ? `Applying ${activeTool.name} to your documents.` : 'Preparing your files for download.'}
                        </p>
                        <div className="flex items-center gap-3 justify-center text-xs font-bold text-brand-500 uppercase tracking-widest">
                          <Loader2 className="w-4 h-4 animate-spin" /> Deep AI Analysis
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {currentView === AppView.AI_LAB && (
              <AILab />
            )}

            {currentView === AppView.ANALYTICS && (
              <Analytics />
            )}

            {currentView === AppView.E_SIGN && (
              <ESign />
            )}

            {currentView === AppView.HISTORY && (
              <History />
            )}

            {(currentView === AppView.SETTINGS || currentView.startsWith('SETTINGS_')) && (
              <Settings currentView={currentView} />
            )}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
};

export default App;