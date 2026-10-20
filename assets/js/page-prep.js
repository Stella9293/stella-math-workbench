/* ==========================================================
   page-prep.js — 备课中心（课程体系树 + 资源链接）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  function walk(nodes, id, parent, list) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return { node: nodes[i], parent: parent, list: nodes };
      var r = walk(nodes[i].children || [], id, nodes[i], nodes[i].children);
      if (r) return r;
    }
    return null;
  }
  function countLinks(n) {
    var c = (n.links || []).length;
    (n.children || []).forEach(function (x) { c += countLinks(x); });
    return c;
  }
  function pathOf(id) {
    var path = [];
    (function rec(nodes, trail) {
      nodes.forEach(function (n) {
        if (n.id === id) path = trail.concat([n.name]);
        else if (n.children) rec(n.children, trail.concat([n.name]));
      });
    })(App.store.db.curriculum, []);
    return path;
  }

  function addLink(node, presetType) {
    var U = App.util;
    var preset = presetType === 'local' ? 'local' : 'url';
    App.ui.modal({
      title: '添加资源链接 · ' + node.name,
      width: 520,
      body:
        '<div class="field"><label>名称</label><input class="input" id="lkName" placeholder="例如：P3 微分专题讲义"></div>' +
        '<div class="field"><label>类型</label><select class="select" id="lkType">' +
        '<option value="url"' + (preset === 'url' ? ' selected' : '') + '>网页链接（http / https）</option>' +
        '<option value="local"' + (preset === 'local' ? ' selected' : '') + '>本地文件或文件夹</option></select></div>' +
        '<div class="field"><label>地址 / 路径</label><input class="input" id="lkUrl" placeholder="https://… 或 /Users/stella/Teaching/…"></div>' +
        '<div class="tiny muted">本地路径可以直接粘贴访达中的文件夹路径，点击卡片时会尝试打开（浏览器可能提示确认）</div>',
      footer: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '保存', cls: 'primary', onClick: function (close, root) {
            var name = root.querySelector('#lkName').value.trim();
            var url = root.querySelector('#lkUrl').value.trim();
            if (!name || !url) { App.ui.toast('名称和地址都要填', 'err'); return; }
            node.links = node.links || [];
            node.links.push({ id: 'lk_' + Date.now().toString(36), label: name, type: root.querySelector('#lkType').value, url: url });
            App.store.save(); close(); App.render(); App.ui.toast('已添加', 'ok');
          }
        }
      ]
    });
  }

  function openLink(l) {
    if (l.type === 'local' || /^\//.test(l.url)) {
      App.util.copy(l.url);
      App.ui.toast('本地路径已复制，可在访达中前往', 'ok');
      return;
    }
    window.open(l.url, '_blank');
  }

  App.pages.prep = {
    title: '备课中心',
    sub: '按课程体系归档讲义、真题与网页资源',
    render: function (el) {
      var db = App.store.db, U = App.util;
      if (!db.curriculum.length) db.curriculum = [{ id: 'cv_' + Date.now().toString(36), name: 'IGCSE', open: true, links: [], children: [] }];
      if (!App.state.prepNode || !walk(db.curriculum, App.state.prepNode)) {
        App.state.prepNode = db.curriculum[0].id;
      }
      var cur = walk(db.curriculum, App.state.prepNode);
      var node = cur ? cur.node : null;

      var html = '<div class="prep-layout">';

      /* 左：目录树 */
      html += '<div class="card tight"><div class="card-head" style="margin-bottom:8px"><h3><span class="card-title-dot"></span>课程体系</h3>' +
        '<button class="btn sm" id="addRoot">+ 体系</button></div><div class="tree" id="tree">';
      html += renderTree(db.curriculum, 0);
      html += '</div><div class="tiny muted mt12">目录与标签都可自由增删；每个节点都能挂多个链接</div></div>';

      /* 右：详情 */
      html += '<div class="card">';
      if (!node) {
        html += '<div class="empty">先在左侧选择一个目录</div>';
      } else {
        var p = pathOf(node.id).slice(0, -1).join(' / ');
        html += '<div class="card-head"><div>' +
          (p ? '<div class="tiny muted">' + U.esc(p) + '</div>' : '') +
          '<h3 style="font-size:17px"><span class="card-title-dot"></span>' + U.esc(node.name) + '</h3>' +
          '<div class="tiny muted" style="margin-top:2px">' + (node.children.length ? node.children.length + ' 个子目录 · ' : '') + (node.links || []).length + ' 个链接</div>' +
          '</div><div class="row" style="gap:6px">' +
          '<button class="btn sm" id="addSub">+ 子目录</button>' +
          '<button class="btn sm primary" id="addLk">+ 添加链接</button>' +
          '</div></div>';

        if (node.children.length) {
          html += '<div class="chip-row mb16">' + node.children.map(function (c) {
            return '<button class="chip" data-go="' + c.id + '">📁 ' + U.esc(c.name) + ' <span class="tiny" style="opacity:.6">' + (c.links || []).length + '</span></button>';
          }).join('') + '</div>';
        }

        html += '<div class="tiny muted mb8">资源链接</div><div class="grid g-3" style="gap:12px">';
        if (!(node.links || []).length) {
          html += '<div class="empty" style="grid-column:1/-1;padding:26px 18px">' +
            '<span class="ico">📎</span>这个目录还没有资源<br>' +
            '<span class="tiny">把常用的讲义、真题、网课页面放进来，上课时一键打开</span>' +
            '<div class="row" style="justify-content:center;gap:8px;margin-top:14px">' +
            '<button class="btn sm" data-quick="url">＋ 网页链接</button>' +
            '<button class="btn sm" data-quick="local">＋ 本地文件夹</button>' +
            '<button class="btn sm" data-quick="sub">＋ 子目录</button></div></div>';
        } else {
          node.links.forEach(function (l) {
            var isUrl = l.type !== 'local' && /^https?:/.test(l.url);
            html += '<div class="link-card" data-link="' + l.id + '">' +
              '<div class="lc-top"><span class="lc-ico">' + (isUrl ? '🔗' : '📂') + '</span>' +
              '<span class="lc-name" title="' + U.esc(l.label) + '">' + U.esc(l.label) + '</span>' +
              '<button class="icon-btn" data-del-link="' + l.id + '" title="删除">✕</button></div>' +
              '<div class="lc-url" title="' + U.esc(l.url) + '">' + U.esc(l.url) + '</div>' +
              '<div class="row" style="gap:6px;margin-top:2px">' +
              '<button class="btn sm" data-copy="' + l.id + '">复制路径</button>' +
              '<button class="btn sm" data-open="' + l.id + '">打开</button></div></div>';
          });
        }
        html += '</div></div>';
      }
      html += '</div>';

      el.innerHTML = html;

      function renderTree(nodes, depth) {
        var h = '';
        nodes.forEach(function (n) {
          var has = n.children && n.children.length;
          var open = n.open !== false;
          h += '<div class="tree-node">';
          h += '<div class="tree-row ' + (App.state.prepNode === n.id ? 'active' : '') + '" data-node="' + n.id + '">' +
            '<span class="caret ' + (open ? 'open' : '') + '" data-toggle="' + n.id + '">' + (has ? '▶' : '') + '</span>' +
            '<span class="nm">' + U.esc(n.name) + '</span>' +
            ((n.links || []).length ? '<span class="cnt">' + (n.links || []).length + '</span>' : '') +
            '<span class="tree-actions"><button class="icon-btn" data-rename="' + n.id + '" title="重命名">✎</button>' +
            '<button class="icon-btn" data-rmnode="' + n.id + '" title="删除">✕</button></span></div>';
          if (has && open) h += '<div class="tree-children">' + renderTree(n.children, depth + 1) + '</div>';
          h += '</div>';
        });
        return h;
      }

      /* 树交互 */
      el.querySelectorAll('[data-node]').forEach(function (r) {
        r.onclick = function (e) {
          if (e.target.closest('[data-toggle]')) {
            var n = walk(db.curriculum, r.dataset.node).node;
            n.open = !(n.open !== false);
            App.store.save(); App.render(); return;
          }
          if (e.target.closest('[data-rename]') || e.target.closest('[data-rmnode]')) return;
          App.state.prepNode = r.dataset.node; App.render();
        };
      });
      el.querySelectorAll('[data-rename]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var f = walk(db.curriculum, b.dataset.rename);
          App.ui.prompt({ title: '重命名', label: '名称', value: f.node.name }).then(function (v) {
            if (!v) return;
            f.node.name = v; App.store.save(); App.render();
          });
        };
      });
      el.querySelectorAll('[data-rmnode]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var f = walk(db.curriculum, b.dataset.rmnode);
          App.ui.confirm('删除目录 <b>' + U.esc(f.node.name) + '</b> 及其下所有子目录和链接？', { danger: true, okLabel: '删除' }).then(function (ok) {
            if (!ok) return;
            var idx = f.list.indexOf(f.node);
            f.list.splice(idx, 1);
            if (App.state.prepNode === b.dataset.rmnode) App.state.prepNode = db.curriculum[0] ? db.curriculum[0].id : null;
            App.store.save(); App.render();
          });
        };
      });

      el.querySelector('#addRoot').onclick = function () {
        App.ui.prompt({ title: '新建课程体系', label: '名称（如 IB / IGCSE / 竞赛）' }).then(function (v) {
          if (!v) return;
          db.curriculum.push({ id: 'cv_' + Date.now().toString(36), name: v, open: true, links: [], children: [] });
          App.store.save(); App.render();
        });
      };
      var addSubBtn = el.querySelector('#addSub');
      if (addSubBtn) addSubBtn.onclick = function () {
        App.ui.prompt({ title: '在「' + node.name + '」下新建目录', label: '目录名称（如 SL / HL / P1）' }).then(function (v) {
          if (!v) return;
          node.children.push({ id: 'cv_' + Date.now().toString(36), name: v, open: true, links: [], children: [] });
          node.open = true;
          App.store.save(); App.render();
        });
      };
      var addLkBtn = el.querySelector('#addLk');
      if (addLkBtn) addLkBtn.onclick = function () { addLink(node); };

      el.querySelectorAll('[data-go]').forEach(function (b) {
        b.onclick = function () { App.state.prepNode = b.dataset.go; App.render(); };
      });
      el.querySelectorAll('[data-quick]').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.quick === 'sub') {
            App.ui.prompt({ title: '在「' + node.name + '」下新建目录', label: '目录名称' }).then(function (v) {
              if (!v) return;
              node.children.push({ id: 'cv_' + Date.now().toString(36), name: v, open: true, links: [], children: [] });
              node.open = true;
              App.store.save(); App.render();
            });
            return;
          }
          addLink(node, b.dataset.quick);
        };
      });
      el.querySelectorAll('[data-open]').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); openLink(node.links.filter(function (l) { return l.id === b.dataset.open; })[0]); };
      });
      el.querySelectorAll('[data-copy]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          var l = node.links.filter(function (x) { return x.id === b.dataset.copy; })[0];
          U.copy(l.url);
        };
      });
      el.querySelectorAll('[data-del-link]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          node.links = node.links.filter(function (l) { return l.id !== b.dataset.delLink; });
          App.store.save(); App.render();
        };
      });
      el.querySelectorAll('.link-card').forEach(function (c) {
        c.onclick = function () {
          var l = node.links.filter(function (x) { return x.id === c.dataset.link; })[0];
          if (l) openLink(l);
        };
      });
    }
  };
})();
