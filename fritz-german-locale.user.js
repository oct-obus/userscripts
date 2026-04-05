// ==UserScript==
// @name         Fritz.com German Locale Fix
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.1.0
// @description  Forces fritz.com to use the German locale instead of auto-redirecting to English
// @author       Zen
// @match        https://fritz.com/*
// @match        https://www.fritz.com/*
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-german-locale.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-german-locale.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const enPrefixRe = /^\/(en|en-at|en-be|en-it|en-lu|en-nl|en-es|en-pl|en-ch)\//;
  const match = location.pathname.match(enPrefixRe);
  if (!match) return;

  // We're on an /en/ page due to server-side 302 based on Accept-Language.
  // Can't prevent the redirect, so fetch the German version and replace the page.
  const germanPath = '/' + location.pathname.slice(match[0].length);
  const germanUrl = location.origin + germanPath + location.search + location.hash;

  // Stop the English page from rendering
  document.documentElement.innerHTML = '';

  fetch(germanUrl, {
    headers: { 'Accept-Language': 'de-DE,de;q=0.9' },
    redirect: 'manual'
  })
    .then(function (resp) {
      if (resp.type === 'opaqueredirect' || !resp.ok) {
        // Fallback: follow redirect and return that
        return fetch(germanUrl, {
          headers: { 'Accept-Language': 'de-DE,de;q=0.9' }
        });
      }
      return resp;
    })
    .then(function (resp) { return resp.text(); })
    .then(function (html) {
      // Replace the entire document with the German content
      document.open();
      document.write(html);
      document.close();

      // Update the URL bar to show the German path
      try {
        history.replaceState(null, '', germanUrl);
      } catch (e) {}
    })
    .catch(function () {
      // If fetch fails, just let the English page load
      location.reload();
    });
})();
