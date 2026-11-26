/* Quitar fondo: detección automática, varita, pincel y recorte al sujeto. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const bg = { orig: null, canvas: null, w: 0, h: 0, base: null, mask: null, undo: [], tool: "wand", raf: 0, timer: 0 };
  let onChange = () => {}, notify = () => {};

  const ready = () => !!bg.orig;
  function clear() { bg.orig = null; bg.mask = null; bg.undo = []; $("bgEditor").hidden = true; }

  function load(img, savedMask) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sc = Math.min(1, 900 / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    bg.orig = x.getImageData(0, 0, w, h); bg.canvas = c; bg.w = w; bg.h = h;
    bg.base = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bg.base[i] = bg.orig.data[i * 4 + 3] >= 128 ? 255 : 0;
    bg.mask = savedMask && savedMask.length === w * h ? Uint8Array.from(savedMask) : Uint8Array.from(bg.base);
    bg.undo = [];
    bg.work = document.createElement("canvas"); bg.work.width = w; bg.work.height = h;
    bg.data = new ImageData(new Uint8ClampedArray(bg.orig.data), w, h);
    apply();
    $("bgEditor").hidden = true;
  }
  function apply() {
    const d = bg.data.data;
    for (let i = 0; i < bg.mask.length; i++) d[i * 4 + 3] = bg.mask[i];
    bg.work.getContext("2d").putImageData(bg.data, 0, 0);
  }

  /** Imagen para generar. Con crop, se ajusta al sujeto (así "ancho" = ancho de la pieza). */
  function source(crop) {
    apply();
    if (!crop) return bg.work;
    let x0 = bg.w, x1 = -1, y0 = bg.h, y1 = -1;
    for (let y = 0; y < bg.h; y++) for (let x = 0; x < bg.w; x++) {
      if (bg.mask[y * bg.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return bg.work;
    if (x0 === 0 && y0 === 0 && x1 === bg.w - 1 && y1 === bg.h - 1) return bg.work;
    const c = document.createElement("canvas"); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext("2d").drawImage(bg.work, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }

  function flood(seeds, ref, tol) {
    const { w, h } = bg, d = bg.orig.data, t2 = tol * tol;
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    let qh = 0, qt = 0, removed = 0;
    const near = (i) => {
      const dr = d[i * 4] - ref[0], dg = d[i * 4 + 1] - ref[1], db = d[i * 4 + 2] - ref[2];
      return dr * dr + dg * dg + db * db <= t2;
    };
    for (const s of seeds) if (!seen[s] && bg.mask[s] && near(s)) { seen[s] = 1; q[qt++] = s; }
    while (qh < qt) {
      const i = q[qh++]; bg.mask[i] = 0; removed++;
      const x = i % w, y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of nb) if (n >= 0 && !seen[n] && bg.mask[n] && near(n)) { seen[n] = 1; q[qt++] = n; }
    }
    return removed;
  }
  function edgeInfo(tol) {
    const { w, h } = bg, d = bg.orig.data, edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
    const px = edge.filter((i) => bg.mask[i]);
    if (!px.length) return null;
    const median = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const ref = [0, 1, 2].map((c) => median(px.map((i) => d[i * 4 + c])));
    const same = px.filter((i) => {
      const dr = d[i * 4] - ref[0], dg = d[i * 4 + 1] - ref[1], db = d[i * 4 + 2] - ref[2];
      return dr * dr + dg * dg + db * db <= tol * tol;
    }).length;
    return { px, ref, uniform: same / px.length };
  }
  const pushUndo = () => { bg.undo.push(Uint8Array.from(bg.mask)); if (bg.undo.length > 15) bg.undo.shift(); };

  /** Quita el fondo si es claramente liso. Devuelve el % quitado (0 = no se tocó). */
  function detect() {
    const info = edgeInfo(+$("tol").value);
    if (!info || info.uniform < 0.85) return 0;
    pushUndo();
    const pct = Math.round((flood(info.px, info.ref, +$("tol").value) / (bg.w * bg.h)) * 100);
    if (pct < 3 || pct > 94) { bg.mask = bg.undo.pop(); return 0; }
    return pct;
  }

  function changed(now) {
    cancelAnimationFrame(bg.raf);
    bg.raf = requestAnimationFrame(() => { apply(); drawEditor(); });
    clearTimeout(bg.timer);
    bg.timer = setTimeout(onChange, now ? 0 : 300);
  }
  function undo() {
    if (!bg.undo.length) { notify("No hay nada que deshacer.", "warn"); return; }
    bg.mask = bg.undo.pop(); changed(true);
  }
  function autoRemove() {
    if (!ready()) { notify("Primero sube una imagen.", "warn"); return; }
    const info = edgeInfo(+$("tol").value);
    if (!info) { notify("El fondo ya está quitado en todos los bordes.", "warn"); return; }
    pushUndo();
    const pct = Math.round((flood(info.px, info.ref, +$("tol").value) / (bg.w * bg.h)) * 100);
    if (pct >= 99) { bg.mask = bg.undo.pop(); notify("Con esa tolerancia se borraría toda la imagen. Baja la tolerancia o usa la varita.", "warn"); return; }
    if (pct < 1) { bg.mask = bg.undo.pop(); notify("No encontré un fondo uniforme. Sube la tolerancia o usa la varita.", "warn"); return; }
    changed(true); openEditor();
    if (pct > 85) notify("Se quitó el " + pct + " % de la imagen: quizá el dibujo se parece al fondo. Baja la tolerancia o usa “Deshacer”.", "warn");
    else notify("Fondo quitado (" + pct + " % de la imagen).", "ok");
  }

  const checker = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const x = c.getContext("2d"); x.fillStyle = "#d9d4cb"; x.fillRect(0, 0, 16, 16);
    x.fillStyle = "#f4f1ea"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); return c;
  })();
  function drawEditor() {
    if ($("bgEditor").hidden || !ready()) return;
    const cv = $("editCv");
    if (cv.width !== bg.w || cv.height !== bg.h) { cv.width = bg.w; cv.height = bg.h; }
    const x = cv.getContext("2d");
    x.fillStyle = x.createPattern(checker, "repeat"); x.fillRect(0, 0, bg.w, bg.h);
    x.drawImage(bg.work, 0, 0);
  }
  function openEditor() { $("bgEditor").hidden = false; drawEditor(); }

  function init(callbacks) {
    onChange = callbacks.onChange; notify = callbacks.notify;
    $("bgAuto").addEventListener("click", autoRemove);
    $("bgEdit").addEventListener("click", () => {
      if (!ready()) { notify("Primero sube una imagen.", "warn"); return; }
      openEditor(); $("bgEditor").scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    $("bgClose").addEventListener("click", () => { $("bgEditor").hidden = true; });
    $("tol").addEventListener("input", () => { $("vTol").textContent = $("tol").value; });
    $("brush").addEventListener("input", () => { $("vBrush").textContent = $("brush").value; });
    $("bgUndo").addEventListener("click", undo);
    $("bgReset").addEventListener("click", () => { pushUndo(); bg.mask = Uint8Array.from(bg.base); changed(true); });
    const cv = $("editCv");
    document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
      bg.tool = b.dataset.tool;
      // con el pincel el dedo no debe desplazar la página; con la varita sí
      cv.style.touchAction = bg.tool === "wand" ? "pan-x pan-y pinch-zoom" : "none";
      document.querySelectorAll("[data-tool]").forEach((o) => o.setAttribute("aria-pressed", o === b));
    }));
    let down = false;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [Math.floor(((e.clientX - r.left) / r.width) * bg.w), Math.floor(((e.clientY - r.top) / r.height) * bg.h), bg.w / r.width];
    };
    function paint(e) {
      const [px, py, scale] = pos(e);
      const rad = (+$("brush").value / 2) * Math.max(1, scale), r2 = rad * rad;
      const erase = bg.tool === "erase";
      for (let y = Math.max(0, Math.floor(py - rad)); y <= Math.min(bg.h - 1, Math.ceil(py + rad)); y++) {
        for (let x = Math.max(0, Math.floor(px - rad)); x <= Math.min(bg.w - 1, Math.ceil(px + rad)); x++) {
          if ((x - px) * (x - px) + (y - py) * (y - py) <= r2) bg.mask[y * bg.w + x] = erase ? 0 : bg.base[y * bg.w + x];
        }
      }
      changed(false);
    }
    // Varita: actúa al tocar (no al arrastrar para desplazar la página)
    cv.addEventListener("click", (e) => {
      if (!ready() || bg.tool !== "wand") return;
      const [x, y] = pos(e);
      if (x < 0 || y < 0 || x >= bg.w || y >= bg.h) return;
      const i = y * bg.w + x;
      if (!bg.mask[i]) { notify("Esa zona ya está quitada. Toca una zona visible.", "warn"); return; }
      pushUndo();
      const d = bg.orig.data;
      if (!flood([i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], +$("tol").value)) bg.undo.pop();
      changed(true);
    });
    cv.addEventListener("pointerdown", (e) => {
      if (!ready() || bg.tool === "wand") return;
      e.preventDefault(); pushUndo(); down = true; cv.setPointerCapture(e.pointerId); paint(e);
    });
    cv.addEventListener("pointermove", (e) => { if (down) paint(e); });
    const end = () => { if (down) { down = false; changed(true); } };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  window.Background = {
    init, load, clear, ready, source, detect, undo, apply,
    mask: () => bg.mask,
    dataURL: () => bg.canvas.toDataURL("image/png"),
  };
})();
