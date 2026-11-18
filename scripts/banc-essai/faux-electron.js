// Faux module « electron » pour faire tourner main.js dans Node (banc d'essai, voir run.js).
const path = require('path');
const os = require('os');
const fs = require('fs');
const root = process.env.FT_TEST_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'ft-'));
const paths = { userData: path.join(root, 'userData'), documents: path.join(root, 'documents'), temp: path.join(root, 'temp'), appData: path.join(root, 'appData'), home: path.join(root, 'home') };
for (const p of Object.values(paths)) fs.mkdirSync(p, { recursive: true });
const handlers = new Map();
const listeners = new Map();
const sent = [];
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });
const app = {
  isPackaged: false,
  setName() {},
  getName: () => 'Tomatoes Text',
  getPath: (k) => paths[k] || path.join(root, k),
  setPath: (k, v) => { paths[k] = v; fs.mkdirSync(v, { recursive: true }); },
  whenReady: () => ready,
  on(ev, fn) { (app._on[ev] = app._on[ev] || []).push(fn); },
  _on: {},
  quit() {},
  getVersion: () => 'test',
  relaunch() { app.relaunched = (app.relaunched || 0) + 1; },
  _ready: () => readyResolve()
};
const ipcMain = {
  handle: (ch, fn) => { if (handlers.has(ch)) throw new Error('double handle ' + ch); handlers.set(ch, fn); },
  on: (ch, fn) => { (listeners.get(ch) || listeners.set(ch, []).get(ch)).push(fn); },
  once: (ch, fn) => { const w = (...a) => { const l = listeners.get(ch); l.splice(l.indexOf(w), 1); fn(...a); }; ipcMain.on(ch, w); }
};
// Impression réelle (exports PDF et livre) : BrowserWindow.printer = contexte Playwright ; les fenêtres
// cachées deviennent des pages de Chromium, printToPDF passe par page.pdf (même impression que Chromium).
async function printVia(page, o) {
  const inch = (v) => `${v}in`;
  const p = { printBackground: !!o.printBackground, preferCSSPageSize: !!o.preferCSSPageSize, displayHeaderFooter: !!o.displayHeaderFooter };
  if (o.pageSize && typeof o.pageSize === 'object') { p.width = inch(o.pageSize.width); p.height = inch(o.pageSize.height); }
  if (o.margins) p.margin = { top: inch(o.margins.top || 0), bottom: inch(o.margins.bottom || 0), left: inch(o.margins.left || 0), right: inch(o.margins.right || 0) };
  if (o.headerTemplate) p.headerTemplate = o.headerTemplate;
  if (o.footerTemplate) p.footerTemplate = o.footerTemplate;
  if (o.pageRanges) p.pageRanges = o.pageRanges;
  return page.pdf(p);
}
class BrowserWindow {
  constructor(opts = {}) {
    BrowserWindow.all.push(this);
    this.webContents = {
      session: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} },
      setWindowOpenHandler() {}, on() {}, once() {}, setIgnoreMenuShortcuts() {},
      send: (ch, ...args) => { sent.push([ch, ...args]); if (BrowserWindow.onSend) BrowserWindow.onSend(ch, args); },
      executeJavaScript: async () => true,
      printToPDF: async () => Buffer.from('')
    };
    const P = BrowserWindow.printer;
    if (P && opts.show === false) {
      this.loadFile = async (f) => {
        this.page = await P.newPage({ viewport: { width: opts.width || 1000, height: opts.height || 1400 } });
        this.page.on('pageerror', (e) => (BrowserWindow.printErrors = BrowserWindow.printErrors || []).push(e.message));
        await this.page.goto('file://' + f);
      };
      this.webContents.executeJavaScript = (code) => this.page.evaluate(code);
      this.webContents.printToPDF = (o) => printVia(this.page, o);
      this.destroy = () => { if (this.page) this.page.close().catch(() => {}); };
    }
  }
  on() {} isMinimized() { return false; } restore() {} focus() {} loadFile() { return Promise.resolve(); } destroy() {} close() {} setFullScreen() {}
  static getAllWindows() { return BrowserWindow.all; }
}
BrowserWindow.all = [];
module.exports = {
  app, ipcMain, BrowserWindow,
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }), showErrorBox() {} },
  Menu: { buildFromTemplate: (t) => t, setApplicationMenu() {} },
  shell: { openPath: async () => '', trashItem: async (p) => fs.rmSync(p, { recursive: true, force: true }), showItemInFolder() {}, openExternal() {} },
  nativeTheme: { shouldUseDarkColors: false },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('chiffre:' + s), decryptString: (b) => b.toString().replace(/^chiffre:/, '') },
  _test: { handlers, listeners, sent, root, paths }
};
