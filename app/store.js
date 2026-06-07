// Storage layer: server-backed (Neon via /api) when online, localStorage when not.
//
// The app was written against localStorage (a key -> JSON store). This shim keeps
// that exact contract but, once boot() has hydrated from /api/bootstrap, reads come
// from an in-memory cache and writes are mirrored to the database via /api/state.
// If the API is unavailable (e.g. local file serving, or before the DB is seeded)
// it transparently falls back to localStorage — the original offline behaviour.
(function () {
  var MEM = {};        // hydrated server cache (online mode)
  var ONLINE = false;

  // Store key -> localStorage key used in offline mode (matches the original app).
  var LS_KEY = {
    users:         'gwl_users',
    entries:       'gwl_entries',
    daily:         'gwl_daily',
    daily_targets: 'gwl_daily_targets'
  };

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  window.__Store = {
    // Called by boot() after fetching /api/bootstrap.
    setOnline: function (state, hydrated) {
      ONLINE = !!state;
      if (hydrated) MEM = hydrated;
    },
    isOnline: function () { return ONLINE; },

    get: function (key, dflt) {
      if (ONLINE) {
        return (key in MEM && MEM[key] != null) ? clone(MEM[key]) : dflt;
      }
      try {
        var raw = localStorage.getItem(LS_KEY[key] || key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (e) { return dflt; }
    },

    set: function (key, value) {
      if (ONLINE) {
        MEM[key] = clone(value);                 // update cache synchronously
        try {
          fetch('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, value: value })
          }).catch(function () { /* cache already updated; persists on next write */ });
        } catch (e) { /* ignore */ }
      } else {
        try { localStorage.setItem(LS_KEY[key] || key, JSON.stringify(value)); } catch (e) {}
      }
    }
  };
})();
