/**
 * pptService.ts — PowerPoint → PDF Conversion Service V6
 *
 * Rendering pipeline:
 *   .pptx ──[JSZip]──▶ OOXML parse ──▶ HTML Canvas render ──▶ JPEG ──▶ pdf-lib embed
 *
 * V6 key change: every slide is rendered to an off-screen HTML Canvas using the
 * browser's own font engine.  On Windows with Office installed the browser has
 * direct access to Calibri, Arial, Times New Roman etc., so the output is
 * pixel-perfect with respect to text layout and spacing.
 *
 * The resulting PDF embeds each slide as a full-page JPEG image.
 */

export interface SlideInfo {
    index: number;
    title: string;
    shapeCount: number;
}

export interface PptConversionOptions {
    slideIndexes?: number[];
    outputPrefix?: string;
    pageFormat?: 'a4' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
    scale?: 1 | 1.5 | 2;
    onProgress?: (p: number) => void;
}

export interface PptConversionResult {
    bytes: Uint8Array;
    outputName: string;
    totalSlides: number;
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
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/mspowerpoint',
    'application/powerpoint',
]);
const ALLOWED_EXTS = new Set(['.pptx', '.ppt']);
export const PPT_MAX_FILE_MB = 100;

/** Default widescreen slide size in EMU */
const SLIDE_W_EMU = 9144000;
const SLIDE_H_EMU = 5143500;

const EMU_PER_INCH = 914400;
const PT_PER_INCH  = 72;
const EMU_PER_PT   = EMU_PER_INCH / PT_PER_INCH; // 12700

/** Rendering DPI — higher = sharper PDF, larger file */
const RENDER_DPI = 150;

// ── Coordinate helpers ────────────────────────────────────────────────────────

function emuToPx(emu: number, dpi = RENDER_DPI): number {
    return (emu / EMU_PER_INCH) * dpi;
}

function ptToPx(pt: number, dpi = RENDER_DPI): number {
    return (pt / PT_PER_INCH) * dpi;
}

// ── File validation ───────────────────────────────────────────────────────────

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

// ── OOXML namespace ───────────────────────────────────────────────────────────

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ── Color helper ──────────────────────────────────────────────────────────────

function ooColor(val: string | null | undefined, def = '#000000'): string {
    if (!val) return def;
    const s = val.replace(/^#/, '').trim();
    if (s.length === 6) return `#${s}`;
    if (s.length === 3) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    return def;
}

const SCHEME_COLORS: Record<string, string> = {
    accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5',
    accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
    dk1: '#000000', lt1: '#FFFFFF', dk2: '#444444', lt2: '#EEEEEE',
    bg1: '#FFFFFF', bg2: '#EEEEEE', tx1: '#000000', tx2: '#444444',
};

function resolveColor(fill: Element | null | undefined): string | null {
    if (!fill) return null;
    const srgb = qn(fill, 'srgbClr');
    if (srgb) return ooColor(srgb.getAttribute('val'));
    const scheme = qn(fill, 'schemeClr');
    if (scheme) return SCHEME_COLORS[scheme.getAttribute('val') ?? ''] ?? null;
    return null;
}

/** querySelector by local name (namespace-agnostic) */
function qn(el: Element | Document, localName: string): Element | null {
    return [...el.querySelectorAll('*')].find(e => e.localName === localName) ?? null;
}
function qna(el: Element | Document, localName: string): Element[] {
    return [...el.querySelectorAll('*')].filter(e => e.localName === localName);
}

// ── Relationship parsing ──────────────────────────────────────────────────────

async function parseSlideRels(zip: any, slidePath: string): Promise<Map<string, string>> {
    const relsMap = new Map<string, string>();
    const candidate = slidePath
        .replace('ppt/slides/', 'ppt/slides/_rels/')
        .replace('.xml', '.xml.rels');
    const relsXml: string = zip.files[candidate]
        ? await zip.files[candidate].async('string')
        : '';
    if (!relsXml) return relsMap;

    try {
        const doc = new DOMParser().parseFromString(relsXml, 'application/xml');
        for (const rel of qna(doc as unknown as Element, 'Relationship')) {
            const type   = rel.getAttribute('Type') ?? '';
            const target = rel.getAttribute('Target') ?? '';
            const id     = rel.getAttribute('Id') ?? '';
            if (!type.includes('image') || !target || !id) continue;

            let resolved: string;
            if (target.startsWith('../../')) resolved = 'ppt/' + target.replace('../../', '');
            else if (target.startsWith('../')) resolved = 'ppt/' + target.replace('../', '');
            else resolved = 'ppt/slides/' + target;
            relsMap.set(id, resolved);
        }
    } catch { /* skip */ }
    return relsMap;
}

// ── Image extraction ──────────────────────────────────────────────────────────

async function extractImages(zip: any): Promise<Map<string, string>> {
    const images = new Map<string, string>();
    const mediaKeys = Object.keys(zip.files).filter(k =>
        k.startsWith('ppt/media/') || k.match(/\.(png|jpe?g|gif|bmp|svg|tiff?)$/i)
    );
    for (const key of mediaKeys) {
        try {
            const b64  = await zip.files[key].async('base64');
            const ext  = key.split('.').pop()?.toLowerCase() ?? 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                       : ext === 'gif' ? 'image/gif'
                       : ext === 'svg' ? 'image/svg+xml'
                       : ext === 'bmp' ? 'image/bmp'
                       : 'image/png';
            const dataUrl = `data:${mime};base64,${b64}`;
            images.set(key, dataUrl);
            const fn = key.split('/').pop()!;
            if (!images.has(fn)) images.set(fn, dataUrl);
        } catch { /* skip */ }
    }
    return images;
}

// ── Image loader (browser) ────────────────────────────────────────────────────

const imgCache = new Map<string, HTMLImageElement>();

function loadImg(src: string): Promise<HTMLImageElement> {
    if (imgCache.has(src)) return Promise.resolve(imgCache.get(src)!);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => { imgCache.set(src, img); resolve(img); };
        img.onerror = () => reject(new Error('img load failed'));
        img.src = src;
    });
}

// ── OOXML data structures ─────────────────────────────────────────────────────

interface RunData {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    /** font size in points */
    fontSize: number;
    color: string;
    fontFamily: string;
}

interface ParaData {
    runs: RunData[];
    align: 'left' | 'center' | 'right' | 'justify';
    /** space before in points */
    spcBefore: number;
    /** space after in points */
    spcAfter: number;
    /** line-spacing multiplier (1.0 = single) */
    lineSpacing: number;
    /** absolute line spacing in points, 0 = use multiplier */
    lineSpacingAbs: number;
    /** left margin in EMU */
    marL: number;
    /** right margin in EMU */
    marR: number;
    /** first-line indent in EMU (negative = hanging) */
    indent: number;
    bulletChar?: string;
    bulletFont?: string;
    bulletSzPt?: number;
    bulletColor?: string;
    lvl: number;
    /** fallback font size */
    defaultFontSize: number;
}

interface CellData {
    paras: ParaData[];
    bgColor: string | null;
    colspan: number;
}

interface TableData {
    cells: CellData[];
    colWidths: number[];   // EMU
    rowHeights: number[];  // EMU
    cols: number;
    rows: number;
    borderColor: string;
    borderWidth: number;
}

interface ShapeData {
    xEmu: number; yEmu: number; wEmu: number; hEmu: number;
    paras: ParaData[];
    bgColor: string | null;
    type: 'text' | 'rect' | 'image' | 'table' | 'line';
    imageData?: string;
    zIndex: number;
    padding: { top: number; right: number; bottom: number; left: number }; // EMU
    vAnchor: 'top' | 'mid' | 'bottom';
    wrapNone: boolean;
    outlineColor?: string;
    outlineWidthPt?: number;
    table?: TableData;
    lineData?: { flipH: boolean; flipV: boolean; color: string; widthPt: number };
}

interface SlideRenderData {
    bgColor: string;
    shapes: ShapeData[];
    slideWEmu: number;
    slideHEmu: number;
    bgImageData?: string;
}

// ── Parse one <a:p> paragraph ─────────────────────────────────────────────────

function parsePara(para: Element, defaultFs = 18): ParaData {
    const pPr = [...para.children].find(e => e.localName === 'pPr') ?? null;

    // Alignment
    const algn = pPr?.getAttribute('algn') ?? 'l';
    const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
        l: 'left', r: 'right', ctr: 'center', just: 'justify', dist: 'justify',
    };
    const align = alignMap[algn] ?? 'left';

    // spcBefore / spcAfter — in hundredths of a point
    let spcBefore = 0, spcAfter = 0;
    if (pPr) {
        for (const [tag, isAfter] of [['spcBef', false], ['spcAft', true]] as [string, boolean][]) {
            const el = qn(pPr, tag);
            if (!el) continue;
            const pts = qn(el, 'spcPts');
            const pct = qn(el, 'spcPct');
            if (pts) {
                const v = parseInt(pts.getAttribute('val') ?? '0', 10) / 100;
                if (isAfter) spcAfter = v; else spcBefore = v;
            } else if (pct) {
                // store negative to indicate "percent × defaultFs" — resolved at render time
                const v = parseInt(pct.getAttribute('val') ?? '0', 10) / 100000;
                if (isAfter) spcAfter = -(v * 100); else spcBefore = -(v * 100);
            }
        }
    }

    // Line spacing
    let lineSpacing = 1.15, lineSpacingAbs = 0;
    const lnSpc = pPr ? qn(pPr, 'lnSpc') : null;
    if (lnSpc) {
        const pct = qn(lnSpc, 'spcPct');
        const pts = qn(lnSpc, 'spcPts');
        if (pct) lineSpacing = parseInt(pct.getAttribute('val') ?? '100000', 10) / 100000;
        else if (pts) lineSpacingAbs = parseInt(pts.getAttribute('val') ?? '0', 10) / 100;
    }

    // Margins / indent (EMU)
    const marL   = pPr ? parseInt(pPr.getAttribute('marL')   ?? '0', 10) : 0;
    const marR   = pPr ? parseInt(pPr.getAttribute('marR')   ?? '0', 10) : 0;
    const indent = pPr ? parseInt(pPr.getAttribute('indent') ?? '0', 10) : 0;

    // Bullet
    let bulletChar: string | undefined, bulletFont: string | undefined;
    let bulletSzPt: number | undefined, bulletColor: string | undefined;
    let lvl = 0;
    if (pPr) {
        const buLvl = pPr.getAttribute('lvl');
        if (buLvl) lvl = parseInt(buLvl, 10);

        if (!qn(pPr, 'buNone')) {
            const buChar = qn(pPr, 'buChar');
            if (buChar) bulletChar = buChar.getAttribute('char') ?? '•';
            const buFont = qn(pPr, 'buFont');
            if (buFont) bulletFont = buFont.getAttribute('typeface') ?? undefined;
            const buSzPts = qn(pPr, 'buSzPts');
            if (buSzPts) bulletSzPt = parseInt(buSzPts.getAttribute('val') ?? '0', 10) / 100;
            const buClr = qn(pPr, 'buClr');
            if (buClr) bulletColor = resolveColor(qn(buClr, 'solidFill') ?? buClr) ?? undefined;
        }
    }

    // Runs
    const runs: RunData[] = [];
    let lastFontSize = defaultFs;

    for (const child of para.children) {
        if (child.localName === 'br') {
            runs.push({ text: '\n', bold: false, italic: false, underline: false, strike: false, fontSize: lastFontSize, color: '#000000', fontFamily: '' });
            continue;
        }
        if (child.localName !== 'r') continue;

        const rPr = [...child.children].find(e => e.localName === 'rPr') ?? null;
        const tEl = [...child.children].find(e => e.localName === 't');
        const rawText = tEl?.textContent ?? '';
        if (!rawText) continue;
        const text = rawText.replace(/\t/g, '    ').replace(/\r/g, '');

        const bold      = rPr?.getAttribute('b') === '1' || rPr?.getAttribute('b') === 'true';
        const italic    = rPr?.getAttribute('i') === '1' || rPr?.getAttribute('i') === 'true';
        const uAttr     = rPr?.getAttribute('u') ?? '';
        const underline = uAttr !== '' && uAttr !== 'none';
        const strike    = rPr?.getAttribute('strike') === 'sngStrike' || rPr?.getAttribute('strike') === 'dblStrike';

        const szAttr    = rPr?.getAttribute('sz');
        const fontSize  = szAttr ? parseInt(szAttr, 10) / 100 : defaultFs;
        lastFontSize    = fontSize;

        // Color
        let color = '#111111';
        if (rPr) {
            const solidFill = qn(rPr, 'solidFill');
            if (solidFill) {
                const c = resolveColor(solidFill);
                if (c) color = c;
            }
        }

        // Font family
        const latin = rPr ? qn(rPr, 'latin') : null;
        const ea    = rPr ? qn(rPr, 'ea')    : null;
        const fontFamily = ea?.getAttribute('typeface') || latin?.getAttribute('typeface') || '';

        runs.push({ text, bold, italic, underline, strike, fontSize, color, fontFamily });
    }

    return {
        runs, align, spcBefore, spcAfter,
        lineSpacing, lineSpacingAbs,
        marL, marR, indent,
        bulletChar, bulletFont, bulletSzPt, bulletColor,
        lvl,
        defaultFontSize: lastFontSize || defaultFs,
    };
}

// ── Parse shape fill ──────────────────────────────────────────────────────────

function parseShapeFill(spPr: Element | null): string | null {
    if (!spPr) return null;
    if (qn(spPr, 'noFill')) return 'transparent';

    const solidFill = qn(spPr, 'solidFill');
    if (solidFill) return resolveColor(solidFill);

    const gradFill = qn(spPr, 'gradFill');
    if (gradFill) {
        const gsLst = qn(gradFill, 'gsLst');
        if (gsLst) {
            const gs = qn(gsLst, 'gs');
            if (gs) {
                const sf = qn(gs, 'solidFill');
                if (sf) return resolveColor(sf);
            }
        }
    }

    const blipFill = qn(spPr, 'blipFill');
    if (blipFill) {
        const blip = qn(blipFill, 'blip');
        const id = blip?.getAttributeNS(NS_R, 'embed') ?? blip?.getAttribute('r:embed');
        if (id) return `__RID:${id}`;
    }
    return null;
}

// ── Parse slide XML ───────────────────────────────────────────────────────────

function parseSlideXml(
    xml: string,
    slideWEmu: number,
    slideHEmu: number,
    relsMap: Map<string, string>,
    images: Map<string, string>,
): SlideRenderData {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // ── Background ──────────────────────────────────────────────────────────────
    let bgColor = '#FFFFFF';
    let bgImageData: string | undefined;

    const bg = [...doc.querySelectorAll('*')].find(e => e.localName === 'bg');
    if (bg) {
        const bgPr = qn(bg, 'bgPr');
        if (bgPr) {
            const sf = qn(bgPr, 'solidFill');
            if (sf) bgColor = resolveColor(sf) ?? bgColor;

            const blipFill = qn(bgPr, 'blipFill');
            if (blipFill) {
                const blip = qn(blipFill, 'blip');
                const id = blip?.getAttributeNS(NS_R, 'embed') ?? blip?.getAttribute('r:embed');
                if (id && relsMap.has(id)) {
                    const p = relsMap.get(id)!;
                    bgImageData = images.get(p) ?? images.get(p.split('/').pop()!);
                }
            }

            // gradient → first stop
            const gradFill = qn(bgPr, 'gradFill');
            if (gradFill) {
                const gs = qn(gradFill, 'gs');
                if (gs) bgColor = resolveColor(qn(gs, 'solidFill') ?? gs) ?? bgColor;
            }
        }
    }

    // ── Shapes ──────────────────────────────────────────────────────────────────
    const shapes: ShapeData[] = [];
    let zIndex = 0;

    const spTree = [...doc.querySelectorAll('*')].find(e => e.localName === 'spTree');
    if (!spTree) return { bgColor, shapes, slideWEmu, slideHEmu, bgImageData };

    function processEl(el: Element, offsetXEmu = 0, offsetYEmu = 0) {
        if (el.localName === 'grpSp') {
            // Read group's own transform to compute child offset
            const grpSpPr = [...el.children].find(e => e.localName === 'grpSpPr');
            const grpXfrm = grpSpPr ? [...grpSpPr.children].find(e => e.localName === 'xfrm') : null;
            const grpOff  = grpXfrm ? [...grpXfrm.children].find(e => e.localName === 'off')   : null;
            const grpExt  = grpXfrm ? [...grpXfrm.children].find(e => e.localName === 'ext')   : null;
            const grpChOff = grpXfrm ? [...grpXfrm.children].find(e => e.localName === 'chOff') : null;
            const grpChExt = grpXfrm ? [...grpXfrm.children].find(e => e.localName === 'chExt') : null;

            const gx  = parseInt(grpOff?.getAttribute('x')  ?? '0', 10);
            const gy  = parseInt(grpOff?.getAttribute('y')  ?? '0', 10);
            const gcx = parseInt(grpExt?.getAttribute('cx') ?? '0', 10);
            const gcy = parseInt(grpExt?.getAttribute('cy') ?? '0', 10);
            const chx = parseInt(grpChOff?.getAttribute('x')  ?? '0', 10);
            const chy = parseInt(grpChOff?.getAttribute('y')  ?? '0', 10);
            const chcx = parseInt(grpChExt?.getAttribute('cx') ?? '1', 10) || 1;
            const chcy = parseInt(grpChExt?.getAttribute('cy') ?? '1', 10) || 1;

            // scaleX = gcx/chcx, scaleY = gcy/chcy (usually 1 for non-scaled groups)
            // child slide coords = gx + (childX - chx) * gcx/chcx
            for (const child of el.children) {
                if (['sp','pic','cxnSp','grpSp','graphicFrame'].includes(child.localName)) {
                    // Store group transform info in offsetXEmu/offsetYEmu params
                    // Simplified: pass absolute group origin + child offset correction
                    processEl(child, offsetXEmu + gx - chx, offsetYEmu + gy - chy);
                }
            }
            return;
        }

        // ── graphicFrame — contains tables, charts, SmartArt ──
        if (el.localName === 'graphicFrame') {
            // xfrm is a DIRECT child of graphicFrame (not inside spPr)
            const gfXfrm = [...el.children].find(e => e.localName === 'xfrm') ?? null;
            const gfOff  = gfXfrm ? [...gfXfrm.children].find(e => e.localName === 'off') : null;
            const gfExt  = gfXfrm ? [...gfXfrm.children].find(e => e.localName === 'ext') : null;
            const gfXEmu = parseInt(gfOff?.getAttribute('x')  ?? '0', 10) + offsetXEmu;
            const gfYEmu = parseInt(gfOff?.getAttribute('y')  ?? '0', 10) + offsetYEmu;
            const gfWEmu = parseInt(gfExt?.getAttribute('cx') ?? '0', 10);
            const gfHEmu = parseInt(gfExt?.getAttribute('cy') ?? '0', 10);
            if (gfWEmu <= 0 || gfHEmu <= 0) return;

            // Table inside graphicData
            const tbl = qn(el, 'tbl');
            if (tbl) {
                const tblGrid = qn(tbl, 'tblGrid');
                const colWidths: number[] = [];
                if (tblGrid) {
                    for (const gc of qna(tblGrid, 'gridCol')) {
                        colWidths.push(parseInt(gc.getAttribute('w') ?? '0', 10));
                    }
                }
                const trEls = [...tbl.querySelectorAll('*')].filter(e => e.localName === 'tr');
                const rowHeights: number[] = [];
                const cells: CellData[] = [];

                for (const tr of trEls) {
                    const trPr = [...tr.children].find(e => e.localName === 'trPr');
                    const h = trPr ? parseInt(trPr.getAttribute('h') ?? '0', 10) : 0;
                    rowHeights.push(h || Math.round(gfHEmu / Math.max(trEls.length, 1)));
                    for (const tc of [...tr.children].filter(e => e.localName === 'tc')) {
                        const tcPr = [...tc.children].find(e => e.localName === 'tcPr');
                        const cs = parseInt(tcPr?.getAttribute('gridSpan') ?? '1', 10);
                        let cellBg: string | null = null;
                        if (tcPr) { const sf = qn(tcPr, 'solidFill'); if (sf) cellBg = resolveColor(sf); }
                        const paras: ParaData[] = [];
                        const txBody = [...tc.children].find(e => e.localName === 'txBody');
                        if (txBody) {
                            for (const p of [...txBody.children].filter(e => e.localName === 'p')) {
                                paras.push(parsePara(p, 11));
                            }
                        }
                        cells.push({ paras, bgColor: cellBg, colspan: cs });
                    }
                }

                shapes.push({
                    xEmu: gfXEmu, yEmu: gfYEmu, wEmu: gfWEmu, hEmu: gfHEmu,
                    paras: [], bgColor: null, type: 'table', zIndex: zIndex++,
                    padding: { top: 0, right: 0, bottom: 0, left: 0 },
                    vAnchor: 'top', wrapNone: false,
                    table: { cells, colWidths, rowHeights, cols: colWidths.length, rows: trEls.length, borderColor: '#999999', borderWidth: 0.5 },
                });
            }
            return;
        }

        // Find xfrm — try spPr first (sp/pic), then direct child (graphicFrame fallback)
        const spPrEl = [...el.children].find(e => e.localName === 'spPr') ?? null;
        const xfrm   = (spPrEl ? [...spPrEl.children].find(e => e.localName === 'xfrm') : null)
                    ?? [...el.children].find(e => e.localName === 'xfrm') ?? null;
        const off    = xfrm ? [...xfrm.children].find(e => e.localName === 'off') : null;
        const ext    = xfrm ? [...xfrm.children].find(e => e.localName === 'ext') : null;

        const xEmu = parseInt(off?.getAttribute('x') ?? '0', 10) + offsetXEmu;
        const yEmu = parseInt(off?.getAttribute('y') ?? '0', 10) + offsetYEmu;
        const wEmu = parseInt(ext?.getAttribute('cx') ?? '0', 10);
        const hEmu = parseInt(ext?.getAttribute('cy') ?? '0', 10);
        if (wEmu <= 0 || hEmu <= 0) return;

        const flipH = xfrm?.getAttribute('flipH') === '1';
        const flipV = xfrm?.getAttribute('flipV') === '1';

        const shapeBg = parseShapeFill(spPrEl);

        // Resolve image from __RID
        const resolveRid = (rid: string | null) => {
            if (!rid) return undefined;
            const path = relsMap.get(rid);
            if (!path) return undefined;
            return images.get(path) ?? images.get(path.split('/').pop()!);
        };

        const bgResolved = shapeBg?.startsWith('__RID:')
            ? resolveRid(shapeBg.slice(6))
            : undefined;
        const finalBgColor = shapeBg?.startsWith('__RID:') ? null : shapeBg;

        // Outline
        let outlineColor: string | undefined, outlineWidthPt: number | undefined;
        if (spPrEl) {
            const ln = [...spPrEl.children].find(e => e.localName === 'ln');
            if (ln) {
                const w = parseInt(ln.getAttribute('w') ?? '0', 10);
                if (w > 0) {
                    outlineWidthPt = w / EMU_PER_PT;
                    const sf = qn(ln, 'solidFill');
                    if (sf) outlineColor = resolveColor(sf) ?? '#000000';
                    else outlineColor = '#000000';
                }
            }
        }

        // ── Table ──
        const tbl = qn(el, 'tbl');
        if (tbl) {
            const tblGrid = qn(tbl, 'tblGrid');
            const colWidths: number[] = [];
            if (tblGrid) {
                for (const gc of qna(tblGrid, 'gridCol')) {
                    colWidths.push(parseInt(gc.getAttribute('w') ?? '0', 10));
                }
            }
            const trEls = qna(tbl, 'tr');
            const rowHeights: number[] = [];
            const cells: CellData[] = [];

            for (const tr of trEls) {
                const trPr = [...tr.children].find(e => e.localName === 'trPr');
                const h = trPr ? parseInt(trPr.getAttribute('h') ?? '0', 10) : 0;
                rowHeights.push(h || Math.round(hEmu / Math.max(trEls.length, 1)));
                for (const tc of [...tr.children].filter(e => e.localName === 'tc')) {
                    const tcPr = [...tc.children].find(e => e.localName === 'tcPr');
                    const cs = parseInt(tcPr?.getAttribute('gridSpan') ?? '1', 10);
                    let cellBg: string | null = null;
                    if (tcPr) {
                        const sf = qn(tcPr, 'solidFill');
                        if (sf) cellBg = resolveColor(sf);
                    }
                    const paras: ParaData[] = [];
                    const txBody = [...tc.children].find(e => e.localName === 'txBody');
                    if (txBody) {
                        for (const p of [...txBody.children].filter(e => e.localName === 'p')) {
                            paras.push(parsePara(p, 11));
                        }
                    }
                    cells.push({ paras, bgColor: cellBg, colspan: cs });
                }
            }

            shapes.push({
                xEmu, yEmu, wEmu, hEmu,
                paras: [],
                bgColor: finalBgColor,
                type: 'table',
                zIndex: zIndex++,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                vAnchor: 'top',
                wrapNone: false,
                outlineColor, outlineWidthPt,
                table: { cells, colWidths, rowHeights, cols: colWidths.length, rows: trEls.length, borderColor: '#999999', borderWidth: 0.5 },
            });
            return;
        }

        // ── Connector / Line ──
        if (el.localName === 'cxnSp') {
            let color = '#000000', widthPt = 1;
            if (spPrEl) {
                const ln = [...spPrEl.children].find(e => e.localName === 'ln');
                if (ln) {
                    widthPt = parseInt(ln.getAttribute('w') ?? '12700', 10) / EMU_PER_PT;
                    const sf = qn(ln, 'solidFill');
                    if (sf) color = resolveColor(sf) ?? color;
                }
            }
            shapes.push({
                xEmu, yEmu, wEmu, hEmu,
                paras: [], bgColor: null, type: 'line',
                zIndex: zIndex++,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                vAnchor: 'top', wrapNone: false,
                lineData: { flipH, flipV, color, widthPt },
            });
            return;
        }

        // ── Image (pic) ──
        let imageData: string | undefined;
        if (el.localName === 'pic') {
            const blipFill = qn(el, 'blipFill');
            if (blipFill) {
                const blip = qn(blipFill, 'blip');
                const id = blip?.getAttributeNS(NS_R, 'embed') ?? blip?.getAttribute('r:embed');
                imageData = resolveRid(id ?? null);
            }
        }
        if (!imageData && spPrEl) {
            const blipFill = qn(spPrEl, 'blipFill');
            if (blipFill) {
                const blip = qn(blipFill, 'blip');
                const id = blip?.getAttributeNS(NS_R, 'embed') ?? blip?.getAttribute('r:embed');
                imageData = resolveRid(id ?? null);
            }
        }
        // Shape background image (from __RID)
        if (!imageData && bgResolved) imageData = bgResolved;

        // ── Text body ──
        const txBody = qn(el, 'txBody');
        const paras: ParaData[] = [];
        const defaultInsetEmu = 91440;
        let padding = { top: defaultInsetEmu, right: defaultInsetEmu, bottom: defaultInsetEmu, left: defaultInsetEmu };
        let vAnchor: 'top' | 'mid' | 'bottom' = 'top';
        let wrapNone = false;

        if (txBody) {
            const bodyPr = [...txBody.children].find(e => e.localName === 'bodyPr');
            if (bodyPr) {
                const toEmu = (v: string | null) => v !== null && v !== '' ? parseInt(v, 10) : defaultInsetEmu;
                padding = {
                    top:    toEmu(bodyPr.getAttribute('tIns')),
                    right:  toEmu(bodyPr.getAttribute('rIns')),
                    bottom: toEmu(bodyPr.getAttribute('bIns')),
                    left:   toEmu(bodyPr.getAttribute('lIns')),
                };
                const anch = bodyPr.getAttribute('anchor') ?? 't';
                vAnchor = anch === 'b' ? 'bottom' : anch === 'ctr' ? 'mid' : 'top';
                wrapNone = bodyPr.getAttribute('wrap') === 'none';
            }
            for (const p of [...txBody.children].filter(e => e.localName === 'p')) {
                paras.push(parsePara(p, 18));
            }
        }

        shapes.push({
            xEmu, yEmu, wEmu, hEmu,
            paras,
            bgColor: finalBgColor,
            type: txBody ? 'text' : (imageData ? 'image' : 'rect'),
            imageData,
            zIndex: zIndex++,
            padding, vAnchor, wrapNone,
            outlineColor, outlineWidthPt,
        });
    }

    // Process all direct children of spTree including graphicFrame (tables/charts)
    for (const child of spTree.children) {
        if (['sp','pic','cxnSp','grpSp','graphicFrame'].includes(child.localName)) {
            processEl(child);
        }
    }

    shapes.sort((a, b) => a.zIndex - b.zIndex);
    return { bgColor, shapes, slideWEmu, slideHEmu, bgImageData };
}

// ── Canvas text helpers ───────────────────────────────────────────────────────

function buildCanvasFont(run: RunData, dpi = RENDER_DPI): string {
    const style = [run.italic ? 'italic' : '', run.bold ? 'bold' : ''].filter(Boolean).join(' ');
    // px size on canvas — convert pt→px at render DPI
    const pxSize = ptToPx(run.fontSize, dpi);
    // font-family fallback chain
    const family = run.fontFamily
        ? `"${run.fontFamily}", Calibri, "Segoe UI", Arial, sans-serif`
        : 'Calibri, "Segoe UI", Arial, sans-serif';
    return `${style} ${pxSize}px ${family}`.trim();
}

/**
 * Wrap runs into visual lines.
 * Returns array of lines; each line is an array of {text, run} segments.
 */
function wrapParaToLines(
    para: ParaData,
    ctx: CanvasRenderingContext2D,
    maxWidthPx: number,
    dpi = RENDER_DPI,
): { text: string; run: RunData }[][] {
    const lines: { text: string; run: RunData }[][] = [];
    let curLine: { text: string; run: RunData }[] = [];
    let curLineW = 0;

    for (const run of para.runs) {
        if (run.text === '\n') {
            lines.push(curLine);
            curLine = [];
            curLineW = 0;
            continue;
        }

        ctx.font = buildCanvasFont(run, dpi);

        // Split into tokens preserving spaces
        const tokens = run.text.split(/(?<=\s)|(?=\s)/);
        for (const token of tokens) {
            if (!token) continue;
            const tokenW = ctx.measureText(token).width;

            if (curLineW + tokenW > maxWidthPx && curLineW > 0 && token.trim() !== '') {
                lines.push(curLine);
                curLine = [];
                curLineW = 0;
            }

            curLine.push({ text: token, run });
            curLineW += tokenW;
        }
    }

    if (curLine.length > 0 || lines.length === 0) lines.push(curLine);
    return lines;
}

// ── Canvas slide renderer ─────────────────────────────────────────────────────

async function renderSlideToCanvas(
    data: SlideRenderData,
    dpi = RENDER_DPI,
): Promise<HTMLCanvasElement> {
    const { bgColor, shapes, slideWEmu, slideHEmu, bgImageData } = data;
    const W = Math.round(emuToPx(slideWEmu, dpi));
    const H = Math.round(emuToPx(slideHEmu, dpi));

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // ── Background ──────────────────────────────────────────────────────────────
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    if (bgImageData) {
        try {
            const img = await loadImg(bgImageData);
            ctx.drawImage(img, 0, 0, W, H);
        } catch { /* skip */ }
    }

    // ── Shapes ──────────────────────────────────────────────────────────────────
    for (const s of shapes) {
        const sx = emuToPx(s.xEmu, dpi);
        const sy = emuToPx(s.yEmu, dpi);
        const sw = emuToPx(s.wEmu, dpi);
        const sh = emuToPx(s.hEmu, dpi);

        // Background fill
        if (s.bgColor && s.bgColor !== 'transparent') {
            ctx.fillStyle = s.bgColor;
            ctx.fillRect(sx, sy, sw, sh);
        }

        // Outline
        if (s.outlineColor && s.outlineWidthPt && s.outlineWidthPt > 0) {
            ctx.strokeStyle = s.outlineColor;
            ctx.lineWidth = ptToPx(s.outlineWidthPt, dpi);
            ctx.strokeRect(sx, sy, sw, sh);
        }

        // ── Table ──────────────────────────────────────────────────────────────
        if (s.type === 'table' && s.table) {
            const tbl = s.table;
            const totalGridW = tbl.colWidths.reduce((a, b) => a + b, 0) || 1;
            const scaleX = sw / emuToPx(totalGridW, dpi);
            let rowY = sy;

            let cellIdx = 0;
            for (let ri = 0; ri < tbl.rows && cellIdx < tbl.cells.length; ri++) {
                const rowH = emuToPx(tbl.rowHeights[ri] ?? 0, dpi) || sh / tbl.rows;
                let cellX = sx;

                for (let ci = 0; ci < tbl.cols && cellIdx < tbl.cells.length; ci++) {
                    const cell = tbl.cells[cellIdx++];
                    const cellW = emuToPx(tbl.colWidths[ci] ?? 0, dpi) || sw / tbl.cols;

                    // Cell background
                    if (cell.bgColor) {
                        ctx.fillStyle = cell.bgColor;
                        ctx.fillRect(cellX, rowY, cellW, rowH);
                    }

                    // Cell border
                    ctx.strokeStyle = tbl.borderColor;
                    ctx.lineWidth   = ptToPx(tbl.borderWidth, dpi);
                    ctx.strokeRect(cellX, rowY, cellW, rowH);

                    // Cell text
                    const cellPadPx = ptToPx(4, dpi);
                    const cellTextW = cellW - cellPadPx * 2;
                    let textY = rowY + cellPadPx;

                    for (const para of cell.paras) {
                        if (!para.runs.length) continue;
                        const fs = para.runs[0].fontSize;
                        const lh = ptToPx(fs * 1.2, dpi);
                        const lines = wrapParaToLines(para, ctx, cellTextW, dpi);
                        for (const line of lines) {
                            if (textY + lh > rowY + rowH) break;
                            let lx = cellX + cellPadPx;
                            for (const seg of line) {
                                if (!seg.text) continue;
                                ctx.font      = buildCanvasFont(seg.run, dpi);
                                ctx.fillStyle = seg.run.color;
                                ctx.fillText(seg.text, lx, textY + lh * 0.8);
                                lx += ctx.measureText(seg.text).width;
                            }
                            textY += lh;
                        }
                    }
                    cellX += cellW;
                }
                rowY += rowH;
            }
            continue;
        }

        // ── Line / connector ───────────────────────────────────────────────────
        if (s.type === 'line' && s.lineData) {
            const ld = s.lineData;
            ctx.strokeStyle = ld.color;
            ctx.lineWidth   = ptToPx(ld.widthPt, dpi);
            ctx.beginPath();
            if (ld.flipH && ld.flipV) {
                ctx.moveTo(sx + sw, sy + sh); ctx.lineTo(sx, sy);
            } else if (ld.flipH) {
                ctx.moveTo(sx + sw, sy); ctx.lineTo(sx, sy + sh);
            } else if (ld.flipV) {
                ctx.moveTo(sx, sy + sh); ctx.lineTo(sx + sw, sy);
            } else {
                ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy + sh);
            }
            ctx.stroke();
            continue;
        }

        // ── Image ──────────────────────────────────────────────────────────────
        if (s.imageData) {
            try {
                const img = await loadImg(s.imageData);
                const imgAspect   = img.naturalWidth / img.naturalHeight;
                const shapeAspect = sw / sh;
                let drawW = sw, drawH = sh, drawX = sx, drawY = sy;
                if (imgAspect > shapeAspect) {
                    drawH = sw / imgAspect;
                    drawY = sy + (sh - drawH) / 2;
                } else {
                    drawW = sh * imgAspect;
                    drawX = sx + (sw - drawW) / 2;
                }
                ctx.drawImage(img, drawX, drawY, drawW, drawH);
            } catch { /* skip bad images */ }
            continue;
        }

        // ── Text shape ─────────────────────────────────────────────────────────
        if (!s.paras.length) continue;

        const plPx = emuToPx(s.padding.left,   dpi);
        const prPx = emuToPx(s.padding.right,  dpi);
        const ptPx = emuToPx(s.padding.top,    dpi);
        const pbPx = emuToPx(s.padding.bottom, dpi);

        // Clip to shape bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();

        // ── Measure all paragraphs ──────────────────────────────────────────────
        interface MeasuredPara {
            para: ParaData;
            lines: { text: string; run: RunData }[][];
            lhPx: number;
            spcBPx: number;
            spcAPx: number;
            marLPx: number;
            indentPx: number;
            marRPx: number;
        }

        const measured: MeasuredPara[] = [];
        for (const para of s.paras) {
            const maxFs = para.runs
                .filter(r => r.text !== '\n')
                .reduce((m, r) => Math.max(m, r.fontSize), para.defaultFontSize) || 12;

            // Resolve spc (negative = percent-based)
            let spcBPx = para.spcBefore < 0
                ? ptToPx((-para.spcBefore / 100) * maxFs, dpi)
                : ptToPx(para.spcBefore, dpi);
            let spcAPx = para.spcAfter < 0
                ? ptToPx((-para.spcAfter / 100) * maxFs, dpi)
                : ptToPx(para.spcAfter, dpi);
            spcBPx = Math.max(0, spcBPx);
            spcAPx = Math.max(0, spcAPx);

            const lhPx = para.lineSpacingAbs > 0
                ? ptToPx(para.lineSpacingAbs, dpi)
                : ptToPx(maxFs, dpi) * Math.max(0.8, para.lineSpacing);

            const marLPx   = emuToPx(para.marL,   dpi);
            const marRPx   = emuToPx(para.marR,    dpi);
            const indentPx = emuToPx(para.indent,  dpi);

            const availW = Math.max(1, sw - plPx - prPx - marLPx - marRPx);
            const lines = s.wrapNone
                ? [para.runs.map(r => ({ text: r.text, run: r }))]
                : wrapParaToLines(para, ctx, availW, dpi);

            measured.push({ para, lines, lhPx, spcBPx, spcAPx, marLPx, indentPx, marRPx });
        }

        // ── Compute total block height ──────────────────────────────────────────
        let totalH = 0;
        for (const mp of measured) {
            totalH += mp.spcBPx + mp.lines.length * mp.lhPx + mp.spcAPx;
        }

        // ── Starting Y ─────────────────────────────────────────────────────────
        let curY: number;
        const boxH = sh - ptPx - pbPx;
        if (s.vAnchor === 'bottom') {
            curY = sy + sh - pbPx - totalH;
        } else if (s.vAnchor === 'mid') {
            curY = sy + ptPx + (boxH - totalH) / 2;
        } else {
            curY = sy + ptPx;
        }

        // ── Render paragraphs ───────────────────────────────────────────────────
        for (const mp of measured) {
            curY += mp.spcBPx;
            const { para, lines, lhPx } = mp;

            for (let li = 0; li < lines.length; li++) {
                const lineSegs = lines[li];

                // Clip check
                if (curY + lhPx > sy + sh - pbPx + 2) break;

                // Effective left
                const bodyLeft = sx + plPx + mp.marLPx;
                const lineLeft = li === 0
                    ? bodyLeft + Math.max(0, mp.indentPx)
                    : bodyLeft;
                const lineRight = sx + sw - prPx - mp.marRPx;
                const lineWidthAvail = lineRight - lineLeft;

                // Compute total line pixel width for alignment
                let totalLineW = 0;
                const segWs: number[] = [];
                for (const seg of lineSegs) {
                    if (!seg.text || seg.text === '\n') { segWs.push(0); continue; }
                    ctx.font = buildCanvasFont(seg.run, dpi);
                    const w = ctx.measureText(seg.text).width;
                    segWs.push(w);
                    totalLineW += w;
                }

                // Base X
                let baseX: number;
                if (para.align === 'center') {
                    baseX = lineLeft + (lineWidthAvail - totalLineW) / 2;
                } else if (para.align === 'right') {
                    baseX = lineRight - totalLineW;
                } else {
                    baseX = lineLeft;
                }

                // Baseline: ~80% from top of line
                const baselineY = curY + lhPx * 0.8;

                // Bullet on first line
                if (li === 0 && para.bulletChar) {
                    const bFs = para.bulletSzPt ?? para.defaultFontSize;
                    const bRun: RunData = {
                        text: para.bulletChar,
                        bold: false, italic: false, underline: false, strike: false,
                        fontSize: bFs,
                        color: para.bulletColor ?? lineSegs[0]?.run.color ?? '#000000',
                        fontFamily: para.bulletFont ?? '',
                    };
                    ctx.font = buildCanvasFont(bRun, dpi);
                    ctx.fillStyle = bRun.color;
                    const bulletX = sx + plPx + mp.marLPx + mp.indentPx;
                    ctx.fillText(para.bulletChar, bulletX, baselineY);
                }

                // Draw each segment
                let drawX = baseX;
                for (let si2 = 0; si2 < lineSegs.length; si2++) {
                    const seg = lineSegs[si2];
                    if (!seg.text || seg.text === '\n') continue;

                    ctx.font = buildCanvasFont(seg.run, dpi);
                    ctx.fillStyle = seg.run.color;
                    ctx.fillText(seg.text, drawX, baselineY);

                    const segW = segWs[si2];

                    if (seg.run.underline) {
                        ctx.strokeStyle = seg.run.color;
                        ctx.lineWidth = Math.max(0.5, ptToPx(seg.run.fontSize * 0.05, dpi));
                        const uy = baselineY + ptToPx(seg.run.fontSize * 0.1, dpi);
                        ctx.beginPath();
                        ctx.moveTo(drawX, uy);
                        ctx.lineTo(drawX + segW, uy);
                        ctx.stroke();
                    }

                    if (seg.run.strike) {
                        ctx.strokeStyle = seg.run.color;
                        ctx.lineWidth = Math.max(0.5, ptToPx(seg.run.fontSize * 0.05, dpi));
                        const sy2 = baselineY - ptToPx(seg.run.fontSize * 0.3, dpi);
                        ctx.beginPath();
                        ctx.moveTo(drawX, sy2);
                        ctx.lineTo(drawX + segW, sy2);
                        ctx.stroke();
                    }

                    drawX += segW;
                }

                curY += lhPx;
            }

            curY += mp.spcAPx;
        }

        ctx.restore();
    }

    return canvas;
}

// ── Slide count/metadata pre-scan ─────────────────────────────────────────────

export async function getPresentationSlides(file: File): Promise<SlideInfo[]> {
    validateFile(file);
    if (file.name.toLowerCase().endsWith('.ppt'))
        throw new Error(`"${file.name}" is a legacy .ppt file. Save it as .pptx in PowerPoint and re-upload.`);

    const JSZip = (await import('jszip')).default;
    const zip   = await JSZip.loadAsync(await file.arrayBuffer());

    const slideKeys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

    const slides: SlideInfo[] = [];
    for (let i = 0; i < slideKeys.length; i++) {
        const xml = await zip.files[slideKeys[i]].async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const sps = [...doc.querySelectorAll('*')].filter(e => e.localName === 'sp');

        let title = '';
        for (const sp of sps) {
            const ph = [...sp.querySelectorAll('*')].find(e => e.localName === 'ph');
            const ty = ph?.getAttribute('type') ?? '';
            if (!ty || ty === 'title' || ty === 'ctrTitle') {
                title = [...sp.querySelectorAll('*')].filter(e => e.localName === 't')
                    .map(t => t.textContent ?? '').join('').trim();
                if (title) break;
            }
        }
        slides.push({ index: i, title: title || `Slide ${i + 1}`, shapeCount: sps.length });
    }
    return slides;
}

// ── Core conversion V6 ────────────────────────────────────────────────────────

export async function convertPptToPDF(
    file: File,
    options: PptConversionOptions = {},
): Promise<PptConversionResult> {
    const { slideIndexes, outputPrefix, onProgress } = options;

    validateFile(file);
    if (file.name.toLowerCase().endsWith('.ppt'))
        throw new Error(`"${file.name}" is a legacy binary .ppt file. Save as .pptx first.`);
    onProgress?.(5);

    // 1. Unzip
    let zip: any;
    try {
        const JSZip = (await import('jszip')).default;
        zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch (err: any) {
        throw new Error(`Cannot open "${file.name}": ${err?.message ?? 'corrupted'}`);
    }
    onProgress?.(12);

    // 2. Read slide dimensions
    let slideWEmu = SLIDE_W_EMU;
    let slideHEmu = SLIDE_H_EMU;
    try {
        const presXml = await zip.files['ppt/presentation.xml']?.async('string');
        if (presXml) {
            const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
            const sldSz   = [...presDoc.querySelectorAll('*')].find(e => e.localName === 'sldSz');
            if (sldSz) {
                slideWEmu = parseInt(sldSz.getAttribute('cx') ?? String(SLIDE_W_EMU), 10);
                slideHEmu = parseInt(sldSz.getAttribute('cy') ?? String(SLIDE_H_EMU), 10);
            }
        }
    } catch { /* use defaults */ }

    // 3. Extract images
    onProgress?.(15);
    const images = await extractImages(zip);

    // 4. Enumerate slides
    const slideKeys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

    if (slideKeys.length === 0)
        throw new Error(`"${file.name}" contains no slides or is not a valid .pptx file.`);

    const totalSlides = slideKeys.length;
    const selected = slideIndexes ?? slideKeys.map((_, i) => i);
    const validIdx = selected.filter(i => i >= 0 && i < totalSlides);
    if (validIdx.length === 0) throw new Error('No valid slide indexes selected.');
    onProgress?.(20);

    // 5. Build PDF — each slide → canvas → JPEG → pdf-lib page
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();

    // PDF page size matches slide aspect ratio (in points)
    const pdfW = slideWEmu / EMU_PER_PT;
    const pdfH = slideHEmu / EMU_PER_PT;

    for (let si = 0; si < validIdx.length; si++) {
        const idx    = validIdx[si];
        const xml    = await zip.files[slideKeys[idx]].async('string');
        const rels   = await parseSlideRels(zip, slideKeys[idx]);
        const data   = parseSlideXml(xml, slideWEmu, slideHEmu, rels, images);

        // Render to canvas
        const canvas = await renderSlideToCanvas(data, RENDER_DPI);

        // Export as JPEG (quality 0.94 — very high quality, reasonable file size)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
        const b64     = dataUrl.split(',')[1];

        // Embed in PDF
        const jpgImg  = await pdfDoc.embedJpg(b64);
        const page    = pdfDoc.addPage([pdfW, pdfH]);
        page.drawImage(jpgImg, { x: 0, y: 0, width: pdfW, height: pdfH });

        onProgress?.(20 + Math.round(((si + 1) / validIdx.length) * 70));
    }

    onProgress?.(95);
    const pdfBytes = await pdfDoc.save();
    onProgress?.(100);

    const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.(pptx?|PPTX?)$/i, ''));
    return {
        bytes:           new Uint8Array(pdfBytes),
        outputName:      `${base}.pdf`,
        totalSlides,
        convertedSlides: validIdx.length,
        pageCount:       validIdx.length,
        originalSize:    file.size,
        outputSize:      pdfBytes.byteLength,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchConvertPptToPDF(
    files: File[],
    options: Omit<PptConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: PptConversionResult, index: number) => void;
        onFileError?:    (fileName: string, error: string, index: number) => void;
    } = {},
): Promise<BatchPptResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: PptConversionResult[] = [];
    const failed:    { fileName: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertPptToPDF(file, {
                ...convOpts,
                onProgress: p => onFileProgress?.(file.name, p),
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
