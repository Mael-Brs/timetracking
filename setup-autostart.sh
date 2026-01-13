#!/bin/bash

# Setup script for automatic time tracking on login/shutdown
# This uses systemd user services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "Setting up automatic time tracking..."

# Create systemd user directory if it doesn't exist
mkdir -p "$SYSTEMD_USER_DIR"

# Copy service files
cp "$SCRIPT_DIR/systemd/tt-start.service" "$SYSTEMD_USER_DIR/"
cp "$SCRIPT_DIR/systemd/tt-end.service" "$SYSTEMD_USER_DIR/"

# Reload systemd user daemon
systemctl --user daemon-reload

# Enable the services
systemctl --user enable tt-start.service
systemctl --user enable tt-end.service

# Enable lingering so user services run at boot (before login)
loginctl enable-linger "$USER"

echo ""
echo "Done! Auto time tracking is now enabled."
echo ""
echo "  - Session will start automatically when your computer boots"
echo "  - Session will end automatically on shutdown/reboot"
echo ""
echo "To disable, run:"
echo "  systemctl --user disable tt-start.service tt-end.service"
echo ""
echo "To check status:"
echo "  systemctl --user status tt-start.service"
echo "  systemctl --user status tt-end.service"