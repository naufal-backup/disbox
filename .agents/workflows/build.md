---
description: Build Disbox (Linux and Windows)
---

1. Navigate to the disbox repository.
   ```bash
   cd /home/tb/Documents/GitHub/disbox
   ```

2. Rebuild native modules for better-sqlite3.
   ```bash
   npx electron-rebuild -f -w better-sqlite3
   ```

3. Build the application for Linux (AppImage, deb, pacman).
   ```bash
   npm run build
   ```

4. Build the application for Windows.
   ```bash
   npx electron-builder --win
   ```
