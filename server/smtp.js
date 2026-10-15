// SMTP Server for TempMail - JavaScript version with SQLite
// Sends received emails to Next.js API for storage

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const http = require('http');
const https = require('https');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '25');
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001');
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || process.env.NEXT_PUBLIC_MAIL_DOMAIN || 'tempmail.local';
const NEXTJS_API = process.env.NEXTJS_API || 'http://localhost:3000';

// Max inbound message size (default 10 MB) - prevents memory exhaustion DoS
const MAX_MESSAGE_SIZE = parseInt(process.env.MAX_MESSAGE_SIZE || String(10 * 1024 * 1024), 10);

// Domains this server accepts mail for - anything else is rejected with 550.
// Comma-separated list; falls back to MAIL_DOMAIN for backward compatibility.
const ALLOWED_DOMAINS = (process.env.MAIL_DOMAINS || MAIL_DOMAIN)
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(d => d.length > 0);

// Shared secret for the SMTP -> Next.js sync endpoint (/api/emails POST).
// When set, the Next.js route requires the matching x-internal-secret header.
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';
if (!INTERNAL_API_SECRET) {
    console.log('⚠ INTERNAL_API_SECRET not set - /api/emails sync endpoint accepts unauthenticated posts');
}

// Database setup
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tempmail.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// SSL Setup
let sslOptions = {};
try {
    const certPath = process.env.SSL_CERT_PATH || `/etc/letsencrypt/live/${MAIL_DOMAIN}/fullchain.pem`;
    const keyPath = process.env.SSL_KEY_PATH || `/etc/letsencrypt/live/${MAIL_DOMAIN}/privkey.pem`;

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        sslOptions = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
        };
        console.log(`🔐 SSL Certificates loaded from: ${path.dirname(certPath)}`);
    } else {
        console.log('⚠ SSL Certificates not found, starting in non-secure mode');
        console.log(`  Looked in: ${certPath}`);
    }
} catch (err) {
    console.error('❌ Error loading SSL certificates:', err.message);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables if not exist
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
`);

function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Store email to database
function storeEmail(email) {
    const stmt = db.prepare(`
        INSERT INTO emails (id, inbox_address, from_address, subject, text_content, 
                           html_content, date, read, deleted, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `);

    stmt.run(
        email.id,
        email.to.toLowerCase(),
        email.from,
        email.subject,
        email.text,
        email.html,
        new Date(email.date).getTime(),
        JSON.stringify(email.attachments || [])
    );
}

// Check if inbox exists, if not create it
function ensureInbox(address) {
    const existing = db.prepare('SELECT address FROM inboxes WHERE address = ?').get(address.toLowerCase());

    if (!existing) {
        const now = Date.now();
        const initialExpiry = 60 * 60 * 1000; // 1 hour
        const maxExpiry = 2 * 60 * 60 * 1000; // 2 hours
        const domain = address.split('@')[1] || MAIL_DOMAIN;

        db.prepare(`
            INSERT INTO inboxes (address, created_at, expires_at, max_expires_at, is_custom, domain)
            VALUES (?, ?, ?, ?, 0, ?)
        `).run(address.toLowerCase(), now, now + initialExpiry, now + maxExpiry, domain);

        console.log(`   📫 Auto-created inbox for: ${address}`);
    }
}

// Also send to Next.js API for real-time updates
async function sendToNextJS(email) {
    try {
        const postData = JSON.stringify(email);
        const url = new URL('/api/emails', NEXTJS_API);
        const httpMod = url.protocol === 'https:' ? https : http;

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (INTERNAL_API_SECRET) {
            headers['x-internal-secret'] = INTERNAL_API_SECRET;
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: '/api/emails',
            method: 'POST',
            headers
        };

        return new Promise((resolve, reject) => {
            const req = httpMod.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log(`   → Synced to Next.js API (status: ${res.statusCode})`);
                    resolve(data);
                });
            });

            req.on('error', (err) => {
                console.log(`   ⚠ Next.js sync skipped: ${err.message}`);
                resolve(null);
            });

            req.setTimeout(10000, () => {
                console.log('   ⚠ Next.js sync timed out');
                req.destroy();
                resolve(null);
            });

            req.write(postData);
            req.end();
        });
    } catch (err) {
        console.error('Error sending to Next.js:', err);
    }
}

// Create SMTP Server
const smtp = new SMTPServer({
    secure: false, // Use STARTTLS
    ...sslOptions,
    authOptional: true,
    disabledCommands: ['AUTH'],
    // Advertise max message size to well-behaved clients (see manual enforcement below)
    size: MAX_MESSAGE_SIZE,
    onData(stream, session, callback) {
        let emailData = '';
        let receivedBytes = 0;
        let oversized = false;

        stream.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_MESSAGE_SIZE) {
                // Stop accumulating - discard the rest to protect memory
                oversized = true;
                return;
            }
            emailData += chunk.toString();
        });

        stream.on('end', async () => {
            if (oversized) {
                console.log(`   ⚠ Message too large (${receivedBytes} bytes > ${MAX_MESSAGE_SIZE}), discarded`);
                callback();
                return;
            }

            try {
                const parsed = await simpleParser(emailData);

                // Deliver to every envelope recipient, not just the first one
                const recipients = (session.envelope.rcptTo || [])
                    .map(r => r.address?.toLowerCase())
                    .filter(Boolean);

                if (recipients.length === 0) {
                    console.log('No recipient found');
                    callback();
                    return;
                }

                // Prefer the Date header; fall back to receive time
                const parsedDate = parsed.date instanceof Date && !isNaN(parsed.date.getTime())
                    ? parsed.date
                    : new Date();

                const attachments = (parsed.attachments || []).map(att => ({
                    filename: att.filename || 'attachment',
                    contentType: att.contentType || 'application/octet-stream',
                    size: att.size || 0,
                    content: att.content?.toString('base64') || ''
                }));

                for (const to of recipients) {
                    console.log(`📧 Email received for: ${to}`);
                    console.log(`   From: ${parsed.from?.text}`);
                    console.log(`   Subject: ${parsed.subject}`);

                    // Create email object
                    const email = {
                        id: generateId(),
                        to,
                        from: parsed.from?.text || 'Unknown',
                        subject: parsed.subject || '(No subject)',
                        text: parsed.text || '',
                        html: parsed.html || '',
                        date: parsedDate.toISOString(),
                        read: false,
                        deleted: false,
                        attachments
                    };

                    // Ensure inbox exists
                    ensureInbox(to);

                    // Store to database
                    storeEmail(email);
                    console.log(`   ✓ Stored to database`);

                    // Sync to Next.js API for real-time updates
                    await sendToNextJS(email);
                }

            } catch (err) {
                console.error('Error parsing email:', err);
            }

            callback();
        });
    },
    onConnect(session, callback) {
        console.log(`📡 Connection from: ${session.remoteAddress}`);
        callback();
    },
    onMailFrom(address, session, callback) {
        console.log(`   Mail from: ${address.address}`);
        callback();
    },
    onRcptTo(address, session, callback) {
        const recipient = (address.address || '').toLowerCase();
        const domain = recipient.split('@')[1] || '';
        console.log(`   Rcpt to: ${address.address}`);

        // Only accept mail for domains we actually serve
        if (!ALLOWED_DOMAINS.includes(domain)) {
            console.log(`   ✖ Rejected: domain not served here (${domain})`);
            const err = new Error(`Domain not served here: ${domain}`);
            err.responseCode = 550;
            return callback(err);
        }

        callback();
    }
});

// HTTP API for direct queries
const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    const address = url.searchParams.get('address')?.toLowerCase();

    if (url.pathname === '/emails' && address) {
        const stmt = db.prepare(`
            SELECT id, inbox_address as "to", from_address as "from", subject,
                   text_content as text, html_content as html, date, read, deleted, attachments
            FROM emails WHERE inbox_address = ? AND deleted = 0
            ORDER BY date DESC
        `);
        const emails = stmt.all(address).map(row => ({
            ...row,
            date: new Date(row.date),
            read: Boolean(row.read),
            deleted: Boolean(row.deleted),
            attachments: JSON.parse(row.attachments || '[]')
        }));

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, emails }));
        return;
    }

    if (url.pathname === '/health') {
        const stats = db.prepare('SELECT COUNT(*) as emails FROM emails').get();
        const inboxCount = db.prepare('SELECT COUNT(*) as inboxes FROM inboxes').get();
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'ok',
            database: 'sqlite',
            emails: stats.emails,
            inboxes: inboxCount.inboxes
        }));
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Cleanup expired inboxes and emails
function cleanup() {
    const now = Date.now();

    // Get expired inboxes
    const expired = db.prepare('SELECT address FROM inboxes WHERE expires_at <= ?').all(now);

    // Delete emails for expired inboxes
    const deleteEmails = db.prepare('DELETE FROM emails WHERE inbox_address = ?');
    let emailsDeleted = 0;
    for (const inbox of expired) {
        emailsDeleted += deleteEmails.run(inbox.address).changes;
    }

    // Delete expired inboxes
    const inboxesDeleted = db.prepare('DELETE FROM inboxes WHERE expires_at <= ?').run(now).changes;

    // Delete old trashed emails (1 hour - same as inbox expiry)
    const oneHourAgo = now - (60 * 60 * 1000);
    const trashedDeleted = db.prepare('DELETE FROM emails WHERE deleted = 1 AND deleted_at < ?').run(oneHourAgo).changes;

    if (inboxesDeleted > 0 || emailsDeleted > 0 || trashedDeleted > 0) {
        console.log(`🧹 Cleanup: ${inboxesDeleted} inboxes, ${emailsDeleted + trashedDeleted} emails removed`);
    }
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60 * 1000);

// Start servers
smtp.listen(SMTP_PORT, '0.0.0.0', () => {
    console.log('');
    console.log('==========================================');
    console.log('🚀 TempMail SMTP Server Started (SQLite)');
    console.log('==========================================');
    console.log(`📧 SMTP listening on port ${SMTP_PORT}`);
    console.log(`🌐 HTTP API on port ${HTTP_PORT}`);
    console.log(`📍 Mail domain: ${MAIL_DOMAIN}`);
    console.log(`📬 Accepted recipient domains: ${ALLOWED_DOMAINS.join(', ')}`);
    console.log(`📦 Max message size: ${(MAX_MESSAGE_SIZE / 1024 / 1024).toFixed(1)} MB`);
    console.log(`🗄️  Database: ${DB_PATH}`);
    console.log(`🔗 Next.js API: ${NEXTJS_API}`);
    console.log('==========================================');
    console.log('');

    // Initial cleanup
    cleanup();
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`HTTP API ready at http://localhost:${HTTP_PORT}`);
});

smtp.on('error', (err) => {
    console.error('SMTP Error:', err);
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    db.close();
    smtp.close();
    httpServer.close();
    process.exit(0);
});
