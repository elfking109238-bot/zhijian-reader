# Verification

Windows x64, 2026-10-29. The packaged `纸间.exe` version 1.0.1 was tested with Electron 43.2.0.

The complete suite passed 33 checks, with no unhandled page exceptions:

- Startup and Chinese UI.
- Import and render original TXT, EPUB 3, and real PalmDOC-compressed MOBI 6.
- Extract and save a real embedded PNG EPUB cover.
- SHA-256 duplicate detection.
- MOBI and EPUB table-of-contents navigation and Chinese text rendering.
- Long Chinese chapter pagination and scrolling mode.
- Font size, line height, font family, and page theme rendering.
- Bookmark creation, listing, navigation, and persistence.
- Full process exit and restart: same book, exact CFI, theme, size, and bookmarks.
- TXT UTF-16 BOM, GB18030/GBK automatic decoding, and manual Big5 decoding.
- Uncompressed MOBI 6.
- Explicit DRM rejection for MOBI and EPUB.
- Corrupt MOBI, corrupt EPUB, and empty TXT errors.
- EPUB path traversal and high-ratio compression bomb rejection.
- Hostile EPUB scripts, iframe, object, and event-handler removal.
- Chapter iframe without script permission, Node.js, or the application preload API.
- Shelf search.
- End-to-end file-drop event import and reading.
- Dedicated unsupported-MOBI-variant error.
- Session-level HTTPS request blocking and application-protocol path rejection.
- Original imported file bytes remain unchanged.

Version 1.0.1 also passed eight deterministic wheel-gesture tests and 16 additional
checks on the packaged executable using actual browser mouse-wheel input:

- Wheel down/up turns the next/previous page inside the focused MOBI chapter iframe.
- Small trackpad deltas accumulate; a continuous inertia burst turns only one page.
- Separate wheel gestures continue reading, and direction reversal returns a page.
- Ctrl+wheel and horizontal gestures do not page.
- Settings and table-of-contents panels do not cause accidental page turns; a long
  table of contents scrolls normally.
- Scrolled reading mode keeps native continuous scrolling and does not call pagination.
- Wheel navigation crosses chapters in both directions and respects book boundaries.
- EPUB and TXT chapters support the same actual wheel input; switching books resets
  the gesture state.
- Shelf scrolling remains normal; executable version is 1.0.1; no unhandled exceptions.

The gesture tests cover pixel/line/page delta units, modifier handling, minimum input
threshold, cooldown, quiet gaps, long inertia, direction reversal and context resets.
This totals 57 automated checks. Physical mouse/trackpad models were not separately
tested; wheel events were sent through Chromium's native input path.

The actual Windows window and native file picker were also inspected. Native picker
opening and filename entry were verified; the computer-use helper could not reliably
activate the owned dialog's Open action, so completion of file selection is covered by
the automated Electron file-input tests. OS-level Explorer drag-and-drop was not tested;
the real drop handler was exercised end-to-end with a browser DataTransfer object.

The original samples are authored for this project and can be regenerated with
`npm run samples`. Test databases and local reading histories are excluded from Git.

Not covered by samples: HUFF-CDIC, KF8/AZW3, EPUB 2, every publisher-specific layout,
large libraries, accessibility assistive devices, other Windows versions, and a clean
Windows machine. The app does not claim DRM, KFX, PDF, or scanned-document support.
The project has not received an independent security audit or commercial code signing.
