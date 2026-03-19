// ==UserScript==
// @name         AO3 Enhanced
// @namespace    https://github.com/obus-schmobus/userscripts
// @version      1.0.0
// @description  Quality-of-life improvements for Archive of Our Own
// @author       obus-schmobus
// @match        https://archiveofourown.org/*
// @icon         https://archiveofourown.org/favicon.ico
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/obus-schmobus/userscripts/main/ao3-enhanced.user.js
// @downloadURL  https://raw.githubusercontent.com/obus-schmobus/userscripts/main/ao3-enhanced.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ── Fix: Prevent iOS Safari auto-zoom on input focus ──
  // Safari zooms in when focusing inputs with font-size < 16px.
  // We bump all text inputs/selects/textareas to 16px minimum.
  GM_addStyle(`
    input[type="text"],
    input[type="search"],
    input[type="email"],
    input[type="password"],
    input[type="url"],
    input[type="number"],
    textarea,
    select {
      font-size: max(16px, inherit) !important;
    }
  `);

  // Viewport lock fallback: temporarily set maximum-scale=1 on focus
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    const origContent = vp.content;

    document.addEventListener('focusin', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        vp.content = origContent.replace(/,?\s*maximum-scale=[^,]*/g, '') + ',maximum-scale=1';
      }
    });

    document.addEventListener('focusout', () => {
      vp.content = origContent;
    });
  }
})();
