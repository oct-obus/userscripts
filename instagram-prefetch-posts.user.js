// ==UserScript==
// @name         Instagram Post Video Prefetcher
// @namespace    https://github.com/oct-obus/userscripts
// @version      0.4
// @description  Prefetches likely next Instagram post videos from grid and network hints
// @author       furyzenblade
// @match        https://www.instagram.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=instagram.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[prefetch]';
    const VERBOSE = true;
    const log = (...a) => VERBOSE && console.log(TAG, ...a);

    const APP_ID = '936619743392459';
    const WARM_BYTES = 2 * 1024 * 1024;
    const MAX_TRACKS_PER_POST = 3;
    const PREFETCH_DELAY_MS = 400;
    const MAX_QUEUE = 500;

    const shortcodeToMediaId = new Map();
    const shortcodeToVideoUrls = new Map();

    let activeContext = '';
    let queue = [];
    let queued = new Set();
    let current = null;
    let prefetchedFor = null;
    let activeWarmController = null;
    let activeWarmTarget = null;

    function getShortcode(u) {
        const m = String(u || '').match(/\/p\/([^/?#]+)/);
        return m ? m[1] : null;
    }

    function currentShortcode() { return getShortcode(location.pathname); }

    function contextKey() {
        const path = location.pathname;
        const sc = getShortcode(path);
        if (sc) {
            if (activeContext && !activeContext.startsWith('direct-post:')) return activeContext;
            return 'direct-post:' + sc;
        }
        return path.replace(/\/p\/[^/?#]+\/?$/, '/') || '/';
    }

    function safeUrlLabel(url) {
        try {
            const u = new URL(url, location.href);
            return u.origin + u.pathname.slice(0, 90) + '...';
        } catch (_) {
            return String(url).slice(0, 90) + '...';
        }
    }

    function status(reason) {
        const nexts = predictNexts(current, 3).map(p => p.sc + ':' + p.source).join(', ') || 'none';
        log('status', reason, {
            context: activeContext,
            current,
            queueSize: queue.length,
            queueSources: queueSourceSummary(),
            next: nexts,
        });
    }

    function queueSourceSummary() {
        const counts = {};
        for (const item of queue) counts[item.source] = (counts[item.source] || 0) + 1;
        return counts;
    }

    function resetQueue(newContext, reason) {
        if (activeContext === newContext) return;
        if (activeWarmController) activeWarmController.abort();
        activeWarmController = null;
        activeWarmTarget = null;
        prefetchedFor = null;
        activeContext = newContext;
        queue = [];
        queued = new Set();
        log('queue reset', { context: activeContext, reason });
    }

    function appendToQueue(shortcodes, source) {
        let added = 0;
        for (const sc of shortcodes) {
            if (!sc || queued.has(sc)) continue;
            if (queue.length >= MAX_QUEUE) break;
            queued.add(sc);
            queue.push({ sc, source });
            added++;
        }
        if (added) log('queue append', { added, source, queueSize: queue.length });
        return added;
    }

    function ensureCurrentInQueue(sc) {
        if (!sc || queued.has(sc)) return;
        queued.add(sc);
        queue.push({ sc, source: 'current' });
        log('queue append current', { current: sc, queueSize: queue.length });
    }

    function linkLooksLikeGridPost(a) {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('/p/')) return false;
        const rect = a.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) return false;
        return !!a.querySelector('img, video, canvas');
    }

    function readGridShortcodes() {
        const list = [];
        const seen = new Set();
        for (const a of document.querySelectorAll('a[href^="/p/"]')) {
            if (!linkLooksLikeGridPost(a)) continue;
            const sc = getShortcode(a.getAttribute('href'));
            if (!sc || seen.has(sc)) continue;
            seen.add(sc);
            list.push(sc);
        }
        return list;
    }

    function seedGridQueue(reason) {
        resetQueue(contextKey(), reason);
        const grid = readGridShortcodes();
        if (!grid.length) return;
        appendToQueue(grid, 'grid');
        log('grid seed', { count: grid.length, reason, first: grid[0], last: grid[grid.length - 1] });
    }

    function observeCurrent(reason) {
        const sc = currentShortcode();
        if (!sc) {
            current = null;
            resetQueue(contextKey(), reason + ':non-post');
            seedGridQueue(reason + ':non-post');
            status(reason);
            return;
        }

        resetQueue(contextKey(), reason + ':post');
        if (current && current !== sc && activeWarmController) {
            activeWarmController.abort();
            activeWarmController = null;
            activeWarmTarget = null;
            log('prefetch abort', { reason: 'current changed', from: current, to: sc });
        }
        current = sc;
        seedGridQueue(reason + ':post-grid');
        ensureCurrentInQueue(sc);
        status(reason);
        setTimeout(prefetchNext, PREFETCH_DELAY_MS);
    }

    function predictNexts(sc, count) {
        if (!sc) return [];
        const i = queue.findIndex(item => item.sc === sc);
        if (i < 0) return [];
        return queue.slice(i + 1, i + 1 + count);
    }

    function predictNext(sc) {
        const next = predictNexts(sc, 1)[0] || null;
        if (!next) log('prediction miss', { current: sc, queueSize: queue.length });
        else log('prediction hit', { current: sc, next: next.sc, source: next.source, queueSize: queue.length });
        return next;
    }

    async function getMediaId(sc, signal, requestContext) {
        if (shortcodeToMediaId.has(sc)) return shortcodeToMediaId.get(sc);
        try {
            const r = await fetch('/p/' + sc + '/', { credentials: 'include', signal });
            if (!r.ok) return null;
            const t = await r.text();
            if (signal && signal.aborted) return null;
            harvestText(t, 'permalink', requestContext);
            const m = t.match(/"media_id":"(\d+)"/);
            if (m) {
                shortcodeToMediaId.set(sc, m[1]);
                log('media id scraped', { shortcode: sc, mediaId: m[1] });
                return m[1];
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return null;
            log('media_id scrape failed', { shortcode: sc, error: String(e) });
        }
        return null;
    }

    function extractVideoUrls(item) {
        const urls = [];
        const seen = new Set();
        const pushFrom = vv => {
            const url = vv && vv[0] && vv[0].url;
            if (url && !seen.has(url)) {
                seen.add(url);
                urls.push(url);
            }
        };
        if (item.video_versions) pushFrom(item.video_versions);
        if (item.carousel_media) {
            for (const c of item.carousel_media) if (c.video_versions) pushFrom(c.video_versions);
        }
        return urls;
    }

    async function getVideoUrls(sc, signal, requestContext) {
        if (shortcodeToVideoUrls.has(sc)) return shortcodeToVideoUrls.get(sc);
        const id = await getMediaId(sc, signal, requestContext);
        if (!id) return [];
        try {
            const r = await fetch('/api/v1/media/' + id + '/info/', {
                credentials: 'include',
                headers: { 'X-IG-App-ID': APP_ID },
                signal,
            });
            if (!r.ok) return [];
            const j = await r.json();
            if (signal && signal.aborted) return [];
            harvestJson(j, 'media-info', requestContext);
            const item = j.items && j.items[0];
            if (!item) return [];
            const urls = extractVideoUrls(item);
            shortcodeToVideoUrls.set(sc, urls);
            log('video urls cached', { shortcode: sc, count: urls.length });
            return urls;
        } catch (e) {
            if (e && e.name === 'AbortError') return [];
            log('info fetch failed', { shortcode: sc, error: String(e) });
            return [];
        }
    }

    async function warmVideo(url, signal) {
        try {
            const t0 = performance.now();
            const r = await fetch(url, {
                method: 'GET',
                headers: { Range: 'bytes=0-' + (WARM_BYTES - 1) },
                credentials: 'omit',
                mode: 'cors',
                signal,
            });
            if (!r.ok || (r.status !== 200 && r.status !== 206)) {
                log('prefetch failure', { status: r.status, url: safeUrlLabel(url) });
                return { ok: false, status: r.status, bytes: 0 };
            }

            const contentType = r.headers.get('content-type') || '';
            if (contentType && !/video|octet-stream/i.test(contentType)) {
                log('prefetch failure', { status: r.status, contentType, url: safeUrlLabel(url) });
                return { ok: false, status: r.status, bytes: 0 };
            }

            const buf = await r.arrayBuffer();
            const ms = Math.round(performance.now() - t0);
            log('prefetch success', {
                status: r.status,
                bytes: buf.byteLength,
                kb: Math.round(buf.byteLength / 1024),
                ms,
                url: safeUrlLabel(url),
            });
            return { ok: true, status: r.status, bytes: buf.byteLength };
        } catch (e) {
            if (e && e.name === 'AbortError') {
                log('prefetch abort', { url: safeUrlLabel(url) });
                return { ok: false, aborted: true, bytes: 0 };
            }
            log('prefetch failure', { error: String(e), url: safeUrlLabel(url) });
            return { ok: false, bytes: 0 };
        }
    }

    async function prefetchNext() {
        const cur = currentShortcode();
        if (!cur) return;
        current = cur;
        ensureCurrentInQueue(cur);
        if (prefetchedFor === cur) return;

        const next = predictNext(cur);
        if (!next) return;
        if (activeWarmTarget === next.sc) return;

        if (activeWarmController) activeWarmController.abort();
        const controller = new AbortController();
        activeWarmController = controller;
        activeWarmTarget = next.sc;
        prefetchedFor = cur;
        const requestContext = activeContext;

        log('prefetch start', { current: cur, next: next.sc, predictionSource: next.source, queueSize: queue.length });
        const urls = await getVideoUrls(next.sc, controller.signal, requestContext);
        if (controller.signal.aborted) return;
        if (!urls.length) {
            log('prefetch failure', { next: next.sc, reason: 'no video urls', predictionSource: next.source });
            if (activeWarmTarget === next.sc) activeWarmTarget = null;
            return;
        }

        const results = await Promise.all(urls.slice(0, MAX_TRACKS_PER_POST).map(url => warmVideo(url, controller.signal)));
        const bytes = results.reduce((n, r) => n + (r && r.bytes || 0), 0);
        log('prefetch complete', { next: next.sc, predictionSource: next.source, tracks: results.length, bytes });
        if (activeWarmTarget === next.sc) activeWarmTarget = null;
    }

    function cacheItem(item, source) {
        if (!item || typeof item !== 'object') return null;
        const sc = item.code || item.shortcode || item.short_code;
        if (!sc || !/^[A-Za-z0-9_-]{5,30}$/.test(sc)) return null;

        const pk = String(item.pk || item.id || item.media_id || '').split('_')[0];
        if (/^\d+$/.test(pk)) shortcodeToMediaId.set(sc, pk);

        const urls = extractVideoUrls(item);
        if (urls.length) shortcodeToVideoUrls.set(sc, urls);

        if (urls.length || pk) log('network media discovered', { shortcode: sc, source, hasMediaId: !!pk, videoUrls: urls.length });
        return sc;
    }

    function canAppendNetwork(requestContext) {
        return requestContext && requestContext === activeContext;
    }

    function harvestJson(value, source, requestContext) {
        const found = [];
        const seenObjects = new Set();

        function walk(node) {
            if (!node || typeof node !== 'object' || seenObjects.has(node)) return;
            seenObjects.add(node);

            const sc = cacheItem(node, source);
            if (sc) found.push(sc);

            if (Array.isArray(node)) {
                for (const item of node) walk(item);
                return;
            }

            for (const key of Object.keys(node)) walk(node[key]);
        }

        walk(value);
        if (found.length && canAppendNetwork(requestContext)) appendToQueue(found, 'network');
        else if (found.length && requestContext) log('network shortcodes ignored: stale context', {
            source,
            count: found.length,
            requestContext,
            activeContext,
        });
        return found;
    }

    function harvestText(text, source, requestContext) {
        if (!text) return [];
        const found = [];
        const seen = new Set();
        const re = /"(?:code|shortcode|short_code)":"([A-Za-z0-9_-]{5,30})"/g;
        let m;
        while ((m = re.exec(text))) {
            const sc = m[1];
            if (seen.has(sc)) continue;
            seen.add(sc);
            found.push(sc);
        }
        if (found.length && canAppendNetwork(requestContext)) appendToQueue(found, 'network');
        else if (found.length && requestContext) log('network shortcodes ignored: stale context', {
            source,
            count: found.length,
            requestContext,
            activeContext,
        });
        if (found.length) log('network shortcodes discovered', { source, count: found.length });
        return found;
    }

    function hookFetch() {
        const of = window.fetch;
        window.fetch = async function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url);
            const requestContext = activeContext;
            const resp = await of.apply(this, arguments);
            try {
                if (url && /instagram\.com|\/api\/|\/graphql\//.test(String(url))) {
                    const contentType = resp.headers.get('content-type') || '';
                    if (/json/i.test(contentType) || /\/api\/v1\/media\/\d+\/info\//.test(String(url))) {
                        resp.clone().json().then(j => harvestJson(j, 'fetch', requestContext)).catch(() => { });
                    } else if (/text|html|javascript/i.test(contentType) || /\/graphql\//.test(String(url))) {
                        resp.clone().text().then(t => harvestText(t, 'fetch', requestContext)).catch(() => { });
                    }
                }
            } catch (_) { }
            return resp;
        };
        log('fetch hook installed');
    }

    function hookXhr() {
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__prefetchUrl = url;
            this.__prefetchContext = activeContext;
            return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', function () {
                try {
                    const url = String(this.__prefetchUrl || '');
                    if (!/instagram\.com|\/api\/|\/graphql\//.test(url)) return;
                    const text = this.responseType && this.responseType !== 'text' ? '' : this.responseText;
                    if (!text) return;
                    try { harvestJson(JSON.parse(text), 'xhr', this.__prefetchContext); }
                    catch (_) { harvestText(text, 'xhr', this.__prefetchContext); }
                } catch (_) { }
            });
            return send.apply(this, arguments);
        };
        log('xhr hook installed');
    }

    function hookHistory() {
        const fire = reason => setTimeout(() => observeCurrent(reason), 0);
        for (const k of ['pushState', 'replaceState']) {
            const o = history[k];
            history[k] = function () { const r = o.apply(this, arguments); fire(k); return r; };
        }
        window.addEventListener('popstate', () => fire('popstate'));
        window.addEventListener('click', () => setTimeout(() => observeCurrent('click'), 200), true);
    }

    function hoverPrefetch() {
        document.addEventListener('mouseover', e => {
            const t = e.target.closest && e.target.closest('button,a');
            if (!t) return;
            const label = t.getAttribute('aria-label') || t.textContent || '';
            if (/next/i.test(label)) {
                status('hover-next');
                prefetchNext();
            }
        }, true);
    }

    function main() {
        hookFetch();
        hookXhr();
        hookHistory();
        hoverPrefetch();
        observeCurrent('init');
        setTimeout(() => observeCurrent('init-late'), 1500);
        log('v4 active');
    }

    main();
})();
