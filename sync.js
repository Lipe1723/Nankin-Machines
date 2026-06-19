// sync.js — Sincroniza a fila local com o Supabase quando ha conexao.
// Trabalha junto com db-local.js. Disparado em: carregar app, voltar a ficar online, a cada 30s se houver fila.

var NankinSync = (function () {
  var db = null; // setado via init(supabaseClient)
  var syncing = false;
  var listeners = [];

  function init(supabaseClient) {
    db = supabaseClient;
  }

  function onStatusChange(fn) {
    listeners.push(fn);
  }

  function notify(status) {
    listeners.forEach(function (fn) { try { fn(status); } catch (e) {} });
  }

  function isOnline() {
    return navigator.onLine;
  }

  // Tenta uma operacao no Supabase; se falhar por rede, enfileira local.
  // table: nome da tabela. op: 'insert'|'update'|'delete'. payload: dados. matchId: id para update/delete.
  function write(table, op, payload, matchId) {
    if (!isOnline()) {
      return NankinDB.queueAdd({ store: table, op: op, payload: payload, match_id: matchId })
        .then(function () { notify('queued'); return { offline: true, data: payload }; });
    }
    var p;
    if (op === 'insert') {
      p = db.from(table).insert(payload).select().single();
    } else if (op === 'update') {
      p = db.from(table).update(payload).eq('id', matchId).select().single();
    } else if (op === 'delete') {
      p = db.from(table).delete().eq('id', matchId);
    }
    return p.then(function (res) {
      if (res.error) throw res.error;
      return { offline: false, data: res.data };
    }).catch(function (err) {
      // Falhou (provavelmente rede caiu no meio) -> enfileira
      return NankinDB.queueAdd({ store: table, op: op, payload: payload, match_id: matchId })
        .then(function () { notify('queued'); return { offline: true, data: payload, error: err }; });
    });
  }

  function processQueue() {
    if (syncing || !isOnline()) return Promise.resolve({ synced: 0 });
    syncing = true;
    notify('syncing');
    return NankinDB.queueAll().then(function (items) {
      if (!items.length) { syncing = false; notify('idle'); return { synced: 0 }; }
      var chain = Promise.resolve();
      var synced = 0;
      var failed = 0;
      items.sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
      items.forEach(function (item) {
        chain = chain.then(function () {
          var p;
          if (item.op === 'insert') p = db.from(item.store).insert(item.payload);
          else if (item.op === 'update') p = db.from(item.store).update(item.payload).eq('id', item.match_id);
          else if (item.op === 'delete') p = db.from(item.store).delete().eq('id', item.match_id);
          else return;
          return p.then(function (res) {
            if (res.error) { failed++; return; }
            synced++;
            return NankinDB.queueRemove(item.id);
          }).catch(function () { failed++; });
        });
      });
      return chain.then(function () {
        syncing = false;
        notify(failed ? 'partial' : 'idle');
        return { synced: synced, failed: failed };
      });
    });
  }

  // Baixa tudo do Supabase e guarda local (chamado quando online, para manter cache atualizado)
  function refreshLocalCache() {
    if (!isOnline()) return Promise.resolve();
    var tables = ['machines', 'fotos', 'pecas', 'pdfs', 'saidas'];
    return Promise.all(tables.map(function (t) {
      return db.from(t).select('*').then(function (res) {
        if (res.data) return NankinDB.putMany(t, res.data);
      }).catch(function () {});
    }));
  }

  window.addEventListener('online', function () {
    notify('online');
    processQueue().then(refreshLocalCache);
  });
  window.addEventListener('offline', function () {
    notify('offline');
  });

  return {
    init: init,
    write: write,
    processQueue: processQueue,
    refreshLocalCache: refreshLocalCache,
    isOnline: isOnline,
    onStatusChange: onStatusChange
  };
})();
