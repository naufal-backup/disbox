## v4.9.4 (2026-04-03)

* [Security] Implemented Session-based Trust for Proxy API
* [Security] Proxy now requires either a valid JWT session or a valid signature
* [Fix] Added credential support for cross-origin proxy requests
* [Chore] Bumped version to 4.9.4

## v4.9.3 (2026-04-03)

* [Security] Removed hardcoded API secrets from client-side bundle
* [Security] Moved Proxy and Share secrets to server-side only environment variables
* [Fix] Improved worker API key handling using environment variables
* [Chore] Bumped version to 4.9.3

## v4.9.2 (2026-04-03)

* [Feature] Added About Disbox card in Profile Page
* [Feature] Added Worker Usage statistics list with public workers
* [Fix] Improved Settings page layout to be non-overlapping when scrolling
* [Chore] Bumped version to 4.9.2

## v4.6.1 (2026-04-01)

* [Security] Added JWT session authentication for Vercel API endpoints
* [Security] Fixed CORS to allow Electron file:// protocol
* [Fix] Settings toggles now persist correctly across sessions
* [Fix] Music playback now uses direct Discord download (no Vercel streaming)
* [Fix] Lock and Star status now properly update in both web and desktop
* [Chore] Updated branding to "Disbox by naufal-backup"

## v4.5.9 (2026-04-01)

* [Feature] Progressive loading for video previews - video starts playing after first 5 chunks (~37MB) download.
* Audio previews now use reliable full download before playback.
* [Fix] Fixed ERR_FILE_NOT_FOUND and chunk errors in previews.
* [Performance] Faster video preview startup while keeping audio stable.
