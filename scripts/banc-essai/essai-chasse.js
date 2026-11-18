// Chasse aux défauts d'écriture : un robot tape à la place de l'utilisateur (Entrée, Retour arrière,
// Suppr, lettres, Tab, Annuler…) à des endroits tirés au hasard dans des documents variés (titres,
// listes, encadrés, citations, tableaux, blocs de code, styles de paragraphe), en mode note et en mode
// avancé, et vérifie après chaque touche des règles que tout traitement de texte doit tenir :
// - le document reste valide et s'enregistre / se rouvre à l'identique ;
// - une touche ne change que ce qu'elle doit : une lettre tapée s'écrit à sa place, Retour arrière et
//   Suppr ôtent un seul caractère (ou réunissent deux lignes sans perdre ni ajouter de texte), Entrée
//   coupe la ligne sans rien ajouter ; aucune espace ni ligne vide n'apparaît d'elle-même ;
// - le curseur est là où il doit être après la touche ;
// - deux lignes réunies gardent le style de la première (titre, alignement, style de paragraphe) ;
// - Entrée puis Retour arrière, une lettre puis Retour arrière : le document revient tel quel ;
// - Annuler jusqu'au bout rend le document de départ, Rétablir rend le document final ;
// - le texte affiché est celui du document (pas de décalage entre l'écran et le texte enregistré) ;
// - mode avancé : les pages après la frappe sont celles d'un document rouvert (rien ne bouge seul), et
//   aucune ligne ne sort de la zone de texte d'une page.
// Chaque défaut trouvé est écrit avec de quoi le rejouer (graine, document, position, touches).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-chasse.js
// Réglages : CHASSE_N=<nombre de suites de touches> (100), CHASSE_GRAINE=<nombre> (1),
// CHASSE_TOUCHES=<touches par suite> (6), CHASSE_RAPPORT=<fichier .json> (défauts trouvés),
// CHASSE_REJOUER=<fichier .json> (rejoue un signalement fait depuis le logiciel).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ----- Documents de départ -----

const DOCS = {
  titres: '<h1 class="ft-title">Le jardin</h1><h2>Première partie</h2><p>Un texte <b>gras</b> et <i>penché</i> ici.</p>'
    + '<h3>Sous-partie</h3><p>Deuxième paragraphe du texte.</p><p></p><h2>Seconde partie</h2><p>Fin.</p>',
  styles: '<p style="text-align: center">Ligne centrée du texte.</p><p>Ligne normale.</p><p style="text-align: right">À droite.</p>'
    + '<p class="ft-legend" data-kind="tableau" data-cap="Tableau 1">Légende du tableau</p><p>Après la légende.</p>',
  listes: '<p>Avant la liste.</p><ul><li>Pomme</li><li>Poire<ul><li>Williams</li><li>Conférence</li></ul></li><li>Prune</li></ul>'
    + '<p>Entre deux.</p><ol><li>Un</li><li>Deux</li><li>Trois</li></ol><ul class="ft-check"><li>Arroser</li><li data-checked="oui">Semer</li></ul><p>Après.</p>',
  encadres: '<p>Avant l\'encadré.</p><blockquote class="ft-callout" data-look="fond" data-color="vert"><p>Dans l\'encadré.</p><p>Seconde ligne.</p></blockquote>'
    + '<p>Entre.</p><blockquote class="ft-callout ft-quote"><p>Une citation.</p><p class="ft-quote-src">Auteur</p></blockquote><p>Après.</p>',
  tableaux: '<p>Avant le tableau.</p><table class="ft-table"><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table>'
    + '<p>Après le tableau.</p><hr class="ft-rule"><p>Après la ligne.</p>',
  code: '<p>Avant le code.</p><pre class="ft-code" data-lang="python"><code>def f(x):\n    return x</code></pre><p>Après le code.</p>',
  // Assez long pour plusieurs pages en mode avancé : la frappe près des coupures de page.
  pages: Array.from({ length: 14 }, (_, i) => `<h2>Partie ${i + 1}</h2><p>${'Un paragraphe assez long pour occuper plusieurs lignes de la page, avec des mots ordinaires. '.repeat(3)}</p>`
    + `<p>Une ligne plus courte.</p>${i % 3 === 0 ? '<ul><li>Point un</li><li>Point deux</li></ul>' : ''}`).join(''),
  colonnes: '<p>Avant la zone.</p><div class="ft-cols" data-cols="2"><p>Premier paragraphe de la zone en colonnes.</p><p>Second paragraphe.</p></div><p>Après la zone.</p>',
  melange: '<h2>Titre</h2><p>Texte <b>gras</b>.</p><ul><li>Point</li></ul><blockquote class="ft-callout" data-look="trait" data-color="bleu"><p>Note.</p></blockquote>'
    + '<h3>Autre</h3><ol><li>Un</li></ol><p style="text-align: center">Centré.</p>'
};

// Générateur de nombres pseudo-aléatoires reproductible (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- Outils posés dans la page -----

function install() {
  const M = window.FTMoteur;
  const S = window.FTSchema;
  const tbList = (doc) => {
    const out = [];
    doc.descendants((n, pos) => {
      if (n.isTextblock) {
        const $p = doc.resolve(pos + 1);
        const path = [];
        for (let d = 1; d < $p.depth; d++) path.push($p.node(d).type.name);
        out.push({ pos, type: n.type.name, attrs: JSON.stringify(n.attrs), text: n.textBetween(0, n.content.size, '', leaf), path: path.join('>'), size: n.content.size });
        return false;
      }
      return true;
    });
    return out;
  };
  // Texte avec un caractère pour chaque objet dans la ligne (saut de ligne, image, formule…).
  const leaf = (n) => (n.type.name === 'hard_break' ? '\n' : '\ufffc');
  const textOf = (doc, from, to) => doc.textBetween(from, to, '', leaf);
  window.__ch = {
    snap() {
      // (Le curseur déplacé par une flèche est relu tout de suite, comme avant la touche suivante.)
      M.view.domObserver.flush();
      const st = M.view.state;
      const doc = st.doc;
      const sel = st.selection;
      const blocks = tbList(doc);
      const k = blocks.findIndex((b) => sel.from > b.pos && sel.from <= b.pos + 1 + b.size);
      return {
        // (Sans « nobr » : ligne vide enregistrée avec ou sans <br>, même affichage ; sans les débuts de
        // page gardés en place, posés par le mode avancé après chaque modification.)
        json: JSON.stringify(doc.toJSON()).replace(/,"nobr":(true|false)/g, '').replace(/"data-pg-start":"[^"]*",?/g, '').replace(/,}/g, '}'),
        text: textOf(doc, 0, doc.content.size),
        atoms: (() => { let n = 0; doc.descendants((x) => { if (x.isAtom && !x.isText) n++; }); return n; })(),
        blocks,
        k,
        caret: textOf(doc, 0, sel.from).length,
        empty: sel.empty,
        selType: sel.constructor.name,
        off: sel.$from.parentOffset,
        undo: M.undoDepth()
      };
    },
    // Positions possibles du curseur : début, fin et milieu de chaque ligne de texte.
    spots() {
      const out = [];
      for (const b of tbList(M.view.state.doc)) {
        out.push(b.pos + 1, b.pos + 1 + b.size);
        if (b.size > 2) out.push(b.pos + 1 + Math.floor(b.size / 2));
      }
      return [...new Set(out)];
    },
    place(pos, to) {
      const v = M.view;
      v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, pos, to === undefined ? pos : to)));
      v.focus();
    },
    // Problèmes de structure : document invalide, enregistrement / réouverture différents, écran
    // différent du texte.
    health() {
      const out = [];
      const doc = M.view.state.doc;
      try { doc.check(); } catch (e) { out.push('document invalide : ' + e.message); }
      const html = S.serialize(doc);
      try {
        const again = S.parser.parse(S.prepare(html), { preserveWhitespace: true });
        const html2 = S.serialize(again);
        if (html2 !== html) out.push('réouverture différente : ' + JSON.stringify(html).slice(0, 300) + ' ≠ ' + JSON.stringify(html2).slice(0, 300));
      } catch (e) { out.push('réouverture impossible : ' + e.message); }
      // Texte affiché de chaque ligne = texte du document (hors marques posées par le logiciel).
      for (const b of tbList(doc)) {
        let dom;
        try { dom = M.view.nodeDOM(b.pos); } catch { dom = null; }
        if (!dom || dom.nodeType !== 1 || dom.closest('[data-pm-far]')) continue;
        const clone = dom.cloneNode(true);
        clone.querySelectorAll('[contenteditable="false"], .ProseMirror-widget, br, img').forEach((e) => e.remove());
        const shown = clone.textContent.replace(/​/g, '');
        const own = doc.nodeAt(b.pos).textContent.replace(/​/g, '');
        if (shown !== own && !/raw_inline|image_inline/.test(JSON.stringify(doc.nodeAt(b.pos).toJSON().content || ''))) {
          out.push('écran ≠ texte dans « ' + own.slice(0, 40) + ' » : affiché « ' + shown.slice(0, 40) + ' »');
        }
      }
      return out;
    },
    html: () => S.serialize(M.view.state.doc),
    // Mode avancé : page de chaque bloc et lignes hors de la zone de texte d'une page.
    pages() {
      const n = M.view.state.doc.childCount;
      const pageOf = [];
      for (let i = 0; i < n; i++) pageOf.push(window.FTVisibles.pageOfBlock(i));
      const sheets = document.querySelectorAll('.pg-sheet').length;
      const pg = document.getElementById('page');
      const k = pg.currentCSSZoom || 1;
      const top = pg.getBoundingClientRect().top;
      const geo = window.FTPages._geo();
      const out = [];
      const w = document.createTreeWalker(M.view.dom, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-pg-gap, .ft-cover')) continue;
        r.selectNodeContents(t);
        for (const rc of r.getClientRects()) {
          if (!rc.height) continue;
          const y0 = (rc.top - top) / k;
          const y1 = (rc.bottom - top) / k;
          if (!geo.some((g) => y0 >= g.ct - 1 && y1 <= g.cb + 1)) out.push(t.data.slice(0, 30));
        }
      }
      const tops = [...M.view.dom.children].filter((e) => !e.hasAttribute('data-pm-far')).map((e) => Math.round(e.getBoundingClientRect().top - top));
      // Titre seul en bas d'une page, son texte en haut de la suivante.
      const doc = M.view.state.doc;
      const lone = [];
      for (let i = 0; i + 1 < n; i++) {
        if (doc.child(i).type.name === 'heading' && doc.child(i).textContent.length < 80 && doc.child(i + 1).type.name !== 'heading' && pageOf[i] !== null && pageOf[i + 1] > pageOf[i]) lone.push(doc.child(i).textContent.slice(0, 30));
      }
      return { pageOf: pageOf.join(','), sheets, misplaced: out, tops: tops.join(','), lone };
    }
  };
}

// ----- Touches et règles -----

// Touches tirées au hasard (avec leur poids).
const KEYS = [
  ['Enter', 6], ['Backspace', 8], ['Delete', 4], ['type', 5], ['Tab', 1], ['Shift+Tab', 1],
  ['ArrowLeft', 1], ['ArrowRight', 1], ['Shift+Enter', 1], ['selectBack', 2], ['pair', 3], ['Control+z', 1], ['auto', 1]
];
// Débuts de ligne tapés qui transforment la ligne (liste, titre, encadré).
const AUTO = ['- ', '1. ', '# ', '## ', '> ', '-- '];
const pickKey = (rand) => {
  const total = KEYS.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [k, w] of KEYS) { if ((x -= w) < 0) return k; }
  return KEYS[0][0];
};
const LETTERS = ['x', 'ab', 'mot', 'é'];

const inCode = (s) => s.k >= 0 && s.blocks[s.k].type === 'code_block';
const block = (s) => (s.k >= 0 ? s.blocks[s.k] : null);

// Règles propres à une touche : liste des écarts entre ce qui s'est passé et ce qui devait se passer.
function judge(key, a, b, typed) {
  const out = [];
  const cur = block(a);
  if (!cur) return out;
  const atStart = a.empty && a.off === 0;
  const atEnd = a.empty && a.off === cur.size;
  const lost = a.text.length - b.text.length;
  if (key === 'type') {
    if (!a.empty) return out;
    if (b.text !== a.text.slice(0, a.caret) + typed + a.text.slice(a.caret)) out.push(`lettres « ${typed} » mal écrites`);
    if (b.caret !== a.caret + typed.length) out.push(`curseur mal placé après la frappe (${b.caret} au lieu de ${a.caret + typed.length})`);
    if (b.blocks.length !== a.blocks.length) out.push('nombre de lignes changé par une lettre');
    const nb = block(b);
    if (nb && (nb.type !== cur.type || nb.attrs !== cur.attrs)) out.push('style de la ligne changé par une lettre');
  }
  // (Entrée dans une légende passe au tableau ou à une ligne après elle : voulu.)
  if (key === 'Enter' && a.empty && !/ft-legend/.test(cur.attrs)) {
    // Entrée ne change pas le texte (un bloc de code reçoit un retour à la ligne et son retrait).
    if (inCode(a)) {
      // (Entrée sur une ligne vide à la fin du code en sort : les lignes vides de la fin partent.)
      const left = block(b) && block(b).type !== 'code_block' && /^[\s]*$/.test(diff(a.text, b.text).avant) && !diff(a.text, b.text).après;
      if (!left && !/^\n[ \t]*$/.test(b.text.slice(a.caret, a.caret + (b.text.length - a.text.length)))) out.push('Entrée dans le code : texte inattendu');
    } else if (b.text !== a.text) out.push('Entrée a changé le texte : ' + JSON.stringify(diff(a.text, b.text)));
    else if (b.caret !== a.caret) out.push(`curseur mal placé après Entrée (${b.caret} au lieu de ${a.caret})`);
  }
  if (key === 'Backspace' && a.empty) {
    // (Dans le code, Retour arrière dans le retrait d'une ligne en retire un cran : voulu.)
    const unindent = inCode(a) && lost > 1 && /^ +$/.test(a.text.slice(a.caret - lost, a.caret)) && b.caret === a.caret - lost;
    if (!atStart && !unindent) {
      if (lost !== 1 && !(lost === 2 && /[\ud800-\udbff]/.test(a.text[a.caret - 2] || ''))) out.push(`Retour arrière a ôté ${lost} caractère(s)`);
      else if (b.text !== a.text.slice(0, a.caret - 1) + a.text.slice(a.caret)) out.push('Retour arrière a ôté un autre caractère que celui avant le curseur');
      if (b.caret !== a.caret - 1) out.push(`curseur mal placé après Retour arrière (${b.caret} au lieu de ${a.caret - 1})`);
    } else if (atStart) {
      if (b.text !== a.text && !objectGone(a, b)) out.push('Retour arrière en début de ligne a changé le texte : ' + JSON.stringify(diff(a.text, b.text)));
      else if (b.caret !== a.caret && b.atoms === a.atoms && a.blocks[a.k - 1] && a.blocks[a.k - 1].path === cur.path && a.text[a.caret - 1] !== '\ufffc') out.push(`curseur déplacé par Retour arrière en début de ligne (${b.caret} au lieu de ${a.caret})`);
      // Deux lignes réunies : la ligne obtenue garde le style de celle du dessus (même conteneur).
      const prev = a.blocks[a.k - 1];
      const nb = block(b);
      if (prev && nb && b.blocks.length === a.blocks.length - 1 && prev.path === cur.path && prev.size > 0 && cur.size > 0
        && nb.text === prev.text + cur.text && (nb.type !== prev.type || nb.attrs !== prev.attrs)) {
        out.push(`lignes réunies : style de la ligne du dessus perdu (${prev.type} ${prev.attrs} → ${nb.type} ${nb.attrs})`);
      }
      // Ligne vide au-dessus : elle disparaît, la ligne garde son style.
      if (prev && nb && prev.path === cur.path && prev.size === 0 && prev.type !== 'code_block' && !/ft-(legend|quote-src|title)/.test(prev.attrs)
        && b.blocks.length === a.blocks.length - 1 && (nb.type !== cur.type || style(nb.attrs) !== style(cur.attrs))) {
        out.push(`ligne vide au-dessus retirée : style de la ligne perdu (${cur.type} ${cur.attrs} → ${nb.type} ${nb.attrs})`);
      }
    }
  }
  if (key === 'Delete' && a.empty) {
    if (!atEnd) {
      if (lost !== 1 && !(lost === 2 && /[\ud800-\udbff]/.test(a.text[a.caret] || ''))) out.push(`Suppr a ôté ${lost} caractère(s)`);
      if (b.caret !== a.caret) out.push(`curseur déplacé par Suppr (${b.caret} au lieu de ${a.caret})`);
    } else {
      if (b.text !== a.text && !objectGone(a, b)) out.push('Suppr en fin de ligne a changé le texte : ' + JSON.stringify(diff(a.text, b.text)));
      else if (b.caret !== a.caret && b.atoms === a.atoms && a.blocks[a.k + 1] && a.blocks[a.k + 1].path === cur.path && a.text[a.caret] !== '\ufffc') out.push(`curseur déplacé par Suppr en fin de ligne (${b.caret} au lieu de ${a.caret})`);
      const next = a.blocks[a.k + 1];
      const nb = block(b);
      if (next && nb && b.blocks.length === a.blocks.length - 1 && next.path === cur.path && next.size > 0 && cur.size > 0
        && nb.text === cur.text + next.text && (nb.type !== cur.type || nb.attrs !== cur.attrs)) {
        out.push(`lignes réunies par Suppr : style de la ligne perdu (${cur.type} ${cur.attrs} → ${nb.type} ${nb.attrs})`);
      }
      // Suppr sur une ligne vide : elle disparaît, la ligne suivante garde son style.
      if (next && nb && next.path === cur.path && cur.size === 0 && next.type !== 'code_block' && cur.type !== 'code_block' && !/ft-(legend|quote-src|title)/.test(cur.attrs)
        && b.blocks.length === a.blocks.length - 1 && (nb.type !== next.type || style(nb.attrs) !== style(next.attrs))) {
        out.push(`ligne vide retirée par Suppr : style de la ligne suivante perdu (${next.type} ${next.attrs} → ${nb.type} ${nb.attrs})`);
      }
    }
  }
  return out;
}

// Sorte d'un défaut (sans les textes et les nombres) : chaque sorte n'est montrée qu'une fois.
const sortOf = (kind) => kind.replace(/«[^»]*»/g, '«»').replace(/\{[\s\S]*\}/, '').replace(/\d+/g, '#').slice(0, 120);

// Retour arrière ou Suppr contre un objet (ligne de séparation, image) : l'objet seul est retiré, voulu.
const objectGone = (a, b) => b.atoms === a.atoms - 1 && diff(a.text, b.text).avant === '\ufffc' && !diff(a.text, b.text).après;

// Style d'une ligne, sans ce que le logiciel règle seul (texte nu d'une case, ligne vide sans <br>).
const style = (attrs) => {
  const o = JSON.parse(attrs);
  delete o.bare;
  delete o.nobr;
  if (o.a) delete o.a['data-pg-start'];
  return JSON.stringify(o);
};

function diff(x, y) {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  let j = 0;
  while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
  return { à: i, avant: x.slice(i, x.length - j), après: y.slice(i, y.length - j) };
}

module.exports = async ({ page, errors }) => {
  const N = Number(process.env.CHASSE_N || 100);
  const SEED = Number(process.env.CHASSE_GRAINE || 1);
  const LEN = Number(process.env.CHASSE_TOUCHES || 6);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((n) => new Promise((r) => {
    const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0));
    f(n);
  }), n);
  await v(install);
  await v(() => {
    // Saisie sans transformation automatique (majuscule, guillemets) : le texte tapé est connu d'avance.
    if (window.FTLayout && window.FTLayout.setCapitalize) window.FTLayout.setCapitalize(false);
  });
  const load = async (html, mode) => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
    }, [html, mode]);
    await frames(3);
  };
  const snap = () => v(() => window.__ch.snap());

  // ----- Rejouer un signalement fait depuis le logiciel (Aide > Signaler un défaut) -----
  // Le document de départ est ouvert avec ses réglages, puis chaque action est refaite au même endroit
  // (le curseur est remis où il était avant chaque touche) ; les règles de structure sont vérifiées après
  // chacune. Renvoie { html, problems } : le document obtenu et les écarts trouvés.
  const setSel = (sel) => v((s) => {
    const w = window.FTMoteur.view;
    const max = w.state.doc.content.size;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.between(w.state.doc.resolve(Math.min(s[0], max)), w.state.doc.resolve(Math.min(s[1], max)))));
    w.focus();
  }, sel);
  async function replay(rep, verbose) {
    const settings = rep.settings || {};
    await page.keyboard.press('Escape');
    await v(([h, st]) => {
      for (const api of [window.FTTheme, window.FTLang]) if (api && api.load) api.load(st);
      window.FTEditor.load({ content: { html: h }, settings: st });
      document.getElementById('page').hidden = false;
    }, [rep.depart.html, settings]);
    await frames(3);
    await setSel(rep.depart.sel);
    const problems = [];
    const show = async (label) => {
      const b = await snap();
      if (verbose) console.log('  ' + label + ' → ' + (b.k >= 0 ? b.blocks[b.k].type + ' « ' + b.blocks[b.k].text.slice(0, 60) + ' » [' + b.off + ']' : b.selType));
      for (const p of await v(() => window.__ch.health())) problems.push(label + ' : ' + p);
    };
    // L'heure de chaque action est celle du signalement : les étapes d'annulation (regroupées selon le
    // temps entre deux touches) sont les mêmes.
    await v(() => { window.__realNow = window.__realNow || Date.now; });
    for (const [n, a] of rep.actions.entries()) {
      const label = (n + 1) + '. ';
      if (a.t) await v((t) => { Date.now = () => t; }, a.t);
      if (a.etat !== undefined) {
        await v(([h, s2]) => {
          const M = window.FTMoteur;
          const doc = window.FTSchema.parse(h);
          const w = M.view;
          w.dispatch(w.state.tr.replaceWith(0, w.state.doc.content.size, doc.content));
          w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.near(w.state.doc.resolve(Math.min(s2[1], w.state.doc.content.size)))));
        }, [a.etat, a.s]);
        await show(label + 'état après un bouton ou un menu');
      } else if (a.clic) {
        await setSel(a.clic);
      } else if (a.coller) {
        await setSel(a.s);
        await v((c) => window.FTMoteur.insertHtml(c.html || c.text.replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x])).split('\n').map((l) => '<p>' + l + '</p>').join('')), a.coller);
        await show(label + 'coller');
      } else if (a.compose !== undefined) {
        await setSel(a.s);
        await page.keyboard.insertText(a.compose);
        await show(label + 'saisie « ' + a.compose + ' »');
      } else if (a.k) {
        await setSel(a.s);
        if ([...a.k].length === 1) await page.keyboard.type(a.k);
        else await page.keyboard.press(a.k);
        await frames(1);
        await show(label + a.k);
      }
    }
    await v(() => { Date.now = window.__realNow; });
    await frames(3);
    return { html: await v(() => window.__ch.html()), problems };
  }
  if (process.env.CHASSE_REJOUER) {
    const rep = JSON.parse(fs.readFileSync(process.env.CHASSE_REJOUER, 'utf8'));
    console.log(`  Signalement du ${rep.date} (version ${rep.version}) : « ${rep.description || 'sans description'} », ${rep.actions.length} action(s), mode ${(rep.settings || {}).mode || 'note'}`);
    const r = await replay(rep, true);
    console.log(r.html === rep.fin.html ? '  Rejoué : même document final que celui signalé.' : '  Rejoué : document final différent de celui signalé.\n  signalé : ' + rep.fin.html.slice(0, 2000) + '\n  rejoué  : ' + r.html.slice(0, 2000));
    for (const p of r.problems) console.log('  DÉFAUT  ' + p);
    return;
  }
  const press = async (key, rand) => {
    let typed = '';
    if (key === 'type') {
      typed = LETTERS[Math.floor(rand() * LETTERS.length)];
      await page.keyboard.type(typed);
    } else if (key === 'selectBack') {
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Backspace');
    } else if (key === 'auto') {
      await page.keyboard.press('Home');
      typed = AUTO[Math.floor(rand() * AUTO.length)];
      await page.keyboard.type(typed);
    } else if (key === 'pair') {
      // Entrée puis Retour arrière, ou une lettre puis Retour arrière : rien ne doit changer.
      return { pair: true };
    } else {
      await page.keyboard.press(key);
    }
    return { typed };
  };

  const found = [];
  const seen = new Map();
  const report = (kind, info) => {
    const key = sortOf(kind) + ' / ' + info.document;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) > 1) return;
    found.push({ défaut: kind, ...info });
  };

  const names = Object.keys(DOCS);
  const only = process.env.CHASSE_SUITE ? Number(process.env.CHASSE_SUITE) : null;
  for (let run = only === null ? 0 : only; run < (only === null ? N : only + 1); run++) {
    const rand = rng(SEED * 100003 + run);
    const name = names[Math.floor(rand() * names.length)];
    const mode = rand() < 0.5 ? 'note' : 'avance';
    await load(DOCS[name], mode);
    const spots = await v(() => window.__ch.spots());
    const start = spots[Math.floor(rand() * spots.length)];
    await v((p) => window.__ch.place(p), start);
    const first = await snap();
    if (only !== null) console.log('  départ → ' + first.blocks.map((x, i) => (i === first.k ? '[' + first.off + ']' : '') + x.path + '/' + x.type + ':' + x.text).join(' | '));
    const done = [];
    const where = () => ({ graine: SEED, suite: run, document: name, mode, départ: start, touches: done.slice() });
    let s = first;
    for (let t = 0; t < LEN; t++) {
      const key = pickKey(rand);
      const errs = errors.length;
      let r;
      try {
        r = await press(key, rand);
      } catch (e) {
        report('touche impossible : ' + e.message, where());
        break;
      }
      if (r.pair) {
        const typedFirst = rand() < 0.5;
        const k1 = typedFirst ? 'z' : 'Enter';
        if (inCode(s) && !typedFirst) { t--; continue; }
        await page.keyboard.press(k1 === 'z' ? 'z' : 'Enter');
        await page.keyboard.press('Backspace');
        done.push(k1 === 'z' ? 'z' : 'Enter', 'Backspace');
        await frames(1);
        const b = await snap();
        // (Entrée puis Retour arrière dans une liste : la nouvelle ligne recule d'un cran, voulu.)
        const inList = s.k >= 0 && /list_item$/.test(s.blocks[s.k].path) && k1 === 'Enter';
        if (b.json !== s.json && s.empty && !inList) report(`${k1 === 'z' ? 'une lettre' : 'Entrée'} puis Retour arrière ne rend pas le document`, { ...where(), avant: s.blocks[s.k], après: b.blocks[b.k] });
        s = b;
        continue;
      }
      done.push(key === 'type' ? r.typed : key === 'auto' ? 'Home puis « ' + r.typed + ' »' : key);
      await frames(1);
      const b = await snap();
      if (only !== null) console.log('  ' + key + ' ' + (r.typed || '') + ' (' + b.selType + ' ' + b.caret + ') → ' + b.blocks.map((x, i) => (i === b.k ? '[' + b.off + ']' : '') + x.path + '/' + x.type + ':' + x.text).join(' | '));
      for (const p of judge(key, s, b, r.typed)) report(p, { ...where(), ligne: s.blocks[s.k], devenue: b.blocks[b.k] });
      if (errors.length > errs) report('erreur du logiciel : ' + errors.slice(errs).join(' | ').slice(0, 300), where());
      for (const p of await v(() => window.__ch.health())) report(p, where());
      if (only !== null && mode === 'avance') {
        await frames(3);
        const p1 = await v(() => window.__ch.pages());
        console.log('     pages ' + p1.pageOf + ' / ' + p1.tops + (p1.misplaced.length ? '  HORS PAGE ' + p1.misplaced.join(' ; ') : ''));
      }
      s = b;
    }
    // Annuler jusqu'au bout : document de départ ; Rétablir : document final.
    const last = s;
    for (let i = 0; i < 60 && (await v(() => window.FTMoteur.undoDepth())) > 0; i++) await page.keyboard.press('Control+z');
    const back = await snap();
    for (const p of await v(() => window.__ch.health())) report('après Annuler : ' + p, where());
    if (back.json !== first.json) report('Annuler ne rend pas le document de départ', { ...where(), attendu: first.blocks.map((x) => x.type + ':' + x.text), obtenu: back.blocks.map((x) => x.type + ':' + x.text) });
    for (let i = 0; i < 60 && (await v(() => window.FTMoteur.redoDepth())) > 0; i++) await page.keyboard.press('Control+y');
    const again = await snap();
    for (const p of await v(() => window.__ch.health())) report('après Rétablir : ' + p, where());
    // (Après Annuler pendant la suite, une touche sans effet garde l'étape annulée à rétablir.)
    if (again.json !== last.json && !done.includes('Control+z')) report('Rétablir ne rend pas le document final', where());
    // Mode avancé : mêmes pages qu'en rouvrant le document, aucune ligne hors d'une page.
    if (mode === 'avance') {
      const finalHtml = await v(() => window.__ch.html());
      await frames(3);
      const p1 = await v(() => window.__ch.pages());
      const shape = () => v(() => [...window.FTMoteur.view.dom.querySelectorAll('*')].map((e) => e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ':' + Math.round(e.getBoundingClientRect().height) + ':' + e.outerHTML.slice(0, 90)));
      const sh1 = only !== null ? await shape() : null;
      await load(finalHtml, mode);
      const p2 = await v(() => window.__ch.pages());
      if (only !== null) {
        const sh2 = await shape();
        console.log('  HTML final : ' + finalHtml);
        for (let i = 0; i < Math.max(sh1.length, sh2.length); i++) if (sh1[i] !== sh2[i]) { console.log('  premier écart :\n   ' + sh1[i] + '\n   ' + sh2[i]); break; }
      }
      if (p1.lone.length) report('titre seul en bas de page', { ...where(), titres: p1.lone });
      if (p1.misplaced.length) report('ligne hors de la zone de texte d’une page', { ...where(), lignes: p1.misplaced.slice(0, 3) });
      if (p1.pageOf !== p2.pageOf || p1.sheets !== p2.sheets) report('pages différentes de celles du document rouvert', { ...where(), frappe: p1.pageOf, rouvert: p2.pageOf });
      else if (p1.tops.split(',').some((t, i) => Math.abs(t - p2.tops.split(',')[i]) > 2)) report('texte placé autrement que dans le document rouvert', { ...where(), frappe: p1.tops, rouvert: p2.tops });
    }
  }

  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${N} suites de ${LEN} touches (graine ${SEED}) : ${found.length} sorte(s) de défaut, ${total} cas`);
  for (const f of found) {
    console.log('  DÉFAUT  ' + f.défaut + '  (' + seen.get(sortOf(f.défaut) + ' / ' + f.document) + ' cas)');
    console.log('          ' + JSON.stringify(f).slice(0, 700));
  }
  if (process.env.CHASSE_RAPPORT) fs.writeFileSync(process.env.CHASSE_RAPPORT, JSON.stringify(found, null, 1));

  // ----- Signaler un défaut : enregistré puis rejoué à l'identique -----
  if (only === null) {
    await load(DOCS.titres, 'avance');
    await v(() => {
      const api = window.frameText;
      const save = api.reportSave;
      api.reportSave = async (...a) => (window.__report = await save(...a));
    });
    await v(() => { const w = window.FTMoteur.view; w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 12))); w.focus(); });
    for (const k of ['Enter', 'Backspace', 'ArrowRight', 'Enter']) await page.keyboard.press(k);
    await page.keyboard.type('Ajout');
    await v(() => document.querySelector('[data-tb="bold"]').click());
    await page.keyboard.type(' gras');
    await page.keyboard.press('Control+z');
    await v(() => window.FTApp.menu('report'));
    await page.waitForTimeout(300);
    assert.ok(await v(() => document.getElementById('report-dialog').open));
    await v(() => { document.getElementById('rp-note').value = 'Essai du banc.'; document.getElementById('rp-save').click(); });
    await page.waitForTimeout(300);
    const res = await v(() => window.__report);
    assert.ok(res && /^signalement-.*\.json$/.test(res.name), JSON.stringify(res));
    assert.match(await v(() => document.getElementById('rp-info').textContent), /Signalement enregistré/);
    await v(() => document.getElementById('rp-cancel').click());
    const file = path.join(res.dir, res.name);
    const rep = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (process.env.CHASSE_GARDER) fs.copyFileSync(file, process.env.CHASSE_GARDER);
    assert.strictEqual(rep.description, 'Essai du banc.');
    assert.strictEqual(rep.settings.mode, 'avance');
    assert.ok(rep.actions.length >= 8, rep.actions.length);
    const r = await replay(rep, false);
    assert.strictEqual(r.html, rep.fin.html);
    assert.deepStrictEqual(r.problems, []);
    console.log(`  OK  Signaler un défaut : ${rep.actions.length} actions et le document enregistrés (${res.name}), rejoués à l'identique`);
  }
  if (!process.env.CHASSE_RAPPORT) assert.strictEqual(found.length, 0, found.length + ' défaut(s) trouvé(s)');
};
