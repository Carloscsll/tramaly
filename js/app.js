(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const P = window.Pattern;

  const state = {
    img: null, name: "", tech: "loom", pat: null, steps: [], step: -1, highlight: null,
  };

  // ---------- Login ----------
  function showApp(s) {
    $("login").hidden = true; $("app").hidden = false;
    $("whoName").textContent = s.name;
    $("dock").hidden = false;
    state.user = s;
  }
  const narrow = () => window.matchMedia("(max-width: 860px)").matches;
  const goTo = (el) => { if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  $("dockSet").addEventListener("click", () => goTo(document.querySelector(".panel")));
  $("dockChart").addEventListener("click", () => { if (state.pat) goTo($("chart").closest(".card")); else { notify("Primero sube una imagen.", "warn"); goTo(document.querySelector(".panel")); } });
  $("dockSteps").addEventListener("click", () => { if (state.pat) goTo($("trkTitle").closest(".card")); else notify("Primero sube una imagen.", "warn"); });
  function checkSession() {
    const s = Auth.session();
    if (s) showApp(s); else { $("login").hidden = false; $("app").hidden = true; }
  }
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("lErr").textContent = "";
    const r = await Auth.login($("lUser").value, $("lPass").value);
    if (!r.ok) { $("lErr").textContent = r.msg; return; }
    $("lPass").value = "";
    showApp(r.session);
  });
  $("pwToggle").addEventListener("click", () => {
    const show = $("lPass").type === "password";
    $("lPass").type = show ? "text" : "password";
    $("pwToggle").setAttribute("aria-pressed", show);
    $("pwToggle").setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    $("eyeOn").hidden = show; $("eyeOff").hidden = !show;
    $("lPass").focus();
  });
  $("logoutBtn").addEventListener("click", () => { Auth.logout(); location.reload(); });
  // cierre automático al expirar la sesión
  setInterval(() => { if (!$("app").hidden && !Auth.session()) location.reload(); }, 30000);

  // ---------- Controles ----------
  const techBox = $("techs");
  Object.entries(P.TECHS).forEach(([k, t]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tech"; b.dataset.k = k;
    b.innerHTML = "<b>" + t.label + "</b><span>" + t.desc + "</span>";
    b.addEventListener("click", () => {
      state.tech = k; $("start").value = t.startDefault; syncTech(); regen();
    });
    techBox.appendChild(b);
  });
  function syncTech() {
    techBox.querySelectorAll(".tech").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === state.tech));
  }
  Object.entries(P.BEADS).forEach(([k, b]) => {
    const o = document.createElement("option"); o.value = k; o.textContent = b.label; $("bead").appendChild(o);
  });
  $("start").value = P.TECHS[state.tech].startDefault;
  syncTech();

  const ranges = { width: "vWidth", colors: "vColors", brightness: "vBr", contrast: "vCt", saturation: "vSa", zoom: "vZoom" };
  let timer;
  function debounce(fn) { clearTimeout(timer); timer = setTimeout(fn, 150); }
  Object.entries(ranges).forEach(([id, out]) => {
    $(id).addEventListener("input", () => {
      $(out).textContent = $(id).value;
      if (id === "zoom") redraw(); else debounce(regen);
    });
  });
  ["bead", "dither", "mirror", "start"].forEach((id) => $(id).addEventListener("change", regen));
  $("symbols").addEventListener("change", redraw);

  // ---------- Avisos ----------
  let msgTimer;
  function notify(text, kind, sticky) {
    const m = $("msg");
    m.className = "msg " + (kind || "");
    m.innerHTML = "";
    const s = document.createElement("span"); s.textContent = text;
    const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Cerrar aviso");
    x.onclick = () => { m.hidden = true; };
    m.append(s, x); m.hidden = false;
    clearTimeout(msgTimer);
    if (!sticky && kind !== "error") msgTimer = setTimeout(() => { m.hidden = true; }, 7000);
    m.scrollIntoView({ block: "nearest" });
  }

  // ---------- Imagen ----------
  const MAX_MB = 20;
  function loadImage(src, name, revoke) {
    const drop = $("drop");
    drop.classList.add("busy");
    const img = new Image();
    img.onload = () => {
      drop.classList.remove("busy");
      if (revoke) URL.revokeObjectURL(src);
      if (!img.naturalWidth || !img.naturalHeight) { notify("La imagen no tiene dimensiones válidas.", "error"); return; }
      initWork(img);
      state.name = name; state.step = -1; state.highlight = null;
      $("bgEditor").hidden = true;
      if (regen()) {
        const small = img.naturalWidth < +$("width").value * 4;
        if (small) notify("Imagen cargada, pero es pequeña (" + img.naturalWidth + "×" + img.naturalHeight + " px): el resultado puede verse borroso. Mejor usa una más grande y nítida.", "warn");
        else notify("Imagen cargada: " + name, "ok");
        if (narrow()) setTimeout(() => goTo($("result")), 150);
      }
    };
    img.onerror = () => {
      drop.classList.remove("busy");
      if (revoke) URL.revokeObjectURL(src);
      notify("No se pudo leer esa imagen. Puede estar dañada o en un formato que el navegador no abre; prueba con JPG o PNG.", "error");
    };
    img.src = src;
  }
  function handleFile(f, extra) {
    if (!f) { notify("No se recibió ningún archivo.", "error"); return; }
    const name = f.name || "imagen";
    if (/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(f.type)) {
      notify("Las fotos HEIC/HEIF del iPhone no se pueden abrir aquí. Conviértela a JPG (en iPhone: Ajustes > Cámara > Formatos > “Más compatible”, o compártela como JPG) e inténtalo de nuevo.", "error", true);
      return;
    }
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name)) {
      notify("“" + name + "” no es una imagen. Usa JPG, PNG, WEBP o GIF.", "error");
      return;
    }
    if (/svg/i.test(f.type) || /\.svg$/i.test(name)) { notify("SVG no es compatible; exporta la imagen como PNG o JPG.", "error"); return; }
    if (f.size > MAX_MB * 1024 * 1024) { notify("La imagen pesa " + (f.size / 1048576).toFixed(1) + " MB; el máximo es " + MAX_MB + " MB. Redúcela e inténtalo de nuevo.", "error"); return; }
    if (f.size === 0) { notify("El archivo está vacío.", "error"); return; }
    if (extra > 1) notify("Seleccionaste varias imágenes; se usará solo la primera.", "warn");
    loadImage(URL.createObjectURL(f), name, true);
  }
  const fileInput = $("file"), drop = $("drop");
  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files && files.length) handleFile(files[0], files.length);
    fileInput.value = ""; // permite volver a elegir el mismo archivo
  });
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });

  // Arrastrar y soltar en cualquier parte de la página (evita que el navegador abra la imagen)
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (hasFiles(e) && state.user) { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); } });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove("dragging"); });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
    if (!state.user) return;
    const fl = e.dataTransfer.files;
    if (fl && fl.length) handleFile(fl[0], fl.length); else notify("No se pudo recibir el archivo arrastrado.", "error");
  });
  // Pegar imagen desde el portapapeles
  document.addEventListener("paste", (e) => {
    if (!state.user) return;
    const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith("image/"));
    if (it) { e.preventDefault(); handleFile(it.getAsFile()); }
  });

  $("sampleBtn").addEventListener("click", () => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 360;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 400, 360);
    g.addColorStop(0, "#3f8fd6"); g.addColorStop(1, "#6c3fa0");
    x.fillStyle = g; x.fillRect(0, 0, 400, 360);
    x.fillStyle = "#f2c82e"; x.beginPath(); x.arc(320, 70, 36, 0, 7); x.fill();
    x.fillStyle = "#c2272d"; x.beginPath();
    x.moveTo(200, 320); x.bezierCurveTo(60, 220, 90, 90, 200, 150);
    x.bezierCurveTo(310, 90, 340, 220, 200, 320); x.fill();
    x.fillStyle = "#f6c9d3"; x.beginPath(); x.arc(160, 160, 16, 0, 7); x.fill();
    loadImage(c.toDataURL(), "ejemplo");
  });

  // ---------- Quitar fondo ----------
  const bg = { orig: null, w: 0, h: 0, base: null, mask: null, undo: [], tool: "wand", ver: 0, raf: 0 };
  {
    const none = document.createElement("option"); none.value = "none"; none.textContent = "Sin cuenta (vacío)"; none.selected = true;
    $("bgColor").appendChild(none);
  }
  (window.MIYUKI_PALETTE || []).forEach((p) => {
    const o = document.createElement("option"); o.value = p[2]; o.textContent = p[0] + " · " + p[1];
    $("bgColor").appendChild(o);
  });

  function initWork(img) {
    const sc = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    bg.orig = x.getImageData(0, 0, w, h); bg.w = w; bg.h = h;
    bg.base = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bg.base[i] = bg.orig.data[i * 4 + 3] >= 128 ? 255 : 0;
    bg.mask = Uint8Array.from(bg.base); bg.undo = []; bg.ver = 0;
    const work = document.createElement("canvas"); work.width = w; work.height = h;
    bg.workCtx = work.getContext("2d");
    bg.data = new ImageData(new Uint8ClampedArray(bg.orig.data), w, h);
    state.img = work;
    applyMask();
  }
  function applyMask() {
    const d = bg.data.data;
    for (let i = 0; i < bg.mask.length; i++) d[i * 4 + 3] = bg.mask[i];
    bg.workCtx.putImageData(bg.data, 0, 0);
  }
  const checker = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const x = c.getContext("2d"); x.fillStyle = "#d9d4cb"; x.fillRect(0, 0, 16, 16);
    x.fillStyle = "#f4f1ea"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); return c;
  })();
  function drawEditor() {
    if ($("bgEditor").hidden || !bg.orig) return;
    const cv = $("editCv");
    if (cv.width !== bg.w || cv.height !== bg.h) { cv.width = bg.w; cv.height = bg.h; }
    const x = cv.getContext("2d");
    x.fillStyle = x.createPattern(checker, "repeat"); x.fillRect(0, 0, bg.w, bg.h);
    x.drawImage(state.img, 0, 0);
  }
  function removedPct() { let n = 0; for (let i = 0; i < bg.mask.length; i++) if (!bg.mask[i]) n++; return Math.round((n / bg.mask.length) * 100); }
  let regenTimer;
  function maskChanged(now) {
    bg.ver++;
    cancelAnimationFrame(bg.raf);
    bg.raf = requestAnimationFrame(() => { applyMask(); drawEditor(); });
    clearTimeout(regenTimer);
    regenTimer = setTimeout(() => { applyMask(); regen(); }, now ? 0 : 250);
  }
  function pushUndo() { bg.undo.push(Uint8Array.from(bg.mask)); if (bg.undo.length > 20) bg.undo.shift(); }

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
  function median(a) { a.sort((p, q) => p - q); return a[a.length >> 1]; }

  function autoRemove() {
    if (!bg.orig) { notify("Primero sube una imagen.", "warn"); return; }
    const { w, h } = bg, d = bg.orig.data, tol = +$("tol").value;
    const edge = [];
    for (let x = 0; x < w; x++) { edge.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { edge.push(y * w, y * w + w - 1); }
    const px = edge.filter((i) => bg.mask[i]);
    if (!px.length) { notify("El fondo ya está transparente.", "warn"); return; }
    const ref = [0, 1, 2].map((c) => median(px.map((i) => d[i * 4 + c])));
    pushUndo();
    const n = flood(px, ref, tol);
    const pct = Math.round((n / (w * h)) * 100);
    if (pct < 1) {
      bg.mask = bg.undo.pop();
      notify("No encontré un fondo uniforme en los bordes. Prueba subir la tolerancia o usa la varita en el fondo.", "warn");
      return;
    }
    maskChanged(true);
    openEditor();
    if (pct > 85) notify("Se quitó el " + pct + " % de la imagen: quizá el sujeto es parecido al fondo. Baja la tolerancia o usa “Restaurar”.", "warn");
    else notify("Fondo quitado (" + pct + " % de la imagen). Ajusta a mano si hace falta.", "ok");
  }

  function openEditor() { $("bgEditor").hidden = false; drawEditor(); }
  $("bgAuto").addEventListener("click", autoRemove);
  $("bgEdit").addEventListener("click", () => { if (!bg.orig) { notify("Primero sube una imagen.", "warn"); return; } openEditor(); $("bgEditor").scrollIntoView({ block: "nearest", behavior: "smooth" }); });
  $("bgClose").addEventListener("click", () => { $("bgEditor").hidden = true; });
  $("bgColor").addEventListener("change", () => regen());
  $("tol").addEventListener("input", () => { $("vTol").textContent = $("tol").value; });
  $("brush").addEventListener("input", () => { $("vBrush").textContent = $("brush").value; });
  $("bgUndo").addEventListener("click", () => { if (!bg.undo.length) { notify("No hay nada que deshacer.", "warn"); return; } bg.mask = bg.undo.pop(); maskChanged(true); });
  $("bgReset").addEventListener("click", () => { pushUndo(); bg.mask = Uint8Array.from(bg.base); maskChanged(true); });
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
    bg.tool = b.dataset.tool;
    // con el pincel el dedo no debe desplazar la página; con la varita sí
    $("editCv").style.touchAction = bg.tool === "wand" ? "pan-x pan-y pinch-zoom" : "none";
    document.querySelectorAll("[data-tool]").forEach((o) => o.setAttribute("aria-pressed", o === b));
  }));

  (function editorPointer() {
    const cv = $("editCv");
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
      maskChanged(false);
    }
    // Varita: actúa al soltar un toque (no al arrastrar para desplazar la página)
    cv.addEventListener("click", (e) => {
      if (!bg.orig || bg.tool !== "wand") return;
      const [x, y] = pos(e);
      if (x < 0 || y < 0 || x >= bg.w || y >= bg.h) return;
      const i = y * bg.w + x;
      if (!bg.mask[i]) { notify("Esa zona ya está quitada. Toca una zona visible.", "warn"); return; }
      pushUndo();
      const d = bg.orig.data;
      const n = flood([i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], +$("tol").value);
      if (!n) bg.undo.pop();
      maskChanged(true);
    });
    cv.addEventListener("pointerdown", (e) => {
      if (!bg.orig || bg.tool === "wand") return;
      e.preventDefault();
      const [x, y] = pos(e);
      if (x < 0 || y < 0 || x >= bg.w || y >= bg.h) return;
      pushUndo();
      down = true; cv.setPointerCapture(e.pointerId); paint(e);
    });
    cv.addEventListener("pointermove", (e) => { if (down) paint(e); });
    const end = () => { if (down) { down = false; maskChanged(true); } };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  })();

  // ---------- Generar / dibujar ----------
  function opts() {
    return {
      img: state.img, width: +$("width").value, tech: state.tech, bead: $("bead").value,
      maxColors: +$("colors").value, dither: $("dither").checked, mirror: $("mirror").checked,
      brightness: +$("brightness").value, contrast: +$("contrast").value, saturation: +$("saturation").value,
      palette: window.MIYUKI_PALETTE, bg: $("bgColor").value,
    };
  }
  function progressKey() {
    return "tramaly.progress|" + [state.name, $("width").value, $("colors").value, state.tech, $("start").value, $("bead").value, $("dither").checked, $("mirror").checked, $("brightness").value, $("contrast").value, $("saturation").value, $("bgColor").value, bg.ver].join("|");
  }
  function regen() {
    if (!state.img) { notify("Primero sube una imagen.", "warn"); return false; }
    try {
      const o = opts();
      if (o.width * 1 > 150) throw new Error("ancho");
      state.pat = P.generate(o);
      state.steps = P.buildSteps(state.pat, $("start").value);
    } catch (err) {
      console.error(err);
      notify("No se pudo generar la plantilla con esta imagen o estos ajustes. Prueba con otra imagen o reduce el ancho/colores.", "error");
      return false;
    }
    state.step = -1; state.highlight = null;
    try { const s = parseInt(localStorage.getItem(progressKey()), 10); if (s >= 0 && s < state.steps.length) state.step = s; } catch {}
    $("empty").hidden = true; $("result").hidden = false;
    renderSummary(); renderLegend(); renderSteps(); redraw();
    const total = state.pat.beadCount;
    if (total > 15000) notify("Plantilla grande (" + total.toLocaleString() + " cuentas): son muchas horas de trabajo. Puedes bajar el ancho para hacerla más corta.", "warn");
    else if (!state.pat.emptyCount && state.pat.colors.length < +$("colors").value && state.pat.colors.length <= 3) notify("La imagen quedó con solo " + state.pat.colors.length + " colores; sube el contraste o la saturación si esperabas más.", "warn");
    return true;
  }
  function footer() {
    return "Licencia personal: " + state.user.name + " · " + new Date().toLocaleDateString();
  }
  function view(extra) {
    return Object.assign({
      cell: +$("zoom").value, symbols: $("symbols").checked, highlight: state.highlight,
      step: state.step >= 0 ? state.steps[state.step] : null, start: $("start").value,
      dpr: window.devicePixelRatio || 1,
    }, extra);
  }
  function redraw() { if (state.pat) P.draw($("chart"), state.pat, view()); }

  function renderSummary() {
    const p = state.pat, t = P.TECHS[p.tech];
    const total = p.beadCount;
    $("sTech").textContent = t.label;
    $("sGrid").textContent = p.W + " × " + p.H + " cuentas";
    $("sSize").textContent = ((p.W * p.cellMM[0]) / 10).toFixed(1) + " × " + ((p.H * p.cellMM[1]) / 10).toFixed(1) + " cm";
    $("sBeads").textContent = total.toLocaleString() + " · " + p.colors.length + " colores";
  }

  function renderLegend() {
    const t = $("legend");
    t.innerHTML = "<tr><th></th><th>Código</th><th>Color</th><th>Cuentas</th><th>Con +10 %</th></tr>";
    state.pat.colors.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.className = "row" + (state.highlight === i ? " on" : "");
      tr.innerHTML = '<td><span class="sw" style="background:' + c.hex + ";color:" + c.text + '">' + c.symbol + "</span></td><td>" +
        c.code + "</td><td>" + c.name + "</td><td>" + c.count + "</td><td>" + Math.ceil(c.count * 1.1) + "</td>";
      tr.addEventListener("click", () => {
        state.highlight = state.highlight === i ? null : i; renderLegend(); redraw();
      });
      t.appendChild(tr);
    });
  }

  const EMPTY = 255;
  const isEmpty = (c) => c === EMPTY;
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function chip(r, big) {
    const s = document.createElement("span");
    s.className = "run" + (big ? " big" : "");
    if (isEmpty(r.c)) {
      s.innerHTML = '<span class="sw void">·</span><span class="rn">' + r.n + ' ×</span><span class="rl">espacio vacío <small>(sin cuenta)</small></span>';
    } else {
      const c = state.pat.colors[r.c];
      s.innerHTML = '<span class="sw" style="background:' + c.hex + ";color:" + c.text + '">' + c.symbol + '</span><span class="rn">' + r.n + ' ×</span><span class="rl">' + c.name + " <small>" + c.code + "</small></span>";
    }
    return s;
  }
  function runText(step) {
    return step.runs.map((r) => r.n + (isEmpty(r.c) ? " vacío" : " " + state.pat.colors[r.c].symbol)).join(" · ");
  }

  function howTo(step, p) {
    const first = step.kind === "start";
    switch (p.tech) {
      case "loom":
        return "Ensarta estas cuentas en la aguja, en el orden de abajo. Colócalas debajo de los hilos de la urdimbre (una cuenta entre cada par de hilos) y pasa la aguja de vuelta por encima, por dentro de todas las cuentas.";
      case "square":
        return first
          ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Esta fila es la base."
          : "Ensarta estas cuentas. Luego únelas a la fila anterior: pasa la aguja por la cuenta de arriba de la fila anterior y otra vez por la cuenta nueva, una por una.";
      case "brick":
        return first
          ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Es la fila base (escalera)."
          : "Agrega las cuentas de una en una: toma una cuenta, pasa la aguja por el hilo que une dos cuentas de la fila anterior y vuelve a pasar por la cuenta nueva para fijarla.";
      default:
        return first
          ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Quedan como una tira: este es el inicio del peyote."
          : "Agrega una cuenta, salta una cuenta de la columna anterior y pasa la aguja por la siguiente. Repite hasta terminar la columna.";
    }
  }

  function introHTML() {
    const p = state.pat, t = P.TECHS[p.tech];
    const warp = p.tech === "loom" ? "<li>Hilos de urdimbre: <b>" + (p.W + 1) + "</b> (uno más que cuentas de ancho).</li>" : "";
    return "<h3>Materiales</h3><ul>" +
      "<li>Cuentas de la lista de colores (con ~10 % extra).</li>" +
      "<li>Hilo para cuentas (tipo Nymo o Fireline) y aguja fina para cuentas (nº 12 o 13).</li>" +
      "<li>Tijeras y un fieltro o plato para que no rueden las cuentas.</li>" + warp + "</ul>" +
      "<h3>Cómo leer la plantilla</h3><ul>" +
      "<li>Cada <b>letra</b> es un color. La tabla de colores te dice cuál es cuál.</li>" +
      "<li>Los <b>números</b> de los márgenes cuentan filas y columnas.</li>" +
      (p.emptyCount ? "<li>Los <b>espacios en blanco</b> no llevan cuenta (es el fondo quitado)." + (p.tech === "loom" || p.tech === "square" ? " En telar y punto cuadrado la pieza queda rectangular: si quieres cubrirlos, elige un color en “Color del fondo”." : "") + "</li>" : "") +
      "<li>Al avanzar por los pasos, la plantilla <b>resalta</b> lo que te toca y atenúa el resto.</li>" +
      "<li>Cada paso te dice el <b>sentido</b> en que debes ensartar. Sigue exactamente el orden que se muestra.</li></ul>" +
      "<p class='note'>Técnica elegida: <b>" + t.label + "</b>. Si es tu primera vez, haz una muestra pequeña antes de empezar la pieza final.</p>";
  }

  function renderSteps() {
    $("introBody").innerHTML = introHTML();
    const ol = $("stepList"); ol.innerHTML = "";
    state.steps.forEach((s, i) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="chk"></span><span><b>' + s.title + "</b> <span class='muted'>" + s.arrow + " " + s.dir.toLowerCase() + "</span><br><span class='lt'>" + runText(s) + "</span></span>";
      li.dataset.i = i;
      li.addEventListener("click", () => { go(i); goTo($("guideCard")); });
      ol.appendChild(li);
    });
    renderTracker();
  }

  function renderTracker() {
    const n = state.steps.length, i = state.step, s = state.steps[i];
    $("progBar").style.width = (n ? Math.round(((i + 1) / n) * 100) : 0) + "%";
    $("stepList").querySelectorAll("li").forEach((li, k) => { li.classList.toggle("done", k < i); li.classList.toggle("now", k === i); });
    $("stepBody").hidden = !s;
    $("stepHelp").hidden = !!s;
    if (!s) {
      $("stepCount").textContent = n + " pasos en total";
      $("trkTitle").textContent = "Listo para empezar";
      $("nextStep").textContent = "Empezar →";
    } else {
      $("stepCount").textContent = "Paso " + (i + 1) + " de " + n;
      $("trkTitle").textContent = s.title;
      $("trkDir").innerHTML = '<span class="arrow">' + s.arrow + "</span><span>" + s.dir + "</span>";
      $("stepDo").textContent = howTo(s, state.pat);
      const box = $("trkRuns"); box.replaceChildren(...s.runs.map((r) => chip(r, true)));
      const solid = s.seq.filter((c) => !isEmpty(c)).length;
      $("trkTotal").textContent = "Total: " + plural(solid, "cuenta", "cuentas") + (solid < s.seq.length ? " (+ " + plural(s.seq.length - solid, "espacio vacío", "espacios vacíos") + ")" : "");
      const strip = $("stepStrip"); strip.innerHTML = "";
      s.seq.forEach((c, k) => {
        const b = document.createElement("span");
        if (isEmpty(c)) { b.className = "b void"; b.textContent = "·"; }
        else { const col = state.pat.colors[c]; b.className = "b"; b.style.background = col.hex; b.style.color = col.text; b.textContent = col.symbol; }
        b.title = "Cuenta " + (k + 1);
        if ((k + 1) % 10 === 0) b.dataset.n = k + 1;
        strip.appendChild(b);
      });
      $("trkNote").textContent = s.note || "";
      $("nextStep").textContent = i >= n - 1 ? "Último paso" : "Hecho, siguiente →";
    }
    $("prevStep").disabled = i <= -1;
    $("nextStep").disabled = i >= n - 1 && i !== -1 ? true : false;
    if (i === n - 1 && i >= 0) { $("nextStep").textContent = "¡Terminaste!"; }
  }
  function go(i) {
    state.step = Math.max(-1, Math.min(state.steps.length - 1, i));
    try { localStorage.setItem(progressKey(), String(state.step)); } catch {}
    renderTracker(); redraw();
  }
  $("nextStep").addEventListener("click", () => go(state.step + 1));
  $("prevStep").addEventListener("click", () => go(state.step - 1));
  $("clearStep").addEventListener("click", () => { state.highlight = null; go(-1); renderLegend(); });

  // ---------- Exportar ----------
  function fname(ext) { return "plantilla-" + P.TECHS[state.tech].label.toLowerCase().replace(/\s+/g, "-") + "." + ext; }
  $("pngBtn").addEventListener("click", () => {
    const c = document.createElement("canvas");
    P.draw(c, state.pat, view({ cell: 24, step: null, highlight: null, symbols: true, dpr: 1, footer: footer() }));
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = fname("png"); a.click();
  });
  $("csvBtn").addEventListener("click", () => {
    const rows = [["Simbolo", "Codigo", "Color", "Cuentas", "Con 10% extra"]];
    state.pat.colors.forEach((c) => rows.push([c.symbol, c.code, c.name, c.count, Math.ceil(c.count * 1.1)]));
    const csv = "﻿" + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = fname("csv"); a.click();
  });
  $("printBtn").addEventListener("click", () => {
    const p = state.pat, t = P.TECHS[p.tech];
    const c = document.createElement("canvas");
    P.draw(c, p, view({ cell: 22, step: null, highlight: null, symbols: true, dpr: 1, footer: footer() }));
    const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
    let h = "<h1>Plantilla " + esc(t.label) + " · " + p.W + "×" + p.H + " cuentas</h1><img src='" + c.toDataURL("image/png") + "'>";
    h += "<div class='pbreak'><h1>Colores</h1><table><tr><th></th><th>Código</th><th>Color</th><th>Cuentas</th><th>+10 %</th></tr>";
    p.colors.forEach((k) => {
      h += "<tr><td><span class='sw' style='background:" + k.hex + ";color:" + k.text + "'>" + k.symbol + "</span></td><td>" + esc(k.code) + "</td><td>" + esc(k.name) + "</td><td>" + k.count + "</td><td>" + Math.ceil(k.count * 1.1) + "</td></tr>";
    });
    h += "</table><h1 style='margin-top:18px'>Instrucciones</h1><ol>";
    state.steps.forEach((s) => { h += "<li><b>" + esc(s.title) + "</b> (" + esc(s.dir) + "): " + esc(runText(s)) + "</li>"; });
    h += "</ol><p class='foot'>" + esc(footer()) + "</p></div>";
    $("printArea").innerHTML = h;
    setTimeout(() => window.print(), 100);
  });

  checkSession();
})();
