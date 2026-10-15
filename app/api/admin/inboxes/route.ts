import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { listInboxesAdmin, deleteInboxAdmin } from '@/lib/database';

// GET /api/admin/inboxes?search=&limit= -> { inboxes: [...] }
export async function GET(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    return NextResponse.json({ inboxes: listInboxesAdmin(search, limit) });
}

// DELETE /api/admin/inboxes?address= -> { ok: true } (404 when missing)
export async function DELETE(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
        return NextResponse.json({ error: 'address_required' }, { status: 400 });
    }

    const deleted = deleteInboxAdmin(address);
    if (!deleted) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
