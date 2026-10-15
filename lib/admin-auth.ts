// Stateless admin authentication for the /admin panel.
// The token is HMAC-SHA256(ADMIN_PASSWORD, 'tmail-admin-v1') - no server-side
// session storage needed, and it automatically invalidates on password change.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TOKEN_LABEL = 'tmail-admin-v1';
export const ADMIN_COOKIE_NAME = 'tmail_admin';

// Compute the expected token for the configured password. Empty when no
// admin password is configured.
export function getAdminToken(): string {
    if (!ADMIN_PASSWORD) return '';
    return crypto.createHmac('sha256', ADMIN_PASSWORD).update(TOKEN_LABEL).digest('hex');
}

export function verifyAdminToken(token: string | null | undefined): boolean {
    if (!ADMIN_PASSWORD || !token) return false;
    const expected = getAdminToken();
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export function getAdminTokenFromRequest(req: NextRequest): string | null {
    return req.cookies.get(ADMIN_COOKIE_NAME)?.value ?? null;
}

// Returns { ok: true } when authorized, otherwise an error JSON Response.
// 503 when no admin password is configured at all, 401 when the token is wrong.
export function requireAdmin(req: NextRequest): { ok: true } | NextResponse {
    if (!ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
    }
    if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return { ok: true };
}
