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
  ["bead", "dither", "start"].forEach((id) => $(id).addEventListener("change", regen));
  $("symbols").addEventListener("change", redraw);

  // ---------- Imagen ----------
  function loadImage(src, name) {
    const img = new Image();
    img.onload = () => { state.img = img; state.name = name; state.step = -1; state.highlight = null; regen(); };
    img.onerror = () => alert("No se pudo leer esa imagen.");
    img.src = src;
  }
  function handleFile(f) {
    if (!f || !f.type.startsWith("image/")) return;
    const url = URL.createObjectURL(f);
    loadImage(url, f.name);
  }
  $("file").addEventListener("change", (e) => handleFile(e.target.files[0]));
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

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
      maxColors: +$("colors").value, dither: $("dither").checked,
      brightness: +$("brightness").value, contrast: +$("contrast").value, saturation: +$("saturation").value,
      palette: window.MIYUKI_PALETTE,
    };
  }
  function regen() {
    if (!state.img) return;
    state.pat = P.generate(opts());
    state.steps = P.buildSteps(state.pat, $("start").value);
    state.step = -1; state.highlight = null;
    $("empty").hidden = true; $("result").hidden = false;
    renderSummary(); renderLegend(); renderSteps(); redraw();
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
