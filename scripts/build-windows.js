// Fabrique la version Windows :
// - dist/Tomatoes-Text-Installation-<version>.exe : programme d'installation (Windows 10 et 11).
// - dist/Tomatoes-Text-<version>-fichiers.tar.gz : fichiers du logiciel (src/ et package.json), utilisés par
//   la mise à jour intégrée quand ni Electron ni les composants ne changent.
// Ni src/prive.json (réglages locaux de développement) ni src/edition.json ne sont livrés ; la fabrication
// s'arrête si un fichier livré contient un chemin local.
// - dist/installation (sauf avec --publication) : version de développement, en morceaux + Installer-Tomatoes-Text.bat.
// Utilisation : npm run build:win (makensis doit être installé : paquet nsis).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const productName = pkg.productName;
const dist = path.join(root, 'dist');
const out = path.join(dist, productName);

async function main() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  // Téléchargement d'Electron pour Windows (empreinte vérifiée automatiquement).
  const zip = await downloadArtifact({ version: electronVersion, platform: 'win32', arch: 'x64', artifactName: 'electron' });
  await extract(zip, { dir: out });

  const exe = path.join(out, `${productName}.exe`);
  fs.renameSync(path.join(out, 'electron.exe'), exe);
  fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
  // On ne garde que les traductions utiles de l'interface système (menus contextuels, etc.).
  for (const file of fs.readdirSync(path.join(out, 'locales'))) {
    if (!['fr.pak', 'en-US.pak'].includes(file)) fs.rmSync(path.join(out, 'locales', file));
  }

  // Copie du logiciel lui-même.
  const appDir = path.join(out, 'resources', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  const { devDependencies, scripts, ...appPkg } = pkg;
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2));
  const PRIVATE = ['prive.json', 'edition.json'].map((f) => path.join(root, 'src', f));
  fs.cpSync(path.join(root, 'src'), path.join(appDir, 'src'), { recursive: true, filter: (f) => !PRIVATE.includes(f) });
  // Bibliothèques nécessaires au fonctionnement (sans les outils de développement).
  const prodModules = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((p) => p.includes(`${path.sep}node_modules${path.sep}`));
  for (const mod of prodModules) {
    const rel = path.relative(root, mod);
    // Les moteurs d'IA précompilés pour Linux/Mac ne servent à rien sous Windows.
    if (rel.split(path.sep).includes('@node-llama-cpp')) continue;
    fs.cpSync(mod, path.join(appDir, rel), { recursive: true });
  }
  await addWindowsLlamaBinaries(appDir);

  await setExeDetails(exe);

  checkNothingPrivate(appDir);
  // LanguageTool (grammaire) livré avec le programme d'installation, pas avec la version de développement
  // (elle l'installe depuis le menu Édition).
  const ltDir = await addLanguageTool(out);
  const setup = path.join(dist, `Tomatoes-Text-Installation-${pkg.version}.exe`);
  execFileSync('makensis', ['-V2', '-INPUTCHARSET', 'UTF8', `-DVERSION=${pkg.version}`, `-DSOURCE=${out}`, `-DSORTIE=${setup}`,
    `-DICONE=${path.join(root, 'build', 'icon.ico')}`, path.join(root, 'installer', 'tomatoes-text.nsi')], { stdio: 'inherit' });
  console.log(`Programme d'installation : ${setup}`);

  fs.rmSync(ltDir, { recursive: true, force: true });

  // Fichiers pour la mise à jour intégrée : package.json complet (version d'Electron comprise) et src/.
  const stage = path.join(dist, 'fichiers');
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.cpSync(path.join(appDir, 'src'), path.join(stage, 'src'), { recursive: true });
  const files = path.join(dist, `Tomatoes-Text-${pkg.version}-fichiers.tar.gz`);
  execFileSync('tar', ['-czf', files, '-C', stage, 'package.json', 'src']);
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`Fichiers de mise à jour : ${files}`);
  if (process.argv.includes('--publication')) return;

  // Version de développement : la même, avec src/prive.json s'il existe (mise à jour depuis le dossier de travail).
  const prive = path.join(root, 'src', 'prive.json');
  if (fs.existsSync(prive)) fs.copyFileSync(prive, path.join(appDir, 'src', 'prive.json'));
  execFileSync('zip', ['-qr9', `${productName}-Windows.zip`, productName], { cwd: dist });
  splitForInstaller(path.join(dist, `${productName}-Windows.zip`));
  console.log(`Prêt : ${path.join(dist, 'installation')}`);
}

// Aucun fichier livré ne doit contenir un chemin local (dossiers de src/prive.json, dossiers d'utilisateur).
function checkNothingPrivate(appDir) {
  let conf = {};
  try { conf = JSON.parse(fs.readFileSync(path.join(root, 'src', 'prive.json'), 'utf8')); } catch { /* absent */ }
  const words = (conf.dossiers || []).filter((w) => w && w.length > 3).map((w) => w.toLowerCase());
  const patterns = [/[a-z]:\\{1,2}users\\{1,2}[^\\"'\s%$]/i, /\/home\/[a-z]/i];
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') walk(f); continue; }
      if (!/\.(js|json|html|css|txt|md|tmtx)$/i.test(e.name)) continue;
      const text = fs.readFileSync(f, 'latin1');
      const lower = text.toLowerCase();
      for (const w of words) if (lower.includes(w) || lower.includes(w.replace(/\\/g, '\\\\'))) found.push(`${path.relative(appDir, f)} (${w})`);
      for (const p of patterns) if (p.test(text)) found.push(`${path.relative(appDir, f)} (${p.exec(text)[0]})`);
    }
  };
  walk(appDir);
  if (found.length) throw new Error('Informations privées dans la version distribuée :\n' + found.join('\n'));
}

// LanguageTool et Java pour Windows (empreintes vérifiées) dans resources/languagetool. Les archives
// sont gardées en cache entre deux fabrications.
async function addLanguageTool(out) {
  const { DOWNLOADS, LT_VERSION } = require(path.join(root, 'src', 'languagetool.js'));
  const cache = path.join(require('os').homedir(), '.cache', 'tomatoes-languagetool');
  fs.mkdirSync(cache, { recursive: true });
  const dest = path.join(out, 'resources', 'languagetool');
  fs.rmSync(dest, { recursive: true, force: true });
  const tmp = path.join(dist, 'languagetool-contenu');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const item of [DOWNLOADS.jre, DOWNLOADS.languagetool]) {
    const file = path.join(cache, decodeURIComponent(item.url.split('/').pop()));
    const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    if (!fs.existsSync(file) || sha(file) !== item.sha256) {
      execFileSync('curl', ['-sSL', '--fail', '-o', file, item.url], { stdio: 'inherit' });
      if (sha(file) !== item.sha256) throw new Error(`Empreinte incorrecte : ${file}`);
    }
    execFileSync('unzip', ['-q', '-o', file, '-d', tmp]);
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.renameSync(path.join(tmp, DOWNLOADS.jre.folder), path.join(dest, 'jre'));
  fs.renameSync(path.join(tmp, DOWNLOADS.languagetool.folder), path.join(dest, DOWNLOADS.languagetool.folder));
  fs.writeFileSync(path.join(dest, 'installe.json'), JSON.stringify({ version: LT_VERSION, languagetool: DOWNLOADS.languagetool.folder }, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  return dest;
}

// Moteurs llama.cpp précompilés pour Windows : processeur seul, et carte graphique (Vulkan).
async function addWindowsLlamaBinaries(appDir) {
  const version = require(path.join(root, 'node_modules', 'node-llama-cpp', 'package.json')).version;
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'frametext-llama-'));
  const dest = path.join(appDir, 'node_modules', '@node-llama-cpp');
  for (const name of ['win-x64', 'win-x64-vulkan']) {
    // npm refuse d'installer un paquet Windows sous Linux : on télécharge l'archive et on la déballe.
    const tarball = execFileSync('npm', ['pack', `@node-llama-cpp/${name}@${version}`, '--silent'], { cwd: tmp, encoding: 'utf8' }).trim().split('\n').pop();
    const target = path.join(dest, name);
    fs.mkdirSync(target, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(tmp, tarball), '-C', target, '--strip-components=1']);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Découpe le .zip en morceaux de 25 Mo (taille maximale d'un transfert vers le PC)
// et y joint l'installateur, qui les rassemble.
function splitForInstaller(zipFile) {
  const outDir = path.join(dist, 'installation');
  fs.mkdirSync(outDir, { recursive: true });
  const data = fs.readFileSync(zipFile);
  const partSize = 25 * 1024 * 1024;
  for (let i = 0; i * partSize < data.length; i++) {
    fs.writeFileSync(path.join(outDir, `TomatoesText.part${i + 1}`), data.subarray(i * partSize, (i + 1) * partSize));
  }
  fs.copyFileSync(path.join(root, 'installer', 'Installer-Tomatoes-Text.bat'), path.join(outDir, 'Installer-Tomatoes-Text.bat'));
}

// Icône et informations (nom, version) affichées par Windows pour le .exe.
async function setExeDetails(exe) {
  const ResEdit = await import('resedit');
  const PELibrary = await import('pe-library');
  const data = fs.readFileSync(exe);
  const executable = PELibrary.NtExecutable.from(data);
  const res = PELibrary.NtExecutableResource.from(executable);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, groups.length ? groups[0].id : 1, groups.length ? groups[0].lang : 1033,
    iconFile.icons.map((i) => i.data)
  );

  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  vi.setFileVersion(major, minor, patch, 0, 1033);
  vi.setProductVersion(major, minor, patch, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: productName,
    ProductName: productName,
    InternalName: productName,
    OriginalFilename: `${productName}.exe`,
    CompanyName: productName,
    LegalCopyright: ''
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(executable);
  fs.writeFileSync(exe, Buffer.from(executable.generate()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
