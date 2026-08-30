#!/usr/bin/env bash
# Auto-Update Script for System Bot
# Pulls latest changes from GitHub, installs new packages, and reloads PM2

set -e

echo "=========================================="
echo "🔄 Checking for GitHub updates..."
echo "=========================================="

cd "$(dirname "$0")/.."

# Fetch changes
git fetch origin main || git fetch origin master || true

# Check if we are behind
LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "0")
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "0")

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "📥 New updates found! Pulling..."
  git pull
  
  echo "📦 Updating dependencies..."
  npm install --omit=dev --no-audit
  
  echo "⚡ Reloading slash commands..."
  node src/deploy-commands.js || true

  echo "🚀 Reloading bot process in PM2..."
  npx pm2 reload ecosystem.config.js || npx pm2 restart discord-bot
  
  echo "✅ Successfully updated to latest version!"
else
  echo "✨ Already up to date."
fi
