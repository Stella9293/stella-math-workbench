/* ==========================================================
   kb.js — 课程体系 × 知识点库
   作用：每个课程体系（IGCSE 0606 / 0580 / A-Level / IB …）各有一套知识点，
        试卷分析里的薄弱知识点候选、逐题知识点的联想，都从这里取。
   存储：db.syllabus = [{ id, system, module, topic }]
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  /* ---------------- 预置知识点（可导入覆盖/增补） ---------------- */
  var DEFAULT = [
    { system: 'IGCSE 0606', module: '函数', topics: ['函数与图像', '二次函数顶点式', '二次函数配方', '判别式与根的关系', '指数与对数', '对数运算法则', '绝对值方程与不等式'] },
    { system: 'IGCSE 0606', module: '三角', topics: ['弧度制与扇形', '三角恒等变换', '三角方程', '解三角形'] },
    { system: 'IGCSE 0606', module: '微积分', topics: ['导数与切线', '微分法则', '积分换元', '运动学应用'] },
    { system: 'IGCSE 0606', module: '几何与向量', topics: ['向量运算', '直线方程', '圆的方程', '几何证明'] },
    { system: 'IGCSE 0606', module: '统计与概率', topics: ['排列组合', '二项展开', '概率与统计'] },

    { system: 'IGCSE 0580', module: '数与运算', topics: ['数与运算', '百分数增减', '比例与估算', '标准形式'] },
    { system: 'IGCSE 0580', module: '代数', topics: ['代数式化简', '因式分解', '一元一次方程', '一元二次方程', '联立方程', '不等式', '数列'] },
    { system: 'IGCSE 0580', module: '函数', topics: ['一次函数图像', '二次函数图像', '函数变换'] },
    { system: 'IGCSE 0580', module: '几何', topics: ['相似与全等', '圆的性质', '三角比', '坐标几何', '对称与旋转'] },
    { system: 'IGCSE 0580', module: '统计', topics: ['统计图表', '平均数与中位数', '概率'] },

    { system: 'A-Level', module: '纯数 P1/P2', topics: ['二次函数配方', '判别式与根的关系', '指数与对数', '对数运算法则', '三角恒等变换', '三角方程', '数列与级数', '二项展开'] },
    { system: 'A-Level', module: '纯数 P3', topics: ['向量运算', '复数', '矩阵', '参数方程', '微分法则', '导数与切线', '积分换元', '微分方程'] },
    { system: 'A-Level', module: '统计与力学', topics: ['概率分布', '正态分布', '假设检验', '运动学', '力与平衡', '动量'] },

    { system: 'IB', module: 'AA / AI', topics: ['函数与变换', '数列', '复数', '向量', '概率', '统计', '微分', '积分', '三角恒等变换', '参数方程'] }
  ];

  var SYSTEM_ORDER = ['IGCSE 0606', 'IGCSE 0580', 'A-Level', 'IB'];

  function entries() { return App.store.db.syllabus || (App.store.db.syllabus = []); }

  function flatten() {
    var out = [];
    DEFAULT.forEach(function (g) {
      g.topics.forEach(function (t) {
        out.push({ id: U.uid('kb'), system: g.system, module: g.module, topic: t });
      });
    });
    return out;
  }

  /* 首次使用灌入预置库；用户清空后不再自动补回 */
  (function ensure() {
    var db = App.store.db;
    if (!Array.isArray(db.syllabus)) db.syllabus = [];
    if (!db.meta) db.meta = {};
    if (!db.syllabus.length && !db.meta.kbSeeded) {
      db.syllabus = flatten();
      db.meta.kbSeeded = 1;
      try { App.store.save(); } catch (e) { }
    }
  })();

  function systems() {
    var seen = {}, out = [];
    entries().forEach(function (e) {
      if (!e.system || seen[e.system]) return;
      seen[e.system] = 1; out.push(e.system);
    });
    out.sort(function (a, b) {
      var ia = SYSTEM_ORDER.indexOf(a), ib = SYSTEM_ORDER.indexOf(b);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    return out;
  }

  function list(system) {
    return entries().filter(function (e) { return !system || e.system === system; });
  }

  function topics(system) {
    var seen = {}, out = [];
    list(system).forEach(function (e) {
      if (e.topic && !seen[e.topic]) { seen[e.topic] = 1; out.push(e.topic); }
    });
    return out;
  }

  function has(system, topic) {
    return entries().some(function (e) { return e.system === system && e.topic === topic; });
  }

  /* ---------------- 体系判定：先看班级名（含 0606/0580），再看学生体系 ---------------- */
  function systemOf(stu, cls) {
    var clsName = (cls && cls.name) || '';
    var sysName = (stu && stu.system) || (cls && cls.system) || '';
    var hay = clsName + ' ' + sysName;
    if (/0606/.test(hay)) return 'IGCSE 0606';
    if (/0580/.test(hay)) return 'IGCSE 0580';
    if (/A[\s-]?Level|P[1-4]\b|爱德思|Edexcel|CIE/i.test(hay)) return 'A-Level';
    if (/(^|\W)IB(\W|$)|HL|SL/.test(hay)) return 'IB';
    return sysName || (systems()[0] || '通用');
  }

  /* 知识点名称归一，便于跨写法对齐 */
  function norm(t) {
    return String(t || '')
      .replace(/[\s·、,，.。()（）\-—_]/g, '')
      .replace(/知识点|专题|技巧|方法/g, '')
      .toLowerCase();
  }

  /* 把外部解析出来的候选，尽量对齐到库里的标准名 */
  function align(system, tags) {
    var pool = topics(system);
    return (tags || []).map(function (t) {
      var n = norm(t);
      if (!n) return t;
      var hit = pool.filter(function (p) { return norm(p) === n; })[0];
      if (hit) return hit;
      hit = pool.filter(function (p) {
        var np = norm(p);
        return np.indexOf(n) >= 0 || n.indexOf(np) >= 0;
      }).sort(function (a, b) { return Math.abs(a.length - n.length) - Math.abs(b.length - n.length); })[0];
      return hit || t;
    }).filter(function (t, i, arr) {
      return t && arr.indexOf(t) === i;
    });
  }

  /* ---------------- 写入 ---------------- */
  function addMany(rows) {
    var db = App.store.db;
    var added = 0, skipped = 0;
    rows.forEach(function (r) {
      var system = String(r.system || '').trim();
      var topic = String(r.topic || '').trim();
      if (!system || !topic) return;
      if (has(system, topic)) { skipped++; return; }
      db.syllabus.push({ id: U.uid('kb'), system: system, module: String(r.module || '').trim() || '未分组', topic: topic });
      added++;
    });
    if (added) App.store.save();
    return { added: added, skipped: skipped };
  }

  function addOne(system, module, topic) {
    return addMany([{ system: system, module: module, topic: topic }]).added > 0;
  }

  function removeTopic(system, topic) {
    var db = App.store.db;
    var before = db.syllabus.length;
    db.syllabus = db.syllabus.filter(function (e) { return !(e.system === system && e.topic === topic); });
    if (db.syllabus.length !== before) { App.store.save(); return true; }
    return false;
  }

  function removeSystem(system) {
    var db = App.store.db;
    db.syllabus = db.syllabus.filter(function (e) { return e.system !== system; });
    App.store.save();
  }

  /* ---------------- 导入：解析 ---------------- */
  function splitLine(line) {
    if (line.indexOf('\t') >= 0) return line.split('\t');
    if (/[|｜]/.test(line)) return line.split(/[|｜]/);
    if (/[,，;；]/.test(line)) return line.split(/[,，;；]/);
    return [line];
  }

  function isHeader(cells) {
    var s = cells.join('');
    return /课程体系|体系|模块|知识点/.test(s) && !/题|分/.test(s);
  }

  /* rows: 二维数组；defSystem：默认体系
     有表头时按「体系/模块/知识点」列名定位，没有表头时按位置（体系,模块,知识点） */
  function parseRows(rows, defSystem) {
    var out = [], map = null;
    (rows || []).forEach(function (row, i) {
      if (!row) return;
      var cells = row.map(function (c) { return String(c == null ? '' : c).trim(); });
      var filled = cells.filter(function (c) { return c !== ''; });
      if (!filled.length) return;
      if (i === 0 && isHeader(cells)) {
        map = {};
        cells.forEach(function (h, idx) {
          if (/体系|系统|课程/.test(h) && map.system == null) map.system = idx;
          else if (/模块|单元|章节|主题|分类/.test(h) && map.module == null) map.module = idx;
          else if (/知识点|考点|知识项|内容/.test(h) && map.topic == null) map.topic = idx;
        });
        return;
      }
      if (map && map.topic != null) {
        var tp = cells[map.topic] || '';
        if (!tp) return;
        out.push({
          system: String((map.system != null && cells[map.system]) || defSystem || '').trim(),
          module: String((map.module != null && cells[map.module]) || '').trim(),
          topic: tp
        });
        return;
      }
      var system = defSystem, module = '', topic = '';
      if (filled.length >= 3) { system = filled[0]; module = filled[1]; topic = filled[2]; }
      else if (filled.length === 2) { module = filled[0]; topic = filled[1]; }
      else { topic = filled[0]; }
      if (!topic) return;
      out.push({ system: String(system || defSystem || '').trim(), module: module, topic: topic });
    });
    return out;
  }

  function parseText(text, defSystem) {
    return parseRows(String(text || '').split('\n').map(function (l) { return splitLine(l.trim()); }), defSystem);
  }

  /* ---------------- 导入弹窗 ---------------- */
  function openImport(defSystem, onChange) {
    var sysList = systems();
    var sys = defSystem || sysList[0] || 'IGCSE 0606';
    var state = { rows: [] };

    var m = App.ui.modal({
      title: '导入课程体系与知识点',
      width: 680,
      body: [
        '<div class="tiny muted" style="line-height:1.9;margin-bottom:10px">',
        '每行一条，支持三种写法：<b>体系,模块,知识点</b> / <b>模块,知识点</b> / <b>知识点</b>（后两种用下面选择的体系）。',
        '也可以直接选 Excel / CSV（表头含「体系、模块、知识点」即可，顺序不限）。',
        '</div>',
        '<div class="grid g-2" style="gap:10px">',
        '<div class="field"><label>默认课程体系</label>',
        '<input class="input" id="kbImpSys" list="kbSysList" value="' + U.esc(sys) + '" placeholder="如 IGCSE 0606">',
        '<datalist id="kbSysList">' + sysList.map(function (s) { return '<option value="' + U.esc(s) + '">'; }).join('') + '</datalist></div>',
        '<div class="field"><label>表格文件（可选）</label>',
        '<label class="btn block" style="cursor:pointer;text-align:center">📄 选择 .xlsx / .csv',
        '<input type="file" id="kbImpFile" accept=".xlsx,.xlsm,.csv,.txt" hidden></label></div>',
        '</div>',
        '<div class="field"><label>粘贴内容</label>',
        '<textarea class="textarea" id="kbImpText" style="min-height:150px" placeholder="IGCSE 0606,函数,二次函数配方&#10;IGCSE 0606,函数,判别式与根的关系&#10;三角,三角恒等变换&#10;向量运算"></textarea></div>',
        '<div class="paste-prev" id="kbImpPrev"><span class="tiny muted">粘贴或选文件后，这里显示解析结果</span></div>'
      ].join(''),
      footer: [
        { label: '取消', onClick: function (close) { close(); } },
        {
          label: '导入', cls: 'primary', onClick: function (close, root) {
            var rows = state.rows.length ? state.rows : parseText(root.querySelector('#kbImpText').value, root.querySelector('#kbImpSys').value.trim());
            if (!rows.length) { App.ui.toast('没有解析到知识点', 'err'); return; }
            var r = addMany(rows);
            close();
            App.ui.toast('已导入 ' + r.added + ' 个知识点' + (r.skipped ? '（' + r.skipped + ' 个已存在）' : ''), 'ok', 3000);
            onChange && onChange(root.querySelector('#kbImpSys').value.trim());
          }
        }
      ],
      onMount: function (root) {
        var ta = root.querySelector('#kbImpText');
        var prev = root.querySelector('#kbImpPrev');
        var sysInp = root.querySelector('#kbImpSys');

        function paint() {
          var rows = state.rows.length ? state.rows : parseText(ta.value, sysInp.value.trim());
          if (!rows.length) {
            prev.innerHTML = '<span class="tiny muted">粘贴或选文件后，这里显示解析结果</span>';
            return;
          }
          var bySys = {};
          rows.forEach(function (r) { bySys[r.system] = (bySys[r.system] || 0) + 1; });
          var chips = Object.keys(bySys).map(function (s) {
            return '<span class="chip">' + U.esc(s) + ' · ' + bySys[s] + ' 个</span>';
          }).join('');
          var sample = rows.slice(0, 6).map(function (r) { return '<span class="badge gray">' + U.esc(r.topic) + '</span>'; }).join(' ');
          prev.innerHTML = '<div class="tiny" style="margin-bottom:6px">共解析 <b>' + rows.length + '</b> 条 · 合并后 <b>' + Object.keys(bySys).length + '</b> 个体系</div>' +
            '<div class="chip-row">' + chips + '</div>' +
            (sample ? '<div class="tiny muted mt8">示例：' + sample + '</div>' : '');
        }

        ta.addEventListener('input', function () { state.rows = []; paint(); });
        sysInp.addEventListener('input', paint);
        root.querySelector('#kbImpFile').onchange = function () {
          var f = this.files && this.files[0];
          if (!f) return;
          App.files.readTable(f).then(function (rows) {
            state.rows = parseRows(rows, sysInp.value.trim());
            ta.value = '';
            paint();
            App.ui.toast('已读取 ' + f.name, 'ok');
          }).catch(function (e) { App.ui.toast(e.message || '读取失败', 'err', 4000); });
        };
        paint();
      }
    });
    return m;
  }

  /* ---------------- 管理弹窗：增删 ---------------- */
  function openManage(system, onChange) {
    var sys = system || systems()[0] || 'IGCSE 0606';

    var m = App.ui.modal({
      title: '知识点库管理',
      width: 700,
      body: '<div id="kbMgrBox"></div>',
      footer: [
        { label: '导入体系知识点', onClick: function (close, root) { openImport(root.querySelector('#kbMgrSys').value, function () { paint(); onChange && onChange(); }); } },
        { label: '完成', cls: 'primary', onClick: function (close) { close(); onChange && onChange(); } }
      ],
      onMount: function (root) {
        var box = root.querySelector('#kbMgrBox');

        function paint() {
          var sysList = systems();
          if (sysList.indexOf(sys) < 0) sys = sysList[0] || sys;
          var items = list(sys);
          var grouped = {};
          items.forEach(function (e) {
            var k = e.module || '未分组';
            (grouped[k] = grouped[k] || []).push(e);
          });
          var h = '<div class="row wrap" style="gap:8px;margin-bottom:12px">' +
            '<select class="select" id="kbMgrSys" style="max-width:220px">' +
            sysList.map(function (s) { return '<option value="' + U.esc(s) + '" ' + (s === sys ? 'selected' : '') + '>' + U.esc(s) + '</option>'; }).join('') +
            '</select>' +
            '<span class="tiny muted">共 ' + items.length + ' 个知识点</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn sm" id="kbMgrAdd">+ 添加</button>' +
            '<button class="btn sm ghost" id="kbMgrClear">清空该体系</button></div>';

          if (!items.length) h += '<div class="empty">这个体系还没有知识点，点「添加」或「导入体系知识点」</div>';
          Object.keys(grouped).forEach(function (mod) {
            h += '<div class="kb-group"><div class="kb-mod">' + U.esc(mod) + '</div><div class="chip-row">' +
              grouped[mod].map(function (e) {
                return '<span class="chip active" data-kbtopic="' + U.esc(e.topic) + '">' + U.esc(e.topic) +
                  '<span class="chip-x" data-kbdel="' + U.esc(e.topic) + '" title="删除">✕</span></span>';
              }).join('') + '</div></div>';
          });
          box.innerHTML = h;

          box.querySelector('#kbMgrSys').onchange = function () { sys = this.value; paint(); };
          box.querySelector('#kbMgrAdd').onclick = function () {
            App.ui.prompt({ title: '添加知识点', label: '名称', placeholder: '如 三角恒等变换' }).then(function (v) {
              if (!v) return;
              var mod = '未分组';
              if (addOne(sys, mod, v)) { paint(); App.ui.toast('已添加', 'ok'); }
              else App.ui.toast('该体系里已经有这个知识点了', 'err');
            });
          };
          box.querySelector('#kbMgrClear').onclick = function () {
            App.ui.confirm('清空「' + U.esc(sys) + '」下的全部知识点？', { danger: true, okLabel: '清空' }).then(function (ok) {
              if (!ok) return;
              removeSystem(sys);
              paint();
              App.ui.toast('已清空', 'ok');
            });
          };
          box.querySelectorAll('[data-kbdel]').forEach(function (x) {
            x.onclick = function (ev) {
              ev.stopPropagation();
              removeTopic(sys, x.dataset.kbdel);
              paint();
            };
          });
        }
        paint();
      }
    });
    return m;
  }

  App.kb = {
    DEFAULT: DEFAULT,
    systems: systems,
    list: list,
    topics: topics,
    has: has,
    systemOf: systemOf,
    align: align,
    addMany: addMany,
    addOne: addOne,
    removeTopic: removeTopic,
    removeSystem: removeSystem,
    parseRows: parseRows,
    parseText: parseText,
    openImport: openImport,
    openManage: openManage,
    reseed: function () {
      var db = App.store.db;
      db.syllabus = flatten();
      db.meta = db.meta || {};
      db.meta.kbSeeded = 1;
    }
  };
})();
