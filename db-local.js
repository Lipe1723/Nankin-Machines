// db-local.js — Camada offline-first para Nankin Machines
// Guarda copia local (IndexedDB) de tudo + fila de acoes pendentes para sincronizar com Supabase.
// Uso unico-usuario: nao trata conflito de edicao simultanea por design.

var NankinDB = (function () {
  var DB_NAME = 'nankin_local';
  var DB_VERSION = 1;
  var STORES = ['machines', 'fotos', 'pecas', 'pdfs', 'saidas', '_pending'];
  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            var store = db.createObjectStore(name, { keyPath: 'id' });
            if (name !== '_pending') {
              store.createIndex('machine_id', 'machine_id', { unique: false });
            }
          }
        });
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(store, mode) {
    return open().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }

  // ---- CRUD local basico ----

  function getAll(store) {
    return tx(store, 'readonly').then(function (os) {
      return new Promise(function (resolve, reject) {
        var req = os.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getByMachine(store, machineId) {
    return tx(store, 'readonly').then(function (os) {
      return new Promise(function (resolve, reject) {
        var idx = os.index('machine_id');
        var req = idx.getAll(machineId);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function put(store, obj) {
    return tx(store, 'readwrite').then(function (os) {
      return new Promise(function (resolve, reject) {
        var req = os.put(obj);
        req.onsuccess = function () { resolve(obj); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function putMany(store, list) {
    return tx(store, 'readwrite').then(function (os) {
      return new Promise(function (resolve, reject) {
        list.forEach(function (item) { os.put(item); });
        os.transaction.oncomplete = function () { resolve(); };
        os.transaction.onerror = function (e) { reject(e); };
      });
    });
  }

  function remove(store, id) {
    return tx(store, 'readwrite').then(function (os) {
      return new Promise(function (resolve, reject) {
        var req = os.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clearStore(store) {
    return tx(store, 'readwrite').then(function (os) {
      return new Promise(function (resolve, reject) {
        var req = os.clear();
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // ---- Fila de sincronizacao ----
  // Cada item pendente: { id, store, op: 'insert'|'update'|'delete', payload, created_at }

  function queueAdd(item) {
    item.id = item.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 9));
    item.created_at = item.created_at || new Date().toISOString();
    return put('_pending', item).then(function () { return item; });
  }

  function queueAll() {
    return getAll('_pending');
  }

  function queueRemove(id) {
    return remove('_pending', id);
  }

  function queueCount() {
    return queueAll().then(function (list) { return list.length; });
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  return {
    open: open,
    getAll: getAll,
    getByMachine: getByMachine,
    put: put,
    putMany: putMany,
    remove: remove,
    clearStore: clearStore,
    queueAdd: queueAdd,
    queueAll: queueAll,
    queueRemove: queueRemove,
    queueCount: queueCount,
    uuid: uuid
  };
})();
