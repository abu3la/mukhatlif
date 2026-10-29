/*
 * Computed-style snapshot for refactors that must not change what renders.
 *
 * It loads each page in a hidden same-origin iframe at desktop and phone
 * width, in both appearances, records the computed style of every element,
 * and stores it in IndexedDB. After your change, `compare` reloads the same
 * pages and lists every property that moved.
 *
 * Use: run the site locally, open any page of it, paste this file into the
 * browser console, then:
 *
 *   await mkSnapshot.base();     // before the change
 *   // …make the change, let the dev server reload…
 *   await mkSnapshot.compare();  // after; [] means nothing rendered differently
 *
 * Pass your own page list to either call: mkSnapshot.base(['/', '/episodes']).
 * Differences in `height`, `margin-top` and added/removed elements outside
 * <main> usually come from images loading or streamed metadata; rerun before
 * treating them as real. Colour, type, spacing and radius differences are real.
 */
(() => {
  const PAGES = [
    '/',
    '/shows',
    '/episodes',
    '/articles',
    '/guests',
    '/search?q=مهنة',
    '/about',
    '/services',
    '/prodservice',
    '/sponsor',
    '/login',
    '/signup',
    '/no-such-page',
  ];
  const WIDTHS = [1440, 390];
  const THEMES = ['first', 'third'];
  const PROPS = [
    'color',
    'background-color',
    'background-image',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-top-width',
    'border-bottom-width',
    'border-top-style',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-bottom',
    'margin-inline-start',
    'margin-inline-end',
    'row-gap',
    'column-gap',
    'box-shadow',
    'outline-color',
    'outline-style',
    'outline-width',
    'opacity',
    'text-decoration-color',
    'accent-color',
    'fill',
    'stroke',
    'width',
    'height',
    'display',
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const path = (el) => {
    const parts = [];
    while (el && el.tagName !== 'BODY') {
      const parent = el.parentElement;
      parts.unshift(
        `${el.tagName.toLowerCase()}:${parent ? [...parent.children].indexOf(el) : 0}${el.classList[0] ? '.' + el.classList[0] : ''}`,
      );
      el = parent;
    }
    return parts.join('>');
  };

  const collect = (doc, win) => {
    const out = {};
    for (const el of doc.querySelectorAll('body, body *')) {
      if (el.closest('script,style,noscript,iframe')) continue;
      const cs = win.getComputedStyle(el);
      let row = PROPS.map((p) =>
        p === 'background-image'
          ? cs.getPropertyValue(p).replace(/[\d.]+%/g, '%')
          : cs.getPropertyValue(p),
      ).join('|');
      for (const pseudo of ['::before', '::after']) {
        const s = win.getComputedStyle(el, pseudo);
        if (s.content && s.content !== 'none' && s.content !== 'normal')
          row += `#${pseudo}:${s.color}|${s.backgroundColor}|${s.width}|${s.height}`;
      }
      out[path(el)] = row;
    }
    return out;
  };

  const db = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('mk-style-snapshot', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('s');
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
  const put = async (key, value) => {
    const d = await db();
    await new Promise((resolve) => {
      const t = d.transaction('s', 'readwrite');
      t.objectStore('s').put(value, key);
      t.oncomplete = resolve;
    });
  };
  const get = async (key) => {
    const d = await db();
    return new Promise((resolve) => {
      const r = d.transaction('s').objectStore('s').get(key);
      r.onsuccess = () => resolve(r.result);
    });
  };

  const open = async (url, width) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;top:0;left:0;border:0;visibility:hidden;width:${width}px;height:${width > 800 ? 900 : 844}px`;
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = url;
    });
    for (let i = 0; i < 80; i++) {
      const main = frame.contentDocument.querySelector('main');
      if (main && main.innerText.length > 40 && !/التحميل…/.test(main.innerText)) break;
      await sleep(250);
    }
    const style = frame.contentDocument.createElement('style');
    style.textContent =
      '*,*::before,*::after{transition:none!important;animation-duration:0s!important}';
    frame.contentDocument.head.appendChild(style);
    await sleep(1500);
    try {
      await frame.contentDocument.fonts.ready;
    } catch {}
    return frame;
  };

  const run = async (mode, pages = PAGES) => {
    const report = [];
    for (const url of pages) {
      for (const width of WIDTHS) {
        const frame = await open(url, width);
        for (const theme of THEMES) {
          frame.contentDocument.documentElement.dataset.concept = theme;
          await sleep(120);
          const key = `${url}|${width}|${theme}`;
          const now = collect(frame.contentDocument, frame.contentWindow);
          if (mode === 'base') {
            await put(key, now);
            continue;
          }
          const before = await get(key);
          if (!before) {
            report.push({ key, problem: 'no baseline' });
            continue;
          }
          const properties = {};
          let added = 0;
          let removed = 0;
          for (const k of new Set([...Object.keys(before), ...Object.keys(now)])) {
            if (before[k] === now[k]) continue;
            if (!before[k]) {
              added++;
              continue;
            }
            if (!now[k]) {
              removed++;
              continue;
            }
            const a = before[k].split('#')[0].split('|');
            const b = now[k].split('#')[0].split('|');
            a.forEach((v, i) => {
              if (v !== b[i]) properties[PROPS[i]] = (properties[PROPS[i]] || 0) + 1;
            });
            if (before[k].split('#').slice(1).join() !== now[k].split('#').slice(1).join())
              properties.pseudo = (properties.pseudo || 0) + 1;
          }
          if (added || removed || Object.keys(properties).length)
            report.push({ key, properties, added, removed });
        }
        frame.remove();
      }
    }
    return mode === 'base' ? `baseline recorded for ${pages.length} pages` : report;
  };

  window.mkSnapshot = {
    base: (pages) => run('base', pages),
    compare: (pages) => run('compare', pages),
  };
  return 'mkSnapshot ready: await mkSnapshot.base(), change, then await mkSnapshot.compare()';
})();
