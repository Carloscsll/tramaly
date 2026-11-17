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
    state.user = s;
  }
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
      state.img = img; state.name = name; state.step = -1; state.highlight = null;
      if (regen()) {
        const small = img.naturalWidth < +$("width").value * 4;
        if (small) notify("Imagen cargada, pero es pequeña (" + img.naturalWidth + "×" + img.naturalHeight + " px): el resultado puede verse borroso. Mejor usa una más grande y nítida.", "warn");
        else notify("Imagen cargada: " + name, "ok");
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

  // ---------- Generar / dibujar ----------
  function opts() {
    return {
      img: state.img, width: +$("width").value, tech: state.tech, bead: $("bead").value,
      maxColors: +$("colors").value, dither: $("dither").checked, mirror: $("mirror").checked,
      brightness: +$("brightness").value, contrast: +$("contrast").value, saturation: +$("saturation").value,
      palette: window.MIYUKI_PALETTE,
    };
  }
  function progressKey() {
    return "tramaly.progress|" + [state.name, $("width").value, $("colors").value, state.tech, $("start").value, $("bead").value, $("dither").checked, $("mirror").checked, $("brightness").value, $("contrast").value, $("saturation").value].join("|");
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
    const total = state.pat.grid.length;
    if (total > 15000) notify("Plantilla grande (" + total.toLocaleString() + " cuentas): son muchas horas de trabajo. Puedes bajar el ancho para hacerla más corta.", "warn");
    else if (state.pat.colors.length < +$("colors").value && state.pat.colors.length <= 3) notify("La imagen quedó con solo " + state.pat.colors.length + " colores; sube el contraste o la saturación si esperabas más.", "warn");
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
    const total = p.grid.length;
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

  function runChips(step) {
    const box = document.createElement("div");
    box.className = "runs";
    step.runs.forEach((r) => {
      const c = state.pat.colors[r.c];
      const s = document.createElement("span");
      s.className = "run";
      s.innerHTML = '<span class="sw" style="background:' + c.hex + ";color:" + c.text + '">' + c.symbol + "</span>" + r.n + " × " + c.code;
      box.appendChild(s);
    });
    return box;
  }
  function runText(step) {
    return step.runs.map((r) => r.n + "×" + state.pat.colors[r.c].code).join(", ");
  }

  function renderSteps() {
    const ol = $("stepList"); ol.innerHTML = "";
    state.steps.forEach((s, i) => {
      const li = document.createElement("li");
      li.textContent = s.title + " (" + s.dir + "): " + runText(s);
      li.addEventListener("click", () => { go(i); window.scrollTo({ top: $("trkTitle").getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); });
      ol.appendChild(li);
    });
    renderTracker();
  }

  function renderTracker() {
    const s = state.steps[state.step];
    if (!s) {
      $("trkTitle").textContent = "Listo para empezar";
      $("trkDir").textContent = state.steps.length + " pasos · pulsa › para ver el primero";
      $("trkRuns").innerHTML = ""; $("trkNote").textContent = "";
    } else {
      $("trkTitle").textContent = s.title + "  ·  paso " + (state.step + 1) + "/" + state.steps.length;
      $("trkDir").textContent = "Sentido: " + s.dir + " · " + s.seq.length + " cuentas";
      const box = runChips(s); $("trkRuns").replaceChildren(...box.childNodes);
      $("trkNote").textContent = s.note || "";
    }
    $("prevStep").disabled = state.step <= -1;
    $("nextStep").disabled = state.step >= state.steps.length - 1;
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
