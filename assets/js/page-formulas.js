/* ==========================================================
   page-formulas.js — 公式工具中心
   ========================================================== */
(function () {
  'use strict';
  var App = window.App;
  App.pages = App.pages || {};

  var DATA = [
    {
      cat: '代数', items: [
        { n: '一元二次方程求根', tex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', plain: 'x = (-b ± √(b² - 4ac)) / 2a' },
        { n: '判别式', tex: '\\Delta = b^2 - 4ac', plain: 'Δ = b² - 4ac' },
        { n: '韦达定理', tex: 'x_1 + x_2 = -\\frac{b}{a},\\quad x_1x_2 = \\frac{c}{a}', plain: 'x₁ + x₂ = -b/a，x₁x₂ = c/a' },
        { n: '完全平方', tex: '(a \\pm b)^2 = a^2 \\pm 2ab + b^2', plain: '(a ± b)² = a² ± 2ab + b²' },
        { n: '平方差', tex: 'a^2 - b^2 = (a-b)(a+b)', plain: 'a² - b² = (a - b)(a + b)' },
        { n: '立方和 / 差', tex: 'a^3 \\pm b^3 = (a \\pm b)(a^2 \\mp ab + b^2)', plain: 'a³ ± b³ = (a ± b)(a² ∓ ab + b²)' },
        { n: '二项式定理', tex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k}b^k', plain: '(a+b)ⁿ = Σ C(n,k) aⁿ⁻ᵏ bᵏ' },
        { n: '指数运算法则', tex: 'a^m a^n = a^{m+n},\\quad \\frac{a^m}{a^n}=a^{m-n},\\quad (a^m)^n=a^{mn}', plain: 'aᵐ·aⁿ = aᵐ⁺ⁿ，(aᵐ)ⁿ = aᵐⁿ' },
        { n: '对数运算法则', tex: '\\log_a(xy)=\\log_a x+\\log_a y,\\quad \\log_a \\frac{x}{y}=\\log_a x-\\log_a y', plain: 'logₐ(xy) = logₐx + logₐy，logₐ(x/y) = logₐx - logₐy' },
        { n: '换底公式', tex: '\\log_a b = \\frac{\\log_c b}{\\log_c a}', plain: 'logₐb = log_c b / log_c a' },
        { n: '重要极限 log', tex: '\\log_a a = 1,\\quad \\log_a 1 = 0,\\quad a^{\\log_a x}=x', plain: 'logₐa = 1，logₐ1 = 0，a^(logₐx) = x' }
      ]
    },
    {
      cat: '函数与图像', items: [
        { n: '二次函数顶点式', tex: 'y = a(x-h)^2 + k,\\quad (h,k)=\\left(-\\frac{b}{2a},\\, c-\\frac{b^2}{4a}\\right)', plain: 'y = a(x-h)² + k，顶点 (-b/2a, c - b²/4a)' },
        { n: '配方法', tex: 'ax^2+bx+c = a\\left(x+\\frac{b}{2a}\\right)^2 + c - \\frac{b^2}{4a}', plain: 'ax² + bx + c = a(x + b/2a)² + c - b²/(4a)' },
        { n: '对称轴', tex: 'x = -\\frac{b}{2a}', plain: 'x = -b / 2a' },
        { n: '反函数', tex: 'y = f(x) \\iff x = f^{-1}(y)', plain: 'y = f(x) ⇔ x = f⁻¹(y)' },
        { n: '复合函数定义域', tex: 'x \\in D_g,\\quad g(x) \\in D_f', plain: 'x ∈ D(g) 且 g(x) ∈ D(f)' },
        { n: '图像平移', tex: 'y=f(x)+k\\ (\\text{上下}),\\quad y=f(x-h)\\ (\\text{左右})', plain: 'y = f(x) + k 上下平移；y = f(x - h) 左右平移' },
        { n: '绝对值函数', tex: '|x| = \\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}', plain: '|x| = x (x≥0)；-x (x<0)' }
      ]
    },
    {
      cat: '三角', items: [
        { n: '正弦定理', tex: '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R', plain: 'a/sin A = b/sin B = c/sin C = 2R' },
        { n: '余弦定理', tex: 'c^2 = a^2 + b^2 - 2ab\\cos C', plain: 'c² = a² + b² - 2ab·cos C' },
        { n: '三角形面积', tex: 'S = \\frac{1}{2}ab\\sin C', plain: 'S = ½ ab sin C' },
        { n: '同角关系', tex: '\\sin^2\\theta + \\cos^2\\theta = 1,\\quad \\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}', plain: 'sin²θ + cos²θ = 1，tanθ = sinθ / cosθ' },
        { n: '二倍角', tex: '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta,\\quad \\cos 2\\theta = 1 - 2\\sin^2\\theta', plain: 'sin2θ = 2sinθcosθ，cos2θ = 1 - 2sin²θ' },
        { n: '和角公式', tex: '\\sin(A \\pm B) = \\sin A\\cos B \\pm \\cos A\\sin B', plain: 'sin(A±B) = sinA cosB ± cosA sinB' },
        { n: '辅助角公式', tex: 'a\\sin\\theta + b\\cos\\theta = R\\sin(\\theta+\\alpha),\\ R=\\sqrt{a^2+b^2}', plain: 'a sinθ + b cosθ = R sin(θ+α)，R = √(a²+b²)' },
        { n: '弧度与角度', tex: '\\pi\\ \\text{rad} = 180^\\circ', plain: 'π rad = 180°' },
        { n: '弧长与扇形面积', tex: 'l = r\\theta,\\quad S = \\frac{1}{2}r^2\\theta', plain: 'l = rθ，S = ½ r²θ' }
      ]
    },
    {
      cat: '微积分', items: [
        { n: '导数定义', tex: 'f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}', plain: 'f\'(x) = lim(h→0) [f(x+h) - f(x)] / h' },
        { n: '幂函数求导', tex: '\\frac{d}{dx}x^n = nx^{n-1}', plain: 'd/dx (xⁿ) = n xⁿ⁻¹' },
        { n: '乘积法则', tex: '(uv)\' = u\'v + uv\'', plain: '(uv)\' = u\'v + uv\'' },
        { n: '商法则', tex: '\\left(\\frac{u}{v}\\right)\' = \\frac{u\'v - uv\'}{v^2}', plain: '(u/v)\' = (u\'v - uv\') / v²' },
        { n: '链式法则', tex: '\\frac{dy}{dx} = \\frac{dy}{du}\\cdot\\frac{du}{dx}', plain: 'dy/dx = (dy/du)(du/dx)' },
        { n: '指数函数求导', tex: '\\frac{d}{dx}e^{kx} = ke^{kx}', plain: 'd/dx e^(kx) = k e^(kx)' },
        { n: '对数函数求导', tex: '\\frac{d}{dx}\\ln x = \\frac{1}{x}', plain: 'd/dx ln x = 1/x' },
        { n: '三角求导', tex: '(\\sin x)\' = \\cos x,\\quad (\\cos x)\' = -\\sin x', plain: '(sin x)\' = cos x，(cos x)\' = -sin x' },
        { n: '不定积分幂函数', tex: '\\int x^n dx = \\frac{x^{n+1}}{n+1} + C\\ (n \\ne -1)', plain: '∫xⁿ dx = xⁿ⁺¹/(n+1) + C' },
        { n: '分部积分', tex: '\\int u\\,dv = uv - \\int v\\,du', plain: '∫u dv = uv - ∫v du' },
        { n: '定积分求面积', tex: 'A = \\int_a^b |f(x)|\\,dx', plain: 'A = ∫ₐᵇ |f(x)| dx' },
        { n: '旋转体体积', tex: 'V = \\pi\\int_a^b y^2\\,dx', plain: 'V = π∫ₐᵇ y² dx' },
        { n: '切线方程', tex: 'y - f(a) = f\'(a)(x-a)', plain: 'y - f(a) = f\'(a)(x - a)' }
      ]
    },
    {
      cat: '几何与向量', items: [
        { n: '两点距离', tex: 'd = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}', plain: 'd = √[(x₂-x₁)² + (y₂-y₁)²]' },
        { n: '中点坐标', tex: 'M\\left(\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2}\\right)', plain: 'M((x₁+x₂)/2, (y₁+y₂)/2)' },
        { n: '直线斜率', tex: 'm = \\frac{y_2-y_1}{x_2-x_1}', plain: 'm = (y₂ - y₁) / (x₂ - x₁)' },
        { n: '点斜式', tex: 'y - y_1 = m(x - x_1)', plain: 'y - y₁ = m(x - x₁)' },
        { n: '垂直条件', tex: 'm_1 m_2 = -1', plain: 'm₁ · m₂ = -1' },
        { n: '点到直线距离', tex: 'd = \\frac{|ax_0+by_0+c|}{\\sqrt{a^2+b^2}}', plain: 'd = |ax₀+by₀+c| / √(a²+b²)' },
        { n: '圆的标准方程', tex: '(x-a)^2 + (y-b)^2 = r^2', plain: '(x-a)² + (y-b)² = r²' },
        { n: '向量点积', tex: '\\mathbf{a}\\cdot\\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta', plain: 'a·b = |a||b|cosθ' },
        { n: '向量夹角', tex: '\\cos\\theta = \\frac{\\mathbf{a}\\cdot\\mathbf{b}}{|\\mathbf{a}||\\mathbf{b}|}', plain: 'cosθ = (a·b) / (|a||b|)' },
        { n: '向量叉积（面积）', tex: '|\\mathbf{a}\\times\\mathbf{b}| = |\\mathbf{a}||\\mathbf{b}|\\sin\\theta', plain: '|a×b| = |a||b| sinθ' }
      ]
    },
    {
      cat: '统计与概率', items: [
        { n: '均值', tex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i', plain: 'x̄ = (1/n)Σxᵢ' },
        { n: '方差', tex: '\\sigma^2 = \\frac{1}{n}\\sum (x_i - \\bar{x})^2', plain: 'σ² = (1/n)Σ(xᵢ - x̄)²' },
        { n: '标准差', tex: '\\sigma = \\sqrt{\\frac{\\sum (x_i-\\bar{x})^2}{n}}', plain: 'σ = √[Σ(xᵢ - x̄)² / n]' },
        { n: '排列', tex: '{}^nP_r = \\frac{n!}{(n-r)!}', plain: 'ⁿPᵣ = n! / (n - r)!' },
        { n: '组合', tex: '{}^nC_r = \\binom{n}{r} = \\frac{n!}{r!(n-r)!}', plain: 'ⁿCᵣ = C(n,r) = n! / [r!(n-r)!]' },
        { n: '条件概率', tex: 'P(A|B) = \\frac{P(A \\cap B)}{P(B)}', plain: 'P(A|B) = P(A∩B) / P(B)' },
        { n: '独立事件', tex: 'P(A \\cap B) = P(A)P(B)', plain: 'P(A∩B) = P(A)P(B)' },
        { n: '二项分布', tex: 'P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}', plain: 'P(X=k) = C(n,k) pᵏ (1-p)ⁿ⁻ᵏ' },
        { n: '正态分布标准化', tex: 'z = \\frac{x - \\mu}{\\sigma}', plain: 'z = (x - μ) / σ' },
        { n: '期望', tex: 'E(X) = \\sum x_i P(x_i)', plain: 'E(X) = Σ xᵢ P(xᵢ)' }
      ]
    },
    {
      cat: '竞赛常用', items: [
        { n: 'AM-GM 不等式', tex: '\\frac{a+b}{2} \\ge \\sqrt{ab}\\ (a,b>0)', plain: '(a+b)/2 ≥ √(ab)，a,b>0' },
        { n: '柯西不等式', tex: '(\\sum a_i^2)(\\sum b_i^2) \\ge (\\sum a_i b_i)^2', plain: '(Σaᵢ²)(Σbᵢ²) ≥ (Σaᵢbᵢ)²' },
        { n: '三角形不等式', tex: '|a+b| \\le |a| + |b|', plain: '|a+b| ≤ |a| + |b|' },
        { n: '费马小定理', tex: 'a^{p-1} \\equiv 1 \\pmod{p}', plain: 'a^(p-1) ≡ 1 (mod p)，p 为质数' },
        { n: '欧拉公式', tex: 'e^{i\\theta} = \\cos\\theta + i\\sin\\theta', plain: 'e^(iθ) = cosθ + i sinθ' },
        { n: '等比数列求和', tex: 'S_n = \\frac{a(1-r^n)}{1-r}\\ (r \\ne 1)', plain: 'Sₙ = a(1 - rⁿ)/(1 - r)，r ≠ 1' },
        { n: '等差数列求和', tex: 'S_n = \\frac{n(a_1+a_n)}{2}', plain: 'Sₙ = n(a₁ + aₙ)/2' }
      ]
    }
  ];

  App.pages.formulas = {
    title: '公式工具中心',
    sub: '常用公式点一下即可复制',
    render: function (el) {
      var U = App.util;
      var st = App.state.formulas || (App.state.formulas = { cat: '代数', q: '', mode: 'tex' });

      var html = '';
      html += '<div class="card tight mb16"><div class="row wrap" style="gap:10px">' +
        '<div class="search-box" style="flex:1;min-width:200px;position:relative">' +
        '<svg viewBox="0 0 24 24" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:15px;height:15px;stroke:var(--muted-2);fill:none;stroke-width:1.9"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
        '<input class="input" id="fq" placeholder="搜索公式名称或符号…" value="' + U.esc(st.q) + '"></div>' +
        '<div class="chip-row"><button class="chip ' + (st.mode === 'tex' ? 'active' : '') + '" data-mode="tex">复制 LaTeX</button>' +
        '<button class="chip ' + (st.mode === 'plain' ? 'active' : '') + '" data-mode="plain">复制文本</button></div>' +
        '</div><div class="chip-row mt12">' + DATA.map(function (g) {
          return '<button class="chip ' + (st.cat === g.cat ? 'active' : '') + '" data-cat="' + g.cat + '">' + g.cat + '</button>';
        }).join('') + '</div></div>';

      var groups = st.q
        ? DATA.map(function (g) {
          return {
            cat: g.cat, items: g.items.filter(function (it) {
              var q = st.q.toLowerCase();
              return (it.n + ' ' + it.tex + ' ' + it.plain).toLowerCase().indexOf(q) >= 0;
            })
          };
        }).filter(function (g) { return g.items.length; })
        : DATA.filter(function (g) { return g.cat === st.cat; });

      if (!groups.length) html += '<div class="card"><div class="empty">没有找到相关公式</div></div>';

      groups.forEach(function (g) {
        html += '<div class="card mb16"><div class="card-head"><h3><span class="card-title-dot"></span>' + g.cat +
          '<span class="sub">（' + g.items.length + '）</span></h3>' +
          '<span class="tiny muted">点击卡片复制' + (st.mode === 'tex' ? ' LaTeX 代码' : '纯文本') + '</span></div>' +
          '<div class="grid g-3" style="gap:12px">';
        g.items.forEach(function (it) {
          html += '<div class="formula-card" data-copy="' + encodeURIComponent(st.mode === 'tex' ? it.tex : it.plain) + '">' +
            '<span class="fc-copy">点击复制' + (st.mode === 'tex' ? ' LaTeX' : '文本') + '</span>' +
            '<div class="fc-name">' + U.esc(it.n) + '</div>' +
            '<div class="fc-body">' + U.esc(it.plain) + '</div>' +
            '<div class="fc-code">' + U.esc(it.tex) + '</div></div>';
        });
        html += '</div></div>';
      });

      html += '<div class="tiny muted" style="text-align:center;padding:6px 0 20px">共 ' + DATA.reduce(function (a, g) { return a + g.items.length; }, 0) + ' 条公式 · 复制 LaTeX 可直接粘贴进题库 / LaTeX 编辑器</div>';

      el.innerHTML = html;

      var fq = el.querySelector('#fq');
      var composing = false;
      function doSearch() {
        st.q = fq.value;
        App.render();
        var inp = document.getElementById('fq');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }
      fq.addEventListener('compositionstart', function () { composing = true; });
      fq.addEventListener('compositionend', function () { composing = false; doSearch(); });
      fq.addEventListener('input', function () { if (!composing) doSearch(); });
      el.querySelectorAll('[data-cat]').forEach(function (b) {
        b.onclick = function () { st.cat = b.dataset.cat; st.q = ''; App.render(); };
      });
      el.querySelectorAll('[data-mode]').forEach(function (b) {
        b.onclick = function () { st.mode = b.dataset.mode; App.render(); };
      });
      el.querySelectorAll('[data-copy]').forEach(function (c) {
        c.onclick = function () { U.copy(decodeURIComponent(c.dataset.copy)); };
      });
    }
  };
})();
