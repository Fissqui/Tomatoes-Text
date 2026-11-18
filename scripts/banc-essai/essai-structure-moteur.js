// Structure du document dans le nouveau moteur (préversion 2.0 n° 6) : plan, légendes numérotées et
// table des illustrations, index, renvois, signets, page de titre, volet de navigation.
// Le contenu produit par le logiciel (plan, numéros, pages, renvois) suit le texte sans entrer dans
// l'annulation ni marquer le document comme modifié ; les gestes (insérer, ajouter, supprimer) font une
// étape d'annulation. Mesures sur un très long document (300 pages en mode avancé, plan, table des
// illustrations, index et renvois) : frappe, mise à jour du contenu produit, aller à un titre éloigné.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-structure-moteur.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
const docOf = (name) => JSON.parse(fs.readFileSync(path.join(SRC, 'presentation', name), 'utf8'));
function corpus() {
  const dir = path.join(SRC, 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  // Le contenu produit est refait un instant après une modification.
  const settle = async () => { await page.waitForTimeout(450); await frames(2); };
  const reset = async (html, mode = 'note', settings = {}) => {
    await page.keyboard.press('Escape');
    await v(([h, m, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m, ...s } });
      if (window.FTIndex) window.FTIndex.load(s);
      document.getElementById('page').hidden = false;
      window.__changes = 0;
    }, [html, mode, settings]);
    await settle();
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const depth = () => v(() => window.FTMoteur.undoDepth());
  const changes = () => v(() => window.__changes);
  const undo = () => v(() => window.FTMoteur.undo());
  const posAfter = (text) => v((t) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => {
      if (p === null && n.isText && n.text.includes(t)) p = q + n.text.indexOf(t) + t.length;
    });
    return p;
  }, text);
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const caretAfter = async (text) => select(await posAfter(text));
  const caret = () => v(() => window.FTMoteur.view.state.selection.$from.parent.textContent);
  // Clic droit : les commandes du menu ; choose : clic sur l'une d'elles.
  const menuAt = async (sel) => {
    await page.click(sel, { button: 'right' });
    return v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  };
  const choose = (text) => page.click(`#context-menu button:has-text("${text}")`);
  const typeIn = async (text) => { await page.keyboard.type(text); await settle(); };
  // Le document est « modifié » (enregistrement) : compté ici.
  await v(() => { window.FTEditor.onChange(() => { window.__changes++; }); window.FTLayout.setCapitalize(false); });

  // 1. Rapport d'activité (mode avancé) : plan, table des illustrations, index, renvois et numéros des
  // légendes refaits par le moteur, identiques à ceux de la version 1.7 ; l'ouverture ne touche à rien.
  const rapport = docOf('08-rapport.tmtx');
  await reset(rapport.content.html, 'avance', rapport.settings);
  await page.waitForTimeout(1500);
  const out = await saved();
  const pick = (h, re) => (h.match(re) || []).join('\n');
  const parts = {
    plan: /<div class="ft-toc"[\s\S]*?<\/div><\/div>(?=<)/g,
    illustrations: /<div class="ft-lof"[\s\S]*?<\/div><\/div>(?=<)/g,
    index: /<div class="ft-index"[\s\S]*?<\/span><\/div><\/div>(?=<)/g,
    renvois: /<span class="ft-xref"[^>]*>[^<]*<\/span>/g,
    numéros: /data-cap="[^"]*"/g
  };
  // (Le fichier a été enregistré avec d'autres polices : « E. Perspectives » y était page 3 ; la version
  // 1.7 la met page 4 sur ce poste, comme le moteur, et l'index suit. Depuis la 2.0.5, « C. Les cultures »
  // et « 1. Les récoltes », seuls en bas de la page 2, passent page 3 avec leur texte, et un
  // paragraphe ne laisse plus une ligne seule : l'index suit. Depuis la 2.2.12, moins d'espace au-dessus des
  // titres : « C. Les cultures » et « 1. Les récoltes » tiennent de nouveau page 2 avec leur texte, et l'index d'« atelier » et « compostage » suit.)
  const stored = rapport.content.html
    .replace('E. Perspectives</span><span class="ft-toc-page">3', 'E. Perspectives</span><span class="ft-toc-page">4')
    .replace('récolte</span><span class="ft-index-pages">, 2, 3', 'récolte</span><span class="ft-index-pages">, 2–4')
    .replace('serre</span><span class="ft-index-pages">, 3', 'serre</span><span class="ft-index-pages">, 4');
  for (const [name, re] of Object.entries(parts)) {
    assert(pick(stored, re).length > 20, name);
    assert.strictEqual(pick(out, re), pick(stored, re), name);
  }
  assert.deepStrictEqual([await depth(), await changes()], [0, 0]);
  ok('rapport d’activité : plan, table des illustrations, index, renvois et numéros des légendes identiques à la version 1.7, ouverture sans modification');

  // 2. Plan (mode note) : inséré au curseur (une annulation), suit les titres sans entrer dans l'annulation
  // ni modifier le document ; clic sur une ligne : le curseur au titre ; clic droit : supprimé.
  await reset('<h1>Introduction</h1><p>Texte un.</p><h2>Méthode</h2><p>Deux.</p><h1>Fin</h1><p>Trois.</p>');
  await caretAfter('Texte un.');
  await v(() => window.FTToc.insert());
  await settle();
  const tocText = () => v(() => [...document.querySelectorAll('#editor .ft-toc-item')].map((r) => r.textContent).join(' | '));
  assert.match(await saved(), /^<h1>Introduction<\/h1><p>Texte un\.<\/p><div class="ft-toc"[^>]*>[\s\S]*<\/div><h2>Méthode<\/h2>/);
  assert.strictEqual(await tocText(), 'Sans titre | Introduction | Méthode | Fin');
  assert.strictEqual(await depth(), 1);
  await caretAfter('Méthode');
  await typeIn(' choisie');
  assert.strictEqual(await tocText(), 'Sans titre | Introduction | Méthode choisie | Fin');
  const d1 = await depth();
  const c1 = await changes();
  await v(() => window.FTGeneres.now());
  assert.deepStrictEqual([await depth(), await changes()], [d1, c1]);
  await undo();
  await settle();
  assert.strictEqual(await tocText(), 'Sans titre | Introduction | Méthode | Fin');
  await page.click('#editor .ft-toc-item:last-child');
  assert.strictEqual(await caret(), 'Fin');
  // (Comme la version 1.7 : commentaire avant, « Insérer » après.)
  assert.deepStrictEqual((await menuAt('#editor .ft-toc')).filter((t) => t !== 'Nouveau commentaire' && t !== 'Insérer'), ['Style…', 'Mettre à jour le plan', 'Supprimer le plan']);
  await choose('Supprimer le plan');
  assert(!(await saved()).includes('ft-toc'));
  await undo();
  assert((await saved()).includes('ft-toc'));
  ok('plan : inséré au curseur, suit les titres hors annulation et sans modifier le document, clic = aller au titre, clic droit = supprimer (une annulation)');

  // 3. Légendes de tableau et table des illustrations : légende ajoutée du clic droit (numéro refait),
  // Entrée passe dans le tableau, la table liste les légendes ; Retour arrière efface une légende vide.
  const table = (t) => `<table><tbody><tr><td>${t}</td><td>x</td></tr></tbody></table>`;
  await reset('<p>Début.</p>' + table('Un') + '<p>Milieu.</p>' + table('Deux') + '<p>Fin.</p>');
  assert((await menuAt('#editor table:last-of-type td')).includes('Ajouter une légende (Tableau n)'));
  await choose('Ajouter une légende');
  await typeIn('Récoltes');
  assert.strictEqual(await caret(), 'Récoltes');
  await page.keyboard.press('Enter');
  assert.strictEqual(await caret(), 'Deux');
  await menuAt('#editor table td');
  await choose('Ajouter une légende');
  await typeIn('Semis');
  const caps = () => v(() => [...document.querySelectorAll('#editor p.ft-legend')].map((p) => p.dataset.cap + ' ' + p.textContent).join(' | '));
  assert.strictEqual(await caps(), 'Tableau 1 Semis | Tableau 2 Récoltes');
  await caretAfter('Fin.');
  await v(() => window.FTCaptions.insert('tout'));
  await settle();
  const lof = () => v(() => [...document.querySelectorAll('#editor .ft-lof-item')].map((r) => r.textContent.replace(/\s/g, ' ')).join(' | '));
  assert.strictEqual(await lof(), 'Tableau 1 : Semis | Tableau 2 : Récoltes');
  assert.match(await saved(), /<p class="ft-legend" data-kind="tableau" data-cap="Tableau 1">Semis<\/p><table>/);
  // Légende vidée puis effacée : les numéros et la table suivent.
  await caretAfter('Semis');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  await settle();
  assert.strictEqual(await caps(), 'Tableau 1 Récoltes');
  assert.strictEqual(await lof(), 'Tableau 1 : Récoltes');
  await page.click('#editor .ft-lof-item');
  ok('légendes de tableau : ajoutées du clic droit, numérotées, Entrée passe dans le tableau, Retour arrière efface une légende vide ; table des illustrations à jour');

  // 4. Index : mots marqués (réglage du document), bloc inséré au curseur, suit le texte.
  await reset('<p>La serre est chauffée.</p><p>Une récolte.</p><p>Fin.</p>');
  await v(() => { window.FTIndex.mark('serre'); window.FTIndex.mark('récolte'); });
  await caretAfter('Fin.');
  await v(() => window.FTIndex.insert());
  await settle();
  const ix = () => v(() => [...document.querySelectorAll('#editor .ft-index-entry')].map((r) => r.textContent).join(' | '));
  assert.strictEqual(await ix(), 'récolte | serre');
  await v(() => window.FTIndex.mark('chauffée'));
  await settle();
  assert.strictEqual(await ix(), 'chauffée | récolte | serre');
  // (Depuis la 2.2.10, les mots marqués sont aussi une étape d'annulation : les deux premiers, marqués
  // d'un coup, le bloc, puis le troisième.)
  assert.strictEqual(await depth(), 3);
  ok('index : mots marqués, bloc inséré au curseur (une annulation), refait quand la liste change');

  // 5. Renvois : fenêtre « Renvoi » (recherche, Entrée), inséré au curseur (une annulation), suit sa cible.
  await reset('<h1>Introduction</h1><p>Comme expliqué dans </p><h2>Méthode</h2><p>Deux.</p>');
  await caretAfter('dans ');
  await v(() => window.FTXref.open());
  await page.keyboard.type('Méth');
  await page.keyboard.press('Enter');
  assert.strictEqual(await v(() => document.getElementById('xr-preview').textContent), 'voir ci-dessous');
  await page.click('#xr-formats input[value="label"]');
  await page.click('#xr-ok');
  await settle();
  assert.match(await saved(), /^<h1>Introduction<\/h1><p>Comme expliqué dans <span class="ft-xref" contenteditable="false" data-target="x:[\w-]+" data-show="label"[^>]*>« Méthode »<\/span><\/p><h2 data-xid="[\w-]+">Méthode<\/h2>/);
  assert.strictEqual(await depth(), 1);
  await typeIn(', puis');
  assert.match(await saved(), /« Méthode »<\/span>, puis<\/p>/);
  await caretAfter('Méthode');
  await typeIn(' choisie');
  assert.strictEqual(await v(() => document.querySelector('#editor .ft-xref').textContent), '« Méthode choisie »');
  await page.click('#editor .ft-xref', { modifiers: ['Control'] });
  await page.dblclick('#editor .ft-xref');
  assert(await v(() => document.getElementById('xref-dialog').open));
  await page.keyboard.press('Escape');
  ok('renvois : fenêtre « Renvoi », inséré au curseur (une annulation), texte refait quand la cible change, Ctrl+clic et double-clic');

  // 6. Signets : ajoutés à la ligne du curseur (une annulation), panneau, renommés, supprimés.
  await v(() => {
    window.__ask = [];
    window.FTApp.ask = async (msg, val) => { const a = window.__ask.shift(); return a === undefined ? val : a; };
  });
  await reset('<p>Premier paragraphe.</p><p>Second paragraphe.</p>');
  await caretAfter('Second');
  await v(() => { window.__ask = ['Repère']; return window.FTBookmarks.add(); });
  await settle();
  assert.match(await saved(), /^<p>Premier paragraphe\.<\/p><p data-bm="bm\w+" data-bm-name="Repère">Second paragraphe\.<\/p>$/);
  assert.strictEqual(await depth(), 1);
  await v(() => window.FTBookmarks.open());
  assert.strictEqual(await v(() => document.querySelectorAll('#bm-list .bm-item').length), 1);
  assert.strictEqual(await v(() => document.querySelectorAll('#bm-layer .bm-flag').length), 1);
  await v(() => { window.__ask = ['Nouveau nom']; document.querySelector('#bm-list .bm-act').click(); });
  await settle();
  assert.match(await saved(), /data-bm-name="Nouveau nom"/);
  await v(() => document.querySelector('#bm-list .bm-act:last-child').click());
  await settle();
  assert.strictEqual(await saved(), '<p>Premier paragraphe.</p><p>Second paragraphe.</p>');
  await undo();
  assert.match(await saved(), /data-bm-name="Nouveau nom"/);
  await v(() => window.FTBookmarks.hide());
  ok('signets : ajoutés à la ligne du curseur (une annulation), drapeau et panneau, renommés, supprimés');

  // 7. Page de titre (mode avancé) : insérée en tête, le curseur dans le titre ; champs tapés (Tab : champ
  // suivant), une étape d'annulation par passage dans les champs.
  await reset('<h1 class="ft-title">Bilan</h1><p>Le texte du document.</p>', 'avance');
  await v(() => window.FTCover.apply('classique'));
  await settle();
  assert.match(await saved(), /^<div class="ft-cover" contenteditable="false" data-model="classique">/);
  const d7 = await depth();
  await page.keyboard.type(' 2026');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Rapport annuel');
  await select(await posAfter('Le texte'));
  await settle();
  const fields = await v(() => Object.fromEntries([...document.querySelectorAll('#editor .ft-cover-field')].map((f) => [f.dataset.field, f.textContent])));
  assert.deepStrictEqual([fields.titre, fields.soustitre], ['Bilan 2026', 'Rapport annuel']);
  assert.match(await saved(), /data-field="titre"[^>]*>Bilan 2026<\/p><p class="ft-cover-field" data-field="soustitre"[^>]*>Rapport annuel</);
  assert.strictEqual(await depth(), d7 + 1);
  await undo();
  assert.doesNotMatch(await saved(), /Bilan 2026/);
  // (La page de titre couvre toute la feuille : clic dans sa marge de gauche, haut de la page à l'écran.)
  await v(() => { document.getElementById('workspace').scrollTop = 0; });
  await page.click('#editor .ft-cover', { button: 'right', position: { x: 20, y: 400 } });
  const coverMenu = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  assert.deepStrictEqual(coverMenu.filter((t) => t !== 'Nouveau commentaire' && t !== 'Insérer'), ['Changer de modèle…', 'Supprimer la page de titre']);
  await choose('Supprimer la page de titre');
  assert.strictEqual(await saved(), '<h1 class="ft-title">Bilan</h1><p>Le texte du document.</p>');
  ok('page de titre : insérée en tête, champs tapés (Tab : champ suivant), une annulation, clic droit');

  // 8. Très long document (300 pages, mode avancé) : plan, table des illustrations, index et renvois.
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
  const big = corpus().repeat(21);
  const tOpen = await v((h) => {
    const box = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html').body;
    box.querySelectorAll('.ft-footnotes, .ft-endnotes, .ft-biblio, sup.ft-fn-ref, sup.ft-en-ref, span.ft-cite, span.ft-xref').forEach((x) => x.remove());
    // Renvois vers des titres répartis dans le texte.
    const hs = [...box.querySelectorAll('h2')];
    const ps = [...box.querySelectorAll(':scope > p')].filter((p) => p.textContent.length > 60);
    for (let i = 0; i < 40; i++) {
      const h = hs[Math.floor((i * 37) % hs.length)];
      h.dataset.xid = h.dataset.xid || 'h' + i;
      ps[Math.floor((i * ps.length) / 40)].insertAdjacentHTML('beforeend', ` <span class="ft-xref" contenteditable="false" data-target="x:${h.dataset.xid}" data-show="label-page">?</span>`);
    }
    const html = '<div class="ft-toc" contenteditable="false"></div><div class="ft-lof" data-kind="tout" contenteditable="false"></div>' + box.innerHTML + '<div class="ft-index" contenteditable="false"></div>';
    const t = performance.now();
    window.FTEditor.load({ content: { html }, settings: { mode: 'avance', index: [{ term: 'serre' }, { term: 'récolte', variants: ['récoltes'] }, { term: 'compost' }, { term: 'arrosage' }] } });
    window.FTIndex.load({ index: [{ term: 'serre' }, { term: 'récolte', variants: ['récoltes'] }, { term: 'compost' }, { term: 'arrosage' }] });
    document.body.offsetHeight;
    window.__changes = 0;
    return performance.now() - t;
  }, big);
  await page.waitForTimeout(3000);
  await v(() => window.FTGeneres.now());
  const stats = await v(() => {
    const ed = document.getElementById('editor');
    const hs = [...ed.querySelectorAll('h1, h2, h3, h4, h5')].filter((h) => !h.closest('.ft-toc') && h.textContent.trim());
    const rows = [...ed.querySelectorAll('.ft-toc-item[data-target]')];
    const last = hs[hs.length - 1];
    const lastRow = rows[rows.length - 1];
    return {
      pages: document.querySelectorAll('.pg-sheet').length || window.FTPages.count && window.FTPages.count(),
      headings: hs.length,
      rows: rows.length,
      lastPage: window.FTPages.pageNumberOf(last),
      lastRowPage: lastRow && lastRow.querySelector('.ft-toc-page') ? lastRow.querySelector('.ft-toc-page').textContent : null,
      lof: ed.querySelectorAll('.ft-lof-item').length,
      index: [...ed.querySelectorAll('.ft-index-entry')].map((e) => e.textContent.split(',')[0]).join(' | '),
      xrefs: [...ed.querySelectorAll('.ft-xref')].filter((x) => /page \d+$/.test(x.textContent)).length,
      undo: window.FTMoteur.undoDepth(),
      changes: window.__changes
    };
  });
  assert(stats.pages > 250, 'pages : ' + stats.pages);
  assert.strictEqual(stats.rows, stats.headings);
  assert.strictEqual(stats.lastRowPage, String(stats.lastPage));
  assert(stats.lof > 100 && stats.xrefs === 40, JSON.stringify(stats));
  assert.strictEqual(stats.index, 'arrosage | compost | récolte | serre');
  assert.deepStrictEqual([stats.undo, stats.changes], [0, 0]);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const mid = await v(() => {
    const d = window.FTMoteur.view.state.doc;
    let pos = 0;
    let i = 0;
    for (; i < d.childCount / 2 || d.child(i).type.name !== 'paragraph' || d.child(i).content.size < 40; i++) pos += d.child(i).nodeSize;
    return pos + 1;
  });
  await select(mid);
  await v((p) => { const w = window.FTMoteur.view; w.nodeDOM(w.state.doc.resolve(p).before(1)).scrollIntoView({ block: 'center' }); }, mid);
  await page.waitForTimeout(300);
  await v(() => { window.__lat = []; });
  await page.keyboard.type('quelques mots tapés ', { delay: 50 });
  const typing = await v(() => window.__lat.splice(0));
  // Mise à jour qui suit la frappe (plan, table, index et renvois refaits sur tout le document).
  const tRegen = await v(() => { const t = performance.now(); window.FTGeneres.now(); return performance.now() - t; });
  await page.waitForTimeout(1200);
  // Volet de navigation : aller au dernier titre (loin dans le texte).
  await v(() => window.FTNav.show(true));
  await page.waitForTimeout(400);
  const navRows = await v(() => document.querySelectorAll('#nav-list .nav-item').length);
  assert.strictEqual(navRows, stats.headings);
  const tJump = await v(async () => {
    const t = performance.now();
    [...document.querySelectorAll('#nav-list .nav-item')].pop().click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t;
  });
  const after = await v(() => {
    const ed = document.getElementById('editor');
    const hs = [...ed.querySelectorAll('h1, h2, h3, h4, h5')].filter((h) => !h.closest('.ft-toc') && h.textContent.trim());
    const last = hs[hs.length - 1];
    const r = last.getBoundingClientRect();
    const box = document.getElementById('workspace').getBoundingClientRect();
    return { caret: window.FTMoteur.view.state.selection.$from.parent.textContent === last.textContent, onScreen: r.height > 0 && r.top >= box.top && r.bottom <= box.bottom, current: document.querySelector('#nav-list .nav-item.current') === [...document.querySelectorAll('#nav-list .nav-item')].pop() };
  });
  assert.deepStrictEqual(after, { caret: true, onScreen: true, current: true });
  await v(() => window.FTNav.show(false));
  ok(`très long document (${stats.pages} pages, ${stats.headings} titres, ${stats.lof} légendes, 40 renvois) : ouverture ${Math.round(tOpen)} ms, frappe ${Math.round(median(typing))} ms (médiane), puis mise à jour du plan, de la table, de l’index et des renvois ${Math.round(tRegen)} ms, volet de navigation : dernier titre atteint en ${Math.round(tJump)} ms`);
};
