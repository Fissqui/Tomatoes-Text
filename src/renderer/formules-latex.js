// Code LaTeX des équations : lu une fois (arbre), puis écrit en MathML (EPUB, presse-papiers) et en
// équation Word (OMML, export Word). Le dessin à l'écran reste celui de MathLive ; ce module sert aux
// sorties, qui ne dépendent plus de la conversion MathML de MathLive (barres, accents larges, accolades,
// virgule décimale et coefficients binomiaux y étaient perdus).
// Sens inverse : MathML (pages web, Word) vers LaTeX, pour reconnaître les équations collées.
(function () {
  // ----- Symboles -----

  // Commande → [caractère, classe] ; classes : i (lettre), o (opérateur), r (relation), b (binaire),
  // l (grand opérateur), f (délimiteur), p (ponctuation).
  const SYM = {};
  const add = (cls, list) => { for (const [cmd, ch] of Object.entries(list)) SYM[cmd] = [ch, cls]; };
  add('i', {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι',
    kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς',
    tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅', varnothing: '∅', ell: 'ℓ', hbar: 'ℏ', hslash: 'ℏ', aleph: 'ℵ', beth: 'ℶ', wp: '℘',
    Re: 'ℜ', Im: 'ℑ', top: '⊤', bot: '⊥', forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', angle: '∠', triangle: '△',
    degree: '°', prime: '′', dagger: '†', ddagger: '‡', star: '⋆', clubsuit: '♣', diamondsuit: '♢', heartsuit: '♡', spadesuit: '♠',
    square: '□', Box: '□', blacksquare: '■', checkmark: '✓', imath: 'ı', jmath: 'ȷ', complement: '∁', mho: '℧', backslash: '\\',
    ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dotsc: '…', dotsb: '⋯', '%': '%', '$': '$', '#': '#', '&': '&', _: '_',
    surd: '√', diameter: '⌀', S: '§', P: '¶', euro: '€'
  });
  add('b', {
    pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', circ: '∘', bullet: '∙', oplus: '⊕', ominus: '⊖', otimes: '⊗', oslash: '⊘',
    odot: '⊙', cup: '∪', cap: '∩', setminus: '∖', smallsetminus: '∖', land: '∧', wedge: '∧', lor: '∨', vee: '∨', sqcup: '⊔', sqcap: '⊓',
    uplus: '⊎', amalg: '⨿', bmod: 'mod', diamond: '⋄', bigtriangleup: '△', bigtriangledown: '▽', wr: '≀', ltimes: '⋉', rtimes: '⋊'
  });
  add('r', {
    le: '≤', leq: '≤', ge: '≥', geq: '≥', leqslant: '⩽', geqslant: '⩾', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', cong: '≅', sim: '∼',
    simeq: '≃', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', preceq: '⪯', succeq: '⪰', in: '∈', notin: '∉', ni: '∋', subset: '⊂',
    supset: '⊃', subseteq: '⊆', supseteq: '⊇', subsetneq: '⊊', supsetneq: '⊋', nsubseteq: '⊈', perp: '⊥', parallel: '∥', mid: '∣',
    nmid: '∤', vdash: '⊢', dashv: '⊣', models: '⊨', asymp: '≍', doteq: '≐', coloneqq: '≔', triangleq: '≜', lesssim: '≲', gtrsim: '≳',
    to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
    implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦', longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
    Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺', longmapsto: '⟼', uparrow: '↑', downarrow: '↓', updownarrow: '↕',
    Uparrow: '⇑', Downarrow: '⇓', nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖', hookrightarrow: '↪', hookleftarrow: '↩',
    rightharpoonup: '⇀', leftharpoonup: '↼', rightleftharpoons: '⇌', leadsto: '⇝', nrightarrow: '↛', nRightarrow: '⇏',
    approxeq: '≊', ncong: '≇', nsim: '≁', nleq: '≰', ngeq: '≱', lneq: '⪇', gneq: '⪈', sqsubseteq: '⊑', sqsupseteq: '⊒', bowtie: '⋈',
    colon: ':', vert: '|', Vert: '‖'
  });
  add('l', {
    sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', oiint: '∯', oiiint: '∰', bigcup: '⋃', bigcap: '⋂',
    bigvee: '⋁', bigwedge: '⋀', bigoplus: '⨁', bigotimes: '⨂', bigodot: '⨀', biguplus: '⨄', bigsqcup: '⨆', intop: '∫', smallint: '∫'
  });
  add('f', {
    lbrace: '{', rbrace: '}', '{': '{', '}': '}', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
    lvert: '|', rvert: '|', lVert: '‖', rVert: '‖', '|': '‖', lbrack: '[', rbrack: ']', ulcorner: '⌜', urcorner: '⌝', llcorner: '⌞', lrcorner: '⌟'
  });
  // Fonctions écrites droites (sin, log…) ; celles qui portent leurs bornes dessous en mode bloc.
  const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
    'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'deg', 'gcd', 'lcm', 'arg', 'Pr', 'hom', 'Hom', 'mod', 'tr', 'Tr', 'rank', 'rg', 'sgn', 'id', 'ch', 'sh', 'th', 'cotan']);
  const LIMS = new Set(['lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'argmax', 'argmin', 'injlim', 'projlim']);
  // Fonctions connues de LaTeX (les autres s'écrivent \operatorname{…}).
  const STD_FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp',
    'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'Pr', 'hom', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf']);
  const LIM_TEXT = { liminf: 'lim inf', limsup: 'lim sup', argmax: 'arg max', argmin: 'arg min' };
  // Espaces : largeur en em.
  const SPACES = { ',': 0.167, thinspace: 0.167, ':': 0.222, '>': 0.222, medspace: 0.222, ';': 0.278, thickspace: 0.278, '!': -0.167, negthinspace: -0.167, ' ': 0.333, quad: 1, qquad: 2, enspace: 0.5 };
  // Accents : caractère combinant (Word), caractère d'espacement (MathML), et s'il s'étire.
  const ACCENTS = {
    hat: ['̂', '^'], widehat: ['̂', '^', true], check: ['̌', 'ˇ'], widecheck: ['̌', 'ˇ', true], tilde: ['̃', '~'], widetilde: ['̃', '~', true],
    acute: ['́', '´'], grave: ['̀', '`'], dot: ['̇', '˙'], ddot: ['̈', '¨'], dddot: ['⃛', '⃛'], breve: ['̆', '˘'], bar: ['̅', '¯'],
    vec: ['⃗', '→'], mathring: ['̊', '˚'],
    overrightarrow: ['⃗', '→', true], overleftarrow: ['⃖', '←', true], overleftrightarrow: ['⃡', '↔', true]
  };
  const VARIANTS = { mathbb: 'double-struck', mathcal: 'script', mathscr: 'script', mathfrak: 'fraktur', mathbf: 'bold', mathrm: 'normal', mathit: 'italic', mathsf: 'sans-serif', mathtt: 'monospace', boldsymbol: 'bold-italic', bm: 'bold-italic', mathnormal: 'italic', operatorname: 'normal', textrm: 'normal', textbf: 'bold', textit: 'italic' };
  const ENVS = {
    matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], smallmatrix: ['', ''],
    'pmatrix*': ['(', ')'], 'bmatrix*': ['[', ']'], cases: ['{', ''], dcases: ['{', ''], rcases: ['', '}'], aligned: ['', ''], align: ['', ''], 'align*': ['', ''],
    gathered: ['', ''], gather: ['', ''], 'gather*': ['', ''], split: ['', ''], array: ['', ''], eqnarray: ['', ''], 'eqnarray*': ['', ''], subarray: ['', ''],
    equation: null, 'equation*': null, displaymath: null, math: null, alignat: ['', ''], 'alignat*': ['', ''], multline: ['', ''], 'multline*': ['', '']
  };

  // ----- Lecture du code LaTeX -----

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const m = /^\\([A-Za-z]+\*?|.)/s.exec(src.slice(i));
        if (!m) { i++; continue; }
        out.push({ k: 'cmd', v: m[1] });
        i += m[0].length;
        // (Les espaces après une commande nommée ne comptent pas.)
        continue;
      }
      if (c === '%') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (/\s/.test(c)) { out.push({ k: 'sp', v: ' ' }); while (i < src.length && /\s/.test(src[i])) i++; continue; }
      const cp = src.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      out.push({ k: 'ch', v: ch });
      i += ch.length;
    }
    return out;
  }

  class Parser {
    constructor(src) { this.t = tokenize(src); this.i = 0; }
    peek() { return this.t[this.i]; }
    next() { return this.t[this.i++]; }
    skipSpace() { while (this.peek() && this.peek().k === 'sp') this.i++; }
    is(k, v) { const t = this.peek(); return !!t && t.k === k && (v === undefined || t.v === v); }

    // Groupe entre accolades (ou un seul élément).
    arg() {
      this.skipSpace();
      const t = this.peek();
      if (!t) return { t: 'row', c: [] };
      if (t.k === 'ch' && t.v === '{') { this.i++; const r = this.row(['}']); if (this.is('ch', '}')) this.i++; return r; }
      return this.atom() || { t: 'row', c: [] };
    }
    // Texte brut entre accolades (noms d'environnement, \text…).
    rawArg() {
      this.skipSpace();
      if (!this.is('ch', '{')) { const t = this.next(); return t ? (t.k === 'cmd' ? '\\' + t.v : t.v) : ''; }
      this.i++;
      let depth = 1;
      let s = '';
      while (this.peek()) {
        const t = this.next();
        if (t.k === 'ch' && t.v === '{') depth++;
        if (t.k === 'ch' && t.v === '}' && --depth === 0) break;
        s += t.k === 'cmd' ? '\\' + t.v + (/^[A-Za-z]/.test(t.v) ? ' ' : '') : t.v;
      }
      return s;
    }
    optArg() {
      this.skipSpace();
      if (!this.is('ch', '[')) return null;
      this.i++;
      const r = this.row([']']);
      if (this.is('ch', ']')) this.i++;
      return r;
    }

    // Suite d'éléments jusqu'à un des arrêts (}, ], \right, \end, &, \\).
    row(stops) {
      const c = [];
      for (;;) {
        const t = this.peek();
        if (!t) break;
        if (t.k === 'ch' && stops.includes(t.v)) break;
        if (t.k === 'cmd' && (t.v === 'right' || t.v === 'end' || t.v === '\\' || t.v === 'cr' || t.v === 'middle') && stops.includes('\\' + t.v)) break;
        if (t.k === 'ch' && t.v === '&' && stops.includes('&')) break;
        if (t.k === 'cmd' && (t.v === '\\' || t.v === 'cr') && stops.includes('\\\\')) break;
        if (t.k === 'cmd' && (t.v === 'right' || t.v === 'end')) break;
        if (t.k === 'sp') { this.i++; continue; }
        if (t.k === 'ch' && (t.v === '^' || t.v === '_' || t.v === "'")) {
          this.i++;
          const base = c.length ? c.pop() : { t: 'row', c: [] };
          c.push(this.script(base, t.v));
          continue;
        }
        if (t.k === 'cmd' && (t.v === 'limits' || t.v === 'nolimits')) {
          this.i++;
          const last = c[c.length - 1];
          if (last) last.limits = t.v === 'limits';
          continue;
        }
        const a = this.atom(stops);
        if (a === null) continue;
        if (a.t === 'over') {
          // {a \over b} : tout ce qui précède est le numérateur.
          const rest = this.row(stops);
          return { t: 'row', c: [{ t: 'frac', n: { t: 'row', c: c.splice(0) }, d: rest, bar: a.bar !== false, fence: a.fence }] };
        }
        if (Array.isArray(a)) c.push(...a);
        else c.push(a);
      }
      return { t: 'row', c };
    }

    script(base, kind) {
      const node = base.t === 'scr' && !(kind === '_' ? base.sub : kind === '^' ? base.sup : null) ? base : { t: 'scr', b: base };
      if (kind === "'") {
        let primes = '′';
        while (this.is('ch', "'")) { this.i++; primes += '′'; }
        const p = { t: 'o', v: primes.length === 2 ? '″' : primes.length === 3 ? '‴' : primes };
        node.sup = node.sup ? { t: 'row', c: [p, node.sup] } : p;
        if (this.is('ch', '^')) { this.i++; const more = this.arg(); node.sup = { t: 'row', c: [node.sup, more] }; }
        return node;
      }
      const v = this.arg();
      if (kind === '^') node.sup = v; else node.sub = v;
      return node;
    }

    // Un élément (ou null pour ce qui ne produit rien).
    atom(stops = []) {
      this.skipSpace();
      const t = this.next();
      if (!t) return null;
      if (t.k === 'ch') {
        const v = t.v;
        if (v === '{') { const r = this.row(['}']); if (this.is('ch', '}')) this.i++; return r.c.length === 1 ? r.c[0] : r; }
        if (v === '}') return null;
        if (/[0-9]/.test(v) || (v === '.' && this.is('ch') && /[0-9]/.test(this.peek().v))) {
          let s = v;
          for (;;) {
            if (this.is('ch') && /[0-9.]/.test(this.peek().v)) { s += this.next().v; continue; }
            // Virgule décimale française écrite {,}.
            if (this.is('ch', '{') && this.t[this.i + 1] && this.t[this.i + 1].v === ',' && this.t[this.i + 2] && this.t[this.i + 2].v === '}' &&
              this.t[this.i + 3] && /[0-9]/.test(this.t[this.i + 3].v)) { this.i += 3; s += ','; continue; }
            break;
          }
          return { t: 'n', v: s };
        }
        if (/\p{L}/u.test(v)) return { t: 'i', v };
        if ('+-*/=<>!:;,.?|()[]~'.includes(v) || /[←-⋿±×÷]/.test(v)) {
          const map = { '-': '−', '*': '∗', '~': ' ' };
          const ch = map[v] || v;
          if (v === '~') return { t: 'space', w: 0.333 };
          return { t: 'o', v: ch, cls: '=<>'.includes(v) ? 'r' : '+-*/'.includes(v) ? 'b' : '([|'.includes(v) ? 'f' : ')]'.includes(v) ? 'f' : ',;.!?:'.includes(v) ? 'p' : 'o' };
        }
        return { t: 'i', v };
      }
      if (t.k === 'sp') return null;
      return this.command(t.v, stops);
    }

    command(name, stops) {
      if (name === '\\' || name === 'cr' || name === 'newline') return null;
      if (Object.prototype.hasOwnProperty.call(SPACES, name)) return { t: 'space', w: SPACES[name] };
      if (name === 'hspace' || name === 'hspace*' || name === 'kern' || name === 'mkern' || name === 'mspace') { this.rawArg(); return { t: 'space', w: 0.5 }; }
      if (/^(frac|dfrac|tfrac|cfrac)$/.test(name)) {
        const n = this.arg();
        const d = this.arg();
        return { t: 'frac', n, d, style: name[0] === 'd' || name === 'cfrac' ? 'd' : name[0] === 't' ? 't' : '' };
      }
      if (/^(binom|dbinom|tbinom|choose)$/.test(name)) {
        if (name === 'choose') return { t: 'over', bar: false, fence: true };
        const n = this.arg();
        const d = this.arg();
        return { t: 'fence', open: '(', close: ')', c: { t: 'row', c: [{ t: 'frac', n, d, bar: false }] } };
      }
      if (name === 'over') return { t: 'over' };
      if (name === 'atop') return { t: 'over', bar: false };
      if (name === 'sqrt') {
        const deg = this.optArg();
        return { t: 'sqrt', b: this.arg(), deg };
      }
      if (name === 'left') {
        const open = this.delim();
        const body = this.row(['\\right']);
        let close = '';
        if (this.is('cmd', 'right')) { this.i++; close = this.delim(); }
        return { t: 'fence', open, close, c: body };
      }
      if (/^(big|Big|bigg|Bigg)[lrm]?$/.test(name)) return { t: 'o', v: this.delim(), cls: 'f' };
      if (name === 'middle') return { t: 'o', v: this.delim(), cls: 'f' };
      if (ACCENTS[name]) {
        const [comb, spacing, wide] = ACCENTS[name];
        return { t: 'acc', b: this.arg(), comb, ch: spacing, wide: !!wide };
      }
      if (name === 'overline' || name === 'underline') return { t: 'bar', b: this.arg(), pos: name === 'overline' ? 'top' : 'bot' };
      if (name === 'overbrace' || name === 'underbrace' || name === 'overbracket' || name === 'underbracket') {
        const top = name.startsWith('over');
        const node = { t: 'brace', b: this.arg(), pos: top ? 'top' : 'bot', ch: name.endsWith('bracket') ? (top ? '⎴' : '⎵') : (top ? '⏞' : '⏟') };
        // Étiquette : ^{…} au-dessus, _{…} dessous.
        this.skipSpace();
        if (this.is('ch', top ? '^' : '_')) { this.i++; node.label = this.arg(); }
        return node;
      }
      if (name === 'overset' || name === 'stackrel') { const top = this.arg(); return { t: 'over2', top, b: this.arg() }; }
      if (name === 'underset') { const bot = this.arg(); return { t: 'under2', bot, b: this.arg() }; }
      if (/^x(right|left|leftright|Right|Left)arrow$/.test(name) || name === 'xmapsto') {
        const below = this.optArg();
        const above = this.arg();
        const ch = { xrightarrow: '→', xleftarrow: '←', xleftrightarrow: '↔', xRightarrow: '⇒', xLeftarrow: '⇐', xmapsto: '↦' }[name] || '→';
        return { t: 'xarrow', ch, top: above, bot: below };
      }
      if (name === 'boxed' || name === 'fbox' || name === 'framebox') return { t: 'box', b: this.arg() };
      if (/^(cancel|bcancel|xcancel|sout)$/.test(name)) return { t: 'strike', b: this.arg() };
      if (name === 'phantom' || name === 'vphantom' || name === 'hphantom') { this.arg(); return { t: 'space', w: 0.5 }; }
      if (name === 'color' || name === 'textcolor' || name === 'colorbox') {
        this.rawArg();
        // \color{red} x : la suite garde sa couleur à l'écran seulement ; \textcolor{red}{x} : son contenu.
        return name === 'color' ? null : this.arg();
      }
      if (/^(displaystyle|textstyle|scriptstyle|scriptscriptstyle|nonumber|notag|notag|allowbreak|nobreak|relax|strut|mathstrut|left\.|right\.|protect|centering|hline|hdashline)$/.test(name)) return null;
      if (name === 'label' || name === 'tag' || name === 'tag*' || name === 'ref' || name === 'eqref') {
        const v = this.rawArg();
        if (name === 'tag' || name === 'tag*') this.tag = v;
        return name === 'ref' || name === 'eqref' ? { t: 'text', v: name === 'eqref' ? '(' + v + ')' : v } : null;
      }
      if (/^(text|textrm|textit|textbf|textsf|texttt|textnormal|mbox|hbox|textup|emph)$/.test(name)) {
        return { t: 'text', v: this.rawArg().replace(/\\([{}%$&#_ ])/g, '$1').replace(/~/g, ' '), variant: VARIANTS[name] };
      }
      if (name === 'operatorname' || name === 'operatorname*' || name === 'DeclareMathOperator') {
        const v = this.rawArg().replace(/\\,|\\ /g, ' ').trim();
        return { t: 'fn', v, lim: name.endsWith('*') };
      }
      if (VARIANTS[name]) {
        const variant = VARIANTS[name];
        const b = this.arg();
        return { t: 'style', variant, b };
      }
      if (name === 'not') {
        const a = this.atom();
        if (a && (a.t === 'o' || a.t === 'i')) return { ...a, v: a.v === '=' ? '≠' : a.v === '∈' ? '∉' : a.v === '⊂' ? '⊄' : a.v === '⊆' ? '⊈' : a.v === '∃' ? '∄' : a.v + '̸' };
        return a;
      }
      if (name === 'pmod') { const b = this.arg(); return { t: 'fence', open: '(', close: ')', c: { t: 'row', c: [{ t: 'fn', v: 'mod' }, { t: 'space', w: 0.333 }, b] } }; }
      if (name === 'bmod' || name === 'mod') return { t: 'fn', v: 'mod' };
      if (name === 'begin') return this.env(this.rawArg().trim());
      if (FUNCS.has(name)) return { t: 'fn', v: name };
      if (LIMS.has(name)) return { t: 'fn', v: LIM_TEXT[name] || name, lim: true };
      if (SYM[name]) {
        const [ch, cls] = SYM[name];
        if (cls === 'i') return { t: 'i', v: ch, sym: true };
        if (cls === 'l') return { t: 'o', v: ch, cls: 'l', limits: /^(sum|prod|coprod|big)/.test(name) ? undefined : false };
        if (ch === 'mod') return { t: 'fn', v: 'mod' };
        return { t: 'o', v: ch, cls };
      }
      if (name.length === 1 && !/[A-Za-z]/.test(name)) return { t: 'o', v: name, cls: 'p' };
      // Commande inconnue : son nom reste visible.
      return { t: 'text', v: '\\' + name, unknown: true };
    }

    // Délimiteur après \left, \right, \big…
    delim() {
      this.skipSpace();
      const t = this.next();
      if (!t) return '';
      if (t.k === 'ch') return t.v === '.' ? '' : t.v === '<' ? '⟨' : t.v === '>' ? '⟩' : t.v;
      if (t.v === '.') return '';
      if (SYM[t.v]) return SYM[t.v][0];
      if (t.v === '{' || t.v === '}') return t.v;
      if (t.v === '|') return '‖';
      return '';
    }

    env(name) {
      const kind = ENVS[name];
      let cols = null;
      if (name === 'array' || name === 'subarray' || name === 'alignat' || name === 'alignat*') cols = this.rawArg().replace(/[^lcr]/g, '');
      if (kind === null) {
        // equation : son contenu seul.
        const body = this.row([]);
        this.endEnv();
        return body;
      }
      const rows = [];
      let cells = [];
      for (;;) {
        const cell = this.row(['&', '\\\\']);
        cells.push(cell);
        const t = this.peek();
        if (!t) break;
        if (t.k === 'ch' && t.v === '&') { this.i++; continue; }
        if (t.k === 'cmd' && (t.v === '\\' || t.v === 'cr')) { this.i++; this.optArg(); rows.push(cells); cells = []; continue; }
        if (t.k === 'cmd' && t.v === 'end') break;
        // (Accolade ou \right sans pendant : on s'arrête.)
        this.i++;
      }
      if (cells.length && !(cells.length === 1 && !cells[0].c.length && rows.length)) rows.push(cells);
      this.endEnv();
      const n = Math.max(1, ...rows.map((r) => r.length));
      let align;
      if (/^(cases|dcases|rcases)$/.test(name)) align = Array(n).fill('l');
      else if (/^(aligned|align\*?|split|alignat\*?|eqnarray\*?)$/.test(name)) align = Array.from({ length: n }, (_, k) => (k % 2 ? 'l' : 'r'));
      else if (cols) align = Array.from({ length: n }, (_, k) => cols[k] || 'c');
      else align = Array(n).fill('c');
      const table = { t: 'table', rows, align, env: name, small: name === 'smallmatrix', gap: /^(aligned|align|split|alignat|eqnarray)/.test(name) ? 'align' : /cases/.test(name) ? 'cases' : 'matrix' };
      const [open, close] = kind || ['', ''];
      return open || close ? { t: 'fence', open, close, c: { t: 'row', c: [table] } } : table;
    }

    endEnv() {
      if (this.is('cmd', 'end')) { this.i++; this.rawArg(); }
    }
  }

  function parse(latex) {
    const p = new Parser(String(latex || ''));
    const out = [];
    while (p.peek()) {
      const r = p.row([]);
      out.push(...r.c);
      // \right ou \end sans pendant, accolade fermante de trop : passés.
      if (p.peek()) p.i++;
    }
    const tree = { t: 'row', c: out };
    tree.tag = p.tag || null;
    return tree;
  }

  // ----- Écriture en MathML -----

  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const VARIANT_UNICODE = {
    'double-struck': { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }
  };

  function mml(n) {
    if (!n) return '<mrow/>';
    switch (n.t) {
      case 'row': return n.c.length === 1 ? mml(n.c[0]) : `<mrow>${n.c.map(mml).join('')}</mrow>`;
      case 'i': return n.v.length > 1 || n.sym === false ? `<mi mathvariant="normal">${xml(n.v)}</mi>` : `<mi>${xml(n.v)}</mi>`;
      case 'n': return `<mn>${xml(n.v)}</mn>`;
      case 'o': {
        if (n.cls === 'l') return `<mo largeop="true">${xml(n.v)}</mo>`;
        if (n.cls === 'f') return `<mo stretchy="false">${xml(n.v)}</mo>`;
        return `<mo>${xml(n.v)}</mo>`;
      }
      case 'fn': return `<mi mathvariant="normal">${xml(n.v)}</mi><mo>&#x2061;</mo>`;
      case 'text': return `<mtext>${xml(n.v)}</mtext>`;
      case 'space': return `<mspace width="${n.w}em"/>`;
      case 'frac': {
        const f = `<mfrac${n.bar === false ? ' linethickness="0"' : ''}>${mml(n.n)}${mml(n.d)}</mfrac>`;
        const styled = n.style === 'd' ? `<mstyle displaystyle="true" scriptlevel="0">${f}</mstyle>` : n.style === 't' ? `<mstyle displaystyle="false">${f}</mstyle>` : f;
        return n.fence ? `<mrow><mo>(</mo>${styled}<mo>)</mo></mrow>` : styled;
      }
      case 'sqrt': return n.deg ? `<mroot>${mml(n.b)}${mml(n.deg)}</mroot>` : `<msqrt>${mml(n.b)}</msqrt>`;
      case 'scr': {
        const big = n.b && n.b.t === 'o' && n.b.cls === 'l' && n.b.limits !== false;
        const limit = n.b && n.b.t === 'fn' && n.b.lim;
        if (big || limit || n.b.limits === true) {
          const base = limit ? `<mi mathvariant="normal">${xml(n.b.v)}</mi>` : mml(n.b);
          if (n.sub && n.sup) return `<munderover>${base}${mml(n.sub)}${mml(n.sup)}</munderover>`;
          return n.sub ? `<munder>${base}${mml(n.sub)}</munder>` : `<mover>${base}${mml(n.sup)}</mover>`;
        }
        const base = n.b && n.b.t === 'fn' ? `<mi mathvariant="normal">${xml(n.b.v)}</mi>` : mml(n.b);
        if (n.sub && n.sup) return `<msubsup>${base}${mml(n.sub)}${mml(n.sup)}</msubsup>`;
        return n.sub ? `<msub>${base}${mml(n.sub)}</msub>` : `<msup>${base}${mml(n.sup)}</msup>`;
      }
      case 'fence': return `<mrow>${n.open ? `<mo fence="true" stretchy="true">${xml(n.open)}</mo>` : ''}${mml(n.c)}${n.close ? `<mo fence="true" stretchy="true">${xml(n.close)}</mo>` : ''}</mrow>`;
      case 'acc': return `<mover accent="true">${mml(n.b)}<mo${n.wide ? ' stretchy="true"' : ' stretchy="false"'}>${xml(n.ch)}</mo></mover>`;
      case 'bar': return n.pos === 'top' ? `<mover accent="true">${mml(n.b)}<mo stretchy="true">‾</mo></mover>` : `<munder accentunder="true">${mml(n.b)}<mo stretchy="true">_</mo></munder>`;
      case 'brace': {
        const inner = n.pos === 'top' ? `<mover accent="true">${mml(n.b)}<mo stretchy="true">${n.ch}</mo></mover>` : `<munder accentunder="true">${mml(n.b)}<mo stretchy="true">${n.ch}</mo></munder>`;
        if (!n.label) return inner;
        return n.pos === 'top' ? `<mover>${inner}${mml(n.label)}</mover>` : `<munder>${inner}${mml(n.label)}</munder>`;
      }
      case 'over2': return `<mover>${mml(n.b)}${mml(n.top)}</mover>`;
      case 'under2': return `<munder>${mml(n.b)}${mml(n.bot)}</munder>`;
      case 'xarrow': {
        const arrow = `<mo stretchy="true" minsize="2em">${n.ch}</mo>`;
        if (n.top && n.bot) return `<munderover>${arrow}${mml(n.bot)}${mml(n.top)}</munderover>`;
        return n.bot ? `<munder>${arrow}${mml(n.bot)}</munder>` : `<mover>${arrow}${mml(n.top)}</mover>`;
      }
      case 'box': return `<menclose notation="box">${mml(n.b)}</menclose>`;
      case 'strike': return `<menclose notation="updiagonalstrike">${mml(n.b)}</menclose>`;
      case 'style': {
        const v = VARIANT_UNICODE[n.variant];
        const inner = n.b.t === 'i' ? { ...n.b } : n.b;
        if (inner.t === 'i' && v && v[inner.v]) return `<mi>${v[inner.v]}</mi>`;
        return `<mstyle mathvariant="${n.variant}">${mmlVariant(n.b, n.variant)}</mstyle>`;
      }
      case 'table': {
        const al = n.align.map((a) => ({ l: 'left', r: 'right', c: 'center' }[a])).join(' ');
        const rows = n.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${mml(c)}</mtd>`).join('')}</mtr>`).join('');
        return `<mtable columnalign="${al}"${n.gap === 'align' ? ' columnspacing="0em"' : ''}${n.gap === 'cases' ? ' columnspacing="1em"' : ''}>${rows}</mtable>`;
      }
      default: return '';
    }
  }
  // Lettres d'un style (gras, droit…) : chaque <mi> le porte (sinon MathML met les lettres seules en italique).
  function mmlVariant(n, variant) {
    if (n.t === 'i') return `<mi mathvariant="${variant}">${xml(n.v)}</mi>`;
    if (n.t === 'row') return n.c.map((c) => mmlVariant(c, variant)).join('');
    return mml(n);
  }

  function toMathML(latex, block) {
    const tree = parse(latex);
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${block ? ' display="block"' : ''}><semantics>${mml(tree)}<annotation encoding="application/x-tex">${xml(latex)}</annotation></semantics></math>`;
  }

  // ----- Écriture en équation Word (OMML) -----

  const SCR = { 'double-struck': 'double-struck', script: 'script', fraktur: 'fraktur', 'sans-serif': 'sans-serif', monospace: 'monospace' };
  function run(text, opts = {}) {
    if (text === '') return '';
    const pr = [];
    if (opts.nor) pr.push('<m:nor/>');
    if (opts.scr) pr.push(`<m:scr m:val="${opts.scr}"/>`);
    if (opts.sty) pr.push(`<m:sty m:val="${opts.sty}"/>`);
    return `<m:r>${pr.length ? `<m:rPr>${pr.join('')}</m:rPr>` : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${xml(text)}</m:t></m:r>`;
  }
  const e = (inner) => `<m:e>${inner}</m:e>`;
  const styleOf = (variant) => {
    if (!variant) return {};
    if (variant === 'normal') return { sty: 'p' };
    if (variant === 'bold') return { sty: 'b' };
    if (variant === 'bold-italic') return { sty: 'bi' };
    if (variant === 'italic') return { sty: 'i' };
    return { scr: SCR[variant], sty: 'p' };
  };
  const isBig = (n) => n && n.t === 'o' && n.cls === 'l';
  const isLimFn = (n) => n && n.t === 'fn' && n.lim;
  // Fin de ce que porte un grand opérateur : la prochaine relation ou le prochain + / −.
  const ends = (n) => n && n.t === 'o' && (n.cls === 'r' || n.v === '+' || n.v === '−' || n.v === '±' || n.v === '∓' || n.v === ',' || n.v === ';');

  function omRow(list, variant) {
    let out = '';
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      const base = n.t === 'scr' ? n.b : n;
      if (isBig(base)) {
        // Grand opérateur : il porte ce qui suit (jusqu'à la prochaine relation).
        let j = k + 1;
        while (j < list.length && !ends(list[j])) j++;
        out += nary(n, list.slice(k + 1, j), variant);
        k = j - 1;
        continue;
      }
      if (n.t === 'fn' || (n.t === 'scr' && n.b.t === 'fn')) {
        // Fonction (sin x, lim…) : son nom, puis ce qu'elle porte (l'élément suivant).
        const next = list[k + 1] && !ends(list[k + 1]) && list[k + 1].t !== 'space' ? list[k + 1] : null;
        out += func(n, next, variant);
        if (next) k++;
        continue;
      }
      out += om(n, variant);
    }
    return out;
  }

  function nary(n, body, variant) {
    const op = n.t === 'scr' ? n.b : n;
    const integral = /[∫∬∭∮∯∰]/.test(op.v);
    const limits = op.limits === true || (op.limits !== false && !integral);
    const sub = n.t === 'scr' && n.sub ? om(n.sub, variant) : '';
    const sup = n.t === 'scr' && n.sup ? om(n.sup, variant) : '';
    const pr = [`<m:chr m:val="${xml(op.v)}"/>`, `<m:limLoc m:val="${limits ? 'undOvr' : 'subSup'}"/>`];
    if (!sub) pr.push('<m:subHide m:val="1"/>');
    if (!sup) pr.push('<m:supHide m:val="1"/>');
    return `<m:nary><m:naryPr>${pr.join('')}</m:naryPr><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup>${e(omRow(body, variant))}</m:nary>`;
  }

  function func(n, next, variant) {
    const f = n.t === 'scr' ? n.b : n;
    let name = run(f.v, { sty: 'p' });
    if (n.t === 'scr') {
      if (f.lim && n.sub && !n.sup) name = `<m:limLow>${e(name)}<m:lim>${om(n.sub, variant)}</m:lim></m:limLow>`;
      else if (f.lim && n.sup && !n.sub) name = `<m:limUpp>${e(name)}<m:lim>${om(n.sup, variant)}</m:lim></m:limUpp>`;
      else name = om({ t: 'scr', b: { t: 'text-run', xml: name }, sub: n.sub, sup: n.sup }, variant);
    }
    return `<m:func><m:fName>${name}</m:fName>${e(next ? om(next, variant) : '')}</m:func>`;
  }

  function om(n, variant) {
    if (!n) return '';
    const st = styleOf(variant);
    switch (n.t) {
      case 'text-run': return n.xml;
      case 'row': return omRow(n.c, variant);
      case 'i': return run(n.v, n.v.length > 1 && !variant ? { sty: 'p' } : st);
      case 'n': return run(n.v, variant === 'bold' || variant === 'bold-italic' ? { sty: 'b' } : {});
      case 'o': return run(n.v, { sty: 'p' });
      case 'fn': return run(n.v, { sty: 'p' });
      case 'text': return run(n.v, { nor: true, ...(n.variant === 'bold' ? { sty: 'b' } : n.variant === 'italic' ? { sty: 'i' } : {}) });
      case 'space': {
        const w = n.w;
        if (w <= 0) return '';
        const ch = w >= 2 ? '  ' : w >= 1 ? ' ' : w >= 0.5 ? ' ' : w >= 0.27 ? ' ' : w >= 0.2 ? ' ' : ' ';
        return run(ch, { sty: 'p' });
      }
      case 'frac': {
        const type = n.bar === false ? '<m:type m:val="noBar"/>' : n.style === 't' ? '' : '';
        const f = `<m:f>${type ? `<m:fPr>${type}</m:fPr>` : ''}<m:num>${om(n.n, variant)}</m:num><m:den>${om(n.d, variant)}</m:den></m:f>`;
        return n.fence ? `<m:d>${e(f)}</m:d>` : f;
      }
      case 'sqrt': return n.deg
        ? `<m:rad><m:deg>${om(n.deg, variant)}</m:deg>${e(om(n.b, variant))}</m:rad>`
        : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e(om(n.b, variant))}</m:rad>`;
      case 'scr': {
        if (isBig(n.b)) return nary(n, [], variant);
        if (n.b && n.b.t === 'fn') return func(n, null, variant);
        if (n.b && n.b.limits === true) {
          let inner = om(n.b, variant);
          if (n.sub) inner = `<m:limLow>${e(inner)}<m:lim>${om(n.sub, variant)}</m:lim></m:limLow>`;
          if (n.sup) inner = `<m:limUpp>${e(inner)}<m:lim>${om(n.sup, variant)}</m:lim></m:limUpp>`;
          return inner;
        }
        const base = e(om(n.b, variant));
        if (n.sub && n.sup) return `<m:sSubSup>${base}<m:sub>${om(n.sub, variant)}</m:sub><m:sup>${om(n.sup, variant)}</m:sup></m:sSubSup>`;
        if (n.sub) return `<m:sSub>${base}<m:sub>${om(n.sub, variant)}</m:sub></m:sSub>`;
        return `<m:sSup>${base}<m:sup>${om(n.sup, variant)}</m:sup></m:sSup>`;
      }
      case 'fence': {
        // Séparateurs \middle| dans la parenthèse : laissés dans le contenu.
        const pr = [];
        if (n.open !== '(') pr.push(`<m:begChr m:val="${xml(n.open)}"/>`);
        if (n.close !== ')') pr.push(`<m:endChr m:val="${xml(n.close)}"/>`);
        return `<m:d>${pr.length ? `<m:dPr>${pr.join('')}</m:dPr>` : ''}${e(om(n.c, variant))}</m:d>`;
      }
      case 'acc': return `<m:acc><m:accPr><m:chr m:val="${n.comb}"/></m:accPr>${e(om(n.b, variant))}</m:acc>`;
      case 'bar': return `<m:bar><m:barPr><m:pos m:val="${n.pos}"/></m:barPr>${e(om(n.b, variant))}</m:bar>`;
      case 'brace': {
        const g = `<m:groupChr><m:groupChrPr><m:chr m:val="${n.ch}"/><m:pos m:val="${n.pos}"/><m:vertJc m:val="${n.pos === 'top' ? 'bot' : 'top'}"/></m:groupChrPr>${e(om(n.b, variant))}</m:groupChr>`;
        if (!n.label) return g;
        return n.pos === 'top' ? `<m:limUpp>${e(g)}<m:lim>${om(n.label, variant)}</m:lim></m:limUpp>` : `<m:limLow>${e(g)}<m:lim>${om(n.label, variant)}</m:lim></m:limLow>`;
      }
      case 'over2': return `<m:limUpp>${e(om(n.b, variant))}<m:lim>${om(n.top, variant)}</m:lim></m:limUpp>`;
      case 'under2': return `<m:limLow>${e(om(n.b, variant))}<m:lim>${om(n.bot, variant)}</m:lim></m:limLow>`;
      case 'xarrow': {
        let g = `<m:groupChr><m:groupChrPr><m:chr m:val="${n.ch}"/><m:vertJc m:val="bot"/></m:groupChrPr>${e(n.top ? om(n.top, variant) : run(' ', { sty: 'p' }))}</m:groupChr>`;
        if (n.bot) g = `<m:limLow>${e(g)}<m:lim>${om(n.bot, variant)}</m:lim></m:limLow>`;
        return g;
      }
      case 'box': return `<m:borderBox>${e(om(n.b, variant))}</m:borderBox>`;
      case 'strike': return `<m:borderBox><m:borderBoxPr><m:hideTop m:val="1"/><m:hideBot m:val="1"/><m:hideLeft m:val="1"/><m:hideRight m:val="1"/><m:strikeBLTR m:val="1"/></m:borderBoxPr>${e(om(n.b, variant))}</m:borderBox>`;
      case 'style': return om(n.b, n.variant);
      case 'table': {
        const cols = Math.max(1, ...n.rows.map((r) => r.length));
        const jc = { l: 'left', r: 'right', c: 'center' };
        const mcs = n.align.slice(0, cols).map((a) => `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${jc[a] || 'center'}"/></m:mcPr></m:mc>`).join('');
        const pr = `<m:mPr><m:baseJc m:val="center"/><m:plcHide m:val="1"/>${n.gap === 'align' ? '<m:cGpRule m:val="3"/><m:cGp m:val="0"/>' : ''}<m:mcs>${mcs}</m:mcs></m:mPr>`;
        const rows = n.rows.map((r) => `<m:mr>${Array.from({ length: cols }, (_, k) => e(r[k] ? om(r[k], variant) : '')).join('')}</m:mr>`).join('');
        return `<m:m>${pr}${rows}</m:m>`;
      }
      default: return '';
    }
  }

  // Équation Word : m:oMath (dans la ligne) ou m:oMathPara (sur sa ligne, centrée ou à gauche).
  function toOmml(latex, opts = {}) {
    const body = om(parse(latex));
    const math = `<m:oMath>${body}</m:oMath>`;
    if (!opts.block) return math;
    return `<m:oMathPara><m:oMathParaPr><m:jc m:val="${opts.align === 'gauche' ? 'left' : 'center'}"/></m:oMathParaPr>${math}</m:oMathPara>`;
  }

  // ----- MathML vers LaTeX (équations collées) -----

  const CHAR_CMD = {};
  for (const [cmd, [ch]] of Object.entries(SYM)) if (!CHAR_CMD[ch] && /^[A-Za-z]+$/.test(cmd) && !['lbrace', 'rbrace', 'lvert', 'rvert', 'lVert', 'rVert', 'lbrack', 'rbrack', 'dots', 'dotsc', 'dotsb', 'gets', 'lnot', 'land', 'lor', 'Box', 'intop', 'smallint', 'hslash', 'varnothing', 'thinspace', 'vert', 'Vert', 'colon', 'implies', 'impliedby', 'iff', 'smallsetminus', 'degree'].includes(cmd)) CHAR_CMD[ch] = cmd;
  Object.assign(CHAR_CMD, { '−': '-', '∗': '*', '≤': 'le', '≥': 'ge', '≠': 'ne', '→': 'to', '∣': 'mid', '⋅': 'cdot', '·': 'cdot', '°': 'degree', '′': "'", '″': "''", 'ε': 'varepsilon', 'ϕ': 'phi', 'φ': 'varphi', '⁡': '', '⁢': '', '⁣': '', '⁤': '', ' ': '~', '∅': 'emptyset', '‖': '\\|' });
  const SETS = { ℝ: 'R', ℕ: 'N', ℤ: 'Z', ℚ: 'Q', ℂ: 'C', ℙ: 'P', ℍ: 'H' };
  const ACC_CMD = { '^': 'hat', 'ˆ': 'hat', '̂': 'hat', '~': 'tilde', '˜': 'tilde', '̃': 'tilde', '¯': 'bar', '‾': 'overline', '̅': 'bar', '→': 'vec', '⃗': 'vec', '⃗': 'vec', '˙': 'dot', '̇': 'dot', '¨': 'ddot', '̈': 'ddot', 'ˇ': 'check', '˘': 'breve', '´': 'acute', '`': 'grave', '⏞': 'overbrace', '⏟': 'underbrace', '_': 'underline', '̲': 'underline' };
  const FENCE_CMD = { '{': '\\{', '}': '\\}', '⟨': '\\langle', '〈': '\\langle', '⟩': '\\rangle', '〉': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '‖': '\\|', '∥': '\\|', '|': '|', '(': '(', ')': ')', '[': '[', ']': ']', '': '.' };
  const OPEN = /^[([{⟨〈⌊⌈|‖∥]$/;
  const CLOSE = /^[)\]}⟩〉⌋⌉|‖∥]$/;

  function charLatex(s) {
    let out = '';
    for (const ch of s) {
      if (SETS[ch]) { out += `\\mathbb{${SETS[ch]}}`; continue; }
      const c = CHAR_CMD[ch];
      if (c === undefined) {
        out += { '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', $: '\\$', _: '\\_', '\\': '\\backslash ' }[ch] || plain(ch);
      } else if (c === '' || /^[-*'~]+$/.test(c) || c.startsWith('\\')) {
        out += c;
      } else {
        out += '\\' + c + ' ';
      }
    }
    return out;
  }
  // Lettres mathématiques Unicode (𝑥, 𝐀…) : la lettre simple.
  function plain(ch) {
    const c = ch.codePointAt(0);
    if (c >= 0x1d400 && c <= 0x1d6a3) {
      const k = (c - 0x1d400) % 52;
      return String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26);
    }
    if (c === 0x210e) return 'h';
    return ch;
  }
  const brace = (s) => (s.length === 1 || /^\\[A-Za-z]+ ?$/.test(s) ? s.trim() : `{${s.trim()}}`);
  const kidsOf = (el) => [...el.children];

  function fromMathML(el) {
    if (!el) return '';
    // Code d'origine joint (Wikipédia, KaTeX, MathJax) : repris tel quel.
    const ann = el.querySelector && [...el.querySelectorAll('annotation')].find((a) => /tex/i.test(a.getAttribute('encoding') || ''));
    if (ann && ann.textContent.trim()) return cleanTex(ann.textContent);
    const alt = el.getAttribute && el.getAttribute('alttext');
    if (alt && /\\[A-Za-z]|[\^_{]/.test(alt)) return cleanTex(alt);
    return conv(el).replace(/\s+/g, ' ').replace(/ ([}^_)\]])/g, '$1').replace(/\u0001/g, ' ').trim();
  }
  // {\displaystyle …} de Wikipédia : son contenu.
  function cleanTex(s) {
    let t = s.trim();
    const m = /^\{\\(displaystyle|textstyle)\s*([\s\S]*)\}$/.exec(t);
    if (m) t = m[2].trim();
    return t.replace(/^\\displaystyle\s*/, '');
  }

  function convRow(list) {
    let out = '';
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      // Parenthèses posées comme <mo> séparés : \left … \right autour de ce qu'elles entourent.
      if (c.localName === 'mo' && OPEN.test(c.textContent.trim()) && c.getAttribute('fence') !== 'false' && c.getAttribute('stretchy') !== 'false') {
        let depth = 0;
        let j = k;
        for (; j < list.length; j++) {
          const t = list[j].localName === 'mo' ? list[j].textContent.trim() : '';
          if (j > k && CLOSE.test(t) && depth === 1) break;
          if (OPEN.test(t) && !(j > k && CLOSE.test(t))) depth++;
          else if (CLOSE.test(t)) depth--;
        }
        if (j < list.length && list.length > 2 && (j - k > 1)) {
          const open = c.textContent.trim();
          const close = list[j].textContent.trim();
          const inside = list.slice(k + 1, j);
          if (inside.length === 1 && inside[0].localName === 'mfrac' && parseFloat(inside[0].getAttribute('linethickness')) === 0 && open === '(' && close === ')') {
            out += conv(inside[0]);
            k = j;
            continue;
          }
          const inner = convRow(inside);
          if (/^\\begin\{matrix\}/.test(inner.trim()) && ({ '(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix', '‖': 'Vmatrix', '{': 'Bmatrix' })[open] && open === (close === ')' ? '(' : close === ']' ? '[' : close === '}' ? '{' : close)) {
            const env = { '(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix', '‖': 'Vmatrix', '{': 'Bmatrix' }[open];
            out += inner.trim().replace(/^\\begin\{matrix\}/, `\\begin{${env}}`).replace(/\\end\{matrix\}$/, `\\end{${env}}`) + ' ';
          } else {
            out += `\\left${FENCE_CMD[open] || open}${inner}\\right${FENCE_CMD[close] || close} `;
          }
          k = j;
          continue;
        }
        // Accolade ouvrante seule devant un tableau : système.
        if (c.textContent.trim() === '{' && list[k + 1] && list[k + 1].localName === 'mtable' && k + 2 >= list.length) {
          out += table(list[k + 1], 'cases');
          k++;
          continue;
        }
      }
      out += conv(c);
    }
    return out;
  }

  function table(el, env) {
    const rows = kidsOf(el).filter((r) => r.localName === 'mtr' || r.localName === 'mlabeledtr').map((r) => {
      const cells = kidsOf(r).filter((c) => c.localName === 'mtd');
      return (r.localName === 'mlabeledtr' ? cells.slice(1) : cells).map((c) => convRow(kidsOf(c)).trim()).join(' & ');
    });
    return `\\begin{${env}}${rows.join(' \\\\ ')}\\end{${env}}`;
  }

  function conv(el) {
    if (!el) return '';
    if (el.nodeType === 3) return charLatex(el.data.trim());
    const k = kidsOf(el);
    const variant = el.getAttribute && el.getAttribute('mathvariant');
    switch (el.localName) {
      case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'semantics': case 'mtd': case 'mlabeledtr': case 'mjx-assistive-mml':
        if (el.localName === 'semantics') return conv(k[0]);
        return convRow(k);
      case 'annotation': case 'annotation-xml': case 'mprescripts': case 'none': return '';
      case 'mphantom': return '';
      case 'mi': {
        const t = el.textContent.trim();
        if (!t) return '';
        if (SETS[t]) return `\\mathbb{${SETS[t]}}`;
        if (t.length > 1 && /^[A-Za-z]+$/.test(t)) {
          return STD_FUNCS.has(t) ? `\\${t} ` : `\\operatorname{${t}}`;
        }
        if (variant === 'normal' && /^[A-Za-z]$/.test(t)) return `\\mathrm{${t}}`;
        if (variant === 'bold' || variant === 'bold-italic') return `\\mathbf{${charLatex(t)}}`;
        if (variant === 'double-struck') return `\\mathbb{${t}}`;
        if (variant === 'script') return `\\mathcal{${t}}`;
        if (variant === 'fraktur') return `\\mathfrak{${t}}`;
        return charLatex(t);
      }
      case 'mn': return el.textContent.trim().replace(/,/g, '{,}');
      case 'mo': {
        const t = el.textContent.trim();
        if (/^[A-Za-z]{2,}$/.test(t)) return STD_FUNCS.has(t) ? `\\${t} ` : `\\operatorname{${t}}`;
        return charLatex(t);
      }
      case 'mtext': { const t = el.textContent.replace(/[{}\\]/g, ''); return t.trim() ? `\\text{${t.replace(/\s/g, '\u0001')}}` : '\\ '; }
      case 'ms': return `\\text{"${el.textContent}"}`;
      case 'mspace': { const w = parseFloat(el.getAttribute('width') || '0'); return w >= 1 ? '\\quad ' : w > 0.2 ? '\\ ' : w > 0 ? '\\, ' : ''; }
      case 'mfrac': {
        const lt = el.getAttribute('linethickness');
        if (lt !== null && parseFloat(lt) === 0) return `\\binom{${conv(k[0])}}{${conv(k[1])}}`;
        return `\\frac{${conv(k[0])}}{${conv(k[1])}}`;
      }
      case 'msqrt': return `\\sqrt{${convRow(k)}}`;
      case 'mroot': return `\\sqrt[${conv(k[1])}]{${conv(k[0])}}`;
      case 'msup': {
        const sup = k[1] ? k[1].textContent.trim() : '';
        if (/^[′″‴']+$/.test(sup)) return conv(k[0]) + sup.replace(/″/g, "''").replace(/‴/g, "'''").replace(/′/g, "'");
        return `${brace(conv(k[0]))}^${brace(conv(k[1]))}`;
      }
      case 'msub': return `${brace(conv(k[0]))}_${brace(conv(k[1]))}`;
      case 'msubsup': return `${brace(conv(k[0]))}_${brace(conv(k[1]))}^${brace(conv(k[2]))}`;
      case 'munder': case 'mover': case 'munderover': {
        const base = conv(k[0]);
        const baseChar = k[0] && k[0].textContent.trim();
        const big = k[0] && ((k[0].localName === 'mo' && /^[∑∏∐∫∬∭∮⋃⋂⋁⋀⨁⨂]$/.test(baseChar)) || /^(lim|max|min|sup|inf|liminf|limsup|lim inf|lim sup)$/.test(baseChar));
        const inner = k[0] && /^m(under|over)$/.test(k[0].localName) && k[0].children[1] ? k[0].children[1].textContent.trim() : '';
        if (/^[⏟⏞]$/.test(inner) && el.localName !== 'munderover') return `${base}${el.localName === 'munder' ? '_' : '^'}{${conv(k[1])}}`;
        if (k[0] && k[0].localName === 'mo' && /^[→←↔⇒⇐↦]$/.test(baseChar) && el.localName !== 'munderover') {
          const cmd = { '→': 'xrightarrow', '←': 'xleftarrow', '↔': 'xleftrightarrow', '⇒': 'xRightarrow', '⇐': 'xLeftarrow', '↦': 'xmapsto' }[baseChar];
          return el.localName === 'mover' ? `\\${cmd}{${conv(k[1])}}` : `\\${cmd}[${conv(k[1])}]{}`;
        }
        if (el.localName === 'munderover') return big ? `${base}_${brace(conv(k[1]))}^${brace(conv(k[2]))}` : `\\overset{${conv(k[2])}}{\\underset{${conv(k[1])}}{${base}}}`;
        const mark = k[1] && k[1].textContent.trim();
        if (big) return el.localName === 'munder' ? `${base}_${brace(conv(k[1]))}` : `${base}^${brace(conv(k[1]))}`;
        if (k[1] && k[1].localName === 'mo' && ACC_CMD[mark]) {
          let cmd = ACC_CMD[mark];
          if (el.localName === 'munder' && cmd === 'overline') cmd = 'underline';
          if (el.localName === 'mover' && cmd === 'underline') cmd = 'overline';
          if (cmd === 'vec' && (k[0].textContent.trim().length > 1)) cmd = 'overrightarrow';
          if (cmd === 'hat' && (k[0].textContent.trim().length > 1)) cmd = 'widehat';
          return `\\${cmd}{${base}}`;
        }
        return el.localName === 'munder' ? `\\underset{${conv(k[1])}}{${base}}` : `\\overset{${conv(k[1])}}{${base}}`;
      }
      case 'mtable': return table(el, /^(right left ?)+$/.test((el.getAttribute('columnalign') || '').trim() + ' ') || /^\s*(right left\s*)+$/.test(el.getAttribute('columnalign') || '') ? 'aligned' : 'matrix');
      case 'mtr': return k.map((c) => conv(c)).join(' & ');
      case 'menclose': {
        const n = el.getAttribute('notation') || '';
        if (/strike/.test(n)) return `\\cancel{${convRow(k)}}`;
        return `\\boxed{${convRow(k)}}`;
      }
      case 'mfenced': {
        const open = el.getAttribute('open') ?? '(';
        const close = el.getAttribute('close') ?? ')';
        const sep = el.getAttribute('separators') ?? ',';
        return `\\left${FENCE_CMD[open] || open}${k.map(conv).join(sep.trim()[0] || ',')}\\right${FENCE_CMD[close] || close}`;
      }
      case 'mmultiscripts': return `${brace(conv(k[0]))}_${brace(conv(k[1]))}^${brace(conv(k[2]))}`;
      default: return convRow(k) || charLatex(el.textContent || '');
    }
  }

  // ----- Vérification -----

  // Problèmes d'un code LaTeX : accolades mal fermées, commandes inconnues (d'après MathLive).
  function check(latex) {
    const out = [];
    let depth = 0;
    for (let i = 0; i < latex.length; i++) {
      if (latex[i] === '\\') { i++; continue; }
      if (latex[i] === '{') depth++;
      if (latex[i] === '}' && --depth < 0) break;
    }
    if (depth > 0) out.push('accolade « { » sans « } »');
    if (depth < 0) out.push('accolade « } » en trop');
    const lefts = (latex.match(/\\left(?![a-z])/g) || []).length;
    const rights = (latex.match(/\\right(?![a-z])/g) || []).length;
    if (lefts !== rights) out.push(lefts > rights ? '\\left sans \\right' : '\\right sans \\left');
    const begins = (latex.match(/\\begin\{/g) || []).length;
    const endsN = (latex.match(/\\end\{/g) || []).length;
    if (begins !== endsN) out.push('\\begin et \\end en nombre différent');
    try {
      const ML = window.MathLive;
      if (ML && ML.validateLatex) {
        for (const err of ML.validateLatex(latex)) {
          if (err.code === 'unknown-command' || err.code === 'unknown-environment') out.push(`commande inconnue : ${err.arg}`);
          else if (err.code === 'missing-argument') out.push(`argument manquant${err.arg ? ' : ' + err.arg : ''}`);
        }
      }
    } catch { /* vérification de MathLive indisponible */ }
    return [...new Set(out)];
  }

  window.FTLatex = { parse, toMathML, toOmml, fromMathML, check, cleanTex };
})();
