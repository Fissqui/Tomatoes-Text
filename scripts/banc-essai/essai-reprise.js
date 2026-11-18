// Reprise d'un document là où on s'est arrêté (version 2.2.2), fenêtre en bas à droite fermée au clic ou après 5 s (2.2.8) : curseur et défilement rétablis en
// rouvrant un document en mode avancé (autre document entre-temps, relancement), petite fenêtre « Dernière modification ».
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-reprise.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const files = await v(async (lorem) => {
    const api = window.frameText;
    const make = async (title, html) => {
      const c = await api.createDoc(title);
      c.doc.content = { ...c.doc.content, html };
      if (title === 'Long') c.doc.settings = { ...c.doc.settings, mode: 'avance' };
      await api.saveDoc(c.fileName, c.doc);
      return c.fileName;
    };
    let long = '';
    for (let i = 0; i < 60; i++) long += `<p>Paragraphe ${i}. ${lorem}</p>`;
    return { a: await make('Long', long), b: await make('Court', '<p>Court.</p>') };
  }, LOREM);
  await page.reload();
  await page.waitForTimeout(1800);
  const names = { [files.a]: 'Long', [files.b]: 'Court' };
  const open = async (f) => {
    if (await v(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
    await page.click(`#sidebar .doc-item .name >> text="${names[f]}"`);
    await page.waitForTimeout(500);
  };
  const note = () => v(() => { const n = document.getElementById('place-note'); return n && !n.hidden ? n.textContent : null; });
  await open(files.a);
  assert.strictEqual(await note(), null, 'pas de fenêtre au premier passage');
  // Curseur dans le paragraphe 40, page défilée.
  await v(() => {
    const p = [...document.querySelectorAll('#editor p')].find((e) => e.textContent.startsWith('Paragraphe 40.'));
    const view = window.FTMoteur.view;
    window.FTMoteur.placeCaret(view.posAtDOM(p, 0) + 5);
    p.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(200);
  const before = await v(() => ({ caret: window.FTMoteur.caret(), scroll: document.getElementById('workspace').scrollTop }));
  assert(before.scroll > 300, JSON.stringify(before));
  await open(files.b);
  assert.strictEqual(await v(() => document.getElementById('workspace').scrollTop), 0);
  await open(files.a);
  const after = await v(() => ({ caret: window.FTMoteur.caret(), scroll: document.getElementById('workspace').scrollTop }));
  assert(after.caret === before.caret && Math.abs(after.scroll - before.scroll) < 3, JSON.stringify([before, after]));
  const text = await note();
  assert(/^Dernière modification aujourd’hui à \d\d:\d\dReprise à la dernière position$/.test(text), text);
  ok(`autre document puis retour : curseur (${after.caret}) et défilement (${Math.round(after.scroll)} px) rétablis ; « ${text.replace('Reprise', ' · Reprise')} »`);
  // En bas à droite de la fenêtre, hors de la barre d'outils ; reste ouverte pendant la frappe.
  const box = await v(() => { const r = document.getElementById('place-note').getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, top: r.top }; });
  assert(box.right < 40 && box.bottom < 80 && box.top > 300, JSON.stringify(box));
  await page.keyboard.press('ArrowRight');
  assert(await note(), 'fenêtre toujours là après une frappe');
  // Un clic ramène à la dernière modification et ferme la fenêtre.
  await v(() => { document.getElementById('workspace').scrollTop = 0; window.FTMoteur.placeCaret(1); });
  await page.click('#place-note');
  await page.waitForTimeout(200);
  const back = await v(() => ({ caret: window.FTMoteur.caret(), scroll: document.getElementById('workspace').scrollTop }));
  assert(back.caret === before.caret && back.scroll > 300, JSON.stringify(back));
  assert.strictEqual(await note(), null, 'fenêtre fermée au clic');
  ok(`fenêtre en bas à droite (${Math.round(box.right)} px, ${Math.round(box.bottom)} px des bords) ; un clic ramène à la dernière modification`);
  await open(files.b);
  await open(files.a);
  assert(await note());
  await page.waitForTimeout(5300);
  assert.strictEqual(await note(), null, 'fenêtre fermée après 5 s');
  ok('sans clic, la fenêtre se ferme après 5 s');
  // Relancement : le dernier document s'ouvre à sa place.
  before.scroll = await v(() => document.getElementById('workspace').scrollTop);
  await v(() => window.FTApp.menu('before-close'));
  await v(async () => { const s = await window.frameText.loadSettings(); s.welcomeAtStart = false; s.showWelcome = false; await window.frameText.saveSettings(s); });
  await page.reload();
  await page.waitForTimeout(1800);
  if (await v(() => !document.getElementById('welcome').hidden)) await open(files.a);
  const again = await v(() => ({ caret: window.FTMoteur.caret(), scroll: document.getElementById('workspace').scrollTop, name: document.getElementById('doc-name').textContent }));
  assert(again.caret === before.caret && Math.abs(again.scroll - before.scroll) < 40, JSON.stringify([before, again]));
  ok('après relancement : même place dans le document');
};
