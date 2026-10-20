/* ==========================================================
   store.js — 数据层（localStorage 本地存储）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var KEY = 'stella_math_workbench_v1';

  var PALETTE = ['#8b7cf6', '#4fb79b', '#e8a44c', '#e8779b', '#6f9ff0', '#b48ae8', '#7eb86a', '#e8b64c'];
  App.PALETTE = PALETTE;

  function uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  /* ---------------- 周次（以周一为一周起点，用周一日期作为周标识） ---------------- */
  function parseISO(s) {
    var p = String(s || '').split('-');
    if (p.length < 3) return new Date();
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function mondayISO(dateStr) {
    var d = dateStr ? parseISO(dateStr) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return todayISO(d);
  }
  function addWeeksISO(wk, n) {
    var d = parseISO(wk || mondayISO());
    d.setDate(d.getDate() + 7 * (n || 0));
    return todayISO(d);
  }
  function weekLabelISO(wk) {
    var s = parseISO(wk || mondayISO());
    var e = parseISO(addWeeksISO(wk || mondayISO(), 1));
    e.setDate(e.getDate() - 1);
    return (s.getMonth() + 1) + '/' + s.getDate() + ' - ' + (e.getMonth() + 1) + '/' + e.getDate();
  }

  /* ---------------- 种子数据 ---------------- */
  function seed() {
    var c1 = uid('cls'), c2 = uid('cls'), c3 = uid('cls');
    var cls = [
      { id: c1, name: '一班 · IGCSE 0606', color: PALETTE[0], system: 'IGCSE', grade: 'G10', note: '周六上午，冲刺 Additional Maths', createdAt: todayISO() },
      { id: c2, name: '二班 · IGCSE 0580', color: PALETTE[1], system: 'IGCSE', grade: 'G9', note: '基础巩固班，每周两次', createdAt: todayISO() },
      { id: c3, name: '三班 · A-Level P3', color: PALETTE[2], system: 'A-Level', grade: 'A2', note: 'Pure 3 专题突破', createdAt: todayISO() }
    ];

    var students = [];
    function stu(clsId, en, zh, sys, email, phone) {
      var o = { id: uid('stu'), classId: clsId, en: en, zh: zh, system: sys, email: email || '', phone: phone || '', note: '' };
      students.push(o); return o;
    }
    var a1 = stu(c1, 'Alex Chen', '陈亦辰', 'IGCSE', 'alex.chen@parent.com', '13800138001');
    var a2 = stu(c1, 'Bella Wang', '王贝拉', 'IGCSE', 'bella.w@parent.com', '13800138002');
    var a3 = stu(c1, 'Kevin Liu', '刘凯文', 'IGCSE', 'kevin.liu@parent.com', '13800138003');
    var a4 = stu(c1, 'Sophia Zhang', '张思菲', 'IGCSE', 'sophia.z@parent.com', '13800138004');
    var a5 = stu(c1, 'Jason Wu', '吴嘉森', 'IGCSE', 'jason.wu@parent.com', '13800138005');
    var a6 = stu(c1, 'Emily Xu', '徐艾米', 'IGCSE', 'emily.xu@parent.com', '13800138006');
    var b1 = stu(c2, 'Ethan Li', '李一舟', 'IGCSE', 'ethan.li@parent.com', '13900139001');
    var b2 = stu(c2, 'Grace Zhou', '周雨洁', 'IGCSE', 'grace.zhou@parent.com', '13900139002');
    var b3 = stu(c2, 'Tony Huang', '黄天宇', 'IGCSE', 'tony.h@parent.com', '13900139003');
    var b4 = stu(c2, 'Lily Sun', '孙莉莉', 'IGCSE', 'lily.sun@parent.com', '13900139004');
    var b5 = stu(c2, 'Ryan Guo', '郭瑞安', 'IGCSE', 'ryan.guo@parent.com', '13900139005');
    var d1 = stu(c3, 'David Zhao', '赵一鸣', 'A-Level', 'david.zhao@parent.com', '13700137001');
    var d2 = stu(c3, 'Cindy Feng', '冯欣迪', 'A-Level', 'cindy.f@parent.com', '13700137002');
    var d3 = stu(c3, 'Michael Shen', '沈迈克', 'A-Level', 'michael.s@parent.com', '13700137003');

    var e1 = uid('ex'), e2 = uid('ex'), e3 = uid('ex'), e4 = uid('ex');
    var exams = [
      { id: e1, name: '0606 阶段测验 1', classId: c1, date: '2026-09-19', full: 60, scores: {} },
      { id: e2, name: '0606 阶段测验 2', classId: c1, date: '2026-10-10', full: 60, scores: {} },
      { id: e3, name: '0580 单元测验 · 代数', classId: c2, date: '2026-09-26', full: 50, scores: {} },
      { id: e4, name: 'P3 月考 · 微分', classId: c3, date: '2026-10-11', full: 75, scores: {} }
    ];
    exams[0].scores[a1.id] = 52; exams[0].scores[a2.id] = 47; exams[0].scores[a3.id] = 39;
    exams[0].scores[a4.id] = 55; exams[0].scores[a5.id] = 33; exams[0].scores[a6.id] = 44;
    exams[1].scores[a1.id] = 55; exams[1].scores[a2.id] = 50; exams[1].scores[a3.id] = 42;
    exams[1].scores[a4.id] = 57; exams[1].scores[a5.id] = 38; exams[1].scores[a6.id] = 48;
    exams[2].scores[b1.id] = 41; exams[2].scores[b2.id] = 45; exams[2].scores[b3.id] = 32;
    exams[2].scores[b4.id] = 47; exams[2].scores[b5.id] = 36;
    exams[3].scores[d1.id] = 63; exams[3].scores[d2.id] = 69; exams[3].scores[d3.id] = 51;

    var periods = [
      { name: '第 1 节', start: '08:00', end: '08:45' },
      { name: '第 2 节', start: '08:55', end: '09:40' },
      { name: '第 3 节', start: '10:00', end: '10:45' },
      { name: '第 4 节', start: '10:55', end: '11:40' },
      { name: '第 5 节', start: '13:30', end: '14:15' },
      { name: '第 6 节', start: '14:25', end: '15:10' },
      { name: '第 7 节', start: '15:30', end: '16:15' },
      { name: '第 8 节', start: '16:25', end: '17:10' }
    ];

    var slots = {};
    slots[c1] = ['1-p1', '1-p3', '3-p2', '3-p4', '6-p1', '6-p2'];
    slots[c2] = ['2-p2', '2-p4', '4-p2', '4-p4'];
    slots[c3] = ['2-p6', '3-p6', '6-p3'];

    function key(day, p) { return day + '-p' + p; }
    var contents1 = ['二次函数与判别式', '指数与对数方程', '三角函数图像变换', '向量与几何应用', '微积分初步：导数', '真题精讲 · 2024 Paper 1'];
    var contents2 = ['代数式化简与因式分解', '一元二次方程解法', '函数图像与变换', '几何证明专题'];
    var contents3 = ['P3 微分法则', '隐函数与参数方程求导', '积分技巧：换元与分部'];
    var entries = [];
    var wk = mondayISO(todayISO());
    var lw = addWeeksISO(wk, -1);
    var last1 = ['一次函数与图像', '二次函数一般式与顶点', '根与系数的关系', '相似三角形与比例', '统计图表与平均数', '真题精讲 · 2023 Paper 1'];
    slots[c1].forEach(function (k, i) { entries.push({ id: uid('ent'), classId: c1, key: k, content: contents1[i] || '', week: wk }); });
    slots[c2].forEach(function (k, i) { entries.push({ id: uid('ent'), classId: c2, key: k, content: contents2[i] || '', week: wk }); });
    slots[c3].forEach(function (k, i) { entries.push({ id: uid('ent'), classId: c3, key: k, content: contents3[i] || '', week: wk }); });
    slots[c1].forEach(function (k, i) { entries.push({ id: uid('ent'), classId: c1, key: k, content: last1[i] || '', week: lw }); });

    var tasks = [
      { id: uid('tk'), text: '整理 0606 十月测验成绩并录入系统', done: false, createdAt: todayISO() },
      { id: uid('tk'), text: '给 Kevin 家长发一次学习反馈', done: false, createdAt: todayISO() },
      { id: uid('tk'), text: '准备周六「三角函数图像变换」课件', done: true, createdAt: todayISO() }
    ];

    var curriculum = [
      {
        id: uid('cv'), name: 'IB', open: true, links: [], children: [
          { id: uid('cv'), name: 'SL', open: true, links: [{ id: uid('lk'), label: 'IB Math SL 大纲', type: 'url', url: 'https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/' }], children: [] },
          { id: uid('cv'), name: 'HL', open: true, links: [], children: [] }
        ]
      },
      {
        id: uid('cv'), name: 'A-Level', open: true, links: [], children: [
          {
            id: uid('cv'), name: 'Pure', open: true, links: [], children: [
              {
                id: uid('cv'), name: '爱德思 Edexcel', open: true, links: [], children: [
                  { id: uid('cv'), name: 'P1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'S1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'M1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'P3', open: true, links: [{ id: uid('lk'), label: 'P3 公式表 PDF', type: 'local', url: '/Users/stella/Teaching/Edexcel/P3/formula-book.pdf' }], children: [] }
                ]
              },
              {
                id: uid('cv'), name: 'CIE', open: true, links: [], children: [
                  { id: uid('cv'), name: 'P1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'S1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'M1', open: true, links: [], children: [] },
                  { id: uid('cv'), name: 'P3', open: true, links: [], children: [] }
                ]
              }
            ]
          },
          {
            id: uid('cv'), name: 'Further', open: true, links: [], children: [
              { id: uid('cv'), name: 'FP1', open: true, links: [], children: [] },
              { id: uid('cv'), name: 'FP2', open: true, links: [], children: [] }
            ]
          }
        ]
      },
      {
        id: uid('cv'), name: 'IGCSE', open: true, links: [], children: [
          { id: uid('cv'), name: '0580', open: true, links: [], children: [] },
          { id: uid('cv'), name: '0606', open: true, links: [{ id: uid('lk'), label: '0606 题库文件夹', type: 'local', url: '/Users/stella/Teaching/IGCSE/0606/papers' }], children: [] }
        ]
      },
      {
        id: uid('cv'), name: '竞赛', open: true, links: [], children: [
          { id: uid('cv'), name: 'AMC8', open: true, links: [], children: [] },
          { id: uid('cv'), name: 'AMC10', open: true, links: [], children: [] },
          { id: uid('cv'), name: 'AMC12', open: true, links: [], children: [] },
          { id: uid('cv'), name: 'STEP', open: true, links: [], children: [] },
          { id: uid('cv'), name: 'TMUA', open: true, links: [], children: [] }
        ]
      }
    ];

    var records = [
      { id: uid('rc'), classId: c1, studentId: a5.id, type: 'class', date: '2026-10-10', text: '本节课状态较前两周明显好转，能主动回答判别式相关问题；但在配方法步骤上仍然丢项，需要课后补练 5 题。', images: [] },
      { id: uid('rc'), classId: c1, studentId: a2.id, type: 'homework', date: '2026-10-12', text: '作业完成质量高，书写规范；第 7 题换元后忘记回代，已当面订正。', images: [] },
      { id: uid('rc'), classId: c1, studentId: a1.id, type: 'class', date: '2026-10-12', text: '课堂节奏跟得上，主动帮同学讲题；建议加强复杂分式方程的检验习惯。', images: [] }
    ];

    var examsRef = e1;
    var papers = [{
      id: uid('pp'), studentId: a5.id, classId: c1, examId: examsRef, date: '2026-10-13',
      images: [], text: '',
      tags: ['二次函数顶点式', '判别式与根的关系'],
      layout: ['步骤跳跃'],
      aiComment: 'Jason 本次测验 38/60。主要失分集中在二次函数配方与判别式的综合题（第 8、9 题），说明对「顶点式 ↔ 一般式」的转换还不够熟练；另外第 10 题解题步骤跳跃，缺少必要的文字说明与检验，卷面规范需要加强。建议：本周完成 5 道配方法专项练习，并按要求写出完整步骤。'
    }];

    var comms = [{
      id: uid('cm'), date: '2026-10-14', studentId: a3.id, tone: '温和',
      incoming: '老师您好，Kevin 这次测验好像考得不太好，他自己也挺沮丧的，是不是最近跟不上？我们家长也不太懂数学，不知道该怎么帮他。',
      replies: {
        a: 'Kevin 家长您好，感谢您的信任与及时沟通。这次测验 Kevin 拿到 42/60，相比上次进步了 3 分，说明他的基础在稳步提升。失分主要集中在二次函数配方和判别式的综合题上，这是本阶段的难点，班上多数孩子也遇到了困难，请您先不用过度担心。\n\n针对他的情况，我做了两点安排：一是课上会多给他一次板演机会，帮他建立信心；二是课后给他准备了 5 道配方专项练习，难度循序渐进。也建议您在家里这样鼓励他：不追问分数，而是问他「今天哪个步骤弄懂了」，让他把注意力放回过程。\n\n下周我会再和您同步一次他的课堂状态，有任何问题随时联系我。',
        b: 'Kevin 家长您好，收到您的消息了，特别理解您和孩子现在的心情。先给您一颗定心丸：Kevin 这次 42/60，比上次还高了 3 分，他其实是在往前走的，只是没有达到他自己的期待，所以才会沮丧——这恰恰说明他很在意。\n\n他真正卡住的地方是二次函数的配方和判别式，这块内容抽象，几乎每个孩子都要摔一跤。我已经给他单独准备了 5 道由易到难的练习，课上也会多请他讲一次思路。您这边只要做一件事：这几天别急着提分数，多问问他「今天哪个地方突然想通了」，让他重新找回「我能行」的感觉。\n\n孩子愿意为成绩难过，是好事。我们一起把这口气接住，下次他会更有底气。',
        en: 'Dear Kevin\'s parents,\n\nThank you for reaching out and for trusting me with this. Kevin scored 42/60 this time — actually 3 marks higher than his previous test, so he is making steady progress. The marks were mainly lost on completing the square and the discriminant, which is the hardest topic in this unit and a challenge for most of the class, so please don\'t worry too much.\n\nI have two things in place for him: he will have more chances to explain his reasoning in class to rebuild confidence, and I have prepared five carefully graded practice questions on completing the square for him to work through at home.\n\nOne suggestion for you: instead of asking about the score, try asking him "which step made sense to you today?" — this keeps his attention on the process rather than the result.\n\nI will update you on his classroom performance again next week. Please feel free to contact me anytime.'
      }
    }];

    var mistakes = [
      { id: uid('ms'), studentId: a5.id, classId: c1, topic: '二次函数配方', note: '第 8 题：配方时漏掉常数项，顶点坐标符号写反', date: '2026-10-13' },
      { id: uid('ms'), studentId: a3.id, classId: c1, topic: '对数运算法则', note: 'log 相加误写成相乘，换底公式记混', date: '2026-10-13' }
    ];

    return {
      meta: {
        version: 1, teacher: 'Stella', role: '数学老师', school: '', term: '2026 秋季学期',
        currentClassId: c1, maskNames: false, createdAt: todayISO(),
        semesterStart: addWeeksISO(wk, -3), semesterWeeks: 20
      },
      settings: {
        ai: { provider: 'deepseek', apiKey: '', baseURL: '', model: 'deepseek-chat', visionModel: '' }
      },
      classes: cls, students: students, tasks: tasks,
      periods: periods, slots: slots, entries: entries,
      curriculum: curriculum, records: records, exams: exams,
      papers: papers, comms: comms, mistakes: mistakes, summaries: []
    };
  }

  /* ---------------- 持久化 ---------------- */
  function normalize(d) {
    d = d || {};
    d.meta = d.meta || { teacher: 'Stella', currentClassId: null, maskNames: false };
    d.settings = d.settings || { ai: {} };
    d.settings.ai = d.settings.ai || {};
    ['classes', 'students', 'tasks', 'periods', 'entries', 'curriculum', 'records', 'exams', 'papers', 'comms', 'mistakes', 'summaries', 'syllabus'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    d.slots = d.slots || {};
    /* 旧数据（没有 week 的课时内容）归入当前周 */
    var wkNow = mondayISO(todayISO());
    d.entries.forEach(function (e) { if (!e.week) e.week = wkNow; });
    /* 学期：起始周（该周周一）与总周数 */
    if (!d.meta.semesterStart) d.meta.semesterStart = wkNow;
    if (!d.meta.semesterWeeks) d.meta.semesterWeeks = 20;
    return d;
  }

  /* ---------------- 本地持久化：localStorage 主存 + IndexedDB 冗余 ---------------- */
  var IDB_KEY = 'db';
  var boot = { hadLocal: false, fromSeed: false, restored: false, edited: false, ready: false };
  /* 首屏加载期间（kb 灌预置库、首屏渲染补 currentClassId）不算「老师改过」 */
  if (document.readyState === 'complete') {
    setTimeout(function () { boot.ready = true; }, 200);
  } else {
    window.addEventListener('load', function () { setTimeout(function () { boot.ready = true; }, 200); });
  }
  var idbTimer = null, idbPending = null;

  function readStorage() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return normalize(parsed);
    } catch (e) {
      console.warn('读取本地数据失败', e);
      return null;
    }
  }

  function mirror(json) {
    idbPending = { at: Date.now(), data: json };
    if (idbTimer) clearTimeout(idbTimer);
    idbTimer = setTimeout(flushIdb, 600);
  }

  function flushIdb() {
    if (idbTimer) { clearTimeout(idbTimer); idbTimer = null; }
    var payload = idbPending;
    idbPending = null;
    if (!payload || !App.idb) return;
    App.idb.set(IDB_KEY, payload)['catch'](function () { /* 容量/隐私模式失败不影响主流程 */ });
  }

  /* 立刻写两份（用于导入备份、云端数据落地、关闭页面前） */
  function writeNow() {
    var json = null;
    try { json = JSON.stringify(db); } catch (e) { console.error(e); }
    if (json == null) return false;
    var ok = true;
    try { localStorage.setItem(KEY, json); }
    catch (e) {
      ok = false;
      App.ui && App.ui.toast('本地存储空间不足，请先导出备份并清理部分图片', 'err', 4200);
      console.error(e);
    }
    if (idbTimer) { clearTimeout(idbTimer); idbTimer = null; }
    idbPending = { at: Date.now(), data: json };
    flushIdb();
    return ok;
  }

  var db = (function () {
    var d = readStorage();
    if (d) { boot.hadLocal = true; return d; }
    var s = seed();
    boot.fromSeed = true;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { }
    return s;
  })();

  var store = {
    get db() { return db; },
    /* 数据变更入口：先落本地（不会丢），再通知云端同步 */
    save: function (opts) {
      opts = opts || {};
      var json = null;
      try { json = JSON.stringify(db); } catch (e) { json = null; }
      var ok = true;
      if (json != null) {
        try { localStorage.setItem(KEY, json); }
        catch (e) {
          ok = false;
          App.ui && App.ui.toast('本地存储空间不足，请先导出备份并清理部分图片', 'err', 4200);
          console.error(e);
        }
        mirror(json);
      }
      if (!opts.silent && App.sync && App.sync.notifyChange) {
        if (boot.ready) boot.edited = true;
        App.sync.notifyChange();
      }
      return ok;
    },
    replace: function (data) {
      db = normalize(data);
      writeNow();
    },
    /* 云端数据落地：写本地但不反过来触发上传 */
    adopt: function (data) {
      db = normalize(data);
      writeNow();
      return db;
    },
    /* 关闭页面前把待写缓存立刻刷进 IndexedDB */
    flush: flushIdb,
    /* localStorage 为空（被清站点数据 / 换浏览器配置）时，从 IndexedDB 找回 */
    recoverFromCache: function () {
      if (!App.idb || boot.hadLocal) return Promise.resolve(false);
      return App.idb.get(IDB_KEY).then(function (rec) {
        if (!rec || !rec.data) return false;
        var parsed = null;
        try { parsed = typeof rec.data === 'string' ? JSON.parse(rec.data) : rec.data; }
        catch (e) { return false; }
        if (!parsed || !Array.isArray(parsed.classes)) return false;
        var n = (parsed.classes.length + (parsed.students || []).length +
          (parsed.records || []).length + (parsed.papers || []).length +
          (parsed.exams || []).length + (parsed.comms || []).length);
        if (!n) return false;
        db = normalize(parsed);
        writeNow();
        boot.restored = true;
        return true;
      })['catch'](function () { return false; });
    },
    reset: function () {
      db = seed();
      if (App.kb && App.kb.reseed) App.kb.reseed();
      writeNow();
    },
    /* 清空业务数据，保留基础设置、节次与备课目录 */
    clearAll: function () {
      db.classes = [];
      db.students = [];
      db.tasks = [];
      db.entries = [];
      db.slots = {};
      db.records = [];
      db.exams = [];
      db.papers = [];
      db.summaries = [];
      db.comms = [];
      db.mistakes = [];
      db.meta.currentClassId = null;
      writeNow();
    },
    /* 仅供调试/设置页显示 */
    bootInfo: function () { return boot; },
    exportJSON: function () { return JSON.stringify(db, null, 2); },
    size: function () {
      try { return new Blob([JSON.stringify(db)]).size; } catch (e) { return 0; }
    }
  };
  App.store = store;

  /* ---------------- 工具函数 ---------------- */
  var util = {
    uid: uid,
    pad: pad,
    todayISO: todayISO,
    round1: round1,
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    num: function (v) {
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    },
    avg: function (arr) {
      var v = arr.filter(function (x) { return typeof x === 'number' && !isNaN(x); });
      if (!v.length) return null;
      return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    },
    cls: function (id) {
      var d = db.classes.filter(function (c) { return c.id === id; })[0];
      return d || null;
    },
    clsName: function (id) {
      var c = util.cls(id);
      return c ? c.name : '未分班';
    },
    clsColor: function (id) {
      var c = util.cls(id);
      return c ? c.color : '#9c94b8';
    },
    studentsOf: function (classId) {
      return db.students.filter(function (s) { return !classId || s.classId === classId; });
    },
    stu: function (id) {
      return db.students.filter(function (s) { return s.id === id; })[0] || null;
    },
    displayName: function (s) {
      if (!s) return '—';
      if (!db.meta.maskNames) return s.en;
      return util.mask(s.en);
    },
    mask: function (str) {
      str = String(str || '');
      if (!str) return '';
      if (/[\u4e00-\u9fa5]/.test(str)) return str.slice(0, 1) + '*'.repeat(Math.max(1, str.length - 1));
      var parts = str.split(' ');
      return parts.map(function (p) { return p ? p[0] + '***' : ''; }).join(' ');
    },
    maskEmail: function (e) {
      if (!e) return '';
      var at = e.indexOf('@');
      if (at < 1) return '***';
      return e.slice(0, 1) + '***' + e.slice(at);
    },
    maskPhone: function (p) {
      p = String(p || '');
      if (p.length < 7) return p ? '****' : '';
      return p.slice(0, 3) + '****' + p.slice(-2);
    },
    periodName: function (key) {
      var idx = parseInt(String(key).split('-p')[1], 10) - 1;
      var p = db.periods[idx];
      return p ? p.name : '第 ' + (idx + 1) + ' 节';
    },
    periodTime: function (key) {
      var idx = parseInt(String(key).split('-p')[1], 10) - 1;
      var p = db.periods[idx];
      return p ? p.start + ' - ' + p.end : '';
    },
    dayIndex: function (key) { return parseInt(String(key).split('-')[0], 10); },
    DAYS: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    /* 某班全部成绩（按考试先后） */
    classScores: function (classId) {
      var out = [];
      db.exams.filter(function (e) { return e.classId === classId; }).forEach(function (e) {
        Object.keys(e.scores).forEach(function (sid) {
          var v = parseFloat(e.scores[sid]);
          if (!isNaN(v)) out.push(v);
        });
      });
      return out;
    },
    classAvg: function (classId) {
      var v = util.classScores(classId);
      return v.length ? round1(util.avg(v)) : null;
    },
    examAvg: function (exam) {
      var v = Object.keys(exam.scores).map(function (k) { return parseFloat(exam.scores[k]); }).filter(function (x) { return !isNaN(x); });
      return v.length ? round1(util.avg(v)) : null;
    },
    examList: function (classId) {
      return db.exams.filter(function (e) { return !classId || e.classId === classId; })
        .slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    },
    latestExam: function (classId) {
      var l = util.examList(classId);
      return l.length ? l[l.length - 1] : null;
    },
    stuScores: function (studentId) {
      var out = [];
      db.exams.forEach(function (e) {
        if (e.scores[studentId] != null && e.scores[studentId] !== '') {
          out.push({ exam: e, score: parseFloat(e.scores[studentId]) });
        }
      });
      return out;
    },
    /* 学生个人排名（按某次考试） */
    rankInExam: function (exam, studentId) {
      var list = Object.keys(exam.scores).map(function (k) {
        return { id: k, score: parseFloat(exam.scores[k]) };
      }).filter(function (x) { return !isNaN(x.score); })
        .sort(function (a, b) { return b.score - a.score; });
      var idx = list.findIndex(function (x) { return x.id === studentId; });
      return idx < 0 ? null : { rank: idx + 1, total: list.length };
    },
    initial: function (s) {
      return (s && s.en ? s.en.trim()[0] : (s && s.zh ? s.zh[0] : '?')).toUpperCase();
    },
    fmtSize: function (bytes) {
      if (!bytes) return '0 KB';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    },
    dateLabel: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return p[1] ? p[1] + '月' + p[2] + '日' : iso;
    },
    /* 周次工具：周标识 = 该周周一的日期 */
    thisWeek: function () { return mondayISO(todayISO()); },
    weekStart: function (dateStr) { return mondayISO(dateStr); },
    addWeeks: function (wk, n) { return addWeeksISO(wk, n); },
    weekLabel: function (wk) { return weekLabelISO(wk); },
    weekName: function (wk) {
      var t = mondayISO(todayISO());
      if (wk === t) return '本周';
      if (wk === addWeeksISO(t, -1)) return '上周';
      if (wk === addWeeksISO(t, 1)) return '下周';
      return '';
    },
    /* 学期第几周（1 起） */
    weekNo: function (wk) {
      var start = (db.meta && db.meta.semesterStart) || mondayISO(todayISO());
      var diff = (parseISO(wk) - parseISO(start)) / 86400000;
      return Math.round(diff / 7) + 1;
    },
    weekNoLabel: function (wk) {
      var n = util.weekNo(wk);
      return n >= 1 ? '第 ' + n + ' 周' : '假期';
    },
    /* 整个学期的周次列表（周一日期） */
    semesterList: function () {
      var start = (db.meta && db.meta.semesterStart) || mondayISO(todayISO());
      var n = (db.meta && db.meta.semesterWeeks) || 20;
      var out = [];
      for (var i = 0; i < n; i++) out.push(addWeeksISO(start, i));
      return out;
    },
    semesterLabel: function () {
      var start = (db.meta && db.meta.semesterStart) || mondayISO(todayISO());
      var n = (db.meta && db.meta.semesterWeeks) || 20;
      var end = addWeeksISO(start, n - 1);
      var e = parseISO(end); e.setDate(e.getDate() + 6);
      function md(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
      return md(parseISO(start)) + ' - ' + md(e);
    },
    weekDayLabel: function (wk, i) {
      var d = parseISO(wk);
      d.setDate(d.getDate() + i);
      return (d.getMonth() + 1) + '/' + d.getDate();
    },
    weekdayLabel: function (iso) {
      var d = new Date(iso + 'T00:00:00');
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    },
    download: function (filename, content, mime) {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    },
    copy: function (text) {
      if (navigator.clipboard && window.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(function () {
          App.ui.toast('已复制到剪贴板', 'ok');
        }).catch(function () { fallbackCopy(text); });
      } else { fallbackCopy(text); }
    }
  };
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); App.ui.toast('已复制到剪贴板', 'ok'); }
    catch (e) { App.ui.toast('复制失败，请手动选中复制', 'err'); }
    ta.remove();
  }
  App.util = util;
})();
