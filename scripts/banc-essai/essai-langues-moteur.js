// Écriture dans le nouveau moteur, fin (préversion 2.0 n° 7) : orthographe, doublons, synonymes, langues
// du document et du paragraphe, aide au texte (AAT : synonymes, résumé), cohérence, lisibilité, source PDF
// côte à côte, colonnes (tout le document, passage, zone). Mesures sur un très long document (300 pages) :
// première vérification, frappe avec le correcteur, défilement, mot corrigé loin du début.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-langues-moteur.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
function corpus() {
  const dir = path.join(SRC, 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

// Petit PDF de deux pages (police Helvetica de base).
function makePdf(file) {
  const pages = [['Introduction', 'Les jardins familiaux ont longtemps nourri les villes ouvrieres.'], ['Chapitre premier', 'La tomate demande un sol riche et beaucoup de soleil.']];
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const lines of pages) {
    const text = lines.map((l, i) => `BT /F1 ${i ? 12 : 18} Tf 72 ${720 - i * 28} Td (${l}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add('<< /Title (Le potager ouvrier) /Author (Jean Dupont) /CreationDate (D:20190312120000) >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, out, 'latin1');
}

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  const reset = async (html, mode = 'note', settings = {}) => {
    await page.keyboard.press('Escape');
    await v(([h, m, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m, ...s } });
      window.FTLang.load(s);
      document.getElementById('page').hidden = false;
      window.__changes = 0;
    }, [html, mode, settings]);
    await frames(2);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const text = () => v(() => window.FTMoteur.view.state.doc.textContent);
  const depth = () => v(() => window.FTMoteur.undoDepth());
  const changes = () => v(() => window.__changes);
  const undo = () => v(() => window.FTMoteur.undo());
  const posOf = (t, after = 0) => v(([s, k]) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => {
      if (p === null && n.isText && n.text.includes(s)) p = q + n.text.indexOf(s) + k;
    });
    return p;
  }, [t, after]);
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const selectText = async (t) => { const a = await posOf(t); await select(a, a + t.length); };
  // Point à l'écran au milieu d'un mot du texte.
  const pointIn = async (t, k = 1) => {
    const p = await posOf(t, k);
    return v((q) => {
      const c = window.FTMoteur.view.coordsAtPos(q);
      return { x: c.left, y: (c.top + c.bottom) / 2 };
    }, p);
  };
  const menuAt = async (pt) => {
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(150);
    return v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  };
  const choose = (t) => page.click(`#context-menu button:has-text("${t}")`);
  const marks = (name) => v((n) => [...CSS.highlights.get(n)].map((r) => r.toString()).sort(), name);
  // Correcteur : vérification faite (réponses du dictionnaire comprises).
  const checked = async () => { await v(() => window.FTSpell.now()); await frames(1); };
  await v(() => { window.FTEditor.onChange(() => { window.__changes++; }); window.FTLayout.setCapitalize(false); });

  // 1. Orthographe et doublons : soulignés dans le texte du moteur, corrigés au clic droit.
  await reset('<h1 class="ft-title">Essai</h1><p>Le chat dort dans la maisson avec le le chien.</p><ul><li>Une ligne de liste sans fautte.</li></ul>' +
    '<table class="ft-table"><tbody><tr><td>Case sans erreurr</td></tr></tbody></table>');
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['erreurr', 'fautte', 'maisson']);
  assert.deepStrictEqual(await marks('ft-double'), ['le le']);
  ok('fautes soulignées dans un paragraphe, une liste et un tableau (maisson, fautte, erreurr) ; doublon « le le »');
  let items = await menuAt(await pointIn('maisson', 3));
  assert.ok(items[0] === 'maison' && items.includes('Ajouter « maisson » au dictionnaire') && items.includes('Synonymes…'), JSON.stringify(items));
  let d0 = await depth();
  await choose('maison');
  await checked();
  assert.ok((await text()).includes('dans la maison avec'));
  assert.deepStrictEqual(await marks('ft-spell'), ['erreurr', 'fautte']);
  assert.strictEqual(await depth(), d0 + 1);
  assert.ok(await changes() > 0);
  ok('clic droit : « ' + items.slice(0, 3).join(' / ') + ' »… ; mot remplacé, une étape d’annulation, document modifié');
  items = await menuAt(await pointIn('le chien', 1));
  assert.deepStrictEqual(items, ['Supprimer le doublon « le »', 'Ignorer']);
  await choose('Supprimer le doublon');
  await checked();
  assert.ok((await text()).includes('avec le chien.'));
  assert.deepStrictEqual(await marks('ft-double'), []);
  await undo();
  await checked();
  assert.ok((await text()).includes('avec le le chien.'));
  assert.deepStrictEqual(await marks('ft-double'), ['le le']);
  ok('doublon supprimé (« avec le chien »), puis rétabli par Ctrl+Z');
  items = await menuAt(await pointIn('erreurr', 2));
  await choose('Ajouter « erreurr »');
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['fautte']);
  ok('mot ajouté au dictionnaire personnel : plus souligné');

  // Le mot en cours de frappe n'est souligné qu'après une pause ou quand le curseur le quitte.
  await select(await posOf('chien.', 6));
  await page.keyboard.type(' Il dormm');
  await checked();
  assert.ok(!(await marks('ft-spell')).includes('dormm'), 'mot en cours');
  await page.keyboard.type(' bien');
  await checked();
  assert.ok((await marks('ft-spell')).includes('dormm'));
  ok('mot en cours de frappe pas souligné (« dormm »), souligné dès que l’on passe au mot suivant');

  // 2. Synonymes au clic droit sur un mot ordinaire, et menu du texte.
  items = await menuAt(await pointIn('chat', 2));
  assert.ok(items[0] === 'Synonymes…', JSON.stringify(items));
  const syn = await v(async ([x, y]) => {
    const it = window.FTSpell.synonymItems(x, y)[0];
    const list = await it.submenu();
    list[0].action();
    return list.map((i) => i.text);
  }, [(await pointIn('chat', 2)).x, (await pointIn('chat', 2)).y]);
  await page.keyboard.press('Escape');
  assert.ok(syn.length >= 2, JSON.stringify(syn));
  assert.ok((await text()).startsWith('EssaiLe ' + syn[0] + ' dort'), await text());
  ok('« Synonymes… » du mot sous la souris : ' + syn.slice(0, 4).join(', ') + ' ; « chat » remplacé par « ' + syn[0] + ' »');

  // 3. Langues du document : plusieurs langues, chaque passage vérifié dans la sienne.
  await reset('<h1 class="ft-title">Carnet de voyage</h1>' +
    '<p>Nous sommes partis tôt ce matin vers la montagne avec nos amis. Il faisait très beau et le cheminn était agréable. The weather in the mountains was absolutely wonderful today.</p>' +
    '<h2>Notes</h2>' +
    '<p>I will recieve the tickets tomorrow and we should leave early in the morning.</p>' +
    '<p>Wir haben heute einen langen Spaziergang am Fluss gemacht und viele Vögel gesehen. Das Wetter war schoen.</p>' +
    '<p>今天我们去市场买了一些新鲜的蔬菜和水果。</p>');
  assert.ok(!(await v(() => document.getElementById('status-lang').classList.contains('pv-off'))), 'barre d’état grisée');
  await v(() => window.__ftEmit('menu', ['languages']));
  await page.waitForTimeout(200);
  assert.ok(await v(() => document.getElementById('lang-dialog').open));
  for (const c of ['en', 'de', 'zh']) await page.check(`#lg-list input[value="${c}"]`);
  const c0 = await changes();
  await page.click('#lg-ok');
  assert.deepStrictEqual(await v(() => window.FTLang.list()), ['fr', 'en', 'de', 'zh']);
  assert.ok(await changes() > c0, 'document modifié');
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['cheminn', 'recieve', 'schoen']);
  ok('fenêtre « Langues du document » (document modifié) ; soulignés : cheminn, recieve, schoen (anglais, allemand, chinois vérifiés dans leur langue)');
  const langs = await v(() => {
    const S = window.FTSpell;
    const at = (w) => {
      let p = null;
      window.FTMoteur.view.state.doc.descendants((n, q) => { if (p === null && n.isText && n.text.includes(w)) p = q + n.text.indexOf(w); });
      return S.langAtPos(p);
    };
    return ['montagne', 'weather', 'Notes', 'tickets', 'Spaziergang', '蔬菜'].map(at);
  });
  assert.deepStrictEqual(langs, ['fr', 'en', 'fr', 'en', 'de', 'zh']);
  ok('langue de chaque passage : ' + langs.join(', ') + ' (le titre court « Notes » prend celle du paragraphe précédent)');
  await select(await posOf('Spaziergang', 2));
  await page.waitForTimeout(100);
  assert.strictEqual(await v(() => document.getElementById('status-lang').textContent), 'Allemand');
  ok('barre d’état : « Allemand » quand le curseur est dans le paragraphe allemand');

  // Langue fixée à la main (clic droit « Langue du paragraphe ») : une étape d'annulation, enregistrée.
  await select(await posOf('tickets', 2));
  d0 = await depth();
  items = await menuAt(await pointIn('tickets', 2));
  assert.ok(items.includes('Langue du paragraphe'), JSON.stringify(items));
  const fixed = await v(async () => {
    const it = window.FTLang.menuItems()[0];
    const sub = await it.submenu();
    sub.find((i) => i.text === 'Allemand').action();
    return sub.filter((i) => i.text).map((i) => i.text);
  });
  await page.keyboard.press('Escape');
  assert.ok(/<p lang="de-DE">I will recieve/.test(await saved()), await saved());
  assert.strictEqual(await depth(), d0 + 1);
  await checked();
  const now = await marks('ft-spell');
  assert.ok(now.includes('tickets') && now.includes('morning'), JSON.stringify(now));
  ok(`« Langue du paragraphe » : ${fixed.join(', ')} ; paragraphe anglais passé en allemand (lang="de-DE", une étape d’annulation) : ses mots anglais sont soulignés`);
  await v(async () => (await window.FTLang.menuItems()[0].submenu()).find((i) => i.text === 'Détection automatique').action());
  assert.ok(/<p>I will recieve/.test(await saved()));
  ok('« Détection automatique » : langue fixée retirée');
  // Mots d'une autre langue du document dans une phrase française : acceptés s'ils sont justes dans
  // l'une des langues du document ; propositions des deux langues, les plus proches en tête.
  const mixed = '<p>Nous avons organisé un workshop sur le deployment avec un feedback awesome dans la maisson, je vais le recieve demain.</p>';
  await reset(mixed, 'note', { languages: ['fr'] });
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['awesome', 'deployment', 'feedback', 'maisson', 'recieve', 'workshop']);
  await reset(mixed, 'note', { languages: ['fr', 'en'] });
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['maisson', 'recieve']);
  assert.strictEqual(await v(() => window.FTSpell.langAtPos(1)), 'fr');
  const t0 = Date.now();
  items = await menuAt(await pointIn('recieve', 3));
  for (let i = 0; i < 40 && !items.includes('receive'); i++) {
    await page.waitForTimeout(100);
    items = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  }
  const tMenu = Date.now() - t0;
  assert.strictEqual(items[0], 'receive', JSON.stringify(items));
  await page.keyboard.press('Escape');
  items = await menuAt(await pointIn('maisson', 3));
  assert.strictEqual(items[0], 'maison', JSON.stringify(items));
  await page.keyboard.press('Escape');
  ok('français + anglais : workshop, deployment, feedback, awesome acceptés dans une phrase française ; « recieve » → « receive » en tête (menu en ' + tMenu + ' ms), « maisson » → « maison »');
  // Langue choisie à la main pour le paragraphe : seule cette langue compte.
  await reset(mixed.replace('<p>', '<p lang="fr-FR">'), 'note', { languages: ['fr', 'en'] });
  await checked();
  assert.deepStrictEqual(await marks('ft-spell'), ['awesome', 'deployment', 'feedback', 'maisson', 'recieve', 'workshop']);
  ok('paragraphe mis en français à la main : les mots anglais restent soulignés');

  // Ligne de liste : la langue va sur la ligne (enregistrée), pas sur le paragraphe ajouté par le moteur.
  await reset('<ul><li>The weather was nice.</li><li>Second item.</li></ul>', 'note', { languages: ['fr', 'en'] });
  await select(await posOf('weather', 1));
  await v(async () => (await window.FTLang.menuItems()[0].submenu()).find((i) => i.text === 'Anglais').action());
  assert.ok(/<li lang="en-GB">The weather/.test(await saved()), await saved());
  ok('ligne de liste : lang="en-GB" posé sur la ligne (<li>), enregistré');

  // 4. Aide au texte (AAT) : synonymes de la sélection, remplacement, résumé écrit au curseur.
  await reset('<p>Le jardin est très joli au printemps quand les fleurs sortent.</p><p>Fin.</p>');
  assert.ok(!(await v(() => document.getElementById('assist-toggle').classList.contains('pv-off'))));
  await page.click('#assist-toggle');
  await page.waitForTimeout(200);
  await selectText('joli');
  let synBtns = [];
  for (let i = 0; i < 30 && !synBtns.length; i++) {
    await page.waitForTimeout(200);
    synBtns = await v(() => [...document.querySelectorAll('#assist-synonyms .synonym')].map((b) => b.textContent));
  }
  assert.ok(synBtns.length >= 2, 'synonymes de l’AAT');
  d0 = await depth();
  await page.click('#assist-synonyms .synonym >> nth=0');
  assert.ok((await text()).includes('est très ' + synBtns[0] + ' au'), await text());
  assert.strictEqual(await depth(), d0 + 1);
  ok('AAT : « joli » sélectionné → ' + synBtns.slice(0, 3).join(', ') + ' ; remplacé par « ' + synBtns[0] + ' », une étape d’annulation');
  const ctx = await v(() => window.FTSpell.contextAt(5, 11));
  assert.strictEqual(ctx.before, 'Le j');
  await page.click('#assist-close');
  await select(await posOf('Fin.', 4));
  await v(() => {
    document.getElementById('sum-text').textContent = 'Le jardin fleurit.\nLes fleurs sortent au printemps.';
    document.getElementById('summary-dialog').show();
    document.getElementById('sum-insert').click();
  });
  assert.ok(/<p>Fin\.<\/p><p>Le jardin fleurit\.<\/p><p>Les fleurs sortent au printemps\.<\/p>/.test(await saved()), await saved());
  ok('résumé « Écrire dans le document » : deux paragraphes écrits au curseur par le moteur');

  // 5. Cohérence et lisibilité : « Voir » sélectionne le passage dans le moteur ; « Tout écrire » corrige.
  await reset('<p>Mathilde arrive au village. Mathilde salue le maire. Mathilde repart le soir.</p><p>Le lendemain, Mathide revient avec son frère.</p>' +
    '<p>' + 'Une phrase de remplissage pour allonger le texte. '.repeat(3) + '</p>');
  await v(() => window.__ftEmit('menu', ['coherence']));
  await page.waitForTimeout(300);
  const rows = await v(() => [...document.querySelectorAll('#coherence-dialog .coh-item, #coherence-dialog li')].map((r) => r.textContent).join(' | '));
  assert.ok(/Mathide/.test(rows), rows);
  await page.click('#coherence-dialog button:has-text("Voir")');
  assert.strictEqual(await v(() => { const s = window.FTMoteur.view.state.selection; return window.FTMoteur.view.state.doc.textBetween(s.from, s.to); }), 'Mathide');
  d0 = await depth();
  await page.click('#coherence-dialog button:has-text("Tout écrire")');
  await page.waitForTimeout(50);
  assert.ok((await text()).includes('Le lendemain, Mathilde revient'));
  assert.strictEqual(await depth(), d0 + 1);
  await page.click('#coh-close');
  ok('cohérence : « Mathide » ressemble à « Mathilde » ; « Voir » le sélectionne ; « Tout écrire » corrige (une étape d’annulation)');
  await v(() => window.__ftEmit('menu', ['readability']));
  await page.waitForTimeout(400);
  const read = await v(async () => { const r = await window.FTReadability.analyze(); return { name: r.scoreName, score: r.score, sentences: r.sentences.length }; });
  assert.ok(/Kandel/.test(read.name) && read.sentences >= 6, JSON.stringify(read));
  await page.click('#assist-close');
  ok('lisibilité sur le texte du moteur : ' + read.name + ', ' + Math.round(read.score) + ', ' + read.sentences + ' phrases');

  // 6. Source PDF côte à côte : volet ouvert, passage cité au curseur.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-pdf-'));
  const file = path.join(dir, 'potager.pdf');
  makePdf(file);
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  await reset('<p>Comme le note l’auteur,</p><p>Suite.</p>');
  await select(await posOf('auteur,', 7));
  assert.ok(!(await v(() => document.getElementById('pdf-source-btn').classList.contains('pv-off'))));
  await page.click('#pdf-source-btn');
  await page.waitForTimeout(300);
  await page.click('#pdf-open');
  await page.waitForSelector('#pdfpane .pdf-page .textLayer span', { timeout: 15000 });
  await page.waitForTimeout(400);
  const box = await v(() => {
    const span = [...document.querySelectorAll('#pdfpane .textLayer span')].find((x) => x.textContent.startsWith('Les jardins'));
    const r = span.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2, x2: r.right - 1 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.click('#pdf-cite');
  await page.waitForTimeout(300);
  const out = await saved();
  assert.ok(/Comme le note l’auteur,.*Les jardins familiaux.*<span class="ft-cite"/.test(out), out);
  ok('source PDF : volet ouvert à côté du texte, passage sélectionné cité au curseur (guillemets + citation)');
  await page.click('#pdf-source-btn');
  await page.waitForTimeout(200);

  // 7. Colonnes : tout le document (mode note), un passage, une zone.
  await reset('<p>Un.</p><p>Deux.</p><p>Trois.</p><p>Quatre.</p>');
  await page.click('#layout-btn');
  await page.click('#layout-pop button:has-text("2 colonnes")');
  assert.strictEqual(await v(() => document.getElementById('editor').dataset.cols), '2');
  assert.ok(await changes() > 0, 'document modifié');
  await page.click('#layout-pop button:has-text("Texte normal")');
  assert.strictEqual(await v(() => document.getElementById('editor').dataset.cols), undefined);
  await page.keyboard.press('Escape');
  ok('« Colonnes » : tout le document en 2 colonnes (document modifié), puis de nouveau en une');
  const a = await posOf('Deux.');
  const b = await posOf('Trois.', 6);
  await select(a, b);
  d0 = await depth();
  items = await menuAt(await pointIn('Deux', 2));
  assert.ok(items.includes('Colonnes'), JSON.stringify(items));
  await v(() => window.FTLayout.columnItems()[0].submenu()[0].action());
  await page.waitForTimeout(50);
  assert.ok(/<p>Un\.<\/p><div class="ft-cols" data-cols="2"><p>Deux\.<\/p><p>Trois\.<\/p><\/div><p>Quatre\.<\/p>/.test(await saved()), await saved());
  assert.strictEqual(await depth(), d0 + 1);
  ok('passage sélectionné → « Colonnes » > 2 colonnes : zone en colonnes, une étape d’annulation');
  items = await menuAt(await pointIn('Trois', 2));
  assert.ok(items.includes('Trois colonnes') && items.includes('Retirer les colonnes (garder le texte)'), JSON.stringify(items));
  await choose('Trois colonnes');
  assert.ok(/data-cols="3"/.test(await saved()));
  // Entrée sur une ligne vide à la fin de la zone : on en sort.
  await select(await posOf('Trois.', 6));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Après');
  assert.ok(/<\/div><p>Après<\/p><p>Quatre\.<\/p>/.test(await saved()), await saved());
  items = await menuAt(await pointIn('Deux', 2));
  await choose('Retirer les colonnes');
  assert.ok(/<p>Un\.<\/p><p>Deux\.<\/p><p>Trois\.<\/p><p>Après<\/p>/.test(await saved()), await saved());
  ok('zone : « Trois colonnes », sortie par Entrée sur une ligne vide, « Retirer les colonnes » (le texte reste)');
  await reset('<p>Un.</p><p>Deux.</p>', 'avance');
  await page.click('#layout-btn');
  assert.ok(await v(() => !!document.querySelector('#layout-pop .pop-help')));
  await select(await posOf('Deux.', 2));
  await page.click('#layout-pop button:has-text("En 2 colonnes")');
  await page.keyboard.press('Escape');
  assert.ok(/<div class="ft-cols" data-cols="2"><p>Deux\.<\/p><\/div>/.test(await saved()), await saved());
  ok('mode avancé : seulement des zones (« En 2 colonnes » met le paragraphe du curseur en colonnes)');

  // 8. Très long document (300 pages, mode avancé) : correcteur sur tout le texte, frappe, défilement.
  await v(() => {
    window.__lat = [];
    let t0 = 0;
    document.addEventListener('keydown', () => { t0 = performance.now(); }, true);
    const done = () => {
      if (!t0) return;
      const t = t0;
      t0 = 0;
      requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t), 0));
    };
    window.addEventListener('keypress', done);
    document.addEventListener('keyup', done, true);
  });
  const median = (a) => { const x = [...a].sort((p, q) => p - q); return Math.round(x[Math.floor(x.length / 2)] || 0); };
  const timed = () => v(async () => { const s = performance.now(); await window.FTSpell.now(); return Math.round(performance.now() - s); });
  // (Une occurrence sur 3 de « jardin » devient une faute : le rang ne dépend pas de la longueur du texte.)
  let nth = 0;
  const big = corpus().repeat(21).replace(/jardin/g, (m) => (nth++ % 3 === 0 ? 'jardinn' : m));
  await reset(big, 'avance');
  const first = await timed();
  const again = await timed();
  await page.waitForTimeout(2500);
  const info = await v(() => ({ pages: document.querySelectorAll('.pg-sheet').length, blocks: window.FTMoteur.view.state.doc.childCount, words: window.FTEditor.countWords().words }));
  assert.ok(info.pages > 250, 'pages ' + info.pages);
  ok(`${info.pages} pages (${info.words} mots, ${info.blocks} blocs) : première vérification ${first} ms, revérification sans changement ${again} ms`);
  assert.ok(again < 150, 'revérification ' + again);
  // Frappe au milieu du document, correcteur actif.
  const typeMid = async (n) => {
    await v(() => {
      const w = window.FTMoteur.view;
      const doc = w.state.doc;
      let pos = 0;
      for (let i = 0; i < Math.floor(doc.childCount / 2); i++) pos += doc.child(i).nodeSize;
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.near(doc.resolve(pos + 1))).scrollIntoView());
      w.focus();
    });
    await page.waitForTimeout(800);
    await v(() => { window.__lat = []; });
    for (let i = 0; i < n; i++) { await page.keyboard.type(i % 6 === 5 ? ' ' : 'a'); await page.waitForTimeout(40); }
    await page.waitForTimeout(200);
    return v(() => window.__lat.slice());
  };
  let lat = await typeMid(30);
  let after = await timed();
  ok(`frappe au milieu des 300 pages : ${median(lat)} ms par touche (médiane, max ${Math.round(Math.max(...lat))}), revérification après la frappe ${after} ms`);
  assert.ok(median(lat) < 80, 'frappe ' + median(lat));
  // Défilement : surlignages posés sur les blocs affichés.
  const scroll = await v(async () => {
    const ws = document.getElementById('workspace');
    const res = [];
    for (let i = 0; i < 8; i++) {
      ws.scrollTop += 2500;
      const s = performance.now();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      res.push(performance.now() - s);
    }
    await new Promise((r) => setTimeout(r, 50));
    return { frame: Math.round(res.sort((x, y) => x - y)[4]), marks: [...CSS.highlights.get('ft-spell')].map((r) => r.toString()) };
  });
  assert.ok(scroll.marks.includes('jardinn'), 'fautes soulignées après défilement');
  ok(`défilement : ${scroll.frame} ms pour deux images (médiane), ${scroll.marks.length} fautes soulignées dans la partie affichée`);
  // Deux langues : chaque paragraphe reconnu.
  await v(() => window.FTLang.load({ languages: ['fr', 'en'] }));
  const firstTwo = await timed();
  const againTwo = await timed();
  lat = await typeMid(30);
  after = await timed();
  ok(`deux langues (français, anglais) : reconnaissance et vérification ${firstTwo} ms, revérification ${againTwo} ms ; frappe ${median(lat)} ms, revérification après la frappe ${after} ms`);
  assert.ok(median(lat) < 80 && after < 300, 'deux langues');
};
