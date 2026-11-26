// Images d'un texte copié dans Word (presse-papiers relevé sur Word 16, novembre 2026) : l'image du VML
// (<v:imagedata>, fichier d'origine en pleine taille) est préférée à la copie réduite de l'<img> de secours ;
// original illisible → copie de secours ; forme VML sans <img> de secours → image ajoutée quand même ;
// image dans une zone de texte (tableaux de mise en page retirés) ; image marquée EMF qui est un PNG ;
// document réglé pour « s'appuyer sur VML » (formes écrites dans la page, sans <img>).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

// PNG d'une couleur unie, w × h.
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msohtmlclip-'));
  fs.writeFileSync(path.join(dir, 'clip_image001.png'), png(1200, 720, [200, 40, 40])); // original
  fs.writeFileSync(path.join(dir, 'clip_image002.png'), png(120, 72, [200, 40, 40])); // vignette
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  const thumb = 'data:image/png;base64,' + png(150, 90, [40, 40, 200]).toString('base64');
  const vml = (id, src, style) => `<!--[if gte vml 1]><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" filled="f" stroked="f"><v:stroke joinstyle="miter"/></v:shapetype><v:shape id="${id}" o:spid="_x0000_s1026" type="#_x0000_t75"\r\n style='${style}'>\r\n <v:imagedata src="${src}"\r\n  o:title=""/>\r\n</v:shape><![endif]-->`;
  const word = (frag) => `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=ProgId content=Word.Document></head><body lang=FR>\r\n<!--StartFragment-->${frag}<!--EndFragment-->\r\n</body></html>`;
  const paste = async (html, text) => {
    await page.evaluate(() => { const ed = document.getElementById('editor'); ed.innerHTML = '<p id="here">Début</p>'; ed.focus(); });
    await page.click('#editor p');
    await page.keyboard.press('End');
    await page.evaluate(([h, t]) => {
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', t);
      document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [html, text]);
    await page.waitForFunction(() => document.getElementById('paste-dialog').open || document.querySelector('#editor .ft-image img'), null, { timeout: 5000 }).catch(() => {});
    if (await page.evaluate(() => document.getElementById('paste-dialog').open)) await page.click('#ps-ok');
    await page.waitForTimeout(400);
    return page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#editor .ft-image img')];
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      return { imgs: imgs.map((i) => ({ w: i.naturalWidth, wrap: i.parentElement.dataset.wrap || '', align: i.parentElement.dataset.align || '', width: i.parentElement.style.width })), html: window.FTEditor.getHtml().replace(/base64,[^"]+/g, 'B64') };
    });
  };
  const TEXT = "Avant l'image.\r\n \r\nAprès l'image.\r\nTexte autour.\r\n";

  // 1. Image flottante (vignette en <img>, original en VML) et image dans le texte (copie réduite en data:).
  const floating = 'position:absolute;margin-left:-.35pt;margin-top:0;width:150pt;height:90pt;z-index:251659264;mso-wrap-style:square';
  const r1 = await paste(word(`<p class=MsoNormal>${vml('Image_x0020_2', url('clip_image001.png'), floating)}<![if !vml]><img width=200 height=120\r\nsrc="${url('clip_image002.png')}"\r\nalign=left hspace=12 v:shapes="Image_x0020_2"><![endif]>Avant l'image.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal><span style='mso-no-proof:yes'>${vml('Image_x0020_1', url('clip_image001.png'), 'width:150pt;height:90pt;mso-wrap-style:square')}<![if !vml]><img width=200 height=120\r\nsrc="${thumb}"\r\nv:shapes="Image_x0020_1"><![endif]></span><o:p></o:p></p>\r\n\r\n<p class=MsoNormal>Après l'image.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal>Texte autour.<o:p></o:p></p>`), TEXT);
  assert.strictEqual(r1.imgs.length, 2, 'deux images collées : ' + r1.html);
  assert.deepStrictEqual(r1.imgs.map((i) => i.w), [1200, 1200], 'originaux en pleine taille, pas les copies réduites');
  assert.strictEqual(r1.imgs[0].wrap, 'gauche', 'image flottante gardée à côté du texte');
  assert.strictEqual(r1.imgs[1].align, 'gauche', 'image du texte entre deux paragraphes');
  assert.strictEqual(r1.imgs[0].width, r1.imgs[1].width, 'taille affichée de Word gardée (200 px)');
  assert(/Après l'image\.<\/p><p>Texte autour/.test(r1.html), 'texte gardé');
  ok('Word : originaux en pleine taille, flottante et dans le texte, à la taille de Word');

  // 2. Original disparu (dossier temporaire de Word vidé) : copie de secours gardée.
  const r2 = await paste(word(`<p class=MsoNormal><span style='mso-no-proof:yes'>${vml('Image_x0020_1', url('absent.png'), 'width:150pt;height:90pt')}<![if !vml]><img width=200 height=120 src="${thumb}" v:shapes="Image_x0020_1"><![endif]></span></p>\r\n<p class=MsoNormal>Après l'image.</p>`), "\r\nAprès l'image.\r\n");
  assert.deepStrictEqual(r2.imgs.map((i) => i.w), [150], 'copie de secours : ' + r2.html);
  ok('Word : original illisible → copie de secours');

  // 3. Forme VML seule (sans <img> de secours) : image ajoutée, flottante.
  const r3 = await paste(word(`<p class=MsoNormal>${vml('Image_x0020_3', url('clip_image001.png'), floating)}Texte autour de l'image.</p>\r\n<p class=MsoNormal>Suite.</p>`), "Texte autour de l'image.\r\nSuite.\r\n");
  assert.strictEqual(r3.imgs.length, 1, 'image ajoutée : ' + r3.html);
  assert.strictEqual(r3.imgs[0].wrap, 'gauche', 'flottante');
  assert.strictEqual(r3.imgs[0].width, r1.imgs[0].width, 'taille du VML (150 pt = 200 px)');
  ok('Word : forme VML sans image de secours → image ajoutée');

  // 4. Photo dans une zone de texte (posée à côté du texte) : Word l'entoure de tableaux de mise en page.
  const box = `<p class=MsoNormal><!--[if gte vml 1]><v:shape id="Zone_x0020_de_x0020_texte_x0020_1" o:spid="_x0000_s1027" type="#_x0000_t202"\r\n style='position:absolute;margin-left:0;margin-top:14.2pt;width:180pt;height:110pt;z-index:251660288'>\r\n <v:textbox>\r\n  <![if !mso]>\r\n  <table cellpadding=0 cellspacing=0 width="100%">\r\n   <tr>\r\n    <td><![endif]>\r\n    <div>\r\n    <p class=MsoNormal><span style='mso-no-proof:yes'><img width=200 height=120 src="${thumb}" v:shapes="Image_x0020_4"></span></p>\r\n    </div>\r\n    <![if !mso]></td>\r\n   </tr>\r\n  </table>\r\n  <![endif]></v:textbox>\r\n</v:shape><![endif]--><![if !vml]><span style='mso-ignore:vglayout;\r\nposition:absolute;z-index:251660288;left:0px;margin-left:-1px;margin-top:18px;\r\nwidth:242px;height:148px'>\r\n\r\n<table cellpadding=0 cellspacing=0>\r\n <tr>\r\n  <td width=242 height=148 style='vertical-align:top'><![endif]><![if !mso]><span\r\n  style='position:absolute;mso-ignore:vglayout;z-index:251660288'>\r\n  <table cellpadding=0 cellspacing=0 width="100%">\r\n   <tr>\r\n    <td><![endif]>\r\n    <div v:shape="Zone_x0020_de_x0020_texte_x0020_1" style='padding:3.6pt 7.2pt 3.6pt 7.2pt'\r\n    class=shape>\r\n    <p class=MsoNormal><span style='mso-no-proof:yes'><!--[if gte vml 1]><v:shape\r\n     id="Image_x0020_4" o:spid="_x0000_i1025" type="#_x0000_t75" style='width:150pt;height:90pt'>\r\n     <v:imagedata src="${url('clip_image001.png')}" o:title=""/>\r\n    </v:shape><![endif]--><![if !vml]><img width=200 height=120\r\n    src="${thumb}" v:shapes="Image_x0020_4"><![endif]></span><o:p></o:p></p>\r\n    </div>\r\n    <![if !mso]></td>\r\n   </tr>\r\n  </table>\r\n  </span><![endif]><![if !mso & !vml]>&nbsp;<![endif]><![if !vml]></td>\r\n </tr>\r\n</table>\r\n\r\n</span><![endif]>Texte avant.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal><o:p>&nbsp;</o:p></p>\r\n\r\n<p class=MsoNormal>Texte après.<o:p></o:p></p>`;
  const r4 = await paste(word(box), 'Texte avant.\r\n\r\nTexte après.\r\n');
  assert.strictEqual(r4.imgs.length, 1, 'photo de la zone de texte gardée : ' + r4.html);
  assert(!/<table/.test(r4.html), 'pas de tableau : ' + r4.html);
  assert(/Texte avant\./.test(r4.html) && /Texte après\./.test(r4.html), 'texte gardé');
  ok('Word : photo dans une zone de texte gardée, sans tableau');

  // 4 bis. Zone de texte telle que Word 16 l'écrit (relevé réel : boîte relative, puis absolue, deux tableaux).
  const r4b = await paste(word(`\r\n\r\n<p class=MsoNormal>Texte avant.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal><!--[if gte vml 1]><v:shapetype id="_x0000_t202"\r\n coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">\r\n <v:stroke joinstyle="miter"/>\r\n <v:path gradientshapeok="t" o:connecttype="rect"/>\r\n</v:shapetype><v:shape id="Zone_x0020_de_x0020_texte_x0020_1" o:spid="_x0000_s1026"\r\n type="#_x0000_t202" style='position:absolute;margin-left:-70.85pt;\r\n margin-top:-93.05pt;width:220pt;height:160pt;z-index:251659264;visibility:visible;\r\n mso-wrap-style:square;mso-position-horizontal:absolute;mso-position-horizontal-relative:text;\r\n mso-position-vertical:absolute;mso-position-vertical-relative:text;\r\n v-text-anchor:top' filled="f" strokeweight=".5pt">\r\n <v:fill o:detectmouseclick="t"/>\r\n</v:shape><![endif]--><![if !vml]><span style='mso-ignore:vglayout;position:\r\nrelative;z-index:251659264'><span style='position:absolute;left:-95px;\r\ntop:-125px;width:299px;height:219px'>\r\n\r\n<table cellpadding=0 cellspacing=0>\r\n <tr>\r\n  <td width=300 height=219 style='border:.5pt solid black;vertical-align:top'><![endif]><![if !mso]><span\r\n  style='position:absolute;mso-ignore:vglayout;z-index:251659264'>\r\n  <table cellpadding=0 cellspacing=0 width="100%">\r\n   <tr>\r\n    <td><![endif]>\r\n    <div v:shape="Zone_x0020_de_x0020_texte_x0020_1" style='padding:4.1pt 7.7pt 4.1pt 7.7pt'\r\n    class=shape>\r\n    <p class=MsoNormal><span style='mso-no-proof:yes'><!--[if gte vml 1]><v:shapetype\r\n     id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t"\r\n     path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">\r\n     <v:stroke joinstyle="miter"/>\r\n    </v:shapetype><v:shape id="Image_x0020_2" o:spid="_x0000_i1025" type="#_x0000_t75"\r\n     style='width:205.5pt;height:136.5pt;visibility:visible;mso-wrap-style:square'>\r\n     <v:imagedata src="${url('clip_image001.png')}"\r\n      o:title=""/>\r\n    </v:shape><![endif]--><![if !vml]><img width=274 height=182\r\n    src="${thumb}"\r\n    v:shapes="Image_x0020_2"><![endif]></span><o:p></o:p></p>\r\n    </div>\r\n    <![if !mso]></td>\r\n   </tr>\r\n  </table>\r\n  </span><![endif]><![if !mso & !vml]>&nbsp;<![endif]><![if !vml]></td>\r\n </tr>\r\n</table>\r\n\r\n</span></span><![endif]><o:p>&nbsp;</o:p></p>\r\n\r\n<br style='mso-ignore:vglayout' clear=ALL>\r\n\r\n<p class=MsoNormal>Texte après.<o:p></o:p></p>\r\n\r\n`), 'Texte avant.\r\n\r\nTexte après.\r\n');
  assert.strictEqual(r4b.imgs.length, 1, 'image de la zone de texte gardée : ' + r4b.html);
  assert.strictEqual(r4b.imgs[0].w, 1200, 'en pleine taille');
  assert(!/<table/.test(r4b.html), 'pas de tableau : ' + r4b.html);
  ok('Word : zone de texte relevée sur Word 16, image gardée');

  // 5. Image marquée « image/emf » qui est en fait un PNG : type rectifié, image gardée.
  const emf = 'data:image/emf;base64,' + png(150, 90, [40, 200, 40]).toString('base64');
  const r5 = await paste(word(`<p class=MsoNormal>Avant.</p>\r\n<p class=MsoNormal><img width=200 height=120 src="${emf}"></p>\r\n<p class=MsoNormal>Après.</p>`), 'Avant.\r\n\r\nAprès.\r\n');
  assert.strictEqual(r5.imgs.length, 1, 'image gardée : ' + r5.html);
  assert(/data:image\/png;B64/.test(r5.html), 'type PNG : ' + r5.html);
  ok('Word : image marquée EMF mais en PNG gardée, type rectifié');

  // 6. Vrai tableau de Word avec une image dans une case : reste un tableau.
  const r6 = await paste(word(`<p class=MsoNormal>Avant.</p>\r\n<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0><tr><td><p class=MsoNormal>Case un</p></td><td><p class=MsoNormal>Case deux</p></td></tr></table>\r\n<p class=MsoNormal>Après.</p>`), 'Avant.\r\nCase un\tCase deux\r\nAprès.\r\n');
  assert(/<table/.test(r6.html) && /Case deux/.test(r6.html), 'tableau gardé : ' + r6.html);
  ok('Word : vrai tableau inchangé');

  // 7. Document réglé pour « s'appuyer sur VML » (<o:RelyOnVML/>) : la photo n'existe qu'en <v:shape> écrit
  //    dans la page (ni commentaire, ni <img>) ; légende dans une zone de texte, avec une équation dont
  //    l'image de secours est aussi en VML.
  const rely = `<p class=MsoNormal style='text-align:justify;text-indent:35.4pt'><v:shapetype\r\n id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" filled="f" stroked="f">\r\n <v:stroke joinstyle="miter"/>\r\n</v:shapetype><v:shape id="Image_x0020_106" o:spid="_x0000_s1027" type="#_x0000_t75"\r\n style='position:absolute;left:0;text-align:left;margin-left:0;margin-top:62.6pt;\r\n width:371.5pt;height:252.25pt;z-index:251922432;visibility:visible;\r\n mso-wrap-style:square;mso-position-horizontal:center;\r\n mso-position-horizontal-relative:margin;mso-position-vertical:absolute' stroked="t" strokeweight="1.5pt">\r\n <v:imagedata src="${url('clip_image001.png')}"\r\n  o:title=""/>\r\n <w:wrap type="square" anchorx="margin"/>\r\n</v:shape><span style='mso-bidi-font-style:italic'>Les deux figures comparent\r\nles courbes obtenues. <o:p></o:p></span></p>\r\n\r\n<p class=MsoNormal style='text-align:justify;text-indent:35.4pt'><v:shape id="Zone_x0020_de_x0020_texte_x0020_43" o:spid="_x0000_s1026"\r\n type="#_x0000_t202" style='position:absolute;left:0;margin-left:40.55pt;margin-top:255.05pt;width:372.2pt;height:38.05pt'\r\n fillcolor="white [3201]" stroked="f" strokeweight=".5pt">\r\n <v:textbox>\r\n  <![if !mso]>\r\n  <table cellpadding=0 cellspacing=0 width="100%">\r\n   <tr>\r\n    <td><![endif]>\r\n    <div>\r\n    <p class=MsoNormal style='text-align:justify'><b>Figure 1. </b>Courbes\r\n    de demande <!--[if gte msEquation 12]><m:oMath><m:sSub><m:e><i><m:r>x</m:r></i></m:e><m:sub><i><m:r>1</m:r></i></m:sub></m:sSub></m:oMath><![endif]--><![if !msEquation]><span\r\n    style='position:relative;top:3.0pt'><v:shape id="_x0000_i1025"\r\n     type="#_x0000_t75" style='width:10.5pt;height:14.25pt'>\r\n     <v:imagedata src="${url('clip_image002.png')}"\r\n      o:title="" chromakey="white"/>\r\n    </v:shape></span><![endif]>, quatre modèles.<o:p></o:p></p>\r\n    </div>\r\n    <![if !mso]></td>\r\n   </tr>\r\n  </table>\r\n  <![endif]></v:textbox>\r\n <w:wrap anchorx="margin"/>\r\n</v:shape><span><o:p>&nbsp;</o:p></span></p>`;
  const r7 = await paste(word(rely), 'Les deux figures comparent les courbes obtenues.\r\nFigure 1. Courbes de demande x1, quatre modèles.\r\n');
  assert.strictEqual(r7.imgs.length, 1, 'photo gardée (l\'image de l\'équation non) : ' + r7.html);
  assert.strictEqual(r7.imgs[0].w, 1200, 'photo en pleine taille');
  assert(!r7.imgs[0].align && !r7.imgs[0].wrap, 'centrée, entre deux paragraphes : ' + r7.html);
  assert(!/<table/.test(r7.html), 'légende sans tableau : ' + r7.html);
  assert(/Figure 1\./.test(r7.html) && /class="ft-math/.test(r7.html), 'légende et équation gardées : ' + r7.html);
  assert(/comparent les courbes/.test(r7.html), 'texte gardé');
  ok('Word « s\'appuyer sur VML » : photo gardée, centrée ; légende en zone de texte avec son équation');
  fs.rmSync(dir, { recursive: true, force: true });
};
