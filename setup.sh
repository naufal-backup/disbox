#!/usr/bin/env bash
# ─── Disbox Linux - Setup Script ────────────────────────────────────────────
set -e

echo ""
echo "  ██████╗ ██╗███████╗██████╗  ██████╗ ██╗  ██╗"
echo "  ██╔══██╗██║██╔════╝██╔══██╗██╔═══██╗╚██╗██╔╝"
echo "  ██║  ██║██║███████╗██████╔╝██║   ██║ ╚███╔╝ "
echo "  ██║  ██║██║╚════██║██╔══██╗██║   ██║ ██╔██╗ "
echo "  ██████╔╝██║███████║██████╔╝╚██████╔╝██╔╝ ██╗"
echo "  ╚═════╝ ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝"
echo ""
echo "  Discord Cloud Storage — Linux Desktop App v2.0"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt "18" ]; then
  echo "❌ Node.js 18+ required (current: $(node -v))"
  exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "  Run commands:"
echo "    npm run dev      → Development mode (hot reload)"
echo "    npm run build    → Build .AppImage + .deb packages"
echo "    npm run electron → Run Electron directly (needs vite running)"
echo ""
