/* ==========================================================
   page-classes.js — 我的班级（含全局搜索）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  var ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  function classForm(c, onSave) {
    var colors = App.PALETTE;
    var body =
      '<div class="field"><label>班级名称</label><input class="input" id="cfName" value="' + App.util.esc(c ? c.name : '') + '" placeholder="例如：一班 · IGCSE 0606"></div>' +
      '<div class="field-row"><div class="field"><label>课程体系</label><input class="input" id="cfSys" value="' + App.util.esc(c ? c.system : '') + '" placeholder="IGCSE / A-Level / IB"></div>' +
      '<div class="field"><label>年级</label><input class="input" id="cfGrade" value="' + App.util.esc(c ? c.grade : '') + '" placeholder="G10 / A2"></div></div>' +
      '<div class="field"><label>备注</label><input class="input" id="cfNote" value="' + App.util.esc(c ? c.note : '') + '" placeholder="上课时间、进度说明…"></div>' +
      '<div class="field"><label>课表颜色</label><div class="chip-row" id="cfColors">' +
      colors.map(function (col, i) {
        var on = c ? c.color === col : i === 0;
        return '<button class="chip" data-color="' + col + '" style="' + (on ? 'background:' + col + ';border-color:transparent;color:#fff' : '') + '">' +
          '<span class="dot" style="background:' + col + '"></span>' + col + '</button>';
      }).join('') + '</div></div>';

    var picked = { color: c ? c.color : colors[0] };
    var m = App.ui.modal({
      title: c ? '编辑班级' : '新建班级',
      width: 560,
      body: body,
      footer: [
        { label: '取消', onClick: function (close) { close(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            var name = root.querySelector('#cfName').value.trim();
            if (!name) { App.ui.toast('请填写班级名称', 'err'); return; }
            onSave({
              name: name,
              system: root.querySelector('#cfSys').value.trim(),
              grade: root.querySelector('#cfGrade').value.trim(),
              note: root.querySelector('#cfNote').value.trim(),
              color: picked.color
            });
            close();
          }
        }
      ],
      onMount: function (root) {
        root.querySelectorAll('[data-color]').forEach(function (b) {
          b.onclick = function () {
            picked.color = b.dataset.color;
            root.querySelectorAll('[data-color]').forEach(function (x) {
              x.style.background = ''; x.style.borderColor = ''; x.style.color = '';
            });
            b.style.background = picked.color; b.style.borderColor = 'transparent'; b.style.color = '#fff';
          };
        });
      }
    });
  }

  function search(q) {
    var db = App.store.db, U = App.util;
    q = q.trim().toLowerCase();
    if (!q) return [];
    var out = [];
    db.students.forEach(function (s) {
      if ((s.en + ' ' + s.zh + ' ' + s.email + ' ' + s.phone).toLowerCase().indexOf(q) >= 0) {
        var masked = db.meta.maskNames;
        out.push({ group: '学生', label: U.displayName(s) + ' · ' + (masked ? U.mask(s.zh) : s.zh), meta: U.clsName(s.classId), type: 'student', id: s.id, classId: s.classId });
      }
    });
    db.exams.forEach(function (e) {
      if ((e.name + ' ' + (e.date || '')).toLowerCase().indexOf(q) >= 0) {
        out.push({ group: '试卷 / 测验', label: e.name, meta: U.dateLabel(e.date) + ' · ' + U.clsName(e.classId), type: 'exam', id: e.id, classId: e.classId });
      }
    });
    (function walk(nodes, path) {
      nodes.forEach(function (n) {
        (n.links || []).forEach(function (l) {
          if ((l.label + ' ' + l.url).toLowerCase().indexOf(q) >= 0) {
            out.push({ group: '教案 / 资源', label: l.label, meta: path + n.name, type: 'link', url: l.url });
          }
        });
        if (n.name.toLowerCase().indexOf(q) >= 0) {
          out.push({ group: '备课目录', label: n.name, meta: path + (n.children && n.children.length ? n.children.length + ' 个子目录' : '目录'), type: 'node', id: n.id });
        }
        if (n.children && n.children.length) walk(n.children, path + n.name + ' / ');
      });
    })(db.curriculum, '');
    db.mistakes.forEach(function (ms) {
      if ((ms.topic + ' ' + ms.note).toLowerCase().indexOf(q) >= 0) {
        var s = U.stu(ms.studentId);
        out.push({ group: '错题', label: ms.topic, meta: (s ? s.en : '') + ' · ' + U.dateLabel(ms.date), type: 'mistake', id: ms.id, studentId: ms.studentId, classId: ms.classId });
      }
    });
    db.papers.forEach(function (p) {
      if ((p.aiComment || '').toLowerCase().indexOf(q) >= 0 || (p.tags || []).join(' ').toLowerCase().indexOf(q) >= 0) {
        var s = U.stu(p.studentId);
        out.push({ group: '试卷分析', label: (s ? s.en : '') + ' 的试卷分析', meta: U.dateLabel(p.date), type: 'paper', id: p.id, studentId: p.studentId, classId: p.classId });
      }
    });
    return out.slice(0, 30);
  }

  App.pages.classes = {
    title: '我的班级',
    sub: '一个班一个节奏，切换看数据',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var curId = db.meta.currentClassId;
      if (!U.cls(curId) && db.classes.length) { curId = db.classes[0].id; db.meta.currentClassId = curId; App.store.save(); }
      var cur = U.cls(curId);

      var html = '';
      /* 搜索 */
      html += '<div class="card tight mb16" style="position:relative">' +
        '<div class="search-box" style="position:relative">' + ICON_SEARCH +
        '<input class="input" id="gSearch" placeholder="搜索学生、教案、试卷、错题…" autocomplete="off">' +
        '<button class="clear" id="gClear" style="display:none">✕</button></div>' +
        '<div id="gResults"></div>' +
        '<div class="tiny muted mt8">支持按英文名 / 中文名 / 邮箱 / 电话 / 试卷名称 / 教案资源 / 错题知识点搜索</div>' +
        '</div>';

      /* 班级列表 */
      html += '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>班级列表</h3>' +
        '<div class="row" style="gap:8px"><span class="sub">点击任意班级即可切换</span>' +
        '<button class="btn primary" id="addClass">+ 新建班级</button></div></div>';
      html += '<div class="table-wrap"><table class="tb"><thead><tr>' +
        '<th>班级名称</th><th>课程体系</th><th class="right">人数</th><th class="right">平均分</th><th>最近测验</th><th>备注</th><th class="right">操作</th>' +
        '</tr></thead><tbody>';
      db.classes.forEach(function (c) {
        var n = U.studentsOf(c.id).length;
        var avg = U.classAvg(c.id);
        var le = U.latestExam(c.id);
        html += '<tr class="clickable ' + (c.id === curId ? 'selected' : '') + '" data-class="' + c.id + '">' +
          '<td><div class="row" style="gap:8px"><span class="dot" style="background:' + c.color + '"></span><strong>' + U.esc(c.name) + '</strong></div></td>' +
          '<td><span class="badge gray">' + U.esc(c.system || '—') + '</span></td>' +
          '<td class="right num">' + n + '</td>' +
          '<td class="right num strong">' + (avg == null ? '<span class="muted">—</span>' : avg) + '</td>' +
          '<td class="muted tiny">' + (le ? U.esc(le.name) + ' · ' + U.dateLabel(le.date) : '—') + '</td>' +
          '<td class="muted tiny" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(c.note || '') + '</td>' +
          '<td class="right"><div class="row" style="justify-content:flex-end;gap:4px">' +
          '<button class="btn sm" data-edit="' + c.id + '">编辑</button>' +
          '<button class="btn sm danger" data-del="' + c.id + '">删除</button></div></td></tr>';
      });
      if (!db.classes.length) html += '<tr><td colspan="7"><div class="tb-empty">还没有班级，点击右上角「新建班级」开始</div></td></tr>';
      html += '</tbody></table></div></div>';

      /* 当前班级概况 */
      if (cur) {
        var stus = U.studentsOf(cur.id);
        var scores = U.classScores(cur.id);
        var exams = U.examList(cur.id);
        var avg = U.classAvg(cur.id);
        var maxS = scores.length ? Math.max.apply(null, scores) : null;
        var minS = scores.length ? Math.min.apply(null, scores) : null;
        var le = U.latestExam(cur.id);

        html += '<div class="card mb16"><div class="card-head">' +
          '<h3><span class="dot" style="background:' + cur.color + '"></span>' + U.esc(cur.name) + ' · 班级概况</h3>' +
          '<div class="row" style="gap:8px">' +
          '<button class="btn sm" data-act="students">学生名单</button>' +
          '<button class="btn sm" data-act="scores">录入成绩</button>' +
          '<button class="btn sm" data-act="timetable">排课</button></div></div>';

        html += '<div class="grid g-4" style="gap:12px">' +
          '<div class="stat tight" style="padding:12px 14px"><div class="k">学生人数</div><div class="v" style="font-size:22px">' + stus.length + '<small>人</small></div></div>' +
          '<div class="stat tight" style="padding:12px 14px"><div class="k">平均分</div><div class="v" style="font-size:22px">' + (avg == null ? '—' : avg) + (le ? '<small>/ ' + le.full + '</small>' : '') + '</div></div>' +
          '<div class="stat tight" style="padding:12px 14px"><div class="k">最高 / 最低</div><div class="v" style="font-size:22px">' + (maxS == null ? '—' : maxS) + '<small>/ ' + (minS == null ? '—' : minS) + '</small></div></div>' +
          '<div class="stat tight" style="padding:12px 14px"><div class="k">测验次数</div><div class="v" style="font-size:22px">' + exams.length + '<small>次</small></div></div>' +
          '</div>';

        if (exams.length) {
          html += '<div class="grid g-2 mt16" style="gap:16px">';
          html += '<div><div class="tiny muted mb8">班级均分趋势</div>' +
            App.charts.line({
              labels: exams.map(function (e) { return U.dateLabel(e.date); }),
              values: exams.map(function (e) { return U.examAvg(e) || 0; }),
              height: 190, gid: 'cls' + cur.id
            }) + '</div>';
          html += '<div><div class="tiny muted mb8">学生成绩（最近一次测验）</div>';
          if (le) {
            var rows = stus.map(function (s) {
              var v = le.scores[s.id];
              return { s: s, v: v == null || v === '' ? null : parseFloat(v) };
            }).sort(function (a, b) { return (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v); });
            var top = rows[0] && rows[0].v ? rows[0].v : (le.full || 100);
            html += '<div style="max-height:190px;overflow-y:auto;padding-right:4px">';
            rows.forEach(function (r, i) {
              html += '<div class="rank-row"><span class="idx">' + (r.v == null ? '—' : i + 1) + '</span>' +
                '<span style="width:96px;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(U.displayName(r.s)) + '</span>' +
                '<span class="bar-bg"><span class="bar-fg" style="width:' + (r.v == null ? 0 : Math.max(4, r.v / top * 100)) + '%;background:' + cur.color + '"></span></span>' +
                '<span class="score">' + (r.v == null ? '—' : r.v) + '</span></div>';
            });
            html += '</div>';
          }
          html += '</div></div>';
        } else {
          html += '<div class="empty mt16">这个班还没有测验成绩，去「学情分析 · 测验成绩」导入 Excel 吧</div>';
        }
        html += '</div>';
      }

      el.innerHTML = html;

      /* 搜索交互 */
      var si = el.querySelector('#gSearch');
      var resBox = el.querySelector('#gResults');
      var clearBtn = el.querySelector('#gClear');
      function renderResults() {
        var list = search(si.value);
        clearBtn.style.display = si.value ? 'block' : 'none';
        if (!si.value.trim()) { resBox.innerHTML = ''; return; }
        if (!list.length) { resBox.innerHTML = '<div class="search-results"><div class="sr-group">没有找到相关内容</div></div>'; return; }
        var groups = {};
        list.forEach(function (x) { (groups[x.group] = groups[x.group] || []).push(x); });
        var h = '<div class="search-results">';
        Object.keys(groups).forEach(function (g) {
          h += '<div class="sr-group">' + g + '</div>';
          groups[g].forEach(function (x) {
            h += '<div class="sr-item" data-type="' + x.type + '" data-id="' + (x.id || '') + '" data-cid="' + (x.classId || '') + '" data-url="' + U.esc(x.url || '') + '" data-stu="' + (x.studentId || '') + '">' +
              '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(x.label) + '</span>' +
              '<span class="badge gray">' + U.esc(x.meta || '') + '</span></div>';
          });
        });
        h += '</div>';
        resBox.innerHTML = h;
        resBox.querySelectorAll('.sr-item').forEach(function (it) {
          it.onclick = function () {
            var t = it.dataset.type;
            if (it.dataset.cid) { db.meta.currentClassId = it.dataset.cid; App.store.save(); }
            if (t === 'link') {
              if (/^https?:/.test(it.dataset.url)) window.open(it.dataset.url, '_blank');
              else App.ui.toast('本地路径：' + it.dataset.url + '（已复制）', 'ok'), U.copy(it.dataset.url);
              return;
            }
            if (t === 'student') {
              var stuObj = U.stu(it.dataset.id);
              App.pendingStudent = it.dataset.id;
              App.pendingSearch = stuObj ? stuObj.en : '';
              App.go('students');
              return;
            }
            if (t === 'exam') { App.pendingExam = it.dataset.id; App.go('analytics'); return; }
            if (t === 'mistake' || t === 'paper') { App.pendingStudent = it.dataset.stu; App.go('analytics'); return; }
            if (t === 'node') { App.go('prep'); return; }
          };
        });
      }
      si.addEventListener('input', renderResults);
      si.addEventListener('focus', renderResults);
      clearBtn.onclick = function () { si.value = ''; renderResults(); si.focus(); };
      document.addEventListener('click', function hide(e) {
        if (!el.contains(si) && !resBox.contains(e.target)) { resBox.innerHTML = ''; }
      });

      /* 班级交互 */
      el.querySelectorAll('tr[data-class]').forEach(function (tr) {
        tr.onclick = function (e) {
          if (e.target.closest('button')) return;
          db.meta.currentClassId = tr.dataset.class;
          App.store.save(); App.render(); App.refreshTopbar();
        };
      });
      el.querySelectorAll('[data-edit]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var c = U.cls(b.dataset.edit);
          classForm(c, function (data) {
            Object.assign(c, data);
            App.store.save(); App.render(); App.refreshTopbar();
            App.ui.toast('班级已更新', 'ok');
          });
        };
      });
      el.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var c = U.cls(b.dataset.del);
          App.ui.confirm('确定删除班级 <b>' + U.esc(c.name) + '</b> 吗？<br><span class="tiny muted">该班学生、课表、成绩记录会一并删除，且不可恢复。</span>', { danger: true, okLabel: '删除' }).then(function (ok) {
            if (!ok) return;
            db.classes = db.classes.filter(function (x) { return x.id !== c.id; });
            db.students = db.students.filter(function (x) { return x.classId !== c.id; });
            db.exams = db.exams.filter(function (x) { return x.classId !== c.id; });
            db.entries = db.entries.filter(function (x) { return x.classId !== c.id; });
            db.records = db.records.filter(function (x) { return x.classId !== c.id; });
            db.papers = db.papers.filter(function (x) { return x.classId !== c.id; });
            delete db.slots[c.id];
            if (db.meta.currentClassId === c.id) db.meta.currentClassId = db.classes[0] ? db.classes[0].id : null;
            App.store.save(); App.render(); App.refreshTopbar();
            App.ui.toast('班级已删除');
          });
        };
      });
      el.querySelector('#addClass').onclick = function () {
        classForm(null, function (data) {
          var c = Object.assign({ id: 'cls_' + Date.now().toString(36), createdAt: U.todayISO() }, data);
          db.classes.push(c);
          db.slots[c.id] = [];
          db.meta.currentClassId = c.id;
          App.store.save(); App.render(); App.refreshTopbar();
          App.ui.toast('班级已创建', 'ok');
        });
      };
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.act === 'students') App.go('students');
          else if (b.dataset.act === 'timetable') App.go('timetable');
          else App.pendingTab = 'scores', App.go('analytics');
        };
      });
    }
  };
})();
