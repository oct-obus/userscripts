// ==UserScript==
// @name        Decrypt.day Bypass
// @namespace   https://decrypt.day
// @version     3.0.0
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

  const VERSION = '3.0.0';
  const TAG = '[Decrypt.day Bypass]';
  console.log(TAG, 'v' + VERSION, 'loaded at', performance.now().toFixed(1) + 'ms');
  window.__decryptBypass = VERSION;

  // ───────────────────────────────────────────────────────────────
  // PHASE 1: Pre-emptive patches (help when timing allows)
  // ───────────────────────────────────────────────────────────────

  // V1: Trap FC orchestrator
  try {
    Object.defineProperty(window, '__h82AlnkH6D91__', {
      get() { return function () {}; }, set() {}, configurable: false
    });
  } catch (e) { try { window.__h82AlnkH6D91__ = function () {}; } catch (e2) {} }

  // V2: Publisher global + adsbygoogle
  try {
    const PUB_ID = 'pub-7963386435348203';
    window[btoa(PUB_ID)] = btoa(JSON.stringify([PUB_ID]));
    window.adsbygoogle = window.adsbygoogle || [];
  } catch (e) {}

  // V3: getComputedStyle patch for CSS bait check
  const _gcs = window.getComputedStyle;
  try {
    window.getComputedStyle = function (el, pseudo) {
      const r = _gcs.call(this, el, pseudo);
      if (el && el.id === 'aswift_5_host') {
        return new Proxy(r, {
          get(t, p) {
            if (p === 'clipPath' && el.style.clipPath?.includes('circle(0'))
              return 'circle(0px at 50% 50%)';
            if (p === 'left') return el.style.left || t.left;
            if (p === 'position') return el.style.position || t.position;
            const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
          }
        });
      }
      return r;
    };
  } catch (e) {}

  // V4: Fake <ins> for script element check
  function ensureFakeAdSlot() {
    try {
      if (document.querySelector('ins[data-adsbygoogle-status="done"][data-ad-status="filled"]')) return;
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.setAttribute('data-adsbygoogle-status', 'done');
      ins.setAttribute('data-ad-status', 'filled');
      ins.style.cssText = 'display:none;width:0;height:0';
      (document.body || document.documentElement).appendChild(ins);
    } catch (e) {}
  }

  // ───────────────────────────────────────────────────────────────
  // PHASE 2: Post-hoc remediation (works even when injected late)
  // ───────────────────────────────────────────────────────────────

  let capturedFiles = [];

  function getAppSlug() {
    return location.pathname.match(/\/app\/([^/]+)/)?.[1] || '';
  }

  // ─── Fetch interceptor: capture ?/files response ───────────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('?/files')) {
        const clone = resp.clone();
        const text = await clone.text();
        parseFilesResponse(text);
      }
    } catch (e) {
      console.warn(TAG, 'Fetch intercept error:', e);
    }
    return resp;
  };

  // Minimal devalue unflatten (SvelteKit serialization format)
  function devalueUnflatten(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return arr;
    const hydrated = new Array(arr.length);
    const filled = new Array(arr.length).fill(false);

    function hydrate(index) {
      if (filled[index]) return hydrated[index];
      filled[index] = true;
      const value = arr[index];

      if (value === null || value === undefined || typeof value !== 'object') {
        hydrated[index] = value;
        return value;
      }
      if (Array.isArray(value)) {
        const result = [];
        hydrated[index] = result;
        for (const ref of value) {
          result.push(typeof ref === 'number' ? hydrate(ref) : ref);
        }
        return result;
      }
      const result = {};
      hydrated[index] = result;
      for (const [key, ref] of Object.entries(value)) {
        result[key] = typeof ref === 'number' ? hydrate(ref) : ref;
      }
      return result;
    }

    return hydrate(0);
  }

  function findFilesInObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj.files) && obj.files.length > 0 && obj.files[0]?.id) {
      return obj.files;
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        const found = findFilesInObject(val);
        if (found) return found;
      }
    }
    return null;
  }

  function parseFilesResponse(text) {
    try {
      const outer = JSON.parse(text);
      if (outer.type !== 'success' || !outer.data) return;

      let data;
      if (Array.isArray(outer.data)) {
        data = devalueUnflatten(outer.data);
      } else if (typeof outer.data === 'string') {
        try { data = devalueUnflatten(JSON.parse(outer.data)); } catch (e) {}
      } else if (typeof outer.data === 'object') {
        data = outer.data;
      }

      if (data) {
        const files = findFilesInObject(data);
        if (files) {
          capturedFiles = files;
          console.log(TAG, 'Captured', capturedFiles.length, 'files:', capturedFiles.map(f => f.id));
          setTimeout(patchDownloadDialog, 50);
          return;
        }
      }

      // Fallback: extract IDs from raw text via regex
      if (typeof text === 'string' && text.includes('"files"')) {
        const idPattern = /"([a-zA-Z0-9_-]{15,40})"/g;
        const ids = [];
        let match;
        while ((match = idPattern.exec(text)) !== null) {
          const c = match[1];
          if (!['success', 'files', 'error', 'where', 'unknown'].includes(c)) ids.push(c);
        }
        if (ids.length > 0) {
          capturedFiles = ids.map(id => ({ id }));
          console.log(TAG, 'Captured file IDs (regex):', ids);
          setTimeout(patchDownloadDialog, 50);
        }
      }
    } catch (e) {
      console.warn(TAG, 'Parse files error:', e);
    }
  }

  // ─── Download dialog patcher ───────────────────────────────────
  function patchDownloadDialog() {
    const dialog = document.querySelector('.download-dialog');
    if (!dialog) return;

    // Remove ad blocker warning (orange banner with "ad block" text)
    dialog.querySelectorAll('div').forEach(el => {
      const cls = el.className || '';
      if ((cls.includes('bg-orange-900') || cls.includes('border-orange-700')) &&
          (el.textContent?.toLowerCase().includes('ad block') ||
           el.textContent?.toLowerCase().includes('not allowed'))) {
        el.remove();
        console.log(TAG, 'Removed ad blocker warning');
      }
    });

    // Enable disabled download buttons
    const slug = getAppSlug();
    const disabledBtns = dialog.querySelectorAll('.dd-btn-disabled');

    disabledBtns.forEach((btn, idx) => {
      if (btn.dataset.bypassed) return;
      btn.dataset.bypassed = 'true';

      btn.classList.remove('dd-btn-disabled');
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.removeAttribute('disabled');

      const fileId = capturedFiles[idx]?.id;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (fileId && slug) {
          const url = '/app/' + slug + '/dl/' + fileId;
          console.log(TAG, 'Opening download:', url);
          window.open(url, '_blank');
        } else {
          console.warn(TAG, 'File ID not captured for button', idx);
          alert('Bypass: file ID not captured. Try refreshing and clicking Download again.');
        }
      });

      console.log(TAG, 'Enabled button', idx, fileId ? '-> ' + fileId : '(no ID yet)');
    });
  }

  // ─── Consent / overlay / donate cleanup ────────────────────────
  function cleanupUI() {
    // Google FC consent dialog
    document.querySelectorAll(
      '.fc-consent-root, .fc-dialog-overlay, [class*="fc-consent"], [class*="fc-dialog"], ' +
      'iframe[src*="fundingchoicesmessages"], iframe[name="googlefcPresent"]'
    ).forEach(el => el.remove());

    // Consent by text content
    document.querySelectorAll('div, section').forEach(el => {
      const text = el.textContent || '';
      if (text.includes('Privacy and cookie settings') &&
          text.includes('Managed by Google') &&
          el.children.length > 0) {
        let root = el;
        for (let i = 0; i < 10; i++) {
          if (!root.parentElement || root.parentElement === document.body) break;
          const pos = getComputedStyle(root.parentElement).position;
          if (pos === 'fixed' || pos === 'absolute') { root = root.parentElement; break; }
          root = root.parentElement;
        }
        console.log(TAG, 'Removed consent banner');
        root.remove();
      }
    });

    // Donate button
    document.querySelectorAll('.item.donate, a[href*="donate.decrypt.day"]').forEach(el => {
      (el.closest('.item') || el).remove();
    });

    // High-z-index fixed overlays (FC self-healing banner)
    document.querySelectorAll('div').forEach(el => {
      if (el.style?.position === 'fixed' && parseInt(el.style.zIndex) > 2147483500) el.remove();
    });

    // Google consent interstitials
    document.querySelectorAll('[data-google-interstitial]').forEach(el => el.remove());
  }

  // ─── CSS injection ─────────────────────────────────────────────
  function injectCSS() {
    const style = document.createElement('style');
    style.textContent =
      '.dd-btn-disabled{pointer-events:auto!important;opacity:1!important;cursor:pointer!important}' +
      '.download-dialog [class*="bg-orange-900"]{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── MutationObserver ──────────────────────────────────────────
  function startObserver() {
    let timer = null;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.querySelector('.dd-btn-disabled:not([data-bypassed])')) patchDownloadDialog();
        cleanupUI();
      }, 100);
    });

    function attach(t) { if (t) observer.observe(t, { childList: true, subtree: true }); }
    attach(document.body || document.documentElement);
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => attach(document.body));
    }
  }

  // ─── SPA navigation ───────────────────────────────────────────
  function onNavigate() {
    capturedFiles = [];
    setTimeout(ensureFakeAdSlot, 0);
    setTimeout(cleanupUI, 200);
  }
  try {
    const _ps = history.pushState, _rs = history.replaceState;
    history.pushState = function () { _ps.apply(this, arguments); onNavigate(); };
    history.replaceState = function () { _rs.apply(this, arguments); onNavigate(); };
    window.addEventListener('popstate', onNavigate);
  } catch (e) {}

  // ─── Boot ──────────────────────────────────────────────────────
  injectCSS();
  startObserver();

  function onReady() {
    ensureFakeAdSlot();
    cleanupUI();
    if (!document.title.includes('[BYPASS]')) {
      document.title = '[BYPASS] ' + document.title;
      setTimeout(() => { document.title = document.title.replace('[BYPASS] ', ''); }, 3000);
    }
    console.log(TAG, 'Ready. Phase 1 + Phase 2 active.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('load', () => {
    onReady();
    setTimeout(cleanupUI, 1000);
    setTimeout(cleanupUI, 3000);
  });

  setInterval(() => {
    ensureFakeAdSlot();
    if (document.querySelector('.dd-btn-disabled:not([data-bypassed])')) patchDownloadDialog();
  }, 2000);
})();
