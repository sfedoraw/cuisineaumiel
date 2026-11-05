#!/usr/bin/env node
// Générateur statique de cuisineaumiel.fr — sans dépendance.
// Une recette = un fichier Markdown dans recettes/. Les recettes datées dans
// le futur ne sont publiées qu'à partir de leur date.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SITE = {
  name: 'Cuisine au miel',
  url: 'https://cuisineaumiel.fr',
  tagline: 'Recettes sucrées et salées autour du miel',
  description:
    "Des recettes originales, sucrées et salées, pour cuisiner le miel au quotidien : entrées, plats, desserts, pâtisseries, boissons et conseils sur les variétés de miel.",
};

const CATEGORIES = [
  { slug: 'aperitifs-entrees', name: 'Apéritifs & entrées', emoji: '🧀', intro: "De quoi ouvrir le repas avec une touche dorée : fromages rôtis, légumes laqués, bouchées sucrées-salées." },
  { slug: 'plats', name: 'Plats', emoji: '🍗', intro: "Le miel laque, caramélise et équilibre les épices. Viandes, poissons et plats végétariens." },
  { slug: 'desserts', name: 'Desserts', emoji: '🍮', intro: "Crèmes, fruits pochés, glaces et tartes : le miel dans ce qu'il a de plus gourmand." },
  { slug: 'patisserie', name: 'Pâtisserie & boulangerie', emoji: '🥐', intro: "Pain d'épices, madeleines, financiers, brioches : le miel garde les pâtes moelleuses." },
  { slug: 'petit-dejeuner', name: 'Petit-déjeuner', emoji: '🥞', intro: "Pour bien commencer la journée : granolas, pancakes, tartines et bols." },
  { slug: 'boissons', name: 'Boissons', emoji: '🍋', intro: "Boissons chaudes réconfortantes et rafraîchissements d'été, sucrés au miel." },
  { slug: 'sauces-condiments', name: 'Sauces & condiments', emoji: '🫙', intro: "Vinaigrettes, chutneys et glaçages à garder sous la main." },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));

// ---------- utilitaires ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const write = (rel, content) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (d) => `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const minutes = (s) => { const m = String(s || '').match(/(?:(\d+)\s*h)?\s*(\d+)?/); return m ? (+(m[1] || 0)) * 60 + (+(m[2] || 0)) : 0; };
const isoDuration = (s) => `PT${minutes(s)}M`;

function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('front matter manquant');
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

// Markdown minimal : titres, listes, paragraphes, gras, italique, liens.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
function markdown(src) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { flushPara(); flushList(); const n = m[1].length; out.push(`<h${n} id="${slugify(m[2])}">${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/)) || (m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      const tag = /^\d/.test(line) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('\n');
}

// Découpe le corps d'une recette en sections « ## Titre ».
function sections(body) {
  const res = {};
  let cur = '_intro';
  res[cur] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) { cur = slugify(m[1]); res[cur] = []; res[cur].title = m[1]; continue; }
    res[cur].push(line);
  }
  return res;
}
const listItems = (lines = []) => lines.map((l) => l.trim()).filter((l) => /^([-*]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-*]|\d+[.)])\s+/, ''));

// ---------- chargement des recettes ----------
const today = new Date(process.env.BUILD_DATE || new Date().toISOString().slice(0, 10));
const recipes = fs.readdirSync(path.join(ROOT, 'recettes'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(ROOT, 'recettes', f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    if (!CAT[data.categorie]) throw new Error(`${f} : catégorie inconnue « ${data.categorie} »`);
    const s = sections(body);
    const ingredients = s['ingredients'] || [];
    return {
      ...data,
      slug,
      url: `/recettes/${slug}/`,
      date: new Date(data.date),
      cat: CAT[data.categorie],
      portions: parseInt(data.portions, 10) || 4,
      intro: markdown((s._intro || []).join('\n')),
      ingredientsHtml: ingredientGroups(ingredients),
      ingredientsList: listItems(ingredients.filter((l) => !/^###/.test(l.trim()))),
      steps: listItems(s['preparation']),
      conseil: s['le-conseil'] ? markdown(s['le-conseil'].join('\n')) : '',
      variantes: s['variantes'] ? markdown(s['variantes'].join('\n')) : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  })
  .filter((r) => r.date <= today)
  .sort((a, b) => b.date - a.date || a.titre.localeCompare(b.titre, 'fr'));

function ingredientGroups(lines) {
  const html = [];
  let open = false;
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^###\s+(.*)$/))) { if (open) html.push('</ul>'); html.push(`<h3>${inline(m[1])}</h3>`); html.push('<ul class="ingredients">'); open = true; continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!open) { html.push('<ul class="ingredients">'); open = true; }
      html.push(`<li><label><input type="checkbox"><span data-qty>${inline(m[1])}</span></label></li>`);
    }
  }
  if (open) html.push('</ul>');
  return html.join('\n');
}

// ---------- photos ----------
// Photos Unsplash (licence Unsplash : usage libre, crédit apprécié), servies par leur CDN.
const img = (id, w) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
const srcset = (id, sizes = [480, 800, 1200]) => sizes.map((w) => `${img(id, w)} ${w}w`).join(', ');
const picture = (id, alt, { sizes = '100vw', ratio = '4 / 3', eager = false, cls = '' } = {}) =>
  `<img class="${cls}" src="${img(id, 800)}" srcset="${srcset(id)}" sizes="${sizes}" alt="${esc(alt)}" style="aspect-ratio:${ratio}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;

// Photos de miel, classées par couleur. Chaque recette reçoit celle qui correspond à son miel.
const HONEY = {
  clair: [
    ['1587049352851-8d4e89133924', 'Art Rachen', 'Un pot de miel clair'],
    ['1555211652-5c6222f971bc', 'Heather Barnes', 'Un pot de miel clair et sa cuillère en bois'],
    ['1622448559300-6df8495a1574', 'micheile henderson', 'Un pot de miel doré et sa cuillère'],
  ],
  ambre: [
    ['1771405317876-616a62efd97e', 'Madeline Liu', 'Le miel coule d’une cuillère en bois dans un bol'],
    ['1654515722385-c684c5331c04', 'With Mahdy', 'Du miel versé dans un bol en bois'],
    ['1641878067318-1d1f79a77785', 'Mahdi Kordi', 'Du miel versé sur une cuillère en bois'],
    ['1623018697148-8350cf18e64e', 'Jonas Hensel', 'Un rayon de miel doré'],
    ['1773957949187-c7e9b989bcbf', 'Giorgio Trovato', 'Un morceau de rayon de miel qui coule'],
    ['1718146921295-700b969e7c78', 'Micke Lindström', 'Le miel coule d’une cuillère sur un rayon'],
  ],
  fonce: [
    ['1605880980331-20a711b27338', 'Jonathan Pielmayer', 'Un pot de miel foncé'],
    ['1622448559300-6df8495a1574', 'micheile henderson', 'Un pot de miel ambré'],
    ['1545246909-b4e087f05214', 'Daily Slowdown', 'Une cuillère à miel en bois'],
  ],
};
const honeyFamily = (miel) => {
  const m = slugify(miel || '');
  if (/acacia|tilleul|romarin|colza/.test(m)) return 'clair';
  if (/chataignier|sapin|sarrasin|miellat|foret/.test(m)) return 'fonce';
  return 'ambre';
};
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
for (const r of recipes) {
  if (!r.photo) throw new Error(`${r.slug} : champ « photo » manquant`);
  const pool = HONEY[honeyFamily(r.miel)];
  const [id, credit, alt] = r.photo_miel ? [r.photo_miel, r.credit_miel || '', r.miel] : pool[hash(r.slug) % pool.length];
  r.honey = { id, credit, alt };
}

// ---------- gabarits ----------
// Version des fichiers CSS/JS : change à chaque modification, pour que les navigateurs ne gardent pas l'ancienne.
const ASSET_V = require('crypto').createHash('md5').update(['style.css', 'main.js'].map((f) => fs.readFileSync(path.join(__dirname, 'static', f))).join('')).digest('hex').slice(0, 8);
const logoSvg = `<svg viewBox="7 1 26 36" width="26" height="36" aria-hidden="true"><path d="M20 2C17.6 6.8 8.5 15.6 8.5 25a11.5 11.5 0 0 0 23 0C31.5 15.6 22.4 6.8 20 2z" fill="currentColor"/><path d="M14.2 27.5a6.4 6.4 0 0 1 .6-6.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const clockIcon = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const arrow = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d === 'prev' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
const dropIcon = (on) => `<svg viewBox="0 0 12 16" width="11" height="14" aria-hidden="true"><path d="M6 1C5 3 1 7 1 10.4a5 5 0 0 0 10 0C11 7 7 3 6 1z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"/></svg>`;
// Photos fournies par le propriétaire du site, servies depuis /img/.
const own = (name, alt, { ratio = '16 / 9', eager = false, cls = '', sizes = '100vw' } = {}) =>
  `<img class="${cls}" src="/img/${name}-1000.jpg" srcset="/img/${name}-1000.jpg 1000w, /img/${name}-2000.jpg 2000w" sizes="${sizes}" alt="${esc(alt)}" style="aspect-ratio:${ratio}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const shortCat = (c) => c.name.split(' &')[0];

function layout({ title, description, body, canonical, extraHead = '', ogImage = '', hero = '' }) {
  const fullTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || SITE.description)}">
<link rel="canonical" href="${SITE.url}${canonical}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(title || SITE.name)}">
<meta property="og:description" content="${esc(description || SITE.description)}">
<meta property="og:type" content="${ogImage ? 'article' : 'website'}">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${SITE.url}${canonical}">
${ogImage ? `<meta property="og:image" content="${ogImage}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${SITE.name}" href="/flux.xml">
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Playfair+Display:ital,wght@1,600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
${extraHead}
</head>
<body${hero ? ' class="has-hero"' : ''}>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="masthead">
  <nav class="nav nav-left" aria-label="Navigation principale">
    <a href="/recettes/">Recettes</a>
    <a href="/categories/plats/">Catégories</a>
  </nav>
  <a class="logo" href="/" aria-label="Cuisine au miel, accueil"><span class="logo-ring">${logoSvg}<span class="logo-text"><span>Cuisine</span><b>au miel</b></span></span></a>
  <nav class="nav nav-right" aria-label="Navigation secondaire">
    <a href="/recettes/#nouveautes">Nouveautés</a>
    <a href="/le-miel/">Le miel</a>
  </nav>
</header>
${hero}
<main id="contenu">
${body}
</main>
<footer class="footer">
  <div class="footer-box">
    <a class="logo logo-small" href="/">${logoSvg}<span class="logo-text"><span>Cuisine</span><b>au miel</b></span></a>
    <nav class="footer-links" aria-label="Pied de page">
      <a href="/recettes/">Recettes</a>
      <a href="/categories/plats/">Catégories</a>
      <a href="/le-miel/">Le miel</a>
      <a href="/a-propos/">À propos</a>
      <a href="/flux.xml">Flux RSS</a>
    </nav>
  </div>
  <p class="fine">© ${today.getUTCFullYear()} cuisineaumiel.fr · Photos : Unsplash et Depositphotos · Le miel ne convient pas aux enfants de moins d'un an.</p>
</footer>
<script src="/main.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function totalTime(r) {
  const t = minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60), m = t % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
const totalMin = (r) => minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos);
const shortHoney = (m) => (m || '').replace(/^Miel (de |d'|d’)?/i, '').replace(/^./, (c) => c.toUpperCase());
const searchData = (r) => esc([r.titre, r.miel, r.resume, r.cat.name, ...r.tags].join(' ').toLowerCase());
const LEVEL = { 'très facile': 1, facile: 1, moyenne: 2, difficile: 3 };
const level = (r) => {
  const n = LEVEL[(r.difficulte || '').toLowerCase()] || 2;
  return `<span class="level" title="Difficulté : ${esc(r.difficulte)}"><span class="sr">Difficulté : ${esc(r.difficulte)}</span>${[1, 2, 3].map((i) => dropIcon(i <= n)).join('')}</span>`;
};
const MEAT = /poulet|porc|boeuf|bœuf|veau|agneau|canard|jambon|lard|bacon|magret|saumon|thon|crevette|poisson|cabillaud|dorade|chorizo|saucisse|dinde|caille|lapin|anchois|gélatine|gelatine/i;
const isVeggie = (r) => !MEAT.test(r.ingredientsList.join(' ') + ' ' + r.titre);

// Carte recette en portrait : photo, catégorie, titre, difficulté et temps.
function card(r, { eager = false } = {}) {
  return `<article class="card" data-cat="${r.cat.slug}" data-search="${searchData(r)}">
  <a href="${r.url}">
    <div class="card-media">
      ${picture(r.photo, r.titre, { sizes: '(min-width: 1200px) 220px, (min-width: 700px) 30vw, 46vw', ratio: '3 / 4', eager })}
      <span class="card-honey">🍯 ${esc(shortHoney(r.miel))}</span>
    </div>
    <span class="card-cat">${esc(shortCat(r.cat))}</span>
    <h3>${esc(r.titre)}</h3>
    <div class="card-meta">${level(r)}<span class="time">${clockIcon} ${totalTime(r)}</span></div>
  </a>
</article>`;
}
const grid = (list, id = '') => `<div class="cards"${id ? ` id="${id}"` : ''}>${list.map((r) => card(r)).join('\n')}</div>`;
const sectionTitle = (title, sub) => `<header class="section-title"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</header>`;
const carousel = (inner, label) => `<div class="carousel" aria-label="${esc(label)}">
  <button type="button" class="car-btn car-prev" aria-label="Précédent">${arrow('prev')}</button>
  <div class="car-track">${inner}</div>
  <button type="button" class="car-btn car-next" aria-label="Suivant">${arrow('next')}</button>
</div>`;
function catTabs(active = '') {
  return `<nav class="cat-tabs" aria-label="Catégories">${CATEGORIES.map((c) => `<a href="/categories/${c.slug}/"${c.slug === active ? ' class="is-on" aria-current="page"' : ''}>${shortCat(c)}</a>`).join('')}</nav>`;
}

function heroBanner() {
  return `<section class="hero">
  ${own('chef-dressage', '', { eager: true, cls: 'hero-bg', ratio: 'auto' })}
  <div class="hero-inner">
    <h1>Trouvez la recette au miel qui va régaler vos papilles !</h1>
    <form class="hero-search" action="/recettes/" role="search">
      <label class="sr" for="hq">Rechercher une recette</label>
      <input id="hq" name="q" type="search" placeholder="Poulet, lavande, madeleines…">
      <button type="submit" aria-label="Rechercher">${searchIcon}</button>
    </form>
  </div>
</section>`;
}

// Miels les plus utilisés, pour le carrousel « Les miels ».
function honeyCards() {
  const count = {};
  for (const r of recipes) { const k = shortHoney(r.miel); (count[k] ||= []).push(r); }
  const used = new Set();
  return Object.entries(count).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([name, list]) => {
    const fam = HONEY[honeyFamily(list[0].miel)];
    const all = [...fam, ...HONEY.ambre, ...HONEY.clair, ...HONEY.fonce];
    const [id, , alt] = all.find((h) => !used.has(h[0])) || fam[0];
    used.add(id);
    return `<article class="honey-card"><a href="/recettes/?q=${encodeURIComponent(name.toLowerCase())}">
    <div class="card-media">${picture(id, alt, { sizes: '(min-width: 1200px) 280px, 60vw', ratio: '4 / 3' })}</div>
    <span class="card-cat">Miel</span><h3>${esc(name)}</h3>
    <div class="card-meta"><span>${list.length} recette${list.length > 1 ? 's' : ''}</span></div></a></article>`;
  }).join('\n');
}

function home() {
  const byCat = CATEGORIES.map((c) => ({ c, list: recipes.filter((r) => r.cat === c).slice(0, 10) })).filter((x) => x.list.length);
  const first = byCat.find((x) => x.c.slug === 'plats') || byCat[0];
  const FILTERS = [
    ['nouveautes', 'Nouveautés', recipes],
    ['rapide', 'Rapide', recipes.filter((r) => totalMin(r) <= 30)],
    ['vegetarien', 'Végétarien', recipes.filter(isVeggie)],
    ['facile', 'Facile', recipes.filter((r) => /facile/i.test(r.difficulte))],
    ['sucre', 'Sucré', recipes.filter((r) => ['desserts', 'patisserie', 'petit-dejeuner', 'boissons'].includes(r.cat.slug))],
  ];
  const body = `
<section class="block">
  <div class="tabs" role="tablist" aria-label="Recettes par catégorie">
    ${byCat.map(({ c }) => `<button type="button" role="tab" class="tab${c === first.c ? ' is-on' : ''}" aria-selected="${c === first.c}" data-panel="cat-${c.slug}">${shortCat(c)}</button>`).join('')}
  </div>
  ${byCat.map(({ c, list }) => `<div class="panel" id="cat-${c.slug}"${c === first.c ? '' : ' hidden'}>${carousel(list.map((r) => card(r)).join('\n'), c.name)}</div>`).join('\n')}
</section>

<section class="wrap block">
  ${sectionTitle('Recettes', 'Sucré, salé, et toujours au miel')}
  <div class="pills" role="tablist" aria-label="Filtrer les recettes">
    ${FILTERS.map(([id, label], i) => `<button type="button" role="tab" class="pill${i ? '' : ' is-on'}" aria-selected="${!i}" data-panel="f-${id}">${label}</button>`).join('')}
  </div>
  ${FILTERS.map(([id, , list], i) => `<div class="panel" id="f-${id}"${i ? ' hidden' : ''}>${grid(list.slice(0, 12))}</div>`).join('\n')}
  <div class="more"><a class="btn-outline" href="/recettes/">Voir plus de recettes</a></div>
</section>

<section class="block">
  <div class="wrap">${sectionTitle('Les miels', 'Un miel pour chaque recette')}</div>
  ${carousel(honeyCards(), 'Les miels')}
  <div class="wrap more"><a class="btn-outline" href="/le-miel/">Lire le guide des miels</a></div>
</section>

<section class="wrap block">
  <div class="story">
    ${own('vieux-livre', 'Un vieux livre de recettes ouvert, une cuillère en bois et de la farine', { ratio: '4 / 3', sizes: '(min-width: 900px) 560px, 100vw' })}
    <div class="story-text">
      <p class="kicker">Une recette chaque jour</p>
      <h2>Le miel, de l'entrée au dessert</h2>
      <p>${recipes.length} recettes originales et testées à la maison pour remplacer le sucre, laquer une viande ou parfumer une pâtisserie. Chaque fiche vous indique le miel le plus adapté et pourquoi.</p>
      <a class="btn" href="/a-propos/">Découvrir le site</a>
    </div>
  </div>
</section>`;
  return layout({ title: '', canonical: '/', body, hero: heroBanner() });
}

function pageHead(title, lede, photo, crumbs = '') {
  return `<section class="page-banner">
  ${own(photo, '', { cls: 'banner-bg', ratio: 'auto', eager: true })}
  <div class="banner-inner">${crumbs}<h1>${title}</h1>${lede ? `<p>${lede}</p>` : ''}</div>
</section>`;
}
const BANNER = { 'aperitifs-entrees': 'salade-maison', plats: 'pappardelle-bandeau', desserts: 'decoupe-cuisine', patisserie: 'vieux-livre', 'petit-dejeuner': 'salade-printemps', boissons: 'chef-sel', 'sauces-condiments': 'decoupe-legumes' };

function categoryPage(c) {
  const list = recipes.filter((r) => r.cat === c);
  const body = `
${pageHead(c.name, c.intro, BANNER[c.slug] || 'chef-sel', `<nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Accueil</a> › <a href="/recettes/">Recettes</a></nav>`)}
<section class="wrap block-tight">${catTabs(c.slug)}${grid(list)}</section>`;
  return layout({ title: c.name, description: `Recettes au miel : ${c.name.toLowerCase()}. ${c.intro}`, canonical: `/categories/${c.slug}/`, body });
}

function recipePage(r, i) {
  const same = recipes.filter((x) => x !== r && x.cat === r.cat);
  const others = recipes.filter((x) => x !== r && x.cat !== r.cat);
  const k = i % Math.max(1, same.length - 1), j = i % Math.max(1, others.length - 2);
  const related = [...same.slice(k, k + 3), ...others.slice(j, j + 3)].slice(0, 6);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Recipe', name: r.titre, description: r.resume,
    image: [img(r.photo, 1200)],
    datePublished: r.date.toISOString().slice(0, 10), author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    prepTime: isoDuration(r.preparation), cookTime: isoDuration(r.cuisson), totalTime: `PT${minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos)}M`,
    recipeYield: `${r.portions} ${r.unite || 'personnes'}`, recipeCategory: r.cat.name, recipeCuisine: 'Française',
    keywords: ['miel', r.miel, ...r.tags].join(', '), recipeIngredient: r.ingredientsList,
    recipeInstructions: r.steps.map((s) => ({ '@type': 'HowToStep', text: s.replace(/\*\*/g, '').replace(/\[(.+?)\]\(.+?\)/g, '$1') })),
  };
  const body = `
<article class="wrap recipe">
  <nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Accueil</a> › <a href="/categories/${r.cat.slug}/">${esc(r.cat.name)}</a></nav>
  <header class="recipe-head">
    <h1>${esc(r.titre)}</h1>
    <p class="lede">${esc(r.resume)}</p>
    <p class="recipe-date">Publiée le <time datetime="${r.date.toISOString().slice(0, 10)}">${dateFr(r.date)}</time></p>
  </header>
  <div class="duo">
    <figure class="duo-dish">
      ${picture(r.photo, r.titre, { sizes: '(min-width: 1000px) 720px, 64vw', ratio: '4 / 3', eager: true })}
      <span class="badge badge-time">⏱ ${totalTime(r)}</span>
    </figure>
    <figure class="duo-honey">
      ${picture(r.honey.id, r.honey.alt, { sizes: '(min-width: 1000px) 360px, 36vw', ratio: '3 / 4', eager: true })}
      <figcaption><span>Le miel conseillé</span>${esc(shortHoney(r.miel))}</figcaption>
    </figure>
  </div>
  <ul class="pills">
    <li><span>Préparation</span><b>${esc(r.preparation)}</b></li>
    ${r.cuisson && r.cuisson !== '0 min' ? `<li><span>Cuisson</span><b>${esc(r.cuisson)}</b></li>` : ''}
    ${r.repos ? `<li><span>Repos</span><b>${esc(r.repos)}</b></li>` : ''}
    <li><span>Difficulté</span><b>${esc(r.difficulte)}</b></li>
    <li><span>Pour</span><b>${r.portions} ${esc(r.unite || 'pers.')}</b></li>
  </ul>
  <div class="recipe-grid">
    <aside class="ingredients-box" data-base="${r.portions}">
      <div class="box-head">
        <h2>Ingrédients</h2>
        <div class="servings" role="group" aria-label="Nombre de ${esc(r.unite || 'personnes')}">
          <button type="button" data-step="-1" aria-label="Moins">−</button>
          <output>${r.portions}</output>
          <button type="button" data-step="1" aria-label="Plus">+</button>
        </div>
      </div>
      ${r.ingredientsHtml}
      <button type="button" class="print-btn" onclick="window.print()">Imprimer la recette</button>
    </aside>
    <div class="recipe-main">
      ${r.intro ? `<div class="intro">${r.intro}</div>` : ''}
      <h2>Préparation</h2>
      <ol class="steps">${r.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>
      ${r.conseil ? `<div class="tip"><h2>🐝 Le conseil</h2>${r.conseil}</div>` : ''}
      ${r.variantes ? `<div class="variants"><h2>Variantes</h2>${r.variantes}</div>` : ''}
      <p class="credits">Photos : ${esc(r.credit)}${r.honey.credit ? ` et ${esc(r.honey.credit)}` : ''} sur <a href="https://unsplash.com/fr" rel="nofollow">Unsplash</a>.</p>
    </div>
  </div>
</article>
<section class="wrap block related">
  ${sectionTitle('À cuisiner aussi', `D'autres idées de ${r.cat.name.toLowerCase()}`)}
  ${grid(related)}
</section>`;
  return layout({
    title: r.titre, description: r.resume, canonical: r.url, body, ogImage: img(r.photo, 1200),
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  });
}

function archive() {
  const body = `
${pageHead('Toutes les recettes', `${recipes.length} recettes au miel, de l'apéritif au goûter.`, 'salade-maison')}
<section class="wrap block-tight" id="nouveautes">
  <div class="filters">
    <div class="filter-search">${searchIcon}<label class="sr" for="filtre-q">Rechercher</label><input id="filtre-q" type="search" placeholder="Rechercher une recette, un miel, un ingrédient…" autocomplete="off"></div>
    <div class="pills" role="group" aria-label="Filtrer par catégorie">
      <button type="button" class="pill chip is-on" data-filter="">Toutes</button>
      ${CATEGORIES.map((c) => `<button type="button" class="pill chip" data-filter="${c.slug}">${shortCat(c)}</button>`).join('\n      ')}
    </div>
  </div>
  <p class="empty" hidden>Aucune recette ne correspond. Essayez un autre mot.</p>
  ${grid(recipes, 'all')}
</section>`;
  return layout({ title: 'Toutes les recettes', description: `Les ${recipes.length} recettes au miel de cuisineaumiel.fr.`, canonical: '/recettes/', body });
}

function staticPage(file) {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8'));
  const slug = file.replace(/\.md$/, '');
  const cover = data.photo ? `<figure class="cover">${picture(data.photo, data.titre, { sizes: '(min-width: 800px) 760px, 100vw', ratio: '16 / 9', eager: true })}</figure>` : '';
  const html = `
<article class="wrap-narrow prose-page">
  <header class="page-head"><h1>${esc(data.titre)}</h1>${data.resume ? `<p class="lede">${esc(data.resume)}</p>` : ''}</header>
  ${cover}
  <div class="prose">${markdown(body)}</div>
</article>`;
  return { slug, html: layout({ title: data.titre, description: data.resume, canonical: `/${slug}/`, body: html }) };
}

function rss() {
  const items = recipes.slice(0, 30).map((r) => `<item><title>${esc(r.titre)}</title><link>${SITE.url}${r.url}</link><guid>${SITE.url}${r.url}</guid><pubDate>${r.date.toUTCString()}</pubDate><description>${esc(r.resume)}</description><category>${esc(r.cat.name)}</category><enclosure url="${esc(img(r.photo, 800))}" type="image/jpeg" length="0"/></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${SITE.name}</title><link>${SITE.url}/</link><description>${esc(SITE.description)}</description><language>fr-FR</language>
${items}
</channel></rss>`;
}

const sitemap = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${SITE.url}${u}</loc></url>`).join('\n')}
</urlset>`;

// ---------- construction ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });

const urls = ['/', '/recettes/'];
write('index.html', home());
write('recettes/index.html', archive());
recipes.forEach((r, i) => { write(`recettes/${r.slug}/index.html`, recipePage(r, i)); urls.push(r.url); });
for (const c of CATEGORIES) { write(`categories/${c.slug}/index.html`, categoryPage(c)); urls.push(`/categories/${c.slug}/`); }
for (const f of fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.md'))) {
  const p = staticPage(f);
  write(`${p.slug}/index.html`, p.html);
  urls.push(`/${p.slug}/`);
}
write('404.html', layout({ title: 'Page introuvable', canonical: '/404.html', body: `<section class="wrap page-head"><h1>Oups, cette page a fondu.</h1><p class="lede">Elle n'existe pas ou plus. <a href="/recettes/">Voir toutes les recettes</a>.</p></section>` }));
write('flux.xml', rss());
write('sitemap.xml', sitemap(urls));
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

console.log(`✓ ${recipes.length} recettes publiées, ${urls.length} pages générées dans _site/`);
