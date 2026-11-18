// Équations Word (OMML, balises m:…) vers LaTeX, pour l'import Word : la formule devient une formule
// du logiciel (data-latex), que MathLive affiche et que l'export Word refait en équation Word.
// Repris : fractions, exposants et indices, racines, sommes et intégrales, parenthèses et crochets
// extensibles, fonctions (sin, log, lim…), accents (chapeau, vecteur, barre…), matrices, systèmes
// d'équations, encadrés ; lettres grecques et symboles courants écrits en commandes LaTeX.
(function () {
  const kids = (el, name) => (el ? [...el.children].filter((c) => !name || c.localName === name) : []);
  const kid = (el, name) => (el ? [...el.children].find((c) => c.localName === name) || null : null);
  const val = (el) => (el ? el.getAttribute('m:val') ?? el.getAttribute('w:val') : null);
  const prop = (el, pr, name) => val(kid(kid(el, pr), name));

  const SYMBOLS = {
    α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'vartheta',
    ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ϖ: 'varpi', ρ: 'rho', ϱ: 'varrho', σ: 'sigma', ς: 'varsigma',
    τ: 'tau', υ: 'upsilon', φ: 'varphi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
    Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Υ: 'Upsilon', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
    '≤': 'le', '≥': 'ge', '≠': 'ne', '±': 'pm', '∓': 'mp', '×': 'times', '÷': 'div', '·': 'cdot', '⋅': 'cdot', '∗': 'ast', '∘': 'circ',
    '∞': 'infty', '→': 'to', '←': 'leftarrow', '↔': 'leftrightarrow', '⇒': 'Rightarrow', '⇐': 'Leftarrow', '⇔': 'Leftrightarrow', '↦': 'mapsto',
    '∈': 'in', '∉': 'notin', '∋': 'ni', '⊂': 'subset', '⊃': 'supset', '⊆': 'subseteq', '⊇': 'supseteq', '∪': 'cup', '∩': 'cap', '∖': 'setminus',
    '∀': 'forall', '∃': 'exists', '∄': 'nexists', '∂': 'partial', '∇': 'nabla', '≈': 'approx', '≡': 'equiv', '≅': 'cong', '∼': 'sim', '≃': 'simeq',
    '∝': 'propto', '∅': 'emptyset', '…': 'ldots', '⋯': 'cdots', '⋮': 'vdots', '⋱': 'ddots', '¬': 'neg', '∧': 'land', '∨': 'lor', '≪': 'll', '≫': 'gg',
    '⊥': 'perp', '∥': 'parallel', 'ℓ': 'ell', 'ℏ': 'hbar', '√': 'surd', '⊕': 'oplus', '⊗': 'otimes', '†': 'dagger', '′': 'prime', '∠': 'angle', '△': 'triangle',
    '⟨': 'langle', '⟩': 'rangle', '⌊': 'lfloor', '⌋': 'rfloor', '⌈': 'lceil', '⌉': 'rceil', '∣': 'mid', '∫': 'int', '∑': 'sum', '∏': 'prod'
  };
  const SETS = { ℝ: 'R', ℕ: 'N', ℤ: 'Z', ℚ: 'Q', ℂ: 'C', ℙ: 'P' };
  const ESCAPE = { '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', $: '\\$', _: '\\_', '&': '\\&', '\\': '\\backslash ', '^': '\\hat{}', '~': '\\sim ' };
  const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp',
    'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'Pr', 'hom']);
  const NARY = { '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge', '⨁': '\\bigoplus', '⨂': '\\bigotimes' };
  const ACCENTS = { '̂': 'hat', '̃': 'tilde', '̇': 'dot', '̈': 'ddot', '⃗': 'vec', '⃑': 'vec', '̄': 'bar', '̅': 'bar', '̆': 'breve', '̌': 'check', '́': 'acute', '̀': 'grave', '^': 'hat', '~': 'tilde', '¯': 'bar' };
  const FENCES = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '': '.' };

  // Lettres mathématiques (𝑥, 𝐀…) : la lettre simple.
  function plainLetter(ch) {
    const c = ch.codePointAt(0);
    if (c >= 0x1d400 && c <= 0x1d6a3) {
      const k = (c - 0x1d400) % 52;
      return String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26);
    }
    if (c === 0x210e) return 'h';
    return ch;
  }

  function text(s, ctx, plain) {
    const word = s.trim();
    if (plain && FUNCS.has(word)) return '\\' + word + ' ';
    let out = '';
    for (const raw of s) {
      const ch = plainLetter(raw);
      if (ch === '&' && ctx.align) out += '&';
      else if (SYMBOLS[ch]) out += '\\' + SYMBOLS[ch] + ' ';
      else if (SETS[ch]) out += '\\mathbb{' + SETS[ch] + '}';
      else if (ESCAPE[ch]) out += ESCAPE[ch];
      else if (ch === '⁡' || ch === '​') continue; // application de fonction, espace nulle
      else if (ch === ' ' || ch === ' ') out += plain ? '~' : ' ';
      else out += ch;
    }
    // Mot droit de plusieurs lettres (« si », « max »…) : en romain.
    if (plain && /^[A-Za-z]{2,}$/.test(word)) return '\\mathrm{' + out.trim() + '}';
    return out;
  }

  const all = (el, ctx) => kids(el).map((c) => conv(c, ctx)).join('');
  const arg = (el, ctx) => all(el, ctx).trim();
  const group = (s) => (s.length === 1 || /^\\[a-zA-Z]+ ?$/.test(s) ? s : '{' + s + '}');

  function conv(el, ctx) {
    switch (el.localName) {
      case 'r': {
        let s = '';
        for (const c of kids(el)) if (c.localName === 't') s += c.textContent;
        if (!s) return '';
        const rPr = kid(el, 'rPr');
        if (kid(rPr, 'nor') && val(kid(rPr, 'nor')) !== '0' && !/^[\d\s.,]+$/.test(s)) return '\\text{' + s.replace(/[{}\\]/g, '') + '}';
        return text(s, ctx, prop(el, 'rPr', 'sty') === 'p');
      }
      case 'f': {
        const num = arg(kid(el, 'num'), ctx);
        const den = arg(kid(el, 'den'), ctx);
        const type = prop(el, 'fPr', 'type');
        if (type === 'lin' || type === 'skw') return group(num) + '/' + group(den);
        if (type === 'noBar') return '\\genfrac{}{}{0pt}{}{' + num + '}{' + den + '}';
        return '\\frac{' + num + '}{' + den + '}';
      }
      case 'sSup': return group(arg(kid(el, 'e'), ctx)) + '^{' + arg(kid(el, 'sup'), ctx) + '}';
      case 'sSub': return group(arg(kid(el, 'e'), ctx)) + '_{' + arg(kid(el, 'sub'), ctx) + '}';
      case 'sSubSup': return group(arg(kid(el, 'e'), ctx)) + '_{' + arg(kid(el, 'sub'), ctx) + '}^{' + arg(kid(el, 'sup'), ctx) + '}';
      case 'sPre': return '{}_{' + arg(kid(el, 'sub'), ctx) + '}^{' + arg(kid(el, 'sup'), ctx) + '}' + group(arg(kid(el, 'e'), ctx));
      case 'rad': {
        const deg = arg(kid(el, 'deg'), ctx);
        const e = arg(kid(el, 'e'), ctx);
        return deg && prop(el, 'radPr', 'degHide') !== '1' ? '\\sqrt[' + deg + ']{' + e + '}' : '\\sqrt{' + e + '}';
      }
      case 'nary': {
        const chr = prop(el, 'naryPr', 'chr') || '∫';
        let s = NARY[chr] || text(chr, ctx);
        const sub = prop(el, 'naryPr', 'subHide') === '1' ? '' : arg(kid(el, 'sub'), ctx);
        const sup = prop(el, 'naryPr', 'supHide') === '1' ? '' : arg(kid(el, 'sup'), ctx);
        if (sub) s += '_{' + sub + '}';
        if (sup) s += '^{' + sup + '}';
        return s + ' ' + arg(kid(el, 'e'), ctx);
      }
      case 'd': {
        const pr = kid(el, 'dPr');
        const fence = (name, def) => {
          const n = kid(pr, name);
          const ch = n ? val(n) ?? '' : def;
          return FENCES[ch] !== undefined ? FENCES[ch] : SYMBOLS[ch] ? '\\' + SYMBOLS[ch] : '.';
        };
        const sepEl = kid(pr, 'sepChr');
        const sep = sepEl ? val(sepEl) || '|' : '|';
        const parts = kids(el, 'e').map((e) => arg(e, ctx));
        return '\\left' + fence('begChr', '(') + parts.join(sep === '|' ? '\\mid ' : text(sep, ctx)) + '\\right' + fence('endChr', ')');
      }
      case 'func': {
        const name = arg(kid(el, 'fName'), ctx);
        const e = arg(kid(el, 'e'), ctx);
        return name + (/^\\left/.test(e) ? e : '{' + e + '}');
      }
      case 'limLow': {
        const e = arg(kid(el, 'e'), ctx);
        const lim = arg(kid(el, 'lim'), ctx);
        return /^\\(lim|max|min|sup|inf|liminf|limsup) ?$/.test(e) ? e.trim() + '_{' + lim + '}' : '\\underset{' + lim + '}{' + e + '}';
      }
      case 'limUpp': return '\\overset{' + arg(kid(el, 'lim'), ctx) + '}{' + arg(kid(el, 'e'), ctx) + '}';
      case 'acc': {
        const chr = prop(el, 'accPr', 'chr') || '̂';
        const e = arg(kid(el, 'e'), ctx);
        const cmd = ACCENTS[chr] || 'hat';
        return '\\' + (cmd === 'hat' && e.length > 1 ? 'widehat' : cmd === 'tilde' && e.length > 1 ? 'widetilde' : cmd === 'vec' && e.length > 1 ? 'overrightarrow' : cmd) + '{' + e + '}';
      }
      case 'bar': return (prop(el, 'barPr', 'pos') === 'top' ? '\\overline{' : '\\underline{') + arg(kid(el, 'e'), ctx) + '}';
      case 'groupChr': {
        const chr = prop(el, 'groupChrPr', 'chr') || '⏟';
        const e = arg(kid(el, 'e'), ctx);
        return chr === '⏞' ? '\\overbrace{' + e + '}' : chr === '⏟' ? '\\underbrace{' + e + '}' : e;
      }
      case 'borderBox': return '\\boxed{' + arg(kid(el, 'e'), ctx) + '}';
      case 'box': case 'phant': return arg(kid(el, 'e'), ctx);
      case 'm': {
        const rows = kids(el, 'mr').map((r) => kids(r, 'e').map((e) => arg(e, ctx)).join(' & '));
        return '\\begin{matrix}' + rows.join(' \\\\ ') + '\\end{matrix}';
      }
      case 'eqArr': {
        const inner = { ...ctx, align: true };
        const rows = kids(el, 'e').map((e) => arg(e, inner));
        return '\\begin{aligned}' + rows.join(' \\\\ ') + '\\end{aligned}';
      }
      case 'oMath': case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'deg': case 'lim': case 'fName':
        return all(el, ctx);
      default:
        // Propriétés (…Pr) ignorées.
        return /Pr$/.test(el.localName) ? '' : all(el, ctx);
    }
  }

  window.FTOmml = {
    latex(oMath) {
      try {
        return conv(oMath, {}).replace(/\s+/g, ' ').replace(/ ([}^_)\]])/g, '$1').trim();
      } catch {
        return oMath.textContent;
      }
    }
  };
})();
