// Vérifie que l'allègement de LanguageTool (trimLanguages, src/languagetool.js) ne change aucune remarque :
// une copie complète et une copie allégée tournent côte à côte et relisent les mêmes textes dans les six
// langues des documents (niveaux « default » et « picky »).
// Usage : node scripts/test-allegement-languagetool.js <dossier LanguageTool-6.6 complet> (Java doit être installé)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const lt = require(path.join(__dirname, '..', 'src', 'languagetool.js'));

const TEXTS = {
  fr: "Les enfants a mangé des pomme hier soir. Il faut que tu viens demain. Je suis allé a Paris avec mes amis , et nous avons vu leurs maison. Malgré qu'il pleut, ils sont sortit. Ce sont des gens qui ont étaient très gentils. C'est la plus meilleure solution. Il y a trois chat noirs dans le jardin, et sa me plait beaucoup.",
  'en-US': "He go to school every days. Their is a problem with you're car. I could of done it better. She don't like apples, and they was late. This is an historic moment for we. The data shows that less people came. Its a nice day, isn't it.",
  'de-DE': 'Ich habe gestern ein schöne Haus gesehen. Er gehen morgen in die Schule. Das ist dem Mann sein Auto. Wegen dem Wetter bleiben wir zu Hause. Ich denke das er kommt. Die Kinder spielt im Garten.',
  es: 'Los niños come manzanas cada días. Yo a ido al mercado ayer. Hubieron muchas personas en la fiesta. Es mas facil decir que hacer. La gente estaban contentos. Pienso de que vendrá mañana.',
  it: "I bambini mangia le mele ogni giorni. Io ho andato al mercato ieri. Qual'è il problema? Ce ne sono molte persone. Un'amico mi ha detto che e vero. Se avrei tempo verrei.",
  'pt-PT': 'Os meninos come maçãs todos os dia. Eu fui no mercado ontem. Houveram muitas pessoas na festa. Fazem dois anos que não o vejo. A gente fomos ao cinema. Ele disse à mim que vinha.'
};

const start = (dir, port) => spawn('java', ['-Xmx1g', '-Dfile.encoding=UTF-8', '-cp', path.join(dir, 'languagetool-server.jar'),
  'org.languagetool.server.HTTPServer', '--port', String(port)], { cwd: dir, stdio: 'ignore' });

async function waitUp(port) {
  for (let i = 0; i < 240; i++) {
    try { await fetch(`http://127.0.0.1:${port}/v2/languages`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`LanguageTool ne démarre pas (port ${port}).`);
}

async function ask(port, language, text, level) {
  const body = new URLSearchParams({ text, language, level });
  const r = await fetch(`http://127.0.0.1:${port}/v2/check`, { method: 'POST', body });
  if (!r.ok) return `HTTP ${r.status}`;
  return (await r.json()).matches.map((m) => [m.offset, m.length, m.rule.id, m.message, m.replacements.slice(0, 5).map((x) => x.value)]);
}

(async () => {
  const full = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(path.join(full, 'languagetool-server.jar'))) throw new Error('Indiquer le dossier LanguageTool-6.6 complet.');
  const light = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-allege-'));
  fs.cpSync(full, light, { recursive: true });
  console.log(`${Math.round((await lt.trimLanguages(light)) / 1048576)} Mo retirés`);
  const a = start(full, 8091);
  const b = start(light, 8092);
  let same = true;
  try {
    await waitUp(8091);
    await waitUp(8092);
    for (const [lang, text] of Object.entries(TEXTS)) {
      for (const level of ['default', 'picky']) {
        const x = await ask(8091, lang, text, level);
        const y = await ask(8092, lang, text, level);
        const eq = JSON.stringify(x) === JSON.stringify(y);
        same = same && eq && Array.isArray(x);
        console.log(`${lang.padEnd(6)} ${level.padEnd(8)} ${eq ? 'identique' : 'DIFFÉRENT'} (${Array.isArray(x) ? x.length + ' remarques' : x})`);
      }
    }
  } finally {
    a.kill();
    b.kill();
    fs.rmSync(light, { recursive: true, force: true });
  }
  console.log(same ? 'Remarques identiques.' : 'ÉCARTS');
  process.exit(same ? 0 : 1);
})().catch((err) => { console.error(err.message); process.exit(1); });
