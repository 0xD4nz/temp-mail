// Database layer for TempMail using SQLite
import Database from 'better-sqlite3';
import path from 'path';

// Types
export interface Email {
    id: string;
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    date: Date;
    read: boolean;
    deleted: boolean;
    deletedAt?: Date;
    attachments: Attachment[];
}

export interface Attachment {
    filename: string;
    contentType: string;
    size: number;
    content: string;
}

export interface Inbox {
    address: string;
    createdAt: number;
    expiresAt: number;
    maxExpiresAt: number;
    isCustom: boolean;
    forwardTo?: string;
    domain: string;
}

// Database path
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tempmail.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS inboxes (
        address TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        max_expires_at INTEGER NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0,
        forward_to TEXT,
        domain TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        inbox_address TEXT NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT,
        text_content TEXT,
        html_content TEXT,
        date INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER,
        attachments TEXT,
        FOREIGN KEY (inbox_address) REFERENCES inboxes(address) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_emails_inbox ON emails(inbox_address);
    CREATE INDEX IF NOT EXISTS idx_emails_deleted ON emails(deleted);
    CREATE INDEX IF NOT EXISTS idx_inboxes_expires ON inboxes(expires_at);
`);

// Available domains
const DEFAULT_DOMAIN = process.env.MAIL_DOMAIN || process.env.NEXT_PUBLIC_MAIL_DOMAIN || 'tempmail.local';
export const AVAILABLE_DOMAINS = (process.env.MAIL_DOMAINS || DEFAULT_DOMAIN)
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);

export function getAvailableDomains(): string[] {
    return [...AVAILABLE_DOMAINS];
}

// Stats
export interface GlobalStats {
    totalEmailsReceived: number;
    totalEmailsDeleted: number;
    activeInboxes: number;
}

// ============ UTILITY FUNCTIONS ============

export function generateRandomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function isUsernameAvailable(username: string, domain: string): boolean {
    const address = `${username}@${domain}`.toLowerCase();
    const stmt = db.prepare('SELECT address FROM inboxes WHERE address = ?');
    const existing = stmt.get(address);
    return !existing;
}

// ============ INBOX FUNCTIONS ============

export function registerAddress(address: string, isCustom: boolean = false, domain?: string): Inbox {
    const now = Date.now();
    const initialExpiry = 60 * 60 * 1000; // 1 hour
    const maxExpiry = 2 * 60 * 60 * 1000; // 2 hours max

    const emailDomain = domain || address.split('@')[1] || AVAILABLE_DOMAINS[0];
    const lowerAddress = address.toLowerCase();

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO inboxes 
        (address, created_at, expires_at, max_expires_at, is_custom, domain)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        lowerAddress,
        now,
        now + initialExpiry,
        now + maxExpiry,
        isCustom ? 1 : 0,
        emailDomain
    );

    return {
        address: lowerAddress,
        createdAt: now,
        expiresAt: now + initialExpiry,
        maxExpiresAt: now + maxExpiry,
        isCustom,
        domain: emailDomain
    };
}

export function getInbox(address: string): Inbox | null {
    const stmt = db.prepare(`
        SELECT address, created_at as createdAt, expires_at as expiresAt, 
               max_expires_at as maxExpiresAt, is_custom as isCustom, 
               forward_to as forwardTo, domain
        FROM inboxes WHERE address = ?
    `);

    const row = stmt.get(address.toLowerCase()) as any;
    if (!row) return null;

    return {
        ...row,
        isCustom: Boolean(row.isCustom)
    };
}

export function isAddressActive(address: string): boolean {
    const inbox = getInbox(address);
    return inbox !== null && inbox.expiresAt > Date.now();
}

export function getAllInboxes(): Inbox[] {
    const now = Date.now();
    const stmt = db.prepare(`
        SELECT address, created_at as createdAt, expires_at as expiresAt,
               max_expires_at as maxExpiresAt, is_custom as isCustom,
               forward_to as forwardTo, domain
        FROM inboxes WHERE expires_at > ?
    `);

    return (stmt.all(now) as any[]).map(row => ({
        ...row,
        isCustom: Boolean(row.isCustom)
    }));
}

export function extendInbox(address: string, additionalMs: number = 60 * 60 * 1000) {
    const inbox = getInbox(address);
    if (!inbox) {
        return { success: false, message: 'Inbox not found' };
    }

    if (inbox.expiresAt >= inbox.maxExpiresAt) {
        return { success: false, message: 'Maximum extension reached. Cannot extend further.' };
    }

    const newExpiry = Math.min(inbox.expiresAt + additionalMs, inbox.maxExpiresAt);
    const actualExtension = newExpiry - inbox.expiresAt;

    if (actualExtension <= 0) {
        return { success: false, message: 'Maximum extension reached. Cannot extend further.' };
    }

    const stmt = db.prepare('UPDATE inboxes SET expires_at = ? WHERE address = ?');
    stmt.run(newExpiry, address.toLowerCase());

    const remainingExtend = Math.floor((inbox.maxExpiresAt - newExpiry) / 60000);
    return {
        success: true,
        message: remainingExtend > 0
            ? `Extended! ${remainingExtend} minutes of extension remaining.`
            : 'Extended! This is the maximum extension allowed.',
        newExpiresAt: newExpiry
    };
}

export function setForwardAddress(address: string, forwardTo?: string): boolean {
    const stmt = db.prepare('UPDATE inboxes SET forward_to = ? WHERE address = ?');
    const result = stmt.run(forwardTo || null, address.toLowerCase());
    return result.changes > 0;
}

export function deleteInbox(address: string): boolean {
    const stmt = db.prepare('DELETE FROM inboxes WHERE address = ?');
    const result = stmt.run(address.toLowerCase());
    return result.changes > 0;
}

// ============ EMAIL FUNCTIONS ============

export function addEmail(email: Email): void {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO emails (id, inbox_address, from_address, subject, text_content, 
                           html_content, date, read, deleted, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        email.id,
        email.to.toLowerCase(),
        email.from,
        email.subject,
        email.text,
        email.html,
        new Date(email.date).getTime(),
        email.read ? 1 : 0,
        email.deleted ? 1 : 0,
        JSON.stringify(email.attachments || [])
    );
}

export function getEmails(address: string): Email[] {
    const stmt = db.prepare(`
        SELECT id, inbox_address as "to", from_address as "from", subject,
               text_content as text, html_content as html, date, read, deleted,
               deleted_at as deletedAt, attachments
        FROM emails 
        WHERE inbox_address = ? AND deleted = 0
        ORDER BY date DESC
    `);

    return (stmt.all(address.toLowerCase()) as any[]).map(row => ({
        ...row,
        date: new Date(row.date),
        read: Boolean(row.read),
        deleted: Boolean(row.deleted),
        deletedAt: row.deletedAt ? new Date(row.deletedAt) : undefined,
        attachments: JSON.parse(row.attachments || '[]')
    }));
}

export function getEmailById(address: string, id: string): Email | null {
    const stmt = db.prepare(`
        SELECT id, inbox_address as "to", from_address as "from", subject,
               text_content as text, html_content as html, date, read, deleted,
               deleted_at as deletedAt, attachments
        FROM emails 
        WHERE inbox_address = ? AND id = ?
    `);

    const row = stmt.get(address.toLowerCase(), id) as any;
    if (!row) return null;

    return {
        ...row,
        date: new Date(row.date),
        read: Boolean(row.read),
        deleted: Boolean(row.deleted),
        deletedAt: row.deletedAt ? new Date(row.deletedAt) : undefined,
        attachments: JSON.parse(row.attachments || '[]')
    };
}

export function markAsRead(address: string, emailId: string): boolean {
    const stmt = db.prepare('UPDATE emails SET read = 1 WHERE inbox_address = ? AND id = ?');
    const result = stmt.run(address.toLowerCase(), emailId);
    return result.changes > 0;
}

export function deleteEmail(address: string, emailId: string): boolean {
    const now = Date.now();
    const stmt = db.prepare('UPDATE emails SET deleted = 1, deleted_at = ? WHERE inbox_address = ? AND id = ?');
    const result = stmt.run(now, address.toLowerCase(), emailId);
    return result.changes > 0;
}

export function deleteAllEmails(address: string): number {
    const now = Date.now();
    const stmt = db.prepare('UPDATE emails SET deleted = 1, deleted_at = ? WHERE inbox_address = ? AND deleted = 0');
    const result = stmt.run(now, address.toLowerCase());
    return result.changes;
}

export function getTrashedEmails(address: string): Email[] {
    const stmt = db.prepare(`
        SELECT id, inbox_address as "to", from_address as "from", subject,
               text_content as text, html_content as html, date, read, deleted,
               deleted_at as deletedAt, attachments
        FROM emails 
        WHERE inbox_address = ? AND deleted = 1
        ORDER BY deleted_at DESC
    `);

    return (stmt.all(address.toLowerCase()) as any[]).map(row => ({
        ...row,
        date: new Date(row.date),
        read: Boolean(row.read),
        deleted: Boolean(row.deleted),
        deletedAt: row.deletedAt ? new Date(row.deletedAt) : undefined,
        attachments: JSON.parse(row.attachments || '[]')
    }));
}

export function restoreEmail(address: string, emailId: string): boolean {
    const stmt = db.prepare('UPDATE emails SET deleted = 0, deleted_at = NULL WHERE inbox_address = ? AND id = ?');
    const result = stmt.run(address.toLowerCase(), emailId);
    return result.changes > 0;
}

export function permanentlyDeleteEmail(address: string, emailId: string): boolean {
    const stmt = db.prepare('DELETE FROM emails WHERE inbox_address = ? AND id = ?');
    const result = stmt.run(address.toLowerCase(), emailId);
    return result.changes > 0;
}

export function searchEmails(address: string, query: string): Email[] {
    const searchPattern = `%${query}%`;
    const stmt = db.prepare(`
        SELECT id, inbox_address as "to", from_address as "from", subject,
               text_content as text, html_content as html, date, read, deleted,
               attachments
        FROM emails 
        WHERE inbox_address = ? AND deleted = 0
          AND (subject LIKE ? OR from_address LIKE ? OR text_content LIKE ?)
        ORDER BY date DESC
    `);

    return (stmt.all(address.toLowerCase(), searchPattern, searchPattern, searchPattern) as any[]).map(row => ({
        ...row,
        date: new Date(row.date),
        read: Boolean(row.read),
        deleted: Boolean(row.deleted),
        attachments: JSON.parse(row.attachments || '[]')
    }));
}

// ============ STATS FUNCTIONS ============

export function getGlobalStats(): GlobalStats {
    const emailStats = db.prepare('SELECT COUNT(*) as total FROM emails').get() as any;
    const deletedStats = db.prepare('SELECT COUNT(*) as total FROM emails WHERE deleted = 1').get() as any;
    const inboxStats = db.prepare('SELECT COUNT(*) as total FROM inboxes WHERE expires_at > ?').get(Date.now()) as any;

    return {
        totalEmailsReceived: emailStats.total,
        totalEmailsDeleted: deletedStats.total,
        activeInboxes: inboxStats.total
    };
}

export function getInboxStats(address: string) {
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as totalReceived,
            SUM(CASE WHEN read = 1 THEN 1 ELSE 0 END) as totalRead,
            SUM(CASE WHEN deleted = 1 THEN 1 ELSE 0 END) as totalDeleted
        FROM emails WHERE inbox_address = ?
    `).get(address.toLowerCase()) as any;

    return {
        totalReceived: stats?.totalReceived || 0,
        totalRead: stats?.totalRead || 0,
        totalDeleted: stats?.totalDeleted || 0
    };
}

// ============ CLEANUP FUNCTIONS ============

export function cleanupExpired(): { deletedInboxes: number; deletedEmails: number } {
    const now = Date.now();

    // Get expired inbox addresses
    const expiredInboxes = db.prepare('SELECT address FROM inboxes WHERE expires_at <= ?').all(now) as any[];

    // Delete emails for expired inboxes
    const deleteEmails = db.prepare('DELETE FROM emails WHERE inbox_address = ?');
    let deletedEmails = 0;
    for (const inbox of expiredInboxes) {
        const result = deleteEmails.run(inbox.address);
        deletedEmails += result.changes;
    }

    // Delete expired inboxes
    const result = db.prepare('DELETE FROM inboxes WHERE expires_at <= ?').run(now);

    // Also permanently delete old trashed emails (older than 1 hour - same as inbox expiry)
    const oneHourAgo = now - (60 * 60 * 1000);
    const trashedResult = db.prepare('DELETE FROM emails WHERE deleted = 1 AND deleted_at < ?').run(oneHourAgo);

    return {
        deletedInboxes: result.changes,
        deletedEmails: deletedEmails + trashedResult.changes
    };
}

// Run cleanup every 5 minutes
setInterval(() => {
    const result = cleanupExpired();
    if (result.deletedInboxes > 0 || result.deletedEmails > 0) {
        console.log(`🧹 Cleanup: ${result.deletedInboxes} inboxes, ${result.deletedEmails} emails removed`);
    }
}, 5 * 60 * 1000);

// Initial cleanup on start
cleanupExpired();

export default db;
