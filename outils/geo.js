// Génère les tracés SVG de la France et du monde à partir des données Natural Earth
// du paquet world-atlas (fichiers JSON). Décodeur TopoJSON intégré, sans dépendance.
// Usage : node outils/geo.js <dossier du paquet world-atlas>
const fs = require('fs'), path = require('path');
const [atlasDir] = process.argv.slice(2);
const r = (n) => Math.round(n * 10) / 10;
// Simplification : on ignore les points trop proches du précédent (tol en pixels).
const simplify = (pts, tol) => pts.filter((p, i) => { if (i === 0 || i === pts.length - 1) return true; const q = simplify.last; if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < tol) return false; simplify.last = p; return true; });
const pathOf = (pts, tol) => { simplify.last = null; const s = simplify(pts, tol); return s.length > 3 ? 'M' + s.map((p) => p.join(',')).join('L') + 'Z' : ''; };

function decodeArcs(t) {
  const [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
  return t.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
}
function ringOf(arcs, idx) {
  const pts = [];
  for (const i of idx) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; pts.push(...(pts.length ? a.slice(1) : a)); }
  return pts;
}
function features(t, obj) {
  const arcs = decodeArcs(t);
  const geom = (g) => g.type === 'Polygon' ? [g.arcs.map((rg) => ringOf(arcs, rg))] : g.arcs.map((p) => p.map((rg) => ringOf(arcs, rg)));
  const gs = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
  return gs.filter((g) => g.arcs).map((g) => ({ id: g.id, polys: geom(g) }));
}

// France métropolitaine : projection équirectangulaire corrigée à 46,5° N.
const FR = { lon0: -5.3, lat1: 51.2, k: 60, c: Math.cos(46.5 * Math.PI / 180) };
const projFr = ([lon, lat]) => [r((lon - FR.lon0) * FR.k * FR.c), r((FR.lat1 - lat) * FR.k)];
const t10 = JSON.parse(fs.readFileSync(path.join(atlasDir, 'countries-10m.json')));
const fr = features(t10, t10.objects.countries).find((f) => f.id === '250');
const inMetro = (ring) => ring.every(([lon, lat]) => lon > -6 && lon < 10 && lat > 41 && lat < 52);
let dFr = '';
for (const poly of fr.polys) {
  const ring = poly[0];
  if (!inMetro(ring) || ring.length < 8) continue;
  dFr += pathOf(ring.map(projFr), 1.6);
}
const frW = r((9.7 - FR.lon0) * FR.k * FR.c), frH = r((FR.lat1 - 41.2) * FR.k);

// Monde : projection équirectangulaire, de 84° N à 58° S.
const W = { k: 2.8 };
const projW = ([lon, lat]) => [r((lon + 180) * W.k), r((84 - lat) * W.k)];
const tl = JSON.parse(fs.readFileSync(path.join(atlasDir, 'land-110m.json')));
let dW = '';
for (const f of features(tl, tl.objects.land)) {
  for (const poly of f.polys) for (const ring of poly) {
    if (ring.every(([, lat]) => lat < -58)) continue;
    // Les contours qui traversent l'antiméridien sont coupés en plusieurs morceaux.
    const pts = ring.map(projW); let part = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180 * W.k) { dW += pathOf(part, 1.4); part = []; }
      part.push(pts[i]);
    }
    dW += pathOf(part, 1.4);
  }
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'geo.json'), JSON.stringify({
  france: { d: dFr, w: frW, h: frH, proj: FR },
  monde: { d: dW, w: r(360 * W.k), h: r((84 + 58) * W.k), proj: W },
}));
console.log('✓ data/geo.json', (dFr.length / 1024).toFixed(0), 'Ko France,', (dW.length / 1024).toFixed(0), 'Ko monde');
