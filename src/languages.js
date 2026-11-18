// Langues d'un document : le français, l'anglais, l'allemand, l'espagnol, l'italien, le portugais et
// le mandarin. Chaque document choisit les siennes ; la langue de chaque passage est reconnue parmi
// celles-ci, sans connexion : écriture chinoise, petits mots les plus courants de chaque langue,
// lettres propres à une langue (ß, ñ, ã…), puis mots reconnus par le dictionnaire de chaque langue.

// dicts : dictionnaires Hunspell (src/vendor), le premier donne les propositions de correction.
// thesaurus : synonymes (format MyThes, compressé ou non). tongue : « la langue … » dans les consignes du modèle.
const LANGS = {
  fr: { label: 'Français', name: 'français', tongue: 'française', dicts: ['dictionary-fr'], thesaurus: 'thesaurus-fr/thes_fr.dat' },
  en: { label: 'Anglais', name: 'anglais', tongue: 'anglaise', dicts: ['dictionary-en', 'dictionary-en-gb'], thesaurus: 'thesaurus-en/thes_en.dat.gz' },
  de: { label: 'Allemand', name: 'allemand', tongue: 'allemande', dicts: ['dictionary-de'], thesaurus: 'thesaurus-de/thes_de.dat.gz' },
  es: { label: 'Espagnol', name: 'espagnol', tongue: 'espagnole', dicts: ['dictionary-es'], thesaurus: 'thesaurus-es/thes_es.dat.gz' },
  it: { label: 'Italien', name: 'italien', tongue: 'italienne', dicts: ['dictionary-it'], thesaurus: 'thesaurus-it/thes_it.dat.gz' },
  pt: { label: 'Portugais', name: 'portugais', tongue: 'portugaise', dicts: ['dictionary-pt-pt', 'dictionary-pt'], thesaurus: 'thesaurus-pt/thes_pt.dat.gz' },
  zh: { label: 'Mandarin', name: 'mandarin (chinois)', tongue: 'chinoise (mandarin)', dicts: [], thesaurus: null }
};
const CODES = Object.keys(LANGS);
const DEFAULT = ['fr'];

// Liste valide de langues (dans l'ordre donné, la première est la langue principale).
function clean(list) {
  const out = [];
  for (const code of Array.isArray(list) ? list : []) if (LANGS[code] && !out.includes(code)) out.push(code);
  return out.length ? out : DEFAULT.slice();
}

const nameOf = (code) => (LANGS[code] || LANGS.fr).name;

// ----- Reconnaissance de la langue d'un passage -----

// Mots-outils les plus courants de chaque langue.
const STOP = {
  fr: 'le la les un une des du de et est sont pas ne que qui dans pour sur avec au aux ce cette ces il elle ils elles nous vous je on se sa son ses leur leurs mais ou où donc car très plus aussi bien être avoir fait été était comme tout tous même par en y',
  en: 'the a an and is are was were be been of to in on at for with by from that this these those it its he she they we you i not but or if then than there their which who what when where will would can could should have has had do does did my your his her our them as so very about into',
  de: 'der die das den dem des ein eine einen einem einer und ist sind war waren nicht ich du er sie es wir ihr mit von zu auf für im in an dem auch aber oder wenn dass wie noch nur sich bei nach aus über sehr schon kein keine hat haben wird werden',
  es: 'el la los las un una unos unas y es son está están no que de del en por para con se su sus lo al como pero más muy ya también ser hay fue era este esta estos estas ese esa yo tú él ella nosotros ellos le les me mi cuando donde porque',
  it: 'il lo la i gli le un uno una e è sono era non che di del della dei delle in per con su si suo sua suoi ma più molto anche come questo questa quello quella io tu lui lei noi voi loro ha hanno ho essere stato nel nella al alla da dal gli perché',
  pt: 'o a os as um uma uns umas e é são está estão não que de do da dos das em no na nos nas por para com se seu sua seus mas mais muito também como este esta isso esse essa eu ele ela nós eles elas ao à foi era ser tem há quando onde porque você'
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));

// Lettres qui trahissent une langue (un indice léger : beaucoup sont partagées).
const LETTERS = {
  fr: /[èêëîïôûùœç]/g,
  de: /[äöüß]/g,
  es: /[ñ¿¡]/g,
  it: /[òìù]/g,
  pt: /[ãõç]/g
};

const HAN = /\p{Script=Han}/gu;
const LATIN = /\p{Script=Latin}/gu;
const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;

// spellers : { code: { testSpelling(word) } } (dictionaires déjà chargés), facultatif.
// Renvoie { lang, sure } : sure = la langue l'emporte nettement (sinon, le passage est trop court ou ambigu).
function detect(text, langs, spellers = {}) {
  langs = clean(langs);
  if (langs.length === 1) return { lang: langs[0], sure: true };
  text = String(text || '');
  const han = (text.match(HAN) || []).length;
  const latin = (text.match(LATIN) || []).length;
  if (langs.includes('zh') && han && han * 2 >= latin) return { lang: 'zh', sure: han >= 2 };
  const candidates = langs.filter((c) => c !== 'zh');
  if (!candidates.length) return { lang: langs[0], sure: false };
  if (candidates.length === 1) return { lang: candidates[0], sure: latin > 0 };
  const words = (text.match(WORD) || []).slice(0, 60);
  const lower = text.toLowerCase();
  const scores = candidates.map((code) => {
    let score = 0;
    const stops = STOP_SETS[code];
    const speller = spellers[code];
    let checked = 0;
    for (const w of words) {
      const l = w.toLowerCase();
      if (stops && stops.has(l)) score += 2;
      // Le dictionnaire départage les mots pleins (les mots très longs, coûteux à vérifier en allemand, sont laissés).
      if (speller && w.length > 2 && w.length <= 14 && checked < 40) {
        checked++;
        try { if (speller.testSpelling(w) || speller.testSpelling(l)) score += 1; } catch { /* mot ignoré */ }
      }
    }
    if (LETTERS[code]) score += 0.75 * Math.min(4, (lower.match(LETTERS[code]) || []).length);
    return { code, score };
  });
  scores.sort((a, b) => b.score - a.score || candidates.indexOf(a.code) - candidates.indexOf(b.code));
  const [best, second] = scores;
  if (best.score <= 0) return { lang: langs[0], sure: false };
  const margin = best.score - second.score;
  return { lang: best.code, sure: words.length >= 3 && margin >= Math.max(2, words.length * 0.15) };
}

module.exports = { LANGS, CODES, DEFAULT, clean, nameOf, detect };
