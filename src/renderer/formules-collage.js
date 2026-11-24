// Équations venues d'ailleurs, reconnues au collage (paste.js, editor.js) et dans la zone d'écriture :
// - Word : équations du presse-papiers (OMML dans les commentaires « msEquation » du HTML) ;
// - pages web : MathML (Wikipédia, MathJax 3), KaTeX et MathJax 2 (code TeX joint), images d'équation
//   dont le texte de remplacement est du LaTeX ;
// - texte : code LaTeX entre $…$, $$…$$, \(…\), \[…\] ou dans \begin{equation}…\end{equation}.
// Chaque équation reconnue devient une équation du logiciel (formules.js), modifiable.
(function () {
  const F = () => window.FTFormules;
  const L = () => window.FTLatex;
  const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

  // ----- Code LaTeX dans du texte -----

  // Environnements « équation sur sa ligne » : leur contenu (align → aligned, pour MathLive).
  const ENV = /\\begin\{(equation\*?|displaymath|align\*?|gather\*?|multline\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/y;
  function envLatex(name, body) {
    const b = body.replace(/\\(label|tag)\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '').trim();
    if (/^align|^eqnarray/.test(name)) return `\\begin{aligned}${b}\\end{aligned}`;
    if (/^gather|^multline/.test(name)) return `\\begin{gathered}${b}\\end{gathered}`;
    return b;
  }
  // Ce qui ressemble à du LaTeX (et pas à des montants : « 5 $ et 10 $ »).
  const looksMath = (s) => !!s.trim() && !/^[\d\s.,]+$/.test(s) && s.length <= 4000;

  // Remplace chaque passage LaTeX de text par make(latex, bloc) ; le reste est rendu tel quel.
  function replaceLatex(text, make) {
    if (!/[$\\]/.test(text)) return text;
    let out = '';
    let i = 0;
    let last = 0;
    const emit = (end, latex, block) => {
      out += text.slice(last, i) + make(latex, block);
      i = end;
      last = end;
    };
    while (i < text.length) {
      const c = text[i];
      if (c === '\\' && text[i + 1] === '$') { i += 2; continue; }
      if (c === '$' && text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2);
        if (end > i + 2 && looksMath(text.slice(i + 2, end))) { emit(end + 2, text.slice(i + 2, end).trim(), true); continue; }
        i += 2;
        continue;
      }
      if (c === '$') {
        // Règle de Pandoc : pas d'espace juste après le $ ouvrant ni juste avant le $ fermant, pas de chiffre après.
        if (/\S/.test(text[i + 1] || '') && text[i - 1] !== '\\') {
          let j = i + 1;
          let found = -1;
          while (j < text.length) {
            const d = text[j];
            if (d === '\\') { j += 2; continue; }
            if (d === '\n' && text[j + 1] === '\n') break;
            if (d === '$') {
              if (/\S/.test(text[j - 1]) && !/[0-9]/.test(text[j + 1] || '')) found = j;
              break;
            }
            j++;
          }
          if (found > 0 && looksMath(text.slice(i + 1, found))) { emit(found + 1, text.slice(i + 1, found).trim(), false); continue; }
        }
        i++;
        continue;
      }
      if (c === '\\') {
        const n = text[i + 1];
        if (n === '[' || n === '(') {
          const close = n === '[' ? '\\]' : '\\)';
          const end = text.indexOf(close, i + 2);
          if (end > i + 2 && looksMath(text.slice(i + 2, end))) { emit(end + 2, text.slice(i + 2, end).trim(), n === '['); continue; }
        }
        if (text.startsWith('\\begin{', i)) {
          ENV.lastIndex = i;
          const m = ENV.exec(text);
          if (m) { emit(i + m[0].length, envLatex(m[1], m[2]), true); continue; }
        }
      }
      i++;
    }
    return last ? out + text.slice(last) : text;
  }

  // ----- HTML : équations des pages web et de Word -----

  // Équations Word du presse-papiers : <!--[if gte msEquation 12]><m:oMathPara>…<![endif]-->.
  function wordMath(comment) {
    let src = comment.data.replace(/^\[if gte msEquation \d+\]>/, '').replace(/<!\[endif\]\s*$/, '');
    // Balises HTML autour des morceaux (italique, police) : retirées ; entités HTML ramenées à des caractères.
    src = src.replace(/<\/?(?!m:)[A-Za-z][^>]*>/g, '').replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)[a-z]+;/gi, (m) => {
      const t = document.createElement('textarea');
      t.innerHTML = m;
      return t.value.replace(/&/g, '&amp;');
    });
    const doc = new DOMParser().parseFromString(`<root xmlns:m="${OMML_NS}">${src}</root>`, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    // (Le texte des morceaux est posé directement dans <m:r>, sans <m:t>.)
    for (const r of doc.getElementsByTagNameNS(OMML_NS, 'r')) {
      const loose = [...r.childNodes].filter((n) => n.nodeType === 3);
      if (!loose.length) continue;
      const t = doc.createElementNS(OMML_NS, 'm:t');
      t.textContent = loose.map((n) => n.data).join('');
      loose.forEach((n) => n.remove());
      r.append(t);
    }
    const out = [];
    const para = doc.getElementsByTagNameNS(OMML_NS, 'oMathPara').length > 0;
    for (const m of doc.getElementsByTagNameNS(OMML_NS, 'oMath')) {
      const latex = window.FTOmml ? window.FTOmml.latex(m) : m.textContent;
      if (latex) out.push({ latex, block: para });
    }
    return out;
  }

  function make(doc, latex, block) {
    const el = F().element({ latex: F().clean(latex), block });
    return doc.importNode(el, true);
  }

  // Remplace, dans un document HTML collé, chaque équation reconnue par une équation du logiciel.
  function markMath(doc) {
    if (!F()) return 0;
    let count = 0;
    const put = (old, latex, block) => {
      if (!latex || !old.parentNode) return;
      old.replaceWith(make(doc, latex, block));
      count++;
    };
    // Word.
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    for (const c of comments) {
      if (/^\[if gte msEquation/.test(c.data)) {
        const maths = wordMath(c);
        for (const m of maths) { c.parentNode.insertBefore(make(doc, m.latex, m.block), c); count++; }
        // Image de remplacement qui suit : <![if !msEquation]> … <![endif]>.
        let n = c.nextSibling;
        while (n && n.nodeType === 3 && !n.data.trim()) n = n.nextSibling;
        if (maths.length && n && n.nodeType === 8 && /^\[if !msEquation\]/.test(n.data)) {
          while (n && !(n.nodeType === 8 && /^\[endif\]/.test(n.data))) { const next = n.nextSibling; n.remove(); n = next; }
          if (n) n.remove();
        }
        c.remove();
      }
    }
    // KaTeX : code TeX joint dans .katex-mathml.
    for (const k of [...doc.querySelectorAll('.katex-display, .katex')]) {
      if (!k.isConnected || (k.classList.contains('katex') && k.parentElement && k.parentElement.classList.contains('katex-display'))) continue;
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      const math = k.querySelector('math');
      const latex = ann ? L().cleanTex(ann.textContent) : math ? L().fromMathML(math) : '';
      put(k, latex, k.classList.contains('katex-display') || (math && math.getAttribute('display') === 'block'));
    }
    // MathJax 3 (MathML d'accessibilité), MathJax 2 (code TeX dans un <script>).
    for (const c of [...doc.querySelectorAll('mjx-container')]) {
      const math = c.querySelector('math');
      put(c, math ? L().fromMathML(math) : '', c.getAttribute('display') === 'true' || c.hasAttribute('display') && c.getAttribute('display') !== 'false');
    }
    for (const s of [...doc.querySelectorAll('script[type^="math/tex"]')]) put(s, s.textContent.trim(), /mode=display/.test(s.getAttribute('type')));
    for (const m of [...doc.querySelectorAll('[class^="MathJax"], [class*=" MathJax"]')]) if (m.isConnected && !m.querySelector('.ft-math')) m.remove();
    // Wikipédia et autres pages en MathML.
    for (const w of [...doc.querySelectorAll('.mwe-math-element')]) {
      const math = w.querySelector('math');
      if (math) put(w, L().fromMathML(math), math.getAttribute('display') === 'block' || !!w.querySelector('.mwe-math-fallback-image-display'));
    }
    for (const math of [...doc.getElementsByTagName('math')]) {
      if (!math.isConnected || math.closest('.ft-math')) continue;
      put(math, L().fromMathML(math), math.getAttribute('display') === 'block');
    }
    // Images d'équation (texte de remplacement en LaTeX).
    for (const img of [...doc.querySelectorAll('img.tex, img.latex, img[src*="latex"], img[src*="codecogs"], img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display')]) {
      const alt = (img.getAttribute('alt') || '').trim();
      if (alt && /[\\^_{}=]/.test(alt)) put(img, L().cleanTex(alt.replace(/^\$+|\$+$/g, '')), img.classList.contains('mwe-math-fallback-image-display'));
    }
    return count;
  }

  const MATH_HTML = /<math\b|<mjx-container|class="[^"]*\bkatex\b|msEquation|math\/tex|mwe-math-element/i;
  const hasMath = (html) => MATH_HTML.test(html || '');

  // MathML du presse-papiers (Word, certains logiciels de calcul l'y déposent).
  function mathmlOf(cd) {
    const type = [...(cd.types || [])].find((t) => /mathml/i.test(t));
    const m = type ? cd.getData(type) : '';
    return /<math\b/i.test(m) ? m : '';
  }

  // Code LaTeX d'un collage dans la zone d'écriture d'une équation (null : collage ordinaire).
  function latexFromClipboard(cd) {
    const mml = mathmlOf(cd);
    if (mml) {
      const doc = new DOMParser().parseFromString(mml, 'text/html');
      const math = doc.querySelector('math');
      if (math) return L().fromMathML(math);
    }
    const html = cd.getData('text/html') || '';
    if (hasMath(html)) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      markMath(doc);
      const found = [...doc.querySelectorAll('.ft-math')].map((f) => f.dataset.latex).filter(Boolean);
      if (found.length) return found.join(' ');
    }
    const text = (cd.getData('text/plain') || '').trim();
    const parts = [];
    const rest = replaceLatex(text, (latex) => { parts.push(latex); return ''; });
    if (parts.length && !rest.trim()) return parts.join(' ');
    return null;
  }

  // Code LaTeX entre $…$ dans le texte d'un document (importé, collé tel quel) : équations.
  // Renvoie le HTML du texte avec ses équations, ou null s'il n'y en a pas.
  function convertText(text) {
    let n = 0;
    const out = replaceLatex(text, () => { n++; return ''; });
    return n ? out : null;
  }

  window.FTFormulesCollage = { replaceLatex, markMath, hasMath, mathmlOf, latexFromClipboard, convertText };
})();
