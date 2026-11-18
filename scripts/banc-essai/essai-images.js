// Une même image garde une seule adresse en mémoire, et le fichier garde ses données.
const assert = require('assert');
module.exports = async ({ page }) => {
  const r = await page.evaluate(() => {
    const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const a = window.FTLayout.imageUrl(data);
    const b = window.FTLayout.imageUrl(data);
    const back = window.FTLayout.serialize(`<p><img src="${a}"></p>`);
    return { a, b, same: a === b, back: back.includes(data) };
  });
  assert(r.same && r.back && r.a.startsWith('blob:'));
  console.log('  OK  même image → même adresse blob, et le fichier garde bien les données de l’image');
};
