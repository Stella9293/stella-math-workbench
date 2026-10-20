/* ==========================================================
   page-dashboard.js — 工作台
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  function statCard(kind, ico, label, value, unit, desc) {
    return '<div class="stat ' + kind + '">' +
      '<div class="ico">' + ico + '</div>' +
      '<div class="k">' + label + '</div>' +
      '<div class="v">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      '<div class="d">' + desc + '</div></div>';
  }

  App.pages.dashboard = {
    title: '工作台',
    sub: '让每一节课都有迹可循',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var today = new Date();
      var wd = today.getDay();
      var dayIdx = wd === 0 ? 7 : wd;
      var thisWeek = U.thisWeek();

      /* 今日课程：来自整学期固定的上课时段，内容按本周取 */
      var todays = [];
      db.classes.forEach(function (c) {
        (db.slots[c.id] || []).forEach(function (k) {
          if (U.dayIndex(k) !== dayIdx) return;
          var e = db.entries.filter(function (x) {
            return x.classId === c.id && x.key === k && x.week === thisWeek;
          })[0];
          todays.push({ cls: c, key: k, content: e ? e.content : '' });
        });
      });
      todays.sort(function (a, b) {
        return a.key.localeCompare(b.key, 'en', { numeric: true }) || a.cls.name.localeCompare(b.cls.name);
      });

      var undone = db.tasks.filter(function (t) { return !t.done; }).length;
      var weekSlots = 0;
      db.classes.forEach(function (c) { weekSlots += (db.slots[c.id] || []).length; });
      var weekLessons = db.entries.filter(function (e) { return !!e.content && e.week === thisWeek; }).length;
      var latest = U.latestExam(db.meta.currentClassId);

      var html = '';
      html += '<div class="grid g-4 mb16">';
      html += statCard('accent', '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.4"/></svg>',
        '班级总数', db.classes.length, ' 个', '共 ' + db.students.length + ' 名学生');
      html += statCard('mint', '<svg viewBox="0 0 24 24"><path d="M4 19V5m0 0h11l-2 3 2 3H4"/></svg>',
        '本周课时', weekSlots, ' 节', weekSlots ? '已录入内容 ' + weekLessons + ' 节' : '还没设置上课时段');
      html += statCard('peach', '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
        '待办事项', undone, ' 项', undone ? '记得今天完成' : '全部完成，很棒');
      html += statCard('rose', '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
        '最近测验均分', latest ? U.examAvg(latest) : '—', latest ? ' / ' + latest.full : '',
        latest ? latest.name : '暂无测验记录');
      html += '</div>';

      html += '<div class="grid g-2-1">';

      /* 今日课表 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>今日课表</h3>' +
        '<span class="sub">' + U.dateLabel(U.todayISO()) + ' ' + U.weekdayLabel(U.todayISO()) + ' · ' + U.weekNoLabel(thisWeek) + '</span></div>';
      if (!todays.length) {
        html += '<div class="empty"><span class="ico">☁️</span>今天没有排课，好好休息一下<br>' +
          '<span class="tiny">排课时间整学期固定，可在「教学课表」里设置</span></div>';
      } else {
        todays.forEach(function (t) {
          var c = t.cls;
          html += '<div class="schedule-item">' +
            '<div class="sch-bar" style="background:' + (c ? c.color : '#ccc') + '"></div>' +
            '<div class="sch-time"><strong>' + U.periodTime(t.key).split(' - ')[0] + '</strong><span>' + U.periodName(t.key) + '</span></div>' +
            '<div class="sch-body">' +
            (t.content
              ? '<strong>' + U.esc(t.content) + '</strong>'
              : '<strong class="muted">待填写授课内容</strong>') +
            '<div class="meta">' + U.esc(c ? c.name : '未分班') + ' · ' + U.periodTime(t.key) + '</div></div>' +
            '<button class="btn sm" data-goto="analytics" data-cid="' + c.id + '">学情</button>' +
            '</div>';
        });
      }
      html += '</div>';

      /* 待办 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>待办任务</h3>' +
        '<span class="sub">' + undone + ' 项未完成</span></div>';
      html += '<div class="row" style="gap:8px;margin-bottom:10px">' +
        '<input class="input" id="todoInput" placeholder="添加一条待办，回车即可…" style="height:34px">' +
        '<button class="btn primary" id="todoAdd" style="flex:0 0 auto">添加</button></div>';
      html += '<div class="todo-list">';
      if (!db.tasks.length) html += '<div class="empty" style="padding:22px">还没有待办，先加一条吧</div>';
      db.tasks.slice().sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); }).forEach(function (t) {
        html += '<div class="todo ' + (t.done ? 'done' : '') + '">' +
          '<input type="checkbox" data-todo="' + t.id + '" ' + (t.done ? 'checked' : '') + '>' +
          '<div class="txt">' + U.esc(t.text) + '</div>' +
          '<button class="icon-btn del" data-deltodo="' + t.id + '">✕</button></div>';
      });
      html += '</div></div>';
      html += '</div>';

      /* 底部 */
      html += '<div class="grid g-1-2 mt16">';

      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>班级速览</h3>' +
        '<a class="link-btn" href="#/classes">全部班级 →</a></div>';
      db.classes.forEach(function (c) {
        var n = U.studentsOf(c.id).length;
        var avg = U.classAvg(c.id);
        html += '<div class="row between" style="padding:8px 0;border-bottom:1px dashed var(--line)">' +
          '<div class="row" style="gap:8px;min-width:0"><span class="dot" style="background:' + c.color + '"></span>' +
          '<span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(c.name) + '</span></div>' +
          '<div class="row" style="gap:10px"><span class="tiny muted">' + n + ' 人</span>' +
          '<span class="badge">' + (avg == null ? '暂无成绩' : avg + ' 分') + '</span></div></div>';
      });
      html += '</div>';

      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>最近测验</h3>' +
        '<a class="link-btn" href="#/analytics">学情分析 →</a></div>';
      var recent = db.exams.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 4);
      if (!recent.length) {
        html += '<div class="empty">还没有测验记录，去「学情分析 · 测验成绩」导入一次吧</div>';
      } else {
        html += '<div class="table-wrap"><table class="tb"><thead><tr><th>测验</th><th>班级</th><th>日期</th><th class="right">均分</th></tr></thead><tbody>';
        recent.forEach(function (e) {
          var c = U.cls(e.classId);
          html += '<tr><td>' + U.esc(e.name) + '</td>' +
            '<td><span class="badge gray">' + U.esc(c ? c.name.split(' · ')[0] : '—') + '</span></td>' +
            '<td class="muted">' + U.dateLabel(e.date) + '</td>' +
            '<td class="right strong num">' + (U.examAvg(e) == null ? '—' : U.examAvg(e)) + ' <span class="tiny muted">/ ' + e.full + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
      }
      html += '</div></div>';

      el.innerHTML = html;

      /* ---- 事件 ---- */
      var input = el.querySelector('#todoInput');
      function addTodo() {
        var v = input.value.trim();
        if (!v) return;
        db.tasks.unshift({ id: 'tk_' + Date.now().toString(36), text: v, done: false, createdAt: U.todayISO() });
        App.store.save();
        App.render();
      }
      el.querySelector('#todoAdd').onclick = addTodo;
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTodo(); });

      el.querySelectorAll('[data-todo]').forEach(function (cb) {
        cb.onchange = function () {
          var t = db.tasks.filter(function (x) { return x.id === cb.dataset.todo; })[0];
          if (t) { t.done = cb.checked; App.store.save(); App.render(); }
        };
      });
      el.querySelectorAll('[data-deltodo]').forEach(function (b) {
        b.onclick = function () {
          db.tasks = db.tasks.filter(function (x) { return x.id !== b.dataset.deltodo; });
          App.store.save(); App.render();
        };
      });
      el.querySelectorAll('[data-goto]').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.cid) {
            db.meta.currentClassId = b.dataset.cid;
            App.store.save();
            if (App.state.analytics) { App.state.analytics.classId = b.dataset.cid; App.state.analytics.studentId = null; }
          }
          App.go(b.dataset.goto);
        };
      });
    }
  };
})();
