// ==UserScript==
// @name        Decrypt.day Bypass
// @namespace   https://decrypt.day
// @version     2.1.0
// @description Bypass ad blocker detection on decrypt.day — works with AdGuard, uBlock Origin, and other content blockers
// @author      Zen
// @match       *://decrypt.day/*
// @match       *://www.decrypt.day/*
// @run-at      document-start
// @grant       none
// @updateURL   https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js
// @downloadURL https://raw.githubusercontent.com/obus-schmobus/userscripts/main/decrypt-day-bypass.user.js
// ==/UserScript==

(function () {
  'use strict';

  const PUB_ID = 'pub-7963386435348203';
  const ENCODED_PUB_ID = btoa(PUB_ID);

  // ─── Vector 1: Neutralize Google Funding Choices orchestrator ──────
  // __h82AlnkH6D91__ is the entry point for the anti-adblock detection
  // system. It loads scripts from fundingchoicesmessages.google.com,
  // creates DOM bait elements, and shows a self-healing yellow overlay
  // banner when blocking is detected. Using a getter/setter trap
  // silently absorbs the page's assignment (no TypeError in strict
  // mode ES modules) and always returns a no-op when read.
  const _noOp = function () {};
  try {
    Object.defineProperty(window, '__h82AlnkH6D91__', {
      get() { return _noOp; },
      set() {},
      configurable: false
    });
  } catch (e) {
    window.__h82AlnkH6D91__ = _noOp;
  }

  // ─── Vector 2: Pre-set the publisher global variable ───────────────
  // The FC script checks window[btoa(pubId)] for a base64-encoded JSON
  // array where the first element equals the pub ID. When the FC script
  // loads successfully (or when the SvelteKit Ab() pre-check runs), it
  // validates this value via a protobuf parser that reads field 1 as
  // array[0]. Setting it correctly makes both checks pass.
  window[ENCODED_PUB_ID] = btoa(JSON.stringify([PUB_ID]));

  // Fake adsbygoogle array so any stray push() calls don't throw
  window.adsbygoogle = window.adsbygoogle || [];

  // Fake the googlefcPresent frame signal
  try {
    Object.defineProperty(window.frames, 'googlefcPresent', {
      value: true,
      writable: false,
      configurable: true
    });
  } catch (e) {}

  // ─── Vector 3: Patch getComputedStyle for the CSS bait check ───────
  // The SvelteKit app creates <div id="aswift_5_host"> with inline
  // styles (clip-path:circle(0); left:{random}px; position:static)
  // then uses getComputedStyle to check if ad blocker cosmetic filter
  // rules modified those properties. If any changed → adTracking = 1
  // (BLOCKED). Our proxy returns the element's inline style values,
  // ensuring the check sees "no modification" → adTracking = -1
  // (passes to the script element check).
  const _getComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (element, pseudoElt) {
    const result = _getComputedStyle.call(this, element, pseudoElt);

    if (element && element.id === 'aswift_5_host') {
      return new Proxy(result, {
        get(target, prop) {
          if (prop === 'clipPath') {
            // Inline "circle(0)" computes to "circle(0px at 50% 50%)"
            // The check: .clipPath.startsWith("circle(0px") must be true
            if (element.style.clipPath &&
                element.style.clipPath.includes('circle(0')) {
              return 'circle(0px at 50% 50%)';
            }
          }
          if (prop === 'left') {
            // Return the inline left value (e.g. "-5432px")
            return element.style.left || target.left;
          }
          if (prop === 'position') {
            // Must be "static" to pass
            return element.style.position || target.position;
          }
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        }
      });
    }

    return result;
  };

  // ─── Vector 4: Create fake <ins> to pass the script element check ──
  // After the CSS check passes (adTracking = -1), the app queries all
  // <ins> elements looking for:
  //   data-adsbygoogle-status="done" AND data-ad-status="filled"|"unfilled"
  // With at least one matching element → adTracking = -2 (NOT BLOCKED)
  // → download button stays enabled, no "ad blockers not allowed" warning.
  function ensureFakeAdSlot() {
    if (document.querySelector(
      'ins[data-adsbygoogle-status="done"][data-ad-status="filled"]'
    )) return;

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.setAttribute('data-adsbygoogle-status', 'done');
    ins.setAttribute('data-ad-status', 'filled');
    ins.style.display = 'none';
    ins.style.width = '0';
    ins.style.height = '0';
    (document.body || document.documentElement).appendChild(ins);
  }

  // ─── Vector 5: MutationObserver to kill overlay remnants ───────────
  // Catches any high-z-index fixed overlays (the self-healing yellow
  // banner) or Google FC iframes that somehow bypass our neutralization.
  function startObserver() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          // Kill anti-adblock overlay (fixed position, z-index > 2.1B)
          if (node.style && node.style.position === 'fixed' &&
              parseInt(node.style.zIndex) > 2147483500) {
            node.remove();
            continue;
          }

          // Kill Google FC iframes
          if (node.tagName === 'IFRAME' &&
              (node.name === 'googlefcPresent' ||
               (node.src && node.src.includes('fundingchoicesmessages')))) {
            node.remove();
            continue;
          }

          // Kill Google consent interstitials
          if (node.getAttribute &&
              node.getAttribute('data-google-interstitial') !== null) {
            node.remove();
          }
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  // ─── Vector 6: SPA navigation awareness ─────────────────────────
  // SvelteKit uses client-side routing — DOMContentLoaded/load won't
  // fire again on navigation. We intercept pushState/replaceState and
  // popstate to re-verify our fake <ins> is still present. A periodic
  // fallback handles any edge cases (e.g. custom routers, hash nav).
  function onNavigate() {
    // Small delay: let SvelteKit finish route transition and mount new
    // component (which creates fresh detection signals V=0, T='')
    setTimeout(ensureFakeAdSlot, 0);
    setTimeout(ensureFakeAdSlot, 100);
  }

  const _pushState = history.pushState;
  const _replaceState = history.replaceState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    onNavigate();
  };
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);

  // Periodic fallback: re-verify fake <ins> every 3s
  setInterval(ensureFakeAdSlot, 3000);

  // ─── Boot ──────────────────────────────────────────────────────────
  startObserver();

  function onReady() {
    ensureFakeAdSlot();

    // Clean up any overlays already in the DOM
    document.querySelectorAll('div').forEach(el => {
      const s = _getComputedStyle.call(window, el);
      if (s.position === 'fixed' && s.bottom === '0px' &&
          parseInt(s.zIndex) > 2147483500) {
        el.remove();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', onReady);
})();
