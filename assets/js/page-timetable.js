/* ==========================================================
   page-timetable.js — 教学课表
   上课时段：整学期固定，只需设置一次
   课时内容：按周（周一为起点）分别保存，每周导入即可
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  function slotSort(a, b) {
    return a.localeCompare(b, 'en', { numeric: true });
  }
  function keyOf(day, pIdx) { return day + '-p' + (pIdx + 1); }

  /* 某班每周固定的上课时段（key 列表，已按时间排序） */
  function slotsOf(classId) {
    return (App.store.db.slots[classId] || []).slice().sort(slotSort);
  }

  function entryOf(classId, key, week) {
    return App.store.db.entries.filter(function (e) {
      return e.classId === classId && e.key === key && e.week === week;
    })[0] || null;
  }
  function upsertEntry(classId, key, content, week) {
    var db = App.store.db;
    var e = entryOf(classId, key, week);
    if (!content) {
      if (e) db.entries = db.entries.filter(function (x) { return x !== e; });
      return;
    }
    if (e) e.content = content;
    else db.entries.push({
      id: 'ent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      classId: classId, key: key, week: week, content: content
    });
  }

  /* 「周一 第1、3节 · 周三 第2、4节」 */
  function describeSlots(keys) {
    var U = App.util;
    if (!keys.length) return '';
    var byDay = {};
    keys.forEach(function (k) {
      var d = U.dayIndex(k);
      (byDay[d] = byDay[d] || []).push(parseInt(String(k).split('-p')[1], 10));
    });
    return Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }).map(function (d) {
      return U.DAYS[d - 1] + ' ' + byDay[d].sort(function (a, b) { return a - b; }).map(function (n) { return '第' + n + '节'; }).join('、');
    }).join(' · ');
  }

  function editCell(classId, key, week) {
    var U = App.util;
    var e = entryOf(classId, key, week);
    App.ui.prompt({
      title: U.DAYS[U.dayIndex(key) - 1] + ' · ' + U.periodName(key) + ' · ' + U.clsName(classId),
      label: '本节授课内容',
      value: e ? e.content : '',
      placeholder: '例如：二次函数与判别式综合题',
      hint: U.weekName(week) ? U.weekName(week) + '（' + U.weekLabel(week) + '）· 留空并保存可清空该节课' : U.weekLabel(week) + ' 这一周 · 留空并保存可清空该节课'
    }).then(function (v) {
      if (v === null) return;
      upsertEntry(classId, key, v, week);
      App.store.save(); App.render();
    });
  }

  /* ---------------- 节次设置 ---------------- */
  function periodSettings() {
    var db = App.store.db, U = App.util;
    function rowHTML(p, i) {
      return '<div class="row" style="gap:6px;margin-bottom:6px" data-prow="' + i + '">' +
        '<input class="input" data-f="name" value="' + U.esc(p.name) + '" style="flex:1.1" placeholder="第 n 节">' +
        '<input class="input" data-f="start" value="' + U.esc(p.start) + '" style="flex:.7" placeholder="08:00">' +
        '<input class="input" data-f="end" value="' + U.esc(p.end) + '" style="flex:.7" placeholder="08:45">' +
        '<button class="icon-btn" data-rm="' + i + '">✕</button></div>';
    }
    var body = '<div class="tiny muted mb8">每天最多 8 节，可自定义名称与时间</div><div id="pList">' +
      db.periods.map(rowHTML).join('') + '</div>' +
      '<button class="btn sm mt8" id="pAdd">+ 增加一节</button>';

    App.ui.modal({
      title: '节次设置', width: 560, body: body,
      footer: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            var arr = [];
            root.querySelectorAll('[data-prow]').forEach(function (r) {
              var o = {};
              r.querySelectorAll('[data-f]').forEach(function (inp) { o[inp.dataset.f] = inp.value.trim(); });
              if (o.name) arr.push(o);
            });
            if (!arr.length) { App.ui.toast('至少保留一节', 'err'); return; }
            db.periods = arr.map(function (p) { return { name: p.name, start: p.start || '', end: p.end || '' }; });
            App.store.save(); close(); App.render();
          }
        }
      ],
      onMount: function (root, close) {
        root.querySelector('#pAdd').onclick = function () {
          var i = root.querySelectorAll('[data-prow]').length;
          var div = document.createElement('div');
          div.innerHTML = rowHTML({ name: '第 ' + (i + 1) + ' 节', start: '', end: '' }, i);
          root.querySelector('#pList').appendChild(div.firstChild);
          bindRm(root);
        };
        function bindRm(r) {
          r.querySelectorAll('[data-rm]').forEach(function (b) {
            b.onclick = function () { b.closest('[data-prow]').remove(); };
          });
        }
        bindRm(root);
      }
    });
  }

  /* ---------------- 学期设置 ---------------- */
  function semesterSettings() {
    var db = App.store.db, U = App.util;
    App.ui.modal({
      title: '学期设置', width: 470,
      body: '<div class="tiny muted mb12" style="line-height:1.9">设定学期第一周与总周数，课表会按「第 N 周」显示，方便对照校历。' +
        '日期会自动对齐到当周周一。</div>' +
        '<div class="field-row">' +
        '<div class="field"><label>学期第一周</label><input class="input" type="date" id="semStart" value="' +
        U.esc(db.meta.semesterStart || U.thisWeek()) + '"></div>' +
        '<div class="field"><label>总周数</label><input class="input" type="number" min="1" max="40" id="semWeeks" value="' +
        (db.meta.semesterWeeks || 20) + '"></div></div>' +
        '<div class="field"><label>学期名称（可选）</label><input class="input" id="semTerm" value="' +
        U.esc(db.meta.term || '') + '" placeholder="2026 秋季学期"></div>',
      footer: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            var s = root.querySelector('#semStart').value;
            var n = parseInt(root.querySelector('#semWeeks').value, 10);
            if (!s) { App.ui.toast('请选择起始日期', 'err'); return; }
            db.meta.semesterStart = U.weekStart(s);
            db.meta.semesterWeeks = Math.max(1, Math.min(40, n || 20));
            var t = root.querySelector('#semTerm').value.trim();
            if (t) db.meta.term = t;
            App.store.save(); close(); App.render();
            App.ui.toast('学期设置已保存', 'ok');
          }
        }
      ]
    });
  }

  /* ---------------- 沿用上一周 ---------------- */
  function copyPrevWeek(week, after) {
    var db = App.store.db, U = App.util;
    var prev = U.addWeeks(week, -1);
    var src = db.entries.filter(function (e) { return e.week === prev && e.content; });
    if (!src.length) { App.ui.toast('上一周没有可沿用的内容', 'err'); return; }
    App.ui.confirm('把 <b>' + U.weekLabel(prev) + '</b> 的 ' + src.length + ' 节内容复制到 <b>' + U.weekLabel(week) + '</b>？<br>' +
      '<span class="tiny muted">同一时段已有内容会被覆盖，时段设置不受影响。</span>', { okLabel: '复制过来' })
      .then(function (ok) {
        if (!ok) return;
        src.forEach(function (e) { upsertEntry(e.classId, e.key, e.content, week); });
        App.store.save(); App.render();
        App.ui.toast('已沿用上一周的内容', 'ok');
        after && after();
      });
  }

  /* ---------------- 导入每周课时内容 ---------------- */
  var ALIAS = { cls: ['班级', 'class', '班'], content: ['授课内容', '内容', '课程内容', 'lesson', 'topic', '知识点'], idx: ['序号', 'index', '节次'] };

  function matchClass(name) {
    var db = App.store.db;
    var s = String(name || '').trim();
    if (!s) return null;
    var exact = db.classes.filter(function (c) { return c.name === s; })[0];
    if (exact) return exact;
    function norm(x) { return String(x).replace(/[\s·\-—_()（）]/g, '').toLowerCase(); }
    var ns = norm(s);
    var hits = db.classes.filter(function (c) {
      var nc = norm(c.name);
      return nc === ns || nc.indexOf(ns) >= 0 || ns.indexOf(nc) >= 0;
    });
    return hits[0] || null;
  }

  function weekOptions(selected) {
    var U = App.util, THIS = U.thisWeek();
    var list = [];
    for (var i = -2; i <= 3; i++) list.push(U.addWeeks(THIS, i));
    if (list.indexOf(selected) < 0) list.push(selected);
    list.sort();
    return list.map(function (wk) {
      var name = U.weekName(wk);
      return '<option value="' + wk + '"' + (wk === selected ? ' selected' : '') + '>' +
        U.weekLabel(wk) + (name ? '（' + name + '）' : '') + '</option>';
    }).join('');
  }

  function uploadLessons(startWeek, after) {
    var db = App.store.db, U = App.util;
    var fallback0 = U.cls(db.meta.currentClassId) || db.classes[0] || null;
    var st = { week: startWeek || U.thisWeek(), groups: null, unmatched: [] };

    var body =
      '<div class="empty" style="text-align:left;padding:14px 16px">' +
      '<div style="font-size:13px;margin-bottom:6px"><strong>每周只需要做这一步</strong></div>' +
      '<div class="tiny muted" style="line-height:1.95">' +
      '上课时段整学期固定，不用再设置；选好要导入的周次，上传一份课时内容清单，系统会按各班时段自动排好。<br>' +
      '清单里带「班级」列时可一次导入多个班级。</div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>导入到哪一周</label><select class="select" id="weekSel">' + weekOptions(st.week) + '</select></div>' +
      '<div class="field"><label>清单没有「班级」列时，导入到</label><select class="select" id="targetSel">' +
      db.classes.map(function (c) {
        return '<option value="' + c.id + '"' + (fallback0 && fallback0.id === c.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>';
      }).join('') + '</select></div></div>' +
      '<div class="row wrap" style="gap:8px;margin-bottom:4px"><button class="btn sm" id="dlTpl">↓ 下载课时清单模板</button>' +
      '<button class="btn sm primary" id="pickFile">选择 Excel / CSV…</button>' +
      '<button class="btn sm" id="manualBtn">✎ 直接粘贴</button></div>' +
      '<div id="upPreview" class="mt12"></div>';

    App.ui.modal({
      title: '导入每周课时内容 · 自动匹配时段',
      width: 720, body: body,
      footer: [{ label: '关闭', onClick: function (c) { c(); } }],
      onMount: function (root, close) {
        var weekSel = root.querySelector('#weekSel');
        var targetSel = root.querySelector('#targetSel');
        var box = root.querySelector('#upPreview');

        function currentWeek() { return weekSel.value; }

        function previewHTML(groups, unmatched, week) {
          if (!groups.length) {
            return '<div class="empty">没有可导入的内容' + (unmatched.length ? '<br><span class="tiny">有 ' + unmatched.length + ' 条班级名没匹配上</span>' : '') + '</div>';
          }
          var head = '<div class="tiny muted mb8">导入到 <b>' + U.weekLabel(week) + (U.weekName(week) ? '（' + U.weekName(week) + '）' : '') +
            '</b> · 共 ' + groups.length + ' 个班级 · 只覆盖清单里有的时段，其余保持不变</div>';
          var h = head;
          groups.forEach(function (g) {
            var slots = slotsOf(g.cls.id);
            var over = g.items.length - slots.length;
            h += '<div class="up-grp"><div class="up-grp-head">' +
              '<span class="dot" style="background:' + g.cls.color + '"></span>' +
              '<strong>' + U.esc(g.cls.name) + '</strong>' +
              '<span class="tiny muted">' + slots.length + ' 个时段 · 清单 ' + g.items.length + ' 条</span>' +
              (over > 0 ? '<span class="badge amber">' + over + ' 条超出</span>' : '') +
              '</div>';
            if (!slots.length) {
              h += '<div class="empty" style="padding:14px">这个班还没有设置上课时段，请先在「学期上课时段」里点选</div></div>';
              return;
            }
            h += '<div class="table-wrap"><table class="tb"><thead><tr><th style="width:44px">#</th><th style="width:200px">上课时段</th><th>授课内容</th></tr></thead><tbody>';
            slots.forEach(function (k, i) {
              var it = g.items[i];
              h += '<tr><td class="muted num">' + (i + 1) + '</td>' +
                '<td>' + U.DAYS[U.dayIndex(k) - 1] + ' ' + U.periodName(k) + ' <span class="tiny muted">' + U.periodTime(k) + '</span></td>' +
                '<td>' + (it ? '<strong>' + U.esc(it.text) + '</strong>' : '<span class="muted tiny">（空）</span>') + '</td></tr>';
            });
            h += '</tbody></table></div></div>';
          });
          if (unmatched.length) {
            h += '<div class="cls-warn danger mt12">有 ' + unmatched.length + ' 条记录没匹配到班级（' +
              U.esc(unmatched.slice(0, 3).join('、')) + (unmatched.length > 3 ? '…' : '') +
              '），已跳过。可先在「学生管理」里建好对应班级。</div>';
          }
          var planN = 0;
          groups.forEach(function (g) { planN += Math.min(g.items.length, slotsOf(g.cls.id).length); });
          h += '<div class="row between up-actions" style="gap:8px">' +
            '<span class="tiny muted">共 ' + groups.length + ' 个班级 · 将排入 <b>' + planN + '</b> 节课</span>' +
            '<div class="row" style="gap:8px">' +
            '<button class="btn" id="cancelGen">取消</button>' +
            '<button class="btn primary" id="applyGen">应用并排入这一周</button></div></div>';
          return h;
        }

        function paint() {
          if (!st.groups) { box.innerHTML = ''; return; }
          box.innerHTML = previewHTML(st.groups, st.unmatched, currentWeek());
          box.querySelector('#cancelGen').onclick = function () { st.groups = null; box.innerHTML = ''; };
          box.querySelector('#applyGen').onclick = function () {
            var week = currentWeek();
            var n = 0;
            st.groups.forEach(function (g) {
              var slots = slotsOf(g.cls.id);
              if (!slots.length) return;
              /* 只覆盖清单里对应的时段，其余时段保持原样 */
              slots.forEach(function (k, i) { if (g.items[i]) upsertEntry(g.cls.id, k, g.items[i].text, week); });
              n++;
            });
            App.store.save(); close();
            if (App.state.timetable) App.state.timetable.week = week;
            App.render();
            App.ui.toast('已排入 ' + U.weekLabel(week) + ' · ' + n + ' 个班级', 'ok');
            after && after();
          };
        }

        weekSel.onchange = function () { paint(); };

        function buildGroups(rows) {
          var map = App.files.mapHeader(rows[0], ALIAS);
          if (map.content == null) { App.ui.toast('没找到「授课内容」列', 'err'); return null; }
          var data = rows.slice(1).filter(function (r) { return String(r[map.content] || '').trim(); });
          if (!data.length) { App.ui.toast('表格里没有内容', 'err'); return null; }
          var fallback = U.cls(targetSel.value) || fallback0;
          var groups = [], byId = {}, unmatched = [];
          data.forEach(function (r, i) {
            var raw = map.cls != null ? String(r[map.cls] || '').trim() : '';
            var cls = raw ? matchClass(raw) : fallback;
            if (!cls) { if (raw) unmatched.push(raw); return; }
            if (!byId[cls.id]) { byId[cls.id] = { cls: cls, items: [] }; groups.push(byId[cls.id]); }
            byId[cls.id].items.push({
              text: String(r[map.content]).trim(),
              n: map.idx != null ? (parseInt(r[map.idx], 10) || 0) : i
            });
          });
          if (map.idx != null) {
            groups.forEach(function (g) { g.items.sort(function (a, b) { return a.n - b.n; }); });
          }
          return { groups: groups, unmatched: unmatched };
        }

        root.querySelector('#dlTpl').onclick = function () {
          var rows = [['班级', '序号', '授课内容']];
          db.classes.forEach(function (c) {
            slotsOf(c.id).slice(0, 2).forEach(function (k, i) {
              rows.push([c.name, String(i + 1), i === 0 ? '（示例）本周第 1 节内容' : '（示例）本周第 2 节内容']);
            });
          });
          if (rows.length === 1) rows.push(['一班 · IGCSE 0606', '1', '（示例）本周第 1 节内容']);
          App.files.downloadCSV('每周课时内容清单模板.csv', rows);
        };

        root.querySelector('#pickFile').onclick = function () {
          App.files.pick({ accept: '.xlsx,.csv,.xls' }).then(function (files) {
            if (!files || !files[0]) return;
            App.files.readTable(files[0]).then(function (rows) {
              if (!rows.length) return App.ui.toast('文件为空', 'err');
              var built = buildGroups(rows);
              if (!built) return;
              st.groups = built.groups;
              st.unmatched = built.unmatched;
              if (!built.groups.length) { App.ui.toast('没有匹配到任何班级的内容', 'err'); }
              paint();
            }).catch(function (err) { App.ui.toast(err.message || '读取失败', 'err'); });
          });
        };

        root.querySelector('#manualBtn').onclick = function () {
          var cls = U.cls(targetSel.value) || fallback0;
          if (!cls) { App.ui.toast('还没有班级，请先建立班级', 'err'); return; }
          var m = App.ui.modal({
            title: '粘贴课时内容 · ' + cls.name, width: 520,
            body: '<div class="tiny muted mb8">每行一节课，按上方时段的先后顺序排入</div>' +
              '<textarea class="textarea" id="manTxt" rows="8" placeholder="二次函数与判别式&#10;指数与对数方程&#10;三角函数图像变换"></textarea>',
            footer: [
              { label: '取消', onClick: function (c) { c(); } },
              {
                label: '下一步', cls: 'primary', onClick: function (c, r) {
                  var items = r.querySelector('#manTxt').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                  if (!items.length) { App.ui.toast('至少写一行内容', 'err'); return; }
                  c();
                  st.groups = [{ cls: cls, items: items.map(function (t, i) { return { text: t, n: i }; }) }];
                  st.unmatched = [];
                  paint();
                }
              }
            ]
          });
        };
      }
    });
  }

  /* ---------------- 页面 ---------------- */
  App.pages.timetable = {
    title: '教学课表',
    sub: '时段整学期设一次，每周导入课时内容即可自动排课',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var THIS = U.thisWeek();
      var st = App.state.timetable || (App.state.timetable = {});
      if (!st.week) st.week = THIS;
      if (!U.cls(st.editClass)) {
        st.editClass = (db.meta.currentClassId && U.cls(db.meta.currentClassId)) ? db.meta.currentClassId : (db.classes[0] && db.classes[0].id);
      }
      if (!st.filter) st.filter = 'all';
      if (st.openSlots === undefined) {
        st.openSlots = !db.classes.some(function (c) { return slotsOf(c.id).length; });
      }

      var week = st.week;
      var weekEntries = db.entries.filter(function (e) { return e.week === week && e.content; });
      var weekName = U.weekName(week);
      var total = 0;

      var html = '';

      /* 周次导航 + 操作 */
      html += '<div class="card tight mb16"><div class="row wrap between" style="gap:12px">' +
        '<div class="row wrap" style="gap:10px">' +
        '<div class="week-nav">' +
        '<button data-wk="-1" title="上一周">‹</button>' +
        '<span class="wk-label"><strong>' + (U.weekNo(week) >= 1 ? '第 ' + U.weekNo(week) + ' 周 · ' : '') + U.weekLabel(week) + '</strong>' +
        (weekName ? '<em class="wk-tag' + (weekName === '本周' ? ' now' : '') + '">' + weekName + '</em>' : '') +
        '</span>' +
        '<button data-wk="1" title="下一周">›</button>' +
        '</div>' +
        (week !== THIS ? '<button class="btn sm ghost" id="backNow">回到本周</button>' : '') +
        '<span class="tiny muted">这一周已排 <b>' + weekEntries.length + '</b> 节</span>' +
        '</div>' +
        '<div class="row wrap" style="gap:8px">' +
        '<button class="btn primary" id="genBtn">↑ 导入课时内容</button>' +
        '<button class="btn" id="copyPrev">沿用上周</button>' +
        '<button class="btn" id="periodBtn">节次设置</button>' +
        '</div></div></div>';

      /* 学期周次总览 */
      var semList = U.semesterList();
      var counts = {};
      db.entries.forEach(function (e) { if (e.content) counts[e.week] = (counts[e.week] || 0) + 1; });
      html += '<div class="card tight mb16"><div class="sem-head">' +
        '<span>📚 ' + U.esc(db.meta.term || '本学期') + ' · ' + U.semesterLabel() + ' · 共 ' + semList.length + ' 周</span>' +
        '<button class="link-btn" id="semSet">学期设置</button></div>' +
        '<div class="sem-weeks">' +
        semList.map(function (w) {
          var n = counts[w] || 0;
          return '<button class="sem-wk' + (w === week ? ' on' : '') + (n ? ' has' : '') + (w === THIS ? ' today' : '') + '" data-goweek="' + w + '">' +
            '<em>' + (w === THIS ? '本周' : U.weekNoLabel(w)) + '</em>' +
            '<span>' + U.weekDayLabel(w, 0) + '</span>' +
            '<b>' + (n ? n + ' 节' : '未排') + '</b></button>';
        }).join('') +
        '</div></div>';

      /* 学期时段（一次性设置） */
      html += '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>学期上课时段' +
        '<span class="sub">（整学期固定，设一次就够）</span></h3>' +
        '<button class="btn sm" id="toggleSlots">' + (st.openSlots ? '收起' : '编辑时段') + '</button></div>';

      if (!st.openSlots) {
        html += '<div class="slot-sum">';
        if (!db.classes.length) {
          html += '<div class="empty" style="border:0;padding:14px">还没有班级</div>';
        }
        db.classes.forEach(function (c) {
          var keys = slotsOf(c.id);
          html += '<div class="sum-item">' +
            '<span class="dot" style="background:' + c.color + '"></span>' +
            '<strong>' + U.esc(c.name) + '</strong>' +
            (keys.length
              ? '<span class="tiny muted">' + U.esc(describeSlots(keys)) + '</span><span class="badge">' + keys.length + ' 节/周</span>'
              : '<span class="tiny" style="color:#c08a2e">未设置上课时段</span><span class="badge amber" data-need-slot="1" style="cursor:pointer">去设置 →</span>') +
            '</div>';
        });
        html += '</div>';
      } else {
        html += '<div class="tiny muted mb8">点一下格子，为选中的班级标记每周上课时间；设置后整学期有效，之后每周只需导入课时内容</div>';
        html += '<div class="chip-row mb12">' + db.classes.map(function (c) {
          return '<button class="chip ' + (st.editClass === c.id ? 'active' : '') + '" data-editcls="' + c.id + '">' +
            '<span class="dot" style="background:' + c.color + '"></span>' + U.esc(c.name) +
            ' <span class="tiny" style="opacity:.7">' + slotsOf(c.id).length + '</span></button>';
        }).join('') + '</div>';
        html += '<div class="slot-grid" style="grid-template-columns:74px repeat(' + U.DAYS.length + ', minmax(0,1fr))"><div></div>' +
          U.DAYS.map(function (d) { return '<div class="sg-head">' + d + '</div>'; }).join('');
        db.periods.forEach(function (p, pi) {
          html += '<div class="sg-time">' + U.esc(p.name) + '</div>';
          for (var d = 1; d <= U.DAYS.length; d++) {
            var k = keyOf(d, pi);
            var on = (db.slots[st.editClass] || []).indexOf(k) >= 0;
            var col = U.clsColor(st.editClass);
            html += '<div class="slot ' + (on ? 'on' : '') + '" data-slot="' + k + '" style="' + (on ? 'background:' + col : '') + '">' +
              (on ? '✓' : '') + '</div>';
          }
        });
        html += '</div>';
      }
      html += '</div>';

      /* 本周课表 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>' +
        (weekName || U.weekLabel(week)) + '课表</h3>' +
        '<div class="chip-row">' +
        '<button class="chip ' + (st.filter === 'all' ? 'active' : '') + '" data-filter="all">全部班级</button>' +
        db.classes.map(function (c) {
          return '<button class="chip ' + (st.filter === c.id ? 'active' : '') + '" data-filter="' + c.id + '">' +
            '<span class="dot" style="background:' + c.color + '"></span>' + U.esc(c.name.split(' · ')[0]) + '</button>';
        }).join('') + '</div></div>';

      if (!weekEntries.length) {
        html += '<div class="empty" style="padding:22px 16px"><span class="ico">🗓</span>' +
          '这一周还没有课时内容<br>' +
          '<span class="tiny">课时时段不用再设，导入一份本周清单就会自动排好</span>' +
          '<div class="row" style="justify-content:center;gap:8px;margin-top:12px">' +
          '<button class="btn sm primary" id="emptyImport">↑ 导入这一周的课时</button>' +
          (db.entries.filter(function (e) { return e.week === U.addWeeks(week, -1) && e.content; }).length
            ? '<button class="btn sm" id="emptyCopy">沿用上周</button>' : '') +
          '</div></div>';
      }

      var shown = db.classes.filter(function (c) { return st.filter === 'all' || c.id === st.filter; });
      html += '<div style="overflow-x:auto"><table class="tt-table"><thead><tr><th style="width:92px"></th>' +
        U.DAYS.map(function (d, i) {
          return '<th>' + d + '<span class="th-date">' + U.weekDayLabel(week, i) + '</span></th>';
        }).join('') + '</tr></thead><tbody>';

      db.periods.forEach(function (p, pi) {
        html += '<tr><td class="tt-period"><strong>' + U.esc(p.name) + '</strong><span>' + U.esc(p.start) + ' - ' + U.esc(p.end) + '</span></td>';
        for (var d = 1; d <= U.DAYS.length; d++) {
          var key = keyOf(d, pi);
          var list = weekEntries.filter(function (e) {
            return e.key === key && shown.some(function (c) { return c.id === e.classId; });
          });
          if (list.length) total += list.length;
          html += '<td><div class="tt-cell ' + (list.length ? 'filled' : '') + '" data-cell="' + key + '" style="' +
            (list.length ? 'background:' + hexA(list[0] ? U.clsColor(list[0].classId) : '#eee', list.length > 1 ? .1 : .09) + ';border-color:' + hexA(U.clsColor(list[0].classId), .3) : '') + '">';
          if (!list.length) {
            html += '<span class="tt-add">' + (st.filter !== 'all' ? '+ 添加' : '') + '</span>';
          } else {
            list.forEach(function (e, i) {
              var c = U.cls(e.classId);
              var col = c ? c.color : '#999';
              html += '<div data-ent="' + e.id + '" style="cursor:pointer">' +
                (i === 0 || list.length > 1 ? '<div class="tt-cls" style="color:' + col + '">' + U.esc(c ? c.name.split(' · ')[0] : '') + '</div>' : '') +
                '<div class="tt-content">' + U.esc(e.content) + '</div></div>';
            });
          }
          html += '</div></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<div class="tiny muted mt12">' +
        (st.filter === 'all' ? '本周共排 ' + total + ' 节' : '本周该班共 ' + total + ' 节') +
        ' · 点击已有内容可修改，选好班级后点击空格子可补填；时段设置整学期有效</div></div>';

      el.innerHTML = html;

      /* 学期条自动定位到当前查看的周 */
      (function () {
        var strip = el.querySelector('.sem-weeks');
        var onChip = el.querySelector('.sem-wk.on');
        if (!strip || !onChip) return;
        var target = onChip.offsetLeft - strip.clientWidth / 2 + onChip.offsetWidth / 2;
        strip.scrollLeft = Math.max(0, target);
      })();

      /* ---- 事件 ---- */
      el.querySelectorAll('[data-wk]').forEach(function (b) {
        b.onclick = function () { st.week = U.addWeeks(week, parseInt(b.dataset.wk, 10)); App.render(); };
      });
      var backNow = el.querySelector('#backNow');
      if (backNow) backNow.onclick = function () { st.week = THIS; App.render(); };
      el.querySelectorAll('[data-goweek]').forEach(function (b) {
        b.onclick = function () { st.week = b.dataset.goweek; App.render(); };
      });
      var semSet = el.querySelector('#semSet');
      if (semSet) semSet.onclick = semesterSettings;
      el.querySelectorAll('[data-editcls]').forEach(function (b) {
        b.onclick = function () {
          st.editClass = b.dataset.editcls;
          db.meta.currentClassId = st.editClass;
          App.store.save(); App.render(); App.refreshTopbar();
        };
      });
      el.querySelectorAll('[data-slot]').forEach(function (s) {
        s.onclick = function () {
          var k = s.dataset.slot;
          var arr = db.slots[st.editClass] || (db.slots[st.editClass] = []);
          var i = arr.indexOf(k);
          if (i >= 0) {
            arr.splice(i, 1);
            db.entries = db.entries.filter(function (e) { return !(e.classId === st.editClass && e.key === k); });
          } else arr.push(k);
          App.store.save(); App.render();
        };
      });
      el.querySelectorAll('[data-filter]').forEach(function (b) {
        b.onclick = function () { st.filter = b.dataset.filter; App.render(); };
      });
      el.querySelectorAll('[data-ent]').forEach(function (d) {
        d.onclick = function (ev) {
          ev.stopPropagation();
          var e = db.entries.filter(function (x) { return x.id === d.dataset.ent; })[0];
          if (!e) return;
          editCell(e.classId, e.key, e.week);
        };
      });
      el.querySelectorAll('[data-cell]').forEach(function (cell) {
        cell.onclick = function (ev) {
          if (ev.target.closest('[data-ent]')) return;
          var key = cell.dataset.cell;
          var target = st.filter !== 'all' ? st.filter : (weekEntries.filter(function (e) { return e.key === key; })[0] || {}).classId;
          if (!target) { App.ui.toast('请先在上方选择一个班级，再点击格子添加内容', 'err'); return; }
          if ((db.slots[target] || []).indexOf(key) < 0) {
            App.ui.confirm('这个时段还没有加入 <b>' + U.esc(U.clsName(target)) + '</b> 的上课时段，要顺便加入吗？<br>' +
              '<span class="tiny muted">加入后整学期有效</span>', { okLabel: '加入并编辑' }).then(function (ok) {
                if (!ok) return;
                (db.slots[target] = db.slots[target] || []).push(key);
                App.store.save();
                editCell(target, key, week);
              });
            return;
          }
          editCell(target, key, week);
        };
      });
      el.querySelector('#periodBtn').onclick = periodSettings;
      el.querySelector('#genBtn').onclick = function () { uploadLessons(week, function () { App.render(); }); };
      el.querySelector('#copyPrev').onclick = function () { copyPrevWeek(week); };
      el.querySelector('#toggleSlots').onclick = function () { st.openSlots = !st.openSlots; App.render(); };
      el.querySelectorAll('[data-need-slot]').forEach(function (b) {
        b.onclick = function () { st.openSlots = true; App.render(); };
      });
      var ei = el.querySelector('#emptyImport');
      if (ei) ei.onclick = function () { uploadLessons(week, function () { App.render(); }); };
      var ec = el.querySelector('#emptyCopy');
      if (ec) ec.onclick = function () { copyPrevWeek(week); };
    }
  };

  function hexA(hex, a) {
    if (!hex || hex[0] !== '#') return 'rgba(240,238,250,' + a + ')';
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
})();
