/* ==========================================================
   app.js — 路由 / 顶栏 / 全局状态
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  App.state = App.state || {};

  var ORDER = ['dashboard', 'classes', 'students', 'timetable', 'prep', 'analytics', 'communication', 'formulas', 'settings'];

  function currentId() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ORDER.indexOf(h) >= 0 ? h : 'dashboard';
  }

  App.go = function (id) {
    if (location.hash === '#/' + id) App.render();
    else location.hash = '#/' + id;
  };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function renderTopbar() {
    var db = App.store.db, U = App.util;
    document.getElementById('sideUserName').textContent = db.meta.teacher || 'Stella';
    document.getElementById('sideUserRole').textContent = db.meta.role || '数学老师';
    var sel = document.getElementById('globalClassSelect');
    sel.innerHTML = db.classes.map(function (c) {
      return '<option value="' + c.id + '">' + U.esc(c.name) + '</option>';
    }).join('') || '<option value="">暂无班级</option>';
    sel.value = db.meta.currentClassId || (db.classes[0] ? db.classes[0].id : '');
    var d = new Date();
    document.getElementById('dateChip').textContent =
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' +
      ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];

    if (App.sync) App.sync.applyToDom();
  }

  function render() {
    var id = currentId();
    var page = App.pages[id] || App.pages.dashboard;
    document.getElementById('pageTitle').textContent = page.title;
    document.getElementById('pageSub').textContent = page.sub || '';

    document.querySelectorAll('.nav-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.page === id);
    });

    var view = document.getElementById('view');
    view.innerHTML = '';
    try {
      page.render(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="card"><div class="empty">这个页面渲染时出错了：' +
        (err && err.message ? err.message : '未知错误') +
        '<br><span class="tiny">可以刷新页面重试，或到「设置」导出备份后反馈</span></div></div>';
    }
    renderTopbar();
  }

  App.render = render;
  App.refreshTopbar = renderTopbar;

  window.addEventListener('hashchange', function () {
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('DOMContentLoaded', function () {
    /* 本地够放时直出；localStorage 只存了「无图版」时，先把 IndexedDB 里的图片接回来再渲染 */
    var started = false;
    function boot() {
      if (started) return;
      started = true;
      start();
    }
    var hp = App.store.hydrate ? App.store.hydrate() : Promise.resolve(false);
    var guard = setTimeout(boot, 900);            // IndexedDB 卡住也不至于白屏
    hp.then(function () { clearTimeout(guard); boot(); })
      ['catch'](function () { clearTimeout(guard); boot(); });
  });

  function start() {
    var db = App.store.db;
    if (!db.meta.currentClassId && db.classes[0]) {
      db.meta.currentClassId = db.classes[0].id;
      App.store.save();
    }
    var sel = document.getElementById('globalClassSelect');
    sel.addEventListener('change', function () {
      db.meta.currentClassId = sel.value;
      App.store.save();
      if (App.state.analytics) {
        App.state.analytics.classId = sel.value;
        App.state.analytics.studentId = null;
        App.state.analytics.examId = null;
        App.state.analytics.paperDraft = null;
        App.state.analytics.summaryDraft = null;
      }
      if (App.state.comm) {
        var first = App.util.studentsOf(sel.value)[0];
        if (first) App.state.comm.studentId = first.id;
      }
      render();
    });
    if (!location.hash) location.hash = '#/dashboard';
    render();

    /* 顶栏同步标识 → 去设置页 */
    var chip = document.getElementById('syncChip');
    if (chip) chip.onclick = function () { App.go('settings'); };

    /* localStorage 被清空/换浏览器配置时，从 IndexedDB 找回上一份数据 */
    if (App.store.recoverFromCache) {
      App.store.recoverFromCache().then(function (restored) {
        if (restored) {
          App.state = {};
          render();
          App.ui.toast('已从本机缓存（IndexedDB）恢复上次的数据', 'ok', 3600);
        }
        if (App.sync) App.sync.init();
      });
    } else if (App.sync) {
      App.sync.init();
    }

    /* 页面隐藏/关闭前把待写缓存刷进 IndexedDB，保证「关掉再打开」不丢 */
    window.addEventListener('pagehide', function () {
      if (App.store.flush) App.store.flush();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && App.store.flush) App.store.flush();
    });
  }
})();
