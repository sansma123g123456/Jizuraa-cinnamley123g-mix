import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractScripts(htmlContent) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const list = [];
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    list.push(match[1]);
  }
  return list;
}

function createMockCtx() {
  const target = {
    canvas: { width: 1920, height: 1080 },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    clip: () => {},
    measureText: (t) => ({
      width: (t || '').length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2
    }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createImageData: (w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x = 0, y = 0, w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {}
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => {};
    },
    set(t, prop, val) {
      t[prop] = val;
      return true;
    }
  });
}

function createMockElement(tag = 'div') {
  const attrs = {};
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, f) {
        if (f !== undefined) { f ? this._classes.add(c) : this._classes.delete(c); }
        else { this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c); }
      },
      contains(c) { return this._classes.has(c); }
    },
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    append(...nodes) { this.children.push(...nodes); },
    removeChild(c) {
      const idx = this.children.indexOf(c);
      if (idx >= 0) this.children.splice(idx, 1);
      return c;
    },
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
      if (typeof el['on' + evt.type] === 'function') {
        el['on' + evt.type](evt);
      }
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] || null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    focus: () => {},
    select: () => {},
    getContext: () => createMockCtx(),
    closest: () => createMockElement('label'),
    insertAdjacentElement: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    querySelector: (selector) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.children.find(c => c.classList && c.classList.contains(cls)) || createMockElement('div');
      }
      return createMockElement('div');
    },
    querySelectorAll: (selector) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.children.filter(c => c.classList && c.classList.contains(cls));
      }
      return [];
    }
  };
  el.parentElement = el;
  return el;
}

function createTestContext(options = {}) {
  const elements = new Map();
  function getElement(id, defaultTag = 'div') {
    if (!elements.has(id)) {
      const tag = id.toLowerCase().includes('query') || id.toLowerCase().includes('song') ? 'input' :
                  id.toLowerCase().includes('btn') ? 'button' : defaultTag;
      const el = createMockElement(tag);
      el.id = id;
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const toasts = [];
  const storageData = {};
  const activeTimers = new Map();
  let timerIdCounter = 1;

  const mockStorage = {
    _throwOnSet: false,
    _throwOnGet: false,
    getItem(k) {
      if (this._throwOnGet) throw new Error('SecurityError: Access denied');
      return storageData[k] !== undefined ? storageData[k] : null;
    },
    setItem(k, v) {
      if (this._throwOnSet) throw new Error('QuotaExceededError: LocalStorage limit reached');
      storageData[k] = String(v);
    },
    removeItem(k) {
      delete storageData[k];
    },
    clear() {
      for (const k of Object.keys(storageData)) delete storageData[k];
    }
  };

  const scheduledCalls = [];
  const listeners = {};

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    dispatchEvent: (evt) => {
      const fns = listeners[evt.type || evt] || [];
      fns.forEach(fn => fn(evt));
    },
    setTimeout: (fn, delay = 0, ...args) => {
      const id = timerIdCounter++;
      scheduledCalls.push({ id, fn, delay, args, type: 'timeout' });
      const timerObj = setTimeout(() => {
        activeTimers.delete(id);
        fn(...args);
      }, delay);
      activeTimers.set(id, timerObj);
      return id;
    },
    clearTimeout: (id) => {
      const timerObj = activeTimers.get(id);
      if (timerObj) clearTimeout(timerObj);
      activeTimers.delete(id);
    },
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    localStorage: mockStorage,
    escapeHtml: (s) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
    toast: (msg) => { toasts.push(String(msg)); },
    document: {
      readyState: 'complete',
      head: createMockElement('head'),
      body: createMockElement('body'),
      documentElement: createMockElement('html'),
      getElementById: (id) => getElement(id),
      querySelector: (s) => createMockElement('div'),
      querySelectorAll: (s) => [],
      createElement: (tag) => {
        const el = createMockElement(tag);
        if (tag.toLowerCase() === 'canvas') el.getContext = () => createMockCtx();
        return el;
      },
      createDocumentFragment: () => createMockElement('fragment'),
      createTextNode: (t) => ({ nodeValue: t }),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    window: null,
    globalThis: null,
    navigator: { userAgent: 'node', serviceWorker: {} },
    location: { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost' },
    performance: performance,
    AbortController: globalThis.AbortController,
    DOMException: globalThis.DOMException,
    fetch: options.fetch || globalThis.fetch,
    Float32Array: Float32Array,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Int32Array: Int32Array,
    Image: class { constructor() { this.width = 100; this.height = 100; } },
    S: {
      project: {
        title: '',
        artist: '',
        instrumental: { enabled: false }
      }
    },
    syncUI: () => {},
    replan: () => {},
    commit: () => {},
    loadLrc: (lrc) => { env._lastLoadedLrc = lrc; },
    ...options.envOverrides
  };

  env.window = env;
  env.globalThis = env;
  env.document.defaultView = env;

  const scripts = extractScripts(html);
  const s5Code = scripts[4];
  const s11Code = scripts[10];

  // Expose internal functions for deep adversarial validation
  const modifiedS11Code = s11Code.replace(
    'window.LrcLibAPI = {',
    'window.LrcLibAPI = { init: initLrcLib, sanitizeLrcQuery, getQuerySimplificationTip, executeLrcFetch, '
  );

  const context = vm.createContext(env);

  // Run Script #5
  new vm.Script(s5Code).runInContext(context);
  // Run Script #11
  new vm.Script(modifiedS11Code).runInContext(context);

  // Wrap window.toast after scripts run to reliably capture notifications
  const nativeToast = env.window.toast;
  env.window.toast = (msg, cols) => {
    toasts.push(String(msg));
    if (typeof nativeToast === 'function') nativeToast(msg, cols);
  };
  env.toast = env.window.toast;

  // Initialize modal DOM bindings cleanly without auto-search timers
  if (env.LrcLibAPI && typeof env.LrcLibAPI.init === 'function') {
    env.LrcLibAPI.init();
  }

  return {
    env,
    toasts,
    mockStorage,
    storageData,
    getElement,
    scheduledCalls,
    activeTimers,
    api: env.LrcLibAPI,
    J: env.J
  };
}

// =========================================================================
// AREA 1: AbortController Timeout Under Network Stall (Exactly 8s)
// =========================================================================
test('Challenger M3 - Area 1: LRCLIB AbortController Timeout & Network Stall (Exactly 8s)', async (t) => {
  await t.test('1.1: executeLrcFetch configures timeout of exactly 8000ms by default', async () => {
    const { api, scheduledCalls } = createTestContext({
      fetch: async (url, opts) => ({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, trackName: 'Test' }]
      })
    });

    const mark = scheduledCalls.length;
    await api.executeLrcFetch('https://lrclib.net/api/search?q=test');
    const newCalls = scheduledCalls.slice(mark);
    const fetchTimer = newCalls.find(c => c.delay === 8000);
    assert.ok(fetchTimer, 'Default fetch timeout must schedule timer of exactly 8000ms (8s)');
    assert.equal(fetchTimer.delay, 8000);
  });

  await t.test('1.2: executeLrcFetch enforces Math.max floor of 1000ms on arbitrary inputs', async () => {
    const { api, scheduledCalls } = createTestContext({
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => []
      })
    });

    let mark = scheduledCalls.length;
    await api.executeLrcFetch('https://lrclib.net/api/search?q=zero', 0);
    assert.equal(scheduledCalls.slice(mark).find(c => c.delay === 8000)?.delay, 8000, '0ms timeout defaults to 8000ms via falsy fallback');

    mark = scheduledCalls.length;
    await api.executeLrcFetch('https://lrclib.net/api/search?q=neg', -500);
    assert.equal(scheduledCalls.slice(mark).find(c => c.delay === 1000)?.delay, 1000, 'Negative timeout clamped to 1000ms floor');

    mark = scheduledCalls.length;
    await api.executeLrcFetch('https://lrclib.net/api/search?q=short', 250);
    assert.equal(scheduledCalls.slice(mark).find(c => c.delay === 1000)?.delay, 1000, 'Sub-second timeout clamped to 1000ms floor');

    mark = scheduledCalls.length;
    await api.executeLrcFetch('https://lrclib.net/api/search?q=pass2', 4000);
    assert.equal(scheduledCalls.slice(mark).find(c => c.delay === 4000)?.delay, 4000, 'Custom 4000ms timeout honored');
  });

  await t.test('1.3: Network stall triggers AbortSignal and marks error with isTimeout: true', async () => {
    let abortFired = false;
    const { api } = createTestContext({
      fetch: (url, opts) => {
        return new Promise((resolve, reject) => {
          if (opts && opts.signal) {
            opts.signal.addEventListener('abort', () => {
              abortFired = true;
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }
    });

    let caughtErr = null;
    try {
      await api.executeLrcFetch('https://lrclib.net/api/search?q=stall', 1000);
    } catch (err) {
      caughtErr = err;
    }

    assert.ok(abortFired, 'AbortController signal should fire when timeout expires');
    assert.ok(caughtErr, 'Promise should reject with AbortError');
    assert.equal(caughtErr.isTimeout, true, 'Error must have isTimeout property set to true');
    assert.match(caughtErr.message, /8s|1s|Quá thời gian/i, 'Error message must describe timeout');
  });

  await t.test('1.4: doSearch UI resilience under complete network stall', async () => {
    const { api, toasts, getElement, env } = createTestContext({
      envOverrides: {
        // Intercept 8000ms timer to fire quickly (100ms) for fast and deterministic test execution
        setTimeout: (fn, delay = 0, ...args) => {
          const actualDelay = delay === 8000 ? 100 : delay;
          return setTimeout(fn, actualDelay, ...args);
        }
      },
      fetch: (url, opts) => {
        return new Promise((resolve, reject) => {
          if (opts && opts.signal) {
            opts.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }
    });

    const queryInput = getElement('lrcLibQuery');
    const statusText = getElement('lrcLibStatusText');
    const resultsList = getElement('lrcLibResultsList');
    const btnSubmit = getElement('btnLrcLibDoSearch');

    queryInput.value = 'Stalled Song Title';

    const searchPromise = api.search('Stalled Song');
    assert.equal(btnSubmit.disabled, true, 'Submit button must be disabled during active search');

    await searchPromise;

    assert.equal(btnSubmit.disabled, false, 'Submit button must re-enable after network stall failure');
    assert.equal(statusText.textContent, 'Hết giờ (Timeout 8s)', 'Status text must show Timeout 8s');
    assert.match(resultsList.innerHTML, /Quá thời gian kết nối tới LRCLIB/i, 'Results list must show timeout message');
    assert.match(resultsList.innerHTML, /🔄 Thử lại ngay/, 'Must render retry button');
    assert.ok(toasts.some(t => t.includes('Hết 8s')), 'Must emit toast notification indicating 8s timeout');
  });

  await t.test('1.5: Secondary pass (Artist - Title) timeout propagates without cascading freeze', async () => {
    let callCount = 0;
    const { api } = createTestContext({
      envOverrides: {
        setTimeout: (fn, delay = 0, ...args) => {
          const actualDelay = delay >= 4000 ? 50 : delay;
          return setTimeout(fn, actualDelay, ...args);
        }
      },
      fetch: async (url, opts) => {
        callCount++;
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => [] };
        }
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
    });

    await api.search('Artist - Noisy Song');
    assert.ok(callCount <= 2, `Call count (${callCount}) must not spin infinitely on stall`);
  });

  await t.test('1.6: HTTP 503 Server Busy triggers single retry after 600ms', async () => {
    let attempts = 0;
    const { api } = createTestContext({
      fetch: async () => {
        attempts++;
        if (attempts === 1) {
          return { ok: false, status: 503, statusText: 'Service Unavailable' };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 42, trackName: 'Recovered Track', syncedLyrics: '[00:01.00] Success' }]
        };
      }
    });

    await api.search('Busy Query');
    assert.equal(attempts, 2, 'Should retry once on HTTP 503 Server Busy');
  });

  await t.test('1.7: HTTP 404 cleanly produces 0 results without throwing exception', async () => {
    const { api, toasts, getElement } = createTestContext({
      fetch: async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })
    });

    await api.search('Unknown 404 Song');
    const statusText = getElement('lrcLibStatusText');
    assert.equal(statusText.textContent, '0 kết quả', '404 should result in 0 results state');
    assert.ok(toasts.some(t => t.includes('Không tìm thấy lời trên LRCLIB')), 'Toast indicates not found');
  });
});

// =========================================================================
// AREA 2: Search History localStorage Limits, Deduplication & Corruption
// =========================================================================
test('Challenger M3 - Area 2: Search History Limits, Deduplication & Corruption Resilience', async (t) => {
  await t.test('2.1: Enforces strictly max 8 items cap under flood of 25 distinct queries', () => {
    const { api } = createTestContext();
    api.clearHistory();

    for (let i = 1; i <= 25; i++) {
      api.saveHistory(`Unique Query ${i}`);
    }

    const history = api.getHistory();
    assert.equal(history.length, 8, 'History must never exceed exactly 8 items');
    assert.equal(history[0], 'Unique Query 25', 'Latest query must be at head (index 0)');
    assert.equal(history[7], 'Unique Query 18', 'Oldest preserved query must be at tail (index 7)');
  });

  await t.test('2.2: Case-insensitive deduplication moves re-searched item to front', () => {
    const { api } = createTestContext();
    api.clearHistory();

    api.saveHistory('Shape of You');
    api.saveHistory('Faded');
    api.saveHistory('shape of you');
    api.saveHistory('SHAPE OF YOU');

    const history = api.getHistory();
    assert.equal(history.length, 2, 'Duplicates differing only in case must be deduplicated');
    assert.equal(history[0], 'SHAPE OF YOU', 'Most recent casing must be at index 0');
    assert.equal(history[1], 'Faded');
  });

  await t.test('2.3: Trims surrounding whitespace and ignores queries under 2 characters', () => {
    const { api } = createTestContext();
    api.clearHistory();

    api.saveHistory('');
    api.saveHistory('   ');
    api.saveHistory('a');
    api.saveHistory(null);
    api.saveHistory(undefined);

    assert.equal(api.getHistory().length, 0, 'Queries under 2 non-whitespace characters must be rejected');

    api.saveHistory('   Despacito   ');
    const history = api.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0], 'Despacito', 'Whitespace must be stripped before storing');
  });

  await t.test('2.4: Corrupted JSON syntax in localStorage degrades gracefully to empty list', () => {
    const { api, mockStorage } = createTestContext();
    mockStorage.setItem('jizura_lrclib_history', '{bad_json:true,,,');

    const history = api.getHistory();
    assert.ok(Array.isArray(history), 'getHistory must return an array');
    assert.equal(history.length, 0, 'Malformed JSON must safely fall back to empty list');

    // Saving a new query must heal storage
    api.saveHistory('Healed Query');
    const healed = api.getHistory();
    assert.equal(healed.length, 1);
    assert.equal(healed[0], 'Healed Query');
  });

  await t.test('2.5: Non-array JSON values in localStorage fall back safely', () => {
    const { api, mockStorage } = createTestContext();

    const nonArrayPayloads = [
      '{"key": "value"}',
      '12345',
      '"just a string"',
      'true',
      'null'
    ];

    for (const payload of nonArrayPayloads) {
      mockStorage.setItem('jizura_lrclib_history', payload);
      const history = api.getHistory();
      assert.ok(Array.isArray(history), `Payload ${payload} must return an array`);
      assert.equal(history.length, 0, `Payload ${payload} must yield empty list`);
    }
  });

  await t.test('2.6: Array with non-string elements does not crash getHistory or saveHistory', () => {
    const { api, mockStorage } = createTestContext();
    mockStorage.setItem('jizura_lrclib_history', JSON.stringify([null, 42, { bad: 'obj' }, 'Valid Song']));

    assert.doesNotThrow(() => {
      const history = api.getHistory();
      assert.ok(Array.isArray(history));
    });

    assert.doesNotThrow(() => {
      api.saveHistory('New Safe Song');
    });
  });

  await t.test('2.7: LocalStorage QuotaExceededError or SecurityError fails silently', () => {
    const { api, mockStorage } = createTestContext();
    mockStorage._throwOnSet = true;

    assert.doesNotThrow(() => {
      api.saveHistory('Quota Overflow Query');
    });

    mockStorage._throwOnSet = false;
    mockStorage._throwOnGet = true;

    assert.doesNotThrow(() => {
      const h = api.getHistory();
      assert.equal(h.length, 0);
    });
  });

  await t.test('2.8: XSS injection payloads in search history are properly escaped during render', () => {
    const { api, getElement } = createTestContext();
    api.clearHistory();

    const xssPayload = '<img src=x onerror=alert("xss")>&"\'';
    api.saveHistory(xssPayload);

    const strip = getElement('lrcLibHistoryStrip');
    const list = getElement('lrcLibHistoryList');

    api.renderHistory();

    assert.equal(strip.style.display, 'flex', 'History strip must be visible');
    assert.ok(!list.innerHTML.includes('<img src=x'), 'Raw unescaped HTML tag must not exist in history DOM');
    assert.ok(list.innerHTML.includes('&lt;img'), 'Must be HTML entity escaped');
  });

  await t.test('2.9: clearHistory removes key and hides UI strip', () => {
    const { api, getElement, mockStorage } = createTestContext();
    api.saveHistory('Song To Clear');
    api.renderHistory();

    const strip = getElement('lrcLibHistoryStrip');
    assert.equal(strip.style.display, 'flex');

    api.clearHistory();
    assert.equal(mockStorage.getItem('jizura_lrclib_history'), null, 'LocalStorage key must be removed');
    assert.equal(api.getHistory().length, 0);
    assert.equal(strip.style.display, 'none', 'History strip must be hidden when empty');
  });
});

// =========================================================================
// AREA 3: Real-Time Debounced Search Edge Cases
// =========================================================================
test('Challenger M3 - Area 3: Real-Time Debounced Search Dynamics & Cancellation', async (t) => {
  await t.test('3.1: Debounces rapid keystrokes to single search invocation after 450ms', async () => {
    let searchCount = 0;
    const { getElement } = createTestContext({
      fetch: async () => {
        searchCount++;
        return { ok: true, status: 200, json: async () => [] };
      }
    });

    const queryInput = getElement('lrcLibQuery');

    const sequence = ['S', 'St', 'Sta', 'Star', 'Stars'];
    for (const val of sequence) {
      queryInput.value = val;
      queryInput.dispatchEvent({ type: 'input' });
    }

    assert.equal(searchCount, 0, 'No search should fire synchronously during rapid typing');

    await new Promise(r => setTimeout(r, 550));
    assert.equal(searchCount, 1, 'Exactly one debounced search should fire after delay');
  });

  await t.test('3.2: Fast deletion / backspace (< 2 chars) cancels pending debounce timer', async () => {
    let searchCount = 0;
    const { getElement } = createTestContext({
      fetch: async () => {
        searchCount++;
        return { ok: true, status: 200, json: async () => [] };
      }
    });

    const queryInput = getElement('lrcLibQuery');

    queryInput.value = 'Hello';
    queryInput.dispatchEvent({ type: 'input' });

    await new Promise(r => setTimeout(r, 100));
    queryInput.value = 'H';
    queryInput.dispatchEvent({ type: 'input' });

    await new Promise(r => setTimeout(r, 500));
    assert.equal(searchCount, 0, 'Search must be aborted if query is deleted below 2 characters');
  });

  await t.test('3.3: Enter key cancels debounce timer and triggers immediate search', async () => {
    let searchCount = 0;
    const { getElement } = createTestContext({
      fetch: async () => {
        searchCount++;
        return { ok: true, status: 200, json: async () => [] };
      }
    });

    const queryInput = getElement('lrcLibQuery');

    queryInput.value = 'Immediate Query';
    queryInput.dispatchEvent({ type: 'input' });

    let prevented = false;
    queryInput.dispatchEvent({
      type: 'keydown',
      key: 'Enter',
      preventDefault: () => { prevented = true; }
    });

    assert.equal(prevented, true, 'Enter key event default must be prevented');
    assert.equal(searchCount, 1, 'Enter key must trigger immediate search without waiting 450ms');

    await new Promise(r => setTimeout(r, 500));
    assert.equal(searchCount, 1, 'Debounce timer must not fire duplicate search after Enter');
  });

  await t.test('3.4: Escape key closes modal immediately', () => {
    const { getElement, api } = createTestContext();
    api.open();

    const modal = getElement('lrcLibModal');
    const queryInput = getElement('lrcLibQuery');
    assert.equal(modal.style.display, 'flex');

    queryInput.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(modal.style.display, 'none', 'Escape on query input must close modal');
  });

  await t.test('3.5: Concurrent search lock prevents duplicate queries while request is in flight', async () => {
    let activeFetches = 0;
    let maxConcurrentFetches = 0;

    const { api } = createTestContext({
      fetch: async () => {
        activeFetches++;
        maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);
        await new Promise(r => setTimeout(r, 150));
        activeFetches--;
        return { ok: true, status: 200, json: async () => [] };
      }
    });

    const p1 = api.search('Concurrent 1');
    const p2 = api.search('Concurrent 2');
    const p3 = api.search('Concurrent 3');

    await Promise.all([p1, p2, p3]);
    assert.equal(maxConcurrentFetches, 1, 'Concurrent search invocations must be guarded by isSearching lock');
  });

  await t.test('3.6: Clear input button resets query value and retains focus', () => {
    const { getElement, api } = createTestContext();
    api.open();

    const queryInput = getElement('lrcLibQuery');
    const btnClear = getElement('btnLrcLibClearInput');

    queryInput.value = 'Some Text';
    let focused = false;
    queryInput.focus = () => { focused = true; };

    btnClear.dispatchEvent({ type: 'click' });
    assert.equal(queryInput.value, '', 'Clear button must blank out input text');
    assert.equal(focused, true, 'Clear button must restore focus to input');
  });
});

// =========================================================================
// AREA 4: Vietnamese, English & Multilingual Instrumental Tags
// =========================================================================
test('Challenger M3 - Area 4: Instrumental Tag Parsing & Handling', async (t) => {
  const { J } = createTestContext();

  await t.test('4.1: Vietnamese tags without duration recognized as interlude', () => {
    const vnTags = [
      '[nhạc dạo]',
      '[nhac dao]',
      '[dạo nhạc]',
      '[dao nhac]',
      '[gián tấu]',
      '[gian tau]'
    ];

    for (const tag of vnTags) {
      const lrc = `[00:10.00] ${tag}\n[00:25.00] Lời ca`;
      const res = J.parseLyrics(lrc);
      assert.equal(res.lines[0].interlude, true, `Tag ${tag} must be marked interlude: true`);
      assert.equal(res.lines[0].secs, null, `Tag ${tag} has no duration specified`);
      assert.equal(res.lines[0].lrc, 10.0, `Timestamp 00:10.00 must be preserved`);
      assert.equal(res.lines[1].interlude, undefined, 'Following lyric line must not be interlude');
    }
  });

  await t.test('4.2: English tags without duration recognized as interlude', () => {
    const enTags = [
      '[solo]',
      '[intro]',
      '[outro]',
      '[bridge]',
      '[interlude]',
      '[instrumental]',
      '[inst]'
    ];

    for (const tag of enTags) {
      const lrc = `[00:05.00] ${tag}\n[00:30.00] Singing`;
      const res = J.parseLyrics(lrc);
      assert.equal(res.lines[0].interlude, true, `English tag ${tag} must be marked interlude: true`);
      assert.equal(res.lines[0].secs, null);
    }
  });

  await t.test('4.3: International tags (Japanese, Chinese, Korean) recognized as interlude', () => {
    const intlTags = ['[間奏]', '[间奏]', '[간주]'];
    for (const tag of intlTags) {
      const lrc = `[00:15.00] ${tag}`;
      const res = J.parseLyrics(lrc);
      assert.equal(res.lines[0].interlude, true, `International tag ${tag} must be recognized`);
    }
  });

  await t.test('4.4: Instrumental tags with duration in various syntax formats', () => {
    const durationCases = [
      { tag: '[nhạc dạo 15s]', expectedSec: 15 },
      { tag: '[dạo nhạc: 20s]', expectedSec: 20 },
      { tag: '[solo 8.5s]', expectedSec: 8.5 },
      { tag: '[gián tấu:12]', expectedSec: 12 },
      { tag: '[interlude 10sec]', expectedSec: 10 },
      { tag: '[intro 6秒]', expectedSec: 6 },
      { tag: '[간주 7초]', expectedSec: 7 },
      { tag: '[  nhac dao   14.2s  ]', expectedSec: 14.2 }
    ];

    for (const c of durationCases) {
      const lrc = `[00:00.00] ${c.tag}`;
      const res = J.parseLyrics(lrc);
      assert.equal(res.lines[0].interlude, true, `Tag ${c.tag} should be recognized`);
      assert.equal(res.lines[0].secs, c.expectedSec, `Duration for ${c.tag} should be ${c.expectedSec}s`);
    }
  });

  await t.test('4.5: Multiple timestamps attached to instrumental marker', () => {
    const lrc = '[00:10.00][01:20.00] [nhạc dạo 15s]';
    const res = J.parseLyrics(lrc);
    assert.equal(res.lines.length, 2, 'Should expand to 2 lines for dual timestamp');
    assert.equal(res.lines[0].lrc, 10.0);
    assert.equal(res.lines[0].interlude, true);
    assert.equal(res.lines[0].secs, 15);
    assert.equal(res.lines[1].lrc, 80.0);
    assert.equal(res.lines[1].interlude, true);
    assert.equal(res.lines[1].secs, 15);
  });

  await t.test('4.6: Negative controls - regular lyrics containing words are not tagged as interlude', () => {
    const normalLyrics = [
      '[00:10.00] (nhạc dạo) tiếng hát cất lên giữa trời sao',
      '[00:20.00] Cây đàn guitar solo trong đêm vắng',
      '[00:30.00] Đoạn intro bài hát này rất êm dịu',
      '[00:40.00] [solo guitar by John Mayer]'
    ];

    for (const l of normalLyrics) {
      const res = J.parseLyrics(l);
      assert.equal(res.lines[0].interlude, undefined, `Regular lyric line "${l}" must not be tagged interlude`);
    }
  });

  await t.test('4.7: LrcLibAPI.apply activates pure instrumental mode when item.instrumental is true', async () => {
    let replanned = false;
    let committed = false;
    let syncedUI = false;

    const { api: freshApi, env: freshEnv, toasts } = createTestContext({
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => [{
          id: 99,
          trackName: 'Pure Instrumental Symphony',
          artistName: 'Orchestra',
          instrumental: true,
          syncedLyrics: null,
          plainLyrics: null
        }]
      })
    });

    freshEnv.replan = () => { replanned = true; };
    freshEnv.commit = () => { committed = true; };
    freshEnv.syncUI = () => { syncedUI = true; };

    await freshApi.search('Symphony');
    freshApi.apply(0);

    assert.equal(freshEnv.S.project.instrumental.enabled, true, 'Instrumental mode must be enabled');
    assert.equal(replanned, true, 'replan() must be invoked');
    assert.equal(committed, true, 'commit() must be invoked');
    assert.equal(syncedUI, true, 'syncUI() must be invoked');
    assert.ok(toasts.some(t => t.includes('Không Lời') || t.includes('Instrumental')), 'Must toast confirmation');
  });
});

// =========================================================================
// AREA 5: Query Sanitization & Simplification Guidance on Noisy Queries
// =========================================================================
test('Challenger M3 - Area 5: Query Sanitization & Simplification Guidance', async (t) => {
  const { api } = createTestContext();

  await t.test('5.1: Strips common audio and video file extensions', () => {
    const extCases = [
      { in: 'Alan Walker - Faded.mp3', out: 'Alan Walker - Faded' },
      { in: 'Lac Troi.FLAC', out: 'Lac Troi' },
      { in: 'Song Title.wav', out: 'Song Title' },
      { in: 'Another.m4a', out: 'Another' },
      { in: 'Track.ogg', out: 'Track' },
      { in: 'Sound.aac', out: 'Sound' },
      { in: 'Music.opus', out: 'Music' },
      { in: 'Clip.webm', out: 'Clip' },
      { in: 'Video.mp4', out: 'Video' }
    ];

    for (const c of extCases) {
      const res = api.sanitizeLrcQuery(c.in);
      assert.equal(res, c.out, `Extension in "${c.in}" must be stripped`);
    }
  });

  await t.test('5.2: Strips noisy bracketed tags and keywords (Official MV, Lyrics, etc.)', () => {
    const bracketCases = [
      { in: 'See You Again (Official Music Video)', out: 'See You Again' },
      { in: 'Chung Ta Cua Hien Tai [Official MV]', out: 'Chung Ta Cua Hien Tai' },
      { in: 'Waiting For Love (Lyric Video)', out: 'Waiting For Love' },
      { in: 'Dau Mua (Vietsub + Lyrics)', out: 'Dau Mua' },
      { in: 'Faded [Remix 2024]', out: 'Faded' },
      { in: 'Hotel California (Live in Tokyo)', out: 'Hotel California' },
      { in: 'Shape of You (Audio)', out: 'Shape of You' },
      { in: 'Track Name (4K 60FPS)', out: 'Track Name' },
      { in: 'Theme Song (Full Song OST)', out: 'Theme Song' }
    ];

    for (const c of bracketCases) {
      const res = api.sanitizeLrcQuery(c.in);
      assert.equal(res, c.out, `Noisy tags in "${c.in}" must be cleaned`);
    }
  });

  await t.test('5.3: Strips quality indicators and Asian brackets', () => {
    const qualityCases = [
      { in: 'Song Title [320kbps]', out: 'Song Title' },
      { in: 'Master Audio (Lossless) [FLAC]', out: 'Master Audio' },
      { in: 'Yesterday (Remastered 2009)', out: 'Yesterday' },
      { in: 'Anime OP 【Official MV】', out: 'Anime OP' },
      { in: 'Pop Song 【Vietsub】', out: 'Pop Song' }
    ];

    for (const c of qualityCases) {
      const res = api.sanitizeLrcQuery(c.in);
      assert.equal(res, c.out, `Quality/Asian brackets in "${c.in}" must be cleaned`);
    }
  });

  await t.test('5.4: Normalizes underscores, plus signs, and hyphen spacing', () => {
    const normCases = [
      { in: 'Son_Tung_MTP___Lac_Troi', out: 'Son Tung MTP Lac Troi' },
      { in: 'Ed+Sheeran++Perfect', out: 'Ed Sheeran Perfect' },
      { in: 'Artist    -    Title', out: 'Artist - Title' },
      { in: 'Artist-Title', out: 'Artist - Title' }
    ];

    for (const c of normCases) {
      const res = api.sanitizeLrcQuery(c.in);
      assert.equal(res, c.out, `Delimiters in "${c.in}" must be normalized`);
    }
  });

  await t.test('5.5: getQuerySimplificationTip detects parentheses, brackets, and remix keywords', () => {
    const parenCases = [
      'Waiting For Love (feat. Martin Garrix)',
      'Faded [Remix]',
      'Track {Acoustic}',
      'Song 【Official MV】',
      'Artist feat. Vocalist',
      'Song ft Artist',
      'Dance Track featuring Singer',
      'Club Remix 2024',
      'Anime ost opening',
      'Song cover by Bob',
      'Official Music Video'
    ];

    for (const q of parenCases) {
      const tip = api.getQuerySimplificationTip(q);
      assert.match(tip, /bỏ phần mở rộng.*feat.*remix.*ngoặc đơn/i, `Tip for "${q}" must recommend removing extensions`);
    }
  });

  await t.test('5.6: getQuerySimplificationTip detects Artist - Title hyphens when clean', () => {
    const hyphenCases = [
      'Taylor Swift - Blank Space',
      'Adele - Easy On Me',
      'Son Tung M-TP - Con Mua Ngang Qua'
    ];

    for (const q of hyphenCases) {
      const tip = api.getQuerySimplificationTip(q);
      assert.match(tip, /chỉ tìm bằng tên bài hát.*bỏ tên nghệ sĩ/i, `Tip for "${q}" must recommend dropping artist name`);
    }
  });

  await t.test('5.7: getQuerySimplificationTip handles clean single title and null/empty inputs', () => {
    assert.match(api.getQuerySimplificationTip('Despacito'), /rút ngắn từ khóa.*kiểm tra lại chính tả/i);
    assert.match(api.getQuerySimplificationTip(''), /nhập tên bài hát ngắn gọn/i);
    assert.match(api.getQuerySimplificationTip(null), /nhập tên bài hát ngắn gọn/i);
    assert.match(api.getQuerySimplificationTip(undefined), /nhập tên bài hát ngắn gọn/i);
  });
});
