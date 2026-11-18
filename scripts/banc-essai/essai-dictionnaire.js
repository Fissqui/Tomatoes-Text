// Dictionnaire personnel modifié à la main : ajout reconnu sans rechargement, retrait pris en compte.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
module.exports = async ({ electron }) => {
  const { handlers, sent } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  const lib = await call('library:load');
  const file = path.join(path.dirname(lib.folder), '..', 'Dictionnaire personnel.txt');
  await call('spell:add', 'Zorglubien');
  await new Promise((r) => setTimeout(r, 2200));
  const changes0 = sent.filter((s) => s[0] === 'spell:changed').length;
  fs.appendFileSync(file, 'Blorptique\r\n');
  await new Promise((r) => setTimeout(r, 2200));
  assert.deepStrictEqual(await call('spell:check', ['Blorptique', 'Zorglubien']), [true, true]);
  console.log('  OK  mot ajouté à la main dans le fichier : reconnu sans tout recharger');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Zorglubien\r\n', ''));
  await new Promise((r) => setTimeout(r, 2500));
  assert.deepStrictEqual(await call('spell:check', ['Blorptique', 'Zorglubien']), [true, false]);
  console.log('  OK  mot retiré à la main : n’est plus reconnu (rechargement complet)');
  const changes = sent.filter((s) => s[0] === 'spell:changed').length - changes0;
  console.log('  OK  l’interface a été prévenue', changes, 'fois (une par modification du fichier)');
};
