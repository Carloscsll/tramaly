/*
 * Login básico del lado del cliente (sitio estático).
 * - Contraseñas guardadas como hash PBKDF2-SHA256 (nunca en texto plano).
 * - Sesión que caduca (8 h) y licencia con fecha de expiración por usuario.
 * - Bloqueo temporal tras varios intentos fallidos.
 * - Marca de agua con el nombre de la usuaria en PNG e impresiones.
 * Límite: al ser estático, esto disuade el uso casual, no frena a alguien técnico.
 */
(function () {
  "use strict";
  const KEY = "miyuki.session";
  const FAIL = "miyuki.fails";
  const TTL = 8 * 3600 * 1000;

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

  async function derive(password, saltHex) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: 150000 }, key, 256);
    return hex(bits);
  }

  function getFails() {
    try { return JSON.parse(localStorage.getItem(FAIL)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; }
  }
  function setFails(v) { try { localStorage.setItem(FAIL, JSON.stringify(v)); } catch {} }

  async function login(user, password) {
    if (!(window.crypto && crypto.subtle)) return { ok: false, msg: "Abre la app desde https o localhost." };
    const f = getFails();
    if (Date.now() < f.until) {
      return { ok: false, msg: "Demasiados intentos. Espera " + Math.ceil((f.until - Date.now()) / 1000) + " s." };
    }
    const u = (window.MIYUKI_USERS || []).find((x) => x.user === String(user).trim().toLowerCase());
    let ok = false;
    if (u) ok = (await derive(password, u.salt)) === u.hash;
    else await derive(password, "00".repeat(16)); // tiempo similar si el usuario no existe
    if (!ok) {
      const n = f.n + 1;
      setFails({ n, until: n >= 5 ? Date.now() + 30000 : 0 });
      return { ok: false, msg: "Usuario o contraseña incorrectos." };
    }
    if (u.expires && new Date(u.expires + "T23:59:59") < new Date()) {
      return { ok: false, msg: "Tu licencia expiró. Contacta a quien te la entregó." };
    }
    setFails({ n: 0, until: 0 });
    const s = { user: u.user, name: u.name, exp: Date.now() + TTL };
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch {}
    return { ok: true, session: s };
  }

  function session() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY));
      if (s && s.exp > Date.now()) return s;
    } catch {}
    return null;
  }
  function logout() { try { sessionStorage.removeItem(KEY); } catch {} }

  window.Auth = { login, session, logout };
})();
