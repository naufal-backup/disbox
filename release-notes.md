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
