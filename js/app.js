(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const P = window.Pattern;
  const EMPTY = P.EMPTY;

  const state = {
    user: null, tech: "loom",
    master: null, pat: null, steps: [],
    step: -1, showStep: true, highlight: null, // highlight = índice de color en la maestra
    editing: false, tool: "paint", paint: 0, history: [], edited: false,
    projectId: null, settings: null,
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const fmt = (n, d = 0) => n.toLocaleString("es-MX", { maximumFractionDigits: d });
  const grams = (g) => (g > 0 && g < 0.1 ? "menos de 0.1" : fmt(g, 1)) + " g";
  const plural = (n, one, many) => fmt(n) + " " + (n === 1 ? one : many);
  const narrow = () => window.matchMedia("(max-width: 860px)").matches;
  const goTo = (el) => { if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const swatch = (c) => '<span class="sw" style="background:' + c.hex + ";color:" + P.textColorFor(c.hex) + '">' + esc(c.symbol) + "</span>";

  // ---------- Avisos ----------
  let msgTimer;
  function notify(text, kind, opts = {}) {
    const m = $("msg");
    m.className = "msg " + (kind || "");
    const s = document.createElement("span"); s.textContent = text;
    m.replaceChildren(s);
    if (opts.action) {
      const a = document.createElement("button");
      a.type = "button"; a.className = "btn small"; a.textContent = opts.action.label;
      a.onclick = () => { m.hidden = true; opts.action.fn(); };
      m.append(a);
    }
    const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "Cerrar aviso");
    x.onclick = () => { m.hidden = true; };
    m.append(x); m.hidden = false;
    clearTimeout(msgTimer);
    if (!opts.sticky && !opts.action && kind !== "error") msgTimer = setTimeout(() => { m.hidden = true; }, 7000);
  }

  // ---------- Ajustes ----------
  const SETTINGS = ["width", "colors", "bead", "start", "dither", "mirror", "brightness", "contrast", "saturation", "bgColor"];
  const OUTPUTS = { width: "vWidth", colors: "vColors", brightness: "vBr", contrast: "vCt", saturation: "vSa", zoom: "vZoom", tol: "vTol" };
  const isCheck = (id) => $(id).type === "checkbox";
  function readSettings() {
    const s = { tech: state.tech };
    SETTINGS.forEach((id) => (s[id] = isCheck(id) ? $(id).checked : $(id).value));
    return s;
  }
  function applySettings(s) {
    if (!s) return;
    if (P.TECHS[s.tech]) state.tech = s.tech;
    SETTINGS.forEach((id) => {
      if (s[id] === undefined) return;
      if (isCheck(id)) $(id).checked = !!s[id]; else $(id).value = s[id];
    });
    if (!$("bgColor").value) $("bgColor").value = "none";
    if (!$("bead").value) $("bead").value = "delica";
    syncControls();
  }
  function syncControls() {
    Object.entries(OUTPUTS).forEach(([id, out]) => ($(out).textContent = $(id).value));
    $("techs").querySelectorAll(".tech").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === state.tech));
    if (document.activeElement !== $("widthCm")) $("widthCm").value = P.cmForWidth(+$("width").value, state.tech, $("bead").value).toFixed(1);
  }

  function fillBgColors() {
    const sel = $("bgColor"), prev = sel.value || "none";
    sel.replaceChildren(new Option("Sin cuenta (vacío)", "none"), ...Palette.active().map((c) => new Option(c.code + " · " + c.name, c.hex)));
    sel.value = prev; if (!sel.value) sel.value = "none";
  }

  // ---------- Generar ----------
  function regen() {
    if (!Background.ready()) { notify("Primero sube una imagen.", "warn"); return false; }
    const bgValue = $("bgColor").value;
    try {
      state.master = P.generate({
        img: Background.source(bgValue === "none"), width: +$("width").value, tech: state.tech, bead: $("bead").value,
        maxColors: +$("colors").value, dither: $("dither").checked, mirror: $("mirror").checked,
        brightness: +$("brightness").value, contrast: +$("contrast").value, saturation: +$("saturation").value,
        palette: Palette.active(), bg: bgValue,
      });
    } catch (err) {
      console.error(err);
      const why = err.message === "empty" ? "No quedó nada del dibujo: se quitó toda la imagen. Usa “Restaurar todo” o “Deshacer”."
        : err.message === "tall" ? "La pieza saldría demasiado alta. Baja el ancho."
        : "No se pudo generar la plantilla. Prueba con otra imagen o con otros ajustes.";
      notify(why, "error");
      return false;
    }
    state.settings = readSettings();
    state.edited = false; state.history = []; state.highlight = null; state.paint = 0; state.step = -1;
    refresh({ fit: true });
    return true;
  }

  /** Regenera respetando los cambios hechos a mano. */
  function requestRegen() {
    if (!state.master) { if (Background.ready()) regen(); return; }
    if (!Background.ready()) {
      applySettings(state.settings);
      notify("Este proyecto no tiene la imagen guardada. Sube la imagen otra vez para cambiar estos ajustes.", "warn");
      return;
    }
    if (state.edited && !confirm("Se perderán los cambios que hiciste a mano en la plantilla. ¿Continuar?")) {
      applySettings(state.settings); return;
    }
    // si falla, los controles vuelven a coincidir con la plantilla visible
    if (!regen() && state.master) applySettings(state.settings);
  }
  let regenTimer;
  const regenSoon = () => { clearTimeout(regenTimer); regenTimer = setTimeout(requestRegen, 200); };

  /** Recalcula todo a partir de la plantilla maestra. */
  function refresh(opts = {}) {
    if (!state.master) return;
    state.pat = P.finalize(state.master, !state.editing);
    state.steps = P.buildSteps(state.pat, $("start").value);
    state.step = Math.min(state.step, state.steps.length - 1);
    $("empty").hidden = true; $("result").hidden = false;
    syncControls();
    if (opts.fit) fitZoom();
    renderSummary(); renderMaterials(); renderTools(); renderSteps(); redraw();
    saveSoon();
  }

  // ---------- Dibujo y zoom ----------
  function view(extra) {
    const showing = state.showStep && !state.editing && state.step >= 0;
    const hl = state.highlight == null ? null : state.pat.colors.findIndex((c) => c.m === state.highlight);
    return Object.assign({
      cell: +$("zoom").value, symbols: $("symbols").checked, highlight: hl === -1 ? null : hl,
      step: showing ? state.steps[state.step] : null, start: $("start").value,
      dpr: window.devicePixelRatio || 1, showEmpty: state.editing,
    }, extra);
  }
  const redraw = () => { if (state.pat) P.draw($("chart"), state.pat, view()); };
  function setZoom(v) {
    $("zoom").value = Math.max(+$("zoom").min, Math.min(+$("zoom").max, Math.round(v)));
    $("vZoom").textContent = $("zoom").value; redraw();
  }
  function fitZoom() {
    const wrap = $("chartWrap").clientWidth || 600;
    const cell = Math.floor((wrap - 70) / (state.pat.W + 0.5));
    setZoom(Math.max(11, Math.min(28, cell)));
  }

  // ---------- Resumen y materiales ----------
  function renderSummary() {
    const p = state.pat;
    $("sTech").textContent = P.TECHS[p.tech].label;
    $("sGrid").textContent = p.W + " × " + p.H;
    $("sSize").textContent = fmt((p.W * p.cellMM[0]) / 10, 1) + " × " + fmt((p.H * p.cellMM[1]) / 10, 1) + " cm";
    $("sBeads").textContent = fmt(p.beadCount);
    $("sColors").textContent = p.colors.length;
  }

  const matKey = () => "tramaly.materials." + state.user.user;
  function materialOptions() {
    return { extra: +$("mExtra").value, pack: +$("mPack").value, price: +$("mPrice").value, perGram: +$("mPerGram").value };
  }
  function loadMaterialPrefs() {
    const m = Store.pref.get(matKey(), {});
    $("mExtra").value = m.extra ?? 10; $("mPack").value = m.pack ?? 5; $("mPrice").value = m.price || "";
    $("mPerGram").value = m.perGram || "";
  }
  function getMaterials() { return P.materials(state.pat, materialOptions()); }

  function renderMaterials() {
    const m = getMaterials();
    $("mPerGram").placeholder = P.BEADS[state.pat.bead].perGram;
    $("totals").innerHTML =
      '<div class="big-total"><b>' + fmt(m.total) + '</b><span>cuentas lleva la pieza</span></div>' +
      "<div><b>" + fmt(m.buy) + "</b><span>a comprar (+" + fmt(m.extra) + " %)</span></div>" +
      "<div><b>≈ " + fmt(m.grams, 1) + " g</b><span>en total</span></div>" +
      "<div><b>" + fmt(m.packs) + "</b><span>" + (m.packs === 1 ? "paquete" : "paquetes") + " de " + fmt(m.pack, 1) + " g</span></div>" +
      (m.price ? "<div><b>$" + fmt(m.cost, 2) + "</b><span>costo en cuentas</span></div>" : "");

    const others = Palette.active();
    $("legend").replaceChildren(...m.rows.map((c) => {
      const li = document.createElement("li");
      li.className = state.highlight === c.m ? "on" : "";
      li.innerHTML =
        '<button type="button" class="lg-main" aria-pressed="' + (state.highlight === c.m) + '">' + swatch(c) +
        '<span class="lg-name"><b>' + esc(c.code) + "</b> " + esc(c.name) +
        "<small>Comprar " + fmt(c.buy) + " · " + grams(c.grams) + " · " + plural(c.packs, "paquete", "paquetes") + (m.price ? " · $" + fmt(c.cost, 2) : "") + "</small></span>" +
        '<span class="lg-count"><b>' + fmt(c.count) + "</b><small>" + (c.count === 1 ? "cuenta" : "cuentas") + "</small></span></button>" +
        '<div class="lg-actions"><select aria-label="Cambiar el color ' + esc(c.code) + '"></select>' +
        '<button type="button" class="btn small lg-del">No usar (es fondo)</button></div>';
      li.querySelector(".lg-main").onclick = () => {
        state.highlight = state.highlight === c.m ? null : c.m; renderMaterials(); redraw();
      };
      const sel = li.querySelector("select");
      sel.append(new Option("Cambiar color…", ""), ...others.filter((o) => o.id !== c.id).map((o) => new Option(o.code + " · " + o.name, o.id)));
      sel.onchange = () => { if (sel.value) replaceColor(c.m, Palette.byId(sel.value)); };
      li.querySelector(".lg-del").onclick = () => removeColor(c.m);
      return li;
    }));
    if (!m.rows.length) $("legend").innerHTML = "<li class='muted'>La plantilla no tiene cuentas. Usa “Deshacer” o pinta con el lápiz.</li>";
  }

  // ---------- Edición a mano ----------
  function snapshot() {
    state.history.push({ grid: Uint8Array.from(state.master.grid), colors: state.master.colors.map((c) => Object.assign({}, c)), edited: state.edited });
    if (state.history.length > 40) state.history.shift();
  }
  function ensureColor(entry) {
    const cols = state.master.colors;
    let i = cols.findIndex((c) => c.id === entry.id);
    if (i >= 0) return i;
    // reutilizar un hueco sin uso para no agotar las letras
    const used = new Set(state.master.grid);
    i = cols.findIndex((c, k) => !used.has(k) && k !== state.paint);
    if (cols.length >= P.SYMBOLS.length && i >= 0) { cols[i] = { id: entry.id, code: entry.code, name: entry.name, hex: entry.hex, symbol: cols[i].symbol }; return i; }
    if (cols.length >= P.SYMBOLS.length) return -1;
    cols.push({ id: entry.id, code: entry.code, name: entry.name, hex: entry.hex, symbol: P.nextSymbol(cols) });
    return cols.length - 1;
  }
  function replaceColor(from, entry) {
    snapshot();
    const to = ensureColor(entry);
    if (to < 0) { state.history.pop(); notify("Ya hay demasiados colores distintos en esta plantilla.", "warn"); return; }
    const g = state.master.grid;
    for (let i = 0; i < g.length; i++) if (g[i] === from) g[i] = to;
    state.edited = true; state.highlight = null; refresh();
    notify("Color cambiado a " + entry.code + ".", "ok", { action: { label: "Deshacer", fn: undoEdit } });
  }
  function removeColor(idx) {
    snapshot();
    const g = state.master.grid; let n = 0;
    for (let i = 0; i < g.length; i++) if (g[i] === idx) { g[i] = EMPTY; n++; }
    state.edited = true; state.highlight = null; refresh();
    notify("Se quitaron " + plural(n, "cuenta", "cuentas") + ". Ya no se cuentan.", "ok", { action: { label: "Deshacer", fn: undoEdit } });
  }
  function undoEdit() {
    const h = state.history.pop();
    if (!h) { notify("No hay cambios que deshacer.", "warn"); return; }
    state.master.grid = h.grid; state.master.colors = h.colors; state.edited = h.edited; state.highlight = null;
    refresh();
  }

  function renderTools() {
    $("editBtn").textContent = state.editing ? "✓ Terminar edición" : "✎ Editar cuentas";
    $("editBtn").classList.toggle("primary", state.editing);
    $("editBar").hidden = !state.editing;
    $("chart").style.touchAction = state.editing && state.tool !== "move" ? "none" : "auto";
    $("chart").classList.toggle("painting", state.editing && state.tool !== "move");
    document.querySelectorAll("[data-edit]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.edit === state.tool));
    if (!state.editing) return;
    const used = new Set(state.pat.colors.map((c) => c.m));
    const cols = state.master.colors.map((c, i) => [c, i]).filter(([, i]) => used.has(i) || i === state.paint);
    $("paintColors").replaceChildren(...cols.map(([c, i]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pick"; b.innerHTML = swatch(c); b.title = c.code + " · " + c.name;
      b.setAttribute("aria-label", "Pintar con " + c.code + " " + c.name);
      b.setAttribute("aria-pressed", state.paint === i);
      b.onclick = () => { state.paint = i; if (state.tool === "erase" || state.tool === "move") state.tool = "paint"; renderTools(); };
      return b;
    }));
    const sel = $("paintMore");
    sel.replaceChildren(new Option("+ Otro color…", ""), ...Palette.active().map((o) => new Option(o.code + " · " + o.name, o.id)));
  }
  $("editBtn").addEventListener("click", () => {
    state.editing = !state.editing; state.highlight = null;
    state.tool = "paint";
    if (state.editing && state.pat.colors.length && !state.pat.colors.some((c) => c.m === state.paint)) state.paint = state.pat.colors[0].m;
    const z = +$("zoom").value;
    refresh();
    if (state.editing) { setZoom(Math.max(z, 18)); notify("Toca o arrastra sobre la plantilla para pintar. Usa “Mover” para desplazarte.", "ok"); }
    else fitZoom();
  });
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { state.tool = b.dataset.edit; renderTools(); }));
  $("paintMore").addEventListener("change", () => {
    const entry = Palette.byId($("paintMore").value);
    if (!entry) return;
    const i = ensureColor(entry);
    if (i < 0) { notify("Ya hay demasiados colores distintos.", "warn"); return; }
    state.paint = i; if (state.tool !== "fill") state.tool = "paint";
    state.pat = P.finalize(state.master, false); renderTools();
  });
  $("undoEdit").addEventListener("click", undoEdit);

  (function chartPointer() {
    const cv = $("chart");
    let down = false, raf = 0, dirty = false;
    function cellAt(e) {
      const r = cv.getBoundingClientRect();
      return P.hit(state.pat, +$("zoom").value, e.clientX - r.left, e.clientY - r.top);
    }
    function apply(e) {
      const c = cellAt(e); if (!c) return;
      const m = state.master, i = c.y * m.W + c.x; // al editar no hay recorte
      const value = state.tool === "erase" ? EMPTY : state.paint;
      if (m.grid[i] === value) return;
      if (state.tool === "fill") {
        const old = m.grid[i], queue = [i];
        m.grid[i] = value;
        while (queue.length) {
          const k = queue.pop(), x = k % m.W, y = (k / m.W) | 0;
          [x > 0 ? k - 1 : -1, x < m.W - 1 ? k + 1 : -1, y > 0 ? k - m.W : -1, y < m.H - 1 ? k + m.W : -1].forEach((n) => {
            if (n >= 0 && m.grid[n] === old) { m.grid[n] = value; queue.push(n); }
          });
        }
      } else m.grid[i] = value;
      dirty = true; state.edited = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { state.pat = P.finalize(state.master, false); redraw(); });
    }
    function finish() {
      if (!down) return;
      down = false; cancelAnimationFrame(raf);
      if (dirty) refresh(); else state.history.pop();
    }
    cv.addEventListener("pointerdown", (e) => {
      if (!state.editing || state.tool === "move" || !state.pat) return;
      e.preventDefault(); snapshot(); down = true; dirty = false; cv.setPointerCapture(e.pointerId); apply(e);
      if (state.tool === "fill") finish();
    });
    cv.addEventListener("pointermove", (e) => { if (down) apply(e); });
    cv.addEventListener("pointerup", finish); cv.addEventListener("pointercancel", finish);
  })();

  // ---------- Guía paso a paso ----------
  const isEmpty = (c) => c === EMPTY;
  function chip(r) {
    const s = document.createElement("span");
    s.className = "run big";
    if (isEmpty(r.c)) s.innerHTML = '<span class="sw void">·</span><span class="rn">' + r.n + ' ×</span><span class="rl">espacio vacío <small>(sin cuenta)</small></span>';
    else { const c = state.pat.colors[r.c]; s.innerHTML = swatch(c) + '<span class="rn">' + r.n + ' ×</span><span class="rl">' + esc(c.name) + " <small>" + esc(c.code) + "</small></span>"; }
    return s;
  }
  const runText = (step) => step.runs.map((r) => r.n + (isEmpty(r.c) ? " vacío" : " " + state.pat.colors[r.c].symbol)).join(" · ");

  function howTo(step, p) {
    const first = step.kind === "start";
    switch (p.tech) {
      case "loom":
        return "Ensarta estas cuentas en la aguja, en el orden de abajo. Colócalas debajo de los hilos de la urdimbre (una cuenta entre cada par de hilos) y pasa la aguja de vuelta por encima, por dentro de todas las cuentas.";
      case "square":
        return first ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Esta fila es la base."
          : "Ensarta estas cuentas. Luego únelas a la fila anterior: pasa la aguja por la cuenta de la fila anterior y otra vez por la cuenta nueva, una por una.";
      case "brick":
        return first ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Es la fila base (escalera)."
          : "Agrega las cuentas de una en una: toma una cuenta, pasa la aguja por el hilo que une dos cuentas de la fila anterior y vuelve a pasar por la cuenta nueva para fijarla.";
      default:
        return first ? "Ensarta todas estas cuentas en el hilo, en el orden de abajo. Quedan como una tira: este es el inicio del peyote."
          : "Agrega una cuenta, salta una cuenta de la columna anterior y pasa la aguja por la siguiente. Repite hasta terminar la columna.";
    }
  }
  function introHTML() {
    const p = state.pat;
    const warp = p.tech === "loom" ? "<li>Hilos de urdimbre: <b>" + (p.W + 1) + "</b> (uno más que cuentas de ancho).</li>" : "";
    const gaps = p.emptyCount ? "<li>Los <b>espacios en blanco</b> no llevan cuenta." +
      (p.tech === "loom" || p.tech === "square" ? " En telar y punto cuadrado los huecos son difíciles de tejer: revisa la forma o elige un color en “Color del fondo”." : " Las instrucciones indican cuántos espacios saltar; en orillas irregulares tendrás que aumentar o disminuir cuentas.") + "</li>" : "";
    return "<h3>Materiales</h3><ul><li>Las cuentas de la lista “Cuentas y materiales”.</li>" +
      "<li>Hilo para cuentas (tipo Nymo o Fireline) y aguja fina para cuentas (nº 12 o 13).</li>" +
      "<li>Tijeras y un fieltro o plato para que no rueden las cuentas.</li>" + warp + "</ul>" +
      "<h3>Cómo leer la plantilla</h3><ul><li>Cada <b>letra</b> es un color.</li>" +
      "<li>Los <b>números</b> de los márgenes cuentan filas y columnas.</li>" + gaps +
      "<li>Al avanzar, la plantilla <b>resalta</b> lo que te toca.</li>" +
      "<li>Sigue el <b>sentido</b> y el orden que indica cada paso.</li></ul>" +
      "<p class='note'>Si es tu primera vez con esta técnica, haz antes una muestra pequeña.</p>";
  }
  function renderSteps() {
    $("introBody").innerHTML = introHTML();
    $("stepList").replaceChildren(...state.steps.map((s, i) => {
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.innerHTML = '<span class="chk"></span><span><b>' + s.title + "</b> <span class='muted'>" + s.arrow + " " + s.dir.toLowerCase() + "</span><br><span class='lt'>" + esc(runText(s)) + "</span></span>";
      const open = () => { go(i); goTo($("guideCard")); };
      li.addEventListener("click", open);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
      return li;
    }));
    renderTracker();
  }
  function renderTracker() {
    const n = state.steps.length, i = state.step, s = state.steps[i];
    $("progBar").style.width = (n ? Math.round(((i + 1) / n) * 100) : 0) + "%";
    [...$("stepList").children].forEach((li, k) => { li.classList.toggle("done", k < i); li.classList.toggle("now", k === i); });
    $("stepBody").hidden = !s;
    $("stepHelp").hidden = !!s;
    $("clearStep").hidden = !s;
    $("clearStep").textContent = state.showStep ? "Ver la plantilla completa" : "Resaltar el paso actual";
    if (!s) {
      $("stepCount").textContent = plural(n, "paso", "pasos") + " en total";
      $("trkTitle").textContent = "Listo para empezar";
    } else {
      $("stepCount").textContent = "Paso " + (i + 1) + " de " + n;
      $("trkTitle").textContent = s.title;
      $("trkDir").innerHTML = '<span class="arrow">' + s.arrow + "</span><span>" + s.dir + "</span>";
      $("stepDo").textContent = howTo(s, state.pat);
      $("trkRuns").replaceChildren(...s.runs.map(chip));
      const solid = s.seq.filter((c) => !isEmpty(c)).length;
      $("trkTotal").textContent = "En este paso: " + plural(solid, "cuenta", "cuentas") + (solid < s.seq.length ? " (+ " + plural(s.seq.length - solid, "espacio vacío", "espacios vacíos") + ")" : "");
      $("stepStrip").replaceChildren(...s.seq.map((c, k) => {
        const b = document.createElement("span");
        if (isEmpty(c)) { b.className = "b void"; b.textContent = "·"; }
        else { const col = state.pat.colors[c]; b.className = "b"; b.style.background = col.hex; b.style.color = col.text; b.textContent = col.symbol; }
        b.title = "Posición " + (k + 1);
        if ((k + 1) % 10 === 0) b.dataset.n = k + 1;
        return b;
      }));
      $("trkNote").textContent = s.note || "";
    }
    $("prevStep").disabled = i < 0;
    $("nextStep").disabled = i >= n - 1;
    $("nextStep").textContent = i < 0 ? "Empezar →" : i >= n - 1 ? "¡Terminaste! 🎉" : "Hecho, siguiente →";
  }
  function go(i) {
    state.step = Math.max(-1, Math.min(state.steps.length - 1, i));
    state.showStep = true;
    renderTracker(); redraw(); saveSoon();
  }
  $("nextStep").addEventListener("click", () => go(state.step + 1));
  $("prevStep").addEventListener("click", () => go(state.step - 1));
  $("clearStep").addEventListener("click", () => { state.showStep = !state.showStep; renderTracker(); redraw(); });
  $("restartStep").addEventListener("click", () => { if (state.step < 0 || confirm("¿Volver al principio? Se borra tu avance en esta plantilla.")) go(-1); });
  document.addEventListener("keydown", (e) => {
    if (!state.pat || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight") go(state.step + 1);
    if (e.key === "ArrowLeft") go(state.step - 1);
  });
  // Mantener la pantalla encendida mientras se teje
  let wake = null;
  async function keepAwake() {
    try { wake = $("awake").checked && !document.hidden ? await navigator.wakeLock.request("screen") : (wake && (await wake.release()), null); }
    catch { $("awake").checked = false; notify("Este dispositivo no permitió mantener la pantalla encendida.", "warn"); }
  }
  if ("wakeLock" in navigator) {
    $("awake").addEventListener("change", keepAwake);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && $("awake").checked) keepAwake(); });
  } else $("awakeRow").hidden = true;

  // ---------- Proyectos ----------
  let saveTimer, saving = Promise.resolve();
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }
  function thumb() {
    const c = document.createElement("canvas");
    P.draw(c, state.pat, view({ cell: Math.max(2, Math.min(6, 120 / state.pat.W)), symbols: false, step: null, highlight: null, showEmpty: false, dpr: 1 }));
    return c.toDataURL("image/png");
  }
  function record() {
    return {
      id: state.projectId, user: state.user.user, name: $("projName").value.trim() || "Sin nombre", updated: Date.now(),
      settings: state.settings, master: state.master, edited: state.edited, step: state.step,
      mask: Background.ready() ? Background.mask() : null, thumb: thumb(),
    };
  }
  function save() {
    clearTimeout(saveTimer); saveTimer = 0;
    if (!state.master || !state.projectId || !state.pat) return saving;
    const rec = record(), last = "tramaly.last." + state.user.user;
    saving = Store.put("projects", rec).then(() => {
      Store.pref.set(last, rec.id); $("saved").textContent = "Guardado en este dispositivo";
    }).catch((err) => { console.error(err); $("saved").textContent = "⚠ No se pudo guardar (¿ventana privada o sin espacio?)"; });
    return saving;
  }
  window.addEventListener("pagehide", () => { if (saveTimer) save(); });
  const newProjectId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  $("projName").addEventListener("input", saveSoon);

  function loadElement(src) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
  }
  async function openProject(id) {
    const rec = await Store.get("projects", id);
    if (!rec || rec.user !== state.user.user) return false;
    if (saveTimer) await save();
    clearTimeout(regenTimer);
    const stored = await Store.get("images", id);
    if (stored) Background.load(await loadElement(stored.data), rec.mask); else Background.clear();
    applySettings(rec.settings);
    Object.assign(state, { projectId: id, master: rec.master, edited: rec.edited, step: rec.step, settings: rec.settings, history: [], highlight: null, editing: false, showStep: true, paint: 0 });
    syncCodes();
    $("projName").value = rec.name;
    refresh({ fit: true });
    return true;
  }

  async function renderProjects() {
    const list = (await Store.all("projects")).filter((p) => p.user === state.user.user).sort((a, b) => b.updated - a.updated);
    $("projList").replaceChildren(...list.map((p) => {
      const li = document.createElement("li");
      li.innerHTML = '<img alt=""><div class="pj-info"><b>' + esc(p.name) + "</b><small>" + new Date(p.updated).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) +
        " · " + P.TECHS[p.settings.tech].label + '</small><div class="row2"><button type="button" class="btn small primary" data-a="open">Abrir</button><button type="button" class="btn small" data-a="file">Descargar copia</button><button type="button" class="btn small" data-a="del">Borrar</button></div></div>';
      li.querySelector("img").src = p.thumb;
      li.querySelector("[data-a=open]").onclick = async () => { $("projDlg").close(); await openProject(p.id); goTo($("result")); };
      li.querySelector("[data-a=file]").onclick = () => exportProject(p.id);
      li.querySelector("[data-a=del]").onclick = async () => {
        if (!confirm("¿Borrar “" + p.name + "”? No se puede recuperar.")) return;
        await Store.del("projects", p.id); await Store.del("images", p.id);
        if (p.id === state.projectId) { clearTimeout(saveTimer); saveTimer = 0; Object.assign(state, { projectId: null, master: null, pat: null, steps: [] }); Background.clear(); $("result").hidden = true; $("empty").hidden = false; }
        renderProjects();
      };
      return li;
    }));
    if (!list.length) $("projList").innerHTML = "<li class='muted'>Todavía no hay proyectos. Sube una imagen y se guardará solo.</li>";
  }
  $("projBtn").addEventListener("click", async () => {
    try { await save(); await renderProjects(); $("projDlg").showModal(); }
    catch { notify("No se pudo leer lo guardado en este navegador.", "error"); }
  });
  $("projClose").addEventListener("click", () => $("projDlg").close());

  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function download(name, blob) {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plantilla";

  async function exportProject(id) {
    const r = await Store.get("projects", id), img = await Store.get("images", id);
    const data = {
      app: "tramaly", v: 1, name: r.name, settings: r.settings, edited: r.edited, step: r.step, thumb: r.thumb,
      master: Object.assign({}, r.master, { grid: b64(r.master.grid) }),
      image: img ? img.data : null, mask: r.mask ? b64(r.mask) : null,
    };
    download(slug(r.name) + ".tramaly.json", new Blob([JSON.stringify(data)], { type: "application/json" }));
  }
  /** Valida un archivo de proyecto antes de usarlo. */
  function parseProject(text) {
    const d = JSON.parse(text);
    const m = d.master, hex = /^#[0-9a-f]{6}$/i, int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    if (d.app !== "tramaly" || !m || !int(m.W, 1, 150) || !int(m.H, 1, 400) || !P.TECHS[m.tech] || !P.BEADS[m.bead] || !d.settings || !P.TECHS[d.settings.tech]) throw new Error("formato");
    if (!Array.isArray(m.colors) || m.colors.length > P.SYMBOLS.length || !m.colors.every((c) => c && hex.test(c.hex) && P.SYMBOLS.includes(c.symbol))) throw new Error("colores");
    const grid = unb64(m.grid);
    if (grid.length !== m.W * m.H || !grid.every((v) => v === EMPTY || v < m.colors.length)) throw new Error("cuadrícula");
    const colors = m.colors.map((c) => ({ id: String(c.id), code: String(c.code), name: String(c.name), hex: c.hex, symbol: c.symbol }));
    const image = typeof d.image === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.image) ? d.image : null;
    const png = (s) => typeof s === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);
    return {
      rec: {
        name: String(d.name || "Importado").slice(0, 80), settings: d.settings, edited: !!d.edited, step: int(d.step, -1, 1000) ? d.step : -1,
        master: { W: m.W, H: m.H, tech: m.tech, bead: m.bead, colors, grid }, mask: image && d.mask ? unb64(d.mask) : null, thumb: png(d.thumb) ? d.thumb : "",
      }, image,
    };
  }
  $("projImport").addEventListener("click", () => $("projFile").click());
  $("projFile").addEventListener("change", async () => {
    const f = $("projFile").files[0]; $("projFile").value = "";
    if (!f) return;
    try {
      if (f.size > 15e6) throw new Error("grande");
      const { rec, image } = parseProject(await f.text());
      const id = newProjectId();
      if (image) await Store.put("images", { id, data: image });
      await Store.put("projects", Object.assign(rec, { id, user: state.user.user, updated: Date.now() }));
      $("projDlg").close(); await openProject(id); notify("Proyecto importado.", "ok");
    } catch (err) {
      console.error(err); $("projDlg").close(); notify("Ese archivo no es un proyecto de Tramaly válido.", "error");
    }
  });

  // ---------- Mis colores ----------
  /** Actualiza códigos y nombres de la plantilla abierta con los de "Mis colores". */
  function syncCodes() {
    if (!state.master) return;
    state.master.colors.forEach((c) => { const p = Palette.byId(c.id); if (p) Object.assign(c, { code: p.code, name: p.name, hex: p.hex }); });
  }
  let paletteSetChanged = false;
  function paletteChanged(kind) { if (kind === "set") paletteSetChanged = true; }
  $("colorsBtn").addEventListener("click", () => { paletteSetChanged = false; Palette.openDialog(); });
  $("colorsDlg").addEventListener("close", () => {
    fillBgColors(); syncCodes();
    if (state.master) {
      refresh();
      if (paletteSetChanged && Background.ready()) notify("Cambiaste los colores disponibles.", "ok", { action: { label: "Rehacer plantilla", fn: requestRegen } });
    }
  });

  // ---------- Imagen ----------
  const MAX_MB = 20;
  async function loadImage(src, name, revoke) {
    const drop = $("drop");
    drop.classList.add("busy");
    let img;
    try { img = await loadElement(src); if (!img.naturalWidth) throw new Error(); }
    catch { notify("No se pudo leer esa imagen. Puede estar dañada o en un formato que el navegador no abre; prueba con JPG o PNG.", "error"); return; }
    finally { drop.classList.remove("busy"); if (revoke) setTimeout(() => URL.revokeObjectURL(src), 1000); }
    if (saveTimer) await save();
    clearTimeout(regenTimer);
    Background.load(img);
    const removed = $("autoBg").checked && $("bgColor").value === "none" ? Background.detect() : 0;
    Object.assign(state, { projectId: newProjectId(), master: null, step: -1, editing: false, showStep: true });
    $("projName").value = name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
    if (!regen()) return;
    Store.put("images", { id: state.projectId, data: Background.dataURL() }).catch(() => {});
    if (removed) notify("Quité el fondo liso: solo se cuentan las cuentas del dibujo.", "ok", { action: { label: "Dejar el fondo", fn: () => { Background.undo(); } } });
    else if (img.naturalWidth < +$("width").value * 4) notify("La imagen es pequeña (" + img.naturalWidth + "×" + img.naturalHeight + " px) y puede verse borrosa. Mejor una más grande.", "warn");
    else if (state.pat.emptyCount === 0 && $("bgColor").value === "none") notify("No detecté un fondo liso, así que cuento toda la imagen. Si hay fondo, usa “Quitar fondo” o “No usar” en su color.", "warn");
    else notify("Imagen cargada.", "ok");
    if (narrow()) setTimeout(() => goTo($("result")), 150);
  }
  function handleFile(f, extra) {
    if (!f) { notify("No se recibió ningún archivo.", "error"); return; }
    const name = f.name || "imagen";
    if (/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(f.type)) {
      notify("Las fotos HEIC/HEIF del iPhone no se pueden abrir aquí. Conviértela a JPG (en iPhone: Ajustes > Cámara > Formatos > “Más compatible”) e inténtalo de nuevo.", "error"); return;
    }
    if (/svg/i.test(f.type) || /\.svg$/i.test(name)) { notify("SVG no es compatible; exporta la imagen como PNG o JPG.", "error"); return; }
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name)) { notify("“" + name + "” no es una imagen. Usa JPG, PNG, WEBP o GIF.", "error"); return; }
    if (f.size > MAX_MB * 1048576) { notify("La imagen pesa " + fmt(f.size / 1048576, 1) + " MB; el máximo es " + MAX_MB + " MB.", "error"); return; }
    if (f.size === 0) { notify("El archivo está vacío.", "error"); return; }
    loadImage(URL.createObjectURL(f), name, true).then(() => { if (extra > 1) notify("Elegiste varias imágenes; se usó solo la primera.", "warn"); });
  }
  const fileInput = $("file"), drop = $("drop");
  fileInput.addEventListener("change", () => {
    const files = fileInput.files;
    if (files && files.length) handleFile(files[0], files.length);
    fileInput.value = ""; // permite volver a elegir el mismo archivo
  });
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
  $("emptyUpload").addEventListener("click", () => fileInput.click());
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
  document.addEventListener("paste", (e) => {
    if (!state.user) return;
    const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith("image/"));
    if (it) { e.preventDefault(); handleFile(it.getAsFile()); }
  });
  $("sampleBtn").addEventListener("click", () => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 380;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 400, 380);
    x.fillStyle = "#c2272d"; x.beginPath();
    x.moveTo(200, 340); x.bezierCurveTo(-20, 190, 80, 10, 200, 110);
    x.bezierCurveTo(320, 10, 420, 190, 200, 340); x.fill();
    x.fillStyle = "#f08cb4"; x.beginPath(); x.ellipse(130, 130, 34, 22, -0.7, 0, 7); x.fill();
    loadImage(c.toDataURL(), "Corazón de ejemplo");
  });

  // ---------- Exportar ----------
  const footer = () => "Licencia personal: " + state.user.name + " · " + new Date().toLocaleDateString("es-MX");
  const exportView = (extra) => view(Object.assign({ step: null, highlight: null, symbols: true, showEmpty: false, dpr: 1 }, extra));
  function croppedPattern() { return P.finalize(state.master, true); }
  /** Ejecuta una exportación sobre la plantilla recortada, aunque se esté editando. */
  function withCropped(fn) {
    const pat = state.pat, steps = state.steps;
    state.pat = croppedPattern(); state.steps = P.buildSteps(state.pat, $("start").value);
    try {
      if (!state.pat.beadCount) { notify("La plantilla no tiene cuentas todavía.", "warn"); return; }
      fn(state.pat, state.steps);
    } finally { state.pat = pat; state.steps = steps; }
  }
  $("pngBtn").addEventListener("click", () => withCropped((p) => {
    const c = document.createElement("canvas");
    P.draw(c, p, exportView({ cell: 24, footer: footer() }));
    c.toBlob((blob) => (blob ? download(slug($("projName").value) + ".png", blob) : notify("La plantilla es demasiado grande para PNG; usa Imprimir / PDF.", "error")));
  }));
  $("csvBtn").addEventListener("click", () => withCropped(() => {
    const m = getMaterials();
    const rows = [["Letra", "Codigo", "Color", "Cuentas usadas", "A comprar", "Gramos aprox", "Paquetes de " + m.pack + " g"]];
    m.rows.forEach((c) => rows.push([c.symbol, c.code, c.name, c.count, c.buy, c.grams.toFixed(2), c.packs]));
    rows.push(["", "", "TOTAL", m.total, m.buy, m.grams.toFixed(2), m.packs]);
    const cell = (v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    download(slug($("projName").value) + "-materiales.csv", new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
  }));
  $("printBtn").addEventListener("click", () => withCropped((p, steps) => {
    const m = getMaterials(), t = P.TECHS[p.tech];
    const img = (region, cell) => {
      const c = document.createElement("canvas");
      P.draw(c, p, exportView({ cell, region, footer: footer() }));
      return "<img src='" + c.toDataURL("image/png") + "'>";
    };
    let h = "<h1>" + esc($("projName").value || "Plantilla") + "</h1><p>" + t.label + " · " + p.W + " × " + p.H + " · " +
      fmt((p.W * p.cellMM[0]) / 10, 1) + " × " + fmt((p.H * p.cellMM[1]) / 10, 1) + " cm · <b>" + fmt(m.total) + " cuentas</b></p>";
    h += "<table><tr><th></th><th>Código</th><th>Color</th><th>Usadas</th><th>Comprar</th><th>Gramos</th><th>Paq. " + m.pack + " g</th></tr>" +
      m.rows.map((k) => "<tr><td>" + swatch(k) + "</td><td>" + esc(k.code) + "</td><td>" + esc(k.name) + "</td><td>" + fmt(k.count) + "</td><td>" + fmt(k.buy) + "</td><td>" + grams(k.grams) + "</td><td>" + k.packs + "</td></tr>").join("") +
      "<tr><th></th><th></th><th>Total</th><th>" + fmt(m.total) + "</th><th>" + fmt(m.buy) + "</th><th>" + fmt(m.grams, 1) + "</th><th>" + m.packs + "</th></tr></table>";
    // Plantillas grandes: se reparten en varias hojas para que se lean
    const tw = 40, th = Math.max(2, Math.floor((tw * p.cellMM[0] * 1.3) / p.cellMM[1] / 2) * 2);
    if (p.W <= tw + 6 && p.H <= th + 6) h += "<div class='pbreak sheet'>" + img(null, 24) + "</div>";
    else {
      const total = Math.ceil(p.W / tw) * Math.ceil(p.H / th);
      h += "<div class='pbreak sheet'><h2>Vista completa</h2>" + img(null, 10) + "</div>";
      let n = 0;
      for (let y0 = 0; y0 < p.H; y0 += th) for (let x0 = 0; x0 < p.W; x0 += tw) {
        const r = { x0, y0, w: Math.min(tw, p.W - x0), h: Math.min(th, p.H - y0) };
        h += "<div class='pbreak sheet'><h2>Hoja " + ++n + " de " + total + " · columnas " + (x0 + 1) + "–" + (x0 + r.w) + "</h2>" + img(r, 24) + "</div>";
      }
    }
    h += "<div class='pbreak'><h2>Instrucciones</h2><ol class='psteps'>" + steps.map((s) => "<li><b>☐ " + s.title + "</b> " + s.arrow + " " + s.dir.toLowerCase() + ": " + esc(runText(s)) + "</li>").join("") + "</ol><p class='foot'>" + esc(footer()) + "</p></div>";
    $("printArea").innerHTML = h;
    const imgs = [...$("printArea").querySelectorAll("img")];
    Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : null))).then(() => window.print());
  }));

  // ---------- Controles ----------
  Object.entries(P.TECHS).forEach(([k, t]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tech"; b.dataset.k = k;
    b.innerHTML = "<b>" + t.label + "</b><span>" + t.desc + "</span>";
    b.addEventListener("click", () => {
      if (k === state.tech) return;
      state.tech = k; $("start").value = t.startDefault; syncControls(); requestRegen();
    });
    $("techs").appendChild(b);
  });
  Object.entries(P.BEADS).forEach(([k, b]) => $("bead").appendChild(new Option(b.label, k)));
  $("start").value = P.TECHS[state.tech].startDefault;

  ["width", "colors", "brightness", "contrast", "saturation"].forEach((id) => {
    // con cambios a mano esperamos a que se suelte el control para preguntar una sola vez
    $(id).addEventListener("input", () => { syncControls(); if (!state.edited) regenSoon(); });
    $(id).addEventListener("change", () => { if (state.edited) requestRegen(); });
  });
  ["bead", "dither", "mirror", "bgColor"].forEach((id) => $(id).addEventListener("change", () => { syncControls(); requestRegen(); }));
  $("start").addEventListener("change", () => {
    if (state.settings) state.settings.start = $("start").value;
    state.step = -1; refresh();
  });
  function setWidthFromCm(cm) {
    if (!(cm > 0)) return;
    const raw = P.widthForCm(cm, state.tech, $("bead").value), min = +$("width").min, max = +$("width").max;
    $("width").value = Math.max(min, Math.min(max, raw));
    if (raw < min || raw > max) notify("Con esta cuenta el ancho posible va de " + fmt(P.cmForWidth(min, state.tech, $("bead").value), 1) + " a " + fmt(P.cmForWidth(max, state.tech, $("bead").value), 1) + " cm.", "warn");
    $("widthCm").blur(); syncControls(); requestRegen();
  }
  $("widthCm").addEventListener("change", () => setWidthFromCm(parseFloat($("widthCm").value)));
  $("preset").addEventListener("change", () => { const v = parseFloat($("preset").value); $("preset").value = ""; setWidthFromCm(v); });
  $("zoom").addEventListener("input", () => setZoom(+$("zoom").value));
  $("zoomIn").addEventListener("click", () => setZoom(+$("zoom").value + 3));
  $("zoomOut").addEventListener("click", () => setZoom(+$("zoom").value - 3));
  $("zoomFit").addEventListener("click", () => { if (state.pat) fitZoom(); });
  $("symbols").addEventListener("change", redraw);
  $("autoBg").addEventListener("change", () => Store.pref.set("tramaly.autobg", $("autoBg").checked));
  ["mExtra", "mPack", "mPrice", "mPerGram"].forEach((id) => $(id).addEventListener("input", () => {
    Store.pref.set(matKey(), materialOptions()); if (state.pat) renderMaterials();
  }));

  $("dockSet").addEventListener("click", () => goTo(document.querySelector(".panel")));
  const needPattern = (el) => { if (state.pat) goTo(el); else { notify("Primero sube una imagen.", "warn"); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  $("dockChart").addEventListener("click", () => needPattern($("chartCard")));
  $("dockMat").addEventListener("click", () => needPattern($("matCard")));
  $("dockSteps").addEventListener("click", () => needPattern($("guideCard")));

  // ---------- Sesión ----------
  async function showApp(s) {
    $("login").hidden = true; $("app").hidden = false; $("dock").hidden = false;
    $("whoName").textContent = s.name;
    state.user = s;
    Palette.load(s.user, paletteChanged);
    fillBgColors(); loadMaterialPrefs();
    $("autoBg").checked = Store.pref.get("tramaly.autobg", true);
    syncControls();
    try {
      const last = Store.pref.get("tramaly.last." + s.user, null);
      if (last && !state.master && (await openProject(last))) notify("Recuperé tu último trabajo: “" + $("projName").value + "”.", "ok");
    } catch (err) { console.error(err); }
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
  $("logoutBtn").addEventListener("click", async () => { if (saveTimer) await save(); Auth.logout(); location.reload(); });
  // cierre automático al expirar la sesión (el trabajo queda guardado)
  setInterval(async () => { if (!$("app").hidden && !Auth.session()) { if (saveTimer) await save(); location.reload(); } }, 30000);

  Background.init({ notify, onChange: requestRegen });
  const session = Auth.session();
  if (session) showApp(session);
})();
