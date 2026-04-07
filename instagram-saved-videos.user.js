// ==UserScript==
// @name         Instagram Saved Collection Video Viewer
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.0
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
      .isv-card {
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
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

  function createVideoCard(post) {
    const card = document.createElement('div');
    card.className = 'isv-card';

    let currentIndex = 0;
    const isCarousel = post.videos.length > 1;

    const wrap = document.createElement('div');
    wrap.className = 'isv-video-wrap';

    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.src = post.videos[0].url;
    wrap.appendChild(video);

    let indicator;

    function showSlide(index) {
      currentIndex = index;
      video.pause();
      video.src = post.videos[index].url;
      video.load();
      if (indicator) indicator.textContent = `${index + 1} / ${post.videos.length}`;
      if (btnLeft) btnLeft.style.display = index === 0 ? 'none' : '';
      if (btnRight) btnRight.style.display = index === post.videos.length - 1 ? 'none' : '';
    }

    let btnLeft, btnRight;
    if (isCarousel) {
      btnLeft = document.createElement('button');
      btnLeft.className = 'isv-nav left';
      btnLeft.textContent = '‹';
      btnLeft.style.display = 'none';
      btnLeft.onclick = () => showSlide(currentIndex - 1);

      btnRight = document.createElement('button');
      btnRight.className = 'isv-nav right';
      btnRight.textContent = '›';
      btnRight.onclick = () => showSlide(currentIndex + 1);

      wrap.appendChild(btnLeft);
      wrap.appendChild(btnRight);
    }

    card.appendChild(wrap);

    if (isCarousel) {
      indicator = document.createElement('div');
      indicator.className = 'isv-indicator';
      indicator.textContent = `1 / ${post.videos.length}`;
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
    const closeBtn = document.createElement('button');
    closeBtn.className = 'isv-close';
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'isv-grid';
    overlay.appendChild(grid);

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
      if (e.key === 'Escape') cleanup();
    };
    document.addEventListener('keydown', onKey);
    closeBtn.onclick = cleanup;

    let nextMaxId = '';
    let moreAvailable = true;
    let totalLoaded = 0;

    async function loadPage() {
      status.textContent = 'Fetching…';
      const loadMoreBtn = overlay.querySelector('.isv-load-more');
      if (loadMoreBtn) loadMoreBtn.disabled = true;

      try {
        const data = await fetchCollectionPage(collectionId, nextMaxId);
        const posts = extractVideoPosts(data.items || []);
        totalLoaded += (data.items || []).length;

        for (const post of posts) {
          grid.appendChild(createVideoCard(post));
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
          status.textContent = `${totalLoaded} posts loaded (${grid.children.length} with video). More available.`;
        } else {
          status.textContent = `Done — ${totalLoaded} posts loaded, ${grid.children.length} with video.`;
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
