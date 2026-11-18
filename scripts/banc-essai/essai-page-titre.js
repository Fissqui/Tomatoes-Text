// Essai de la page de titre : insertion depuis la fenêtre des modèles, saisie dans les champs,
// changement de modèle, mode avancé (première page entière, sans numéro), mode lecture,
// export Word et PDF (première page sans en-tête), suppression.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

const zipXml = async (bytes) => (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    let html = '<h1 class="ft-title">Étude des sols</h1>';
    for (let c = 1; c <= 3; c++) {
      html += `<h2>Partie ${c}</h2>`;
      for (let p = 0; p < 6; p++) html += `<p>Paragraphe ${c}.${p}. ` + 'Le texte du document suit la page de titre et commence sur une nouvelle page. '.repeat(5) + '</p>';
    }
    ed.innerHTML = html;
    ed.dispatchEvent(new Event('input'));
  });

  // La page de titre n'existe qu'en mode avancé (1.4.1).
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);

  // 1. Fenêtre des modèles : 8 vignettes, « Insérer ».
  await page.click('#cover-btn');
  await page.waitForTimeout(200);
  let st = await page.evaluate(() => ({
    open: document.getElementById('cover-dialog').open,
    cards: document.querySelectorAll('#cv-models .cv-card').length,
    ok: document.getElementById('cv-ok').textContent,
    remove: document.getElementById('cv-remove').hidden
  }));
  assert(st.open && st.cards === 60 && st.ok === 'Insérer' && st.remove, JSON.stringify(st));
  ok('fenêtre : 60 modèles en 8 familles, bouton « Insérer »');
  await page.screenshot({ path: path.join(SHOTS, 'titre-modeles.png') });
  await page.click('#cv-models .cv-card[data-model="moderne"]');
  await page.click('#cv-ok');
  await page.waitForTimeout(300);
  st = await page.evaluate(() => {
    const c = document.querySelector('#editor > .ft-cover');
    const f = (n) => c.querySelector(`[data-field="${n}"]`);
    return {
      first: document.getElementById('editor').firstElementChild === c, model: c && c.dataset.model,
      title: f('titre').textContent, date: f('date').textContent, author: f('auteur').innerHTML,
      focus: document.activeElement === f('titre'), ph: getComputedStyle(f('auteur'), '::before').content
    };
  });
  assert(st.first && st.model === 'moderne' && st.title === 'Étude des sols' && /\d{4}/.test(st.date) && st.author === '' && st.focus, JSON.stringify(st));
  assert(/Auteur/.test(st.ph), st.ph);
  ok(`insérée en tête (modèle moderne), titre « ${st.title} », date « ${st.date} », champ vide affiché « Auteur »`);

  // 2. Saisie : Entrée passe au champ suivant, Maj+Entrée revient à la ligne, rien ne sort du champ.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('et des eaux');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rapport final');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Camille Martin');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('n');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Laboratoire des sols');
  st = await page.evaluate(() => {
    const c = document.querySelector('#editor > .ft-cover');
    const f = (n) => c.querySelector(`[data-field="${n}"]`);
    return { title: f('titre').innerHTML, sub: f('soustitre').textContent, author: f('auteur').textContent, head: f('surtitre').textContent,
      fields: c.querySelectorAll('.ft-cover-field').length, blocks: c.querySelectorAll('p, div, h1, h2, ul').length };
  });
  assert(/Étude des sols<br>et des eaux/.test(st.title) && st.sub === 'Rapport final' && st.author === 'Camille Martin' && st.head === 'Laboratoire des sols', JSON.stringify(st));
  assert.strictEqual(st.fields, 6);
  assert.strictEqual(st.blocks, 9);
  ok('saisie : Maj+Entrée (2 lignes), Entrée et Tab (champ suivant), Maj+Tab (champ précédent), structure intacte');
  // « # » puis espace ne fait pas de titre dans un champ ; le collage arrive en texte seul.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Enter');
  await page.keyboard.type('# Version 2');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h2>Collé</h2><p>en deux</p>');
    dt.setData('text/plain', 'Collé\nen deux');
    document.querySelector('#editor .ft-cover [data-field="mention"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  st = await page.evaluate(() => ({ mention: document.querySelector('#editor .ft-cover [data-field="mention"]').innerHTML, h: document.querySelectorAll('#editor .ft-cover h1, #editor .ft-cover h2').length }));
  assert(st.mention === '# Version 2Collé en deux' && st.h === 0, JSON.stringify(st));
  ok('« # » sans effet et collage en texte seul dans un champ');
  // Entrée sur le dernier champ : le curseur passe au texte qui suit.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Avant-propos. ');
  st = await page.evaluate(() => { let n = document.querySelector('#editor > .ft-cover').nextElementSibling; while (n && n.classList.contains('ft-pg-gap')) n = n.nextElementSibling; return n.textContent.slice(0, 13); });
  assert.strictEqual(st, 'Avant-propos.');
  ok('Entrée sur le dernier champ : suite du texte');

  // 3. Clic droit : « Changer de modèle… » ; la fenêtre propose « Appliquer » et « Supprimer ».
  const box = await page.evaluate(() => { document.getElementById('workspace').scrollTop = 0; const r = document.querySelector('#editor .ft-cover').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await page.waitForTimeout(150);
  const items = await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent));
  assert(items.includes('Changer de modèle…') && items.includes('Supprimer la page de titre'), items.join(' | '));
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Changer de modèle…').click());
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ ok: document.getElementById('cv-ok').textContent, remove: document.getElementById('cv-remove').hidden, sel: document.querySelector('#cv-models [aria-selected="true"]').dataset.model }));
  assert(st.ok === 'Appliquer' && !st.remove && st.sel === 'moderne', JSON.stringify(st));
  await page.click('#cv-models .cv-card[data-model="classique"]');
  await page.click('#cv-ok');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ model: document.querySelector('#editor > .ft-cover').dataset.model, author: document.querySelector('#editor .ft-cover [data-field="auteur"]').textContent, n: document.querySelectorAll('#editor .ft-cover').length }));
  assert(st.model === 'classique' && st.author === 'Camille Martin' && st.n === 1, JSON.stringify(st));
  ok('clic droit > Changer de modèle : classique, texte gardé');
  await page.screenshot({ path: path.join(SHOTS, 'titre-note.png') });

  // Tous les modèles s'affichent sans déborder.
  for (const m of await page.evaluate(() => window.FTCover.models().map((x) => x.id))) {
    const r = await page.evaluate((model) => {
      const c = document.querySelector('#editor > .ft-cover');
      c.dataset.model = model;
      return { over: c.scrollHeight > c.clientHeight + 1, h: c.clientHeight };
    }, m);
    assert(!r.over && r.h > 500, m + ' ' + JSON.stringify(r));
  }
  await page.evaluate(() => { document.querySelector('#editor > .ft-cover').dataset.model = 'bandeau'; });
  ok('les 60 modèles tiennent dans la page');

  // 4. Mode avancé : la page de titre occupe la première page, sans numéro ; le texte commence page 2.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);
  st = await page.evaluate(() => {
    const geo = window.FTPages._geo();
    const o = document.getElementById('page').getBoundingClientRect().top;
    const c = document.querySelector('#editor > .ft-cover').getBoundingClientRect();
    const next = document.querySelector('#editor > .ft-cover ~ h1, #editor > .ft-cover ~ p').getBoundingClientRect();
    const nums = [...document.querySelectorAll('#pg-over .pg-num')].filter((n) => !n.hidden && n.offsetParent).map((n) => n.textContent);
    const p = document.getElementById('page').getBoundingClientRect();
    return { pages: geo.length, top: c.top - o, bottom: c.bottom - o, h: geo[0].h, left: c.left - p.left, width: c.width, w: geo[0].w, next: next.top - o, ct2: geo[1].ct, nums };
  });
  // (Toute la feuille, marges comprises.)
  assert(Math.abs(st.top) < 1 && Math.abs(st.bottom - st.h) < 2 && Math.abs(st.left) < 1 && Math.abs(st.width - st.w) < 1 && Math.abs(st.next - st.ct2) < 3, JSON.stringify(st));
  assert(st.nums.length === st.pages - 1 && st.nums[0] === '2', JSON.stringify(st.nums));
  ok(`mode avancé : toute la feuille 1 (${Math.round(st.width)} × ${Math.round(st.bottom - st.top)} px), texte en haut de la page 2, numéros à partir de « ${st.nums[0]} »`);
  await page.screenshot({ path: path.join(SHOTS, 'titre-avance.png') });

  // 5. Export Word : champs remplis seulement, saut de page après, première page sans pied de page.
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const xml = await zip.file('word/document.xml').async('string');
  const paras = xml.split('<w:p>').length + xml.split('<w:p ').length;
  assert(/Laboratoire des sols/.test(xml) && /Camille Martin/.test(xml) && !/Auteur<\/w:t>/.test(xml), 'textes');
  assert(/<w:titlePg\/>|<w:titlePg w:val="true"\/>|<w:titlePg w:val="1"\/>/.test(xml), 'titlePg');
  const afterCover = xml.slice(xml.indexOf('Avant-propos') - 1200, xml.indexOf('Avant-propos'));
  assert(/w:pageBreakBefore|w:type w:val="nextPage"/.test(afterCover) || /<w:sectPr/.test(afterCover), 'saut de page après la page de titre');
  const before = /<w:spacing[^>]* w:before="(\d+)"/.exec(xml.slice(xml.indexOf('<w:body>'), xml.indexOf('Laboratoire')));
  assert(before && Number(before[1]) > 1000, 'espace au-dessus : ' + (before && before[1]));
  assert(/w:fill="[0-9A-F]{6}"/i.test(xml.slice(xml.indexOf('Laboratoire'), xml.indexOf('Camille'))), 'bande de couleur du modèle bandeau');
  ok(`Word : ${paras} paragraphes, première page à part (titlePg), espace au-dessus ${before[1]} twips, bande colorée, saut de page`);

  // 5 bis. Chaque modèle passe dans Word : textes gardés ; sur fond de couleur, un tableau d'une case
  // de la hauteur de la page porte le fond, et le texte qui suit commence page 2.
  const FONDS = { degrade: 1, artdeco: 1, nuit: 1, botanique: 1, plan: 1, ardoise: 1, polar: 1, conte: 1, retro: 1, pop: 1, litterature: 1, nocturne: 1, jaquette: 1, arche: 1, 'cem-essai': 1, 'cem-rouge': 1, 'cem-reserve': 1, 'cem-pastille': 1, 'cem-affiche': 1, 'cem-aube': 1 };
  for (const m of await page.evaluate(() => window.FTCover.models().map((x) => x.id))) {
    await page.evaluate((model) => { document.querySelector('#editor > .ft-cover').dataset.model = model; }, m);
    const x = await zipXml(await page.evaluate(async () => Array.from(await window.FTWord.exportWord())));
    const head = x.slice(x.indexOf('<w:body>'), x.indexOf('Avant-propos'));
    assert(/Laboratoire des sols/.test(head) && /Camille Martin/.test(head), m + ' : textes');
    assert(/^cem-/.test(m) === /<w:drawing>/.test(head), m + ' : sigle');
    if (FONDS[m]) {
      assert(/<w:tbl>/.test(head) && /<w:trHeight [^>]*w:hRule="exact"/.test(head) && /<w:tcPr>[\s\S]*w:fill="[0-9A-F]{6}"/i.test(head), m + ' : tableau de fond');
    } else assert(!/<w:tbl>/.test(head), m + ' : pas de tableau');
  }
  await page.evaluate(() => { document.querySelector('#editor > .ft-cover').dataset.model = 'bandeau'; });
  ok('Word : les 60 modèles gardent leurs textes, sigle pour les essais du CEM ; fonds de couleur (dégradé, art déco, nuit, botanique, plan, ardoise, polar, conte, rétro, pop, littérature, nocturne, jaquette, arche, essais du CEM) sur toute la page');

  // 6. PDF : hauteur de la page de titre, saut de page, champs vides cachés ; première page à part.
  const job = await page.evaluate(() => window.FTPdf.build());
  assert(job.firstDifferent, 'firstDifferent');
  assert(/\.ft-cover \{ aspect-ratio: auto !important; height: 2\d\d\.\dmm/.test(job.html), 'hauteur');
  const { mergePdfs } = require(path.join(__dirname, '..', '..', 'src', 'pdf-merge.js'));
  const pp = await page.context().browser().newPage();
  const tmp = path.join(SHOTS, 'titre-export.html');
  fs.writeFileSync(tmp, job.html.replace(/<base href="[^"]*">/, `<base href="file://${path.join(__dirname, '..', '..', 'src', 'renderer')}/">`));
  await pp.goto('file://' + tmp);
  await pp.evaluate(() => document.fonts.ready);
  const mm = (v) => v + 'mm';
  const base = { width: mm(job.page.width), height: mm(job.page.height), printBackground: true,
    margin: { top: mm(job.page.margins.top), bottom: mm(job.page.margins.bottom), left: mm(job.page.margins.left), right: mm(job.page.margins.right) } };
  // (Page de titre à fond perdu : la première page est imprimée sans marges, comme dans main.js.)
  assert(job.cover, 'page de titre en tête');
  await pp.evaluate(() => document.documentElement.classList.add('ft-cover-bleed'));
  const first = await pp.pdf({ ...base, pageRanges: '1', margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } });
  await pp.evaluate(() => document.documentElement.classList.remove('ft-cover-bleed'));
  const rest = await pp.pdf({ ...base, pageRanges: '2-', displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: job.footer });
  const out = path.join(SHOTS, 'titre.pdf');
  fs.writeFileSync(out, mergePdfs(first, rest));
  await pp.close();
  const { execFileSync } = require('child_process');
  const info = execFileSync('pdfinfo', [out]).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const p1 = execFileSync('pdftotext', ['-f', '1', '-l', '1', '-layout', out, '-']).toString();
  const p2 = execFileSync('pdftotext', ['-f', '2', '-l', '2', '-layout', out, '-']).toString();
  assert(/tude des sols/i.test(p1) && /Camille Martin/.test(p1) && !/Avant-propos/.test(p1) && !/Auteur/.test(p1), p1);
  assert(/Avant-propos/.test(p2) && /\b2\b/.test(p2.trim().split('\n').pop()), p2.slice(-200));
  ok(`PDF : ${pages} pages, page de titre seule en page 1 (sans numéro), texte et numéro « 2 » en page 2`);

  // 7. Mode lecture : la page de titre occupe la première page du livre, sans champ vide ni modification.
  await page.evaluate(() => { document.querySelector('#editor .ft-cover [data-field="date"]').innerHTML = ''; });
  await page.click('#reading-btn');
  await page.waitForTimeout(700);
  st = await page.evaluate(() => {
    const c = document.querySelector('#editor > .ft-cover');
    const pg = document.getElementById('page').getBoundingClientRect();
    const next = c.nextElementSibling.getBoundingClientRect();
    return { ce: c.querySelector('[data-field="titre"]').getAttribute('contenteditable'), date: getComputedStyle(c.querySelector('[data-field="date"]')).display,
      nextLeft: next.left - pg.left, coverH: c.getBoundingClientRect().height, pageH: pg.height };
  });
  assert(st.ce === 'false' && st.date === 'none' && st.nextLeft > 100 && st.coverH > st.pageH * 0.9, JSON.stringify(st));
  // (Lecture en pages exactes : la couverture couvre toute la feuille de droite, sans bande au-dessus ;
  // numéros lus sur les feuilles de la double page.)
  const sheetsNow = () => page.evaluate(() => {
    const c = document.querySelector('#editor > .ft-cover').getBoundingClientRect();
    const sheets = [...document.querySelectorAll('#dp-sheets .dp-sheet')];
    const right = sheets[1].getBoundingClientRect();
    return { dTop: Math.abs(c.top - right.top), dLeft: Math.abs(c.left - right.left), dH: Math.abs(c.height - right.height),
      nums: sheets.map((s) => { const row = s.querySelector('.pg-num-row'); return row.hidden ? '' : row.textContent; }) };
  });
  st = await sheetsNow();
  assert(st.dTop < 1.5 && st.dLeft < 1.5 && st.dH < 1.5, JSON.stringify(st));
  assert(st.nums[0] === '' && st.nums[1] === '', JSON.stringify(st.nums));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  st = await sheetsNow();
  assert(st.nums[0] === '' && st.nums[1] === '2', JSON.stringify(st.nums));
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  ok('mode lecture : page de titre seule à droite, sur toute la feuille, sans numéro ; page suivante numérotée 2 ; champs fermés, date vide cachée');
  await page.screenshot({ path: path.join(SHOTS, 'titre-lecture.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({ ce: document.querySelector('#editor .ft-cover [data-field="titre"]').getAttribute('contenteditable'), locked: document.querySelectorAll('#editor [data-rd-locked]').length }));
  assert(st.ce === 'true' && st.locked === 0, JSON.stringify(st));
  ok('sortie du mode lecture : champs de nouveau modifiables');

  // 8. Enregistrement et réouverture : la page de titre revient telle quelle.
  const saved = await page.evaluate(() => (window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(document.getElementById('editor').innerHTML)));
  assert(/class="ft-cover" contenteditable="false" data-model="bandeau"/.test(saved) && !/ft-pg-gap/.test(saved), saved.slice(0, 200));
  ok('HTML enregistré : bloc ft-cover sans intercalaire');

  // 9. Suppression puis annulation.
  await page.evaluate(() => window.FTCover.remove());
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ n: document.querySelectorAll('#editor .ft-cover').length, nums: [...document.querySelectorAll('#pg-over .pg-num')].filter((n) => !n.hidden && n.offsetParent).map((n) => n.textContent)[0] }));
  assert(st.n === 0 && st.nums === '1', JSON.stringify(st));
  ok('suppression : plus de page de titre, numéro « 1 » sur la première page');
  await page.evaluate(() => window.__ftEmit('menu', ['undo']));
  await page.waitForTimeout(500);
  st = await page.evaluate(() => document.querySelectorAll('#editor > .ft-cover').length);
  assert.strictEqual(st, 1);
  ok('Annuler : la page de titre revient');
};
