// Verification code (OTP) auto-detection for incoming emails.
// Extracts codes like "Your verification code is 123456" from the subject,
// plain text, or HTML body so the UI can surface them prominently.

export interface DetectedCode {
    code: string;
    confidence: 'high' | 'medium';
}

// Keywords that signal "a code follows / precedes" (English + Indonesian)
const KEYWORD = String.raw`verific\w*|verif\w*|otp|kode|code|pin|token|sandi\s*sementara|2fa|two[\s-]?factor|autentik\w*|authentica\w*|konfirmasi|confirm\w*|security\s*code|login\s*code`;

// A run of 4-8 digits, allowing spaces/dashes inside ("123 456", "12-34-56")
const DIGITS = String.raw`\d[\d\s\-]{2,10}\d`;

// keyword ... code  (e.g. "Your verification code is 123456", "Kode: 123 456")
const KEYWORD_BEFORE_CODE = new RegExp(`(?:${KEYWORD})[^\\d]{0,50}?(${DIGITS})`, 'i');
// code ... keyword  (e.g. "123456 is your verification code", "G-123456 is your Google verification code")
const CODE_BEFORE_KEYWORD = new RegExp(`(${DIGITS})[^\\d]{0,50}?(?:${KEYWORD})`, 'i');
const KEYWORD_ANYWHERE = new RegExp(`(?:${KEYWORD})`, 'i');

function stripHtmlToText(html: string): string {
    return (html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeDigits(raw: string): string {
    return raw.replace(/[\s\-]/g, '');
}

function looksLikeYear(code: string): boolean {
    if (code.length !== 4) return false;
    const year = parseInt(code, 10);
    return year >= 1900 && year <= 2100;
}

function tryCandidate(raw: string, keywordNearby: boolean): string | null {
    const code = normalizeDigits(raw);
    if (!/^\d{4,8}$/.test(code)) return null;
    // 4-digit standalone matches are often years - require a keyword for those
    if (code.length === 4 && !keywordNearby && looksLikeYear(code)) return null;
    return code;
}

export function extractVerificationCode(
    subject: string,
    text: string,
    html: string
): DetectedCode | null {
    const sources = [
        subject || '',
        text || '',
        stripHtmlToText(html || ''),
    ];

    // 1) High confidence: keyword adjacent to the digits (either order)
    for (const src of sources) {
        const m1 = src.match(KEYWORD_BEFORE_CODE) || src.match(CODE_BEFORE_KEYWORD);
        if (m1) {
            const code = tryCandidate(m1[1], true);
            if (code) return { code, confidence: 'high' };
        }
    }

    // 2) Medium confidence: standalone digit runs, most common OTP lengths first.
    //    4-digit runs additionally require a keyword somewhere in the text.
    //    Runs that look like order/ticket/reference numbers (#12345) are skipped.
    for (const len of [6, 8, 5, 7, 4]) {
        const re = new RegExp(`(?<!\\d)(\\d{${len}})(?!\\d)`, 'g');
        for (const src of sources) {
            for (const m of src.matchAll(re)) {
                const before = src.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
                if (/(?:#|no\.?|order|id|ref\.?|ticket)\s*$/i.test(before)) continue;
                const keywordNearby = KEYWORD_ANYWHERE.test(src);
                if (len === 4 && !keywordNearby) continue;
                const code = tryCandidate(m[1], keywordNearby);
                if (code) return { code, confidence: 'medium' };
            }
        }
    }

    return null;
}
