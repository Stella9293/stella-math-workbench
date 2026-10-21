/* ==========================================================
   page-analytics.js — 学情分析
   课堂表现 / 作业情况 / 测验成绩 / 试卷分析
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  var LAYOUT_TAGS = ['步骤跳跃', '书写潦草', '缺少检验/单位', '审题偏差', '时间分配不当', '跳步未写条件'];

  function esc(s) { return App.util.esc(s); }

  /* 知识点标签区标题（随选择实时更新） */
  function tagLabelText(system, pool, tags) {
    return '薄弱知识点 · ' + system + ' 共 ' + pool.length + ' 项，已选 ' + tags.length + ' 项（可多选、可自定义）';
  }

  function studentList(classId, selectedId, counts, fmt) {
    var U = App.util;
    var masked = App.store.db.meta.maskNames;
    var list = U.studentsOf(classId);
    var h = '<div class="stu-list">';
    if (!list.length) h += '<div class="empty">这个班还没有学生</div>';
    list.forEach(function (s) {
      var c = U.cls(s.classId);
      var cv = counts && counts[s.id] != null ? (fmt ? fmt(counts[s.id]) : counts[s.id]) : null;
      h += '<div class="stu-item ' + (s.id === selectedId ? 'active' : '') + '" data-stu="' + s.id + '">' +
        '<span class="stu-avatar" style="background:' + (c ? c.color : '#bbb') + '">' + U.initial(s) + '</span>' +
        '<span class="nm"><strong>' + esc(U.displayName(s)) + '</strong><span>' + esc(masked ? U.mask(s.zh) : (s.zh || '')) + '</span></span>' +
        (cv != null ? '<span class="badge gray">' + esc(String(cv)) + '</span>' : '') + '</div>';
    });
    return h + '</div>';
  }

  /* ---------------- 测验成绩 ---------------- */
  function editScores(exam, after) {
    var U = App.util, db = App.store.db;
    var stus = U.studentsOf(exam.classId);
    var body = '<div class="tiny muted mb8">' + esc(exam.name) + ' · 满分 ' + exam.full + ' · 直接输入分数，留空表示缺考</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-height:380px;overflow:auto;padding-right:4px">';
    stus.forEach(function (s) {
      body += '<div class="row" style="gap:8px"><span style="width:110px;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(s.en) + '</span><input class="input" data-score="' + s.id + '" type="number" min="0" max="' + exam.full + '" value="' +
        (exam.scores[s.id] != null ? exam.scores[s.id] : '') + '" style="height:32px"></div>';
    });
    body += '</div>';
    App.ui.modal({
      title: '录入成绩', width: 620, body: body,
      footer: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            root.querySelectorAll('[data-score]').forEach(function (inp) {
              var v = inp.value.trim();
              if (v === '') delete exam.scores[inp.dataset.score];
              else exam.scores[inp.dataset.score] = Math.max(0, Math.min(exam.full, parseFloat(v)));
            });
            App.store.save(); close(); App.render(); App.ui.toast('成绩已保存', 'ok');
            after && after();
          }
        }
      ]
    });
  }

  function importScores(classId, after) {
    var U = App.util, db = App.store.db;
    var ALIAS = { cls: ['班级', 'class', '班'], en: ['英文名', 'english', 'name', '学生', '姓名'], score: ['成绩', '分数', 'score', '得分', 'mark'] };
    var body =
      '<div class="empty" style="text-align:left;padding:14px 16px"><div style="font-size:13px;margin-bottom:6px"><strong>成绩表格式</strong></div>' +
      '<div class="tiny muted" style="line-height:1.9">表头：<b>班级、英文名、成绩</b>（列顺序不限）<br>支持 .xlsx / .csv；英文名需与学生名单一致，否则会被跳过</div></div>' +
      '<div class="field-row"><div class="field"><label>测验名称</label><input class="input" id="isName" value="测验 ' + U.todayISO() + '"></div>' +
      '<div class="field"><label>日期</label><input class="input" id="isDate" type="date" value="' + U.todayISO() + '"></div>' +
      '<div class="field" style="max-width:110px"><label>满分</label><input class="input" id="isFull" type="number" value="100"></div></div>' +
      '<div class="row" style="gap:8px;margin:6px 0 10px"><button class="btn sm" id="sTpl">↓ 下载成绩模板</button>' +
      '<button class="btn sm primary" id="sPick">选择文件…</button><span class="tiny muted" id="sFile"></span></div>' +
      '<div id="sPreview"></div>';

    App.ui.modal({
      title: '导入测验成绩', width: 700, body: body,
      footer: [{ label: '关闭', onClick: function (c) { c(); } }],
      onMount: function (root, close) {
        root.querySelector('#sTpl').onclick = function () {
          var rows = [['班级', '英文名', '成绩']];
          U.studentsOf(classId).slice(0, 5).forEach(function (s) {
            rows.push([U.clsName(classId), s.en, '']);
          });
          App.files.downloadCSV('成绩导入模板.csv', rows);
        };
        root.querySelector('#sPick').onclick = function () {
          App.files.pick({ accept: '.xlsx,.csv,.xls' }).then(function (files) {
            if (!files || !files[0]) return;
            root.querySelector('#sFile').textContent = files[0].name;
            App.files.readTable(files[0]).then(function (rows) {
              if (rows.length < 2) return App.ui.toast('表格里没有数据行', 'err');
              var map = App.files.mapHeader(rows[0], ALIAS);
              if (map.en == null || map.score == null) return App.ui.toast('需要「英文名」和「成绩」两列', 'err');
              var parsed = [], unmatched = [];
              rows.slice(1).forEach(function (r) {
                var en = String(r[map.en] || '').trim();
                if (!en) return;
                var sc = parseFloat(r[map.score]);
                if (isNaN(sc)) return;
                var stuRow = U.studentsOf(classId).filter(function (s) { return s.en.toLowerCase() === en.toLowerCase(); })[0];
                if (!stuRow) {
                  stuRow = db.students.filter(function (s) { return s.en.toLowerCase() === en.toLowerCase(); })[0];
                }
                if (!stuRow) { unmatched.push(en); return; }
                parsed.push({ sid: stuRow.id, en: stuRow.en, score: sc });
              });
              var h = '<div class="tiny muted mb8">匹配到 ' + parsed.length + ' 条成绩' + (unmatched.length ? '，' + unmatched.length + ' 条英文名未匹配' : '') + '</div>';
              h += '<div class="table-wrap" style="max-height:250px;overflow:auto"><table class="tb"><thead><tr><th>英文名</th><th class="right">成绩</th></tr></thead><tbody>';
              parsed.forEach(function (p) { h += '<tr><td>' + esc(p.en) + '</td><td class="right strong num">' + p.score + '</td></tr>'; });
              h += '</tbody></table></div>';
              if (unmatched.length) h += '<div class="tiny mt8" style="color:var(--amber)">未匹配：' + unmatched.map(esc).join('、') + '</div>';
              h += '<div class="row mt12" style="justify-content:flex-end;gap:8px"><button class="btn" id="sCancel">取消</button>' +
                '<button class="btn primary" id="sApply">确认导入</button></div>';
              root.querySelector('#sPreview').innerHTML = h;
              root.querySelector('#sCancel').onclick = function () { root.querySelector('#sPreview').innerHTML = ''; };
              root.querySelector('#sApply').onclick = function () {
                var name = root.querySelector('#isName').value.trim() || ('测验 ' + U.todayISO());
                var date = root.querySelector('#isDate').value || U.todayISO();
                var full = parseFloat(root.querySelector('#isFull').value) || 100;
                var exam = { id: 'ex_' + Date.now().toString(36), name: name, classId: classId, date: date, full: full, scores: {} };
                parsed.forEach(function (p) { exam.scores[p.sid] = p.score; });
                db.exams.push(exam);
                App.store.save(); close(); App.render();
                App.ui.toast('已导入 ' + parsed.length + ' 条成绩', 'ok');
                after && after();
              };
            }).catch(function (e) { App.ui.toast(e.message || '读取失败', 'err'); });
          });
        };
      }
    });
  }

  /* 从 Markdown 报告里取出指定小节正文 */
  function mdSection(md, keys) {
    var out = [], on = false;
    String(md || '').split('\n').forEach(function (l) {
      var m = l.match(/^#{1,5}\s*(.+)$/);
      if (m) {
        on = keys.some(function (k) { return m[1].indexOf(k) >= 0; });
        return;
      }
      if (on) out.push(l);
    });
    return out.join('\n').trim();
  }

  /* ---------------- 试卷分析 ---------------- */

  App.pages.analytics = {
    title: '学情分析',
    sub: '课堂、作业、成绩、试卷，一个学生一条线',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var st = App.state.analytics || (App.state.analytics = { tab: 'class' });
      if (!U.cls(st.classId)) st.classId = db.meta.currentClassId || (db.classes[0] && db.classes[0].id);
      if (App.pendingTab) { st.tab = App.pendingTab; App.pendingTab = null; }
      if (App.pendingExam) {
        var pex = db.exams.filter(function (e) { return e.id === App.pendingExam; })[0];
        if (pex) { st.classId = pex.classId; st.tab = 'scores'; st.examId = pex.id; }
        App.pendingExam = null;
      }
      if (App.pendingStudent) { st.studentId = App.pendingStudent; App.pendingStudent = null; }
      var stus = U.studentsOf(st.classId);
      if (!st.studentId || !stus.some(function (s) { return s.id === st.studentId; })) st.studentId = stus[0] ? stus[0].id : null;

      var TABS = [
        { id: 'class', label: '课堂表现' },
        { id: 'homework', label: '作业情况' },
        { id: 'scores', label: '测验成绩' },
        { id: 'papers', label: '试卷分析' },
        { id: 'summary', label: '综合分析' }
      ];

      var html = '<div class="card tight mb16"><div class="row wrap between" style="gap:12px">' +
        '<div class="chip-row">' + db.classes.map(function (c) {
          return '<button class="chip ' + (st.classId === c.id ? 'active' : '') + '" data-acls="' + c.id + '">' +
            '<span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="tabs">' + TABS.map(function (t) {
          return '<button class="tab ' + (st.tab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
        }).join('') + '</div></div></div>';

      /* ============ 课堂表现 / 作业情况 ============ */
      if (st.tab === 'class' || st.tab === 'homework') {
        var type = st.tab;
        var recs = db.records.filter(function (r) { return r.studentId === st.studentId && r.type === type; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var counts = {};
        db.records.filter(function (r) { return r.type === type; }).forEach(function (r) { counts[r.studentId] = (counts[r.studentId] || 0) + 1; });
        var cur = U.stu(st.studentId);

        html += '<div class="grid g-1-2">';
        html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>班级学生</h3>' +
          '<span class="sub">' + stus.length + ' 人</span></div>' + studentList(st.classId, st.studentId, counts) + '</div>';

        html += '<div class="card">';
        if (!cur) {
          html += '<div class="empty">先在左侧选择一个学生</div>';
        } else {
          html += '<div class="card-head"><h3><span class="card-title-dot"></span>' + esc(cur.en) + ' · ' + (type === 'class' ? '课堂表现' : '作业情况') + '</h3>' +
            '<span class="badge">' + (type === 'class' ? '文字记录' : '文字 + 图片') + '</span></div>';
          html += '<div class="row" style="gap:8px;margin-bottom:8px"><input class="input" id="recDate" type="date" value="' + U.todayISO() + '" style="max-width:160px">' +
            '<span class="tiny muted">记录日期</span></div>';
          html += '<textarea class="textarea" id="recText" placeholder="' + (type === 'class'
            ? '例如：今天主动回答了判别式的问题，但在配方法上仍然漏项…'
            : '例如：作业完成质量高，第 7 题换元后忘记回代…') + '"></textarea>';

          if (type === 'homework') {
            html += '<div class="row wrap mt12" style="gap:8px"><button class="btn sm" id="recImg">+ 上传作业图片</button>' +
              '<span class="tiny muted">支持多张，自动压缩后保存在本地</span></div>';
            html += '<div class="img-strip" id="recImgs"></div>';
          }
          html += '<div class="row mt12" style="gap:8px"><button class="btn primary" id="recSave">保存记录</button>' +
            '<span class="tiny muted">记录会按时间倒序显示在下方</span></div>';

          html += '<div class="divider"></div>';
          if (!recs.length) html += '<div class="empty">还没有记录</div>';
          recs.forEach(function (r) {
            html += '<div class="note-card mb8"><div class="nc-head">' +
              '<span class="badge gray">' + U.dateLabel(r.date) + '</span>' +
              '<span class="spacer"></span><button class="icon-btn" data-delrec="' + r.id + '">✕</button></div>' +
              '<div class="nc-text">' + esc(r.text) + '</div>';
            if (r.images && r.images.length) {
              html += '<div class="img-strip">' + r.images.map(function (src) {
                return '<img class="thumb" src="' + src + '" data-zoom="' + r.id + '">';
              }).join('') + '</div>';
            }
            html += '</div>';
          });
        }
        html += '</div></div>';
        el.innerHTML = html;

        el.querySelectorAll('[data-acls]').forEach(function (b) {
          b.onclick = function () { st.classId = b.dataset.acls; st.studentId = null; db.meta.currentClassId = st.classId; App.store.save(); App.refreshTopbar(); App.render(); };
        });
        el.querySelectorAll('[data-tab]').forEach(function (b) {
          b.onclick = function () { st.tab = b.dataset.tab; st.draftImages = []; App.render(); };
        });
        el.querySelectorAll('[data-stu]').forEach(function (b) {
          b.onclick = function () { st.studentId = b.dataset.stu; st.draftImages = []; App.render(); };
        });
        el.querySelectorAll('[data-delrec]').forEach(function (b) {
          b.onclick = function () {
            db.records = db.records.filter(function (r) { return r.id !== b.dataset.delrec; });
            App.store.save(); App.render();
          };
        });
        el.querySelectorAll('[data-zoom]').forEach(function (img) {
          img.onclick = function () {
            var r = db.records.filter(function (x) { return x.id === img.dataset.zoom; })[0];
            if (!r) return;
            var idx = Array.prototype.indexOf.call(img.parentNode.children, img);
            App.ui.lightbox(r.images[idx]);
          };
        });

        if (cur) {
          var draft = st.draftImages || (st.draftImages = []);
          function paintDraft() {
            var box = el.querySelector('#recImgs');
            if (!box) return;
            box.innerHTML = draft.map(function (src, i) {
              return '<div class="thumb-wrap"><img class="thumb" src="' + src + '"><span class="x" data-rmimg="' + i + '">✕</span></div>';
            }).join('');
            box.querySelectorAll('[data-rmimg]').forEach(function (x) {
              x.onclick = function () { draft.splice(parseInt(x.dataset.rmimg, 10), 1); paintDraft(); };
            });
          }
          paintDraft();

          var imgBtn = el.querySelector('#recImg');
          if (imgBtn) imgBtn.onclick = function () {
            App.files.pick({ accept: 'image/*', multiple: true }).then(function (files) {
              if (!files || !files.length) return;
              Promise.all(Array.prototype.map.call(files, function (f) { return App.files.readImage(f); })).then(function (arr) {
                arr.forEach(function (a) { draft.push(a); });
                paintDraft();
                App.ui.toast('已添加 ' + arr.length + ' 张图片', 'ok');
              });
            });
          };

          el.querySelector('#recSave').onclick = function () {
            var text = el.querySelector('#recText').value.trim();
            var date = el.querySelector('#recDate').value || U.todayISO();
            if (!text && !draft.length) { App.ui.toast('写点内容或上传图片再保存', 'err'); return; }
            db.records.push({
              id: 'rc_' + Date.now().toString(36), classId: st.classId, studentId: st.studentId,
              type: type, date: date, text: text, images: draft.slice()
            });
            st.draftImages = [];
            App.store.save(); App.render();
            App.ui.toast('记录已保存', 'ok');
          };
        }
        return;
      }

      /* ============ 测验成绩 ============ */
      if (st.tab === 'scores') {
        var exams = U.examList(st.classId);
        if (!st.examId || !exams.some(function (e) { return e.id === st.examId; })) {
          st.examId = exams.length ? exams[exams.length - 1].id : null;
        }

        html += '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>测验记录</h3>' +
          '<div class="row" style="gap:8px"><button class="btn sm" id="impScore">↑ 导入 Excel 成绩</button>' +
          '<button class="btn sm primary" id="newExam">+ 新建测验</button></div></div>';
        html += '<div class="table-wrap"><table class="tb tb-x"><thead><tr><th>测验名称</th><th>日期</th><th class="right">满分</th><th class="right">录入人数</th><th class="right">均分</th><th class="right">最高</th><th class="right">最低</th><th class="right">操作</th></tr></thead><tbody>';
        if (!exams.length) html += '<tr><td colspan="8"><div class="tb-empty">还没有测验记录</div></td></tr>';
        exams.forEach(function (e) {
          var vals = Object.keys(e.scores).map(function (k) { return parseFloat(e.scores[k]); }).filter(function (x) { return !isNaN(x); });
          html += '<tr class="clickable ' + (e.id === st.examId ? 'selected' : '') + '" data-exam="' + e.id + '">' +
            '<td><strong>' + esc(e.name) + '</strong></td>' +
            '<td class="muted">' + U.dateLabel(e.date) + '</td>' +
            '<td class="right num">' + e.full + '</td>' +
            '<td class="right num">' + vals.length + '</td>' +
            '<td class="right num strong">' + (vals.length ? U.round1(U.avg(vals)) : '—') + '</td>' +
            '<td class="right num">' + (vals.length ? Math.max.apply(null, vals) : '—') + '</td>' +
            '<td class="right num">' + (vals.length ? Math.min.apply(null, vals) : '—') + '</td>' +
            '<td class="right"><div class="row" style="justify-content:flex-end;gap:4px">' +
            '<button class="btn sm" data-edit-exam="' + e.id + '">录分</button>' +
            '<button class="btn sm danger" data-del-exam="' + e.id + '">删除</button></div></td></tr>';
        });
        html += '</tbody></table></div></div>';

        {
          /* 左侧学生列表：徽标 = 最近一次得分率 */
          var stusS = U.studentsOf(st.classId);
          if (!st.studentId || !stusS.some(function (s) { return s.id === st.studentId; })) {
            st.studentId = stusS[0] ? stusS[0].id : null;
          }
          var curS = U.stu(st.studentId);

          /* 跨所有测验的走势：每次满分不同，统一换算成得分率（%） */
          var trendExams = exams.filter(function (e) {
            return Object.keys(e.scores || {}).some(function (k) { return !isNaN(parseFloat(e.scores[k])); });
          });
          var trendTotal = trendExams.length;
          trendExams = trendExams.slice(-12);
          function pctOf(e, sid) {
            var v = e.scores[sid];
            if (v == null || v === '') return null;
            var n = parseFloat(v);
            if (isNaN(n)) return null;
            return U.round1(n / (e.full || 100) * 100);
          }
          var lastPct = {};
          stusS.forEach(function (s) {
            for (var i = trendExams.length - 1; i >= 0; i--) {
              var p = pctOf(trendExams[i], s.id);
              if (p != null) { lastPct[s.id] = p; break; }
            }
          });
          var trendLabels = trendExams.map(function (e) {
            var d = String(e.date || '');
            return d.length >= 10 ? d.slice(5).replace('-', '/') : e.name;
          });
          var markIdx = trendExams.findIndex(function (e) { return e.id === st.examId; });

          html += '<div class="grid g-1-2">';
          html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>班级学生</h3>' +
            '<span class="sub">' + stusS.length + ' 人</span></div>' +
            studentList(st.classId, st.studentId, lastPct, function (v) { return U.round1(v) + '%'; }) + '</div>';

          html += '<div class="card" id="trendCard">';
          if (!curS) {
            html += '<div class="empty">这个班还没有学生，先到「学生管理」导入名单</div>';
          } else {
            var rowsS = trendExams.map(function (e) {
              var raw = e.scores[curS.id];
              raw = raw == null || raw === '' ? null : parseFloat(raw);
              return { e: e, p: pctOf(e, curS.id), raw: isNaN(raw) ? null : raw };
            });
            var got = rowsS.filter(function (x) { return x.p != null; });

            html += '<div class="card-head"><h3><span class="card-title-dot"></span>' + esc(curS.en) + ' · 成绩走势</h3>' +
              '<span class="sub">' + (trendTotal ? '共 ' + trendTotal + ' 次测验' +
                (trendTotal > trendExams.length ? ' · 显示最近 ' + trendExams.length + ' 次' : '') : '还没有成绩') + '</span></div>';

            if (!got.length) {
              html += '<div class="empty">这位学生还没有测验成绩，点上方表格的「录分」录入</div>';
            } else {
              var lastOne = got[got.length - 1];
              var prevOne = got.length > 1 ? got[got.length - 2] : null;
              var dif = prevOne ? U.round1(lastOne.p - prevOne.p) : null;
              var sum = 0, hi = got[0].p, lo = got[0].p;
              got.forEach(function (x) { sum += x.p; if (x.p > hi) hi = x.p; if (x.p < lo) lo = x.p; });

              html += '<div class="trend-stats">' +
                '<div class="ts"><span>最近一次</span><b>' + lastOne.raw + '<small>/' + lastOne.e.full + '</small></b><i>' + lastOne.p + '%</i></div>' +
                '<div class="ts"><span>平均得分率</span><b>' + U.round1(sum / got.length) + '%</b></div>' +
                '<div class="ts"><span>最高 / 最低</span><b>' + hi + '% / ' + lo + '%</b></div>' +
                '<div class="ts"><span>较上次</span><b class="' + (dif > 0 ? 'up' : dif < 0 ? 'down' : '') + '">' +
                (dif == null ? '—' : (dif > 0 ? '↑' : dif < 0 ? '↓' : '→') + U.round1(Math.abs(dif))) + '</b></div>' +
                '</div>';

              if (trendExams.length === 1) {
                html += '<div class="tiny" style="color:var(--amber);margin-top:8px">目前只有 1 次测验成绩，录完第 2 次就能看到变化趋势。</div>';
              }

              html += '<div style="margin-top:10px">' + App.charts.multiLine({
                labels: trendLabels,
                series: [{
                  name: U.displayName(curS), color: U.clsColor(st.classId), values: rowsS.map(function (x) { return x.p; }),
                  tips: rowsS.map(function (x) {
                    return (x.e.date ? U.dateLabel(x.e.date) + ' · ' : '') + x.e.name +
                      (x.raw == null ? ' · 缺考' : ' · ' + x.raw + '/' + x.e.full + ' · ' + x.p + '%');
                  })
                }],
                focus: 0, mark: markIdx >= 0 ? markIdx : null,
                markColor: U.clsColor(st.classId), height: 300
              }) + '</div>';

              html += '<div class="trend-refs">' + trendExams.map(function (e, i) {
                return '<span' + (e.id === st.examId ? ' class="on"' : '') + '><b>' + (i + 1) + '</b> ' +
                  (e.date ? U.dateLabel(e.date) + ' · ' : '') + esc(e.name) + ' · 满分 ' + e.full + '</span>';
              }).join('') + '</div>';
            }
          }
          html += '</div></div>';
        }

        el.innerHTML = html;
        bindCommon(el, st, db);

        el.querySelectorAll('[data-exam]').forEach(function (tr) {
          tr.onclick = function (e) {
            if (e.target.closest('button')) return;
            st.examId = tr.dataset.exam; App.render();
          };
        });
        el.querySelectorAll('[data-edit-exam]').forEach(function (b) {
          b.onclick = function (e) {
            e.stopPropagation();
            var ex = db.exams.filter(function (x) { return x.id === b.dataset.editExam; })[0];
            editScores(ex);
          };
        });
        el.querySelectorAll('[data-del-exam]').forEach(function (b) {
          b.onclick = function (e) {
            e.stopPropagation();
            App.ui.confirm('删除这次测验及其成绩记录？', { danger: true, okLabel: '删除' }).then(function (ok) {
              if (!ok) return;
              db.exams = db.exams.filter(function (x) { return x.id !== b.dataset.delExam; });
              App.store.save(); App.render();
            });
          };
        });
        el.querySelector('#impScore').onclick = function () { importScores(st.classId); };
        el.querySelector('#newExam').onclick = function () {
          var today = U.todayISO();
          App.ui.modal({
            title: '新建测验', width: 480,
            body: '<div class="field"><label>测验名称</label><input class="input" id="neName" placeholder="例如：0606 阶段测验 3"></div>' +
              '<div class="field-row"><div class="field"><label>日期</label><input class="input" id="neDate" type="date" value="' + today + '"></div>' +
              '<div class="field"><label>满分</label><input class="input" id="neFull" type="number" value="60"></div></div>',
            footer: [
              { label: '取消', onClick: function (c) { c(); } },
              {
                label: '创建并录分', cls: 'primary', onClick: function (close, root) {
                  var name = root.querySelector('#neName').value.trim() || ('测验 ' + today);
                  var ex = {
                    id: 'ex_' + Date.now().toString(36), name: name, classId: st.classId,
                    date: root.querySelector('#neDate').value || today,
                    full: parseFloat(root.querySelector('#neFull').value) || 100, scores: {}
                  };
                  db.exams.push(ex); App.store.save(); close();
                  st.examId = ex.id; App.render();
                  editScores(ex);
                }
              }
            ]
          });
        };
        return;
      }

      /* ============ 试卷分析 / 综合分析 共用：当前学生 ============ */
      var cur2 = U.stu(st.studentId);
      if (!cur2) {
        el.innerHTML = html + '<div class="card"><div class="empty">这个班还没有学生，先到「学生管理」导入名单</div></div>';
        bindCommon(el, st, db);
        return;
      }

      /* ============ 试卷分析（只保留单次） ============ */
      if (st.tab === 'papers') {
        var papers = db.papers.filter(function (p) { return p.studentId === st.studentId; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var draft = st.paperDraft && st.paperDraft.studentId === st.studentId ? st.paperDraft : null;
        if (!draft) {
          draft = st.paperDraft = {
            studentId: st.studentId, text: '', tags: [], layout: [], images: [],
            comment: '', examId: '', date: U.todayISO(), scoreTable: [],
            markScheme: '', ocrText: '', report: '', paperName: '', full: '', score: ''
          };
        }
        if (!draft.scoreTable) draft.scoreTable = [];
        while (draft.scoreTable.length < 5) draft.scoreTable.push({ no: '', awarded: '', full: '', note: '' });
        var examsOfClass = U.examList(st.classId);
        var clsObj = U.cls(st.classId);
        var showRaw = !!st.reportRaw;

        function curExam() { return db.exams.filter(function (e) { return e.id === draft.examId; })[0]; }
        function numOrNull(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
        function fullVal() { var ex = curExam(); var v = numOrNull(draft.full); return v != null ? v : (ex ? ex.full : null); }
        function scoreVal() { var v = numOrNull(draft.score); return v; }
        function filledRows() {
          return draft.scoreTable.filter(function (r) {
            return String(r.no || '').trim() && String(r.awarded || '') !== '';
          });
        }

        /* 当前体系：学生/班级自动判断，也可手动改 */
        var sysNow = draft.kbSystem || App.kb.systemOf(cur2, clsObj);
        draft.kbSystem = sysNow;
        var kbPool = App.kb.topics(sysNow);
        var kbSysList = App.kb.systems();
        if (kbSysList.indexOf(sysNow) < 0) kbSysList.push(sysNow);

        var cardInfo = '', cardMaterial = '', cardReport = '', cardScore = '';

        /* 左：学生 + 知识点库 */
        var leftHTML = '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>选择学生</h3></div>' +
          studentList(st.classId, st.studentId, null) + '</div>' +
          '<div class="card mt16"><div class="card-head"><h3><span class="card-title-dot"></span>知识点库</h3>' +
          '<span class="badge gray">' + kbPool.length + ' 个</span></div>' +
          '<div class="field"><label>课程体系（按学生自动匹配）</label>' +
          '<select class="select" id="kbSysSel">' +
          kbSysList.map(function (s) {
            return '<option value="' + esc(s) + '" ' + (s === sysNow ? 'selected' : '') + '>' + esc(s) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="tiny muted" style="line-height:1.8">薄弱知识点的候选、逐题知识点的联想都取自该体系。</div>' +
          '<div class="row wrap" style="gap:8px;margin-top:10px">' +
          '<button class="btn sm" id="kbImportBtn">导入体系知识点</button>' +
          '<button class="btn sm ghost" id="kbManageBtn">管理</button></div></div>';

        /* ---- 卡：试卷信息 ---- */
        cardInfo = '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>试卷信息 · ' + esc(cur2.en) + '</h3>' +
          '<span class="badge">' + esc(sysNow) + '</span></div>';

        cardInfo += '<div class="field"><label>试卷名称</label><input class="input" id="paPaperName" value="' + esc(draft.paperName || '') + '" placeholder="如 2025 May 0606 Paper 11（留空则用关联测验名）"></div>';

        cardInfo += '<div class="grid g-3" style="gap:10px">' +
          '<div class="field"><label>关联测验</label><select class="select" id="paExam"><option value="">不关联</option>' +
          examsOfClass.map(function (e) {
            return '<option value="' + e.id + '" ' + (draft.examId === e.id ? 'selected' : '') + '>' + esc(e.name) + '（' + U.dateLabel(e.date) + '）</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>满分</label><input class="input" id="paFull" inputmode="decimal" value="' + esc(draft.full) + '" placeholder="60"></div>' +
          '<div class="field"><label>学生得分</label><input class="input" id="paScore" inputmode="decimal" value="' + esc(draft.score) + '" placeholder="48"></div>' +
          '</div></div>';

        /* ---- 卡：试卷材料（截图 + 评分标准 + 知识点） ---- */
        cardMaterial = '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>试卷材料</h3>' +
          '<span class="sub">截图仅本地存档；知识点按当前体系给出</span></div>';

        cardMaterial += '<div class="row between wrap mb8"><strong style="font-size:13px">试卷截图</strong>' +
          '<span class="tiny muted">⌘V / Ctrl+V 直接粘贴，可多张</span></div>';
        cardMaterial += '<div class="img-strip" id="paImgs"></div>';
        if (!draft.images.length) {
          cardMaterial += '<div class="paste-zone" id="paPasteZone">📋 在这里按 ⌘V 粘贴试卷截图（只存在本机，不上传）</div>';
        }

        cardMaterial += '<div class="field mt12"><label>评分标准 / 答案要点（强烈建议填，决定分析精度）</label>' +
          '<textarea class="textarea" id="paMark" rows="4" placeholder="粘贴 mark scheme 或答案要点，例如：&#10;13(iii) 百分比增减 (1.53-1.50)/1.50×100% = 2% …&#10;20 正六边形：对称轴 6 条，旋转对称阶数 6 …">' + esc(draft.markScheme) + '</textarea></div>';

        cardMaterial += '<div class="field"><label>卷面记录（可粘贴错题与批改说明）</label>' +
          '<textarea class="textarea" id="paText" rows="3" placeholder="例如：第 8 题配方漏项；第 10 题只写答案没有过程…">' + esc(draft.text) + '</textarea></div>';

        var sugg = (draft.suggest || []).slice();
        /* 匹配到的排前面，其余体系知识点跟在后面 */
        var baseTags = kbPool.filter(function (t) { return sugg.indexOf(t) >= 0; })
          .concat(sugg.filter(function (t) { return kbPool.indexOf(t) < 0; }))
          .concat(kbPool.filter(function (t) { return sugg.indexOf(t) < 0; }));
        var customTags = draft.tags.filter(function (t) { return baseTags.indexOf(t) < 0; });
        var allMatched = sugg.length && sugg.every(function (t) { return draft.tags.indexOf(t) >= 0; });
        cardMaterial += '<div class="field"><label id="paTagLabel">' + tagLabelText(sysNow, kbPool, draft.tags) + '</label>' +
          '<div class="chip-row" id="paTags">' +
          baseTags.map(function (t) {
            var on = draft.tags.indexOf(t) >= 0;
            var hit = sugg.indexOf(t) >= 0;
            return '<button class="chip ' + (on ? 'active' : '') + (hit ? ' matched' : '') + '" data-tag="' + esc(t) + '"' +
              (hit ? ' title="由分析结果匹配"' : '') + '>' + esc(t) +
              (on ? '<span class="chip-x" data-tagdel="' + esc(t) + '" title="删除该知识点">✕</span>' : '') +
              '</button>';
          }).join('') +
          /* 手填/匹配到但库里没有的知识点，带 ✕ 可删除 */
          customTags.map(function (t) {
            return '<button class="chip active" data-tag="' + esc(t) + '" title="自定义知识点（点 ✕ 删除）">' + esc(t) +
              '<span class="chip-x" data-tagdel="' + esc(t) + '">✕</span></button>';
          }).join('') +
          (sugg.length ? '<button class="chip" id="paTagAll" style="border-style:dashed">' + (allMatched ? '取消匹配项' : '全选匹配项') + '</button>' : '') +
          '<button class="chip" id="paTagAdd">+ 自定义</button></div>' +
          '<div class="tiny muted mt8">' + (kbPool.length
            ? '候选来自「知识点库 · ' + esc(sysNow) + '」；点一下切换选中，选中后可点 ✕ 删除。'
            : '当前体系还没有知识点：点左侧「导入体系知识点」直接导入 Excel / 粘贴清单。') + '</div></div>';

        cardMaterial += '<div class="field"><label>卷面规范问题（辅助提示）</label><div class="chip-row" id="paLayout">' +
          LAYOUT_TAGS.map(function (t) {
            return '<button class="chip ' + (draft.layout.indexOf(t) >= 0 ? 'active' : '') + '" data-lay="' + esc(t) + '">' + esc(t) + '</button>';
          }).join('') + '</div></div>';
        cardMaterial += '</div>';

        /* ---- 卡：诊断报告（放在最上面） ---- */
        var reportText = draft.report || draft.comment || '';
        cardReport = '<div class="card mb16" id="paReportCard"><div class="card-head"><h3><span class="card-title-dot"></span>诊断报告</h3>' +
          (draft.model ? '<span class="badge gray">' + esc(draft.model) + '</span>' : '') + '</div>';

        cardReport += '<div class="report-bar">' +
          '<button class="btn primary" id="paPaste">✨ 粘贴分析结果</button>' +
          (App.ai.configured() ? '<button class="btn" id="paAI">AI 诊断</button>' : '') +
          '<button class="btn ghost" id="paToggle">' + (showRaw ? '预览排版' : '查看原文') + '</button>' +
          '<span class="spacer"></span>' +
          '<button class="btn sm" id="paCopy">复制</button>' +
          '<button class="btn sm primary" id="paSave">保存分析</button></div>';

        cardReport += '<div class="prog-line" id="paProg" style="display:none"></div>';

        if (showRaw) {
          cardReport += '<textarea class="textarea report-raw" id="paRaw" placeholder="报告原文（Markdown）」>' + esc(reportText) + '</textarea>';
        } else if (reportText) {
          cardReport += '<div class="report-body md-report" id="paReport">' + App.md.render(reportText) + '</div>';
        } else {
          cardReport += '<div class="empty" style="padding:26px 18px"><span class="ico">🧠</span>还没有诊断报告<br>' +
            '<span class="tiny">点「✨ 粘贴分析结果」，把别处生成的分析整段粘进来：<br>' +
            '系统会拆出正文，并把识别到的知识点<b>自动选中到下方「试卷材料」里</b>，可多选调整</span></div>';
        }
        cardReport += '</div>';

        /* ---- 卡：逐题得分（放最下面） ---- */
        cardScore = '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>逐题得分</h3>' +
          '<span class="sub">每题可标知识点，综合分析会按知识点算正确率</span></div>';

        cardScore += '<div class="row between wrap mb8" style="gap:8px">' +
          '<span class="tiny muted">题号 + 得分必填；满分与知识点可选</span>' +
          '<span class="row" style="gap:8px"><button class="btn sm" id="paAddRow">+ 添加一行</button>' +
          '<button class="btn sm primary" id="paSave2">保存分析</button></span></div>';

        cardScore += '<div class="table-wrap"><table class="score-tbl"><thead><tr>' +
          '<th class="q-no">题号</th><th class="q-num">得分</th><th class="q-num">满分</th>' +
          '<th class="q-topic">知识点</th><th>备注</th><th class="q-del"></th>' +
          '</tr></thead><tbody id="paRows">' + scoreRowsHTML(draft.scoreTable) + '</tbody></table></div>';
        cardScore += '<datalist id="paTopicList">' + kbPool.map(function (t) {
          return '<option value="' + esc(t) + '">';
        }).join('') + '</datalist>';
        cardScore += '<div class="score-heat" id="paHeat">' + heatHTML(draft.scoreTable) + '</div>';
        cardScore += '</div>';

        /* ---- 组装 ---- */
        html += '<div class="grid g-1-2"><div>' + leftHTML + '</div>' +
          '<div>' + cardReport + cardInfo + cardMaterial + cardScore + '</div></div>';

        /* ---- 卡 4：历史 ---- */
        html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>历史分析</h3>' +
          '<span class="sub">' + papers.length + ' 份</span></div>';
        if (!papers.length) html += '<div class="empty">还没有分析记录</div>';
        papers.forEach(function (p) {
          var ex = db.exams.filter(function (e) { return e.id === p.examId; })[0];
          var body = p.report || p.aiComment || '';
          var open = st.openPaper === p.id;
          var sc = ex ? ex.scores[p.studentId] : null;
          html += '<div class="note-card mb8"><div class="nc-head">' +
            '<span class="badge gray">' + U.dateLabel(p.date) + '</span>' +
            (ex ? '<span class="badge">' + esc(ex.name) + '</span>' : (p.paperName ? '<span class="badge gray">' + esc(p.paperName) + '</span>' : '')) +
            (sc != null && ex ? '<span class="badge mint">' + sc + '/' + ex.full + '</span>' : '') +
            '<span class="spacer"></span>' +
            '<button class="icon-btn" data-open-paper="' + p.id + '" title="展开/收起">' + (open ? '▴' : '▾') + '</button>' +
            '<button class="icon-btn" data-export-paper="' + p.id + '" title="导出 Word">⤓</button>' +
            '<button class="icon-btn" data-del-paper="' + p.id + '">✕</button></div>' +
            (open
              ? '<div class="report-body scroll md-report mt8">' + App.md.render(body) + '</div>'
              : '<div class="nc-text">' + esc(App.md.plain(body, 160)) + '</div>') +
            ((p.tags && p.tags.length) ? '<div class="chip-row mt8">' + p.tags.map(function (t) { return '<span class="badge rose">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            ((p.images && p.images.length) ? '<div class="img-strip">' + p.images.map(function (src) { return '<img class="thumb" src="' + src + '">'; }).join('') + '</div>' : '') +
            '</div>';
        });
        html += '</div>';

        html += '</div>';

        el.innerHTML = html;
        bindCommon(el, st, db);

        /* ---------- 逐题得分表 ---------- */
        function scoreRowsHTML(rows) {
          return rows.map(function (r, i) {
            return '<tr data-srow="' + i + '">' +
              '<td><input class="q-no" data-sf="no" value="' + esc(r.no || '') + '" placeholder="' + (i === 0 ? '13(iii)' : '') + '"></td>' +
              '<td><input class="q-num" data-sf="awarded" inputmode="decimal" value="' + esc(r.awarded == null ? '' : r.awarded) + '" placeholder="' + (i === 0 ? '0' : '') + '"></td>' +
              '<td><input class="q-num" data-sf="full" inputmode="decimal" value="' + esc(r.full == null ? '' : r.full) + '" placeholder="' + (i === 0 ? '2' : '') + '"></td>' +
              '<td><input class="q-topic" data-sf="topic" list="paTopicList" value="' + esc(r.topic || '') + '" placeholder="' + (i === 0 ? '选/填知识点' : '') + '"></td>' +
              '<td><input data-sf="note" value="' + esc(r.note || '') + '" placeholder="' + (i === 0 ? '如：只写答案没过程' : '') + '"></td>' +
              '<td class="q-del"><button class="icon-btn" data-sdel="' + i + '">✕</button></td></tr>';
          }).join('');
        }
        function heatHTML(rows) {
          var items = rows.filter(function (r) {
            var a = numOrNull(r.awarded), f = numOrNull(r.full);
            return String(r.no || '').trim() && a != null && f;
          });
          if (!items.length) return '<span class="tiny muted">填写题号与得分后，这里会显示逐题得分率</span>';
          var sumA = 0, sumF = 0;
          var chips = items.map(function (r) {
            var a = numOrNull(r.awarded), f = numOrNull(r.full);
            sumA += a; sumF += f;
            var p = Math.round(a / f * 100);
            var cls = p >= 85 ? 'high' : p >= 50 ? 'mid' : 'low';
            return '<span class="' + cls + '">' + esc(r.no) + ' ' + a + '/' + f + '</span>';
          }).join('');
          var rate = sumF ? Math.round(sumA / sumF * 100) : 0;
          return chips + '<span style="background:var(--p-100);color:var(--p-700);font-weight:600">合计 ' + Math.round(sumA * 100) / 100 + '/' + Math.round(sumF * 100) / 100 + ' · ' + rate + '%</span>';
        }

        var rowsBody = el.querySelector('#paRows');
        function rebindRows() {
          rowsBody.querySelectorAll('[data-srow]').forEach(function (tr) {
            var idx = parseInt(tr.dataset.srow, 10);
            tr.querySelectorAll('[data-sf]').forEach(function (inp) {
              inp.oninput = function () {
                draft.scoreTable[idx][inp.dataset.sf] = inp.value;
                el.querySelector('#paHeat').innerHTML = heatHTML(draft.scoreTable);
              };
            });
            var del = tr.querySelector('[data-sdel]');
            if (del) del.onclick = function () {
              draft.scoreTable.splice(idx, 1);
              while (draft.scoreTable.length < 3) draft.scoreTable.push({ no: '', awarded: '', full: '', topic: '', note: '' });
              rowsBody.innerHTML = scoreRowsHTML(draft.scoreTable);
              el.querySelector('#paHeat').innerHTML = heatHTML(draft.scoreTable);
              rebindRows();
            };
          });
        }
        rebindRows();

        el.querySelector('#paAddRow').onclick = function () {
          draft.scoreTable.push({ no: '', awarded: '', full: '', topic: '', note: '' });
          rowsBody.innerHTML = scoreRowsHTML(draft.scoreTable);
          rebindRows();
        };

        /* ---------- 测验联动 ---------- */
        el.querySelector('#paExam').onchange = function () {
          draft.examId = this.value;
          var ex = curExam();
          if (ex) {
            if (!draft.full) { draft.full = String(ex.full); el.querySelector('#paFull').value = ex.full; }
            var s = ex.scores[cur2.id];
            if (s != null) { draft.score = String(s); el.querySelector('#paScore').value = s; }
            if (!draft.paperName) draft.paperName = ex.name;
            if (!draft.text) { /* 保持 */ }
          }
        };
        el.querySelector('#paFull').oninput = function () { draft.full = this.value; };
        el.querySelector('#paPaperName').oninput = function () { draft.paperName = this.value; };
        el.querySelector('#paScore').oninput = function () { draft.score = this.value; };
        el.querySelector('#paMark').oninput = function () { draft.markScheme = this.value; };
        el.querySelector('#paText').oninput = function () { draft.text = this.value; };

        /* ---------- 截图：只接收粘贴，不做上传 ---------- */
        var imgBox = el.querySelector('#paImgs');
        function paintImgs() {
          imgBox.innerHTML = draft.images.map(function (src, i) {
            return '<div class="thumb-wrap"><img class="thumb" src="' + src + '"><span class="x" data-rmp="' + i + '">✕</span></div>';
          }).join('');
          imgBox.querySelectorAll('[data-rmp]').forEach(function (x) {
            x.onclick = function () { draft.images.splice(parseInt(x.dataset.rmp, 10), 1); paintImgs(); };
          });
          var zone = el.querySelector('#paPasteZone');
          if (zone) zone.style.display = draft.images.length ? 'none' : '';
        }
        paintImgs();


        /* ---------- 标签 ---------- */
        function syncTagAll() {
          var btn = el.querySelector('#paTagAll');
          var sg = draft.suggest || [];
          if (btn) btn.textContent = (sg.length && sg.every(function (x) { return draft.tags.indexOf(x) >= 0; })) ? '取消匹配项' : '全选匹配项';
          var lb = el.querySelector('#paTagLabel');
          if (lb) lb.textContent = tagLabelText(sysNow, kbPool, draft.tags);
        }
        el.querySelectorAll('#paTags [data-tag]').forEach(function (b) {
          b.onclick = function (ev) {
            var x = ev.target.closest ? ev.target.closest('[data-tagdel]') : null;
            if (x) {
              ev.stopPropagation();
              var t0 = x.dataset.tagdel;
              var drop = function () {
                draft.tags = draft.tags.filter(function (y) { return y !== t0; });
                App.render();
              };
              if (App.kb.has(sysNow, t0)) {
                App.ui.confirm('从「' + esc(sysNow) + '」知识点库删除「' + esc(t0) + '」？' +
                  '<br><span class="tiny muted">同时取消本次选中，之后该知识点不再出现在候选里</span>',
                  { danger: true, okLabel: '删除' }).then(function (ok) {
                    if (!ok) return;
                    App.kb.removeTopic(sysNow, t0);
                    drop();
                  });
              } else drop();
              return;
            }
            var t = b.dataset.tag;
            var i = draft.tags.indexOf(t);
            if (i >= 0) draft.tags.splice(i, 1); else draft.tags.push(t);
            b.classList.toggle('active');
            var xs = b.querySelector('[data-tagdel]');
            if (draft.tags.indexOf(t) >= 0) {
              if (!xs) b.insertAdjacentHTML('beforeend', '<span class="chip-x" data-tagdel="' + esc(t) + '" title="删除该知识点">✕</span>');
            } else if (xs) xs.remove();
            syncTagAll();
          };
        });
        var tagAllBtn = el.querySelector('#paTagAll');
        if (tagAllBtn) tagAllBtn.onclick = function () {
          var sg = (draft.suggest || []).slice();
          var all = sg.every(function (x) { return draft.tags.indexOf(x) >= 0; });
          if (all) {
            draft.tags = draft.tags.filter(function (x) { return sg.indexOf(x) < 0; });
          } else {
            sg.forEach(function (x) { if (draft.tags.indexOf(x) < 0) draft.tags.push(x); });
          }
          App.render();
          App.ui.toast(all ? '已取消全部匹配项' : '已选入 ' + sg.length + ' 个匹配项', 'ok');
        };
        el.querySelectorAll('[data-lay]').forEach(function (b) {
          b.onclick = function () {
            var t = b.dataset.lay;
            var i = draft.layout.indexOf(t);
            if (i >= 0) draft.layout.splice(i, 1); else draft.layout.push(t);
            b.classList.toggle('active');
          };
        });
        el.querySelector('#paTagAdd').onclick = function () {
          App.ui.prompt({ title: '添加知识点', label: '知识点名称', placeholder: '如 三角恒等变换' }).then(function (v) {
            if (!v) return;
            var added = App.kb.has(sysNow, v) ? false : App.kb.addOne(sysNow, '自定义', v);
            if (draft.tags.indexOf(v) < 0) draft.tags.push(v);
            App.render();
            App.ui.toast(added ? '已加入知识点库并选中' : '已选中「' + v + '」', 'ok');
          });
        };

        /* ---------- 知识点库 ---------- */
        /* 库里删掉的知识点，同时从当前草稿里撤掉（分析匹配来的保留，作为证据） */
        function pruneDraftTags() {
          var pool = App.kb.topics(sysNow);
          var sg = draft.suggest || [];
          draft.tags = draft.tags.filter(function (t) {
            return pool.indexOf(t) >= 0 || sg.indexOf(t) >= 0;
          });
        }
        var kbSel = el.querySelector('#kbSysSel');
        if (kbSel) kbSel.onchange = function () { draft.kbSystem = this.value; App.render(); };
        el.querySelector('#kbImportBtn').onclick = function () {
          App.kb.openImport(sysNow, function () { pruneDraftTags(); App.render(); });
        };
        el.querySelector('#kbManageBtn').onclick = function () {
          App.kb.openManage(sysNow, function () { pruneDraftTags(); App.render(); });
        };

        function collect() {
          draft.text = el.querySelector('#paText').value;
          draft.markScheme = el.querySelector('#paMark').value;
          draft.examId = el.querySelector('#paExam').value;
          draft.full = el.querySelector('#paFull').value;
          draft.score = el.querySelector('#paScore').value;
          draft.date = draft.date || U.todayISO();
          var ex0 = curExam();
          var pn = el.querySelector('#paPaperName');
          if (pn) draft.paperName = String(pn.value || '').trim();
          if (!draft.paperName) draft.paperName = ex0 ? ex0.name : '';
          return draft;
        }

        /* ---------- 深度诊断（可选，配置了接口才有按钮） ---------- */
        var aiBtn = el.querySelector('#paAI');
        if (aiBtn) aiBtn.onclick = function () {
          var d = collect();
          if (!App.ai.configured()) {
            App.ui.toast('未配置 AI 接口：直接在报告栏点「✨ 粘贴分析结果」即可，无需密钥', 'err', 5200);
            return;
          }
          var ex = curExam();
          var btn = el.querySelector('#paAI');
          var prog = el.querySelector('#paProg');
          btn.disabled = true;
          btn.textContent = '分析中…';
          prog.style.display = '';
          var msgEl = document.createElement('span');
          prog.innerHTML = '<span class="pulse"></span>';
          prog.appendChild(msgEl);
          msgEl.dataset.msg = '准备中…';
          msgEl.textContent = '准备中…';
          var t0 = Date.now();
          var timer = setInterval(function () {
            msgEl.textContent = msgEl.dataset.msg + '（' + Math.round((Date.now() - t0) / 1000) + 's）';
          }, 1000);

          App.ai.analyzePaper({
            student: cur2, exam: ex, className: U.clsName(st.classId), system: clsObj ? clsObj.system : '',
            paperName: d.paperName, date: d.date,
            score: scoreVal(), full: fullVal(),
            tags: d.tags, layout: d.layout, text: d.text, ocrText: d.ocrText,
            markScheme: d.markScheme, scoreTable: filledRows(), images: d.images
          }, function (stage, msg) {
            msgEl.dataset.msg = msg;
            msgEl.textContent = msg;
          }).then(function (r) {
            clearInterval(timer);
            prog.style.display = 'none';
            btn.disabled = false;
            btn.textContent = '✨ AI 深度诊断';
            d.report = r.report;
            d.comment = App.md.plain(r.report, 800);
            d.ocrText = r.transcript || '';
            d.model = r.model || '';
            d.usedOCR = r.usedOCR;
            st.reportRaw = false;
            App.render();
            App.ui.toast('诊断报告已生成' + (r.usedOCR ? '（含图片 OCR）' : ''), 'ok', 3000);
          }).catch(function (err) {
            clearInterval(timer);
            prog.style.display = 'none';
            btn.disabled = false;
            btn.textContent = '✨ AI 深度诊断';
            App.ui.toast(err.message || '分析失败', 'err', 6000);
          });
        };

        /* ---------- 粘贴分析结果（主路径，纯本地解析） ---------- */
        el.querySelector('#paPaste').onclick = function () {
          App.paperio.openPaste().then(function (r) {
            if (!r) return;
            var d = collect();
            d.report = r.report;
            d.comment = App.md.plain(r.report, 800);
            d.model = r.structured ? '粘贴导入 · 含结构' : '粘贴导入';
            /* 知识点：先按当前体系对齐到标准名，再全部选入 */
            var aligned = App.kb.align(sysNow, r.tags);
            d.suggest = aligned.slice();
            aligned.forEach(function (t) { if (d.tags.indexOf(t) < 0) d.tags.push(t); });
            /* 逐题得分：只在表格为空时填，避免覆盖手录数据 */
            var already = filledRows().length;
            if (r.scoreTable.length && !already) {
              d.scoreTable = r.scoreTable.map(function (row) {
                return {
                  no: row.no || '', awarded: row.awarded == null ? '' : row.awarded,
                  full: row.full == null ? '' : row.full,
                  topic: row.topic ? App.kb.align(sysNow, [row.topic])[0] : '',
                  note: row.note || ''
                };
              });
              while (d.scoreTable.length < 5) d.scoreTable.push({ no: '', awarded: '', full: '', topic: '', note: '' });
            }
            if (r.full != null && numOrNull(d.full) == null) d.full = String(r.full);
            if (r.score != null && scoreVal() == null) d.score = String(r.score);
            st.reportRaw = false;
            App.render();
            var msg = '已导入报告';
            if (r.tags.length) msg += '，匹配 ' + r.tags.length + ' 个知识点（已全选）';
            if (r.scoreTable.length && !already) msg += '，补入 ' + r.scoreTable.length + ' 行逐题得分';
            App.ui.toast(msg, 'ok', 3600);
            /* 滚到知识点区，先确认匹配结果，再往下看报告 */
            setTimeout(function () {
              var box = document.querySelector('#paTags');
              if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
          });
        };

        /* ---------- 报告工具 ---------- */
        el.querySelector('#paToggle').onclick = function () {
          if (st.reportRaw) {
            var ta = el.querySelector('#paRaw');
            if (ta) { draft.report = ta.value; draft.comment = App.md.plain(ta.value, 800); }
          }
          st.reportRaw = !st.reportRaw;
          App.render();
        };
        el.querySelector('#paCopy').onclick = function () {
          var t = draft.report || draft.comment || '';
          if (!t) { App.ui.toast('还没有报告', 'err'); return; }
          App.util.copy(t);
        };
        function doSave() {
          var d = collect();
          var ta = el.querySelector('#paRaw');
          if (ta) { d.report = ta.value; d.comment = App.md.plain(ta.value, 800); }
          var body = d.report || d.comment;
          if (!body) { App.ui.toast('先生成报告，或点「查看原文」手动填写', 'err'); document.querySelector('#paReportCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
          db.papers.push({
            id: 'pp_' + Date.now().toString(36), studentId: st.studentId, classId: st.classId,
            examId: d.examId || '', date: d.date || U.todayISO(), images: d.images.slice(),
            text: d.text, tags: d.tags.slice(), layout: d.layout.slice(),
            aiComment: d.comment || App.md.plain(body, 800),
            report: body,
            scoreTable: filledRows().map(function (r) {
              return { no: r.no, awarded: r.awarded, full: r.full, topic: r.topic || '', note: r.note };
            }),
            markScheme: d.markScheme, ocrText: d.ocrText, model: d.model || '',
            paperName: d.paperName || '', kbSystem: sysNow,
            full: fullVal(), score: scoreVal()
          });
          d.tags.forEach(function (t) {
            var dup = db.mistakes.some(function (m) { return m.studentId === st.studentId && m.topic === t && m.date === (d.date || U.todayISO()); });
            if (!dup) db.mistakes.push({ id: 'ms_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), studentId: st.studentId, classId: st.classId, topic: t, note: App.md.plain(body, 60), date: d.date || U.todayISO() });
          });
          App.store.save();
          st.paperDraft = null;
          st.reportRaw = false;
          App.render();
          App.ui.toast('分析已保存', 'ok');
        }
        el.querySelector('#paSave').onclick = doSave;
        var save2 = el.querySelector('#paSave2');
        if (save2) save2.onclick = doSave;

        el.querySelectorAll('[data-open-paper]').forEach(function (b) {
          b.onclick = function () {
            st.openPaper = st.openPaper === b.dataset.openPaper ? null : b.dataset.openPaper;
            App.render();
          };
        });
        el.querySelectorAll('[data-del-paper]').forEach(function (b) {
          b.onclick = function () {
            App.ui.confirm('删除这份分析记录？', { danger: true, okLabel: '删除' }).then(function (ok) {
              if (!ok) return;
              db.papers = db.papers.filter(function (p) { return p.id !== b.dataset.delPaper; });
              App.store.save(); App.render();
            });
          };
        });
        el.querySelectorAll('[data-export-paper]').forEach(function (b) {
          b.onclick = function () {
            var p = db.papers.filter(function (x) { return x.id === b.dataset.exportPaper; })[0];
            if (!p) return;
            var ex = db.exams.filter(function (e) { return e.id === p.examId; })[0];
            var body = p.report || p.aiComment || '';
            var scoreTbl = '';
            if (p.scoreTable && p.scoreTable.length) {
              scoreTbl = '<p><b>逐题得分：</b></p><table><thead><tr><th>题号</th><th>得分</th><th>满分</th><th>知识点</th><th>备注</th></tr></thead><tbody>' +
                p.scoreTable.map(function (r) {
                  return '<tr><td>' + esc(r.no) + '</td><td>' + esc(r.awarded) + '</td><td>' + esc(r.full) + '</td><td>' + esc(r.topic || '') + '</td><td>' + esc(r.note || '') + '</td></tr>';
                }).join('') + '</tbody></table>';
            }
            var tagLine = (p.tags && p.tags.length)
              ? '<p style="text-indent:0"><b>薄弱知识点：</b>' + p.tags.map(function (t) { return esc(t); }).join('、') + '</p>' : '';
            App.files.exportWord('试卷分析', '<h1>试卷分析报告</h1>' +
              '<div class="meta">' + esc(cur2.en) + '（' + esc(cur2.zh || '') + '） · ' + U.clsName(p.classId) + ' · ' + p.date + '</div>' +
              (ex ? '<p style="text-indent:0"><b>试卷：</b>' + esc(ex.name) + '　<b>得分：</b>' +
                (ex.scores[cur2.id] != null ? ex.scores[cur2.id] + '/' + ex.full : '—') + '</p>' : '') +
              scoreTbl +
              '<div class="line"></div>' + App.md.render(body) +
              '<div class="line"></div><p style="text-indent:0;color:#888;font-size:9.5pt">教师签名：Stella　　生成时间：' + U.todayISO() + '</p>',
              '试卷分析_' + cur2.en + '_' + p.date);
            App.ui.toast('Word 已导出', 'ok');
          };
        });
        return;
      }

      /* ============ 综合分析（单个学生：课堂 + 作业 + 测验 + 试卷） ============ */
      if (st.tab === 'summary') {
      var sumCls = U.cls(st.classId);
      var exams2 = U.examList(st.classId);
      var myPapers = db.papers.filter(function (p) { return p.studentId === st.studentId; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      var summaries = db.summaries.filter(function (s) { return s.studentId === st.studentId; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      var sd = st.summaryDraft && st.summaryDraft.studentId === st.studentId ? st.summaryDraft : null;
      if (!sd) {
        sd = st.summaryDraft = {
          studentId: st.studentId,
          exams: exams2.map(function (e) { return e.id; }),
          papers: myPapers.map(function (p) { return p.id; }),
          text: ''
        };
      }

      /* 按所选试卷的逐题知识点汇总正确率 */
      function kbStats() {
        var map = {}, order = [];
        sd.papers.map(function (id) { return db.papers.filter(function (x) { return x.id === id; })[0]; })
          .filter(Boolean)
          .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })
          .forEach(function (p) {
            var ex = db.exams.filter(function (e) { return e.id === p.examId; })[0];
            var pname = p.paperName || (ex ? ex.name : '') || '试卷分析';
            (p.scoreTable || []).forEach(function (r) {
              var a = parseFloat(r.awarded), f = parseFloat(r.full);
              if (!r.topic || isNaN(a) || isNaN(f) || !f) return;
              String(r.topic).split(/[、,，/／;；]/).forEach(function (one) {
                one = one.trim();
                if (!one) return;
                if (!map[one]) { map[one] = { topic: one, a: 0, f: 0, rows: [] }; order.push(one); }
                map[one].a += a; map[one].f += f;
                map[one].rows.push({ date: p.date, paper: pname, no: r.no, a: a, f: f, note: r.note || '' });
              });
            });
          });
        return order.map(function (t) {
          var o = map[t];
          o.rate = o.f ? Math.round(o.a / o.f * 100) : 0;
          return o;
        }).sort(function (x, y) { return x.rate - y.rate; });
      }

      html += '<div class="grid g-1-2">';
      html += '<div><div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>班级学生</h3>' +
        '<span class="sub">' + stus.length + ' 人</span></div>' +
        studentList(st.classId, st.studentId, null) + '</div>';
      html += '<div class="card mt16"><div class="card-head"><h3><span class="card-title-dot"></span>汇总范围</h3>' +
        '<span class="sub">' + esc(cur2.en) + '</span></div>';
      var nClassRec = db.records.filter(function (r) { return r.studentId === cur2.id && r.type === 'class'; }).length;
      var nHwRec = db.records.filter(function (r) { return r.studentId === cur2.id && r.type === 'homework'; }).length;
      html += '<div class="tiny muted mb8" style="line-height:1.8">材料：课堂记录 <b>' + nClassRec + '</b> 条 · 作业记录 <b>' + nHwRec +
        '</b> 条 · 已选试卷分析 <b>' + sd.papers.length + '</b> 份<br>课堂与作业记录自动取最近 3 条纳入，下面可勾选测验与试卷范围。</div>';
      html += '<div class="row wrap mb8" style="gap:6px">' +
        '<button class="btn sm ghost" id="sumAll">全选</button>' +
        '<button class="btn sm ghost" id="sumNone">清空</button>' +
        '<button class="btn sm ghost" id="sumLast3">近三次</button></div>';
      html += '<div class="tiny muted mb8">选择要纳入综合分析的测验</div>';
      if (!exams2.length) html += '<div class="empty">还没有测验成绩</div>';
      exams2.forEach(function (e) {
        var v = e.scores[cur2.id];
        var pv = v == null || v === '' ? null : U.round1(parseFloat(v) / (e.full || 100) * 100);
        html += '<label class="row" style="gap:8px;padding:6px 4px;cursor:pointer">' +
          '<input type="checkbox" data-sx="' + e.id + '" ' + (sd.exams.indexOf(e.id) >= 0 ? 'checked' : '') + '>' +
          '<span style="flex:1;font-size:12.5px">' + esc(e.name) + '</span>' +
          '<span class="tiny muted num">' + (pv == null ? '—' : v + '/' + e.full + ' · ' + pv + '%') + '</span></label>';
      });
      html += '<div class="divider"></div><div class="tiny muted mb8">纳入试卷分析记录</div>';
      if (!myPapers.length) html += '<div class="tiny muted">暂无</div>';
      myPapers.forEach(function (p) {
        html += '<label class="row" style="gap:8px;padding:6px 4px;cursor:pointer">' +
          '<input type="checkbox" data-sp="' + p.id + '" ' + (sd.papers.indexOf(p.id) >= 0 ? 'checked' : '') + '>' +
          '<span style="flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.dateLabel(p.date) + ' · ' + esc(p.paperName || '试卷分析') + '</span>' +
          '<span class="tiny muted">' + (p.tags || []).length + ' 标签</span></label>';
      });
      html += '<button class="btn primary block mt16" id="sumGen">汇总生成综合分析</button></div></div>';

      /* ---- 知识点正确率（按所选试卷的逐题知识点） ---- */
      var kbRows = kbStats();
      html += '<div><div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>知识点正确率</h3>' +
        '<span class="sub">按所选试卷的逐题知识点统计，点开看明细</span></div>';
      if (!kbRows.length) {
        html += '<div class="empty" style="padding:22px 16px">所选试卷还没有逐题知识点<br>' +
          '<span class="tiny">到「试卷分析 → 逐题得分」给每题标上知识点，这里就会自动统计</span></div>';
      } else {
        html += '<div class="kb-list">';
        kbRows.forEach(function (o) {
          var cls = o.rate >= 85 ? 'high' : o.rate >= 60 ? 'mid' : 'low';
          var open = !!(st.sumKbOpen && st.sumKbOpen[o.topic]);
          html += '<div class="kb-row" data-kbrow="' + esc(o.topic) + '">' +
            '<div class="kb-head"><span class="kb-name">' + esc(o.topic) + '</span>' +
            '<span class="kb-score num">' + Math.round(o.a * 100) / 100 + '/' + Math.round(o.f * 100) / 100 +
            ' · ' + o.rate + '%</span><span class="kb-caret">' + (open ? '▴' : '▾') + '</span></div>' +
            '<div class="kb-bar"><span class="' + cls + '" style="width:' + Math.max(2, o.rate) + '%"></span></div>' +
            '<div class="kb-detail"' + (open ? '' : ' style="display:none"') + '>' +
            o.rows.map(function (r) {
              return '<div class="kb-drow"><span class="badge gray">' + esc(r.date || '') + '</span>' +
                '<span class="kb-dname">' + esc(r.paper) + (r.no ? ' · 第 ' + esc(r.no) + ' 题' : '') + '</span>' +
                '<span class="num kb-dscore">' + r.a + '/' + r.f + '</span></div>' +
                (r.note ? '<div class="kb-dnote">' + esc(r.note) + '</div>' : '');
            }).join('') +
            '</div></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>综合分析 · ' + esc(cur2.en) + '</h3>' +
        '<div class="row" style="gap:6px"><button class="btn sm" id="sumSave">保存</button>' +
        '<button class="btn sm" id="sumWord">导出 Word</button></div></div>';
      html += '<textarea class="textarea" id="sumText" style="min-height:200px" placeholder="点击左侧「汇总生成综合分析」，会自动汇总课堂表现、作业情况、测验成绩与试卷分析（薄弱知识点）"><\/textarea>';

      html += '<div class="divider"></div><div class="tiny muted mb8">历史综合分析（' + summaries.length + '）</div>';
      if (!summaries.length) html += '<div class="empty">还没有保存过综合分析</div>';
      summaries.forEach(function (s) {
        html += '<div class="note-card mb8"><div class="nc-head"><span class="badge gray">' + U.dateLabel(s.date) + '</span>' +
          '<span class="tiny muted">汇总 ' + (s.exams || []).length + ' 次测验</span><span class="spacer"></span>' +
          '<button class="icon-btn" data-sum-word="' + s.id + '">⤓</button>' +
          '<button class="icon-btn" data-del-sum="' + s.id + '">✕</button></div>' +
          '<div class="nc-text">' + esc(s.text) + '</div></div>';
      });
      html += '</div></div></div>';

      el.innerHTML = html;
      bindCommon(el, st, db);
      var sumText = el.querySelector('#sumText');
      sumText.value = sd.text || '';
      sumText.addEventListener('input', function () { sd.text = sumText.value; });

      el.querySelectorAll('[data-sx]').forEach(function (cb) {
        cb.onchange = function () {
          var i = sd.exams.indexOf(cb.dataset.sx);
          if (cb.checked && i < 0) sd.exams.push(cb.dataset.sx);
          if (!cb.checked && i >= 0) sd.exams.splice(i, 1);
        };
      });
      el.querySelectorAll('[data-sp]').forEach(function (cb) {
        cb.onchange = function () {
          var i = sd.papers.indexOf(cb.dataset.sp);
          if (cb.checked && i < 0) sd.papers.push(cb.dataset.sp);
          if (!cb.checked && i >= 0) sd.papers.splice(i, 1);
        };
      });
      el.querySelector('#sumAll').onclick = function () {
        sd.exams = exams2.map(function (e) { return e.id; });
        sd.papers = myPapers.map(function (p) { return p.id; });
        App.render();
      };
      el.querySelector('#sumNone').onclick = function () {
        sd.exams = []; sd.papers = [];
        App.render();
      };
      el.querySelector('#sumLast3').onclick = function () {
        sd.exams = exams2.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
          .slice(0, 3).map(function (e) { return e.id; });
        sd.papers = myPapers.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); })
          .slice(0, 3).map(function (p) { return p.id; });
        App.render();
      };
      /* 知识点明细展开/收起 */
      el.querySelectorAll('[data-kbrow]').forEach(function (row) {
        row.querySelector('.kb-head').onclick = function () {
          var d = row.querySelector('.kb-detail');
          var caret = row.querySelector('.kb-caret');
          var open = d.style.display !== 'none';
          d.style.display = open ? 'none' : '';
          caret.textContent = open ? '▾' : '▴';
          st.sumKbOpen = st.sumKbOpen || {};
          if (open) delete st.sumKbOpen[row.dataset.kbrow];
          else st.sumKbOpen[row.dataset.kbrow] = 1;
        };
      });

      el.querySelector('#sumGen').onclick = function () {
        var items = sd.exams.map(function (id) {
          var e = db.exams.filter(function (x) { return x.id === id; })[0];
          return e ? { exam: e, score: e.scores[cur2.id] != null ? parseFloat(e.scores[cur2.id]) : null } : null;
        }).filter(Boolean).sort(function (a, b) { return (a.exam.date || '').localeCompare(b.exam.date || ''); });
        var ps = sd.papers.map(function (id) { return db.papers.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
        if (!items.length) { App.ui.toast('至少选择一次测验', 'err'); return; }

        var classNotes = db.records.filter(function (r) { return r.studentId === cur2.id && r.type === 'class'; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 3);
        var hwNotes = db.records.filter(function (r) { return r.studentId === cur2.id && r.type === 'homework'; })
          .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 3);
        var kbRows2 = kbStats();
        var kbTxt = kbRows2.map(function (o) { return o.topic + ' ' + o.rate + '%'; }).join('；');
        var classTxt = classNotes.map(function (r) { return '（' + r.date + '）' + r.text; }).join(' ');
        var hwTxt = hwNotes.map(function (r) { return '（' + r.date + '）' + r.text; }).join(' ');

        if (!App.ai.configured()) {
          sd.text = App.ai.summaryComment({
            student: cur2, items: items, papers: ps,
            classNote: classTxt.slice(0, 200), homeNote: hwTxt.slice(0, 200), kb: kbRows2
          });
          sumText.value = sd.text;
          App.ui.toast('已用本地模板汇总（配置 AI 可获得更细腻的评语）', 'ok', 3000);
          return;
        }
        var btn = el.querySelector('#sumGen');
        btn.disabled = true; btn.textContent = '生成中…';
        var prompt = '请根据以下材料，为一位国际数学课程学生写一段 400-500 字的中文综合评语，直接输出正文，分 3 段，不要用编号列表，不要加标题。\n' +
          '学生：' + cur2.en + '（' + cur2.zh + '），班级：' + U.clsName(st.classId) + '，课程体系：' + (sumCls ? sumCls.system : '') + '\n' +
          '【一、测验成绩】' + items.map(function (i) {
            return i.exam.name + '(' + i.exam.date + ') ' + (i.score == null ? '缺考'
              : i.score + '/' + i.exam.full + (i.exam.full ? '（' + U.round1(i.score / i.exam.full * 100) + '%）' : ''));
          }).join('；') + '\n' +
          '【二、课堂表现】' + (classTxt || '暂无记录') + '\n' +
          '【三、作业情况】' + (hwTxt || '暂无记录') + '\n' +
          '【四、试卷分析】' + (ps.length ? ps.map(function (p) {
            var weak = mdSection(p.report || p.aiComment, ['知识点薄弱', '薄弱项', '逐题失分']);
            var norm = mdSection(p.report || p.aiComment, ['卷面', '规范']);
            return '【' + (p.date || '') + '】' + (p.tags || []).join('、') +
              (weak ? '｜薄弱点：' + App.md.plain(weak, 260) : '') +
              (norm ? '｜规范：' + App.md.plain(norm, 120) : '');
          }).join('\n') : '暂无记录') + '\n' +
          '【五、知识点正确率】' + (kbTxt || '暂无逐题知识点数据') + '\n' +
          '要求：1）第一段整合课堂表现与作业情况，写清具体行为与变化，不要只说"认真"；' +
          '2）第二段讲测验成绩与知识点掌握，必须引用具体分数、正确率（如"判别式 60%"）与题号依据；' +
          '3）第三段给出三条下一阶段可执行建议（写清题量/频率/检验方式）；' +
          '4）四类材料都要用到，若某类缺失就跳过，不要编造；5）语气专业、有温度，禁止「继续努力」「再接再厉」这类空话。';
        App.ai.chat({ prompt: prompt, temperature: 0.4, maxTokens: 2400, timeout: 180000 }).then(function (t) {
          sd.text = t; sumText.value = t;
          btn.disabled = false; btn.textContent = '汇总生成综合分析';
          App.ui.toast('AI 综合分析已生成', 'ok');
        }).catch(function (e) {
          sd.text = App.ai.summaryComment({
            student: cur2, items: items, papers: ps,
            classNote: classTxt.slice(0, 200), homeNote: hwTxt.slice(0, 200), kb: kbRows2
          });
          sumText.value = sd.text;
          btn.disabled = false; btn.textContent = '汇总生成综合分析';
          App.ui.toast(e.message + '（已用本地模板生成）', 'err', 4000);
        });
      };

      el.querySelector('#sumSave').onclick = function () {
        var t = sumText.value.trim();
        if (!t) { App.ui.toast('评语为空', 'err'); return; }
        db.summaries.push({
          id: 'sm_' + Date.now().toString(36), studentId: st.studentId, classId: st.classId,
          date: U.todayISO(), exams: sd.exams.slice(), papers: sd.papers.slice(), text: t
        });
        App.store.save(); st.summaryDraft = null; App.render();
        App.ui.toast('综合分析已保存', 'ok');
      };

      function exportSum(text, examIds) {
        var rows = (examIds || []).map(function (id) {
          var e = db.exams.filter(function (x) { return x.id === id; })[0];
          return e ? '<p style="text-indent:0">· ' + esc(e.name) + '（' + e.date + '）：' + (e.scores[cur2.id] != null ? e.scores[cur2.id] + '/' + e.full : '缺考') + '</p>' : '';
        }).join('');
        App.files.exportWord('综合分析', '<h1>学生综合分析</h1>' +
          '<div class="meta">' + esc(cur2.en) + '（' + esc(cur2.zh || '') + '） · ' + U.clsName(st.classId) + ' · ' + U.todayISO() + '</div>' +
          '<h2>阶段成绩</h2>' + (rows || '<p style="text-indent:0">—</p>') +
          '<h2>综合分析</h2><p>' + esc(text).replace(/\n/g, '</p><p>') + '</p>' +
          '<div class="line"></div><p style="text-indent:0;color:#888;font-size:9.5pt">教师签名：Stella　　生成时间：' + U.todayISO() + '</p>',
          '综合分析_' + cur2.en + '_' + U.todayISO());
        App.ui.toast('Word 已导出', 'ok');
      }

      el.querySelector('#sumWord').onclick = function () {
        var t = sumText.value.trim();
        if (!t) { App.ui.toast('先生成综合分析', 'err'); return; }
        exportSum(t, sd.exams);
      };
      el.querySelectorAll('[data-sum-word]').forEach(function (b) {
        b.onclick = function () {
          var s = db.summaries.filter(function (x) { return x.id === b.dataset.sumWord; })[0];
          if (s) exportSum(s.text, s.exams);
        };
      });
      el.querySelectorAll('[data-del-sum]').forEach(function (b) {
        b.onclick = function () {
          db.summaries = db.summaries.filter(function (x) { return x.id !== b.dataset.delSum; });
          App.store.save(); App.render();
        };
      });
      return;
      }
    }
  };

  function bindCommon(el, st, db) {
    var U = App.util;
    el.querySelectorAll('[data-acls]').forEach(function (b) {
      b.onclick = function () {
        st.classId = b.dataset.acls; st.studentId = null; st.examId = null;
        st.paperDraft = null; st.summaryDraft = null;
        db.meta.currentClassId = st.classId; App.store.save(); App.refreshTopbar(); App.render();
      };
    });
    el.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { st.tab = b.dataset.tab; App.render(); };
    });
    el.querySelectorAll('[data-stu]').forEach(function (b) {
      b.onclick = function () {
        st.studentId = b.dataset.stu;
        st.paperDraft = null; st.summaryDraft = null; st.draftImages = [];
        App.render();
      };
    });
  }

  /* ---------------- 截图：页面级 ⌘V，只作用于「试卷分析」草稿 ---------------- */
  document.addEventListener('paste', function (e) {
    var st = App.state && App.state.analytics;
    if (!st || st.tab !== 'papers') return;
    var draft = st.paperDraft;
    if (!draft || !e.clipboardData) return;
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
    var files = [];
    Array.prototype.forEach.call(e.clipboardData.items || [], function (it) {
      if (it.type && it.type.indexOf('image/') === 0) {
        var f = it.getAsFile();
        if (f) files.push(f);
      }
    });
    if (!files.length) return;
    e.preventDefault();
    Promise.all(files.map(function (f) { return App.files.readImage(f, 1400); })).then(function (arr) {
      arr.forEach(function (a) { if (draft.images.length < 12) draft.images.push(a); });
      App.render();
      App.ui.toast('已粘贴 ' + arr.length + ' 张截图', 'ok');
    }).catch(function () { App.ui.toast('截图读取失败', 'err'); });
  });
})();
