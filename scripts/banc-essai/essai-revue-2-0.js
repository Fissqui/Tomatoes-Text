// Revue de la version 2.0 (2.0.5) : titre gardé avec son texte en bas de page, ni première ni dernière ligne
// d'un paragraphe seule sur une page, retour arrière sous un tableau, frappe sur plusieurs cases choisies,
// espaces insécables avant « ; : ! ? » en français, temps d'écriture compté.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-revue-2-0.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 4) => v((n) => new Promise((r) => {
    const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0));
    f(n);
  }), n);
  const load = async (html, mode = 'note') => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
    }, [html, mode]);
    await frames();
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const caret = (pos) => v((p) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, p)));
    w.focus();
  }, pos);
  // Page (rang de la feuille) de chaque ligne de texte d'un élément.
  const linePages = (sel) => v((sel) => {
    const sheets = [...document.querySelectorAll('.pg-sheet')].map((s) => s.getBoundingClientRect());
    const el = document.querySelector(sel);
    const r = document.createRange();
    const tops = new Map();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (t.parentElement.closest('.ft-pg-gap')) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) if (rc.height) tops.set(Math.round(rc.top), rc.top);
    }
    return [...tops.values()].sort((a, b) => a - b).map((t) => sheets.findIndex((s) => t >= s.top && t <= s.bottom));
  }, sel);
  const filler = (n) => Array.from({ length: n }, (_, i) => `<p>Ligne ${i} du texte.</p>`).join('');

  // 1. Titre et sous-titre à toutes les hauteurs d'une page : jamais séparés du paragraphe qui les suit.
  for (let n = 10; n <= 40; n++) {
    await load(filler(n) + '<h1 id="t1">Grand titre</h1><h2 id="t2">Sous-titre</h2><p id="x">Premier paragraphe après les titres.</p>' + filler(n), 'avance');
    const p = [(await linePages('#t1'))[0], (await linePages('#t2'))[0], (await linePages('#x'))[0]];
    assert(p[0] === p[2] && p[1] === p[2], `titres seuls en bas de page (${n} lignes avant) : pages ${p.join('/')}`);
  }
  ok('titre et sous-titre toujours sur la même page que le début de leur texte (31 positions)');

  // 2. Paragraphe de plusieurs lignes coupé par la page : au moins deux lignes de chaque côté.
  const LONG = 'Chaque idée tranquille dévoile plusieurs mots et écoute le livre. Les fenêtres étranges portent cette ville claire autour de la saison. '.repeat(4);
  let cut = 0;
  for (let n = 20; n <= 34; n++) {
    await load(filler(n) + `<p id="x">${LONG}</p>` + filler(n), 'avance');
    const p = await linePages('#x');
    const count = {};
    for (const s of p) count[s] = (count[s] || 0) + 1;
    const c = Object.values(count);
    if (c.length > 1) cut++;
    assert(c.length === 1 || c.every((k) => k >= 2), `ligne seule (${n} lignes avant) : ${JSON.stringify(count)}`);
  }
  assert(cut > 0, 'aucun paragraphe coupé');
  ok(`paragraphe coupé par la page (${cut} cas) : jamais une ligne seule en bas ou en haut d'une page`);

  // 3. Retour arrière dans la ligne vide sous un tableau.
  const T = '<table class="ft-table"><tr><td>cc</td><td>dd</td></tr></table>';
  await load(T + '<p></p><p>z</p>');
  await caret(17);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Z');
  let html = await saved();
  assert(/ddZ<\/td>/.test(html) && /<\/table><p>z<\/p>/.test(html), html);
  await load(T + '<p></p>');
  await caret(17);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Z');
  html = await saved();
  assert(/ddZ<\/td>/.test(html) && /<\/table><p><\/p>$/.test(html), html);
  ok('retour arrière sous un tableau : curseur dans la dernière case, dernière ligne du texte gardée');

  // 4. Frappe sur plusieurs cases choisies : toutes vidées, la lettre dans la première.
  await load('<table class="ft-table"><tr><td>aa</td><td>bb</td></tr><tr><td>cc</td><td>dd</td></tr></table><p>x</p>');
  await v(() => {
    const w = window.FTMoteur.view;
    const d = w.state.doc;
    const c = [];
    d.descendants((n, p) => { if (n.type.name === 'table_cell') c.push(p); });
    w.dispatch(w.state.tr.setSelection(PM.tables.CellSelection.create(d, c[0], c[3])));
    w.focus();
  });
  await page.keyboard.type('Zy');
  html = await saved();
  assert(/<td>Zy<\/td>/.test(html) && !/aa|bb|cc|dd/.test(html), html);
  ok('frappe sur quatre cases choisies : cases vidées, texte dans la première');

  // 5. Espaces insécables avant « ; : ! ? » en français (majuscule automatique après « ! »).
  await load('<p></p>');
  await caret(1);
  await page.keyboard.type('Oui : non ; si ! quoi ?');
  const text = await v(() => window.FTMoteur.view.state.doc.textContent);
  assert.strictEqual(text, 'Oui : non ; si ! Quoi ?');
  ok('espace insécable avant « : », espace fine insécable avant « ; ! ? »');

  // 6. Temps d'écriture : la frappe dans le moteur compte une minute d'écriture.
  const minutes = await v(async () => {
    let out = null;
    window.FTGoals.init({ daily: 0, days: {} }, (d) => { out = d; });
    const w = window.FTMoteur.view;
    // (Une minute plus tard que toute frappe précédente de l'essai.)
    const now = Date.now;
    Date.now = () => now() + 120000;
    try { w.dispatch(w.state.tr.insertText('mot ', 1)); } finally { Date.now = now; }
    window.FTGoals.flush();
    return Object.values(out.days).reduce((s, d) => s + (d.minutes || 0), 0);
  });
  assert(minutes >= 1, 'minutes : ' + minutes);
  ok('temps d’écriture compté pendant la frappe');
};
