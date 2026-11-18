// Coupure des mots en fin de ligne (césure) : algorithme de Liang (celui de TeX) sur les motifs de
// vendor/cesure (français, anglais, allemand, espagnol, italien, portugais). Sert à la composition des
// exports imprimés (composition.js) : les points de coupure deviennent des traits d'union conditionnels
// (U+00AD), que la mise en ligne peut prendre. Règles de l'édition : pas de coupure dans un mot trop court,
// un nom propre ou un sigle (majuscule), un mot avec chiffres, une adresse ; un mot composé ne se coupe
// qu'à son trait d'union ; au moins 2 lettres avant la coupure et 3 après en français.
(function () {
  const SHY = '­';
  const engines = new Map(); // code -> { pats, max, left, right, exceptions, words }

  function engine(code) {
    if (engines.has(code)) return engines.get(code);
    const m = window.FTMotifsCesure && window.FTMotifsCesure[code];
    let e = null;
    if (m) {
      const pats = new Map();
      let max = 0;
      for (const p of m.patterns.split(' ')) {
        if (!p) continue;
        const letters = p.replace(/\d/g, '');
        const vals = new Array(letters.length + 1).fill(0);
        let i = 0;
        for (const ch of p) {
          if (ch >= '0' && ch <= '9') vals[i] = Number(ch);
          else i++;
        }
        pats.set(letters, vals);
        if (letters.length > max) max = letters.length;
      }
      const exceptions = new Map();
      for (const x of m.exceptions.split(' ')) {
        if (!x) continue;
        const cuts = [];
        let n = 0;
        for (const ch of x) {
          if (ch === '-') cuts.push(n);
          else n++;
        }
        exceptions.set(x.replace(/-/g, ''), cuts);
      }
      e = { pats, max, left: m.left, right: m.right, exceptions, words: new Map() };
    }
    engines.set(code, e);
    return e;
  }

  // Code des motifs pour une langue (attribut lang : fr-FR, en-GB…).
  const codeOf = (lang) => String(lang || 'fr').slice(0, 2).toLowerCase();

  // Points de coupure d'un mot (en minuscules) : positions p (coupure entre w[p-1] et w[p]).
  function points(word, code) {
    const e = engine(code);
    if (!e) return [];
    const hit = e.words.get(word);
    if (hit) return hit;
    let out;
    const n = word.length;
    if (e.exceptions.has(word)) out = e.exceptions.get(word).filter((p) => p >= e.left && p <= n - e.right);
    else if (n < e.left + e.right) out = [];
    else {
      // (L'apostrophe courbe des textes est l'apostrophe droite des motifs.)
      const s = '.' + word.replace(/’/g, "'") + '.';
      const v = new Array(s.length + 1).fill(0);
      for (let i = 0; i < s.length; i++) {
        const lim = Math.min(s.length, i + e.max);
        for (let j = i + 1; j <= lim; j++) {
          const pat = e.pats.get(s.slice(i, j));
          if (!pat) continue;
          for (let k = 0; k < pat.length; k++) if (pat[k] > v[i + k]) v[i + k] = pat[k];
        }
      }
      out = [];
      for (let p = e.left; p <= n - e.right; p++) if (v[p + 1] % 2) out.push(p);
      // Jamais contre une apostrophe (l’en-semble, au-jourd’hui).
      out = out.filter((p) => !/['’]/.test(word[p - 1] + word[p] + (word[p + 1] || '')));
    }
    if (e.words.size > 50000) e.words.clear();
    e.words.set(word, out);
    return out;
  }

  // Mots à couper dans un texte : suites de lettres (avec apostrophes) ; les autres caractères ne sont
  // jamais touchés. Renvoie les positions où placer un trait d'union conditionnel.
  const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
  const LETTER = /[\p{L}\p{M}\p{N}]/u;
  function cuts(text, code) {
    const e = engine(code);
    if (!e) return [];
    const out = [];
    for (const m of text.matchAll(WORD)) {
      const w = m[0];
      if (w.length < e.left + e.right) continue;
      const a = m.index;
      const b = a + w.length;
      const before = text[a - 1] || ' ';
      const after = text[b] || ' ';
      // Mot composé, mot accolé à des chiffres, adresse ou chemin : pas de coupure.
      if (/[-‐\d@/\\_]/.test(before) || /[-‐\d@/\\_]/.test(after)) continue;
      if ((before === '.' || before === ':') && LETTER.test(text[a - 2] || '')) continue;
      if ((after === '.' || after === ':') && LETTER.test(text[b + 1] || '')) continue;
      // Nom propre, sigle : pas de coupure (en allemand, seulement les sigles : les noms ont une majuscule).
      const lower = w.toLowerCase();
      if (code === 'de' ? w.length > 1 && w.slice(1) !== lower.slice(1) : w !== lower) continue;
      if (w.includes(SHY)) continue;
      if (lower.length !== w.length) continue;
      for (const p of points(lower, code)) out.push(a + p);
    }
    return out;
  }

  // Texte avec ses traits d'union conditionnels.
  function hyphenate(text, lang) {
    const at = cuts(text, codeOf(lang));
    if (!at.length) return text;
    let s = '';
    let last = 0;
    for (const p of at) {
      s += text.slice(last, p) + SHY;
      last = p;
    }
    return s + text.slice(last);
  }

  window.FTCesure = { SHY, codeOf, has: (lang) => !!engine(codeOf(lang)), points, cuts, hyphenate };
})();
