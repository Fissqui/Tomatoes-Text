// Fabrique le document de démonstration « Note de conjoncture et de politique économique » : un texte
// d'économie de plusieurs pages qui met en œuvre la plupart des outils du logiciel (mode avancé, page de
// titre, plan, titres numérotés, lettrine, schémas et graphes rapides, tableaux et cases fusionnées,
// formules, bloc de code, encadrés, citations et bibliographie, notes, renvois, légendes, table des
// illustrations, index, commentaire, zone en colonnes).
// Le texte est écrit ici en HTML, puis ouvert dans le logiciel (banc d'essai) qui le complète avec ses
// propres outils et l'enregistre ; le .tmtx obtenu et les sources du projet (sources.json, à mettre à
// côté : sans elles la bibliographie reste vide) sont écrits dans ECO_OUT (par défaut
// scripts/presentation/economie).
// Usage : node scripts/banc-essai/run.js scripts/presentation/creer-economie.js
// (ECO_SHOTS=<dossier> : captures des pages et de la fenêtre dans ce dossier.)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const idOf = (key) => {
  const h = crypto.createHash('sha1').update('tomatoes-presentation:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const DOC_ID = idOf('economie');
const TITLE = 'Note de conjoncture et de politique économique';
const FILE = 'Note de conjoncture.tmtx';

// ----- Petits outils d'écriture -----

const P = (t, attrs = '') => `<p${attrs}>${t}</p>`;
const H = (n, t, xid, nonum) => `<h${n}${xid ? ` data-xid="${xid}"` : ''}${nonum ? ' data-nonum="oui"' : ''}>${t}</h${n}>`;
const UL = (items) => '<ul>' + items.map((t) => (Array.isArray(t) ? `<li><p>${t[0]}</p>${UL(t[1])}</li>` : `<li>${t}</li>`)).join('') + '</ul>';
const OL = (items) => '<ol>' + items.map((t) => `<li>${t}</li>`).join('') + '</ol>';
const BOX = (look, color, ...paras) => `<blockquote class="ft-callout"${look ? ` data-look="${look}"` : ''}${color ? ` data-color="${color}"` : ''}>${paras.map((t) => P(t)).join('')}</blockquote>`;
const QUOTE = (look, text, src) => `<blockquote class="ft-callout ft-quote"${look ? ` data-qlook="${look}"` : ''}><p>${text}</p><p class="ft-quote-src">${src}</p></blockquote>`;
const MARK = (t) => `<span style="background-color: rgb(255, 236, 140);">${t}</span>`;
const MATH = (latex, block) => (block
  ? `<div class="ft-math" contenteditable="false" data-display="block" data-latex="${latex}"></div>`
  : `<span class="ft-math" contenteditable="false" data-latex="${latex}"></span>`);
// Case : texte, ou { t, cs, rs } pour une case fusionnée. Tableau : style écrit comme le pose le logiciel.
const CELL = (c) => (typeof c === 'string' ? `<td>${c}</td>` : `<td${c.cs ? ` colspan="${c.cs}"` : ''}${c.rs ? ` rowspan="${c.rs}"` : ''}>${c.t}</td>`);
// widths : largeurs des colonnes en % (comme réglées à la souris).
const TABLE = (rows, look, legend, xid, widths) =>
  (legend ? `<p class="ft-legend" data-kind="tableau"${xid ? ` data-xid="${xid}"` : ''}>${legend}</p>` : '') +
  `<table class="ft-table" data-t="2" data-style="${look.style}"${look.color ? ` data-color="${look.color}"` : ''}` +
  ['header', 'first', 'total', 'last', 'bands', 'bandcols', 'sep'].filter((o) => look[o]).map((o) => ` data-${o}="oui"`).join('') + '>' +
  (widths ? '<colgroup>' + widths.map((w) => `<col style="width: ${w}%">`).join('') + '</colgroup>' : '') + '<tbody>' +
  rows.map((r) => '<tr>' + r.map(CELL).join('') + '</tr>').join('') + '</tbody></table>';
const XREF = (xid, show = 'label') => `<span class="ft-xref" contenteditable="false" data-target="x:${xid}" data-show="${show}"></span>`;
const PLACE = (what) => `<p data-demo="${what}"><br></p>`;
const CODE = (lang, text) => `<pre class="ft-code" data-lang="${lang}"><code>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`;
const LINK = (href, text) => `<a href="${href}">${text}</a>`;
const CITE = (src, page = '') => `<span class="ft-cite" data-src="${src}"${page ? ` data-page="${page}"` : ''} contenteditable="false">(${src})</span>`;

// Notes de bas de page et notes de fin.
const fn = [];
const FN = (text) => { fn.push(text); return `<sup class="ft-fn-ref" data-fn="n${fn.length}" contenteditable="false">${fn.length}</sup>`; };
const en = [];
const EN = (text) => { en.push(text); return `<sup class="ft-en-ref" data-en="e${en.length}" contenteditable="false">${en.length}</sup>`; };

// Sources du projet (citations, bibliographie).
const SOURCES = [
  { id: 'eco-keynes', type: 'livre', authors: ['Keynes, John Maynard'], title: 'Théorie générale de l’emploi, de l’intérêt et de la monnaie', year: '1936', publisher: 'Macmillan', place: 'Londres' },
  { id: 'eco-phillips', type: 'article', authors: ['Phillips, Alban William'], title: 'The Relation between Unemployment and the Rate of Change of Money Wage Rates in the United Kingdom, 1861-1957', year: '1958', container: 'Economica', volume: '25', issue: '100', pages: '283-299' },
  { id: 'eco-friedman', type: 'article', authors: ['Friedman, Milton'], title: 'The Role of Monetary Policy', year: '1968', container: 'American Economic Review', volume: '58', issue: '1', pages: '1-17' },
  { id: 'eco-taylor', type: 'article', authors: ['Taylor, John B.'], title: 'Discretion versus Policy Rules in Practice', year: '1993', container: 'Carnegie-Rochester Conference Series on Public Policy', volume: '39', pages: '195-214' },
  { id: 'eco-solow', type: 'article', authors: ['Solow, Robert M.'], title: 'A Contribution to the Theory of Economic Growth', year: '1956', container: 'Quarterly Journal of Economics', volume: '70', issue: '1', pages: '65-94' },
  { id: 'eco-marshall', type: 'livre', authors: ['Marshall, Alfred'], title: 'Principles of Economics', year: '1890', publisher: 'Macmillan', place: 'Londres' }
];

// Espaces insécables : « 1 200 », « 10 Md€ », et la ponctuation double à la française.
const nbsp = (html) => html.split(/(<pre[\s\S]*?<\/pre>)/).map((part) => (part.startsWith('<pre') ? part : spaces(part))).join('');
const spaces = (html) => html.replace(/« /g, '«\u00a0').replace(/ (»|:|;|\?|!)/g, '\u00a0$1').replace(/(\d) (?=\d{3}\b)/g, '$1 ').replace(/(\d) (?=(%|€|Md€|points?|ans|mois)(?![\p{L}]))/gu, '$1 ');

const cover = '<div class="ft-cover" contenteditable="false" data-model="rapport">' +
  '<div class="ft-cover-head"><p class="ft-cover-field" data-field="surtitre" data-ph="Organisme ou établissement" contenteditable="true">Cellule d’analyse économique</p></div>' +
  `<div class="ft-cover-main"><p class="ft-cover-field" data-field="titre" data-ph="Titre" contenteditable="true">${TITLE}</p><p class="ft-cover-field" data-field="soustitre" data-ph="Sous-titre" contenteditable="true">Marchés, conjoncture et instruments de l’action publique</p></div>` +
  '<div class="ft-cover-foot"><p class="ft-cover-field" data-field="auteur" data-ph="Auteur" contenteditable="true">Service des études</p><p class="ft-cover-field" data-field="date" data-ph="Date" contenteditable="true">Octobre 2026</p><p class="ft-cover-field" data-field="mention" data-ph="Mention (type de document, version)" contenteditable="true">Document de travail — version 1.0</p></div></div>';

const PY = `# Multiplicateur keynésien : effet cumulé d'une dépense publique de 10 Md€
c = 0.6            # propension marginale à consommer
dG = 10.0          # dépense initiale (Md€)

total, vague = 0.0, dG
for tour in range(1, 11):
    total += vague
    print(f"Tour {tour:2d} : +{vague:5.2f} Md€, cumul {total:6.2f} Md€")
    vague *= c     # part du revenu reçu qui est dépensée à son tour

print(f"Limite théorique : {dG / (1 - c):.1f} Md€")`;

const html = [
  cover,
  PLACE('toc'),
  H(1, 'Introduction', 'intro', true),
  P(`L’économie étudie la manière dont une société emploie des ressources rares pour satisfaire des besoins qui, eux, ne le sont pas. Cette note en présente les mécanismes essentiels sous un angle appliqué : la formation des prix sur un marché, la lecture de la conjoncture, puis les instruments dont disposent les pouvoirs publics pour stabiliser l’activité et soutenir la croissance de long terme.`, ' data-lettrine="3"'),
  P(`Chaque partie associe une explication, une représentation graphique et des données chiffrées. Les schémas sont des graphes de principe : ils montrent le sens des relations, non des valeurs mesurées. Le ${XREF('tab-agregats')} et le ${XREF('tab-instruments')} rassemblent les données et les comparaisons utiles à la discussion.`),
  BOX('fond', 'bleu', '<b>En bref.</b> Le prix d’équilibre résulte de la rencontre de l’offre et de la demande ; la croissance française est revenue autour de 1 % après le choc de 2020 ; la politique budgétaire agit par le multiplicateur, la politique monétaire par les taux d’intérêt ; à long terme, seule la productivité soutient durablement le niveau de vie.'),
  P(`Le ${XREF('fig-circuit')} résume les échanges entre les grands agents économiques : les ménages fournissent leur travail et reçoivent des revenus, les entreprises produisent, l’État prélève et redistribue, les banques financent.`),
  PLACE('diagram:circuit'),

  H(1, 'Le marché et la formation des prix', 'marche'),
  H(2, 'Offre, demande et équilibre', 'equilibre'),
  P(`Sur un marché concurrentiel, la <b>demande</b> diminue quand le prix augmente : chaque acheteur arbitre entre ce bien et les autres usages de son revenu. L’<b>offre</b>, à l’inverse, augmente avec le prix, car des producteurs moins efficaces deviennent rentables. Le prix d’équilibre <i>P*</i> égalise les quantités offertes et demandées ${CITE('eco-marshall')}.`),
  PLACE('diagram:marche'),
  P(`Toute variation d’un déterminant autre que le prix déplace la courbe entière : une hausse du revenu des ménages déplace la demande vers la droite, une hausse du coût des matières premières déplace l’offre vers la gauche. Dans les deux cas, le prix d’équilibre augmente${FN('L’effet sur la quantité échangée diffère : elle augmente dans le premier cas, diminue dans le second.')}.`),
  H(2, 'L’élasticité-prix', 'elasticite'),
  P(`L’élasticité-prix de la demande mesure la sensibilité des quantités à une variation du prix. Elle rapporte deux variations relatives :`),
  MATH('\\varepsilon = \\frac{\\Delta Q / Q}{\\Delta P / P}', true),
  P(`Une demande est dite <b>élastique</b> lorsque ${MATH('|\\varepsilon| > 1')} : une hausse de prix de 1 % y réduit les quantités de plus de 1 %, et la recette totale du vendeur diminue. Le ${XREF('tab-elasticites')} donne des ordres de grandeur couramment retenus${FN('Valeurs indicatives tirées de la littérature empirique ; elles varient selon le pays, la période et l’horizon considéré (court ou long terme).')}.`),
  TABLE([
    ['Bien ou service', 'Élasticité-prix', 'Interprétation'],
    ['Carburants (court terme)', '−0,2 à −0,3', 'Très inélastique'],
    ['Tabac', '−0,4', 'Inélastique'],
    ['Électricité des ménages', '−0,3 à −0,6', 'Inélastique'],
    ['Transport aérien de loisir', '−1,0 à −1,5', 'Élastique'],
    ['Restauration', '−1,6', 'Élastique']
  ], { style: 'lignes', color: 'bleu', header: true, first: true, sep: true }, 'Élasticités-prix de la demande, ordres de grandeur', 'tab-elasticites', [40, 25, 35]),
  BOX('double', 'violet', '<b>Définition.</b> Un bien est dit <i>inférieur</i> lorsque sa demande baisse quand le revenu augmente ; son élasticité-revenu est alors négative. La plupart des biens sont <i>normaux</i> : leur demande croît avec le revenu.'),

  H(1, 'La conjoncture française récente', 'conjoncture'),
  P(`La conjoncture décrit l’état de l’économie à court terme. Quatre indicateurs en donnent une lecture d’ensemble : la croissance du produit intérieur brut (PIB), l’inflation, le taux de chômage et l’endettement public. Leur évolution depuis 2019 est retracée dans le ${XREF('tab-agregats')}${FN(`Valeurs arrondies, susceptibles de révision. Séries publiées par l’Insee : ${LINK('https://www.insee.fr', 'www.insee.fr')}.`)}.`),
  TABLE([
    ['Indicateur', '2019', '2020', '2021', '2022', '2023', '2024'],
    ['Croissance du PIB (%)', '2,0', '−7,4', '6,9', '2,6', '1,4', '1,2'],
    ['Inflation (%)', '1,1', '0,5', '1,6', '5,2', '4,9', '2,0'],
    ['Taux de chômage (%)', '8,4', '8,0', '7,9', '7,3', '7,3', '7,4'],
    ['Dette publique (% du PIB)', '98', '115', '113', '111', '110', '113']
  ], { style: 'liste', color: 'bleu', header: true, first: true, sep: true, bands: true }, 'Principaux agrégats de l’économie française, 2019-2024', 'tab-agregats', [34, 11, 11, 11, 11, 11, 11]),
  P(`Trois phases se distinguent nettement :`),
  UL([
    ['<b>le choc sanitaire de 2020</b>, la plus forte récession depuis l’après-guerre :', ['fermeture administrative de pans entiers de l’activité ;', 'maintien des revenus par l’activité partielle et le fonds de solidarité.']],
    ['<b>le rebond de 2021</b>, mécanique et rapide :', ['réouverture des secteurs fermés ;', 'épargne accumulée par les ménages pendant les confinements.']],
    ['<b>le choc inflationniste de 2022-2023</b> :', ['hausse des prix de l’énergie et des matières premières ;', 'resserrement monétaire de la Banque centrale européenne.']]
  ]),
  P(`Ces fluctuations s’inscrivent autour d’une tendance de long terme. Le ${XREF('fig-cycle')} distingue les deux composantes : la <b>croissance potentielle</b>, qui dépend des facteurs de production, et le <b>cycle</b>, fait d’alternances d’expansion et de ralentissement. L’écart entre les deux, l’<i>écart de production</i>, guide l’orientation des politiques conjoncturelles.`),
  PLACE('diagram:cycle'),

  H(1, 'Les politiques économiques', 'politiques'),
  H(2, 'La politique budgétaire et le multiplicateur', 'budget'),
  P(`Dans l’analyse keynésienne, une dépense publique supplémentaire accroît la production d’un montant supérieur à la dépense initiale ${CITE('eco-keynes')}. Le revenu distribué est en partie consommé, ce qui crée un nouveau revenu, à nouveau consommé, et ainsi de suite. Avec une propension marginale à consommer <i>c</i>, la somme de ces vagues successives converge vers :`),
  MATH('k = \\frac{\\Delta Y}{\\Delta G} = \\frac{1}{1 - c}', true),
  P(`Pour ${MATH('c = 0{,}6')}, le multiplicateur vaut 2,5 : 10 Md€ de dépense publique engendrent, en théorie, 25 Md€ de production. Le calcul peut être vérifié pas à pas par un court programme :`),
  CODE('python', PY),
  P(`En pratique, le multiplicateur est nettement plus faible, souvent estimé entre 0,5 et 1,5${EN('Les estimations empiriques dépendent fortement de la position dans le cycle : le multiplicateur est plus élevé en récession, lorsque les capacités de production sont inemployées et que la politique monétaire est contrainte.')}. Une partie de la dépense s’évade en importations, une autre est épargnée, et la hausse de la dette peut inciter les ménages à épargner davantage en prévision d’impôts futurs.`),
  H(2, 'La politique monétaire', 'monnaie'),
  P(`La banque centrale agit principalement par son <b>taux directeur</b>, le taux auquel elle prête aux banques. Une hausse de ce taux renchérit le crédit, freine l’investissement et la consommation, et réduit les tensions sur les prix. La règle proposée par John Taylor décrit le taux que fixerait une banque centrale soucieuse à la fois d’inflation et d’activité ${CITE('eco-taylor', '202')} :`),
  MATH('i = r^{*} + \\pi + 0{,}5\\,(\\pi - \\pi^{*}) + 0{,}5\\,(y - y^{*})', true),
  P(`où ${MATH('\\pi^{*}')} est la cible d’inflation (2 % dans la zone euro) et ${MATH('y - y^{*}')} l’écart de production. Cet arbitrage entre inflation et chômage a d’abord été mis en évidence empiriquement par Phillips ${CITE('eco-phillips')} : le ${XREF('fig-phillips')} en donne l’allure.`),
  PLACE('diagram:phillips'),
  QUOTE('guillemets', 'Il existe toujours un arbitrage temporaire entre inflation et chômage ; il n’existe pas d’arbitrage permanent.', 'Milton Friedman, 1968'),
  P(`Friedman ${CITE('eco-friedman', '11')} montre en effet que les agents finissent par intégrer l’inflation dans leurs anticipations : à long terme, le chômage revient à son niveau « naturel », quel que soit le rythme de hausse des prix. La relation de Fisher relie alors le taux nominal ${MATH('i')}, le taux réel ${MATH('r')} et l’inflation anticipée : ${MATH('i \\approx r + \\pi^{e}')}.`),
  P(`Le ${XREF('tab-instruments')} compare les deux grandes politiques conjoncturelles.`),
  TABLE([
    ['Critère', { t: 'Politique budgétaire', cs: 2 }, 'Politique monétaire'],
    ['Instruments', 'Dépenses publiques', 'Impôts et transferts', 'Taux directeur, achats de titres'],
    ['Décideur', { t: 'Gouvernement et Parlement', cs: 2 }, 'Banque centrale (indépendante)'],
    ['Délai d’action', { t: 'Long à décider, rapide à agir', cs: 2 }, 'Rapide à décider, lent à agir (12 à 24 mois)'],
    [{ t: 'Limites', rs: 2 }, { t: 'Endettement public', cs: 2 }, 'Taux plancher proche de zéro'],
    [{ t: 'Effet d’éviction', cs: 2 }, 'Politique unique pour 20 pays']
  ], { style: 'grille', color: 'bleu', header: true, first: true }, 'Comparaison des politiques conjoncturelles', 'tab-instruments', [18, 26, 26, 30]),
  H(2, 'Fiscalité : la courbe de Laffer', 'laffer'),
  P(`Au-delà d’un certain seuil, une hausse du taux d’imposition peut réduire les recettes fiscales : l’activité imposable se contracte, se déplace ou se dissimule. Le ${XREF('fig-laffer')} représente cette idée : les recettes sont nulles pour un taux de 0 % comme pour un taux de 100 %, et passent par un maximum entre les deux.`),
  BOX('bandeau', 'ambre', `<b>Attention.</b> La position du sommet de la courbe est très discutée. Les estimations disponibles le situent ${MARK('à des taux nettement supérieurs')} à ceux de la plupart des impôts existants, ce qui limite la portée de l’argument dans le débat public.`),
  PLACE('diagram:laffer'),

  H(1, 'La croissance de long terme', 'croissance'),
  P(`Sur longue période, le niveau de vie dépend de la quantité de facteurs de production et de l’efficacité avec laquelle ils sont combinés. Le modèle de Solow ${CITE('eco-solow')} retient une fonction de production de type Cobb-Douglas :`),
  MATH('Y = A\\,K^{\\alpha}\\,L^{1-\\alpha}', true),
  P(`où <i>K</i> est le capital, <i>L</i> le travail et <i>A</i> la productivité globale des facteurs. L’accumulation du capital seule ne suffit pas : ses rendements sont décroissants (${MATH('\\alpha < 1')}), si bien que la croissance par tête s’épuise sans progrès technique. Trois leviers durables en découlent :`),
  OL(['l’innovation et la diffusion des technologies, qui élèvent <i>A</i> ;', 'l’éducation et la formation, qui améliorent la qualité du travail ;', 'la qualité des institutions, qui protège l’investissement et la concurrence.']),
  H(2, 'Repères', 'reperes'),
  '<div class="ft-cols" data-cols="2">' + [
    '<b>PIB.</b> Valeur de l’ensemble des biens et services finals produits sur le territoire pendant une année.',
    '<b>Inflation.</b> Hausse générale et durable du niveau des prix, mesurée par l’indice des prix à la consommation.',
    '<b>Chômage.</b> Part des actifs sans emploi qui en recherchent un et sont disponibles, au sens du Bureau international du travail.',
    '<b>Taux directeur.</b> Taux d’intérêt fixé par la banque centrale pour ses opérations avec les banques.',
    '<b>Écart de production.</b> Différence entre le PIB effectif et le PIB potentiel, en pourcentage de ce dernier.',
    '<b>Productivité globale des facteurs.</b> Part de la croissance qui n’est expliquée ni par le capital ni par le travail.'
  ].map((t) => P(t)).join('') + '</div>',

  H(1, 'Conclusion', 'conclusion', true),
  P(`Les mécanismes présentés ici forment une boîte à outils cohérente : le marché fixe les prix relatifs, la politique budgétaire et la politique monétaire stabilisent l’activité, et la croissance de long terme repose sur la productivité. <span class="ft-comment" data-c="c1">Leur efficacité dépend toutefois du contexte</span> : niveau de la dette, position dans le cycle et degré de coordination entre les États de la zone euro.`),
  '<div class="ft-biblio" contenteditable="false"></div>',
  '<div class="ft-lof" contenteditable="false" data-kind="tout"></div>',
  '<div class="ft-index" contenteditable="false"></div>'
].join('');

const notesHtml = () =>
  (en.length ? '<div class="ft-endnotes"><div class="ft-endnotes-title" contenteditable="false">Notes</div><ol>' + en.map((t, i) => `<li data-en="e${i + 1}">${t}</li>`).join('') + '</ol></div>' : '') +
  (fn.length ? '<div class="ft-footnotes"><ol>' + fn.map((t, i) => `<li data-fn="n${i + 1}">${t}</li>`).join('') + '</ol></div>' : '');

// ----- Schémas (outil Schéma, graphes rapides) -----

const NODE = { shape: 'arrondi', w: 140, h: 56, text: '', fill: '#dce9f5', stroke: '#1f4e79', strokeWidth: 1.5, dash: '', shadow: false, opacity: 1,
  font: 'Inter', fontSize: 14, bold: false, italic: false, textColor: '#163a5c', align: 'center' };
const LINKS = { route: 'droit', color: '#5b6b7a', width: 1.5, dash: '', start: '', end: 'pleine', label: '' };
const node = (id, x, y, text, more = {}) => ({ ...NODE, id, x, y, text, ...more });
const link = (id, a, sa, b, sb, more = {}) => ({ ...LINKS, id, from: { node: a, side: sa }, to: { node: b, side: sb }, ...more });
const axes = (id, x, y, w, h, labelX, labelY, more = {}) => node(id, x, y, '', { shape: 'g-axes', w, h, fill: 'none', stroke: '#404040', strokeWidth: 1.5, arrows: true, ticks: 0, labelX, labelY, fontSize: 13, ...more });
const curve = (id, shape, x, y, w, h, stroke, more = {}) => node(id, x, y, '', { shape, w, h, fill: 'none', stroke, strokeWidth: 2.5, ...more });
const label = (id, x, y, text, more = {}) => node(id, x, y, text, { shape: 'texte', w: 60, h: 24, fontSize: 13, textColor: '#262626', ...more });
const dot = (id, x, y, color) => node(id, x - 5, y - 5, '', { shape: 'ellipse', w: 10, h: 10, fill: color, stroke: color });
const BLUE = '#2e75b6';
const RED = '#c0392b';
const GREEN = '#2e8b57';

const DIAGRAMS = {
  circuit: {
    caption: 'Le circuit économique simplifié', width: 92, xid: 'fig-circuit',
    data: { v: 1, background: '#ffffff', nodes: [
      node('men', 0, 120, 'Ménages', { w: 150, bold: true }),
      node('ent', 420, 120, 'Entreprises', { w: 150, bold: true }),
      node('eta', 210, 0, 'État', { w: 150, fill: '#e3f1e8', stroke: GREEN, textColor: '#1d5e3a' }),
      node('ban', 210, 250, 'Banques', { w: 150, fill: '#fbeee0', stroke: '#c87f2a', textColor: '#7a4a12' })
    ], links: [
      link('l1', 'men', 'e', 'ent', 'w', { route: 'courbe', label: 'Travail, consommation' }),
      link('l2', 'ent', 's', 'men', 's', { route: 'coude', label: 'Salaires, dividendes', dash: 'tirets' }),
      link('l3', 'men', 'n', 'eta', 'w', { route: 'coude', label: 'Impôts' }),
      link('l4', 'eta', 'e', 'ent', 'n', { route: 'coude', label: 'Commandes publiques' }),
      link('l5', 'ban', 'e', 'ent', 's', { route: 'coude', label: 'Crédits', color: '#c87f2a' }),
      link('l6', 'men', 's', 'ban', 'w', { route: 'coude', label: 'Épargne', color: '#c87f2a' })
    ] }
  },
  marche: {
    caption: 'Équilibre du marché : rencontre de l’offre et de la demande', width: 70, xid: 'fig-marche',
    data: { v: 1, background: '#ffffff', nodes: [
      axes('ax', 0, 0, 340, 240, 'Quantité', 'Prix'),
      curve('of', 'g-droite', 30, 20, 270, 200, BLUE),
      curve('de', 'g-droite', 30, 20, 270, 200, RED, { flipH: true }),
      label('lo', 300, 2, 'Offre', { textColor: BLUE, bold: true }),
      label('ld', 300, 196, 'Demande', { textColor: RED, bold: true, w: 80 }),
      dot('eq', 165, 120, '#262626'),
      label('le', 172, 92, 'E', { bold: true, w: 30 }),
      label('qs', 140, 244, 'Q*', { w: 50 }),
      label('ps', -56, 108, 'P*', { w: 50 })
    ], links: [
      link('l1', 'eq', 's', 'qs', 'n', { end: '', dash: 'points', color: '#7f7f7f' }),
      link('l2', 'eq', 'w', 'ps', 'e', { end: '', dash: 'points', color: '#7f7f7f' })
    ] }
  },
  cycle: {
    caption: 'Croissance potentielle et cycle conjoncturel', width: 78, xid: 'fig-cycle',
    data: { v: 1, background: '#ffffff', nodes: [
      axes('ax', 0, 0, 420, 230, 'Temps', 'PIB'),
      curve('tr', 'g-droite', 20, 50, 380, 150, '#7f7f7f', { dash: 'tirets', strokeWidth: 2 }),
      curve('cy', 'g-onde', 20, 30, 380, 60, BLUE, { count: 3 }),
      label('lt', 300, 150, 'Tendance (PIB potentiel)', { w: 190, italic: true, textColor: '#595959', fontSize: 12 }),
      label('lc', 20, 0, 'PIB effectif', { w: 110, textColor: BLUE, bold: true, fontSize: 12 })
    ], links: [] }
  },
  phillips: {
    caption: 'Courbe de Phillips : arbitrage entre inflation et chômage', width: 64, xid: 'fig-phillips',
    data: { v: 1, background: '#ffffff', nodes: [
      axes('ax', 0, 0, 320, 230, 'Chômage (%)', 'Inflation (%)'),
      curve('ph', 'g-decroissance', 25, 20, 270, 190, RED),
      dot('a', 66, 79, '#262626'),
      label('la', 74, 56, 'A', { bold: true, w: 30 }),
      dot('b', 196, 182, '#262626'),
      label('lb', 202, 156, 'B', { bold: true, w: 30 })
    ], links: [
      link('l1', 'a', 'e', 'b', 'n', { route: 'courbe', dash: 'tirets', color: '#7f7f7f', label: 'resserrement' })
    ] }
  },
  laffer: {
    caption: 'Courbe de Laffer : recettes fiscales selon le taux d’imposition', width: 64, xid: 'fig-laffer',
    data: { v: 1, background: '#ffffff', nodes: [
      axes('ax', 0, 0, 320, 230, 'Taux (%)', 'Recettes'),
      curve('lf', 'g-parabole', 0, 30, 300, 200, GREEN, { flipV: true }),
      dot('m', 150, 30, '#262626'),
      label('lm', 160, 4, 'Recettes maximales', { w: 150, fontSize: 12 }),
      label('l0', -14, 234, '0', { w: 28 }),
      label('l1', 286, 234, '100', { w: 40 })
    ], links: [] }
  }
};

// ----- Fabrication -----

module.exports = async ({ page, electron }) => {
  const { handlers } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  const NAME = 'Économie';
  await call('project:create', NAME);
  const lib = await call('library:load', NAME);
  const dir = lib.folder;
  const date = '2026-10-29T08:00:00.000Z';
  const file = path.join(dir, 'Economie.tmtx');
  const base = { format: 'frame-text', version: 1, id: DOC_ID, title: TITLE, created: date, modified: date, links: [], meta: {} };
  // 1. Thème du document (« Rapport ») choisi sur un document vide : ses réglages sont repris tels quels,
  //    les encadrés du texte gardent ainsi leur forme et leur couleur.
  fs.writeFileSync(file, JSON.stringify({ ...base, settings: { autoIndent: false, titleInText: true, mode: 'avance' }, content: { html: '<p><br></p>' }, tags: [] }));
  await page.reload();
  await page.waitForTimeout(1500);
  await page.evaluate(async (id) => {
    await window.FTApp.openDocById(id);
    window.FTTheme.open();
    const card = [...document.querySelectorAll('.th-card')].find((b) => b.querySelector('.theme-name').textContent.replace(' ★', '') === 'Rapport');
    card.click();
    document.getElementById('theme-close').click();
    await new Promise((r) => setTimeout(r, 300));
    await window.FTApp.menu('save');
  }, DOC_ID);
  await page.waitForTimeout(800);
  const themed = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /\.tmtx$/.test(f))), 'utf8')).settings;
  for (const f of fs.readdirSync(dir)) if (/\.tmtx$/.test(f)) fs.rmSync(path.join(dir, f));

  // 2. Formules écrites comme les écrit le logiciel (MathLive), puis le document complet.
  const content = await page.evaluate((h) => {
    const box = document.createElement('div');
    box.innerHTML = h;
    for (const m of box.querySelectorAll('.ft-math')) m.innerHTML = window.MathLive.convertLatexToMarkup(m.dataset.latex, { defaultMode: m.tagName === 'DIV' ? 'math' : 'inline-math' });
    return box.innerHTML;
  }, nbsp(html) + notesHtml());
  const json = {
    ...base,
    settings: {
      ...themed, autoIndent: false, titleInText: true, mode: 'avance', citeStyle: 'auteur-date',
      index: [
        { term: 'inflation', variants: [], parent: '' },
        { term: 'chômage', variants: [], parent: '' },
        { term: 'multiplicateur', variants: [], parent: '' },
        { term: 'élasticité', variants: ['élasticités'], parent: '' },
        { term: 'taux directeur', variants: [], parent: '' },
        { term: 'PIB', variants: [], parent: '' },
        { term: 'productivité', variants: [], parent: '' },
        { term: 'banque centrale', variants: [], parent: '' },
        { term: 'dette', variants: ['endettement'], parent: '' }
      ],
      comments: [{
        id: 'c1', author: 'Relecture', date: '2026-10-28T16:40:00.000Z',
        text: 'Ajouter un exemple chiffré sur la zone euro dans la prochaine version.', done: false,
        replies: [{ author: 'Service des études', date: '2026-10-29T07:30:00.000Z', text: 'Prévu avec les données de la BCE.' }]
      }]
    },
    content: { html: content },
    tags: [{ name: 'Économie', color: 'bleu' }, { name: 'Démonstration', color: 'gris' }]
  };
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(SOURCES, null, 2));
  await page.reload();
  await page.waitForTimeout(1500);
  // Noms propres ajoutés au dictionnaire (comme « Ajouter au dictionnaire »).
  await page.evaluate(async () => { for (const w of ['Md', 'Fisher', 'Laffer', 'Solow', 'Cobb-Douglas', 'Douglas', 'Phillips', 'Taylor', 'Keynes', 'Friedman', 'Marshall']) await window.frameText.spellAdd(w); });

  await page.evaluate(async ({ id, diagrams }) => {
    await window.FTApp.openDocById(id);
    const editor = document.getElementById('editor');
    const tocHere = editor.querySelector('[data-demo="toc"]');
    if (tocHere) {
      window.FTStructure.placeCaret(tocHere);
      window.FTToc.insert();
      tocHere.remove();
    }
    for (const p of editor.querySelectorAll('[data-demo^="diagram:"]')) {
      const spec = diagrams[p.dataset.demo.slice(8)];
      const svg = window.FTDiagram.exportSvg(spec.data);
      const url = window.FTLayout.imageUrl('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))));
      const box = window.FTLayout.makeImage(url, 600);
      box.dataset.diagram = JSON.stringify(spec.data);
      box.classList.add('ft-diagram');
      box.style.width = spec.width + '%';
      box.dataset.num = 'schema';
      if (spec.xid) box.dataset.xid = spec.xid;
      const cap = document.createElement('span');
      cap.className = 'ft-caption';
      cap.setAttribute('contenteditable', 'true');
      cap.textContent = spec.caption;
      box.append(cap);
      p.replaceWith(box);
    }
    window.FTCaptions.refresh();
    window.FTXref.refresh();
    window.FTToc.refresh();
    editor.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 600));
    await window.FTApp.menu('save');
  }, { id: DOC_ID, diagrams: DIAGRAMS });
  await page.waitForTimeout(1500);
  // Plan et renvois après la mise en page (numéros de page).
  await page.evaluate(async () => {
    window.FTToc.refresh();
    window.FTXref.refresh();
    document.getElementById('editor').dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 600));
    await window.FTApp.menu('save');
  });
  await page.waitForTimeout(1200);

  const saved = fs.readdirSync(dir).find((f) => /\.tmtx$/.test(f));
  const data = JSON.parse(fs.readFileSync(path.join(dir, saved), 'utf8'));
  data.created = date;
  data.modified = date;
  // Débuts de page retenus pendant la fabrication (« pages qui restent en place ») : le texte est remis
  // à la suite, la mise en page se fait à l'ouverture.
  data.content.html = data.content.html.replace(/ data-pg-start="[^"]*"/g, '');
  fs.writeFileSync(path.join(dir, saved), JSON.stringify(data, null, 2));
  const out = process.env.ECO_OUT || path.join(__dirname, 'economie');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, FILE), JSON.stringify(data));
  fs.writeFileSync(path.join(out, 'sources.json'), JSON.stringify(SOURCES, null, 2));
  console.log('  Document écrit : ' + path.join(out, FILE));

  // Captures des pages.
  const shots = process.env.ECO_SHOTS;
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width: 1500, height: 1400 });
    await page.reload();
    await page.waitForTimeout(1500);
    await page.evaluate((id) => window.FTApp.openDocById(id), DOC_ID);
    await page.waitForTimeout(3000);
    const n = await page.evaluate(() => window.FTPages.pageCount());
    console.log('  Pages : ' + n);
    for (let i = 0; i < n; i++) {
      const box = await page.evaluate((i) => {
        const f = window.FTPages.frame();
        const pg = document.getElementById('page');
        const top = pg.getBoundingClientRect().top + i * (f.h + f.spacing);
        const sc = pg.closest('.editor-scroll, #editor-wrap, main') || document.scrollingElement;
        return { top, left: pg.getBoundingClientRect().left, w: f.w, h: f.h, sc: !!sc };
      }, i);
      await page.evaluate((i) => {
        const f = window.FTPages.frame();
        const pg = document.getElementById('page');
        let el = pg.parentElement;
        while (el && !(el.scrollHeight > el.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        el = el || document.scrollingElement;
        const base = pg.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
        el.scrollTop = base + i * (f.h + f.spacing) - 20;
      }, i);
      await page.waitForTimeout(500);
      const clip = await page.evaluate((i) => {
        const f = window.FTPages.frame();
        const pg = document.getElementById('page').getBoundingClientRect();
        return { x: pg.left, y: pg.top + i * (f.h + f.spacing), width: f.w, height: f.h };
      }, i);
      await page.screenshot({ path: path.join(shots, `page-${String(i + 1).padStart(2, '0')}.png`), clip });
    }
    // Le logiciel autour du texte : la conclusion et son commentaire en marge.
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('#editor .ft-comment').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shots, 'logiciel.png') });
  }
};
module.exports.DOC_ID = DOC_ID;
