// Banc d'essai : fait tourner Tomatoes Text sans Electron. main.js tourne dans Node (avec un faux
// module « electron », faux-electron.js), l'interface dans Chromium (Playwright) ; les deux sont reliés
// comme par preload.js. Les fichiers sont écrits dans un dossier temporaire.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-complet.js
// (Playwright doit être installé ; FT_SRC=<dossier src> pour essayer une autre version du code.)
const path = require('path');
const fs = require('fs');
const Module = require('module');
// Pas de tutoriel proposé au premier lancement (essai-tutoriel.js le rétablit).
process.env.FT_SANS_TUTORIEL = '1';
const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'electron' ? path.join(__dirname, 'faux-electron.js') : resolve.call(this, request, ...rest);
};
const electron = require('electron');
const { handlers, listeners } = electron._test;
require(path.join(SRC, 'main.js'));
electron.app._ready();
const { chromium } = require('playwright');

async function boot({ scenario }) {
  await new Promise((r) => setTimeout(r, 300));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, deviceScaleFactor: Number(process.env.FT_ECHELLE) || 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('console.' + m.type() + ': ' + m.text()); });
  const calls = [];
  await page.exposeFunction('__ipcInvoke', async (ch, args) => {
    calls.push(ch);
    const fn = handlers.get(ch);
    if (!fn) throw new Error('no handler ' + ch);
    const res = await fn({ sender: { send: (c, ...a) => emit(c, a) } }, ...args);
    return res === undefined ? null : JSON.parse(JSON.stringify(res));
  });
  await page.exposeFunction('__ipcSend', (ch, args) => {
    calls.push(ch);
    for (const fn of listeners.get(ch) || []) fn({}, ...args);
  });
  const emit = (ch, args) => page.evaluate(([c, a]) => window.__ftEmit(c, a), [ch, args]).catch(() => {});
  electron.BrowserWindow.onSend = emit;
  const preload = fs.readFileSync(path.join(SRC, 'preload.js'), 'utf8');
  await page.addInitScript(`(() => {
    const on = {};
    window.__ftEmit = (ch, args) => (on[ch] || []).forEach((cb) => cb({}, ...args));
    const require = () => ({
      contextBridge: { exposeInMainWorld: (k, v) => { window[k] = v; } },
      ipcRenderer: {
        invoke: (ch, ...a) => window.__ipcInvoke(ch, a),
        send: (ch, ...a) => { window.__ipcSend(ch, a); },
        on: (ch, cb) => { (on[ch] = on[ch] || []).push(cb); }
      }
    });
    ${preload}
  })();`);
  await page.goto('file://' + path.join(SRC, 'renderer', 'index.html'));
  await page.waitForTimeout(1500);
  // Moteur 2.0 : les essais des versions 1.x posent le texte par #editor.innerHTML ; ce texte passe par
  // le moteur (comme un document ouvert, sans toucher aux réglages ni à l'historique).
  await page.evaluate(() => {
    const M = window.FTMoteur;
    if (!M) return;
    const mount = M.view.dom;
    const native = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(mount, 'innerHTML', {
      configurable: true,
      get() { return native.get.call(this); },
      set(html) {
        const box = window.FTSchema.prepare(html);
        const doc = window.FTSchema.parser.parse(box, { preserveWhitespace: true });
        const v = M.view;
        v.dispatch(v.state.tr.replaceWith(0, v.state.doc.content.size, doc.content).setMeta('addToHistory', false));
        if (window.FTHistory) window.FTHistory.reset();
      }
    });
    // Curseur posé par une plage du navigateur (sans clic) : le moteur le reprend aussi, sinon il
    // remettrait le sien en recevant le clavier.
    const take = (r) => {
      // (Pas pendant un outil du logiciel qui modifie le texte affiché : le moteur relit tout à la fin.)
      if (!mount.contains(r.startContainer) || !mount.contains(r.endContainer) || (window.FTObjets && window.FTObjets.busy())) return;
      try {
        const v = M.view;
        const doc = v.state.doc;
        const $a = doc.resolve(v.posAtDOM(r.startContainer, r.startOffset));
        const $b = doc.resolve(v.posAtDOM(r.endContainer, r.endOffset));
        // D'une case à une autre du même tableau : sélection de cases (comme à la souris).
        const cell = ($p) => { for (let d = $p.depth; d > 0; d--) if (/^table_(cell|header)$/.test($p.node(d).type.name)) return $p.before(d); return null; };
        const ca = cell($a);
        const cb = cell($b);
        const sel = ca !== null && cb !== null && ca !== cb ? PM.tables.CellSelection.create(doc, ca, cb) : PM.state.TextSelection.between($a, $b);
        v.dispatch(v.state.tr.setSelection(sel));
        // (La plage posée est celle que le moteur connaît : il ne la relit pas.)
        v.domObserver.setCurSelection();
      } catch { /* plage hors du texte */ }
    };
    const add = Selection.prototype.addRange;
    Selection.prototype.addRange = function (r) {
      add.call(this, r);
      take(r);
    };
    const extent = Selection.prototype.setBaseAndExtent;
    Selection.prototype.setBaseAndExtent = function (...args) {
      extent.apply(this, args);
      if (this.rangeCount) take(this.getRangeAt(0));
    };
  });
  // FT_ZOOM=<pourcentage> : tous les essais avec la page zoomée (vérifie les mesures à l'écran).
  if (process.env.FT_ZOOM) await page.evaluate((z) => window.FTZoom.set(z), Number(process.env.FT_ZOOM));
  try {
    await scenario({ page, errors, calls, electron, emit });
  } finally {
    await browser.close();
  }
  return errors;
}

module.exports = { boot };
if (require.main === module) {
  const file = process.argv[2];
  boot({ scenario: require(path.resolve(file)) }).then((errors) => {
    console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : 'Aucune erreur dans la console.');
    process.exit(errors.length ? 1 : 0);
  }, (e) => { console.error('ECHEC', e); process.exit(2); });
}
