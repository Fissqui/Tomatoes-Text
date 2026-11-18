// Essai du tutoriel : installé et proposé une seule fois au premier lancement, ouvert sur « Bienvenue dans
// Tomatoes Text », liens entre documents valides, document « Mise en page » en mode avancé, Aide > Tutoriel
// qui le rouvre (et le réinstalle s'il a été supprimé), bouton « Tutoriel » de l'accueil.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const { paths } = electron._test;
  const app = (fn, arg) => page.evaluate(fn, arg);
  const projects = path.join(paths.documents, 'Tomatoes Text', 'Projets');
  const tutoDir = path.join(projects, 'Tutoriel');
  const shipped = fs.readdirSync(path.join(__dirname, '..', '..', 'src', 'tutoriel')).filter((f) => f.endsWith('.tmtx'));

  // Banc d'essai : rien d'installé ni de proposé.
  assert(!fs.existsSync(tutoDir), 'pas de tutoriel dans les autres essais');
  ok('banc d’essai : ni installation ni question');

  // 1. Premier lancement (comme pour un utilisateur).
  delete process.env.FT_SANS_TUTORIEL;
  await page.reload();
  await page.waitForTimeout(1800);
  let st = await app(() => ({ open: document.getElementById('modal').open, text: document.getElementById('modal-message').textContent, ok: document.getElementById('modal-ok').textContent, cancel: document.getElementById('modal-cancel').textContent }));
  assert(st.open, 'question posée au premier lancement');
  assert.strictEqual(st.ok, 'Ouvrir le tutoriel');
  assert.strictEqual(st.cancel, 'Plus tard');
  assert.deepStrictEqual(fs.readdirSync(tutoDir).filter((f) => f.endsWith('.tmtx')).sort(), shipped.sort());
  await page.screenshot({ path: path.join(SHOTS, 'tutoriel-0-question.png') });
  ok(`premier lancement : projet « Tutoriel » installé (${shipped.length} documents), question « ${st.text.slice(0, 40)}… »`);

  await page.click('#modal-ok');
  await page.waitForTimeout(1500);
  st = await app(() => ({
    project: document.getElementById('project-select').value,
    name: window.FTApp.docName(),
    docs: window.FTApp.docs().map((d) => ({ id: d.id, title: d.title })),
    tree: document.getElementById('tree').innerText.replace(/\s+/g, ' ').trim(),
    links: [...document.querySelectorAll('#editor a.ft-doclink')].map((a) => a.dataset.doc)
  }));
  assert.strictEqual(st.project, 'Tutoriel');
  assert.strictEqual(st.name, '1. Bienvenue dans Tomatoes Text');
  assert.strictEqual(st.docs.length, 12);
  for (const s of ['DÉBUTER', 'ÉCRIRE', 'FINALISER']) assert(st.tree.toUpperCase().includes(s), s + ' dans : ' + st.tree);
  const ids = new Set(st.docs.map((d) => d.id));
  assert(st.links.length >= 11 && st.links.every((id) => ids.has(id)), 'liens du sommaire');
  await page.screenshot({ path: path.join(SHOTS, 'tutoriel-1-bienvenue.png') });
  ok('« Ouvrir le tutoriel » : projet « Tutoriel », 12 documents en 3 sections, sommaire relié à tous les documents');

  // 2. Chaque document : liens valides ; « Mise en page » en mode avancé avec page de titre et plan.
  for (const d of st.docs) {
    await app((id) => window.FTApp.openDocById(id), d.id);
    await page.waitForTimeout(500);
    const info = await app(() => ({
      links: [...document.querySelectorAll('#editor a.ft-doclink')].map((a) => a.dataset.doc),
      avance: document.querySelector('#mode-switch [data-mode="avance"]').getAttribute('aria-pressed') === 'true',
      cover: !!document.querySelector('#editor .ft-cover'),
      toc: document.querySelectorAll('#editor .ft-toc .ft-toc-item').length,
      tables: document.querySelectorAll('#editor table').length,
      words: document.getElementById('editor').innerText.split(/\s+/).filter(Boolean).length
    }));
    assert(info.links.every((id) => ids.has(id)), 'liens de « ' + d.title + ' »');
    if (d.title === '9. Mise en page') {
      assert(info.avance && info.cover && info.toc > 3, 'mode avancé, page de titre, plan');
      await page.screenshot({ path: path.join(SHOTS, 'tutoriel-2-mise-en-page.png') });
    } else assert(!info.avance, d.title + ' en mode note');
    console.log(`      ${d.title} : ${info.words} mots, ${info.tables} tableaux, ${info.links.length} liens${info.avance ? ', mode avancé' : ''}`);
  }
  ok('liens entre documents valides ; « Mise en page » en mode avancé (page de titre, plan) ; les autres en mode note');

  // 3. Lancement suivant : plus de question.
  await page.reload();
  await page.waitForTimeout(1800);
  assert(!(await app(() => document.getElementById('modal').open)), 'question posée une seule fois');
  ok('lancement suivant : pas de nouvelle question');

  // 4. Tutoriel supprimé : Aide > Tutoriel le réinstalle et l'ouvre.
  await page.selectOption('#project-select', 'Mes documents');
  await page.waitForTimeout(800);
  assert.strictEqual(await app(() => document.getElementById('project-select').value), 'Mes documents');
  fs.rmSync(tutoDir, { recursive: true, force: true });
  await app(() => window.FTApp.menu('tutorial'));
  await page.waitForTimeout(1500);
  st = await app(() => ({ project: document.getElementById('project-select').value, name: window.FTApp.docName() }));
  assert.strictEqual(st.project, 'Tutoriel');
  assert.strictEqual(st.name, '1. Bienvenue dans Tomatoes Text');
  assert.strictEqual(fs.readdirSync(tutoDir).filter((f) => f.endsWith('.tmtx')).length, shipped.length);
  ok('Aide > Tutoriel : projet supprimé réinstallé, puis ouvert');

  // 5. Un document modifié n'est pas écrasé par Aide > Tutoriel.
  await app(() => {
    const ed = document.getElementById('editor');
    const p = ed.querySelector('p');
    p.textContent = 'Texte modifié par l’utilisateur.';
    ed.dispatchEvent(new Event('input'));
  });
  await app(() => window.FTApp.menu('save'));
  await page.waitForTimeout(500);
  await app(() => window.FTApp.menu('tutorial'));
  await page.waitForTimeout(1200);
  const text = await app(() => document.getElementById('editor').innerText);
  assert(text.includes('Texte modifié par l’utilisateur.'), 'modification gardée');
  ok('Aide > Tutoriel sur un tutoriel existant : rien n’est recopié par-dessus');

  // 6. Bouton « Tutoriel » de l'accueil.
  await app(() => window.FTApp.menu('home'));
  await page.waitForTimeout(500);
  assert(await app(() => !document.getElementById('welcome').hidden), 'accueil ouvert');
  await page.screenshot({ path: path.join(SHOTS, 'tutoriel-3-accueil.png') });
  await page.click('#wl-tutorial');
  await page.waitForTimeout(1200);
  st = await app(() => ({ welcome: !document.getElementById('welcome').hidden, name: window.FTApp.docName() }));
  assert(!st.welcome && st.name === '1. Bienvenue dans Tomatoes Text', 'accueil > Tutoriel');
  ok('accueil : bouton « Tutoriel »');
  process.env.FT_SANS_TUTORIEL = '1';
};
