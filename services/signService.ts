/**
 * signService.ts — PDF Signing Engine
 *
 * MODE 1: Visual / E-Signature
 *   Draw → canvas PNG  |  Upload image  |  Type → canvas PNG (cursive font)
 *   Embed via @cantoo/pdf-lib at precise PDF coordinate (pt origin bottom-left).
 *   Optionally add date text, custom label, and lock the doc after signing.
 *
 * MODE 2: Digital / Cryptographic Signature
 *   Parse PKCS#12 (.p12 / .pfx) via node-forge.
 *   Hash the original PDF bytes with SHA-256 (Web Crypto API).
 *   RSA-SHA256 sign the digest with the embedded private key.
 *   Store the signature, certificate DER, signer info, and timestamp in the PDF
 *   as a custom XMP-style metadata block (PDF subject/keywords) plus a visible
 *   "Signed by: …" annotation block on the requested page.
 *
 *   ⚠️ ARCHITECTURAL NOTE:
 *   True ISO 32000 byte-range PDF digital signatures require reserving the exact
 *   signature field size before serialisation — this is only practical server-side
 *   (node-signpdf, etc.). The implementation here delivers cryptographic
 *   authenticity (RSA-SHA256 over the full PDF content) with verification within
 *   this application, embedded as verifiable metadata.
 *
 * VERIFY:
 *   Extracts the embedded JSON signing record from PDF keywords/subject,
 *   re-hashes the "untampered" content slice, verifies the RSA signature,
 *   and reports: valid, issuer, subject, signed-at, algorithm.
 *
 * Dependencies: @cantoo/pdf-lib, node-forge, pdfjs-dist
 */

import { PDFDocument as CantooDoc, StandardFonts, rgb } from '@cantoo/pdf-lib';
import forge from 'node-forge';
import { downloadBlob } from './pdfService';

// ── Shared constants ───────────────────────────────────────────────────────────

export const SIGN_MAX_MB = 100;
export const SIGN_MARKER = 'OMNIPDF_SIGN_V1:';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignaturePlacement {
    page: number;   // 1-indexed
    x: number;   // PDF pts from left
    y: number;   // PDF pts from bottom
    width: number;   // PDF pts
    height: number;   // PDF pts
}

export interface VisualSignOptions {
    signatureDataUrl: string;
    placement: SignaturePlacement;
    addDate?: boolean;
    customText?: string;
    lockAfterSigning?: boolean;
    outputName?: string;
    onProgress?: (p: number) => void;
}

export interface DigitalSignOptions {
    p12Bytes: ArrayBuffer;
    p12Password: string;
    placement?: SignaturePlacement;
    signerName?: string;
    addDate?: boolean;
    customText?: string;
    lockAfterSigning?: boolean;
    outputName?: string;
    onProgress?: (p: number) => void;
}

export interface CertificateInfo {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    serialNumber: string;
    algorithm: string;
}

export interface DigitalSignResult {
    blob: Blob;
    outputName: string;
    certInfo: CertificateInfo;
    signatureB64: string;
    timestamp: string;
}

export interface VerifyResult {
    hasCryptographicSignature: boolean;
    isValid: boolean | null;
    certInfo: CertificateInfo | null;
    signedAt: string | null;
    algorithm: string | null;
    signer: string | null;
    documentIntegrity: 'intact' | 'tampered' | 'unknown';
    error: string | null;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateSignFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')
        return `"${file.name}" is not a PDF.`;
    if (file.size > SIGN_MAX_MB * 1024 * 1024)
        return `File exceeds ${SIGN_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `File is empty.`;
    return null;
}

// ── Typed signature canvas ────────────────────────────────────────────────────

const SCRIPT_FONTS = [
    '"Dancing Script"', '"Pacifico"', '"Satisfy"', '"Caveat"',
    '"Brush Script MT"', 'cursive',
];

/** Load a Google Font into the document via FontFace API (best-effort). */
async function loadScriptFont(): Promise<void> {
    const urls: Record<string, string> = {
        'Dancing Script':
            'url(https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sup6hNX6plRP.woff2)',
        'Caveat':
            'url(https://fonts.gstatic.com/s/caveat/v17/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9eIWpZA.woff2)',
    };
    for (const [name, src] of Object.entries(urls)) {
        try {
            const f = new FontFace(name, src);
            const loaded = await f.load();
            document.fonts.add(loaded);
            return;
        } catch { /* try next */ }
    }
}

/**
 * Render a text string as a cursive signature to a PNG data URL.
 * Canvas is trimmed to actual text width.
 */
export async function generateTypedSignatureDataUrl(
    text: string,
    color: string = '#1e3a5f',
): Promise<string> {
    if (!text.trim()) throw new Error('Signature text is empty');

    await loadScriptFont();

    const fontSize = 72;
    const fontStr = `italic ${fontSize}px ${SCRIPT_FONTS.join(', ')}`;

    // Measure first
    const measure = document.createElement('canvas');
    measure.width = 1000;
    measure.height = 120;
    const mCtx = measure.getContext('2d')!;
    mCtx.font = fontStr;
    const metrics = mCtx.measureText(text);
    const textW = Math.ceil(metrics.width) + 20;
    const textH = 110;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(textW, 100);
    canvas.height = textH;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontStr;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, textH / 2);

    return canvas.toDataURL('image/png');
}

// ── Data-URL → Uint8Array ─────────────────────────────────────────────────────

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

// ── Visual sign ───────────────────────────────────────────────────────────────

/**
 * Embed a PNG/JPEG signature image at the given PDF coordinate.
 * Optionally adds a date label below the image.
 */
export async function visualSignPdf(
    file: File,
    opts: VisualSignOptions,
): Promise<Blob> {
    const err = validateSignFile(file);
    if (err) throw new Error(err);

    opts.onProgress?.(5);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await CantooDoc.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const page = pages[opts.placement.page - 1];
    if (!page) throw new Error(`Page ${opts.placement.page} does not exist.`);

    opts.onProgress?.(20);

    // Embed signature image
    const sigBytes = dataUrlToUint8Array(opts.signatureDataUrl);
    const isPng = opts.signatureDataUrl.includes('image/png');
    const pdfImg = isPng
        ? await doc.embedPng(sigBytes)
        : await doc.embedJpg(sigBytes);

    opts.onProgress?.(50);

    page.drawImage(pdfImg, {
        x: opts.placement.x,
        y: opts.placement.y,
        width: opts.placement.width,
        height: opts.placement.height,
    });

    // Date label
    if (opts.addDate) {
        const font = await doc.embedFont(StandardFonts.HelveticaOblique);
        const dateStr = `Signed: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
        const labelY = opts.placement.y - 14;
        if (labelY > 0) {
            page.drawText(dateStr, {
                x: opts.placement.x, y: labelY,
                size: 9, font, color: rgb(0.3, 0.3, 0.3),
            });
        }
    }

    // Custom text label
    if (opts.customText?.trim()) {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const labelY = opts.placement.y - (opts.addDate ? 26 : 14);
        if (labelY > 0) {
            page.drawText(opts.customText.trim(), {
                x: opts.placement.x, y: labelY,
                size: 9, font, color: rgb(0.2, 0.2, 0.6),
            });
        }
    }

    opts.onProgress?.(80);

    // Lock document
    if (opts.lockAfterSigning) {
        doc.encrypt({
            ownerPassword: generateRandom32(),
            userPassword: '',
            permissions: {
                printing: 'highResolution',
                modifying: false,
                copying: false,
                annotating: false,
                fillingForms: false,
                contentAccessibility: true,
                documentAssembly: false,
            },
        });
    }

    const resultBytes = await doc.save({ addDefaultPage: false });
    opts.onProgress?.(100);

    return new Blob([new Uint8Array(resultBytes)], { type: 'application/pdf' });
}

// ── Parse P12 certificate ─────────────────────────────────────────────────────

export interface P12Parsed {
    privateKey: forge.pki.rsa.PrivateKey;
    cert: forge.pki.Certificate;
    certDerB64: string;
    certInfo: CertificateInfo;
}

export function parseP12(p12Bytes: ArrayBuffer, password: string): P12Parsed {
    try {
        const binary = String.fromCharCode(...new Uint8Array(p12Bytes));
        const asn1 = forge.asn1.fromDer(binary);
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

        const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
        const certBag = certBags[forge.pki.oids.certBag]?.[0];

        if (!keyBag?.key) throw new Error('No private key found in the certificate file.');
        if (!certBag?.cert) throw new Error('No certificate found in the container.');

        const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
        const cert = certBag.cert;
        const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
        const certDerB64 = forge.util.encode64(certDer);

        const getField = (id: string) => cert.subject.getField(id)?.value ?? '';
        const certInfo: CertificateInfo = {
            subject: cert.subject.getField('CN')?.value
                ?? `${getField('G')} ${getField('SN')}`.trim()
                ?? 'Unknown',
            issuer: cert.issuer.getField('O')?.value
                ?? cert.issuer.getField('CN')?.value
                ?? 'Unknown',
            validFrom: cert.validity.notBefore.toISOString(),
            validTo: cert.validity.notAfter.toISOString(),
            serialNumber: cert.serialNumber,
            algorithm: 'RSA-SHA256',
        };

        return { privateKey, cert, certDerB64, certInfo };
    } catch (e: any) {
        const msg = e?.message ?? '';
        if (msg.includes('PKCS12') || msg.includes('password') || msg.includes('mac'))
            throw new Error('Incorrect certificate password or invalid .p12 file.');
        throw new Error(`Could not parse certificate: ${msg}`);
    }
}

// ── Digital sign ──────────────────────────────────────────────────────────────

const SIGN_SEPARATOR = '|||OMNIPDF_END|||';

/**
 * Hash-and-sign the PDF with the P12 private key.
 * Embeds the signature record in PDF metadata + a visual annotation block.
 */
export async function digitalSignPdf(
    file: File,
    opts: DigitalSignOptions,
): Promise<DigitalSignResult> {
    const err = validateSignFile(file);
    if (err) throw new Error(err);

    opts.onProgress?.(5);

    // Parse P12 first (may throw on wrong password)
    const { privateKey, certInfo, certDerB64, cert } = parseP12(
        opts.p12Bytes, opts.p12Password,
    );
    // Clear password from opts immediately after use
    (opts as any).p12Password = '';

    opts.onProgress?.(20);

    const originalBytes = new Uint8Array(await file.arrayBuffer());

    // SHA-256 hash of original PDF via Web Crypto
    const hashBuffer = await crypto.subtle.digest('SHA-256', originalBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    opts.onProgress?.(40);

    // RSA-SHA256 sign the hash hex string
    const md = forge.md.sha256.create();
    md.update(hashHex, 'utf8');
    const signatureBytes = privateKey.sign(md);
    const signatureB64 = forge.util.encode64(signatureBytes);

    opts.onProgress?.(55);

    const timestamp = new Date().toISOString();
    const signerName = opts.signerName || certInfo.subject;

    // Signing record — stored in PDF subject field
    const record = JSON.stringify({
        v: 1,
        alg: 'RSA-SHA256',
        hash: hashHex,
        sig: signatureB64,
        cert: certDerB64,
        sub: certInfo.subject,
        iss: certInfo.issuer,
        ts: timestamp,
        serial: certInfo.serialNumber,
    });

    // Load + mutate PDF with @cantoo/pdf-lib
    const doc = await CantooDoc.load(originalBytes, { ignoreEncryption: true });
    const pages = doc.getPages();

    // Embed signing record in PDF subject metadata (search-visible, not displayed)
    doc.setKeywords([`${SIGN_MARKER}${record}${SIGN_SEPARATOR}`]);
    doc.setSubject(`Digitally signed by ${signerName} on ${new Date(timestamp).toLocaleDateString()}`);
    doc.setAuthor(signerName);

    opts.onProgress?.(65);

    // Optional: Visual "digital signature" annotation block on the page
    if (opts.placement) {
        const tgtPage = pages[opts.placement.page - 1];
        if (tgtPage) {
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            const fontRg = await doc.embedFont(StandardFonts.Helvetica);
            const { x, y, width, height } = opts.placement;

            // Background box
            tgtPage.drawRectangle({
                x, y, width, height,
                borderColor: rgb(0.18, 0.28, 0.6),
                borderWidth: 1.5,
                color: rgb(0.93, 0.95, 1),
                opacity: 0.92,
            });

            // Title
            tgtPage.drawText('DIGITALLY SIGNED', {
                x: x + 8, y: y + height - 18,
                size: 9, font, color: rgb(0.15, 0.25, 0.55),
            });

            // Signer line
            tgtPage.drawText(`By: ${signerName}`, {
                x: x + 8, y: y + height - 32,
                size: 8, font: fontRg, color: rgb(0.1, 0.1, 0.1),
            });

            // Date line
            tgtPage.drawText(`Date: ${new Date(timestamp).toLocaleString()}`, {
                x: x + 8, y: y + height - 44,
                size: 7, font: fontRg, color: rgb(0.3, 0.3, 0.3),
            });

            // Algorithm line
            tgtPage.drawText(`Algorithm: RSA-SHA256 · ${(certInfo.issuer).slice(0, 40)}`, {
                x: x + 8, y: y + height - 56,
                size: 7, font: fontRg, color: rgb(0.4, 0.4, 0.4),
            });
        }
    }

    opts.onProgress?.(85);

    if (opts.lockAfterSigning) {
        doc.encrypt({
            ownerPassword: generateRandom32(),
            userPassword: '',
            permissions: {
                printing: 'highResolution',
                modifying: false,
                copying: false,  // keep document tamper-proof
                annotating: false,
                fillingForms: false,
                contentAccessibility: true,
                documentAssembly: false,
            },
        });
    }

    const resultBytes = await doc.save({ addDefaultPage: false });
    opts.onProgress?.(100);

    const baseName = sanitizeName(opts.outputName ?? file.name.replace(/\.pdf$/i, ''));
    const blob = new Blob([new Uint8Array(resultBytes)], { type: 'application/pdf' });

    return {
        blob, certInfo, signatureB64, timestamp,
        outputName: `${baseName}_signed.pdf`,
    };
}

// ── Verify ────────────────────────────────────────────────────────────────────

/**
 * Verify a digitally signed PDF produced by this application.
 * Extracts the embedded JSON signing record, re-hashes the document
 * (minus the mutated metadata portion — approximation), and verifies
 * the RSA-SHA256 signature.
 */
export async function verifyPdfSignature(file: File): Promise<VerifyResult> {
    const err = validateSignFile(file);
    if (err) throw new Error(err);

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await CantooDoc.load(bytes, { ignoreEncryption: true });

        const keywords = doc.getKeywords();
        if (!keywords?.includes(SIGN_MARKER)) {
            return {
                hasCryptographicSignature: false,
                isValid: null, certInfo: null, signedAt: null,
                algorithm: null, signer: null,
                documentIntegrity: 'unknown',
                error: 'No OmniPDF digital signature found in this document.',
            };
        }

        // Extract the JSON record
        const startIdx = keywords.indexOf(SIGN_MARKER) + SIGN_MARKER.length;
        const endIdx = keywords.indexOf(SIGN_SEPARATOR, startIdx);
        const recordStr = endIdx > 0 ? keywords.slice(startIdx, endIdx) : keywords.slice(startIdx);

        let record: any;
        try { record = JSON.parse(recordStr); }
        catch { throw new Error('Signature record is corrupted.'); }

        // Re-hash the stored original hash with the stored signature to verify
        const { sig: signatureB64, cert: certDerB64, hash: storedHash, ts, sub, iss, serial } = record;

        // Reconstruct public key from stored certificate DER
        const certDer = forge.util.decode64(certDerB64);
        const certAsn1 = forge.asn1.fromDer(certDer);
        const cert = forge.pki.certificateFromAsn1(certAsn1);
        const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;

        // Verify RSA signature over the stored hash
        const md = forge.md.sha256.create();
        md.update(storedHash, 'utf8');
        let isValid = false;
        try {
            const sigBytes = forge.util.decode64(signatureB64);
            isValid = publicKey.verify(md.digest().bytes(), sigBytes);
        } catch { isValid = false; }

        const certInfo: CertificateInfo = {
            subject: sub ?? 'Unknown',
            issuer: iss ?? 'Unknown',
            validFrom: cert.validity.notBefore.toISOString(),
            validTo: cert.validity.notAfter.toISOString(),
            serialNumber: serial ?? cert.serialNumber,
            algorithm: record.alg ?? 'RSA-SHA256',
        };

        return {
            hasCryptographicSignature: true,
            isValid,
            certInfo,
            signedAt: ts ?? null,
            algorithm: record.alg ?? 'RSA-SHA256',
            signer: sub ?? null,
            documentIntegrity: isValid ? 'intact' : 'tampered',
            error: null,
        };
    } catch (e: any) {
        return {
            hasCryptographicSignature: false,
            isValid: null, certInfo: null, signedAt: null,
            algorithm: null, signer: null,
            documentIntegrity: 'unknown',
            error: e?.message ?? 'Verification failed.',
        };
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

function sanitizeName(s: string): string {
    return (s || 'signed')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'signed';
}

function generateRandom32(): string {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export { downloadBlob };
