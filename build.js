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
  // Adresse publique du site (SITE_URL dans le déploiement tant que le domaine n'est pas branché).
  url: (process.env.SITE_URL || 'https://cuisineaumiel.fr').replace(/\/$/, ''),
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
// Logo médaillon (piste A) : la goutte se remplit de miel.
const DROP = 'M13 1C10.6 5.8 1.5 14.6 1.5 24a11.5 11.5 0 0 0 23 0C24.5 14.6 15.4 5.8 13 1z';
const logoMedal = (id) => `<svg class="medal" viewBox="0 0 280 280" role="img" aria-label="Cuisine au miel"><circle cx="140" cy="140" r="130" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="140" cy="140" r="119" fill="none" stroke="currentColor" stroke-width="1"/><g transform="translate(115.5 36) scale(1.9)"><clipPath id="${id}"><path d="${DROP}"/></clipPath><g clip-path="url(#${id})"><g class="lv"><path class="wv2" d="M-20 17q2.5-2.2 5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0 V40H-20z" fill="#F8C766"/><path class="wv" d="M-20 18.5q2.5-2.6 5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0 V40H-20z" fill="#F2A516"/></g></g><path d="${DROP}" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.2 26.5a6.4 6.4 0 0 1 .6-6.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g><text x="140" y="150" text-anchor="middle" class="m-k">CUISINE</text><text x="140" y="197" text-anchor="middle" class="m-n">au miel</text><path d="M104 216h72" stroke="currentColor" stroke-width="1"/><circle cx="140" cy="216" r="2.5" fill="currentColor"/></svg>`;
const logoSvg = `<svg viewBox="7 1 26 36" width="26" height="36" aria-hidden="true"><path d="M20 2C17.6 6.8 8.5 15.6 8.5 25a11.5 11.5 0 0 0 23 0C31.5 15.6 22.4 6.8 20 2z" fill="currentColor"/><path d="M14.2 27.5a6.4 6.4 0 0 1 .6-6.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const clockIcon = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const arrow = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d === 'prev' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
const RF = {
  clock: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>`,
  knife: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18c0 5-4 9-9 9s-9-4-9-9z"/><path d="M14 11l5-8"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4 0 7-2.7 7-6.5 0-4-3-6-4-9.5-1 2-2 3-3 3 0-2-1-4.5-3-6 0 3-4 6-4 12.5C5 19.3 8 22 12 22z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/></svg>`,
  people: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>`,
  chef: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9V20h12v-6.1"/><path d="M6 14a4 4 0 1 1 2.6-7A4.5 4.5 0 0 1 17 6.1 4 4 0 1 1 18 14z"/></svg>`,
  print: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
};
const dropIcon = (on) => `<svg viewBox="0 0 12 16" width="11" height="14" aria-hidden="true"><path d="M6 1C5 3 1 7 1 10.4a5 5 0 0 0 10 0C11 7 7 3 6 1z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"/></svg>`;
// Photos fournies par le propriétaire du site, servies depuis /img/.
const own = (name, alt, { ratio = '16 / 9', eager = false, cls = '', sizes = '100vw' } = {}) =>
  `<img class="${cls}" src="/img/${name}-1000.jpg" srcset="/img/${name}-1000.jpg 1000w, /img/${name}-2000.jpg 2000w" sizes="${sizes}" alt="${esc(alt)}" style="aspect-ratio:${ratio}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const shortCat = (c) => c.name.split(' &')[0];

const appSvg = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>`;
const DEFAULT_OG = 'https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=1200&q=70';
function layout({ title, description, body, canonical, extraHead = '', ogImage = '', hero = '' }) {
  const fullTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<script>try{if(!sessionStorage.getItem('cam')){sessionStorage.setItem('cam','1');document.documentElement.classList.add('first-visit')}}catch(e){}</script>
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
<meta property="og:image" content="${ogImage || DEFAULT_OG}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="Cuisine au miel">
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
    <a href="/outils/">Outils</a>
  </nav>
  <a class="logo" href="/" aria-label="Cuisine au miel, accueil">${logoMedal('lg-drop')}</a>
  <nav class="nav nav-right" aria-label="Navigation secondaire">
    <a href="/miels/">Les miels</a>
    <a href="/magazine/">Magazine</a>
    <a class="nav-carnet" href="/carnet/" aria-label="Mon carnet de recettes" title="Mon carnet de recettes">${heartSvg}<b class="carnet-count" hidden></b></a>
  </nav>
</header>
${hero}
<main id="contenu">
${body}
</main>
<footer class="footer">
  ${newsletterBox('nl-ft')}
  <div class="ft">
    <div class="ft-brand">
      <a class="ft-logo" href="/" aria-label="Cuisine au miel, accueil"><svg viewBox="0 0 26 36" width="30" height="42" aria-hidden="true"><path d="M13 1C10.6 5.8 1.5 14.6 1.5 24a11.5 11.5 0 0 0 23 0C24.5 14.6 15.4 5.8 13 1z" fill="#F2A516"/><path d="M7.2 26.5a6.4 6.4 0 0 1 .6-6.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg><span><small>Cuisine</small><b>au miel</b></span></a>
      <p>Recettes, savoirs et carte des miels, avec des sources solides. Un site proposé par le <a href="/a-propos/">GAEC des Deux Vallées</a>, apiculteurs.</p>
      <a class="ft-cta" href="/recettes/">Voir les ${recipes.length} recettes →</a>
      <div class="ft-app" data-install hidden><button type="button" class="ft-app-btn">${appSvg} Installer l'appli</button><p class="ft-app-ios" hidden>Sur iPhone : touchez <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>.</p></div>
    </div>
    <nav class="ft-cols" aria-label="Pied de page">
      <div><h2>Recettes</h2><a href="/recettes/">Toutes les recettes</a><a href="/categories/desserts/">Desserts</a><a href="/categories/plats/">Plats</a><a href="/categories/aperitifs-entrees/">Apéritifs et entrées</a><a href="/recettes/saison/${saisonNow ? saisonNow.slug : 'automne'}/">Recettes de saison</a>${[10, 11].includes(today.getUTCMonth()) ? '<a href="/recettes/noel/">Noël au miel</a>' : ''}<a href="/recettes/airfryer/">Au Airfryer</a><a href="/carnet/">Mon carnet</a><a href="/proposer-une-recette/">Proposer une recette</a></div>
      <div><h2>Le miel</h2><a href="/miels/">Le guide des miels</a>${HAS_ATLAS ? '<a href="/miels/atlas/">L\'atlas des miels</a>' : ''}<a href="/guide/glossaire-du-miel/">Le glossaire</a><a href="/guide/produits-de-la-ruche/">Les produits de la ruche</a><a href="/magazine/">Magazine</a></div>
      <div><h2>Outils</h2><a href="/outils/frigo/">Que cuisiner avec mon frigo ?</a><a href="/outils/sucre-miel/">Remplacer le sucre</a><a href="/outils/quel-miel/">Quel miel pour vous ?</a><a href="/outils/menu-de-la-semaine/">Menu de la semaine</a><a href="/outils/calendrier-des-miellees/">Calendrier des miellées</a><a href="/outils/">Tous les outils</a></div>
      <div><h2>Apiculteurs</h2><a href="/apiculteurs-partenaires/">Nos apiculteurs partenaires</a><a href="/guide/trouver-un-apiculteur/">Bien acheter son miel</a><a href="/apiculteurs-partenaires/#liste-attente">Vous êtes apiculteur ?</a><a href="/a-propos/">À propos</a></div>
    </nav>
  </div>
  <div class="ft-bottom"><p>© ${today.getUTCFullYear()} cuisineaumiel.fr</p><p class="ft-anses">Le miel ne convient pas aux enfants de moins d'un an (Anses).</p></div>
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
const searchData = (r) => esc([r.titre, r.miel, r.resume, r.cat.name, ...r.tags, ...r.ingredientsList].join(' ').toLowerCase());
const LEVEL = { 'très facile': 1, facile: 1, moyenne: 2, difficile: 3 };
const level = (r) => {
  const n = LEVEL[(r.difficulte || '').toLowerCase()] || 2;
  return `<span class="level" title="Difficulté : ${esc(r.difficulte)}"><span class="sr">Difficulté : ${esc(r.difficulte)}</span>${[1, 2, 3].map((i) => dropIcon(i <= n)).join('')}</span>`;
};
const MEAT = /poulet|porc|boeuf|bœuf|\bveau\b|agneau|canard|jambon|lard|bacon|magret|saumon|thon|crevette|poisson|cabillaud|dorade|chorizo|saucisse|dinde|caille|lapin|anchois|gélatine|gelatine/i;
const isVeggie = (r) => !MEAT.test(r.ingredientsList.join(' ') + ' ' + r.titre);

// ---------- préférences alimentaires, budget et ingrédients (carnet, frigo, filtres) ----------
// Repérage automatique à partir de la liste d'ingrédients : indicatif, on invite à vérifier les étiquettes.
const nrm = (t) => String(t || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
const DIETS = [
  ['viande', 'la viande', /poulet|\bporc|boeuf|\bveau\b|agneau|canard|jambon|\blard|bacon|magret|chorizo|saucisse|\bdinde|\bcailles?\b|lapin|travers|gelatine|volaille/],
  ['porc', 'le porc', /\bporc|jambon|\blard|bacon|chorizo|saucisse|travers de porc|gelatine/],
  ['poisson', 'le poisson, les fruits de mer', /saumon|thon|crevette|poisson|cabillaud|dorade|anchois|moule|saint-jacques|sauce poisson/],
  ['lait', 'les produits laitiers', /\blait\b(?! de coco| d'amande| d'avoine| vegetal)|beurre(?! de cacahuete)|creme(?! de coco)|yaourt|fromage|feta|chevre|ricotta|mascarpone|camembert|halloumi|parmesan|mozzarella|burrata|comte|roquefort|skyr|glace vanille|chocolat au lait|speculoos|brioche/],
  ['gluten', 'le gluten', /farine(?! de riz| de mais| de sarrasin| de pois chiche| d'amande)|\bpain\b|baguette|brioche|pate feuilletee|pate brisee|pate sablee|pate filo|filo|biscuit|speculoos|chapelure|semoule|boulgour|avoine|granola|\bble\b|orge|seigle|epeautre|sauce soja|pitas?\b|\bpates\b|muesli/],
  ['oeuf', 'les œufs', /\boeufs?\b|jaunes? d'oeufs?|blancs? d'oeufs?/],
  ['coque', 'les fruits à coque', /\bnoix\b(?! de coco| de muscade)|noisette|amande|pistache|cajou|pecan|pignon|macadamia|cacahuete|arachide|praline|nougat|fruits secs melanges/],
  ['alcool', "l'alcool", /\bvin\b|rhum|cognac|biere|calvados|whisky|liqueur|porto|armagnac|kirsch|cidre brut|\bsake\b|mirin|grand marnier|cointreau/],
];
const recipeText = (r) => nrm(r.ingredientsList.join(' | '));
const dietsOf = (r) => DIETS.filter(([, , re]) => re.test(recipeText(r))).map(([k]) => k);
// Petit budget : aucun ingrédient cher (champ « budget: petit » ou « budget: moyen » pour forcer).
const PRICEY = /magret|canard|agneau|filet mignon|filets mignons|saumon|crevette|saint-jacques|boeuf|veau|pistache|pignon|macadamia|safran|gousse de vanille|jambon cru|jambon demi-sel de 3 kg|burrata|cepe|truffe|champagne|foie gras/;
const isCheap = (r) => (r.budget ? nrm(r.budget).startsWith('petit') : !PRICEY.test(recipeText(r)));
// Ingrédients du « frigo » : [clé, libellé, rayon, motif].
const FRIGO = [
  ['pomme', 'Pommes', 'Fruits', /\bpommes?\b(?! de terre)|jus de pomme/], ['poire', 'Poires', 'Fruits', /\bpoires?\b/], ['figue', 'Figues', 'Fruits', /figue/], ['orange', 'Oranges', 'Fruits', /\boranges?\b/], ['citron', 'Citrons', 'Fruits', /citron/], ['banane', 'Bananes', 'Fruits', /banane/], ['peche', 'Pêches', 'Fruits', /\bpeches?\b/], ['fruits-rouges', 'Fruits rouges', 'Fruits', /fruits rouges|framboise|fraise|myrtille/], ['coing', 'Coings', 'Fruits', /coing/], ['pruneau', 'Pruneaux', 'Fruits', /pruneau/], ['fruits-secs', 'Fruits secs', 'Fruits', /fruits secs|raisins secs|abricots secs|cranberr|fruits confits/],
  ['carotte', 'Carottes', 'Légumes', /carotte/], ['courge', 'Courge', 'Légumes', /courge|butternut|potiron|potimarron/], ['oignon', 'Oignons', 'Légumes', /oignon|echalote/], ['ail', 'Ail', 'Légumes', /\bail\b|gousses? d'ail/], ['pomme-de-terre', 'Pommes de terre', 'Légumes', /pommes? de terre/], ['tomate', 'Tomates', 'Légumes', /tomate/], ['betterave', 'Betteraves', 'Légumes', /betterave/], ['panais', 'Panais', 'Légumes', /panais/], ['salade', 'Salade, roquette', 'Légumes', /roquette|mesclun|salade|epinard/], ['gingembre', 'Gingembre', 'Légumes', /gingembre/], ['herbes', 'Herbes fraîches', 'Légumes', /persil|coriandre|menthe|basilic|ciboulette|aneth/],
  ['lait', 'Lait', 'Crèmerie', /\blait\b(?! de coco)/], ['beurre', 'Beurre', 'Crèmerie', /beurre(?! de cacahuete)/], ['creme', 'Crème', 'Crèmerie', /creme(?! de coco)/], ['yaourt', 'Yaourt', 'Crèmerie', /yaourt|skyr|fromage blanc/], ['oeuf', 'Œufs', 'Crèmerie', /\boeufs?\b|jaunes? d'oeufs?|blancs? d'oeufs?/], ['fromage-frais', 'Ricotta, fromage frais', 'Crèmerie', /ricotta|mascarpone|fromage frais|burrata|philadelphia/], ['chevre', 'Chèvre', 'Crèmerie', /chevre|crottin/], ['feta', 'Feta', 'Crèmerie', /feta/], ['fromage', 'Autres fromages', 'Crèmerie', /camembert|halloumi|parmesan|comte|roquefort|mozzarella|brie|reblochon/],
  ['poulet', 'Poulet', 'Viandes et poissons', /poulet|\bdinde/], ['porc', 'Porc', 'Viandes et poissons', /porc|travers/], ['jambon', 'Jambon', 'Viandes et poissons', /jambon|lardon|bacon/], ['canard', 'Canard', 'Viandes et poissons', /canard|magret/], ['agneau', 'Agneau', 'Viandes et poissons', /agneau/], ['saumon', 'Saumon', 'Viandes et poissons', /saumon/], ['crevettes', 'Crevettes', 'Viandes et poissons', /crevette/], ['tofu', 'Tofu', 'Viandes et poissons', /tofu/],
  ['farine', 'Farine', 'Épicerie', /farine/], ['avoine', "Flocons d'avoine", 'Épicerie', /avoine|granola|muesli/], ['chocolat', 'Chocolat', 'Épicerie', /chocolat|cacao/], ['noix', 'Noix', 'Épicerie', /\bnoix\b(?! de coco| de muscade)/], ['noisettes', 'Noisettes', 'Épicerie', /noisette/], ['amandes', 'Amandes', 'Épicerie', /amande/], ['pistaches', 'Pistaches', 'Épicerie', /pistache/], ['pate', 'Pâte feuilletée ou filo', 'Épicerie', /pate feuilletee|pate brisee|filo/], ['pain', 'Pain', 'Épicerie', /\bpain\b|baguette|pitas?\b|brioche/], ['sesame', 'Sésame', 'Épicerie', /sesame/], ['soja', 'Sauce soja', 'Épicerie', /sauce soja/], ['moutarde', 'Moutarde', 'Épicerie', /moutarde/], ['vinaigre', 'Vinaigre', 'Épicerie', /vinaigre/], ['epices', 'Épices douces (cannelle, vanille…)', 'Épicerie', /cannelle|vanille|badiane|girofle|quatre-epices|muscade|cardamome/], ['the', 'Thé', 'Épicerie', /\bthe\b/],
];
const frigoOf = (r) => { const t = recipeText(r); return FRIGO.filter(([, , , re]) => re.test(t)).map(([k]) => k); };
// Index léger des recettes, lu par le carnet, le frigo, le hasard et les préférences.
const recipeIndex = () => recipes.map((r) => ({ s: r.slug, t: r.titre, u: r.url, i: img(r.photo, 480), c: shortCat(r.cat), m: shortHoney(r.miel), d: totalTime(r), n: totalMin(r), l: LEVEL[(r.difficulte || '').toLowerCase()] || 2, b: isCheap(r) ? 1 : 0, x: dietsOf(r), f: frigoOf(r), p: `${r.portions} ${r.unite || 'pers.'}`, g: r.ingredientsList.map(plain) }));
const heartSvg = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg>`;
const saveBtn = (r, cls = 'save') => `<button type="button" class="${cls}" data-save="${r.slug}" aria-pressed="false" aria-label="Ajouter « ${esc(r.titre)} » à mon carnet" title="Ajouter à mon carnet">${heartSvg}<span class="save-txt">Mon carnet</span></button>`;
const diceSvg = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/></svg>`;
// Panneau « Je ne mange pas de… », mémorisé dans le navigateur.
const prefsPanel = () => `<details class="prefs" data-prefs>
  <summary><span>Je ne mange pas de…</span><b class="prefs-count" hidden></b></summary>
  <div class="prefs-body">
    <p>Cochez ce que vous ne mangez pas : ces recettes seront masquées partout sur le site, sur cet appareil.</p>
    <div class="prefs-opts">${DIETS.map(([k, l]) => `<label class="pref"><input type="checkbox" value="${k}"><span>${l.replace(/^(la |le |les |l')/, (m) => '').replace(/^./, (c) => c.toUpperCase())}</span></label>`).join('')}</div>
    <p class="prefs-note">Repérage automatique d'après la liste des ingrédients : vérifiez toujours les étiquettes en cas d'allergie.</p>
  </div>
</details>`;

// Carte recette en portrait : photo, catégorie, titre, difficulté et temps.
function card(r, { eager = false } = {}) {
  return `<article class="card" data-cat="${r.cat.slug}" data-search="${searchData(r)}" data-slug="${r.slug}" data-min="${totalMin(r)}" data-budget="${isCheap(r) ? 1 : 0}" data-x="${dietsOf(r).join(' ')}">
  ${saveBtn(r)}
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

// Bandeau « Noël au miel » sur l'accueil, en novembre et décembre seulement (le site est reconstruit chaque jour).
// Encart « Proposez votre recette » (version photo quand la lecture automatique est active).
const camSvg = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function shareCta(cls = '') {
  const snap = AVIS.api && AVIS.lecture;
  return `<aside class="share-cta ${cls}">
  <span class="share-ico">${snap ? camSvg : '✍️'}</span>
  <div><p class="kicker">${snap ? 'Nouveau : votre recette en photo' : 'Votre recette sur le site'}</p>
  <h2>${snap ? 'Une recette au miel ? Prenez-la en photo' : 'Une recette au miel à partager ?'}</h2>
  <p>${snap ? 'Photographiez votre fiche, manuscrite ou imprimée : le formulaire se remplit tout seul. Vous relisez, vous envoyez, et les meilleures sont publiées avec votre prénom.' : 'Une recette de famille, une trouvaille de saison ? Envoyez-la : les meilleures sont publiées avec votre prénom.'}</p></div>
  <a class="btn" href="/proposer-une-recette/">${snap ? 'Prendre ma recette en photo' : 'Proposer ma recette'}</a>
</aside>`;
}
function noelPromo() {
  const c = COLLECTIONS.find((x) => x.slug === 'noel');
  if (!c || ![10, 11].includes(today.getUTCMonth())) return '';
  return `<section class="wrap block"><a class="promo" href="${c.url}">${bannerImg(c.photo)}<span class="promo-in"><span class="kicker">Les fêtes approchent</span><b>${esc(c.titre)}</b><span>${esc(c.lede)}</span><span class="btn">Voir les ${c.all.length} recettes →</span></span></a></section>`;
}
function home() {
  const byCat = CATEGORIES.map((c) => ({ c, list: recipes.filter((r) => r.cat === c).slice(0, 10) })).filter((x) => x.list.length);
  const first = byCat.find((x) => x.c.slug === 'plats') || byCat[0];
  const FILTERS = [
    ['nouveautes', 'Nouveautés', recipes],
    ...(saisonNow && saisonList(saisonNow).length ? [['saison', `De saison`, saisonList(saisonNow)]] : []),
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
${noelPromo()}
${NEWS.formulaire ? `<section class="wrap block">${newsletterBox('nl-home')}</section>` : ''}
<section class="wrap block">${shareCta('share-home')}</section>

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
      <p class="kicker">De nouvelles recettes chaque semaine</p>
      <h2>Le miel, de l'entrée au dessert</h2>
      <p>${recipes.length} recettes originales pour remplacer le sucre, laquer une viande ou parfumer une pâtisserie. Chaque fiche vous indique le miel le plus adapté et pourquoi.</p>
      <a class="btn" href="/a-propos/">Découvrir le site</a>
    </div>
  </div>
</section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url + '/', inLanguage: 'fr-FR', description: SITE.description, publisher: { '@id': SITE.url + '/#org' }, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: SITE.url + '/recettes/?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } },
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': SITE.url + '/#org', name: SITE.name, url: SITE.url + '/', logo: SITE.url + '/favicon.svg', description: "Site de référence sur le miel en cuisine : recettes, guide des miels, atlas et magazine. Proposé par le GAEC des Deux Vallées, exploitation apicole.", parentOrganization: { '@type': 'Organization', name: 'GAEC des Deux Vallées' } }];
  return layout({ title: '', canonical: '/', body, hero: heroBanner(), extraHead: ld.map(ldScript).join('') });
}

function pageHead(title, lede, photo, crumbs = '') {
  return `<section class="page-banner">
  ${bannerImg(photo)}
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
    ...nutritionLd(r),
    ...(NOTES[r.slug] && NOTES[r.slug].n ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: NOTES[r.slug].moy, ratingCount: NOTES[r.slug].n, bestRating: 5, worstRating: 1 } } : {}),
  };
  const body = `
${printSheet(r)}
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
  <div class="rfacts">
    <div class="rf-total">${RF.clock}<span>Temps total</span><b>${totalTime(r)}</b></div>
    <ul class="rf-list">
      <li>${RF.knife}<span>Préparation</span><b>${esc(r.preparation)}</b></li>
      ${r.cuisson && r.cuisson !== '0 min' ? `<li>${RF.flame}<span>Cuisson</span><b>${esc(r.cuisson)}</b></li>` : ''}
      ${r.repos ? `<li>${RF.pause}<span>Repos</span><b>${esc(r.repos)}</b></li>` : ''}
      <li>${level(r)}<span>Difficulté</span><b>${esc(r.difficulte)}</b></li>
      <li>${RF.people}<span>Pour</span><b>${r.portions} ${esc(r.unite || 'pers.')}</b></li>
    </ul>
    <div class="rf-actions">
      <button type="button" class="rf-btn rf-main" data-cook title="Plein écran, une étape à la fois, écran toujours allumé">${RF.chef}<span>Mode cuisine</span></button><span class="rf-hint">Plein écran, étape par étape, écran allumé</span>
      <button type="button" class="rf-btn" onclick="window.print()" aria-label="Imprimer la fiche recette au format A4" title="Une page A4 propre, sans publicité, à garder en cuisine">${RF.print}<span>Fiche A4</span></button>
      ${saveBtn(r, 'rf-btn rf-save')}
      <button type="button" class="rf-btn" data-share aria-label="Partager la recette">${RF.share}<span>Partager</span></button>
    </div>
  </div>
  <p class="diet-warn" data-x="${dietsOf(r).join(' ')}" hidden></p>
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
      <a class="tool-link" href="/outils/sucre-miel/">Adapter vos recettes : remplacez le sucre par du miel →</a>
      ${shopBox(r)}
    </aside>
    <div class="recipe-main">
      ${r.intro ? `<div class="intro">${r.intro}</div>` : ''}
      <div class="steps-head"><h2>Préparation</h2><button type="button" class="cook-btn" data-cook><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9V20h12v-6.1"/><path d="M6 14a4 4 0 1 1 2.6-7A4.5 4.5 0 0 1 17 6.1 4 4 0 1 1 18 14z"/></svg>Mode cuisine</button></div>
      <p class="cook-help"><b>Le mode cuisine ?</b> La recette passe en plein écran : les ingrédients à cocher, puis une étape à la fois en gros caractères, avec « Suivant » et « Précédent ». L'écran reste allumé pendant que vous cuisinez, même les mains occupées.</p>
      <ol class="steps">${r.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>
      ${r.conseil ? `<div class="tip"><h2>🐝 Le conseil</h2>${r.conseil}</div>` : ''}
      ${r.variantes ? `<div class="variants"><h2>Variantes</h2>${r.variantes}</div>` : ''}
      ${nutritionHtml(r)}
      <div class="print-partner"><p>Fiche offerte par <b>MesAbeilles.fr</b></p><p>Retrouvez cette recette et bien d'autres sur cuisineaumiel.fr</p></div>
      ${avisHtml(r)}
      ${shareCta('share-recipe')}
      <p class="credits">Photos : ${esc(r.credit)}${r.honey.credit ? ` et ${esc(r.honey.credit)}` : ''} sur <a href="https://unsplash.com/fr" rel="nofollow">Unsplash</a>.</p>
    </div>
  </div>
</article>
<section class="wrap">${exploreHtml(r)}</section>
<section class="wrap block related">
  ${sectionTitle('À cuisiner aussi', `D'autres idées de ${r.cat.name.toLowerCase()}`)}
  ${grid(related)}
</section>`;
  return layout({
    title: r.titre, description: r.resume, canonical: r.url, body, ogImage: img(r.photo, 1200),
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  });
}

function printSheet(r) {
  const h = honeyOf(r);
  const facts = [['Préparation', r.preparation], ...(r.cuisson && r.cuisson !== '0 min' ? [['Cuisson', r.cuisson]] : []), ...(r.repos ? [['Repos', r.repos]] : []), ['Total', totalTime(r)], ['Difficulté', r.difficulte], ['Pour', `<span data-ps-portions>${r.portions}</span> ${esc(r.unite || 'pers.')}`]];
  return `<div class="ps" aria-hidden="true">
  <header class="ps-head">
    <div class="ps-brand">${logoMedal('ps-drop')}</div>
    <div class="ps-title">
      <p class="ps-cat">${esc(r.cat.name)} · Miel conseillé : ${esc(shortHoney(r.miel))}</p>
      <h1>${esc(r.titre)}</h1>
      <p class="ps-lede">${esc(r.resume)}</p>
    </div>
    <img class="ps-photo" src="${img(r.photo, 700)}" alt="">
  </header>
  <ul class="ps-facts">${facts.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>
  <div class="ps-body">
    <aside class="ps-ing"><h2>Ingrédients</h2>${r.ingredientsHtml.replace(/<input type="checkbox">/g, '<i></i>')}
    ${r.conseil ? `<div class="ps-tip"><h3>Le conseil</h3>${r.conseil}</div>` : ''}</aside>
    <div class="ps-steps"><h2>Préparation</h2><ol>${r.steps.map((x) => `<li>${inline(x)}</li>`).join('')}</ol></div>
  </div>
  <footer class="ps-foot">
    <a class="ps-partner" href="https://mesabeilles.fr"><small>Fiche offerte par</small><b>MesAbeilles.fr</b></a>
    <p>Retrouvez cette recette, ${recipes.length} autres et le guide des miels sur <a href="${SITE.url}${r.url}"><b>cuisineaumiel.fr</b></a></p>
    <p class="ps-legal">Le miel ne doit pas être donné aux enfants de moins d'un an (recommandation de l'Anses).</p>
  </footer>
</div>`;
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
    <div class="quick">
      <div class="quick-toggles" role="group" aria-label="Filtres rapides">
        <button type="button" class="qt" data-quick="rapide" aria-pressed="false">${clockIcon} Moins de 30 min</button>
        <button type="button" class="qt" data-quick="budget" aria-pressed="false">€ Petit budget</button>
        <button type="button" class="qt" data-quick="veggie" aria-pressed="false">🌿 Végétarien</button>
      </div>
      <div class="quick-more">
        ${prefsPanel()}
        <a class="qt qt-dice" href="/recettes/" data-random>${diceSvg} Une recette au hasard</a>
        <a class="qt" href="/outils/frigo/">🧺 Avec ce que j'ai</a>
      </div>
    </div>
    <p class="hidden-note" hidden></p>
  </div>
  <p class="empty" hidden>Aucune recette ne correspond. Essayez un autre mot ou retirez un filtre.</p>
  ${grid(recipes, 'all')}
  ${shareCta('share-archive')}
  ${exploreHtml()}
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
  return `<nav class="toc" aria-label="Sommaire"><p class="toc-title"><span>Au sommaire</span><small>${hs.length} parties</small></p><ol>${hs.map((h, i) => `<li><a href="#${slugify(h)}"><span class="toc-n">${String(i + 1).padStart(2, '0')}</span><span>${inline(h)}</span></a></li>`).join('')}</ol></nav>`;
}
function sideToc(md) {
  const hs = [...md.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
  if (hs.length < 3) return '';
  return `<nav class="side-toc" aria-label="Dans cet article"><p>Dans cet article</p><div class="st-bar"><span></span></div><ol>${hs.map((h) => `<li><a href="#${slugify(h)}">${inline(h)}</a></li>`).join('')}</ol></nav>`;
}
function sideMarket(x, linked) {
  const pool = recipes.slice(0, 40);
  const picks = (linked && linked.length ? linked : [...pool].sort((a, b) => hash(a.slug + x.url) - hash(b.slug + x.url))).filter((r) => r !== recipes[0]).slice(0, 3);
  const day = recipes[0];
  const ico = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const tools = [
    ['/recettes/', ico('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'), 'Chercher une recette', 'Par miel, ingrédient ou envie'],
    ...(HAS_ATLAS ? [['/miels/atlas/', ico('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'), "L'atlas des miels", 'Tous les miels protégés, sur la carte']] : []),
    ['/outils/sucre-miel/', ico('<path d="M4 7h16M4 12h10M4 17h7"/><path d="M17 14l3 3-3 3"/>'), 'Sucre → miel', 'Adaptez vos recettes'],
    ['/guide/trouver-un-apiculteur/', ico('<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'), 'Trouver un apiculteur', 'Bien acheter son miel'],
  ];
  return `<div class="sm-day">
      <a href="${day.url}">
        <span class="sm-media">${picture(day.photo, day.titre, { ratio: '4 / 3', sizes: '320px' })}<span class="sm-badge">Nouvelle recette</span></span>
        <span class="sm-body"><b>${esc(day.titre)}</b><small>${clockIcon} ${totalTime(day)} · 🍯 ${esc(shortHoney(day.miel))}</small><span class="sm-cta">Voir la recette →</span></span>
      </a>
    </div>
    <div class="sm-box"><h2>${linked && linked.length ? 'Cuisinez ce miel' : 'Envie de cuisiner ?'}</h2>
      <ul class="sm-list">${picks.map((r) => `<li><a href="${r.url}">${picture(r.photo, r.titre, { ratio: '1 / 1', sizes: '64px' })}<span><b>${esc(r.titre)}</b><small>${totalTime(r)}</small></span></a></li>`).join('')}</ul>
      <a class="sm-more" href="/recettes/">Les ${recipes.length} recettes →</a>
    </div>
    <div class="sm-box sm-tools"><h2>Nos outils</h2>
      <ul>${tools.map(([u, i, t, d]) => `<li><a href="${u}"><span class="sm-ico">${i}</span><span><b>${t}</b><small>${d}</small></span></a></li>`).join('')}</ul>
    </div>
    <div class="sm-box sm-guide"><h2>Le guide des miels</h2>
      <ol>${pillars.map((g) => `<li><a href="${g.url}">${esc(g.titre_court || g.titre)}</a></li>`).join('')}<li><a href="/miels/">Toutes les fiches miels</a></li></ol>
    </div>`;
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
// Un accord mène aux recettes qui contiennent cet ingrédient (sinon aux recettes de ce miel).
const normTxt = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function pairChip(a, x) {
  const w = normTxt(a).replace(/s$/, '').split(/\s+/).filter((m) => m.length > 2).pop() || normTxt(a);
  const n = recipes.filter((r) => normTxt([r.titre, ...r.ingredientsList].join(' ')).includes(w)).length;
  const q = n ? w : normTxt(shortHoney(x.nom));
  return `<li><a href="/recettes/?q=${encodeURIComponent(q)}" title="${n ? `${n} recette${n > 1 ? 's' : ''} avec ${esc(a.toLowerCase())}` : `Nos recettes au ${esc(x.nom.toLowerCase())}`}">${esc(a)}${n ? ` <small>${n}</small>` : ''}</a></li>`;
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
    <ul class="chips">${listOf(x.accords).map((a) => pairChip(a, x)).join('')}</ul>
    ${x.boissons ? `<h3>Avec quoi le boire</h3><ul class="chips chips-drink">${listOf(x.boissons).map((a) => `<li><a href="/recettes/?q=${encodeURIComponent(shortHoney(x.nom).toLowerCase())}" title="Nos recettes au ${esc(x.nom.toLowerCase())}">${esc(a)}</a></li>`).join('')}</ul>` : ''}
  </div>` : ''}
</section>`;
}

// « L'essentiel » : réponse courte en tête de fiche, lisible par les lecteurs pressés et les assistants IA.
const lc = (t) => String(t || '').replace(/^./, (c) => c.toLowerCase());
function essentiel(x) {
  const n = x.nom.toLowerCase();
  const items = [
    x.plante && `Le ${n} provient de : ${plain(x.plante)}.`,
    x.couleur && x.gout && `Il est ${lc(plain(x.couleur))}, avec un goût ${lc(plain(x.gout))}.`,
    x.recolte && `Récolte : ${lc(plain(x.recolte))}.`,
    x.regions && `Principales régions : ${plain(x.regions)}.`,
    x.labels && `Signes officiels : ${plain(x.labels)}.`,
    x.accords && `Il se marie bien avec : ${lc(plain(x.accords))}.`,
  ].filter(Boolean);
  return `<section class="essentiel" aria-label="L'essentiel"><h2>L'essentiel</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
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
    ${isHoney ? essentiel(x) : ''}
    ${toc(x.main)}
    <div class="prose">${markdown(x.main)}</div>
    ${faqHtml(x.faq)}
    ${sourcesHtml(x.sources)}
    <p class="disclaimer">Le miel est un aliment plaisir, à consommer dans le cadre d'une alimentation variée. Il ne doit pas être donné aux enfants de moins d'un an (<a href="https://www.anses.fr/fr/content/pas-de-miel-les-enfants-de-moins-dun-an" rel="nofollow">recommandation de l'Anses</a>).</p>
  </article>
  <aside class="long-side">
    ${facts.length ? `<div class="facts"><h2>Fiche d'identité</h2><dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${inline(v)}</dd>`).join('')}</dl></div>` : ''}
    ${isHoney ? `<div class="side-box"><h2>Où l'acheter</h2><p>Chez un apiculteur, sur un marché ou à la ferme : notre guide pour <a href="/guide/trouver-un-apiculteur/">trouver un apiculteur près de chez vous</a>.</p></div>` : ''}
    ${sideMarket(x, linked)}
    ${sideToc(x.main)}
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

// ---------- atlas des miels ----------
const ATLAS = HAS_ATLAS ? JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'atlas.json'), 'utf8')) : null;
const PAYS = { fr: 'France', es: 'Espagne', pt: 'Portugal', it: 'Italie', gr: 'Grèce', pl: 'Pologne', lt: 'Lituanie', si: 'Slovénie', hr: 'Croatie', bg: 'Bulgarie', sk: 'Slovaquie', lu: 'Luxembourg', be: 'Belgique', tr: 'Turquie', nz: 'Nouvelle-Zélande', et: 'Éthiopie', br: 'Brésil', mx: 'Mexique', au: 'Australie', us: 'États-Unis', ca: 'Canada' };
const ZONES_EU = { A: 'Autriche', AL: 'Albanie', B: 'Belgique', BG: 'Bulgarie', BI: 'Îles britanniques', CH: 'Suisse', D: 'Allemagne', DK: 'Danemark', E: 'Espagne', F: 'France', GR: 'Grèce', HR: 'Croatie', I: 'Italie', L: 'Luxembourg', NL: 'Pays-Bas', P: 'Portugal', PL: 'Pologne', SLO: 'Slovénie', EE: "Europe de l'Est", SEE: 'Europe du Sud-Est', FS: 'Scandinavie et Finlande', EU: 'Toute l\'Europe', CAN: 'Canaries' };
const STATUT = { AOP: 'AOP', IGP: 'IGP', publiée: 'Demande publiée', demande: 'Demande déposée' };
const ficheLink = (slug, label) => { const h = honeys.find((x) => x.slug === slug); return h ? `<a href="${h.url}">${esc(label)}</a>` : esc(label); };
const paysTxt = (l) => l.map((c) => PAYS[c] || c).join(', ');

function dotsSvg({ d, w, h, pt, items, cls, label, pad = 0, r = 7, labels = false }) {
  const dots = items.filter((x) => x.lon != null).map((x) => { const [cx, cy] = pt(x.lon, x.lat); const lab = labels && x.court ? (() => { if (x.lab === 't') return `<text x="${cx.toFixed(1)}" y="${(cy - r - 10).toFixed(1)}" text-anchor="middle">${esc(x.court)}</text>`; const right = x.lab !== 'l'; return `<text x="${(cx + (right ? r + 6 : -r - 6)).toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(x.court)}</text>`; })() : ''; return `<a href="#${x.id}" class="dot ${x.cls}" data-id="${x.id}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"/>${lab}<title>${esc(x.nom)}${x.sub ? ` · ${esc(x.sub)}` : ''}</title></a>`; }).join('');
  return `<svg class="atlas-map ${cls}" viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}" role="img" aria-label="${esc(label)}"><rect x="${-pad}" y="${-pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" class="sea"/><path d="${d}" class="land"/>${dots}</svg>`;
}

function atlasPage() {
  const A = ATLAS;
  const prot = A.protege.map((x, i) => ({ ...x, id: `aop-${i + 1}`, cls: x.statut === 'AOP' ? 'aop' : x.statut === 'IGP' ? 'igp' : 'dem', sub: `${STATUT[x.statut]}${x.annee ? ` ${x.annee}` : ''}, ${paysTxt(x.pays)}` }));
  const monde = A.monde.map((x, i) => ({ ...x, id: `monde-${i + 1}`, cls: 'monde', sub: x.region }));
  const frPlants = A.europe.filter((x) => x.pays.includes('F'));
  const reg = prot.filter((x) => x.statut === 'AOP' || x.statut === 'IGP');
  const paysProt = [...new Set(prot.flatMap((x) => x.pays))];

  const E = GEO.europe, ep = E.proj, ept = (lon, lat) => [(lon - ep.lon0) * ep.k * ep.c, (ep.lat1 - lat) * ep.k];
  const F = GEO.france, fp = F.proj, fpt = (lon, lat) => [(lon - fp.lon0) * fp.k * fp.c, (fp.lat1 - lat) * fp.k];
  const M = GEO.monde, mpt = (lon, lat) => [(lon + 180) * M.proj.k, (84 - lat) * M.proj.k];
  const COURT = { 'Miel de sapin des Vosges': ['Sapin des Vosges', 'l'], 'Miel d\'Alsace': ['Alsace', 'r'], 'Miel de Corse – Mele di Corsica': ['Corse', 'l'], 'Miel de Provence': ['Provence', 'r'], 'Miel des Cévennes': ['Cévennes', 't'], 'Miel de tilleul de Picardie': ['Tilleul de Picardie', 'r'], 'Miel des Landes': ['Landes', 'r'] };
  const frItems = prot.filter((x) => x.pays.includes('fr')).map((x) => ({ ...x, court: (COURT[x.nom] || [])[0], lab: (COURT[x.nom] || [])[1] }));

  const legend = `<ul class="legend"><li><i class="aop"></i>AOP enregistrée</li><li><i class="igp"></i>IGP enregistrée</li><li><i class="dem"></i>Demande en cours</li><li><i class="monde"></i>Miel emblématique hors UE</li></ul>`;
  const filters = (id, opts) => `<div class="filters" data-target="${id}"><label class="f-search"><span class="sr">Rechercher</span><input type="search" placeholder="Rechercher un miel, une plante, un pays…" data-f="q"></label>${opts.map(([key, label, values]) => `<label><span class="sr">${label}</span><select data-f="${key}"><option value="">${label}</option>${values.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`).join('')}<output class="f-count" aria-live="polite"></output></div>`;

  const protRows = prot.map((x) => `<tr id="${x.id}" data-pays="${x.pays.join(' ')}" data-statut="${x.cls}"><td><b>${x.fiche ? ficheLink(x.fiche, x.nom) : esc(x.nom)}</b>${x.plante ? `<small>${esc(x.plante)}</small>` : ''}${x.site ? `<small><a href="${x.site}" rel="noopener" target="_blank">Site officiel (INAO) ↗</a></small>` : ''}</td><td>${esc(paysTxt(x.pays))}</td><td><span class="tag ${x.cls}">${STATUT[x.statut]}</span></td><td>${x.annee || '—'}</td></tr>`).join('');
  const plantRows = A.europe.map((x) => `<tr data-pays="${x.pays.join(' ')}" data-type="${x.type}"><td><b>${x.fiche ? ficheLink(x.fiche, x.nom) : esc(x.nom)}</b><small><i>${esc(x.latin)}</i></small></td><td>${x.type === 'miellat' ? 'Miellat' : 'Fleurs'}</td><td>${esc(x.pays.map((c) => ZONES_EU[c] || c).join(', '))}</td></tr>`).join('');
  const mondeCards = monde.map((x) => `<article class="world-card" id="${x.id}"><span class="card-cat">${esc(paysTxt(x.pays))}</span><h3>${x.fiche ? ficheLink(x.fiche, x.nom) : esc(x.nom)}</h3>${x.region !== paysTxt(x.pays) ? `<p class="wc-region">${esc(x.region)}</p>` : ''}<p><b>Plante :</b> ${esc(x.plante)}</p><p>${esc(x.note)}</p><p class="wc-src">Source : <a href="${x.src[1]}" rel="noopener">${esc(x.src[0])}</a></p></article>`).join('');
  const zoneOpts = Object.entries(ZONES_EU).filter(([k]) => A.europe.some((x) => x.pays.includes(k)));

  const faq = [
    { q: 'Combien de miels sont protégés par une appellation en Europe ?', a: `Le registre officiel de l'Union européenne compte ${reg.length} miels enregistrés en AOP ou en IGP, dont ${reg.filter((x) => x.pays.includes('fr')).length} en France. ${prot.length - reg.length} autres demandes sont en cours, surtout en Turquie.` },
    { q: 'Quelle différence entre AOP et IGP pour un miel ?', a: "Pour une AOP, toutes les étapes de production ont lieu dans l'aire délimitée et le lien avec le terroir est le plus fort. Pour une IGP, au moins une étape a lieu dans l'aire et le miel doit sa réputation ou une qualité à son origine." },
    { q: 'Combien de miels monofloraux existe-t-il en Europe ?', a: `Une étude de référence publiée dans la revue *Apidologie* recense ${A.europe.length} plantes et miellats capables de donner un miel monofloral en Europe, dont ${frPlants.length} en France.` },
    { q: 'Le miel est-il vraiment souvent fraudé ?', a: "Oui. Le miel est l'un des aliments les plus fraudés au monde. Lors d'une enquête coordonnée par la Commission européenne en 2021-2022, 46 % des 320 échantillons de miels importés analysés étaient suspects d'être frelatés, le plus souvent avec des sirops de sucre." },
  ];
  const sources = [
    "Commission européenne, [registre des indications géographiques eAmbrosia](https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/), consulté le 5 novembre 2026.",
    "Persano Oddo L. et al., « [Botanical species giving unifloral honey in Europe](https://doi.org/10.1051/apido:2004045) », *Apidologie*, 35 (Suppl. 1), S82-S93, 2004.",
    "Commission européenne, « [From the Hives](https://food.ec.europa.eu/food-safety/eu-agri-food-fraud-network/eu-coordinated-actions/honey-2021-2022_en) », action coordonnée contre la fraude au miel, 2021-2022.",
    ...[...new Map(monde.map((x) => [x.src[1], `${x.src[0]}, [${x.src[1].replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}](${x.src[1]})`])).values()],
  ];
  const trail = [['Accueil', '/'], ['Le guide des miels', '/miels/'], ["L'atlas des miels"]];
  const body = `
${longBanner("L'atlas des miels", 'Tous les miels protégés d\'Europe, les plantes à miel et les grands miels du monde, sur la carte.', '1774284266228-27698569b2fd', crumbsHtml(trail))}
<section class="wrap block-tight atlas">
  <div class="stats">
    <div><b>${reg.length}</b><span>miels AOP et IGP enregistrés dans l'Union européenne</span></div>
    <div><b>${A.europe.length}</b><span>plantes et miellats donnant un miel monofloral en Europe</span></div>
    <div><b>${frPlants.length}</b><span>miels monofloraux recensés en France</span></div>
    <div class="st-alert"><b>46 %</b><span>des miels importés contrôlés par l'UE étaient suspects de fraude</span></div>
  </div>
  <aside class="fraud"><div class="fraud-big" aria-hidden="true"><b>46&nbsp;%</b><span>des miels importés contrôlés</span></div><div><p class="kicker">Alerte fraude</p><h2>Le miel, l'un des aliments les plus fraudés au monde</h2><p>Lors de l'enquête « From the Hives » coordonnée par la Commission européenne en 2021-2022, <b>46 % des 320 échantillons</b> de miels importés analysés étaient suspects d'être frelatés, le plus souvent avec des sirops de sucre. Les appellations de cet atlas, l'étiquette et la vente directe sont vos meilleurs repères. <a href="/guide/trouver-un-apiculteur/">Comment bien acheter son miel →</a></p></div></aside>

  <nav class="atlas-nav" aria-label="Dans l'atlas"><a href="#france">France</a><a href="#europe">Europe</a><a href="#monde">Monde</a><a href="#plantes">Toutes les plantes à miel</a></nav>

  <section id="france" class="atlas-sec">
    ${sectionTitle('Les miels de France', `${reg.filter((x) => x.pays.includes('fr')).length} appellations et ${frPlants.length} miels monofloraux`)}
    <div class="atlas-duo">
      <figure class="viz">${dotsSvg({ d: F.d, w: F.w, h: F.h, pt: fpt, items: frItems, cls: 'map-fr', label: 'Carte des appellations de miel en France', pad: 20, r: 13, labels: true })}<figcaption>${legend}</figcaption></figure>
      <div class="fr-list">
        <h3>Les appellations</h3>
        <ul class="ap-list">${prot.filter((x) => x.pays.includes('fr')).map((x) => `<li data-id="${x.id}"><span class="tag ${x.cls}">${x.statut}</span><span>${x.fiche ? ficheLink(x.fiche, x.nom) : esc(x.nom)}</span><small>depuis ${x.annee}</small>${x.site ? `<a class="ap-off" href="${x.site}" rel="noopener" target="_blank">Site officiel</a>` : ''}</li>`).join('')}</ul>
        <p class="hid-note">« Site officiel » : la fiche de l'appellation à l'INAO, avec son cahier des charges.</p>
        <h3>Les miels monofloraux de France</h3>
        <ul class="chips chips-fr">${frPlants.map((x) => x.fiche ? `<li class="on"><a href="${honeys.find((h) => h.slug === x.fiche)?.url || '#'}">${esc(x.nom)}</a></li>` : `<li>${esc(x.nom)}</li>`).join('')}</ul>
        <p class="hid-note">En couleur : les miels qui ont déjà leur fiche complète dans notre guide.</p>
      </div>
    </div>
  </section>

  <section id="europe" class="atlas-sec">
    ${sectionTitle('Les miels protégés d\'Europe', `${prot.length} appellations et demandes dans ${paysProt.length} pays`)}
    <figure class="viz">${dotsSvg({ d: E.d, w: E.w, h: E.h, pt: ept, items: prot, cls: 'map-eu', label: 'Carte des miels AOP et IGP en Europe', r: 7 })}<figcaption>${legend}<p class="hid-note">Les Açores et les Canaries apparaissent sur la carte du monde.</p></figcaption></figure>
    ${filters('t-prot', [['pays', 'Tous les pays', paysProt.map((c) => [c, PAYS[c]]).sort((a, b) => a[1].localeCompare(b[1], 'fr'))], ['statut', 'Tous les statuts', [['aop', 'AOP'], ['igp', 'IGP'], ['dem', 'Demande en cours']]]])}
    <div class="table-wrap"><table class="atlas-table" id="t-prot"><thead><tr><th>Miel</th><th>Pays</th><th>Statut</th><th>Année</th></tr></thead><tbody>${protRows}</tbody></table></div>
  </section>

  <section id="monde" class="atlas-sec">
    ${sectionTitle('Les grands miels du monde', 'Des forêts de Tasmanie aux hauts plateaux éthiopiens')}
    <figure class="viz">${dotsSvg({ d: M.d, w: M.w, h: M.h, pt: mpt, items: [...prot, ...monde], cls: 'map-world', label: 'Carte des miels du monde', r: 5 })}<figcaption>${legend}</figcaption></figure>
    <div class="world-grid">${mondeCards}</div>
    <p class="hid-note">L'atlas s'enrichit régulièrement. Chaque miel ajouté est appuyé par une source officielle ou reconnue.</p>
  </section>

  <section id="plantes" class="atlas-sec">
    ${sectionTitle('Toutes les plantes à miel d\'Europe', `${A.europe.length} plantes et miellats qui donnent un miel monofloral`)}
    ${filters('t-plantes', [['pays', 'Tous les pays', zoneOpts.sort((a, b) => a[1].localeCompare(b[1], 'fr'))], ['type', 'Fleurs et miellats', [['fleurs', 'Miels de fleurs'], ['miellat', 'Miels de miellat']]]])}
    <div class="table-wrap"><table class="atlas-table" id="t-plantes"><thead><tr><th>Plante</th><th>Type</th><th>Où on le récolte</th></tr></thead><tbody>${plantRows}</tbody></table></div>
  </section>

  <div class="long-foot">${faqHtml(faq)}${sourcesHtml(sources)}<p class="disclaimer">Le miel ne convient pas aux enfants de moins d'un an (recommandation de l'Anses).</p></div>
</section>`;
  return layout({ title: "L'atlas des miels : tous les miels AOP, IGP et monofloraux d'Europe et du monde", description: `Carte interactive et liste complète des miels : ${reg.length} miels AOP et IGP en Europe, ${A.europe.length} plantes à miel, et les grands miels du monde. Sources officielles.`, canonical: '/miels/atlas/', body, extraHead: ldScript(crumbsLd(trail)) + ldScript(faqLd(faq)) + ldScript({ '@context': 'https://schema.org', '@type': 'Dataset', name: "L'atlas des miels", description: 'Liste des miels protégés par une appellation en Europe, des plantes à miel européennes et de miels emblématiques du monde.', url: SITE.url + '/miels/atlas/', dateModified: A.maj, creator: { '@type': 'Organization', name: 'Cuisine au miel' }, isBasedOn: ['https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/', 'https://doi.org/10.1051/apido:2004045'] }) });
}


// Résumé du site pour les assistants IA (convention llms.txt).
function llmsTxt() {
  const line = (u, t, d) => `- [${plain(t)}](${SITE.url}${u})${d ? `: ${plain(d)}` : ''}`;
  return `# ${SITE.name}

> Site français consacré au miel en cuisine : ${recipes.length} recettes au miel sucrées et salées, un guide complet des variétés de miel avec une fiche sourcée par miel, un atlas de tous les miels protégés d'Europe et du monde, et un magazine d'actualité sur le miel et l'apiculture. Proposé par le GAEC des Deux Vallées, exploitation apicole.

Règles éditoriales : chaque fiche et chaque article cite ses sources (textes officiels européens, INAO, revues scientifiques comme Apidologie, organismes publics). Aucune allégation de santé : le miel est présenté comme un aliment de plaisir et de bien-être, conformément au règlement (CE) n° 1924/2006. Le miel ne convient pas aux enfants de moins d'un an (recommandation de l'Anses).

## Guide des miels
${line('/miels/', 'Le guide des miels', 'toutes les variétés, leur goût, leur couleur, leur saison et leurs usages')}
${honeys.map((h) => line(h.url, h.titre, h.resume)).join('\n')}
${HAS_ATLAS ? line('/miels/atlas/', "L'atlas des miels", "liste de tous les miels AOP et IGP d'Europe, des plantes à miel et des grands miels du monde, avec cartes") : ''}

## Guides pratiques
${pillars.map((g) => line(g.url, g.titre, g.resume)).join('\n')}

## Magazine
${posts.map((a) => line(a.url, a.titre, a.resume)).join('\n')}

## Recettes
${line('/recettes/', 'Toutes les recettes au miel', '')}
${CATEGORIES.map((c) => line(`/categories/${c.slug}/`, c.name, '')).join('\n')}

## Recettes récentes
${recipes.slice(0, 30).map((r) => line(r.url, r.titre, r.resume)).join('\n')}
`;
}

// Flux Pinterest : un flux par tableau, image verticale 2:3 pour chaque page.
const pinImg = (photo) => /^\d/.test(photo || '') ? `https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=1000&h=1500&q=75` : `${SITE.url}/img/${photo || 'chef-sel'}-2000.jpg`;
function pinFeed(title, desc, items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${esc(title)}</title><link>${SITE.url}/</link><description>${esc(desc)}</description><language>fr-FR</language>
${items.map((x) => `<item><title>${esc(plain(x.titre))}</title><link>${SITE.url}${x.url}</link><guid>${SITE.url}${x.url}</guid>${x.date ? `<pubDate>${new Date(x.date).toUTCString()}</pubDate>` : ''}<description>${esc(plain(x.resume || ''))}</description><media:content url="${esc(pinImg(x.photo))}" medium="image"/><enclosure url="${esc(pinImg(x.photo))}" type="image/jpeg" length="0"/></item>`).join('\n')}
</channel></rss>`;
}
// ---------- page À propos ----------
function aboutPage() {
  const nbSources = new Set([...honeys, ...pillars, ...posts].flatMap((x) => x.sources.map((s) => (s.match(/\]\((https?:[^)]+)\)/) || [])[1]).filter(Boolean))).size;
  const nbAppellations = ATLAS ? ATLAS.protege.filter((x) => x.statut === 'AOP' || x.statut === 'IGP').length : 0;
  const tiles = [
    ['/recettes/', 'Les recettes', `${recipes.length} recettes sucrées et salées, et de nouvelles chaque semaine.`, own('chef-dressage', '', { ratio: '4 / 5', sizes: '(min-width: 900px) 300px, 50vw' })],
    ['/miels/', 'Le guide des miels', 'Une fiche complète et sourcée pour chaque miel.', picture('1752776132399-59fb3579e854', '', { ratio: '4 / 5', sizes: '(min-width: 900px) 300px, 50vw' })],
    ['/miels/atlas/', "L'atlas des miels", 'Tous les miels protégés d\'Europe et du monde, sur la carte.', picture('1774284266228-27698569b2fd', '', { ratio: '4 / 5', sizes: '(min-width: 900px) 300px, 50vw' })],
    ['/magazine/', 'Le magazine', "L'actualité du miel et de l'apiculture, décryptée.", picture('1784873230783-967a9263d4c4', '', { ratio: '4 / 5', sizes: '(min-width: 900px) 300px, 50vw' })],
  ];
  const timeline = [
    ['il y a 9 000 ans', 'Les premiers agriculteurs utilisent déjà la cire d\'abeille.'],
    ['vers 2450 av. J.-C.', 'Les Égyptiens représentent les premiers ruchers organisés.'],
    ['il y a 3 000 ans', 'Le rucher de Tel Rehov compte des dizaines de ruches en argile.'],
    ['1852', 'Langstroth invente la ruche à cadres mobiles.'],
    ['aujourd\'hui', 'Le miel est l\'un des aliments les plus fraudés au monde.'],
  ];
  const svg = (d) => `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const pillarsAbout = [
    [svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M8 7h8M8 11h6"/>'), 'Des sources solides', 'Textes officiels, organismes publics, revues scientifiques : chaque fiche cite ses sources, en bas de page.'],
    [svg('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>'), 'Aucune promesse santé', "Le miel est un aliment de plaisir et de bien-être. Nous respectons la loi : pas d'allégation de santé."],
    [svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'), 'Toute la transparence', 'Origine, étiquette, appellations, fraude : les clés pour choisir un vrai miel.'],
  ];
  const simg = (id, alt) => picture(id, alt, { ratio: '4 / 3', sizes: '(min-width: 900px) 560px, 100vw' });
  const stories = [
    [simg('1752776132399-59fb3579e854', 'Rayon de miel'), "L'alchimie de la ruche", 'Une œuvre collective', [
      "Le miel naît d'un travail d'équipe d'une précision étonnante. Les butineuses récoltent le nectar des fleurs ou le miellat, puis le transmettent à leurs sœurs de la ruche, de bouche en bouche. À chaque étape, les abeilles l'enrichissent de leurs propres enzymes.",
      "Vient ensuite la patience : déposé dans les alvéoles, le nectar est ventilé par le battement de milliers d'ailes jusqu'à perdre l'essentiel de son eau. Quand il est mûr, les abeilles le scellent sous un fin couvercle de cire, l'opercule. Le miel est prêt, et il se conserve remarquablement bien.",
    ]],
    [simg('1774284266228-27698569b2fd', 'Pots de miels de couleurs différentes'), 'Mille miels, mille terroirs', 'Le reflet d\'un paysage', [
      "Il n'existe pas un miel, mais des centaines. Presque blanc ou presque noir, liquide comme un sirop ou crémeux comme un beurre, doux et floral ou puissant et boisé : chaque miel porte la signature d'une fleur, d'une forêt, d'une saison.",
      "L'acacia est d'une douceur limpide, le châtaignier franc et légèrement amer, la lavande parfumée comme un été en Provence, le sapin des Vosges sombre et balsamique. Goûter un miel, c'est voyager. Nos <a href=\"/miels/\">fiches miels</a> et notre <a href=\"/miels/atlas/\">atlas</a> vous emmènent partout en France et dans le monde.",
    ]],
    [own('chef-dressage', 'Assiette dressée avec du miel', { ratio: '4 / 3', sizes: '(min-width: 900px) 560px, 100vw' }), 'Un ingrédient de chef', 'Bien plus qu\'une tartine', [
      "En cuisine, le miel est un formidable allié. Il caramélise une volaille, laque un légume rôti, arrondit une vinaigrette, réveille un fromage, parfume un thé ou une pâtisserie. Il garde les gâteaux moelleux et donne de belles couleurs dorées.",
      "Chaque variété a son caractère, et donc ses accords. Un miel doux pour sucrer sans masquer, un miel corsé pour tenir tête à un plat de caractère. Nos recettes vous montrent comment en tirer le meilleur, du petit-déjeuner au dîner.",
    ]],
    [simg('1784873230783-967a9263d4c4', 'Petit-déjeuner au miel'), 'Énergie, sport et bien-être', 'Le compagnon des journées actives', [
      "Sportifs du dimanche ou passionnés, randonneurs, cyclistes, coureurs : beaucoup glissent un peu de miel dans leur sac. Nous vous proposons des idées gourmandes pour accompagner vos journées actives : petits-déjeuners, barres et encas maison, boissons pour avant et après l'effort.",
      "Le miel est avant tout un aliment de plaisir, à savourer dans le cadre d'une alimentation variée et équilibrée et d'une bonne hygiène de vie. Nous ne lui prêtons aucune vertu miraculeuse : c'est la loi, et c'est aussi notre conviction.",
    ]],
  ];
  const trail = [['Accueil', '/'], ['À propos']];
  const body = `
<section class="about-hero">
  ${picture('1587049352851-8d4e89133924', '', { cls: 'banner-bg', ratio: 'auto', eager: true, sizes: '100vw' })}
  <div class="about-hero-inner">
    ${crumbsHtml(trail)}
    <p class="kicker">À propos</p>
    <h1>Mieux comprendre le miel,<br><em>pour mieux l'utiliser.</em></h1>
    <p>Connu depuis la nuit des temps, déposé dans les tombes des pharaons, chanté par les poètes… et pourtant si mal connu aujourd'hui. Bienvenue chez celles et ceux qui veulent le redécouvrir.</p>
  </div>
</section>

<section class="wrap about-manifesto">
  <div class="am-text">
    <p class="kicker">Notre conviction</p>
    <h2>Le miel mérite mieux qu'une place de second rôle.</h2>
    <p>On le range parmi les sucres, on le réduit à la tartine du matin, on le soupçonne parfois de tous les défauts. Pendant ce temps, il est devenu l'un des aliments les plus fraudés au monde, coupé au sirop et vendu sous de fausses origines.</p>
    <p>Étrange destin pour l'un des produits les plus extraordinaires que la nature nous offre. Pourquoi tant de méfiance ? À qui profite cette confusion ? La question mérite d'être posée.</p>
    <p>Nous avons créé ce site pour <b>rétablir la vérité</b>, avec nos armes : des faits vérifiés, des sources solides et de bonnes recettes. Pas de discours miracle, pas de mode passagère. Juste le miel, tel qu'il est, et tout ce qu'il peut apporter à votre table.</p>
    <p>Car mieux le connaître, c'est mieux le choisir. Et mieux le choisir, c'est soutenir celles qui le font naître : les abeilles, et les femmes et les hommes qui veillent sur elles.</p>
  </div>
  <blockquote class="am-quote"><p>« C'est de l'or à l'état pur, et les abeilles en sont les reines. »</p></blockquote>
</section>

<section class="about-band">
  <div class="wrap about-stats">
    <div><b>${recipes.length}</b><span>recettes au miel</span></div>
    <div><b>${honeys.length}</b><span>fiches miels détaillées</span></div>
    <div><b>${nbAppellations}</b><span>appellations recensées dans l'atlas</span></div>
    <div><b>${nbSources}</b><span>sources citées</span></div>
  </div>
</section>

<section class="wrap block about-stories">
  ${sectionTitle('Le miel, ce trésor', 'Quatre raisons de le regarder autrement')}
  ${stories.map(([im, k, t, ps], i) => `<article class="about-story${i % 2 ? ' rev' : ''}"><div class="as-img">${im}</div><div class="as-txt"><p class="kicker">${k}</p><h3>${t}</h3>${ps.map((x) => `<p>${x}</p>`).join('')}</div></article>`).join('')}
</section>

<section class="wrap block">
  ${sectionTitle('Un produit vivant', 'Façonné par les abeilles, depuis toujours')}
  <div class="about-living">
    <p>Le miel n'est pas un produit figé. Il évolue dans le pot : il cristallise, change de texture et de couleur avec le temps. Chaque miel raconte une fleur, un paysage, une saison et le travail patient d'une colonie entière. Pour un seul pot, des milliers d'abeilles ont butiné, transformé, ventilé et operculé.</p>
    <ol class="timeline">${timeline.map(([d, t]) => `<li><b>${d}</b><span>${t}</span></li>`).join('')}</ol>
    <p class="more"><a class="btn-outline" href="/guide/histoire-du-miel/">Lire l'histoire du miel</a></p>
  </div>
</section>

<section class="wrap block">
  ${sectionTitle('Nos engagements', 'Ce qui nous guide, page après page')}
  <div class="about-pillars">${pillarsAbout.map(([i, t, d]) => `<div class="ap-card"><span class="ap-ico">${i}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
</section>

<section class="wrap block">
  ${sectionTitle('Ce que vous trouverez ici', 'Cuisiner, comprendre, choisir')}
  <div class="about-tiles">${tiles.map(([u, t, d, im]) => `<a class="about-tile" href="${u}">${im}<span class="at-txt"><b>${t}</b><small>${d}</small></span></a>`).join('')}</div>
  <p class="about-sport">Et aussi des idées pour le sport et le quotidien : recettes pour avant et après l'effort, petits-déjeuners et encas maison.</p>
</section>

<section class="wrap block">
  <div class="about-who">
    <span class="about-logo">${logoMedal('lg-drop-2')}</span>
    <div>
      <p class="kicker">Qui sommes-nous ?</p>
      <h2>Proposé par le GAEC des Deux Vallées</h2>
      <p><b>Nous sommes apiculteurs.</b> Derrière Cuisine au miel, il y a une exploitation agricole attachée à son territoire, au rythme des saisons et au respect du vivant. Nos ruches, nos récoltes et nos saisons passées au rucher nous ont appris à regarder les abeilles avec admiration, et à connaître le miel de l'intérieur.</p>
      <p>Nous avons créé ce site pour partager cette passion et donner à chacun les clés pour comprendre, choisir et cuisiner le miel. Un projet sincère, que nous faisons grandir chaque semaine, avec de nouvelles recettes, de nouvelles fiches et de nouveaux articles.</p>
    </div>
  </div>
  <div class="about-cta">
    <h2>Le miel n'a pas fini de <em>vous surprendre.</em></h2>
    <p>Commencez par une recette, une fiche ou une carte : il y a toujours quelque chose à découvrir.</p>
    <p class="about-cta-btns"><a class="btn" href="/recettes/">Voir les recettes</a> <a class="btn-outline" href="/miels/">Explorer les miels</a></p>
  </div>
  <p class="disclaimer">Le miel ne doit pas être donné aux enfants de moins d'un an, même cuit, en raison du risque de botulisme infantile (<a href="https://www.anses.fr/fr/content/pas-de-miel-les-enfants-de-moins-dun-an">recommandation de l'Anses</a>).</p>
</section>`;
  return layout({ title: 'À propos', description: "Cuisine au miel, proposé par le GAEC des Deux Vallées : mieux comprendre le miel pour mieux l'utiliser. Recettes, guide des miels, atlas et magazine, avec des sources solides et sans promesse santé.", canonical: '/a-propos/', body, extraHead: ldScript(crumbsLd(trail)) + ldScript({ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'À propos de Cuisine au miel', url: SITE.url + '/a-propos/', about: { '@id': SITE.url + '/#org' } }) });
}

const MIELLEES = { 'miel-de-romarin': [[3, 5]], 'miel-d-oranger': [[3, 5]], 'miel-de-bruyere': [[4, 5], [8, 9]], 'miel-de-thym': [[4, 6]], 'miel-d-acacia': [[5, 5]], 'miel-de-chataignier': [[6, 7]], 'miel-de-tilleul': [[6, 7]], 'miel-de-lavande': [[7, 8]], 'miel-de-sapin': [[7, 8]], 'miel-de-sarrasin': [[7, 9]], 'miel-toutes-fleurs': [[4, 8]] };
function calendarPage() {
  const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  const MOISL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const cur = today.getMonth() + 1;
  const rows = honeys.map((h) => ({ h, r: MIELLEES[h.url.split('/').filter(Boolean).pop()] || [] })).filter((x) => x.r.length).sort((a, b) => a.r[0][0] - b.r[0][0] || a.r[0][1] - b.r[0][1]);
  const now = rows.filter((x) => x.r.some(([a, b]) => cur >= a && cur <= b));
  const trail = [['Accueil', '/'], ['Outils', '/outils/'], ['Calendrier des miellées']];
  const body = `
${pageHead('Le calendrier des miellées', 'Quand récolte-t-on le miel de lavande, de châtaignier ou d\'acacia ? Le calendrier des grands miels de France, mois par mois.', 'salade-printemps', crumbsHtml(trail))}
<section class="wrap block">
  <div class="cal-now"><p class="kicker">En ${MOISL[cur - 1]}</p><p>${now.length ? `Saison de récolte : ${now.map((x) => `<a href="${x.h.url}">${esc(x.h.nom)}</a>`).join(', ')}.` : 'Les ruches se reposent : c\'est l\'hivernage. Les abeilles vivent sur leurs réserves, et c\'est le moment de déguster les miels de l\'année.'}</p></div>
  <div class="cal-wrap"><table class="cal">
    <thead><tr><th scope="col">Miel</th>${MOIS.map((m, i) => `<th scope="col"${i + 1 === cur ? ' class="cur"' : ''}>${m}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(({ h, r }) => `<tr><th scope="row"><a href="${h.url}">${esc(h.nom.replace(/^Miel /, ''))}</a></th>${MOIS.map((_, i) => { const m = i + 1; const on = r.some(([a, b]) => m >= a && m <= b); return `<td class="${on ? 'on' : ''}${m === cur ? ' cur' : ''}">${on ? '<span></span>' : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <div class="prose tool-txt">
    <h2>Qu'est-ce qu'une miellée ?</h2>
    <p>La <b>miellée</b> est la période pendant laquelle une plante produit beaucoup de nectar, ou un arbre beaucoup de miellat, et où les abeilles récoltent en abondance. Elle dépend de la floraison, de la météo et de la région : une même plante fleurit plus tôt dans le Sud que dans le Nord, ou en plaine qu'en montagne.</p>
    <p>Pour produire des miels monofloraux, les apiculteurs placent leurs ruches au plus près des floraisons, et pratiquent parfois la <b>transhumance</b> : ils déplacent leurs ruches d'une miellée à l'autre, des romarins du printemps aux lavandes de l'été.</p>
    <p>Les périodes de ce calendrier sont indicatives et valent pour la France. Elles varient d'une année à l'autre : en 2026, les canicules ont par exemple fortement réduit la récolte. Chaque <a href="/miels/">fiche miel</a> détaille ses régions et ses sources.</p>
  </div>
</section>`;
  return layout({ title: 'Calendrier des miellées : quand récolte-t-on chaque miel ?', description: 'Le calendrier des récoltes des grands miels de France, mois par mois : romarin, acacia, châtaignier, tilleul, lavande, sapin, sarrasin, bruyère…', canonical: '/outils/calendrier-des-miellees/', body, extraHead: ldScript(crumbsLd(trail)) });
}

const QUIZ = [
  { q: 'Au petit-déjeuner, vous êtes plutôt…', a: [
    ['Tartine douce, sans surprise', { 'miel-d-acacia': 2, 'miel-de-romarin': 2, 'miel-toutes-fleurs': 1 }],
    ['Yaourt, fruits et parfums fleuris', { 'miel-d-oranger': 2, 'miel-de-lavande': 2 }],
    ['Pain complet et saveurs franches', { 'miel-de-chataignier': 2, 'miel-de-sarrasin': 2 }],
    ['Une infusion bien chaude', { 'miel-de-tilleul': 2, 'miel-de-thym': 1, 'miel-de-sapin': 1 }],
  ] },
  { q: 'Le paysage qui vous fait rêver…', a: [
    ['Les champs de lavande de Provence', { 'miel-de-lavande': 3, 'miel-de-romarin': 1 }],
    ['Une forêt de montagne', { 'miel-de-sapin': 3, 'miel-de-chataignier': 1 }],
    ['Une lande sauvage', { 'miel-de-bruyere': 3, 'miel-de-sarrasin': 1 }],
    ['Un verger en fleurs', { 'miel-d-oranger': 2, 'miel-d-acacia': 1, 'miel-toutes-fleurs': 1 }],
  ] },
  { q: 'En cuisine, vous aimez…', a: [
    ['Sucrer sans changer le goût', { 'miel-d-acacia': 3 }],
    ['Le sucré-salé et les fromages', { 'miel-de-chataignier': 2, 'miel-de-thym': 2 }],
    ['Les pâtisseries parfumées', { 'miel-d-oranger': 2, 'miel-de-lavande': 1, 'miel-de-sarrasin': 1 }],
    ['Un peu de tout, selon l\'humeur', { 'miel-toutes-fleurs': 3 }],
  ] },
  { q: 'Votre texture idéale ?', a: [
    ['Bien liquide, qui coule', { 'miel-d-acacia': 2, 'miel-de-chataignier': 1, 'miel-de-sapin': 1 }],
    ['Crémeuse, qui se tartine', { 'miel-de-romarin': 2, 'miel-de-lavande': 1, 'miel-de-tilleul': 1 }],
    ['Épaisse et dense', { 'miel-de-sapin': 1, 'miel-de-sarrasin': 1, 'miel-de-bruyere': 2 }],
    ['Peu importe, c\'est le goût qui compte', { 'miel-de-thym': 2, 'miel-toutes-fleurs': 1 }],
  ] },
  { q: 'Et côté intensité ?', a: [
    ['Tout en douceur', { 'miel-d-acacia': 2, 'miel-de-romarin': 1, 'miel-d-oranger': 1 }],
    ['Fleuri et parfumé', { 'miel-de-lavande': 2, 'miel-d-oranger': 1, 'miel-de-tilleul': 1 }],
    ['Aromatique et chaleureux', { 'miel-de-thym': 2, 'miel-de-sapin': 2 }],
    ['Puissant, avec du caractère', { 'miel-de-chataignier': 2, 'miel-de-sarrasin': 2, 'miel-de-bruyere': 1 }],
  ] },
];
function quizPage() {
  const trail = [['Accueil', '/'], ['Outils', '/outils/'], ['Quel miel est fait pour vous ?']];
  const hdata = Object.fromEntries(honeys.map((h) => { const slug = h.url.split('/').filter(Boolean).pop(); return [slug, { nom: h.nom, url: h.url, gout: h.gout || '', resume: h.resume || '', photo: h.photo && /^\d/.test(h.photo) ? img(h.photo, 800) : '' }]; }));
  const body = `
${pageHead('Quel miel est fait pour vous ?', 'Cinq questions pour trouver le miel qui vous ressemble, et les recettes qui vont avec.', 'chef-dressage', crumbsHtml(trail))}
<section class="wrap block quiz" data-quiz>
  <div class="quiz-card">
    <div class="quiz-progress"><span></span></div>
    ${QUIZ.map((x, i) => `<fieldset class="quiz-q"${i ? ' hidden' : ''}><legend><small>Question ${i + 1} sur ${QUIZ.length}</small>${esc(x.q)}</legend><div class="quiz-a">${x.a.map(([t, sc]) => `<button type="button" data-score='${JSON.stringify(sc)}'>${esc(t)}</button>`).join('')}</div></fieldset>`).join('')}
    <div class="quiz-res" hidden aria-live="polite"></div>
  </div>
  <script type="application/json" id="quiz-honeys">${JSON.stringify(hdata).replace(/</g, '\\u003c')}</script>
  <p class="quiz-note">Un jeu pour découvrir les miels : il n'y a pas de bonne ou de mauvaise réponse. Les profils de goût viennent de nos <a href="/miels/">fiches miels</a>.</p>
</section>`;
  return layout({ title: 'Quiz : quel miel est fait pour vous ?', description: 'Acacia, lavande, châtaignier, sapin ? Répondez à 5 questions et découvrez le miel qui vous ressemble, avec ses recettes.', canonical: '/outils/quel-miel/', body, extraHead: ldScript(crumbsLd(trail)) });
}

function menuPage() {
  const trail = [['Accueil', '/'], ['Outils', '/outils/'], ['Menu de la semaine']];
  const pick = (cats) => recipes.filter((r) => cats.includes(r.cat.slug)).map((r) => ({ t: r.titre, u: r.url, d: totalTime(r), i: r.ingredientsList || [], s: SAISON_DATA[r.slug] || [], img: img(r.photo, 400), p: `${r.portions} ${r.unite || 'pers.'}` }));
  const data = { plats: pick(['plats', 'aperitifs-entrees']), desserts: pick(['desserts', 'patisserie']), saison: saisonNow ? saisonNow.slug : '' };
  const body = `
${pageHead('Le menu de la semaine', 'Sept idées de repas au miel, de saison, et la liste de courses qui va avec. Changez un plat d\'un clic.', 'pappardelle-bandeau', crumbsHtml(trail))}
<section class="wrap block menu" data-menu>
  <div class="menu-bar">
    <label class="tool-check"><input type="checkbox" id="m-dessert"> Ajouter un dessert</label>
    <button type="button" class="btn-outline" data-new>Un autre menu</button>
    <button type="button" class="btn" data-print>Imprimer le menu et la liste</button>
  </div>
  <ol class="menu-days"></ol>
  <div class="menu-list">
    <h2>La liste de courses</h2>
    <p class="menu-hint">Les quantités sont celles des recettes. Pensez à vérifier vos placards : sel, poivre, huile et miel sont souvent déjà là.</p>
    <div class="menu-groups"></div>
  </div>
  <script type="application/json" id="menu-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</section>`;
  return layout({ title: 'Menu de la semaine au miel et liste de courses', description: 'Un menu de la semaine au miel, de saison, généré en un clic, avec la liste de courses à imprimer.', canonical: '/outils/menu-de-la-semaine/', body, extraHead: ldScript(crumbsLd(trail)) });
}

const PARTNER_MAIL = ['samuel', 'fedorawiez.com'];
const PARTENAIRES = fs.existsSync(path.join(ROOT, 'data', 'partenaires.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'partenaires.json'), 'utf8')) : [];
const DEPTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'departements.json'), 'utf8'));
function partnersPage() {
  const trail = [['Accueil', '/'], ['Apiculteurs partenaires']];
  const ico = (d) => `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const D = DEPTS;
  const byDep = {};
  PARTENAIRES.forEach((x) => { (byDep[x.departement] = byDep[x.departement] || []).push(x); });
  const card = (x) => `<article class="pt-card"><p class="kicker">${esc(x.commune || '')}</p><h3>${esc(x.nom)}</h3>${x.exploitation ? `<p class="pt-exp">${esc(x.exploitation)}</p>` : ''}${x.miels ? `<p>${esc(x.miels)}</p>` : ''}${x.vente ? `<p class="pt-vente">${esc(x.vente)}</p>` : ''}${x.site ? `<a href="${esc(x.site)}" rel="nofollow noopener" target="_blank">Voir le site</a>` : ''}</article>`;
  const depData = Object.fromEntries(D.deps.map((d) => [d.code, { nom: d.nom, html: (byDep[d.code] || []).map(card).join('') }]));
  const map = `<svg class="dep-map" viewBox="-10 -10 ${D.w + 20} ${D.h + 20}" role="group" aria-label="Carte des départements de France">${D.deps.map((d) => `<path d="${d.d}" class="dep${byDep[d.code] ? ' has' : ''}" data-dep="${d.code}" tabindex="0" role="button" aria-label="${esc(d.nom)} (${d.code})${byDep[d.code] ? `, ${byDep[d.code].length} apiculteur(s)` : ''}"><title>${esc(d.nom)} (${d.code})</title></path>`).join('')}</svg>`;
  const opts = D.deps.map((d) => `<option value="${d.code}">${d.code} · ${esc(d.nom)}</option>`).join('');
  const charte = [
    [ico('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>'), 'Leur propre miel', 'Ils vendent le miel de leurs ruches, récolté par eux-mêmes.'],
    [ico('<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'), 'Une origine claire', 'Le lieu des ruchers et le pays de récolte sont indiqués sans ambiguïté.'],
    [ico('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M8 7h8M8 11h6"/>'), 'Une étiquette conforme', 'Dénomination, origine et mentions obligatoires respectent la réglementation.'],
    [ico('<path d="M3 11h18c0 5-4 9-9 9s-9-4-9-9z"/><path d="M12 11V4"/>'), 'Un miel pur', 'Rien n\'est ajouté au miel : ni sucre, ni sirop, ni arôme.'],
  ];
  const gains = [
    [ico('<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>'), 'Votre exploitation présentée', 'Une fiche complète : votre histoire, vos ruchers, vos miels, vos points de vente, vos horaires, votre site et vos réseaux.'],
    [ico('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'), 'Vos miels dans nos recettes', 'Un lien vers votre miel depuis plusieurs recettes du site qui l\'utilisent, là où nos lecteurs cherchent quoi acheter.'],
    [ico('<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'), 'Sur la carte de votre département', 'Les amateurs de miel de votre région vous trouvent en un clic, au plus près de chez eux.'],
    [ico('<path d="M4 4h16v16H4z"/><path d="M4 8l8 5 8-5"/>'), 'Un contact personnel', 'Dès l\'ouverture, nous vous écrivons pour vous présenter les modalités d\'entrée dans l\'annuaire.'],
  ];
  const body = `
${pageHead('Les apiculteurs partenaires', 'Des femmes et des hommes passionnés, qui récoltent leur propre miel et le vendent en direct. Bientôt, trouvez le vôtre près de chez vous.', 'salade-printemps', crumbsHtml(trail))}
<section class="wrap block">
  ${sectionTitle('Trouver un apiculteur près de chez vous', PARTENAIRES.length ? `${PARTENAIRES.length} apiculteurs partenaires` : 'L\'annuaire ouvre bientôt : cliquez sur votre département')}
  <div class="dep-wrap">
    <figure class="dep-fig">${map}</figure>
    <div class="dep-panel" aria-live="polite">
      <label class="dep-pick"><span>Choisir un département</span><select id="dep-select"><option value="">Votre département…</option>${opts}</select></label>
      <div id="dep-out">
        <p class="kicker">Mode d'emploi</p>
        <h3>Cliquez sur votre département</h3>
        <p>Vous verrez les apiculteurs partenaires installés près de chez vous, leurs miels et où les acheter.</p>
        <p class="dep-note">Nous sélectionnons nos premiers partenaires un par un. En attendant, notre guide vous explique <a href="/guide/trouver-un-apiculteur/">comment trouver un bon apiculteur</a>.</p>
      </div>
    </div>
  </div>
  <script type="application/json" id="dep-data">${JSON.stringify(depData).replace(/</g, '\\u003c')}</script>
</section>
<section class="wrap block" id="liste-attente">
  <div class="wl">
    <div class="wl-intro">
      <p class="kicker">Vous êtes apiculteur ?</p>
      <h2>Inscrivez-vous sur la <em>liste d'attente</em></h2>
      <p>Nous sommes nous-mêmes apiculteurs, au sein du <a href="/a-propos/">GAEC des Deux Vallées</a> : nous savons ce que représente une récolte. Laissez-nous vos coordonnées : dès que l'annuaire ouvrira, nous vous recontacterons avec les modalités d'entrée.</p>
      <ul class="wl-gains">${gains.map(([i, t, d]) => `<li><span class="ap-ico">${i}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ul>
    </div>
    <form class="wl-form" id="wl-form" data-mail="${PARTNER_MAIL[0]}" data-domain="${PARTNER_MAIL[1]}" novalidate>
      <h3>Rejoindre la liste d'attente</h3>
      <label>Nom et prénom<input name="nom" required autocomplete="name"></label>
      <label>Nom de l'exploitation<input name="exploitation" required autocomplete="organization"></label>
      <div class="wl-row"><label>Département<select name="departement" required><option value="">Choisir…</option>${opts}</select></label><label>Commune<input name="commune" autocomplete="address-level2"></label></div>
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label><span>Téléphone <small>(facultatif)</small></span><input name="tel" type="tel" autocomplete="tel"></label>
      <label>Vos miels<textarea name="miels" rows="2" placeholder="Acacia, châtaignier, toutes fleurs…"></textarea></label>
      <label><span>Site web ou réseaux <small>(facultatif)</small></span><input name="site" type="url" placeholder="https://"></label>
      <p class="wl-err" hidden>Merci de remplir les champs : nom, exploitation, département et e-mail.</p>
      <button class="btn" type="submit">M'inscrire sur la liste d'attente</button>
      <p class="pt-small">Votre messagerie s'ouvre avec votre inscription déjà rédigée : il ne reste qu'à l'envoyer. Vos coordonnées servent uniquement à vous recontacter au sujet de l'annuaire.</p>
    </form>
  </div>
</section>
<section class="wrap block">
  ${sectionTitle('Notre charte', 'Ce que nous demanderons à chaque partenaire')}
  <div class="about-pillars pt-charte">${charte.map(([i, t, d]) => `<div class="ap-card"><span class="ap-ico">${i}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  <p class="hid-note">Carte des départements : IGN Admin Express, Licence Ouverte Etalab.</p>
</section>`;
  return layout({ title: 'Apiculteurs partenaires : trouver un producteur de miel près de chez vous', description: 'La carte des apiculteurs partenaires de Cuisine au miel, département par département : des producteurs qui récoltent et vendent leur propre miel. Apiculteur ? Inscrivez-vous sur la liste d\'attente.', canonical: '/apiculteurs-partenaires/', body, extraHead: ldScript(crumbsLd(trail)) });
}

function toolsHub() {
  const trail = [['Accueil', '/'], ['Outils']];
  const ico = (d) => `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const tools = [
    ['/outils/frigo/', ico('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M9 6v2M9 13v3"/>'), "Que cuisiner avec ce que j'ai ?", 'Cochez ce qu\'il y a dans votre frigo et vos placards : on vous propose les recettes au miel qui collent.', 'Nouveau'],
    ['/recettes/airfryer/', ico('<rect x="4" y="3" width="16" height="18" rx="4"/><circle cx="12" cy="11" r="4"/><path d="M8 18h8"/>'), 'Recettes au Airfryer', 'Nos recettes au miel adaptées à la friteuse sans huile, avec les bons réglages.', 'Nouveau'],
    ['/recettes/sans-four/', ico('<path d="M3 12h18"/><path d="M5 12a7 7 0 0 0 14 0"/><path d="M9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4"/>'), 'Sans four', 'À la poêle ou à la casserole : les recettes qui se font sans allumer le four.', ''],
    ['/carnet/', ico('<path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/>'), 'Mon carnet de recettes', 'Gardez vos recettes préférées d\'un clic sur le cœur, sans créer de compte, et faites la liste de courses.', 'Nouveau'],
    ['/proposer-une-recette/', ico('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'), 'Proposer votre recette', AVIS.api && AVIS.lecture ? 'Prenez votre fiche recette en photo : le formulaire se remplit tout seul. Les meilleures sont publiées avec votre prénom.' : 'Vous avez une recette au miel de famille ? Envoyez-la : les meilleures sont publiées avec votre prénom.', 'Nouveau'],
    ['/outils/sucre-miel/', ico('<path d="M4 7h16M4 12h10M4 17h7"/><path d="M17 14l3 3-3 3"/>'), 'Remplacer le sucre par du miel', 'Le calculateur qui adapte n\'importe quelle recette : quantité de miel, liquide, bicarbonate et four.', 'Nouveau'],
    ['/outils/calendrier-des-miellees/', ico('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'), 'Le calendrier des miellées', 'Quand récolte-t-on chaque miel ? Les grands miels de France, mois par mois.', 'Nouveau'],
    ['/outils/quel-miel/', ico('<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/>'), 'Quel miel est fait pour vous ?', 'Le quiz en 5 questions pour trouver le miel qui vous ressemble.', 'Quiz'],
    ['/outils/menu-de-la-semaine/', ico('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>'), 'Menu de la semaine', 'Sept repas au miel de saison et la liste de courses, en un clic.', 'Nouveau'],
    ['/recettes/', ico('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'), 'Trouver une recette', `Cherchez parmi nos ${recipes.length} recettes par miel, ingrédient ou envie.`, ''],
    [`/recettes/saison/${saisonNow ? saisonNow.slug : 'automne'}/`, ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'), 'Cuisiner de saison', 'Les recettes au miel du printemps, de l\'été, de l\'automne et de l\'hiver.', ''],
    [ACCORD_PAGES.length ? `/recettes/${ACCORD_PAGES[0].slug}/` : '/recettes/', ico('<path d="M8 3v7a4 4 0 0 0 8 0V3"/><path d="M12 14v7M9 21h6"/>'), 'Les accords au miel', 'Miel et citron, miel et fromage, miel et romarin… toutes les associations qui marchent.', ''],
    ...(HAS_ATLAS ? [['/miels/atlas/', ico('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'), "L'atlas des miels", 'Tous les miels AOP et IGP d\'Europe et les grands miels du monde, sur la carte.', '']] : []),
    ['/recettes/' + (recipes[0] ? recipes[0].slug + '/' : ''), ico('<path d="M6 13.9V20h12v-6.1"/><path d="M6 14a4 4 0 1 1 2.6-7A4.5 4.5 0 0 1 17 6.1 4 4 0 1 1 18 14z"/>'), 'Le mode cuisine', 'Sur chaque recette : une étape à la fois, en grand, et l\'écran reste allumé.', ''],
    ['/guide/glossaire-du-miel/', ico('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M8 7h8M8 11h6"/>'), 'Le glossaire du miel', 'Miellat, opercule, monofloral… tous les mots du miel expliqués simplement.', ''],
    ['/guide/trouver-un-apiculteur/', ico('<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'), 'Trouver un apiculteur', 'Où et comment acheter un vrai miel, près de chez vous.', ''],
    ['/apiculteurs-partenaires/', ico('<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M9 12l2 2 4-4"/>'), 'Les apiculteurs partenaires', 'L\'annuaire des producteurs qui vendent leur propre miel. Apiculteur ? Rejoignez-nous.', ''],
  ];
  const body = `
${pageHead('Nos outils', 'Calculateur, recherche, saisons, accords, atlas : tout pour choisir et cuisiner le miel facilement.', 'decoupe-cuisine', crumbsHtml(trail))}
<section class="wrap block">
  <div class="tools-grid">${tools.map(([u, i, t, d, tag]) => `<a class="tool-tile" href="${u}"><span class="tt-ico">${i}</span>${tag ? `<span class="tt-tag">${tag}</span>` : ''}<b>${t}</b><span>${d}</span><span class="tt-go">Ouvrir →</span></a>`).join('')}</div>
</section>`;
  return layout({ title: 'Nos outils pour cuisiner le miel', description: 'Calculateur sucre vers miel, recherche de recettes, recettes de saison, accords, atlas des miels et mode cuisine : les outils gratuits de Cuisine au miel.', canonical: '/outils/', body, extraHead: ldScript(crumbsLd(trail)) });
}

function sugarTool() {
  const trail = [['Accueil', '/'], ['Outils', '/outils/'], ['Remplacer le sucre par du miel']];
  const faq = [
    { q: 'Combien de miel pour remplacer 100 g de sucre ?', a: 'Comptez environ 85 g de miel pour 100 g de sucre remplacés. Le miel a un pouvoir sucrant un peu plus élevé et il apporte de l\'eau.' },
    { q: 'Peut-on remplacer tout le sucre par du miel ?', a: 'Pour la pâtisserie, on conseille de commencer par la moitié du sucre. Au-delà, la texture change : gâteau plus dense, plus humide et qui colore plus vite.' },
    { q: 'Pourquoi baisser la température du four ?', a: 'Les sucres du miel caramélisent plus vite que le sucre blanc. En baissant le four d\'environ 15 °C, le gâteau dore sans brûler.' },
  ];
  const body = `
${pageHead('Remplacer le sucre par du miel', 'Le calculateur pour adapter n\'importe quelle recette : quantité de miel, liquide à retirer, bicarbonate et température du four.', 'decoupe-cuisine', crumbsHtml(trail))}
<section class="wrap block tool">
  <div class="tool-card">
    <div class="tool-in">
      <label for="t-sugar">Sucre dans la recette</label>
      <div class="tool-num"><input id="t-sugar" type="number" inputmode="decimal" min="0" max="2000" step="5" value="200"><span>g</span></div>
      <fieldset class="tool-part">
        <legend>Quelle quantité de sucre voulez-vous remplacer par du miel ?</legend>
        <label><input type="radio" name="t-part" value="25"><span><b>Un quart</b><small>Goût de miel léger</small></span></label>
        <label><input type="radio" name="t-part" value="50" checked><span><b>La moitié</b><small>Conseillé</small></span></label>
        <label><input type="radio" name="t-part" value="75"><span><b>Les trois quarts</b><small>Goût de miel marqué</small></span></label>
        <label><input type="radio" name="t-part" value="100"><span><b>Tout</b><small>Plus de sucre du tout</small></span></label>
      </fieldset>
      <p class="tool-explain" id="t-explain"></p>
      <p class="tool-warn" id="t-warn" hidden>Au-delà de la moitié, le gâteau sera plus dense, plus moelleux et dorera plus vite : faites un premier essai.</p>
      <label class="tool-check"><input id="t-bake" type="checkbox" checked> C'est une recette cuite au four</label>
    </div>
    <div class="tool-out" aria-live="polite">
      <div class="to-main"><span>Miel</span><b id="o-honey">85 g</b><small id="o-spoons">soit environ 4 cuillères à soupe</small></div>
      <ul>
        <li><span>Sucre restant</span><b id="o-sugar">100 g</b></li>
        <li><span>Liquide à retirer</span><b id="o-liquid">15 ml</b></li>
        <li class="o-bake"><span>Bicarbonate à ajouter</span><b id="o-soda">1 pincée</b></li>
        <li class="o-bake"><span>Four</span><b>−15 °C</b></li>
      </ul>
    </div>
  </div>
  <div class="prose tool-txt">
    <h2>Comment ça marche</h2>
    <p>Le miel n'est pas un sucre comme les autres. Il contient généralement <b>15 à 20 % d'eau</b> (la directive européenne fixe un maximum de 20 % pour la plupart des miels), il sucre un peu plus que le sucre blanc à poids égal, il est légèrement acide et il colore plus vite à la cuisson. Pour réussir la substitution, on ajuste donc quatre choses :</p>
    <ol>
      <li><b>La quantité</b> : environ 85 g de miel pour 100 g de sucre remplacés.</li>
      <li><b>Les liquides</b> : on retire un peu de lait, d'eau ou de jus pour compenser l'eau du miel, environ 18 ml pour 100 g de miel.</li>
      <li><b>Le bicarbonate</b> : une petite pincée neutralise l'acidité du miel et aide la pâte à lever.</li>
      <li><b>Le four</b> : on baisse d'environ 15 °C pour éviter que le gâteau ne brunisse trop vite.</li>
    </ol>
    <p>Ces repères sont ceux des services de vulgarisation agricole américains et des pâtissiers. Ils restent indicatifs : chaque recette réagit différemment, et le goût du miel compte. Un miel doux comme l'acacia s'efface ; un miel de châtaignier ou de sarrasin marque la recette. Voir nos <a href="/miels/">fiches miels</a> pour choisir.</p>
    <h2>Les bons réflexes</h2>
    <ul>
      <li>Huilez légèrement la cuillère ou la tasse : le miel glisse tout seul.</li>
      <li>Incorporez le miel avec les ingrédients liquides, pour une pâte homogène.</li>
      <li>Pour les biscuits croustillants, gardez une partie du sucre : le miel rend les pâtes plus moelleuses.</li>
      <li>Le miel ne doit pas être donné aux enfants de moins d'un an, même cuit.</li>
    </ul>
  </div>
  ${faqHtml(faq)}
  ${sourcesHtml(['University of Kentucky, Cooperative Extension, « [Honey](https://fcs.mgcafe.uky.edu/commodity/honey) », fiche Plate it up! Kentucky Proud.', 'The Kitchn, « [4 rules for successfully swapping honey for sugar in any baked goods](https://www.thekitchn.com/4-rules-for-successfully-swapping-honey-for-sugar-in-any-baked-goods-230156) ».', 'Union européenne, [directive 2001/110/CE relative au miel](https://eur-lex.europa.eu/eli/dir/2001/110/oj), annexe II.', 'Anses, « [Pas de miel pour les enfants de moins d\'un an](https://www.anses.fr/fr/content/pas-de-miel-les-enfants-de-moins-dun-an) », 2023.'])}
</section>`;
  return layout({ title: 'Remplacer le sucre par du miel : le calculateur', description: 'Combien de miel pour remplacer le sucre ? Notre calculateur gratuit adapte vos recettes : quantité de miel, liquide à retirer, bicarbonate et température du four.', canonical: '/outils/sucre-miel/', body, extraHead: [crumbsLd(trail), faqLd(faq), { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Calculateur sucre vers miel', applicationCategory: 'LifestyleApplication', operatingSystem: 'Tous', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: SITE.url + '/outils/sucre-miel/', inLanguage: 'fr-FR' }].map(ldScript).join('\n') });
}

// ---------- saisons et accords miel + ingrédient ----------
const SAISON_DATA = fs.existsSync(path.join(ROOT, 'data', 'saisons.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'saisons.json'), 'utf8')) : {};
const SAISONS = [
  { slug: 'printemps', nom: 'Printemps', de: 'de printemps', photo: 'salade-printemps', mois: [2, 3, 4], lede: 'Herbes fraîches, premiers légumes, fruits rouges : des recettes légères et lumineuses, adoucies au miel.' },
  { slug: 'ete', nom: 'Été', de: "d'été", photo: 'chef-sel', mois: [5, 6, 7], lede: 'Grillades, desserts glacés, fruits rôtis et boissons fraîches : le miel se met à l\'heure de l\'été.' },
  { slug: 'automne', nom: 'Automne', de: "d'automne", photo: 'decoupe-legumes', mois: [8, 9, 10], lede: 'Figues, pommes, courges, coings et noix : la saison la plus gourmande pour cuisiner le miel.' },
  { slug: 'hiver', nom: 'Hiver', de: "d'hiver", photo: 'vieux-livre', mois: [11, 0, 1], lede: 'Plats mijotés, épices, boissons chaudes et pain d\'épices : des recettes réconfortantes au miel.' },
];
const saisonNow = SAISONS.find((x) => x.mois.includes(today.getMonth()));
const inSaison = (r, sa) => (SAISON_DATA[r.slug] || []).includes(sa.slug);
const saisonList = (sa) => recipes.filter((r) => inSaison(r, sa));
function saisonPage(sa) {
  const list = saisonList(sa);
  const trail = [['Accueil', '/'], ['Recettes', '/recettes/'], [`Recettes ${sa.de}`]];
  const body = `
${pageHead(`Recettes au miel ${sa.de}`, sa.lede, sa.photo, crumbsHtml(trail))}
<section class="wrap block">
  <nav class="season-nav" aria-label="Saisons">${SAISONS.map((x) => `<a href="/recettes/saison/${x.slug}/"${x === sa ? ' aria-current="page"' : ''}>${x.nom}${x === saisonNow ? ' <small>maintenant</small>' : ''}</a>`).join('')}</nav>
  ${sectionTitle(`${list.length} recettes ${sa.de}`, 'Choisies selon la saison de leurs ingrédients principaux')}
  ${grid(list)}
  <h2 class="season-more">Et toute l'année</h2>
  ${grid(recipes.filter((r) => !SAISON_DATA[r.slug]).slice(0, 8))}
</section>`;
  return layout({ title: `Recettes au miel ${sa.de}`, description: `${list.length} recettes au miel ${sa.de}. ${sa.lede}`, canonical: `/recettes/saison/${sa.slug}/`, body, extraHead: [crumbsLd(trail), { '@context': 'https://schema.org', '@type': 'ItemList', name: `Recettes au miel ${sa.de}`, itemListElement: list.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + r.url })) }].map(ldScript).join('\n') });
}
const ACCORDS = [
  ['citron', 'citron', /citron/, "Le miel et le citron forment un duo classique : l'acidité vive du citron équilibre la rondeur sucrée du miel. On les retrouve dans les vinaigrettes, les laques, les boissons chaudes ou glacées et les pâtisseries."],
  ['romarin', 'romarin', /romarin/, "Le romarin apporte une note résineuse et méditerranéenne qui s'accorde naturellement avec les miels de garrigue. Il parfume les viandes rôties, les fruits au four et même les citronnades."],
  ['thym', 'thym', /\bthym\b/, "Le thym et le miel partagent les mêmes paysages : ceux des collines du Sud. Ensemble, ils subliment les fromages chauds, les légumes rôtis et les viandes."],
  ['gingembre', 'gingembre', /gingembre/, "Le gingembre apporte du piquant et de la fraîcheur, que le miel vient arrondir. Un accord idéal pour les plats d'inspiration asiatique, les veloutés et les boissons."],
  ['moutarde', 'moutarde', /moutarde/, "Le mariage du miel et de la moutarde est un grand classique des sauces : doux et piquant à la fois, il nappe les viandes, les salades et les légumes."],
  ['noix', 'noix', /\bnoix\b/, "Les noix et le miel, c'est l'automne dans l'assiette : un contraste de croquant et de fondant, parfait avec les fromages, les salades et les desserts."],
  ['fromage', 'fromage', /feta|chevre|camembert|halloumi|ricotta|fromage|parmesan|mascarpone|burrata/, "Fromage et miel : l'un des accords les plus spectaculaires. Le sel et le gras du fromage rencontrent la douceur du miel, chaud ou froid."],
  ['figue', 'figues', /figue/, "Figue et miel partagent une douceur profonde et un parfum de fin d'été. Rôties, en chutney ou sur une tartine, elles s'accordent aussi très bien avec le salé."],
  ['pomme', 'pommes', /\bpommes?\b(?! de terre)/, "La pomme et le miel sont les piliers des desserts d'automne : tartes, porridges et compotes gagnent en caractère avec un miel bien choisi."],
  ['soja', 'sauce soja', /soja/, "Le salé de la sauce soja et la douceur du miel créent des laques brillantes et caramélisées, pour le poulet, le saumon, le tofu ou les légumes."],
  ['cannelle', 'cannelle', /cannelle/, "La cannelle et le miel réchauffent tout ce qu'ils touchent : boissons d'hiver, porridges, pains d'épices et fruits pochés."],
  ['orange', 'orange', /orange/, "L'orange apporte une acidité douce et un parfum qui se marient au miel dans les plats de fête, les sauces et les desserts."],
  ['amande', 'amandes', /amande/, "L'amande et le miel sont unis depuis l'Antiquité, du nougat aux financiers. Un accord de douceur et de croquant."],
  ['yaourt', 'yaourt', /yaourt|yogourt/, "Un filet de miel sur un yaourt, c'est le plus simple des desserts. Mais le duo s'invite aussi dans les gâteaux, les sauces et les petits-déjeuners."],
];
const exploreHtml = (r) => {
  const ss = r ? SAISONS.filter((sa) => inSaison(r, sa)) : SAISONS;
  const aa = r ? ACCORD_PAGES.filter((a) => a.list.includes(r)) : ACCORD_PAGES;
  const cc = r ? COLLECTIONS.filter((c) => c.all.includes(r)) : COLLECTIONS;
  if (!ss.length && !aa.length && !cc.length) return '';
  return `<div class="explore">${cc.length ? `<div><h2>${r ? 'Dans nos sélections' : 'Nos sélections'}</h2><ul class="chips">${cc.map((c) => `<li><a href="${c.url}">${esc(c.court || c.titre)} <small>${c.all.length}</small></a></li>`).join('')}</ul></div>` : ''}${ss.length ? `<div><h2>${r ? 'De saison' : 'Recettes de saison'}</h2><ul class="chips">${ss.map((sa) => `<li${sa === saisonNow ? ' class="on"' : ''}><a href="/recettes/saison/${sa.slug}/">${sa.nom} <small>${saisonList(sa).length}</small></a></li>`).join('')}</ul></div>` : ''}${aa.length ? `<div><h2>${r ? 'Dans les mêmes accords' : 'Les accords au miel'}</h2><ul class="chips">${aa.map((a) => `<li><a href="/recettes/${a.slug}/">Miel et ${a.nom} <small>${a.list.length}</small></a></li>`).join('')}</ul></div>` : ''}</div>`;
};
const accordList = (re) => recipes.filter((r) => re.test(normTxt([r.titre, ...(r.ingredientsList || [])].join(' '))));
const ACCORD_PAGES = ACCORDS.map(([slug, nom, re, intro]) => ({ slug: `miel-et-${slug}`, nom, intro, list: accordList(re) })).filter((a) => a.list.length >= 3);
function accordPage(a) {
  const trail = [['Accueil', '/'], ['Recettes', '/recettes/'], [`Miel et ${a.nom}`]];
  const others = ACCORD_PAGES.filter((x) => x !== a);
  const body = `
${pageHead(`Miel et ${a.nom} : ${a.list.length} recettes`, a.intro, 'decoupe-cuisine', crumbsHtml(trail))}
<section class="wrap block">
  ${grid(a.list)}
  <div class="accord-more"><h2>Autres accords au miel</h2><ul class="chips">${others.map((x) => `<li><a href="/recettes/${x.slug}/">Miel et ${x.nom} <small>${x.list.length}</small></a></li>`).join('')}</ul></div>
</section>`;
  return layout({ title: `Miel et ${a.nom} : ${a.list.length} recettes`, description: `${a.list.length} recettes qui associent le miel et ${a.nom === 'fromage' ? 'le fromage' : a.nom}. ${a.intro}`.slice(0, 300), canonical: `/recettes/${a.slug}/`, body, extraHead: [crumbsLd(trail), { '@context': 'https://schema.org', '@type': 'ItemList', name: `Recettes miel et ${a.nom}`, itemListElement: a.list.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + r.url })) }].map(ldScript).join('\n') });
}

// ---------- collections thématiques : Noël, Airfryer, sans four, sans cuisson ----------
// data/collections.json : sections de recettes choisies à la main, ou liste automatique (« auto »).
const COLLECTIONS = (fs.existsSync(path.join(ROOT, 'data', 'collections.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'collections.json'), 'utf8')) : []).map((c) => {
  const bySlug = Object.fromEntries(recipes.map((r) => [r.slug, r]));
  const usesOven = (r) => /\bfour\b|enfourn/i.test(r.steps.join(' '));
  const AUTO = {
    'sans-four': () => recipes.filter((r) => minutes(r.cuisson) > 5 && !usesOven(r)),
    'sans-cuisson': () => recipes.filter((r) => minutes(r.cuisson) <= 5 && !usesOven(r)),
  };
  const sections = c.auto ? [{ titre: '', list: AUTO[c.auto]() }] : (c.sections || []).map((x) => ({ titre: x.titre, list: x.recettes.map((k) => bySlug[k]).filter(Boolean) })).filter((x) => x.list.length);
  const all = [...new Set(sections.flatMap((x) => x.list))];
  return { ...c, url: `/recettes/${c.slug}/`, sections, all };
}).filter((c) => c.all.length >= 3);
function collectionPage(c) {
  const trail = [['Accueil', '/'], ['Recettes', '/recettes/'], [c.court || c.titre]];
  const faq = (c.faq || []).map((f) => ({ q: f.q, a: f.a }));
  const body = `
${pageHead(c.titre, c.lede, c.photo, crumbsHtml(trail))}
<section class="wrap block-tight">
  <nav class="season-nav coll-nav" aria-label="Collections">${COLLECTIONS.map((x) => `<a href="${x.url}"${x === c ? ' aria-current="page"' : ''}>${esc(x.court || x.titre)}</a>`).join('')}</nav>
  <div class="coll-intro"><p>${inline(c.intro || '')}</p>${(c.conseils || []).length ? `<div class="tip coll-tips"><h2>🐝 Nos conseils</h2><ul>${c.conseils.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></div>` : ''}</div>
  ${c.sections.map((x) => `${x.titre ? sectionTitle(esc(x.titre), `${x.list.length} recette${x.list.length > 1 ? 's' : ''}`) : sectionTitle(`${x.list.length} recettes`, '')}${grid(x.list)}`).join('\n  ')}
  ${faqHtml(faq)}
</section>`;
  return layout({ title: c.titre, description: c.lede, canonical: c.url, body, extraHead: [crumbsLd(trail), faqLd(faq), { '@context': 'https://schema.org', '@type': 'ItemList', name: c.titre, itemListElement: c.all.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + r.url })) }].filter(Boolean).map(ldScript).join('\n') });
}

// ---------- boutique, carnet, frigo, proposer une recette ----------
// data/boutique.json : la boutique de miel de l'apiculteur. L'encart n'apparaît que si « url » est rempli.
// data/avis.json : adresse du service d'avis (Cloudflare Worker, voir avis/LISEZMOI.md). Vide = section masquée.
// ── Valeurs nutritionnelles estimées (table Ciqual de l'Anses) ──
// Affichées seulement si chaque ingrédient est reconnu ou négligeable (sel, épices, herbes, eau…).
const NUTRI = fs.existsSync(path.join(ROOT, 'data', 'nutrition.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'nutrition.json'), 'utf8')) : null;
const NUTRI_RULES = NUTRI ? NUTRI.regles.map((x) => ({ ...x, re: new RegExp(x.m) })) : [];
const NUTRI_NEG = NUTRI ? new RegExp(NUTRI.negligeables) : null;
const NUTRI_EXCL = NUTRI ? new RegExp(NUTRI.exclure) : null;
const NUTRI_MISS = new Map();
const num = (s) => (s === '½' ? 0.5 : s === '¼' ? 0.25 : s === '¾' ? 0.75 : parseFloat(s.replace(',', '.')));
function nutriLine(line) {
  const t = nrm(plain(line)).replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?|½|¼|¾)\s*(kg|g|cl|ml|l|c\. a soupe|c\. a cafe|pincees?)?\s+(?:de |d')?(.*)$/);
  const qty = m ? num(m[1]) : null, unit = m ? m[2] || '' : '', rest = m ? m[3] : t;
  const name = rest.replace(/\s*\(.*?\)/g, '').split(/ ou /)[0].trim();
  if (NUTRI_EXCL.test(name)) return { excl: true };
  const rule = NUTRI_RULES.find((x) => x.re.test(name));
  if (unit.startsWith('pincee')) return rule ? { g: 0.4 * qty, a: NUTRI.aliments[rule.c] } : { g: 0 };
  if (!rule || qty == null) return NUTRI_NEG.test(name) ? { g: 0 } : null;
  const d = rule.d || 1;
  let g;
  if (unit === 'g') g = qty; else if (unit === 'kg') g = qty * 1000;
  else if (unit === 'cl') g = qty * 10 * d; else if (unit === 'ml') g = qty * d; else if (unit === 'l') g = qty * 1000 * d;
  else if (unit === 'c. a soupe') g = qty * (rule.cs || 15 * d);
  else if (unit === 'c. a cafe') g = qty * (rule.cs || 15 * d) / 3;
  else {
    const w = rest.match(/(?:de|d'environ|environ)\s+(\d+(?:[.,]\d+)?)\s*(kg|g)\b/);
    if (w) g = qty * num(w[1]) * (w[2] === 'kg' ? 1000 : 1);
    else if (rule.u) g = qty * rule.u;
    else return NUTRI_NEG.test(name) ? { g: 0 } : null;
  }
  return { g: g * (rule.k || 1), a: NUTRI.aliments[rule.c] };
}
const nutritionOf = (r) => {
  if (!NUTRI) return null;
  if (r._nutri !== undefined) return r._nutri;
  const tot = { kcal: 0, p: 0, g: 0, s: 0, l: 0, ags: 0, f: 0, sel: 0 };
  let ok = true, mass = 0;
  for (const line of r.ingredientsList) {
    const x = nutriLine(line);
    if (x && x.excl) { ok = false; break; }
    if (!x) { ok = false; NUTRI_MISS.set(plain(line), (NUTRI_MISS.get(plain(line)) || 0) + 1); continue; }
    if (x.a) { mass += x.g; for (const k in tot) tot[k] += x.a[k] * x.g / 100; }
  }
  if (!ok) return (r._nutri = null);
  // Pots, bocaux, sauces : une « portion » n'a pas de sens, on donne les valeurs pour 100 g.
  const per100 = /^(pots?|bocaux|bocal)$/i.test(r.unite || '') || r.portions === 1;
  const div = per100 ? mass / 100 : r.portions;
  for (const k in tot) tot[k] /= div;
  tot.per100 = per100;
  return (r._nutri = tot);
};
const fmtN = (v) => (v < 0.05 ? '&lt; 0,1' : v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
function nutritionHtml(r) {
  const n = nutritionOf(r);
  if (!n) return '';
  const unit = n.per100 ? '100 g' : r.unite ? `1 ${esc(r.unite.replace(/(x|s)$/, ''))}` : '1 personne';
  const rows = [['Énergie', `${Math.round(n.kcal)} kcal <small>(${Math.round(n.kcal * 4.184)} kJ)</small>`], ['Matières grasses', `${fmtN(n.l)} g`], ['dont acides gras saturés', `${fmtN(n.ags)} g`, 1], ['Glucides', `${fmtN(n.g)} g`], ['dont sucres', `${fmtN(n.s)} g`, 1], ['Fibres', `${fmtN(n.f)} g`], ['Protéines', `${fmtN(n.p)} g`], ['Sel', `${fmtN(n.sel)} g`]];
  return `<details class="nutri">
  <summary><span>Valeurs nutritionnelles</span><b>≈ ${Math.round(n.kcal)} kcal</b><small>${n.per100 ? 'pour 100 g' : `par portion (${unit})`}</small></summary>
  <table><caption>Pour ${unit}, estimation</caption><tbody>${rows.map(([a, b, sub]) => `<tr${sub ? ' class="sub"' : ''}><th scope="row">${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>
  <p>Estimation calculée à partir de la <a href="https://ciqual.anses.fr/" rel="nofollow">table Ciqual 2025 de l'Anses</a> pour les ingrédients crus de la recette, ${n.per100 ? 'ramenés à 100 g de préparation' : 'divisés par le nombre de portions'}. Les pertes à la cuisson, les marinades non consommées et les marques choisies font varier ces valeurs : elles sont données à titre indicatif.</p>
</details>`;
}
const nutritionLd = (r) => {
  const n = nutritionOf(r);
  if (!n) return {};
  const g = (v) => `${v < 0.05 ? '0' : fmtN(v).replace(',', '.')} g`;
  return { nutrition: { '@type': 'NutritionInformation', servingSize: n.per100 ? '100 g' : r.unite ? `1 ${r.unite.replace(/s$/, '')}` : '1 portion', calories: `${Math.round(n.kcal)} kcal`, fatContent: g(n.l), saturatedFatContent: g(n.ags), carbohydrateContent: g(n.g), sugarContent: g(n.s), fiberContent: g(n.f), proteinContent: g(n.p), sodiumContent: `${Math.round(n.sel * 400)} mg` } };
};

// ── Lettre d'information (Brevo) ──
// data/newsletter.json : « formulaire » = adresse du formulaire Brevo (vide = encart masqué partout).
// La lettre de la semaine est générée ici (/newsletter/apercu/) et envoyée par newsletter.js (GitHub Actions).
const NEWS = fs.existsSync(path.join(ROOT, 'data', 'newsletter.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'newsletter.json'), 'utf8')) : {};
function newsletterBox(cls = '') {
  if (!NEWS.formulaire) return '';
  return `<div class="nl ${cls}">
  <div class="nl-text"><p class="kicker">La lettre du vendredi</p><h2>Les nouvelles recettes au miel, une fois par semaine</h2><p>Recettes, miels de saison et articles du magazine. Désinscription en un clic.</p></div>
  <form class="nl-form" action="${esc(NEWS.formulaire)}" method="post" target="_blank" data-nl>
    <label class="sr" for="nl-${cls || 'x'}">Votre adresse e-mail</label>
    <input id="nl-${cls || 'x'}" type="email" name="EMAIL" required autocomplete="email" placeholder="votre@adresse.fr">
    <input type="text" name="email_address_check" value="" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <input type="hidden" name="locale" value="fr">
    <button class="btn" type="submit">Je m'inscris</button>
    <p class="nl-legal">Votre adresse sert uniquement à envoyer cette lettre (service Brevo). Vous pourrez vous désinscrire à tout moment.</p>
    <p class="nl-msg" role="status" hidden></p>
  </form>
</div>`;
}
function weeklyEmail() {
  const since = new Date(today.getTime() - 7 * 864e5);
  let recs = recipes.filter((r) => r.date > since).slice(0, 4);
  if (recs.length < 2) recs = recipes.slice(0, 3);
  const arts = posts.filter((p) => p.date > since && p.date <= today).slice(0, 2);
  const ALC = /\b(vin|rhum|grog)\b/i;
  recs = [...recs].sort((a, b) => ALC.test(a.titre) - ALC.test(b.titre));
  const u = (p) => `${SITE.url}${p}?utm_source=newsletter&utm_medium=email`;
  const btn = (href, t) => `<a href="${href}" style="display:inline-block;background:#B45309;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${t}</a>`;
  const recHtml = recs.map((r) => `<tr><td style="padding:0 0 26px"><a href="${u(r.url)}"><img src="${img(r.photo, 1120)}" width="560" alt="${esc(r.titre)}" style="display:block;width:100%;max-width:560px;height:auto;border-radius:16px;border:0"></a>
<p style="margin:14px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#B45309;font-weight:700">${esc(r.cat.name)} · ${totalTime(r)} · ${esc(shortHoney(r.miel))}</p>
<h2 style="margin:0 0 6px;font-size:22px;line-height:1.25"><a href="${u(r.url)}" style="color:#1C1917;text-decoration:none">${esc(r.titre)}</a></h2>
<p style="margin:0 0 12px;color:#57534E">${esc(r.resume)}</p>${btn(u(r.url), 'Voir la recette')}</td></tr>`).join('');
  const artHtml = arts.length ? `<tr><td style="padding:6px 0 20px;border-top:1px solid #E7E5E4"><p style="margin:18px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#B45309;font-weight:700">Au magazine</p>${arts.map((a) => `<p style="margin:0 0 12px"><a href="${u(a.url)}" style="color:#1C1917;font-weight:700;font-size:17px">${esc(a.titre)}</a><br><span style="color:#57534E">${esc(a.resume || '')}</span></p>`).join('')}</td></tr>` : '';
  const subject = `Cette semaine au miel : ${recs.slice(0, 2).map((r) => r.titre).join(', ')}${recs.length > 2 ? '…' : ''}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#F4F2EF;font:16px/1.55 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1917">
<span style="display:none;max-height:0;overflow:hidden">${esc(recs.map((r) => r.titre).join(' · '))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EF"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px"><tr><td style="padding:28px 20px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 22px;text-align:center"><a href="${u('/')}" style="text-decoration:none;color:#1C1917;font-size:24px;font-weight:800">🍯 Cuisine <span style="color:#B45309">au miel</span></a><p style="margin:6px 0 0;color:#57534E">Les nouveautés de la semaine</p></td></tr>
${recHtml}${artHtml}
<tr><td style="padding:18px 0 4px;border-top:1px solid #E7E5E4;text-align:center">${btn(u('/recettes/'), `Les ${recipes.length} recettes`)}</td></tr>
</table></td></tr></table>
<p style="max-width:560px;margin:18px auto 0;font-size:12px;color:#78716C;text-align:center">${recs.some((r) => ALC.test(r.titre)) ? "L'abus d'alcool est dangereux pour la santé, à consommer avec modération.<br>" : ''}Le miel ne convient pas aux enfants de moins d'un an (Anses).<br>Vous recevez cette lettre car vous vous êtes inscrit sur cuisineaumiel.fr. <a href="{{ unsubscribe }}" style="color:#78716C">Se désinscrire</a></p>
</td></tr></table></body></html>`;
  return { subject, html };
}

const AVIS = fs.existsSync(path.join(ROOT, 'data', 'avis.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'avis.json'), 'utf8')) : {};
// Notes réelles lues au moment de la construction, pour les étoiles dans les résultats Google.
const NOTES = (() => {
  if (!AVIS.api) return {};
  try { return JSON.parse(require('child_process').execFileSync('curl', ['-sf', '--max-time', '15', `${AVIS.api.replace(/\/$/, '')}/notes`], { encoding: 'utf8' })); } catch (e) { console.warn('⚠ Avis : notes indisponibles, construction sans les étoiles.'); return {}; }
})();
const starsSvg = (v) => [1, 2, 3, 4, 5].map((i) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="${v >= i - 0.25 ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`).join('');
function avisHtml(r) {
  if (!AVIS.api) return '';
  const n = NOTES[r.slug];
  return `<section class="avis" id="avis" data-avis="${esc(AVIS.api.replace(/\/$/, ''))}" data-slug="${r.slug}">
  <div class="avis-head">
    <h2>Vos avis</h2>
    <p class="avis-sum"><span class="avis-stars">${starsSvg(n ? n.moy : 0)}</span><b class="avis-moy">${n ? String(n.moy).replace('.', ',') : ''}</b><span class="avis-n">${n ? `${n.n} note${n.n > 1 ? 's' : ''}` : 'Soyez le premier à noter cette recette'}</span></p>
  </div>
  <form class="avis-form" novalidate>
    <fieldset class="avis-rate"><legend>Votre note</legend><div class="rate-in">${[5, 4, 3, 2, 1].map((i) => `<input type="radio" name="note" value="${i}" id="n${i}"><label for="n${i}" title="${i} sur 5">${starsSvg(1).split('</svg>')[0]}</svg><span class="sr">${i} sur 5</span></label>`).join('')}</div></fieldset>
    <div class="avis-fields">
      <label>Prénom<input name="prenom" maxlength="40" autocomplete="given-name"></label>
      <label><span>Votre commentaire <small>(facultatif)</small></span><textarea name="texte" rows="3" maxlength="1200" placeholder="Réussie ? Une variante, une astuce ?"></textarea></label>
      <div class="avis-photo">
        <label class="avis-photo-btn"><input type="file" name="photo" accept="image/*"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Je l'ai fait ! <small>Ajouter ma photo (facultatif)</small></span></label>
        <figure class="avis-preview" hidden><img alt="Aperçu de votre photo"><button type="button" aria-label="Retirer la photo">×</button></figure>
        <p class="avis-photo-note">Votre photo est publiée après relecture. En l'envoyant, vous confirmez en être l'auteur et acceptez sa publication sur cuisineaumiel.fr. Évitez les visages et les informations personnelles.</p>
      </div>
      <input name="site" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    </div>
    <button class="btn" type="submit">Envoyer mon avis</button>
    <p class="avis-msg" role="status" hidden></p>
  </form>
  <div class="avis-gal" hidden><h3>Ils l'ont fait</h3><ul></ul></div>
  <ol class="avis-list"></ol>
</section>`;
}
const SHOP = fs.existsSync(path.join(ROOT, 'data', 'boutique.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'boutique.json'), 'utf8')) : {};
function shopBox(r) {
  if (!SHOP.url) return '';
  const h = honeyOf(r);
  return `<aside class="shop-box">
    <p class="shop-k">Le miel de cette recette</p>
    <p class="shop-t"><b>${esc(r.miel || 'Miel')}</b>${h ? ` · <a href="${h.url}">la fiche</a>` : ''}</p>
    <p class="shop-d">${esc(SHOP.accroche || '')}</p>
    <a class="btn shop-btn" href="${esc(SHOP.url)}"${/^https?:/.test(SHOP.url) ? ' rel="noopener" target="_blank"' : ''} data-shop="${r.slug}">${esc(SHOP.bouton || 'Voir la boutique')}${SHOP.nom ? ` chez ${esc(SHOP.nom)}` : ''} →</a>
  </aside>`;
}

function carnetPage() {
  const trail = [['Accueil', '/'], ['Mon carnet']];
  const body = `
${pageHead('Mon carnet de recettes', 'Vos recettes au miel préférées, gardées sur cet appareil. Touchez le cœur sur n\'importe quelle recette pour l\'ajouter.', 'chef-sel', crumbsHtml(trail))}
<section class="wrap block-tight carnet" data-carnet>
  <div class="carnet-bar" hidden>
    <p class="carnet-n"></p>
    <div class="carnet-actions">
      <button type="button" class="btn-outline" data-carnet-list>Liste de courses</button>
      <button type="button" class="btn-outline" data-carnet-share>Envoyer mon carnet</button>
      <button type="button" class="btn-outline" data-carnet-clear>Tout retirer</button>
    </div>
  </div>
  <div class="cards" id="carnet-grid"></div>
  <div class="carnet-empty" hidden>
    <div class="ce-ico">${heartSvg}</div>
    <h2>Votre carnet est vide</h2>
    <p>Touchez le cœur <span class="ce-mini">${heartSvg}</span> sur une recette : elle s'ajoute ici, sans compte ni inscription.</p>
    <p class="ce-go"><a class="btn" href="/recettes/">Parcourir les ${recipes.length} recettes</a> <a class="btn-outline" href="/recettes/" data-random>Une recette au hasard</a></p>
  </div>
  <div class="carnet-list" hidden>
    <h2>La liste de courses de mon carnet</h2>
    <p class="menu-hint">Les ingrédients de toutes les recettes de votre carnet, pour les quantités indiquées dans chaque recette.</p>
    <div class="carnet-groups"></div>
    <button type="button" class="btn" onclick="window.print()">Imprimer la liste</button>
  </div>
  <p class="carnet-note">Votre carnet est enregistré dans ce navigateur. Pour le retrouver sur un autre appareil, utilisez « Envoyer mon carnet ».</p>
</section>`;
  return layout({ title: 'Mon carnet de recettes', description: 'Vos recettes au miel préférées, sauvegardées en un clic.', canonical: '/carnet/', body, extraHead: '<meta name="robots" content="noindex, follow">' }).replace('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">\n', '');
}

function frigoPage() {
  const trail = [['Accueil', '/'], ['Outils', '/outils/'], ["Que cuisiner avec ce que j'ai ?"]];
  const used = FRIGO.filter(([k]) => recipes.some((r) => frigoOf(r).includes(k)));
  const groups = [...new Set(used.map((x) => x[2]))];
  const faq = [
    { q: 'Comment trouver une recette avec les ingrédients que j\'ai ?', a: 'Cochez ce que vous avez dans votre frigo et vos placards. Les recettes au miel qui utilisent le plus de vos ingrédients apparaissent en premier, avec ce qu\'il vous manque.' },
    { q: 'Faut-il cocher le miel, le sel ou l\'huile ?', a: 'Non : on part du principe que vous avez du miel, du sel, du poivre, de l\'huile, du sucre et de l\'eau. Cochez seulement les ingrédients principaux.' },
    { q: 'Les recettes affichées tiennent-elles compte de mes préférences ?', a: 'Oui. Si vous avez indiqué ce que vous ne mangez pas (viande, porc, gluten…), ces recettes sont masquées.' },
  ];
  const body = `
${pageHead("Que cuisiner avec ce que j'ai ?", 'Cochez ce qu\'il y a dans votre frigo et vos placards : nous vous proposons les recettes au miel qui collent, et ce qu\'il vous manque.', 'decoupe-cuisine', crumbsHtml(trail))}
<section class="wrap block-tight frigo" data-frigo>
  <div class="frigo-pick">
    <div class="frigo-head"><h2>Dans ma cuisine, j'ai…</h2><button type="button" class="frigo-reset" data-frigo-reset hidden>Tout décocher</button></div>
    ${groups.map((g) => `<fieldset class="frigo-g"><legend>${g}</legend><div class="frigo-opts">${used.filter((x) => x[2] === g).map(([k, l]) => `<label class="fi"><input type="checkbox" value="${k}"><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`).join('\n    ')}
    <p class="frigo-base">Toujours supposés dans vos placards : miel, sel, poivre, huile, sucre, eau.</p>
    ${prefsPanel()}
  </div>
  <div class="frigo-out" aria-live="polite">
    <p class="frigo-n">Cochez au moins un ingrédient pour voir les idées.</p>
    <ol class="frigo-res"></ol>
  </div>
</section>
<section class="wrap block">${faqHtml(faq)}</section>`;
  return layout({ title: "Que cuisiner avec ce que j'ai ? Recettes au miel selon vos ingrédients", description: "Cochez les ingrédients de votre frigo et de vos placards : notre outil gratuit vous propose les recettes au miel à faire tout de suite, et ce qu'il vous manque.", canonical: '/outils/frigo/', body, extraHead: [crumbsLd(trail), faqLd(faq), { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Que cuisiner avec ce que j\'ai ?', applicationCategory: 'LifestyleApplication', operatingSystem: 'Tous', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: SITE.url + '/outils/frigo/', inLanguage: 'fr-FR' }].map(ldScript).join('\n') });
}

function proposerPage() {
  const trail = [['Accueil', '/'], ['Proposer une recette']];
  const steps = [
    ['1', 'Vous envoyez', 'Votre recette au miel : de famille, de saison, de tous les jours. Quelques lignes suffisent.'],
    ['2', 'Nous testons', 'Nous la relisons, la cuisinons si besoin, et la mettons en forme : ingrédients, étapes, miel conseillé.'],
    ['3', 'Elle est publiée', 'Avec votre prénom et votre ville si vous le souhaitez. Nous vous prévenons dès qu\'elle est en ligne.'],
  ];
  const body = `
${pageHead('Proposez votre recette au miel', 'Une recette de grand-mère, une trouvaille de saison, un plat que tout le monde vous réclame ? Partagez-la : les meilleures sont publiées sur le site, avec votre prénom.', 'chef-sel', crumbsHtml(trail))}
<section class="wrap block-tight">
  <ol class="propose-steps">${steps.map(([n, t, d]) => `<li><span>${n}</span><div><h2>${t}</h2><p>${d}</p></div></li>`).join('')}</ol>
</section>
<section class="wrap block">
  <div class="wl propose">
    <div class="wl-intro">
      <p class="kicker">Ce que nous cherchons</p>
      <h2>Des recettes <em>vraies</em>, qui donnent envie</h2>
      <ul class="propose-tips">
        <li>Une recette où le miel a un vrai rôle : il laque, il équilibre, il parfume.</li>
        <li>Des quantités précises et des étapes dans l'ordre : c'est ce qui fait une recette réussie.</li>
        <li>Le miel que vous utilisez, et pourquoi celui-là.</li>
        <li>Votre petite astuce, l'histoire du plat : c'est ce que les lecteurs préfèrent.</li>
        <li>Une recette dont vous êtes l'auteur, ou que vous tenez de votre famille. Pas de copie d'un livre ou d'un site.</li>
      </ul>
      <p>Pas de promesse santé, s'il vous plaît : nous parlons de goût, de plaisir et de tradition. Et rappel : le miel ne convient pas aux enfants de moins d'un an.</p>
    </div>
    <form class="wl-form" id="propose-form" data-mail="${PARTNER_MAIL[0]}" data-domain="${PARTNER_MAIL[1]}" novalidate>
      <h3>Ma recette</h3>
      ${AVIS.api && AVIS.lecture ? `<div class="snap" data-snap="${esc(AVIS.api.replace(/\/$/, ''))}">
        <label class="snap-btn"><input type="file" accept="image/*" capture="environment"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span><b>Prendre ma fiche en photo</b><small>Le formulaire se remplit tout seul, vous n'avez plus qu'à relire.</small></span></label>
        <p class="snap-msg" role="status" hidden></p>
        <p class="snap-note">5 photos par jour au plus. La photo est lue par un service d'intelligence artificielle (Claude, d'Anthropic) pour remplir le formulaire, puis n'est pas conservée par cuisineaumiel.fr. Photographiez une recette à vous, pas la page d'un livre.</p>
      </div>` : ''}
      <div class="wl-row"><label>Prénom<input name="prenom" required autocomplete="given-name"></label><label><span>Ville <small>(facultatif)</small></span><input name="ville" autocomplete="address-level2"></label></div>
      <label>E-mail<input name="email" type="email" required autocomplete="email"><small class="fhint">Pour vous prévenir de la publication. Il ne sera jamais affiché.</small></label>
      <label>Nom de la recette<input name="titre" required placeholder="Ex. : Tarte aux noix et miel de châtaignier de ma grand-mère"></label>
      <div class="wl-row"><label>Catégorie<select name="categorie">${CATEGORIES.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></label><label>Pour combien ?<input name="portions" inputmode="numeric" placeholder="4 personnes"></label></div>
      <div class="wl-row"><label>Préparation<input name="prep" placeholder="20 min"></label><label>Cuisson<input name="cuisson" placeholder="35 min"></label></div>
      <label>Le miel utilisé<input name="miel" list="miels-l" placeholder="Châtaignier, acacia, toutes fleurs…"><datalist id="miels-l">${honeys.map((h) => `<option value="${esc(h.nom)}">`).join('')}</datalist></label>
      <label>Ingrédients<textarea name="ingredients" rows="6" required placeholder="Un ingrédient par ligne, avec la quantité :&#10;200 g de farine&#10;3 c. à soupe de miel de châtaignier"></textarea></label>
      <label>Préparation<textarea name="etapes" rows="7" required placeholder="Les étapes dans l'ordre, une par ligne."></textarea></label>
      <label><span>Votre astuce ou l'histoire de la recette <small>(facultatif)</small></span><textarea name="astuce" rows="3"></textarea></label>
      <label class="propose-ok"><input type="checkbox" name="accord" required><span>Je suis l'auteur de cette recette (ou elle vient de ma famille) et j'accepte qu'elle soit publiée sur cuisineaumiel.fr, adaptée si besoin, avec mon prénom.</span></label>
      <p class="wl-err" hidden>Merci de remplir votre prénom, votre e-mail, le nom de la recette, les ingrédients, la préparation, et de cocher l'accord.</p>
      <button class="btn" type="submit">Envoyer ma recette</button>
      <p class="pt-small">Votre messagerie s'ouvre avec la recette déjà rédigée : il ne reste qu'à l'envoyer (vous pouvez y joindre une photo). Rien ne s'ouvre ? <button type="button" class="linklike" data-propose-copy>Copier le texte</button> et <a href="#" data-mail="${PARTNER_MAIL[0]}" data-domain="${PARTNER_MAIL[1]}" data-subject="Ma%20recette">envoyez-le-nous par e-mail</a>.</p>
      <p class="propose-copied" hidden>Texte copié : collez-le dans un e-mail.</p>
    </form>
  </div>
</section>`;
  return layout({ title: 'Proposez votre recette au miel', description: 'Envoyez votre recette au miel préférée : les meilleures sont publiées sur Cuisine au miel avec votre prénom.', canonical: '/proposer-une-recette/', body, extraHead: ldScript(crumbsLd(trail)) });
}

// ---------- construction ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });

const urls = ['/', '/recettes/', '/miels/', '/magazine/'];
write('miels/index.html', guideHub());
write('magazine/index.html', magazineHub());
if (HAS_ATLAS) { write('miels/atlas/index.html', atlasPage()); urls.push('/miels/atlas/'); }
for (const x of [...honeys, ...pillars, ...posts]) { write(`${x.url.slice(1)}index.html`, longPage(x)); urls.push(x.url); }
// Ancienne adresse du guide : redirection vers /miels/.
write('le-miel/index.html', `<!doctype html><meta charset="utf-8"><title>Le guide des miels</title><link rel="canonical" href="${SITE.url}/miels/"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=/miels/"><a href="/miels/">Le guide des miels</a>`);
write('index.html', home());
write('recettes/index.html', archive());
recipes.forEach((r, i) => { write(`recettes/${r.slug}/index.html`, recipePage(r, i)); urls.push(r.url); });
for (const c of CATEGORIES) { write(`categories/${c.slug}/index.html`, categoryPage(c)); urls.push(`/categories/${c.slug}/`); }
write('a-propos/index.html', aboutPage()); urls.push('/a-propos/');
write('outils/index.html', toolsHub()); urls.push('/outils/');
write('apiculteurs-partenaires/index.html', partnersPage()); urls.push('/apiculteurs-partenaires/');
write('outils/menu-de-la-semaine/index.html', menuPage()); urls.push('/outils/menu-de-la-semaine/');
write('outils/quel-miel/index.html', quizPage()); urls.push('/outils/quel-miel/');
write('outils/calendrier-des-miellees/index.html', calendarPage()); urls.push('/outils/calendrier-des-miellees/');
write('outils/sucre-miel/index.html', sugarTool()); urls.push('/outils/sucre-miel/');
write('outils/frigo/index.html', frigoPage()); urls.push('/outils/frigo/');
write('proposer-une-recette/index.html', proposerPage()); urls.push('/proposer-une-recette/');
write('carnet/index.html', carnetPage());
{ const mail = weeklyEmail(); write('newsletter/apercu/index.html', mail.html); write('newsletter/semaine.json', JSON.stringify({ sujet: mail.subject })); }
write('hors-ligne/index.html', layout({ title: 'Hors connexion', canonical: '/hors-ligne/', extraHead: '<meta name="robots" content="noindex">', body: `<section class="wrap page-head offline"><h1>Pas de connexion pour le moment</h1><p class="lede">Cette page n'a pas encore été enregistrée sur votre téléphone. Les recettes de <a href="/carnet/">votre carnet</a> et les pages déjà visitées restent disponibles hors connexion.</p><p><a class="btn" href="/carnet/">Ouvrir mon carnet</a></p></section>` }));
for (const c of COLLECTIONS) { write(`${c.url.slice(1)}index.html`, collectionPage(c)); urls.push(c.url); }
write('recettes.json', JSON.stringify(recipeIndex()));
for (const sa of SAISONS) { write(`recettes/saison/${sa.slug}/index.html`, saisonPage(sa)); urls.push(`/recettes/saison/${sa.slug}/`); }
for (const a of ACCORD_PAGES) { write(`recettes/${a.slug}/index.html`, accordPage(a)); urls.push(`/recettes/${a.slug}/`); }
for (const f of (fs.existsSync(path.join(ROOT, 'pages')) ? fs.readdirSync(path.join(ROOT, 'pages')) : []).filter((f) => f.endsWith('.md') && f !== 'a-propos.md')) {
  const p = staticPage(f);
  write(`${p.slug}/index.html`, p.html);
  urls.push(`/${p.slug}/`);
}
write('404.html', layout({ title: 'Page introuvable', canonical: '/404.html', body: `<section class="wrap page-head"><h1>Oups, cette page a fondu.</h1><p class="lede">Elle n'existe pas ou plus. <a href="/recettes/">Voir toutes les recettes</a>.</p></section>` }));
write('flux.xml', rss());
write('pinterest/recettes.xml', pinFeed('Recettes au miel', 'Les recettes de Cuisine au miel.', recipes.slice(0, 200)));
write('pinterest/miels.xml', pinFeed('Le guide des miels', 'Les fiches du guide des miels et l\'atlas.', [...honeys.map((h) => ({ ...h, date: h.maj })), ...pillars, ...(HAS_ATLAS ? [{ titre: "L'atlas des miels", resume: "Tous les miels AOP et IGP d'Europe, les plantes à miel et les grands miels du monde, sur la carte.", url: '/miels/atlas/', photo: '1774284266228-27698569b2fd' }] : [])]));
write('pinterest/magazine.xml', pinFeed('Le magazine du miel', 'Actualités et dossiers sur le miel.', posts));
write('sitemap.xml', sitemap(urls));
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'Meta-ExternalAgent', 'MistralAI-User', 'DuckAssistBot'];
write('robots.txt', `# Cuisine au miel : moteurs de recherche et assistants IA bienvenus.\nUser-agent: *\nAllow: /\n\n${AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /`).join('\n\n')}\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
write('llms.txt', llmsTxt());

console.log(`✓ ${recipes.length} recettes publiées, ${urls.length} pages générées dans _site/`);
if (process.env.NUTRI_REPORT) {
  const ok = recipes.filter((r) => nutritionOf(r));
  console.log(`Nutrition : ${ok.length}/${recipes.length} recettes`);
  for (const [l, n] of [...NUTRI_MISS].sort((a, b) => b[1] - a[1])) console.log(`  ? ${l} (${n})`);
}
