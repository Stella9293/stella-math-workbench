/* ==========================================================
   charts.js — 轻量 SVG 图表（无依赖）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  var INK = '#2f2a45', MUTED = '#8d87a4', GRID = '#efeaf9';

  function niceMax(v) {
    if (!v || v <= 0) return 10;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / pow;
    var m = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
    return m * pow;
  }

  function fmt(n) { return Math.round(n * 10) / 10; }

  function niceNum(range, round) {
    if (range <= 0) return 1;
    var exp = Math.floor(Math.log10(range));
    var f = range / Math.pow(10, exp);
    var nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }

  function niceScale(min, max, ticks) {
    ticks = ticks || 4;
    if (max - min < 1e-9) { max = min + 1; }
    var range = niceNum(max - min, false);
    var step = niceNum(range / (ticks - 1), true);
    return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step: step };
  }

  /* 柱状图 */
  function bars(opt) {
    var labels = opt.labels || [], values = opt.values || [];
    var W = 680, H = opt.height || 230;
    var pl = 36, pr = 10, pt = 18, pb = 30;
    var pw = W - pl - pr, ph = H - pt - pb;
    var max = opt.max || niceMax(Math.max.apply(null, values.concat([1])));
    var n = Math.max(values.length, 1);
    var slot = pw / n;
    var bw = Math.min(46, slot * 0.52);
    var color = opt.color || '#8b7cf6';
    var colors = opt.colors || null;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">';
    svg += '<defs><linearGradient id="bg-' + (opt.gid || 'x') + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity=".95"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity=".55"/></linearGradient></defs>';
    (colors || []).forEach(function (c, i) {
      svg += '<linearGradient id="bg-' + (opt.gid || 'x') + '-' + i + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + c + '" stop-opacity=".95"/>' +
        '<stop offset="100%" stop-color="' + c + '" stop-opacity=".55"/></linearGradient>';
    });
    for (var g = 0; g <= 4; g++) {
      var y = pt + ph * g / 4;
      var val = max - (max * g / 4);
      svg += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="' + GRID + '" stroke-width="1"/>';
      svg += '<text x="' + (pl - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="9.5" fill="' + MUTED + '">' + fmt(val) + '</text>';
    }
    values.forEach(function (v, i) {
      var h = max ? (v / max) * ph : 0;
      var x = pl + slot * i + (slot - bw) / 2;
      var y = pt + ph - h;
      var fill = colors ? 'url(#bg-' + (opt.gid || 'x') + '-' + i + ')' : 'url(#bg-' + (opt.gid || 'x') + ')';
      svg += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, 1.5) + '" rx="5" fill="' + fill + '"/>';
      if (opt.showValue !== false && v > 0) {
        svg += '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10" fill="' + INK + '" font-weight="600">' +
          (opt.suffix ? fmt(v) + opt.suffix : fmt(v)) + '</text>';
      }
      svg += '<text x="' + (pl + slot * i + slot / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="' + MUTED + '">' +
        String(labels[i] == null ? '' : labels[i]).slice(0, 8) + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  /* 分组柱状图（多系列对比） */
  function grouped(opt) {
    var labels = opt.labels || [], series = opt.series || [];
    var W = 680, H = opt.height || 250;
    var pl = 38, pr = 10, pt = 20, pb = 34;
    var pw = W - pl - pr, ph = H - pt - pb;
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values); });
    var max = opt.max || niceMax(Math.max.apply(null, all.concat([1])));
    var n = Math.max(labels.length, 1);
    var slot = pw / n;
    var inner = slot * 0.66;
    var bw = Math.max(6, inner / Math.min(series.length, 6));
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">';
    for (var g = 0; g <= 4; g++) {
      var y = pt + ph * g / 4;
      svg += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="' + GRID + '"/>';
      svg += '<text x="' + (pl - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="9.5" fill="' + MUTED + '">' + fmt(max - max * g / 4) + '</text>';
    }
    labels.forEach(function (lb, i) {
      var gx = pl + slot * i + (slot - bw * series.length) / 2;
      series.forEach(function (s, si) {
        var v = s.values[i] || 0;
        var h = max ? (v / max) * ph : 0;
        var x = gx + si * bw;
        svg += '<rect x="' + (x + 1) + '" y="' + (pt + ph - h) + '" width="' + Math.max(bw - 2, 3) + '" height="' + Math.max(h, 1.5) + '" rx="4" fill="' + s.color + '" opacity=".92"/>';
        if (opt.showValue && v) svg += '<text x="' + (x + bw / 2) + '" y="' + (pt + ph - h - 5) + '" text-anchor="middle" font-size="8.5" fill="' + INK + '">' + fmt(v) + '</text>';
      });
      svg += '<text x="' + (pl + slot * i + slot / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="' + MUTED + '">' +
        String(lb).slice(0, 9) + '</text>';
    });
    svg += '</svg>';
    var legend = '<div class="row wrap tiny muted" style="gap:14px;margin-top:4px">' + series.map(function (s) {
      return '<span class="row" style="gap:5px"><span class="dot" style="background:' + s.color + '"></span>' + s.name + '</span>';
    }).join('') + '</div>';
    return svg + legend;
  }

  /* 折线趋势图 */
  function line(opt) {
    var labels = opt.labels || [], values = opt.values || [];
    var W = 680, H = opt.height || 200;
    var pl = 42, pr = 22, pt = 26, pb = 30;
    var pw = W - pl - pr, ph = H - pt - pb;
    var vmax = values.length ? Math.max.apply(null, values) : 1;
    var vmin = values.length ? Math.min.apply(null, values) : 0;
    var pad = (vmax - vmin) * 0.35 || Math.max(2, vmax * 0.1);
    var sc = niceScale(Math.max(0, vmin - pad * 0.4), vmax + pad, 4);
    var max = opt.max != null ? opt.max : sc.max;
    var min = opt.min != null ? opt.min : (opt.max != null ? 0 : sc.min);
    var n = Math.max(values.length - 1, 1);
    var color = opt.color || '#8b7cf6';
    var pts = values.map(function (v, i) {
      var x = pl + (pw * i / n);
      var y = pt + ph - ((v - min) / (max - min || 1)) * ph;
      return [x, y];
    });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">';
    var ticks = [];
    if (opt.max == null) {
      for (var v = min; v <= max + 1e-9; v += sc.step) ticks.push(Math.round(v * 100) / 100);
    } else {
      for (var g = 0; g <= 3; g++) ticks.push(max - (max - min) * g / 3);
    }
    ticks.forEach(function (tv) {
      var y = pt + ph - ((tv - min) / (max - min || 1)) * ph;
      svg += '<line x1="' + pl + '" y1="' + y + '" x2="' + (W - pr) + '" y2="' + y + '" stroke="' + GRID + '"/>';
      svg += '<text x="' + (pl - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="9.5" fill="' + MUTED + '">' + fmt(tv) + '</text>';
    });
    if (pts.length) {
      var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      var area = path + ' L' + pts[pts.length - 1][0] + ' ' + (pt + ph) + ' L' + pts[0][0] + ' ' + (pt + ph) + ' Z';
      svg += '<defs><linearGradient id="ln-' + (opt.gid || 'y') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + color + '" stop-opacity=".18"/>' +
        '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>';
      if (pts.length > 1) svg += '<path d="' + area + '" fill="url(#ln-' + (opt.gid || 'y') + ')"/>';
      svg += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p, i) {
        var anchor = pts.length === 1 ? 'middle' : (i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle');
        var dx = anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0;
        svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.6" fill="#fff" stroke="' + color + '" stroke-width="2"/>';
        svg += '<text x="' + (p[0] + dx) + '" y="' + (p[1] - 10) + '" text-anchor="' + anchor + '" font-size="10" font-weight="600" fill="' + INK + '">' + fmt(values[i]) + '</text>';
        svg += '<text x="' + (p[0] + dx) + '" y="' + (H - 9) + '" text-anchor="' + anchor + '" font-size="9.5" fill="' + MUTED + '">' + String(labels[i] || '').slice(0, 10) + '</text>';
      });
    }
    svg += '</svg>';
    return svg;
  }

  /* 多系列折线（每人一条），空值断线；focus 指定系列高亮并显示数值 */
  function multiLine(opt) {
    var labels = opt.labels || [], series = opt.series || [];
    var W = 680, H = opt.height || 250;
    var pl = 40, pr = 18, pt = 24, pb = 36;
    var pw = W - pl - pr, ph = H - pt - pb;
    var max = opt.max != null ? opt.max : 100;
    var min = opt.min != null ? opt.min : 0;
    var focus = opt.focus == null ? null : opt.focus;
    var span = (max - min) || 1;
    function X(i) { return labels.length <= 1 ? pl + pw / 2 : pl + pw * i / (labels.length - 1); }
    function Y(v) { return pt + ph - ((v - min) / span) * ph; }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">';

    for (var g = 0; g <= 4; g++) {
      var tv = max - span * g / 4;
      var gy = pt + ph * g / 4;
      svg += '<line x1="' + pl + '" y1="' + gy + '" x2="' + (W - pr) + '" y2="' + gy + '" stroke="' + GRID + '" stroke-width="1"/>';
      svg += '<text x="' + (pl - 7) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-size="9.5" fill="' + MUTED + '">' + fmt(tv) + '</text>';
    }

    /* 选中测验的竖向参考线 */
    if (opt.mark != null && opt.mark >= 0 && labels.length > 1) {
      var mx = X(opt.mark);
      svg += '<line x1="' + mx + '" y1="' + pt + '" x2="' + mx + '" y2="' + (pt + ph) + '" stroke="' + (opt.markColor || '#cbbef8') + '" stroke-width="1.4" stroke-dasharray="4 4"/>';
    }

    var step = Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach(function (lb, i) {
      if (i % step !== 0 && i !== labels.length - 1) return;
      svg += '<text x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="9.5" fill="' + MUTED + '">' + String(lb).slice(0, 10) + '</text>';
    });

    series.forEach(function (s, si) {
      var dim = focus != null && focus !== si;
      var op = dim ? 0.16 : (focus === si ? 1 : 0.72);
      var stroke = s.color || '#8b7cf6';
      var d = '', started = false, pts = [];
      s.values.forEach(function (v, i) {
        if (v == null) { started = false; return; }
        d += (started ? 'L' : 'M') + X(i) + ' ' + Y(v) + ' ';
        started = true;
        pts.push([i, X(i), Y(v), v]);
      });
      if (!d) return;
      svg += '<path d="' + d.trim() + '" fill="none" stroke="' + stroke + '" stroke-width="' + (focus === si ? 2.8 : dim ? 1.2 : 1.9) + '" stroke-linejoin="round" stroke-linecap="round" opacity="' + op + '"/>';
      var showDot = focus === si || (!dim && series.length <= 10);
      pts.forEach(function (p) {
        if (!showDot) return;
        var tip = s.tips && s.tips[p[0]] != null ? s.tips[p[0]]
          : (s.name ? s.name + ' · ' : '') + (labels[p[0]] || '') + ' · ' + fmt(p[3]) + '%';
        svg += '<circle cx="' + p[1] + '" cy="' + p[2] + '" r="' + (focus === si ? 4 : 2.8) + '" fill="#fff" stroke="' + stroke + '" stroke-width="' + (focus === si ? 2.2 : 1.6) + '" opacity="' + (dim ? 0.2 : 1) + '"><title>' + tip.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title></circle>';
        if (focus === si) {
          var anchor = p[0] === 0 ? 'start' : p[0] === labels.length - 1 ? 'end' : 'middle';
          var dx = anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0;
          var ty = p[2] - 9 < pt + 8 ? p[2] + 15 : p[2] - 9;
          svg += '<text x="' + (p[1] + dx) + '" y="' + ty + '" text-anchor="' + anchor + '" font-size="10" font-weight="600" fill="' + INK + '">' + fmt(p[3]) + '</text>';
        }
      });
    });

    svg += '</svg>';
    return svg;
  }

  App.charts = { bars: bars, grouped: grouped, line: line, multiLine: multiLine };
})();
