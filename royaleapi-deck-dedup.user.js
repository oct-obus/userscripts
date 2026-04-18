// ==UserScript==
// @name         RoyaleAPI Leaderboard Deck Deduplicator
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.0
// @description  Deduplicates leaderboard decks and adds similarity sorting on RoyaleAPI
// @author       Zen
// @match        https://royaleapi.com/decks/leaderboard*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-deck-dedup.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-deck-dedup.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ─── Deck Parsing ───────────────────────────────────────────────────

  function getCardKeysFromSegment(segment) {
    var deckRow = segment.querySelector('a.deck_lb__deck_row');
    if (!deckRow) return [];
    var imgs = deckRow.querySelectorAll('img.deck_card');
    var keys = [];
    for (var i = 0; i < imgs.length; i++) {
      var classList = imgs[i].className.split(/\s+/);
      for (var j = 0; j < classList.length; j++) {
        if (classList[j].indexOf('deck_card_key_') === 0) {
          keys.push(classList[j].slice('deck_card_key_'.length));
        }
      }
    }
    return keys;
  }

  function makeDeckFingerprint(cardKeys) {
    if (cardKeys.length < 3) return cardKeys.join(',');
    var firstThree = cardKeys.slice(0, 3).join('|');
    var sorted = cardKeys.slice().sort().join(',');
    return firstThree + '::' + sorted;
  }

  function cardSet(cardKeys) {
    var set = {};
    for (var i = 0; i < cardKeys.length; i++) {
      set[cardKeys[i]] = true;
    }
    return set;
  }

  function countSharedCards(keysA, keysB) {
    var setA = cardSet(keysA);
    var count = 0;
    for (var i = 0; i < keysB.length; i++) {
      if (setA[keysB[i]]) count++;
    }
    return count;
  }

  // ─── Deduplication ──────────────────────────────────────────────────

  function getAllDeckSegments() {
    var container = document.getElementById('deck_results');
    if (!container) return [];
    return Array.prototype.slice.call(
      container.querySelectorAll('.deck_segment')
    );
  }

  function deduplicateDecks(segments) {
    var seen = {};
    var hiddenCount = 0;
    var parseFailCount = 0;
    for (var i = 0; i < segments.length; i++) {
      var keys = getCardKeysFromSegment(segments[i]);
      if (keys.length === 0) {
        segments[i].setAttribute('data-dedup-noparse', 'true');
        parseFailCount++;
        continue;
      }
      var fp = makeDeckFingerprint(keys);
      if (seen[fp]) {
        segments[i].style.display = 'none';
        segments[i].setAttribute('data-dedup-hidden', 'true');
        hiddenCount++;
      } else {
        seen[fp] = true;
        segments[i].style.display = '';
        segments[i].removeAttribute('data-dedup-hidden');
      }
    }
    return { hidden: hiddenCount, parseFail: parseFailCount };
  }

  // ─── Similarity Sorting ─────────────────────────────────────────────

  function sortBySimilarity(segments) {
    var visible = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].getAttribute('data-dedup-hidden') === 'true') continue;
      if (segments[i].getAttribute('data-dedup-noparse') === 'true') continue;
      var keys = getCardKeysFromSegment(segments[i]);
      if (keys.length === 0) continue;
      visible.push({
        el: segments[i],
        keys: keys,
      });
    }
    if (visible.length === 0) return;

    // Greedy nearest-neighbor ordering
    var ordered = [visible[0]];
    var used = {};
    used[0] = true;

    for (var step = 1; step < visible.length; step++) {
      var last = ordered[ordered.length - 1];
      var bestIdx = -1;
      var bestScore = -1;
      for (var j = 0; j < visible.length; j++) {
        if (used[j]) continue;
        var score = countSharedCards(last.keys, visible[j].keys);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }
      if (bestIdx >= 0) {
        used[bestIdx] = true;
        ordered.push(visible[bestIdx]);
      }
    }

    var container = document.getElementById('deck_results');
    if (!container) return;

    // Re-append in similarity order (visible first, hidden at end)
    for (var k = 0; k < ordered.length; k++) {
      container.appendChild(ordered[k].el);
    }
    for (var m = 0; m < segments.length; m++) {
      if (segments[m].getAttribute('data-dedup-hidden') === 'true') {
        container.appendChild(segments[m]);
      }
    }
  }

  function restoreOriginalOrder(segments) {
    var container = document.getElementById('deck_results');
    if (!container) return;
    // Sort by original deck_N id
    var sorted = segments.slice().sort(function (a, b) {
      var idA = parseInt((a.id || '').replace('deck_', ''), 10) || 0;
      var idB = parseInt((b.id || '').replace('deck_', ''), 10) || 0;
      return idA - idB;
    });
    for (var i = 0; i < sorted.length; i++) {
      container.appendChild(sorted[i]);
    }
  }

  // ─── UI ─────────────────────────────────────────────────────────────

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      '.dedup-controls {' +
      '  display: flex; align-items: center; flex-wrap: wrap;' +
      '  padding: 10px 14px;' +
      '  background: #f8f8f8;' +
      '  border: 1px solid #ddd;' +
      '  border-radius: 4px;' +
      '  margin-bottom: 8px;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '  font-size: 13px;' +
      '  color: #333;' +
      '}' +
      '.dedup-controls label {' +
      '  display: flex; align-items: center; cursor: pointer;' +
      '  user-select: none; -webkit-user-select: none;' +
      '  margin-right: 12px;' +
      '}' +
      '.dedup-controls input[type="checkbox"] {' +
      '  width: 16px; height: 16px; margin: 0 6px 0 0;' +
      '}' +
      '.dedup-status {' +
      '  color: #888; font-size: 12px;' +
      '}';
    document.head.appendChild(style);
  }

  function createControls() {
    var wrapper = document.createElement('div');
    wrapper.className = 'dedup-controls';

    var statusSpan = document.createElement('span');
    statusSpan.className = 'dedup-status';

    var simLabel = document.createElement('label');
    var simCheckbox = document.createElement('input');
    simCheckbox.type = 'checkbox';
    simLabel.appendChild(simCheckbox);
    simLabel.appendChild(document.createTextNode('Sort by similarity'));

    wrapper.appendChild(simLabel);
    wrapper.appendChild(statusSpan);

    return { wrapper: wrapper, simCheckbox: simCheckbox, statusSpan: statusSpan };
  }

  // ─── Main ───────────────────────────────────────────────────────────

  function init() {
    var container = document.getElementById('deck_results');
    if (!container) return;

    var segments = getAllDeckSegments();
    if (segments.length === 0) return;

    injectStyles();
    var controls = createControls();

    container.parentNode.insertBefore(controls.wrapper, container);

    // Run dedup immediately
    var result = deduplicateDecks(segments);
    var visibleCount = segments.length - result.hidden - result.parseFail;
    controls.statusSpan.textContent =
      visibleCount + ' unique decks (' + result.hidden + ' duplicates hidden)';

    // Similarity toggle
    controls.simCheckbox.addEventListener('change', function () {
      // Re-fetch segments since DOM order may have changed
      var currentSegments = getAllDeckSegments();
      if (controls.simCheckbox.checked) {
        sortBySimilarity(currentSegments);
      } else {
        restoreOriginalOrder(currentSegments);
      }
    });
  }

  // Wait for deck results to appear (handles dynamic/progressive loading)
  function waitForDecks() {
    if (document.getElementById('deck_results') &&
        document.querySelectorAll('.deck_segment').length > 0) {
      init();
      return;
    }
    var debounceTimer = null;
    var observer = new MutationObserver(function () {
      if (!document.getElementById('deck_results') ||
          document.querySelectorAll('.deck_segment').length === 0) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        observer.disconnect();
        init();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  waitForDecks();
})();
