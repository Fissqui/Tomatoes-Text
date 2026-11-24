// Essai de l'allègement de LanguageTool (2.5.3) : pour les langues qui ne sont pas celles des documents,
// les dictionnaires et règles écrites sont retirés, le code (.class) et les mots courants restent (LanguageTool
// déclare toutes ses langues au démarrage) ; les langues des documents et les bibliothèques communes ne
// sont pas touchées ; l'installation est marquée allégée et n'est pas refaite.
// Vérifié à part avec le vrai LanguageTool : remarques identiques avant et après dans les six langues
// (scripts/test-allegement-languagetool.js).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-allegement.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');

module.exports = async () => {
  const ok = (m) => console.log('  OK  ' + m);
  const lt = require(path.join(SRC, 'languagetool.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-allegement-'));
  const ltDir = path.join(dir, lt.DOWNLOADS.languagetool.folder);
  const put = (rel, text = 'x') => {
    const f = path.join(ltDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  };
  const props = 'languageClasses=org.languagetool.language.Arabic\nlanguageClasses=org.languagetool.language.French\n';
  put('languagetool-server.jar');
  put('META-INF/org/languagetool/language-module.properties', props);
  for (const lang of ['fr', 'en', 'de', 'es', 'it', 'pt', 'zh', 'nl', 'ar', 'de-DE-x-simple-language']) {
    put(`org/languagetool/resource/${lang}/common_words.txt`);
    put(`org/languagetool/resource/${lang}/hunspell/${lang}.dict`, 'y'.repeat(1000));
    put(`org/languagetool/rules/${lang}/grammar.xml`, 'z'.repeat(1000));
    put(`org/languagetool/rules/${lang}/SpellerRule.class`);
  }
  for (const jar of ['dutch-pos-dict.jar', 'hanlp.jar', 'french-pos-dict.jar', 'languagetool-core.jar', 'opennlp-tools.jar']) put(`libs/${jar}`, 'j'.repeat(500));
  fs.mkdirSync(path.join(dir, 'jre', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'jre', 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java'), '');
  fs.writeFileSync(path.join(dir, 'installe.json'), JSON.stringify({ version: lt.LT_VERSION, languagetool: lt.DOWNLOADS.languagetool.folder }));

  const has = (rel) => fs.existsSync(path.join(ltDir, rel));
  process.env.FT_LANGUAGETOOL_DIR = dir;
  try {
    const freed = await lt.trimAll();
    assert(freed > 4000, 'octets libérés : ' + freed);
    for (const lang of ['fr', 'en', 'de', 'es', 'it', 'pt', 'zh']) {
      assert(has(`org/languagetool/resource/${lang}/hunspell/${lang}.dict`) && has(`org/languagetool/rules/${lang}/grammar.xml`), lang);
    }
    ok('langues des documents et mandarin gardés (fr, en, de, es, it, pt, zh)');
    for (const lang of ['nl', 'ar', 'de-DE-x-simple-language']) {
      assert(!has(`org/languagetool/resource/${lang}/hunspell/${lang}.dict`) && !has(`org/languagetool/rules/${lang}/grammar.xml`), lang);
      assert(has(`org/languagetool/resource/${lang}/common_words.txt`) && has(`org/languagetool/rules/${lang}/SpellerRule.class`), lang);
    }
    ok('autres langues : dictionnaires et règles retirés, code et mots courants gardés');
    assert(!has('libs/dutch-pos-dict.jar'));
    assert(has('libs/hanlp.jar') && has('libs/french-pos-dict.jar') && has('libs/languagetool-core.jar') && has('libs/opennlp-tools.jar'));
    ok('bibliothèques des langues retirées supprimées, les autres gardées');
    assert.strictEqual(fs.readFileSync(path.join(ltDir, 'META-INF/org/languagetool/language-module.properties'), 'utf8'), props);
    ok('liste des langues de LanguageTool inchangée');
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'installe.json'), 'utf8'));
    assert.strictEqual(info.allege, lt.TRIM_LEVEL);
    assert.strictEqual(info.languagetool, lt.DOWNLOADS.languagetool.folder);
    put('org/languagetool/rules/nl/grammar.xml', 'z');
    assert.strictEqual(await lt.trimAll(), 0);
    assert(has('org/languagetool/rules/nl/grammar.xml'));
    ok('installation marquée allégée, pas refaite au démarrage suivant');
    assert(lt.find(), 'LanguageTool toujours trouvé');
    ok('LanguageTool toujours reconnu comme installé');
  } finally {
    delete process.env.FT_LANGUAGETOOL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
