# Decrypt.day Bypass

Userscript that bypasses ad blocker detection on [decrypt.day](https://decrypt.day) — works with network-level content blockers like AdGuard, uBlock Origin, and others.

**How it works (5 attack vectors):**
1. **Neutralizes `__h82AlnkH6D91__`** — the Google Funding Choices orchestrator that shows the yellow overlay banner
2. **Pre-sets the publisher global** — fakes the protobuf payload that the FC script validates, satisfying both the pre-check and success callback
3. **Patches `getComputedStyle`** — returns unmodified inline style values for the CSS bait element (`#aswift_5_host`), preventing the cosmetic filter detection
4. **Creates a fake `<ins>` element** — with `data-adsbygoogle-status="done"` and `data-ad-status="filled"`, making the script element check report "not blocked" (adTracking = -2)
5. **MutationObserver cleanup** — catches and removes any high-z-index overlay banners or Google FC iframes that slip through

**Result:** The internal `adTracking` state stays at -2 (not blocked) → download button remains enabled → Turnstile CAPTCHA works normally → download proceeds.

## Installation

### iOS Safari (with Stay)
1. Install [Stay](https://apps.apple.com/app/stay-for-safari/id1591620171) from the App Store
2. Open Stay → tap + → "New from URL"
3. Paste the install link: https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js
4. The script auto-updates via `@updateURL`

### iOS Safari (with Userscripts app)
1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from the App Store
2. Open Safari → tap the puzzle piece icon → enable Userscripts
3. Navigate to the raw script URL or use the install link below

### Desktop (Tampermonkey / Violentmonkey / etc.)
Click: [Install Script](https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js)

## Update URL

https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js
