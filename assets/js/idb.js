/* ==========================================================
   idb.js — IndexedDB 冗余缓存
   作用：localStorage 的「第二份」。localStorage 可能被清站点数据、
        容量不足（图片多）或写入失败，IndexedDB 体积上限大得多，
        关闭浏览器后再打开、甚至 localStorage 被清空时都能恢复。
   存储：db「stella_wb」/ 表「kv」/ 键「db」→ { at, data(JSON 字符串) }
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var DB_NAME = 'stella_wb';
  var STORE = 'kv';
  var VERSION = 1;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('当前浏览器不支持 IndexedDB')); return; }
      var r;
      try { r = indexedDB.open(DB_NAME, VERSION); }
      catch (e) { reject(e); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('IndexedDB 打开失败')); };
      r.onblocked = function () { reject(new Error('IndexedDB 被其他标签页占用')); };
    });
    return dbp;
  }

  function store(mode) {
    return open().then(function (d) {
      return d.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function wrap(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  App.idb = {
    available: function () { return !!window.indexedDB; },
    get: function (k) {
      return store('readonly').then(function (s) { return wrap(s.get(k)); })
        .then(function (v) { return v == null ? null : v; });
    },
    set: function (k, v) {
      return store('readwrite').then(function (s) { return wrap(s.put(v, k)); });
    },
    del: function (k) {
      return store('readwrite').then(function (s) { return wrap(s.delete(k)); });
    },
    keys: function () {
      return store('readonly').then(function (s) { return wrap(s.getAllKeys()); });
    },
    /* 估算是否可用（用于设置页显示） */
    ping: function () {
      var t = Date.now();
      return this.set('__ping', { at: t }).then(function () { return true; })['catch'](function () { return false; });
    }
  };
})();
