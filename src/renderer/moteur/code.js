// Blocs de code : un cadre en police à chasse fixe, coloré selon le langage choisi dans le menu sur le
// côté du cadre (Python, R, C++, SQL, JavaScript, HTML, ou texte brut).
// Enregistré tel quel dans le document : <pre class="ft-code" data-lang="python"><code>texte</code></pre>.
// La couleur n'est pas enregistrée : elle est refaite à l'affichage (décorations du moteur, bloc par bloc,
// seulement pour les blocs modifiés) et pour les exports (colorize, sur le HTML exporté).
// Dans un bloc de code, le texte est écrit tel qu'il est tapé : ni guillemets français, ni majuscule
// automatique, ni espace insécable, ni liste ; ni orthographe, ni grammaire.
(function () {
  const LANGS = [
    ['python', 'Python'], ['r', 'R'], ['cpp', 'C++'], ['sql', 'SQL'],
    ['javascript', 'JavaScript'], ['html', 'HTML'], ['texte', 'Texte brut']
  ];
  const NAMES = Object.fromEntries(LANGS);
  // Noms courants d'un langage (classe « language-… » d'un code collé, « ```py » tapé).
  const ALIAS = {
    python: 'python', py: 'python', python3: 'python', r: 'r', rscript: 'r', cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp',
    hpp: 'cpp', c: 'cpp', h: 'cpp', sql: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql', sqlite: 'sql', plsql: 'sql',
    javascript: 'javascript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript', typescript: 'javascript', ts: 'javascript',
    html: 'html', htm: 'html', xml: 'html', svg: 'html', xhtml: 'html', texte: 'texte', text: 'texte', txt: 'texte', plain: 'texte', plaintext: 'texte'
  };
  const langName = (s) => ALIAS[String(s || '').toLowerCase()] || null;

  // ----- Coloration -----
  // Chaque langage : une suite de règles essayées à l'endroit lu (expressions « collantes »). Une règle
  // donne la classe du morceau (« kw » : mot-clé, « ty » : type ou fonction connue, « lit » : valeur
  // (True, NULL…), « str » : chaîne, « num » : nombre, « com » : commentaire, « fn » : fonction, « dec » :
  // décorateur, « pp » : directive du préprocesseur, « tag » : balise, « at » : attribut), ou rien.

  const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
  const NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d(?:[\d_]|'(?=\d))*\.?(?:[\d_]|'(?=\d))*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[a-zA-Z]*/y;
  const nextChar = (text, i) => { const m = /\s*(.)/y; m.lastIndex = i; const r = m.exec(text); return r ? r[1] : ''; };

  // Mot (identifiant) : mot-clé, valeur, type, ou fonction (suivi d'une parenthèse, ou nommé après def,
  // function, class…).
  function ident(kw, lit, ty, opts = {}) {
    const ci = !!opts.ci;
    const names = opts.names || words('');
    const classes = opts.classes || words('');
    return (m, ctx, text, end) => {
      const w = ci ? m[0].toUpperCase() : m[0];
      if (classes.has(ctx.prev)) return 'ty';
      if (names.has(ctx.prev)) return 'fn';
      if (kw.has(w)) return 'kw';
      if (lit.has(w)) return 'lit';
      if (ty.has(w)) return 'ty';
      if (nextChar(text, end) === '(') return 'fn';
      return null;
    };
  }

  const PY_KW = words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case');
  const PY_LIT = words('True False None self cls');
  const PY_TY = words('int float str bool list dict set tuple bytes object type range len print open enumerate zip map filter sorted reversed sum min max abs round isinstance issubclass super input iter next any all repr format hash id dir vars getattr setattr hasattr callable property staticmethod classmethod Exception ValueError TypeError KeyError IndexError RuntimeError AttributeError ImportError StopIteration OSError ZeroDivisionError NotImplementedError');
  const R_KW = words('if else repeat while function for in next break return switch');
  const R_LIT = words('TRUE FALSE NULL NA NA_integer_ NA_real_ NA_character_ Inf NaN T F');
  const R_TY = words('library require c list vector matrix array data.frame factor levels print paste paste0 cat sum mean median sd var length nrow ncol dim head tail summary str apply sapply lapply vapply mapply tapply seq seq_len seq_along rep is.na which ifelse plot hist ggplot aes read.csv write.csv names colnames rownames unique sort order round sqrt exp log max min abs table subset merge rbind cbind as.numeric as.character as.integer as.factor nchar substr gsub sub grepl toupper tolower Sys.time set.seed rnorm runif sample lm glm predict');
  const CPP_KW = words('alignas alignof and asm break case catch class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if inline mutable namespace new noexcept not operator or private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while override final');
  const CPP_LIT = words('true false nullptr NULL');
  const CPP_TY = words('bool char char8_t char16_t char32_t double float int long short signed unsigned void auto wchar_t size_t ptrdiff_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t std string vector map unordered_map set unordered_set array pair tuple optional unique_ptr shared_ptr cout cin cerr endl printf scanf');
  const SQL_KW = words('PROC SQL QUIT RUN CALCULATED NOPRINT OUTOBS FEEDBACK CONNECT DISCONNECT EXECUTE EXEC DESCRIBE VALIDATE RESET LIBNAME GO USE SHOW EXPLAIN ANALYZE LATERAL PIVOT UNPIVOT QUALIFY ANY SOME NULLS LAST IDENTITY GENERATED ALWAYS STORED LOOP ELSIF ELSEIF CURSOR OPEN CLOSE DEALLOCATE PREPARE CALL SAVEPOINT RELEASE ROLLUP CUBE GROUPING SETS FILTER WITHIN MINUS SIMILAR ESCAPE MATERIALIZED SEQUENCE PRINT OUTPUT SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER ADD DROP INDEX VIEW JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING AS GROUP BY ORDER HAVING LIMIT OFFSET FETCH FIRST NEXT ROWS ONLY TOP DISTINCT UNION ALL INTERSECT EXCEPT EXISTS IN BETWEEN LIKE ILIKE IS PRIMARY KEY FOREIGN REFERENCES DEFAULT CONSTRAINT UNIQUE CHECK CASE WHEN THEN ELSE END ASC DESC WITH RECURSIVE RETURNING BEGIN COMMIT ROLLBACK TRANSACTION GRANT REVOKE DATABASE SCHEMA IF REPLACE TRUNCATE OVER PARTITION WINDOW COLUMN RENAME TO PROCEDURE FUNCTION RETURNS RETURN DECLARE TRIGGER FOR EACH ROW AFTER BEFORE INSTEAD OF CASCADE AUTO_INCREMENT AUTOINCREMENT TEMPORARY TEMP MERGE MATCHED');
  const SQL_LIT = words('TRUE FALSE NULL');
  const SQL_TY = words('VARCHAR2 NUMBER NTEXT MONEY BIT BYTEA BINARY VARBINARY EXTRACT DATE_TRUNC DATEADD DATEDIFF DATEPART GETDATE CURRENT_DATE CURRENT_TIMESTAMP IFNULL ISNULL NVL STRING_AGG GROUP_CONCAT LISTAGG LAG LEAD NTILE FIRST_VALUE LAST_VALUE PERCENTILE_CONT ABS CEIL CEILING FLOOR POWER SQRT MOD INPUT PUT INTCK INTNX MDY TODAY INT INTEGER BIGINT SMALLINT TINYINT DECIMAL NUMERIC FLOAT REAL DOUBLE PRECISION VARCHAR NVARCHAR CHAR NCHAR TEXT DATE TIME TIMESTAMP DATETIME INTERVAL BOOLEAN BOOL BLOB CLOB SERIAL UUID JSON JSONB COUNT SUM AVG MIN MAX COALESCE NULLIF CAST CONCAT SUBSTRING UPPER LOWER TRIM LENGTH ROUND NOW ROW_NUMBER RANK DENSE_RANK');
  const JS_KW = words('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set from as');
  const JS_LIT = words('true false null undefined NaN Infinity');
  const JS_TY = words('console window document Math JSON Array Object String Number Boolean Symbol BigInt Promise Map Set WeakMap WeakSet Date RegExp Error TypeError RangeError require module exports globalThis parseInt parseFloat setTimeout setInterval clearTimeout fetch');
  // Après ces signes ou mots, « / » ouvre une expression régulière (sinon : division).
  const JS_REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', '=>', '&&', '||', '??']);

  const block = (open, close) => new RegExp(open + '[\\s\\S]*?(?:' + close + '|$)', 'y');
  const C_COMMENTS = [[/\/\/.*/y, 'com'], [block('\\/\\*', '\\*\\/'), 'com']];

  const RULES = {
    python: [
      [/#.*/y, 'com'],
      [/(?:[rRbBuUfF]{1,2})?("""|''')[\s\S]*?(?:\1|$)/y, 'str'],
      [/(?:[rRbBuUfF]{1,2})?(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y, 'str'],
      [/@[A-Za-z_][\w.]*/y, 'dec'],
      [NUM, 'num'],
      [/[A-Za-z_]\w*/y, ident(PY_KW, PY_LIT, PY_TY, { names: words('def'), classes: words('class') })]
    ],
    r: [
      [/#.*/y, 'com'],
      [/[rR](["'])([-]*)[([{][\s\S]*?[)\]}]\2\1/y, 'str'],
      [/(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1?/y, 'str'],
      [/`[^`\n]*`?/y, null],
      [/%[^%\n]*%|<<-|<-|->>|->|\|>/y, 'kw'],
      [NUM, 'num'],
      [/[A-Za-z.][\w.]*/y, ident(R_KW, R_LIT, R_TY)]
    ],
    cpp: [
      ...C_COMMENTS,
      [/#\s*include\b\s*(?:<[^>\n]*>|"[^"\n]*")?/y, (m, ctx, text, end, start) => {
        const k = m[0].search(/[<"]/);
        return k < 0 ? 'pp' : [[start, start + m[0].slice(0, k).trimEnd().length, 'pp'], [start + k, end, 'str']];
      }],
      [/#\s*[A-Za-z]+/y, 'pp'],
      [/(?:u8|[uUL])?R"([^(\s"]*)\([\s\S]*?\)\1"/y, 'str'],
      [/(?:u8|[uUL])?"(?:\\.|[^"\\\n])*"?/y, 'str'],
      [/(?:u8|[uUL])?'(?:\\.|[^'\\\n])+'/y, 'str'],
      [NUM, 'num'],
      [/[A-Za-z_]\w*/y, ident(CPP_KW, CPP_LIT, CPP_TY, { classes: words('class struct enum namespace') })]
    ],
    sql: [
      [/--.*/y, 'com'],
      [block('\\/\\*', '\\*\\/'), 'com'],
      [/'(?:''|[^'])*'?/y, 'str'],
      [/"(?:""|[^"])*"?|`[^`]*`?|\[[^\]\n]*\]/y, null],
      [NUM, 'num'],
      [/[@:][A-Za-z_]\w*/y, 'lit'],
      // Macro SAS (PROC SQL) : %let, %macro… et variables &nom.
      [/%[A-Za-z_]\w*/y, 'pp'],
      [/&[A-Za-z_]\w*\.?/y, 'lit'],
      [/[A-Za-z_]\w*/y, ident(SQL_KW, SQL_LIT, SQL_TY, { ci: true })]
    ],
    javascript: [
      ...C_COMMENTS,
      [/`(?:\\[\s\S]|[^\\`])*`?/y, 'str'],
      [/(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y, 'str'],
      [/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuyv]*/y, (m, ctx) => (JS_REGEX_AFTER.has(ctx.prev) ? 'str' : false)],
      [NUM, 'num'],
      [/[A-Za-z_$][\w$]*/y, ident(JS_KW, JS_LIT, JS_TY, { names: words('function'), classes: words('class extends new') })]
    ],
    css: [
      [block('\\/\\*', '\\*\\/'), 'com'],
      [/(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y, 'str'],
      [/[{}]/y, (m, ctx) => { ctx.depth = Math.max(0, (ctx.depth || 0) + (m[0] === '{' ? 1 : -1)); return null; }],
      [/#[\da-fA-F]{3,8}\b/y, (m, ctx) => (ctx.depth ? 'num' : 'tag')],
      [/@[\w-]+/y, 'kw'],
      [/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y, 'num'],
      [/[A-Za-z_-][\w-]*/y, (m, ctx, text, end) => (!ctx.depth ? 'tag' : nextChar(text, end) === ':' ? 'at' : nextChar(text, end) === '(' ? 'fn' : null)]
    ],
    html: [
      [block('<!--', '-->'), 'com'],
      [/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/y, 'str'],
      [/<[!?][^>]*>?/y, 'pp'],
      [/<\/?[A-Za-z][\w:.-]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]+))?)*\s*\/?>?/y, htmlTag],
      [/&(?:#\d+|#x[\da-fA-F]+|[A-Za-z]\w*);/y, 'lit'],
      [/[^<&]+/y, null]
    ]
  };

  // Balise HTML : nom, attributs et valeurs ; après <script> ou <style>, leur contenu est coloré en
  // JavaScript ou en CSS jusqu'à la balise fermante.
  function htmlTag(m, ctx, text, end, start) {
    const t = m[0];
    const toks = [];
    const nameEnd = start + /^<\/?[\w:.-]*/.exec(t)[0].length;
    toks.push([start, nameEnd, 'tag']);
    const attr = /([^\s"'>/=]+)(?:(\s*=\s*)("[^"]*"?|'[^']*'?|[^\s>]+))?/g;
    attr.lastIndex = nameEnd - start;
    for (let a = attr.exec(t); a; a = attr.exec(t)) {
      const s = start + a.index;
      toks.push([s, s + a[1].length, 'at']);
      if (a[3]) { const vs = s + a[1].length + a[2].length; toks.push([vs, vs + a[3].length, 'str']); }
    }
    const close = /\/?>$/.exec(t);
    if (close) toks.push([end - close[0].length, end, 'tag']);
    const name = /^<([\w:.-]+)/.exec(t);
    const inner = name && /^(script|style)$/i.test(name[1]) && close && close[0] === '>' ? name[1].toLowerCase() : null;
    if (!inner) return toks;
    const stop = new RegExp('</' + inner + '\\s*>', 'ig');
    stop.lastIndex = end;
    const s = stop.exec(text);
    const to = s ? s.index : text.length;
    for (const [a, b, c] of lex(text, inner === 'script' ? RULES.javascript : RULES.css, end, to)) toks.push([a, b, c]);
    return { toks, end: to };
  }

  // Morceaux colorés d'un texte, de from à to : [début, fin, classe].
  function lex(text, rules, from = 0, to = text.length) {
    const out = [];
    const ctx = { prev: '', depth: 0 };
    const src = to < text.length ? text.slice(0, to) : text;
    let i = from;
    outer: while (i < to) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      for (const [re, cls] of rules) {
        re.lastIndex = i;
        const m = re.exec(src);
        if (!m || !m[0].length) continue;
        const end = i + m[0].length;
        const c = typeof cls === 'function' ? cls(m, ctx, src, end, i) : cls;
        if (c === false) continue;
        let next = end;
        if (typeof c === 'string') out.push([i, end, c]);
        else if (Array.isArray(c)) out.push(...c);
        else if (c && c.toks) { out.push(...c.toks); next = c.end; }
        ctx.prev = m[0];
        i = next;
        continue outer;
      }
      // Signe isolé (ponctuation, opérateur) : gardé pour savoir ce qui précède.
      ctx.prev = /[=&|?]/.test(ch) && /[=&|?>]/.test(src[i + 1] || '') ? ch + src[i + 1] : ch;
      i += ctx.prev.length;
    }
    return out;
  }

  const tokenCache = new Map();
  function tokens(text, lang) {
    const rules = RULES[lang];
    if (!rules || !text) return [];
    const key = lang + '\u0000' + text;
    let t = tokenCache.get(key);
    if (!t) {
      t = lex(text, rules);
      if (tokenCache.size > 400) tokenCache.clear();
      tokenCache.set(key, t);
    }
    return t;
  }

  // Texte d'un bloc de code affiché ou enregistré : le menu du langage et les intercalaires de page ne
  // sont pas du texte ; <br> et lignes en <div> (code collé d'une page web) sont des retours à la ligne.
  function textOf(el) {
    let out = '';
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) { out += c.data; continue; }
        if (c.nodeType !== Node.ELEMENT_NODE) continue;
        if (c.classList.contains('ft-code-bar') || c.classList.contains('ft-code-ln') || c.classList.contains('ft-pg-gap') || c.classList.contains('ProseMirror-trailingBreak')) continue;
        if (c.tagName === 'BR') { out += '\n'; continue; }
        const line = /^(DIV|P|LI)$/.test(c.tagName);
        if (line && out && !out.endsWith('\n')) out += '\n';
        walk(c);
        if (line && !out.endsWith('\n')) out += '\n';
      }
    })(el);
    return out;
  }

  // Langage d'un <pre> : le sien (data-lang), ou celui d'une classe « language-… » (code collé).
  function langOfEl(pre) {
    const own = langName(pre.getAttribute('data-lang'));
    if (own) return own;
    for (const el of [pre, pre.querySelector('code')]) {
      if (!el) continue;
      for (const c of el.classList) {
        const m = /^(?:language|lang|highlight-source)-(.+)$/.exec(c);
        if (m && langName(m[1])) return langName(m[1]);
      }
    }
    return 'texte';
  }

  // Texte coloré (et numéros de ligne) d'un bloc, pour un export ou un aperçu.
  function rendered(text, lang, num) {
    const frag = document.createDocumentFragment();
    let line = 1;
    const number = () => {
      const n = document.createElement('span');
      n.className = 'ft-code-ln';
      n.textContent = String(line++);
      frag.append(n);
    };
    const put = (str, cls) => {
      str.split('\n').forEach((part, k) => {
        if (k) { frag.append('\n'); if (num) number(); }
        if (!part) return;
        if (!cls) { frag.append(part); return; }
        const sp = document.createElement('span');
        sp.className = 'tk-' + cls;
        sp.textContent = part;
        frag.append(sp);
      });
    };
    if (num) number();
    let at = 0;
    for (const [a, b, c] of tokens(text, lang)) {
      if (a < at) continue;
      if (a > at) put(text.slice(at, a));
      put(text.slice(a, b), c);
      at = b;
    }
    if (at < text.length) put(text.slice(at));
    return frag;
  }

  // Exports (PDF, livre, EPUB) : les blocs de code d'un HTML reçoivent leurs couleurs (classes tk-…)
  // et leurs numéros de ligne.
  function colorize(root) {
    for (const pre of root.querySelectorAll('pre.ft-code')) {
      const code = pre.querySelector(':scope > code') || pre;
      const frag = rendered(textOf(code), langOfEl(pre), pre.hasAttribute('data-num'));
      code.textContent = '';
      code.append(frag);
    }
    return root;
  }

  // ----- Styles des blocs (Styles du document, onglet « Blocs de code ») -----
  // Un style : { palette, frame, font, size, num, line }, posé sur chaque <pre> (data-palette,
  // data-frame, data-num, data-line ; police et taille en variables --code-font, --code-size). Les
  // valeurs par défaut (palette « clair », cadre) ne sont pas écrites.

  const PALETTES = [['clair', 'Clair'], ['sombre', 'Sombre'], ['monokai', 'Monokai'], ['nord', 'Nord'], ['solarise', 'Solarisé'],
    ['sepia', 'Sépia'], ['contraste', 'Contrasté'], ['nb', 'Noir et blanc']];
  const FRAMES = [['cadre', 'Cadre'], ['trait', 'Trait à gauche'], ['fond', 'Fond seul'], ['aucun', 'Sans cadre']];
  const FONTS = ['JetBrains Mono', 'Consolas', 'Cascadia Mono', 'Courier New', 'Lucida Console'];
  const SIZES = [0, 8, 9, 10, 11, 12, 14];
  const LINE_SPACES = [['serre', 'Serré'], ['', 'Normal'], ['aere', 'Aéré']];
  const has = (list, v) => list.some((x) => (Array.isArray(x) ? x[0] : x) === v);

  function cleanStyle(v) {
    v = v && typeof v === 'object' ? v : {};
    return {
      palette: has(PALETTES, v.palette) ? v.palette : 'clair',
      frame: has(FRAMES, v.frame) ? v.frame : 'cadre',
      font: has(FONTS, v.font) && v.font !== 'JetBrains Mono' ? v.font : '',
      size: SIZES.includes(Number(v.size)) ? Number(v.size) : 0,
      num: !!v.num,
      line: has(LINE_SPACES, v.line) ? v.line : ''
    };
  }
  const sameStyle = (a, b) => JSON.stringify(cleanStyle(a)) === JSON.stringify(cleanStyle(b));

  const PRESETS = [
    ['clair', 'Clair', {}],
    ['numerote', 'Clair numéroté', { num: true }],
    ['sombre', 'Sombre', { palette: 'sombre', frame: 'fond' }],
    ['monokai', 'Monokai', { palette: 'monokai', frame: 'fond' }],
    ['nord', 'Nord', { palette: 'nord', frame: 'fond', num: true }],
    ['solarise', 'Solarisé', { palette: 'solarise', frame: 'fond' }],
    ['sepia', 'Sépia', { palette: 'sepia', frame: 'trait' }],
    ['contraste', 'Contrasté', { palette: 'contraste' }],
    ['nb', 'Impression noir et blanc', { palette: 'nb', frame: 'trait', num: true }]
  ].map(([id, name, v]) => ({ id, name, value: cleanStyle(v) }));

  // Style → attributs du <pre> (ceux du style seulement).
  function styleAttrs(v) {
    v = cleanStyle(v);
    const a = {};
    if (v.palette !== 'clair') a['data-palette'] = v.palette;
    if (v.frame !== 'cadre') a['data-frame'] = v.frame;
    if (v.num) a['data-num'] = '';
    if (v.line) a['data-line'] = v.line;
    return a;
  }
  const STYLE_ATTRS = ['data-palette', 'data-frame', 'data-num', 'data-line'];
  const styleBox = document.createElement('span');
  // Texte de l'attribut style avec la police et la taille du style (le reste est gardé, sauf le
  // découpage de l'affichage : clip-path).
  function styleText(style, v) {
    styleBox.setAttribute('style', style || '');
    styleBox.style.removeProperty('clip-path');
    if (v) {
      if (v.font) styleBox.style.setProperty('--code-font', `"${v.font}"`); else styleBox.style.removeProperty('--code-font');
      if (v.size) styleBox.style.setProperty('--code-size', v.size + 'pt'); else styleBox.style.removeProperty('--code-size');
    }
    return styleBox.getAttribute('style') || '';
  }
  // Attributs d'un <pre> lu dans le document (sans le découpage de l'affichage).
  function cleanAttrs(a) {
    if (!a.style) return a;
    const out = { ...a };
    const st = styleText(a.style);
    if (st) out.style = st; else delete out.style;
    return out;
  }
  // Attributs complets d'un nouveau bloc.
  function attrsFor(lang, v) {
    const a = { class: 'ft-code', 'data-lang': lang, ...styleAttrs(v) };
    const st = styleText('', cleanStyle(v));
    if (st) a.style = st;
    return a;
  }

  function styleOf(pre) {
    const css = (k) => (pre.style.getPropertyValue(k) || '').trim().replace(/^["']|["']$/g, '');
    return cleanStyle({
      palette: pre.getAttribute('data-palette') || 'clair',
      frame: pre.getAttribute('data-frame') || 'cadre',
      font: css('--code-font'),
      size: parseFloat(css('--code-size')) || 0,
      num: pre.hasAttribute('data-num'),
      line: pre.getAttribute('data-line') || ''
    });
  }
  function stylePre(pre, v) {
    v = cleanStyle(v);
    const a = styleAttrs(v);
    for (const k of STYLE_ATTRS) {
      if (k in a) { if (pre.getAttribute(k) !== a[k]) pre.setAttribute(k, a[k]); } else if (pre.hasAttribute(k)) pre.removeAttribute(k);
    }
    const st = styleText(pre.getAttribute('style'), v);
    if (st) pre.setAttribute('style', st); else pre.removeAttribute('style');
  }

  let newStyle = cleanStyle(null);
  const SAMPLE = 'def carre(x):\n    # Carré\n    return x ** 2';
  // Aperçu d'un style (galeries de la fenêtre).
  function sample(v, text = SAMPLE, lang = 'python') {
    const pre = document.createElement('pre');
    for (const [k, val] of Object.entries(attrsFor(lang, v))) pre.setAttribute(k, val);
    const code = document.createElement('code');
    code.append(rendered(text, lang, cleanStyle(v).num));
    pre.append(code);
    const box = document.createElement('div');
    box.className = 'ds-sample ds-code';
    box.append(pre);
    return box;
  }

  // ----- Saisie du code (réglage du logiciel, pour tous les documents) -----

  const SAISIE_STORE = 'ft-code-saisie';
  const WIDTHS = [[2, '2 espaces'], [4, '4 espaces'], [8, '8 espaces'], [0, 'Tabulation']];
  const SAISIE_DEFAULT = {
    keep: true, open: true, close: true, pairs: false, back: true, exit: true,
    widths: { python: 4, r: 2, cpp: 4, sql: 4, javascript: 2, html: 2, texte: 4 }
  };
  function cleanSaisie(o) {
    o = o && typeof o === 'object' ? o : {};
    const out = {};
    for (const k of ['keep', 'open', 'close', 'pairs', 'back', 'exit']) out[k] = typeof o[k] === 'boolean' ? o[k] : SAISIE_DEFAULT[k];
    out.widths = {};
    for (const [id] of LANGS) {
      const w = o.widths ? Number(o.widths[id]) : NaN;
      out.widths[id] = WIDTHS.some(([x]) => x === w) ? w : SAISIE_DEFAULT.widths[id];
    }
    return out;
  }
  let saisie = cleanSaisie(null);
  try { saisie = cleanSaisie(JSON.parse(localStorage.getItem(SAISIE_STORE) || 'null')); } catch { /* réglage indisponible */ }
  function setSaisie(change) {
    change(saisie);
    saisie = cleanSaisie(saisie);
    try { localStorage.setItem(SAISIE_STORE, JSON.stringify(saisie)); } catch { /* réglage indisponible */ }
  }
  // Un cran de retrait dans un langage : des espaces, ou une tabulation.
  const unitFor = (lang) => (saisie.widths[lang] === 0 ? '\t' : ' '.repeat(saisie.widths[lang] || 4));

  // Réglages de la fenêtre « Styles du document » (h : ses petits outils de mise en page).
  function styleControls(v, changed, h) {
    const thumbs = (list, key) => h.el('div', { className: 'ds-gallery ds-gallery-small ds-code-gallery' }, list.map(([id, name]) => {
      const b = h.el('button', { type: 'button', title: name, className: v[key] === id ? 'on' : '' }, [sample({ ...v, [key]: id, num: false }, 'x = 1  # ' + name.toLowerCase()), h.el('span', { textContent: name })]);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { v[key] = id; changed(true); });
      return b;
    }));
    const set = (k, f = (x) => x) => (x) => { v[k] = f(x); changed(true); };
    return [
      h.section('Couleurs'), thumbs(PALETTES, 'palette'),
      h.section('Cadre'), thumbs(FRAMES, 'frame'),
      h.section('Texte'),
      h.el('div', { className: 'ds-row' }, [
        h.field('Police', h.selectOf(FONTS.map((f) => [f === 'JetBrains Mono' ? '' : f, f]), v.font, set('font'))),
        h.field('Taille', h.selectOf(SIZES.map((z) => [String(z), z ? z + ' pt' : 'Automatique']), String(v.size), set('size', Number))),
        h.field('Interligne', h.selectOf(LINE_SPACES, v.line, set('line')))
      ]),
      h.checkbox('Numéros de ligne', v.num, set('num'))
    ];
  }
  function saisieControls(h) {
    const box = h.el('div', { className: 'ds-code-saisie' });
    const draw = () => {
      const chk = (k, label) => h.checkbox(label, saisie[k], (x) => { setSaisie((o) => { o[k] = x; }); });
      box.replaceChildren(
        h.section('Saisie du code (tous les documents)'),
        h.el('p', { className: 'ds-help', textContent: 'Retrait inséré par Tab et à chaque retour à la ligne, selon le langage.' }),
        h.el('div', { className: 'ds-row ds-code-widths' }, LANGS.map(([id, name]) => h.field(name, h.selectOf(WIDTHS.map(([w, l]) => [String(w), l]), String(saisie.widths[id]), (x) => setSaisie((o) => { o.widths[id] = Number(x); }))))),
        chk('keep', 'Garder le retrait de la ligne précédente'),
        chk('open', 'Ajouter un retrait après « : », « { », « ( », « [ » ou une balise ouvrante'),
        chk('close', 'Retirer un retrait en tapant « } », « ) » ou « ] » en début de ligne'),
        chk('pairs', 'Fermer automatiquement parenthèses, crochets, accolades et guillemets'),
        chk('back', 'Retour arrière dans le retrait : effacer un cran entier'),
        chk('exit', 'Deux Entrée sur une ligne vide en fin de bloc : sortir du bloc'),
        (() => {
          const b = h.el('button', { type: 'button', className: 'ds-code-reset', textContent: 'Rétablir les réglages par défaut' });
          b.addEventListener('click', () => { setSaisie((o) => Object.assign(o, JSON.parse(JSON.stringify(SAISIE_DEFAULT)))); draw(); });
          return b;
        })()
      );
    };
    draw();
    return box;
  }

  const api = {
    LANGS, NAMES, langName, langOfEl, textOf, tokens, colorize,
    presets: () => PRESETS.map((p) => ({ ...p, value: { ...p.value } })),
    cleanStyle, sameStyle, styleOf, stylePre, cleanAttrs, sample, styleControls, saisieControls,
    setDefault(v) { newStyle = cleanStyle(v); },
    saisie: () => JSON.parse(JSON.stringify(saisie)),
    setSaisie
  };
  window.FTCode = api;
  // Style des nouveaux blocs : celui du thème du document déjà affiché (theme.js est chargé avant).
  try { if (window.FTTheme && window.FTTheme.part) newStyle = cleanStyle(window.FTTheme.part('code')); } catch { /* pas encore de thème */ }

  // ----- Dans le moteur -----

  const M = window.FTMoteur;
  if (!M) return;
  const view = M.view;
  const { schema } = M;
  const { Plugin, PluginKey, TextSelection } = PM.state;
  const { Decoration, DecorationSet } = PM.view;
  const N = schema.nodes;
  const CODE = N.code_block;
  const STORE = 'ft-code-lang';

  const langOf = (node) => langName(node.attrs.a['data-lang']) || 'texte';
  let lastLang = 'python';
  try { lastLang = langName(localStorage.getItem(STORE)) || 'python'; } catch { /* réglage indisponible */ }
  function remember(lang) {
    lastLang = lang;
    try { localStorage.setItem(STORE, lang); } catch { /* réglage indisponible */ }
  }
  const codeAttrs = (lang) => attrsFor(lang, newStyle);
  const inCode = (state) => state.selection.$from.parent.type === CODE && state.selection.$to.parent === state.selection.$from.parent;
  const dispatch = (tr) => { view.dispatch(tr.scrollIntoView()); if (!view.hasFocus()) view.focus(); };

  // ----- Couleurs à l'écran : refaites seulement dans les blocs modifiés -----

  const key = new PluginKey('ft-code');
  const decoCache = new WeakMap();
  // Numéro de ligne : posé au début de la ligne, dans la marge gauche du cadre (styles.css).
  const lineNumber = (n) => () => {
    const el = document.createElement('span');
    el.className = 'ft-code-ln';
    el.contentEditable = 'false';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String(n);
    return el;
  };
  function decosFor(node, pos) {
    let c = decoCache.get(node);
    if (!c) {
      const text = node.textContent;
      const lines = [];
      if ('data-num' in node.attrs.a) for (let i = 0; i !== -1; i = text.indexOf('\n', i) + 1 || -1) lines.push(i);
      c = { toks: tokens(text, langOf(node)).map(([a, b, k]) => [a, b, 'tk-' + k]), lines };
      decoCache.set(node, c);
    }
    const out = c.toks.map(([a, b, k]) => Decoration.inline(pos + 1 + a, pos + 1 + b, { class: k }));
    c.lines.forEach((at, i) => out.push(Decoration.widget(pos + 1 + at, lineNumber(i + 1), { side: -1, ignoreSelection: true, key: 'ln' + (i + 1) })));
    return out;
  }
  function buildAll(doc) {
    const decos = [];
    doc.descendants((node, pos) => {
      if (node.type === CODE) { decos.push(...decosFor(node, pos)); return false; }
      return !node.isTextblock && !node.isAtom;
    });
    return DecorationSet.create(doc, decos);
  }

  // ----- Le cadre et son menu du langage -----

  const S = () => window.FTSidebar;
  function langItems(getPos) {
    const pos = getPos();
    const node = pos === undefined || pos === null ? null : view.state.doc.nodeAt(pos);
    const cur = node && node.type === CODE ? langOf(node) : null;
    return LANGS.map(([id, name]) => ({ text: name, strong: id === cur, action: () => setLang(getPos(), id) }));
  }
  // Fenêtre « Styles du document », onglet des blocs de code, pour ce bloc.
  function openStyle(pos) {
    const dom = pos === null || pos === undefined ? null : view.nodeDOM(pos);
    if (window.FTStyles) window.FTStyles.open('code', dom && dom.nodeType === 1 ? dom : undefined);
  }

  function setLang(pos, lang) {
    const node = pos === null || pos === undefined ? null : view.state.doc.nodeAt(pos);
    if (!node || node.type !== CODE) return;
    remember(lang);
    if (langOf(node) === lang) return;
    dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, a: { ...node.attrs.a, 'data-lang': lang } }));
  }

  function codeView(node, v, getPos) {
    let cur = node;
    const dom = document.createElement('pre');
    for (const [k, val] of Object.entries(node.attrs.a)) dom.setAttribute(k, val);
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'ft-code-bar';
    bar.contentEditable = 'false';
    bar.tabIndex = -1;
    bar.title = 'Langage du code';
    bar.textContent = NAMES[langOf(node)];
    const code = document.createElement('code');
    dom.append(bar, code);
    bar.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    bar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!v.editable) return;
      const r = bar.getBoundingClientRect();
      S().showMenu(r.left, r.bottom + 2, [...langItems(getPos), '-', { text: 'Style du bloc…', action: () => openStyle(getPos()) }]);
    });
    // Mode avancé : un bloc coupé entre deux pages laisse voir l'intervalle entre les feuilles (sans le
    // découpage, son fond et son cadre le recouvriraient). Refait quand la hauteur du bloc change.
    const clip = () => {
      const gaps = code.querySelectorAll('.ft-pg-gap');
      const k = dom.offsetHeight ? dom.getBoundingClientRect().height / dom.offsetHeight : 1;
      let path = '';
      if (gaps.length && k) {
        const top = dom.getBoundingClientRect().top;
        const pts = ['0 0', '100% 0'];
        for (const g of gaps) {
          const r = g.getBoundingClientRect();
          if (r.height < 2) continue;
          const a = ((r.top - top) / k).toFixed(1);
          const b = ((r.bottom - top) / k).toFixed(1);
          pts.push(`100% ${a}px`, `0 ${a}px`, `0 ${b}px`, `100% ${b}px`);
        }
        if (pts.length > 2) path = `polygon(${[...pts, '100% 100%', '0 100%'].join(', ')})`;
      }
      if (dom.style.clipPath !== path) dom.style.clipPath = path;
    };
    const watch = new ResizeObserver(clip);
    watch.observe(dom);
    return {
      dom,
      contentDOM: code,
      destroy: () => watch.disconnect(),
      update(nw) {
        if (nw.type !== cur.type) return false;
        const was = cur.attrs.a;
        const now = nw.attrs.a;
        for (const k of Object.keys(was)) if (!(k in now)) dom.removeAttribute(k);
        for (const [k, val] of Object.entries(now)) if (was[k] !== val) dom.setAttribute(k, val);
        if (was.style !== now.style) clip();
        const name = NAMES[langOf(nw)];
        if (bar.textContent !== name) bar.textContent = name;
        cur = nw;
        return true;
      },
      stopEvent: (e) => bar.contains(e.target),
      ignoreMutation: (m) => m.type !== 'selection' && (bar.contains(m.target) || (m.type === 'attributes' && m.target === dom && m.attributeName === 'style'))
    };
  }

  // ----- Créer, retirer -----

  // Parents où un bloc de code peut remplacer des lignes : texte du document, zone en colonnes, encadré, case.
  const flowParent = (n) => n.type === N.doc || n.type === N.container || n.type === N.blockquote || n.type === N.table_cell || n.type === N.table_header;
  const leafText = (n) => (n.type === N.hard_break ? '\n' : '');

  // Les lignes du curseur ou de la sélection deviennent un bloc de code (une ligne de code par ligne de
  // texte) ; dans un bloc de code : il redevient du texte ordinaire (une ligne par ligne de code).
  function toggle(lang) {
    const state = view.state;
    const { $from, $to } = state.selection;
    if ($from.parent.type === CODE) return unwrap($from.before());
    const range = $from.blockRange($to, flowParent);
    if (!range) return;
    const lines = [];
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const child = range.parent.child(i);
      if (child.isTextblock) lines.push(child.textBetween(0, child.content.size, '\n', leafText));
      else child.descendants((n) => { if (n.isTextblock) { lines.push(n.textBetween(0, n.content.size, '\n', leafText)); return false; } return true; });
    }
    const text = lines.join('\n');
    const node = CODE.create({ a: codeAttrs(lang || lastLang) }, text ? schema.text(text) : null);
    const tr = state.tr.replaceWith(range.start, range.end, node);
    tr.setSelection(TextSelection.create(tr.doc, range.start + 1 + node.content.size));
    dispatch(tr);
  }

  function paragraphs(text) {
    return text.split('\n').map((l) => N.paragraph.create({ tag: 'p', a: {}, bare: false }, l ? schema.text(l) : null));
  }

  function unwrap(pos) {
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type !== CODE) return;
    const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, paragraphs(node.textContent));
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    dispatch(tr);
  }

  // « Insérer > Bloc de code » : un bloc vide à l'endroit du curseur (sur une ligne vide : à sa place).
  function insert(lang) {
    const state = view.state;
    if (state.selection.$from.parent.type === CODE) return;
    const tb = state.selection.$from.parent;
    if (state.selection.empty && tb.isTextblock && !tb.content.size && flowParent(state.selection.$from.node(-1))) return toggle(lang);
    const tr = state.tr;
    const node = CODE.create({ a: codeAttrs(lang || lastLang) });
    const pos = window.FTBlocs.placeBlock(tr, node);
    const after = tr.doc.resolve(pos + tr.doc.nodeAt(pos).nodeSize).nodeAfter;
    if (!after || !after.isTextblock || after.type === CODE) tr.insert(pos + tr.doc.nodeAt(pos).nodeSize, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    dispatch(tr);
  }

  function remove(pos) {
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type !== CODE) return;
    const tr = view.state.tr.delete(pos, pos + node.nodeSize);
    if (!tr.doc.childCount) tr.insert(0, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
    dispatch(tr);
  }

  function copyAll(pos) {
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type !== CODE) return;
    const text = node.textContent;
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      view.focus();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  // ----- Écriture dans un bloc de code -----

  const lineStart = (text, at) => text.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = (text, at) => { const i = text.indexOf('\n', at); return i < 0 ? text.length : i; };
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
  // La ligne ouvre un bloc : « : » en Python (et « case … : » en C++, JavaScript), accolade, parenthèse ou crochet ouvrants, balise HTML
  // ouvrante (sans sa fermante sur la même ligne).
  function opens(line, lang) {
    const t = line.replace(/\s+$/, '');
    if (lang === 'python' && /:$/.test(t.replace(/\s*#.*$/, ''))) return true;
    // « case 1: », « public: » en C++ et JavaScript.
    if ((lang === 'cpp' || lang === 'javascript') && /:$/.test(t.replace(/\s*\/\/.*$/, '')) && !/::$/.test(t)) return true;
    if (lang === 'html') {
      const m = /<([A-Za-z][\w:-]*)[^<>]*>$/.exec(t);
      return !!m && !/\/>$/.test(t) && !VOID.test(m[1]) && !new RegExp('</' + m[1] + '\\s*>', 'i').test(t.slice(m.index));
    }
    return /[{[(]$/.test(t);
  }
  // Retire un cran de retrait (une tabulation, ou jusqu'à la largeur d'un cran en espaces).
  function dedentLen(indent, unit) {
    if (indent.endsWith('\t')) return 1;
    const w = unit === '\t' ? 4 : unit.length;
    const spaces = /( *)$/.exec(indent)[1].length;
    return spaces ? (spaces % w || w) : 0;
  }

  function enter(v) {
    const { $from, $to } = v.state.selection;
    const node = $from.parent;
    const lang = langOf(node);
    const text = node.textContent;
    const at = $from.parentOffset;
    const start = $from.start();
    // Deux lignes vides à la fin du bloc : on en sort (une ligne de texte ordinaire après le bloc).
    const ls = lineStart(text, at);
    const line = text.slice(ls, at);
    if (saisie.exit && at === text.length && $to.pos === $from.pos && !line.trim() && ls > 0) {
      const prevStart = lineStart(text, ls - 1);
      if (!text.slice(prevStart, ls - 1).trim()) {
        const cut = prevStart > 0 ? prevStart - 1 : 0;
        const tr = v.state.tr.delete(start + cut, start + text.length);
        const after = tr.mapping.map($from.after());
        tr.insert(after, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        v.dispatch(tr.scrollIntoView());
        return true;
      }
    }
    // Nouvelle ligne au même retrait ; un cran de plus après une ligne qui ouvre un bloc.
    const base = saisie.keep ? /^[ \t]*/.exec(line)[0] : '';
    const unit = unitFor(lang);
    const open = saisie.open && opens(line, lang);
    const indent = open ? base + unit : base;
    // « {|} », « (|) », « <p>|</p> » : la fermante passe sur sa propre ligne, au retrait de départ.
    const rest = text.slice($to.parentOffset, lineEnd(text, $to.parentOffset));
    const closer = open && (/^\s*[}\])]/.test(rest) || (lang === 'html' && /^\s*<\//.test(rest)));
    const insert = '\n' + indent + (closer ? '\n' + base : '');
    const tr = v.state.tr.insertText(insert, $from.pos, $to.pos);
    if (closer) tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1 + indent.length));
    v.dispatch(tr.scrollIntoView());
    return true;
  }

  // Tabulation : un cran de retrait (selon le langage) ; Maj+Tab le retire. Sur plusieurs lignes : toutes.
  function tab(v, back) {
    const { $from, $to } = v.state.selection;
    const unit = unitFor(langOf($from.parent));
    const text = $from.parent.textContent;
    const start = $from.start();
    const a = $from.parentOffset;
    const b = $to.parentOffset;
    if (!back && a === b) {
      v.dispatch(v.state.tr.insertText(unit, $from.pos).scrollIntoView());
      return true;
    }
    const tr = v.state.tr;
    const starts = [];
    for (let s = lineStart(text, a); s <= b; s = text.indexOf('\n', s) + 1) {
      starts.push(s);
      if (text.indexOf('\n', s) < 0) break;
    }
    const w = unit === '\t' ? 4 : unit.length;
    for (const s of starts.reverse()) {
      if (back) {
        const m = new RegExp('^(\\t| {1,' + w + '})').exec(text.slice(s));
        if (m) tr.delete(start + s, start + s + m[0].length);
      } else tr.insertText(unit, start + s);
    }
    v.dispatch(tr.scrollIntoView());
    return true;
  }

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  // Lettre tapée dans un bloc de code : telle quelle, avec les aides de saisie choisies.
  function typeInCode(v, from, to, text) {
    const state = v.state;
    const $from = state.doc.resolve(from);
    const node = $from.parent;
    const all = node.textContent;
    const off = $from.parentOffset;
    const next = all.charAt(state.doc.resolve(to).parentOffset);
    const prev = all.charAt(off - 1);
    const before = all.slice(lineStart(all, off), off);
    if (from === to && saisie.pairs && /^[)\]}"'`]$/.test(text) && next === text) {
      v.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
      return true;
    }
    // « } » tapé au début d'une ligne en retrait : un cran de moins.
    if (from === to && saisie.close && /^[}\])]$/.test(text) && before && !before.trim()) {
      const n = dedentLen(before, unitFor(langOf(node)));
      if (n) {
        const tr = state.tr.insertText(text, from - n, from);
        v.dispatch(tr.scrollIntoView());
        return true;
      }
    }
    if (saisie.pairs && PAIRS[text]) {
      const quote = /^["'`]$/.test(text);
      const okAfter = !next || /[\s)\]};,.:]/.test(next);
      const okBefore = !quote || !/[\w"'`]/.test(prev);
      if (from !== to || (okAfter && okBefore)) {
        const inner = state.doc.textBetween(from, to);
        const tr = state.tr.insertText(text + inner + PAIRS[text], from, to);
        tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + inner.length));
        v.dispatch(tr.scrollIntoView());
        return true;
      }
    }
    v.dispatch(state.tr.insertText(text, from, to).scrollIntoView());
    return true;
  }

  // Retour arrière dans un bloc de code : la paire vide « () » d'un coup, un cran de retrait entier.
  function backInCode(v) {
    const state = v.state;
    const { $from } = state.selection;
    if (!state.selection.empty || !$from.parentOffset) return false;
    const all = $from.parent.textContent;
    const off = $from.parentOffset;
    const prev = all.charAt(off - 1);
    if (saisie.pairs && PAIRS[prev] && all.charAt(off) === PAIRS[prev]) {
      v.dispatch(state.tr.delete($from.pos - 1, $from.pos + 1).scrollIntoView());
      return true;
    }
    const before = all.slice(lineStart(all, off), off);
    if (saisie.back && before && !before.trim() && !before.endsWith('\t')) {
      const n = dedentLen(before, unitFor(langOf($from.parent)));
      if (n > 1) {
        v.dispatch(state.tr.delete($from.pos - n, $from.pos).scrollIntoView());
        return true;
      }
    }
    return false;
  }

  function keyDown(v, e) {
    const state = v.state;
    if (!inCode(state)) return outsideKey(v, e);
    const { $from } = state.selection;
    const node = $from.parent;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !e.altKey) {
      // Ctrl+Entrée : sortir du bloc (une ligne de texte après lui).
      if (mod) {
        const after = $from.after();
        const tr = state.tr.insert(after, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        v.dispatch(tr.scrollIntoView());
        return true;
      }
      return enter(v);
    }
    if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); return tab(v, e.shiftKey); }
    if (e.code === 'NumpadMultiply' && !mod && !e.altKey) {
      v.dispatch(state.tr.insertText('*', state.selection.from, state.selection.to).scrollIntoView());
      return true;
    }
    // Ctrl+A : d'abord tout le code du bloc.
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
      const s = $from.start();
      const end = $from.end();
      if (state.selection.from === s && state.selection.to === end) return false;
      v.dispatch(state.tr.setSelection(TextSelection.create(state.doc, s, end)));
      return true;
    }
    if (e.key === 'Backspace' && !mod && !e.altKey && backInCode(v)) return true;
    if (e.key === 'Backspace' && state.selection.empty && $from.parentOffset === 0) {
      // Bloc vide : il redevient une ligne de texte. Sinon, rien ne passe dans la ligne d'avant.
      if (!node.content.size) {
        const pos = $from.before();
        const tr = state.tr.replaceWith(pos, pos + node.nodeSize, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        v.dispatch(tr);
        return true;
      }
      const before = state.doc.resolve($from.before()).nodeBefore;
      if (before && before.isTextblock && !before.content.size) {
        const pos = $from.before() - before.nodeSize;
        v.dispatch(state.tr.delete(pos, pos + before.nodeSize));
      }
      return true;
    }
    if (e.key === 'Delete' && state.selection.empty && $from.parentOffset === node.content.size) {
      const after = state.doc.resolve($from.after()).nodeAfter;
      if (after && after.isTextblock && !after.content.size) v.dispatch(state.tr.delete($from.after(), $from.after() + after.nodeSize));
      return true;
    }
    // Flèche bas sur la dernière ligne d'un bloc en fin de document (ou haut sur la première ligne d'un
    // bloc en tête) : une ligne de texte est ajoutée pour pouvoir continuer à écrire.
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !mod && !e.shiftKey && !e.altKey && state.selection.empty) {
      const down = e.key === 'ArrowDown';
      const text = node.textContent;
      const lastLine = text.indexOf('\n', $from.parentOffset) < 0;
      const firstLine = text.lastIndexOf('\n', $from.parentOffset - 1) < 0;
      if (down ? !lastLine : !firstLine) return false;
      const $edge = state.doc.resolve(down ? $from.after() : $from.before());
      if (down ? $edge.nodeAfter : $edge.nodeBefore) return false;
      if (!v.endOfTextblock(down ? 'down' : 'up')) return false;
      const tr = state.tr.insert($edge.pos, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
      tr.setSelection(TextSelection.create(tr.doc, $edge.pos + 1));
      v.dispatch(tr.scrollIntoView());
      return true;
    }
    return false;
  }

  // Hors d'un bloc : « ``` » (ou « ```python ») puis Entrée en début de ligne crée un bloc de code ;
  // Suppr. à la fin d'une ligne suivie d'un bloc de code ne fait pas entrer le code dans la ligne.
  function outsideKey(v, e) {
    const state = v.state;
    const { $from } = state.selection;
    if (!state.selection.empty || !$from.parent.isTextblock) return false;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return fence(v, $from);
    if (e.key === 'Delete' && $from.parentOffset === $from.parent.content.size) {
      const after = $from.depth ? state.doc.resolve($from.after()).nodeAfter : null;
      if (after && after.type === CODE) {
        if (!$from.parent.content.size) v.dispatch(state.tr.delete($from.before(), $from.after()));
        return true;
      }
    }
    return false;
  }

  function fence(v, $from) {
    const tb = $from.parent;
    if (tb.type !== N.paragraph || !flowParent($from.node(-1))) return false;
    const text = tb.textContent;
    if ($from.parentOffset !== text.length) return false;
    const m = /^```\s*([\w+#.-]*)$/.exec(text);
    if (!m) return false;
    const lang = m[1] ? langName(m[1]) : null;
    if (m[1] && !lang) return false;
    const pos = $from.before();
    const node = CODE.create({ a: codeAttrs(lang || lastLang) });
    if (lang) remember(lang);
    const tr = v.state.tr.replaceWith(pos, pos + tb.nodeSize, node);
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    v.dispatch(tr.scrollIntoView());
    return true;
  }

  function textInput(v, from, to, text) {
    const state = v.state;
    if (inCode(state)) return typeInCode(v, from, to, text);
    if (text === ' ' && from === to) {
      const $from = state.doc.resolve(from);
      if ($from.parent.isTextblock && fence(v, $from)) return true;
    }
    return false;
  }

  // ----- Clic droit dans un bloc de code -----

  function contextMenu(v, e) {
    const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const pre = target && target.closest('pre.ft-code');
    if (!pre || !v.dom.contains(pre)) return false;
    let pos = null;
    try { pos = v.posAtDOM(pre.querySelector(':scope > code'), 0) - 1; } catch { /* bloc refait */ }
    const node = pos === null || pos < 0 ? null : v.state.doc.nodeAt(pos);
    if (!node || node.type !== CODE) return false;
    e.preventDefault();
    // Clic hors de la sélection : le curseur va où l'on a cliqué.
    const at = v.posAtCoords({ left: e.clientX, top: e.clientY });
    const sel = v.state.selection;
    if (at && (at.pos < sel.from || at.pos > sel.to) && at.pos > pos && at.pos < pos + node.nodeSize) {
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, at.pos)));
    }
    const get = () => pos;
    S().showMenu(e.clientX, e.clientY, [
      { text: 'Style…', action: () => openStyle(pos) },
      { text: 'Langage', submenu: () => langItems(get) },
      '-',
      { text: 'Copier tout le code', action: () => copyAll(pos) },
      { text: 'Retirer le cadre (garder le texte)', action: () => unwrap(pos) },
      { text: 'Supprimer le bloc de code', danger: true, action: () => remove(pos) }
    ]);
    return true;
  }

  M.addPlugin(new Plugin({
    key,
    state: {
      init: (_, st) => buildAll(st.doc),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        set = set.map(tr.mapping, tr.doc);
        const seen = new Set();
        const size = tr.doc.content.size;
        tr.mapping.maps.forEach((map, i) => {
          const rest = tr.mapping.slice(i + 1);
          map.forEach((s, e, ns, ne) => {
            const from = Math.max(0, Math.min(size, rest.map(ns, -1)));
            const to = Math.max(from, Math.min(size, rest.map(ne, 1)));
            tr.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type === CODE) {
                if (!seen.has(pos)) {
                  seen.add(pos);
                  set = set.remove(set.find(pos, pos + node.nodeSize)).add(tr.doc, decosFor(node, pos));
                }
                return false;
              }
              return !node.isTextblock && !node.isAtom;
            });
          });
        });
        return set;
      }
    },
    props: {
      decorations: (st) => key.getState(st),
      nodeViews: { code_block: codeView },
      handleTextInput: textInput,
      handleKeyDown: keyDown,
      handleDOMEvents: { contextmenu: contextMenu }
    }
  }), true);

  // Barre d'insertion : bouton « Code ».
  M.take('#code-btn', () => toggle());

  Object.assign(api, {
    toggle,
    insert,
    unwrap,
    setLang,
    lastLang: () => lastLang,
    // Bloc de code du curseur : { pos, lang } ou null.
    current() {
      const { $from } = view.state.selection;
      return $from.parent.type === CODE ? { pos: $from.before(), lang: langOf($from.parent) } : null;
    }
  });
})();
