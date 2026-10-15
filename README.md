# 📧 TempMail - Disposable Email Service

A self-hosted temporary email service built with Next.js and Node.js SMTP server. Create disposable email addresses instantly and receive emails in real-time.

![TempMail Screenshot](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Node.js](https://img.shields.io/badge/Node.js-20-green?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

## ✨ Features

- 🚀 **Instant Email Generation** - Generate random or custom email addresses
- 📬 **Real-time Email Reception** - Receive emails instantly via SMTP
- 💾 **Persistent Storage** - SQLite-backed storage ensures emails survive restarts
- 🎨 **Modern UI** - Beautiful dark/light theme with glassmorphism design
- 📱 **Mobile Optimized** - Native-like experience with fullscreen modals and touch gestures
- 🔍 **Search & Filter** - Find emails quickly with search and filters
- 📎 **Attachments Support** - View and download email attachments
- 🗑️ **Trash & Restore** - Soft delete with restore capability
- ⏱️ **Auto-Expiry** - Emails auto-delete after 1 hour (extendable by 1 more hour)
- 📋 **QR Code** - Share email address via QR code
- 🔔 **Notifications** - Browser notifications for new emails
- 🌐 **Multi-Domain Support** - Configure multiple email domains

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React, TypeScript
- **Backend**: Node.js, SMTP Server, Better SQLite3
- **Styling**: CSS with CSS Variables
- **Icons**: Lucide React

## 💻 Local Development & Testing

You can run the entire stack locally without a VPS!

### 1. Setup Local Environment
Create `.env.local`:
```bash
SMTP_PORT=2525
HTTP_PORT=3001
MAIL_DOMAIN=tempmail.local
NEXTJS_API=http://localhost:3000
```

### 2. Run Application
Terminal 1 (Next.js App):
```bash
npm run dev
```

Terminal 2 (Local SMTP Server):
```bash
npm run smtp:local
```
*Runs on port 2525 to avoid permission issues.*

### 3. Send Test Email
Terminal 3 (Simulate Email):
```bash
npm run send-test
# OR specify recipient:
npm run send-test custom@tempmail.local
```
*This sends a multipart email (HTML + Text + Attachment) to your local server.*

## 📋 Requirements

- Node.js 20 or higher
- A VPS with port 25 open (for SMTP)
- Domain with DNS access

## 🚀 Quick Deploy (VPS)

### 1. Setup DNS Records

Add these DNS records to your domain:

| Type | Name | Value | Notes |
|------|------|-------|-------|
| A | @ | YOUR_VPS_IP | Main domain |
| A | mail | YOUR_VPS_IP | Mail subdomain |
| MX | @ | mail.yourdomain.com | Priority: 10 |

### 2. One-Line Install

SSH to your VPS and run:

```bash
curl -O https://raw.githubusercontent.com/0xD4nz/temp-mail/main/deploy-vps.sh
chmod +x deploy-vps.sh
./deploy-vps.sh
```

The script will prompt for your domain and email, then automatically:
- Install Node.js 20, PM2, Nginx
- Clone and build the application
- Configure Nginx reverse proxy
- Setup firewall rules
- Optionally install SSL certificate

### 3. Manual Installation

```bash
# Clone repository
git clone https://github.com/0xD4nz/temp-mail.git
cd temp-mail

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
nano .env.local
```

Edit `.env.local`:
```env
MAIL_DOMAIN=yourdomain.com
NEXT_PUBLIC_MAIL_DOMAIN=yourdomain.com
# For multiple domains (comma-separated):
# MAIL_DOMAINS=domain1.com,domain2.com,domain3.com
```

Build and run:
```bash
# Build
npm run build

# Start Next.js
npm start

# Start SMTP Server (requires root for port 25)
sudo node server/smtp.js
```

## 📦 Using PM2 (Production)

```bash
# Install PM2
npm install -g pm2

# Start Next.js
pm2 start npm --name "tempmail-web" -- start

# Start SMTP Server
sudo pm2 start server/smtp.js --name "tempmail-smtp"

# Save and enable startup
pm2 save
pm2 startup
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIL_DOMAIN` | Primary email domain | tempmail.local |
| `MAIL_DOMAINS` | Recipient domains the SMTP server accepts (comma-separated). Mail to other domains is rejected with 550 | value of `MAIL_DOMAIN` |
| `NEXT_PUBLIC_MAIL_DOMAIN` | Frontend display domain | tempmail.local |
| `SMTP_PORT` | SMTP server port | 25 |
| `HTTP_PORT` | SMTP health API port | 3001 |
| `MAX_MESSAGE_SIZE` | Max inbound email size in bytes (SMTP) | 10485760 (10 MB) |
| `MAX_POST_BODY` | Max `/api/emails` POST body in bytes | 12582912 (12 MB) |
| `NEXTJS_API` | Base URL the SMTP server syncs received mail to | http://localhost:3000 |
| `DB_PATH` | SQLite database path (must match for both processes) | `<cwd>/data/tempmail.db` |
| `INTERNAL_API_SECRET` | Shared secret: SMTP server sends it as `x-internal-secret`, `/api/emails` POST requires it. **Set the same value for both processes** — without it anyone can forge emails into any inbox | (unset = unauthenticated, warns in logs) |

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 📱 Usage

1. **Generate Email**: Click "New Email" or use the custom username option
2. **Receive Emails**: Emails appear automatically in the inbox
3. **View Email**: Click on an email to view full content
4. **Maximize Inbox**: Click the maximize button to expand inbox view
5. **Copy Address**: Click "Copy" to copy email to clipboard
6. **Extend Time**: Click "Extend" to add 1 hour (max 2 hours total)
7. **Delete Inbox**: Click "Delete" to permanently remove inbox

## 🔒 Security Considerations

- This is a **temporary email service** - do not use for sensitive data
- Emails are stored in SQLite (`data/tempmail.db`, git-ignored) and survive restarts
- Set `INTERNAL_API_SECRET` to the same random value for both the web and SMTP processes, otherwise anyone can POST forged emails into any inbox
- The SMTP server only accepts recipients at `MAIL_DOMAINS` and discards messages over `MAX_MESSAGE_SIZE`
- Configure firewall to only allow necessary ports
- Consider adding rate limiting for production use

## 📄 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/generate` | Generate new email |
| POST | `/api/generate` | Create email with custom username |
| GET | `/api/emails?address=xxx` | Get emails for address |
| POST | `/api/emails` | Receive email (from SMTP) |
| DELETE | `/api/emails?address=xxx&id=yyy` | Delete email |
| GET | `/api/inbox?address=xxx` | Get inbox details |
| PATCH | `/api/inbox?action=extend` | Extend inbox expiry |
| DELETE | `/api/inbox?address=xxx` | Delete inbox |
| GET | `/api/qrcode?text=xxx` | Generate QR code |

## 🐛 Troubleshooting

### Port 25 blocked
Many VPS providers block port 25 by default. Contact support to open it.

### Emails not arriving
1. Check DNS MX record: `dig MX yourdomain.com`
2. Check SMTP server logs: `pm2 logs tempmail-smtp`
3. Verify port 25 is open: `sudo netstat -tlnp | grep 25`

### SSL redirect loop
Ensure Nginx config doesn't have conflicting redirects. Use HTTP first, then add SSL.

## 📝 License

MIT License - feel free to use and modify.

## 🙏 Credits

- Built with [Next.js](https://nextjs.org/)
- Icons by [Lucide](https://lucide.dev/)
- SMTP server using [smtp-server](https://nodemailer.com/extras/smtp-server/)

---

Made with ❤️ by [0xD4nz](https://github.com/0xD4nz)
