/* ==========================================================
   xlsx.js — 纯前端 Excel(.xlsx)/CSV 读取 + 文件工具
   无需任何外部依赖：ZIP 解析 + DecompressionStream 解压
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  /* ---------------- ZIP 解析 ---------------- */
  function findEOCD(view, len) {
    var max = Math.max(0, len - 66000);
    for (var i = len - 22; i >= max; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('当前浏览器不支持解压 xlsx，请把表格另存为 CSV 后再导入'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function readZip(buffer) {
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var eocd = findEOCD(view, buffer.byteLength);
    if (eocd < 0) throw new Error('文件不是有效的 xlsx（请另存为 .xlsx 或 .csv）');
    var count = view.getUint16(eocd + 10, true);
    var off = view.getUint32(eocd + 16, true);
    var files = {};
    var dec = new TextDecoder('utf-8');
    for (var i = 0; i < count; i++) {
      if (off + 46 > buffer.byteLength) break;
      if (view.getUint32(off, true) !== 0x02014b50) break;
      var method = view.getUint16(off + 10, true);
      var compSize = view.getUint32(off + 20, true);
      var nameLen = view.getUint16(off + 28, true);
      var extraLen = view.getUint16(off + 30, true);
      var cmtLen = view.getUint16(off + 32, true);
      var localOff = view.getUint32(off + 42, true);
      var name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
      if (localOff + 30 <= buffer.byteLength) {
        var lNameLen = view.getUint16(localOff + 26, true);
        var lExtraLen = view.getUint16(localOff + 28, true);
        var start = localOff + 30 + lNameLen + lExtraLen;
        files[name] = { method: method, data: bytes.subarray(start, Math.min(start + compSize, buffer.byteLength)) };
      }
      off += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
  }

  function entryText(files, name) {
    var f = files[name];
    if (!f) return Promise.resolve(null);
    if (f.method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(f.data));
    return inflateRaw(f.data).then(function (u8) { return new TextDecoder('utf-8').decode(u8); });
  }

  function colIndex(ref) {
    var letters = String(ref).replace(/[^A-Z]/gi, '').toUpperCase();
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function textOf(node) {
    var ts = node.getElementsByTagName('t');
    var s = '';
    for (var i = 0; i < ts.length; i++) s += ts[i].textContent;
    return s;
  }

  function parseSheetXML(xml, shared) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var rows = doc.getElementsByTagName('row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var r = parseInt(row.getAttribute('r') || String(out.length + 1), 10);
      var arr = [];
      var cells = row.getElementsByTagName('c');
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var ref = c.getAttribute('r') || '';
        var col = ref ? colIndex(ref) : arr.length;
        var t = c.getAttribute('t');
        var val = '';
        if (t === 'inlineStr') {
          var is = c.getElementsByTagName('is')[0];
          if (is) val = textOf(is);
        } else {
          var v = c.getElementsByTagName('v')[0];
          if (v) {
            if (t === 's') val = shared[parseInt(v.textContent, 10)] || '';
            else val = v.textContent;
          }
        }
        arr[col] = val;
      }
      out[r - 1] = arr;
    }
    var maxCol = 0;
    out.forEach(function (r2) { if (r2) maxCol = Math.max(maxCol, r2.length); });
    return out.map(function (r2) {
      var a = [];
      for (var k = 0; k < maxCol; k++) a[k] = r2 && r2[k] != null ? String(r2[k]) : '';
      return a;
    });
  }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, '');
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else if (ch === '\r') { /* skip */ }
        else cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  /* ---------------- 对外 API ---------------- */
  var files = {
    /* 读取表格文件 -> 二维数组（首行为表头） */
    readTable: function (file) {
      var name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        return file.text().then(function (t) { return parseCSV(t); });
      }
      if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
        return file.arrayBuffer().then(function (buf) {
          var zip = readZip(buf);
          var sheetName = Object.keys(zip).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort()[0];
          if (!sheetName) throw new Error('未找到工作表');
          var sharedP = entryText(zip, 'xl/sharedStrings.xml');
          var sheetP = entryText(zip, sheetName);
          return Promise.all([sharedP, sheetP]).then(function (res) {
            var shared = [];
            if (res[0]) {
              var doc = new DOMParser().parseFromString(res[0], 'application/xml');
              var sis = doc.getElementsByTagName('si');
              for (var i = 0; i < sis.length; i++) shared.push(textOf(sis[i]));
            }
            return parseSheetXML(res[1], shared);
          });
        });
      }
      if (name.endsWith('.xls')) {
        return Promise.reject(new Error('旧版 .xls 暂不支持，请在 Excel 中另存为 .xlsx 或 .csv'));
      }
      return Promise.reject(new Error('请选择 .xlsx 或 .csv 文件'));
    },

    /* 表头容错匹配：给目标字段名数组，返回列索引映射 */
    mapHeader: function (header, aliases) {
      var map = {};
      var norm = header.map(function (h) { return String(h).replace(/\s|_|（.*?）|\(.*?\)/g, '').toLowerCase(); });
      Object.keys(aliases).forEach(function (field) {
        var keys = aliases[field];
        for (var i = 0; i < norm.length; i++) {
          for (var k = 0; k < keys.length; k++) {
            if (norm[i].indexOf(String(keys[k]).toLowerCase()) >= 0) { map[field] = i; return; }
          }
        }
      });
      return map;
    },

    pick: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = opts.accept || '';
        input.multiple = !!opts.multiple;
        input.onchange = function () { resolve(input.files); };
        input.click();
      });
    },

    /* 图片压缩为 dataURL，控制本地存储体积 */
    readImage: function (file, maxSize) {
      maxSize = maxSize || 1100;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var w = img.width, h = img.height;
            var scale = Math.min(1, maxSize / Math.max(w, h));
            var cv = document.createElement('canvas');
            cv.width = Math.round(w * scale);
            cv.height = Math.round(h * scale);
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL('image/jpeg', 0.68));
          };
          img.onerror = function () { reject(new Error('图片读取失败')); };
          img.src = reader.result;
        };
        reader.onerror = function () { reject(new Error('图片读取失败')); };
        reader.readAsDataURL(file);
      });
    },

    /* 把一张 dataURL 重编码得更小（用于「图片瘦身」） */
    shrinkOne: function (dataURL, maxSize, quality) {
      maxSize = maxSize || 1000;
      quality = quality || 0.6;
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.width, h = img.height;
            var scale = Math.min(1, maxSize / Math.max(w, h));
            var cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(w * scale));
            cv.height = Math.max(1, Math.round(h * scale));
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            var out = cv.toDataURL('image/jpeg', quality);
            resolve(out.length < dataURL.length ? out : dataURL);
          } catch (e) { resolve(dataURL); }
        };
        img.onerror = function () { resolve(dataURL); };
        img.src = dataURL;
      });
    },

    /* 收集 db 里所有图片的「位置引用」，方便统计与批量处理 */
    imageRefs: function (db) {
      var out = [];
      function push(arr, owner, label) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function (v, i) {
          if (typeof v === 'string' && v.slice(0, 11) === 'data:image/') {
            out.push({ arr: arr, i: i, owner: owner, label: label, size: v.length });
          }
        });
      }
      (db.papers || []).forEach(function (p) {
        var st = App.util.stu(p.studentId);
        push(p.images, p, '试卷分析 · ' + ((st && st.en) || '未选学生') + (p.date ? ' · ' + p.date : ''));
      });
      (db.records || []).forEach(function (r) {
        var st = App.util.stu(r.studentId);
        push(r.images, r, '课堂记录 · ' + ((st && st.en) || '未选学生') + (r.date ? ' · ' + r.date : ''));
      });
      return out;
    },

    /* 批量瘦身：返回 { n, before, after }（字符数） */
    shrinkAll: function (db, opt) {
      opt = opt || {};
      var refs = files.imageRefs(db);
      var before = 0;
      refs.forEach(function (r) { before += r.size; });
      if (!refs.length) return Promise.resolve({ n: 0, before: 0, after: 0 });
      var after = 0;
      var chain = Promise.resolve();
      refs.forEach(function (r) {
        chain = chain.then(function () {
          return files.shrinkOne(r.arr[r.i], opt.maxSize || 1000, opt.quality || 0.6).then(function (out) {
            r.arr[r.i] = out;
            after += out.length;
          });
        });
      });
      return chain.then(function () { return { n: refs.length, before: before, after: after }; });
    },

    downloadCSV: function (filename, rows) {
      var lines = rows.map(function (r) {
        return r.map(function (c) {
          var s = String(c == null ? '' : c);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      });
      App.util.download(filename, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    },

    exportWord: function (title, bodyHTML, filename) {
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
        'xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">' +
        '<title>' + title + '</title><style>' +
        '@page{margin:2.2cm 2.4cm;}body{font-family:"PingFang SC","Microsoft YaHei",serif;font-size:11pt;line-height:1.95;color:#222;}' +
        'h1{font-size:17pt;text-align:center;letter-spacing:1px;margin:0 0 6pt;}' +
        'h2{font-size:12.5pt;margin:14pt 0 6pt;color:#5b4bb5;}' +
        '.meta{text-align:center;color:#888;font-size:9.5pt;margin-bottom:16pt;}' +
        'p{margin:0 0 7pt;text-indent:2em;}' +
        '.tag{display:inline-block;margin:0 6pt 6pt 0;padding:1pt 8pt;border:0.75pt solid #d8d0f5;border-radius:8pt;font-size:9.5pt;color:#5b4bb5;}' +
        'table{border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:10pt;}' +
        'th,td{border:0.5pt solid #ddd6f7;padding:4pt 6pt;text-align:left;vertical-align:top;}' +
        'th{background:#f6f2ff;color:#5b4bb5;font-weight:600;}' +
        'ul,ol{margin:0 0 8pt;padding-left:18pt;}li{margin-bottom:3pt;}' +
        'blockquote{margin:0 0 8pt;padding:6pt 10pt;background:#faf8ff;border-left:2pt solid #c7b8fb;}' +
        'hr{border:0;border-top:0.75pt dashed #e5e1f5;margin:10pt 0;}' +
        '.line{border-top:0.75pt solid #e5e1f5;margin:12pt 0;}' +
        '</style></head><body>' + bodyHTML + '</body></html>';
      App.util.download(filename + '.doc', '\ufeff' + html, 'application/msword');
    }
  };

  App.files = files;
  App.xlsx = { readTable: files.readTable, parseCSV: parseCSV };
})();
