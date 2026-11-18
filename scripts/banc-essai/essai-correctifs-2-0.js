// Corrections de la version 2.0.1 : sélection de plusieurs cases d'un tableau, numéros de page du plan au
// retour en mode note, page de titre sur toute la feuille, page de titre poussée en page 2 après un
// changement de document pendant la saisie d'un de ses champs.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-correctifs-2-0.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const LOREM = 'Chaque idée tranquille dévoile plusieurs mots et écoute le livre. Les fenêtres étranges portent cette ville claire autour de la saison. ';
  const load = async (html, mode = 'note', extra = {}) => {
    await page.keyboard.press('Escape');
    await v(([h, m, x]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m, ...x } });
      document.getElementById('page').hidden = false;
    }, [html, mode, extra]);
    await page.waitForTimeout(900);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));

  // 1. Cases sélectionnées à la souris : le voile couvre chaque case, pas toute la page.
  const rows = '<tr><td>a</td><td>b</td><td>c</td></tr>'.repeat(4);
  await load(`<p>${LOREM}</p><table class="ft-table" data-style="quadrille"><tbody>${rows}</tbody></table><p>Fin.</p>`);
  const cells = await page.$$('#editor td');
  const a = await cells[0].boundingBox();
  const b = await cells[4].boundingBox();
  await page.mouse.move(a.x + a.width / 2 - 30, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const veils = await v(() => [...document.querySelectorAll('#editor .selectedCell')].map((c) => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c, '::after');
    return { cell: [r.width, r.height], veil: [parseFloat(cs.width), parseFloat(cs.height)] };
  }));
  assert.strictEqual(veils.length, 4, JSON.stringify(veils));
  for (const x of veils) assert(Math.abs(x.cell[0] - x.veil[0]) < 2 && Math.abs(x.cell[1] - x.veil[1]) < 2, JSON.stringify(x));
  ok('glisser sur 2 × 2 cases : 4 cases voilées, chaque voile à la taille de sa case');

  // 2. Plan en mode avancé (numéros de page), puis mode note : les numéros disparaissent, et reviennent.
  const body = Array.from({ length: 6 }, (_, i) => `<h2>Partie ${i + 1}</h2>` + `<p>${LOREM.repeat(12)}</p>`).join('');
  await load('<div class="ft-toc" contenteditable="false"></div>' + body, 'avance');
  await v(() => window.FTToc.refresh());
  await page.waitForTimeout(1200);
  const nums = () => v(() => document.querySelectorAll('#editor .ft-toc-page').length);
  // (Une ligne par titre, et celle du nom du document.)
  assert.strictEqual(await nums(), 7);
  await page.click('#mode-switch button[data-mode="note"]');
  await page.waitForTimeout(900);
  assert.strictEqual(await nums(), 0);
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(1200);
  assert.strictEqual(await nums(), 7);
  await page.click('#mode-switch button[data-mode="note"]');
  await page.waitForTimeout(900);
  assert.strictEqual(await nums(), 0);
  assert(!/ft-toc-page/.test(await saved()), 'enregistré sans numéros');
  ok('plan : 7 numéros de page en mode avancé, aucun en mode note (deux allers-retours)');

  // 3. Page de titre : toute la feuille, marges comprises ; le texte reprend en haut de la page 2.
  const doc = '<h1 class="ft-title">Processus marchand</h1>' + `<p>${LOREM.repeat(4)}</p>`;
  await load(doc, 'avance', { tagsAfterCover: true });
  await v(() => window.FTCover.apply('nuit'));
  await page.waitForTimeout(900);
  const geo = () => v(() => {
    const p = document.getElementById('page').getBoundingClientRect();
    const c = document.querySelector('#editor > .ft-cover');
    const r = c && c.getBoundingClientRect();
    const g = window.FTPages._geo();
    const next = c && c.nextElementSibling.getBoundingClientRect();
    return r && { left: r.left - p.left, top: r.top - p.top, w: r.width, h: r.height, sheet: [g[0].w, g[0].h], next: next.top - p.top, ct2: g[1] && g[1].ct, sp: c.getAttribute('data-pm-sp') };
  });
  let st = await geo();
  assert(Math.abs(st.left) < 1 && Math.abs(st.top) < 1 && Math.abs(st.w - st.sheet[0]) < 1 && Math.abs(st.h - st.sheet[1]) < 2, JSON.stringify(st));
  assert(Math.abs(st.next - st.ct2) < 3 && !st.sp, JSON.stringify(st));
  ok(`page de titre : toute la feuille (${Math.round(st.w)} × ${Math.round(st.h)} px), texte en haut de la page 2`);

  // 4. Champ de la page de titre en cours d'écriture, puis autre document : rien n'y passe, et une page de
  // titre insérée ensuite reste en page 1. Avant d'enregistrer, le champ est repris dans le texte.
  await page.keyboard.type(' 2026');
  assert(await v(() => window.FTObjets.busy()), 'champ en cours d\'écriture');
  await v(() => window.FTObjets.finishCaption());
  assert.match(await saved(), /data-field="titre"[^>]*>Processus marchand 2026</);
  await v(() => { const t = document.querySelector('#editor .ft-cover [data-field="soustitre"]'); t.focus(); });
  await page.keyboard.type('Brouillon');
  assert(await v(() => window.FTObjets.busy()), 'champ en cours d\'écriture');
  await load(doc, 'avance', { tagsAfterCover: true });
  assert.strictEqual(await saved(), doc);
  await v(() => window.FTCover.apply('diagonale'));
  await page.waitForTimeout(900);
  st = await geo();
  assert(Math.abs(st.top) < 1 && !st.sp && Math.abs(st.next - st.ct2) < 3, JSON.stringify(st));
  ok('champ de la page de titre repris avant l\'enregistrement ; changement de document pendant la saisie : document ouvert intact, page de titre insérée ensuite en page 1');

  // Retirée puis remise : la première page est refaite à chaque fois.
  await page.mouse.click(5, 5);
  await v(() => window.FTCover.remove());
  await page.waitForTimeout(900);
  assert(!(await v(() => document.getElementById('page').classList.contains('pg-cover'))));
  await v(() => window.FTCover.apply('classique'));
  await page.waitForTimeout(900);
  st = await geo();
  assert(Math.abs(st.top) < 1 && !st.sp && Math.abs(st.next - st.ct2) < 3, JSON.stringify(st));
  ok('page de titre retirée puis remise : toujours en page 1, texte en haut de la page 2');
};
