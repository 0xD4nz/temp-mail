#!/bin/bash

# ============================================
# TempMail VPS Deployment Script
# Ubuntu Server - Custom Domain Support
# ============================================

set -e

echo "🚀 TempMail Deployment Script"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Get domain from user
echo -e "${CYAN}Please enter your domain name:${NC}"
read -p "Domain (e.g., example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    print_error "Domain is required!"
    exit 1
fi

echo ""
echo -e "${CYAN}Enter your email for SSL certificate:${NC}"
read -p "Email: " ADMIN_EMAIL

if [ -z "$ADMIN_EMAIL" ]; then
    ADMIN_EMAIL="admin@$DOMAIN"
    print_warning "Using default email: $ADMIN_EMAIL"
fi

# Configuration
MAIL_DOMAIN="$DOMAIN"
APP_DIR="/opt/temp-mail"
REPO_URL="https://github.com/0xD4nz/temp-mail.git"

echo ""
echo "============================================"
echo -e "Domain: ${GREEN}$DOMAIN${NC}"
echo -e "Mail Domain: ${GREEN}$MAIL_DOMAIN${NC}"
echo -e "Admin Email: ${GREEN}$ADMIN_EMAIL${NC}"
echo "============================================"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Step 1: Update System
echo ""
echo "📦 Step 1: Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_status "System updated"

# Step 2: Install Node.js 20 LTS
echo ""
echo "📦 Step 2: Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed: $(node --version)"
else
    print_status "Node.js already installed: $(node --version)"
fi

# Step 3: Install PM2
echo ""
echo "📦 Step 3: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_status "PM2 installed"
else
    print_status "PM2 already installed"
fi

# Step 4: Install Nginx
echo ""
echo "📦 Step 4: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    print_status "Nginx installed"
else
    print_status "Nginx already installed"
fi

# Step 5: Install Certbot for SSL
echo ""
echo "📦 Step 5: Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
    print_status "Certbot installed"
else
    print_status "Certbot already installed"
fi

# Step 6: Clone or update repository
echo ""
echo "📂 Step 6: Setting up application..."
if [ -d "$APP_DIR" ]; then
    print_warning "Directory exists, updating..."
    cd $APP_DIR
    git pull origin main
else
    sudo git clone $REPO_URL $APP_DIR
    sudo chown -R $USER:$USER $APP_DIR
fi
cd $APP_DIR
print_status "Repository ready at $APP_DIR"

# Step 7: Install dependencies and build
echo ""
echo "📦 Step 7: Installing dependencies..."
npm install
print_status "Dependencies installed"

# Step 8: Create environment file
echo ""
echo "⚙️ Step 8: Creating environment configuration..."
cat > $APP_DIR/.env.local << EOF
# TempMail Configuration
MAIL_DOMAIN=$MAIL_DOMAIN
SMTP_PORT=25
HTTP_PORT=3001
NODE_ENV=production
NEXT_PUBLIC_MAIL_DOMAIN=$MAIL_DOMAIN
EOF
print_status "Environment file created"

# Step 9: Update available domains in emailStore
echo ""
echo "⚙️ Updating available domains..."
cat > $APP_DIR/lib/emailStore.ts.tmp << EOF
// Enhanced In-memory email storage with all features
export interface Attachment {
    filename: string;
    contentType: string;
    size: number;
    content: string; // base64 encoded
}

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

export interface Inbox {
    address: string;
    createdAt: number;
    expiresAt: number;
    maxExpiresAt: number;
    isCustom: boolean;
    forwardTo?: string;
    domain: string;
    stats: {
        totalReceived: number;
        totalRead: number;
        totalDeleted: number;
    };
}

// Available domains - configured for $MAIL_DOMAIN
export const AVAILABLE_DOMAINS = [
    '$MAIL_DOMAIN',
    'mail.$MAIL_DOMAIN',
    'inbox.$MAIL_DOMAIN',
    'temp.$MAIL_DOMAIN',
    'box.$MAIL_DOMAIN'
];

export function getAvailableDomains(): string[] {
    return [...AVAILABLE_DOMAINS];
}
EOF

# Keep the rest of the file (functions)
tail -n +50 $APP_DIR/lib/emailStore.ts >> $APP_DIR/lib/emailStore.ts.tmp
mv $APP_DIR/lib/emailStore.ts.tmp $APP_DIR/lib/emailStore.ts

print_status "Domains updated to $MAIL_DOMAIN"

# Step 10: Build application
echo ""
echo "🔨 Building application..."
npm run build
print_status "Application built"

# Step 11: Configure PM2
echo ""
echo "🔧 Step 11: Configuring PM2..."
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'tempmail-web',
      cwd: '$APP_DIR',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'tempmail-smtp',
      cwd: '$APP_DIR',
      script: 'server/smtp.js',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MAIL_DOMAIN: '$MAIL_DOMAIN',
        SMTP_PORT: '25',
        HTTP_PORT: '3001'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    }
  ]
};
EOF
print_status "PM2 configuration created"

# Step 12: Configure Nginx (HTTP only first, then add SSL)
echo ""
echo "🌐 Step 12: Configuring Nginx..."
sudo tee /etc/nginx/sites-available/tempmail > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/tempmail /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
print_status "Nginx configured"

# Step 13: Configure Firewall
echo ""
echo "🔥 Step 13: Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 25/tcp    # SMTP
sudo ufw allow 587/tcp   # SMTP Submission
sudo ufw --force enable
print_status "Firewall configured"

# Step 14: Start applications with PM2
echo ""
echo "🚀 Step 14: Starting applications..."
cd $APP_DIR
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER 2>/dev/null || true
print_status "Applications started"

# Step 15: Get SSL Certificate (optional)
echo ""
echo "🔒 Step 15: SSL Certificate Setup"
print_warning "Make sure your domain DNS A record is pointing to this server!"
echo ""
read -p "Do you want to setup SSL now? (y/n): " SETUP_SSL

if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m $ADMIN_EMAIL || print_warning "SSL setup failed - you can run 'sudo certbot --nginx' manually later"
else
    print_warning "Skipping SSL setup. Run 'sudo certbot --nginx' later to enable HTTPS"
fi

# Get server IP
SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")

echo ""
echo "============================================"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "============================================"
echo ""
echo -e "📍 Website: ${CYAN}http://$DOMAIN${NC}"
echo -e "📧 Mail Domain: ${CYAN}$MAIL_DOMAIN${NC}"
echo ""
echo "📋 DNS Records needed:"
echo "   A     @      → $SERVER_IP"
echo "   A     www    → $SERVER_IP"
echo "   A     mail   → $SERVER_IP"
echo "   MX    @      → mail.$DOMAIN (priority 10)"
echo ""
echo "🔧 Useful commands:"
echo "   pm2 status          - Check app status"
echo "   pm2 logs            - View logs"
echo "   pm2 restart all     - Restart apps"
echo "   sudo certbot --nginx - Setup SSL"
echo ""
echo "============================================"
