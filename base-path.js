// Préfixe tous les liens absolus de _site/ par un sous-chemin (ex. /cuisineaumiel),
// pour servir le site à l'adresse provisoire sfedoraw.github.io/cuisineaumiel/
// tant que le domaine cuisineaumiel.fr n'est pas branché.
const fs = require('fs'), path = require('path');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) { console.log('base-path : aucun préfixe, rien à faire'); process.exit(0); }
const out = '_site';
fs.rmSync(path.join(out, 'CNAME'), { force: true });
const fix = (s) => s
  .replace(/(href|src|action|content)="\/(?!\/)/g, `$1="${base}/`)
  .replace(/srcset="([^"]*)"/g, (m, v) => `srcset="${v.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`)}"`)
  .replace(/url\(\s*(['"]?)\/(?!\/)/g, `url($1${base}/`);
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(html|css)$/.test(f)) continue;
    fs.writeFileSync(p, fix(fs.readFileSync(p, 'utf8')));
  }
})(out);
console.log('✓ liens préfixés par', base);
