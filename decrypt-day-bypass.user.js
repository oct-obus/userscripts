// ==UserScript==
// @name        Decrypt.day Bypass
// @namespace   https://decrypt.day
// @version     1.0.0
// @description Bypass ad blocker detection, remove consent banner, and clean up annoyances on decrypt.day
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

  // --- 1. Fake the AdSense global to pass the script-load check ---
  const pubId = 'pub-7963386435348203';
  const encodedPubId = btoa(pubId);

  // The anti-adblock checks window[btoa(pubId)] for a protobuf-like object
  // that contains the publisher ID at field index 1. We fake it.
  window[encodedPubId] = btoa(JSON.stringify([pubId]));

  // Fake adsbygoogle array so push() calls don't throw
  window.adsbygoogle = window.adsbygoogle || [];
  if (!window.adsbygoogle.push.__patched) {
    const origPush = window.adsbygoogle.push.bind(window.adsbygoogle);
    window.adsbygoogle.push = function () {
      try { return origPush.apply(this, arguments); } catch (e) { /* swallow */ }
    };
    window.adsbygoogle.push.__patched = true;
  }

  // Neutralize the anti-adblock orchestrator before it initializes
  Object.defineProperty(window, '__h82AlnkH6D91__', {
    value: function () { /* no-op */ },
    writable: false,
    configurable: false
  });

  // --- 2. Prevent Funding Choices / CMP scripts from loading ---
  const blockedPatterns = [
    'fundingchoicesmessages.google.com',
    'pagead2.googlesyndication.com',
    'adsbygoogle',
    'googlefcPresent',
    'gstatic.com/0emn'
  ];

  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreateElement(tag);
    if (tag.toLowerCase() === 'script') {
      const origSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
      Object.defineProperty(el, 'src', {
        set(val) {
          if (typeof val === 'string' && blockedPatterns.some(p => val.includes(p))) {
            // Block by setting a no-op data URI
            origSetSrc.call(this, 'data:text/javascript,void(0)');
            return;
          }
          origSetSrc.call(this, val);
        },
        get() {
          return Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').get.call(this);
        },
        configurable: true
      });
    }
    if (tag.toLowerCase() === 'iframe') {
      const origSetName = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'name') ||
                          Object.getOwnPropertyDescriptor(Element.prototype, 'name') ||
                          { set: function (v) { this.setAttribute('name', v); } };
      const nameDesc = Object.getOwnPropertyDescriptor(el, 'name') || origSetName;
      Object.defineProperty(el, 'name', {
        set(val) {
          if (val === 'googlefcPresent') {
            // Pretend the iframe exists without adding it
            if (nameDesc.set) nameDesc.set.call(this, val);
            return;
          }
          if (nameDesc.set) nameDesc.set.call(this, val);
          else this.setAttribute('name', val);
        },
        get() {
          if (nameDesc.get) return nameDesc.get.call(this);
          return this.getAttribute('name');
        },
        configurable: true
      });
    }
    return el;
  };

  // --- 3. Keep bait element visible (defeat the div-gpt-ad check) ---
  const adClasses = ['div-gpt-ad', 'adsbygoogle', 'ad-slot', 'ad-container'];

  function isAdBait(el) {
    if (!el || !el.className) return false;
    const cn = typeof el.className === 'string' ? el.className : '';
    return adClasses.some(c => cn.includes(c));
  }

  // Patch offsetHeight/offsetWidth for bait elements
  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    get() {
      const val = origOffsetHeight.get.call(this);
      if (val === 0 && isAdBait(this)) return 1;
      return val;
    },
    configurable: true
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    get() {
      const val = origOffsetWidth.get.call(this);
      if (val === 0 && isAdBait(this)) return 1;
      return val;
    },
    configurable: true
  });

  // --- 4. DOM cleanup on load ---
  function cleanup() {
    // Remove Funding Choices consent banner iframes
    document.querySelectorAll('iframe[name="googlefcPresent"]').forEach(el => el.remove());
    document.querySelectorAll('iframe[src*="fundingchoicesmessages"]').forEach(el => el.remove());

    // Remove Google consent/CMP overlays
    document.querySelectorAll('[data-google-interstitial], [data-nosnippet]').forEach(el => {
      if (el.querySelector('iframe[src*="fundingchoicesmessages"]') ||
          el.textContent.includes('consent') ||
          el.textContent.includes('Privacy')) {
        el.remove();
      }
    });

    // Remove fixed-position anti-adblock warning banners
    document.querySelectorAll('div').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && style.bottom === '0px' &&
          parseInt(style.zIndex) > 2147483500) {
        el.remove();
      }
    });

    // Remove the donate sidebar item
    document.querySelectorAll('.item.donate, .donate').forEach(el => {
      if (el.closest && el.closest('nav, aside')) {
        el.remove();
      }
    });

    // Remove donate footer link
    document.querySelectorAll('a[href*="donate.decrypt.day"]').forEach(el => {
      const li = el.closest('.item, nav > a') || el;
      li.remove();
    });

    // Remove inline ad containers
    document.querySelectorAll('ins.adsbygoogle').forEach(el => {
      const wrapper = el.closest('center, .w-full');
      if (wrapper) wrapper.remove();
      else el.remove();
    });

    // Ensure download button is enabled and clickable
    document.querySelectorAll('.download-btn, .download-btn-other').forEach(btn => {
      btn.disabled = false;
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.classList.remove('dd-btn-disabled', 'btn-disabled');
    });
  }

  // --- 5. Neutralize the self-healing overlay ---
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay, ...args) {
    if (typeof fn === 'function' && delay === 50) {
      const fnStr = fn.toString();
      // The self-healing function nb() calls itself at 50ms intervals
      if (fnStr.length < 200 && (fnStr.includes('offsetHeight') || fnStr.includes('offsetWidth'))) {
        return 0; // Suppress the re-creation timer
      }
    }
    return origSetTimeout.call(this, fn, delay, ...args);
  };

  // --- 6. Run cleanup aggressively ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup);
  } else {
    cleanup();
  }
  window.addEventListener('load', cleanup);

  // MutationObserver for elements added after load
  const observer = new MutationObserver(mutations => {
    let needsCleanup = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node;
        // Detect anti-adblock overlay re-creation (high z-index fixed elements)
        if (el.style && el.style.position === 'fixed' && el.style.zIndex &&
            parseInt(el.style.zIndex) > 2147483500) {
          el.remove();
          continue;
        }
        // Detect consent banners and ad iframes
        if (el.tagName === 'IFRAME' &&
            (el.name === 'googlefcPresent' ||
             (el.src && el.src.includes('fundingchoicesmessages')))) {
          el.remove();
          continue;
        }
        if (el.tagName === 'INS' && el.classList.contains('adsbygoogle')) {
          needsCleanup = true;
        }
        // Catch Google consent dialogs
        if (el.getAttribute && el.getAttribute('data-google-interstitial') !== null) {
          el.remove();
          continue;
        }
      }
    }
    if (needsCleanup) cleanup();
  });

  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  };
  startObserver();

  // Signal that googlefcPresent iframe "exists" without creating it
  if (!window.frames['googlefcPresent']) {
    try {
      Object.defineProperty(window.frames, 'googlefcPresent', {
        value: true,
        writable: false,
        configurable: true
      });
    } catch (e) { /* frames may not be configurable in all browsers */ }
  }
})();
