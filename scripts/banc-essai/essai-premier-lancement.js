// Essai de la fenêtre du premier lancement (2.4.26) : LanguageTool (bouton « Télécharger et installer »,
// avancement affiché dans la fenêtre, faux téléchargement), LLM local (« Indiquer l'emplacement du LLM… » :
// le modèle GGUF est trouvé dans les sous-dossiers, les faux fichiers écartés), puis tutoriel. Même bouton
// dans les réglages de l'AAT ; « Retirer ce modèle » ne supprime pas le fichier.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-premier-lancement.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || os.tmpdir();
const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const app = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Faux LanguageTool : pas installé, puis un téléchargement en quelques étapes.
  const lt = require(path.join(SRC, 'languagetool.js'));
  const real = { installed: lt.installed, install: lt.install, check: lt.check, isInstalling: lt.isInstalling };
  let done = false;
  let busy = false;
  lt.installed = () => done;
  lt.isInstalling = () => busy;
  lt.check = async () => [];
  lt.install = async (cb) => {
    busy = true;
    for (let pct = 0; pct <= 80; pct += 20) { cb({ step: 'download', pct, detail: 'LanguageTool 6.6' }); await wait(250); }
    cb({ step: 'extract', pct: 90, detail: '' });
    await wait(250);
    busy = false;
    done = true;
  };

  // Dossier choisi : un modèle GGUF dans un sous-dossier, un projecteur d'images et un faux .gguf.
  const llmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-'));
  const sub = path.join(llmDir, 'Mon modèle');
  fs.mkdirSync(sub);
  const gguf = (file, n) => fs.writeFileSync(file, Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(n)]));
  const modelFile = path.join(sub, 'Mon-Modele-Q4_K_M.gguf');
  gguf(modelFile, 4096);
  gguf(path.join(sub, 'mmproj-Mon-Modele.gguf'), 8192);
  fs.writeFileSync(path.join(llmDir, 'faux.gguf'), 'pas un modèle');
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vide-'));
  let chosen = emptyDir;
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });

  try {
    // 1. Premier lancement : la fenêtre s'ouvre, LanguageTool pas installé, pas de LLM.
    delete process.env.FT_SANS_TUTORIEL;
    await page.reload();
    await page.waitForTimeout(1800);
    let st = await app(() => ({
      open: document.getElementById('first-run').open,
      order: [...document.querySelectorAll('#first-run .fr-part')].map((s) => s.id),
      link: document.querySelector('#fr-lt a').href,
      install: !document.getElementById('fr-lt-install').hidden,
      llm: document.getElementById('fr-llm-state').textContent,
      text: document.getElementById('first-run').innerText
    }));
    assert(st.open, 'fenêtre ouverte au premier lancement');
    assert.deepStrictEqual(st.order, ['fr-lt', 'fr-llm', 'fr-tuto']);
    assert.strictEqual(st.link, 'https://languagetool.org/');
    assert(st.install && !st.llm, 'bouton d’installation, aucun LLM');
    assert(/facultatif/i.test(st.text) && /fonctionne sans/.test(st.text), 'LLM facultatif');
    await page.screenshot({ path: path.join(SHOTS, 'premier-lancement-0.png') });
    ok('fenêtre : LanguageTool, LLM local (facultatif), tutoriel, dans cet ordre ; lien languagetool.org');

    // 2. Installation de LanguageTool : avancement dans la fenêtre, pas dans l'encadré du coin.
    await page.click('#fr-lt-install');
    await page.waitForTimeout(600);
    st = await app(() => ({
      state: document.getElementById('fr-lt-state').textContent,
      bar: !document.getElementById('fr-lt-bar').hidden,
      button: !document.getElementById('fr-lt-install').hidden,
      corner: !!document.getElementById('lt-progress')
    }));
    assert(/^Téléchargement… \d+ %$/.test(st.state), st.state);
    assert(st.bar && !st.button && !st.corner, 'barre dans la fenêtre');
    await page.screenshot({ path: path.join(SHOTS, 'premier-lancement-1-installation.png') });
    await page.waitForTimeout(1800);
    st = await app(() => ({ state: document.getElementById('fr-lt-state').textContent, bar: !document.getElementById('fr-lt-bar').hidden, cls: document.getElementById('fr-lt-state').className }));
    assert.strictEqual(st.state, 'Installé.');
    assert(!st.bar && /fr-ok/.test(st.cls));
    ok('« Télécharger et installer » : étapes et pourcentage dans la fenêtre, puis « Installé. »');

    // 3. LLM : dossier sans modèle, puis dossier avec un modèle dans un sous-dossier.
    await page.click('#fr-llm-locate');
    await page.waitForTimeout(400);
    st = await app(() => document.getElementById('fr-llm-state').textContent);
    assert(/Aucun modèle/.test(st), st);
    chosen = llmDir;
    await page.click('#fr-llm-locate');
    await page.waitForTimeout(600);
    st = await app(() => ({ state: document.getElementById('fr-llm-state').textContent, title: document.getElementById('fr-llm-state').title, btn: document.getElementById('fr-llm-locate').textContent }));
    assert.strictEqual(st.state, 'Connecté : Mon-Modele-Q4_K_M');
    assert.strictEqual(st.title, modelFile);
    assert.strictEqual(st.btn, 'Changer…');
    const aide = JSON.parse(fs.readFileSync(path.join(electron._test.paths.userData || electron.app.getPath('userData'), 'aide.json'), 'utf8'));
    assert.strictEqual(aide.modelFile, modelFile);
    assert.strictEqual(aide.localModel, 'perso');
    await page.screenshot({ path: path.join(SHOTS, 'premier-lancement-2-llm.png') });
    ok('emplacement du LLM : dossier vide refusé ; modèle trouvé dans un sous-dossier (projecteur et faux fichier écartés), connecté');

    // 4. « Plus tard » : pas de tutoriel ouvert ; la fenêtre ne revient plus.
    await page.click('#fr-later');
    await page.waitForTimeout(800);
    assert(!(await app(() => document.getElementById('first-run').open)));
    assert.notStrictEqual(await app(() => window.FTApp.docName()), '1. Bienvenue dans Tomatoes Text');
    await page.reload();
    await page.waitForTimeout(1800);
    assert(!(await app(() => document.getElementById('first-run').open)), 'une seule fois');
    ok('« Plus tard » ferme la fenêtre ; elle ne revient pas au lancement suivant');

    // 5. Réglages de l'AAT : modèle indiqué prêt, même bouton, « Retirer ce modèle » garde le fichier.
    await app(() => { window.FTApp.menu('new'); });
    await page.waitForTimeout(600);
    if (await app(() => document.getElementById('modal').open)) await page.click('#modal-ok');
    await app(() => window.FTAssistant.toggle(true));
    await page.waitForTimeout(800);
    st = await app(() => ({
      select: document.getElementById('assist-model').selectedOptions[0].textContent,
      status: document.getElementById('assist-model-status').textContent,
      del: document.getElementById('assist-model-delete').textContent,
      delShown: !document.getElementById('assist-model-delete').hidden,
      download: !document.getElementById('assist-model-download').hidden,
      locate: !!document.getElementById('assist-model-locate')
    }));
    assert.strictEqual(st.select, 'Mon-Modele-Q4_K_M');
    assert(st.status.startsWith('Mon-Modele-Q4_K_M : prêt'), st.status);
    assert(st.locate && st.delShown && !st.download && st.del === 'Retirer ce modèle', JSON.stringify(st));
    await app(() => { document.getElementById('assist-settings').open = true; });
    await page.screenshot({ path: path.join(SHOTS, 'premier-lancement-3-reglages-aat.png') });
    await page.click('#assist-model-delete');
    await page.waitForTimeout(600);
    st = await app(() => [...document.getElementById('assist-model').options].map((o) => o.value));
    assert(!st.includes('perso'), st.join());
    assert(fs.existsSync(modelFile), 'fichier gardé');
    // Le bouton des réglages reconnecte le modèle.
    await page.click('#assist-model-locate');
    await page.waitForTimeout(600);
    st = await app(() => ({ value: document.getElementById('assist-model').value, status: document.getElementById('assist-model-status').textContent }));
    assert.strictEqual(st.value, 'perso');
    assert(st.status.includes('prêt'), st.status);
    ok('réglages de l’AAT : modèle indiqué « prêt », « Retirer ce modèle » sans effacer le fichier, bouton « Indiquer l’emplacement du LLM… »');
  } finally {
    Object.assign(lt, real);
    process.env.FT_SANS_TUTORIEL = '1';
    fs.rmSync(llmDir, { recursive: true, force: true });
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
};
