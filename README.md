# Improvements for VULCAN — userscript

Userscript (Violentmonkey / Tampermonkey / Greasemonkey) port of the
[**Improvements for VULCAN**](https://github.com/banocean/ifv) browser extension.
It fixes and improves the eduVULCAN and Dziennik VULCAN web apps, especially on mobile.

## Installation

1. Install a userscript manager:
   - [Violentmonkey](https://violentmonkey.github.io/get-it/) (recommended)
   - [Tampermonkey](https://www.tampermonkey.net/)
   - [Greasemonkey](https://www.greasyfork.org/) (Firefox)
2. Open the raw script and confirm the install prompt:

   **[➡ Install ifv.user.js](https://raw.githubusercontent.com/Bejg/ifv-userscript/main/ifv.user.js)**

   Or drag the `ifv.user.js` file into the browser / manager's install window.

The script auto-updates from this repository (via `@updateURL`).

## Supported sites

- `eduvulcan.pl`, `uczen.eduvulcan.pl`, `wiadomosci.eduvulcan.pl`
- `dziennik-uczen.vulcan.net.pl`, `dziennik-wiadomosci.vulcan.net.pl`, `dziennik-logowanie.vulcan.net.pl`

## Settings

Open the settings in either place:

- the **ifv settings icon** in the page header / mobile menu, or
- the userscript manager menu → **Ustawienia IFV**.

The panel lets you toggle every improvement on/off, search and filter them
(mobile / desktop), and reset to defaults.

## Features

- Mobile navigation
- PWA support
- Attendance statistics in a separate tab
- Hiding weekends in monthly calendars
- Displaying full name
- Clean student dashboard
- Clean eduVULCAN home
- Other minor improvements: hiding WCAG controls, aligning the detailed grades
  button, redirecting to the board, auto-redirecting to the eduVULCAN login page,
  counting averages, and more.

See the [original extension repository](https://github.com/banocean/ifv) for
screenshots and the full feature list.

## Credits

Ported from the MIT-licensed extension
[**banocean/ifv**](https://github.com/banocean/ifv) by BanOcean.
All original patch logic and design belong to that project.

## License

Licensed under the [MIT License](./LICENSE).
