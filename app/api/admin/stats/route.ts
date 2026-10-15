import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAdminStats, getAvailableDomains } from '@/lib/database';

// GET /api/admin/stats -> { inboxes, emails, emailsToday, dbSizeBytes, domains }
export async function GET(request: NextRequest) {
    const auth = requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const stats = getAdminStats();
    return NextResponse.json({
        ...stats,
        domains: getAvailableDomains(),
    });
}
