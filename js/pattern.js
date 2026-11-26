/* Motor de plantillas: imagen -> cuadrícula de cuentas, materiales, pasos y dibujo. */
(function () {
  "use strict";

  const EMPTY = 255; // posición sin cuenta

  // Medidas aproximadas en mm (diámetro x largo) y cuentas por gramo (aproximado)
  const BEADS = {
    delica: { label: "Delica 11/0 (cilíndrica)", d: 1.6, l: 1.3, perGram: 190 },
    rocalla: { label: "Rocalla 11/0 (redonda)", d: 2.0, l: 2.0, perGram: 110 },
  };

  const TECHS = {
    loom: { label: "Telar", desc: "Filas rectas, todas en el mismo sentido.", offset: null, startDefault: "bottom" },
    square: { label: "Punto cuadrado", desc: "Cuadrícula recta, filas de ida y vuelta.", offset: null, startDefault: "top" },
    brick: { label: "Brick stitch", desc: "Filas desfasadas media cuenta.", offset: "rows", startDefault: "top" },
    peyote: { label: "Peyote", desc: "Columnas desfasadas media cuenta (par).", offset: "cols", startDefault: "top" },
  };

  const SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split("");

  // Tamaño de la celda (ancho, alto) en mm según técnica y cuenta
  function cellMM(tech, bead) {
    const b = BEADS[bead];
    return tech === "brick" ? [b.l, b.d] : [b.d, b.l];
  }
  const widthForCm = (cm, tech, bead) => Math.round((cm * 10) / cellMM(tech, bead)[0]);
  const cmForWidth = (w, tech, bead) => (w * cellMM(tech, bead)[0]) / 10;

  // ---------- Color ----------
  function srgb2lin(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function rgb2lab(r, g, b) {
    const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function d2(a, b) {
    const l = a[0] - b[0], x = a[1] - b[1], y = a[2] - b[2];
    return l * l + x * x + y * y;
  }
  function textColorFor(hex) {
    const [r, g, b] = hex2rgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function nextSymbol(colors) {
    const used = new Set(colors.map((c) => c.symbol));
    return SYMBOLS.find((s) => !used.has(s)) || "?";
  }

  /**
   * Genera la plantilla maestra (sin recortar).
   * opts: {img, width, tech, bead, maxColors, dither, mirror, brightness,
   *        contrast, saturation, palette:[{id,code,name,hex}], bg:"none"|"#rrggbb"}
   */
  function generate(opts) {
    const { img, tech, bead, maxColors, dither } = opts;
    const W = Math.max(4, Math.min(150, Math.round(opts.width)));
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const [cw, ch] = cellMM(tech, bead);
    const H = Math.max(2, Math.round(W * (ih / iw) * (cw / ch)));
    if (H > 400) throw new Error("tall");

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const useEmpty = opts.bg === "none"; // fondo quitado = sin cuenta
    if (!useEmpty) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H); }
    // reducción por pasos para mejor calidad
    let src = img, sw = iw, sh = ih;
    while (sw / 2 > W * 2 && sh / 2 > H * 2) {
      const t = document.createElement("canvas");
      t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
      const tc = t.getContext("2d");
      tc.imageSmoothingQuality = "high";
      tc.drawImage(src, 0, 0, t.width, t.height);
      src = t; sw = t.width; sh = t.height;
    }
    ctx.imageSmoothingQuality = "high";
    if (opts.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    const br = (opts.brightness || 0) * 2.55;
    const ct = 1 + (opts.contrast || 0) / 100;
    const sa = 1 + (opts.saturation || 0) / 100;
    const px = new Float32Array(W * H * 3);
    const empty = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (useEmpty && data[i * 4 + 3] < 128) empty[i] = 1;
      let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sa; g = gray + (g - gray) * sa; b = gray + (b - gray) * sa;
      r = (r - 128) * ct + 128 + br; g = (g - 128) * ct + 128 + br; b = (b - 128) * ct + 128 + br;
      px[i * 3] = Math.min(255, Math.max(0, r));
      px[i * 3 + 1] = Math.min(255, Math.max(0, g));
      px[i * 3 + 2] = Math.min(255, Math.max(0, b));
    }

    const palette = opts.palette.map((p) => Object.assign({ lab: rgb2lab(...hex2rgb(p.hex)) }, p));

    // k-means en Lab sobre una muestra de píxeles
    const labs = new Array(W * H);
    for (let i = 0; i < W * H; i++) labs[i] = rgb2lab(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]);
    const rnd = mulberry32(12345);
    const idx = [];
    for (let i = 0; i < labs.length; i++) if (!empty[i]) idx.push(i);
    if (!idx.length) throw new Error("empty");
    const sample = [];
    const stride = Math.max(1, Math.floor(idx.length / 8000));
    for (let k = 0; k < idx.length; k += stride) sample.push(labs[idx[k]]);
    const K = Math.min(maxColors, palette.length, sample.length);
    const cent = [sample[Math.floor(rnd() * sample.length)].slice()];
    while (cent.length < K) {
      const dist = sample.map((s) => Math.min(...cent.map((c) => d2(s, c))));
      const sum = dist.reduce((a, b) => a + b, 0);
      if (sum === 0) break;
      let t = rnd() * sum, k = 0;
      for (; k < dist.length - 1; k++) { t -= dist[k]; if (t <= 0) break; }
      cent.push(sample[k].slice());
    }
    for (let it = 0; it < 8; it++) {
      const acc = cent.map(() => [0, 0, 0, 0]);
      for (const s of sample) {
        let bi = 0, bd = Infinity;
        for (let c = 0; c < cent.length; c++) { const d = d2(s, cent[c]); if (d < bd) { bd = d; bi = c; } }
        acc[bi][0] += s[0]; acc[bi][1] += s[1]; acc[bi][2] += s[2]; acc[bi][3]++;
      }
      acc.forEach((a, c) => { if (a[3]) cent[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }

    // Cada centroide -> color de paleta más cercano (sin repetir)
    const chosen = [];
    for (const c of cent) {
      const ranked = palette.map((p, i) => [i, d2(c, p.lab)]).sort((a, b) => a[1] - b[1]);
      const pick = ranked.find((r) => !chosen.includes(r[0])) || ranked[0];
      if (!chosen.includes(pick[0])) chosen.push(pick[0]);
    }
    const subset = chosen.map((i) => palette[i]);
    const subRGB = subset.map((p) => hex2rgb(p.hex));
    function nearest(lab) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < subset.length; i++) { const d = d2(lab, subset[i].lab); if (d < bd) { bd = d; bi = i; } }
      return bi;
    }

    const grid = new Uint8Array(W * H);
    if (dither) {
      const buf = Float32Array.from(px);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (empty[i]) { grid[i] = EMPTY; continue; }
          const r = Math.min(255, Math.max(0, buf[i * 3])), g = Math.min(255, Math.max(0, buf[i * 3 + 1])), b = Math.min(255, Math.max(0, buf[i * 3 + 2]));
          const k = nearest(rgb2lab(r, g, b));
          grid[i] = k;
          const er = (r - subRGB[k][0]) * 0.8, eg = (g - subRGB[k][1]) * 0.8, eb = (b - subRGB[k][2]) * 0.8;
          const push = (dx, dy, f) => {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny >= H) return;
            const j = (ny * W + nx) * 3;
            buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f;
          };
          push(1, 0, 7 / 16); push(-1, 1, 3 / 16); push(0, 1, 5 / 16); push(1, 1, 1 / 16);
        }
      }
    } else {
      for (let i = 0; i < W * H; i++) grid[i] = empty[i] ? EMPTY : nearest(labs[i]);
    }

    // ordenar por uso y asignar letras (quedan fijas aunque se edite)
    const counts = new Array(subset.length).fill(0);
    for (let i = 0; i < grid.length; i++) if (grid[i] !== EMPTY) counts[grid[i]]++;
    const order = counts.map((c, i) => i).filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a]);
    const remap = new Map(order.map((old, n) => [old, n]));
    for (let i = 0; i < grid.length; i++) if (grid[i] !== EMPTY) grid[i] = remap.get(grid[i]);
    const colors = order.map((old, n) => {
      const c = subset[old];
      return { id: c.id, code: c.code, name: c.name, hex: c.hex, symbol: SYMBOLS[n] };
    });
    return { W, H, grid, colors, tech, bead };
  }

  /**
   * Vista de trabajo a partir de la maestra: cuenta SOLO las cuentas presentes
   * y (si crop) recorta los márgenes vacíos.
   */
  function finalize(m, crop) {
    const off = TECHS[m.tech].offset;
    let x0 = 0, y0 = 0, x1 = m.W - 1, y1 = m.H - 1;
    if (crop) {
      let a = m.W, b = -1, c = m.H, d = -1;
      for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
        if (m.grid[y * m.W + x] !== EMPTY) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }
      }
      if (b >= 0) {
        x0 = a; x1 = b; y0 = c; y1 = d;
        // conservar la paridad del desfase para no deformar la figura
        if (off === "cols") x0 -= x0 % 2;
        if (off === "rows") y0 -= y0 % 2;
      }
    }
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    const counts = new Array(m.colors.length).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = m.grid[(y + y0) * m.W + (x + x0)];
      if (v !== EMPTY) counts[v]++;
    }
    const remap = new Array(m.colors.length).fill(EMPTY);
    const colors = [];
    m.colors.forEach((c, i) => {
      if (!counts[i]) return;
      remap[i] = colors.length;
      colors.push(Object.assign({}, c, { m: i, count: counts[i], text: textColorFor(c.hex) }));
    });
    const grid = new Uint8Array(W * H);
    let beadCount = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = m.grid[(y + y0) * m.W + (x + x0)];
      grid[y * W + x] = v === EMPTY ? EMPTY : remap[v];
      if (v !== EMPTY) beadCount++;
    }
    return { W, H, grid, colors, tech: m.tech, bead: m.bead, cellMM: cellMM(m.tech, m.bead), beadCount, emptyCount: W * H - beadCount, x0, y0 };
  }

  /** Lista de compra: solo las cuentas usadas, más margen. */
  function materials(pat, o) {
    const perGram = o.perGram > 0 ? o.perGram : BEADS[pat.bead].perGram;
    const pack = o.pack > 0 ? o.pack : 5;
    const extra = o.extra >= 0 ? o.extra : 10;
    const price = o.price > 0 ? o.price : 0;
    const rows = pat.colors.map((c) => {
      const buy = Math.ceil((c.count * (100 + extra)) / 100 - 1e-9);
      const grams = buy / perGram;
      const packs = Math.ceil(grams / pack);
      return Object.assign({}, c, { buy, grams, packs, cost: packs * price });
    });
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    return { rows, total: pat.beadCount, buy: sum("buy"), grams: sum("grams"), packs: sum("packs"), cost: sum("cost"), perGram, pack, extra, price };
  }

  // ---------- Pasos de trabajo ----------
  function runs(seq) {
    const out = [];
    for (const c of seq) {
      if (out.length && out[out.length - 1].c === c) out[out.length - 1].n++;
      else out.push({ c, n: 1 });
    }
    return out;
  }

  function buildSteps(pat, start) {
    const { W, H, grid, tech } = pat;
    const at = (x, y) => grid[y * W + x];
    let steps = [];
    const L2R = "De izquierda a derecha", R2L = "De derecha a izquierda";
    const T2B = "De arriba hacia abajo", B2T = "De abajo hacia arriba";
    const ys = [...Array(H).keys()];
    if (start === "bottom") ys.reverse();

    if (tech === "peyote") {
      const fwd = start === "bottom" ? B2T : T2B, back = start === "bottom" ? T2B : B2T;
      const aF = start === "bottom" ? "↑" : "↓", aB = start === "bottom" ? "↓" : "↑";
      const seq = [];
      for (const y of ys) { seq.push(at(0, y)); if (W > 1) seq.push(at(1, y)); }
      steps.push({
        title: W > 1 ? "Columnas 1 y 2 (inicio)" : "Columna 1", dir: fwd, arrow: aF, seq,
        cells: ys.flatMap((y) => (W > 1 ? [[0, y], [1, y]] : [[0, y]])),
        note: W > 1 ? "Van alternadas: una cuenta de la columna 1, una de la columna 2, y así hasta el final." : "",
      });
      for (let x = 2; x < W; x++) {
        const first = (x - 2) % 2 === 0;
        const yy = first ? [...ys].reverse() : ys;
        steps.push({
          title: "Columna " + (x + 1), dir: first ? back : fwd, arrow: first ? aB : aF,
          seq: yy.map((y) => at(x, y)), cells: yy.map((y) => [x, y]),
        });
      }
    } else {
      ys.forEach((y, n) => {
        const ltr = tech === "loom" ? true : n % 2 === 0;
        const xs = [...Array(W).keys()];
        if (!ltr) xs.reverse();
        steps.push({
          title: "Fila " + (n + 1), dir: ltr ? L2R : R2L, arrow: ltr ? "→" : "←",
          seq: xs.map((x) => at(x, y)), cells: xs.map((x) => [x, y]),
        });
      });
    }
    steps = steps.filter((s) => s.seq.some((c) => c !== EMPTY));
    steps.forEach((s, i) => { s.runs = runs(s.seq); s.kind = i === 0 ? "start" : "next"; });
    return steps;
  }

  // ---------- Dibujo ----------
  const MARGIN = 26;
  function layout(pat, cell, region) {
    const b = BEADS[pat.bead];
    const [mw, mh] = pat.cellMM;
    const cw = cell, ch = cell * (mh / mw);
    const off = TECHS[pat.tech].offset;
    const r = region || { x0: 0, y0: 0, w: pat.W, h: pat.H };
    const width = MARGIN * 2 + r.w * cw + (off === "rows" ? cw / 2 : 0);
    const height = MARGIN * 2 + r.h * ch + (off === "cols" ? ch / 2 : 0);
    return { cw, ch, off, r, width: Math.ceil(width), height: Math.ceil(height), round: b.d === b.l };
  }
  function beadPos(L, x, y) {
    return [
      MARGIN + (x - L.r.x0) * L.cw + (L.off === "rows" && y % 2 === 1 ? L.cw / 2 : 0),
      MARGIN + (y - L.r.y0) * L.ch + (L.off === "cols" && x % 2 === 1 ? L.ch / 2 : 0),
    ];
  }
  /** Celda bajo un punto (px, py en coordenadas CSS del dibujo completo). */
  function hit(pat, cell, px, py) {
    const L = layout(pat, cell);
    let x, y;
    if (L.off === "cols") {
      x = Math.floor((px - MARGIN) / L.cw);
      y = Math.floor((py - MARGIN - (x % 2 === 1 ? L.ch / 2 : 0)) / L.ch);
    } else {
      y = Math.floor((py - MARGIN) / L.ch);
      x = Math.floor((px - MARGIN - (L.off === "rows" && y % 2 === 1 ? L.cw / 2 : 0)) / L.cw);
    }
    return x >= 0 && y >= 0 && x < pat.W && y < pat.H ? { x, y } : null;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** view: {cell, symbols, highlight, step, start, footer, dpr, region, showEmpty} */
  function draw(canvas, pat, view) {
    const L = layout(pat, view.cell, view.region);
    const footerH = view.footer ? 22 : 0;
    // Safari/iOS limita el área del canvas (~16 M px): reducimos la resolución si hace falta
    const dpr = Math.min(view.dpr || 1, Math.sqrt(12e6 / (L.width * (L.height + footerH))));
    canvas.width = L.width * dpr;
    canvas.height = (L.height + footerH) * dpr;
    canvas.style.width = L.width + "px";
    canvas.style.height = L.height + footerH + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, L.width, L.height + footerH);

    const inStep = view.step ? new Set(view.step.cells.map((c) => c[1] * pat.W + c[0])) : null;
    const gap = Math.max(0.6, view.cell * 0.06);
    const fs = Math.max(8, Math.min(L.cw, L.ch) * 0.6);
    const radius = L.round ? Math.min(L.cw, L.ch) / 2 - gap : Math.min(L.cw, L.ch) * 0.28;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 " + fs + "px system-ui, sans-serif";
    const { x0, y0, w, h } = L.r;

    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const ci = pat.grid[y * pat.W + x];
        const [bx, by] = beadPos(L, x, y);
        if (ci === EMPTY) {
          if (view.showEmpty) { // guía tenue solo al editar
            ctx.globalAlpha = 1; ctx.strokeStyle = "#ddd3c4"; ctx.lineWidth = 1;
            rr(ctx, bx + gap + 0.5, by + gap + 0.5, L.cw - gap * 2 - 1, L.ch - gap * 2 - 1, radius); ctx.stroke();
          }
          continue;
        }
        const col = pat.colors[ci];
        let dim = false;
        if (view.highlight != null && view.highlight !== ci) dim = true;
        if (inStep && !inStep.has(y * pat.W + x)) dim = true;
        ctx.globalAlpha = dim ? 0.28 : 1;
        ctx.fillStyle = col.hex;
        rr(ctx, bx + gap, by + gap, L.cw - gap * 2, L.ch - gap * 2, radius);
        ctx.fill();
        // contorno para que los colores claros se distingan del fondo
        ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 0.7; ctx.stroke();
        if (view.symbols && view.cell >= 9) {
          ctx.fillStyle = col.text;
          ctx.fillText(col.symbol, bx + L.cw / 2, by + L.ch / 2 + 0.5);
        }
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#8a7f72";
    ctx.font = "500 10px system-ui, sans-serif";
    const every = view.cell < 14 ? 10 : 5;
    for (let x = x0; x < x0 + w; x++) {
      if ((x + 1) % every === 0 || x === x0) ctx.fillText(String(x + 1), MARGIN + (x - x0) * L.cw + L.cw / 2, MARGIN / 2);
    }
    for (let y = y0; y < y0 + h; y++) {
      const n = view.start === "bottom" ? pat.H - y : y + 1;
      if (n % every === 0 || y === y0) ctx.fillText(String(n), MARGIN / 2, MARGIN + (y - y0) * L.ch + L.ch / 2);
    }
    if (view.footer) {
      ctx.fillStyle = "#a49a8c";
      ctx.font = "400 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(view.footer, 8, L.height + 12);
    }
  }

  window.Pattern = { EMPTY, BEADS, TECHS, SYMBOLS, cellMM, widthForCm, cmForWidth, generate, finalize, materials, buildSteps, draw, layout, hit, nextSymbol, hex2rgb, textColorFor };
})();
