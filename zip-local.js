// Copie de _site/ lisible sans serveur (double-clic sur index.html) : liens relatifs.
const fs = require('fs'), path = require('path');
const src = '_site', out = process.argv[2] || '_local';
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.html')) continue;
    const depth = path.relative(out, dir).split(path.sep).filter(Boolean).length;
    const up = depth ? '../'.repeat(depth) : './';
    let h = fs.readFileSync(p, 'utf8');
    h = h.replace(/(href|src|action)="\/(?!\/)([^"#?]*)/g, (m, a, u) => `${a}="${up}${u}${u === '' || u.endsWith('/') ? 'index.html' : ''}`);
    fs.writeFileSync(p, h);
  }
})(out);
console.log('✓ copie locale dans', out);
