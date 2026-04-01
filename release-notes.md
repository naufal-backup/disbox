* [Optimization] Implemented sync-on-change mechanism to prevent redundant metadata polling.
* [Feature] Added check-before-sync API to efficiently detect file structure updates.
* Implemented built-in Music Player with comprehensive playback controls.
* Added animated Music Bar interface perfectly matching the web app layout.
* Integrated audio file ID3 tag metadata extraction (`jsmediatags`) to dynamically load and display album artwork.
* Forced all audio file thumbnails to scale proportionally using a fixed 1:1 aspect ratio (CD jewel case format).
* Unified desktop and web user experience for browsing and listening to your cloud-synced media files.
* Automated the CI/CD pipeline and desktop binary publishing via new GitHub Actions workflow.

## v4.5.9 (2026-04-01)

* [Feature] Progressive loading for video previews - video starts playing after first 5 chunks (~37MB) download.
* Audio previews now use reliable full download before playback.
* [Fix] Fixed ERR_FILE_NOT_FOUND and chunk errors in previews.
* [Performance] Faster video preview startup while keeping audio stable.
