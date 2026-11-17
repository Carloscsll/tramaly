/* Motor de plantillas: imagen -> cuadrícula de cuentas + pasos de trabajo. */
(function () {
  "use strict";

  // Medidas aproximadas en mm (diámetro x largo)
  const BEADS = {
    delica: { label: "Delica 11/0 (cilíndrica)", d: 1.6, l: 1.3 },
    rocalla: { label: "Rocalla 11/0 (redonda)", d: 2.0, l: 2.0 },
  };

  const TECHS = {
    loom: {
      label: "Telar",
      desc: "Filas rectas, todas se tejen en el mismo sentido.",
      offset: null,
      unit: "Fila",
      startDefault: "bottom",
    },
    square: {
      label: "Punto cuadrado",
      desc: "Cuadrícula recta, filas en zigzag (ida y vuelta).",
      offset: null,
      unit: "Fila",
      startDefault: "top",
    },
    brick: {
      label: "Brick stitch",
      desc: "Filas horizontales desfasadas media cuenta.",
      offset: "rows",
      unit: "Fila",
      startDefault: "top",
    },
    peyote: {
      label: "Peyote",
      desc: "Columnas desfasadas media cuenta (peyote par, vertical).",
      offset: "cols",
      unit: "Columna",
      startDefault: "top",
    },
  };

  // Tamaño de la celda (ancho, alto) en mm según técnica y cuenta
  function cellMM(tech, bead) {
    const b = BEADS[bead];
    if (tech === "brick") return [b.l, b.d];
    return [b.d, b.l];
  }

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
  function hex2rgb(h) {
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
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

  const SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

  /**
   * Genera la plantilla.
   * opts: {img (CanvasImageSource), width, tech, bead, maxColors, dither,
   *        brightness, contrast, saturation, palette, bg}
   */
  function generate(opts) {
    const { img, tech, bead, maxColors, dither } = opts;
    const W = Math.max(4, Math.round(opts.width));
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const [cw, ch] = cellMM(tech, bead);
    const H = Math.max(4, Math.round(W * (ih / iw) * (cw / ch)));

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = opts.bg || "#ffffff";
    ctx.fillRect(0, 0, W, H);
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

    // Ajustes de imagen
    const br = (opts.brightness || 0) * 2.55;
    const ct = 1 + (opts.contrast || 0) / 100;
    const sa = 1 + (opts.saturation || 0) / 100;
    const px = new Float32Array(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sa; g = gray + (g - gray) * sa; b = gray + (b - gray) * sa;
      r = (r - 128) * ct + 128 + br; g = (g - 128) * ct + 128 + br; b = (b - 128) * ct + 128 + br;
      px[i * 3] = Math.min(255, Math.max(0, r));
      px[i * 3 + 1] = Math.min(255, Math.max(0, g));
      px[i * 3 + 2] = Math.min(255, Math.max(0, b));
    }

    const palette = opts.palette.map((p) => ({
      code: p[0], name: p[1], hex: p[2], lab: rgb2lab(...hex2rgb(p[2])),
    }));

    // k-means en Lab sobre una muestra de píxeles
    const labs = new Array(W * H);
    for (let i = 0; i < W * H; i++) labs[i] = rgb2lab(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]);
    const rnd = mulberry32(12345);
    const sample = [];
    const step = Math.max(1, Math.floor(labs.length / 8000));
    for (let i = 0; i < labs.length; i += step) sample.push(labs[i]);
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

    // Cada centroide -> color de paleta más cercano (sin repetir si se puede)
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
      for (let i = 0; i < W * H; i++) grid[i] = nearest(labs[i]);
    }

    // contar, ordenar por uso, asignar símbolos
    const counts = new Array(subset.length).fill(0);
    for (let i = 0; i < grid.length; i++) counts[grid[i]]++;
    const order = counts.map((c, i) => i).filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a]);
    const remap = new Map(order.map((old, n) => [old, n]));
    for (let i = 0; i < grid.length; i++) grid[i] = remap.get(grid[i]);
    const colors = order.map((old, n) => ({
      code: subset[old].code, name: subset[old].name, hex: subset[old].hex,
      count: counts[old], symbol: SYMBOLS[n % SYMBOLS.length], text: textColorFor(subset[old].hex),
    }));

    return { W, H, grid, colors, tech, bead, cellMM: [cw, ch] };
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
    const steps = [];
    const L2R = "izquierda → derecha", R2L = "derecha → izquierda";
    const T2B = "arriba → abajo", B2T = "abajo → arriba";
    const ys = [...Array(H).keys()];
    if (start === "bottom") ys.reverse();

    if (tech === "peyote") {
      const yList = start === "bottom" ? [...Array(H).keys()].reverse() : [...Array(H).keys()];
      const fwd = start === "bottom" ? B2T : T2B, back = start === "bottom" ? T2B : B2T;
      // paso 1: columnas 1 y 2 intercaladas
      const seq = [];
      for (const y of yList) { seq.push(at(0, y)); if (W > 1) seq.push(at(1, y)); }
      steps.push({
        title: "Columnas 1 y 2 (inicio)", dir: fwd + " (intercalando col. 1 y 2)", seq,
        cells: yList.flatMap((y) => [[0, y], [1, y]]),
        note: "Ensarta estas cuentas en orden; son la base del peyote.",
      });
      for (let x = 2; x < W; x++) {
        const f = (x - 2) % 2 === 0 ? back : fwd;
        const yy = (x - 2) % 2 === 0 ? [...yList].reverse() : yList;
        steps.push({
          title: "Columna " + (x + 1), dir: f, seq: yy.map((y) => at(x, y)),
          cells: yy.map((y) => [x, y]),
        });
      }
    } else {
      ys.forEach((y, n) => {
        const ltr = tech === "loom" ? true : n % 2 === 0;
        const xs = [...Array(W).keys()];
        if (!ltr) xs.reverse();
        const step = {
          title: "Fila " + (n + 1), dir: ltr ? L2R : R2L, seq: xs.map((x) => at(x, y)),
          cells: xs.map((x) => [x, y]),
        };
        if (n === 0 && tech === "brick") step.note = "Esta fila es la base (escalera): cose cada cuenta a la anterior.";
        if (n === 0 && tech === "loom") step.note = "Todas las filas se tejen en el mismo sentido.";
        steps.push(step);
      });
    }
    steps.forEach((s) => (s.runs = runs(s.seq)));
    return steps;
  }

  // ---------- Dibujo ----------
  function layout(pat, cell) {
    const b = BEADS[pat.bead];
    const [mw, mh] = pat.cellMM;
    const cw = cell, ch = cell * (mh / mw);
    const off = TECHS[pat.tech].offset;
    const margin = 26;
    const width = margin * 2 + pat.W * cw + (off === "rows" ? cw / 2 : 0);
    const height = margin * 2 + pat.H * ch + (off === "cols" ? ch / 2 : 0);
    return { cw, ch, off, margin, width: Math.ceil(width), height: Math.ceil(height), round: b.d === b.l };
  }

  function beadPos(L, x, y) {
    return [
      L.margin + x * L.cw + (L.off === "rows" && y % 2 === 1 ? L.cw / 2 : 0),
      L.margin + y * L.ch + (L.off === "cols" && x % 2 === 1 ? L.ch / 2 : 0),
    ];
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

  /**
   * view: {cell, symbols, highlight(colorIdx|null), step(obj|null), start,
   *        footer(string), dpr}
   */
  function draw(canvas, pat, view) {
    const L = layout(pat, view.cell);
    const dpr = view.dpr || 1;
    const footerH = view.footer ? 22 : 0;
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
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 " + fs + "px system-ui, sans-serif";

    for (let y = 0; y < pat.H; y++) {
      for (let x = 0; x < pat.W; x++) {
        const ci = pat.grid[y * pat.W + x];
        const col = pat.colors[ci];
        const [bx, by] = beadPos(L, x, y);
        let dim = false;
        if (view.highlight != null && view.highlight !== ci) dim = true;
        if (inStep && !inStep.has(y * pat.W + x)) dim = true;
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.fillStyle = col.hex;
        rr(ctx, bx + gap, by + gap, L.cw - gap * 2, L.ch - gap * 2, L.round ? Math.min(L.cw, L.ch) / 2 : Math.min(L.cw, L.ch) * 0.28);
        ctx.fill();
        if (view.symbols && fs >= 8) {
          ctx.fillStyle = col.text;
          ctx.fillText(col.symbol, bx + L.cw / 2, by + L.ch / 2 + 0.5);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Numeración en márgenes
    ctx.fillStyle = "#8a7f72";
    ctx.font = "500 10px system-ui, sans-serif";
    const every = view.cell < 14 ? 10 : 5;
    const topSide = view.start !== "bottom";
    for (let x = 0; x < pat.W; x++) {
      if ((x + 1) % every === 0 || x === 0) ctx.fillText(String(x + 1), L.margin + x * L.cw + L.cw / 2, L.margin / 2);
    }
    for (let y = 0; y < pat.H; y++) {
      const n = topSide ? y + 1 : pat.H - y;
      if (n % every === 0 || n === 1) ctx.fillText(String(n), L.margin / 2, L.margin + y * L.ch + L.ch / 2);
    }
    if (view.footer) {
      ctx.fillStyle = "#a49a8c";
      ctx.font = "400 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(view.footer, 8, L.height + 12);
    }
  }

  window.Pattern = { BEADS, TECHS, cellMM, generate, buildSteps, draw, layout, hex2rgb };
})();
