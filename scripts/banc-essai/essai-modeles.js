// Essai des modèles de mise en page (version 2.1) : fenêtre et ses quatre modèles prêts, « Mémoire
// universitaire » sur un document vide (thème, pages, numéros, page de titre, sommaire sur sa page,
// structure type, titres sans numéro, chaque partie sur une nouvelle page), « Rapport » sur un document
// déjà écrit (texte gardé, en-tête au nom du document), nouveau document depuis « Lettre », « Roman »
// (A5, table des matières à la fin), réglage d'un modèle et « Mes modèles », fichier .ttmodele, réglage
// « Nouvelle page avant » dans les réglages des pages, exports PDF et Word, clic droit « Numéroter ce titre ».
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-modeles.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const settle = (ms = 900) => page.waitForTimeout(ms);
  const { handlers } = electron._test;
  // Fenêtre « Nom… » (FTApp.ask) : réponse tapée puis Entrée.
  const answer = async (text) => {
    await page.waitForSelector('#modal[open]');
    if (text !== null) await page.fill('#modal-input', text);
    await page.click('#modal-ok');
    await settle(600);
  };
  // État du document ouvert.
  const state = () => v(() => {
    const ed = document.getElementById('editor');
    const kids = [...ed.children].filter((c) => !c.classList.contains('ft-pg-gap'));
    const cfg = window.FTPages.getSettings();
    const P = window.FTPages;
    return {
      mode: cfg.mode,
      pages: cfg.pages,
      theme: window.FTTheme.get().id,
      themeName: window.FTTheme.get().name,
      tags: kids.map((c) => c.tagName.toLowerCase() + (c.className ? '.' + c.className.split(' ')[0] : '') + (c.hasAttribute('data-nonum') ? '!' : '') + (c.hasAttribute('data-pg-start') ? '^' : '')),
      texts: kids.map((c) => c.textContent.trim()),
      cover: (() => { const c = ed.querySelector(':scope > .ft-cover'); return c ? { model: c.dataset.model, titre: c.querySelector('[data-field="titre"]').textContent, mention: c.querySelector('[data-field="mention"]').textContent } : null; })(),
      toc: [...ed.querySelectorAll('.ft-toc .ft-toc-item')].map((r) => [...r.children].map((c) => c.textContent.trim()).join(' ')),
      tocLabel: (ed.querySelector('.ft-toc .ft-toc-label') || {}).textContent || '',
      pageOf: Object.fromEntries([...ed.querySelectorAll('h1:not(.ft-title), h2, .ft-toc')].map((h, i) => [i + ':' + (h.classList.contains('ft-toc') ? 'TOC' : h.textContent.trim()), P.pageNumberOf(h)])),
      count: P.pageCount(),
      headCount: document.querySelectorAll('#pg-over .pg-head:not([hidden])').length,
      head: ((document.querySelector('#pg-over .pg-head:not([hidden])') || {}).textContent || '').trim()
    };
  });

  // 1. Fenêtre : quatre modèles prêts, « Mémoire universitaire » choisi, résumé de ses réglages.
  assert(await v(() => !document.getElementById('layout-tab').hidden), 'bouton Modèle');
  await page.click('#layout-tab');
  await settle(300);
  let st = await v(() => ({
    open: document.getElementById('model-dialog').open,
    cards: [...document.querySelectorAll('#model-panel .md-card')].map((c) => c.querySelector('.theme-name').textContent),
    on: (document.querySelector('#model-panel .md-card.on .theme-name') || {}).textContent,
    sheets: document.querySelectorAll('#model-panel .md-card .md-sheet').length,
    covers: document.querySelectorAll('#model-panel .md-card .md-sheet .ft-cover').length,
    summary: [...document.querySelectorAll('#model-panel .md-summary dd')].map((d) => d.textContent),
    apply: document.getElementById('model-apply').textContent,
    check: (() => { const c = document.querySelector('#model-panel .md-structure input'); return c && c.checked && !c.disabled; })()
  }));
  assert(st.open && st.cards.join('|') === 'Mémoire universitaire|Roman|Rapport|Lettre' && st.on === 'Mémoire universitaire', JSON.stringify(st));
  assert(st.sheets >= 10 && st.covers === 3, JSON.stringify(st));
  assert(st.apply === 'Appliquer au document' && st.check, JSON.stringify(st));
  assert(/Académique/.test(st.summary[0]) && /A4, portrait, marges 25 \/ 25 \/ 30 \/ 25 mm/.test(st.summary[1]) && /dès la page 2/.test(st.summary[2]), JSON.stringify(st.summary));
  ok(`fenêtre : ${st.cards.join(', ')} ; aperçus (${st.sheets} feuilles) ; résumé « ${st.summary.slice(0, 3).join(' · ')} »`);
  await page.screenshot({ path: path.join(SHOTS, 'modeles-fenetre.png') });

  // 2. « Mémoire universitaire » sur le document vide : tout se règle d'un coup.
  await v(() => window.FTApp.setName('Les sols urbains'));
  await page.click('#model-apply');
  await settle(1500);
  st = await state();
  assert(!(await v(() => document.getElementById('model-dialog').open)));
  assert.strictEqual(st.mode, 'avance');
  assert.strictEqual(st.theme, 'academique');
  assert.deepStrictEqual(st.pages.margins, { top: 25, bottom: 25, left: 30, right: 25 });
  assert(st.pages.numbers.on && st.pages.numbers.from === 2 && st.pages.numbers.first === 1 && st.pages.chapters === 1 && st.pages.keep, JSON.stringify(st.pages));
  assert(st.cover && st.cover.model === 'academique' && st.cover.titre === 'Les sols urbains' && st.cover.mention === 'Mémoire de master', JSON.stringify(st.cover));
  assert.strictEqual(st.tags[0], 'div.ft-cover');
  assert.strictEqual(st.tags[1], 'div.ft-toc');
  assert.strictEqual(st.tags[2], 'h1!^', st.tags.join(' '));
  assert(!st.tags.includes('h1.ft-title'), 'titre du document retiré (repris par la page de titre)');
  assert.deepStrictEqual(st.texts.filter((t, i) => st.tags[i].startsWith('h')), ['Remerciements', 'Introduction', 'Titre de la première partie', 'Titre du premier chapitre', 'Titre du deuxième chapitre',
    'Titre de la deuxième partie', 'Titre du premier chapitre', 'Titre du deuxième chapitre', 'Conclusion', 'Bibliographie', 'Annexes']);
  assert.strictEqual(st.tocLabel, 'Sommaire');
  const tocText = st.toc.join(' | ');
  assert(/^Remerciements \d+ \| Introduction \d+ \| 1\. Titre de la première partie \d+ \| 1\.1\. Titre du premier chapitre \d+/.test(tocText), tocText);
  assert(/2\. Titre de la deuxième partie/.test(tocText) && /Conclusion \d+ \| Bibliographie \d+ \| Annexes \d+$/.test(tocText), tocText);
  // Pages : page de titre (1), sommaire (2), chaque titre 1 sur une nouvelle page ; numéros à partir de la page 2.
  const po = Object.values(st.pageOf);
  const keys = Object.keys(st.pageOf);
  assert.strictEqual(po[0], 1, JSON.stringify(st.pageOf));
  const h1Pages = keys.map((k, i) => [k, po[i]]).filter(([k]) => /Remerciements|Introduction|partie|Conclusion|Bibliographie|Annexes/.test(k)).map(([, p]) => p);
  assert(h1Pages.every((p, i) => i === 0 || p === h1Pages[i - 1] + 1), JSON.stringify(st.pageOf));
  assert.strictEqual(h1Pages[0], 2, JSON.stringify(st.pageOf));
  assert(st.count >= 9, 'pages ' + st.count);
  ok(`Mémoire : mode avancé, thème « ${st.themeName} », marges 25/25/30/25, page de titre (« ${st.cover.mention} »), sommaire en page 2, ${st.count} pages, chaque partie sur sa page`);
  ok(`sommaire : ${st.toc.slice(0, 4).join(' | ')}… (Introduction, Conclusion, Bibliographie sans numéro)`);
  await page.screenshot({ path: path.join(SHOTS, 'modeles-memoire.png') });
  st = await v(() => ({ top: document.getElementById('workspace').scrollTop, caret: (() => { const s = window.getSelection(); const n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement); return n && n.closest('h1') ? n.closest('h1').textContent : ''; })() }));
  assert(st.top < 5 && st.caret === 'Remerciements', JSON.stringify(st));
  ok('document montré depuis la page de titre, curseur au début de la structure type');

  // 3. Clic droit sur un titre numéroté : « Numéroter ce titre » (coché) ; décoché, le titre perd son numéro.
  const menuClick = async (selector, label) => {
    const r = await v((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; }, selector);
    await page.mouse.click(r.x, r.y);
    await page.mouse.click(r.x, r.y, { button: 'right' });
    await settle(200);
    const items = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent));
    const item = items.find((t) => t.includes(label));
    assert(item, items.join(' | '));
    await page.click(`#context-menu button:has-text("${label}")`);
    await settle(800);
    return item;
  };
  // (Introduction : 2e titre 1, sans numéro dans le modèle.)
  let item = await menuClick('#editor h1[data-nonum]:not(.ft-title):nth-of-type(2)', 'Numéroter ce titre');
  assert(!item.startsWith('✓'), item);
  st = await state();
  assert(/^Remerciements \d+ \| 1\. Introduction \d+ \| 2\. Titre de la première partie \d+ \| 2\.1\. Titre du premier chapitre/.test(st.toc.join(' | ')), st.toc.join(' | '));
  assert(/counter/.test(await v(() => getComputedStyle(document.querySelectorAll('#editor h1:not(.ft-title)')[1], '::before').content)), 'numéro affiché');
  ok('clic droit « Numéroter ce titre » sur Introduction : « 1. Introduction », les parties suivantes deviennent 2. et 3. (texte et sommaire)');
  item = await menuClick('#editor h1:not([data-nonum]):not(.ft-title)', 'Numéroter ce titre');
  assert(item.startsWith('✓'), item);
  st = await state();
  assert(/^Remerciements \d+ \| Introduction \d+ \| 1\. Titre de la première partie/.test(st.toc.join(' | ')), st.toc.join(' | '));
  assert.strictEqual(await v(() => getComputedStyle(document.querySelectorAll('#editor h1:not(.ft-title)')[1], '::before').content), 'none');
  ok('décoché : Introduction de nouveau sans numéro');

  // 4. PDF et Word : chaque titre 1 commence une page.
  const job = await v(() => window.FTPdf.build());
  assert(/#editor > :is\(h1\):not\(\.ft-title\) \{ break-before: page; \}/.test(job.html), 'PDF : saut avant les titres 1');
  assert(/data-pg-start/.test(job.html) && job.cover, 'PDF : page de titre, sommaire sur sa page');
  const bytes = await v(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  // (Les 7 titres 1 ; le sommaire suit la page de titre, qui est une section Word à part.)
  const breaks = (xml.match(/<w:pageBreakBefore\/>/g) || []).length;
  assert.strictEqual(breaks, 7, 'Word : sauts de page ' + breaks);
  ok(`PDF : saut de page avant chaque titre 1 ; Word : ${breaks} sauts de page (un par titre 1)`);

  // 5. « Rapport » sur un document déjà écrit : texte gardé, page de titre et sommaire ajoutés, pas de structure type.
  await v(() => { window.FTApp.menu('new'); });
  await answer('Bilan annuel');
  await v(() => {
    const ed = document.getElementById('editor');
    let html = '<h1 class="ft-title">Bilan annuel</h1>';
    for (const t of ['Activité', 'Finances', 'Perspectives']) html += `<h1>${t}</h1>` + '<p>Texte du rapport, déjà écrit avant le choix du modèle. </p>'.repeat(3);
    ed.innerHTML = html;
    ed.dispatchEvent(new Event('input'));
  });
  await settle(500);
  await page.click('#layout-tab');
  await settle(300);
  await page.click('#model-panel .md-card[data-model="rapport"]');
  st = await v(() => ({ check: document.querySelector('#model-panel .md-structure input').disabled, label: document.querySelector('#model-panel .md-structure').textContent }));
  assert(st.check && /document vide uniquement/.test(st.label), JSON.stringify(st));
  await page.click('#model-apply');
  await settle(1500);
  st = await state();
  assert.strictEqual(st.theme, 'rapport');
  // (Sommaire sous le titre du document, le texte reprend sur une nouvelle page.)
  assert.deepStrictEqual(st.tags.slice(0, 4), ['div.ft-cover', 'h1.ft-title', 'div.ft-toc', 'h1^']);
  assert.deepStrictEqual([st.texts[1], ...st.texts.slice(3)].filter((t, i, a) => a.indexOf(t) === i).slice(0, 4), ['Bilan annuel', 'Activité', 'Texte du rapport, déjà écrit avant le choix du modèle.', 'Finances']);
  assert(!st.texts.includes('Synthèse'), 'pas de structure type dans un document écrit');
  assert(/^1\. Activité \d+ \| 2\. Finances \d+ \| 3\. Perspectives \d+$/.test(st.toc.join(' | ')), st.toc.join(' | '));
  assert(st.pages.numbers.format === 'page-sur' && st.pages.numbers.pos === 'bas-droite', JSON.stringify(st.pages.numbers));
  assert(/Bilan annuel/.test(st.pages.header.html) && /text-align: right/.test(st.pages.header.html), st.pages.header.html);
  assert(st.headCount >= 1 && st.head === 'Bilan annuel', JSON.stringify([st.headCount, st.head]));
  ok(`Rapport sur un document écrit : texte gardé, page de titre et sommaire ajoutés (${st.toc.join(' | ')}), en-tête « ${st.head} »`);
  await page.screenshot({ path: path.join(SHOTS, 'modeles-rapport.png') });

  // 6. Nouveau document depuis « Lettre » (Fichier > Nouveau document depuis un modèle…).
  await v(() => window.FTApp.menu('new-model'));
  await settle(300);
  assert.strictEqual(await v(() => document.getElementById('model-apply').textContent), 'Créer le document');
  await page.click('#model-panel .md-card[data-model="lettre"]');
  await page.click('#model-apply');
  await answer('Lettre à la mairie');
  await settle(1200);
  st = await state();
  assert.strictEqual(await v(() => window.FTApp.docName()), 'Lettre à la mairie');
  assert(!st.cover && !st.toc.length, 'ni page de titre ni sommaire');
  assert(st.tags.every((t) => t === 'p'), st.tags.join(' '));
  const year = String(new Date().getFullYear());
  const letter = await v(() => [...document.querySelectorAll('#editor > p')].map((p) => ({ html: p.innerHTML, style: p.getAttribute('style') || '' })));
  assert(/^Prénom Nom<br>Adresse<br>Code postal Ville/.test(letter[0].html), letter[0].html);
  assert(letter.some((p) => /margin-left: 50%/.test(p.style) && /Nom du destinataire/.test(p.html)), 'destinataire');
  assert(letter.some((p) => /text-align: right/.test(p.style) && new RegExp('Ville, le \\d+ \\S+ ' + year).test(p.html)), 'lieu et date');
  assert(letter.some((p) => /<strong>Objet\s*:/.test(p.html)), 'objet');
  assert(st.pages.numbers.from === 2 && st.pages.numbers.first === 2 && st.pages.numbers.format === 'sur', JSON.stringify(st.pages.numbers));
  assert(await v(() => { const s = window.getSelection(); return s.rangeCount && document.querySelector('#editor > p').contains(s.anchorNode); }), 'curseur dans le premier paragraphe');
  assert.strictEqual(st.count, 1);
  ok(`Lettre : nouveau document « Lettre à la mairie », ${letter.length} paragraphes (expéditeur, destinataire, date du jour, objet, signature), une page sans numéro`);
  await page.screenshot({ path: path.join(SHOTS, 'modeles-lettre.png') });

  // 7. « Roman » (double-clic) : A5, sans alinéa de thème, table des matières à la fin sur sa page, en-tête au titre.
  await v(() => { window.FTApp.menu('new'); });
  await answer('La Maison du lac');
  await page.click('#layout-tab');
  await settle(300);
  await page.dblclick('#model-panel .md-card[data-model="roman"]');
  await settle(1500);
  // Le premier chapitre déborde sur plusieurs pages.
  await v(() => {
    const ed = document.getElementById('editor');
    const p = ed.querySelector('h1:not(.ft-title) + p');
    p.textContent = 'Il était une fois une maison au bord du lac. '.repeat(60);
    ed.dispatchEvent(new Event('input'));
  });
  await settle(1500);
  st = await state();
  assert.strictEqual(st.theme, 'roman');
  assert(st.pages.size === 'A5' && st.pages.w === 148 && st.pages.h === 210, JSON.stringify(st.pages));
  assert.strictEqual(st.cover.model, 'edition');
  assert.strictEqual(st.tags[st.tags.length - 1], 'div.ft-toc^', st.tags.join(' '));
  assert(/^I\. Titre du chapitre \d+ \| II\. Titre du chapitre \d+$/.test(st.toc.join(' | ')), st.toc.join(' | '));
  const rp = Object.values(st.pageOf);
  assert(rp[1] > rp[0] + 1 && rp[2] > rp[1], JSON.stringify(st.pageOf));
  // Aucun thème ne porte d'alinéa : le retrait reste un réglage du texte (bouton « Alinéa automatique »).
  assert(await v(() => !('indent' in window.FTTheme.get().text) && ![...document.querySelectorAll('head style')].some((x) => /#editor > p \{ text-indent/.test(x.textContent))), 'pas d\'alinéa de thème');
  // Document d'avant 2.4.8 dont le thème portait un alinéa : l'alinéa n'est plus repris.
  assert(await v(() => { const t = window.FTTheme.normalize({ ...window.FTTheme.get(), text: { ...window.FTTheme.get().text, indent: 'alinea' } }); return !('indent' in t.text); }), 'ancien alinéa de thème ignoré');
  assert(st.head === 'La Maison du lac' && /<em>La Maison du lac<\/em>/.test(st.pages.header.html), st.pages.header.html);
  ok(`Roman : A5, sans alinéa de thème, chapitre II sur une nouvelle page (pages ${rp.join(', ')}), table des matières à la fin sur sa page`);
  await page.screenshot({ path: path.join(SHOTS, 'modeles-roman.png') });

  // 8. Réglages des pages : « Nouvelle page avant » (aucun titre, titres 1, titres 1 et 2).
  await page.click('#page-setup');
  await settle(200);
  assert.strictEqual(await v(() => document.getElementById('pg-chapters').value), '1');
  await page.selectOption('#pg-chapters', '0');
  await settle(1200);
  st = await state();
  const flat = Object.values(st.pageOf);
  assert(flat[2] === flat[1] || flat[2] === flat[1] + 1, JSON.stringify(st.pageOf));
  assert.strictEqual(st.pages.chapters, 0);
  await page.selectOption('#pg-chapters', '1');
  await page.click('#pg-close');
  await settle(1200);
  ok('réglages des pages : « Nouvelle page avant » retiré puis remis');

  // 9. Régler un modèle, l'enregistrer dans Mes modèles, l'appliquer.
  await page.click('#layout-tab');
  await settle(300);
  await page.click('#model-panel .md-card[data-model="rapport"]');
  await page.click('#model-dialog .styles-tabs button[data-tab="regler"]');
  await settle(200);
  const setField = async (label, value) => {
    const handle = await page.evaluateHandle((l) => [...document.querySelectorAll('#model-panel .md-field')].find((f) => f.firstChild.textContent === l), label);
    const input = await handle.$('input, select');
    if ((await input.evaluate((e) => e.tagName)) === 'SELECT') await input.selectOption(value);
    else { await input.fill(value); await input.press('Tab'); }
    await settle(200);
  };
  await setField('Sommaire', 'fin');
  await setField('Page de titre', 'moderne');
  await setField('Pied de page', 'Service des études');
  await v(() => {
    const i = document.querySelector('#model-panel .md-margins input');
    i.value = '35';
    i.dispatchEvent(new Event('change'));
  });
  await settle(200);
  st = await v(() => ({
    head: document.querySelector('#model-panel .th-current').textContent,
    summary: [...document.querySelectorAll('#model-panel .md-summary dd')].map((d) => d.textContent),
    sheets: document.querySelectorAll('#model-panel .md-sheets.big .md-sheet').length
  }));
  assert(/Rapport \(modifié\)/.test(st.head), st.head);
  assert(/marges 35 \/ 25/.test(st.summary[1]) && /pied de page/.test(st.summary[3]) && /Moderne/.test(st.summary[5]) && /À la fin/.test(st.summary[6]), JSON.stringify(st.summary));
  await page.screenshot({ path: path.join(SHOTS, 'modeles-regler.png') });
  await page.click('#model-panel .th-current button:has-text("Enregistrer dans Mes modèles")');
  await answer('Rapport du service');
  st = await v(() => ({ mine: window.FTModeles.mine().map((m) => m.name), cards: [...document.querySelectorAll('#model-panel .md-card')].length }));
  assert.deepStrictEqual(st.mine, ['Rapport du service']);
  const saved = await v(() => window.frameText.loadSettings());
  assert(Array.isArray(saved.layoutModels) && saved.layoutModels[0].name === 'Rapport du service' && saved.layoutModels[0].page.margins.top === 35, JSON.stringify(saved.layoutModels));
  ok('modèle réglé (marges, page de titre, sommaire à la fin, pied de page) et enregistré dans Mes modèles');

  // 10. Fichier .ttmodele : export, puis import (nom déjà pris : « (importé) »).
  const file = path.join(SHOTS, 'rapport-du-service.ttmodele');
  electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  await page.click('#model-panel .th-current button:has-text("Exporter")');
  await answer(null);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(data.format === 'tomatoes-text-modele' && data.model.name === 'Rapport du service' && data.model.theme.id === 'rapport' && data.model.toc.place === 'fin', JSON.stringify(data).slice(0, 300));
  await page.click('#model-import');
  await settle(400);
  st = await v(() => window.FTModeles.mine().map((m) => m.name));
  assert.deepStrictEqual(st, ['Rapport du service', 'Rapport du service (importé)']);
  ok(`fichier ${path.basename(file)} exporté (${fs.statSync(file).size} octets) puis importé dans Mes modèles`);

  // Le modèle importé, appliqué à un nouveau document vide.
  await page.click('#model-dialog .styles-tabs button[data-tab="choisir"]');
  await settle(200);
  await page.click('#model-close');
  await v(() => { window.FTApp.menu('new'); });
  await answer('Étude de quartier');
  await page.click('#layout-tab');
  await settle(300);
  await page.locator('#model-panel .md-card').last().click();
  await page.click('#model-apply');
  await settle(1500);
  st = await state();
  assert(st.pages.margins.top === 35 && st.cover.model === 'moderne' && st.tags[st.tags.length - 1] === 'div.ft-toc^' && /Service des études/.test(st.pages.footer.html), JSON.stringify([st.pages.margins, st.cover, st.tags]));
  assert(st.texts.includes('Synthèse') && st.texts.includes('Recommandations'), 'structure type');
  ok('modèle importé appliqué : marges, page de titre « Moderne », sommaire à la fin, pied de page, structure type');

  // 11. « Reprendre la mise en page de ce document » : le modèle prend le thème, les pages, la page de titre.
  await page.click('#layout-tab');
  await settle(300);
  await page.click('#model-panel .md-card[data-model="lettre"]');
  await page.click('#model-panel .th-current button:has-text("Reprendre la mise en page")');
  await settle(200);
  st = await v(() => [...document.querySelectorAll('#model-panel .md-summary dd')].map((d) => d.textContent));
  assert(/Rapport/.test(st[0]) && /marges 35/.test(st[1]) && /Moderne/.test(st[5]) && /À la fin, sur une page à part/.test(st[6]), JSON.stringify(st));
  ok('reprise de la mise en page du document : ' + st.slice(0, 2).join(' · '));
  await page.click('#model-close');
};
