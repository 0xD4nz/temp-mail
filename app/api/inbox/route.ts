import { NextRequest, NextResponse } from 'next/server';
import { getInbox, extendInbox, getAllInboxes, deleteInbox } from '@/lib/emailStore';

// GET /api/inbox?address=xxx - Get inbox info
// GET /api/inbox?all=true - Get all inboxes
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');
        const all = searchParams.get('all') === 'true';

        if (all) {
            const inboxes = getAllInboxes();
            return NextResponse.json({
                success: true,
                inboxes,
                count: inboxes.length,
            });
        }

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Address required' },
                { status: 400 }
            );
        }

        const inbox = getInbox(address);
        if (!inbox) {
            return NextResponse.json(
                { success: false, error: 'Inbox not found' },
                { status: 404 }
            );
        }

        // Calculate remaining extend time
        const remainingExtendMs = Math.max(0, inbox.maxExpiresAt - inbox.expiresAt);
        const canExtend = remainingExtendMs > 0;

        return NextResponse.json({
            success: true,
            inbox,
            canExtend,
            remainingExtendMinutes: Math.floor(remainingExtendMs / 60000),
        });
    } catch (error) {
        console.error('Error fetching inbox:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch inbox' },
            { status: 500 }
        );
    }
}

// PATCH /api/inbox - Update inbox settings
export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');
        const action = searchParams.get('action');

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Address required' },
                { status: 400 }
            );
        }

        // Extend inbox expiration
        if (action === 'extend') {
            const result = extendInbox(address);

            if (!result.success) {
                return NextResponse.json(
                    { success: false, error: result.message },
                    { status: 400 }
                );
            }

            return NextResponse.json({
                success: true,
                message: result.message,
                expiresAt: result.newExpiresAt,
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Error updating inbox:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update inbox' },
            { status: 500 }
        );
    }
}

// DELETE /api/inbox?address=xxx - Delete inbox completely
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Address required' },
                { status: 400 }
            );
        }

        const deleted = deleteInbox(address);

        if (!deleted) {
            return NextResponse.json(
                { success: false, error: 'Inbox not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Inbox deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting inbox:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete inbox' },
            { status: 500 }
        );
    }
}
