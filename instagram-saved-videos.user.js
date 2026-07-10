// ==UserScript==
// @name         Instagram Saved Collection Video Viewer
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.1
// @description  View all videos from an Instagram saved collection in a grid overlay
// @author       Zen
// @match        https://www.instagram.com/*/saved/*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/instagram-saved-videos.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/instagram-saved-videos.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ─── API ────────────────────────────────────────────────────────────

  function getCollectionId() {
    const parts = location.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1];
  }

  async function fetchCollectionPage(collectionId, maxId = '') {
    const url = `/api/v1/feed/collection/${collectionId}/posts/?max_id=${encodeURIComponent(maxId)}`;
    const res = await fetch(url, {
      headers: {
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  function getBestVideoUrl(videoVersions) {
    if (!videoVersions || !videoVersions.length) return null;
    const sorted = [...videoVersions].sort((a, b) => {
      const resA = (a.width || 0) * (a.height || 0);
      const resB = (b.width || 0) * (b.height || 0);
      return resB - resA || (b.bandwidth || 0) - (a.bandwidth || 0);
    });
    return sorted[0].url;
  }

  function extractVideoPosts(items) {
    const posts = [];
    for (const item of items) {
      const media = item.media;
      if (!media) continue;
      if (media.media_type === 2) {
        const url = getBestVideoUrl(media.video_versions);
        if (url) {
          posts.push({
            pk: media.pk,
            code: media.code,
            videos: [{ url, width: media.original_width, height: media.original_height }],
          });
        }
      } else if (media.media_type === 8 && media.carousel_media) {
        const videos = media.carousel_media
          .filter((cm) => cm.media_type === 2 && cm.video_versions)
          .map((cm) => ({
            url: getBestVideoUrl(cm.video_versions),
            width: cm.original_width,
            height: cm.original_height,
          }))
          .filter((v) => v.url);
        if (videos.length) {
          posts.push({ pk: media.pk, code: media.code, videos });
        }
      }
    }
    return posts;
  }

  // ─── UI ─────────────────────────────────────────────────────────────

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .isv-overlay {
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(0, 0, 0, 0.95);
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e0e0e0;
      }
      .isv-header {
        position: sticky; top: 0; z-index: 2;
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 20px;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid #333;
      }
      .isv-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .isv-header-actions {
        display: flex; align-items: center; gap: 12px;
      }
      .isv-view-toggle {
        display: inline-flex; overflow: hidden;
        border: 1px solid #444; border-radius: 999px;
        background: #151515;
      }
      .isv-view-toggle button {
        padding: 6px 12px; border: 0; border-left: 1px solid #333;
        background: transparent; color: #aaa; font-size: 12px;
        cursor: pointer;
      }
      .isv-view-toggle button:first-child { border-left: 0; }
      .isv-view-toggle button.active {
        background: #e0e0e0; color: #111;
      }
      .isv-close {
        background: none; border: none; color: #e0e0e0;
        font-size: 28px; cursor: pointer; padding: 0 4px;
        line-height: 1;
      }
      .isv-close:hover { color: #fff; }
      .isv-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 12px;
        padding: 16px 20px;
      }
      .isv-list {
        padding: 0 20px;
      }
      .isv-list-spacer { pointer-events: none; }
      .isv-list-items {
        display: flex; flex-direction: column; gap: 18px;
      }
      .isv-card {
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
      }
      .isv-list-card {
        width: min(100%, 980px);
        height: var(--isv-list-card-height, calc(100vh - 78px));
        margin: 0 auto;
        display: flex; flex-direction: column; justify-content: center;
        scroll-snap-align: center;
      }
      .isv-video-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 9 / 16;
        background: #000;
        display: flex; align-items: center; justify-content: center;
      }
      .isv-video-wrap video {
        width: 100%; height: 100%;
        object-fit: contain;
      }
      .isv-list-card .isv-video-wrap {
        height: min(calc(100vh - 150px), calc(100vw - 40px) * 16 / 9);
        max-height: calc(100vh - 150px);
        aspect-ratio: auto;
      }
      .isv-nav {
        position: absolute; top: 50%; transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.15);
        border: none; color: #fff; font-size: 22px;
        width: 36px; height: 36px; border-radius: 50%;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
        transition: background 0.15s;
      }
      .isv-nav:hover { background: rgba(255, 255, 255, 0.3); }
      .isv-nav.left { left: 6px; }
      .isv-nav.right { right: 6px; }
      .isv-indicator {
        text-align: center; padding: 6px 0;
        font-size: 12px; color: #999;
      }
      .isv-link {
        display: block; padding: 8px 12px;
        font-size: 12px; color: #888;
        text-decoration: none;
        border-top: 1px solid #2a2a2a;
      }
      .isv-link:hover { color: #ddd; }
      .isv-load-more {
        display: block; width: 200px; margin: 8px auto 24px;
        padding: 10px 0; border-radius: 6px;
        background: #333; border: 1px solid #555;
        color: #e0e0e0; font-size: 14px;
        cursor: pointer; text-align: center;
        transition: background 0.15s;
      }
      .isv-load-more:hover { background: #444; }
      .isv-load-more:disabled { opacity: 0.5; cursor: default; }
      .isv-status {
        text-align: center; padding: 12px;
        font-size: 13px; color: #888;
      }
    `;
    document.head.appendChild(style);
  }

  function createVideoCard(post, options = {}) {
    const card = document.createElement('div');
    card.className = options.list ? 'isv-card isv-list-card' : 'isv-card';
    if (Number.isInteger(options.index)) card.dataset.index = String(options.index);

    let currentIndex = Math.min(post.videos.length - 1, options.slideState?.get(post.pk) || 0);
    const isCarousel = post.videos.length > 1;

    const wrap = document.createElement('div');
    wrap.className = 'isv-video-wrap';

    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.src = post.videos[currentIndex].url;
    if (options.state) {
      const saved = options.state.get(`${post.pk}:${currentIndex}`);
      if (saved) video.currentTime = saved.currentTime;
    }
    wrap.appendChild(video);

    let indicator;

    function showSlide(index) {
      saveCurrentTime();
      currentIndex = index;
      if (options.slideState) options.slideState.set(post.pk, index);
      video.pause();
      video.src = post.videos[index].url;
      video.load();
      if (options.state) {
        const saved = options.state.get(`${post.pk}:${index}`);
        if (saved) video.currentTime = saved.currentTime;
      }
      if (indicator) indicator.textContent = `${index + 1} / ${post.videos.length}`;
      if (btnLeft) btnLeft.style.display = index === 0 ? 'none' : '';
      if (btnRight) btnRight.style.display = index === post.videos.length - 1 ? 'none' : '';
      if (options.onSlideChange) options.onSlideChange(video);
    }

    function saveCurrentTime() {
      if (!options.state || !Number.isFinite(video.currentTime)) return;
      options.state.set(`${post.pk}:${currentIndex}`, { currentTime: video.currentTime });
    }

    video.addEventListener('timeupdate', saveCurrentTime);
    video.addEventListener('pause', saveCurrentTime);

    let btnLeft, btnRight;
    if (isCarousel) {
      btnLeft = document.createElement('button');
      btnLeft.className = 'isv-nav left';
      btnLeft.textContent = '‹';
      btnLeft.style.display = currentIndex === 0 ? 'none' : '';
      btnLeft.onclick = () => showSlide(currentIndex - 1);

      btnRight = document.createElement('button');
      btnRight.className = 'isv-nav right';
      btnRight.textContent = '›';
      btnRight.style.display = currentIndex === post.videos.length - 1 ? 'none' : '';
      btnRight.onclick = () => showSlide(currentIndex + 1);

      wrap.appendChild(btnLeft);
      wrap.appendChild(btnRight);
    }

    card.appendChild(wrap);

    if (isCarousel) {
      indicator = document.createElement('div');
      indicator.className = 'isv-indicator';
      indicator.textContent = `${currentIndex + 1} / ${post.videos.length}`;
      card.appendChild(indicator);
    }

    const link = document.createElement('a');
    link.className = 'isv-link';
    link.href = `https://www.instagram.com/p/${post.code}/`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `instagram.com/p/${post.code}/`;
    card.appendChild(link);

    return card;
  }

  // ─── Main ───────────────────────────────────────────────────────────

  async function launch() {
    const collectionId = getCollectionId();
    if (!collectionId || !/^\d+$/.test(collectionId)) {
      alert('Could not detect a collection ID from the URL.');
      return;
    }

    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'isv-overlay';

    const header = document.createElement('div');
    header.className = 'isv-header';
    header.innerHTML = `<h2>Saved Videos — Collection ${collectionId}</h2>`;

    const headerActions = document.createElement('div');
    headerActions.className = 'isv-header-actions';

    const viewToggle = document.createElement('div');
    viewToggle.className = 'isv-view-toggle';
    const gridBtn = document.createElement('button');
    gridBtn.type = 'button';
    gridBtn.textContent = 'Grid';
    const listBtn = document.createElement('button');
    listBtn.type = 'button';
    listBtn.textContent = 'List';
    viewToggle.appendChild(gridBtn);
    viewToggle.appendChild(listBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'isv-close';
    closeBtn.textContent = '×';
    headerActions.appendChild(viewToggle);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);
    overlay.appendChild(header);

    const content = document.createElement('div');
    overlay.appendChild(content);

    const status = document.createElement('div');
    status.className = 'isv-status';
    status.textContent = 'Loading first page…';
    overlay.appendChild(status);

    document.body.appendChild(overlay);

    function cleanup() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }

    const onKey = (e) => {
      allowAutoplayRetry();
      if (e.key === 'Escape') cleanup();
    };
    document.addEventListener('keydown', onKey);
    closeBtn.onclick = cleanup;

    const allPosts = [];
    const videoState = new Map();
    const slideState = new Map();
    let viewMode = 'grid';
    let currentIndex = 0;
    let listStart = 0;
    let listEnd = 0;
    let listItemHeight = Math.max(520, overlay.clientHeight - header.offsetHeight + 18);
    let renderFrame = 0;
    let autoplayBlocked = false;
    let autoplayVideo = null;
    let autoplaySrc = '';
    let nextMaxId = '';
    let moreAvailable = true;
    let totalLoaded = 0;

    function getVisibleRatio(el) {
      const rect = el.getBoundingClientRect();
      const top = Math.max(rect.top, header.getBoundingClientRect().bottom);
      const bottom = Math.min(rect.bottom, window.innerHeight);
      return Math.max(0, bottom - top) / Math.max(1, rect.height);
    }

    function getEstimatedListIndex() {
      if (!allPosts.length) return 0;
      const visibleCenter = overlay.scrollTop + header.offsetHeight + ((overlay.clientHeight - header.offsetHeight) / 2);
      const index = Math.floor(Math.max(0, visibleCenter - content.offsetTop) / listItemHeight);
      return Math.min(allPosts.length - 1, Math.max(0, index));
    }

    function getMostVisibleIndex() {
      const cards = [...content.querySelectorAll('.isv-card[data-index]')];
      let bestIndex = currentIndex;
      let bestRatio = -1;
      for (const card of cards) {
        const ratio = getVisibleRatio(card);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIndex = Number(card.dataset.index);
        }
      }
      if (viewMode === 'list' && bestRatio <= 0) return getEstimatedListIndex();
      return Number.isInteger(bestIndex) ? bestIndex : 0;
    }

    function updateToggle() {
      gridBtn.classList.toggle('active', viewMode === 'grid');
      listBtn.classList.toggle('active', viewMode === 'list');
    }

    function pauseMountedVideos() {
      for (const video of content.querySelectorAll('video')) video.pause();
    }

    function renderGrid(scrollToCurrent = false) {
      pauseMountedVideos();
      content.className = 'isv-grid';
      const fragment = document.createDocumentFragment();
      allPosts.forEach((post, index) => {
        fragment.appendChild(createVideoCard(post, { index, state: videoState, slideState }));
      });
      content.replaceChildren(fragment);
      if (scrollToCurrent) {
        const current = content.querySelector(`.isv-card[data-index="${currentIndex}"]`);
        if (current) current.scrollIntoView({ block: 'center' });
      }
    }

    function renderList(scrollToCurrent = false) {
      pauseMountedVideos();
      content.className = 'isv-list';
      const listGap = 18;
      const listCardHeight = Math.max(520, overlay.clientHeight - header.offsetHeight);
      listItemHeight = listCardHeight + listGap;
      content.style.setProperty('--isv-list-card-height', `${listCardHeight}px`);
      listStart = Math.max(0, currentIndex - 2);
      listEnd = Math.min(allPosts.length, currentIndex + 4);

      const topSpacer = document.createElement('div');
      topSpacer.className = 'isv-list-spacer';
      topSpacer.style.height = `${listStart * listItemHeight}px`;

      const items = document.createElement('div');
      items.className = 'isv-list-items';
      for (let i = listStart; i < listEnd; i += 1) {
        items.appendChild(createVideoCard(allPosts[i], {
          index: i,
          list: true,
          state: videoState,
          slideState,
          onSlideChange: updateListAutoplay,
        }));
      }

      const bottomSpacer = document.createElement('div');
      bottomSpacer.className = 'isv-list-spacer';
      bottomSpacer.style.height = `${Math.max(0, allPosts.length - listEnd) * listItemHeight}px`;

      content.replaceChildren(topSpacer, items, bottomSpacer);

      if (scrollToCurrent) {
        const current = content.querySelector(`.isv-card[data-index="${currentIndex}"]`);
        if (current) current.scrollIntoView({ block: 'center' });
      }
      updateListAutoplay();
    }

    function render(scrollToCurrent = false) {
      updateToggle();
      if (viewMode === 'list') renderList(scrollToCurrent);
      else renderGrid(scrollToCurrent);
    }

    function setViewMode(nextMode) {
      if (nextMode === viewMode) return;
      currentIndex = getMostVisibleIndex();
      if (viewMode === 'list' && autoplayVideo) {
        autoplayVideo.pause();
        autoplayVideo = null;
        autoplaySrc = '';
      }
      viewMode = nextMode;
      render(true);
    }

    function scheduleListRender() {
      if (viewMode !== 'list' || renderFrame) return;
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        const nextIndex = getMostVisibleIndex();
        currentIndex = nextIndex;
        if (nextIndex < listStart + 1 || nextIndex > listEnd - 3) renderList(false);
        else updateListAutoplay();
      });
    }

    function updateListAutoplay() {
      if (viewMode !== 'list' || autoplayBlocked) return;
      const card = content.querySelector(`.isv-card[data-index="${getMostVisibleIndex()}"]`);
      const video = card && card.querySelector('video');
      const videoSrc = video && (video.currentSrc || video.src);
      if (!video || (video === autoplayVideo && videoSrc === autoplaySrc)) return;
      if (autoplayVideo) autoplayVideo.pause();
      autoplayVideo = video;
      autoplaySrc = videoSrc;
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch((err) => {
          if (video === autoplayVideo && err && err.name === 'NotAllowedError') {
            autoplayBlocked = true;
            autoplayVideo = null;
            autoplaySrc = '';
          }
        });
      }
    }

    function allowAutoplayRetry() {
      autoplayBlocked = false;
    }

    gridBtn.onclick = () => setViewMode('grid');
    listBtn.onclick = () => setViewMode('list');
    overlay.addEventListener('pointerdown', allowAutoplayRetry, { passive: true });
    overlay.addEventListener('keydown', allowAutoplayRetry);
    overlay.addEventListener('scroll', scheduleListRender, { passive: true });
    window.addEventListener('resize', scheduleListRender);

    const originalCleanup = cleanup;
    cleanup = function cleanupOverlay() {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      pauseMountedVideos();
      overlay.removeEventListener('pointerdown', allowAutoplayRetry);
      overlay.removeEventListener('keydown', allowAutoplayRetry);
      overlay.removeEventListener('scroll', scheduleListRender);
      window.removeEventListener('resize', scheduleListRender);
      originalCleanup();
    };
    closeBtn.onclick = cleanup;

    async function loadPage() {
      status.textContent = 'Fetching…';
      const loadMoreBtn = overlay.querySelector('.isv-load-more');
      if (loadMoreBtn) loadMoreBtn.disabled = true;

      try {
        const data = await fetchCollectionPage(collectionId, nextMaxId);
        const posts = extractVideoPosts(data.items || []);
        const oldPostCount = allPosts.length;
        totalLoaded += (data.items || []).length;
        allPosts.push(...posts);
        if (viewMode === 'grid' && oldPostCount) {
          const fragment = document.createDocumentFragment();
          posts.forEach((post, offset) => {
            fragment.appendChild(createVideoCard(post, {
              index: oldPostCount + offset,
              state: videoState,
              slideState,
            }));
          });
          content.appendChild(fragment);
        } else {
          render(false);
        }

        nextMaxId = data.next_max_id || '';
        moreAvailable = !!data.more_available;

        if (loadMoreBtn) loadMoreBtn.remove();

        if (moreAvailable) {
          const btn = document.createElement('button');
          btn.className = 'isv-load-more';
          btn.textContent = 'Load more…';
          btn.onclick = loadPage;
          overlay.appendChild(btn);
          status.textContent = `${totalLoaded} posts loaded (${allPosts.length} with video). More available.`;
        } else {
          status.textContent = `Done — ${totalLoaded} posts loaded, ${allPosts.length} with video.`;
        }
      } catch (err) {
        status.textContent = `Error: ${err.message}`;
        if (loadMoreBtn) loadMoreBtn.disabled = false;
      }
    }

    await loadPage();
  }

  GM_registerMenuCommand('View Saved Videos', launch);
})();
