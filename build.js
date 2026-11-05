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
    if (/^\|.*\|$/.test(line)) {
      flushPara(); flushList();
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      const prev = out[out.length - 1];
      if (prev && prev.startsWith('<table>')) out[out.length - 1] = prev.replace('</tbody></table>', `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr></tbody></table>`);
      else out.push(`<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody></tbody></table>`);
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
    <a href="/miels/">Les miels</a>
    <a href="/magazine/">Magazine</a>
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
      <a href="/miels/">Le guide des miels</a>
      ${HAS_ATLAS ? `<a href="/miels/atlas/">L'atlas des miels</a>` : ''}
      <a href="/magazine/">Magazine</a>
      <a href="/guide/trouver-un-apiculteur/">Trouver un apiculteur</a>
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
    const fiche = honeyOf(list[0]);
    return `<article class="honey-card"><a href="${fiche ? fiche.url : `/recettes/?q=${encodeURIComponent(name.toLowerCase())}`}">
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
  <div class="wrap more"><a class="btn-outline" href="/miels/">Lire le guide des miels</a></div>
</section>

${posts.length ? `<section class="wrap block">${sectionTitle('Le magazine du miel', 'Actualités et dossiers, toujours sourcés')}<div class="posts">${posts.slice(0, 3).map(postCard).join('')}</div><div class="more"><a class="btn-outline" href="/magazine/">Tous les articles</a></div></section>` : ''}

<section class="wrap block">
  <div class="story">
    ${own('vieux-livre', 'Un vieux livre de recettes ouvert, une cuillère en bois et de la farine', { ratio: '4 / 3', sizes: '(min-width: 900px) 560px, 100vw' })}
    <div class="story-text">
      <p class="kicker">Une recette chaque jour</p>
      <h2>Le miel, de l'entrée au dessert</h2>
      <p>${recipes.length} recettes originales pour remplacer le sucre, laquer une viande ou parfumer une pâtisserie. Chaque fiche vous indique le miel le plus adapté et pourquoi.</p>
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
      <figcaption><span>Le miel conseillé</span>${honeyOf(r) ? `<a href="${honeyOf(r).url}">${esc(shortHoney(r.miel))}</a>` : esc(shortHoney(r.miel))}</figcaption>
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


// ---------- guide des miels, pages piliers et magazine ----------
// miels/*.md : une fiche par miel. guide/*.md : pages de fond. magazine/*.md : articles datés.
const HAS_ATLAS = fs.existsSync(path.join(ROOT, 'atlas'));
const readCollection = (dir) => {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => {
    const { data, body } = parseFrontMatter(fs.readFileSync(path.join(d, f), 'utf8'));
    return { ...data, slug: f.replace(/\.md$/, ''), body };
  });
};
// Sépare le corps en : texte principal, FAQ (### question + réponse) et sources.
function splitLong(body) {
  const parts = { main: [], faq: [], sources: [] };
  let cur = 'main';
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const k = slugify(h[1]);
      if (k === 'questions-frequentes') { cur = 'faq'; continue; }
      if (k === 'sources') { cur = 'sources'; continue; }
      cur = 'main';
    }
    parts[cur].push(line);
  }
  const faq = [];
  for (const line of parts.faq) {
    const q = line.match(/^###\s+(.*)$/);
    if (q) faq.push({ q: q[1], a: [] });
    else if (faq.length) faq[faq.length - 1].a.push(line);
  }
  return { main: parts.main.join('\n'), faq: faq.map((x) => ({ q: x.q, a: x.a.join('\n').trim() })), sources: listItems(parts.sources) };
}
const plain = (s) => String(s).replace(/\*\*?|__/g, '').replace(/\[(.+?)\]\((.+?)\)/g, '$1');
const wordCount = (s) => plain(s).split(/\s+/).filter((w) => /[a-zà-ÿ0-9]/i.test(w)).length;
const readTime = (n) => Math.max(1, Math.round(n / 220));

const honeys = readCollection('miels').map((h) => ({ ...h, url: `/miels/${h.slug}/`, kind: 'miel' }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
const pillars = readCollection('guide').map((g) => ({ ...g, url: `/guide/${g.slug}/`, kind: 'guide' }))
  .sort((a, b) => (+a.ordre || 99) - (+b.ordre || 99));
const posts = readCollection('magazine').map((a) => ({ ...a, url: `/magazine/${a.slug}/`, kind: 'magazine', date: new Date(a.date) }))
  .filter((a) => a.date <= today).sort((a, b) => b.date - a.date);
const honeyByName = Object.fromEntries(honeys.map((h) => [slugify(h.nom), h]));
const honeyOf = (r) => honeyByName[slugify(r.miel || '')];
for (const x of [...honeys, ...pillars, ...posts]) {
  Object.assign(x, splitLong(x.body));
  x.words = wordCount(x.body);
  if (x.kind === 'miel' && x.words < 1000) console.warn(`⚠ ${x.slug} : ${x.words} mots (moins de 1 000)`);
  if (!x.sources.length) console.warn(`⚠ ${x.kind}/${x.slug} : aucune source citée`);
}

// Bandeau photo : image du site (/img) ou photo Unsplash (identifiant numérique).
const bannerImg = (photo) => /^\d/.test(photo || '') ? picture(photo, '', { cls: 'banner-bg', ratio: 'auto', eager: true, sizes: '100vw' }) : own(photo || 'chef-sel', '', { cls: 'banner-bg', ratio: 'auto', eager: true });
function longBanner(title, lede, photo, crumbs) {
  return `<section class="page-banner">${bannerImg(photo)}<div class="banner-inner">${crumbs}<h1>${title}</h1>${lede ? `<p>${lede}</p>` : ''}</div></section>`;
}
const crumbsHtml = (items) => `<nav class="crumbs" aria-label="Fil d'Ariane">${items.map(([n, u]) => u ? `<a href="${u}">${esc(n)}</a>` : `<span>${esc(n)}</span>`).join(' › ')}</nav>`;
const crumbsLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, ...(u ? { item: SITE.url + u } : {}) })) });
const ldScript = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const isoDate = (d) => (d instanceof Date ? d : new Date(d || today)).toISOString().slice(0, 10);

function toc(md) {
  const hs = [...md.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
  if (hs.length < 3) return '';
  return `<nav class="toc" aria-label="Sommaire"><p>Au sommaire</p><ol>${hs.map((h) => `<li><a href="#${slugify(h)}">${inline(h)}</a></li>`).join('')}</ol></nav>`;
}
const faqHtml = (faq) => faq.length ? `<section class="faq" id="questions-frequentes"><h2>Questions fréquentes</h2>${faq.map((f) => `<details><summary>${inline(f.q)}</summary>${markdown(f.a)}</details>`).join('')}</section>` : '';
const sourcesHtml = (src) => src.length ? `<section class="sources" id="sources"><h2>Sources</h2><ol>${src.map((s) => `<li>${inline(s)}</li>`).join('')}</ol></section>` : '';
const faqLd = (faq) => faq.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) } : null;

function honeyTile(h) {
  const n = recipes.filter((r) => honeyOf(r) === h).length;
  return `<article class="honey-card"><a href="${h.url}">
    <div class="card-media">${picture(h.photo, h.nom, { sizes: '(min-width: 1200px) 280px, 60vw', ratio: '4 / 3' })}</div>
    <span class="card-cat">${esc(h.famille === 'fonce' ? 'Miel foncé' : h.famille === 'clair' ? 'Miel clair' : 'Miel ambré')}</span><h3>${esc(h.nom)}</h3>
    <div class="card-meta"><span>${n ? `${n} recette${n > 1 ? 's' : ''}` : 'Fiche complète'}</span></div></a></article>`;
}
function postCard(a) {
  return `<article class="post-card"><a href="${a.url}">
    <div class="card-media">${bannerImgCard(a)}</div>
    <span class="card-cat">${esc(a.rubrique || 'Guide')}${a.date ? ` · <time datetime="${isoDate(a.date)}">${dateFr(a.date)}</time>` : ''}</span>
    <h3>${esc(a.titre)}</h3><p>${esc(a.resume)}</p></a></article>`;
}
const bannerImgCard = (a) => /^\d/.test(a.photo || '') ? picture(a.photo, a.titre, { sizes: '(min-width: 1000px) 380px, 90vw', ratio: '16 / 10' }) : own(a.photo || 'chef-sel', a.titre, { ratio: '16 / 10', sizes: '(min-width: 1000px) 380px, 90vw' });


// ---------- carte d'identité visuelle d'un miel ----------
const GEO = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geo.json'), 'utf8'));
const MOIS_COURTS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const PROFIL = ['Douceur', 'Acidité', 'Amertume', 'Intensité', 'Longueur'];
const CRIST = ['', 'Très lente', 'Lente', 'Moyenne', 'Rapide', 'Très rapide'];
const nums = (v) => String(v || '').split(',').map((x) => +x.trim()).filter((x) => !Number.isNaN(x));
const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => x.trim()).filter(Boolean);
function franceMap(zones, color) {
  const { w, h, proj } = GEO.france;
  const pt = (lon, lat) => [(lon - proj.lon0) * proj.k * proj.c, (proj.lat1 - lat) * proj.k];
  const dots = zones.map(([name, lon, lat]) => { const [x, y] = pt(+lon, +lat); const right = x < w * 0.62; return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="${color}" stroke="#1C1917" stroke-width="3"/><text x="${(x + (right ? 22 : -22)).toFixed(1)}" y="${(y + 11).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(name)}</text></g>`; }).join('');
  return `<svg class="fr-map" viewBox="-40 -10 ${w + 80} ${h + 20}" role="img" aria-label="Carte des zones de production en France : ${esc(zones.map((z) => z[0]).join(', '))}"><path d="${GEO.france.d}" fill="#F4F2EF" stroke="#A8A29E" stroke-width="1.2"/>${dots}</svg>`;
}
function honeyId(x) {
  if (!x.profil) return '';
  const prof = nums(x.profil), months = nums(x.mois), crist = +x.crist || 3;
  const zones = String(x.zones || '').split(';').map((z) => z.split('|')).filter((z) => z.length === 3);
  const src = x.profil_source === 'apidologie' ? "Profil établi d'après les fiches descriptives européennes (<em>Apidologie</em>, 2004)." : 'Profil indicatif établi par la rédaction à partir des sources citées.';
  return `<section class="honey-id wrap" aria-label="Carte d'identité du ${esc(x.nom.toLowerCase())}">
  <div class="hid-card hid-color">
    <h2>La couleur</h2>
    <div class="swatch" style="--c:${esc(x.teinte || '#D9A440')}"><span></span></div>
    <p>${inline(x.couleur || '')}</p>
    <h3>Cristallisation</h3>
    <div class="gauge" role="img" aria-label="Cristallisation : ${CRIST[crist]}">${[1, 2, 3, 4, 5].map((i) => `<i${i <= crist ? ' class="on"' : ''}></i>`).join('')}</div>
    <p class="gauge-label"><span>Très lente</span><b>${CRIST[crist]}</b><span>Rapide</span></p>
  </div>
  <div class="hid-card hid-taste">
    <h2>Le profil de goût</h2>
    <dl class="bars">${PROFIL.map((l, i) => `<div><dt>${l}</dt><dd><span class="bar" style="--v:${(prof[i] || 0) / 5}"></span><span class="sr">${prof[i] || 0} sur 5</span></dd></div>`).join('')}</dl>
    <p class="hid-note">${src}</p>
  </div>
  <div class="hid-card hid-cal">
    <h2>La récolte</h2>
    <ol class="months">${MOIS_COURTS.map((m, i) => `<li${months.includes(i + 1) ? ' class="on"' : ''} title="${MOIS[i]}"><span>${m}</span></li>`).join('')}</ol>
    <p>${inline(x.recolte || '')}</p>
  </div>
  <div class="hid-card hid-map">
    <h2>Où en France ?</h2>
    ${zones.length ? franceMap(zones, x.teinte || '#D9A440') : ''}
  </div>
  ${x.accords || x.boissons ? `<div class="hid-card hid-pairs">
    <h2>Les accords</h2>
    <ul class="chips">${listOf(x.accords).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    ${x.boissons ? `<h3>Avec quoi le boire</h3><ul class="chips chips-drink">${listOf(x.boissons).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  </div>` : ''}
</section>`;
}

function longPage(x) {
  const isHoney = x.kind === 'miel', isPost = x.kind === 'magazine';
  const trail = isPost ? [['Accueil', '/'], ['Magazine', '/magazine/'], [x.titre]] : [['Accueil', '/'], ['Le guide des miels', '/miels/'], [isHoney ? x.nom : x.titre]];
  const linked = isHoney ? recipes.filter((r) => honeyOf(r) === x) : [];
  const facts = isHoney ? [['Plante', x.plante], ['Couleur', x.couleur], ['Goût', x.gout], ['Texture', x.texture], ['Cristallisation', x.cristallisation], ['Récolte', x.recolte], ['Où', x.regions], ['Labels', x.labels]].filter(([, v]) => v) : [];
  const published = isoDate(x.date || x.publie || '2026-11-05'), modified = isoDate(x.maj || x.date || '2026-11-05');
  const article = {
    '@context': 'https://schema.org', '@type': isPost && /actu/i.test(x.rubrique || '') ? 'NewsArticle' : 'Article',
    headline: plain(x.titre).slice(0, 110), description: x.resume, inLanguage: 'fr-FR', wordCount: x.words,
    datePublished: published, dateModified: modified, mainEntityOfPage: SITE.url + x.url,
    ...(/^\d/.test(x.photo || '') ? { image: [img(x.photo, 1200)] } : x.photo ? { image: [`${SITE.url}/img/${x.photo}-2000.jpg`] } : {}),
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url }, publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: { '@type': 'ImageObject', url: `${SITE.url}/favicon.svg` } },
    ...(x.sources.length ? { citation: x.sources.map((s) => { const m = s.match(/\]\((https?:[^)]+)\)/); return m ? m[1] : plain(s); }) } : {}),
    ...(isHoney ? { about: { '@type': 'Thing', name: x.nom } } : {}),
  };
  const others = isHoney ? honeys.filter((h) => h !== x) : isPost ? posts.filter((a) => a !== x).slice(0, 3) : pillars.filter((g) => g !== x);
  const body = `
${longBanner(esc(isHoney ? x.nom : x.titre), esc(x.resume), x.photo, crumbsHtml(trail)).replace('class="page-banner"', isHoney && x.profil ? 'class="page-banner banner-id"' : 'class="page-banner"')}
${isHoney ? honeyId(x) : ''}
<div class="wrap long">
  <article class="long-main">
    <p class="long-meta">${isPost ? `${esc(x.rubrique || 'Magazine')} · Publié le <time datetime="${published}">${dateFr(new Date(published))}</time> · ` : `Mis à jour le <time datetime="${modified}">${dateFr(new Date(modified))}</time> · `}${readTime(x.words)} min de lecture</p>
    ${toc(x.main)}
    <div class="prose">${markdown(x.main)}</div>
    ${faqHtml(x.faq)}
    ${sourcesHtml(x.sources)}
    <p class="disclaimer">Le miel est un aliment plaisir, à consommer dans le cadre d'une alimentation variée. Il ne doit pas être donné aux enfants de moins d'un an (<a href="https://www.anses.fr/fr/content/pas-de-miel-les-enfants-de-moins-dun-an" rel="nofollow">recommandation de l'Anses</a>).</p>
  </article>
  <aside class="long-side">
    ${facts.length ? `<div class="facts"><h2>Fiche d'identité</h2><dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${inline(v)}</dd>`).join('')}</dl></div>` : ''}
    ${isHoney ? `<div class="side-box"><h2>Où l'acheter</h2><p>Chez un apiculteur, sur un marché ou à la ferme : notre guide pour <a href="/guide/trouver-un-apiculteur/">trouver un apiculteur près de chez vous</a>.</p></div>` : ''}
    <div class="side-box"><h2>Le guide des miels</h2><ul>${pillars.map((g) => `<li><a href="${g.url}">${esc(g.titre_court || g.titre)}</a></li>`).join('')}${HAS_ATLAS ? `<li><a href="/miels/atlas/">L'atlas des miels du monde</a></li>` : ''}</ul></div>
  </aside>
</div>
${isHoney ? `<section class="wrap block related">${sectionTitle(`Recettes au ${esc(x.nom.replace(/^Miel /, 'miel '))}`, linked.length ? 'Avec ce miel' : 'Bientôt sur le site : en attendant, toutes nos recettes')}${grid(linked.length ? linked : recipes.slice(0, 6))}</section>` : ''}
${isHoney ? `<section class="block"><div class="wrap">${sectionTitle('Les autres miels', 'Continuez la dégustation')}</div>${carousel(others.map(honeyTile).join('\n'), 'Les autres miels')}</section>`
  : others.length ? `<section class="wrap block">${sectionTitle(isPost ? 'À lire aussi' : 'Continuer la lecture', '')}<div class="posts">${others.slice(0, 3).map(postCard).join('')}</div></section>` : ''}`;
  return layout({
    title: plain(x.titre), description: x.resume, canonical: x.url, body, ogImage: /^\d/.test(x.photo || '') ? img(x.photo, 1200) : '',
    extraHead: [article, crumbsLd(trail), faqLd(x.faq)].filter(Boolean).map(ldScript).join('\n'),
  });
}


// ---------- graphiques du guide : nuancier, calendrier des miellées, carte du goût ----------
const lum = (hex) => { const n = parseInt(String(hex).slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
function colorScale() {
  const list = honeys.filter((h) => h.teinte).sort((a, b) => lum(b.teinte) - lum(a.teinte));
  return `<figure class="viz viz-scale"><figcaption><h3>Du plus clair au plus foncé</h3><p>La couleur du miel annonce souvent son goût : les miels clairs sont doux, les miels foncés plus puissants.</p></figcaption>
  <ol class="scale">${list.map((h) => `<li><a href="${h.url}"><span class="dot" style="--c:${h.teinte}"></span><span class="nm">${esc(shortHoney(h.nom))}</span></a></li>`).join('')}</ol></figure>`;
}
function harvestCalendar() {
  const list = honeys.filter((h) => h.mois).sort((a, b) => Math.min(...nums(a.mois)) - Math.min(...nums(b.mois)));
  return `<figure class="viz viz-cal" id="calendrier"><figcaption><h3>Le calendrier des miellées</h3><p>Les mois de récolte de chaque miel en France. Le mois en cours est surligné.</p></figcaption>
  <div class="gantt" role="table" aria-label="Calendrier des récoltes de miel">
    <div class="g-row g-head" role="row"><span role="columnheader">Miel</span>${MOIS_COURTS.map((m, i) => `<span role="columnheader" data-m="${i + 1}" title="${MOIS[i]}">${m}</span>`).join('')}</div>
    ${list.map((h) => { const ms = nums(h.mois); return `<div class="g-row" role="row"><a role="rowheader" href="${h.url}">${esc(shortHoney(h.nom))}</a>${MOIS_COURTS.map((m, i) => `<span role="cell" data-m="${i + 1}"${ms.includes(i + 1) ? ` class="on" style="--c:${h.teinte}" aria-label="${MOIS[i]} : récolte"` : ` aria-label="${MOIS[i]}"`}></span>`).join('')}</div>`; }).join('')}
  </div></figure>`;
}
function tasteMap() {
  const list = honeys.filter((h) => h.profil);
  const W = 560, H = 380, P = 48;
  const pts = list.map((h) => { const p = nums(h.profil); return { h, x: P + 20 + ((p[3] + p[4]) / 10) * (W - 2 * P - 40), y: H - P - 10 - ((p[0] - p[2] + 5) / 10) * (H - 2 * P - 20) }; });
  // Écarte les points qui se superposent, puis place chaque étiquette là où elle ne chevauche rien.
  for (let k = 0; k < 40; k++) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 27) { const dx = (a.x - b.x) || 1, dy = a.y - b.y, n = Math.hypot(dx, dy) || 1, m = (27 - d) / 2; a.x += dx / n * m; a.y += dy / n * m; b.x -= dx / n * m; b.y -= dy / n * m; }
  }
  const boxes = pts.map(({ x, y }) => [x - 12, y - 12, x + 12, y + 12]);
  const hit = (r) => boxes.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]) || r[0] < 4 || r[2] > W - 4;
  for (const p of pts) {
    const name = shortHoney(p.h.nom), w = name.length * 7.6;
    const tries = [[15, 4, 'start'], [-15, 4, 'end'], [0, -17, 'middle'], [0, 26, 'middle'], [15, -14, 'start'], [15, 22, 'start'], [-15, -14, 'end'], [-15, 22, 'end']];
    const rectOf = (t) => { const x0 = t[2] === 'start' ? p.x + t[0] : t[2] === 'end' ? p.x + t[0] - w : p.x - w / 2; return [x0, p.y + t[1] - 12, x0 + w, p.y + t[1] + 3]; };
    const cost = (r) => boxes.reduce((s, b) => s + Math.max(0, Math.min(r[2], b[2]) - Math.max(r[0], b[0])) * Math.max(0, Math.min(r[3], b[3]) - Math.max(r[1], b[1])), 0) + (r[0] < 4 || r[2] > W - 4 ? 1e6 : 0);
    const best = tries.find((t) => !hit(rectOf(t))) || tries.reduce((a, t) => (cost(rectOf(t)) < cost(rectOf(a)) ? t : a));
    boxes.push(rectOf(best)); p.lab = best;
  }
  return `<figure class="viz viz-taste"><figcaption><h3>La carte des goûts</h3><p>Plus un miel est à droite, plus il est intense et long en bouche. Plus il est haut, plus il est doux ; plus il est bas, plus il a d'amertume.</p></figcaption>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Carte des goûts des miels selon l'intensité et la douceur">
    <rect x="${P}" y="${P / 2}" width="${W - 2 * P}" height="${H - 1.5 * P}" rx="16" fill="#FFF4DE"/>
    <line x1="${W / 2}" y1="${P / 2}" x2="${W / 2}" y2="${H - P}" stroke="#E7E5E4" stroke-dasharray="4 6"/><line x1="${P}" y1="${(H - P / 2) / 2 + P / 4}" x2="${W - P}" y2="${(H - P / 2) / 2 + P / 4}" stroke="#E7E5E4" stroke-dasharray="4 6"/>
    <text x="${W / 2}" y="${H - 14}" text-anchor="middle" class="ax">Intensité et longueur en bouche →</text>
    <text x="16" y="${H / 2}" text-anchor="middle" class="ax" transform="rotate(-90 16 ${H / 2})">← Amertume · Douceur →</text>
    ${pts.map(({ h, x, y, lab }) => `<a href="${h.url}"><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="11" fill="${h.teinte}" stroke="#1C1917" stroke-width="1.5"/><text x="${(x + lab[0]).toFixed(0)}" y="${(y + lab[1]).toFixed(0)}" text-anchor="${lab[2]}" class="lb">${esc(shortHoney(h.nom))}</text></a>`).join('')}
  </svg></figure>`;
}

function guideHub() {
  const fam = [['clair', 'Les miels clairs', 'Doux et délicats, ils accompagnent sans dominer.'], ['ambre', 'Les miels ambrés', 'Floraux ou aromatiques, le cœur de la gamme.'], ['fonce', 'Les miels foncés', 'Puissants, maltés ou boisés, ils s\'affirment.']];
  const trail = [['Accueil', '/'], ['Le guide des miels']];
  const body = `
${longBanner('Le guide des miels', `${honeys.length} miels décryptés, leur goût, leur origine et la meilleure façon de les cuisiner.`, '1600759487717-62bbb608106e', crumbsHtml(trail))}
<section class="wrap block-tight">
  <div class="hub-intro prose"><p>Un miel prend le goût des fleurs, des arbres ou du miellat que les abeilles ont récoltés. Chaque fiche de ce guide décrit un miel en détail : la plante d'origine, la couleur, le goût, la texture, la saison de récolte, les régions de production, les labels, et surtout la façon de l'utiliser en cuisine, avec nos recettes. Les informations s'appuient sur des sources reconnues, citées en bas de chaque fiche.</p></div>
  ${fam.map(([k, t, sub]) => { const l = honeys.filter((h) => h.famille === k); return l.length ? `${sectionTitle(t, sub)}<div class="honey-grid">${l.map(honeyTile).join('')}</div>` : ''; }).join('\n')}
</section>
<section class="wrap block">
  ${sectionTitle('Les miels en un coup d\'œil', 'Couleur, goût et saison de récolte')}
  ${colorScale()}
  <div class="viz-duo">${tasteMap()}${harvestCalendar()}</div>
</section>
<section class="wrap block">
  ${sectionTitle('Comprendre le miel', 'Histoire, ruche, fraude, achat')}
  <div class="posts">${pillars.map(postCard).join('')}${!HAS_ATLAS ? '' : postCard({ url: '/miels/atlas/', titre: "L'atlas des miels du monde", resume: 'Tous les miels de France et du monde sur une carte.', rubrique: 'Carte', photo: '1774284266228-27698569b2fd' })}</div>
</section>
${posts.length ? `<section class="wrap block">${sectionTitle('Le magazine du miel', 'Actualités et dossiers')}<div class="posts">${posts.slice(0, 3).map(postCard).join('')}</div><div class="more"><a class="btn-outline" href="/magazine/">Tous les articles</a></div></section>` : ''}`;
  return layout({ title: 'Le guide des miels : variétés, goûts et usages en cuisine', description: `Le guide complet des miels : ${honeys.map((h) => h.nom.replace(/^Miel /, '')).join(', ')}. Goût, origine, récolte, labels et recettes.`, canonical: '/miels/', body, extraHead: ldScript(crumbsLd(trail)) + ldScript({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: honeys.map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + h.url, name: h.nom })) }) });
}

function magazineHub() {
  const trail = [['Accueil', '/'], ['Magazine']];
  const body = `
${longBanner('Le magazine du miel', "L'actualité du miel et de l'apiculture, des dossiers de saison, toujours sourcés.", '1774284266228-27698569b2fd', crumbsHtml(trail))}
<section class="wrap block-tight"><div class="posts">${posts.map(postCard).join('')}</div></section>`;
  return layout({ title: 'Le magazine du miel : actualités et dossiers', description: "Actualités du miel et de l'apiculture, récoltes, réglementation, dossiers de saison : le magazine de Cuisine au miel.", canonical: '/magazine/', body, extraHead: ldScript(crumbsLd(trail)) });
}

// ---------- construction ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });

const urls = ['/', '/recettes/', '/miels/', '/magazine/'];
write('miels/index.html', guideHub());
write('magazine/index.html', magazineHub());
for (const x of [...honeys, ...pillars, ...posts]) { write(`${x.url.slice(1)}index.html`, longPage(x)); urls.push(x.url); }
// Ancienne adresse du guide : redirection vers /miels/.
write('le-miel/index.html', `<!doctype html><meta charset="utf-8"><title>Le guide des miels</title><link rel="canonical" href="${SITE.url}/miels/"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/miels/"><a href="/miels/">Le guide des miels</a>`);
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
