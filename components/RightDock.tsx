import React, { useContext } from 'react';
import {
    FileText, Scissors, Minimize2, Shield,
    Wand2, Type, Languages, Printer,
    MousePointer2, Download, Settings2, Gauge,
    Image as ImageIcon, Lock, Trash2, AlertCircle,
    RotateCcw, RotateCw, RefreshCcw, Check, Palette,
    FileJson, Search, PenTool, Unlock, Layers, FileSpreadsheet, X, Presentation, Pen, Eraser, Bold, Italic, Move, Undo, Redo,
    Square, Circle, Minus, Highlighter, MoveRight, AlignLeft, AlignCenter, AlignRight, Stamp
} from 'lucide-react';
import { PDFTool } from '../types';
import { AppContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

interface RightDockProps {
    activeTool: PDFTool | null;
    onToolSelect: (tool: PDFTool | null) => void;
    tools: PDFTool[];
    onExport?: () => void;
    toolOptions: any;
    onOptionChange: (key: string, value: any) => void;
    onBatchRotate?: (angle: number) => void;
    onTriggerEditAction?: (action: 'undo' | 'redo' | 'delete') => void;
}

// Prevent buttons from stealing focus from the text input/textarea
const preventFocusSteal = (e: React.MouseEvent) => {
    e.preventDefault();
};

const InputLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{children}</label>
);

const StyledSelect = ({ value, onChange, options }: { value: any, onChange: (e: any) => void, options: { val: string | number, label: string }[] }) => (
    <div className="relative">
        <select
            value={value}
            onChange={onChange}
            className="w-full appearance-none bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
        >
            {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
    </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        {...props}
        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
    />
);

const ToolButton = ({ icon: Icon, active, onClick, label }: { icon: any, active: boolean, onClick: () => void, label: string }) => (
    <button
        onClick={onClick}
        onMouseDown={preventFocusSteal}
        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200
          ${active
                ? 'bg-brand-600 border-brand-600 text-white shadow-md scale-105'
                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-500/50 hover:bg-brand-50 dark:hover:bg-brand-900/20'}`}
        title={label}
    >
        <Icon className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
    </button>
);

export const RightDock: React.FC<RightDockProps> = ({
    activeTool,
    onToolSelect,
    tools,
    onExport,
    toolOptions,
    onOptionChange,
    onBatchRotate,
    onTriggerEditAction
}) => {
    const { t } = useContext(AppContext);

    const quickTools = tools.filter(t =>
        ['Merge', 'Split', 'Compress', 'AI Summary', 'Sign', 'PDF to JPG'].includes(t.name)
    );

    const STAMPS = [
        { id: 'APPROVED', color: '#22c55e', label: 'Approved' },
        { id: 'REJECTED', color: '#ef4444', label: 'Rejected' },
        { id: 'CONFIDENTIAL', color: '#ef4444', label: 'Confidential' },
        { id: 'DRAFT', color: '#9ca3af', label: 'Draft' },
        { id: 'URGENT', color: '#ef4444', label: 'Urgent' },
        { id: 'PAID', color: '#22c55e', label: 'Paid' },
    ];

    const getActionLabel = () => {
        if (!activeTool) return t('Export PDF');
        if (activeTool.id === 'pdf-to-jpg') return 'Convert to JPG';
        if (activeTool.id === 'pdf-to-word') return 'Convert to Word';
        if (activeTool.id === 'pdf-to-ppt') return 'Convert to PowerPoint';
        if (activeTool.id === 'word-to-pdf') return 'Convert to PDF';
        if (activeTool.id === 'compress') return 'Compress PDF';
        if (activeTool.id === 'merge') return 'Merge PDFs';
        if (activeTool.id === 'split') return 'Split PDF';
        if (activeTool.id === 'rotate') return 'Save Rotated PDFs';
        if (activeTool.id === 'ocr') return 'Start OCR';
        if (activeTool.id === 'unlock') return 'Unlock PDF';
        if (activeTool.id === 'sign') return 'Sign PDF';
        if (activeTool.id === 'edit') return 'Download Edited PDF';
        return `Run ${activeTool.name}`;
    };

    const renderToolSettings = () => {
        if (!activeTool) return null;

        switch (activeTool.id) {
            case 'edit':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-500/20 rounded-xl flex gap-3">
                            <Wand2 className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
                            <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                                <b>Edit Mode:</b> Add text, images, shapes, stamps or highlights. Click existing text to magic edit it. Use the <b>Zoom</b> controls on canvas for precision.
                            </p>
                        </div>

                        <div className="flex gap-2 mb-2">
                            <button
                                onClick={() => onTriggerEditAction?.('undo')}
                                onMouseDown={preventFocusSteal}
                                className="flex-1 flex items-center justify-center gap-2 p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 hover:border-brand-300 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo className="w-4 h-4" /> Undo
                            </button>
                            <button
                                onClick={() => onTriggerEditAction?.('redo')}
                                onMouseDown={preventFocusSteal}
                                className="flex-1 flex items-center justify-center gap-2 p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 hover:border-brand-300 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm"
                                title="Redo (Ctrl+Shift+Z)"
                            >
                                <Redo className="w-4 h-4" /> Redo
                            </button>
                        </div>

                        <div>
                            <InputLabel>Insert Tools</InputLabel>
                            <div className="grid grid-cols-4 gap-2">
                                <ToolButton
                                    icon={Move}
                                    label="Select"
                                    active={toolOptions.currentEditTool === 'move'}
                                    onClick={() => onOptionChange('currentEditTool', 'move')}
                                />
                                <ToolButton
                                    icon={Type}
                                    label="Text"
                                    active={toolOptions.currentEditTool === 'text'}
                                    onClick={() => onOptionChange('currentEditTool', 'text')}
                                />
                                <ToolButton
                                    icon={ImageIcon}
                                    label="Image"
                                    active={toolOptions.currentEditTool === 'image'}
                                    onClick={() => onOptionChange('currentEditTool', 'image')}
                                />
                                <ToolButton
                                    icon={Pen}
                                    label="Draw"
                                    active={toolOptions.currentEditTool === 'draw'}
                                    onClick={() => onOptionChange('currentEditTool', 'draw')}
                                />
                                <ToolButton
                                    icon={Eraser}
                                    label="Erase"
                                    active={toolOptions.currentEditTool === 'whiteout'}
                                    onClick={() => onOptionChange('currentEditTool', 'whiteout')}
                                />
                                <ToolButton
                                    icon={Highlighter}
                                    label="Marker"
                                    active={toolOptions.currentEditTool === 'highlight'}
                                    onClick={() => onOptionChange('currentEditTool', 'highlight')}
                                />
                                <ToolButton
                                    icon={Square}
                                    label="Shape"
                                    active={toolOptions.currentEditTool === 'shape'}
                                    onClick={() => onOptionChange('currentEditTool', 'shape')}
                                />
                                <ToolButton
                                    icon={Stamp}
                                    label="Stamp"
                                    active={toolOptions.currentEditTool === 'stamp'}
                                    onClick={() => onOptionChange('currentEditTool', 'stamp')}
                                />
                            </div>
                        </div>

                        {/* SHAPE SUB-TOOLS */}
                        {toolOptions.currentEditTool === 'shape' && (
                            <div className="animate-in fade-in slide-in-from-top-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                                <InputLabel>Shape Type</InputLabel>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onOptionChange('editShapeType', 'rectangle')}
                                        onMouseDown={preventFocusSteal}
                                        className={`flex-1 p-2 rounded-lg flex items-center justify-center transition-all ${toolOptions.editShapeType === 'rectangle' ? 'bg-brand-200 dark:bg-brand-600 text-brand-900 dark:text-white' : 'hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                        title="Rectangle"
                                    >
                                        <Square className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onOptionChange('editShapeType', 'circle')}
                                        onMouseDown={preventFocusSteal}
                                        className={`flex-1 p-2 rounded-lg flex items-center justify-center transition-all ${toolOptions.editShapeType === 'circle' ? 'bg-brand-200 dark:bg-brand-600 text-brand-900 dark:text-white' : 'hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                        title="Circle"
                                    >
                                        <Circle className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onOptionChange('editShapeType', 'line')}
                                        onMouseDown={preventFocusSteal}
                                        className={`flex-1 p-2 rounded-lg flex items-center justify-center transition-all ${toolOptions.editShapeType === 'line' ? 'bg-brand-200 dark:bg-brand-600 text-brand-900 dark:text-white' : 'hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                        title="Line"
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onOptionChange('editShapeType', 'arrow')}
                                        onMouseDown={preventFocusSteal}
                                        className={`flex-1 p-2 rounded-lg flex items-center justify-center transition-all ${toolOptions.editShapeType === 'arrow' ? 'bg-brand-200 dark:bg-brand-600 text-brand-900 dark:text-white' : 'hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                        title="Arrow"
                                    >
                                        <MoveRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STAMP SUB-TOOLS */}
                        {toolOptions.currentEditTool === 'stamp' && (
                            <div className="animate-in fade-in slide-in-from-top-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                                <InputLabel>Select Stamp</InputLabel>
                                <div className="grid grid-cols-2 gap-2">
                                    {STAMPS.map(stamp => (
                                        <button
                                            key={stamp.id}
                                            onClick={() => onOptionChange('editStampText', stamp.id)}
                                            onMouseDown={preventFocusSteal}
                                            className={`px-2 py-1.5 rounded-lg border text-xs font-bold transition-all text-center uppercase tracking-wide
                                            ${toolOptions.editStampText === stamp.id
                                                    ? 'bg-white dark:bg-white/10 border-brand-500 ring-1 ring-brand-500 shadow-sm'
                                                    : 'border-transparent hover:bg-gray-200 dark:hover:bg-white/5 opacity-70 hover:opacity-100'}
                                        `}
                                            style={{ color: stamp.color }}
                                        >
                                            {stamp.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* PROPERTIES PANEL */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-4">

                            {/* Typography Settings for Text Tool & Move Tool */}
                            {(toolOptions.currentEditTool === 'text' || toolOptions.currentEditTool === 'move') && (
                                <div className="animate-in fade-in slide-in-from-right-2 space-y-4">
                                    <InputLabel>Typography</InputLabel>

                                    {/* Font Family */}
                                    <StyledSelect
                                        value={toolOptions.editFontFamily}
                                        onChange={(e) => onOptionChange('editFontFamily', e.target.value)}
                                        options={[
                                            { val: 'Helvetica', label: 'Helvetica (Sans)' },
                                            { val: 'Times', label: 'Times Roman (Serif)' },
                                            { val: 'Courier', label: 'Courier (Mono)' },
                                        ]}
                                    />

                                    {/* Styles Row */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onOptionChange('editFontStyle', toolOptions.editFontStyle.includes('Bold') ? toolOptions.editFontStyle.replace('Bold', '').trim() || 'Normal' : (toolOptions.editFontStyle === 'Normal' ? 'Bold' : `Bold ${toolOptions.editFontStyle}`))}
                                            onMouseDown={preventFocusSteal}
                                            className={`flex-1 p-2.5 rounded-lg border flex items-center justify-center transition-all ${toolOptions.editFontStyle.includes('Bold') ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-500 text-brand-700 dark:text-brand-300 shadow-inner' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400'}`}
                                            title="Bold"
                                        >
                                            <Bold className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => onOptionChange('editFontStyle', toolOptions.editFontStyle.includes('Italic') ? toolOptions.editFontStyle.replace('Italic', '').trim() || 'Normal' : (toolOptions.editFontStyle === 'Normal' ? 'Italic' : `${toolOptions.editFontStyle} Italic`))}
                                            onMouseDown={preventFocusSteal}
                                            className={`flex-1 p-2.5 rounded-lg border flex items-center justify-center transition-all ${toolOptions.editFontStyle.includes('Italic') ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-500 text-brand-700 dark:text-brand-300 shadow-inner' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400'}`}
                                            title="Italic"
                                        >
                                            <Italic className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Alignment Row */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onOptionChange('editTextAlign', 'left')}
                                            onMouseDown={preventFocusSteal}
                                            className={`flex-1 p-2 rounded-lg border flex items-center justify-center transition-all ${toolOptions.editTextAlign === 'left' ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-500 text-brand-600 dark:text-brand-400' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500'}`}
                                            title="Align Left"
                                        >
                                            <AlignLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => onOptionChange('editTextAlign', 'center')}
                                            onMouseDown={preventFocusSteal}
                                            className={`flex-1 p-2 rounded-lg border flex items-center justify-center transition-all ${toolOptions.editTextAlign === 'center' ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-500 text-brand-600 dark:text-brand-400' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500'}`}
                                            title="Align Center"
                                        >
                                            <AlignCenter className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => onOptionChange('editTextAlign', 'right')}
                                            onMouseDown={preventFocusSteal}
                                            className={`flex-1 p-2 rounded-lg border flex items-center justify-center transition-all ${toolOptions.editTextAlign === 'right' ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-500 text-brand-600 dark:text-brand-400' : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500'}`}
                                            title="Align Right"
                                        >
                                            <AlignRight className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Size & Color */}
                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <InputLabel>Font Size (px)</InputLabel>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min="8"
                                                max="120"
                                                value={toolOptions.editFontSize}
                                                onChange={(e) => onOptionChange('editFontSize', Number(e.target.value))}
                                                className="w-16 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1 text-sm text-center font-mono"
                                            />
                                            <input
                                                type="range"
                                                min="8"
                                                max="72"
                                                value={toolOptions.editFontSize}
                                                onChange={(e) => onOptionChange('editFontSize', Number(e.target.value))}
                                                className="flex-1 accent-brand-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <InputLabel>Text Color</InputLabel>
                                        <div className="flex gap-2 flex-wrap">
                                            {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff', '#7c3aed', '#db2777'].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => onOptionChange('editColor', c)}
                                                    onMouseDown={preventFocusSteal}
                                                    className={`w-8 h-8 rounded-full border-2 transition-all shadow-sm ${toolOptions.editColor === c ? 'border-gray-600 dark:border-white scale-110 ring-2 ring-offset-1 ring-brand-500' : 'border-gray-200 dark:border-gray-600'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Shape & Draw Properties */}
                            {(toolOptions.currentEditTool === 'draw' || toolOptions.currentEditTool === 'shape' || toolOptions.currentEditTool === 'highlight' || toolOptions.currentEditTool === 'stamp') && (
                                <div className="animate-in fade-in slide-in-from-right-2 space-y-4">
                                    <InputLabel>Appearance</InputLabel>

                                    {toolOptions.currentEditTool !== 'stamp' && (
                                        <>
                                            {/* Stroke Color */}
                                            <div>
                                                <InputLabel>{toolOptions.currentEditTool === 'highlight' ? 'Highlight Color' : 'Stroke Color'}</InputLabel>
                                                <div className="flex gap-2 flex-wrap mb-4">
                                                    {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff', '#9ca3af'].map(c => (
                                                        <button
                                                            key={c}
                                                            onClick={() => onOptionChange(toolOptions.currentEditTool === 'shape' ? 'editStrokeColor' : 'editColor', c)}
                                                            onMouseDown={preventFocusSteal}
                                                            className={`w-8 h-8 rounded-full border-2 transition-all shadow-sm 
                                                            ${(toolOptions.currentEditTool === 'shape' ? toolOptions.editStrokeColor : toolOptions.editColor) === c
                                                                    ? 'border-gray-600 dark:border-white scale-110 ring-2 ring-offset-1 ring-brand-500'
                                                                    : 'border-gray-200 dark:border-gray-600'}`}
                                                            style={{ backgroundColor: c }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Fill Color (Shapes Only) */}
                                            {toolOptions.currentEditTool === 'shape' && toolOptions.editShapeType !== 'line' && toolOptions.editShapeType !== 'arrow' && (
                                                <div>
                                                    <InputLabel>Fill Color</InputLabel>
                                                    <div className="flex gap-2 flex-wrap mb-4">
                                                        <button
                                                            onClick={() => onOptionChange('editFillColor', 'transparent')}
                                                            onMouseDown={preventFocusSteal}
                                                            className={`w-8 h-8 rounded-full border-2 transition-all shadow-sm flex items-center justify-center
                                                            ${toolOptions.editFillColor === 'transparent'
                                                                    ? 'border-gray-600 dark:border-white scale-110 ring-2 ring-offset-1 ring-brand-500'
                                                                    : 'border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-white/5'}`}
                                                            title="Transparent"
                                                        >
                                                            <div className="w-full h-0.5 bg-red-500 rotate-45"></div>
                                                        </button>
                                                        {['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#ffffff'].map(c => (
                                                            <button
                                                                key={c}
                                                                onClick={() => onOptionChange('editFillColor', c)}
                                                                onMouseDown={preventFocusSteal}
                                                                className={`w-8 h-8 rounded-full border-2 transition-all shadow-sm 
                                                                ${toolOptions.editFillColor === c
                                                                        ? 'border-gray-600 dark:border-white scale-110 ring-2 ring-offset-1 ring-brand-500'
                                                                        : 'border-gray-200 dark:border-gray-600'}`}
                                                                style={{ backgroundColor: c }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Opacity Slider */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <InputLabel>Opacity</InputLabel>
                                            <span className="text-xs text-gray-500 font-mono bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                {Math.round(toolOptions.editOpacity * 100)}%
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="1"
                                            step="0.1"
                                            value={toolOptions.editOpacity}
                                            onChange={(e) => onOptionChange('editOpacity', Number(e.target.value))}
                                            className="w-full accent-brand-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                        />
                                    </div>

                                    {/* Thickness */}
                                    {toolOptions.currentEditTool !== 'stamp' && (
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <InputLabel>{toolOptions.currentEditTool === 'shape' ? 'Stroke Width' : 'Brush Size'}</InputLabel>
                                                <span className="text-xs text-gray-500 font-mono bg-gray-200 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                    {toolOptions.currentEditTool === 'shape' ? toolOptions.editStrokeWidth : toolOptions.editBrushSize}px
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="20"
                                                value={toolOptions.currentEditTool === 'shape' ? toolOptions.editStrokeWidth : toolOptions.editBrushSize}
                                                onChange={(e) => onOptionChange(toolOptions.currentEditTool === 'shape' ? 'editStrokeWidth' : 'editBrushSize', Number(e.target.value))}
                                                className="w-full accent-brand-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Selection Actions */}
                            {(toolOptions.currentEditTool === 'move') && (
                                <div className="animate-in fade-in slide-in-from-right-2 space-y-4">
                                    <InputLabel>Object Actions</InputLabel>
                                    <button
                                        onClick={() => onTriggerEditAction?.('delete')}
                                        onMouseDown={preventFocusSteal}
                                        className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors shadow-sm"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete Selected
                                    </button>
                                    <p className="mt-2 text-[10px] text-gray-500">Select an item on the page to delete it. You can also use the Delete key on your keyboard.</p>
                                </div>
                            )}
                        </div>
                    </div>
                );

            // ... rest of the cases remain unchanged
            case 'rotate':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Rotation Controls</InputLabel>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={() => onBatchRotate && onBatchRotate(-90)}
                                    className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all group shadow-sm hover:shadow-md"
                                >
                                    <RotateCcw className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-brand-500 mb-2 transition-colors" />
                                    <span className="text-[10px] font-semibold text-gray-500 group-hover:text-brand-600 uppercase">Left</span>
                                </button>
                                <button
                                    onClick={() => onBatchRotate && onBatchRotate(90)}
                                    className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all group shadow-sm hover:shadow-md"
                                >
                                    <RotateCw className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-brand-500 mb-2 transition-colors" />
                                    <span className="text-[10px] font-semibold text-gray-500 group-hover:text-brand-600 uppercase">Right</span>
                                </button>
                                <button
                                    onClick={() => onBatchRotate && onBatchRotate(180)}
                                    className="flex flex-col items-center justify-center p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all group shadow-sm hover:shadow-md"
                                >
                                    <RefreshCcw className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-brand-500 mb-2 transition-colors" />
                                    <span className="text-[10px] font-semibold text-gray-500 group-hover:text-brand-600 uppercase">180°</span>
                                </button>
                            </div>
                        </div>

                        <div className="p-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-500/20 rounded-xl">
                            <div className="flex gap-3">
                                <MousePointer2 className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                                <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">
                                    Tip: You can hover over individual files in the workspace to rotate specific pages using the visual overlay.
                                </p>
                            </div>
                        </div>
                    </div>
                );

            case 'compress':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <InputLabel>Compression Strength</InputLabel>
                        <div className="space-y-3">
                            {[
                                { id: 'extreme', label: 'Extreme', desc: 'Max reduction, lower quality' },
                                { id: 'recommended', label: 'Recommended', desc: 'Balanced quality & size' },
                                { id: 'less', label: 'Low', desc: 'High quality, less reduction' }
                            ].map((level) => (
                                <button
                                    key={level.id}
                                    onClick={() => onOptionChange('compressionLevel', level.id)}
                                    className={`w-full flex items-center p-4 rounded-xl border transition-all relative overflow-hidden group
                                    ${toolOptions.compressionLevel === level.id
                                            ? 'bg-brand-50 dark:bg-brand-500/20 border-brand-500 shadow-md ring-1 ring-brand-500'
                                            : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-brand-300'}
                                `}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 shrink-0 transition-colors ${toolOptions.compressionLevel === level.id ? 'border-brand-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                        {toolOptions.compressionLevel === level.id && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-sm font-semibold transition-colors ${toolOptions.compressionLevel === level.id ? 'text-brand-900 dark:text-white' : 'text-gray-900 dark:text-gray-200'}`}>{level.label}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{level.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                );

            case 'split':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Split Strategy</InputLabel>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5">
                                <button
                                    onClick={() => onOptionChange('splitMethod', 'range')}
                                    className={`py-2 text-sm font-medium rounded-lg transition-all shadow-sm
                                    ${toolOptions.splitMethod === 'range'
                                            ? 'bg-white dark:bg-brand-600 text-brand-600 dark:text-white shadow-md'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50'}
                                `}
                                >
                                    Custom Ranges
                                </button>
                                <button
                                    onClick={() => onOptionChange('splitMethod', 'extract')}
                                    className={`py-2 text-sm font-medium rounded-lg transition-all shadow-sm
                                    ${toolOptions.splitMethod === 'extract'
                                            ? 'bg-white dark:bg-brand-600 text-brand-600 dark:text-white shadow-md'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50'}
                                `}
                                >
                                    Extract All
                                </button>
                            </div>
                        </div>

                        {toolOptions.splitMethod === 'range' && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                                <InputLabel>Page Ranges</InputLabel>
                                <StyledInput
                                    type="text"
                                    value={toolOptions.splitRange}
                                    onChange={(e) => onOptionChange('splitRange', e.target.value)}
                                    placeholder="e.g. 1-5, 8, 11-15"
                                />
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Comma separated. Each range creates a file.</p>
                            </div>
                        )}

                        {toolOptions.splitMethod === 'extract' && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
                                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                    Every single page will be saved as a separate PDF file. Useful for unstacking bulk scans.
                                </p>
                            </div>
                        )}
                    </div>
                );

            case 'extract-images':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <InputLabel>Output Format</InputLabel>
                        <div className="grid grid-cols-3 gap-3">
                            {['JPG', 'PNG', 'TIFF'].map(fmt => (
                                <button
                                    key={fmt}
                                    onClick={() => onOptionChange('extractFormat', fmt.toLowerCase())}
                                    className={`py-3 text-sm font-semibold rounded-xl border transition-all
                                    ${toolOptions.extractFormat === fmt.toLowerCase()
                                            ? 'bg-brand-600 text-white border-brand-600 shadow-md'
                                            : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-brand-400'}
                                `}
                                >
                                    {fmt}
                                </button>
                            ))}
                        </div>
                    </div>
                );

            case 'ocr':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Document Language</InputLabel>
                            <StyledSelect
                                value={toolOptions.ocrLanguage}
                                onChange={(e) => onOptionChange('ocrLanguage', e.target.value)}
                                options={[
                                    { val: 'eng', label: 'English' },
                                    { val: 'spa', label: 'Spanish' },
                                    { val: 'fra', label: 'French' },
                                    { val: 'deu', label: 'German' },
                                    { val: 'ita', label: 'Italian' }
                                ]}
                            />
                        </div>
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-500/20 rounded-xl flex items-start gap-3">
                            <Search className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                Optical Character Recognition (OCR) converts scanned images into selectable, searchable text.
                            </p>
                        </div>
                    </div>
                );

            case 'sign':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="flex p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5">
                            <button
                                onClick={() => onOptionChange('signType', 'text')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${toolOptions.signType !== 'draw' ? 'bg-white dark:bg-brand-600 shadow-md text-brand-600 dark:text-white' : 'text-gray-500'}`}
                            >
                                Type
                            </button>
                            <button
                                onClick={() => onOptionChange('signType', 'draw')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${toolOptions.signType === 'draw' ? 'bg-white dark:bg-brand-600 shadow-md text-brand-600 dark:text-white' : 'text-gray-500'}`}
                            >
                                Draw
                            </button>
                        </div>

                        {toolOptions.signType !== 'draw' ? (
                            <div>
                                <InputLabel>Signature Text</InputLabel>
                                <StyledInput
                                    type="text"
                                    value={toolOptions.signatureText}
                                    onChange={(e) => onOptionChange('signatureText', e.target.value)}
                                    placeholder="Type your name..."
                                />
                                <p className="mt-2 text-xs text-gray-400 italic" style={{ fontFamily: "'Dancing Script', cursive" }}>
                                    Live Preview: {toolOptions.signatureText || 'Your Name'}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <InputLabel>Draw Signature</InputLabel>
                                <div className="aspect-video bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl relative flex items-center justify-center overflow-hidden group">
                                    <PenTool className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                                    <div className="absolute inset-0 bg-brand-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="bg-brand-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Click to Draw</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <InputLabel>Ink Color</InputLabel>
                            <div className="flex gap-3">
                                {['#000000', '#1d4ed8', '#dc2626', '#15803d'].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => onOptionChange('signatureColor', color)}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-sm
                                            ${toolOptions.signatureColor === color ? 'ring-2 ring-offset-2 ring-brand-500 scale-110' : 'opacity-60'}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {toolOptions.signatureColor === color && <Check className="w-4 h-4 text-white" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-500/10 rounded-xl">
                            <div className="flex gap-3">
                                <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-blue-700 dark:text-blue-300">Digital signatures created here are cryptographically bound to the document to ensure integrity and authenticity.</p>
                            </div>
                        </div>
                    </div>
                );

            case 'pdf-to-jpg':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Image Quality (DPI)</InputLabel>
                            <StyledSelect
                                value={toolOptions.jpgDpi}
                                onChange={(e) => onOptionChange('jpgDpi', Number(e.target.value))}
                                options={[
                                    { val: 72, label: '72 DPI (Web/Screen)' },
                                    { val: 150, label: '150 DPI (Standard)' },
                                    { val: 300, label: '300 DPI (High Quality)' },
                                    { val: 600, label: '600 DPI (Print)' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'pdf-to-ppt':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-500/20 rounded-xl flex gap-3">
                            <Presentation className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                            <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                                Your PDF pages will be converted into high-quality slides. Layouts and fonts are perfectly preserved as images.
                            </p>
                        </div>
                        <div>
                            <InputLabel>Slide Quality</InputLabel>
                            <StyledSelect
                                value={toolOptions.pptQuality || 'high'}
                                onChange={(e) => onOptionChange('pptQuality', e.target.value)}
                                options={[
                                    { val: 'medium', label: 'Standard (Faster)' },
                                    { val: 'high', label: 'High Definition' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'pdf-to-word':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Conversion Mode</InputLabel>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => onOptionChange('conversionMode', 'flow')}
                                    className={`p-4 rounded-xl border text-left transition-all
                                    ${toolOptions.conversionMode !== 'ocr'
                                            ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500 shadow-sm ring-1 ring-brand-500'
                                            : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-brand-300'}
                                `}
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <FileText className={`w-5 h-5 ${toolOptions.conversionMode !== 'ocr' ? 'text-brand-600' : 'text-gray-400'}`} />
                                        <span className={`font-bold text-sm ${toolOptions.conversionMode !== 'ocr' ? 'text-brand-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>Standard Text</span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 pl-8">Best for digital documents with selectable text. Fast and preserves layout.</p>
                                </button>

                                <button
                                    disabled // Placeholder for future OCR expansion
                                    className="p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 opacity-60 cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <Search className="w-5 h-5 text-gray-400" />
                                        <span className="font-bold text-sm text-gray-500 dark:text-gray-400">OCR Scanned PDF</span>
                                    </div>
                                    <p className="text-xs text-gray-500 pl-8">For scanned images/photos. (Coming Soon)</p>
                                </button>
                            </div>
                        </div>
                    </div>
                );

            case 'delete-pages':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Pages to Delete</InputLabel>
                            <div className="flex items-center gap-2">
                                <StyledInput
                                    type="text"
                                    value={toolOptions.pagesToDelete}
                                    onChange={(e) => onOptionChange('pagesToDelete', e.target.value)}
                                    placeholder="e.g. 1, 3-5, 8"
                                />
                                <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-xl text-red-500 border border-red-200 dark:border-red-500/20">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500 flex items-start gap-1">
                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                Tip: Use the visual selector on file cards for easier selection.
                            </p>
                        </div>
                    </div>
                );

            case 'protect':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="space-y-4">
                            <div>
                                <InputLabel>User Password (to Open)</InputLabel>
                                <div className="relative">
                                    <StyledInput
                                        type="password"
                                        value={toolOptions.password}
                                        onChange={(e) => onOptionChange('password', e.target.value)}
                                        placeholder="Require password to view"
                                    />
                                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>

                            <div>
                                <InputLabel>Owner Password (to Edit)</InputLabel>
                                <div className="relative">
                                    <StyledInput
                                        type="password"
                                        value={toolOptions.protectEditPassword}
                                        onChange={(e) => onOptionChange('protectEditPassword', e.target.value)}
                                        placeholder="Restrict permissions"
                                    />
                                    <Shield className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-white/5 pt-4 space-y-4">
                            <InputLabel>Permissions</InputLabel>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Allow Printing</span>
                                    <button
                                        onClick={() => onOptionChange('protectAllowPrinting', !toolOptions.protectAllowPrinting)}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${toolOptions.protectAllowPrinting ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${toolOptions.protectAllowPrinting ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Allow Copying</span>
                                    <button
                                        onClick={() => onOptionChange('protectAllowCopying', !toolOptions.protectAllowCopying)}
                                        className={`w-10 h-5 rounded-full transition-colors relative ${toolOptions.protectAllowCopying ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${toolOptions.protectAllowCopying ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <InputLabel>Encryption Strength</InputLabel>
                            <StyledSelect
                                value={toolOptions.protectEncryption}
                                onChange={(e) => onOptionChange('protectEncryption', e.target.value)}
                                options={[
                                    { val: '128-aes', label: '128-bit AES' },
                                    { val: '256-aes', label: '256-bit AES (Secure)' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'unlock':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Decryption Password</InputLabel>
                            <div className="relative">
                                <StyledInput
                                    type="password"
                                    placeholder="Enter original password"
                                />
                                <Unlock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            </div>
                        </div>
                    </div>
                );

            case 'ai-summary':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-4 bg-fuchsia-50 dark:bg-fuchsia-900/20 border border-fuchsia-100 dark:border-fuchsia-500/20 rounded-xl flex gap-3">
                            <Wand2 className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400 shrink-0" />
                            <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300 leading-relaxed">
                                Gemini AI will analyze your document to generate a high-quality summary.
                            </p>
                        </div>
                        <div>
                            <InputLabel>Summary Length</InputLabel>
                            <StyledSelect
                                value={toolOptions.summaryLength}
                                onChange={(e) => onOptionChange('summaryLength', e.target.value)}
                                options={[
                                    { val: 'short', label: 'Concise (Bullet Points)' },
                                    { val: 'medium', label: 'Balanced' },
                                    { val: 'long', label: 'Detailed Analysis' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'pdf-to-excel':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-500/20 rounded-xl flex gap-3">
                            <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
                                Detecting and extracting tabular data from your PDF into structured Excel sheets.
                            </p>
                        </div>
                        <div>
                            <InputLabel>Extraction Level</InputLabel>
                            <StyledSelect
                                value={toolOptions.excelExtraction}
                                onChange={(e) => onOptionChange('excelExtraction', e.target.value)}
                                options={[
                                    { val: 'tables', label: 'Extract Tables Only' },
                                    { val: 'all', label: 'Full Page Conversion' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'jpg-to-pdf':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Page Orientation</InputLabel>
                            <StyledSelect
                                value={toolOptions.jpgOrientation}
                                onChange={(e) => onOptionChange('jpgOrientation', e.target.value)}
                                options={[
                                    { val: 'auto', label: 'Auto (Match Image)' },
                                    { val: 'portrait', label: 'Portrait' },
                                    { val: 'landscape', label: 'Landscape' }
                                ]}
                            />
                        </div>
                        <div>
                            <InputLabel>Margin</InputLabel>
                            <StyledSelect
                                value={toolOptions.jpgMargin}
                                onChange={(e) => onOptionChange('jpgMargin', e.target.value)}
                                options={[
                                    { val: 'none', label: 'No Margin' },
                                    { val: 'small', label: 'Small Margin' },
                                    { val: 'large', label: 'Large Margin' }
                                ]}
                            />
                        </div>
                        <div>
                            <InputLabel>Page Size</InputLabel>
                            <StyledSelect
                                value={toolOptions.jpgSize}
                                onChange={(e) => onOptionChange('jpgSize', e.target.value)}
                                options={[
                                    { val: 'fit', label: 'Fit to Image Size' },
                                    { val: 'a4', label: 'A4 (210 x 297 mm)' },
                                    { val: 'us-letter', label: 'US Letter (8.5 x 11 in)' }
                                ]}
                            />
                        </div>
                    </div>
                );

            case 'word-to-pdf':
            case 'excel-to-pdf':
            case 'ppt-to-pdf':
            case 'openoffice-to-pdf':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center mb-4 shadow-sm">
                                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h4 className="text-sm font-bold text-blue-900 dark:text-white mb-2">High-Fidelity Conversion</h4>
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed mb-4">
                                Your document will be accurately converted to PDF while preserving all fonts, layouts, and high-resolution images.
                            </p>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                                <Check className="w-3.5 h-3.5" /> Fast Cloud Processing
                            </div>
                        </div>
                    </div>
                );

            case 'watermark':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Watermark Type</InputLabel>
                            <div className="flex p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5">
                                <button
                                    onClick={() => onOptionChange('watermarkType', 'text')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${toolOptions.watermarkType !== 'image' ? 'bg-white dark:bg-brand-600 shadow-md text-brand-600 dark:text-white' : 'text-gray-500'}`}
                                >
                                    Text
                                </button>
                                <button
                                    onClick={() => onOptionChange('watermarkType', 'image')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${toolOptions.watermarkType === 'image' ? 'bg-white dark:bg-brand-600 shadow-md text-brand-600 dark:text-white' : 'text-gray-500'}`}
                                >
                                    Image
                                </button>
                            </div>
                        </div>

                        {toolOptions.watermarkType !== 'image' ? (
                            <div>
                                <InputLabel>Watermark Text</InputLabel>
                                <StyledInput
                                    type="text"
                                    value={toolOptions.watermarkText}
                                    onChange={(e) => onOptionChange('watermarkText', e.target.value)}
                                    placeholder="CONFIDENTIAL"
                                />
                            </div>
                        ) : (
                            <div>
                                <InputLabel>Watermark Image</InputLabel>
                                <div className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl p-6 text-center hover:border-brand-500 transition-colors cursor-pointer bg-white dark:bg-white/5">
                                    <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Select Logo</p>
                                </div>
                            </div>
                        )}

                        <div>
                            <div className="flex justify-between mb-1">
                                <InputLabel>Opacity</InputLabel>
                                <span className="text-[10px] font-bold text-brand-500">{Math.round(toolOptions.watermarkOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0.1" max="1" step="0.1"
                                value={toolOptions.watermarkOpacity}
                                onChange={(e) => onOptionChange('watermarkOpacity', Number(e.target.value))}
                                className="w-full accent-brand-600"
                            />
                        </div>

                        <div>
                            <InputLabel>Position</InputLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'].slice(0, 9).map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => onOptionChange('watermarkPosition', pos)}
                                        className={`p-2 rounded-lg border text-[8px] font-bold uppercase tracking-tighter ${toolOptions.watermarkPosition === pos ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 text-gray-500'}`}
                                    >
                                        {pos.replace('-', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case 'add-page-numbers':
                return (
                    <div className="space-y-6 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div>
                            <InputLabel>Position</InputLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {['top', 'bottom'].map(v => (
                                    ['left', 'center', 'right'].map(h => {
                                        const pos = `${v}-${h}`;
                                        return (
                                            <button
                                                key={pos}
                                                onClick={() => onOptionChange('pageNumberPosition', pos)}
                                                className={`p-2 rounded-lg border text-[8px] font-bold uppercase ${toolOptions.pageNumberPosition === pos ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 text-gray-500'}`}
                                            >
                                                {v} {h}
                                            </button>
                                        );
                                    })
                                ))}
                            </div>
                        </div>

                        <div>
                            <InputLabel>Starting Number</InputLabel>
                            <StyledInput
                                type="number"
                                value={toolOptions.pageNumberStart}
                                onChange={(e) => onOptionChange('pageNumberStart', Number(e.target.value))}
                                min={1}
                            />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Include Total Pages</span>
                            <button
                                onClick={() => onOptionChange('pageNumberIncludeTotal', !toolOptions.pageNumberIncludeTotal)}
                                className={`w-10 h-5 rounded-full transition-colors relative ${toolOptions.pageNumberIncludeTotal ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${toolOptions.pageNumberIncludeTotal ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>
                );

            case 'merge':
                return (
                    <div className="space-y-5 animate-in slide-in-from-right-5 fade-in duration-300">
                        <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
                            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                                <Settings2 className="w-4 h-4" /> Merge Settings
                            </h4>
                            <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
                                Drag files in the queue sidebar to reorder them. The merged PDF will follow that sequence.
                            </p>
                        </div>

                        <div>
                            <InputLabel>Output File Name</InputLabel>
                            <StyledInput
                                type="text"
                                value={toolOptions.mergeOutputName ?? 'merged'}
                                onChange={(e) => onOptionChange('mergeOutputName', e.target.value)}
                                placeholder="merged"
                            />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10">
                            <div>
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Bookmark each file</p>
                                <p className="text-[10px] text-gray-400">Adds a named outline entry per source PDF</p>
                            </div>
                            <button
                                onClick={() => onOptionChange('mergeAddBookmarks', !toolOptions.mergeAddBookmarks)}
                                className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${toolOptions.mergeAddBookmarks ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${toolOptions.mergeAddBookmarks ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>
                );

            default:
                return (
                    <div className="animate-in slide-in-from-right-5 fade-in duration-300 space-y-4">
                        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-center">
                            <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
                                <Download className="w-7 h-7" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Ready to Process</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                No configuration needed. Click the button below to start {activeTool.name}.
                            </p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="h-screen w-80 glass flex flex-col z-40 shadow-2xl transition-all duration-300 border-l border-gray-200/50 dark:border-white/5">

            {/* Active Tool Header */}
            <AnimatePresence mode="wait">
                {activeTool ? (
                    <motion.div
                        key="active-tool-header"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 relative overflow-hidden"
                    >
                        <div className={`bg-gradient-to-br ${activeTool.color.replace('bg-', 'from-').replace('500', '600')} to-gray-900 p-8 text-white relative z-10`}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md shadow-lg">
                                    <activeTool.icon className="w-8 h-8" />
                                </div>
                                <button
                                    onClick={() => onToolSelect(null)}
                                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    title="Close Tool"
                                >
                                    <X className="w-5 h-5 text-white/90" />
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold mb-2 tracking-tight">{t(activeTool.name)}</h2>
                            <p className="text-sm text-white/80 leading-relaxed font-light">{t(activeTool.description)}</p>
                        </div>

                        {/* Decorative Elements */}
                        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl z-0 pointer-events-none" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="default-header"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="p-8 border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 backdrop-blur-sm"
                    >
                        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Tools Panel</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Select a tool to configure options.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    {activeTool ? (
                        <motion.div
                            key="tool-settings"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="p-6"
                        >
                            {renderToolSettings()}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="quick-tools"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                            className="p-6 grid grid-cols-2 gap-3"
                        >
                            {quickTools.map((tool) => (
                                <button
                                    key={tool.id}
                                    onClick={() => onToolSelect(tool)}
                                    className="flex flex-col items-center justify-center p-4 rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 hover:border-brand-500 hover:shadow-lg transition-all group"
                                >
                                    <tool.icon className="w-6 h-6 mb-3 text-gray-400 group-hover:text-brand-500 dark:text-gray-500 dark:group-hover:text-brand-400 transition-colors" />
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 group-hover:text-brand-600 dark:group-hover:text-brand-400 text-center">{t(tool.name)}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="p-6 border-t border-gray-200/50 dark:border-white/5 bg-white/50 dark:bg-black/20 backdrop-blur-md">
                <button
                    onClick={onExport}
                    disabled={!activeTool}
                    className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-sm transition-all shadow-lg
            ${activeTool
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/30 hover:-translate-y-0.5'
                            : 'bg-gray-200 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'}`}
                >
                    <Download className="w-5 h-5" />
                    {getActionLabel()}
                </button>
            </div>
        </div>
    );
};