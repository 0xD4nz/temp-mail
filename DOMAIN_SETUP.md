# 📧 Domain Setup Guide - TempMail

Panduan lengkap untuk menggunakan domain sendiri dengan TempMail.

## 📋 Prerequisites

- VPS/Server dengan IP publik (contoh: DigitalOcean, Vultr, Linode)
- Domain yang sudah dimiliki
- Node.js 18+ terinstall di server
- Port 25 dan 587 terbuka di firewall

## 🔧 Step 1: DNS Configuration

Login ke DNS provider Anda (Cloudflare, Namecheap, etc.) dan tambahkan records berikut:

### A Record
Buat A record untuk mail server:

| Type | Name | Value |
|------|------|-------|
| A | mail | `YOUR_SERVER_IP` |
| A | @ | `YOUR_SERVER_IP` |

### MX Record
Buat MX record untuk menerima email:

| Type | Name | Priority | Value |
|------|------|----------|-------|
| MX | @ | 10 | `mail.yourdomain.com` |

### SPF Record (Optional - untuk mengirim email)
| Type | Name | Value |
|------|------|-------|
| TXT | @ | `v=spf1 ip4:YOUR_SERVER_IP -all` |

### Contoh DNS untuk domain `tempmail.com`:
```
A     mail    203.0.113.50
MX    @       10 mail.tempmail.com
TXT   @       v=spf1 ip4:203.0.113.50 -all
```

⚠️ **Penting**: DNS propagation bisa memakan waktu 1-48 jam!

## 🔥 Step 2: Server Firewall

Buka port yang diperlukan:

### Ubuntu/Debian (ufw):
```bash
sudo ufw allow 25/tcp    # SMTP (port standar)
sudo ufw allow 587/tcp   # SMTP Submission
sudo ufw allow 3000/tcp  # Next.js App
sudo ufw allow 3001/tcp  # SMTP HTTP API
sudo ufw reload
```

### CentOS/RHEL (firewalld):
```bash
sudo firewall-cmd --permanent --add-port=25/tcp
sudo firewall-cmd --permanent --add-port=587/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

## 📦 Step 3: Deploy Application

### 3.1 Clone dan Install
```bash
# Clone atau upload project
cd /opt
git clone YOUR_REPO_URL temp-mail
cd temp-mail

# Install dependencies
npm install

# Build Next.js app
npm run build
```

### 3.2 Environment Variables
Buat file `.env.local`:
```bash
nano .env.local
```

Isi dengan:
```env
# Domain untuk email
MAIL_DOMAIN=yourdomain.com

# SMTP Server Port (default: 2525, production: 25)
SMTP_PORT=25

# HTTP API Port untuk SMTP Server
HTTP_PORT=3001

# URL SMTP API (untuk Next.js)
NEXT_PUBLIC_SMTP_API=http://localhost:3001
```

### 3.3 Install PM2 (Process Manager)
```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'tempmail-web',
      script: 'npm',
      args: 'start',
      cwd: '/opt/temp-mail',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'tempmail-smtp',
      script: 'npx',
      args: 'ts-node server/smtp.ts',
      cwd: '/opt/temp-mail',
      env: {
        NODE_ENV: 'production',
        MAIL_DOMAIN: 'yourdomain.com',
        SMTP_PORT: '25',
        HTTP_PORT: '3001'
      }
    }
  ]
};
EOF
```

### 3.4 Start Services
```bash
# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Enable startup on boot
pm2 startup
```

## 🔒 Step 4: Nginx Reverse Proxy (Optional)

Untuk HTTPS dengan Let's Encrypt:

### Install Nginx
```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### Create Nginx Config
```bash
sudo nano /etc/nginx/sites-available/tempmail
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable Site & Get SSL
```bash
sudo ln -s /etc/nginx/sites-available/tempmail /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## ✅ Step 5: Testing

### Test DNS
```bash
# Check MX record
dig MX yourdomain.com

# Check A record
dig A mail.yourdomain.com
```

### Test SMTP Server
```bash
# Telnet test
telnet mail.yourdomain.com 25

# Or send test email using swaks
swaks --to test@yourdomain.com --from sender@gmail.com --server mail.yourdomain.com --port 25
```

### Test Web Interface
Buka browser dan akses: `https://yourdomain.com`

## 🔄 Step 6: Monitoring

### View Logs
```bash
# All logs
pm2 logs

# Web app logs only
pm2 logs tempmail-web

# SMTP server logs only
pm2 logs tempmail-smtp
```

### Monitor Resources
```bash
pm2 monit
```

### Restart Services
```bash
pm2 restart all
```

## ⚠️ Troubleshooting

### Email tidak diterima
1. Cek DNS propagation: `dig MX yourdomain.com`
2. Cek firewall: `sudo ufw status`
3. Cek SMTP server running: `pm2 status`
4. Cek logs: `pm2 logs tempmail-smtp`

### Port 25 blocked
Beberapa VPS provider memblokir port 25 by default. Contact support untuk membuka port atau gunakan port alternatif (2525) dengan mail relay.

### Connection refused
```bash
# Check if SMTP is listening
netstat -tlpn | grep :25

# Check if firewall allows port
sudo ufw status
```

## 🏗️ Production Considerations

1. **Use Redis** - Ganti in-memory storage dengan Redis untuk persistence
2. **Rate Limiting** - Tambahkan rate limiting untuk mencegah abuse
3. **Email Cleanup** - Setup cron job untuk cleanup email lama
4. **Backup** - Regular backup untuk konfigurasi
5. **Monitoring** - Setup uptime monitoring (UptimeRobot, etc.)

## 📚 Useful Commands

```bash
# View PM2 status
pm2 status

# View real-time logs
pm2 logs --lines 100

# Restart specific app
pm2 restart tempmail-smtp

# Stop all
pm2 stop all

# Delete all processes
pm2 delete all
```

---

## 🆘 Need Help?

Jika mengalami masalah, pastikan:
1. DNS records sudah benar
2. Firewall sudah dikonfigurasi
3. Port 25 tidak diblokir oleh provider
4. Server memiliki IP publik yang valid
