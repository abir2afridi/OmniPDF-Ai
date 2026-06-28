/**
 * pptService.ts — PowerPoint → PDF Conversion Service V4 (direct pdf-lib)
 *
 * Pipeline V4 (no html2canvas — direct vector PDF rendering):
 *   .pptx ──[JSZip]──▶ raw OOXML + images
 *          ──[OOXML parser]──▶ per-slide render data (shapes, text, bg, images)
 *          ──[pdf-lib direct render]──▶ vector PDF with selectable text
 *
 * V4 improvements:
 *   - No html2canvas (eliminates browser rendering bottlenecks)
 *   - No jsPDF (direct pdf-lib vector output)
 *   - Selectable/searchable text in PDF
 *   - Vector graphics (not bitmap images of slides)
 *   - Much smaller file size, faster conversion
 *   - Precise EMU→PDF coordinate mapping
 *   - Font mapping to standard PDF fonts (Helvetica, Times, Courier)
 *   - Text wrapping, paragraph spacing, vertical anchor support
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

const SLIDE_W_EMU = 9144000;
const SLIDE_H_EMU = 5143500;

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

function ooColor(val: string | null | undefined, def = '#000000'): string {
    if (!val) return def;
    const s = val.replace(/^#/, '').trim();
    if (s.length === 6) return `#${s}`;
    if (s.length === 3) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    return def;
}

// ── OOXML namespace map ────────────────────────────────────────────────────────

const NS = {
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
};

// ── Parse relationships to map rId → image path ──────────────────────────────

async function parseSlideRels(zip: any, slidePath: string): Promise<Map<string, string>> {
    const relsMap = new Map<string, string>();
    // Try both possible rels locations
    const candidates = [
        slidePath.replace('ppt/slides/', 'ppt/slides/_rels/').replace('.xml', '.xml.rels'),
        slidePath.replace('ppt/slides/', 'ppt/_rels/').replace('.xml', '.xml.rels'),
    ];
    let relsXml = '';
    for (const p of candidates) {
        if (zip.files[p]) { relsXml = await zip.files[p].async('string'); break; }
    }
    if (!relsXml) return relsMap;

    try {
        const doc = new DOMParser().parseFromString(relsXml, 'application/xml');
        const rels = [...doc.querySelectorAll('*')].filter(e => e.localName === 'Relationship');
        for (const rel of rels) {
            const type = rel.getAttribute('Type') ?? '';
            const target = rel.getAttribute('Target') ?? '';
            const id = rel.getAttribute('Id') ?? '';
            if (!type.includes('image') || !target || !id) continue;

            // Resolve target relative to the rels directory
            // rels dir is either ppt/slides/_rels/ or ppt/_rels/
            let resolvedPath = '';
            if (target.startsWith('../../')) {
                // ../../media/image1.png from ppt/slides/_rels/ → ppt/media/image1.png
                resolvedPath = 'ppt/' + target.replace('../../', '');
            } else if (target.startsWith('../')) {
                // ../media/image1.png from ppt/_rels/ → ppt/media/image1.png
                // ../media/image1.png from ppt/slides/_rels/ → ppt/slides/media/image1.png (wrong, fix)
                // Check which rels dir we're in
                const isSlidesRels = candidates[0] && zip.files[candidates[0]];
                if (isSlidesRels) {
                    // ppt/slides/_rels/ + ../media/image1.png → go up to ppt/slides/, then need one more ..
                    // Actually ../media from ppt/slides/_rels/ = ppt/slides/media (wrong)
                    // We need to go to ppt/media, so use ../../
                    resolvedPath = 'ppt/' + target.replace('../', '');
                } else {
                    resolvedPath = 'ppt/' + target.replace('../', '');
                }
            } else {
                resolvedPath = 'ppt/slides/' + target;
            }
            relsMap.set(id, resolvedPath);
        }
    } catch { /* skip */ }
    return relsMap;
}

// ── Extract images from zip as base64 ────────────────────────────────────────

async function extractImages(zip: any): Promise<Map<string, string>> {
    const images = new Map<string, string>();
    const mediaKeys = Object.keys(zip.files).filter(k =>
        k.startsWith('ppt/media/') || k.startsWith('ppt/charts/') || k.match(/\.(png|jpe?g|gif|bmp|svg|tiff?)$/i)
    );
    for (const key of mediaKeys) {
        try {
            const blob = await zip.files[key].async('base64');
            const ext = key.split('.').pop()?.toLowerCase() ?? 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'gif' ? 'image/gif'
                    : ext === 'svg' ? 'image/svg+xml'
                        : ext === 'bmp' ? 'image/bmp'
                            : ext === 'tiff' || ext === 'tif' ? 'image/tiff'
                                : 'image/png';
            images.set(key, `data:${mime};base64,${blob}`);
            // Also store by just filename for fallback lookup
            const fileName = key.split('/').pop()!;
            if (!images.has(fileName)) images.set(fileName, `data:${mime};base64,${blob}`);
        } catch { /* skip */ }
    }
    return images;
}

// ── Parse shape fills including gradient and pattern fills ────────────────────

function parseShapeFill(spPr: Element | null): string | null {
    if (!spPr) return null;

    // Solid fill
    const solidFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'solidFill');
    if (solidFill) {
        const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
        if (srgb) return ooColor(srgb.getAttribute('val'));
        const schemeClr = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'schemeClr');
        if (schemeClr) {
            // Map common scheme colors
            const name = schemeClr.getAttribute('val') ?? '';
            const schemeMap: Record<string, string> = {
                'accent1': '#4472C4', 'accent2': '#ED7D31', 'accent3': '#A5A5A5',
                'accent4': '#FFC000', 'accent5': '#5B9BD5', 'accent6': '#70AD47',
                'dk1': '#333333', 'lt1': '#FFFFFF', 'dk2': '#555555', 'lt2': '#F5F5F5',
                'bg1': '#FFFFFF', 'bg2': '#F5F5F5', 'tx1': '#333333', 'tx2': '#555555',
            };
            return schemeMap[name] ?? null;
        }
    }

    // No fill
    const noFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'noFill');
    if (noFill) return 'transparent';

    // Gradient fill (simplified — use first color)
    const gradFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'gradFill');
    if (gradFill) {
        const gsLst = [...gradFill.querySelectorAll('*')].find(e => e.localName === 'gsLst');
        if (gsLst) {
            const gs = [...gsLst.querySelectorAll('*')].find(e => e.localName === 'gs');
            if (gs) {
                const srgb = [...gs.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
                if (srgb) return ooColor(srgb.getAttribute('val'));
            }
        }
    }

    // Picture fill (extract image)
    const picFill = [...spPr.querySelectorAll('*')].find(e => e.localName === 'blipFill');
    if (picFill) {
        const blip = [...picFill.querySelectorAll('*')].find(e => e.localName === 'blip');
        const embedId = blip?.getAttributeNS(NS.r, 'embed') ?? blip?.getAttribute('r:embed');
        if (embedId) return `__RID:${embedId}`;
    }

    return null;
}

// ── Parse a single slide XML ─────────────────────────────────────────────────

interface ShapeData {
    x: number; y: number; w: number; h: number;
    xEmu: number; yEmu: number; wEmu: number; hEmu: number;
    texts: { text: string; bold: boolean; italic: boolean; size: number; color: string; align: string; spcBefore: number; spcAfter: number; lineSpacing: number; lineSpacingAbs: number; fontFamily?: string; paraMarL: number; paraMarR: number; paraIndent: number }[];
    bgColor: string | null;
    type: 'text' | 'rect' | 'image' | 'unknown';
    imageData?: string;
    zIndex: number;
    padding: { top: number; right: number; bottom: number; left: number }; // bodyPr insets in EMU
    vAnchor: string;
    wrapNone: boolean;
}

interface SlideRenderData {
    bgColor: string;
    shapes: ShapeData[];
    slideWEmu: number;
    slideHEmu: number;
}

function parseSlideXml(
    xml: string,
    slideWEmu: number,
    slideHEmu: number,
    relsMap: Map<string, string>,
    images: Map<string, string>,
): SlideRenderData {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Background color
    let bgColor = '#FFFFFF';
    const bgPr = [...doc.querySelectorAll('*')].find(e => e.localName === 'bgPr' || e.localName === 'bg');
    if (bgPr) {
        const solidFill = [...bgPr.querySelectorAll('*')].find(e => e.localName === 'solidFill');
        if (solidFill) {
            const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
            if (srgb) bgColor = ooColor(srgb.getAttribute('val'));
        }
    }

    const shapes: ShapeData[] = [];
    let zIndex = 0;

    // Find the main spTree — only process DIRECT children (sp, pic, grpSp)
    // This avoids the critical bug where nested sp inside grpSp were processed twice
    const spTree = [...doc.querySelectorAll('*')].find(e => e.localName === 'spTree');
    if (!spTree) return { bgColor, shapes, slideWEmu, slideHEmu };

    // Direct children only — skip spTree-level nvGrpSpPr/grpSpPr
    const topElements = [...spTree.children].filter(e =>
        e.localName === 'sp' || e.localName === 'pic' || e.localName === 'grpSp'
    );

    function processShape(el: Element, parentXEmu: number, parentYEmu: number) {
        const xfrm = [...el.querySelectorAll('*')].find(e => e.localName === 'xfrm');
        const off = xfrm ? [...xfrm.querySelectorAll('*')].find(e => e.localName === 'off') : null;
        const ext = xfrm ? [...xfrm.querySelectorAll('*')].find(e => e.localName === 'ext') : null;

        const xEmu = parseInt(off?.getAttribute('x') ?? '0', 10) + parentXEmu;
        const yEmu = parseInt(off?.getAttribute('y') ?? '0', 10) + parentYEmu;
        const wEmu = parseInt(ext?.getAttribute('cx') ?? '0', 10);
        const hEmu = parseInt(ext?.getAttribute('cy') ?? '0', 10);

        if (wEmu <= 0 || hEmu <= 0) return;

        // Group shape — process children recursively
        if (el.localName === 'grpSp') {
            const grpSpTree = [...el.querySelectorAll('*')].find(e => e.localName === 'spTree');
            if (grpSpTree) {
                const children = [...grpSpTree.children].filter(e =>
                    e.localName === 'sp' || e.localName === 'pic'
                );
                for (const child of children) {
                    processShape(child, xEmu, yEmu);
                }
            }
            return;
        }

        const xPct = (xEmu / slideWEmu) * 100;
        const yPct = (yEmu / slideHEmu) * 100;
        const wPct = (wEmu / slideWEmu) * 100;
        const hPct = (hEmu / slideHEmu) * 100;

        const spPr = [...el.querySelectorAll('*')].find(e => e.localName === 'spPr');
        const shapeBg = parseShapeFill(spPr);

        // Image — check pic blipFill and spPr blipFill
        let imageData: string | undefined;
        const tryExtractImage = (container: Element) => {
            if (imageData) return;
            const blipFill = [...container.querySelectorAll('*')].find(e => e.localName === 'blipFill');
            if (!blipFill) return;
            const blip = [...blipFill.querySelectorAll('*')].find(e => e.localName === 'blip');
            const embedId = blip?.getAttributeNS(NS.r, 'embed') ?? blip?.getAttribute('r:embed');
            if (embedId && relsMap.has(embedId)) {
                const imgPath = relsMap.get(embedId)!;
                imageData = images.get(imgPath) ?? images.get(imgPath.split('/').pop()!);
            }
        };
        if (el.localName === 'pic') {
            tryExtractImage(el);
        }
        if (!imageData && spPr) tryExtractImage(spPr);

        // Text body
        const txBody = [...el.querySelectorAll('*')].find(e => e.localName === 'txBody');
        const texts: ShapeData['texts'] = [];

        // Default bodyPr insets: 91440 EMU ≈ 0.1 inch (OOXML default)
        const defaultInsetEmu = 91440;
        let bodyPadding = { top: defaultInsetEmu, right: defaultInsetEmu, bottom: defaultInsetEmu, left: defaultInsetEmu };
        let vAnchor = 't';
        let wrapNone = false;

        if (txBody) {
            const bodyPr = [...txBody.querySelectorAll('*')].find(e => e.localName === 'bodyPr');
            if (bodyPr) {
                const toEmu = (emu: string | null) => emu ? Math.round(parseInt(emu, 10)) : defaultInsetEmu;
                bodyPadding = {
                    top: toEmu(bodyPr.getAttribute('tIns')),
                    right: toEmu(bodyPr.getAttribute('rIns')),
                    bottom: toEmu(bodyPr.getAttribute('bIns')),
                    left: toEmu(bodyPr.getAttribute('lIns')),
                };
                vAnchor = bodyPr.getAttribute('anchor') ?? 't';
                wrapNone = bodyPr.getAttribute('wrap') === 'none';
            }

            const paragraphs = [...txBody.querySelectorAll('*')].filter(e => e.localName === 'p');
            for (const para of paragraphs) {
                const pPr = [...para.querySelectorAll('*')].find(e => e.localName === 'pPr');
                const algn = pPr?.getAttribute('algn') ?? 'l';
                const alignMap: Record<string, string> = { l: 'left', r: 'right', ctr: 'center', just: 'justify', dist: 'justify' };
                const align = alignMap[algn] ?? 'left';

                const spcBef = pPr ? [...pPr.querySelectorAll('*')].find(e => e.localName === 'spcBef') : null;
                const spcAft = pPr ? [...pPr.querySelectorAll('*')].find(e => e.localName === 'spcAft') : null;
                let spcBefore = 0;
                let spcAfter = 8; // default ~8pt after for body text
                for (const el of [spcBef, spcAft]) {
                    if (!el) continue;
                    const spcPts = [...el.querySelectorAll('*')].find(e => e.localName === 'spcPts');
                    const spcPct = [...el.querySelectorAll('*')].find(e => e.localName === 'spcPct');
                    if (spcPts) {
                        const pts = parseInt(spcPts.getAttribute('val') ?? '0', 10) / 100;
                        if (el === spcBef) spcBefore = pts;
                        else spcAfter = pts;
                    } else if (spcPct) {
                        const pct = parseInt(spcPct.getAttribute('val') ?? '0', 10) / 1000;
                        if (el === spcBef) spcBefore = pct;
                        else spcAfter = pct;
                    }
                }

                let lineSpacing = 1.0;
                let lineSpacingAbs = 0;
                if (pPr) {
                    const lnSpc = [...pPr.querySelectorAll('*')].find(e => e.localName === 'lnSpc');
                    if (lnSpc) {
                        const spcPct = [...lnSpc.querySelectorAll('*')].find(e => e.localName === 'spcPct');
                        const spcPts = [...lnSpc.querySelectorAll('*')].find(e => e.localName === 'spcPts');
                        if (spcPct) {
                            lineSpacing = parseInt(spcPct.getAttribute('val') ?? '100000', 10) / 100000;
                        } else if (spcPts) {
                            lineSpacingAbs = parseInt(spcPts.getAttribute('val') ?? '0', 10) / 100;
                        }
                    }
                }

                const paraMarLAttr = pPr?.getAttribute('marL');
                const paraMarRAttr = pPr?.getAttribute('marR');
                const paraIndentAttr = pPr?.getAttribute('indent');
                const paraMarL = paraMarLAttr ? parseInt(paraMarLAttr, 10) : 0;
                const paraMarR = paraMarRAttr ? parseInt(paraMarRAttr, 10) : 0;
                const paraIndent = paraIndentAttr ? parseInt(paraIndentAttr, 10) : 0;

                const runs = [...para.querySelectorAll('*')].filter(e => e.localName === 'r');
                for (const run of runs) {
                    const rPr = [...run.querySelectorAll('*')].find(e => e.localName === 'rPr');
                    const t = [...run.querySelectorAll('*')].find(e => e.localName === 't');
                    const text = t?.textContent ?? '';
                    if (!text) continue;

                    const bold = rPr?.getAttribute('b') === '1' || rPr?.getAttribute('b') === 'true';
                    const italic = rPr?.getAttribute('i') === '1' || rPr?.getAttribute('i') === 'true';
                    const szAttr = rPr?.getAttribute('sz');
                    const size = szAttr ? parseInt(szAttr, 10) / 100 : 18;

                    let color = '#111111';
                    if (rPr) {
                        const solidFill = [...rPr.querySelectorAll('*')].find(e => e.localName === 'solidFill');
                        if (solidFill) {
                            const srgb = [...solidFill.querySelectorAll('*')].find(e => e.localName === 'srgbClr');
                            if (srgb) color = ooColor(srgb.getAttribute('val'));
                        }
                    }

                    const latin = rPr ? [...rPr.querySelectorAll('*')].find(e => e.localName === 'latin') : null;
                    const fontFamily = latin?.getAttribute('typeface') ?? '';

                    texts.push({ text, bold, italic, size, color, align, spcBefore, spcAfter, lineSpacing, fontFamily, paraMarL, paraMarR, paraIndent });
                }

                const brs = [...para.querySelectorAll('*')].filter(e => e.localName === 'br');
                if (brs.length > 0 && runs.length === 0) {
                    texts.push({ text: '\n', bold: false, italic: false, size: 12, color: '#000', align, spcBefore, spcAfter, lineSpacing, lineSpacingAbs, fontFamily: '', paraMarL, paraMarR, paraIndent });
                }
            }
        }

        shapes.push({
            x: xPct, y: yPct, w: wPct, h: hPct,
            xEmu, yEmu, wEmu, hEmu,
            texts,
            bgColor: shapeBg?.startsWith('__RID:') ? null : shapeBg,
            type: txBody ? 'text' : imageData || el.localName === 'pic' ? 'image' : 'rect',
            imageData,
            zIndex: zIndex++,
            padding: bodyPadding,
            vAnchor,
            wrapNone,
        });
    }

    for (const el of topElements) {
        processShape(el, 0, 0);
    }

    // Sort by z-index
    shapes.sort((a, b) => a.zIndex - b.zIndex);

    return { bgColor, shapes, slideWEmu, slideHEmu };
}

// ── Render slide → HTML string ────────────────────────────────────────────────

// ── Direct pdf-lib rendering helpers ─────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const s = hex.replace('#', '');
    return {
        r: parseInt(s.substring(0, 2), 16) / 255,
        g: parseInt(s.substring(2, 4), 16) / 255,
        b: parseInt(s.substring(4, 6), 16) / 255,
    };
}

const FONT_MAP: Record<string, string> = {
    calibri: 'Helvetica',
    arial: 'Helvetica',
    helvetica: 'Helvetica',
    'segoe ui': 'Helvetica',
    verdana: 'Helvetica',
    tahoma: 'Helvetica',
    'times new roman': 'TimesRoman',
    times: 'TimesRoman',
    georgia: 'TimesRoman',
    'courier new': 'Courier',
    courier: 'Courier',
    consolas: 'Courier',
};

function pickFont(family: string | undefined, bold: boolean, italic: boolean): string {
    const key = (family || '').toLowerCase().trim();
    let base = 'Helvetica';
    for (const [k, v] of Object.entries(FONT_MAP)) {
        if (key.includes(k)) { base = v; break; }
    }
    if (bold && italic) return base + 'BoldOblique';
    if (bold) return base + 'Bold';
    if (italic) return base + 'Oblique';
    return base;
}

function wrapTextToLines(text: string, font: any, fontSize: number, maxWidth: number): string[] {
    if (maxWidth <= 0) return [text];
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
        if (!para) { lines.push(''); continue; }
        const words = para.split(' ');
        let line = '';
        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            const w = font.widthOfTextAtSize(test, fontSize);
            if (w > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
}

async function renderSlideToPdfPage(
    pdfDoc: any,
    data: SlideRenderData,
    images: Map<string, string>,
): Promise<void> {
    const { bgColor, shapes, slideWEmu, slideHEmu } = data;
    const pdfW = slideWEmu / 12700;
    const pdfH = slideHEmu / 12700;
    const page = pdfDoc.addPage([pdfW, pdfH]);
    const pdfLib = await import('pdf-lib');
    const { rgb } = pdfLib;

    const bg = hexToRgb(bgColor);
    page.drawRectangle({ x: 0, y: 0, width: pdfW, height: pdfH, color: rgb(bg.r, bg.g, bg.b) });

    const fontCache = new Map<string, any>();
    async function fnt(name: string) {
        if (!fontCache.has(name)) {
            const std = (pdfLib as any)[name];
            fontCache.set(name, await pdfDoc.embedFont(std ?? pdfLib.StandardFonts.Helvetica));
        }
        return fontCache.get(name);
    }

    for (const s of shapes) {
        if (s.wEmu <= 0 || s.hEmu <= 0) continue;

        const sx = s.xEmu / 12700, sy = pdfH - (s.yEmu + s.hEmu) / 12700;
        const sw = s.wEmu / 12700, sh = s.hEmu / 12700;

        if (s.bgColor && s.bgColor !== 'transparent') {
            const c = hexToRgb(s.bgColor);
            page.drawRectangle({ x: sx, y: sy, width: sw, height: sh, color: rgb(c.r, c.g, c.b) });
        }

        if (s.imageData) {
            try {
                const b64 = s.imageData.split(',')[1];
                const mime = s.imageData.split(';')[0].split(':')[1];
                let img;
                if (mime === 'image/png') img = await pdfDoc.embedPng(b64);
                else if (mime === 'image/jpeg' || mime === 'image/jpg') img = await pdfDoc.embedJpg(b64);
                if (img) page.drawImage(img, { x: sx, y: sy, width: sw, height: sh });
            } catch { /* skip */ }
            continue;
        }

        if (!s.texts.length) continue;

        const pl = s.padding.left / 12700, pr = s.padding.right / 12700;
        const pt = s.padding.top / 12700, pb = s.padding.bottom / 12700;
        const textW = Math.max(1, sw - pl - pr);

        // Group runs into paragraphs
        const paras: { runs: typeof s.texts; align: string; spcBefore: number; spcAfter: number; lh: number; marL: number; indent: number }[] = [];
        let cur: any = null;
        for (const r of s.texts) {
            if (r.text === '\n') { if (cur) { paras.push(cur); cur = null; } continue; }
            if (!cur) {
                const maxFs = s.texts.reduce((a, b) => Math.max(a, b.size), 12);
                const lh = r.lineSpacingAbs > 0 ? r.lineSpacingAbs : maxFs * r.lineSpacing;
                cur = { runs: [], align: r.align, spcBefore: r.spcBefore, spcAfter: r.spcAfter, lh, marL: r.paraMarL, indent: r.paraIndent };
            }
            cur.runs.push(r);
        }
        if (cur) paras.push(cur);
        if (!paras.length) continue;

        // Calculate total lines & height per paragraph
        const phs: { lines: number; lh: number; spcB: number; spcA: number }[] = [];
        let totalLines = 0;
        for (const p of paras) {
            let lines = 1;
            for (const r of p.runs) {
                if (!r.text) continue;
                const fn = pickFont(r.fontFamily, r.bold, r.italic);
                const f = await fnt(fn);
                const wrapped = wrapTextToLines(r.text, f, r.size, textW);
                lines = Math.max(lines, wrapped.length);
            }
            phs.push({ lines, lh: p.lh, spcB: p.spcBefore, spcA: p.spcAfter });
            totalLines += lines;
        }

        if (!totalLines) totalLines = 1;

        // Compute total text height and start Y based on vertical anchor
        let totalH = 0;
        for (const ph of phs) totalH += ph.spcB + ph.lines * ph.lh + ph.spcA;
        const textH = sh - pt - pb;
        let textTopY: number; // Y where the top of text (first line baseline + offset) should be
        if (s.vAnchor === 'b') {
            textTopY = sy + pb + totalH;
        } else if (s.vAnchor === 'ctr') {
            textTopY = sy + pt + (textH - totalH) / 2 + totalH;
        } else {
            textTopY = sy + sh - pt; // top anchor
        }

        // Render
        let cy = textTopY;
        for (let pi = 0; pi < paras.length; pi++) {
            const p = paras[pi];
            const pMarL = p.marL / 12700;
            const pIndent = p.indent / 12700;
            cy -= p.spcBefore;

            const lh = p.lh;
            let firstLine = true;
            for (const run of p.runs) {
                if (!run.text) continue;
                const fn = pickFont(run.fontFamily, run.bold, run.italic);
                const f = await fnt(fn);
                const fs = run.size;
                const lines = wrapTextToLines(run.text, f, fs, textW);
                if (!lines.length) continue;

                for (let li = 0; li < lines.length; li++) {
                    const line = lines[li];
                    if (firstLine && li === 0) {
                        // first line: stays at cy
                    } else {
                        cy -= lh;
                    }
                    if (cy - fs < sy + pb) break;

                    const indent = firstLine && li === 0 ? pMarL + pIndent : pMarL;
                    const baseX = sx + pl + indent;
                    const lineW = f.widthOfTextAtSize(line, fs);
                    let drawX = baseX;
                    if (p.align === 'center') drawX = sx + pl + (textW - lineW) / 2;
                    else if (p.align === 'right') drawX = sx + pl + textW - lineW;

                    const c = hexToRgb(run.color);
                    page.drawText(line, { x: drawX, y: cy - fs * 0.15, size: fs, font: f, color: rgb(c.r, c.g, c.b) });
                    firstLine = false;
                }
            }
            cy -= p.spcAfter;
        }
    }
}

// ── Slide count/metadata pre-scan ─────────────────────────────────────────────

export async function getPresentationSlides(file: File): Promise<SlideInfo[]> {
    validateFile(file);
    if (file.name.toLowerCase().endsWith('.ppt'))
        throw new Error(`"${file.name}" is a legacy .ppt file. Save it as .pptx in PowerPoint and re-upload.`);

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

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

// ── Core conversion V2 ──────────────────────────────────────────────────────

export async function convertPptToPDF(
    file: File,
    options: PptConversionOptions = {},
): Promise<PptConversionResult> {
    const {
        slideIndexes,
        outputPrefix,
        scale = 1.5,
        onProgress,
    } = options;

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

    // 2. Read presentation dimensions
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

    // 3. Extract images
    onProgress?.(15, 'Extracting images…');
    const images = await extractImages(zip);

    // 4. Enumerate slides
    const slideKeys = Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] ?? '0');
            const nb = parseInt(b.match(/\d+/)?.[0] ?? '0');
            return na - nb;
        });

    if (slideKeys.length === 0)
        throw new Error(`"${file.name}" contains no slides or is not a valid .pptx file.`);

    const totalSlides = slideKeys.length;
    const selected = slideIndexes ?? slideKeys.map((_, i) => i);
    const validIdx = selected.filter(i => i >= 0 && i < totalSlides);
    if (validIdx.length === 0) throw new Error('No valid slide indexes selected.');

    onProgress?.(20);

    // 5. Parse + render each slide directly to PDF with pdf-lib
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();

    for (let si = 0; si < validIdx.length; si++) {
        const idx = validIdx[si];
        const xml = await zip.files[slideKeys[idx]].async('string');
        const relsMap = await parseSlideRels(zip, slideKeys[idx]);
        const data = parseSlideXml(xml, slideWEmu, slideHEmu, relsMap, images);
        await renderSlideToPdfPage(pdfDoc, data, images);
        onProgress?.(20 + Math.round(((si + 1) / validIdx.length) * 70));
    }

    onProgress?.(95);
    const pdfBytes = await pdfDoc.save();
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
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export async function batchConvertPptToPDF(
    files: File[],
    options: Omit<PptConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: PptConversionResult, index: number) => void;
        onFileError?: (fileName: string, error: string, index: number) => void;
    } = {},
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
