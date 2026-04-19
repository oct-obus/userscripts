// ==UserScript==
// @name         RoyaleAPI Leaderboard Deck Deduplicator
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.1
// @description  Deduplicates leaderboard decks and adds similarity sorting with collapsible groups on RoyaleAPI
// @author       Zen
// @match        https://royaleapi.com/decks/leaderboard*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-deck-dedup.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-deck-dedup.user.js
// ==/UserScript==

(function () {
  'use strict';

  var GROUP_THRESHOLD = 4; // min shared cards to stay in same group

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

  function formatCardName(slug) {
    return slug.replace(/-ev\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function describeGroup(decks) {
    if (decks.length === 0) return 'Empty group';
    // Find cards shared by all decks in the group
    var common = cardSet(decks[0].keys);
    for (var i = 1; i < decks.length; i++) {
      var current = cardSet(decks[i].keys);
      for (var key in common) {
        if (!current[key]) delete common[key];
      }
    }
    var commonKeys = Object.keys(common);
    if (commonKeys.length > 0) {
      var names = commonKeys.slice(0, 4).map(formatCardName);
      var label = names.join(', ');
      if (commonKeys.length > 4) label += ' +' + (commonKeys.length - 4);
      return label;
    }
    // Fallback: most frequent cards across the group
    var freq = {};
    for (var d = 0; d < decks.length; d++) {
      for (var k = 0; k < decks[d].keys.length; k++) {
        var card = decks[d].keys[k];
        freq[card] = (freq[card] || 0) + 1;
      }
    }
    var pairs = Object.keys(freq).map(function (key) { return { key: key, count: freq[key] }; });
    pairs.sort(function (a, b) { return b.count - a.count; });
    var topNames = pairs.slice(0, 3).map(function (p) { return formatCardName(p.key); });
    return topNames.join(', ') + ' variants';
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

  // ─── Similarity Sorting + Grouping ──────────────────────────────────

  function getVisibleDecks(segments) {
    var visible = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].getAttribute('data-dedup-hidden') === 'true') continue;
      if (segments[i].getAttribute('data-dedup-noparse') === 'true') continue;
      var keys = getCardKeysFromSegment(segments[i]);
      if (keys.length === 0) continue;
      visible.push({ el: segments[i], keys: keys });
    }
    return visible;
  }

  function greedyNearestNeighborOrder(visible) {
    if (visible.length === 0) return [];
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
    return ordered;
  }

  function buildGroups(ordered) {
    if (ordered.length === 0) return [];
    var groups = [{ decks: [ordered[0]] }];
    for (var i = 1; i < ordered.length; i++) {
      var prev = ordered[i - 1];
      var curr = ordered[i];
      var shared = countSharedCards(prev.keys, curr.keys);
      if (shared < GROUP_THRESHOLD) {
        groups.push({ decks: [curr] });
      } else {
        groups[groups.length - 1].decks.push(curr);
      }
    }
    // Generate labels
    for (var g = 0; g < groups.length; g++) {
      groups[g].label = describeGroup(groups[g].decks);
      groups[g].count = groups[g].decks.length;
    }
    return groups;
  }

  function removeGroupHeaders() {
    var headers = document.querySelectorAll('.dedup-group-header');
    for (var i = 0; i < headers.length; i++) {
      headers[i].remove();
    }
  }

  function resetSegmentVisibility(segments) {
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].getAttribute('data-dedup-hidden') !== 'true') {
        segments[i].style.display = '';
      }
    }
  }

  function sortAndGroup(segments) {
    removeGroupHeaders();
    resetSegmentVisibility(segments);
    var visible = getVisibleDecks(segments);
    var ordered = greedyNearestNeighborOrder(visible);
    var groups = buildGroups(ordered);
    var container = document.getElementById('deck_results');
    if (!container) return;

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var header = createGroupHeader(group.label, group.count, g);
      container.appendChild(header);
      for (var d = 0; d < group.decks.length; d++) {
        group.decks[d].el.setAttribute('data-dedup-group', String(g));
        container.appendChild(group.decks[d].el);
      }
    }
    // Append hidden decks at end
    for (var m = 0; m < segments.length; m++) {
      if (segments[m].getAttribute('data-dedup-hidden') === 'true') {
        container.appendChild(segments[m]);
      }
    }
  }

  function restoreOriginalOrder(segments) {
    removeGroupHeaders();
    resetSegmentVisibility(segments);
    var container = document.getElementById('deck_results');
    if (!container) return;
    var sorted = segments.slice().sort(function (a, b) {
      var idA = parseInt((a.id || '').replace('deck_', ''), 10) || 0;
      var idB = parseInt((b.id || '').replace('deck_', ''), 10) || 0;
      return idA - idB;
    });
    for (var i = 0; i < sorted.length; i++) {
      sorted[i].removeAttribute('data-dedup-group');
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
      '}' +
      '.dedup-group-header {' +
      '  display: flex; align-items: center; justify-content: space-between;' +
      '  padding: 14px 14px;' +
      '  margin-top: 12px;' +
      '  min-height: 44px;' +
      '  background: linear-gradient(135deg, #ff8c00, #e67600);' +
      '  border-radius: 4px 4px 0 0;' +
      '  cursor: pointer;' +
      '  user-select: none; -webkit-user-select: none;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '  color: #fff;' +
      '  font-size: 13px;' +
      '  font-weight: 600;' +
      '  -webkit-tap-highlight-color: transparent;' +
      '}' +
      '.dedup-group-header:first-child { margin-top: 0; }' +
      '.dedup-group-header:active { opacity: 0.85; }' +
      '.dedup-group-header .dedup-group-label {' +
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' +
      '  margin-right: 8px;' +
      '}' +
      '.dedup-group-header .dedup-group-meta {' +
      '  display: flex; align-items: center; flex-shrink: 0;' +
      '}' +
      '.dedup-group-header .dedup-group-count {' +
      '  background: rgba(255,255,255,0.25);' +
      '  border-radius: 10px;' +
      '  padding: 1px 8px;' +
      '  font-size: 11px;' +
      '  margin-right: 8px;' +
      '}' +
      '.dedup-group-header .dedup-group-chevron {' +
      '  font-size: 16px; line-height: 1;' +
      '  transition: transform 0.2s ease;' +
      '}' +
      '.dedup-group-header.collapsed .dedup-group-chevron {' +
      '  transform: rotate(-90deg);' +
      '}';
    document.head.appendChild(style);
  }

  function createGroupHeader(label, count, groupIndex) {
    var header = document.createElement('div');
    header.className = 'dedup-group-header';
    header.setAttribute('data-dedup-group-idx', String(groupIndex));

    var labelSpan = document.createElement('span');
    labelSpan.className = 'dedup-group-label';
    labelSpan.textContent = label;

    var metaDiv = document.createElement('span');
    metaDiv.className = 'dedup-group-meta';

    var countBadge = document.createElement('span');
    countBadge.className = 'dedup-group-count';
    countBadge.textContent = count + (count === 1 ? ' deck' : ' decks');

    var chevron = document.createElement('span');
    chevron.className = 'dedup-group-chevron';
    chevron.textContent = '▾';

    metaDiv.appendChild(countBadge);
    metaDiv.appendChild(chevron);
    header.appendChild(labelSpan);
    header.appendChild(metaDiv);

    header.addEventListener('click', function () {
      var isCollapsed = header.classList.toggle('collapsed');
      var gIdx = header.getAttribute('data-dedup-group-idx');
      var members = document.querySelectorAll('.deck_segment[data-dedup-group="' + gIdx + '"]');
      for (var i = 0; i < members.length; i++) {
        members[i].style.display = isCollapsed ? 'none' : '';
      }
    });

    return header;
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
      var currentSegments = getAllDeckSegments();
      if (controls.simCheckbox.checked) {
        sortAndGroup(currentSegments);
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
