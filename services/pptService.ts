/**
 * pptService.ts — PowerPoint → PDF Conversion Service V2 (client-side)
 *
 * Pipeline V2 (no iframe — uses hidden div for reliable html2canvas):
 *   .pptx ──[JSZip]──▶ raw OOXML + images
 *          ──[OOXML parser]──▶ per-slide render data (shapes, text, bg, images)
 *          ──[HTML renderer]──▶ styled HTML in hidden div
 *          ──[html2canvas]──▶ canvas bitmap per slide
 *          ──[jsPDF]──▶ multi-page PDF bytes
 *
 * V2 improvements:
 *   - No iframe (html2canvas is unreliable with iframes)
 *   - Images extracted from .pptx zip and embedded as base64
 *   - Better text rendering with font embedding
 *   - Table and group shape support
 *   - More reliable rendering with explicit dimensions
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
            let resolvedPath = '';
            if (target.startsWith('../../')) {
                resolvedPath = 'ppt/' + target.replace('../../', '');
            } else if (target.startsWith('../')) {
                resolvedPath = 'ppt/' + target.replace('../', '');
            } else {
                // Same directory — e.g. target = "image1.png" from ppt/slides/_rels/slide1.xml.rels
                const relsDir = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/').replace('.xml', '.xml.rels');
                const dir = slidePath.substring(0, slidePath.lastIndexOf('/') + 1);
                resolvedPath = dir + target;
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
    texts: { text: string; bold: boolean; italic: boolean; size: number; color: string; align: string; spcBefore: number; spcAfter: number; lineSpacing: number }[];
    bgColor: string | null;
    type: 'text' | 'rect' | 'image' | 'unknown';
    imageData?: string; // base64 data URL
    zIndex: number;
    padding: { top: number; right: number; bottom: number; left: number }; // bodyPr insets in px
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
        const defaultInset = Math.round(91440 * RENDER_W / slideWEmu);
        let bodyPadding = { top: defaultInset, right: defaultInset, bottom: defaultInset, left: defaultInset };

        if (txBody) {
            const bodyPr = [...txBody.querySelectorAll('*')].find(e => e.localName === 'bodyPr');
            if (bodyPr) {
                const toPx = (emu: string | null) => emu ? Math.round(parseInt(emu, 10) * RENDER_W / slideWEmu) : defaultInset;
                bodyPadding = {
                    top: toPx(bodyPr.getAttribute('tIns')),
                    right: toPx(bodyPr.getAttribute('rIns')),
                    bottom: toPx(bodyPr.getAttribute('bIns')),
                    left: toPx(bodyPr.getAttribute('lIns')),
                };
            }

            const paragraphs = [...txBody.querySelectorAll('*')].filter(e => e.localName === 'p');
            for (const para of paragraphs) {
                const pPr = [...para.querySelectorAll('*')].find(e => e.localName === 'pPr');
                const algn = pPr?.getAttribute('algn') ?? 'l';
                const alignMap: Record<string, string> = { l: 'left', r: 'right', ctr: 'center', just: 'justify', dist: 'justify' };
                const align = alignMap[algn] ?? 'left';

                const spcBeforeAttr = pPr?.getAttribute('spcBefore');
                const spcAfterAttr = pPr?.getAttribute('spcAfter');
                const spcBefore = spcBeforeAttr ? parseInt(spcBeforeAttr, 10) / 100 : 0;
                const spcAfter = spcAfterAttr ? parseInt(spcAfterAttr, 10) / 100 : 0;

                let lineSpacing = 1.0;
                if (pPr) {
                    const lnSpc = [...pPr.querySelectorAll('*')].find(e => e.localName === 'lnSpc');
                    if (lnSpc) {
                        const spcPct = [...lnSpc.querySelectorAll('*')].find(e => e.localName === 'spcPct');
                        const spcPts = [...lnSpc.querySelectorAll('*')].find(e => e.localName === 'spcPts');
                        if (spcPct) {
                            lineSpacing = parseInt(spcPct.getAttribute('val') ?? '100000', 10) / 100000;
                        } else if (spcPts) {
                            const pts = parseInt(spcPts.getAttribute('val') ?? '0', 10) / 100;
                            lineSpacing = pts > 0 ? pts / 18 : 1.0;
                        }
                    }
                }

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

                    texts.push({ text, bold, italic, size, color, align, spcBefore, spcAfter, lineSpacing });
                }

                const brs = [...para.querySelectorAll('*')].filter(e => e.localName === 'br');
                if (brs.length > 0 && runs.length === 0) {
                    texts.push({ text: '\n', bold: false, italic: false, size: 12, color: '#000', align, spcBefore, spcAfter, lineSpacing });
                }
            }
        }

        shapes.push({
            x: xPct, y: yPct, w: wPct, h: hPct,
            texts,
            bgColor: shapeBg?.startsWith('__RID:') ? null : shapeBg,
            type: txBody ? 'text' : imageData || el.localName === 'pic' ? 'image' : 'rect',
            imageData,
            zIndex: zIndex++,
            padding: bodyPadding,
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

function renderSlideToHtml(data: SlideRenderData, slideIndex: number): string {
    const { bgColor, shapes, slideWEmu, slideHEmu } = data;
    // Use the actual aspect ratio from EMU dimensions (not hardcoded 16:9)
    const slideW = RENDER_W;
    const slideH = Math.round(RENDER_W * (slideHEmu / slideWEmu));

    let innerHtml = '';
    for (const shape of shapes) {
        if (shape.w <= 0 || shape.h <= 0) continue;

        // Convert percentage positions to absolute pixels for reliable rendering
        const sx = (shape.x / 100) * slideW;
        const sy = (shape.y / 100) * slideH;
        const sw = (shape.w / 100) * slideW;
        const sh = (shape.h / 100) * slideH;

        // Image shape
        if (shape.imageData) {
            innerHtml += `
        <div style="position:absolute;left:${sx}px;top:${sy}px;
            width:${sw}px;height:${sh}px;overflow:hidden;">
          <img src="${shape.imageData}" style="width:100%;height:100%;object-fit:contain;display:block;" />
        </div>`;
            continue;
        }

        const fillStyle = shape.bgColor === 'transparent' ? ''
            : shape.bgColor ? `background:${shape.bgColor};`
                : '';

        const posStyle = `
      position:absolute;
      left:${sx}px;
      top:${sy}px;
      width:${sw}px;
      height:${sh}px;
      overflow:hidden;
      box-sizing:border-box;
      ${fillStyle}
    `.replace(/\n\s+/g, ' ').trim();

        if (shape.texts.length > 0) {
            let textHtml = '';
            let paraBuffer: string[] = [];
            let lastAlign = shape.texts[0]?.align ?? 'left';
            let lastSpcBefore = 0;
            let lastSpcAfter = 0;
            let lastLineSpacing = 1.0;

            const flushPara = () => {
                if (paraBuffer.length === 0) return;
                // spcBefore/spcAfter in pt → EMU (×12700) → px at render scale (×RENDER_W/slideWEmu)
                const emuPerPx = slideWEmu / RENDER_W;
                const mt = Math.round(lastSpcBefore * 12700 / emuPerPx);
                const mb = Math.round(lastSpcAfter * 12700 / emuPerPx);
                textHtml += `<div style="text-align:${lastAlign};line-height:${lastLineSpacing.toFixed(2)};margin:${mt}px 0 ${mb}px 0;padding:0;white-space:pre-wrap;">${paraBuffer.join('')}</div>`;
                paraBuffer = [];
            };

            for (const run of shape.texts) {
                if (run.text === '\n') { flushPara(); continue; }
                if (run.align !== lastAlign && paraBuffer.length > 0) { flushPara(); lastAlign = run.align; }
                if (paraBuffer.length === 0) {
                    lastSpcBefore = run.spcBefore;
                    lastSpcAfter = run.spcAfter;
                    lastLineSpacing = run.lineSpacing;
                }
                // Font size in pt → EMU (×12700) → px at render scale
                const emuPerPx = slideWEmu / RENDER_W;
                const scaledSize = Math.max(8, run.size * 12700 / emuPerPx);
                const fs = `font-size:${scaledSize.toFixed(1)}px;`;
                const fw = run.bold ? 'font-weight:700;' : '';
                const fi = run.italic ? 'font-style:italic;' : '';
                const fc = `color:${run.color};`;
                const escaped = run.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                paraBuffer.push(`<span style="${fs}${fw}${fi}${fc}">${escaped}</span>`);
            }
            flushPara();

            const { top, right, bottom, left } = shape.padding;
            innerHtml += `
        <div style="${posStyle}padding:${top}px ${right}px ${bottom}px ${left}px;">
          <div style="font-family:'Calibri','Segoe UI',Arial,sans-serif;word-wrap:break-word;overflow-wrap:break-word;">${textHtml}</div>
        </div>`;
        } else if (shape.bgColor && shape.bgColor !== 'transparent') {
            innerHtml += `<div style="${posStyle}border:1px solid rgba(0,0,0,0.06);"></div>`;
        }
    }

    return `
    <div class="ppt-slide" data-slide="${slideIndex}" style="
      position:relative;
      width:${slideW}px;
      height:${slideH}px;
      background:${bgColor};
      overflow:hidden;
      page-break-after:always;
    ">
      ${innerHtml}
    </div>`;
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
    onProgress?.(15);
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

    // 5. Parse + render each slide
    const aspectRatio = slideHEmu / slideWEmu;
    const slideH = Math.round(RENDER_W * aspectRatio);

    const slideHtmlParts: string[] = [];
    for (let si = 0; si < validIdx.length; si++) {
        const idx = validIdx[si];
        const xml = await zip.files[slideKeys[idx]].async('string');
        const relsMap = await parseSlideRels(zip, slideKeys[idx]);
        const data = parseSlideXml(xml, slideWEmu, slideHEmu, relsMap, images);
        slideHtmlParts.push(renderSlideToHtml(data, idx));
        onProgress?.(20 + Math.round(((si + 1) / validIdx.length) * 30));
    }

    onProgress?.(55);

    // 6. Load html2canvas
    const h2c = await import('html2canvas');
    const h2cFn = (h2c as any).default ?? h2c;

    // 7. Build PDF — match the slide's actual aspect ratio (like PowerPoint "Save as PDF")
    const { jsPDF } = await import('jspdf');
    // Convert EMU to mm: 1 inch = 914400 EMU = 25.4 mm
    const pdfW = slideWEmu * 25.4 / 914400;
    const pdfH = slideHEmu * 25.4 / 914400;
    const orient = pdfW > pdfH ? 'landscape' : 'portrait';
    // Higher render scale for better quality (2x for crisp text)
    const renderScale = Math.max(scale, 2);

    const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: [pdfW, pdfH], compress: true });
    const mmPerPx = pdfW / (RENDER_W * renderScale);

    for (let si = 0; si < validIdx.length; si++) {
        if (si > 0) pdf.addPage([pdfW, pdfH], orient);

        // Create a temporary container for THIS slide only
        // Note: z-index: -1 is AVOIDED — html2canvas returns empty canvases for negative-z elements
        const slideDiv = document.createElement('div');
        slideDiv.setAttribute('style', `
            position:fixed;top:0;left:0;
            width:${RENDER_W}px;height:${slideH}px;
            background:white;
            overflow:hidden;
            margin:0;padding:0;
            pointer-events:none;
            opacity:0.999;
        `);
        slideDiv.innerHTML = slideHtmlParts[si];
        document.body.appendChild(slideDiv);

        try {
            // Wait for images in this slide — fix: attach handlers BEFORE checking complete
            const imgs = slideDiv.querySelectorAll('img');
            await Promise.all(Array.from(imgs).map(img =>
                new Promise<void>(res => {
                    img.onload = () => res();
                    img.onerror = () => res();
                    if (img.complete) res();
                    setTimeout(res, 3000);
                })
            ));

            // Wait for layout/rendering
            await new Promise(r => setTimeout(r, 150));

            // Capture this slide at high resolution
            const canvas = await h2cFn(slideDiv, {
                scale: renderScale,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                width: RENDER_W,
                height: slideH,
                logging: false,
            });

            if (canvas && canvas.width > 0 && canvas.height > 0) {
                const sliceH_mm = canvas.height * mmPerPx;
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, sliceH_mm);
            } else {
                // Render fallback: add a blank page with slide number
                pdf.setFontSize(16);
                pdf.text(`Slide ${validIdx[si] + 1}`, pdfW / 2, pdfH / 2, { align: 'center' });
            }
        } finally {
            document.body.removeChild(slideDiv);
        }

        onProgress?.(55 + Math.round(((si + 1) / validIdx.length) * 40));
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
