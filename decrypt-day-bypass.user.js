// ==UserScript==
// @name        Decrypt.day Bypass
// @namespace   https://decrypt.day
// @version     2.2.1
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

  const VERSION = '2.2.0';
  const TAG = '[Decrypt.day Bypass]';

  // ─── Diagnostics ───────────────────────────────────────────────────
  // Visible markers to confirm the script is executing. Check Safari
  // console or look for "[BYPASS]" in the page title.
  console.log(TAG, 'v' + VERSION, 'loaded at', performance.now().toFixed(1) + 'ms');
  window.__decryptBypass = VERSION;

  const PUB_ID = 'pub-7963386435348203';
  const ENCODED_PUB_ID = btoa(PUB_ID);
  let vectorStatus = {};

  function log(vector, msg) {
    console.log(TAG, '[V' + vector + ']', msg);
  }

  // ─── Vector 1: Neutralize Google Funding Choices orchestrator ──────
  try {
    const _noOp = function () {};
    Object.defineProperty(window, '__h82AlnkH6D91__', {
      get() { return _noOp; },
      set() {},
      configurable: false
    });
    vectorStatus[1] = 'OK (defineProperty)';
    log(1, 'Trapped __h82AlnkH6D91__ via defineProperty');
  } catch (e) {
    try {
      window.__h82AlnkH6D91__ = function () {};
      vectorStatus[1] = 'OK (fallback assign)';
      log(1, 'Used fallback assignment for __h82AlnkH6D91__');
    } catch (e2) {
      vectorStatus[1] = 'FAILED: ' + e2.message;
      log(1, 'FAILED: ' + e.message + ' / ' + e2.message);
    }
  }

  // ─── Vector 2: Pre-set the publisher global + adsbygoogle ──────────
  try {
    window[ENCODED_PUB_ID] = btoa(JSON.stringify([PUB_ID]));
    window.adsbygoogle = window.adsbygoogle || [];
    try {
      Object.defineProperty(window.frames, 'googlefcPresent', {
        value: true, writable: false, configurable: true
      });
    } catch (e) { /* frames property may not be configurable */ }
    vectorStatus[2] = 'OK';
    log(2, 'Publisher global + adsbygoogle + googlefcPresent set');
  } catch (e) {
    vectorStatus[2] = 'FAILED: ' + e.message;
    log(2, 'FAILED: ' + e.message);
  }

  // ─── Vector 3: Patch getComputedStyle for CSS bait check ───────────
  let _getComputedStyle;
  try {
    _getComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function (element, pseudoElt) {
      const result = _getComputedStyle.call(this, element, pseudoElt);
      if (element && element.id === 'aswift_5_host') {
        return new Proxy(result, {
          get(target, prop) {
            if (prop === 'clipPath') {
              if (element.style.clipPath &&
                  element.style.clipPath.includes('circle(0')) {
                return 'circle(0px at 50% 50%)';
              }
            }
            if (prop === 'left') {
              return element.style.left || target.left;
            }
            if (prop === 'position') {
              return element.style.position || target.position;
            }
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
          }
        });
      }
      return result;
    };
    vectorStatus[3] = 'OK';
    log(3, 'getComputedStyle patched');
  } catch (e) {
    _getComputedStyle = _getComputedStyle || window.getComputedStyle;
    vectorStatus[3] = 'FAILED: ' + e.message;
    log(3, 'FAILED: ' + e.message);
  }

  // ─── Vector 4: Fake <ins> for script element check ─────────────────
  function ensureFakeAdSlot() {
    try {
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
      vectorStatus[4] = 'OK';
      log(4, 'Fake <ins> element created');
    } catch (e) {
      vectorStatus[4] = 'FAILED: ' + e.message;
      log(4, 'FAILED: ' + e.message);
    }
  }

  // ─── Vector 5: MutationObserver for overlays + consent + donate ─────
  function isOverlay(node) {
    if (!node || node.nodeType !== 1) return false;

    // Anti-adblock overlay (fixed, extreme z-index)
    if (node.style && node.style.position === 'fixed' &&
        parseInt(node.style.zIndex) > 2147483500) return true;

    // Google FC iframes
    if (node.tagName === 'IFRAME' &&
        (node.name === 'googlefcPresent' ||
         (node.src && node.src.includes('fundingchoicesmessages')))) return true;

    // Google consent interstitials
    if (node.getAttribute &&
        node.getAttribute('data-google-interstitial') !== null) return true;

    // Google FC consent dialog (CMP 300)
    const cls = node.className || '';
    if (typeof cls === 'string' &&
        (cls.includes('fc-consent-root') ||
         cls.includes('fc-dialog-overlay') ||
         cls.includes('fc-cta-consent'))) return true;

    // Donate floating button (yellow pill, bottom-left)
    if (typeof cls === 'string' && cls.includes('donate') &&
        cls.includes('item')) return true;

    return false;
  }

  function startObserver() {
    try {
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (isOverlay(node)) {
              log(5, 'Removed overlay: ' + (node.tagName || '') + '.' + (node.className || '') + '#' + (node.id || ''));
              node.remove();
            }
          }
        }
      });

      const target = document.body || document.documentElement;
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
      // Re-attach when body becomes available
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => {
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }
      vectorStatus[5] = 'OK';
      log(5, 'MutationObserver active');
    } catch (e) {
      vectorStatus[5] = 'FAILED: ' + e.message;
      log(5, 'FAILED: ' + e.message);
    }
  }

  // ─── Vector 6: SPA navigation awareness ────────────────────────────
  function onNavigate() {
    setTimeout(ensureFakeAdSlot, 0);
    setTimeout(ensureFakeAdSlot, 100);
    setTimeout(removeConsentAndOverlays, 200);
  }

  try {
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
    vectorStatus[6] = 'OK';
    log(6, 'SPA navigation hooks installed');
  } catch (e) {
    vectorStatus[6] = 'FAILED: ' + e.message;
    log(6, 'FAILED: ' + e.message);
  }

  // Periodic fallback: re-verify fake <ins> every 3s
  setInterval(ensureFakeAdSlot, 3000);

  // ─── Consent & overlay cleanup ─────────────────────────────────────
  function removeConsentAndOverlays() {
    // Google FC consent dialog root
    document.querySelectorAll(
      '.fc-consent-root, .fc-dialog-overlay, .fc-cta-consent, ' +
      '[class*="fc-consent"], [class*="fc-dialog"], ' +
      'iframe[src*="fundingchoicesmessages"], ' +
      'iframe[name="googlefcPresent"]'
    ).forEach(el => {
      log(5, 'Cleanup: removed ' + el.tagName + '.' + (el.className || ''));
      el.remove();
    });

    // Donate floating button (.item.donate in sidebar, links to donate.decrypt.day)
    document.querySelectorAll(
      '.item.donate, a[href*="donate.decrypt.day"]'
    ).forEach(el => {
      const target = el.closest('.item') || el;
      log(5, 'Cleanup: removed donate button');
      target.remove();
    });

    // High-z-index fixed overlays
    document.querySelectorAll('div').forEach(el => {
      try {
        const s = (_getComputedStyle || getComputedStyle).call(window, el);
        if (s.position === 'fixed' && parseInt(s.zIndex) > 2147483500) {
          log(5, 'Cleanup: removed fixed overlay z=' + s.zIndex);
          el.remove();
        }
      } catch (e) {}
    });
  }

  // ─── Boot ──────────────────────────────────────────────────────────
  startObserver();

  function onReady() {
    ensureFakeAdSlot();
    removeConsentAndOverlays();

    // Add title marker so user can confirm script ran
    if (!document.title.includes('[BYPASS]')) {
      document.title = '[BYPASS] ' + document.title;
      setTimeout(() => {
        // Restore original title after 3 seconds (just a flash indicator)
        document.title = document.title.replace('[BYPASS] ', '');
      }, 3000);
    }

    // Log final status
    console.log(TAG, 'Status:', JSON.stringify(vectorStatus));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', () => {
    onReady();
    // Second pass after everything is loaded
    setTimeout(removeConsentAndOverlays, 1000);
    setTimeout(removeConsentAndOverlays, 3000);
  });
})();
