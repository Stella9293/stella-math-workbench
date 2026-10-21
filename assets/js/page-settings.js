/* ==========================================================
   page-settings.js — 设置（基础信息 / AI 接口 / 数据备份）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  App.pages.settings = {
    title: '设置',
    sub: '云端同步、基础信息、AI 接口与本地数据',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var ai = db.settings.ai || (db.settings.ai = {});

      var size = App.store.size();

      var html = '';

      /* 云端同步（放在最上面：这是换电脑的第一件事） */
      html += syncCardHTML();

      html += '<div class="grid g-2">';

      /* 基础信息 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>基础信息</h3>' +
        '<button class="btn sm primary" id="saveBase">保存</button></div>';
      html += '<div class="field-row"><div class="field"><label>老师姓名</label><input class="input" id="stName" value="' + U.esc(db.meta.teacher || '') + '"></div>' +
        '<div class="field"><label>身份</label><input class="input" id="stRole" value="' + U.esc(db.meta.role || '') + '"></div></div>';
      html += '<div class="field"><label>学校 / 机构</label><input class="input" id="stSchool" value="' + U.esc(db.meta.school || '') + '" placeholder="选填"></div>';
      html += '<div class="field"><label>当前学期</label><input class="input" id="stTerm" value="' + U.esc(db.meta.term || '') + '" placeholder="2026 秋季学期"></div>';
      html += '<div class="setting-row"><div class="sr-text"><strong>一键脱敏</strong><span>开启后全站姓名、邮箱、电话以掩码显示</span></div>' +
        '<button class="btn sm ' + (db.meta.maskNames ? 'primary' : '') + '" id="maskToggle">' + (db.meta.maskNames ? '已开启' : '关闭') + '</button></div>';
      html += '</div>';

      /* AI 配置 */
      var provider = ai.provider || 'deepseek';
      var hints = App.ai.MODEL_HINTS[provider] || App.ai.MODEL_HINTS.custom;
      var hintOptions = hints.map(function (m) { return '<option value="' + m + '"></option>'; }).join('');

      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>AI 接口</h3>' +
        '<span class="badge ' + (App.ai.configured() ? 'mint' : 'gray') + '">' +
        (App.ai.configured() ? (App.ai.hasVision() ? '分析 + 视觉已配置' : '仅分析模型') : '未配置') + '</span></div>';

      html += '<div class="ai-tip mb12">' +
        '<strong>试卷分析默认不需要密钥：</strong>' +
        '<span>到「学情分析 → 试卷分析」点 <b>✨ 粘贴分析结果</b>，把外部分析整段粘进来，系统自动拆正文、匹配薄弱知识点（可多选）、读取逐题得分。' +
        '下面的接口是<b>可选增强</b>：配置后可在本页直接生成报告，分析模型选推理强的（如 <code>deepseek-reasoner</code>），视觉模型选能读图的（如豆包 <code>ep-…</code>）。不填也完全可用。</span></div>';

      html += '<div class="field-row"><div class="field"><label>服务商</label><select class="select" id="aiProvider">' +
        '<option value="deepseek" ' + (provider === 'deepseek' ? 'selected' : '') + '>DeepSeek</option>' +
        '<option value="doubao" ' + (provider === 'doubao' ? 'selected' : '') + '>豆包（火山方舟）</option>' +
        '<option value="custom" ' + (provider === 'custom' ? 'selected' : '') + '>自定义（OpenAI 兼容）</option></select></div>' +
        '<div class="field"><label>分析模型</label><input class="input" id="aiModel" list="aiModelList" value="' + U.esc(ai.model || '') + '" placeholder="deepseek-reasoner">' +
        '<datalist id="aiModelList">' + hintOptions + '</datalist></div></div>';

      html += '<div class="field-row"><div class="field"><label>视觉模型（读试卷图片）</label><input class="input" id="aiVision" list="aiModelList" value="' + U.esc(ai.visionModel || '') + '" placeholder="豆包视觉接入点 ep-xxxx，留空则不读图"></div>' +
        '<div class="field"><label>分析强度</label><select class="select" id="aiDeep">' +
        '<option value="1" ' + (ai.deepMode !== false ? 'selected' : '') + '>深度（输出完整报告，较慢）</option>' +
        '<option value="0" ' + (ai.deepMode === false ? 'selected' : '') + '>标准（更快、更省 token）</option></select></div></div>';

      html += '<div class="field"><label>API Key</label><input class="input" id="aiKey" type="password" value="' + U.esc(ai.apiKey || '') + '" placeholder="sk-…"></div>';
      html += '<div class="field"><label>接口地址（选填）</label><input class="input" id="aiBase" value="' + U.esc(ai.baseURL || '') + '" placeholder="' + (App.ai.DEFAULT_BASE[provider] || 'https://api.openai.com/v1') + '"></div>';

      html += '<div class="row wrap" style="gap:8px"><button class="btn primary" id="saveAI">保存配置</button>' +
        '<button class="btn" id="testAI">测试分析模型</button>' +
        '<button class="btn" id="testVision">测试视觉模型</button></div>';
      html += '<div class="tiny muted mt12" style="line-height:1.85">未配置时，家校沟通与试卷评语会使用本地模板生成，功能可正常使用。<br>' +
        '若浏览器提示跨域，请把本文件夹用本地服务器打开（如 <code>python3 -m http.server</code>）。<br>' +
        '推理类模型（<code>deepseek-reasoner</code>、<code>o</code> 系列）不支持读图，请务必另填视觉模型。</div>';
      html += '</div>';
      html += '</div>';

      /* 数据 */
      var imgSt = App.store.imgStat();
      var slim = App.store.slimInfo();
      var lsBytes = App.store.lsSize ? App.store.lsSize() : size;
      var limit = 5 * 1024 * 1024;
      var pct = Math.min(100, lsBytes / limit * 100);
      var tight = pct >= 88;

      html += '<div class="card mt16" id="storageCard"><div class="card-head"><h3><span class="card-title-dot"></span>本地数据</h3>' +
        '<span class="badge ' + (tight ? 'rose' : pct >= 65 ? 'amber' : 'gray') + '">' + U.fmtSize(lsBytes) + ' / 约 5 MB</span></div>';
      html += '<div class="storage-bar mb12' + (tight ? ' over' : '') + '"><div style="width:' + Math.max(2, pct) + '%"></div></div>';
      html += '<div class="tiny muted">数据总量 ' + U.fmtSize(size) + '，其中试卷截图 ' + imgSt.imgs + ' 张 · ' + U.fmtSize(imgSt.bytes) + '</div>';

      if (slim) {
        html += '<div class="slim-note mt12">' +
          '<b>本地空间已满，已自动改存本机缓存。</b>' +
          '<span>' + (slim.imgs || 0) + ' 张截图（约 ' + U.fmtSize(Math.round((slim.bytes || 0) * 0.75)) + '）放在浏览器的 IndexedDB 里，' +
          '刷新页面会自动接回来，截图照常能看、能同步；文字数据一条没少。' +
          '真正占地方的是图片，建议点下面的「图片瘦身」。</span></div>';
      }

      html += '<div class="row wrap mt12" style="gap:8px">' +
        '<button class="btn primary" id="shrinkImages">图片瘦身' + (imgSt.imgs ? '（' + imgSt.imgs + ' 张）' : '') + '</button>' +
        '<button class="btn" id="manageImages">管理截图</button>' +
        '<button class="btn" id="exportData">↓ 导出备份 (JSON)</button>' +
        '<button class="btn" id="importData">↑ 导入备份</button>' +
        '<button class="btn danger" id="clearData">清空全部数据</button>' +
        '<button class="btn ghost" id="demoData">载入示例数据</button></div>';
      var _sm = App.sync.status().mode;
      html += '<div class="tiny muted mt12" style="line-height:1.85">' +
        (_sm === 'local' || _sm === 'setup'
          ? '当前为<b>仅本地模式</b>：数据存在这台电脑的 localStorage（IndexedDB 冗余备份），不上传任何服务器。<br>清除站点数据、换浏览器或换电脑都会丢，建议每周导出一份备份。'
          : '本机会自动保存（localStorage + IndexedDB），并同步到你的 Supabase 账号；换电脑登录同一账号即可看到。<br>仍然建议定期导出 JSON 作为离线保险。') +
        '</div>';
      html += '</div>';

      /* 概览 */
      html += '<div class="card mt16"><div class="card-head"><h3><span class="card-title-dot"></span>数据概览</h3></div>' +
        '<div class="grid g-4" style="gap:10px">' +
        [
          ['班级', db.classes.length], ['学生', db.students.length], ['测验', db.exams.length],
          ['课堂/作业记录', db.records.length], ['试卷分析', db.papers.length], ['综合评语', db.summaries.length],
          ['沟通记录', db.comms.length], ['错题知识点', db.mistakes.length]
        ].map(function (x) {
          return '<div style="background:var(--p-50);border-radius:12px;padding:10px 12px"><div class="tiny muted">' + x[0] + '</div>' +
            '<div style="font-size:19px;font-weight:600">' + x[1] + '</div></div>';
        }).join('') + '</div></div>';

      el.innerHTML = html;

      /* ---------- 云端同步 ---------- */
      bindSync(el);

      el.querySelector('#saveBase').onclick = function () {
        db.meta.teacher = el.querySelector('#stName').value.trim() || 'Stella';
        db.meta.school = el.querySelector('#stSchool').value.trim();
        db.meta.term = el.querySelector('#stTerm').value.trim();
        db.meta.role = el.querySelector('#stRole').value.trim();
        App.store.save(); App.refreshTopbar();
        App.ui.toast('基础信息已保存', 'ok');
      };
      el.querySelector('#maskToggle').onclick = function () {
        db.meta.maskNames = !db.meta.maskNames; App.store.save(); App.render();
      };

      var provSel = el.querySelector('#aiProvider');
      provSel.onchange = function () {
        var p = provSel.value;
        var hint = App.ai.MODEL_HINTS[p] || App.ai.MODEL_HINTS.custom;
        el.querySelector('#aiModelList').innerHTML = hint.map(function (m) {
          return '<option value="' + m + '"></option>';
        }).join('');
        el.querySelector('#aiBase').placeholder = App.ai.DEFAULT_BASE[p] || 'https://api.example.com/v1';
      };

      el.querySelector('#saveAI').onclick = function () {
        ai.provider = el.querySelector('#aiProvider').value;
        ai.model = el.querySelector('#aiModel').value.trim();
        ai.apiKey = el.querySelector('#aiKey').value.trim();
        ai.baseURL = el.querySelector('#aiBase').value.trim();
        ai.visionModel = el.querySelector('#aiVision').value.trim();
        ai.deepMode = el.querySelector('#aiDeep').value === '1';
        App.store.save(); App.render();
        App.ui.toast('AI 配置已保存', 'ok');
      };
      el.querySelector('#testAI').onclick = function () {
        var btn = el.querySelector('#testAI');
        btn.disabled = true; btn.textContent = '测试中…';
        App.ai.chat({ prompt: '请只回复四个字：连接正常', system: '你是一个测试助手。', maxTokens: 32, temperature: 0 }).then(function (t) {
          btn.disabled = false; btn.textContent = '测试分析模型';
          App.ui.toast('分析模型连接成功：' + t.slice(0, 30), 'ok', 3200);
        }).catch(function (e) {
          btn.disabled = false; btn.textContent = '测试分析模型';
          App.ui.toast(e.message, 'err', 5200);
        });
      };
      el.querySelector('#testVision').onclick = function () {
        var btn = el.querySelector('#testVision');
        var vm = el.querySelector('#aiVision').value.trim();
        var key = el.querySelector('#aiKey').value.trim();
        if (!vm) { App.ui.toast('请先填写视觉模型', 'err'); return; }
        if (!key) { App.ui.toast('请先填写 API Key', 'err'); return; }
        btn.disabled = true; btn.textContent = '测试中…';
        var img = testImage();
        App.ai.chat({
          model: vm, vision: true, images: [img], maxTokens: 40, temperature: 0,
          prompt: '图片里写了一个算式，请只输出这个算式本身。',
          system: '你是一个读图测试助手，只输出看到的内容。'
        }).then(function (t) {
          btn.disabled = false; btn.textContent = '测试视觉模型';
          App.ui.toast('视觉模型可用，识别到：' + t.replace(/\s+/g, ' ').slice(0, 24), 'ok', 3600);
        }).catch(function (e) {
          btn.disabled = false; btn.textContent = '测试视觉模型';
          App.ui.toast(e.message, 'err', 5200);
        });
      };

      el.querySelector('#exportData').onclick = function () {
        App.util.download('Stella数学工作台_备份_' + U.todayISO() + '.json', App.store.exportJSON(), 'application/json');
        App.ui.toast('备份已导出', 'ok');
      };
      el.querySelector('#importData').onclick = function () {
        App.files.pick({ accept: '.json' }).then(function (files) {
          if (!files || !files[0]) return;
          files[0].text().then(function (txt) {
            try {
              var data = JSON.parse(txt);
              if (!data.classes) throw new Error('文件格式不正确');
              App.ui.confirm('导入会<b>覆盖</b>当前所有数据，确定继续吗？', { danger: true, okLabel: '覆盖导入' }).then(function (ok) {
                if (!ok) return;
                App.store.replace(data);
                App.render(); App.refreshTopbar();
                App.ui.toast('备份已导入', 'ok');
              });
            } catch (e) {
              App.ui.toast('备份文件无法解析：' + e.message, 'err', 4000);
            }
          });
        });
      };
      el.querySelector('#clearData').onclick = function () {
        App.ui.confirm('将清空<b>全部业务数据</b>（班级、学生、成绩、课表、记录、评语、沟通记录），仅保留基础设置与备课目录。<br><span class="tiny muted">建议先导出备份。此操作不可撤销。</span>',
          { danger: true, okLabel: '确认清空' }).then(function (ok) {
            if (!ok) return;
            App.store.clearAll();
            App.state = {};
            App.render(); App.refreshTopbar();
            App.ui.toast('数据已清空', 'ok');
          });
      };
      el.querySelector('#demoData').onclick = function () {
        App.ui.confirm('载入示例数据会<b>覆盖</b>当前内容，确定继续吗？', { okLabel: '载入示例' }).then(function (ok) {
          if (!ok) return;
          App.store.reset();
          App.state = {};
          App.render(); App.refreshTopbar();
          App.ui.toast('示例数据已载入', 'ok');
        });
      };

      /* ---------- 图片瘦身 ---------- */
      el.querySelector('#shrinkImages').onclick = function () {
        var st = App.store.imgStat();
        if (!st.imgs) { App.ui.toast('没有可压缩的截图', ''); return; }
        App.ui.confirm('把 ' + st.imgs + ' 张截图重新压到 1000px / 高质量 JPEG，体积通常能省一半以上。<br>' +
          '<span class="tiny muted">只影响清晰度，不改动任何文字数据；建议先导出备份。压缩后无法还原。</span>',
          { okLabel: '开始瘦身' }).then(function (ok) {
            if (!ok) return;
            var btn = el.querySelector('#shrinkImages');
            btn.disabled = true; btn.textContent = '压缩中…';
            App.files.shrinkAll(db, { maxSize: 1000, quality: 0.6 }).then(function (r) {
              var saved = Math.max(0, r.before - r.after);
              App.store.save();
              App.render();
              App.ui.toast('已压缩 ' + r.n + ' 张，省下约 ' + U.fmtSize(Math.round(saved * 0.75)), 'ok', 4200);
            })['catch'](function (e) {
              btn.disabled = false; btn.textContent = '图片瘦身';
              App.ui.toast('压缩失败：' + (e && e.message ? e.message : e), 'err', 4200);
            });
          });
      };

      /* ---------- 管理截图 ---------- */
      el.querySelector('#manageImages').onclick = function () { openImageManager(); };
    }
  };

  /* 截图清单弹窗：按「试卷分析 / 课堂记录」分组，可逐组清空 */
  function openImageManager() {
    var db = App.store.db, U = App.util;
    var groups = [];

    function collect(list, kind) {
      (list || []).forEach(function (it) {
        var imgs = (it.images || []).filter(function (v) { return typeof v === 'string' && v.slice(0, 11) === 'data:image/'; });
        if (!imgs.length) return;
        var st = U.stu(it.studentId);
        var bytes = imgs.reduce(function (a, v) { return a + v.length * 0.75; }, 0);
        groups.push({
          owner: it,
          kind: kind,
          title: (kind === 'paper' ? '试卷分析' : '课堂记录') + ' · ' + ((st && st.en) || '未选学生'),
          sub: (it.date || '') + (it.text ? ' · ' + String(it.text).slice(0, 16) : ''),
          imgs: imgs, bytes: bytes
        });
      });
    }
    collect(db.papers, 'paper');
    collect(db.records, 'record');

    var total = groups.reduce(function (a, g) { return a + g.bytes; }, 0);
    var n = groups.reduce(function (a, g) { return a + g.imgs.length; }, 0);

    var body = '';
    if (!groups.length) {
      body = '<div class="empty">还没有保存任何截图</div>';
    } else {
      body = '<div class="tiny muted mb12">共 ' + n + ' 张 · ' + U.fmtSize(Math.round(total)) +
        '，点缩略图可放大，右侧「清空」只删这一组。</div>';
      body += '<div class="img-mgr">' + groups.map(function (g, gi) {
        return '<div class="img-mgr-row">' +
          '<div class="img-mgr-thumbs">' + g.imgs.slice(0, 3).map(function (src) {
            return '<img src="' + src + '">';
          }).join('') + (g.imgs.length > 3 ? '<span class="more">+' + (g.imgs.length - 3) + '</span>' : '') + '</div>' +
          '<div class="img-mgr-meta"><strong>' + U.esc(g.title) + '</strong>' +
          '<span>' + U.esc(g.sub) + '</span>' +
          '<span class="tiny muted">' + g.imgs.length + ' 张 · ' + U.fmtSize(Math.round(g.bytes)) + '</span></div>' +
          '<button class="btn sm" data-clear="' + gi + '">清空</button>' +
          '</div>';
      }).join('') + '</div>';
    }

    App.ui.modal({
      title: '管理截图',
      width: 620,
      body: body,
      footer: groups.length ? [
        { label: '关闭', onClick: function (close) { close(); } },
        {
          label: '清空全部截图', cls: 'danger', onClick: function (close) {
            App.ui.confirm('删除<b>全部 ' + n + ' 张截图</b>（约 ' + U.fmtSize(Math.round(total)) + '）？<br>' +
              '<span class="tiny muted">文字与成绩不受影响，但截图删了不可恢复，建议先导出备份。</span>',
              { danger: true, okLabel: '全部删除' }).then(function (ok) {
                if (!ok) return;
                [db.papers, db.records].forEach(function (list) {
                  (list || []).forEach(function (it) { if (it.images) it.images = []; });
                });
                App.store.save();
                close(); App.render();
                App.ui.toast('已清空全部截图', 'ok');
              });
          }
        }
      ] : [{ label: '关闭', onClick: function (close) { close(); } }],
      onMount: function (root, close) {
        root.querySelectorAll('[data-clear]').forEach(function (b) {
          b.onclick = function () {
            var g = groups[parseInt(b.dataset.clear, 10)];
            App.ui.confirm('删除这组 ' + g.imgs.length + ' 张截图？<br><span class="tiny muted">文字内容不受影响。</span>',
              { danger: true, okLabel: '删除' }).then(function (ok) {
                if (!ok) return;
                g.owner.images = [];
                App.store.save();
                close();
                setTimeout(openImageManager, 180);
                App.ui.toast('已删除', 'ok');
              });
          };
        });
        root.querySelectorAll('.img-mgr-thumbs img').forEach(function (im) {
          im.onclick = function () { App.ui.lightbox(im.src); };
        });
      }
    });
  }
  /* ==========================================================
     云端同步卡片
     ========================================================== */
  function syncCardHTML() {
    var S = App.sync, cfg = S.config(), s = S.status(), U = App.util;
    var on = S.configured(), isIn = S.linked();

    var h = '<div class="card mb16" id="syncCard"><div class="card-head">' +
      '<h3><span class="card-title-dot"></span>云端同步</h3>' +
      '<span class="badge ' + s.badge + '">' + U.esc(s.label) + '</span></div>';

    h += '<div class="sync-banner tone-' + s.tone + '" id="syncBanner">' + S.bannerHTML() + '</div>';

    h += '<div class="mode-cmp">' +
      '<div class="mc ' + (!on ? 'on' : '') + '">' +
        '<div class="mc-t">仅本地模式</div>' +
        '<div class="mc-d">用 localStorage 存数据（IndexedDB 做冗余备份），<b>不上传任何服务器</b>。<br>换电脑要手动导出 JSON 再导入。</div>' +
        '<div class="mc-tag">' + (!on ? '当前' : '未启用') + '</div></div>' +
      '<div class="mc ' + (on ? 'on' : '') + '">' +
        '<div class="mc-t">云端同步 · Supabase</div>' +
        '<div class="mc-d">本机照旧自动保存，联网时自动上传；另一台电脑登录同一账号就能看到全部数据。</div>' +
        '<div class="mc-tag">' + (on ? (isIn ? '已连接' : '待登录') : '可选') + '</div></div>' +
      '</div>';

    h += '<details class="sync-setup" open>' +
      '<summary>' + (on ? '连接设置 / 手动同步' : '开启云端同步（三步）') + '</summary>';

    h += '<div class="sync-mini-hint mt8" style="line-height:1.9">' +
      '<b>①</b> 打开 supabase.com 新建一个免费项目 → 左侧 <b>SQL Editor</b> → 粘贴下面「建表 SQL」执行一次。<br>' +
      '<b>②</b> 项目 <b>Settings → API</b> 复制 <b>Project URL</b> 与 <b>anon public key</b>，填到下面两栏。<br>' +
      '<b>③</b> 用邮箱密码登录（没账号就点「注册新账号」，或在 Supabase → Authentication → Users 里加一个）。' +
      '</div>';

    h += '<div class="field-row mt12">' +
      '<div class="field"><label>Project URL</label><input class="input" id="syncUrl" placeholder="https://xxxx.supabase.co" value="' + U.esc(cfg.url) + '"></div>' +
      '<div class="field"><label>anon public key</label><input class="input" id="syncKey" type="password" placeholder="eyJhbGciOiJIUzI1NiIs…" value="' + U.esc(cfg.key) + '"></div>' +
      '</div>';
    h += '<div class="field-row">' +
      '<div class="field"><label>登录邮箱</label><input class="input" id="syncEmail" autocomplete="username" placeholder="you@example.com" value="' + U.esc(cfg.email) + '"></div>' +
      '<div class="field"><label>密码</label><input class="input" id="syncPass" type="password" autocomplete="current-password" placeholder="' + (isIn ? '已登录，重新登录时才需填' : '至少 6 位') + '"></div>' +
      '</div>';
    h += '<div class="field"><label>这台设备的名字（云端记录用，方便你区分是哪台改的）</label>' +
      '<input class="input" id="syncDevice" value="' + U.esc(cfg.deviceName) + '" placeholder="Mac · Chrome"></div>';

    h += '<div class="row wrap" style="gap:8px">' +
      '<button class="btn primary" id="syncLogin">' + (isIn ? '重新登录' : '登录并开启同步') + '</button>' +
      '<button class="btn" id="syncSignup">注册新账号</button>' +
      '<button class="btn ghost" id="syncTest">测试连接</button>' +
      (isIn ? '<button class="btn ghost" id="syncOut">退出登录</button>' : '') +
      '</div>';

    /* 已填地址但没登录：给一条「彻底变回仅本地」的出口，避免一直显示「未登录」 */
    if (!isIn && S.configured()) {
      h += '<div class="row wrap mt8" style="gap:8px">' +
        '<button class="btn ghost" id="syncForget">清除云端配置（彻底变回「仅本地」）</button>' +
        '<span class="tiny muted">只清这台电脑里存的地址与 key，数据不受影响</span></div>';
    }

    if (isIn) {
      h += '<div class="row wrap mt8" style="gap:8px">' +
        '<button class="btn" id="syncNow">立即同步</button>' +
        '<button class="btn ghost" id="syncPush">上传本机 → 云端</button>' +
        '<button class="btn ghost" id="syncPull">用云端覆盖本机</button>' +
        (S.pendingConflict() ? '<button class="btn danger" id="syncConflict">处理待合并</button>' : '') +
        '</div>';
      h += '<label class="row mt12" style="gap:8px;font-size:12.5px;cursor:pointer">' +
        '<input type="checkbox" id="syncAuto" ' + (cfg.auto ? 'checked' : '') + '>' +
        '<span>自动同步<span class="tiny muted">（改动后约 1 秒上传；联网时每 25 秒检查一次云端更新）</span></span></label>';
    }

    h += '<details class="sync-setup"><summary>建表 SQL（复制到 Supabase 的 SQL Editor 执行一次）</summary>' +
      '<textarea class="textarea sql-box mt12" id="syncSql" readonly spellcheck="false">' + U.esc(S.SQL) + '</textarea>' +
      '<div class="row wrap mt8" style="gap:8px"><button class="btn sm" id="syncCopySql">复制 SQL</button>' +
      '<span class="tiny muted">已执行过可跳过；重复执行不会破坏已有数据。</span></div>' +
      '</details>';

    h += '<div class="tiny muted mt12" style="line-height:1.85">' +
      '· 云端保存的是<b>整份工作台数据</b>（含你在设置里填的 AI Key），只有你自己的账号能读写（RLS 行级安全）。<br>' +
      '· 想换电脑/手机随手打开：把整个文件夹推到 GitHub 仓库并开启 Pages，用同一账号登录即可；' +
      '注意 <code>file://</code> 与 <code>https://</code> 是两套独立的本地缓存，建议固定用一种方式打开，避免同机两个副本互相覆盖。' +
      '</div>';

    h += '</details></div>';
    return h;
  }

  function bindSync(el) {
    var S = App.sync, U = App.util;
    function v(id) { var n = el.querySelector(id); return n ? n.value.trim() : ''; }
    function toast(m, k, ms) { App.ui.toast(m, k, ms); }

    var dev = el.querySelector('#syncDevice');
    if (dev) dev.onchange = function () {
      S.saveConfig({ deviceName: dev.value.trim() });
      toast('设备名已保存', 'ok');
    };

    var auto = el.querySelector('#syncAuto');
    if (auto) auto.onchange = function () {
      S.saveConfig({ auto: auto.checked });
      toast(auto.checked ? '已开启自动同步' : '已关闭自动同步（仍可手动同步）', 'ok');
    };

    var test = el.querySelector('#syncTest');
    if (test) test.onclick = function () {
      var u = v('#syncUrl'), k = v('#syncKey'), c = S.config();
      if (!u || !k) { toast('先填 Project URL 和 anon key', 'err'); return; }
      if (u.replace(/\/+$/, '') !== c.url || k !== c.key) S.saveConfig({ url: u, key: k, deviceName: v('#syncDevice') });
      test.disabled = true; test.textContent = '测试中…';
      S.testConnection().then(function (r) {
        test.disabled = false; test.textContent = '测试连接';
        toast(r.note + '，表结构正常', 'ok', 3400);
      })['catch'](function (e) {
        test.disabled = false; test.textContent = '测试连接';
        toast(e.message, 'err', 6800);
      });
    };

    var login = el.querySelector('#syncLogin');
    if (login) login.onclick = function () {
      var email = v('#syncEmail'), pass = el.querySelector('#syncPass').value;
      if (!v('#syncUrl') || !v('#syncKey')) { toast('先填 Project URL 和 anon key', 'err'); return; }
      if (!email || !pass) { toast('请填登录邮箱和密码', 'err'); return; }
      S.saveConfig({ url: v('#syncUrl'), key: v('#syncKey'), deviceName: v('#syncDevice'), email: email });
      login.disabled = true; login.textContent = '登录中…';
      S.signIn(email, pass).then(function () {
        toast('登录成功，正在核对云端数据…', 'ok', 2600);
        var p = el.querySelector('#syncPass'); if (p) p.value = '';
        return S.link();
      }).then(function (r) {
        login.disabled = false; login.textContent = '登录并开启同步';
        App.render();
        var map = {
          'push-init': '已把本机数据上传到云端',
          'pull-init': '已把云端数据同步到本机',
          'cancel': '已登录；两份数据都留着，等你决定以哪边为准'
        };
        toast(map[r && r.action] || '已连接云端', 'ok', 4200);
      })['catch'](function (e) {
        login.disabled = false; login.textContent = '登录并开启同步';
        toast(e.message, 'err', 7000);
      });
    };

    var signup = el.querySelector('#syncSignup');
    if (signup) signup.onclick = function () {
      var email = v('#syncEmail'), pass = el.querySelector('#syncPass').value;
      if (!v('#syncUrl') || !v('#syncKey')) { toast('先填 Project URL 和 anon key', 'err'); return; }
      if (!email || !pass) { toast('请填要注册的邮箱和密码', 'err'); return; }
      S.saveConfig({ url: v('#syncUrl'), key: v('#syncKey'), deviceName: v('#syncDevice'), email: email });
      signup.disabled = true; signup.textContent = '注册中…';
      S.signUp(email, pass).then(function (r) {
        signup.disabled = false; signup.textContent = '注册新账号';
        if (r.needConfirm) {
          App.ui.modal({
            title: '账号已创建，还差一步',
            width: 460,
            body: '<div style="font-size:13px;line-height:1.9">Supabase 默认要求验证邮箱：请到 <b>' + U.esc(email) +
              '</b> 收确认邮件并点链接，然后回到这里填邮箱密码点「登录并开启同步」。<br>' +
              '<span class="tiny muted">如果不想验证：Supabase → Authentication → Providers → Email → 关闭 Confirm email，再重新注册。</span></div>',
            footer: [{ label: '知道了', cls: 'primary', onClick: function (c) { c(); } }]
          });
        } else {
          toast('账号已创建，正在连接…', 'ok');
          return S.link().then(function () { App.render(); toast('已连接云端', 'ok'); });
        }
      })['catch'](function (e) {
        signup.disabled = false; signup.textContent = '注册新账号';
        toast(e.message, 'err', 7000);
      });
    };

    var out = el.querySelector('#syncOut');
    if (out) out.onclick = function () {
      App.ui.confirm('退出后本机数据<b>完整保留</b>，只是不再上传、也不再从云端拉取。<br>' +
        '<span class="tiny muted">地址、key、邮箱会留着，以后填个密码就能重新登录。想彻底变回「仅本地」用下面的「清除云端配置」。</span>',
        { okLabel: '退出登录' }).then(function (ok) {
        if (!ok) return;
        S.signOut().then(function () {
          App.render();
          toast('已断开云端：数据只留在这台电脑，不再与另一台互相覆盖', 'ok', 4400);
        });
      });
    };

    var forget = el.querySelector('#syncForget');
    if (forget) forget.onclick = function () {
      App.ui.confirm('会清掉这台电脑里保存的 <b>Project URL、anon key、登录邮箱</b>，界面回到「仅本地」。<br>' +
        '<span class="tiny muted">本机数据一条不动。以后想再连云端，把地址和 key 重新填一遍即可。</span>',
        { danger: true, okLabel: '清除配置' }).then(function (ok) {
        if (!ok) return;
        S.saveConfig({ url: '', key: '', email: '', auto: true });
        App.render();
        toast('已清除云端配置，现在是纯本地模式', 'ok');
      });
    };

    var now = el.querySelector('#syncNow');
    if (now) now.onclick = function () {
      now.disabled = true; now.textContent = '同步中…';
      S.sync().then(function (r) {
        App.render();
        var map = { push: '已上传本机改动', pull: '已拉取云端最新数据', noop: '两边一致，无需同步', offline: '当前离线，改动已存本机', skip: '未登录或未配置' };
        toast(map[r && r.action] || '同步完成', 'ok', 3000);
      })['catch'](function (e) {
        now.disabled = false; now.textContent = '立即同步';
        toast(e.message, 'err', 6400);
      });
    };

    var push = el.querySelector('#syncPush');
    if (push) push.onclick = function () {
      App.ui.confirm('会用<b>这台电脑的数据覆盖云端</b>，另一台设备的改动会丢失。<br>确定上传吗？', { okLabel: '覆盖上传' }).then(function (ok) {
        if (!ok) return;
        push.disabled = true; push.textContent = '上传中…';
        S.pushLocal().then(function () {
          App.render(); toast('本机数据已上传到云端', 'ok', 3200);
        })['catch'](function (e) {
          push.disabled = false; push.textContent = '上传本机 → 云端';
          toast(e.message, 'err', 6400);
        });
      });
    };

    var pull = el.querySelector('#syncPull');
    if (pull) pull.onclick = function () {
      App.ui.confirm('会用<b>云端数据覆盖这台电脑</b>，本机未上传的改动会丢失。<br>' +
        '<span class="tiny muted">建议先在上面「本地数据」里导出备份。</span>', { danger: true, okLabel: '覆盖本机' }).then(function (ok) {
          if (!ok) return;
          pull.disabled = true; pull.textContent = '下载中…';
          S.pullRemote().then(function () {
            App.render(); toast('已用云端数据覆盖本机', 'ok', 3200);
          })['catch'](function (e) {
            pull.disabled = false; pull.textContent = '用云端覆盖本机';
            toast(e.message, 'err', 6400);
          });
        });
    };

    var cf = el.querySelector('#syncConflict');
    if (cf) cf.onclick = function () { S.openConflict(); };

    var copy = el.querySelector('#syncCopySql');
    if (copy) copy.onclick = function () { U.copy(S.SQL); };
  }

  /* 生成一张含算式的测试图，用于验证视觉模型是否真的能读图 */
  function testImage() {
    var cv = document.createElement('canvas');
    cv.width = 420; cv.height = 130;
    var c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#222222';
    c.font = 'bold 46px "PingFang SC", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('3 + 4 = 7', cv.width / 2, cv.height / 2);
    return cv.toDataURL('image/png');
  }
})();
