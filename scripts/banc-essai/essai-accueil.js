// Accueil au lancement (version 2.0.4) : documents récents (tous projets) avec leurs informations, reprise
// du dernier document, recherche, ouverture d'un récent d'un autre projet, récent introuvable, Fichier >
// Accueil et Échap, accueil désactivé, lancement par un document (accueil ignoré).
// 2.3.19 : au lancement, rien d'autre ne s'affiche avant l'accueil ou le document (pas de page vide).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-accueil.js
const assert = require('assert');

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const { handlers } = electron._test;
  const shown = () => v(() => !document.getElementById('welcome').hidden);
  // Ce qui est montré à chaque image depuis le chargement de la page (changements seulement).
  await page.addInitScript(() => {
    window.__vus = [];
    const look = () => {
      const app = document.getElementById('app');
      const wl = document.getElementById('welcome');
      let s = 'rien';
      if (wl && !wl.hidden) s = 'accueil';
      else if (app && getComputedStyle(app).visibility !== 'hidden') s = document.getElementById('page').hidden ? 'vide' : 'document';
      if (window.__vus[window.__vus.length - 1] !== s) window.__vus.push(s);
      if (window.__vus.length < 20) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const seen = () => v(() => window.__vus.join(' > '));
  const relaunch = async () => {
    await v(() => window.FTApp.menu('before-close'));
    await page.reload();
    await page.waitForTimeout(1800);
  };
  const cards = () => v(() => [...document.querySelectorAll('#welcome .wl-doc')].filter((b) => !b.closest('[hidden]')).map((b) => ({
    title: b.querySelector('.wl-doc-title').textContent,
    meta: b.querySelector('.wl-doc-meta').textContent,
    excerpt: (b.querySelector('.wl-doc-excerpt') || {}).textContent || '',
    tags: [...b.querySelectorAll('.wl-tag')].map((t) => t.textContent),
    big: b.classList.contains('wl-doc-big')
  })));
  const openedTitle = () => v(() => document.getElementById('doc-name').textContent);

  // 1. Tout premier lancement (bibliothèque vide) : un document vide s'ouvre, sans accueil.
  assert(!(await shown()));
  assert(await v(() => !document.getElementById('page').hidden));
  ok('premier lancement : document vide ouvert, pas d\'accueil');

  // Trois documents dans le projet, puis réglages d'une version précédente (aucun récent gardé).
  await v(async () => {
    const api = window.frameText;
    const make = async (title, html, tags, day) => {
      const c = await api.createDoc(title);
      c.doc.content = { ...c.doc.content, html };
      c.doc.tags = tags;
      await api.saveDoc(c.fileName, c.doc);
      return c.fileName;
    };
    const a = await make('Processus marchand', '<h1 class="ft-title">Processus marchand</h1><p>La vente commence par une prise de contact avec le client et se poursuit par une offre.</p>', [{ name: 'Travail', color: 'bleu' }]);
    await new Promise((r) => setTimeout(r, 30));
    await make('Recettes', '<p>Tomates farcies au riz et aux herbes du jardin.</p>', []);
    await new Promise((r) => setTimeout(r, 30));
    await make('Journal', '<p>Premier jour de récolte.</p>', [{ name: 'Perso', color: 'vert' }]);
    const s = await api.loadSettings();
    delete s.recent;
    s.lastFile = a;
    await api.saveSettings(s);
  });
  await page.reload();
  await page.waitForTimeout(1800);
  assert(await shown(), 'accueil au lancement');
  assert(await v(() => document.getElementById('page').hidden));
  let list = await cards();
  assert.strictEqual(list[0].title, 'Processus marchand');
  assert(list[0].big && /^Mes documents · Modifié aujourd’hui à \d\d:\d\d · 1\d mots$/.test(list[0].meta), JSON.stringify(list[0]));
  assert(list[0].excerpt.startsWith('La vente commence') && list[0].tags.join() === 'Travail', JSON.stringify(list[0]));
  assert.deepStrictEqual(list.slice(1).map((c) => c.title), ['Journal', 'Recettes', 'Sans titre']);
  assert.strictEqual(list[1].tags.join(), 'Perso');
  assert(await v(() => document.activeElement.classList.contains('wl-doc-big')), 'focus sur « Reprendre »');
  ok(`accueil : « Reprendre » Processus marchand (${list[0].meta}), puis ${list.length - 1} récents avec extrait et tags`);

  // Recherche, puis ouverture d'un récent.
  await page.fill('#wl-search', 'rece');
  list = await cards();
  assert.deepStrictEqual(list.map((c) => c.title), ['Recettes']);
  await page.fill('#wl-search', 'zzz');
  assert.strictEqual(await page.textContent('#wl-none'), 'Aucun document trouvé.');
  await page.fill('#wl-search', '');
  await page.click('#wl-list .wl-doc >> text=Recettes');
  await page.waitForTimeout(600);
  assert(!(await shown()));
  assert.strictEqual(await openedTitle(), 'Recettes');
  ok('recherche « rece » : Recettes seul ; clic : Recettes ouvert, accueil fermé');

  // Fichier > Accueil, puis Échap : retour au document ouvert ; il est en tête des récents.
  await v(() => window.FTApp.menu('home'));
  await page.waitForTimeout(300);
  assert(await shown());
  list = await cards();
  assert.strictEqual(list[0].title, 'Recettes');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert(!(await shown()));
  assert.strictEqual(await openedTitle(), 'Recettes');
  ok('Fichier > Accueil : Recettes en tête ; Échap : retour au document');

  // Nouveau document depuis l'accueil.
  await v(() => window.FTApp.menu('home'));
  await page.click('#wl-new');
  await page.fill('#modal-input', 'Notes de réunion');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  assert(!(await shown()));
  assert.strictEqual(await openedTitle(), 'Notes de réunion');
  ok('« Nouveau document » : nom demandé, document créé et ouvert');

  // Autre projet : au relancement, les récents du premier projet restent proposés ; un clic y revient.
  await v(() => window.frameText.createProject('Second'));
  await relaunch();
  assert(await shown());
  assert.strictEqual(await v(() => document.getElementById('wl-project').value), 'Second');
  list = await cards();
  assert.strictEqual(list[0].title, 'Notes de réunion');
  await page.click('#wl-list .wl-doc >> text=Processus marchand');
  await page.waitForTimeout(800);
  assert.strictEqual(await openedTitle(), 'Processus marchand');
  assert.strictEqual(await v(() => document.getElementById('project-select').value), 'Mes documents');
  ok('récent d\'un autre projet : projet « Mes documents » rouvert, document ouvert');

  // Récent introuvable : retiré de la liste, avec un message.
  await v(() => window.FTApp.menu('home'));
  await page.waitForTimeout(200);
  assert((await cards()).some((c) => c.title === 'Journal'));
  // (Document effacé hors du logiciel.)
  await v(async () => {
    const lib = await window.frameText.loadLibrary();
    const j = lib.docs.find((d) => d.title === 'Journal');
    await window.frameText.deleteDoc(j.fileName);
  });
  await page.click('#wl-list .wl-doc >> text=Journal');
  await page.waitForTimeout(500);
  assert(await shown());
  assert.match(await page.textContent('#wl-msg'), /^« Journal » est introuvable\. Il a été retiré de la liste\.$/);
  assert(!(await cards()).some((c) => c.title === 'Journal'));
  ok('récent introuvable : message et retrait de la liste');

  // Accueil désactivé : le dernier document s'ouvre directement.
  await page.uncheck('#wl-at-start');
  await page.keyboard.press('Escape');
  await relaunch();
  assert(!(await shown()));
  assert.strictEqual(await openedTitle(), 'Processus marchand');
  ok('« Afficher l\'accueil au démarrage » décoché : dernier document ouvert directement');
  await v(() => window.FTApp.menu('home'));
  await page.check('#wl-at-start');
  await page.keyboard.press('Escape');

  // Lancement par un document (double-clic dans l'Explorateur) : pas d'accueil.
  const recettes = await v(async () => (await window.frameText.loadLibrary()).docs.find((d) => d.title === 'Recettes').fileName);
  const real = handlers.get('app:pendingFiles');
  let once = [recettes];
  handlers.set('app:pendingFiles', async () => { const f = once; once = []; return f; });
  await relaunch();
  handlers.set('app:pendingFiles', real);
  assert(!(await shown()));
  assert.strictEqual(await openedTitle(), 'Recettes');
  assert.strictEqual(await seen(), 'rien > document');
  ok('lancement par un document : accueil ignoré, document ouvert directement');

  // Sans fichier : l'accueil revient.
  await relaunch();
  assert(await shown());
  assert.strictEqual(await seen(), 'rien > accueil');
  ok('lancement suivant sans fichier : accueil directement');
};
