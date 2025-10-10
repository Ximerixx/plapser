#!/bin/sh

set -e

# curl -L http://api.durka.su/next_plugin/install.sh | bash 

# Configuration
PLUGIN_URL="http://api.durka.su/next_plugin/next_plugin.tar.gz"
PLUGIN_NAME="plapser_calendar"
NEXTCLOUD_ROOT="/var/www/html"
APPS_DIR="$NEXTCLOUD_ROOT/custom_apps"
ARCHIVE_FILE="$APPS_DIR/next_plugin.tar.gz"
PLUGIN_DIR="$APPS_DIR/$PLUGIN_NAME"
SCRIPT_PATH="$0"

log_info() { echo "[INFO] $1"; }
log_success() { echo "[SUCCESS] $1"; }
log_error() { echo "[ERROR] $1"; }

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

if [ ! -d "$NEXTCLOUD_ROOT" ]; then
    log_error "Nextcloud directory not found: $NEXTCLOUD_ROOT"
    exit 1
fi

log_info "installation..."

# Download the plugin archive
log_info "Downloading plugin from $PLUGIN_URL..."
if command -v curl >/dev/null 2>&1; then
    curl -L -o "$ARCHIVE_FILE" "$PLUGIN_URL"
elif command -v wget >/dev/null 2>&1; then
    wget -O "$ARCHIVE_FILE" "$PLUGIN_URL"
else
    log_error "Neither curl nor wget found. Please install one of them."
    exit 1
fi

# Check if download was successful
if [ ! -f "$ARCHIVE_FILE" ] || [ ! -s "$ARCHIVE_FILE" ]; then
    log_error "Failed to download plugin archive"
    exit 1
fi

log_success "Plugin downloaded successfully"

# Remove existing plugin directory if it exists
if [ -d "$PLUGIN_DIR" ]; then
    log_info "Removing existing plugin directory..."
    rm -rf "$PLUGIN_DIR"
fi

log_info "Extracting plugin archive..."
cd "$APPS_DIR"
tar -xzf "$ARCHIVE_FILE"

log_info "Cleaning up archive file..."
rm -f "$ARCHIVE_FILE"

log_info "Setting permissions..."
chown -R www-data:www-data "$PLUGIN_DIR"
chmod -R 755 "$PLUGIN_DIR"

log_success "Plugin files installed successfully"
# Enable the plugin
log_info "Enabling plugin in Nextcloud..."
if sudo -u www-data php "$NEXTCLOUD_ROOT/occ" app:enable "$PLUGIN_NAME"; then
    log_success "Plugin enabled successfully"
else
    log_error "Failed to enable plugin"
    exit 1
fi

log_success "completed!"

# Self-destruct
log_info "Self-destructing..."
rm -f "$SCRIPT_PATH"

log_success "installer removed!"
