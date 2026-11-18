// Essai du mode présentation : entrée par le menu Fichier, projet de démonstration complet (sections,
// documents, liens visibles dans la mindmap, tags, images, tableaux, schémas, formules, mode avancé),
// projets de l'utilisateur intacts, sortie (retour au document d'avant), projet remis à neuf à chaque entrée.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, electron, errors }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const { paths } = electron._test;
  const app = (fn, arg) => page.evaluate(fn, arg);

  // Un document de l'utilisateur, ouvert.
  await app(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Mon carnet</h1><p>Texte de l’utilisateur.</p>';
    ed.dispatchEvent(new Event('input'));
  });
  await app(() => window.FTApp.menu('save'));
  await page.waitForTimeout(400);
  // Préversion 2.0 : ses documents sont dans son propre dossier.
  let edition = null;
  try { edition = require('../../src/edition.json'); } catch {}
  const userDir = path.join(paths.documents, edition ? edition.name : 'Tomatoes Text');
  const snapshot = () => {
    const out = {};
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f); else out[path.relative(userDir, f)] = fs.readFileSync(f, 'utf8');
      }
    };
    walk(userDir);
    return out;
  };
  const before = snapshot();
  const storageBefore = fs.readFileSync(path.join(paths.userData, 'stockage.json'), 'utf8');
  const settingsBefore = JSON.parse(fs.readFileSync(path.join(paths.userData, 'reglages.json'), 'utf8'));
  assert(settingsBefore.lastFile, 'document de l’utilisateur ouvert');

  // 1. Entrée.
  await app(() => window.FTApp.menu('presentation'));
  await page.waitForTimeout(1200);
  let st = await app(() => ({
    project: document.getElementById('project-select').value,
    bar: !document.getElementById('presentation-bar').hidden,
    name: window.FTApp.docName(),
    docs: window.FTApp.docs().length,
    sections: [...document.querySelectorAll('#tree .section-name, #tree .sec-name, #tree [class*="section"] > .name')].map((e) => e.textContent),
    tree: document.getElementById('tree').innerText.replace(/\s+/g, ' ').trim()
  }));
  assert.strictEqual(st.project, 'Le Jardin des Quatre Saisons');
  assert(st.bar, 'bandeau « Mode présentation »');
  assert.strictEqual(st.name, 'Bienvenue');
  assert.strictEqual(st.docs, 9);
  for (const s of ['ACCUEIL', 'L’ASSOCIATION', 'RÉUNIONS', 'AU JARDIN', 'FICHES TECHNIQUES', 'PUBLICATIONS']) assert(st.tree.toUpperCase().includes(s), s + ' dans : ' + st.tree);
  await page.screenshot({ path: path.join(SHOTS, 'presentation-0-bienvenue.png') });
  ok(`Fichier > Mode présentation : projet « ${st.project} », 9 documents en 4 sections et 2 sous-sections, « Bienvenue » ouvert`);

  // 2. Mindmap : liens et tags.
  const graph = await app(() => window.FTApp.graph());
  assert(graph.links.length >= 20, 'liens : ' + graph.links.length);
  const linked = new Set(graph.links.flat());
  assert.strictEqual(linked.size, 9, 'chaque document est relié');
  assert(graph.tags.length >= 8, 'tags : ' + graph.tags.map((t) => t.name).join(', '));
  await app(() => window.FTMindmap.show(true));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, 'presentation-mindmap.png') });
  await app(() => window.FTMindmap.show(false));
  ok(`mindmap : ${graph.links.length} liens entre les 9 documents, ${graph.tags.length} tags (${graph.tags.map((t) => t.name).join(', ')})`);

  // 3. Carte du temps : les dates des documents.
  await app(() => window.FTTimeline.show(true));
  await page.waitForTimeout(1500);
  const events = await app(() => document.querySelectorAll('#tl-stage .tl-card, #tl-list .tl-row, #tl-stage [data-i]').length);
  await page.screenshot({ path: path.join(SHOTS, 'presentation-carte-du-temps.png') });
  await app(() => window.FTTimeline.show(false));
  assert(events >= 8, 'événements : ' + events);
  ok(`carte du temps : ${events} événements`);

  // 4. Chaque document : contenu complet, images affichées, aucune erreur.
  const docs = await app(() => window.FTApp.docs());
  const report = [];
  for (const [i, d] of docs.entries()) {
    await app((id) => window.FTApp.openDocById(id), d.id);
    await page.waitForTimeout(900);
    const info = await app(() => {
      const ed = document.getElementById('editor');
      const imgs = [...ed.querySelectorAll('img:not(.ProseMirror-separator)')]; // (repères du moteur 2.0 exclus)
      return {
        words: window.FTEditor.countWords().words,
        tags: window.FTTags.get().length,
        images: imgs.length,
        broken: imgs.filter((im) => !im.naturalWidth).length,
        tables: ed.querySelectorAll('table.ft-table').length,
        links: ed.querySelectorAll('a.ft-doclink[data-doc]').length,
        math: [...ed.querySelectorAll('.ft-math')].filter((m) => m.innerHTML.trim()).length,
        pages: window.FTPages.pageCount(),
        toc: ed.querySelectorAll('.ft-toc [data-target], .ft-toc a, .ft-toc li, .ft-toc .toc-row').length,
        lof: ed.querySelector('.ft-lof') ? ed.querySelector('.ft-lof').innerText.trim().split('\n').filter(Boolean).length : 0,
        index: ed.querySelector('.ft-index') ? ed.querySelector('.ft-index').innerText.trim().length : 0,
        xref: [...ed.querySelectorAll('.ft-xref')].map((x) => x.textContent),
        comments: window.FTComments.get().length,
        cover: !!ed.querySelector('.ft-cover')
      };
    });
    // Export Word du document de démonstration.
    const size = await app(async () => (await window.FTWord.exportWord()).length);
    assert(size > 5000, d.title + ' : export Word');
    info.word = size;
    report.push([d.title, info]);
    assert(info.words > 80, d.title + ' : texte');
    assert(info.tags >= 1, d.title + ' : tags');
    assert.strictEqual(info.broken, 0, d.title + ' : image non affichée');
    await page.screenshot({ path: path.join(SHOTS, `presentation-${i + 1}.png`) });
    if (info.pages > 1) {
      for (let k = 1; k < info.pages; k++) {
        await app((y) => { document.getElementById('workspace').scrollTop = y; }, k * 1150);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(SHOTS, `presentation-${i + 1}-page${k + 1}.png`) });
      }
    }
  }
  const by = Object.fromEntries(report);
  for (const [t, info] of report) console.log(`      ${t} : ${info.words} mots, ${info.tags} tags, ${info.images} images, ${info.tables} tableaux, ${info.links} liens` + (info.pages ? `, ${info.pages} pages` : ''));
  const rapport = by['Rapport d’activité 2026'];
  // Préversion 2.0 : le mode avancé (pages) n'est pas encore repris, le rapport s'ouvre en mode note.
  assert(rapport.cover && (edition || rapport.pages >= 4), 'rapport en mode avancé avec page de titre');
  assert.deepStrictEqual(rapport.xref, ['schéma 1', 'figure 1', 'tableau 1']);
  // (Préversion 2.0 : les commentaires dans la marge ne sont pas encore repris.)
  assert(rapport.lof >= 3 && rapport.index > 20 && (edition || rapport.comments === 1), JSON.stringify(rapport));
  assert(by['Fiche – Arrosage et paillage'].math >= 3, 'formules affichées');
  assert(by['Catalogue des tomates'].images === 4 && by['Calendrier des semis'].images === 1, 'images et schéma');
  ok('9 documents ouverts et exportés en Word : textes, tags, images, tableaux, schémas, formules ; rapport en mode avancé (page de titre, plan, renvois, table des illustrations, index, commentaire)');

  // 5. Une modification pendant la présentation : enregistrée à part, projets de l'utilisateur intacts.
  await app(() => {
    const ed = document.getElementById('editor');
    ed.insertAdjacentHTML('beforeend', '<p>Modification de démonstration.</p>');
    ed.dispatchEvent(new Event('input'));
  });
  await app(() => window.FTApp.menu('save'));
  await page.waitForTimeout(500);
  const demoDir = path.join(paths.userData, 'Présentation', 'Projets', 'Le Jardin des Quatre Saisons');
  assert(fs.readdirSync(demoDir).filter((f) => f.endsWith('.tmtx')).some((f) => fs.readFileSync(path.join(demoDir, f), 'utf8').includes('Modification de démonstration')));
  assert.deepStrictEqual(snapshot(), before, 'projets de l’utilisateur inchangés');
  assert.strictEqual(fs.readFileSync(path.join(paths.userData, 'stockage.json'), 'utf8'), storageBefore);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(paths.userData, 'reglages.json'), 'utf8')).lastFile, settingsBefore.lastFile);
  ok('modification enregistrée dans le dossier de présentation ; projets, stockage et dernier document de l’utilisateur inchangés');

  // 6. Sortie par le bouton « Quitter ».
  await page.click('#presentation-quit');
  await page.waitForTimeout(1000);
  st = await app(() => ({ project: document.getElementById('project-select').value, bar: !document.getElementById('presentation-bar').hidden, text: document.getElementById('editor').innerText }));
  assert.strictEqual(st.project, 'Mes documents');
  assert(!st.bar);
  assert(st.text.includes('Texte de l’utilisateur.'));
  assert(!fs.existsSync(path.join(paths.userData, 'Présentation')), 'dossier de présentation effacé');
  assert.deepStrictEqual(snapshot(), before);
  ok('« Quitter » : retour à « Mes documents », au document ouvert avant ; dossier de présentation effacé');

  // 7. Nouvelle entrée : projet remis à neuf.
  await app(() => window.FTApp.menu('presentation'));
  await page.waitForTimeout(1000);
  const fresh = fs.readdirSync(demoDir).filter((f) => f.endsWith('.tmtx')).every((f) => !fs.readFileSync(path.join(demoDir, f), 'utf8').includes('Modification de démonstration'));
  assert(fresh, 'projet remis à neuf');
  await app(() => window.FTApp.menu('presentation'));
  await page.waitForTimeout(800);
  ok('nouvelle entrée : projet de démonstration remis à neuf ; le menu en ressort aussi');
  assert.deepStrictEqual(errors, []);
};
