// Faux texte (lorem ipsum en français), dans l'AAT : des phrases inventées mais correctes (accords,
// élisions, contractions), en paragraphes, phrases, lignes ou mots. Les lignes sont comptées à la largeur
// du texte du document ouvert. Aucun modèle n'est utilisé : le texte est tiré de listes de mots.
(function () {
  const $ = (id) => document.getElementById(id);

  // ----- Vocabulaire -----
  // Noms : 'm:jardin' (pluriel en s), 'f:saison', 'm:ruisseau|ruisseaux' (pluriel irrégulier).
  // Adjectifs : 'calme' (même forme au féminin), 'discret|discrète', 'doux|douce|doux|douces' ;
  // un « > » en tête : placé devant le nom (« un long chemin »).
  // Verbes : 'prolonge|prolongent|prolonger'.
  const BANKS = {
    general: {
      nouns: 'm:jardin m:chemin m:silence m:matin m:soir m:vent m:paysage m:souvenir m:regard m:horizon m:village m:ruisseau|ruisseaux m:nuage m:sentier m:voyage m:détail m:rythme m:murmure m:reflet m:hiver m:automne m:été m:feuillage m:verger m:carnet m:récit m:instant m:équilibre m:mystère m:secret m:désir m:élan m:atelier m:lieu|lieux m:oiseau|oiseaux m:arbre m:champ m:livre m:mot m:printemps|printemps ' +
        'f:lumière f:saison f:maison f:rivière f:idée f:histoire f:promesse f:fenêtre f:colline f:page f:mémoire f:forêt f:ombre f:route f:parole f:image f:musique f:terre f:couleur f:ville f:journée f:nuit f:pluie f:frontière f:lettre f:fleur f:branche f:attente f:énergie f:harmonie f:découverte f:étoile f:clarté f:rencontre f:saveur',
      adjs: 'calme discret|discrète lointain|lointaine secret|secrète doux|douce|doux|douces fragile paisible ancien|ancienne clair|claire profond|profonde immense simple silencieux|silencieuse|silencieux|silencieuses lumineux|lumineuse|lumineux|lumineuses ' +
        'patient|patiente tranquille vivant|vivante fidèle rare étrange ouvert|ouverte inattendu|inattendue subtil|subtile précieux|précieuse|précieux|précieuses sauvage éphémère attentif|attentive|attentifs|attentives ' +
        '>grand|grande >petit|petite >long|longue >dernier|dernière >premier|première >léger|légère >vaste',
      verbs: 'prolonge|prolongent|prolonger éclaire|éclairent|éclairer traverse|traversent|traverser dessine|dessinent|dessiner accompagne|accompagnent|accompagner révèle|révèlent|révéler protège|protègent|protéger rassemble|rassemblent|rassembler ' +
        'transforme|transforment|transformer nourrit|nourrissent|nourrir retient|retiennent|retenir devine|devinent|deviner invente|inventent|inventer prépare|préparent|préparer suit|suivent|suivre rejoint|rejoignent|rejoindre ' +
        'rappelle|rappellent|rappeler effleure|effleurent|effleurer garde|gardent|garder porte|portent|porter ouvre|ouvrent|ouvrir attend|attendent|attendre habite|habitent|habiter annonce|annoncent|annoncer observe|observent|observer ' +
        'entoure|entourent|entourer écoute|écoutent|écouter dévoile|dévoilent|dévoiler réveille|réveillent|réveiller apaise|apaisent|apaiser parcourt|parcourent|parcourir contemple|contemplent|contempler retrouve|retrouvent|retrouver partage|partagent|partager',
      times: ['chaque matin', 'au crépuscule', 'dès l’aube', 'à la tombée du jour', 'au fil des saisons', 'depuis toujours', 'le soir venu', 'parfois', 'en silence', 'peu à peu', 'au printemps', 'à l’automne', 'sans bruit', 'de loin en loin'],
      preps: ['dans', 'sous', 'avec', 'sans', 'malgré', 'vers', 'pour', 'près de', 'autour de', 'au-delà de', 'au cœur de', 'le long de', 'à travers', 'à l’abri de']
    },
    pro: {
      nouns: 'm:projet m:objectif m:service m:rapport m:budget m:calendrier m:partenaire m:processus|processus m:résultat m:comité m:dossier m:outil m:indicateur m:plan m:besoin m:échange m:accompagnement m:suivi m:cadre m:délai m:livrable m:réseau|réseaux m:document m:ensemble m:enjeu|enjeux m:dispositif m:retour m:bilan m:atelier m:usage ' +
        'f:équipe f:démarche f:stratégie f:réunion f:priorité f:solution f:méthode f:étape f:analyse f:mission f:ressource f:organisation f:proposition f:synthèse f:évaluation f:structure f:charte f:consultation f:orientation f:initiative f:coordination f:perspective f:qualité f:procédure f:direction f:réflexion',
      adjs: 'global|globale|globaux|globales clair|claire stratégique durable collectif|collective|collectifs|collectives opérationnel|opérationnelle|opérationnels|opérationnelles prioritaire concret|concrète|concrets|concrètes partagé|partagée cohérent|cohérente ' +
        'régulier|régulière|réguliers|régulières transversal|transversale|transversaux|transversales adapté|adaptée efficace précis|précise|précis|précises interne commun|commune pertinent|pertinente ambitieux|ambitieuse|ambitieux|ambitieuses progressif|progressive|progressifs|progressives principal|principale|principaux|principales ' +
        '>premier|première >dernier|dernière >prochain|prochaine >grand|grande',
      verbs: 'renforce|renforcent|renforcer structure|structurent|structurer accompagne|accompagnent|accompagner définit|définissent|définir valorise|valorisent|valoriser améliore|améliorent|améliorer soutient|soutiennent|soutenir encadre|encadrent|encadrer ' +
        'facilite|facilitent|faciliter organise|organisent|organiser précise|précisent|préciser consolide|consolident|consolider intègre|intègrent|intégrer mobilise|mobilisent|mobiliser coordonne|coordonnent|coordonner simplifie|simplifient|simplifier ' +
        'présente|présentent|présenter garantit|garantissent|garantir favorise|favorisent|favoriser clarifie|clarifient|clarifier anticipe|anticipent|anticiper oriente|orientent|orienter prépare|préparent|préparer assure|assurent|assurer ' +
        'développe|développent|développer optimise|optimisent|optimiser partage|partagent|partager évalue|évaluent|évaluer suit|suivent|suivre rassemble|rassemblent|rassembler',
      times: ['dès cette année', 'à court terme', 'au cours du trimestre', 'chaque semaine', 'd’ici la fin de l’année', 'à moyen terme', 'en amont', 'sur la durée', 'dès le lancement', 'à chaque étape'],
      preps: ['dans le cadre de', 'au cours de', 'à l’issue de', 'en lien avec', 'au service de', 'pour', 'avec', 'selon', 'auprès de', 'au sein de', 'en appui de']
    }
  };
  const LINKERS = ['Ainsi', 'Pourtant', 'En outre', 'Par ailleurs', 'De plus', 'Dès lors', 'En revanche', 'Peu à peu', 'Au fond', 'Dans l’ensemble', 'Enfin', 'Cependant', 'De même'];
  const NEGATIONS = ['plus', 'jamais', 'pas', 'guère'];
  const INF_LEADS = ['Il faut', 'Mieux vaut', 'Il reste à', 'Il suffit de', 'Il importe de'];

  function parseBank(b) {
    const nouns = b.nouns.split(' ').filter(Boolean).map((w) => {
      const [g, rest] = [w[0], w.slice(2)];
      const [s, p] = rest.split('|');
      return { g, s, p: p || s + 's' };
    });
    const adjs = b.adjs.split(' ').filter(Boolean).map((w) => {
      const pre = w.startsWith('>');
      const f = (pre ? w.slice(1) : w).split('|');
      const m = f[0];
      const fem = f[1] || (/e$/.test(m) ? m : m + 'e');
      return { pre, m, f: fem, mp: f[2] || (/[sx]$/.test(m) ? m : m + 's'), fp: f[3] || fem + 's' };
    });
    const verbs = b.verbs.split(' ').filter(Boolean).map((w) => { const [s, p, inf] = w.split('|'); return { s, p, inf }; });
    return { nouns, adjs, verbs, times: b.times, preps: b.preps };
  }
  const LEX = { general: parseBank(BANKS.general), pro: parseBank(BANKS.pro) };

  // ----- Grammaire -----

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const chance = (p) => Math.random() < p;
  const vowel = (w) => /^[aeiouyéèêëàâîïôûœh]/i.test(w);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Le h des mots du vocabulaire est toujours muet (hiver, histoire, harmonie, habite).

  // Groupe nominal : déterminant (accordé, élidé), adjectif éventuel, nom ; « de » et « à » contractés.
  function nounPhrase(lex, { plural = chance(0.3), kinds = ['def', 'def', 'indef', 'poss', 'dem', 'chaque', 'quelques', 'plusieurs'], adj = 0.45, prep = '' } = {}) {
    let kind = pick(kinds);
    if (kind === 'chaque') plural = false;
    if (kind === 'quelques' || kind === 'plusieurs') plural = true;
    const n = pick(lex.nouns);
    const a = chance(adj) ? pick(lex.adjs) : null;
    const form = (x) => (n.g === 'f' ? (plural ? x.fp : x.f) : (plural ? x.mp : x.m));
    const noun = (plural ? n.p : n.s).replace(/ /g, ' ');
    const words = a ? (a.pre ? [form(a), noun] : [noun, form(a)]) : [noun];
    const head = words[0];
    let det;
    if (kind === 'def') det = plural ? 'les' : vowel(head) ? 'l’' : n.g === 'f' ? 'la' : 'le';
    else if (kind === 'indef') det = plural ? (a && a.pre ? (vowel(head) ? 'd’' : 'de') : 'des') : n.g === 'f' ? 'une' : 'un';
    else if (kind === 'poss') det = plural ? 'ses' : n.g === 'f' && !vowel(head) ? 'sa' : 'son';
    else if (kind === 'dem') det = plural ? 'ces' : n.g === 'f' ? 'cette' : vowel(head) ? 'cet' : 'ce';
    else det = kind;
    let phrase = (det.endsWith('’') ? det : det + ' ') + words.join(' ');
    if (prep) phrase = joinPrep(prep, phrase);
    return { text: phrase, plural };
  }

  // de + le → du, de + les → des, à + le → au, à + les → aux, de + un → d’un, de + des → de.
  function joinPrep(prep, phrase) {
    const m = /^(.*?)(\bde|\bà)$/.exec(prep);
    if (!m) return prep + ' ' + phrase;
    const lead = m[1];
    const p = m[2];
    let out;
    if (/^le /.test(phrase)) out = (p === 'de' ? 'du ' : 'au ') + phrase.slice(3);
    else if (/^les /.test(phrase)) out = (p === 'de' ? 'des ' : 'aux ') + phrase.slice(4);
    else if (p === 'de' && /^des /.test(phrase)) out = 'de ' + phrase.slice(4);
    else if (p === 'de' && /^(de |d’)/.test(phrase)) out = phrase;
    else if (p === 'de' && vowel(phrase)) out = 'd’' + phrase;
    else out = p + ' ' + phrase;
    return lead + out;
  }

  const verbOf = (v, plural) => (plural ? v.p : v.s);
  const object = (lex, opts) => {
    const o = nounPhrase(lex, opts);
    // Un complément du nom de temps en temps : « les promesses du matin ».
    return chance(0.3) ? o.text + ' ' + nounPhrase(lex, { kinds: ['def'], adj: 0.2, prep: 'de' }).text : o.text;
  };
  function circumstance(lex) {
    if (chance(0.45)) return pick(lex.times);
    const prep = pick(lex.preps);
    // « sans des jardins » ne se dit pas : article défini ou possessif après ces prépositions.
    const kinds = /^(sans|malgré|selon)$/.test(prep) ? ['def', 'poss', 'dem'] : ['def', 'def', 'indef', 'poss'];
    return nounPhrase(lex, { kinds, prep, adj: 0.35 }).text;
  }

  function sentence(lex) {
    const subj = nounPhrase(lex);
    const v = pick(lex.verbs);
    let s;
    switch (Math.floor(Math.random() * 7)) {
      case 0: { // relative
        const v2 = pick(lex.verbs);
        s = `${subj.text}, qui ${verbOf(v2, subj.plural)} ${object(lex)}, ${verbOf(v, subj.plural)} ${object(lex)}`;
        break;
      }
      case 1: { // négation
        const verb = verbOf(v, subj.plural);
        s = `${subj.text} ${vowel(verb) ? 'n’' : 'ne '}${verb} ${pick(NEGATIONS)} ${object(lex, { kinds: ['def', 'poss', 'dem'] })}`;
        break;
      }
      case 2: { // infinitif
        const lead = pick(INF_LEADS);
        const glue = /\bde$/.test(lead) && vowel(v.inf) ? lead.replace(/de$/, 'd’') : lead + ' ';
        s = `${glue}${v.inf} ${object(lex)}`;
        if (chance(0.5)) s += ' ' + circumstance(lex);
        break;
      }
      case 3: { // deux verbes coordonnés
        const v2 = pick(lex.verbs.filter((x) => x !== v));
        s = `${subj.text} ${verbOf(v, subj.plural)} ${object(lex)} et ${verbOf(v2, subj.plural)} ${object(lex)}`;
        break;
      }
      case 4: // complément en tête
        s = `${cap(circumstance(lex))}, ${subj.text} ${verbOf(v, subj.plural)} ${object(lex)}`;
        break;
      case 5: { // deux propositions
        const subj2 = nounPhrase(lex);
        s = `${subj.text} ${verbOf(v, subj.plural)} ${object(lex)} ; ${subj2.text} ${verbOf(pick(lex.verbs), subj2.plural)} ${object(lex)}`;
        break;
      }
      default:
        s = `${subj.text} ${verbOf(v, subj.plural)} ${object(lex)}`;
        if (chance(0.6)) s += ' ' + circumstance(lex);
    }
    if (chance(0.18) && !/^[A-ZÀ-Ý]/.test(s)) s = pick(LINKERS) + ', ' + s;
    return cap(s) + '.';
  }

  function heading(lex) {
    const p = nounPhrase(lex, { kinds: ['def', 'def', 'indef'], adj: 0.5 });
    const t = chance(0.5) ? p.text + ' ' + nounPhrase(lex, { kinds: ['def'], adj: 0, prep: 'de' }).text : p.text;
    return cap(t);
  }

  function listItem(lex) {
    return cap(nounPhrase(lex, { kinds: ['def', 'indef'], adj: 0.7 }).text);
  }

  // ----- Assemblage -----

  const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  const countWords = (t) => (t.match(WORD) || []).length;
  // Les n premiers mots d'un texte, terminés par un point.
  function firstWords(text, n) {
    WORD.lastIndex = 0;
    let m;
    let end = 0;
    for (let i = 0; i < n && (m = WORD.exec(text)); i++) end = m.index + m[0].length;
    return text.slice(0, end).replace(/[\s,;: ]+$/, '') + '.';
  }

  const SENTENCES = { court: [2, 3], moyen: [4, 6], long: [7, 10] };
  const LINES = { court: 4, moyen: 7, long: 11 };
  const WORDS = { court: 40, moyen: 80, long: 140 };
  const between = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
  const paragraph = (lex, n) => Array.from({ length: n }, () => sentence(lex)).join(' ');

  // Mesure du nombre de lignes à la largeur et dans la police du texte du document.
  let ruler = null;
  function measureLines(text) {
    if (!ruler) {
      ruler = document.createElement('div');
      ruler.setAttribute('aria-hidden', 'true');
      ruler.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:normal;overflow-wrap:break-word;';
      document.body.appendChild(ruler);
    }
    const editor = $('editor');
    const sample = editor.querySelector(':scope > p') || editor;
    const cs = getComputedStyle(sample);
    const ecs = getComputedStyle(editor);
    const width = sample === editor
      ? editor.clientWidth - parseFloat(ecs.paddingLeft) - parseFloat(ecs.paddingRight)
      : sample.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    Object.assign(ruler.style, {
      width: Math.max(200, width || 600) + 'px', fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing, wordSpacing: cs.wordSpacing, fontWeight: cs.fontWeight, textAlign: cs.textAlign
    });
    ruler.textContent = 'A';
    const one = ruler.getBoundingClientRect().height || 1;
    ruler.textContent = text;
    return Math.round(ruler.getBoundingClientRect().height / one);
  }

  // Un paragraphe d'exactement n lignes (le dernier mot coupé au besoin).
  function paragraphOfLines(lex, n) {
    let text = sentence(lex);
    while (measureLines(text) < n) text += ' ' + sentence(lex);
    if (measureLines(text) === n && /\.$/.test(text)) return text;
    let lo = 1;
    let hi = countWords(text);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureLines(firstWords(text, mid)) <= n) lo = mid; else hi = mid - 1;
    }
    return firstWords(text, lo);
  }

  // Blocs : [{ tag: 'h2'|'p'|'ul', text | items }].
  function generate({ unit, count, length, vocab, headings, lists }) {
    const lex = LEX[vocab] || LEX.general;
    const blocks = [];
    const paras = [];
    if (unit === 'paragraphes') {
      for (let i = 0; i < count; i++) paras.push(paragraph(lex, between(SENTENCES[length])));
    } else if (unit === 'phrases') {
      let left = count;
      while (left > 0) {
        const n = Math.min(left, between(SENTENCES[length]));
        paras.push(paragraph(lex, n));
        left -= n;
      }
    } else if (unit === 'lignes') {
      let left = count;
      while (left > 0) {
        const n = left <= LINES[length] + 2 ? left : LINES[length];
        paras.push(paragraphOfLines(lex, n));
        left -= n;
      }
    } else {
      let left = count;
      while (left > 0) {
        const want = left <= WORDS[length] * 1.3 ? left : WORDS[length];
        let text = sentence(lex);
        while (countWords(text) < want) text += ' ' + sentence(lex);
        paras.push(firstWords(text, want));
        left -= want;
      }
    }
    // Titres intermédiaires et listes : seulement en paragraphes (les autres unités sont comptées au plus juste).
    const extras = unit === 'paragraphes';
    paras.forEach((text, i) => {
      if (extras && headings && i % 3 === 0) blocks.push({ tag: 'h2', text: heading(lex) });
      blocks.push({ tag: 'p', text });
      if (extras && lists && i % 3 === 1) blocks.push({ tag: 'ul', items: Array.from({ length: between([3, 5]) }, () => listItem(lex)) });
    });
    return blocks;
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toHtml = (blocks) => blocks.map((b) => (b.tag === 'ul'
    ? '<ul>' + b.items.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>'
    : `<${b.tag}>${esc(b.text)}</${b.tag}>`)).join('');
  const toText = (blocks) => blocks.map((b) => (b.tag === 'ul' ? b.items.map((t) => '– ' + t).join('\n') : b.text)).join('\n\n');

  // ----- Fenêtre -----

  const dialog = $('lorem-dialog');
  const LIMITS = { paragraphes: 50, phrases: 300, lignes: 400, mots: 10000 };
  const DEFAULTS = { paragraphes: 3, phrases: 8, lignes: 10, mots: 150 };
  const PREFS = 'ft-lorem';
  let blocks = [];

  function options() {
    const unit = $('lr-unit').value;
    let count = Math.round(Number($('lr-count').value));
    if (!Number.isFinite(count) || count < 1) count = 1;
    count = Math.min(count, LIMITS[unit]);
    return {
      unit, count,
      length: $('lr-length').value,
      vocab: $('lr-vocab').value,
      headings: $('lr-headings').checked,
      lists: $('lr-lists').checked
    };
  }

  function syncFields() {
    const unit = $('lr-unit').value;
    $('lr-count').max = LIMITS[unit];
    const extras = unit === 'paragraphes';
    $('lr-headings').disabled = !extras;
    $('lr-lists').disabled = !extras;
    $('lr-extras').classList.toggle('off', !extras);
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify(options())); } catch { /* rien */ }
  }

  function render() {
    const o = options();
    blocks = generate(o);
    $('lr-preview').innerHTML = toHtml(blocks);
    const words = blocks.reduce((n, b) => n + countWords(b.tag === 'ul' ? b.items.join(' ') : b.text), 0);
    const paras = blocks.filter((b) => b.tag === 'p').length;
    $('lr-info').textContent = `${words.toLocaleString('fr-FR')} mot${words > 1 ? 's' : ''} · ${paras} paragraphe${paras > 1 ? 's' : ''}`
      + (o.unit === 'lignes' ? ' · lignes comptées à la largeur du document' : '');
  }

  function open() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) || 'null');
      if (p) {
        if (LIMITS[p.unit]) $('lr-unit').value = p.unit;
        $('lr-count').value = p.count;
        if (SENTENCES[p.length]) $('lr-length').value = p.length;
        if (LEX[p.vocab]) $('lr-vocab').value = p.vocab;
        $('lr-headings').checked = !!p.headings;
        $('lr-lists').checked = !!p.lists;
      }
    } catch { /* préférences indisponibles */ }
    syncFields();
    $('lr-insert').disabled = !(window.FTApp && window.FTApp.currentId());
    if (!dialog.open) dialog.showModal();
    render();
  }

  // Les paragraphes se placent après celui du curseur (ou à la place d'une ligne vide), sans se mêler à son texte.
  function insert() {
    if (!blocks.length || !(window.FTApp && window.FTApp.currentId())) return;
    dialog.close();
    // (Moteur 2.0 : le texte du moteur, relu d'un coup par moteur/objets.js.)
    const S = window.FTObjets || window.FTStructure;
    const editor = $('editor');
    S.restoreSelection();
    const sel = window.getSelection();
    let top = sel.rangeCount && editor.contains(sel.anchorNode) ? S.topBlock(sel.getRangeAt(0).startContainer) : null;
    if (top && (top.nodeType !== Node.ELEMENT_NODE || top.matches('.ft-footnotes'))) top = null;
    const tpl = document.createElement('template');
    tpl.innerHTML = toHtml(blocks);
    const added = [...tpl.content.children];
    S.checkpoint();
    if (top && top.matches('p') && !top.textContent.trim() && !top.querySelector('img, .ft-math, .ft-image')) top.replaceWith(...added);
    else if (top) top.after(...added);
    else {
      const notes = editor.querySelector(':scope > .ft-footnotes');
      if (notes) notes.before(...added); else editor.append(...added);
    }
    S.placeCaret(added[added.length - 1], true);
    if (window.FTObjets) S.changed();
    editor.focus({ preventScroll: true });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  $('lr-unit').addEventListener('change', () => {
    $('lr-count').value = DEFAULTS[$('lr-unit').value];
    syncFields();
    savePrefs();
    render();
  });
  for (const id of ['lr-count', 'lr-length', 'lr-vocab', 'lr-headings', 'lr-lists']) {
    $(id).addEventListener('change', () => { savePrefs(); render(); });
  }
  $('lr-again').addEventListener('click', render);
  $('lr-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(toText(blocks)); $('lr-info').textContent = 'Texte copié.'; } catch { /* rien */ }
  });
  $('lr-insert').addEventListener('click', insert);
  $('lr-close').addEventListener('click', () => dialog.close());
  $('assist-lorem').addEventListener('click', open);

  window.FTLorem = { open, generate, sentence: (vocab) => sentence(LEX[vocab] || LEX.general), countWords };
})();
