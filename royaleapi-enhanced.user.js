// ==UserScript==
// @name         RoyaleAPI Card Selector Enhanced
// @namespace    https://github.com/obus-schmobus/royaleapi-userscript
// @version      3.3.2
// @description  Groups card selector by rarity with collapsible sections, split views for Heroes/Evos/Tower Troops and Buildings/Spells (auto-scraped), fuzzy search, tinting, and 1.15x sizing
// @author       Zen & Obus
// @match        https://royaleapi.com/decks/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-enhanced.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/royaleapi-enhanced.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CARD_WIDTH = 86;
  const CARD_HEIGHT = 104;

  const TOWER_TROOP_FALLBACK = ['tower-princess', 'cannoneer', 'dagger-duchess', 'royal-chef', 'tricky-barrel'];

  // Cards royaleapi.com still tags as Building but were reclassified as Troop in-game.
  // Base keys only — getCardType strips evo/hero suffixes before DB lookup.
  const BUILDING_TO_TROOP_OVERRIDES = new Set(['furnace']);

  const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];

  const GROUP_COLORS = {
    Common:           { bg: '#b0b0b0', text: '#333' },
    Rare:             { bg: '#f9a825', text: '#333' },
    Epic:             { bg: '#ab47bc', text: '#fff' },
    Legendary:        { bg: '#ff7043', text: '#fff' },
    Champion:         { bg: '#42a5f5', text: '#fff' },
    Champions:        { bg: '#42a5f5', text: '#fff' },
    Heroes:           { bg: '#26c6da', text: '#333' },
    Evolutions:       { bg: '#66bb6a', text: '#333' },
    'Tower Troops':   { bg: '#8d6e63', text: '#fff' },
    Buildings:        { bg: '#d4a373', text: '#333' },
    Spells:           { bg: '#9c89b8', text: '#fff' }
  };

  // ── localStorage keys ──
  const STORAGE_KEY_SPLIT_TOWER = 'ra-split-tower';
  const STORAGE_KEY_INLINE_EH = 'ra-inline-evo-hero';
  const STORAGE_KEY_SPLIT_BS = 'ra-split-buildings-spells';
  const STORAGE_KEY_COLLAPSED = 'ra-collapsed-groups';
  const STORAGE_KEY_CARD_DB = 'ra-card-db';
  const STORAGE_KEY_CARD_DB_TS = 'ra-card-db-ts';

  function loadPref(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function savePref(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  // ── Card type database (scraped from /cards/popular) ──
  // Format: { "card-key": "Troop"|"Building"|"Spell", ... }
  let cardDB = loadPref(STORAGE_KEY_CARD_DB, {});
  let cardDBTimestamp = loadPref(STORAGE_KEY_CARD_DB_TS, null);

  async function fetchCardDB() {
    const url = '/cards/popular?time=7d&mode=grid&cat=Ranked&sort=rating';
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const items = doc.querySelectorAll('.grid_item[data-card][data-type]');
      if (items.length === 0) throw new Error('No card data found on page');

      // Extract authoritative spells and winConditions lists from the page's JS bundle.
      // The site's Spells filter tab uses a curated `spells` array that excludes
      // win-condition spells (graveyard, goblin-barrel) and misclassified cards
      // (spirit-empress). We cross-reference both lists to correct only the truly
      // wrong data-type="Spell" entries (cards in neither list).
      let spellsSet = null;
      let winConSet = null;
      const jsTag = doc.querySelector('script[src*="cards_popular"]');
      if (jsTag) {
        try {
          const jsResp = await fetch(jsTag.getAttribute('src'));
          if (jsResp.ok) {
            const js = await jsResp.text();
            const sm = js.match(/\bspells\s*=\s*\[([^\]]+)\]/);
            if (sm) {
              const quoted = sm[1].match(/"([^"]+)"/g);
              if (quoted) spellsSet = new Set(quoted.map(s => s.replace(/"/g, '')));
            }
            const wm = js.match(/\bwinConditions\s*=\s*\[([^\]]+)\]/);
            if (wm) {
              const quoted = wm[1].match(/"([^"]+)"/g);
              if (quoted) winConSet = new Set(quoted.map(s => s.replace(/"/g, '')));
            }
          }
        } catch (_) { /* fall back to data-type only */ }
      }

      const db = {};
      for (const item of items) {
        const key = item.dataset.card;
        let type = item.dataset.type;
        // Correct misclassified Spells: if a card has data-type="Spell" but
        // isn't in the spells list OR the winConditions list, it's genuinely
        // not a spell (e.g. spirit-empress). Reclassify as Troop.
        if (spellsSet && type === 'Spell' && !spellsSet.has(key) &&
            !(winConSet && winConSet.has(key))) {
          type = 'Troop';
        }
        // Correct cards royaleapi.com still tags as Building after in-game reclassification.
        if (type === 'Building' && BUILDING_TO_TROOP_OVERRIDES.has(key)) {
          type = 'Troop';
        }
        if (key && type) db[key] = type;
      }
      cardDB = db;
      cardDBTimestamp = new Date().toISOString();
      savePref(STORAGE_KEY_CARD_DB, cardDB);
      savePref(STORAGE_KEY_CARD_DB_TS, cardDBTimestamp);
      return { ok: true, count: Object.keys(db).length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function getCardType(key) {
    const baseKey = key.replace(/-ev\d+$/, '').replace(/-hero$/, '');
    return cardDB[baseKey] || null;
  }

  let allCards = [];
  let splitTowerMode = loadPref(STORAGE_KEY_SPLIT_TOWER, true);
  let inlineEvoHero = loadPref(STORAGE_KEY_INLINE_EH, false);
  let splitBSMode = loadPref(STORAGE_KEY_SPLIT_BS, false);
  let collapsedGroups = new Set(loadPref(STORAGE_KEY_COLLAPSED, []));
  let searchQuery = '';

  function injectStyles() {
    if (document.getElementById('ra-enhanced-styles')) return;
    const style = document.createElement('style');
    style.id = 'ra-enhanced-styles';
    style.textContent = `
      .crcard {
        background-color: rgba(100, 149, 237, 0) !important;
        border-radius: 4px !important;
        padding: 2px !important;
        width: ${CARD_WIDTH}px !important;
        height: ${CARD_HEIGHT}px !important;
        display: inline-block !important;
        margin: 2px !important;
        transition: opacity 0.15s;
      }
      .crcard.ra-hidden { display: none !important; }
      .crcardimage, .crcardimage_lazy {
        width: ${CARD_WIDTH}px !important;
        height: ${CARD_HEIGHT}px !important;
        object-fit: contain !important;
      }
      .filtered_card {
        background-color: rgba(50, 205, 50, 0.3) !important;
        border: 2px solid rgba(50, 205, 50, 0.7) !important;
        border-radius: 4px !important;
        width: ${CARD_WIDTH}px !important;
        height: ${CARD_HEIGHT}px !important;
      }
      .rarity-group { margin-bottom: 10px; }
      .rarity-group.ra-empty { display: none; }
      .rarity-header {
        padding: 8px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 15px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        margin-bottom: 4px;
      }
      .rarity-cards {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        padding: 4px;
        overflow: hidden;
      }
      .rarity-cards.collapsed { display: none; }
      #ra-controls {
        padding: 8px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 6px;
      }
      .ra-controls-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      #ra-controls label {
        font-size: 14px;
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 5px;
        color: #333;
      }
      #ra-search {
        flex: 1;
        min-width: 160px;
        max-width: 350px;
        padding: 6px 10px;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #fff;
        color: #333;
        font-size: 16px;
        outline: none;
      }
      #ra-search:focus { border-color: #42a5f5; }
      #ra-search::placeholder { color: #999; }
      .ra-btn {
        padding: 4px 10px;
        border: 1px solid #ccc;
        border-radius: 6px;
        background: #fff;
        color: #333;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
      }
      .ra-btn:active { background: #eee; }
      .ra-btn:disabled { opacity: 0.5; cursor: default; }
      .ra-db-status {
        font-size: 11px;
        color: #888;
        margin-left: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  function classifyCard(card) {
    const key = card.dataset.key || '';
    const rarity = card.dataset.rarity || 'Unknown';
    const evo = card.dataset.evolution || '';

    if (rarity === 'Champion') return 'Champions';

    const isHero = evo === '2' || key.endsWith('-hero');
    const isEvo = !isHero && (evo === '1' || key.includes('-ev'));

    if (!inlineEvoHero) {
      if (isHero) return 'Heroes';
      if (isEvo) return 'Evolutions';
    }

    const type = getCardType(key);
    if (splitTowerMode) {
      if (type === 'Tower') return 'Tower Troops';
      if (!type && TOWER_TROOP_FALLBACK.includes(key.replace(/-ev\d+$/, '').replace(/-hero$/, ''))) return 'Tower Troops';
    }
    if (splitBSMode) {
      if (type === 'Building') return 'Buildings';
      if (type === 'Spell') return 'Spells';
    }
    return rarity;
  }

  function fuzzyMatch(query, title) {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = title.toLowerCase();
    return q.split(/\s+/).every(word => t.includes(word));
  }

  function applySearch() {
    let anyVisible = {};
    for (const card of allCards) {
      const title = card.dataset.title || '';
      const visible = fuzzyMatch(searchQuery, title);
      card.classList.toggle('ra-hidden', !visible);
      const group = card.closest('.rarity-group');
      if (group) {
        const gid = group.dataset.groupName;
        if (visible) anyVisible[gid] = true;
      }
    }
    document.querySelectorAll('.rarity-group').forEach(g => {
      g.classList.toggle('ra-empty', !anyVisible[g.dataset.groupName]);
    });
    document.querySelectorAll('.rarity-group').forEach(g => {
      const cards = g.querySelectorAll('.crcard:not(.ra-hidden)');
      const label = g.querySelector('.rarity-header span');
      const name = g.dataset.groupName;
      if (label) {
        const arrow = label.textContent.startsWith('▶') ? '▶' : '▼';
        label.textContent = `${arrow} ${name} (${cards.length})`;
      }
    });
  }

  function buildControls(content) {
    let controls = document.getElementById('ra-controls');
    if (controls) controls.remove();

    controls = document.createElement('div');
    controls.id = 'ra-controls';

    // ── Row 1: checkboxes + refresh button ──
    const row1 = document.createElement('div');
    row1.className = 'ra-controls-row';

    const cbTower = document.createElement('input');
    cbTower.type = 'checkbox';
    cbTower.id = 'ra-split-tower-toggle';
    cbTower.checked = splitTowerMode;
    const cbTowerLabel = document.createElement('label');
    cbTowerLabel.htmlFor = 'ra-split-tower-toggle';
    cbTowerLabel.appendChild(cbTower);
    cbTowerLabel.appendChild(document.createTextNode(' Split Tower Troops'));
    cbTower.addEventListener('change', () => {
      splitTowerMode = cbTower.checked;
      savePref(STORAGE_KEY_SPLIT_TOWER, splitTowerMode);
      collapsedGroups.clear();
      savePref(STORAGE_KEY_COLLAPSED, []);
      regroup(content);
    });

    const cbInline = document.createElement('input');
    cbInline.type = 'checkbox';
    cbInline.id = 'ra-inline-eh-toggle';
    cbInline.checked = inlineEvoHero;
    const cbInlineLabel = document.createElement('label');
    cbInlineLabel.htmlFor = 'ra-inline-eh-toggle';
    cbInlineLabel.appendChild(cbInline);
    cbInlineLabel.appendChild(document.createTextNode(' Evos & Heroes inline'));
    cbInline.addEventListener('change', () => {
      inlineEvoHero = cbInline.checked;
      savePref(STORAGE_KEY_INLINE_EH, inlineEvoHero);
      collapsedGroups.clear();
      savePref(STORAGE_KEY_COLLAPSED, []);
      regroup(content);
    });

    const cbBS = document.createElement('input');
    cbBS.type = 'checkbox';
    cbBS.id = 'ra-split-bs-toggle';
    cbBS.checked = splitBSMode;
    const cbBSLabel = document.createElement('label');
    cbBSLabel.htmlFor = 'ra-split-bs-toggle';
    cbBSLabel.appendChild(cbBS);
    cbBSLabel.appendChild(document.createTextNode(' Split Buildings & Spells'));
    cbBS.addEventListener('change', () => {
      splitBSMode = cbBS.checked;
      savePref(STORAGE_KEY_SPLIT_BS, splitBSMode);
      collapsedGroups.clear();
      savePref(STORAGE_KEY_COLLAPSED, []);
      regroup(content);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'ra-btn';
    refreshBtn.textContent = '🔄 Refresh Cards DB';
    const dbStatus = document.createElement('span');
    dbStatus.className = 'ra-db-status';
    const dbCount = Object.keys(cardDB).length;
    dbStatus.textContent = dbCount > 0
      ? `(${dbCount} cards, ${cardDBTimestamp ? new Date(cardDBTimestamp).toLocaleDateString() : '?'})`
      : '(empty — click to load)';

    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Fetching...';
      const result = await fetchCardDB();
      if (result.ok) {
        refreshBtn.textContent = '🔄 Refresh Cards DB';
        dbStatus.textContent = `(${result.count} cards, ${new Date().toLocaleDateString()})`;
        collapsedGroups.clear();
        savePref(STORAGE_KEY_COLLAPSED, []);
        regroup(content);
      } else {
        refreshBtn.textContent = '❌ Failed — Retry';
        dbStatus.textContent = `(${result.error})`;
      }
      refreshBtn.disabled = false;
    });

    row1.appendChild(cbTowerLabel);
    row1.appendChild(cbInlineLabel);
    row1.appendChild(cbBSLabel);
    row1.appendChild(refreshBtn);
    row1.appendChild(dbStatus);

    // ── Row 2: search + collapse all ──
    const row2 = document.createElement('div');
    row2.className = 'ra-controls-row';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'ra-search';
    searchInput.placeholder = 'Search cards...';
    searchInput.value = searchQuery;
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      applySearch();
    });
    // Prevent iOS Safari auto-zoom on focus
    searchInput.addEventListener('focus', () => {
      const vp = document.querySelector('meta[name="viewport"]');
      if (vp) {
        vp._origContent = vp.content;
        vp.content = vp.content.replace(/maximum-scale=[^,]*/g, '') + ',maximum-scale=1';
      }
    });
    searchInput.addEventListener('blur', () => {
      const vp = document.querySelector('meta[name="viewport"]');
      if (vp && vp._origContent) vp.content = vp._origContent;
    });

    const toggleAllBtn = document.createElement('button');
    toggleAllBtn.id = 'ra-toggle-all';
    toggleAllBtn.className = 'ra-btn';
    toggleAllBtn.textContent = '▶ Collapse All';
    toggleAllBtn.addEventListener('click', () => {
      const groups = document.querySelectorAll('.rarity-cards');
      const allCollapsed = [...groups].every(g => g.classList.contains('collapsed'));
      groups.forEach(g => {
        const name = g.closest('.rarity-group')?.dataset.groupName;
        if (allCollapsed) {
          g.classList.remove('collapsed');
          if (name) collapsedGroups.delete(name);
        } else {
          g.classList.add('collapsed');
          if (name) collapsedGroups.add(name);
        }
      });
      savePref(STORAGE_KEY_COLLAPSED, [...collapsedGroups]);
      toggleAllBtn.textContent = allCollapsed ? '▶ Collapse All' : '▼ Expand All';
      document.querySelectorAll('.rarity-group').forEach(g => {
        const label = g.querySelector('.rarity-header span');
        const cards = g.querySelectorAll('.crcard:not(.ra-hidden)');
        const collapsed = g.querySelector('.rarity-cards')?.classList.contains('collapsed');
        if (label) label.textContent = `${collapsed ? '▶' : '▼'} ${g.dataset.groupName} (${cards.length})`;
      });
    });

    row2.appendChild(searchInput);
    row2.appendChild(toggleAllBtn);

    controls.appendChild(row1);
    controls.appendChild(row2);

    // Place controls inside content so they hide with the accordion
    content.insertBefore(controls, content.firstChild);
  }

  function forceLoadImages(container) {
    for (const img of container.querySelectorAll('img')) {
      if (img.dataset.src) img.dataset.src = upgradeCardImageUrl(img.dataset.src);
      if (img.src) img.src = upgradeCardImageUrl(img.src);
      img.loading = 'eager';
      if (img.dataset.src && !img.src) img.src = img.dataset.src;
      if (img.src && (!img.complete || img.naturalWidth === 0)) {
        const src = img.src;
        img.src = '';
        img.src = src;
      }
    }
  }

  function upgradeCardImageUrl(url) {
    return url.replace(
      /\/cdn-cgi\/image\/[^/]+(\/static\/img\/cards\/[^/]+\/[^/]+\.png)/,
      '/cdn-cgi/image/q=75,w=150,h=180,format=auto$1'
    );
  }

  function regroup(content) {
    if (allCards.length === 0) {
      allCards = [...content.querySelectorAll('.crcard')];
    }
    for (const card of allCards) card.remove();
    content.querySelectorAll('.rarity-group').forEach(g => g.remove());

    content.style.padding = '8px';

    const grouped = {};

    // Compute group order dynamically
    const order = [];
    if (splitTowerMode) order.push('Tower Troops');
    if (splitBSMode) { order.push('Buildings'); order.push('Spells'); }
    order.push('Common', 'Rare', 'Epic', 'Legendary', 'Champions');
    if (!inlineEvoHero) { order.push('Evolutions'); order.push('Heroes'); }

    for (const card of allCards) {
      const bucket = classifyCard(card);
      if (!grouped[bucket]) grouped[bucket] = [];
      grouped[bucket].push(card);
    }

    // When inline mode is on, sort cards within each group so evo/hero
    // variants appear immediately after their base card
    if (inlineEvoHero) {
      for (const bucket of Object.keys(grouped)) {
        const cards = grouped[bucket];
        const baseMap = new Map();
        const baseOrder = [];
        for (const card of cards) {
          const key = card.dataset.key || '';
          const baseKey = key.replace(/-ev\d+$/, '').replace(/-hero$/, '');
          if (!baseMap.has(baseKey)) {
            baseMap.set(baseKey, []);
            baseOrder.push(baseKey);
          }
          baseMap.get(baseKey).push(card);
        }
        const sorted = [];
        for (const baseKey of baseOrder) {
          const group = baseMap.get(baseKey);
          group.sort((a, b) => {
            const aKey = a.dataset.key || '';
            const bKey = b.dataset.key || '';
            const aOrd = aKey === baseKey ? 0 : (aKey.includes('-ev') ? 1 : 2);
            const bOrd = bKey === baseKey ? 0 : (bKey.includes('-ev') ? 1 : 2);
            return aOrd - bOrd;
          });
          sorted.push(...group);
        }
        grouped[bucket] = sorted;
      }
    }

    const submitBtn = content.querySelector('#cardSelectorSubmitButton');
    const segment = submitBtn ? submitBtn.previousElementSibling : null;
    const insertBefore = segment || submitBtn || null;

    function appendGroup(name, cards) {
      if (!cards || cards.length === 0) return;
      const colors = GROUP_COLORS[name] || { bg: '#666', text: '#fff' };
      const group = document.createElement('div');
      group.className = 'rarity-group';
      group.dataset.groupName = name;

      const header = document.createElement('div');
      header.className = 'rarity-header';
      header.style.backgroundColor = colors.bg;
      header.style.color = colors.text;

      const label = document.createElement('span');
      const isCollapsed = collapsedGroups.has(name);
      label.textContent = `${isCollapsed ? '▶' : '▼'} ${name} (${cards.length})`;
      header.appendChild(label);

      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'rarity-cards';
      if (isCollapsed) cardsContainer.classList.add('collapsed');

      header.addEventListener('click', () => {
        const collapsed = cardsContainer.classList.toggle('collapsed');
        if (collapsed) collapsedGroups.add(name); else collapsedGroups.delete(name);
        savePref(STORAGE_KEY_COLLAPSED, [...collapsedGroups]);
        const visCount = cardsContainer.querySelectorAll('.crcard:not(.ra-hidden)').length;
        label.textContent = `${collapsed ? '▶' : '▼'} ${name} (${visCount})`;
      });

      for (const card of cards) cardsContainer.appendChild(card);
      group.appendChild(header);
      group.appendChild(cardsContainer);

      if (insertBefore) {
        content.insertBefore(group, insertBefore);
      } else {
        content.appendChild(group);
      }
    }

    for (const name of order) appendGroup(name, grouped[name]);
    for (const [name, cards] of Object.entries(grouped)) {
      if (!order.includes(name)) appendGroup(name, cards);
    }

    forceLoadImages(content);
    applySearch();
  }

  async function enhance() {
    const content = document.querySelector('#cardSelectorContent');
    if (!content) return false;
    if (content.dataset.enhanced === 'true' || content.dataset.enhanced === 'pending') return true;
    if (getComputedStyle(content).display === 'none') return false;

    const cards = content.querySelectorAll('.crcard');
    if (cards.length === 0) return false;

    // Claim the node before the async fetch to prevent concurrent enhance() calls.
    content.dataset.enhanced = 'pending';

    // Auto-fetch card DB if empty or older than 7 days
    const dbAge = cardDBTimestamp ? (Date.now() - new Date(cardDBTimestamp).getTime()) : Infinity;
    if (Object.keys(cardDB).length === 0 || dbAge > 7 * 24 * 60 * 60 * 1000 || !isFinite(dbAge)) {
      await fetchCardDB();
    }

    content.dataset.enhanced = 'true';
    allCards = [...cards];
    buildControls(content);
    regroup(content);
    return true;
  }

  function init() {
    injectStyles();

    const observer = new MutationObserver(() => {
      const content = document.querySelector('#cardSelectorContent');
      if (!content) return;
      const visible = getComputedStyle(content).display !== 'none';
      if (!visible && content.dataset.enhanced === 'true') {
        // Content hidden — reset so the next open re-captures fresh cards.
        content.dataset.enhanced = '';
        allCards = [];
      } else if (visible && content.dataset.enhanced !== 'true' && content.dataset.enhanced !== 'pending') {
        enhance();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    enhance();
    let attempts = 0;
    const interval = setInterval(() => {
      const content = document.querySelector('#cardSelectorContent');
      if ((content && (content.dataset.enhanced === 'true' || content.dataset.enhanced === 'pending')) || attempts++ > 20) clearInterval(interval);
      else enhance();
    }, 500);
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);
})();
