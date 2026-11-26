/* "Mis colores": la usuaria pone sus códigos, nombres y marca los que tiene. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const HEX = /^#[0-9a-f]{6}$/i;
  let key = "", list = [], onChange = () => {};

  const base = () => window.MIYUKI_PALETTE.map((p) => ({ id: p[0], code: p[0], name: p[1], hex: p[2], on: true, custom: false }));

  function load(user, changed) {
    key = "tramaly.colors." + user;
    onChange = changed || onChange;
    const saved = Store.pref.get(key, null);
    list = base();
    if (Array.isArray(saved)) {
      const valid = saved.filter((c) => c && typeof c.id === "string" && HEX.test(c.hex));
      const ids = new Set(valid.map((c) => c.id));
      list = valid.concat(list.filter((c) => !ids.has(c.id)));
    }
  }
  const save = () => Store.pref.set(key, list);
  const active = () => list.filter((c) => c.on);
  const byId = (id) => list.find((c) => c.id === id);

  function row(c) {
    const r = document.createElement("div");
    r.className = "crow";
    const mk = (type, value, label) => {
      const i = document.createElement("input");
      i.type = type; i.setAttribute("aria-label", label);
      if (type === "checkbox") i.checked = value; else i.value = value;
      return i;
    };
    const on = mk("checkbox", c.on, "Tengo este color " + c.code);
    const hex = mk("color", c.hex, "Color en pantalla de " + c.code);
    const code = mk("text", c.code, "Código");
    const name = mk("text", c.name, "Nombre");
    code.className = "ccode";
    on.onchange = () => {
      if (!on.checked && active().length <= 2) { on.checked = true; status("Deja al menos 2 colores activos."); return; }
      c.on = on.checked; save(); onChange("set");
    };
    hex.onchange = () => { c.hex = hex.value; save(); onChange("edit"); };
    code.onchange = () => { c.code = code.value.trim() || c.id; code.value = c.code; save(); onChange("edit"); };
    name.onchange = () => { c.name = name.value.trim() || c.code; name.value = c.name; save(); onChange("edit"); };
    r.append(on, hex, code, name);
    if (c.custom) {
      const del = document.createElement("button");
      del.type = "button"; del.className = "btn small"; del.textContent = "×"; del.setAttribute("aria-label", "Eliminar " + c.code);
      del.onclick = () => {
        if (c.on && active().length <= 2) { status("Deja al menos 2 colores activos."); return; }
        list = list.filter((x) => x !== c); save(); render(); onChange("set");
      };
      r.append(del);
    }
    return r;
  }
  function render() { $("colorList").replaceChildren(...list.map(row)); }
  function status(t) { $("colorStatus").textContent = t; }
  const newId = () => "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function importText(text) {
    let added = 0, updated = 0, bad = 0;
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const parts = line.split(/[;,\t]/).map((s) => s.trim());
      const code = parts[0], hex = parts.find((p) => HEX.test(p));
      const name = parts.slice(1).find((p) => p && !HEX.test(p)) || code;
      const found = list.find((c) => c.code.toLowerCase() === String(code).toLowerCase());
      if (found) { found.name = name === code ? found.name : name; if (hex) found.hex = hex.toLowerCase(); found.on = true; updated++; }
      else if (code && hex) { list.unshift({ id: newId(), code, name, hex: hex.toLowerCase(), on: true, custom: true }); added++; }
      else bad++;
    });
    return { added, updated, bad };
  }

  function wire() {
    $("colorAdd").onclick = () => {
      list.unshift({ id: newId(), code: "NUEVO", name: "Color nuevo", hex: "#888888", on: true, custom: true });
      save(); render(); onChange("set"); status("Color agregado arriba: escribe su código y elige su tono.");
    };
    $("colorImport").onclick = () => {
      const r = importText($("colorText").value);
      save(); render(); onChange("set");
      status("Agregados: " + r.added + " · actualizados: " + r.updated + (r.bad ? " · líneas sin código y #color: " + r.bad : ""));
      if (!r.bad) $("colorText").value = "";
    };
    $("colorOnlyMine").onclick = () => {
      if (list.filter((c) => c.custom).length < 2) { status("Primero agrega al menos 2 colores propios."); return; }
      list.forEach((c) => (c.on = c.custom)); save(); render(); onChange("set"); status("Solo quedan activos tus colores.");
    };
    $("colorReset").onclick = () => {
      if (!confirm("¿Volver a la lista de colores original? Se borran tus cambios y colores agregados.")) return;
      list = base(); save(); render(); onChange("set"); status("Lista restablecida.");
    };
    $("colorClose").onclick = () => $("colorsDlg").close();
  }
  function openDialog() { render(); status(""); $("colorsDlg").showModal(); }

  wire();
  window.Palette = { load, active, byId, openDialog, importText, all: () => list };
})();
