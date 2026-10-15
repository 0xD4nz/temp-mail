import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAllDomains, addDomain, removeDomain } from '@/lib/database';

const FRIENDLY_ERRORS: Record<string, string> = {
    invalid_domain: 'Invalid domain format',
    domain_exists: 'Domain already exists',
    cannot_remove_last_domain: 'Cannot remove the last domain',
    domain_not_found: 'Domain not found',
};

function domainError(err: unknown) {
    const code = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.json(
        { error: FRIENDLY_ERRORS[code] || code },
        { status: 400 }
    );
}

// GET /api/admin/domains -> { domains: [{ domain, isPrimary }] }
export async function GET(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json({ domains: getAllDomains() });
}

// POST /api/admin/domains { domain } -> { ok: true, domains }
export async function POST(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    let domain = '';
    try {
        const body = await request.json();
        domain = String(body?.domain ?? '');
    } catch {
        // ignore malformed body
    }

    if (!domain.trim()) {
        return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    try {
        addDomain(domain);
    } catch (err) {
        return domainError(err);
    }
    return NextResponse.json({ ok: true, domains: getAllDomains() });
}

// DELETE /api/admin/domains?domain= -> { ok: true, domains }
export async function DELETE(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
        return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    try {
        removeDomain(domain);
    } catch (err) {
        return domainError(err);
    }
    return NextResponse.json({ ok: true, domains: getAllDomains() });
}
