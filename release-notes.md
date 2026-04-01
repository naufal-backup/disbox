* [Optimization] Implemented sync-on-change mechanism to prevent redundant metadata polling.
* [Feature] Added check-before-sync API to efficiently detect file structure updates.
* Implemented built-in Music Player with comprehensive playback controls.
* Added animated Music Bar interface perfectly matching the web app layout.
* Integrated audio file ID3 tag metadata extraction (`jsmediatags`) to dynamically load and display album artwork.
* Forced all audio file thumbnails to scale proportionally using a fixed 1:1 aspect ratio (CD jewel case format).
* Unified desktop and web user experience for browsing and listening to your cloud-synced media files.
* Automated the CI/CD pipeline and desktop binary publishing via new GitHub Actions workflow.

## v4.5.8 (2026-04-01)

* [Improvement] Progressive loading for audio/video previews - now starts playback after downloading first 3-5 chunks instead of waiting for full file.
* [Fix] Fixed ERR_FILE_NOT_FOUND and chunk errors in audio/video previews.
* [Performance] Faster preview startup, especially for large media files.
