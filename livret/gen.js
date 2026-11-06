// Livret A5 « Le miel à table » : génère livret.html (et le PDF via render.js).
// Usage : node livret/gen.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(OUT, 'config.json'), 'utf8'));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Typographie française : espaces fines insécables avant ; : ! ? et dans les guillemets.
const typo = (s) => esc(s)
  .replace(/ ([;:!?»])/g, ' $1').replace(/« /g, '« ')
  .replace(/(\d) (°C|g|cl|ml|kg|min|h|cm)\b/g, '$1 $2')
  .replace(/'/g, '’');

function parseRecipe(slug) {
  const raw = fs.readFileSync(path.join(ROOT, 'recettes', slug + '.md'), 'utf8');
  const [, fm, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  for (const l of fm.split('\n')) { const m = l.match(/^(\w+):\s*(.*)$/); if (m) meta[m[1]] = m[2]; }
  const secs = {}; let cur = '_intro'; secs[cur] = [];
  for (const l of body.split('\n')) {
    const h = l.match(/^## (.*)/);
    if (h) { cur = h[1].trim(); secs[cur] = []; continue; }
    secs[cur].push(l);
  }
  const groups = []; let g = { name: '', items: [] };
  for (const l of secs['Ingrédients'] || []) {
    const h = l.match(/^### (.*)/);
    if (h) { if (g.items.length) groups.push(g); g = { name: h[1], items: [] }; continue; }
    const it = l.match(/^- (.*)/); if (it) g.items.push(it[1]);
  }
  if (g.items.length) groups.push(g);
  const steps = (secs['Préparation'] || []).map((l) => l.match(/^\d+\.\s+(.*)/)).filter(Boolean).map((m) => m[1]);
  const para = (k) => (secs[k] || []).join(' ').replace(/\s+/g, ' ').trim();
  return {
    titre: meta.titre, miel: meta.miel, preparation: meta.preparation, cuisson: meta.cuisson,
    repos: meta.repos, portions: meta.portions, difficulte: meta.difficulte,
    intro: para('_intro'), groups, steps, conseil: para('Le conseil'),
  };
}

// Les trois cocktails, écrits pour le livret.
const COCKTAILS = {
  'bees-knees': {
    titre: 'Bee’s Knees, gin, citron et miel',
    miel: 'Miel d’acacia ou de fleurs', preparation: '5 min', portions: '1 verre', difficulte: 'Facile',
    intro: 'Né dans les bars américains des années 1920, son nom veut dire « le top du top ». Trois ingrédients, un équilibre parfait : la fraîcheur du citron, la douceur florale du miel et le caractère du gin.',
    groups: [
      { name: 'Le sirop de miel', items: ['2 c. à soupe de miel d’acacia', '2 c. à soupe d’eau chaude'] },
      { name: 'Le cocktail', items: ['5 cl de gin', '2 cl de jus de citron frais', '2 cl de sirop de miel', 'Glaçons', '1 zeste de citron'] },
    ],
    steps: [
      'Préparez le sirop : mélangez le miel et l’eau chaude jusqu’à ce qu’il soit bien fondu. Laissez refroidir.',
      'Placez une coupe à cocktail au congélateur 10 minutes.',
      'Versez le gin, le jus de citron et le sirop de miel dans un shaker rempli de glaçons.',
      'Frappez vigoureusement 15 secondes, jusqu’à ce que le shaker soit glacé.',
      'Filtrez dans la coupe bien froide et exprimez le zeste de citron au-dessus du verre.',
    ],
    conseil: 'Le sirop se garde une semaine au réfrigérateur. Version sans alcool : remplacez le gin par 5 cl d’infusion de romarin refroidie et allongez d’eau pétillante.',
  },
  'gold-rush': {
    titre: 'Gold Rush, bourbon, citron et miel',
    miel: 'Miel de châtaignier ou de sapin', preparation: '5 min', portions: '1 verre', difficulte: 'Facile',
    intro: 'Un classique contemporain, cousin du whisky sour, imaginé à New York au début des années 2000. Le bourbon vanillé et un miel de caractère s’y répondent dans une robe couleur d’or.',
    groups: [
      { name: 'Le sirop de miel', items: ['2 c. à soupe de miel de châtaignier', '2 c. à soupe d’eau chaude'] },
      { name: 'Le cocktail', items: ['5 cl de bourbon', '2,5 cl de jus de citron frais', '2 cl de sirop de miel', 'Glaçons et 1 gros glaçon', '1 fine tranche de citron'] },
    ],
    steps: [
      'Préparez le sirop en délayant le miel dans l’eau chaude, puis laissez refroidir.',
      'Versez le bourbon, le jus de citron et le sirop dans un shaker rempli de glaçons.',
      'Frappez énergiquement 15 secondes.',
      'Placez un gros glaçon dans un verre bas (old fashioned).',
      'Filtrez le cocktail sur le glaçon et décorez d’une fine tranche de citron.',
    ],
    conseil: 'Le châtaignier, puissant et légèrement amer, donne un Gold Rush profond ; un miel de fleurs le rend plus rond. Goûtez le sirop et ajustez le citron selon votre miel.',
  },
  'canchanchara': {
    titre: 'Canchánchara, rhum, citron vert et miel',
    miel: 'Miel de fleurs ou d’oranger', preparation: '5 min', portions: '1 verre', difficulte: 'Facile',
    intro: 'Ancêtre cubain du daïquiri, servi depuis le XIXe siècle à Trinidad dans de petits gobelets de terre cuite. Rhum, citron vert et miel : la simplicité des grands classiques.',
    groups: [
      { name: 'Le cocktail', items: ['5 cl de rhum blanc', '2,5 cl de jus de citron vert', '2 c. à café de miel de fleurs', '1 c. à soupe d’eau', 'Glace pilée', '1 rondelle de citron vert'] },
    ],
    steps: [
      'Dans le verre, délayez le miel avec l’eau et le jus de citron vert jusqu’à ce qu’il soit complètement dissous.',
      'Ajoutez le rhum et remuez.',
      'Remplissez le verre de glace pilée.',
      'Remuez longuement avec une cuillère de bar pour bien rafraîchir.',
      'Décorez d’une rondelle de citron vert et servez aussitôt.',
    ],
    conseil: 'Servez-le dans un gobelet en terre cuite ou un verre épais pour le garder froid longtemps. Version sans alcool : remplacez le rhum par de l’eau gazeuse et quelques feuilles de menthe.',
  },
};

const recipes = cfg.chapitres.map((ch) => ({
  ...ch,
  recettes: ch.recettes.map((r) => ({ ...r, ...(COCKTAILS[r.slug] || parseRecipe(r.slug)) })),
}));

// Photos : livret/photos/<nom>.jpg, sinon image de repli du site.
const photo = (name) => {
  const p = path.join(OUT, 'photos', name + '.jpg');
  if (fs.existsSync(p)) return 'photos/' + name + '.jpg';
  return '../static/img/' + (cfg.repli[name] || 'chef-dressage') + '-2000.jpg';
};

const DROP = 'M13 1C10.6 5.8 1.5 14.6 1.5 24a11.5 11.5 0 0 0 23 0C24.5 14.6 15.4 5.8 13 1z';
const medal = (id, color) => `<svg class="medal" viewBox="0 0 280 280" style="color:${color}" aria-label="Cuisine au miel"><circle cx="140" cy="140" r="130" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="140" cy="140" r="119" fill="none" stroke="currentColor" stroke-width="1"/><g transform="translate(115.5 36) scale(1.9)"><clipPath id="${id}"><path d="${DROP}"/></clipPath><g clip-path="url(#${id})"><path d="M-20 17q2.5-2.2 5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0 V40H-20z" fill="#F8C766"/><path d="M-20 18.5q2.5-2.6 5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0 V40H-20z" fill="#F2A516"/></g><path d="${DROP}" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.2 26.5a6.4 6.4 0 0 1 .6-6.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g><text x="140" y="150" text-anchor="middle" class="m-k">CUISINE</text><text x="140" y="197" text-anchor="middle" class="m-n">au miel</text><path d="M104 216h72" stroke="currentColor" stroke-width="1"/><circle cx="140" cy="216" r="2.5" fill="currentColor"/></svg>`;
const drop = (c = '#F2A516') => `<svg class="drop" viewBox="0 0 26 36"><path d="${DROP}" fill="${c}"/></svg>`;
const hex = `<svg class="hexes" viewBox="0 0 120 104"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M30 2l26 15v30L30 62 4 47V17z"/><path d="M60 52l26 15v30L60 112 34 97V67z"/><path d="M90 2l26 15v30L90 62 64 47V17z"/></g></svg>`;

let pageNo = 0;
const pages = [];
const page = (cls, inner, { folio = true } = {}) => {
  pageNo++;
  const side = pageNo % 2 === 0 ? 'left' : 'right';
  pages.push(`<section class="page ${side} ${cls}">${inner}${folio ? `<div class="folio">${pageNo}<span>cuisineaumiel.fr</span></div>` : ''}</section>`);
  return pageNo;
};

// 1. Couverture
page('cover', `
  <div class="bleed-img" style="background-image:url('${photo('couverture')}')"></div>
  <div class="cover-shade"></div>
  <div class="cover-in">
    <div class="cover-logo">${medal('cv-drop', '#FFF8EC')}</div>
    <div class="cover-title">
      <p class="kicker">12 recettes signature</p>
      <h1>Le miel<br><em>à table</em></h1>
      <p class="cover-sub">Cocktails · Entrées · Plats · Desserts</p>
    </div>
    <p class="cover-url">cuisineaumiel.fr</p>
  </div>`, { folio: false });

// 2. Introduction
const toc = [];
let n = 4;
for (const ch of recipes) for (const r of ch.recettes) { toc.push({ ch: ch.titre, titre: r.titre, page: n + 1 }); n += 2; }
page('intro', `
  <div class="in">
    <p class="kicker">Avant-propos</p>
    <h2 class="big">Le miel, de l’apéritif<br><em>au dessert</em></h2>
    <div class="rule">${drop()}</div>
    ${cfg.intro.map((p, i) => `<p class="lede-p${i ? '' : ' first'}">${typo(p)}</p>`).join('')}
    <p class="sign">${typo(cfg.signature)}</p>
    <div class="intro-cta">
      <img class="qr" src="${cfg.qrSite}" alt="">
      <div><b>Plus de 50 recettes vous attendent</b><span>Recettes, guide des miels, atlas des miels du monde et outils pratiques sur <i>cuisineaumiel.fr</i></span></div>
    </div>
  </div>`);

// 3. Sommaire + secrets
const tocHtml = recipes.map((ch) => `<div class="toc-ch"><h3>${typo(ch.titre)}</h3><ol>${ch.recettes.map((r) => {
  const t = toc.find((x) => x.titre === r.titre);
  return `<li><span>${typo(r.court || r.titre)}</span><i></i><b>${t.page}</b></li>`;
}).join('')}</ol></div>`).join('');
page('toc', `
  <div class="in">
    <p class="kicker">Sommaire</p>
    <div class="toc-grid">${tocHtml}</div>
    <div class="secrets">
      <h3>Trois secrets pour cuisiner le miel</h3>
      ${cfg.secrets.map((s, i) => `<div class="secret"><span class="num">${i + 1}</span><p><b>${typo(s[0])}</b> ${typo(s[1])}</p></div>`).join('')}
    </div>
  </div>`);

// Recettes : photo à gauche, recette à droite.
let idx = 0;
for (const ch of recipes) {
  ch.recettes.forEach((r, i) => {
    idx++;
    page('photo', `
      <div class="bleed-img" style="background-image:url('${photo(r.photo)}');background-position:${r.pos || 'center'}"></div>
      <div class="photo-shade"></div>
      <div class="photo-tag"><span>${typo(ch.titre)}</span><b>${String(i + 1).padStart(2, '0')}</b></div>`, { folio: false });
    const meta = [
      ['Préparation', r.preparation], ['Cuisson', r.cuisson], ['Repos', r.repos], ['Pour', r.portions && (/\D/.test(r.portions) ? r.portions : r.portions + ' pers.')],
    ].filter((m) => m[1]);
    const ingr = '<div class="grp">' + r.groups.map((g) => `<div class="g">${g.name ? `<h5>${typo(g.name)}</h5>` : ''}<ul>${g.items.map((it) => `<li>${typo(it)}</li>`).join('')}</ul></div>`).join('') + '</div>';
    page('recipe' + (r.dense ? ' dense' : '') + (ch.alcool ? ' cocktail' : ''), `
      <div class="in">
        <p class="kicker">${typo(ch.titre)} · ${String(i + 1).padStart(2, '0')}</p>
        <h2>${typo(r.titre)}</h2>
        <p class="r-intro">${typo(r.intro)}</p>
        <ul class="meta">${meta.map((m) => `<li><span>${m[0]}</span><b>${typo(m[1])}</b></li>`).join('')}<li class="miel"><span>Le miel</span><b>${typo(r.miel)}</b></li></ul>
        <div class="cols">
          <div class="ingr"><h4>Ingrédients</h4>${ingr}</div>
          <div class="steps"><h4>Préparation</h4><ol>${r.steps.map((s) => `<li>${typo(s)}</li>`).join('')}</ol></div>
        </div>
        ${r.conseil ? `<div class="tip">${drop()}<p><b>Le conseil</b> ${typo(r.conseil)}</p></div>` : ''}
        ${ch.alcool ? `<p class="evin">L’abus d’alcool est dangereux pour la santé, à consommer avec modération.</p>` : ''}
      </div>`);
  });
}

// 4e de couverture : L'Île aux Abeilles
const b = cfg.ile;
page('back', `
  <div class="bleed-img" style="background-image:url('${photo('dos')}')"></div>
  <div class="back-shade"></div>
  <div class="back-in">
    ${b.logo ? `<img class="back-logo" src="${b.logo}" alt="">` : `<div class="back-mark">${hex}</div>`}
    <p class="kicker">${typo(b.surtitre)}</p>
    <h2>${typo(b.nom)}</h2>
    <p class="back-claim">${typo(b.accroche)}</p>
    <div class="rule light">${drop('#F8C766')}</div>
    ${b.texte.map((p) => `<p class="back-p">${typo(p)}</p>`).join('')}
    <ul class="back-pts">${b.points.map((p) => `<li>${drop('#F8C766')}<span>${typo(p)}</span></li>`).join('')}</ul>
    <div class="back-cta">
      ${b.qr ? `<img class="qr" src="${b.qr}" alt="">` : ''}
      <div><b>${typo(b.cta)}</b><span>${typo(b.contact)}</span></div>
    </div>
  </div>
  <div class="back-foot">${medal('bk-drop', '#FFF8EC')}<span>Livret offert par ${typo(b.nom)} · Recettes de <i>cuisineaumiel.fr</i><br>Le miel ne convient pas aux enfants de moins d’un an.</span></div>`, { folio: false });

if (pageNo % 4) console.warn(`Attention : ${pageNo} pages, pas un multiple de 4.`);

const font = (fam, file, w, st = 'normal') => `@font-face{font-family:'${fam}';src:url('fonts/${file}.woff2') format('woff2');font-weight:${w};font-style:${st}}`;
const fonts = [
  ...[400, 600, 700].flatMap((w) => [font('Playfair', `playfair-display-latin-${w}-normal`, w), font('Playfair', `playfair-display-latin-${w}-italic`, w, 'italic')]),
  ...[300, 400, 500, 600, 700].map((w) => font('Mont', `montserrat-latin-${w}-normal`, w)),
].join('\n');

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Le miel à table · cuisineaumiel.fr</title>
<style>${fonts}\n${fs.readFileSync(path.join(OUT, 'livret.css'), 'utf8')}</style></head>
<body>${pages.join('\n')}</body></html>`;
fs.writeFileSync(path.join(OUT, 'livret.html'), html);
console.log(`livret.html : ${pageNo} pages`);
