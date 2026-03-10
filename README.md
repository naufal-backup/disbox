# Disbox — Linux Desktop App

> **Discord as unlimited cloud storage** — modern Linux desktop client built with Electron + React

![Disbox Screenshot](https://disboxapp.github.io/web/)

## Features

- **Modern dark UI** — Syne + JetBrains Mono typography, deep navy/indigo palette
- **Custom frameless titlebar** — minimize / maximize / close with native feel
- **File browser** — grid and list view, breadcrumb navigation, subdirectory support
- **Drag & drop upload** — drop files directly onto the window
- **Upload progress** — live transfer panel with progress bars
- **Download via native proxy** — bypasses CORS using Electron's `net` module (no third-party proxy needed)
- **Right-click context menu** — download, rename, delete
- **Auto-reconnect** — saves webhook in localStorage, reconnects on launch
- **System tray** — minimize to tray, click to restore

## Stack

| Layer | Tech |
|-------|------|
| Shell | Electron 29 |
| UI | React 18 + CSS Modules |
| Bundler | Vite 5 |
| Packager | electron-builder (.AppImage, .deb) |
| Design | Syne (display) + Inter (body) + JetBrains Mono |

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
chmod +x setup.sh && ./setup.sh

# Dev mode (with hot reload)
npm run dev

# Build distributable Linux packages
npm run build
# Output in: release/
```

### Manual steps

```bash
npm install
npm run dev      # opens Electron + Vite in dev mode
```

## How it Works

1. You provide a **Discord webhook URL** (hashed client-side with SHA-256 → your identity)
2. Files are **split into 24 MB chunks** and posted as Discord attachments via the webhook
3. **Metadata** (path, message IDs) is stored in the Disbox cloud database
4. On download, Electron fetches attachment URLs and reassembles chunks natively
5. The virtual file system lets you create folders and navigate like a real drive

## Getting a Discord Webhook

1. Open Discord → Server Settings → Integrations → Webhooks
2. Click **New Webhook**, choose a channel (your "drive" channel)
3. Copy the webhook URL and paste it into Disbox

## Project Structure

```
disbox-linux/
├── electron/
│   ├── main.js         # Electron main process, IPC, window controls
│   └── preload.js      # Context bridge (secure IPC)
├── src/
│   ├── components/
│   │   ├── TitleBar    # Custom frameless titlebar
│   │   ├── Sidebar     # Navigation + storage indicator
│   │   ├── FileGrid    # Main file browser (grid + list)
│   │   └── TransferPanel # Upload/download progress
│   ├── pages/
│   │   ├── LoginPage   # Webhook connect screen
│   │   └── DrivePage   # Main layout
│   ├── utils/
│   │   └── disbox.js   # API client, chunking, tree builder
│   ├── styles/
│   │   └── global.css  # CSS variables, reset, utilities
│   └── AppContext.jsx  # Global state (React Context)
├── index.html
├── vite.config.js
└── package.json
```

## Credits

Original Disbox project: [DisboxApp/web](https://github.com/DisboxApp/web)  
This is a modern Linux desktop reimplementation.
