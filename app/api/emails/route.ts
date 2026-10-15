import { NextRequest, NextResponse } from 'next/server';
import {
    getEmails,
    deleteEmail,
    deleteAllEmails,
    markAsRead,
    getEmailById,
    searchEmails,
    getTrashedEmails,
    restoreEmail,
    permanentlyDeleteEmail,
    getInboxStats,
    addEmail,
    registerAddress,
    isAddressActive,
    Email
} from '@/lib/emailStore';

// Shared secret with the SMTP server (server/smtp.js sends it as x-internal-secret).
// When set, unauthenticated callers cannot forge emails into inboxes.
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';
if (!INTERNAL_API_SECRET) {
    console.warn('[api/emails] INTERNAL_API_SECRET is not set - POST accepts unauthenticated requests');
}

// Max accepted POST body (SMTP caps messages at MAX_MESSAGE_SIZE, default 10 MB)
const MAX_POST_BODY = parseInt(process.env.MAX_POST_BODY || String(12 * 1024 * 1024), 10);

// POST /api/emails - Receive email from SMTP server
export async function POST(request: NextRequest) {
    try {
        // Reject oversized bodies before parsing
        const contentLength = Number(request.headers.get('content-length') || 0);
        if (contentLength > MAX_POST_BODY) {
            return NextResponse.json(
                { success: false, error: 'Payload too large' },
                { status: 413 }
            );
        }

        // Authenticate the SMTP sync when a secret is configured
        if (INTERNAL_API_SECRET) {
            const provided = request.headers.get('x-internal-secret') || '';
            if (provided !== INTERNAL_API_SECRET) {
                return NextResponse.json(
                    { success: false, error: 'Forbidden' },
                    { status: 403 }
                );
            }
        }

        const body = await request.json();

        const { id, to, from, subject, text, html, date, attachments } = body;

        if (!to || !from) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Auto-register address if not active
        if (!isAddressActive(to)) {
            registerAddress(to, false);
        }

        const parsedDate = new Date(date);
        const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

        // Create email object
        const email: Email = {
            id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            to: to.toLowerCase(),
            from,
            subject: subject || '(No subject)',
            text: text || '',
            html: html || '',
            date: safeDate,
            read: false,
            deleted: false,
            attachments: attachments || []
        };

        // Store email
        addEmail(email);

        console.log(`📧 Email stored: ${to} from ${from}`);

        return NextResponse.json({
            success: true,
            message: 'Email received and stored',
            emailId: email.id
        });
    } catch (error) {
        console.error('Error receiving email:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to store email' },
            { status: 500 }
        );
    }
}

// GET /api/emails?address=xxx - Get all emails for address
// GET /api/emails?address=xxx&id=yyy - Get single email
// GET /api/emails?address=xxx&search=query - Search emails
// GET /api/emails?address=xxx&trash=true - Get trashed emails
// GET /api/emails?address=xxx&stats=true - Get inbox stats
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');
        const emailId = searchParams.get('id');
        const searchQuery = searchParams.get('search');
        const showTrash = searchParams.get('trash') === 'true';
        const showStats = searchParams.get('stats') === 'true';

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Email address is required' },
                { status: 400 }
            );
        }

        // Get inbox stats
        if (showStats) {
            const stats = getInboxStats(address);
            return NextResponse.json({
                success: true,
                stats,
            });
        }

        // Get trashed emails
        if (showTrash) {
            const trashedEmails = getTrashedEmails(address);
            return NextResponse.json({
                success: true,
                emails: trashedEmails,
                count: trashedEmails.length,
            });
        }

        // Get single email
        if (emailId) {
            const email = getEmailById(address, emailId);
            if (!email) {
                return NextResponse.json(
                    { success: false, error: 'Email not found' },
                    { status: 404 }
                );
            }

            // Mark as read
            markAsRead(address, emailId);

            return NextResponse.json({
                success: true,
                email,
            });
        }

        // Search emails
        if (searchQuery) {
            const results = searchEmails(address, searchQuery);
            return NextResponse.json({
                success: true,
                emails: results,
                count: results.length,
                query: searchQuery,
            });
        }

        // Get all emails
        const emails = getEmails(address);

        return NextResponse.json({
            success: true,
            emails,
            count: emails.length,
        });
    } catch (error) {
        console.error('Error fetching emails:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch emails' },
            { status: 500 }
        );
    }
}

// DELETE /api/emails?address=xxx&id=yyy - Delete single email (soft delete)
// DELETE /api/emails?address=xxx&id=yyy&permanent=true - Permanently delete
// DELETE /api/emails?address=xxx&all=true - Delete all emails
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');
        const emailId = searchParams.get('id');
        const deleteAll = searchParams.get('all') === 'true';
        const permanent = searchParams.get('permanent') === 'true';

        if (!address) {
            return NextResponse.json(
                { success: false, error: 'Email address is required' },
                { status: 400 }
            );
        }

        if (deleteAll) {
            deleteAllEmails(address);
            return NextResponse.json({
                success: true,
                message: 'All emails moved to trash',
            });
        }

        if (!emailId) {
            return NextResponse.json(
                { success: false, error: 'Email ID is required' },
                { status: 400 }
            );
        }

        let deleted: boolean;
        if (permanent) {
            deleted = permanentlyDeleteEmail(address, emailId);
        } else {
            deleted = deleteEmail(address, emailId);
        }

        if (!deleted) {
            return NextResponse.json(
                { success: false, error: 'Email not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: permanent ? 'Email permanently deleted' : 'Email moved to trash',
        });
    } catch (error) {
        console.error('Error deleting email:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete email' },
            { status: 500 }
        );
    }
}

// PATCH /api/emails - Restore email from trash
export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');
        const emailId = searchParams.get('id');
        const action = searchParams.get('action');

        if (!address || !emailId) {
            return NextResponse.json(
                { success: false, error: 'Address and email ID required' },
                { status: 400 }
            );
        }

        if (action === 'restore') {
            const restored = restoreEmail(address, emailId);
            if (!restored) {
                return NextResponse.json(
                    { success: false, error: 'Email not found in trash' },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Email restored from trash',
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Error updating email:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update email' },
            { status: 500 }
        );
    }
}
