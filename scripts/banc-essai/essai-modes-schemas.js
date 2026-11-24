// Essai 2.4.23 :
// - outils propres à un mode grisés et inactifs dans l'autre (numéros de page, page de titre, réglages des
//   pages, tout le document en colonnes) ; le bouton « Numéros de page » ne change plus de mode ;
// - schémas : polices du logiciel proposées, posées dans le dessin affiché et exporté (pas dans le document).
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);

  await v(() => window.FTEditor.load({ content: { html: '<h1>Essai</h1><p>Texte.</p>' }, settings: { mode: 'note' } }));
  await page.waitForTimeout(500);
  const mode = () => v(() => document.querySelector('#mode-switch [aria-pressed="true"]').dataset.mode);
  const state = () => v(() => {
    const d = document.getElementById('pages-dialog');
    return {
      num: document.getElementById('pagenum-btn').disabled,
      numTitle: document.getElementById('pagenum-btn').title,
      cover: document.getElementById('cover-btn').disabled,
      tabs: [...d.querySelectorAll('.styles-tabs .pg-adv-only')].map((b) => b.disabled && b.inert),
      rows: [...d.querySelectorAll('.pg-row.pg-adv-only')].every((r) => r.inert),
      shown: [...d.querySelectorAll('.pg-adv-only')].filter((x) => !x.id).every((x) => getComputedStyle(x).display !== 'none')
    };
  });

  // Mode note.
  assert.strictEqual(await mode(), 'note');
  let s = await state();
  assert.ok(s.num && s.cover && s.tabs.length === 2 && s.tabs.every(Boolean) && s.rows && s.shown, JSON.stringify(s));
  assert.ok(/interface avancée/.test(s.numTitle), s.numTitle);
  await v(() => document.getElementById('pagenum-btn').click());
  await page.waitForTimeout(200);
  assert.strictEqual(await mode(), 'note', 'le bouton grisé ne change pas de mode');
  assert.ok(!(await v(() => document.getElementById('pages-dialog').open)));
  ok('mode note : numéros de page, page de titre et réglages des pages grisés et inactifs (visibles)');

  const layoutButtons = async () => {
    await v(() => document.getElementById('layout-btn').click());
    await page.waitForTimeout(150);
    const r = await v(() => [...document.querySelectorAll('#layout-pop .seg')][0].querySelectorAll('button').length + ':' +
      [...[...document.querySelectorAll('#layout-pop .seg')][0].querySelectorAll('button')].map((b) => b.disabled).join(','));
    await page.keyboard.press('Escape');
    await v(() => { document.getElementById('layout-pop').hidden = true; });
    return r;
  };
  assert.strictEqual(await layoutButtons(), '3:false,false,false');
  ok('mode note : « Tout le document » en colonnes disponible');

  // Mode avancé.
  await v(() => document.querySelector('#mode-switch [data-mode="avance"]').click());
  await page.waitForTimeout(600);
  s = await state();
  assert.ok(!s.num && !s.cover && s.tabs.every((x) => !x) && !s.rows, JSON.stringify(s));
  assert.ok(!/disponible dans l'interface avancée/.test(s.numTitle), s.numTitle);
  assert.strictEqual(await layoutButtons(), '3:true,true,true');
  ok('mode avancé : outils des pages actifs ; « Tout le document » en colonnes grisé');
  await v(() => document.getElementById('pagenum-btn').click());
  await page.waitForTimeout(200);
  assert.ok(await v(() => document.getElementById('pages-dialog').open));
  await v(() => document.getElementById('pages-dialog').close());
  ok('mode avancé : « Numéros de page » ouvre son onglet');

  // Schémas : polices.
  const fonts = await v(() => window.FTDiagram.fonts());
  assert.ok(fonts.includes('Segoe UI') && fonts.includes('Inter') && fonts.includes('Literata'), fonts.join(','));
  const r = await v(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="5" y="20" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">Titre</text><text x="5" y="35" font-family="Arial">Autre</text></svg>';
    const url = 'data:image/svg+xml;base64,' + btoa(svg);
    const fonted = await window.FTDiagram.withFonts(url);
    const out = fonted ? atob(fonted.split(',')[1]) : '';
    const plain = await window.FTDiagram.withFonts('data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Arial">x</text></svg>'));
    // Image du document : affichée avec ses polices, enregistrée sans.
    const img = document.createElement('img');
    img.src = window.FTLayout.imageUrl(url);
    await window.FTDiagram.fontify(img);
    const shown = img.getAttribute('src');
    return {
      faces: (out.match(/@font-face/g) || []).length, inter: /font-family:'Inter';font-weight:700/.test(out), woff2: /data:font\/woff2;base64,d09GMg/.test(out),
      plain, swapped: shown.startsWith('blob:') && shown !== window.FTLayout.imageUrl(url), saved: window.FTLayout.serialize(shown) === url
    };
  });
  assert.ok(r.faces === 1 && r.inter && r.woff2, JSON.stringify(r));
  assert.strictEqual(r.plain, null, 'police du système : rien à ajouter');
  assert.ok(r.swapped && r.saved, JSON.stringify(r));
  ok('schémas : polices du logiciel proposées ; Inter gras posé dans le dessin affiché, le document garde le dessin d’origine');

  // Export PDF : le dessin part avec sa police.
  await v(() => window.FTEditor.load({ content: { html: '<p>Avant.</p>' }, settings: { mode: 'note' } }));
  await page.waitForTimeout(300);
  const job = await v(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="5" y="20" font-family="Lora, Segoe UI, Arial, sans-serif" font-size="14">Lora</text></svg>';
    const box = document.createElement('div');
    box.innerHTML = `<p><img src="data:image/svg+xml;base64,${btoa(svg)}"></p>`;
    await window.FTDiagram.fontifyAll(box);
    return atob(box.querySelector('img').getAttribute('src').split(',')[1]);
  });
  assert.ok(/font-family:'Lora';font-weight:400;font-style:normal/.test(job), job.slice(0, 300));
  ok('exports : les schémas d’une copie du document reçoivent leurs polices');
};
