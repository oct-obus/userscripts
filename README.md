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

[Install](https://raw.githubusercontent.com/oct-obus/userscripts/main/decrypt-day-bypass.user.js)

### Instagram Saved Collection Video Viewer

View all videos from an Instagram saved collection in a full-page grid overlay. Triggered via Tampermonkey's context menu on any `/saved/*/` page.

- Fetches posts from the private API using the page's existing session cookies
- Displays all video posts in a responsive grid with native `<video>` controls
- Carousel posts show left/right navigation to switch between video slides (photos filtered out)
- Manual "Load more" pagination to avoid rate limiting
- Escape or × to close

[Install](https://raw.githubusercontent.com/oct-obus/userscripts/main/instagram-saved-videos.user.js)

### Fritz!Box Mesh Page Fix

Fixes the Fritz!Box router's mesh page (`#/mesh`) from freezing every 5 seconds. AVM's firmware rebuilds the entire page DOM on every refresh cycle — this script makes it efficient.

**Three fixes in one:**
1. **Response deduplication** — hashes each `data.lua` response and skips rendering entirely when the mesh state hasn't changed (covers ~95% of refresh cycles on a stable network)
2. **DOM morphing** — replaces AVM's nuclear `replaceChildren` with [morphdom](https://github.com/patrick-steele-idem/morphdom) for surgical DOM patches. Only nodes that actually changed are touched — preserves Web Component state, GIF animations, and avoids layout thrashing
3. **requestAnimationFrame batching** — defers renders to the start of the next frame to avoid mid-composite DOM mutations

morphdom is inlined (~4KB) so the script works without internet — important since Fritz!Box is a local device and mesh problems often mean no connectivity.

[Install](https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-mesh-fix.user.js)

### Fritz.com German Locale Fix

Forces fritz.com to use the German locale. AVM's Shopify-based site auto-redirects to `/en/` based on browser language — this script intercepts the redirect and strips the English prefix, keeping you on the German version.

- Runs at `document-start` to catch redirects before they fire
- Intercepts `history.pushState`, `replaceState`, and `location.replace` to block Shopify's JS redirects
- Covers all English locale prefixes (`/en/`, `/en-at/`, `/en-be/`, etc.)

[Install](https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-german-locale.user.js)

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
