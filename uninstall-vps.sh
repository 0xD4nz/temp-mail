#!/bin/bash

# ============================================
# TempMail VPS Clean Uninstall Script
# Removes a previous deploy-vps.sh installation
# so you can reinstall from scratch.
# ============================================

set -e

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

echo "🧹 TempMail Clean Uninstall"
echo "==========================="
echo ""

APP_DIR="/opt/temp-mail"

# Auto-detect domain from nginx config or .env.local
DOMAIN=""
if [ -f /etc/nginx/sites-available/tempmail ]; then
    DOMAIN=$(grep -m1 "server_name" /etc/nginx/sites-available/tempmail | awk '{print $2}' | tr -d ';')
fi
if [ -z "$DOMAIN" ] && [ -f "$APP_DIR/.env.local" ]; then
    DOMAIN=$(grep -m1 "^MAIL_DOMAIN=" "$APP_DIR/.env.local" | cut -d= -f2 | tr -d '\r')
fi
if [ -z "$DOMAIN" ]; then
    echo -e "${CYAN}Could not auto-detect domain. Enter it (for SSL cert cleanup):${NC}"
    read -p "Domain (empty to skip SSL cleanup): " DOMAIN
fi

echo ""
print_warning "This will DELETE:"
echo "  - PM2 apps: tempmail-web, tempmail-smtp"
echo "  - Nginx site: tempmail"
echo "  - App directory: $APP_DIR (INCLUDING the SQLite database - all inboxes & emails)"
if [ -n "$DOMAIN" ]; then
    echo "  - Optionally: Let's Encrypt cert for $DOMAIN, SMTP firewall rules"
fi
echo ""
read -p "Type DELETE to continue: " CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
    print_error "Aborted."
    exit 1
fi

# Step 1: Stop & remove PM2 apps
echo ""
echo "🛑 Step 1: Removing PM2 apps..."
if command -v pm2 &> /dev/null; then
    pm2 delete tempmail-web 2>/dev/null || print_warning "tempmail-web not found"
    pm2 delete tempmail-smtp 2>/dev/null || print_warning "tempmail-smtp not found"
    pm2 save 2>/dev/null || true
    print_status "PM2 apps removed"
else
    print_warning "PM2 not installed, skipping"
fi

# Step 2: PM2 systemd startup entry
echo ""
read -p "Remove PM2 systemd startup entry? (y/n): " RM_STARTUP
if [ "$RM_STARTUP" = "y" ] || [ "$RM_STARTUP" = "Y" ]; then
    if command -v pm2 &> /dev/null; then
        sudo pm2 unstartup systemd 2>/dev/null || pm2 unstartup 2>/dev/null || print_warning "unstartup failed (may not have been configured)"
        print_status "PM2 startup entry removed"
    fi
else
    print_warning "Kept PM2 startup entry"
fi

# Step 3: Nginx site
echo ""
echo "🌐 Step 3: Removing Nginx site..."
if [ -f /etc/nginx/sites-available/tempmail ]; then
    sudo rm -f /etc/nginx/sites-enabled/tempmail /etc/nginx/sites-available/tempmail
    sudo nginx -t && sudo systemctl reload nginx
    print_status "Nginx site removed and reloaded"
else
    print_warning "Nginx site not found, skipping"
fi

# Step 4: App directory (includes SQLite database)
echo ""
echo "📂 Step 4: Removing app directory..."
if [ -d "$APP_DIR" ]; then
    sudo rm -rf "$APP_DIR"
    print_status "Removed $APP_DIR (database wiped)"
else
    print_warning "$APP_DIR not found, skipping"
fi

# Step 5: SMTP firewall rules (optional)
echo ""
read -p "Remove SMTP firewall rules (25/tcp, 587/tcp)? (y/n): " RM_FW
if [ "$RM_FW" = "y" ] || [ "$RM_FW" = "Y" ]; then
    sudo ufw delete allow 25/tcp 2>/dev/null || print_warning "rule 25/tcp not found"
    sudo ufw delete allow 587/tcp 2>/dev/null || print_warning "rule 587/tcp not found"
    print_status "SMTP firewall rules removed (22/80/443 kept)"
else
    print_warning "Kept firewall rules"
fi

# Step 6: SSL certificate (optional)
if [ -n "$DOMAIN" ] && command -v certbot &> /dev/null; then
    echo ""
    read -p "Delete Let's Encrypt certificate for $DOMAIN? (y/n): " RM_CERT
    if [ "$RM_CERT" = "y" ] || [ "$RM_CERT" = "Y" ]; then
        sudo certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null \
            || print_warning "certbot delete failed - remove manually with 'sudo certbot delete'"
        print_status "Certificate cleanup attempted"
    else
        print_warning "Kept existing certificate (a fresh deploy-vps.sh run will reuse it)"
    fi
fi

echo ""
echo "============================================"
echo -e "${GREEN}🎉 Uninstall complete!${NC}"
echo "============================================"
echo ""
echo "Fresh install:"
echo "  curl -O https://raw.githubusercontent.com/0xD4nz/temp-mail/main/deploy-vps.sh"
echo "  chmod +x deploy-vps.sh && ./deploy-vps.sh"
echo ""
