/* ==========================================================
   ai.js — AI 接口层
   · 支持任意 OpenAI 兼容接口（DeepSeek / 豆包方舟 / 自定义）
   · 试卷分析采用「两阶段」：视觉模型逐题转录 → 推理模型做诊断
   · 未配置密钥时全部走本地模板，功能不阻塞
   ========================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var DEFAULT_BASE = {
    deepseek: 'https://api.deepseek.com',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3'
  };

  /* 各服务商常见模型，用于设置页的下拉建议 */
  var MODEL_HINTS = {
    deepseek: ['deepseek-reasoner', 'deepseek-chat'],
    doubao: ['doubao-seed-1-6-250615', 'doubao-1-5-pro-32k-250115', 'doubao-1-5-vision-pro-32k-250115', 'ep-2024xxxxxx-xxxxx'],
    custom: ['gpt-4o', 'gpt-4.1', 'o4-mini', 'qwen-max', 'gemini-2.5-pro', 'claude-sonnet-4-20250514']
  };

  var DEFAULT_SYS = '你是一位资深国际数学教师助理，回答专业、具体、可执行。';

  function cfg() { return (App.store.db.settings && App.store.db.settings.ai) || {}; }
  function configured() { var c = cfg(); return !!(c.apiKey && (c.model || c.visionModel)); }
  function hasVision() { var c = cfg(); return !!(c.apiKey && c.visionModel); }

  /* 推理类模型（R1 / o 系列）不接受 temperature 与 response_format */
  function isReasoningModel(m) {
    return /reasoner|^o\d|thinking/i.test(String(m || ''));
  }

  function endpoint() {
    var c = cfg();
    var base = (c.baseURL || DEFAULT_BASE[c.provider || 'deepseek'] || '').replace(/\/+$/, '');
    return base;
  }

  /* ---------------- 基础调用 ---------------- */
  function chat(opt) {
    opt = opt || {};
    var c = cfg();
    if (!configured()) return Promise.reject(new Error('尚未配置 AI 密钥，请到「设置 → AI 接口」填写'));
    var base = endpoint();
    if (!base) return Promise.reject(new Error('请先在设置里填写接口地址'));

    var model = opt.model || (opt.vision ? (c.visionModel || c.model) : (c.model || c.visionModel));
    if (!model) return Promise.reject(new Error('请先在设置里填写模型名称'));
    if (opt.vision && !opt.model && !c.visionModel) {
      return Promise.reject(new Error('未配置视觉模型：请到「设置 → AI 接口」填写能读图的模型'));
    }

    var content = opt.prompt;
    if (opt.images && opt.images.length) {
      content = [{ type: 'text', text: opt.prompt }].concat(opt.images.map(function (u) {
        return { type: 'image_url', image_url: { url: u } };
      }));
    }

    var body = {
      model: model,
      messages: [
        { role: 'system', content: opt.system || DEFAULT_SYS },
        { role: 'user', content: content }
      ],
      max_tokens: opt.maxTokens || 4000
    };
    if (!isReasoningModel(model) && opt.temperature != null) body.temperature = opt.temperature;
    if (opt.json && !isReasoningModel(model)) body.response_format = { type: 'json_object' };

    var timeout = opt.timeout || 240000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;

    return fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = '接口返回 ' + res.status;
          try {
            var j = JSON.parse(t);
            if (j && j.error && j.error.message) msg += '：' + j.error.message;
          } catch (e) { msg += '：' + String(t).slice(0, 160); }
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (json) {
      var msg = json && json.choices && json.choices[0] && json.choices[0].message;
      var txt = msg && (msg.content || msg.reasoning_content);
      if (Array.isArray(txt)) txt = txt.map(function (p) { return p.text || ''; }).join('');
      if (!txt || !String(txt).trim()) {
        var fin = json && json.choices && json.choices[0] && json.choices[0].finish_reason;
        throw new Error('接口没有返回内容' + (fin === 'length' ? '（输出被截断，可在设置里调大「分析强度」）' : ''));
      }
      return String(txt).trim();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('请求超时（' + Math.round(timeout / 1000) + ' 秒），模型可能仍在生成，可改用更快的模型或减少图片数量');
      if (err instanceof TypeError) throw new Error('网络请求失败：可能是浏览器跨域限制。建议用本地服务器打开页面，或检查接口地址与密钥。');
      throw err;
    });
  }

  /* ---------------- 试卷转录（视觉模型） ---------------- */
  function ocrPrompt(n) {
    return [
      '这是一位学生的数学试卷，共 ' + n + ' 页（按上传顺序）。请逐题转录成 Markdown，供后续学情诊断使用。',
      '',
      '每道题使用如下格式，题目之间空一行：',
      '',
      '### 第 <题号> 题',
      '- 题干：用一句话概括题目要求（不超过 50 字），公式用 $...$',
      '- 学生作答：原样转录学生写的内容，包含中间步骤与最终答案；空白写「空白」；字迹无法辨认写「[无法辨认]」',
      '- 批改痕迹：红笔勾叉、批注、扣分原文，例如「半勾，扣 2 分」；没有则写「无」',
      '',
      '转录规则：',
      '1. 只转录图片里真实存在的题号，不要编造、不要补题。',
      '2. 学生写错的内容照原样保留（这正是诊断依据），不要改成正确答案。',
      '3. 保留数字、单位、符号（$<$, $>$, $=$, $\\%$）与关键公式。',
      '4. 分不清题号时按顺序标注「第 ? 题」并保留原文。',
      '5. 只输出转录内容，不要写评价、总结或建议。'
    ].join('\n');
  }

  /* ---------------- 诊断提示词 ---------------- */
  function scorePct(awarded, full) {
    var a = parseFloat(awarded), f = parseFloat(full);
    if (isNaN(a) || isNaN(f) || !f) return null;
    return Math.round(a / f * 100);
  }

  function buildAnalyzePrompt(ctx, transcript) {
    var s = ctx.student, exam = ctx.exam;
    var lines = [];
    lines.push('你是资深 IGCSE / A-Level 数学教研员，正在为一位学生撰写试卷学情诊断报告。');
    lines.push('只能依据下面的材料作答；材料没有覆盖的地方写「材料未提供」，**不要编造题号、分数或批改痕迹**。');
    lines.push('');

    lines.push('## 学生与试卷');
    lines.push('- 学生：' + (s ? s.en + (s.zh ? '（' + s.zh + '）' : '') : '未提供'));
    if (ctx.className) lines.push('- 班级：' + ctx.className + (ctx.system ? '（' + ctx.system + '）' : ''));
    lines.push('- 试卷：' + (ctx.paperName || (exam ? exam.name : '未命名试卷')) + (ctx.date ? '，' + ctx.date : ''));
    if (ctx.full != null) lines.push('- 满分：' + ctx.full);
    if (ctx.score != null) {
      lines.push('- 学生得分：' + ctx.score + (ctx.full ? ' / ' + ctx.full + '（得分率 ' + scorePct(ctx.score, ctx.full) + '%）' : ''));
    }

    var table = (ctx.scoreTable || []).filter(function (r) {
      return String(r.no || '').trim() || String(r.awarded || '').trim() || String(r.full || '').trim();
    });
    if (table.length) {
      lines.push('');
      lines.push('## 逐题得分（教师录入，可信度最高）');
      lines.push('| 题号 | 得分 | 满分 | 教师备注 |');
      lines.push('| --- | --- | --- | --- |');
      table.forEach(function (r) {
        lines.push('| ' + (r.no || '') + ' | ' + (r.awarded === '' || r.awarded == null ? '—' : r.awarded) + ' | ' +
          (r.full === '' || r.full == null ? '—' : r.full) + ' | ' + (r.note || '') + ' |');
      });
    }

    if (ctx.tags && ctx.tags.length) lines.push('\n- 教师已标记的薄弱点：' + ctx.tags.join('、'));
    if (ctx.layout && ctx.layout.length) lines.push('- 教师已标记的卷面问题：' + ctx.layout.join('、'));

    if (ctx.markScheme && String(ctx.markScheme).trim()) {
      lines.push('');
      lines.push('## 评分标准 / 答案要点');
      lines.push(String(ctx.markScheme).trim().slice(0, 5000));
    }
    if (transcript && String(transcript).trim()) {
      lines.push('');
      lines.push('## 试卷转录（含学生作答与批改痕迹）');
      lines.push(String(transcript).trim().slice(0, 14000));
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('请严格按下面的结构输出（Markdown，中文），不要增删小节，不要写开场白：');
    lines.push('');
    lines.push('## 一、总体判断');
    lines.push('3-5 句。必须包含：得分率；把失分按「知识性失分 / 规范性失分 / 空白未答」三类拆分并给出分值；本次最该先解决的一个问题。');
    lines.push('');
    lines.push('## 二、逐题失分诊断');
    lines.push('Markdown 表格，只列失分题，按失分从多到少排序。列为：题号 | 考点 | 得分 | 失分类型 | 具体错在哪 | 正确思路或公式。');
    lines.push('');
    lines.push('## 三、知识点薄弱项');
    lines.push('每个薄弱点一个三级标题（如 `### 1. 百分比增减公式`），下面固定三行：');
    lines.push('- **证据**：第几题、具体怎么错、扣了几分');
    lines.push('- **应有的方法**：公式或标准步骤，数学式子用 $...$');
    lines.push('- **掌握程度**：未掌握 / 半掌握 / 会但易错，并给一句判断依据');
    lines.push('');
    lines.push('## 四、卷面与答题规范');
    lines.push('分条列出，每条注明题号与扣分；没有则写「未发现明显规范问题」。');
    lines.push('');
    lines.push('## 五、下一步训练计划');
    lines.push('### 本周必做（3 天内）');
    lines.push('### 两周内');
    lines.push('### 长期习惯');
    lines.push('每条写清：练什么、多少题 / 多长时间、怎么检验。禁止「加强练习」「注意审题」这类空话。');
    lines.push('');
    lines.push('## 六、给家长的一段话');
    lines.push('80-120 字，专业克制，可直接转发；不夸大进步，不承诺分数。');
    lines.push('');
    lines.push('硬性要求：');
    lines.push('1. 每条结论必须能追溯到题号或分数，追溯不到就删掉。');
    lines.push('2. 知识点名称要具体到术语（写「百分比增减公式」而不是「百分数」）。');
    lines.push('3. 数学式子统一用 $...$，不要输出 \\begin / \\end 环境。');
    lines.push('4. 若没有逐题得分，只能依据转录里的批改痕迹推断，并在「总体判断」注明「依据批改痕迹推断」。');
    lines.push('5. 不要复述题干原文，概括即可。');
    lines.push('6. 若某题方法正确、只是格式或表述不符（如要求带分数却写假分数），判为「会但格式失分」，不要归入知识性失分。');
    lines.push('7. 若材料显示某题答对且方法完整，可在「总体判断」用一句话肯定，不必单列小节。');

    return lines.join('\n');
  }

  /* ---------------- 两阶段试卷分析 ---------------- */
  function analyzePaper(ctx, onProgress) {
    var c = cfg();
    function notify(stage, msg) { try { onProgress && onProgress(stage, msg); } catch (e) { } }

    var images = (ctx.images || []).filter(Boolean);
    var baseText = String(ctx.ocrText || ctx.text || '').trim();
    var visionOK = hasVision();
    var step;

    if (images.length && visionOK) {
      notify('ocr', '第 1 步 / 2 · 识别 ' + images.length + ' 张试卷图片…');
      step = chat({
        model: c.visionModel,
        vision: true,
        images: images,
        prompt: ocrPrompt(images.length),
        system: '你是严谨的数学阅卷助理，只做逐题转录，不做评价，不推测学生没写的内容。',
        temperature: 0.1,
        maxTokens: 3200,
        timeout: 240000
      }).then(function (t) {
        return { transcript: baseText ? baseText + '\n\n' + t : t, usedOCR: true };
      });
    } else {
      if (images.length && !visionOK) notify('warn', '未配置视觉模型，本次只用文字材料分析');
      step = Promise.resolve({ transcript: baseText, usedOCR: false });
    }

    return step.then(function (r) {
      var hasTable = (ctx.scoreTable || []).some(function (x) { return String(x.no || '').trim(); });
      if (!r.transcript && !hasTable && !(ctx.markScheme && String(ctx.markScheme).trim())) {
        throw new Error('没有可分析的材料：请上传试卷图片、粘贴卷面文字，或填写逐题得分');
      }
      notify('analyze', '第 2 步 / 2 · 正在做学情诊断（通常 30-90 秒）…');
      var deep = c.deepMode !== false;
      return chat({
        prompt: buildAnalyzePrompt(ctx, r.transcript),
        system: '你是资深数学教研员，诊断必须具体到题号与分值，拒绝空泛套话。',
        temperature: 0.3,
        maxTokens: deep ? 6000 : 3600,
        timeout: 300000
      }).then(function (report) {
        return {
          report: report,
          transcript: r.transcript || '',
          usedOCR: r.usedOCR,
          model: c.model || '',
          visionModel: r.usedOCR ? (c.visionModel || '') : ''
        };
      });
    });
  }

  /* ---------------- 本地兜底：试卷评语 ---------------- */
  function paperComment(ctx) {
    var s = ctx.student, exam = ctx.exam;
    var head = (s ? s.en : '该同学') + '：本次' + (exam ? '《' + exam.name + '》' : '试卷');
    if (ctx.score != null) head += '得分 ' + ctx.score + (exam ? ' / ' + exam.full : '');
    head += '。';
    var body = '';
    if (ctx.tags && ctx.tags.length) {
      body += '从卷面看，主要失分集中在' + ctx.tags.slice(0, 3).join('、') + '这几个知识点上，说明相关概念的辨析与迁移还不够稳定；';
    } else {
      body += '从卷面看，基础题的得分较稳，综合题与压轴题仍有明显提升空间；';
    }
    if (ctx.layout && ctx.layout.length) {
      body += '同时在' + ctx.layout.join('、') + '等方面需要规范，过程分容易被扣。';
    } else {
      body += '书写与步骤呈现基本规范，建议继续保持「写清条件—列式—求解—检验」的习惯。';
    }
    if (ctx.text) {
      var t = ctx.text.replace(/\s+/g, ' ').trim();
      if (t) body += '卷面记录：' + t.slice(0, 80) + (t.length > 80 ? '…' : '') + '。';
    }
    var tail = '建议：先针对上述薄弱知识点做 3—5 道同类题的回炉练习，再做一道综合题检验迁移；下次课前我会单独抽查。';
    return head + body + tail;
  }

  /* ---------------- 本地兜底：综合评语 ---------------- */
  function summaryComment(ctx) {
    var s = ctx.student;
    var items = ctx.items || [];
    if (!items.length) return '暂无足够的成绩数据，先记录几次测验后再生成综合评语。';
    /* 每次满分不同，统一换算成得分率（%）再比较趋势 */
    var pcts = items.map(function (i) {
      if (i.score == null) return null;
      return i.exam.full ? Math.round(i.score / i.exam.full * 1000) / 10 : U.round1(i.score);
    }).filter(function (v) { return v != null; });
    var avgP = pcts.length ? U.round1(U.avg(pcts)) : null;
    var trend = '保持平稳';
    if (pcts.length > 1) {
      var d = pcts[pcts.length - 1] - pcts[0];
      trend = d > 2 ? '呈上升趋势（+' + U.round1(d) + ' 个百分点）'
        : d < -2 ? '有所回落（' + U.round1(d) + ' 个百分点）' : '基本稳定';
    }
    var last = items.filter(function (i) { return i.score != null; }).pop();
    var txt = (s ? s.en : '该同学') + ' 在本阶段共完成 ' + pcts.length + ' 次测验';
    if (avgP != null) txt += '，平均得分率 ' + avgP + '%';
    txt += '，成绩' + trend + '。';
    if (last) {
      txt += '最近一次《' + last.exam.name + '》得分 ' + last.score + '/' + last.exam.full +
        (last.exam.full ? '（' + Math.round(last.score / last.exam.full * 1000) / 10 + '%）' : '') + '。';
    }
    var weak = {};
    (ctx.papers || []).forEach(function (p) {
      (p.tags || []).forEach(function (t) { weak[t] = (weak[t] || 0) + 1; });
    });
    var weakList = Object.keys(weak).sort(function (a, b) { return weak[b] - weak[a]; }).slice(0, 3);
    if (weakList.length) txt += '从试卷分析看，' + weakList.join('、') + '是反复出现的薄弱点，需要在下一阶段优先解决。';
    if (ctx.kb && ctx.kb.length) {
      var low = ctx.kb.slice(0, 3);
      txt += '逐题知识点统计显示：' + low.map(function (o) { return o.topic + ' 正确率 ' + o.rate + '%'; }).join('、') + '。';
    }
    function trimEnd(s) { return String(s || '').replace(/[\s。；;，,、]+$/, ''); }
    if (ctx.classNote) txt += '课堂表现方面，' + trimEnd(ctx.classNote) + '。';
    else txt += '课堂参与度方面，整体表现积极，能跟上课堂节奏。';
    if (ctx.homeNote) txt += '作业情况：' + trimEnd(ctx.homeNote) + '。';
    txt += '下阶段建议：1）每周固定 30 分钟专项练习薄弱知识点；2）建立错题本，每道错题写清错误原因；3）考前两周做完整套卷训练时间分配。';
    return txt;
  }

  /* ---------------- 本地兜底：家校沟通三版回复 ---------------- */
  var FOCUS = [
    { k: ['成绩', '分数', '考', '测验', '考试'], line: '成绩波动' },
    { k: ['作业', '练习', '题'], line: '作业完成' },
    { k: ['注意力', '走神', '专注', '粗心', '马虎'], line: '专注与习惯' },
    { k: ['手机', '游戏', '玩'], line: '时间管理' },
    { k: ['不想学', '没兴趣', '厌学', '抵触'], line: '学习动力' },
    { k: ['进度', '跟不跟得上', '难'], line: '课堂进度' }
  ];
  function detectFocus(msg) {
    var hit = [];
    FOCUS.forEach(function (f) {
      if (f.k.some(function (k) { return msg.indexOf(k) >= 0; })) hit.push(f.line);
    });
    return hit;
  }

  function localReplies(opt) {
    var s = opt.student, name = s ? s.en.split(' ')[0] : '孩子';
    var focus = detectFocus(opt.message || '');
    var isScore = focus.indexOf('成绩波动') >= 0;
    var tone = opt.tone || '温和';
    var cnLead = tone === '坚定'
      ? '您好，感谢您的坦诚沟通。关于' + name + '的情况，我想先说明我的判断，再和您对齐接下来的做法。'
      : tone === '共情'
        ? '您好，看到您的消息了，特别理解您现在的心情。' + name + '其实很努力，我们一起把这段时间接住。'
        : '您好，感谢您的信任与及时沟通。关于' + name + '最近的情况，我整理了几点观察和安排，和您同步一下。';

    var cnBody = '';
    if (isScore) {
      cnBody += '这次测验' + name + '的分数确实有波动，但失分点非常集中' + (focus.length > 1 ? '，也与' + focus.filter(function (f) { return f !== '成绩波动'; }).join('、') + '有关' : '') + '，属于可以被针对性解决的问题，而不是能力问题。';
    } else if (focus.length) {
      cnBody += '您提到的' + focus.join('、') + '，在我的课堂观察里也有类似迹象，这类问题往往不是态度问题，而是方法与节奏还没建立起来。';
    } else {
      cnBody += name + '近期的课堂状态整体稳定，能跟上节奏，也愿意在课上表达自己的想法。';
    }

    var cnPlan = '接下来我会做三件事：一是课上多给' + name + '一次表达思路的机会，帮他建立正反馈；二是针对薄弱点布置少量但高频的专项练习，每次 15 分钟；三是每两周给您一次具体反馈，而不是等到考试后。';
    var cnAsk = '家里这边，建议先不追问分数，多问一句「今天哪个地方突然想通了」，让注意力回到过程上。有任何情况随时联系我。';

    var a = cnLead + '\n\n' + cnBody + '\n\n' + cnPlan + '\n\n' + cnAsk;

    var b = '家长您好，消息我认真看了，先说一句：您愿意主动来问，' + name + '就已经比很多孩子幸运了。\n\n'
      + (isScore ? '成绩这件事，我想先说结论：' + name + '不是学不会，是这一块内容还没打通。分数只是结果，我们真正要看的是他卡在哪一步。\n\n' : '')
      + cnBody + '\n\n' + cnPlan + '\n\n' + cnAsk
      + '\n\n孩子现在需要的不是被催，而是被看见。我们一起把这口气接住，他会更有底气。';

    var en = 'Dear ' + (s ? name : 'Parent') + '\'s parents,\n\n'
      + 'Thank you for your message and for keeping me informed. I would like to share what I have observed and what I plan to do next.\n\n'
      + (isScore
        ? 'The recent test score did fluctuate, but the lost marks are concentrated in a very specific area. This is a targeted gap rather than a lack of ability, and it is something we can fix within a few weeks.\n\n'
        : '')
      + (focus.length ? 'What you mentioned about ' + focus.join(' and ').toLowerCase() + ' matches what I see in class. These issues are usually about method and routine rather than attitude.\n\n' : name + ' has been steady in class and is willing to share his thinking.\n\n')
      + 'My plan: give him more chances to explain his reasoning in class to build positive feedback, assign short but frequent practice (about 15 minutes each time) on the weak topics, and update you every two weeks with specific observations.\n\n'
      + 'At home, I would suggest not asking about the score directly. Try asking "which step made sense to you today?" — it keeps the focus on the process.\n\n'
      + 'Please feel free to contact me anytime.\n\nBest regards,\nStella';

    return { a: a, b: b, en: en, source: 'local' };
  }

  App.ai = {
    configured: configured,
    hasVision: hasVision,
    MODEL_HINTS: MODEL_HINTS,
    DEFAULT_BASE: DEFAULT_BASE,
    chat: chat,
    analyzePaper: analyzePaper,
    buildAnalyzePrompt: buildAnalyzePrompt,
    paperComment: paperComment,
    summaryComment: summaryComment,
    localReplies: localReplies,
    detectFocus: detectFocus
  };
})();
