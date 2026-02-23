/**
 * pptService.ts — PowerPoint → PDF Conversion Service (client-side)
 *
 * Pipeline:
 *   .pptx  ──[JSZip]──▶  raw OOXML (slides/slide*.xml + slide layouts)
 *          ──[OOXML parser]──▶  per-slide render data (shapes, text, bg)
 *          ──[HTML renderer]──▶  styled HTML (one <section> per slide)
 *          ──[html2canvas]──▶  canvas bitmap per slide
 *          ──[jsPDF]──▶  multi-page PDF bytes
 *
 * Design contract:
 *  - Pure engine — never downloads. Caller owns download & UI.
 *  - Returns PptConversionResult per presentation.
 *  - API-swap-ready: swap convertPptxToPDF implementation with fetch().
 *  - Slide selection: pass slideIndexes (0-based) to include only some slides.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SlideInfo {
    /** 0-based slide index */
    index: number;
    /** Slide title extracted from OOXML (may be empty) */
    title: string;
    /** Number of text shapes on the slide */
    shapeCount: number;
}

export interface PptConversionOptions {
    /** 0-based slide indexes to include. Default: all */
    slideIndexes?: number[];
    /** Output filename prefix (without .pdf). Default: presentation basename */
    outputPrefix?: string;
    /** jsPDF page format. Default: 'a4' */
    pageFormat?: 'a4' | 'letter' | 'legal';
    /** Page orientation. Default: 'landscape' (matches 16:9 slides) */
    orientation?: 'portrait' | 'landscape';
    /** html2canvas render scale. 1 = 96dpi, 2 = 192dpi. Default: 1.5 */
    scale?: 1 | 1.5 | 2;
    onProgress?: (p: number) => void;
}

export interface PptConversionResult {
    bytes: Uint8Array;
    outputName: string;
    /** Total slides in the source presentation */
    totalSlides: number;
    /** Slides actually converted */
    convertedSlides: number;
    pageCount: number;
    originalSize: number;
    outputSize: number;
}

export interface BatchPptResult {
    succeeded: PptConversionResult[];
    failed: { fileName: string; error: string }[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint',   // .ppt
    'application/mspowerpoint',
    'application/powerpoint',
]);
const ALLOWED_EXTS = new Set(['.pptx', '.ppt']);
export const PPT_MAX_FILE_MB = 100;

// Standard widescreen slide dimensions in EMUs (1 inch = 914400 EMU)
const SLIDE_W_EMU = 9144000; // 10 inches
const SLIDE_H_EMU = 5143500; // 7.5 inches (typical 4:3 fallback, overridden per file)

// Render canvas width target (px)
const RENDER_W = 1280;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'presentation';
}

export function isPptFile(file: File): boolean {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTS.has(ext);
}

function validateFile(file: File): void {
    if (!isPptFile(file))
        throw new Error(`"${file.name}" is not a valid PowerPoint file (.pptx or .ppt).`);
    if (file.size > PPT_MAX_FILE_MB * 1024 * 1024)
        throw new Error(`"${file.name}" exceeds the ${PPT_MAX_FILE_MB} MB limit.`);
    if (file.size === 0)
        throw new Error(`"${file.name}" is empty.`);
}

export function validatePptFile(file: File): string | null {
    try { validateFile(file); return null; }
    catch (e: any) { return e.message; }
}

// ── OOXML helpers ──────────────────────────────────────────────────────────────

/** Convert EMU → px at target render scale */
function emuToPx(emu: number, totalEmu: number, totalPx: number): number {
    return Math.round((emu / totalEmu) * totalPx);
}

/** Parse hex color from OOXML (val attribute is like "FF0000" or "FFFFFF") */
function ooColor(val: string | null | undefined, def = '#000000'): string {
    if (!val) return def;
    const s = val.replace(/^#/, '').trim();
    if (s.length === 6) return `#${s}`;
    if (s.length === 3) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    return def;
}

function getAttr(el: Element | null | undefined, ns: string, local: string): string | null {
    if (!el) return null;
    return el.getAttributeNS(ns, local) ?? el.getAttribute(local) ?? el.getAttribute(local.toLowerCase());
}

/** Pull innerText of first matching selector */
function getText(el: Element | null | undefined, selector: string): string {
    if (!el) return '';
    const node = el.querySelector(selector);
    return node?.textContent?.trim() ?? '';
}

// ── OOXML namespace map ────────────────────────────────────────────────────────

const NS = {
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
};

function qs(el: Element | Document, tag: string): Element | null {
    // Try both bare tag and namespaced variants
    return el.querySelector(tag) ??
        el.querySelector(tag.replace('a:', 'a\\:').replace('p:', 'p\\:')) ??
        [...el.querySelectorAll('*')].find(n => n.localName === tag.split(':')[1] || n.localName === tag) ?? null;
}

function qsAll(el: Element | Document, tag: string): Element[] {
    const localName = tag.includes(':') ? tag.split(':')[1] : tag;
    return [...el.querySelectorAll('*')].filter(n => n.localName === localName);
}

// ── Parse a single slide XML into render data ─────────────────────────────────

interface ShapeData {
    x: number; y: number; w: number; h: number; // percent of slide dims
    texts: { text: string; bold: boolean; italic: boolean; size: number; color: string; align: string }[];
    bgColor: string | null;
    type: 'text' | 'rect' | 'image' | 'unknown';
}

interface SlideRenderData {
    bgColor: string;
    shapes: ShapeData[];
    slideWEmu: number;
    slideHEmu: number;
}

function parseSlideXml(xml: string, slideWEmu: number, slideHEmu: number): SlideRenderData {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Background color
    let bgColor = '#FFFFFF';
    const bgRect = [...doc.querySelectorAll('*')].find(e => e.localName === 'bgPr' || e.localName === 'bg');
    if (bgRect) {
        const solidFill = [...bgRect.querySelectorAll('*')].find(e => e.localName === 'solidFill');
        if (solidFill) {
            const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
            if (srgb) bgColor = ooColor(srgb.getAttribute('val'));
        }
    }

    const shapes: ShapeData[] = [];

    // Collect all sp (shape) elements
    const spElements = [...doc.querySelectorAll('*')].filter(e => e.localName === 'sp');

    for (const sp of spElements) {
        // Position & size from spPr/xfrm
        const xfrm = [...sp.querySelectorAll('*')].find(e => e.localName === 'xfrm');
        const off = xfrm ? [...xfrm.querySelectorAll('*')].find(e => e.localName === 'off') : null;
        const ext = xfrm ? [...xfrm.querySelectorAll('*')].find(e => e.localName === 'ext') : null;

        const xEmu = parseInt(off?.getAttribute('x') ?? '0', 10);
        const yEmu = parseInt(off?.getAttribute('y') ?? '0', 10);
        const wEmu = parseInt(ext?.getAttribute('cx') ?? '0', 10);
        const hEmu = parseInt(ext?.getAttribute('cy') ?? '0', 10);

        // Convert to percentages (so HTML can scale)
        const xPct = (xEmu / slideWEmu) * 100;
        const yPct = (yEmu / slideHEmu) * 100;
        const wPct = (wEmu / slideWEmu) * 100;
        const hPct = (hEmu / slideHEmu) * 100;

        // Fill color
        let shapeBg: string | null = null;
        const spPr = [...sp.querySelectorAll('*')].find(e => e.localName === 'spPr');
        if (spPr) {
            const solidFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'solidFill');
            if (solidFill) {
                const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
                if (srgb) shapeBg = ooColor(srgb.getAttribute('val'));
            }
            const noFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'noFill');
            if (noFill) shapeBg = 'transparent';
        }

        // Text body
        const txBody = [...sp.querySelectorAll('*')].find(e => e.localName === 'txBody');
        const texts: ShapeData['texts'] = [];

        if (txBody) {
            const paragraphs = [...txBody.querySelectorAll('*')].filter(e => e.localName === 'p');
            for (const para of paragraphs) {
                // Paragraph-level alignment
                const pPr = [...para.querySelectorAll('*')].find(e => e.localName === 'pPr');
                const algn = pPr?.getAttribute('algn') ?? 'l';
                const alignMap: Record<string, string> = { l: 'left', r: 'right', ctr: 'center', just: 'justify', dist: 'justify' };
                const align = alignMap[algn] ?? 'left';

                // Runs
                const runs = [...para.querySelectorAll('*')].filter(e => e.localName === 'r');
                for (const run of runs) {
                    const rPr = [...run.querySelectorAll('*')].find(e => e.localName === 'rPr');
                    const t = [...run.querySelectorAll('*')].find(e => e.localName === 't');
                    const text = t?.textContent ?? '';
                    if (!text) continue;

                    const bold = rPr?.getAttribute('b') === '1' || rPr?.getAttribute('b') === 'true';
                    const italic = rPr?.getAttribute('i') === '1' || rPr?.getAttribute('i') === 'true';
                    const szAttr = rPr?.getAttribute('sz');
                    const size = szAttr ? parseInt(szAttr, 10) / 100 : 18; // hundredths of pt

                    let color = '#111111';
                    if (rPr) {
                        const solidFill = [...rPr.querySelectorAll('*')].find(e => e.localName === 'solidFill');
                        if (solidFill) {
                            const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
                            if (srgb) color = ooColor(srgb.getAttribute('val'));
                        }
                    }

                    texts.push({ text, bold, italic, size, color, align });
                }

                // Line break
                const brs = [...para.querySelectorAll('*')].filter(e => e.localName === 'br');
                if (brs.length > 0 && runs.length === 0) {
                    texts.push({ text: '\n', bold: false, italic: false, size: 12, color: '#000', align });
                }
            }
        }

        shapes.push({
            x: xPct, y: yPct, w: wPct, h: hPct,
            texts,
            bgColor: shapeBg,
            type: txBody ? 'text' : 'rect',
        });
    }

    return { bgColor, shapes, slideWEmu, slideHEmu };
}

// ── Render one SlideRenderData → HTML string ───────────────────────────────────

function renderSlideToHtml(data: SlideRenderData, slideIndex: number): string {
    const { bgColor, shapes } = data;

    let innerHtml = '';
    for (const shape of shapes) {
        if (shape.w <= 0 || shape.h <= 0) continue;

        const fillStyle = shape.bgColor === 'transparent' ? 'background:transparent;'
            : shape.bgColor ? `background:${shape.bgColor};`
                : '';

        const posStyle = `
      position:absolute;
      left:${shape.x.toFixed(3)}%;
      top:${shape.y.toFixed(3)}%;
      width:${shape.w.toFixed(3)}%;
      height:${shape.h.toFixed(3)}%;
      overflow:hidden;
      box-sizing:border-box;
      ${fillStyle}
    `.replace(/\n\s+/g, ' ').trim();

        if (shape.texts.length > 0) {
            // Group consecutive runs by paragraph (same align)
            let textHtml = '';
            let paraBuffer: string[] = [];
            let lastAlign = shape.texts[0].align;

            const flushPara = () => {
                if (paraBuffer.length === 0) return;
                textHtml += `<div style="text-align:${lastAlign};line-height:1.3;margin:0;padding:0">${paraBuffer.join('')}</div>`;
                paraBuffer = [];
            };

            for (const run of shape.texts) {
                if (run.text === '\n') {
                    flushPara();
                    continue;
                }
                if (run.align !== lastAlign && paraBuffer.length > 0) {
                    flushPara();
                    lastAlign = run.align;
                }
                const fs = `font-size:${Math.max(8, run.size).toFixed(1)}pt;`;
                const fw = run.bold ? 'font-weight:700;' : 'font-weight:400;';
                const fi = run.italic ? 'font-style:italic;' : '';
                const fc = `color:${run.color};`;
                const escaped = run.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                paraBuffer.push(`<span style="${fs}${fw}${fi}${fc}white-space:pre-wrap;">${escaped}</span>`);
            }
            flushPara();

            innerHtml += `
        <div style="${posStyle}padding:4px 6px;">
          <div style="font-family:'Calibri','Segoe UI',Arial,sans-serif;">${textHtml}</div>
        </div>`;
        } else if (shape.bgColor && shape.bgColor !== 'transparent') {
            innerHtml += `<div style="${posStyle}border:1px solid rgba(0,0,0,0.08);"></div>`;
        }
    }

    return `
    <section data-slide="${slideIndex}" style="
      position:relative;
      width:100%;
      padding-top:56.25%;
      background:${bgColor};
      overflow:hidden;
      page-break-after:always;
      box-shadow:none;
      box-sizing:border-box;
    ">
      <div style="position:absolute;inset:0;">${innerHtml}</div>
    </section>`;
}

// ── Slide count/metadata pre-scan ─────────────────────────────────────────────

export async function getPresentationSlides(file: File): Promise<SlideInfo[]> {
    validateFile(file);

    if (file.name.toLowerCase().endsWith('.ppt')) {
        throw new Error(`"${file.name}" is a legacy .ppt file. Save it as .pptx in PowerPoint and re-upload.`);
    }

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    // Find all slide files
    const slideKeys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
            const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
            return na - nb;
        });

    const slides: SlideInfo[] = [];
    for (let i = 0; i < slideKeys.length; i++) {
        const xml = await zip.files[slideKeys[i]].async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const sps = [...doc.querySelectorAll('*')].filter(e => e.localName === 'sp');

        // Title = first placeholder with type title or body
        let title = '';
        for (const sp of sps) {
            const ph = [...sp.querySelectorAll('*')].find(e => e.localName === 'ph');
            const phTy = ph?.getAttribute('type') ?? '';
            if (!phTy || phTy === 'title' || phTy === 'ctrTitle') {
                const tEls = [...sp.querySelectorAll('*')].filter(e => e.localName === 't');
                title = tEls.map(t => t.textContent ?? '').join('').trim();
                if (title) break;
            }
        }

        slides.push({ index: i, title: title || `Slide ${i + 1}`, shapeCount: sps.length });
    }

    return slides;
}

// ── Core conversion ────────────────────────────────────────────────────────────

export async function convertPptToPDF(
    file: File,
    options: PptConversionOptions = {}
): Promise<PptConversionResult> {
    const {
        slideIndexes,
        outputPrefix,
        pageFormat = 'a4',
        orientation = 'landscape',
        scale = 1.5,
        onProgress,
    } = options;

    // 1. Validate
    validateFile(file);
    if (file.name.toLowerCase().endsWith('.ppt')) {
        throw new Error(
            `"${file.name}" is a legacy binary .ppt file. ` +
            `Open it in PowerPoint and save as .pptx for conversion.`
        );
    }
    onProgress?.(5);

    // 2. Unzip
    let zip: any;
    try {
        const JSZip = (await import('jszip')).default;
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch (err: any) {
        throw new Error(`Cannot open "${file.name}": ${err?.message ?? 'file may be corrupted'}`);
    }
    onProgress?.(15);

    // 3. Read presentation dimensions from presentation.xml
    let slideWEmu = SLIDE_W_EMU;
    let slideHEmu = SLIDE_H_EMU;
    try {
        const presXml = await zip.files['ppt/presentation.xml']?.async('string');
        if (presXml) {
            const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
            const sldSz = [...presDoc.querySelectorAll('*')].find(e => e.localName === 'sldSz');
            if (sldSz) {
                slideWEmu = parseInt(sldSz.getAttribute('cx') ?? String(SLIDE_W_EMU), 10);
                slideHEmu = parseInt(sldSz.getAttribute('cy') ?? String(SLIDE_H_EMU), 10);
            }
        }
    } catch { /* use defaults */ }

    // 4. Enumerate slide keys
    const slideKeys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
            const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
            return na - nb;
        });

    if (slideKeys.length === 0) {
        throw new Error(`"${file.name}" contains no slides or is not a valid .pptx file.`);
    }

    const totalSlides = slideKeys.length;
    const selected = slideIndexes ?? slideKeys.map((_, i) => i);
    const validIdx = selected.filter(i => i >= 0 && i < totalSlides);
    if (validIdx.length === 0) throw new Error('No valid slide indexes selected.');

    onProgress?.(20);

    // 5. Parse + render each slide to HTML
    const slideHtmlParts: string[] = [];
    for (let si = 0; si < validIdx.length; si++) {
        const idx = validIdx[si];
        const xml = await zip.files[slideKeys[idx]].async('string');
        const data = parseSlideXml(xml, slideWEmu, slideHEmu);
        slideHtmlParts.push(renderSlideToHtml(data, idx));
        onProgress?.(20 + Math.round(((si + 1) / validIdx.length) * 35));
    }

    // 6. Aspect ratio for iframe sizing
    const aspectRatio = slideHEmu / slideWEmu; // e.g. 0.5625 for 16:9
    const IFRAME_W = 1280; // px
    const IFRAME_H = Math.round(IFRAME_W * aspectRatio);

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #888; }
  body { width: ${IFRAME_W}px; padding: 0; }
  section { display: block; width: ${IFRAME_W}px; height: ${IFRAME_H}px; padding-top: 0 !important; }
  section > div { position: static !important; width: 100%; height: 100%; }
  section > div > div { position: absolute; }
</style>
</head><body>${slideHtmlParts.join('\n')}</body></html>`;

    onProgress?.(58);

    // 7. Mount iframe
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
    position:fixed;top:-9999px;left:-9999px;
    width:${IFRAME_W}px;height:${IFRAME_H * validIdx.length}px;
    border:none;overflow:hidden;visibility:hidden;`;
    document.body.appendChild(iframe);

    try {
        const doc = iframe.contentDocument!;
        doc.open(); doc.write(fullHtml); doc.close();

        // Let layout settle
        await new Promise<void>(res => setTimeout(res, 150));
        onProgress?.(65);

        // 8. Rasterise the whole iframe body at once
        const h2c = await import('html2canvas');
        const h2cFn = (h2c as any).default ?? h2c;

        const totalH = IFRAME_H * validIdx.length;

        const canvas = await h2cFn(doc.body, {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#888888',
            width: IFRAME_W,
            height: totalH,
            windowWidth: IFRAME_W,
            windowHeight: totalH,
            logging: false,
        });
        onProgress?.(82);

        // 9. Slice each slide height worth into a jsPDF page
        const { jsPDF } = await import('jspdf');

        const isL = orientation === 'landscape';
        const pdfW = pageFormat === 'letter' ? (isL ? 279.4 : 215.9)
            : pageFormat === 'legal' ? (isL ? 355.6 : 215.9)
                : (isL ? 297.0 : 210.0);
        const pdfH = pageFormat === 'letter' ? (isL ? 215.9 : 279.4)
            : pageFormat === 'legal' ? (isL ? 215.9 : 355.6)
                : (isL ? 210.0 : 297.0);

        const pdf = new jsPDF({ orientation, unit: 'mm', format: pageFormat, compress: true });

        // Each slide occupies exactly IFRAME_H * scale pixels on the canvas
        const slideCanvasH = IFRAME_H * scale;
        const mmPerPx = pdfW / (IFRAME_W * scale);

        for (let si = 0; si < validIdx.length; si++) {
            if (si > 0) pdf.addPage([pdfW, pdfH], orientation);

            const sc = document.createElement('canvas');
            sc.width = Math.round(IFRAME_W * scale);
            sc.height = Math.round(slideCanvasH);
            const ctx = sc.getContext('2d')!;
            ctx.drawImage(canvas, 0, si * slideCanvasH, sc.width, sc.height, 0, 0, sc.width, sc.height);

            const sliceH_mm = sc.height * mmPerPx;
            pdf.addImage(sc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, sliceH_mm);
        }

        onProgress?.(97);
        const pdfBytes = pdf.output('arraybuffer');
        onProgress?.(100);

        const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.(pptx?|PPTX?)$/i, ''));
        return {
            bytes: new Uint8Array(pdfBytes),
            outputName: `${base}.pdf`,
            totalSlides,
            convertedSlides: validIdx.length,
            pageCount: validIdx.length,
            originalSize: file.size,
            outputSize: pdfBytes.byteLength,
        };
    } finally {
        document.body.removeChild(iframe);
    }
}

// ── Batch conversion ───────────────────────────────────────────────────────────

export async function batchConvertPptToPDF(
    files: File[],
    options: Omit<PptConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: PptConversionResult, index: number) => void;
        onFileError?: (fileName: string, error: string, index: number) => void;
    } = {}
): Promise<BatchPptResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: PptConversionResult[] = [];
    const failed: { fileName: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertPptToPDF(file, {
                ...convOpts,
                onProgress: (p) => onFileProgress?.(file.name, p),
            });
            succeeded.push(result);
            onFileComplete?.(result, i);
        } catch (err: any) {
            const msg = err?.message || 'Unknown error';
            failed.push({ fileName: file.name, error: msg });
            onFileError?.(file.name, msg, i);
        }
    }
    return { succeeded, failed };
}

export { PPT_MAX_FILE_MB as PPT_MAX_MB };
