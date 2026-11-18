// Nombres ordinaux : « 19ème », « 19e », « 1er », « 2nde », « XIXe », « François Ier » deviennent 19ᵉ, 1ᵉʳ,
// 2ᵈᵉ, XIXᵉ, Iᵉʳ (lettres en exposant) dès que le mot est fini (espace, ponctuation, Entrée). En anglais :
// 1st, 2nd, 3rd, 19th. Clic droit sur un ordinal : chiffres romains ou arabes, sans exposant, réglages.
// L'exposant est un <sup class="ft-ord"> (gardé dans l'export Word et le PDF).
(function () {
  let editor = document.getElementById('editor');
  // Moteur 2.0 : la frappe passe par moteur/ecriture.js ; le clic droit agit sur le texte affiché, relu
  // d'un coup par le moteur (useEngine).
  let S = () => window.FTStructure;

  let options = { auto: true, roman: false };
  let onSave = () => {};

  // ----- Chiffres romains -----

  const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  const VALID_ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  function toRoman(n) {
    let out = '';
    for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
    return out;
  }
  function fromRoman(s) {
    if (!s || !VALID_ROMAN.test(s)) return null;
    const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const v = val[s[i]];
      n += i + 1 < s.length && val[s[i + 1]] > v ? -v : v;
    }
    return n;
  }

  // ----- Reconnaître un ordinal à la fin du texte tapé -----

  const FR = /(^|[^\p{L}\p{N},.])(\d{1,4}|[IVXLCDM]{1,8})(i[eè]mes?|[eè]mes?|è|es?|ers?|[eè]res?|res?|ndes?|nds?|des?|ds?)$/u;
  const EN = /(^|[^\p{L}\p{N},.])(\d{1,4})(st|nd|rd|th|ST|ND|RD|TH)$/u;
  const enSuffix = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  // { start, end, number (texte du nombre à écrire), sup } pour le texte avant le curseur, ou null.
  function parse(text, lang) {
    const en = EN.exec(text);
    if (en && (lang === 'en' || !/^nd$/i.test(en[3]))) {
      const n = Number(en[2]);
      if (n > 0 && enSuffix(n) === en[3].toLowerCase()) {
        return { start: en.index + en[1].length, end: text.length, number: en[2], sup: en[3].toLowerCase() };
      }
    }
    if (lang === 'en') return null;
    const m = FR.exec(text);
    if (!m) return null;
    const num = m[2];
    const suf = m[3].toLowerCase();
    const plural = /s$/.test(suf) && suf !== 's' ? 's' : '';
    const base = plural ? suf.slice(0, -1) : suf;
    const roman = /^[IVXLCDM]+$/.test(num);
    let value;
    if (roman) {
      value = fromRoman(num);
      if (!value) return null;
      const long = /^(i?[eè]me)$/.test(base);
      // Une seule lettre romaine : seulement « Ier », « Ire » ou « Vème » (pas « Le », « De », « Ce »…).
      if (num.length === 1 && !(long || (num === 'I' && /^(er|[eè]re|re)$/.test(base)))) return null;
      if (/^n?de?$/.test(base)) return null;
    } else {
      value = Number(num);
      if (!value || /^0/.test(num)) return null;
    }
    let sup;
    if (/^(i?[eè]me|è|e)$/.test(base)) sup = value === 1 ? 'er' : 'e';
    else if (base === 'er') sup = 'er';
    else if (/^([eè]re|re)$/.test(base)) sup = 're';
    else if (/^(nd|d)$/.test(base)) sup = 'd';
    else if (/^(nde|de)$/.test(base)) sup = 'de';
    else return null;
    if ((sup === 'er' || sup === 're') && value !== 1) return null;
    if ((sup === 'd' || sup === 'de') && value !== 2) return null;
    let number = num;
    if (!roman && options.roman && sup !== 'd' && sup !== 'de') number = toRoman(value);
    return { start: m.index + m[1].length, end: text.length, number, sup: sup + plural };
  }

  const langAt = (node) => (window.FTLang ? window.FTLang.fixedLang(node) || window.FTLang.principal() : 'fr');

  // Fin d'un mot : espace, ponctuation.
  const BOUNDARY = /^[\s\u00a0\u202f.,;:!?)\]}»”'’…\-–—/]$/;

  // Pose l'exposant si le texte avant (t, offset) finit par un ordinal. typed : la touche tapée, écrite juste après.
  function convertAt(t, offset, typed, moveCaret) {
    if (!t || t.nodeType !== Node.TEXT_NODE || !editor.contains(t)) return false;
    const el = t.parentElement;
    if (!el || el.closest('sup, sub, .ft-math, code, pre, a, .ft-toc, .ft-lof, .ft-index, [contenteditable="false"]')) return false;
    const head = t.data.slice(0, offset);
    const found = parse(head, langAt(t));
    if (!found) return false;
    S().checkpoint();
    const rest = t.data.slice(offset);
    t.data = head.slice(0, found.start) + found.number;
    const sup = document.createElement('sup');
    sup.className = 'ft-ord';
    sup.textContent = found.sup;
    // Une espace tapée en fin de ligne serait avalée : espace insécable, redevenue ordinaire dès qu'un mot suit.
    let data = typed || '';
    if (data === ' ' && (!rest || /^\s/.test(rest))) data = '\u00a0';
    const after = document.createTextNode(data + rest);
    t.after(sup, after);
    if (!after.length) after.remove();
    if (moveCaret) {
      const r = document.createRange();
      r.setStart(after, data.length);
      r.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return true;
  }

  let enterAt = null; // Entrée : l'ordinal est posé une fois la ligne coupée (sinon la ligne suivante hériterait de l'exposant)
  editor.addEventListener('beforeinput', (e) => {
    if (!options.auto || e.isComposing || e.defaultPrevented) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    if (e.inputType === 'insertText' && e.data && BOUNDARY.test(e.data)) {
      if (!convertAt(sel.anchorNode, sel.anchorOffset, e.data, true)) return;
      e.preventDefault();
      editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data }));
    } else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      enterAt = sel.anchorNode.nodeType === Node.TEXT_NODE ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
    }
  });
  editor.addEventListener('input', (e) => {
    if (!enterAt || (e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak')) return;
    const { node, offset } = enterAt;
    enterAt = null;
    if (node.isConnected && offset <= node.length && convertAt(node, offset, '', false)) S().changed();
  });

  // L'espace insécable mise après un ordinal en fin de ligne redevient ordinaire quand un mot suit.
  editor.addEventListener('input', (e) => {
    if (e.inputType !== 'insertText') return;
    const sel = window.getSelection();
    const t = sel.anchorNode;
    if (!t || t.nodeType !== Node.TEXT_NODE || !/^\u00a0\S/.test(t.data)) return;
    const prev = t.previousSibling;
    if (!prev || prev.nodeName !== 'SUP' || !prev.classList.contains('ft-ord')) return;
    const offset = sel.anchorOffset;
    t.replaceData(0, 1, ' ');
    const r = document.createRange();
    r.setStart(t, offset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  });

  // ----- Clic droit -----

  // Le nombre juste avant l'exposant : { node, start, text }.
  function numberOf(sup) {
    const t = sup.previousSibling;
    if (!t || t.nodeType !== Node.TEXT_NODE) return null;
    const m = /(\d{1,4}|[IVXLCDM]{1,12})$/.exec(t.data);
    return m ? { node: t, start: m.index, text: m[1] } : null;
  }

  // L'ordinal cliqué : l'exposant lui-même ou le nombre qui le précède.
  function ordAt(target, x, y) {
    const sup = target.closest && target.closest('sup.ft-ord');
    if (sup) return sup;
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!pos || pos.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const t = pos.startContainer;
    const next = t.nextSibling;
    if (!next || next.nodeName !== 'SUP' || !next.classList.contains('ft-ord')) return null;
    const n = numberOf(next);
    return n && pos.startOffset >= n.start ? next : null;
  }

  function setNumber(sup, roman) {
    const n = numberOf(sup);
    if (!n) return;
    const value = roman ? Number(n.text) : fromRoman(n.text);
    if (!value || value > 3999) return;
    S().checkpoint();
    n.node.replaceData(n.start, n.text.length, roman ? toRoman(value) : String(value));
    S().changed();
  }

  function plain(sup) {
    S().checkpoint();
    const t = document.createTextNode(sup.textContent);
    sup.replaceWith(t);
    t.parentNode.normalize();
    S().changed();
  }

  function setOption(key, on) {
    options = { ...options, [key]: on };
    onSave({ ...options });
  }

  const check = (on, text) => (on ? '✓ ' : '\u2003') + text;

  function menuItems(target, x, y) {
    const sup = target && ordAt(target, x, y);
    if (!sup) return [];
    const n = numberOf(sup);
    const isRoman = !!n && /^[IVXLCDM]+$/.test(n.text);
    const value = n ? (isRoman ? fromRoman(n.text) : Number(n.text)) : null;
    const items = [];
    if (value && !/^d/.test(sup.textContent)) {
      if (isRoman) items.push({ text: `Chiffres arabes (${value}${sup.textContent})`, action: () => setNumber(sup, false) });
      else if (value <= 3999) items.push({ text: `Chiffres romains (${toRoman(value)}${sup.textContent})`, action: () => setNumber(sup, true) });
    }
    items.push({ text: 'Sans exposant', action: () => plain(sup) });
    items.push({
      text: 'Ordinaux',
      submenu: () => [
        { text: check(options.auto, 'Exposant automatique (19ᵉ)'), action: () => setOption('auto', !options.auto) },
        { text: check(options.roman, 'Chiffres romains par défaut (XIXᵉ)'), action: () => setOption('roman', !options.roman) }
      ]
    });
    return items;
  }

  window.FTOrdinals = {
    init(saved, save) {
      if (saved && typeof saved === 'object') options = { auto: saved.auto !== false, roman: !!saved.roman };
      onSave = save || (() => {});
    },
    menuItems,
    parse,
    useEngine(mount, bridge) {
      editor = mount;
      S = () => bridge;
    },
    toRoman,
    fromRoman,
    options: () => ({ ...options })
  };
})();
