/* ==========================================================
   page-communication.js — 家校沟通（中英三版高情商回复）
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  var SCENES = [
    { label: '成绩下滑', text: '老师您好，孩子这次考得不太好，我们有点着急，想了解一下他在课堂上的情况，需要我们在家怎么配合？' },
    { label: '作业未交', text: '老师您好，孩子说昨天的作业忘记做了，是不是最近作业量比较大？我们该怎么督促他？' },
    { label: '上课分心', text: '老师您好，孩子最近在家写作业很拖拉，说上课有时候听不太懂，是不是跟不上了？' },
    { label: '想请假', text: '老师您好，孩子这周六有个活动，想请一次假，落下的内容我们怎么补？' },
    { label: '进步了', text: '老师您好，孩子这次考得不错，特别开心，谢谢老师！想问问接下来怎么保持？' }
  ];

  function parseReplies(txt) {
    var out = {};
    var parts = txt.split(/【(正式|温和|English|英文版|英文)】/);
    if (parts.length >= 3) {
      for (var i = 1; i < parts.length; i += 2) {
        var label = parts[i], content = (parts[i + 1] || '').trim();
        if (label === '正式') out.a = content;
        else if (label === '温和') out.b = content;
        else out.en = content;
      }
    }
    if (!out.a && !out.b && !out.en) out.a = txt.trim();
    return out;
  }

  function replyCard(title, badgeCls, text, key) {
    return '<div class="reply-card mb12"><h4>' + title + ' <span class="badge ' + badgeCls + '">' + (key === 'en' ? 'English' : '中文') + '</span>' +
      '<span class="spacer"></span><button class="btn sm" data-copy-reply="' + key + '">复制</button></h4>' +
      '<div class="reply-text ' + (key === 'en' ? 'en' : '') + '">' + (App.util.esc(text || '（待生成）')) + '</div></div>';
  }

  App.pages.communication = {
    title: '家校沟通',
    sub: '粘贴家长消息，一键生成三版高情商回复',
    render: function (el) {
      var db = App.store.db, U = App.util;
      var st = App.state.comm || (App.state.comm = {});
      if (!st.studentId || !U.stu(st.studentId)) st.studentId = (U.studentsOf(db.meta.currentClassId)[0] || {}).id || (db.students[0] || {}).id || '';
      st.tone = st.tone || '温和';
      st.replies = st.replies || null;

      var stu = U.stu(st.studentId);
      var cls = stu ? U.cls(stu.classId) : null;
      var lastExam = stu ? (U.stuScores(stu.id).slice(-1)[0] || null) : null;

      var html = '<div class="grid g-2-1">';

      /* 左：输入 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>家长消息</h3>' +
        '<span class="sub">' + (App.ai.configured() ? '已连接 AI 接口' : '当前为本地模板模式') + '</span></div>';

      html += '<div class="grid g-2" style="gap:10px">' +
        '<div class="field"><label>关联学生</label><select class="select" id="cmStu">' +
        db.students.map(function (s) {
          return '<option value="' + s.id + '" ' + (s.id === st.studentId ? 'selected' : '') + '>' + U.esc(s.en) + '（' + U.esc(U.clsName(s.classId)) + '）</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>语气风格</label><div class="chip-row">' +
        ['温和', '共情', '坚定'].map(function (t) {
          return '<button class="chip ' + (st.tone === t ? 'active' : '') + '" data-tone="' + t + '">' + t + '</button>';
        }).join('') + '</div></div></div>';

      if (stu) {
        html += '<div class="row wrap mb12" style="gap:6px"><span class="badge">' + U.esc(cls ? cls.name : '未分班') + '</span>' +
          (lastExam ? '<span class="badge mint">最近 ' + lastExam.score + '/' + lastExam.exam.full + '</span>' : '<span class="badge gray">暂无成绩</span>') +
          '<span class="badge gray">' + U.esc(stu.system || '') + '</span></div>';
      }

      html += '<div class="tiny muted mb8">常见场景（点一下填入示例）</div><div class="chip-row mb12">' +
        SCENES.map(function (s, i) { return '<button class="chip" data-scene="' + i + '">' + s.label + '</button>'; }).join('') + '</div>';

      html += '<textarea class="textarea" id="cmMsg" style="min-height:150px" placeholder="把家长发来的微信消息原样粘贴在这里…">' + U.esc(st.message || '') + '</textarea>';
      html += '<div class="row mt12" style="gap:8px"><button class="btn primary" id="cmGen">生成三版回复</button>' +
        '<span class="tiny muted">生成结果可编辑后再复制</span></div></div>';

      /* 右：结果 */
      html += '<div class="card"><div class="card-head"><h3><span class="card-title-dot"></span>回复建议</h3>' +
        (st.replies ? '<button class="btn sm" id="cmSave">存为记录</button>' : '') + '</div>';
      if (!st.replies) {
        html += '<div class="empty"><span class="ico">💬</span>粘贴家长消息后点击「生成三版回复」<br>会得到：中文·正式 / 中文·温和 / English</div>';
      } else {
        html += replyCard('中文 · 正式版', '', st.replies.a, 'a') +
          replyCard('中文 · 温和版', 'mint', st.replies.b, 'b') +
          replyCard('English Version', 'blue', st.replies.en, 'en');
      }
      html += '</div></div>';

      /* 历史 */
      html += '<div class="card mt16"><div class="card-head"><h3><span class="card-title-dot"></span>沟通记录</h3>' +
        '<span class="sub">' + db.comms.length + ' 条</span></div>';
      if (!db.comms.length) {
        html += '<div class="empty">还没有保存过沟通记录</div>';
      } else {
        db.comms.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function (c) {
          var s = U.stu(c.studentId);
          html += '<div class="note-card mb8"><div class="nc-head"><span class="badge gray">' + c.date + '</span>' +
            (s ? '<span class="badge">' + U.esc(s.en) + '</span>' : '') +
            (c.tone ? '<span class="tiny muted">' + c.tone + '</span>' : '') +
            '<span class="spacer"></span>' +
            '<button class="link-btn" data-load-comm="' + c.id + '">载入</button>' +
            '<button class="icon-btn" data-del-comm="' + c.id + '">✕</button></div>' +
            '<div class="tiny muted" style="margin-bottom:6px">家长：' + U.esc((c.incoming || '').slice(0, 90)) + (c.incoming && c.incoming.length > 90 ? '…' : '') + '</div>' +
            '<div class="nc-text">' + U.esc((c.replies && c.replies.a ? c.replies.a : '').slice(0, 120)) + '…</div></div>';
        });
      }
      html += '</div>';

      el.innerHTML = html;

      el.querySelector('#cmStu').onchange = function (e) { st.studentId = e.target.value; App.render(); };
      el.querySelectorAll('[data-tone]').forEach(function (b) {
        b.onclick = function () { st.tone = b.dataset.tone; App.render(); };
      });
      el.querySelectorAll('[data-scene]').forEach(function (b) {
        b.onclick = function () {
          st.message = SCENES[parseInt(b.dataset.scene, 10)].text;
          el.querySelector('#cmMsg').value = st.message;
        };
      });
      el.querySelector('#cmMsg').addEventListener('input', function (e) { st.message = e.target.value; });

      el.querySelector('#cmGen').onclick = function () {
        var msg = el.querySelector('#cmMsg').value.trim();
        if (!msg) { App.ui.toast('先把家长的消息粘贴进来', 'err'); return; }
        st.message = msg;
        var btn = el.querySelector('#cmGen');
        btn.disabled = true; btn.textContent = '生成中…';

        function done(replies, aiUsed) {
          st.replies = replies;
          btn.disabled = false; btn.textContent = '生成三版回复';
          App.render();
          App.ui.toast(aiUsed ? '三版回复已生成' : '未连接 AI，已使用本地模板', aiUsed ? 'ok' : '');
        }

        if (!App.ai.configured()) {
          var r = App.ai.localReplies({ message: msg, student: stu, tone: st.tone });
          setTimeout(function () { done(r, false); }, 300);
          return;
        }

        var focus = App.ai.detectFocus(msg);
        var prompt = '家长发来的消息如下：\n"""' + msg + '"""\n\n' +
          '学生：' + (stu ? stu.en + (stu.zh ? '（' + stu.zh + '）' : '') : '未知') + '\n' +
          '班级 / 课程：' + (cls ? cls.name + ' · ' + (stu && stu.system ? stu.system : '') : '未知') + '\n' +
          (lastExam ? '最近测验：' + lastExam.exam.name + ' ' + lastExam.score + '/' + lastExam.exam.full + '\n' : '') +
          (focus.length ? '家长关注点：' + focus.join('、') + '\n' : '') +
          '回复语气：' + st.tone + '\n\n' +
          '请输出三个版本的回复，严格按下面的格式，不要任何额外说明：\n' +
          '【正式】中文，专业克制，先共情再给具体观察与安排，200-280 字\n' +
          '【温和】中文，口语化、有温度，像一个懂孩子的老师在和家长聊天，200-280 字\n' +
          '【English】English, professional and warm, 150-200 words, same content\n\n' +
          '要求：不要空泛安慰；要提到具体的学习行为或知识点；给出家庭可执行的一两条建议，并说明后续跟进方式。';

        App.ai.chat({ prompt: prompt, temperature: 0.75 }).then(function (txt) {
          var parsed = parseReplies(txt);
          var local = App.ai.localReplies({ message: msg, student: stu, tone: st.tone });
          done({
            a: parsed.a || local.a,
            b: parsed.b || local.b,
            en: parsed.en || local.en
          }, true);
        }).catch(function (e) {
          var r = App.ai.localReplies({ message: msg, student: stu, tone: st.tone });
          App.ui.toast(e.message + '（已用本地模板）', 'err', 4000);
          done(r, false);
        });
      };

      el.querySelectorAll('[data-copy-reply]').forEach(function (b) {
        b.onclick = function () {
          var k = b.dataset.copyReply;
          if (!st.replies || !st.replies[k]) return;
          U.copy(st.replies[k]);
        };
      });

      var saveBtn = el.querySelector('#cmSave');
      if (saveBtn) saveBtn.onclick = function () {
        db.comms.push({
          id: 'cm_' + Date.now().toString(36), date: U.todayISO(), studentId: st.studentId,
          tone: st.tone, incoming: st.message || '', replies: st.replies
        });
        App.store.save(); App.render();
        App.ui.toast('已保存沟通记录', 'ok');
      };

      el.querySelectorAll('[data-load-comm]').forEach(function (b) {
        b.onclick = function () {
          var c = db.comms.filter(function (x) { return x.id === b.dataset.loadComm; })[0];
          if (!c) return;
          st.studentId = c.studentId; st.message = c.incoming; st.replies = c.replies; st.tone = c.tone || '温和';
          App.render();
          App.ui.toast('已载入该条记录', 'ok');
        };
      });
      el.querySelectorAll('[data-del-comm]').forEach(function (b) {
        b.onclick = function () {
          db.comms = db.comms.filter(function (x) { return x.id !== b.dataset.delComm; });
          App.store.save(); App.render();
        };
      });
    }
  };
})();
