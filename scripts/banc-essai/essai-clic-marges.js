// Clic hors des lignes du texte (moteur/clic.js), comme Word : marges, à côté de la page, sous le texte,
// entre deux pages ; le curseur va dans le texte le plus proche et le texte garde le clavier.
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const state = () => page.evaluate(() => {
    const v = window.FTMoteur.view;
    const $h = v.state.doc.resolve(v.state.selection.head);
    return { focus: v.hasFocus(), empty: v.state.selection.empty, text: $h.parent.textContent, off: $h.parentOffset, sel: v.state.doc.textBetween(v.state.selection.from, v.state.selection.to) };
  });
  const click = async (x, y, opts) => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.mouse.click(x, y, opts);
    await page.waitForTimeout(150);
    return state();
  };
  await page.evaluate(() => {
    document.getElementById('editor').innerHTML = '<p>Court.</p><p>Un paragraphe un peu plus long qui parle de tomates anciennes.</p><p>Fin.</p>';
  });
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const b = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, y: (r.top + r.bottom) / 2 }; };
    return { pg: b(document.getElementById('page')), ps: [...document.querySelectorAll('#editor > p')].map(b) };
  });
  let s = await click(g.ps[1].l - 30, g.ps[1].y);
  assert(s.focus && s.empty && s.text.startsWith('Un paragraphe') && s.off === 0, 'marge gauche : ' + JSON.stringify(s));
  ok('marge gauche : début de la ligne');
  s = await click(g.ps[0].r + 30, g.ps[0].y);
  assert(s.focus && s.text === 'Court.' && s.off === 6, 'marge droite : ' + JSON.stringify(s));
  ok('marge droite : fin de la ligne');
  // (Page zoomée plus large que l'espace de travail : pas de gris à côté.)
  const wsl = await page.evaluate(() => document.getElementById('workspace').getBoundingClientRect().left);
  if (g.pg.l - 40 > wsl) {
    s = await click(g.pg.l - 40, g.ps[0].y);
    assert(s.focus && s.text === 'Court.' && s.off === 0, 'à côté de la page : ' + JSON.stringify(s));
    ok('à côté de la page');
  }
  s = await click(g.ps[2].l + 5, Math.min(g.pg.b - 15, 800));
  assert(s.focus && s.text === 'Fin.', 'bas de la page : ' + JSON.stringify(s));
  s = await click(g.ps[2].l + 5, g.pg.t + 10);
  assert(s.focus && s.text === 'Court.', 'haut de la page : ' + JSON.stringify(s));
  ok('marges du haut et du bas');
  await page.keyboard.type('X');
  assert((await state()).text.startsWith('X') || (await state()).text.includes('X'), 'frappe après le clic');
  ok('la frappe va dans le texte');
  // Maj+clic dans la marge : sélection étendue jusqu'au début de la ligne.
  await page.mouse.click(g.ps[2].r + 30, g.ps[2].y);
  await page.keyboard.down('Shift');
  await page.mouse.click(g.ps[1].l - 30, g.ps[1].y);
  await page.keyboard.up('Shift');
  s = await state();
  assert(!s.empty && s.sel.startsWith('Un paragraphe') && s.sel.endsWith('Fin.'), 'Maj+clic : ' + JSON.stringify(s));
  ok('Maj+clic dans la marge');

  // Mode avancé : clic dans la marge du bas d'une page ou entre deux pages.
  let html = '';
  for (let i = 0; i < 30; i++) html += `<p>Paragraphe ${i} : un texte assez long pour remplir les lignes de la page et provoquer une coupure.</p>`;
  await page.evaluate((h) => { window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } }); document.getElementById('page').hidden = false; }, html);
  await page.waitForTimeout(600);
  const top2 = await page.evaluate(() => document.querySelectorAll('.pg-sheet')[1].getBoundingClientRect().top);
  await page.evaluate((y) => { document.getElementById('workspace').scrollTop += y - 400; }, top2);
  await page.waitForTimeout(300);
  const sh = await page.evaluate(() => [...document.querySelectorAll('.pg-sheet')].slice(0, 2).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
  const x = (sh[0].l + sh[0].r) / 2;
  const lastOf1 = await page.evaluate((b) => {
    const v = window.FTMoteur.view;
    let best = null;
    for (let y = b - 1; y > b - 400; y -= 2) { const r = v.posAtCoords({ left: 700, top: y }); if (r && v.coordsAtPos(r.pos).bottom < b) { best = v.state.doc.resolve(r.pos).parent.textContent.slice(0, 14); break; } }
    return best;
  }, sh[0].b);
  s = await click(x, sh[0].b - 15);
  assert(s.focus && s.text.startsWith(lastOf1), 'bas de la page 1 : ' + JSON.stringify(s) + ' attendu ' + lastOf1);
  ok('marge du bas : dernière ligne de la page');
  s = await click(sh[1].l + 10, sh[1].t + 300);
  assert(s.focus && s.empty, 'marge gauche page 2 : ' + JSON.stringify(s));
  ok('marge gauche en mode avancé');
};
