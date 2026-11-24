// Mode maths : interrupteur (l'un ou l'autre avec le mode raccourcis), barre d'équation au clic dans le
// texte, morceaux des équations écrites (réinsérés d'un clic, ajoutés à la main), liste des équations du
// document (y aller, en insérer une copie). Le volet reste au milieu de la zone visible.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-mode-maths.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const F = (o) => v((x) => window.FTFormules.html(x), o);
  const latexes = () => v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => m.dataset.latex));
  const field = () => v(() => { const f = document.querySelector('#editor math-field'); return f ? f.value : null; });
  await v(() => localStorage.removeItem('ft-maths-morceaux'));
  const html = '<p>Un capital placé au taux r devient ' + await F({ latex: 'C_n=C_0(1+r)^n' }) + '.</p>'
    + await F({ latex: 'V=a\\frac{1-(1+r)^{-n}}{r}', block: true, numbered: true, align: 'gauche' })
    + '<p>Suite du texte.</p>' + '<p>Ligne.</p>'.repeat(40);
  await v((h) => { window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } }); document.getElementById('page').hidden = false; }, html);
  await page.waitForTimeout(300);

  // 1. Interrupteur : volet affiché ; le mode raccourcis l'arrête, et inversement.
  await page.click('#mathmode-switch button[data-maths="on"]');
  await page.waitForTimeout(300);
  const st = () => v(() => [window.FTModeMaths.on(), window.FTToolbar.isSide(), !document.getElementById('maths-panel').hidden]);
  assert.deepStrictEqual(await st(), [true, false, true]);
  assert.strictEqual(await v(() => document.querySelector('#mathmode-switch button[data-maths="on"]').getAttribute('aria-pressed')), 'true');
  await page.click('#sidemode-switch button[data-side="on"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await st(), [false, true, false]);
  await page.click('#mathmode-switch button[data-maths="on"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await st(), [true, false, true]);
  ok('interrupteur « Mode maths » : volet affiché ; mode raccourcis et mode maths s’excluent');

  // 2. Liste des équations du document, volet au milieu de la zone visible (même après défilement).
  const eqs = () => v(() => [...document.querySelectorAll('#maths-panel .mp-eq')].map((r) => (r.querySelector('.mp-eq-num') || {}).textContent || '-'));
  assert.deepStrictEqual(await eqs(), ['-', '(1)']);
  const mid = () => v(() => {
    const p = document.getElementById('maths-panel').getBoundingClientRect();
    const w = document.getElementById('workspace').getBoundingClientRect();
    return Math.round((p.top + p.bottom) / 2 - (w.top + w.bottom) / 2);
  });
  const m1 = await mid();
  await v(() => { document.getElementById('workspace').scrollTop += 300; });
  await page.waitForTimeout(200);
  assert.ok(Math.abs(m1) < 30 && Math.abs(await mid()) < 30, `milieu ${m1}`);
  await v(() => { document.getElementById('workspace').scrollTop = 0; });
  ok('liste des équations (sans numéro, (1)) ; volet au milieu de la zone visible, même après défilement');

  // 3. Barre au clic dans le texte : fraction, Tab vers la case suivante ; morceaux ajoutés à la fin.
  const last = await page.locator('#editor p').nth(1).boundingBox();
  await page.mouse.click(last.x + 140, last.y + last.height / 2);
  await page.waitForTimeout(200);
  assert.ok(await v(() => { const b = document.querySelector('.ft-maths-texte'); return !!b && !b.hidden; }), 'barre au clic');
  await v(() => [...document.querySelectorAll('.ft-maths-texte button')].find((b) => b.title === 'Fraction').click());
  await page.waitForTimeout(300);
  assert.match(await field(), /^\\frac\{\\placeholder\{\}\}\{\\placeholder\{\}\}$/);
  await page.keyboard.type('(1+r');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('^n');
  await page.keyboard.press('Tab');
  await page.keyboard.type('e^-x');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const added = (await latexes()).find((l) => l.startsWith('\\frac{\\left(1+r'));
  assert.ok(added, JSON.stringify(await latexes()));
  let pieces = await v(() => window.FTModeMaths.pieces().map((p) => p.latex));
  assert.ok(pieces.some((p) => /\(1\+r\\right\)\^\{n\}/.test(p)) && pieces.some((p) => /^e\^\{-x\}$/.test(p)), JSON.stringify(pieces));
  assert.ok(!(await v(() => { const b = document.querySelector('.ft-maths-texte'); return !b.hidden; })), 'barre cachée pendant l’écriture');
  ok(`barre au clic : fraction posée, Tab : case suivante ; morceaux gardés : ${pieces.join(' ; ')}`);

  // 4. Morceau réinséré d'un clic : dans l'équation en cours d'écriture, sinon dans une nouvelle.
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  const before = await field();
  await v(() => document.querySelector('#maths-panel .mp-piece').click());
  await page.waitForTimeout(100);
  const after = await field();
  assert.ok(after.length > before.length + 4 && /^C_\{?n\}?=/.test(after), after);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const n0 = (await latexes()).length;
  await v(() => {
    const w = window.FTMoteur.view;
    let at = 0;
    w.state.doc.forEach((n, off) => { if (n.textContent === 'Suite du texte.') at = off + n.nodeSize - 1; });
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, at)));
    w.focus();
  });
  await v(() => document.querySelector('#maths-panel .mp-piece').click());
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.strictEqual((await latexes()).length, n0 + 1, 'nouvelle équation');
  ok('morceau réinséré d’un clic : dans l’équation en cours, ou nouvelle équation au curseur');

  // 5. Ajout à la main (☆ de la barre de l'équation, clic droit) : morceau épinglé, gardé.
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  await v(() => [...document.querySelectorAll('.ft-math-bar:not(.ft-maths-texte) button')].find((b) => b.textContent.includes('Morceau')).click());
  await page.keyboard.press('Escape');
  pieces = await v(() => window.FTModeMaths.pieces());
  assert.ok(pieces[0].pin && /^C_\{?n/.test(pieces[0].latex), JSON.stringify(pieces[0]));
  const box = await page.locator('#editor div.ft-math').boundingBox();
  await page.mouse.click(box.x + 40, box.y + box.height / 2, { button: 'right' });
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('Ajouter aux morceaux')).click());
  pieces = await v(() => window.FTModeMaths.pieces());
  assert.ok(pieces[0].pin && /^V=a/.test(pieces[0].latex) && pieces.length <= 10);
  await v(() => window.FTModeMaths.save('\\alpha'));
  for (let i = 0; i < 12; i++) await v((k) => window.FTModeMaths.save(`x_{${k}}+1`), i);
  pieces = await v(() => window.FTModeMaths.pieces());
  assert.strictEqual(pieces.length, 10, '10 morceaux au plus');
  ok('ajout à la main (☆ dans la barre de l’équation, clic droit sur une équation) : morceaux épinglés ; 10 au plus');

  // 6. Liste des équations : y aller, copie insérée au curseur.
  await v(() => { document.getElementById('workspace').scrollTop = 99999; });
  await page.waitForTimeout(200);
  await v(() => document.querySelectorAll('#maths-panel .mp-eq-go')[1].click());
  await page.waitForTimeout(400);
  const seen = await v(() => {
    const r = document.querySelector('#editor div.ft-math').getBoundingClientRect();
    const w = document.getElementById('workspace').getBoundingClientRect();
    return r.top >= w.top && r.bottom <= w.bottom;
  });
  assert.ok(seen, 'équation amenée à l’écran');
  const n1 = (await latexes()).length;
  await v(() => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 3)));
    w.focus();
  });
  await v(() => document.querySelectorAll('#maths-panel .mp-eq-copy')[0].click());
  await page.waitForTimeout(300);
  assert.strictEqual((await latexes()).length, n1 + 1);
  const ls = await latexes();
  assert.strictEqual(ls[0], ls[1], 'copie de la première équation');
  ok(`liste des équations : y aller, copie insérée au curseur (${n1 + 1} équations)`);

  // 7. Arrêt : volet et barre retirés.
  await page.click('#mathmode-switch button[data-maths="off"]');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await st(), [false, false, false]);
  ok('mode arrêté : volet retiré');
};
