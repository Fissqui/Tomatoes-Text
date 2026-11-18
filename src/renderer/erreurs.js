// Erreurs inattendues de la fenêtre : les 30 dernières sont gardées (jointes aux signalements, Aide >
// Signaler un défaut…) et écrites dans le journal du logiciel (src/journal.js). Chargé en premier.
(function () {
  const api = window.frameText;
  const list = [];
  let sent = 0;

  function keep(text) {
    // (Chemins du logiciel retirés : seuls le fichier et la ligne servent.)
    text = String(text).replace(/file:\/\/\/[^\s)]*\/renderer\//g, '').slice(0, 2000);
    // (Avertissement sans conséquence du navigateur.)
    if (/ResizeObserver loop/.test(text)) return;
    const last = list[list.length - 1];
    if (last && last.text === text) { last.n++; return; }
    list.push({ t: Date.now(), text, n: 1 });
    if (list.length > 30) list.shift();
    if (sent++ < 100 && api && api.journal) api.journal(text);
  }

  window.addEventListener('error', (e) => {
    keep(e.error && e.error.stack ? e.error.stack : `${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    keep('Promesse : ' + (r && r.stack ? r.stack : r && r.message ? r.message : r));
  });

  window.FTErreurs = { list: () => list.map((x) => ({ ...x })) };
})();
