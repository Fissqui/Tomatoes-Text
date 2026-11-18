// Mise en route du moteur d'édition (version 2.0) : il prend la place de l'ancienne zone d'écriture.
// Chargé juste avant app.js, une fois tous les modules des versions 1.x en place : ils gardent l'ancienne
// zone (vide et cachée, renommée « editor-ancien »), et la zone du moteur reçoit l'id « editor » (toute la
// feuille de style et le thème du document s'y appliquent) ; chaque module est ensuite branché sur le moteur.
(function () {
  const $ = (id) => document.getElementById(id);
  const legacy = $('editor');
  const mount = $('pm-editor');
  legacy.id = 'editor-ancien';
  mount.id = 'editor';

  // ----- Réglages posés sur l'ancienne zone (colonnes du document…) : recopiés sur la nouvelle -----

  const ENGINE = new Set(['ProseMirror', 'ProseMirror-focused', 'ProseMirror-hideselection', 'is-empty', 'auto-indent']);
  const LEGACY_ONLY = new Set(['resize-col', 'resize-row', 'resize-side', 'object-selected']);
  let mirrored = new Set();
  function mirror() {
    const cls = [...legacy.classList].filter((c) => !ENGINE.has(c) && !LEGACY_ONLY.has(c));
    for (const c of mirrored) if (!cls.includes(c)) mount.classList.remove(c);
    for (const c of cls) mount.classList.add(c);
    mirrored = new Set(cls);
    const skip = (name) => !name.startsWith('data-') || name === 'data-placeholder';
    for (const at of [...mount.attributes]) if (!skip(at.name) && !legacy.hasAttribute(at.name)) mount.removeAttribute(at.name);
    for (const at of legacy.attributes) if (!skip(at.name)) mount.setAttribute(at.name, at.value);
  }
  new MutationObserver(mirror).observe(legacy, { attributes: true });
  mirror();

  // Les touches tapées dans le texte ne vont pas aux outils des versions 1.x (ils travailleraient sur
  // l'ancienne zone) ; Échap ferme toujours les menus ouverts.
  mount.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  // Mode avancé (pages) : le moteur découpe lui-même le texte ; pages.js dessine les feuilles.
  window.FTPages.useEngine(mount, window.FTVisibles);
  // Images, schémas, tableaux et encadrés : position, habillage et taille (layout.js) sur la zone du moteur.
  window.FTObjets.start();
  // Outils des versions 1.x repris tels quels : ils travaillent sur le texte affiché par le moteur, et
  // chacune de leurs modifications est relue d'un coup (moteur/objets.js).
  for (const api of [window.FTCase, window.FTFind, window.FTLettrine, window.FTStyles, window.FTStructure, window.FTOrdinals,
    window.FTSort, window.FTLinks]) api.useEngine(mount, window.FTObjets);
  // Guillemets, point médian, majuscule automatique, caractères spéciaux, date : écrits par le moteur.
  window.FTEcriture.start();
  // Notes de bas de page et de fin, citations, bibliographies : écrites et tenues à jour par le moteur.
  window.FTNotes.start();
  window.FTStructure.insertFootnote = () => window.FTNotes.footnote();
  // Plan, légendes et table des illustrations, index, renvois, signets, page de titre, volet de
  // navigation : tenus à jour sur le texte du moteur (moteur/generes.js).
  window.FTGeneres.start();
  // Orthographe, grammaire, doublons et synonymes (moteur/correcteur.js) ; langue des paragraphes.
  window.FTCorrecteur.start();
  window.FTLang.useEngine(mount, window.FTMoteur);
  // Mode lecture, zoom et double page, exports Word et PDF : sur la zone du moteur.
  for (const api of [window.FTReading, window.FTZoom, window.FTWord, window.FTPdf]) if (api && api.useEngine) api.useEngine(mount, window.FTVisibles);
  // Raccourcis « Structure » (titres, listes, encadré) : faits par le moteur.
  window.FTStructure.command = (name) => {
    const B = window.FTBlocs;
    if (/^(p|h[1-5]|title)$/.test(name)) B.setBlock(name);
    else if (name === 'ul') B.toggleList(false);
    else if (name === 'ol') B.toggleList(true);
    else if (name === 'check') B.toggleCheck();
    else if (name === 'callout') B.toggleCallout();
  };
})();
