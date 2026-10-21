/* ==========================================================
   sync.js — Supabase 云端同步
   设计要点：
   1. 不引入 SDK、不需要构建：直接走 Supabase 的 REST（Auth + PostgREST）。
   2. 一份快照 = 整份工作台数据（一个用户一行），按 rev 递增判断新旧，
      不依赖两台电脑的本地时钟。
   3. 冲突绝不自动覆盖：本地有未上传改动、云端又比上次见到的新，
      就停在「待合并」，让老师自己选。
   4. 没配置 / 没登录时完全离线：localStorage + IndexedDB，不联网。
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var CFG_KEY = 'stella_sync_v1';
  var TABLE = 'wb_snapshots';

  var SQL = [
    '-- ① 快照表：一个账号一行，存整份工作台数据',
    'create table if not exists public.' + TABLE + ' (',
    '  user_id    uuid primary key references auth.users(id) on delete cascade,',
    '  data       jsonb  not null,',
    '  rev        integer not null default 1,',
    '  device     text,',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    '-- ② 更新时自动刷新时间戳',
    'create or replace function public.wb_touch() returns trigger as $$',
    'begin',
    '  new.updated_at := now();',
    '  return new;',
    'end;',
    '$$ language plpgsql;',
    '',
    'drop trigger if exists wb_snapshots_touch on public.' + TABLE + ';',
    'create trigger wb_snapshots_touch before update on public.' + TABLE,
    'for each row execute function public.wb_touch();',
    '',
    '-- ③ 行级安全：每个账号只能读写自己那一行',
    'alter table public.' + TABLE + ' enable row level security;',
    '',
    'drop policy if exists "wb own row" on public.' + TABLE + ';',
    'create policy "wb own row" on public.' + TABLE,
    '  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);'
  ].join('\n');

  /* ---------------- 配置 ---------------- */
  function loadCfg() {
    var raw = null;
    try { raw = localStorage.getItem(CFG_KEY); } catch (e) { }
    var c = {};
    try { c = raw ? JSON.parse(raw) : {}; } catch (e) { c = {}; }
    if (!c || typeof c !== 'object') c = {};
    return {
      url: c.url || '',
      key: c.key || '',
      email: c.email || '',
      accessToken: c.accessToken || '',
      refreshToken: c.refreshToken || '',
      expiresAt: c.expiresAt || 0,
      userId: c.userId || '',
      deviceId: c.deviceId || '',
      deviceName: c.deviceName || '',
      auto: c.auto !== false,
      rev: c.rev || 0,
      remoteAt: c.remoteAt || '',
      lastSyncAt: c.lastSyncAt || 0,
      lastError: c.lastError || '',
      dirty: c.dirty === true,
      dirtyAt: c.dirtyAt || 0
    };
  }

  var cfg = loadCfg();
  var started = false;
  var running = false;
  var conflict = null;
  var timers = { change: null, poll: null };
  var prompting = false;

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  function guessDevice() {
    var ua = navigator.userAgent || '';
    var os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
        : /Mac OS X/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows'
            : /Linux/.test(ua) ? 'Linux' : '设备';
    var br = /Edg\//.test(ua) ? 'Edge'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : /Firefox\//.test(ua) ? 'Firefox' : '浏览器';
    return os + ' · ' + br;
  }

  (function ensureDevice() {
    var changed = false;
    if (!cfg.deviceId) { cfg.deviceId = 'dev_' + Math.random().toString(36).slice(2, 10); changed = true; }
    if (!cfg.deviceName) { cfg.deviceName = guessDevice(); changed = true; }
    if (changed) saveCfg();
  })();

  /* ---------------- 网络请求 ---------------- */
  function normUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    u = u.replace(/\/+$/, '');
    u = u.replace(/\/rest\/v1$/i, '');
    u = u.replace(/\/auth\/v1$/i, '');
    return u;
  }

  function friendly(msg, status) {
    var m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return '邮箱或密码不正确';
    if (/Email not confirmed/i.test(m)) return '邮箱还没验证：请到邮箱点确认链接，或在 Supabase 后台关闭邮箱验证';
    if (/User already registered/i.test(m)) return '这个邮箱已注册，直接点「登录」即可';
    if (/relation .* does not exist|Could not find the table/i.test(m)) return '云端还没有建表：请复制下面的 SQL 到 Supabase 的 SQL Editor 执行';
    if (/row-level security|violates row-level/i.test(m)) return '权限被拒绝：请确认已执行建表 SQL（含 RLS 策略）';
    if (/Invalid API key|apikey/i.test(m)) return 'anon key 不正确：请从 Supabase → Project Settings → API 复制 anon public key';
    if (/Password should be at least/i.test(m)) return '密码太短：Supabase 默认要求至少 6 位';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '连不上服务器：检查网络，或确认项目地址是否正确';
    if (status === 401) return '登录状态已失效，请重新登录';
    if (status === 404) return '接口不存在：请确认项目地址（形如 https://xxxx.supabase.co）';
    return m || ('请求失败（HTTP ' + status + '）');
  }

  function req(path, opt) {
    opt = opt || {};
    var headers = { 'apikey': cfg.key, 'Content-Type': 'application/json' };
    if (cfg.accessToken) headers['Authorization'] = 'Bearer ' + cfg.accessToken;
    if (opt.headers) Object.keys(opt.headers).forEach(function (k) { headers[k] = opt.headers[k]; });
    var init = { method: opt.method || 'GET', headers: headers, cache: 'no-store' };
    if (opt.body !== undefined) init.body = JSON.stringify(opt.body);

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, opt.timeout || 20000);
    }

    return fetch(cfg.url + path, init).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var raw = (j && (j.message || j.error_description || j.error || j.hint || j.msg)) || t || ('HTTP ' + r.status);
          var err = new Error(friendly(raw, r.status));
          err.status = r.status;
          err.raw = raw;
          throw err;
        }
        return j;
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      var err = new Error(e && e.name === 'AbortError'
        ? '请求超时：网络慢，或项目地址填错了'
        : '网络不可达：检查网络连接');
      err.offline = true;
      throw err;
    });
  }

  /* ---------------- 账号 ---------------- */
  function applySession(j) {
    if (!j || !j.access_token) return j;
    cfg.accessToken = j.access_token;
    cfg.refreshToken = j.refresh_token || cfg.refreshToken;
    cfg.expiresAt = Date.now() + ((j.expires_in || 3600) * 1000);
    if (j.user && j.user.id) cfg.userId = j.user.id;
    if (j.user && j.user.email) cfg.email = j.user.email;
    saveCfg();
    return j;
  }

  function ensureToken() {
    if (!cfg.accessToken) return Promise.reject(new Error('还没有登录云端账号'));
    if (Date.now() < cfg.expiresAt - 60000) return Promise.resolve();
    if (!cfg.refreshToken) return Promise.reject(new Error('登录已过期，请重新登录'));
    return req('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: cfg.refreshToken }
    }).then(applySession)['catch'](function () {
      cfg.accessToken = ''; cfg.refreshToken = ''; cfg.userId = '';
      saveCfg();
      throw new Error('登录已过期，请重新登录');
    });
  }

  function signIn(email, password) {
    if (!cfg.url || !cfg.key) return Promise.reject(new Error('先填写 Supabase 项目地址和 anon key'));
    return req('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: email, password: password }
    }).then(function (j) { applySession(j); emit(); return j; });
  }

  function signUp(email, password) {
    if (!cfg.url || !cfg.key) return Promise.reject(new Error('先填写 Supabase 项目地址和 anon key'));
    return req('/auth/v1/signup', {
      method: 'POST', body: { email: email, password: password }
    }).then(function (j) {
      if (j && j.access_token) { applySession(j); emit(); return { ok: true, needConfirm: false }; }
      return { ok: true, needConfirm: true };
    });
  }

  function signOut() {
    var p = cfg.accessToken
      ? req('/auth/v1/logout', { method: 'POST' })['catch'](function () { })
      : Promise.resolve();
    return p.then(function () {
      cfg.accessToken = ''; cfg.refreshToken = ''; cfg.expiresAt = 0;
      cfg.userId = ''; cfg.rev = 0; cfg.remoteAt = ''; cfg.lastSyncAt = 0;
      cfg.lastError = ''; cfg.dirty = false;
      conflict = null;
      saveCfg(); emit();
    });
  }

  /* ---------------- 快照读写 ---------------- */
  /* 只取版本号（几百字节）：自动同步先拿它比对，没变化就完全不下载正文 */
  function headRemote() {
    return ensureToken().then(function () {
      return req('/rest/v1/' + TABLE + '?user_id=eq.' + encodeURIComponent(cfg.userId) +
        '&select=rev,updated_at,device&limit=1');
    }).then(function (rows) {
      return (rows && rows[0]) || null;
    });
  }

  /* 取整份数据（含 data）：只有云端真的变了，或需要弹冲突选择时才调用 */
  function pullRaw() {
    return ensureToken().then(function () {
      return req('/rest/v1/' + TABLE + '?user_id=eq.' + encodeURIComponent(cfg.userId) +
        '&select=rev,updated_at,device,data&limit=1');
    }).then(function (rows) {
      return (rows && rows[0]) || null;
    });
  }

  function upload(baseRev) {
    return ensureToken().then(function () {
      var rev = Math.max(cfg.rev || 0, baseRev || 0) + 1;
      var payload = {
        user_id: cfg.userId,
        data: App.store.db,
        rev: rev,
        device: cfg.deviceName,
        updated_at: new Date().toISOString()
      };
      return req('/rest/v1/' + TABLE + '?on_conflict=user_id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: payload
      }).then(function (rows) {
        var row = (rows && rows[0]) || payload;
        cfg.rev = row.rev != null ? row.rev : rev;
        cfg.remoteAt = row.updated_at || payload.updated_at;
        cfg.dirty = false;
        cfg.dirtyAt = 0;
        cfg.lastSyncAt = Date.now();
        cfg.lastError = '';
        saveCfg(); emit();
        return { action: 'push', rev: cfg.rev };
      });
    });
  }

  function applyRemote(remote) {
    App.store.adopt(remote.data);
    cfg.rev = remote.rev || 0;
    cfg.remoteAt = remote.updated_at || '';
    cfg.dirty = false;
    cfg.dirtyAt = 0;
    cfg.lastSyncAt = Date.now();
    cfg.lastError = '';
    conflict = null;
    saveCfg(); emit();
    try { App.state = {}; } catch (e) { }
    try { if (App.render) App.render(); } catch (e) { console.error(e); }
  }

  function counts(d) {
    d = d || {};
    return {
      students: (d.students || []).length,
      classes: (d.classes || []).length,
      exams: (d.exams || []).length,
      records: (d.records || []).length,
      papers: (d.papers || []).length
    };
  }

  function countLine(d) {
    var c = counts(d);
    return c.students + ' 位学生 · ' + c.classes + ' 个班级 · ' + c.exams + ' 次测验 · ' +
      c.records + ' 条课堂记录 · ' + c.papers + ' 份试卷分析';
  }

  /* ---------------- 状态 ---------------- */
  function configured() { return !!(cfg.url && cfg.key); }
  function linked() { return !!(cfg.userId && cfg.accessToken); }

  function hhmm(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function status() {
    var s = { at: cfg.lastSyncAt, email: cfg.email, device: cfg.deviceName, dirty: cfg.dirty };
    if (!configured()) {
      s.mode = 'local'; s.tone = 'gray'; s.badge = 'gray';
      s.label = '仅本地'; s.time = '';
      s.title = '仅本地模式';
      s.detail = '数据保存在这台电脑：localStorage 为主，IndexedDB 做冗余备份。不上传任何服务器。';
      return s;
    }
    if (!linked()) {
      s.mode = 'setup'; s.tone = 'gray'; s.badge = 'gray';
      s.label = '未登录'; s.time = '';
      s.title = '已填地址，还没登录';
      s.detail = '登录后即可在这台电脑和云端之间同步；未登录时数据仍只存在本机。';
      return s;
    }
    if (conflict) {
      s.mode = 'conflict'; s.tone = 'amber'; s.badge = 'amber';
      s.label = '待合并'; s.time = '';
      s.title = '两台设备都改过数据';
      s.detail = '为避免覆盖，同步已暂停。请到「设置 → 云端同步」选择保留哪一边。';
      return s;
    }
    if (running) {
      s.mode = 'syncing'; s.tone = 'lavender'; s.badge = 'blue';
      s.label = '同步中'; s.time = '';
      s.title = '正在同步…';
      s.detail = '正在和 Supabase 交换数据。';
      return s;
    }
    if (!navigator.onLine) {
      s.mode = 'offline'; s.tone = 'amber'; s.badge = 'amber';
      s.label = '离线'; s.time = hhmm(cfg.lastSyncAt);
      s.title = '离线 · 已保存在本机';
      s.detail = '当前没有网络，改动先存在这台电脑，联网后会自动补传。';
      return s;
    }
    if (cfg.lastError) {
      s.mode = 'error'; s.tone = 'rose'; s.badge = 'rose';
      s.label = '同步异常'; s.time = hhmm(cfg.lastSyncAt);
      s.title = '同步没有成功';
      s.detail = cfg.lastError;
      return s;
    }
    /* 自动同步被关掉时，有改动要显式提示，否则容易以为已经上云 */
    if (cfg.dirty && !cfg.auto) {
      s.mode = 'pending'; s.tone = 'amber'; s.badge = 'amber';
      s.label = '待上传'; s.time = hhmm(cfg.lastSyncAt);
      s.title = '有改动还没上传';
      s.detail = '自动同步已关闭（改动只存在本机）。点「立即同步」上传，或重新打开自动同步。';
      return s;
    }
    s.mode = 'linked'; s.tone = 'mint'; s.badge = 'mint';
    s.label = '已同步'; s.time = hhmm(cfg.lastSyncAt);
    s.title = '已连接云端 · 自动同步';
    s.detail = '本机改动约 1~2 秒后自动上传；另一台电脑登录同一账号即可看到。';
    return s;
  }

  /* 顶栏 / 设置页横幅共用的小标题文案 */
  function bannerHTML() {
    var s = status();
    var meta = [];
    if (cfg.deviceName) meta.push('本机：' + esc(cfg.deviceName));
    if (cfg.email) meta.push(esc(cfg.email));
    if (s.mode === 'linked' && cfg.lastSyncAt) meta.push('上次同步 ' + hhmm(cfg.lastSyncAt));
    if (cfg.dirty && s.mode !== 'local') meta.push('有改动待上传');
    return '<div class="sb-dot"></div>' +
      '<div class="sb-text"><strong>' + esc(s.title) + '</strong><span>' + esc(s.detail) + '</span>' +
      (meta.length ? '<em>' + meta.join(' · ') + '</em>' : '') + '</div>';
  }

  function esc(s) { return App.util ? App.util.esc(s) : String(s == null ? '' : s); }

  function applyToDom() {
    var s = status();
    document.querySelectorAll('[data-sync-badge]').forEach(function (n) {
      n.classList.remove('tone-gray', 'tone-mint', 'tone-amber', 'tone-rose', 'tone-lavender');
      n.classList.add('tone-' + s.tone);
      n.setAttribute('title', s.title + '：' + s.detail);
      var l = n.querySelector('.sc-label'); if (l) l.textContent = s.label;
      var t = n.querySelector('.sc-time'); if (t) t.textContent = s.time || '';
    });
    var banner = document.getElementById('syncBanner');
    if (banner) {
      banner.classList.remove('tone-gray', 'tone-mint', 'tone-amber', 'tone-rose', 'tone-lavender');
      banner.classList.add('tone-' + s.tone);
      banner.innerHTML = bannerHTML();
    }
    var tip = document.getElementById('sideTip');
    if (tip) {
      var strong = tip.querySelector('strong'), span = tip.querySelector('span');
      if (s.mode === 'local' || s.mode === 'setup') {
        if (strong) strong.textContent = '本地存储';
        if (span) span.innerHTML = '数据只存本机，不上传<span class="nw">服务器</span>';
      } else if (s.mode === 'linked') {
        if (strong) strong.textContent = '云端已同步';
        if (span) span.textContent = '同名账号的设备之间自动同步' + (s.time ? ' · ' + s.time : '');
      } else {
        if (strong) strong.textContent = s.mode === 'offline' ? '离线 · 已存本机' : s.label;
        if (span) span.textContent = s.mode === 'offline' ? '改动先存本机，联网后自动补传' : (s.detail || '');
      }
    }
    var chip = document.getElementById('syncChip');
    if (chip) {
      chip.classList.toggle('is-off', s.mode === 'local' || s.mode === 'setup');
      chip.classList.toggle('is-warn', s.mode === 'offline' || s.mode === 'error' || s.mode === 'conflict');
    }
    var card = document.getElementById('syncMini');
    if (card) {
      card.classList.remove('tone-gray', 'tone-mint', 'tone-amber', 'tone-rose', 'tone-lavender');
      card.classList.add('tone-' + s.tone);
      var cl = card.querySelector('.sc-label'); if (cl) cl.textContent = s.label;
      var cb = card.querySelector('.sc-badge'); if (cb) cb.textContent = s.title;
    }
    /* 设置页卡片右上角的徽标跟着状态走 */
    var cardEl = document.getElementById('syncCard');
    if (cardEl) {
      var badge = cardEl.querySelector('.card-head .badge');
      if (badge) { badge.className = 'badge ' + s.badge; badge.textContent = s.label; }
      var mc2 = cardEl.querySelectorAll('.mc-tag');
      if (mc2.length === 2) {
        var linkedNow = s.mode !== 'local' && s.mode !== 'setup';
        mc2[0].textContent = linkedNow ? '未启用' : '当前';
        mc2[1].textContent = linkedNow ? (s.mode === 'conflict' ? '待合并' : '已连接') : '可选';
      }
    }
    document.dispatchEvent(new CustomEvent('app:sync', { detail: s }));
  }

  function emit() { try { applyToDom(); } catch (e) { console.error(e); } }

  /* ---------------- 调度 ---------------- */
  function notifyChange() {
    cfg.dirty = true;
    cfg.dirtyAt = Date.now();
    saveCfg();
    emit();
    /* 图片还在从本机缓存载入时不许上传，免得把「无图版」覆盖到云端 */
    if (App.store && App.store.bootInfo && App.store.bootInfo().imgPending) return;
    if (!cfg.auto || !configured() || !linked()) return;
    if (timers.change) clearTimeout(timers.change);
    timers.change = setTimeout(function () {
      sync().catch(function () { });
    }, 1400);
  }

  function sync(opts) {
    opts = opts || {};
    if (!configured() || !linked()) return Promise.resolve({ action: 'skip' });
    if (running) return Promise.resolve({ action: 'busy' });
    /* 同上：本机图片未就绪时先不动云端 */
    if (App.store && App.store.bootInfo && App.store.bootInfo().imgPending) {
      return Promise.resolve({ action: 'waiting-images' });
    }
    if (!navigator.onLine) { emit(); return Promise.resolve({ action: 'offline' }); }
    running = true; emit();

    /* 先只取版本号：绝大多数轮询在这一步就返回，不下载正文（整库可能有几 MB 图片） */
    return headRemote().then(function (head) {
      if (!head) {                         /* 云端还没有数据 → 首次上传 */
        return upload(0).then(finish);
      }
      var hrev = head.rev || 0;
      var newer = hrev > (cfg.rev || 0);

      /* ① 云端没更新、本机也没有待上传 → 直接结束 */
      if (!newer && !cfg.dirty && !opts.forcePush) {
        cfg.rev = Math.max(cfg.rev || 0, hrev);
        cfg.remoteAt = head.updated_at || '';
        cfg.lastSyncAt = Date.now();
        cfg.lastError = '';
        saveCfg();
        return finish({ action: 'noop' });
      }

      /* ② 云端没更新、本机有改动 → 直接上传，同样不必先下载 */
      if (!newer && !opts.forcePull) {
        return upload(hrev).then(finish);
      }

      /* ③ 云端更新了（或要求强制拉取）→ 这时才下载整份数据 */
      return pullRaw().then(function (remote) {
        if (!remote) return upload(0).then(finish);
        var remoteNewer = (remote.rev || 0) > (cfg.rev || 0);
        if (remoteNewer) {
          if (cfg.dirty && !opts.forcePull) {
            conflict = remote;
            running = false;
            cfg.lastError = '';
            saveCfg(); emit();
            askConflict();
            return { action: 'conflict' };
          }
          applyRemote(remote);
          running = false;
          return { action: 'pull' };
        }
        if (cfg.dirty || opts.forcePush) {
          return upload(remote.rev || 0).then(finish);
        }
        cfg.rev = Math.max(cfg.rev || 0, remote.rev || 0);
        cfg.remoteAt = remote.updated_at || '';
        cfg.lastSyncAt = Date.now();
        cfg.lastError = '';
        saveCfg();
        running = false; emit();
        return { action: 'noop' };
      });
    })['catch'](function (e) {
      running = false;
      cfg.lastError = e.message || '同步失败';
      saveCfg(); emit();
      throw e;
    });

    function finish(r) { running = false; emit(); return r; }
  }

  /* 首次把本机数据接上云端：两边都有内容时必须让老师选 */
  function link() {
    if (!linked()) return Promise.reject(new Error('还没有登录云端账号'));
    running = true; emit();
    return pullRaw().then(function (remote) {
      running = false;
      if (!remote) {
        cfg.dirty = true;
        return upload(0).then(function (r) { emit(); return { action: 'push-init', rev: r.rev }; });
      }
      return chooseInitial(remote);
    })['catch'](function (e) {
      running = false;
      cfg.lastError = e.message;
      saveCfg(); emit();
      throw e;
    });
  }

  function chooseInitial(remote) {
    var bi = (App.store.bootInfo && App.store.bootInfo()) || {};
    /* 这台电脑本来就没有数据、登录后也没改过任何东西 → 直接以云端为准，不必做题 */
    if (bi.hadLocal === false && !bi.restored && !bi.edited) {
      applyRemote(remote);
      return Promise.resolve({ action: 'pull-init', auto: true });
    }
    return new Promise(function (resolve) {
      var localLine = countLine(App.store.db);
      var remoteLine = countLine(remote.data);
      var m = App.ui.modal({
        title: '云端已有数据，保留哪一边？',
        width: 560,
        body: '<div style="font-size:13px;line-height:1.9">' +
          '这个账号在云端已经存过一份数据，这台电脑也有一份。首次连接需要先决定以谁为准，' +
          '之后两边就会自动保持一致。<br><span class="tiny muted">两边的内容都会先各存一份在你本机，选错了还能从本地备份恢复。</span></div>' +
          '<div class="pick-two">' +
          '<div class="pk"><div class="pk-t">这台电脑</div><div class="pk-d">' + esc(localLine) + '</div>' +
          '<button class="btn primary block" data-pick="local">用本机覆盖云端</button></div>' +
          '<div class="pk"><div class="pk-t">云端（' + esc(remote.device || '其他设备') + '）</div>' +
          '<div class="pk-d">' + esc(remoteLine) + '<br><span class="tiny muted">更新于 ' +
          esc(String(remote.updated_at || '').replace('T', ' ').slice(0, 16)) + '</span></div>' +
          '<button class="btn primary block" data-pick="remote">用云端覆盖本机</button></div>' +
          '</div>',
        footer: [{ label: '稍后决定（先只用本地）', onClick: function (close) { close(); resolve({ action: 'cancel' }); } }]
      });
      m.root.querySelectorAll('[data-pick]').forEach(function (b) {
        b.onclick = function () {
          var pick = b.dataset.pick;
          m.close();
          running = true; emit();
          if (pick === 'remote') {
            applyRemote(remote);
            running = false;
            resolve({ action: 'pull-init' });
          } else {
            upload(remote.rev || 0).then(function () {
              running = false; emit();
              resolve({ action: 'push-init' });
            })['catch'](function (e) {
              running = false; cfg.lastError = e.message; saveCfg(); emit();
              resolve({ action: 'error' });
            });
          }
        };
      });
    });
  }

  function askConflict() {
    if (prompting) return;
    prompting = true;
    setTimeout(function () {
      prompting = false;
      var m = promptConflict();
      if (!m) return;
    }, 60);
  }

  function promptConflict(remoteArg) {
    var remote = remoteArg || conflict;
    if (!remote) { App.ui.toast('没有待合并的冲突', 'ok'); return null; }
    var localLine = countLine(App.store.db);
    var remoteLine = countLine(remote.data);
    var m = App.ui.modal({
      title: '两台设备都改过，选一份保留',
      width: 580,
      body: '<div style="font-size:13px;line-height:1.9">同步已暂停，不会自动覆盖任何一边。' +
        '本机改动和云端改动无法自动合并（比如都在不同设备上新增学生），请选一份作为最终版本。<br>' +
        '<span class="tiny muted">建议先点「↓ 导出本机备份」，再决定。</span></div>' +
        '<div class="pick-two">' +
        '<div class="pk"><div class="pk-t">这台电脑（较新改动）</div><div class="pk-d">' + esc(localLine) + '</div>' +
        '<button class="btn primary block" data-pick="local">保留本机，覆盖云端</button></div>' +
        '<div class="pk"><div class="pk-t">云端（' + esc(remote.device || '其他设备') + '）</div>' +
        '<div class="pk-d">' + esc(remoteLine) + '<br><span class="tiny muted">更新于 ' +
        esc(String(remote.updated_at || '').replace('T', ' ').slice(0, 16)) + '</span></div>' +
        '<button class="btn primary block" data-pick="remote">保留云端，覆盖本机</button></div>' +
        '</div>',
      footer: [
        {
          label: '↓ 导出本机备份', onClick: function (close, root) {
            App.util.download('Stella工作台_冲突备份_' + App.util.todayISO() + '.json', App.store.exportJSON(), 'application/json');
            App.ui.toast('本机备份已下载', 'ok');
          }
        },
        { label: '稍后处理', onClick: function (close) { close(); } }
      ]
    });
    m.root.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onclick = function () {
        var pick = b.dataset.pick;
        m.close();
        if (pick === 'remote') {
          applyRemote(remote);
          App.ui.toast('已用云端数据覆盖本机', 'ok', 3000);
        } else {
          cfg.dirty = true;
          running = true; emit();
          upload(remote.rev || 0).then(function () {
            running = false; emit();
            App.ui.toast('已用本机数据覆盖云端', 'ok', 3000);
          })['catch'](function (e) {
            running = false; cfg.lastError = e.message; saveCfg(); emit();
            App.ui.toast(e.message, 'err', 4200);
          });
        }
      };
    });
    return m;
  }

  /* ---------------- 手动操作 ---------------- */
  function pushLocal() {
    if (!linked()) return Promise.reject(new Error('还没有登录云端账号'));
    running = true; emit();
    return pullRaw().then(function (remote) {
      cfg.dirty = true;
      return upload(remote ? remote.rev : 0);
    }).then(function (r) {
      running = false; emit();
      return r;
    })['catch'](function (e) {
      running = false; cfg.lastError = e.message; saveCfg(); emit();
      throw e;
    });
  }

  function pullRemote() {
    if (!linked()) return Promise.reject(new Error('还没有登录云端账号'));
    running = true; emit();
    return pullRaw().then(function (remote) {
      running = false;
      if (!remote) { emit(); throw new Error('云端还没有数据，先点「上传本机」'); }
      applyRemote(remote);
      return { action: 'pull' };
    })['catch'](function (e) {
      running = false; cfg.lastError = e.message; saveCfg(); emit();
      throw e;
    });
  }

  function testConnection() {
    if (!configured()) return Promise.reject(new Error('先填写项目地址和 anon key'));
    return req('/rest/v1/' + TABLE + '?select=user_id&limit=1').then(function () {
      return { ok: true, note: linked() ? '连接正常' : '连接正常（还没登录账号）' };
    });
  }

  function saveConfig(o) {
    o = o || {};
    if (o.url !== undefined) cfg.url = normUrl(o.url);
    if (o.key !== undefined) cfg.key = String(o.key || '').trim();
    if (o.deviceName !== undefined) cfg.deviceName = String(o.deviceName || '').trim() || guessDevice();
    if (o.auto !== undefined) cfg.auto = !!o.auto;
    if (o.email !== undefined) cfg.email = String(o.email || '').trim();
    /* 换了项目地址或 key，原来的登录态就作废 */
    if (o.url !== undefined || o.key !== undefined) {
      cfg.accessToken = ''; cfg.refreshToken = ''; cfg.userId = '';
      cfg.rev = 0; cfg.remoteAt = ''; cfg.lastSyncAt = 0; cfg.lastError = '';
      cfg.dirty = false; conflict = null;
    }
    saveCfg();
    emit();
  }

  /* ---------------- 生命周期 ---------------- */
  function init() {
    if (started) return;
    started = true;

    window.addEventListener('online', function () {
      if (configured() && linked()) sync().catch(function () { });
    });
    window.addEventListener('offline', emit);
    window.addEventListener('pagehide', function () {
      if (App.store && App.store.flush) App.store.flush();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!configured() || !linked()) return;
      if (Date.now() - cfg.lastSyncAt < 20000) return;
      sync().catch(function () { });
    });

    if (timers.poll) clearInterval(timers.poll);
    timers.poll = setInterval(function () {
      if (!configured() || !linked() || !cfg.auto) return;
      if (document.visibilityState !== 'visible') return;
      var stale = Date.now() - cfg.lastSyncAt > 60000;
      var stuck = cfg.dirty && Date.now() - cfg.dirtyAt > 8000;
      if (!stale && !stuck) return;
      /* 正在输入时不打断，避免把输入框内容重绘掉 */
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      sync().catch(function () { });
    }, 25000);

    if (configured() && linked()) {
      sync().catch(function () { });
    } else {
      emit();
    }
  }

  App.sync = {
    SQL: SQL,
    config: function () { return cfg; },
    configured: configured,
    linked: linked,
    status: status,
    bannerHTML: bannerHTML,
    applyToDom: applyToDom,
    deviceName: function () { return cfg.deviceName; },
    saveConfig: saveConfig,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    testConnection: testConnection,
    link: link,
    sync: sync,
    pushLocal: pushLocal,
    pullRemote: pullRemote,
    notifyChange: notifyChange,
    pendingConflict: function () { return conflict; },
    openConflict: function () { return promptConflict(); },
    clearConflict: function () {
      conflict = null;
      cfg.dirty = false;
      saveCfg(); emit();
    },
    init: init,
    when: function (ts) { return hhmm(ts); }
  };
})();
