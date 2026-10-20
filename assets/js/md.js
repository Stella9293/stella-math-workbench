/* ==========================================================
   md.js — 轻量 Markdown 渲染（用于 AI 诊断报告）
   支持：标题 / 加粗 / 斜体 / 行内代码 / 无序列表 / 有序列表
        / 表格 / 引用 / 分割线 / 段落，$公式$ 以等宽样式呈现
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= 轻量 LaTeX 渲染 =================
     目标：把 $...$ 里的常见数学写法转成可读排版，不依赖 KaTeX
     支持 \frac \dfrac \sqrt ^ _ \times \pm \le 等，以及 \text{}
     ================================================== */
  var SYM = [
    ['\\times', '×'], ['\\div', '÷'], ['\\cdot', '·'], ['\\pm', '±'], ['\\mp', '∓'],
    ['\\approx', '≈'], ['\\neq', '≠'], ['\\ne', '≠'],
    ['\\leq', '≤'], ['\\le', '≤'], ['\\geq', '≥'], ['\\ge', '≥'],
    ['\\infty', '∞'], ['\\rightarrow', '→'], ['\\to', '→'], ['\\Rightarrow', '⇒'],
    ['\\degree', '°'], ['\\circ', '°'], ['\\angle', '∠'], ['\\triangle', '△'],
    ['\\parallel', '∥'], ['\\perp', '⊥'], ['\\sum', '∑'], ['\\int', '∫'],
    ['\\pi', 'π'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\theta', 'θ'],
    ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\sigma', 'σ'], ['\\omega', 'ω'], ['\\Delta', 'Δ'],
    ['\\sin', 'sin'], ['\\cos', 'cos'], ['\\tan', 'tan'], ['\\log', 'log'], ['\\ln', 'ln'],
    ['\\left', ''], ['\\right', ''], ['\\%', '%'],
    ['\\,', ' '], ['\\;', ' '], ['\\!', ''], ['\\quad', ' '], ['\\qquad', '  '],
    ['\\{', '{'], ['\\}', '}'], ['\\_', '_']
  ];

  function readGroup(s, i) {
    if (s[i] !== '{') return null;
    var depth = 0;
    for (var j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') {
        depth--;
        if (depth === 0) return { content: s.slice(i + 1, j), end: j };
      }
    }
    return null;
  }

  /* 由内向外替换 \frac，支持嵌套 */
  function replaceFrac(s) {
    var out = s, guard = 0;
    while (guard++ < 40) {
      var i1 = out.lastIndexOf('\\dfrac');
      var i2 = out.lastIndexOf('\\frac');
      var idx = Math.max(i1, i2);
      if (idx < 0) break;
      var head = out.slice(idx).match(/^\\(?:d)?frac\s*/);
      if (!head) { out = out.slice(0, idx) + out.slice(idx + 5); continue; }
      var p = idx + head[0].length;
      var g1 = readGroup(out, p);
      if (!g1) break;
      var p2 = g1.end + 1;
      while (out[p2] === ' ') p2++;
      var g2 = readGroup(out, p2);
      if (!g2) break;
      out = out.slice(0, idx) +
        '<span class="frac"><span class="fnum">' + g1.content + '</span><span class="fden">' + g2.content + '</span></span>' +
        out.slice(g2.end + 1);
    }
    return out;
  }

  function replaceSqrt(s) {
    var out = s, guard = 0;
    while (guard++ < 20) {
      var idx = out.lastIndexOf('\\sqrt');
      if (idx < 0) break;
      var p = idx + 5;
      while (out[p] === ' ') p++;
      var g = readGroup(out, p);
      if (g) {
        out = out.slice(0, idx) + '<span class="sqrt">√<span class="rad">' + g.content + '</span></span>' + out.slice(g.end + 1);
      } else {
        out = out.slice(0, idx) + '√' + out.slice(p);
      }
    }
    return out;
  }

  function texify(src) {
    var s = String(src);
    s = replaceFrac(s);
    s = replaceSqrt(s);
    /* \text{...} / \mathrm{...} / \mathbf{...} 取内容 */
    var guard = 0;
    while (guard++ < 20 && /\\(text|mathrm|mathbf|operatorname)\s*\{/.test(s)) {
      s = s.replace(/\\(text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$2');
    }
    /* 上下标 */
    s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
    s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
    s = s.replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>');
    s = s.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
    /* 符号 */
    SYM.forEach(function (pair) {
      s = s.split(pair[0]).join(pair[1]);
    });
    /* 残留的反斜杠命令去掉 */
    s = s.replace(/\\[A-Za-z]+/g, function (m) { return m.slice(1); });
    /* 多余花括号 */
    s = s.replace(/[{}]/g, '');
    return s;
  }

  /* 行内标记 */
  function inline(s) {
    var t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\$([^$]+)\$/g, function (_, inner) {
      return '<span class="tex">' + texify(inner) + '</span>';
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  function isTableSep(line) {
    return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.indexOf('-') >= 0 && /\|/.test(line);
  }
  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split('|').map(function (c) { return c.trim(); });
  }

  function render(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;

    function flushParagraph(buf) {
      if (!buf.length) return;
      out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
      buf.length = 0;
    }

    var para = [];
    while (i < lines.length) {
      var line = lines[i];

      /* 空行 */
      if (!line.trim()) { flushParagraph(para); i++; continue; }

      /* 分割线 */
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        flushParagraph(para); out.push('<hr>'); i++; continue;
      }

      /* 标题 */
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushParagraph(para);
        var lv = Math.min(h[1].length + 1, 6); /* # → h2，避免与页面 h1 冲突 */
        out.push('<h' + lv + ' class="md-h md-h' + lv + '">' + inline(h[2]) + '</h' + lv + '>');
        i++; continue;
      }

      /* 表格 */
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushParagraph(para);
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
          rows.push(splitRow(lines[i])); i++;
        }
        var tb = '<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
          head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + head.map(function (_, ci) { return '<td>' + inline(r[ci] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>';
        out.push(tb);
        continue;
      }

      /* 引用 */
      if (/^\s*>\s?/.test(line)) {
        flushParagraph(para);
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, '')); i++;
        }
        out.push('<blockquote>' + q.map(inline).join('<br>') + '</blockquote>');
        continue;
      }

      /* 列表（无序 / 有序，单层） */
      var ul = line.match(/^\s*[-*+]\s+(.*)$/);
      var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushParagraph(para);
        var tag = ul ? 'ul' : 'ol';
        var items = [];
        while (i < lines.length) {
          var m = tag === 'ul' ? lines[i].match(/^\s*[-*+]\s+(.*)$/) : lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
          if (!m) break;
          items.push(m[1]); i++;
        }
        out.push('<' + tag + ' class="md-list">' + items.map(function (t) {
          return '<li>' + inline(t) + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      para.push(line);
      i++;
    }
    flushParagraph(para);
    return out.join('\n');
  }

  /* 取纯文本（用于摘要预览） */
  function plain(src, max) {
    var t = String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`|-]/g, ' ')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (max && t.length > max) t = t.slice(0, max) + '…';
    return t;
  }

  App.md = { render: render, inline: inline, plain: plain, esc: esc };
})();
