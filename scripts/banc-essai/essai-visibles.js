// Très long document (préversion 2.0) : seuls les blocs autour de l'écran sont affichés. Vérifie que
// rien n'y paraît : positions identiques au document entier, défilement stable, frappe, Ctrl+Fin,
// Ctrl+Z loin de l'écran, Ctrl+A, numéros des titres, aller à un titre caché, texte enregistré.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-visibles.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => {
    const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0));
    f(n);
  }), n);
  const html = corpus().repeat(21);
  await page.evaluate((h) => {
    window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } });
    document.getElementById('page').hidden = false;
  }, html);
  await frames(3);

  // 1. Peu de blocs affichés.
  const info = await page.evaluate(() => ({
    active: window.FTVisibles.active(),
    shown: window.FTVisibles.shown().length,
    blocks: document.getElementById('editor').childElementCount
  }));
  assert(info.active, 'affichage partiel actif');
  assert(info.shown < 150, `${info.shown} blocs affichés sur ${info.blocks}`);
  ok(`${info.shown} blocs affichés sur ${info.blocks}`);

  // 2. Après un passage sur tout le document, chaque bloc est à la place qu'il aurait document entier.
  const ws = '#workspace';
  for (let y = 0; y < await page.evaluate((s) => document.querySelector(s).scrollHeight, ws); y += 600) {
    await page.evaluate(([s, y]) => { document.querySelector(s).scrollTop = y; }, [ws, y]);
    await frames(1);
  }
  await page.evaluate((s) => { document.querySelector(s).scrollTop = 0; }, ws);
  await frames(2);
  const virt = await page.evaluate(() => window.FTVisibles.tops());
  const vh = await page.evaluate((s) => document.querySelector(s).scrollHeight, ws);
  await page.evaluate(() => window.FTVisibles.enable(false));
  await frames(1);
  const real = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const top = ed.getBoundingClientRect().top;
    const k = ed.currentCSSZoom || 1;
    return { tops: [...ed.children].map((el) => (el.getBoundingClientRect().top - top) / k), end: (ed.getBoundingClientRect().bottom - top) / k };
  });
  const rh = await page.evaluate((s) => document.querySelector(s).scrollHeight, ws);
  let worst = 0;
  for (let i = 0; i < real.tops.length; i++) worst = Math.max(worst, Math.abs(real.tops[i] - virt[i]));
  worst = Math.max(worst, Math.abs(real.end - virt[virt.length - 1]));
  assert(worst < 2, `écart maximal ${worst.toFixed(2)} px`);
  assert(Math.abs(vh - rh) < 2, `hauteur ${vh} au lieu de ${rh}`);
  ok(`positions identiques au document entier (écart maximal ${worst.toFixed(2)} px sur ${real.tops.length} blocs, hauteur ${rh} px)`);
  await page.evaluate(() => window.FTVisibles.enable(true));
  await frames(2);

  // 3. Défilement stable : au milieu, le texte à l'écran ne bouge pas tout seul.
  const at = (s) => page.evaluate((s) => {
    const w = document.querySelector(s);
    const wt = w.getBoundingClientRect().top;
    const el = [...document.getElementById('editor').children].find((e) => !e.hasAttribute('data-pm-far') && e.getBoundingClientRect().bottom > wt + 50);
    return { i: [...el.parentNode.children].indexOf(el), y: el.getBoundingClientRect().top - wt, scroll: w.scrollTop };
  }, s);
  await page.evaluate((s) => { const w = document.querySelector(s); w.scrollTop = w.scrollHeight * 0.5; }, ws);
  await frames(3);
  const a1 = await at(ws);
  await page.evaluate(() => window.FTVisibles.update());
  await frames(3);
  const a2 = await at(ws);
  assert.deepStrictEqual(a2, a1, 'texte immobile');
  await page.mouse.move(700, 500);
  for (let k = 0; k < 10; k++) { await page.mouse.wheel(0, -120); await frames(1); }
  const a3 = await at(ws);
  assert(a3.scroll < a1.scroll && a3.scroll > a1.scroll - 1300, `défilement vers le haut : ${a1.scroll} → ${a3.scroll}`);
  ok('défilement stable au milieu du document');

  // 4. Frappe au milieu : clic dans un paragraphe affiché, texte écrit au bon endroit.
  const target = await page.evaluate((s) => {
    const wt = document.querySelector(s).getBoundingClientRect();
    const p = [...document.querySelectorAll('#editor > p')].find((e) => !e.hasAttribute('data-pm-far') && e.textContent.length > 60 && e.getBoundingClientRect().top > wt.top + 100);
    const r = p.getBoundingClientRect();
    const i = [...p.parentNode.children].indexOf(p);
    return { x: r.left + 3, y: r.top + 8, i, text: window.FTMoteur.view.state.doc.child(i).textContent };
  }, ws);
  await page.mouse.click(target.x, target.y);
  await page.keyboard.type('XYZ ');
  const typed = await page.evaluate((i) => ({ model: window.FTMoteur.view.state.doc.child(i).textContent, dom: document.getElementById('editor').children[i].textContent }), target.i);
  assert(typed.model.startsWith('XYZ ') && typed.model.slice(4) === target.text, 'texte dans le bon paragraphe : ' + typed.model.slice(0, 40));
  assert(typed.dom.startsWith('XYZ '), 'texte affiché');
  ok('frappe au milieu du document');

  // 5. Ctrl+Fin puis Ctrl+Début : le curseur et l'écran vont au bout du texte.
  const caretOnScreen = () => page.evaluate((s) => {
    const v = window.FTMoteur.view;
    const c = v.coordsAtPos(v.state.selection.head);
    const w = document.querySelector(s).getBoundingClientRect();
    return { head: v.state.selection.head, size: v.state.doc.content.size, on: c.top >= w.top - 1 && c.bottom <= w.bottom + 1, scroll: document.querySelector(s).scrollTop };
  }, ws);
  await page.keyboard.press('Control+End');
  await frames(3);
  let c = await caretOnScreen();
  assert(c.on && c.size - c.head < 3, `Ctrl+Fin : ${JSON.stringify(c)}`);
  await page.keyboard.press('Control+Home');
  await frames(3);
  c = await caretOnScreen();
  assert(c.on && c.head < 3 && c.scroll < 50, `Ctrl+Début : ${JSON.stringify(c)}`);
  ok('Ctrl+Fin et Ctrl+Début');

  // 6. Ctrl+Z loin de l'endroit modifié : la modification est défaite et montrée à l'écran.
  await page.keyboard.press('Control+End');
  await frames(2);
  await page.keyboard.press('Control+z');
  await frames(3);
  const undone = await page.evaluate((i) => window.FTMoteur.view.state.doc.child(i).textContent, target.i);
  assert.strictEqual(undone, target.text, 'frappe défaite');
  c = await caretOnScreen();
  assert(c.on, 'curseur à l\'écran après Ctrl+Z');
  ok('Ctrl+Z loin de l\'écran');

  // 7. Tout sélectionner, effacer, puis Ctrl+Z.
  const n0 = await page.evaluate(() => window.FTMoteur.view.state.doc.childCount);
  await page.keyboard.press('Control+a');
  const all = await page.evaluate(() => { const s = window.FTMoteur.view.state; return s.selection.from <= 1 && s.selection.to >= s.doc.content.size - 1; });
  assert(all, 'tout est sélectionné');
  await page.keyboard.press('Backspace');
  await frames(2);
  const n1 = await page.evaluate(() => ({ n: window.FTMoteur.view.state.doc.childCount, active: window.FTVisibles.active() }));
  assert(n1.n <= 2 && !n1.active, 'document vidé');
  await page.keyboard.press('Control+z');
  await frames(3);
  const n2 = await page.evaluate(() => ({ n: window.FTMoteur.view.state.doc.childCount, active: window.FTVisibles.active(), shown: window.FTVisibles.shown().length }));
  assert(n2.n === n0 && n2.active && n2.shown < 200, `document rétabli : ${JSON.stringify(n2)}`);
  ok('Ctrl+A, effacer, Ctrl+Z');

  // 8. Numéros des titres : les compteurs repris après des blocs cachés valent ceux du document entier.
  await page.evaluate((s) => { const w = document.querySelector(s); w.scrollTop = w.scrollHeight * 0.7; }, ws);
  await frames(3);
  const counters = await page.evaluate(() => {
    const out = [];
    const count = [0, 0, 0, 0, 0];
    for (const el of document.getElementById('editor').children) {
      const isH = /^H[1-5]$/.test(el.tagName) && !el.classList.contains('ft-title');
      const hs = isH ? [el] : [...el.querySelectorAll('h1, h2, h3, h4, h5')].filter((h) => !h.classList.contains('ft-title'));
      const add = () => { for (const h of hs) { const i = Number(h.tagName[1]) - 1; count[i]++; for (let j = i + 1; j < 5; j++) count[j] = 0; } };
      if (isH) add();
      const cs = el.getAttribute('data-pm-cs');
      if (cs) out.push([cs, count.map((v, j) => `fth${j + 1} ${v}`).join(' ')]);
      if (!isH) add();
    }
    return out;
  });
  assert(counters.length >= 1, 'compteurs repris');
  for (const [got, want] of counters) assert.strictEqual(got, want);
  ok(`numéros des titres repris (${counters.map((x) => x[0].split(' ').slice(0, 4).join(' ')).join(' ; ')})`);

  // 9. Aller à un titre caché (plan, carte du temps…).
  const went = await page.evaluate(async (s) => {
    const hs = [...document.querySelectorAll('#editor > h2[data-pm-far]')];
    const h = hs[Math.floor(hs.length / 4)];
    h.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = h.getBoundingClientRect();
    const w = document.querySelector(s).getBoundingClientRect();
    return { hidden: h.hasAttribute('data-pm-far'), mid: Math.abs((r.top + r.bottom) / 2 - (w.top + w.bottom) / 2) };
  }, ws);
  assert(!went.hidden && went.mid < 30, `titre à l'écran : ${JSON.stringify(went)}`);
  ok('aller à un titre caché');

  // 11. Un document qui grandit (100 paragraphes, puis 60 de plus à la fin) passe à l'affichage partiel.
  const long = '<p>' + 'Texte de remplissage pour un paragraphe assez long. '.repeat(12) + '</p>';
  await page.evaluate((h) => window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } }), long.repeat(100));
  await frames(2);
  const before = await page.evaluate(() => window.FTVisibles.active());
  await page.evaluate((h) => {
    const v = window.FTMoteur.view;
    const slice = PM.model.DOMParser.fromSchema(v.state.schema).parseSlice(Object.assign(document.createElement('div'), { innerHTML: h }));
    v.dispatch(v.state.tr.setSelection(PM.state.Selection.atEnd(v.state.doc)).replaceSelection(slice).scrollIntoView());
  }, long.repeat(60));
  await frames(3);
  const grown = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    return { active: window.FTVisibles.active(), n: ed.childElementCount, shown: ed.querySelectorAll(':scope > :not([data-pm-far])').length, first: !ed.firstElementChild.hasAttribute('data-pm-far') };
  });
  assert(!before && grown.active && grown.shown < 60 && !grown.first, `document agrandi : ${JSON.stringify(grown)}`);
  ok(`document agrandi : ${grown.shown} blocs affichés sur ${grown.n}`);

  // 10. Le texte enregistré ne garde aucune marque d'affichage.
  const saved = await page.evaluate(() => window.FTEditor.getHtml());
  assert(!/data-pm-(far|sp|sb|cs)/.test(saved), 'marques absentes du texte enregistré');
  ok('texte enregistré sans marque d\'affichage');
};
