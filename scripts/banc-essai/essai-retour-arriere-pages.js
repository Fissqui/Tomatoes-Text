// Mode avancé : Retour arrière devant un texte (B) gardé en haut de sa page, après un grand blanc (fin
// d'un texte A, lignes vides). Chaque Retour arrière doit faire remonter B : le premier le remet à la
// suite du texte, les suivants effacent les lignes vides d'au-dessus une à une.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-retour-arriere-pages.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const frames = (n = 3) => page.evaluate((n) => new Promise((r) => {
    const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0));
    f(n);
  }), n);
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const para = (n, extra = '') => `<p${extra}>` + LOREM.repeat(n) + '</p>';
  const load = async (html) => {
    await page.evaluate((h) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } });
      document.getElementById('page').hidden = false;
    }, html);
    await frames(4);
  };
  // Bloc qui commence par « Texte B » : { i, page, top (px à l'écran, sans zoom), kept }.
  const infoB = () => page.evaluate(() => {
    const v = window.FTMoteur.view;
    const doc = v.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; pos += doc.child(i).nodeSize, i++) {
      const n = doc.child(i);
      if (!n.textContent.startsWith('Texte B')) continue;
      const el = v.nodeDOM(pos);
      el.scrollIntoView({ block: 'center' });
      const pg = document.getElementById('page');
      return { i, pos, page: window.FTVisibles.pageOfBlock(i), top: el.getBoundingClientRect().top - pg.getBoundingClientRect().top, kept: !!n.attrs.a['data-pg-start'], n: doc.childCount };
    }
    return null;
  });
  const caretAtB = async () => {
    const b = await infoB();
    await page.evaluate((p) => {
      const v = window.FTMoteur.view;
      v.focus();
      v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, p + 1)));
    }, b.pos);
    await frames(2);
  };
  const back = async () => { await page.keyboard.press('Backspace'); await frames(4); return infoB(); };

  // 1. Texte A, cinq lignes vides, puis B gardé en haut de la page 3 (la page 2 finit en blanc).
  const empties = '<p></p>'.repeat(5);
  await load(para(9) + 'X'.repeat(0) + empties + para(4, ' data-pg-start="t1"').replace('Lorem', 'Texte B Lorem') + para(12) + para(12));
  let b = await infoB();
  assert(b.kept, 'B gardé');
  const startPage = b.page;
  await caretAtB();
  const tops = [b.top];
  const pages = [b.page];
  for (let k = 0; k < 6; k++) {
    b = await back();
    if (!b) { console.log('     B rejoint le texte d\'avant au Retour arrière ' + (k + 1)); break; }
    tops.push(b.top);
    pages.push(b.page);
  }
  console.log('     pages de B :', pages.join(' '), ' hauts :', tops.map((t) => Math.round(t)).join(' '));
  for (let k = 1; k < tops.length; k++) assert(tops[k] < tops[k - 1] - 5, `Retour arrière ${k} : B remonte (${tops.map(Math.round).join(', ')})`);
  assert(pages[1] < startPage, 'B remonte dès le premier Retour arrière');
  ok('lignes vides avant un texte gardé en haut de page : chaque Retour arrière le fait remonter');

  // 2. Les pages gardées d'après B suivent aussi ; Ctrl+Z remet B et la suite en place.
  await load(para(9) + para(4, ' data-pg-start="t1"').replace('Lorem', 'Texte B Lorem') + para(14) + para(3) + para(6, ' data-pg-start="t2"') + para(10));
  b = await infoB();
  const keptAfter = () => page.evaluate(() => window.FTVisibles.keptCount());
  assert.strictEqual(await keptAfter(), 2, 'deux pages gardées');
  await caretAtB();
  let b1 = await back();
  assert(b1.page < b.page && !b1.kept, `B remonte à la suite du texte (page ${b.page} → ${b1.page})`);
  assert.strictEqual(b1.n, b.n, 'rien d\'effacé');
  assert.strictEqual(await keptAfter(), 0, 'les pages gardées d\'après suivent le texte');
  await page.keyboard.press('Control+z');
  await frames(4);
  b1 = await infoB();
  assert(b1.kept && b1.page === b.page && await keptAfter() === 2, 'Ctrl+Z : B et la suite reprennent leur page');
  ok('pages gardées après B : remises à la suite avec lui, Ctrl+Z les remet');

  // 3. Image en fin du texte A, puis B gardé en haut de la page suivante.
  await load(para(3) + '<p>Fin du texte A.</p>' + para(4, ' data-pg-start="t1"').replace('Lorem', 'Texte B Lorem') + para(12));
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    let pos = 0;
    v.state.doc.forEach((n, p) => { if (n.textContent.startsWith('Fin du texte A')) pos = p; });
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, pos + 1)));
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#7fa7c9'; g.fillRect(0, 0, 320, 200);
    const el = window.FTLayout.makeImage(window.FTLayout.imageUrl(c.toDataURL('image/png')), 320);
    el.style.width = '40%';
    window.FTImages.insert(el, null);
  });
  await frames(6);
  b = await infoB();
  assert(b.kept, 'B gardé après l\'image');
  await caretAtB();
  b1 = await back();
  assert(b1.page < b.page, `B remonte sous l'image (page ${b.page} → ${b1.page})`);
  ok('image en fin du texte A : le premier Retour arrière fait remonter B');

  // 4. Lignes vides jusqu'au bas de la page : B (une ligne) y remonte dès la première effacée.
  let n = 0;
  for (let k = 20; k < 60; k++) {
    await load(para(6) + '<p></p>'.repeat(k) + '<p>Texte B, une ligne.</p>' + para(10));
    b = await infoB();
    const prev = await page.evaluate((i) => window.FTVisibles.pageOfBlock(i - 1), b.i);
    if (b.page > prev) { n = k; break; }
  }
  assert(n, 'B passé en haut de la page suivante');
  await page.evaluate((p) => {
    const v = window.FTMoteur.view;
    const node = v.state.doc.nodeAt(p);
    v.dispatch(v.state.tr.setNodeMarkup(p, null, { ...node.attrs, a: { ...node.attrs.a, 'data-pg-start': 'z1' } }).setMeta('addToHistory', false));
  }, b.pos);
  await frames(4);
  b = await infoB();
  await caretAtB();
  b1 = await back();
  assert(b1.n === b.n - 1 && b1.page < b.page && !b1.kept, `ligne vide effacée, B remonte au bas de la page d'avant (${JSON.stringify([b, b1])})`);
  ok(`${n} lignes vides jusqu'au bas de la page : B remonte dès le premier Retour arrière`);

  // 5. Texte d'avant qui grandit et déborde sur la page de B gardé : B reste à sa suite sur cette page
  // (il ne passe pas seul à la page d'après en y laissant la ligne débordée).
  await load(para(6) + '<p></p>'.repeat(n - 1) + '<p>Fin du texte A.</p>' + '<p data-pg-start="z2">Texte B, une ligne.</p>' + para(10));
  b = await infoB();
  assert(b.kept, 'B gardé : ' + JSON.stringify(b));
  const pageB = b.page;
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    const doc = v.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; pos += doc.child(i).nodeSize, i++) if (doc.child(i).textContent.startsWith('Fin du texte A')) break;
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(doc, pos + 1)));
  });
  let spilled = null;
  for (let k = 0; k < 8 && !spilled; k++) {
    await page.keyboard.press('Enter');
    await frames(4);
    b = await infoB();
    const prev = await page.evaluate((i) => window.FTVisibles.pageOfBlock(i - 1), b.i);
    if (prev === pageB || b.page !== pageB) spilled = { k: k + 1, prev, b };
  }
  assert(spilled, 'texte A débordé sur la page de B');
  assert.strictEqual(spilled.b.page, pageB, 'B reste sur sa page, à la suite du texte débordé : ' + JSON.stringify(spilled));
  ok(`texte d'avant débordé sur la page de B gardé (${spilled.k} Entrée) : B reste à sa suite sur la même page`);
};
