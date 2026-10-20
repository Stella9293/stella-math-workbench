/* ==========================================================
   page-students.js — 学生管理（Excel 导入 / 一键脱敏 / 成绩记录）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  var ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var ALIAS = {
    en: ['英文名', 'english', 'name', '学生', '姓名'],
    zh: ['中文名', 'chinese', '中文'],
    cls: ['班级', 'class', '班'],
    system: ['课程体系', '体系', 'system', 'curriculum', '课程'],
    email: ['家长邮件', '邮箱', 'email', 'mail'],
    phone: ['联系方式', '电话', '手机', 'phone', 'contact', '联系']
  };

  function studentForm(s, onSave) {
    var db = App.store.db, U = App.util;
    var body =
      '<div class="field-row"><div class="field"><label>英文名（主要字段）</label><input class="input" id="sfEn" value="' + U.esc(s ? s.en : '') + '" placeholder="Alex Chen"></div>' +
      '<div class="field"><label>中文名</label><input class="input" id="sfZh" value="' + U.esc(s ? s.zh : '') + '" placeholder="陈亦辰"></div></div>' +
      '<div class="field-row"><div class="field"><label>所属班级</label><select class="select" id="sfCls">' +
      db.classes.map(function (c) { return '<option value="' + c.id + '" ' + (s && s.classId === c.id ? 'selected' : '') + '>' + U.esc(c.name) + '</option>'; }).join('') +
      '</select></div><div class="field"><label>课程体系</label><input class="input" id="sfSys" value="' + U.esc(s ? s.system : 'IGCSE') + '" placeholder="IGCSE / A-Level / IB"></div></div>' +
      '<div class="field-row"><div class="field"><label>家长邮箱</label><input class="input" id="sfEmail" value="' + U.esc(s ? s.email : '') + '" placeholder="parent@mail.com"></div>' +
      '<div class="field"><label>联系方式</label><input class="input" id="sfPhone" value="' + U.esc(s ? s.phone : '') + '" placeholder="13800138000"></div></div>' +
      '<div class="field"><label>备注</label><input class="input" id="sfNote" value="' + U.esc(s ? s.note : '') + '" placeholder="学习特点、家长诉求…"></div>';

    App.ui.modal({
      title: s ? '编辑学生' : '添加学生',
      width: 600, body: body,
      footer: [
        { label: '取消', onClick: function (close) { close(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            var en = root.querySelector('#sfEn').value.trim();
            if (!en) { App.ui.toast('英文名必填', 'err'); return; }
            onSave({
              en: en,
              zh: root.querySelector('#sfZh').value.trim(),
              classId: root.querySelector('#sfCls').value,
              system: root.querySelector('#sfSys').value.trim(),
              email: root.querySelector('#sfEmail').value.trim(),
              phone: root.querySelector('#sfPhone').value.trim(),
              note: root.querySelector('#sfNote').value.trim()
            });
            close();
          }
        }
      ]
    });
  }

  function scoreModal(s) {
    var U = App.util;
    var rows = U.stuScores(s.id);
    var body = '<div class="mb12"><strong>' + U.esc(s.en) + '</strong> <span class="muted tiny">' + U.esc(s.zh || '') + ' · ' + U.clsName(s.classId) + '</span></div>';
    if (!rows.length) {
      body += '<div class="empty">暂无成绩记录</div>';
    } else {
      body += '<div class="table-wrap"><table class="tb"><thead><tr><th>测验</th><th>日期</th><th class="right">得分</th><th class="right">满分</th><th class="right">班内排名</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var rk = U.rankInExam(r.exam, s.id);
        body += '<tr><td>' + U.esc(r.exam.name) + '</td><td class="muted">' + U.dateLabel(r.exam.date) + '</td>' +
          '<td class="right strong num">' + r.score + '</td><td class="right muted num">' + r.exam.full + '</td>' +
          '<td class="right">' + (rk ? rk.rank + ' / ' + rk.total : '—') + '</td></tr>';
      });
      body += '</tbody></table></div>';
      var avg = U.avg(rows.map(function (r) { return r.score; }));
      body += '<div class="row mt12" style="gap:10px"><span class="badge">平均 ' + (avg == null ? '—' : U.round1(avg)) + '</span>' +
        '<span class="badge mint">最高 ' + Math.max.apply(null, rows.map(function (r) { return r.score; })) + '</span></div>';
    }
    App.ui.modal({ title: '成绩记录', width: 620, body: body, footer: [{ label: '关闭', onClick: function (c) { c(); } }] });
  }

  function importModal(onDone) {
    var U = App.util, db = App.store.db;
    var body =
      '<div class="empty" style="text-align:left;padding:14px 16px">' +
      '<div style="font-size:13px;margin-bottom:6px"><strong>导入说明</strong></div>' +
      '<div class="tiny muted" style="line-height:1.9">1. 表格首行为表头，字段：<b>班级、英文名、中文名、课程体系、家长邮件、联系方式</b><br>' +
      '2. 支持 .xlsx / .csv；列顺序不限，多出的列会被忽略<br>' +
      '3. 班级名与现有班级自动匹配，未匹配的会按表格内容新建班级<br>' +
      '4. 同班同名（英文名）默认跳过，避免重复导入</div></div>' +
      '<div class="row" style="gap:8px;margin-bottom:12px"><button class="btn sm" id="dlTpl">↓ 下载导入模板</button>' +
      '<button class="btn sm primary" id="pickFile">选择文件…</button><span class="tiny muted" id="fileName"></span></div>' +
      '<div id="importPreview"></div>';

    App.ui.modal({
      title: '导入学生名单（Excel）',
      width: 680, body: body,
      footer: [{ label: '关闭', onClick: function (c) { c(); } }],
      onMount: function (root, close) {
        root.querySelector('#dlTpl').onclick = function () {
          App.files.downloadCSV('学生名单导入模板.csv', [
            ['班级', '英文名', '中文名', '课程体系', '家长邮件', '联系方式'],
            ['一班 · IGCSE 0606', 'Tom Lee', '李汤姆', 'IGCSE', 'tom.parent@mail.com', '13800138000'],
            ['二班 · IGCSE 0580', 'Amy Lin', '林艾米', 'IGCSE', 'amy.parent@mail.com', '13900139000']
          ]);
        };

        root.querySelector('#pickFile').onclick = function () {
          App.files.pick({ accept: '.xlsx,.csv,.xls' }).then(function (files) {
            if (!files || !files[0]) return;
            var f = files[0];
            root.querySelector('#fileName').textContent = f.name;
            App.files.readTable(f).then(function (rows) {
              if (!rows.length) { App.ui.toast('表格是空的', 'err'); return; }
              var header = rows[0];
              var map = App.files.mapHeader(header, ALIAS);
              if (map.en == null) { App.ui.toast('未找到「英文名」列，请检查表头', 'err'); return; }
              var data = rows.slice(1).filter(function (r) { return String(r[map.en] || '').trim(); });

              var created = [], skipped = 0, added = 0;
              var preview = '<div class="tiny muted mb8">识别到 ' + data.length + ' 条学生记录</div>' +
                '<div class="table-wrap" style="max-height:280px;overflow:auto"><table class="tb"><thead><tr><th>英文名</th><th>中文名</th><th>班级</th><th>课程体系</th><th>家长邮件</th><th>联系方式</th></tr></thead><tbody>';
              data.forEach(function (r) {
                var en = String(r[map.en] || '').trim();
                var zh = map.zh != null ? String(r[map.zh] || '').trim() : '';
                var clsName = map.cls != null ? String(r[map.cls] || '').trim() : '';
                var sys = map.system != null ? String(r[map.system] || '').trim() : '';
                var email = map.email != null ? String(r[map.email] || '').trim() : '';
                var phone = map.phone != null ? String(r[map.phone] || '').trim() : '';

                var cls = null;
                if (clsName) {
                  cls = db.classes.filter(function (c) { return c.name === clsName || c.name.indexOf(clsName) >= 0 || clsName.indexOf(c.name) >= 0; })[0];
                  if (!cls) {
                    cls = { id: 'cls_' + Math.random().toString(36).slice(2, 9), name: clsName, color: App.PALETTE[db.classes.length % App.PALETTE.length], system: sys || '', grade: '', note: '导入创建', createdAt: U.todayISO() };
                    db.classes.push(cls); db.slots[cls.id] = [];
                    created.push(clsName);
                  }
                } else {
                  cls = U.cls(db.meta.currentClassId) || db.classes[0];
                }
                if (!cls) return;
                var dup = db.students.filter(function (s) {
                  return s.classId === cls.id && String(s.en).toLowerCase() === en.toLowerCase();
                }).length;
                if (dup) { skipped++; return; }
                db.students.push({ id: 'stu_' + Math.random().toString(36).slice(2, 9), classId: cls.id, en: en, zh: zh, system: sys || cls.system || '', email: email, phone: phone, note: '' });
                added++;
                preview += '<tr><td><strong>' + U.esc(en) + '</strong></td><td>' + U.esc(zh) + '</td><td><span class="badge gray">' + U.esc(cls.name) + '</span></td>' +
                  '<td class="tiny muted">' + U.esc(sys) + '</td><td class="tiny muted">' + U.esc(email) + '</td><td class="tiny muted">' + U.esc(phone) + '</td></tr>';
              });
              preview += '</tbody></table></div>' +
                '<div class="row mt12" style="gap:8px"><span class="badge mint">成功导入 ' + added + ' 人</span>' +
                (skipped ? '<span class="badge amber">跳过重复 ' + skipped + ' 人</span>' : '') +
                (created.length ? '<span class="badge blue">新建班级 ' + created.length + ' 个</span>' : '') + '</div>';

              App.store.save();
              root.querySelector('#importPreview').innerHTML = preview;
              App.ui.toast('已导入 ' + added + ' 名学生', 'ok');
              onDone && onDone();
            }).catch(function (err) {
              App.ui.toast(err.message || '读取失败', 'err');
            });
          });
        };
      }
    });
  }

  /* ---------- 删除班级：先安排班内学生去向 ---------- */
  function deleteClassFlow(cls, done) {
    var U = App.util, db = App.store.db;
    var n = U.studentsOf(cls.id).length;
    var others = db.classes.filter(function (c) { return c.id !== cls.id; });
    var examN = db.exams.filter(function (e) { return e.classId === cls.id; }).length;

    function run(moveTo) {
      if (moveTo) {
        db.students.forEach(function (s) { if (s.classId === cls.id) s.classId = moveTo; });
      } else {
        var ids = {};
        db.students.forEach(function (s) { if (s.classId === cls.id) ids[s.id] = 1; });
        db.students = db.students.filter(function (s) { return s.classId !== cls.id; });
        db.exams.forEach(function (e) { Object.keys(ids).forEach(function (k) { delete e.scores[k]; }); });
        db.records = db.records.filter(function (r) { return !ids[r.studentId]; });
        db.papers = db.papers.filter(function (p) { return !ids[p.studentId]; });
        db.mistakes = db.mistakes.filter(function (m) { return !ids[m.studentId]; });
        db.comms = db.comms.filter(function (c) { return !ids[c.studentId]; });
      }
      /* 班级本身与课表、测验、记录一并移除 */
      db.classes = db.classes.filter(function (c) { return c.id !== cls.id; });
      if (db.slots) delete db.slots[cls.id];
      db.entries = db.entries.filter(function (e) { return e.classId !== cls.id; });
      db.exams = db.exams.filter(function (e) { return e.classId !== cls.id; });
      db.records = db.records.filter(function (r) { return r.classId !== cls.id; });
      db.papers = db.papers.filter(function (p) { return p.classId !== cls.id; });
      db.mistakes = db.mistakes.filter(function (m) { return m.classId !== cls.id; });
      db.comms = db.comms.filter(function (c) { return c.classId !== cls.id; });
      db.summaries = (db.summaries || []).filter(function (s) { return s.classId !== cls.id; });
      if (db.meta.currentClassId === cls.id) db.meta.currentClassId = db.classes[0] ? db.classes[0].id : null;
      /* 其他页面可能缓存了该班级，一并纠正 */
      if (App.state && App.state.analytics && App.state.analytics.classId === cls.id) {
        App.state.analytics.classId = db.meta.currentClassId;
        App.state.analytics.studentId = null;
        App.state.analytics.examId = null;
      }
      App.store.save();
      App.refreshTopbar();
      App.ui.toast('已删除班级「' + cls.name + '」' + (moveTo ? '，学生已转移' : ''), 'ok');
      done && done();
    }

    if (!n) {
      App.ui.confirm('删除班级 <b>' + U.esc(cls.name) + '</b>？<br>' +
        '<span class="tiny muted">该班暂无学生，课表与测验记录会一并移除，此操作不可撤销。</span>',
        { danger: true, okLabel: '删除班级' }).then(function (ok) { if (ok) run(null); });
      return;
    }

    var body =
      '<div class="tiny muted mb12" style="line-height:1.9">「<b>' + U.esc(cls.name) + '</b>」还有 <b>' + n + '</b> 名学生，删除前先安排他们的去向。</div>' +
      '<div class="field"><label>学生去向</label><select class="select" id="dclsMode">' +
      (others.length ? '<option value="move">转移到其他班级（名单与个人信息保留）</option>' : '') +
      '<option value="del">连同该班一并删除</option></select></div>' +
      (others.length ? '<div class="field" id="dclsTargetWrap"><label>转移到</label><select class="select" id="dclsTarget">' +
        others.map(function (c) {
          return '<option value="' + c.id + '">' + U.esc(c.name) + '（' + U.studentsOf(c.id).length + ' 人）</option>';
        }).join('') + '</select></div>' : '') +
      '<div class="cls-warn" id="dclsWarn"></div>';

    App.ui.modal({
      title: '删除班级',
      width: 470, body: body,
      footer: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '删除班级', cls: 'danger', onClick: function (c, root) {
            var mode = root.querySelector('#dclsMode').value;
            var target = root.querySelector('#dclsTarget');
            c();
            run(mode === 'move' && target ? target.value : null);
          }
        }
      ],
      onMount: function (root) {
        var modeSel = root.querySelector('#dclsMode');
        var warn = root.querySelector('#dclsWarn');
        function sync() {
          var mv = modeSel.value === 'move';
          var tw = root.querySelector('#dclsTargetWrap');
          if (tw) tw.style.display = mv ? '' : 'none';
          warn.className = 'cls-warn' + (mv ? '' : ' danger');
          warn.innerHTML = mv
            ? '学生名单与个人信息会整体转入所选班级；该班的课表与 ' + examN + ' 场测验记录会随班级移除。'
            : '将同时删除这 ' + n + ' 名学生的名单、成绩与课堂记录，以及该班的 ' + examN + ' 场测验，<b>不可恢复</b>。';
        }
        modeSel.onchange = sync;
        sync();
      }
    });
  }

  /* ---------- 班级管理面板 ---------- */
  function manageClasses(onChange) {
    var U = App.util, db = App.store.db;

    function tableHTML() {
      var h = '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>班级</th><th>课程体系</th><th class="right">人数</th><th class="right">平均分</th><th class="right">操作</th>' +
        '</tr></thead><tbody>';
      if (!db.classes.length) {
        h += '<tr><td colspan="5"><div class="tb-empty">还没有班级，可新建班级或导入 Excel 名单</div></td></tr>';
      }
      db.classes.forEach(function (c) {
        var n = U.studentsOf(c.id).length;
        var avg = U.classAvg(c.id);
        h += '<tr><td><div class="row" style="gap:8px;align-items:center">' +
          '<span class="dot" style="background:' + c.color + '"></span>' +
          '<strong style="font-size:13px">' + U.esc(c.name) + '</strong>' +
          (c.note === '导入创建' ? '<span class="badge gray">导入</span>' : '') + '</div></td>' +
          '<td class="tiny muted">' + U.esc(c.system || '—') + '</td>' +
          '<td class="right num">' + n + '</td>' +
          '<td class="right num">' + (avg == null ? '<span class="muted">—</span>' : U.round1(avg)) + '</td>' +
          '<td class="right"><button class="btn sm danger" data-delcls="' + c.id + '">删除</button></td></tr>';
      });
      h += '</tbody></table></div>';
      return h;
    }

    App.ui.modal({
      title: '班级管理',
      width: 660,
      body: '<div class="row wrap" style="justify-content:space-between;gap:10px;margin-bottom:10px">' +
        '<div class="tiny muted" style="max-width:400px;line-height:1.8">删除班级前可先把班内学生转移到其他班级，名单与个人信息不会丢失。</div>' +
        '<button class="btn sm primary" id="mgrAdd">＋ 新建班级</button></div>' +
        '<div id="clsTable"></div>',
      footer: [{ label: '完成', cls: 'primary', onClick: function (c) { c(); } }],
      onMount: function (root) {
        var box = root.querySelector('#clsTable');
        function paint() {
          box.innerHTML = tableHTML();
          box.querySelectorAll('[data-delcls]').forEach(function (b) {
            b.onclick = function () {
              var c = U.cls(b.dataset.delcls);
              if (!c) return;
              deleteClassFlow(c, function () { paint(); onChange && onChange(); });
            };
          });
        }
        root.querySelector('#mgrAdd').onclick = function () {
          App.ui.prompt({ title: '新建班级', label: '班级名称', placeholder: '例如：五班 · IGCSE 0580' }).then(function (v) {
            if (!v) return;
            db.classes.push({
              id: 'cls_' + Date.now().toString(36), name: v,
              color: App.PALETTE[db.classes.length % App.PALETTE.length],
              system: '', grade: '', note: '', createdAt: U.todayISO()
            });
            db.slots[db.classes[db.classes.length - 1].id] = [];
            if (!db.meta.currentClassId) db.meta.currentClassId = db.classes[db.classes.length - 1].id;
            App.store.save(); App.refreshTopbar();
            paint(); onChange && onChange();
            App.ui.toast('班级已创建', 'ok');
          });
        };
        paint();
      }
    });
  }

  App.pages.students = {
    title: '学生管理',
    sub: '英文名为主要字段，支持 Excel 批量导入',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var state = { classId: db.meta.currentClassId || 'all', q: App.pendingSearch || '' };
      App.pendingSearch = '';

      function render() {
        var list = db.students.filter(function (s) {
          if (state.classId !== 'all' && s.classId !== state.classId) return false;
          if (state.q) {
            var q = state.q.toLowerCase();
            return (s.en + ' ' + s.zh + ' ' + s.email + ' ' + s.phone + ' ' + s.system).toLowerCase().indexOf(q) >= 0;
          }
          return true;
        });

        var html = '';
        html += '<div class="card tight mb16"><div class="row wrap" style="gap:10px">' +
          '<div class="search-box" style="flex:1;min-width:220px;position:relative">' + ICON_SEARCH +
          '<input class="input" id="stuSearch" placeholder="搜索英文名 / 中文名 / 邮箱…" value="' + U.esc(state.q) + '"></div>' +
          '<button class="btn" id="importBtn">↑ 导入 Excel</button>' +
          '<button class="btn primary" id="addStu">+ 添加学生</button>' +
          '<button class="btn ' + (db.meta.maskNames ? 'primary' : '') + '" id="maskBtn" title="一键脱敏">' + (db.meta.maskNames ? '已脱敏' : '一键脱敏') + '</button>' +
          '<button class="btn" id="manageCls" title="管理班级">⚙ 班级</button>' +
          '</div>' +
          '<div class="chip-row mt12">' +
          '<button class="chip ' + (state.classId === 'all' ? 'active' : '') + '" data-cls="all">全部 <span class="tiny">' + db.students.length + '</span></button>' +
          db.classes.map(function (c) {
            return '<button class="chip ' + (state.classId === c.id ? 'active' : '') + '" data-cls="' + c.id + '">' +
              '<span class="dot" style="background:' + c.color + '"></span>' + U.esc(c.name) +
              ' <span class="tiny" style="opacity:.7">' + U.studentsOf(c.id).length + '</span>' +
              '<span class="chip-x" data-xcls="' + c.id + '" title="删除该班级">✕</span></button>';
          }).join('') +
          (db.classes.length ? '' : '<span class="tiny muted">还没有班级，可导入 Excel 名单，或点上方「⚙ 班级」新建</span>') +
          '</div></div>';

        html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>学生名单' +
          '<span class="sub">（' + list.length + ' 人）</span></h3>' +
          '<div class="row" style="gap:8px">' +
          '<span class="tiny muted">' + (db.meta.maskNames ? '脱敏模式：姓名 / 邮箱 / 电话已隐藏' : '') + '</span>' +
          '</div></div>';
        html += '<div class="table-wrap"><table class="tb"><thead><tr>' +
          '<th>学生</th><th>班级</th><th>课程体系</th><th>家长邮件</th><th>联系方式</th><th class="right">最近成绩</th><th class="right">操作</th>' +
          '</tr></thead><tbody>';

        if (!list.length) {
          html += '<tr><td colspan="7"><div class="tb-empty">没有匹配的学生，试试导入 Excel 名单</div></td></tr>';
        }
        list.forEach(function (s) {
          var c = U.cls(s.classId);
          var scores = U.stuScores(s.id);
          var last = scores.length ? scores[scores.length - 1] : null;
          html += '<tr data-sid="' + s.id + '">' +
            '<td><div class="row" style="gap:9px"><span class="stu-avatar" style="background:' + (c ? c.color : '#bbb') + '">' + U.initial(s) + '</span>' +
            '<div><strong style="font-size:13px">' + U.esc(U.displayName(s)) + '</strong>' +
            '<div class="tiny muted">' + U.esc(db.meta.maskNames ? U.mask(s.zh) : (s.zh || '—')) + '</div></div></div></td>' +
            '<td><span class="badge gray">' + U.esc(c ? c.name.split(' · ')[0] : '—') + '</span></td>' +
            '<td class="tiny">' + U.esc(s.system || '—') + '</td>' +
            '<td class="tiny muted">' + U.esc(db.meta.maskNames ? U.maskEmail(s.email) : (s.email || '—')) + '</td>' +
            '<td class="tiny muted num">' + U.esc(db.meta.maskNames ? U.maskPhone(s.phone) : (s.phone || '—')) + '</td>' +
            '<td class="right num">' + (last ? '<strong>' + last.score + '</strong><span class="tiny muted"> / ' + last.exam.full + '</span>' : '<span class="muted">—</span>') + '</td>' +
            '<td class="right"><div class="row" style="justify-content:flex-end;gap:4px">' +
            '<button class="btn sm" data-scores="' + s.id + '">成绩</button>' +
            '<button class="btn sm" data-edit="' + s.id + '">编辑</button>' +
            '<button class="btn sm danger" data-del="' + s.id + '">删除</button></div></td></tr>';
        });
        html += '</tbody></table></div></div>';

        el.innerHTML = html;

        var searchInp = el.querySelector('#stuSearch');
        var composing = false;
        function doSearch() {
          state.q = searchInp.value;
          render();
          var inp = el.querySelector('#stuSearch');
          inp.focus();
          inp.setSelectionRange(inp.value.length, inp.value.length);
        }
        searchInp.addEventListener('compositionstart', function () { composing = true; });
        searchInp.addEventListener('compositionend', function () { composing = false; doSearch(); });
        searchInp.addEventListener('input', function () { if (!composing) doSearch(); });
        el.querySelectorAll('[data-cls]').forEach(function (b) {
          b.onclick = function () {
            state.classId = b.dataset.cls;
            if (state.classId !== 'all') { db.meta.currentClassId = state.classId; App.store.save(); App.refreshTopbar(); }
            render();
          };
        });
        el.querySelectorAll('[data-xcls]').forEach(function (x) {
          x.onclick = function (e) {
            e.stopPropagation();
            var c = U.cls(x.dataset.xcls);
            if (!c) return;
            deleteClassFlow(c, function () {
              if (state.classId === c.id) state.classId = 'all';
              render();
            });
          };
          x.onmousedown = function (e) { e.stopPropagation(); };
        });
        el.querySelector('#manageCls').onclick = function () {
          manageClasses(function () {
            if (state.classId !== 'all' && !U.cls(state.classId)) state.classId = 'all';
            render();
          });
        };
        el.querySelector('#maskBtn').onclick = function () {
          db.meta.maskNames = !db.meta.maskNames;
          App.store.save(); render();
          App.ui.toast(db.meta.maskNames ? '已开启脱敏模式' : '已关闭脱敏模式', 'ok');
        };
        el.querySelector('#importBtn').onclick = function () { importModal(render); };
        el.querySelector('#addStu').onclick = function () {
          studentForm(null, function (data) {
            db.students.push(Object.assign({ id: 'stu_' + Date.now().toString(36) }, data));
            App.store.save(); render(); App.ui.toast('学生已添加', 'ok');
          });
        };
        el.querySelectorAll('[data-edit]').forEach(function (b) {
          b.onclick = function () {
            var s = U.stu(b.dataset.edit);
            studentForm(s, function (data) {
              Object.assign(s, data); App.store.save(); render(); App.ui.toast('已保存', 'ok');
            });
          };
        });
        el.querySelectorAll('[data-scores]').forEach(function (b) {
          b.onclick = function () { scoreModal(U.stu(b.dataset.scores)); };
        });
        el.querySelectorAll('[data-del]').forEach(function (b) {
          b.onclick = function () {
            var s = U.stu(b.dataset.del);
            App.ui.confirm('删除学生 <b>' + U.esc(s.en) + '</b> 及其成绩记录？', { danger: true, okLabel: '删除' }).then(function (ok) {
              if (!ok) return;
              db.students = db.students.filter(function (x) { return x.id !== s.id; });
              db.exams.forEach(function (e) { delete e.scores[s.id]; });
              db.records = db.records.filter(function (r) { return r.studentId !== s.id; });
              db.papers = db.papers.filter(function (p) { return p.studentId !== s.id; });
              db.mistakes = db.mistakes.filter(function (m) { return m.studentId !== s.id; });
              App.store.save(); render(); App.ui.toast('已删除');
            });
          };
        });
      }

      render();
    }
  };
})();
