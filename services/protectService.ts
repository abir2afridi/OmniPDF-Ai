/**
 * protectService.ts — PDF Protect & Unlock Engine
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  PROTECT FLOW                                               │
 * │  ─────────────────────────────────────────────────────────  │
 * │  1. Validate file (type, size, corruption)                  │
 * │  2. Validate password strength (server-grade scoring)       │
 * │  3. Load PDF via @cantoo/pdf-lib                            │
 * │  4. Call doc.encrypt({ userPassword, ownerPassword,         │
 * │       permissions })  — real AES-128/AES-256 in-spec        │
 * │  5. doc.save() → encrypted bytes                            │
 * │  6. Return blob + security summary                          │
 * │                                                             │
 * │  UNLOCK FLOW                                                │
 * │  ─────────────────────────────────────────────────────────  │
 * │  1. Attempt load with pdfjs-dist (password aware)           │
 * │  2. If wrong password → throw with attempt counter          │
 * │  3. Re-render all pages via canvas into @cantoo/pdf-lib doc │
 * │  4. Save unencrypted                                        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Encryption level mapping:
 *   'aes128' → PDF 1.6 header   → @cantoo handles V=4, R=4, AESV2 (128-bit)
 *   'aes256' → PDF 1.7ext3 header → V=5, R=5, AESV3 (256-bit, SHA-256 key)
 *
 * Real encryption note:
 *   Production PDF viewers (Adobe, MacOS Preview, Chrome) will
 *   require the correct password to open the document. This is
 *   NOT a watermark or visual overlay — it is standards-compliant
 *   PDF 1.6/1.7 encryption embedded in the Encrypt dictionary.
 *
 * Security note:
 *   Passwords are never stored, logged, or persisted anywhere.
 *   The password variable is overwritten (zeroed) after encryption.
 *
 * Dependencies:
 *   @cantoo/pdf-lib — real PDF encryption / decryption
 *   pdfjs-dist      — PDF rendering for unlock via canvas
 */

import { PDFDocument as CantooDoc } from '@cantoo/pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// ── Public types ───────────────────────────────────────────────────────────────

export type EncryptionLevel = 'aes128' | 'aes256';

export interface PermissionSettings {
    allowPrinting: boolean;   // includes both low-res and high-res
    allowHighResPrinting: boolean;   // only meaningful if allowPrinting = true
    allowCopying: boolean;
    allowEditing: boolean;   // modifying content
    allowAnnotating: boolean;
    allowFillingForms: boolean;
    allowAccessibility: boolean;
    allowAssembly: boolean;
}

export const FULL_PERMISSIONS: PermissionSettings = {
    allowPrinting: true,
    allowHighResPrinting: true,
    allowCopying: true,
    allowEditing: true,
    allowAnnotating: true,
    allowFillingForms: true,
    allowAccessibility: true,
    allowAssembly: true,
};

export const READ_ONLY_PERMISSIONS: PermissionSettings = {
    allowPrinting: false,
    allowHighResPrinting: false,
    allowCopying: false,
    allowEditing: false,
    allowAnnotating: false,
    allowFillingForms: false,
    allowAccessibility: true,   // accessibility always on (best practice)
    allowAssembly: false,
};

export interface ProtectOptions {
    /** User password — required to open the PDF */
    userPassword: string;
    /** Owner password — full access password. Defaults to userPassword if omitted */
    ownerPassword?: string;
    encryptionLevel: EncryptionLevel;
    permissions: PermissionSettings;
    outputName?: string;
    onProgress?: (p: number) => void;
}

export interface ProtectResult {
    encryptedBlob: Blob;
    outputName: string;
    encryptionLevel: EncryptionLevel;
    permissions: PermissionSettings;
    originalSize: number;
    encryptedSize: number;
    passwordStrength: PasswordStrength;
}

export interface UnlockOptions {
    password: string;
    outputName?: string;
    onProgress?: (p: number) => void;
}

export interface UnlockResult {
    unlockedBlob: Blob;
    outputName: string;
    originalSize: number;
    unlockedSize: number;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export const PROTECT_MAX_MB = 100;

export function validatePdfForProtect(file: File): string | null {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
        return `"${file.name}" is not a PDF file.`;
    if (file.size > PROTECT_MAX_MB * 1024 * 1024)
        return `"${file.name}" exceeds the ${PROTECT_MAX_MB} MB limit.`;
    if (file.size === 0)
        return `"${file.name}" is empty.`;
    return null;
}

// ── Password strength ──────────────────────────────────────────────────────────

export type PasswordStrength = 'none' | 'weak' | 'fair' | 'strong' | 'excellent';

export interface PasswordScore {
    strength: PasswordStrength;
    score: number;   // 0–100
    suggestions: string[];
}

const COMMON_PASSWORDS = new Set([
    'password', '123456', '12345678', 'qwerty', 'abc123', 'password1',
    'letmein', 'welcome', 'admin', '1234567890', 'password123',
]);

export function scorePassword(pw: string): PasswordScore {
    if (!pw) return { strength: 'none', score: 0, suggestions: ['Enter a password.'] };

    const suggestions: string[] = [];
    let score = 0;

    // Length score (up to 40 pts)
    if (pw.length >= 6) score += 10;
    if (pw.length >= 10) score += 15;
    if (pw.length >= 14) score += 15;
    else suggestions.push('Use at least 14 characters for excellent security.');

    // Complexity (up to 40 pts)
    if (/[a-z]/.test(pw)) score += 8;
    else suggestions.push('Add lowercase letters.');
    if (/[A-Z]/.test(pw)) score += 10;
    else suggestions.push('Add uppercase letters.');
    if (/\d/.test(pw)) score += 10;
    else suggestions.push('Add numbers.');
    if (/[^a-zA-Z0-9]/.test(pw)) score += 12;
    else suggestions.push('Add special characters (!@#$%^&*).');

    // Unique chars (up to 20 pts)
    const unique = new Set(pw.toLowerCase()).size;
    score += Math.min(20, unique * 2);

    // Penalties
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) { score = Math.min(score, 10); suggestions.unshift('⚠ Very common password — avoid this!'); }
    if (/^(.)\1+$/.test(pw)) { score = Math.min(score, 15); suggestions.unshift('⚠ All characters are the same.'); }

    score = Math.min(100, Math.max(0, score));

    const strength: PasswordStrength =
        score < 20 ? 'weak'
            : score < 45 ? 'fair'
                : score < 70 ? 'strong'
                    : 'excellent';

    return { strength, score, suggestions };
}

// ── Permission mapper ──────────────────────────────────────────────────────────

function toCantooPerm(p: PermissionSettings) {
    return {
        printing: p.allowPrinting
            ? (p.allowHighResPrinting ? 'highResolution' as const : 'lowResolution' as const)
            : false as false,
        modifying: p.allowEditing,
        copying: p.allowCopying,
        annotating: p.allowAnnotating,
        fillingForms: p.allowFillingForms,
        contentAccessibility: p.allowAccessibility,
        documentAssembly: p.allowAssembly,
    };
}

// ── Encrypt ────────────────────────────────────────────────────────────────────

/**
 * Protect a PDF with real AES-128 or AES-256 PDF encryption.
 * The output file requires the correct user password to open.
 */
export async function protectPdf(
    file: File,
    opts: ProtectOptions,
): Promise<ProtectResult> {
    const err = validatePdfForProtect(file);
    if (err) throw new Error(err);

    const pwScore = scorePassword(opts.userPassword);
    if (pwScore.strength === 'none')
        throw new Error('A user password is required.');

    opts.onProgress?.(5);

    const bytes = new Uint8Array(await file.arrayBuffer());
    opts.onProgress?.(15);

    let doc: any;
    try {
        // @cantoo/pdf-lib — load with ignoreEncryption in case it was already encrypted
        doc = await CantooDoc.load(bytes, { ignoreEncryption: true });
    } catch {
        throw new Error(`"${file.name}" could not be opened — it may be corrupted.`);
    }

    opts.onProgress?.(30);

    // Set the PDF version header so @cantoo picks the right algorithm:
    //  PDF 1.6 → V=4, AES-128  |  PDF 1.7ext3 → V=5, AES-256
    if (opts.encryptionLevel === 'aes256') {
        (doc as any).context.header.set('1.7ext3');
    } else {
        (doc as any).context.header.set('1.6');
    }

    opts.onProgress?.(40);

    // Apply encryption
    doc.encrypt({
        userPassword: opts.userPassword,
        ownerPassword: opts.ownerPassword || opts.userPassword,
        permissions: toCantooPerm(opts.permissions),
    });

    opts.onProgress?.(70);

    const encryptedBytes = await doc.save({ addDefaultPage: false });

    // Zero out password reference (best-effort in JS)
    const _pw = opts.userPassword;
    (opts as any).userPassword = ''.padEnd(_pw.length, '\x00');

    opts.onProgress?.(95);

    const baseName = sanitizeName(opts.outputName ?? file.name.replace(/\.pdf$/i, ''));
    const blob = new Blob([encryptedBytes], { type: 'application/pdf' });

    opts.onProgress?.(100);

    return {
        encryptedBlob: blob,
        outputName: `${baseName}_protected.pdf`,
        encryptionLevel: opts.encryptionLevel,
        permissions: opts.permissions,
        originalSize: bytes.byteLength,
        encryptedSize: encryptedBytes.byteLength,
        passwordStrength: pwScore.strength,
    };
}

// ── Unlock ────────────────────────────────────────────────────────────────────

/** Rate-limit tracking — cleared after 5 minutes */
const unlockAttempts = new Map<string, { count: number; lastAt: number }>();
const UNLOCK_MAX_ATTEMPTS = 5;
const UNLOCK_BAN_MS = 5 * 60 * 1000; // 5 min

function checkUnlockRateLimit(fileKey: string): void {
    const now = Date.now();
    const rec = unlockAttempts.get(fileKey);
    if (rec && now - rec.lastAt < UNLOCK_BAN_MS && rec.count >= UNLOCK_MAX_ATTEMPTS) {
        const remaining = Math.ceil((UNLOCK_BAN_MS - (now - rec.lastAt)) / 1000);
        throw new Error(`Too many failed attempts. Try again in ${remaining}s.`);
    }
    if (!rec || now - rec.lastAt > UNLOCK_BAN_MS) {
        unlockAttempts.set(fileKey, { count: 0, lastAt: now });
    }
}

function recordFailedAttempt(fileKey: string): void {
    const rec = unlockAttempts.get(fileKey) ?? { count: 0, lastAt: Date.now() };
    rec.count++;
    rec.lastAt = Date.now();
    unlockAttempts.set(fileKey, rec);
}

function clearAttempts(fileKey: string): void {
    unlockAttempts.delete(fileKey);
}

/**
 * Unlock (remove password) from a PDF.
 * Renders each page via pdfjs → canvas, then reassembles with @cantoo/pdf-lib.
 * This fully removes all encryption — the output PDF needs no password to open.
 */
export async function unlockPdf(
    file: File,
    opts: UnlockOptions,
): Promise<UnlockResult> {
    const err = validatePdfForProtect(file);
    if (err) throw new Error(err);

    const fileKey = `${file.name}::${file.size}`;
    checkUnlockRateLimit(fileKey);

    opts.onProgress?.(5);

    const bytes = new Uint8Array(await file.arrayBuffer());
    opts.onProgress?.(10);

    // Step 1: Try to open the encrypted PDF with pdfjs using the provided password
    let pdfJs: any;
    try {
        pdfJs = await getDocument({ data: bytes.slice(), password: opts.password }).promise;
        clearAttempts(fileKey);
    } catch (e: any) {
        const msg = (e?.message ?? '').toLowerCase();
        if (msg.includes('password') || msg.includes('incorrect') || e?.name === 'PasswordException') {
            recordFailedAttempt(fileKey);
            const rec = unlockAttempts.get(fileKey);
            const remaining = UNLOCK_MAX_ATTEMPTS - (rec?.count ?? 0);
            throw new Error(
                remaining > 0
                    ? `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
                    : `Too many failed attempts. Please wait ${UNLOCK_BAN_MS / 60000} minutes.`
            );
        }
        throw new Error(`Could not open "${file.name}": ${e?.message ?? 'Unknown error'}`);
    }

    opts.onProgress?.(20);

    const totalPages = pdfJs.numPages;
    const newDoc = await CantooDoc.create();

    for (let pi = 1; pi <= totalPages; pi++) {
        opts.onProgress?.(20 + Math.round((pi / totalPages) * 70));

        const page = await pdfJs.getPage(pi);
        const vp = page.getViewport({ scale: 2.0 }); // 2× = ~144 DPI
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const jpegBlob: Blob = await new Promise((res, rej) =>
            canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.92)
        );
        const jpegBuf = new Uint8Array(await jpegBlob.arrayBuffer());
        const pdfImg = await newDoc.embedJpg(jpegBuf);
        const newPage = newDoc.addPage([canvas.width / 2, canvas.height / 2]); // back to 72 DPI pts
        newPage.drawImage(pdfImg, { x: 0, y: 0, width: canvas.width / 2, height: canvas.height / 2 });

        await new Promise(r => setTimeout(r, 0)); // yield to UI
    }

    opts.onProgress?.(92);

    const unlockedBytes = await newDoc.save({ useObjectStreams: true, addDefaultPage: false });
    const baseName = sanitizeName(opts.outputName ?? file.name.replace(/\.pdf$/i, ''));
    const blob = new Blob([unlockedBytes], { type: 'application/pdf' });

    opts.onProgress?.(100);

    return {
        unlockedBlob: blob,
        outputName: `${baseName}_unlocked.pdf`,
        originalSize: bytes.byteLength,
        unlockedSize: unlockedBytes.byteLength,
    };
}

// ── Batch ─────────────────────────────────────────────────────────────────────

export interface BatchProtectResult {
    succeeded: { fileName: string; result: ProtectResult }[];
    failed: { fileName: string; error: string }[];
}

export async function batchProtectPdf(
    files: File[],
    opts: Omit<ProtectOptions, 'onProgress'>,
    onJobProgress?: (name: string, p: number) => void,
): Promise<BatchProtectResult> {
    const succeeded: BatchProtectResult['succeeded'] = [];
    const failed: BatchProtectResult['failed'] = [];
    for (const file of files) {
        try {
            const result = await protectPdf(file, {
                ...opts,
                userPassword: opts.userPassword,
                ownerPassword: opts.ownerPassword,
                onProgress: p => onJobProgress?.(file.name, p),
            });
            succeeded.push({ fileName: file.name, result });
        } catch (e: any) {
            failed.push({ fileName: file.name, error: e?.message ?? 'Unknown error' });
        }
    }
    return { succeeded, failed };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
    return (s || 'protected')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120) || 'protected';
}

export function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

export const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; bg: string; width: string }> = {
    none: { label: '', color: 'text-gray-400', bg: 'bg-gray-200', width: 'w-0' },
    weak: { label: 'Weak', color: 'text-red-600', bg: 'bg-red-500', width: 'w-1/4' },
    fair: { label: 'Fair', color: 'text-orange-600', bg: 'bg-orange-400', width: 'w-2/4' },
    strong: { label: 'Strong', color: 'text-yellow-600', bg: 'bg-yellow-400', width: 'w-3/4' },
    excellent: { label: 'Excellent', color: 'text-emerald-600', bg: 'bg-emerald-500', width: 'w-full' },
};
