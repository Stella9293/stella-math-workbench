/* ==========================================================
   paperio.js — 试卷分析「粘贴结果」解析层（纯本地，不联网）
   用途：老师把外部拿到的分析结果整段粘进来，
        自动拆出 ①报告正文 ②薄弱知识点候选 ③逐题得分 ④总分/满分
   识别策略（按优先级）：
   · 标题里的括号清单：## 一、知识点薄弱点分析（百分数增减、估算、…）
   · 「薄弱点：A、B、C」这类行内清单
   · 「三、知识点薄弱项」小节下的三级标题 / 编号条目
   · 表格里的「考点 / 知识点」列
   · 可选的 ```json 回填块（有就优先用）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var FENCE = '```';

  /* ---------- 小工具 ---------- */
  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? null : n;
  }

  function cleanTag(t) {
    return String(t || '')
      .replace(/[*`_#]/g, '')
      .replace(/^(?:第[一二三四五六七八九十\d]+[、.．)）]?)/, '')
      .replace(/^[\s\d.、．)）:：\-—·]+/, '')
      .replace(/[（(].*?[）)]$/, '')
      .replace(/[，,。；;：:、]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isBadTag(t) {
    if (!t) return true;
    if (t.length < 2 || t.length > 20) return true;
    if (/^(合计|小计|总分|得分|满分|总分值|备注|题号|得分率)$/.test(t)) return true;
    if (/^(本次|总体|一般|其他|无|暂无)/.test(t)) return true;
    if (/^第\s*[\d一二三四五六七八九十]/.test(t)) return true;   /* 「第18题…」是句子不是知识点 */
    if (/第|\d\s*题|扣\s*\d|得分|分值|["“”'’]/.test(t)) return true;
    if (/[，,。；;]/.test(t)) return true;                        /* 带标点的多半是半句话 */
    if (/\d+\s*分/.test(t)) return true;                         /* 「扣2分」不是知识点 */
    if (/^[A-D]$/.test(t)) return true;
    return false;
  }

  function pushTags(bag, str) {
    if (!str) return;
    String(str)
      .replace(/等(?:逐题|错题|相关|其他|问题)[^、，,；;]*$/g, '')
      .replace(/等{1,2}$/, '')
      .split(/[、，,;；/／|｜]+|\s{2,}/)
      .forEach(function (t) {
        var c = cleanTag(t);
        if (!isBadTag(c) && bag.indexOf(c) < 0) bag.push(c);
      });
  }

  /* ---------- 标题括号清单 ---------- */
  function tagsFromHeadings(text, bag) {
    /* 形如「一、知识点薄弱点分析（百分数增减、估算、…）」，有无 # 都认 */
    var re = /^(?:#{1,6}\s*)?[（(]?[一二三四五六七八九十\d]{0,3}[)）.、．]?\s*[^\n]{0,40}(?:知识点|薄弱|失分点|考点|错因)[^\n]*[（(]([^）)\n]{2,200})[）)]/gm, m;
    while ((m = re.exec(text))) pushTags(bag, m[1]);
  }

  /* ---------- 编号条目「1. 百分数增减：第 13 题…」 ---------- */
  function tagsFromNumbered(text, bag) {
    var re = /^\s*(?:\d+[.、．)]|[（(]\d+[)）]|[-*+]|\d+\))\s*\*{0,2}([^\n：:*]{2,24})\*{0,2}\s*[：:]/gm, m;
    while ((m = re.exec(text))) {
      var t = m[1];
      if (/^(证据|方法|应有的方法|正确思路|思路|掌握程度|判断依据|依据|说明|原因|表现|建议|对策|要求|备注|注|评分标准|参考|结论)/.test(t)) continue;
      pushTags(bag, t);
    }
    /* 三级标题形态：### 1. 百分比增减公式 */
    var reH = /^#{3,6}\s*(?:\d+\s*[.、．)]?)?\s*([^\n]{2,24})$/gm, mh;
    while ((mh = reH.exec(text))) {
      var h = mh[1].trim();
      if (/^(知识点|薄弱|建议|训练|计划|卷面|总体|给家长|下一步)/.test(h)) continue;
      pushTags(bag, h);
    }
  }

  /* ---------- 行内清单 ---------- */
  function tagsFromInline(text, bag) {
    var re = /(?:薄弱(?:知识)?点|知识点|知识漏洞|失分点|考点)[^\n：:]{0,8}[：:]\s*([^\n]{2,200})/g, m;
    while ((m = re.exec(text))) {
      var line = m[1];
      /* 只取清单形态，避免把整段分析当标签 */
      if (/[、，,]/.test(line) || line.length <= 24) pushTags(bag, line);
    }
  }

  /* ---------- 表格的考点列 ---------- */
  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function tables(text) {
    var lines = String(text).split('\n');
    var out = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (!cur) cur = [];
        cur.push(l);
      } else if (cur) {
        if (cur.length >= 2) out.push(cur);
        cur = null;
      }
    }
    if (cur && cur.length >= 2) out.push(cur);
    return out;
  }

  function tagsFromTables(text, bag) {
    tables(text).forEach(function (rows) {
      var head = splitRow(rows[0]);
      var col = -1;
      head.forEach(function (h, i) {
        if (/考点|知识点|考查内容|内容|模块/.test(h) && col < 0) col = i;
      });
      if (col < 0) return;
      rows.slice(2).forEach(function (r) {
        var cells = splitRow(r);
        if (cells[col]) pushTags(bag, cells[col].replace(/[（(].*?[）)]/g, ''));
      });
    });
  }

  /* ---------- 逐题得分表 ---------- */
  function parseScoreTable(text) {
    var res = [];
    tables(text).forEach(function (rows) {
      if (res.length) return;
      var head = splitRow(rows[0]);
      var iNo = -1, iAward = -1, iFull = -1, iNote = -1, iTopic = -1;
      head.forEach(function (h, i) {
        if (iNo < 0 && /^(题号|题目|题|number|no\.?)$/i.test(h)) iNo = i;
        if (iAward < 0 && /(得分|实得|学生得分|score|awarded)/i.test(h) && !/满分|分值/.test(h)) iAward = i;
        if (iFull < 0 && /(满分|分值|满|full|marks?)/i.test(h) && !/得分/.test(h)) iFull = i;
        if (iNote < 0 && /(备注|说明|错因|具体错|批注|note)/i.test(h)) iNote = i;
        if (iTopic < 0 && /(考点|知识点|考查内容|模块|topic)/i.test(h)) iTopic = i;
      });
      if (iNo < 0 || iAward < 0) return;
      rows.slice(2).forEach(function (r) {
        var c = splitRow(r);
        var no = (c[iNo] || '').replace(/[*`]/g, '').trim();
        var aw = iAward >= 0 ? (c[iAward] || '') : '';
        var fu = iFull >= 0 ? (c[iFull] || '') : '';
        /* 「0/2」这种同格写法拆开 */
        var mm = String(aw).match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        if (mm) { aw = mm[1]; if (!fu) fu = mm[2]; }
        var a = toNum(aw);
        if (!no || a == null) return;
        res.push({
          no: no,
          awarded: String(a),
          full: fu === '' ? '' : String(toNum(fu) == null ? fu.replace(/[^\d.]/g, '') : toNum(fu)),
          topic: iTopic >= 0 ? cleanTag(String(c[iTopic] || '')) : '',
          note: iNote >= 0 ? String(c[iNote] || '').replace(/[*`]/g, '').slice(0, 40) : ''
        });
      });
    });
    return res.slice(0, 60);
  }

  /* ---------- 总分 ---------- */
  function parseScore(text) {
    var m = String(text).match(/(?:得分|总分|成绩)[^\d\n]{0,6}(\d+(?:\.\d+)?)\s*[\/／]\s*(\d+(?:\.\d+)?)/);
    return m ? { score: toNum(m[1]), full: toNum(m[2]) } : { score: null, full: null };
  }

  /* ---------- json 回填块 ---------- */
  function stripJsonBlocks(text) {
    var found = null, m;
    var re = new RegExp(FENCE + 'json\\s*([\\s\\S]*?)' + FENCE, 'gi');
    while ((m = re.exec(text))) {
      var s = String(m[1] || '').trim();
      if (s.charAt(0) === '{') found = s;
    }
    var body = text.replace(new RegExp(FENCE + 'json\\s*[\\s\\S]*?' + FENCE, 'gi'), '');
    body = body.replace(/\n{3,}/g, '\n\n').replace(/\n*---\s*$/, '').trim();
    return { json: found, body: body };
  }

  /* ---------- 排版归一：把「一、xxx」这类纯文本小标题升成 Markdown 标题 ---------- */
  function normalizeReport(body) {
    return String(body || '').split('\n').map(function (ln) {
      var t = ln.trim();
      var m = t.match(/^([一二三四五六七八九十]{1,2})、(.*)$/);
      if (!m) return ln;
      var rest = m[2];
      if (!rest || rest.length > 60) return ln;
      if (/[。；;]/.test(rest)) return ln;                       /* 整句不升格 */
      if (/[）)]$/.test(rest)) return '## ' + t;                 /* 括号结尾：标题 */
      if (/[，,]/.test(rest)) return ln;                         /* 带逗号的长句不升格 */
      return '## ' + t;
    }).join('\n');
  }

  /* ---------- 主解析 ---------- */
  function parsePaste(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    var out = {
      report: text, tags: [], scoreTable: [], score: null, full: null,
      summary: '', model: '粘贴导入', structured: false
    };
    if (!text) return out;

    var sp = stripJsonBlocks(text);
    if (sp.json) {
      try {
        var j = JSON.parse(sp.json);
        out.structured = true;
        if (sp.body) out.report = sp.body;
        if (Array.isArray(j.tags)) {
          j.tags.forEach(function (t) {
            var c = cleanTag(t);
            if (c && out.tags.indexOf(c) < 0) out.tags.push(c);
          });
        }
        if (Array.isArray(j.scoreTable)) {
          out.scoreTable = j.scoreTable.map(function (r) {
            return {
              no: r.no == null ? '' : String(r.no),
              awarded: r.awarded == null ? '' : String(r.awarded),
              full: r.full == null ? '' : String(r.full),
              topic: r.topic == null ? '' : String(r.topic),
              note: r.note == null ? '' : String(r.note)
            };
          }).filter(function (r) { return r.no; });
        }
        out.score = toNum(j.score);
        out.full = toNum(j.full);
        out.summary = j.summary || '';
        out.model = j.model || '粘贴导入';
      } catch (e) {
        out.structured = false;
        out.report = text;
      }
    }

    /* 知识点候选：多路提取后合并 */
    if (!out.tags.length) tagsFromHeadings(out.report, out.tags);
    tagsFromNumbered(out.report, out.tags);
    if (out.tags.length < 2) tagsFromInline(out.report, out.tags);
    tagsFromTables(out.report, out.tags);

    if (!out.scoreTable.length) out.scoreTable = parseScoreTable(out.report);
    var sc = parseScore(out.report);
    if (out.score == null) out.score = sc.score;
    if (out.full == null) out.full = sc.full;

    out.report = normalizeReport(out.report);
    return out;
  }

  /* ---------- 粘贴弹窗（带实时预览） ---------- */
  function openPaste(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var m = App.ui.modal({
        title: '粘贴分析结果',
        width: 660,
        body: [
          '<div class="tiny muted" style="line-height:1.9;margin-bottom:10px">',
          '把别处生成的分析（DeepSeek / ChatGPT / 纸质整理都行）整段粘贴进来。',
          '系统会自动做三件事：<b>拆出报告正文</b>、<b>识别薄弱知识点并全部选入</b>、<b>尝试读取逐题得分表</b>。',
          '</div>',
          '<div class="row wrap" style="gap:8px;margin-bottom:10px">',
          '<label class="btn sm" style="cursor:pointer">📄 选择文件（.md / .txt）',
          '<input type="file" id="ppFile" accept=".md,.txt,.markdown,.json" hidden></label>',
          '<span class="tiny muted" id="ppTip" style="line-height:30px">未选择文件</span>',
          '</div>',
          '<div class="field"><label>分析正文</label>',
          '<textarea class="textarea" id="ppText" style="min-height:230px" placeholder="粘贴到这里，例如：&#10;一、知识点薄弱点分析（百分数增减、估算、百分数亏损、对称与旋转…）&#10;…"></textarea></div>',
          '<div class="paste-prev" id="ppPrev"><span class="tiny muted">粘贴后这里会实时显示识别到的知识点</span></div>'
        ].join(''),
        footer: [
          { label: '取消', onClick: function (close) { close(); resolve(null); } },
          {
            label: '导入并匹配知识点', cls: 'primary', onClick: function (close, root) {
              var v = root.querySelector('#ppText').value.trim();
              if (!v) { App.ui.toast('先粘贴分析结果', 'err'); return; }
              var r = parsePaste(v);
              if (!r.report) { App.ui.toast('没有识别到正文', 'err'); return; }
              close();
              resolve(r);
            }
          }
        ],
        onMount: function (root) {
          var ta = root.querySelector('#ppText');
          var prev = root.querySelector('#ppPrev');
          var inp = root.querySelector('#ppFile');
          var tip = root.querySelector('#ppTip');
          var timer = null;

          function paint() {
            var v = ta.value;
            if (!v.trim()) {
              prev.innerHTML = '<span class="tiny muted">粘贴后这里会实时显示识别到的知识点</span>';
              return;
            }
            var r = parsePaste(v);
            var chips = r.tags.map(function (t) {
              return '<span class="chip active" style="cursor:default">' + U.esc(t) + '</span>';
            }).join('');
            var bits = [];
            bits.push(r.tags.length ? '识别到 <b>' + r.tags.length + '</b> 个薄弱知识点' : '未识别到知识点（可用标题「一、知识点薄弱点分析（A、B、C）」的写法）');
            if (r.scoreTable.length) bits.push('逐题得分 <b>' + r.scoreTable.length + '</b> 行');
            if (r.score != null && r.full != null) bits.push('总分 <b>' + r.score + '/' + r.full + '</b>');
            prev.innerHTML = '<div class="tiny" style="margin-bottom:6px">' + bits.join(' · ') + '</div>' +
              (chips ? '<div class="chip-row">' + chips + '</div>' : '');
          }

          ta.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(paint, 300);
          });
          ta.addEventListener('paste', function () { setTimeout(paint, 60); });

          inp.onchange = function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            var rd = new FileReader();
            rd.onload = function () {
              ta.value = String(rd.result || '');
              tip.textContent = f.name + '（已载入）';
              paint();
            };
            rd.onerror = function () { App.ui.toast('文件读取失败', 'err'); };
            rd.readAsText(f);
          };

          if (opt.initial) { ta.value = opt.initial; paint(); }
          ta.focus();
        }
      });
      m.root.addEventListener('mousedown', function (e) {
        if (e.target.classList.contains('modal-mask')) resolve(null);
      });
    });
  }

  App.paperio = {
    parsePaste: parsePaste,
    openPaste: openPaste,
    parseScoreTable: parseScoreTable,
    tagsOf: function (t) { return parsePaste(t).tags; }
  };
})();
