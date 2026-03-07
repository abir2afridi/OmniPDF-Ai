/**
 * openOfficeService.ts — OpenOffice / LibreOffice → PDF Conversion Service (client-side)
 *
 * Pipeline:
 *   ODT / ODS / ODP  ──[JSZip + XML parsing]──▶  Styled HTML  ──[jsPDF + html2canvas]──▶  PDF bytes
 *
 * Supported formats:
 *   - .odt  (OpenDocument Text)
 *   - .ods  (OpenDocument Spreadsheet)
 *   - .odp  (OpenDocument Presentation)
 *
 * Design contract:
 *  - Pure conversion engine; never downloads. Caller owns download & UI.
 *  - Returns OOConversionResult (bytes + metadata) per file.
 *  - Security: no command injection possible (purely client-side XML parsing).
 *  - All file names sanitized; no shell commands executed.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OOConversionOptions {
    /** Output filename prefix (without .pdf). Defaults to original basename. */
    outputPrefix?: string;
    /** Quality scale for html2canvas rasterisation (1 = 96dpi, 2 = 192dpi). Default: 2 */
    scale?: number;
    /** jsPDF page format. Default: 'a4' */
    pageFormat?: 'a4' | 'letter' | 'legal';
    /** Page orientation. Default: 'portrait' */
    orientation?: 'portrait' | 'landscape';
    /** Progress callback (0–100) */
    onProgress?: (p: number) => void;
}

export interface OOConversionResult {
    /** Output PDF bytes */
    bytes: Uint8Array;
    /** Suggested output filename */
    outputName: string;
    /** Number of pages in the resulting PDF */
    pageCount: number;
    /** Original file size in bytes */
    originalSize: number;
    /** Output PDF size in bytes */
    outputSize: number;
    /** Extracted HTML from the ODF document (for preview) */
    html: string;
    /** Source format detected */
    sourceFormat: 'odt' | 'ods' | 'odp';
}

export interface OOBatchConversionResult {
    succeeded: OOConversionResult[];
    failed: { fileName: string; error: string }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set(['.odt', '.ods', '.odp']);

const ALLOWED_MIME_TYPES = new Set([
    'application/vnd.oasis.opendocument.text',             // .odt
    'application/vnd.oasis.opendocument.spreadsheet',      // .ods
    'application/vnd.oasis.opendocument.presentation',     // .odp
]);

// Also accept generic zip (some OS report ODF as application/zip)
const FALLBACK_TYPES = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    '',
]);

const MAX_FILE_MB = 80;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// ODF magic: the first file in the ZIP is `mimetype` (uncompressed)
const ODF_MIMETYPES: Record<string, 'odt' | 'ods' | 'odp'> = {
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.oasis.opendocument.presentation': 'odp',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 100) || 'document';
}

function getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function detectFormatFromExtension(filename: string): 'odt' | 'ods' | 'odp' | null {
    const ext = getExtension(filename);
    if (ext === '.odt') return 'odt';
    if (ext === '.ods') return 'ods';
    if (ext === '.odp') return 'odp';
    return null;
}

export function isOpenOfficeFile(file: File): boolean {
    const ext = getExtension(file.name);
    return ALLOWED_EXTENSIONS.has(ext) ||
        ALLOWED_MIME_TYPES.has(file.type);
}

function validateFile(file: File): void {
    if (!isOpenOfficeFile(file)) {
        throw new Error(`"${file.name}" is not an OpenDocument file (.odt, .ods, or .odp).`);
    }
    if (file.size > MAX_FILE_BYTES) {
        throw new Error(`"${file.name}" exceeds the ${MAX_FILE_MB} MB limit.`);
    }
    if (file.size === 0) {
        throw new Error(`"${file.name}" is empty.`);
    }
}

/** Safely escape HTML entities to prevent XSS from document content */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Parse XML string into a DOM Document */
function parseXml(xmlString: string): Document {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Invalid XML content in the document.');
    }
    return doc;
}

/** Recursively extract text from ODF XML nodes with formatting */
function extractOdtContent(node: Element, images: Map<string, string>): string {
    let html = '';

    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            html += escapeHtml(child.textContent || '');
            continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const el = child as Element;
        const localName = el.localName;

        switch (localName) {
            case 'p': {
                const styleName = el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'style-name') || '';
                if (styleName.toLowerCase().includes('heading') || styleName.toLowerCase().includes('title')) {
                    const level = styleName.match(/\d/) ? styleName.match(/\d/)![0] : '2';
                    html += `<h${level}>${extractOdtContent(el, images)}</h${level}>`;
                } else {
                    html += `<p>${extractOdtContent(el, images)}</p>`;
                }
                break;
            }
            case 'h': {
                const outlineLevel = el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'outline-level') || '2';
                const level = Math.min(6, Math.max(1, parseInt(outlineLevel) || 2));
                html += `<h${level}>${extractOdtContent(el, images)}</h${level}>`;
                break;
            }
            case 'span': {
                const spanStyle = el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'style-name') || '';
                if (spanStyle.toLowerCase().includes('bold') || spanStyle.toLowerCase().includes('strong')) {
                    html += `<strong>${extractOdtContent(el, images)}</strong>`;
                } else if (spanStyle.toLowerCase().includes('italic') || spanStyle.toLowerCase().includes('emphasis')) {
                    html += `<em>${extractOdtContent(el, images)}</em>`;
                } else {
                    html += extractOdtContent(el, images);
                }
                break;
            }
            case 'list': {
                html += `<ul>${extractOdtContent(el, images)}</ul>`;
                break;
            }
            case 'list-item': {
                html += `<li>${extractOdtContent(el, images)}</li>`;
                break;
            }
            case 'table': {
                html += `<table>${extractOdtContent(el, images)}</table>`;
                break;
            }
            case 'table-row': {
                html += `<tr>${extractOdtContent(el, images)}</tr>`;
                break;
            }
            case 'table-cell': {
                html += `<td>${extractOdtContent(el, images)}</td>`;
                break;
            }
            case 'table-header-rows': {
                html += extractOdtContent(el, images);
                break;
            }
            case 'a': {
                const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '#';
                html += `<a href="${escapeHtml(href)}">${extractOdtContent(el, images)}</a>`;
                break;
            }
            case 'line-break': {
                html += '<br/>';
                break;
            }
            case 'tab': {
                html += '&emsp;';
                break;
            }
            case 's': {
                const count = parseInt(el.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'c') || '1');
                html += '&nbsp;'.repeat(count);
                break;
            }
            case 'frame': {
                html += extractOdtContent(el, images);
                break;
            }
            case 'image': {
                const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
                if (href && images.has(href)) {
                    html += `<img src="${images.get(href)}" style="max-width:100%;height:auto;" />`;
                }
                break;
            }
            case 'soft-page-break': {
                html += '<div style="page-break-before:always;"></div>';
                break;
            }
            default: {
                // Recurse into unknown elements
                html += extractOdtContent(el, images);
                break;
            }
        }
    }

    return html;
}

/** Extract spreadsheet data from ODS content.xml */
function extractOdsContent(doc: Document): string {
    let html = '';
    const tables = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table');

    for (let t = 0; t < tables.length; t++) {
        const table = tables[t];
        const tableName = table.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'name') || `Sheet ${t + 1}`;
        html += `<h2 class="sheet-title">${escapeHtml(tableName)}</h2>`;
        html += '<table class="spreadsheet">';

        const rows = table.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table-row');
        let hasContent = false;
        let rowsHtml = '';

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const repeatRows = parseInt(row.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'number-rows-repeated') || '1');

            // Don't render massive repeated empty rows
            if (repeatRows > 100) continue;

            const cells = row.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table-cell');
            let rowHtml = '<tr>';
            let rowHasContent = false;

            for (let c = 0; c < cells.length; c++) {
                const cell = cells[c];
                const repeatCols = parseInt(cell.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'number-columns-repeated') || '1');

                // Get text content from text:p children
                const paragraphs = cell.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'p');
                let cellText = '';
                for (let p = 0; p < paragraphs.length; p++) {
                    if (p > 0) cellText += '<br/>';
                    cellText += escapeHtml(paragraphs[p].textContent || '');
                }

                if (cellText) rowHasContent = true;

                // Limit repeated empty cells
                const actualRepeat = Math.min(repeatCols, cellText ? repeatCols : Math.min(repeatCols, 20));
                for (let rep = 0; rep < actualRepeat; rep++) {
                    rowHtml += `<td>${cellText || '&nbsp;'}</td>`;
                }
            }

            rowHtml += '</tr>';

            if (rowHasContent) {
                hasContent = true;
                const actualRepeat = Math.min(repeatRows, 1); // Only render first instance of repeated rows
                for (let rep = 0; rep < actualRepeat; rep++) {
                    rowsHtml += rowHtml;
                }
            }
        }

        if (hasContent) {
            html += rowsHtml;
        } else {
            html += '<tr><td style="padding:20px;color:#888;">(Empty sheet)</td></tr>';
        }
        html += '</table>';
    }

    if (tables.length === 0) {
        html += '<p>(No spreadsheet data found)</p>';
    }

    return html;
}

/** Extract presentation slides from ODP content.xml */
function extractOdpContent(doc: Document, images: Map<string, string>): string {
    let html = '';
    const pages = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'page');

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageName = page.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'name') || `Slide ${i + 1}`;

        html += `<div class="slide">`;
        html += `<div class="slide-number">Slide ${i + 1}</div>`;
        html += `<h2 class="slide-title">${escapeHtml(pageName)}</h2>`;

        // Extract text frames
        const frames = page.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'frame');
        for (let f = 0; f < frames.length; f++) {
            const frame = frames[f];

            // Check for text boxes
            const textBoxes = frame.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'text-box');
            for (let tb = 0; tb < textBoxes.length; tb++) {
                const textBox = textBoxes[tb];
                const paragraphs = textBox.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'p');

                for (let p = 0; p < paragraphs.length; p++) {
                    const para = paragraphs[p];
                    const text = para.textContent?.trim() || '';
                    if (!text) continue;

                    // Check if it's a title-like paragraph (first text frame, first paragraph)
                    if (f === 0 && p === 0 && text.length < 100) {
                        html += `<h3>${escapeHtml(text)}</h3>`;
                    } else {
                        html += `<p>${escapeHtml(text)}</p>`;
                    }
                }
            }

            // Check for images
            const imgElements = frame.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'image');
            for (let img = 0; img < imgElements.length; img++) {
                const imgEl = imgElements[img];
                const href = imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
                if (href && images.has(href)) {
                    html += `<img src="${images.get(href)}" style="max-width:100%;height:auto;margin:8px 0;" />`;
                }
            }
        }

        html += `</div>`;
        if (i < pages.length - 1) {
            html += '<div style="page-break-after:always;"></div>';
        }
    }

    if (pages.length === 0) {
        html += '<p>(No slides found in presentation)</p>';
    }

    return html;
}

/** Build full HTML document with appropriate styles per format */
function buildStyledHtml(bodyHtml: string, format: 'odt' | 'ods' | 'odp'): string {
    const baseStyles = `
        *, *::before, *::after { box-sizing: border-box; }
        html, body {
            margin: 0; padding: 0;
            font-family: 'Liberation Sans', 'Segoe UI', Arial, Helvetica, sans-serif;
            font-size: 11pt;
            color: #111;
            background: #fff;
            line-height: 1.55;
        }
        h1, h2, h3, h4, h5, h6 { margin: 0.6em 0 0.3em; font-weight: 700; color: #1a1a1a; }
        h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
        p  { margin: 0 0 0.5em; }
        a  { color: #1a5fb4; text-decoration: underline; }
        img { max-width: 100%; height: auto; }
        ul, ol { margin: 0.3em 0 0.3em 1.5em; padding: 0; }
        li { margin-bottom: 0.2em; }
        @page { size: A4; margin: 0; }
    `;

    let formatStyles = '';
    switch (format) {
        case 'odt':
            formatStyles = `
                body { padding: 25mm; }
                table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
                th, td { border: 1px solid #bbb; padding: 4px 8px; }
                th { background: #f0f0f0; font-weight: 700; }
                blockquote { margin: 0.5em 0 0.5em 1em; padding-left: 0.8em; border-left: 3px solid #ccc; color: #555; }
                pre, code { font-family: 'Liberation Mono', 'Consolas', monospace; font-size: 9pt; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
            `;
            break;
        case 'ods':
            formatStyles = `
                body { padding: 15mm; }
                .sheet-title {
                    background: linear-gradient(135deg, #2d7d46 0%, #1a5c32 100%);
                    color: white;
                    padding: 10px 16px;
                    border-radius: 8px 8px 0 0;
                    margin: 20px 0 0 0;
                    font-size: 13pt;
                }
                table.spreadsheet {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 0 0 20px 0;
                    font-size: 9pt;
                    border: 1px solid #c0c0c0;
                }
                table.spreadsheet td {
                    border: 1px solid #d4d4d4;
                    padding: 4px 8px;
                    min-width: 60px;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                table.spreadsheet tr:nth-child(even) { background: #f8f9fa; }
                table.spreadsheet tr:first-child { background: #e8ece8; font-weight: 600; }
                table.spreadsheet tr:hover { background: #e3f2fd; }
            `;
            break;
        case 'odp':
            formatStyles = `
                body { padding: 15mm; background: #f5f5f5; }
                .slide {
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 30px 40px;
                    margin: 20px 0;
                    min-height: 400px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    position: relative;
                }
                .slide-number {
                    position: absolute;
                    top: 12px;
                    right: 16px;
                    font-size: 9pt;
                    color: #999;
                    font-weight: 600;
                }
                .slide-title {
                    font-size: 11pt;
                    color: #666;
                    margin: 0 0 16px 0;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #eee;
                }
                .slide h3 {
                    font-size: 18pt;
                    color: #1a1a2e;
                    margin: 0 0 12px 0;
                }
                .slide p { font-size: 12pt; line-height: 1.6; }
            `;
            break;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${baseStyles}${formatStyles}</style>
</head><body>${bodyHtml}</body></html>`;
}

// ── Core single-file conversion ───────────────────────────────────────────────

/**
 * Convert one OpenOffice/LibreOffice file to PDF bytes.
 * Returns OOConversionResult — does NOT download.
 */
export async function convertOpenOfficeToPDF(
    file: File,
    options: OOConversionOptions = {}
): Promise<OOConversionResult> {
    const {
        outputPrefix,
        scale = 2,
        pageFormat = 'a4',
        orientation = 'portrait',
        onProgress,
    } = options;

    // ── 1. Validate ──────────────────────────────────────
    validateFile(file);
    onProgress?.(3);

    // ── 2. Read file as ArrayBuffer ──────────────────────
    let arrayBuffer: ArrayBuffer;
    try {
        arrayBuffer = await file.arrayBuffer();
    } catch {
        throw new Error(`Cannot read "${file.name}". The file may be inaccessible.`);
    }
    onProgress?.(8);

    // ── 3. Unzip ODF container ───────────────────────────
    const JSZip = (await import('jszip')).default;
    let zip: InstanceType<typeof JSZip>;
    try {
        zip = await JSZip.loadAsync(arrayBuffer);
    } catch {
        throw new Error(`"${file.name}" is not a valid ODF/ZIP file. It may be corrupted.`);
    }
    onProgress?.(15);

    // ── 4. Detect format ─────────────────────────────────
    let sourceFormat: 'odt' | 'ods' | 'odp';

    // Try reading the mimetype file first (standard ODF)
    const mimetypeFile = zip.file('mimetype');
    if (mimetypeFile) {
        const mimeContent = (await mimetypeFile.async('text')).trim();
        if (ODF_MIMETYPES[mimeContent]) {
            sourceFormat = ODF_MIMETYPES[mimeContent];
        } else {
            // Fallback to extension
            const extFormat = detectFormatFromExtension(file.name);
            if (extFormat) {
                sourceFormat = extFormat;
            } else {
                throw new Error(`Unrecognized ODF mimetype: "${mimeContent}". Expected .odt, .ods, or .odp.`);
            }
        }
    } else {
        const extFormat = detectFormatFromExtension(file.name);
        if (extFormat) {
            sourceFormat = extFormat;
        } else {
            throw new Error(`"${file.name}" does not appear to be a valid ODF file (no mimetype entry).`);
        }
    }
    onProgress?.(20);

    // ── 5. Parse content.xml ─────────────────────────────
    const contentFile = zip.file('content.xml');
    if (!contentFile) {
        throw new Error(`"${file.name}" is missing content.xml — the file may be corrupted.`);
    }
    const contentXml = await contentFile.async('text');
    const xmlDoc = parseXml(contentXml);
    onProgress?.(30);

    // ── 6. Extract embedded images ───────────────────────
    const images = new Map<string, string>();
    const imageFiles = Object.keys(zip.files).filter(
        f => f.startsWith('Pictures/') && !zip.files[f].dir
    );

    for (const imgPath of imageFiles) {
        try {
            const imgData = await zip.files[imgPath].async('base64');
            const ext = imgPath.split('.').pop()?.toLowerCase() || 'png';
            const mimeMap: Record<string, string> = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'bmp': 'image/bmp',
                'webp': 'image/webp',
            };
            const mime = mimeMap[ext] || 'image/png';
            images.set(imgPath, `data:${mime};base64,${imgData}`);
        } catch {
            // Skip unreadable images
        }
    }
    onProgress?.(40);

    // ── 7. Convert to HTML based on format ───────────────
    let extractedHtml = '';
    switch (sourceFormat) {
        case 'odt': {
            const body = xmlDoc.getElementsByTagNameNS(
                'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'body'
            )[0];
            if (body) {
                const textBody = body.getElementsByTagNameNS(
                    'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text'
                )[0];
                if (textBody) {
                    extractedHtml = extractOdtContent(textBody, images);
                }
            }
            if (!extractedHtml) {
                extractedHtml = '<p>(No text content found in document)</p>';
            }
            break;
        }
        case 'ods': {
            extractedHtml = extractOdsContent(xmlDoc);
            break;
        }
        case 'odp': {
            extractedHtml = extractOdpContent(xmlDoc, images);
            break;
        }
    }
    onProgress?.(55);

    // ── 8. Build styled HTML & render in hidden iframe ────
    const styledHtml = buildStyledHtml(extractedHtml, sourceFormat);

    const PAGE_W_PX = 794;  // ~210mm at 96dpi
    const PAGE_H_PX = 1123; // ~297mm at 96dpi

    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        position: fixed; top: -9999px; left: -9999px;
        width: ${PAGE_W_PX}px; height: ${PAGE_H_PX}px;
        border: none; overflow: hidden; visibility: hidden;
    `;
    document.body.appendChild(iframe);

    try {
        const doc = iframe.contentDocument!;
        doc.open();
        doc.write(styledHtml);
        doc.close();

        // Allow browser to lay out
        await new Promise<void>(resolve => setTimeout(resolve, 120));
        onProgress?.(65);

        // ── 9. Rasterise via html2canvas ─────────────────
        const h2c = await import('html2canvas');
        const h2cDefault = (h2c as any).default ?? h2c;

        const bodyEl = doc.body;
        const fullHeight = Math.max(bodyEl.scrollHeight, PAGE_H_PX);

        const canvas = await h2cDefault(bodyEl, {
            scale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            width: PAGE_W_PX,
            height: fullHeight,
            windowWidth: PAGE_W_PX,
            windowHeight: fullHeight,
            logging: false,
        });
        onProgress?.(82);

        // ── 10. Slice canvas into pages and build PDF ────
        const { jsPDF } = await import('jspdf');
        const pdfW = pageFormat === 'letter' ? 215.9 : pageFormat === 'legal' ? 215.9 : 210;
        const pdfH = pageFormat === 'letter' ? 279.4 : pageFormat === 'legal' ? 355.6 : 297;
        const isLandscape = orientation === 'landscape';
        const pw = isLandscape ? pdfH : pdfW;
        const ph = isLandscape ? pdfW : pdfH;

        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: pageFormat,
            compress: true,
        });

        const canvasWidthMM = pw;
        const mmPerPx = canvasWidthMM / (PAGE_W_PX * scale);
        const pageHeightPx = ph / mmPerPx;
        const totalPages = Math.ceil(canvas.height / pageHeightPx);

        for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage([pw, ph], orientation);

            const sliceCanvas = document.createElement('canvas');
            const sliceH = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceH;
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.drawImage(canvas, 0, page * pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

            const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.92);
            pdf.addImage(sliceDataUrl, 'JPEG', 0, 0, pw, sliceH * mmPerPx);
        }

        onProgress?.(95);
        const pdfBytes = pdf.output('arraybuffer');
        onProgress?.(100);

        const base = sanitizeName(outputPrefix?.trim() || file.name.replace(/\.(odt|ods|odp)$/i, ''));
        return {
            bytes: new Uint8Array(pdfBytes),
            outputName: `${base}.pdf`,
            pageCount: totalPages,
            originalSize: file.size,
            outputSize: pdfBytes.byteLength,
            html: extractedHtml,
            sourceFormat,
        };

    } finally {
        document.body.removeChild(iframe);
    }
}

// ── Batch conversion ──────────────────────────────────────────────────────────

/**
 * Convert multiple ODF files to individual PDFs.
 * Processes sequentially to avoid memory pressure.
 */
export async function batchConvertOpenOfficeToPDF(
    files: File[],
    options: Omit<OOConversionOptions, 'outputPrefix' | 'onProgress'> & {
        onFileProgress?: (fileName: string, p: number) => void;
        onFileComplete?: (result: OOConversionResult, index: number) => void;
        onFileError?: (fileName: string, error: string, index: number) => void;
    } = {}
): Promise<OOBatchConversionResult> {
    const { onFileProgress, onFileComplete, onFileError, ...convOpts } = options;
    const succeeded: OOConversionResult[] = [];
    const failed: { fileName: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const result = await convertOpenOfficeToPDF(file, {
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

// ── Validation helper (usable in UI) ─────────────────────────────────────────

export function validateOpenOfficeFile(file: File): string | null {
    try {
        validateFile(file);
        return null;
    } catch (e: any) {
        return e.message;
    }
}

export { MAX_FILE_MB as OO_MAX_FILE_MB };
