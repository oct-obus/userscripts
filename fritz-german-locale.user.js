// ==UserScript==
// @name         Fritz.com German Locale Fix
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.0.0
// @description  Forces fritz.com to use the German locale instead of auto-redirecting to English
// @author       Zen
// @match        https://fritz.com/*
// @match        https://www.fritz.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const englishPrefixes = ['/en/', '/en-at/', '/en-be/', '/en-it/', '/en-lu/', '/en-nl/', '/en-es/', '/en-pl/', '/en-ch/'];
  const path = location.pathname;

  for (const prefix of englishPrefixes) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      location.replace(location.origin + '/' + rest + location.search + location.hash);
      return;
    }
  }

  // Block Shopify's locale redirect by intercepting pushState/replaceState
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  function blockEnglishRedirect(orig) {
    return function (state, title, url) {
      if (url && typeof url === 'string') {
        for (const prefix of englishPrefixes) {
          if (url.includes(prefix)) {
            return; // silently block the redirect
          }
        }
      }
      return orig.call(this, state, title, url);
    };
  }

  history.pushState = blockEnglishRedirect(origPushState);
  history.replaceState = blockEnglishRedirect(origReplaceState);

  // Also intercept location.assign/replace calls from Shopify JS
  const origAssign = location.assign;
  const origLocationReplace = location.replace;

  function wrapLocationMethod(orig) {
    return function (url) {
      if (url && typeof url === 'string') {
        for (const prefix of englishPrefixes) {
          if (url.includes(prefix)) {
            return; // block
          }
        }
      }
      return orig.call(this, url);
    };
  }

  // These may throw in some browsers due to location being special,
  // so wrap in try/catch
  try { location.assign = wrapLocationMethod(origAssign); } catch (e) {}
  try { location.replace = wrapLocationMethod(origLocationReplace); } catch (e) {}
})();
