// Essai de la mise à jour en un clic, sans aucun réglage : version de développement (dossier de travail,
// puis GitHub Releases) et version publiée (GitHub Releases du dépôt public, sans clé).
// Un faux dépôt « GitHub » est fabriqué à partir de ce dépôt, avec une version 9.9.9 en plus.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

module.exports = async ({ page, electron }) => {
  const { handlers } = electron._test;
  const repoPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'version.json'), 'utf8')).version, repoPkg.version, 'src/version.json doit suivre package.json');
  const ok = (m) => console.log('  OK  ' + m);
  // Numéro de la version installée, en petit à côté de son nom.
  const brand = await page.evaluate(() => ({ text: document.querySelector('.brand-codename').textContent, num: document.querySelector('.brand-version').textContent, title: document.querySelector('.brand-codename').title }));
  const short = repoPkg.version.replace(/\.0$/, '');
  assert(brand.num === short && brand.title === 'Version ' + short && brand.text.endsWith(' ' + short), JSON.stringify(brand));
  ok(`barre latérale : « ${brand.text} »`);
  const call = (ch, ...a) => handlers.get(ch)({ sender: { send() {} } }, ...a);
  const repo = path.join(__dirname, '..', '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-maj-'));
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Essai', GIT_AUTHOR_EMAIL: 'e@x', GIT_COMMITTER_NAME: 'Essai', GIT_COMMITTER_EMAIL: 'e@x' } });

  // Faux GitHub (dépôt nu), dossier de travail en retard d'une version, logiciel « installé ».
  const remote = path.join(tmp, 'remote.git');
  sh(tmp, 'clone', '--quiet', '--bare', repo, remote);
  sh(remote, 'update-ref', 'refs/heads/main', sh(repo, 'rev-parse', 'HEAD').trim());
  sh(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const work = path.join(tmp, 'travail');
  sh(tmp, 'clone', '--quiet', remote, work);
  const folder = path.join(tmp, 'Frame Text');
  sh(tmp, 'clone', '--quiet', remote, folder);
  // (stale : src/version.json oublié, comme en 2.3.4 à 2.3.9 ; la version installée suit quand même.)
  const bump = (v, msg, stale) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8'));
    pkg.version = v;
    fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    if (!stale) fs.writeFileSync(path.join(work, 'src', 'version.json'), JSON.stringify({ version: v }) + '\n');
    fs.writeFileSync(path.join(work, 'src', 'nouveau-fichier.js'), '// ' + v + '\n');
    sh(work, 'add', '-A');
    sh(work, 'commit', '--quiet', '-m', msg);
    sh(work, 'push', '--quiet', 'origin', 'HEAD:main');
  };
  bump('9.9.8', 'Version 9.9.8 : premier essai');
  bump('9.9.9', 'Version 9.9.9 : second essai', true);

  const app = path.join(tmp, 'installe', 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.cpSync(path.join(repo, 'src'), path.join(app, 'src'), { recursive: true });
  const { devDependencies, scripts, ...appPkg } = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ ...appPkg, version: '1.1.0' }));
  process.env.FT_UPDATE_TARGET = path.join(app, 'src');
  const installed = JSON.parse(fs.readFileSync(path.join(repo, 'src', 'version.json'), 'utf8')).version;
  const settingsFile = path.join(electron.app.getPath('userData'), 'mise-a-jour.json');
  // Version de développement (comme avec src/prive.json), quel que soit le dossier src essayé.
  process.env.FT_UPDATE_PRIVE = JSON.stringify({ dossiers: [path.join(tmp, 'absent')] });

  // 1. Dossier introuvable et aucune version publiée : recherche impossible, message clair.
  global.fetch = async () => new Response('', { status: 404 });
  fs.writeFileSync(settingsFile, JSON.stringify({ folder: path.join(tmp, 'absent') }));
  let res = await call('update:check', { interactive: false });
  assert(!res.ok && /aucune version publiée/i.test(res.notes.join(' ')), JSON.stringify(res));
  ok('sans dossier ni version publiée : « ' + res.notes.join(' / ') + ' »');

  // 2. Dossier de travail : deux versions de retard.
  fs.writeFileSync(settingsFile, JSON.stringify({ folder }));
  res = await call('update:check', { interactive: false });
  assert(res.ok && res.available && res.latest === '9.9.9' && res.source === 'dossier', JSON.stringify(res));
  assert.strictEqual(res.installed, installed);
  assert.deepStrictEqual(res.changes.slice(0, 2), ['Version 9.9.9 : second essai', 'Version 9.9.8 : premier essai']);
  ok(`dossier de travail : ${res.installed} → ${res.latest}, nouveautés : ${res.changes.length}`);

  res = await call('update:apply');
  assert(res.ok && res.version === '9.9.9', JSON.stringify(res));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'src', 'version.json'), 'utf8')).version, '9.9.9');
  assert(fs.existsSync(path.join(app, 'src', 'nouveau-fichier.js')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version, '9.9.9');
  assert(!JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).devDependencies);
  assert.strictEqual(sh(folder, 'rev-parse', 'HEAD'), sh(remote, 'rev-parse', 'main'));
  ok('mise à jour par le dossier : dossier avancé, fichiers et package.json du logiciel installé remplacés');
  res = await call('update:check', { interactive: false });
  assert(res.ok && !res.available, JSON.stringify(res));
  ok('nouvelle recherche : « à jour » (' + res.installed + ')');

  // 3. Nouveaux composants (dependencies changées) : refus, rien n'est copié.
  const pkgW = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8'));
  pkgW.version = '9.9.10';
  pkgW.dependencies = { ...pkgW.dependencies, 'nouveau-module': '1.0.0' };
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify(pkgW, null, 2));
  sh(work, 'commit', '--quiet', '-am', 'Version 9.9.10 : nouveau composant');
  sh(work, 'push', '--quiet', 'origin', 'HEAD:main');
  res = await call('update:apply');
  assert(!res.ok && /réinstallation complète/.test(res.error), JSON.stringify(res));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version, '9.9.9');
  ok('nouveau composant : « ' + res.error + ' »');
  sh(work, 'reset', '--quiet', '--hard', 'HEAD~1');
  sh(work, 'push', '--quiet', '--force', 'origin', 'HEAD:main');
  sh(folder, 'fetch', '--quiet', 'origin');
  sh(folder, 'reset', '--quiet', '--hard', 'origin/main');

  // 5. Interface : fenêtre ouverte par le menu Aide.
  fs.writeFileSync(settingsFile, JSON.stringify({ folder }));
  sh(work, 'commit', '--quiet', '--allow-empty', '-m', 'Version 9.9.11 : encore');
  const pkg11 = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8'));
  pkg11.version = '9.9.11';
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify(pkg11, null, 2));
  sh(work, 'commit', '--quiet', '-am', 'Version 9.9.11 : encore');
  sh(work, 'push', '--quiet', 'origin', 'HEAD:main');
  await page.evaluate(() => window.__ftEmit('menu', ['update']));
  await page.waitForFunction(() => /disponible|à jour|impossible/.test(document.getElementById('up-status').textContent), null, { timeout: 15000 });
  const ui = await page.evaluate(() => ({ status: document.getElementById('up-status').textContent, items: document.querySelectorAll('#up-list li').length, apply: !document.getElementById('up-apply').hidden }));
  assert(/Version 9\.9\.11 disponible/.test(ui.status) && ui.apply, JSON.stringify(ui));
  assert(!(await page.$('#up-settings')), 'aucun réglage dans la fenêtre');
  ok('fenêtre sans réglage : « ' + ui.status + ' », ' + ui.items + ' nouveautés');
  await page.screenshot({ path: path.join(tmp, 'fenetre.png') });
  console.log('      capture : ' + path.join(tmp, 'fenetre.png'));
  await page.click('#up-apply');
  await page.waitForFunction(() => /Redémarrage|échoué/.test(document.getElementById('up-status').textContent), null, { timeout: 15000 });
  const after = await page.evaluate(() => document.getElementById('up-status').textContent + ' ' + document.getElementById('up-error').textContent);
  assert(/Redémarrage/.test(after), after);
  await page.waitForTimeout(1200);
  assert.strictEqual(electron.app.relaunched, 1);
  ok('« Mettre à jour et redémarrer » : installé puis redémarrage demandé');

  // 6. Version publiée (sans src/prive.json) : GitHub Releases du dépôt public, sans clé (faux serveur).
  process.env.FT_UPDATE_PRIVE = '';
  process.env.FT_UPDATE_API = 'https://api.essai';
  const stage = path.join(tmp, 'publication');
  const release = (v, extra = {}) => {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage);
    execFileSync('sh', ['-c', `git -C "${remote}" archive --format=tar main src | tar -x -C "${stage}"`]);
    const pkgR = { ...JSON.parse(execFileSync('git', ['show', 'main:package.json'], { cwd: remote, encoding: 'utf8' })), version: v, ...extra };
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkgR, null, 2));
    fs.writeFileSync(path.join(stage, 'src', 'version.json'), JSON.stringify({ version: v }));
    return execFileSync('tar', ['-czf', '-', '-C', stage, 'package.json', 'src'], { maxBuffer: 1 << 28 });
  };
  const files = { '9.9.12': release('9.9.12'), '9.9.13': release('9.9.13', { dependencies: { ...repoPkg.dependencies, 'nouveau-module': '1.0.0' } }) };
  const rel = (v, body) => ({
    tag_name: 'v' + v, draft: false, prerelease: false, body,
    assets: [
      { name: `Tomatoes-Text-${v}-fichiers.tar.gz`, browser_download_url: `https://dl.essai/${v}/fichiers.tar.gz` },
      { name: `Tomatoes-Text-Installation-${v}.exe`, browser_download_url: `https://dl.essai/${v}/installation.exe` }
    ]
  });
  let published = [rel('9.9.12', '## Nouveautés\n- Correctif A\n- **Correctif B**'), rel('9.9.11', '- Ancienne nouveauté'), { ...rel('9.9.20', 'brouillon'), draft: true }];
  const urls = [];
  global.fetch = async (url, opts) => {
    urls.push(url);
    assert(!opts.headers.Authorization, 'aucune clé ne doit être envoyée');
    if (url.startsWith('https://api.essai/repos/Fissqui/Tomatoes-Text/releases')) return published ? Response.json(published) : new Response('', { status: 404 });
    const m = /^https:\/\/dl\.essai\/([\d.]+)\/(fichiers\.tar\.gz|installation\.exe)$/.exec(url);
    if (m) return new Response(m[2] === 'installation.exe' ? Buffer.from('MZ faux') : files[m[1]]);
    return new Response('', { status: 404 });
  };
  fs.writeFileSync(path.join(app, 'src', 'version.json'), JSON.stringify({ version: '9.9.10' }));
  res = await call('update:check', { interactive: false });
  assert(res.ok && res.source === 'public' && res.available && res.latest === '9.9.12', JSON.stringify(res));
  assert.deepStrictEqual(res.changes, ['Correctif A', 'Correctif B', 'Ancienne nouveauté']);
  ok(`version publiée : ${res.installed} → ${res.latest}, brouillon ignoré, nouveautés : ${res.changes.join(' / ')}`);
  // Version de développement dont le dossier de travail est absent : même recherche, sur GitHub Releases.
  process.env.FT_UPDATE_PRIVE = JSON.stringify({ dossiers: [path.join(tmp, 'absent')] });
  fs.writeFileSync(settingsFile, JSON.stringify({ folder: path.join(tmp, 'absent') }));
  res = await call('update:check', { interactive: false });
  assert(res.ok && res.source === 'public' && res.latest === '9.9.12', JSON.stringify(res));
  process.env.FT_UPDATE_PRIVE = '';
  ok('développement sans dossier de travail : GitHub Releases en secours');
  res = await call('update:apply');
  assert(res.ok && res.version === '9.9.12' && !res.setup, JSON.stringify(res));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'src', 'version.json'), 'utf8')).version, '9.9.12');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version, '9.9.12');
  assert(!fs.existsSync(path.join(electron.app.getPath('userData'), 'mise-a-jour')), 'dossier temporaire resté');
  res = await call('update:check', { interactive: false });
  assert(res.ok && !res.available, JSON.stringify(res));
  ok('mise à jour publiée : fichiers installés sans clé, puis « à jour »');

  // Nouveaux composants : le programme d'installation est téléchargé, lancé à la fermeture.
  published = [rel('9.9.13', '- Nouveau composant'), ...published];
  res = await call('update:apply');
  assert(res.ok && res.version === '9.9.13' && res.setup, JSON.stringify(res));
  assert(fs.existsSync(path.join(electron.app.getPath('temp'), 'Tomatoes-Text-Installation-9.9.13.exe')));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version, '9.9.12', 'rien ne doit être copié');
  ok('nouveaux composants : programme d\'installation téléchargé, fichiers installés inchangés');

  published = null;
  res = await call('update:check', { interactive: false });
  assert(!res.ok && /aucune version publiée/i.test(res.notes.join(' ')), JSON.stringify(res));
  ok('dépôt sans version publiée (ou encore privé) : « ' + res.notes.join(' / ') + ' »');
  delete process.env.FT_UPDATE_PRIVE;
  delete process.env.FT_UPDATE_API;
};
