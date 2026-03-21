// ==UserScript==
// @name         AO3 Enhanced
// @namespace    https://github.com/obus-schmobus/userscripts
// @version      1.0.1
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
  // Setting 16px directly is the only reliable fix; max(16px, inherit) is
  // invalid CSS (inherit isn't a comparable length) and viewport meta
  // maximum-scale tricks are ignored on modern iOS for accessibility.
  GM_addStyle(`
    input[type="text"],
    input[type="search"],
    input[type="email"],
    input[type="password"],
    input[type="url"],
    input[type="number"],
    input[type="tel"],
    input:not([type]),
    textarea,
    select {
      font-size: 16px !important;
    }
  `);
})();
