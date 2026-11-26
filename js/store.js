/* Almacenamiento en el dispositivo: proyectos en IndexedDB, preferencias en localStorage. */
(function () {
  "use strict";
  let dbp = null;
  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open("tramaly", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("projects", { keyPath: "id" });
          r.result.createObjectStore("images", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    }));
  }
  window.Store = {
    put: (s, v) => tx(s, "readwrite", (o) => o.put(v)),
    get: (s, k) => tx(s, "readonly", (o) => o.get(k)),
    all: (s) => tx(s, "readonly", (o) => o.getAll()),
    del: (s, k) => tx(s, "readwrite", (o) => o.delete(k)),
    pref: {
      get(k, def) {
        try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; }
      },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    },
  };
})();
