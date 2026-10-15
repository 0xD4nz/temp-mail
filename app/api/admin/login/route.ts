import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// POST /api/admin/login { password } -> sets httpOnly cookie on success
export async function POST(request: NextRequest) {
    if (!ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'admin_not_configured' }, { status: 503 });
    }

    let password = '';
    try {
        const body = await request.json();
        password = String(body?.password ?? '');
    } catch {
        // ignore malformed body
    }

    // Constant-time compare against the configured password
    const a = Buffer.from(password, 'utf8');
    const b = Buffer.from(ADMIN_PASSWORD, 'utf8');
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
        return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, getAdminToken(), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
    });
    return res;
}
