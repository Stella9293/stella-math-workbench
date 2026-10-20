/* ==========================================================
   ui.js — 通用 UI：Toast / Modal / 确认框 / 图片预览
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var wrap = document.getElementById('toastWrap');
  var modalRoot = document.getElementById('modalRoot');

  function toast(msg, kind, ms) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(function () { el.remove(); }, 220);
    }, ms || 2200);
  }

  function modal(opt) {
    opt = opt || {};
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    var footHTML = '';
    (opt.footer || []).forEach(function (b, i) {
      footHTML += '<button class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + b.label + '</button>';
    });
    mask.innerHTML =
      '<div class="modal" style="max-width:' + (opt.width || 560) + 'px">' +
        '<div class="modal-head"><h3>' + (opt.title || '') + '</h3>' +
          '<button class="icon-btn mclose" aria-label="close">✕</button></div>' +
        '<div class="modal-body">' + (opt.body || '') + '</div>' +
        (footHTML ? '<div class="modal-foot">' + footHTML + '</div>' : '') +
      '</div>';
    modalRoot.appendChild(mask);

    function close() {
      mask.style.opacity = '0';
      mask.style.transition = 'opacity .15s';
      setTimeout(function () { mask.remove(); }, 150);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    mask.querySelector('.mclose').onclick = close;
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });

    var root = mask.querySelector('.modal');
    (opt.footer || []).forEach(function (b, i) {
      var btn = mask.querySelector('.modal-foot [data-i="' + i + '"]');
      if (btn) btn.onclick = function () { b.onClick && b.onClick(close, root); };
    });

    if (opt.onMount) opt.onMount(root, close);
    return { root: root, close: close };
  }

  function confirmBox(message, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var m = modal({
        title: opt.title || '请确认',
        width: 420,
        body: '<div style="font-size:13.5px;line-height:1.85">' + message + '</div>',
        footer: [
          { label: '取消', cls: '', onClick: function (close) { close(); resolve(false); } },
          { label: opt.okLabel || '确定', cls: opt.danger ? 'danger' : 'primary', onClick: function (close) { close(); resolve(true); } }
        ]
      });
      m.root.addEventListener('mousedown', function (e) { if (e.target.classList.contains('modal-mask')) resolve(false); });
    });
  }

  function promptBox(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var m = modal({
        title: opt.title || '输入',
        width: 440,
        body: '<div class="field"><label>' + (opt.label || '') + '</label>' +
          '<input class="input" id="pbInput" value="' + U.esc(opt.value || '') + '" placeholder="' + U.esc(opt.placeholder || '') + '"></div>' +
          (opt.hint ? '<div class="tiny muted">' + opt.hint + '</div>' : ''),
        footer: [
          { label: '取消', onClick: function (close) { close(); resolve(null); } },
          {
            label: '保存', cls: 'primary', onClick: function (close, root) {
              var v = root.querySelector('#pbInput').value.trim();
              if (!v) { toast('内容不能为空', 'err'); return; }
              close(); resolve(v);
            }
          }
        ],
        onMount: function (root) {
          var inp = root.querySelector('#pbInput');
          inp.focus(); inp.select();
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') root.querySelector('.modal-foot .primary').click();
          });
        }
      });
      m.root.addEventListener('mousedown', function (e) { if (e.target.classList.contains('modal-mask')) resolve(null); });
    });
  }

  function lightbox(src) {
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.style.padding = '40px';
    mask.innerHTML = '<img src="' + src + '" style="max-width:92vw;max-height:88vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);background:#fff">';
    mask.onclick = function () { mask.remove(); };
    document.body.appendChild(mask);
  }

  App.ui = {
    toast: toast,
    modal: modal,
    confirm: confirmBox,
    prompt: promptBox,
    lightbox: lightbox
  };
})();
