# Userscripts

A collection of userscripts for Safari iOS and desktop browsers.

## Scripts

### Decrypt.day Bypass

Userscript that bypasses ad blocker detection on [decrypt.day](https://decrypt.day) — works with network-level content blockers like AdGuard, uBlock Origin, and others.

**How it works (5 attack vectors):**
1. **Neutralizes `__h82AlnkH6D91__`** — the Google Funding Choices orchestrator that shows the yellow overlay banner
2. **Pre-sets the publisher global** — fakes the protobuf payload that the FC script validates, satisfying both the pre-check and success callback
3. **Patches `getComputedStyle`** — returns unmodified inline style values for the CSS bait element (`#aswift_5_host`), preventing the cosmetic filter detection
4. **Creates a fake `<ins>` element** — with `data-adsbygoogle-status="done"` and `data-ad-status="filled"`, making the script element check report "not blocked" (adTracking = -2)
5. **MutationObserver cleanup** — catches and removes any high-z-index overlay banners or Google FC iframes that slip through

**Result:** The internal `adTracking` state stays at -2 (not blocked) → download button remains enabled → Turnstile CAPTCHA works normally → download proceeds.

[Install](https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js)

### Fritz.com German Locale Fix

Forces fritz.com to use the German locale. AVM's Shopify-based site auto-redirects to `/en/` based on browser language — this script intercepts the redirect and strips the English prefix, keeping you on the German version.

- Runs at `document-start` to catch redirects before they fire
- Intercepts `history.pushState`, `replaceState`, and `location.replace` to block Shopify's JS redirects
- Covers all English locale prefixes (`/en/`, `/en-at/`, `/en-be/`, etc.)

[Install](https://raw.githubusercontent.com/obus-schmobus/userscripts/main/fritz-german-locale.user.js)

## Installation

### iOS Safari (with Userscripts app)
1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from the App Store
2. Open Safari → tap the puzzle piece icon → enable Userscripts
3. Click an install link above

### iOS Safari (with Stay)
1. Install [Stay](https://apps.apple.com/app/stay-for-safari/id1591620171) from the App Store
2. Open Stay → tap + → "New from URL"
3. Paste the raw script URL

### Desktop (Tampermonkey / Violentmonkey / etc.)
Click an install link above.
