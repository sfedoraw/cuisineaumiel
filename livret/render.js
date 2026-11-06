// Rend livret.html en PDF : version imprimeur (fond perdu 3 mm) et version A5 simple.
// Usage : node livret/gen.js && node livret/render.js [dossier-de-sortie]
const path = require('path');
const { chromium } = require('playwright');
const out = process.argv[2] || __dirname;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'livret.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(out, 'livret-miel-A5-imprimeur-fond-perdu.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.addStyleTag({ content: ':root{--b:0mm}' });
  await page.pdf({ path: path.join(out, 'livret-miel-A5.pdf'), preferCSSPageSize: true, printBackground: true });
  // Aperçus PNG de chaque page (version A5 simple)
  if (process.env.PNG) {
    const n = await page.$$eval('.page', (els) => els.length);
    await page.setViewportSize({ width: 560, height: 794 });
    const pages = await page.$$('.page');
    for (let i = 0; i < n; i++) await pages[i].screenshot({ path: path.join(process.env.PNG, `p${String(i + 1).padStart(2, '0')}.png`) });
  }
  await browser.close();
})();
