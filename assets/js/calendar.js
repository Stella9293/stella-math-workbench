/* ==========================================================
   calendar.js — 校历：解析 / 管理 / 放假倒计时
   数据：db.calendar = [{ id, name, start:'YYYY-MM-DD', end:'', kind }]
   kind: holiday | exam | term（只影响颜色，不影响计算）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function toDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length < 3) return new Date(NaN);
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  /* 纯日期差（都归到当天中午，避开夏令时/时区） */
  function diffDays(a, b) {
    var A = toDate(a), B = toDate(b);
    if (isNaN(A) || isNaN(B)) return 0;
    A.setHours(12, 0, 0, 0); B.setHours(12, 0, 0, 0);
    return Math.round((B - A) / 86400000);
  }
  function addDays(iso, n) {
    var d = toDate(iso);
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function today() { return App.util.todayISO(); }
  function esc(s) { return App.util.esc(s); }

  /* 学年起始年：7 月及以后算今年，否则算上一年（用于「10月1日」这类没写年份的日期） */
  function baseYear() {
    var t = new Date();
    return t.getMonth() + 1 >= 7 ? t.getFullYear() : t.getFullYear() - 1;
  }

  function kindOf(name) {
    var n = String(name || '');
    /* 补课 / 调课：落在周末或假期里，但当天要上课 → 算工作日 */
    if (/补课|补班|补上|调课|调休上课|正常上课/.test(n)) return 'makeup';
    if (/考试|模考|期中|期末|月考|测验|统考|测评/.test(n)) return 'exam';
    if (/开学|报到|注册|返校|军训|入学报到/.test(n)) return 'term';
    return 'holiday';
  }

  var KIND_LABEL = { holiday: '假期', exam: '考试', term: '开学', makeup: '补课' };
  function kindLabel(k) { return KIND_LABEL[k] || '假期'; }

  function list() {
    var c = (App.store.db && App.store.db.calendar) || [];
    return c.slice().sort(function (a, b) {
      return String(a.start).localeCompare(String(b.start)) || String(a.name).localeCompare(String(b.name));
    });
  }

  /* ---------------- 计算 ---------------- */
  /* 最近一个「正在假期中」或「还没开始」的节点；kind 可选（'holiday' 只看放假） */
  function next(kind) {
    var t = today(), items = list(), running = null, upcoming = null;
    items.forEach(function (e) {
      if (!e || !e.start) return;
      if (kind && e.kind !== kind) return;
      var end = e.end || e.start;
      if (e.start <= t && t <= end) {
        if (!running || String(e.start) > String(running.start)) running = e;
      } else if (e.start > t) {
        if (!upcoming || String(e.start) < String(upcoming.start)) upcoming = e;
      }
    });
    if (running) return { state: 'in', ev: running, days: Math.max(0, diffDays(t, running.end || running.start)) };
    if (upcoming) return { state: 'before', ev: upcoming, days: Math.max(0, diffDays(t, upcoming.start)) };
    return null;
  }

  function upcoming(n) {
    var t = today();
    return list().filter(function (e) { return e && e.start && e.start >= t; }).slice(0, n || 3);
  }

  function semester() {
    var meta = (App.store.db && App.store.db.meta) || {};
    var weeks = parseInt(meta.semesterWeeks, 10) || 20;
    var start = meta.semesterStart || App.util.thisWeek();
    var total = weeks * 7;
    var passed = Math.max(0, Math.min(total, diffDays(start, today()) + 1));
    return {
      weeks: weeks,
      start: start,
      end: addDays(start, total - 1),
      passed: passed,
      left: Math.max(0, total - passed),
      pct: Math.round(passed / total * 100)
    };
  }

  /* ✓ 工作日口径：周一～周五，且不在校历「假期」节点覆盖的日期里
     （考试、开学这类节点照常算工作日；「补课」节点即使在周末/假期里也算工作日） */

  /* 某类节点在 [from,to] 内覆盖到的日期 → 节点名 */
  function dateMap(kind, fromISO, toISO) {
    var map = {};
    list().forEach(function (e) {
      if (!e || !e.start || e.kind !== kind) return;
      var end = (e.end && e.end >= e.start) ? e.end : e.start;
      if (end < fromISO || e.start > toISO) return;
      var d = e.start < fromISO ? fromISO : e.start;
      var stop = end > toISO ? toISO : end;
      var guard = 0;
      while (d <= stop && guard < 800) {
        if (!map[d]) map[d] = e.name;
        d = addDays(d, 1); guard++;
      }
    });
    return map;
  }

  function holidayMap(fromISO, toISO) { return dateMap('holiday', fromISO, toISO); }

  /* 区间天数构成：自然日 / 周末 / 校历假期 / 补课日 / 工作日（含首尾） */
  function workStats(fromISO, toISO) {
    var out = { total: 0, weekend: 0, holiday: 0, makeup: 0, work: 0 };
    if (!fromISO || !toISO || toISO < fromISO) return out;
    var hol = dateMap('holiday', fromISO, toISO);
    var mk = dateMap('makeup', fromISO, toISO);
    var d = fromISO, guard = 0;
    while (d <= toISO && guard < 1200) {
      var w = toDate(d).getDay();
      out.total++;
      if (mk[d]) {                       /* 补课日优先：周末/假期里的补课照样算工作日 */
        out.makeup++; out.work++;
      } else if (w === 0 || w === 6) {
        out.weekend++;
      } else if (hol[d]) {
        out.holiday++;
      } else {
        out.work++;
      }
      d = addDays(d, 1); guard++;
    }
    return out;
  }

  /* ---------------- 解析 ---------------- */
  function normDigits(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/．/g, '.');
  }

  function parseText(text, opt) {
    opt = opt || {};
    var base = opt.baseYear || baseYear();
    var out = [];
    normDigits(text).split(/\r?\n/).forEach(function (raw) {
      var line = String(raw).trim();
      if (!line) return;
      var dates = [];
      var work = line;

      /* ① 带年份：2026年10月1日 / 2026-10-01 / 2026.10.1 / 2026/10/1 */
      work = work.replace(/(\d{4})\s*[年\-\/\.]\s*(\d{1,2})\s*[月\-\/\.]\s*(\d{1,2})\s*[日号]?/g, function (m, y, mo, d) {
        var mo2 = parseInt(mo, 10), d2 = parseInt(d, 10);
        if (mo2 < 1 || mo2 > 12 || d2 < 1 || d2 > 31) return ' ';
        dates.push(isoOf(new Date(parseInt(y, 10), mo2 - 1, d2)));
        return ' ';
      });

      /* ② 不带年份：10月1日 / 10.1 / 10/1（按学年推年份） */
      work = work.replace(/(\d{1,2})\s*[月\-\/\.]\s*(\d{1,2})\s*[日号]?/g, function (m, mo, d) {
        var mo2 = parseInt(mo, 10), d2 = parseInt(d, 10);
        if (mo2 < 1 || mo2 > 12 || d2 < 1 || d2 > 31) return m;
        var y = mo2 >= 7 ? base : base + 1;
        dates.push(isoOf(new Date(y, mo2 - 1, d2)));
        return ' ';
      });

      if (!dates.length) return;

      var name = work
        .replace(/[（(【\[]/g, ' ')
        .replace(/[）)】\]]/g, ' ')
        .replace(/第\s*\d+\s*周/g, ' ')
        /* 只把「夹在两个日期中间」的 至/到 当分隔符，避免吃掉「报到」「冬至」 */
        .replace(/\s+[至到]\s+/g, ' ')
        .replace(/[—–~～\-—:：,，、·|]/g, ' ')
        .replace(/周[一二三四五六日天]|星期[一二三四五六日天]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!name) {
        if (/第\s*\d+\s*周/.test(line)) return;
        name = '假期';
      }
      if (/^(名称|日期|开始|结束|备注|时间|月份|校历)$/.test(name)) return;
      if (/^第?\s*\d+\s*周?$/.test(name)) return;
      if (name.length > 24) name = name.slice(0, 24);

      var uniq = [];
      dates.forEach(function (x) { if (uniq.indexOf(x) < 0) uniq.push(x); });
      out.push({ name: name, start: uniq[0], end: uniq[1] || '', kind: kindOf(name) });
    });
    return out;
  }

  /* Excel 日期序列号（1900 基准） */
  function serialToISO(n) {
    var ms = Date.UTC(1899, 11, 30) + n * 86400000;
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function flexDate(v, base) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' || /^\d{5}$/.test(String(v).trim())) {
      var n = Number(v);
      if (n > 20000 && n < 60000) return serialToISO(n);
    }
    var s = normDigits(v).trim();
    var m = s.match(/(\d{4})\s*[年\-\/\.]\s*(\d{1,2})\s*[月\-\/\.]\s*(\d{1,2})/);
    if (m) return isoOf(new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    m = s.match(/^(\d{1,2})\s*[月\-\/\.]\s*(\d{1,2})\s*[日号]?$/);
    if (m) {
      var mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
      var y = mo >= 7 ? (base || baseYear()) : (base || baseYear()) + 1;
      return isoOf(new Date(y, mo - 1, d));
    }
    return '';
  }

  function parseRows(rows) {
    if (!rows || !rows.length) return [];
    var head = (rows[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); });
    var idx = { name: -1, start: -1, end: -1 };
    head.forEach(function (h, i) {
      if (idx.name < 0 && /名称|假期|节日|事件|节点|项目|内容/.test(h)) idx.name = i;
      if (idx.start < 0 && /开始|起始|起|日期/.test(h)) idx.start = i;
      if (idx.end < 0 && /结束|截止|末|止/.test(h)) idx.end = i;
    });
    var body = rows, base = baseYear();
    if (idx.name >= 0 || idx.start >= 0) {
      body = rows.slice(1);
    } else {
      idx = { name: 0, start: 1, end: 2 };
    }
    var out = [];
    body.forEach(function (r) {
      r = r || [];
      var st = flexDate(r[idx.start], base);
      if (!st) return;
      var nm = idx.name >= 0 ? String(r[idx.name] == null ? '' : r[idx.name]).trim() : '';
      if (!nm || /^(名称|日期)$/.test(nm)) nm = '假期';
      out.push({ name: nm.slice(0, 24), start: st, end: idx.end >= 0 ? flexDate(r[idx.end], base) : '', kind: kindOf(nm) });
    });
    return out;
  }

  /* ---------------- 写入 ---------------- */
  function uid() {
    return 'cal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function merge(items) {
    var db = App.store.db;
    if (!Array.isArray(db.calendar)) db.calendar = [];
    var added = 0, updated = 0;
    (items || []).forEach(function (it) {
      if (!it || !it.start) return;
      var same = db.calendar.filter(function (e) { return e.start === it.start && e.name === it.name; })[0];
      if (same) {
        if (it.end && same.end !== it.end) { same.end = it.end; updated++; }
        return;
      }
      db.calendar.push({
        id: uid(), name: it.name, start: it.start, end: it.end || '', kind: it.kind || kindOf(it.name)
      });
      added++;
    });
    if (added || updated) App.store.save();
    return { added: added, updated: updated };
  }

  function remove(id) {
    var db = App.store.db;
    db.calendar = (db.calendar || []).filter(function (e) { return e.id !== id; });
    App.store.save();
  }

  function clear() {
    App.store.db.calendar = [];
    App.store.save();
  }

  /* 典型校历模板（方便老师先有一份再改） */
  function sampleItems() {
    var y = baseYear();
    return [
      { name: '开学', start: y + '-09-01', end: '', kind: 'term' },
      { name: '国庆节', start: y + '-10-01', end: y + '-10-07', kind: 'holiday' },
      { name: '调休补课', start: y + '-10-10', end: '', kind: 'makeup' },
      { name: '期中考试', start: y + '-11-09', end: y + '-11-13', kind: 'exam' },
      { name: '元旦', start: (y + 1) + '-01-01', end: '', kind: 'holiday' },
      { name: '期末考试', start: (y + 1) + '-01-12', end: (y + 1) + '-01-16', kind: 'exam' },
      { name: '寒假', start: (y + 1) + '-01-18', end: (y + 1) + '-02-20', kind: 'holiday' }
    ];
  }

  /* ---------------- 首页卡片 ---------------- */
  function eventLine(e) {
    var t = today();
    var st = String(e.start);
    var label = st < t ? '已开始' : (diffDays(t, st) === 0 ? '今天' : '还有 ' + diffDays(t, st) + ' 天');
    return '<div class="cal-ev ' + (e.kind || 'holiday') + '">' +
      '<span class="tag"></span>' +
      '<span class="t">' + esc(e.name) + '</span>' +
      '<span class="n">' + App.util.dateLabel(st) + ' · ' + label + '</span></div>';
  }

  function cardHTML() {
    var db = App.store.db, U = App.util;
    var has = (db.calendar || []).length > 0;
    /* 大数字优先看「放假」；校历里没有假期节点时才退到最近任意节点 */
    var nxt = next('holiday') || next();
    var semi = semester();
    var h = '<div class="card cal-card mb16' + (nxt && nxt.state === 'in' ? ' in' : '') + '">';

    h += '<div class="card-head"><h3><span class="card-title-dot"></span>校历 · 放假倒计时</h3>' +
      '<div class="row wrap" style="gap:8px">' +
      '<span class="sub">' + U.weekNoLabel(U.thisWeek()) + ' · 共 ' + semi.weeks + ' 周</span>' +
      '<button class="btn sm" data-cal="import">导入校历</button>' +
      (has ? '<button class="btn sm ghost" data-cal="manage">管理</button>' : '') +
      '</div></div>';

    if (!has) {
      h += '<div class="cal-empty">' +
        '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3M8 17h6"/></svg>' +
        '<div class="ce-t">还没有导入校历</div>' +
        '<div class="tiny">把校历文字粘贴进来（或导入 Excel / CSV），就能算出距离最近假期还有多少个工作日</div>' +
        '<button class="btn primary sm mt12" data-cal="import">导入校历</button>' +
        '</div>';
      h += '</div>';
      return h;
    }

    if (!nxt) {
      h += '<div class="cal-empty"><div class="ce-t">校历里没有未来的节点了</div>' +
        '<div class="tiny">可以点「管理」补充下一个学期，或重新导入新的校历</div></div>';
      h += '</div>';
      return h;
    }

    var ev = nxt.ev;
    var startD = toDate(ev.start);
    var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][startD.getDay()];
    var span = ev.end ? diffDays(ev.start, ev.end) + 1 : 0;
    var spanLabel = ev.kind === 'exam' ? '考试 ' : (ev.kind === 'term' ? '共 ' : (ev.kind === 'makeup' ? '补课 ' : '假期 '));

    h += '<div class="cal-body"><div class="cal-main">';
    if (nxt.state === 'in') {
      h += '<div class="cal-k">「' + esc(ev.name) + '」进行中</div>' +
        '<div class="cal-v">' + nxt.days + '<small>天后结束</small></div>' +
        '<div class="cal-d">' + (startD.getMonth() + 1) + '月' + startD.getDate() + '日 - ' +
        (ev.end ? (toDate(ev.end).getMonth() + 1) + '月' + toDate(ev.end).getDate() + '日' : '单日') +
        (span ? ' · 共 ' + span + ' 天' : '') + '</div>';
    } else {
      /* 工作日倒计时：今天 → 假期前一天，跳过周六周日 + 校历里录入的假期 */
      var ws = workStats(today(), addDays(ev.start, -1));
      var natDays = diffDays(today(), ev.start);
      var parts = ['含今天', '跳过周末 ' + ws.weekend + ' 天'];
      if (ws.makeup) parts.push('补课 ' + ws.makeup + ' 天照算');
      if (ws.holiday) parts.push('扣校历假期 ' + ws.holiday + ' 天');
      h += '<div class="cal-k">距离「' + esc(ev.name) + '」还有</div>' +
        '<div class="cal-v">' + ws.work + '<small>个工作日</small></div>' +
        '<div class="cal-d">' + (startD.getMonth() + 1) + '月' + startD.getDate() + '日 · ' + wk +
        ' · 自然日 ' + natDays + ' 天' + (span ? ' · ' + spanLabel + span + ' 天' : '') + '</div>' +
        '<div class="cal-note">' + parts.join(' · ') + '</div>';
    }
    h += '</div><div class="cal-side"><div class="cal-side-t">接下来的节点</div>';
    var up = upcoming(4).filter(function (e) { return e.id !== ev.id; });
    if (!up.length) h += '<div class="tiny muted">后面还没有排节点</div>';
    up.forEach(function (e) { h += eventLine(e); });
    h += '</div></div>';

    /* 校历里有「开学」但和课表里的学期起始对不上 → 给一个一键对齐的小链接 */
    var termEv = null;
    list().forEach(function (e) {
      if (e.kind !== 'term' || !e.start) return;
      if (!termEv || String(e.name).indexOf('开学') >= 0) termEv = e;
    });
    var alignBtn = '';
    if (termEv && App.util.weekStart(termEv.start) !== semi.start) {
      alignBtn = '<button class="cal-align" data-cal-align="' + termEv.start + '">按校历「' + esc(termEv.name) + '」对齐学期进度</button>';
    }

    h += '<div class="cal-prog">' +
      '<div class="cal-prog-head"><span>学期进度 · 第 ' + U.weekNo(U.thisWeek()) + ' / ' + semi.weeks + ' 周</span>' +
      '<span>' + semi.pct + '%</span></div>' +
      '<div class="cal-bar"><i style="width:' + semi.pct + '%"></i></div>' +
      '<div class="cal-prog-foot">' + U.dateLabel(semi.start) + ' - ' + U.dateLabel(semi.end) +
      ' · 还剩 ' + semi.left + ' 天 · 其中工作日 ' + workStats(today(), semi.end).work + ' 天' + alignBtn + '</div></div>';

    h += '</div>';
    return h;
  }

  function bind(el) {
    if (!el) return;
    el.querySelectorAll('[data-cal]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.cal === 'manage') openManage();
        else openImport();
      };
    });
    el.querySelectorAll('[data-cal-align]').forEach(function (b) {
      b.onclick = function () {
        var db = App.store.db;
        db.meta.semesterStart = App.util.weekStart(b.dataset.calAlign);
        App.store.save();
        if (App.render) App.render();
        App.ui.toast('学期进度已对齐到校历开学日', 'ok', 2600);
      };
    });
  }

  /* ---------------- 导入弹窗 ---------------- */
  function openImport() {
    var U = App.util;
    var body = '' +
      '<div class="field"><label>粘贴校历文字（一行一个节点，日期在前后都行）</label>' +
      '<textarea class="textarea" id="calText" rows="7" spellcheck="false" placeholder="2026年9月1日 开学\n国庆节 2026-10-01 至 2026-10-07\n期中考试 11月9日-11月13日\n寒假：2027年1月18日 — 2027年2月20日"></textarea></div>' +
      '<div class="row wrap mt8" style="gap:8px">' +
      '<button class="btn sm" id="calPick">选择 Excel / CSV</button>' +
      '<button class="btn sm ghost" id="calTpl">下载模板</button>' +
      '<span class="tiny muted" id="calFileName">支持 .xlsx / .csv / .txt</span>' +
      '</div>' +
      '<div id="calPreview" class="cal-prev mt12"></div>';

    var m = App.ui.modal({
      title: '导入校历',
      width: 660,
      body: body,
      footer: [
        { label: '关闭', cls: 'ghost', onClick: function (close) { close(); } },
        {
          label: '用示例填一下', onClick: function (close, root) {
            var lines = sampleItems().map(function (s) {
              return s.name + ' ' + s.start + (s.end ? ' 至 ' + s.end : '');
            });
            root.querySelector('#calText').value = lines.join('\n');
            if (m._onSample) m._onSample();
          }
        },
        {
          label: '导入', cls: 'primary', onClick: function () {
            if (m._apply) m._apply();
          }
        }
      ]
    });

    var root = m.root;
    var ta = root.querySelector('#calText');
    var prev = root.querySelector('#calPreview');
    var btn = root.querySelector('.modal-foot .primary');
    var fileItems = [];

    function collect() { return parseText(ta.value).concat(fileItems); }

    function refresh() {
      var its = collect();
      if (btn) {
        btn.disabled = !its.length;
        btn.textContent = its.length ? '导入 ' + its.length + ' 个节点' : '导入';
      }
      if (!its.length) {
        prev.innerHTML = '<div class="tiny muted">还没有识别到日期。直接粘贴校历原文即可，例如「2026年10月1日 国庆节」。</div>';
        return;
      }
      var h = '<div class="tiny muted mb8">识别到 ' + its.length + ' 个节点，确认后写入校历：</div>' +
        '<div class="table-wrap" style="max-height:168px;overflow:auto"><table class="tb">' +
        '<thead><tr><th>名称</th><th>开始</th><th>结束</th><th>类型</th></tr></thead><tbody>';
      its.forEach(function (it) {
        h += '<tr><td>' + U.esc(it.name) + '</td><td class="num">' + it.start + '</td>' +
          '<td class="num">' + (it.end || '—') + '</td>' +
          '<td><span class="cal-kind ' + (it.kind || 'holiday') + '">' + kindLabel(it.kind) + '</span></td></tr>';
      });
      h += '</tbody></table></div>';
      prev.innerHTML = h;
    }

    ta.addEventListener('input', refresh);
    refresh();

    root.querySelector('#calPick').onclick = function () {
      App.files.pick({ accept: '.xlsx,.csv,.txt' }).then(function (files) {
        if (!files || !files[0]) return;
        root.querySelector('#calFileName').textContent = files[0].name;
        App.files.readTable(files[0]).then(function (rows) {
          fileItems = parseRows(rows);
          if (!fileItems.length) App.ui.toast('表里没找到日期列，需要「名称 / 开始 / 结束」三列', 'err', 3600);
          refresh();
        })['catch'](function (e) { App.ui.toast(e.message || '读取失败', 'err', 3600); });
      });
    };

    root.querySelector('#calTpl').onclick = function () {
      var y = baseYear();
      App.files.downloadCSV('校历模板.csv', [
        ['名称', '开始日期', '结束日期'],
        ['国庆节', y + '-10-01', y + '-10-07'],
        ['期中考试', y + '-11-09', y + '-11-13'],
        ['调休补课', y + '-10-10', ''],
        ['寒假', (y + 1) + '-01-18', (y + 1) + '-02-20']
      ]);
    };

    m._onSample = function () {
      fileItems = [];
      refresh();
    };

    m._apply = function () {
      var its = collect();
      if (!its.length) return;
      var r = merge(its);
      m.close();
      if (App.render) App.render();
      var n = r.added + r.updated;
      App.ui.toast(n ? '已导入 ' + n + ' 个校历节点' : '这些节点已经在校历里了', n ? 'ok' : '', 2600);
    };
  }

  /* ---------------- 管理弹窗 ---------------- */
  function openManage() {
    var U = App.util;
    var body = '' +
      '<div id="calRows"></div>' +
      '<div class="cal-add">' +
      '<div class="field-row">' +
      '<div class="field" style="flex:1.5"><label>名称</label><input class="input" id="calName" placeholder="如 寒假 / 调休补课"></div>' +
      '<div class="field"><label>开始</label><input class="input" id="calStart" type="date"></div>' +
      '<div class="field"><label>结束（选填）</label><input class="input" id="calEnd" type="date"></div>' +
      '<div class="field" style="flex:0 0 108px"><label>类型</label><select class="select" id="calKind">' +
      '<option value="">自动</option>' +
      '<option value="holiday">假期</option>' +
      '<option value="exam">考试</option>' +
      '<option value="term">开学</option>' +
      '<option value="makeup">补课日</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="tiny muted mt8">「补课日」那天即使在周末或假期里，也算一个工作日</div>' +
      '</div>';

    var m = App.ui.modal({
      title: '校历节点',
      width: 700,
      body: body,
      footer: [
        { label: '关闭', cls: 'ghost', onClick: function (close) { close(); } },
        { label: '添加节点', cls: 'primary', onClick: function () { addNode(); } }
      ]
    });
    var root = m.root;

    function rowsInner() {
      var items = list();
      if (!items.length) return '<div class="tiny muted" style="padding:6px 0 10px">还没有节点，用下面的表单加一条，或点首页「导入校历」。</div>';
      var h = '<div class="table-wrap" style="max-height:300px;overflow:auto"><table class="tb">' +
        '<thead><tr><th>名称</th><th>开始</th><th>结束</th><th>类型</th><th></th></tr></thead><tbody>';
      items.forEach(function (e) {
        h += '<tr><td>' + U.esc(e.name) + '</td>' +
          '<td class="num">' + e.start + '</td>' +
          '<td class="num">' + (e.end || '—') + '</td>' +
          '<td><span class="cal-kind ' + (e.kind || 'holiday') + '">' + kindLabel(e.kind) + '</span></td>' +
          '<td class="right"><button class="icon-btn del" data-caldel="' + e.id + '">✕</button></td></tr>';
      });
      h += '</tbody></table></div>' +
        '<div class="row mt8" style="gap:8px"><span class="tiny muted">共 ' + items.length + ' 个节点</span>' +
        '<div style="flex:1"></div><button class="btn sm ghost" id="calClearAll">清空校历</button></div>';
      return h;
    }

    function repaint() {
      root.querySelector('#calRows').innerHTML = rowsInner();
      root.querySelectorAll('[data-caldel]').forEach(function (b) {
        b.onclick = function () {
          remove(b.dataset.caldel);
          repaint();
          if (App.render) App.render();
        };
      });
      var clr = root.querySelector('#calClearAll');
      if (clr) clr.onclick = function () {
        App.ui.confirm('清空后会删掉所有校历节点（学生数据不受影响），确定？', { danger: true, okLabel: '清空' }).then(function (ok) {
          if (!ok) return;
          clear();
          repaint();
          if (App.render) App.render();
          App.ui.toast('校历已清空', 'ok');
        });
      };
    }

    repaint();

    function addNode() {
      var name = root.querySelector('#calName').value.trim();
      var st = root.querySelector('#calStart').value;
      var en = root.querySelector('#calEnd').value;
      var kd = root.querySelector('#calKind').value;
      if (!name) return App.ui.toast('先填名称', 'err');
      if (!st) return App.ui.toast('先选开始日期', 'err');
      if (en && en < st) return App.ui.toast('结束日期不能早于开始日期', 'err');
      merge([{ name: name, start: st, end: en, kind: kd || kindOf(name) }]);
      root.querySelector('#calName').value = '';
      root.querySelector('#calStart').value = '';
      root.querySelector('#calEnd').value = '';
      root.querySelector('#calKind').value = '';
      repaint();
      if (App.render) App.render();
      App.ui.toast('已添加', 'ok');
    }
  }

  App.cal = {
    list: list,
    next: next,
    upcoming: upcoming,
    semester: semester,
    parseText: parseText,
    parseRows: parseRows,
    merge: merge,
    remove: remove,
    clear: clear,
    cardHTML: cardHTML,
    bind: bind,
    openImport: openImport,
    openManage: openManage,
    workStats: workStats,
    kindOf: kindOf,
    kindLabel: kindLabel,
    workdays: function (a, b) { return workStats(a, b).work; },
    holidayMap: holidayMap,
    days: diffDays
  };
})();
