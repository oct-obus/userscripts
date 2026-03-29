# Decrypt.day Bypass

Userscript that bypasses ad blocker detection on [decrypt.day](https://decrypt.day), removes the Google consent banner, and cleans up annoyances.

**What it does:**
- Fakes the AdSense global variable and neutralizes the anti-adblock orchestrator
- Blocks Google Funding Choices (CMP ID 300) consent scripts and banners
- Defeats the self-healing overlay that re-creates itself when removed
- Keeps bait elements visible to pass DOM visibility checks
- Removes donate sidebar/footer links and inline ad containers
- Ensures the download button stays enabled and clickable

## Installation

### iOS (Safari with Userscripts app)
1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from the App Store (free)
2. Open Safari → tap the puzzle piece icon → enable Userscripts
3. Navigate to the raw script URL or tap the install link below
4. The script will auto-update from this repo via `@updateURL`

### Desktop (Tampermonkey/Violentmonkey/etc.)
1. Click: [Install Script](https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js)
2. Your userscript manager should prompt to install

## Update URL

[https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js](https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js)
