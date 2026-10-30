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

// ---------- gabarits ----------
const honeycomb = `<svg class="comb" aria-hidden="true" width="100%" height="100%"><defs><pattern id="hx" width="28" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(.9)"><path d="M14 0l14 8.08v16.17L14 32.33 0 24.25V8.08zM14 32.33l14 8.09v16.16M14 32.33L0 40.42v16.16" fill="none" stroke="currentColor" stroke-width="1.2"/></pattern></defs><rect width="100%" height="100%" fill="url(#hx)"/></svg>`;

function layout({ title, description, body, canonical, extraHead = '', bodyClass = '' }) {
  const fullTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || SITE.description)}">
<link rel="canonical" href="${SITE.url}${canonical}">
<meta property="og:title" content="${esc(title || SITE.name)}">
<meta property="og:description" content="${esc(description || SITE.description)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${SITE.url}${canonical}">
<meta name="theme-color" content="#E9A23B">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${SITE.name}" href="/flux.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=Karla:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${extraHead}
</head>
<body class="${bodyClass}">
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="${SITE.name}, accueil">
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true"><path d="M20 2l15.6 9v18L20 38 4.4 29V11z" fill="#E9A23B"/><path d="M20 9l9.5 5.5v11L20 31l-9.5-5.5v-11z" fill="#FBE3A6"/><path d="M20 15.5c3 0 5 2.6 5 5.2 0 3.4-3 5.8-5 7.3-2-1.5-5-3.9-5-7.3 0-2.6 2-5.2 5-5.2z" fill="#B5651D"/></svg>
      <span>Cuisine <em>au</em> miel</span>
    </a>
    <nav class="main-nav" aria-label="Navigation principale">
      <a href="/recettes/">Recettes</a>
      <a href="/categories/">Catégories</a>
      <a href="/le-miel/">Le miel</a>
      <a href="/a-propos/">À propos</a>
    </nav>
  </div>
</header>
<main id="contenu">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p class="footer-logo">Cuisine <em>au</em> miel</p>
      <p>Une nouvelle recette tous les deux ou trois jours.<br>Sucré, salé, et toujours doré.</p>
    </div>
    <nav aria-label="Catégories">
      <p class="footer-title">Catégories</p>
      ${CATEGORIES.map((c) => `<a href="/categories/${c.slug}/">${c.name}</a>`).join('\n      ')}
    </nav>
    <nav aria-label="Liens">
      <p class="footer-title">Le site</p>
      <a href="/recettes/">Toutes les recettes</a>
      <a href="/le-miel/">Guide des miels</a>
      <a href="/a-propos/">À propos</a>
      <a href="/flux.xml">Flux RSS</a>
    </nav>
  </div>
  <p class="wrap copyright">© ${today.getUTCFullYear()} cuisineaumiel.fr · Le miel ne convient pas aux enfants de moins d'un an.</p>
</footer>
<script src="/main.js" defer></script>
</body>
</html>`;
}

const tone = (r) => (r.teinte || 'ambre');
function card(r) {
  return `<article class="card" data-cat="${r.cat.slug}" data-search="${esc([r.titre, r.miel, r.resume, r.cat.name, ...r.tags].join(' ').toLowerCase())}">
  <a href="${r.url}">
    <div class="card-visual tone-${tone(r)}">${honeycomb}<span class="card-emoji" aria-hidden="true">${r.emoji || '🍯'}</span></div>
    <div class="card-body">
      <p class="card-cat">${esc(r.cat.name)}</p>
      <h3>${esc(r.titre)}</h3>
      <p class="card-desc">${esc(r.resume)}</p>
      <p class="card-meta"><span>⏱ ${esc(totalTime(r))}</span><span>${esc(r.difficulte)}</span></p>
    </div>
  </a>
</article>`;
}
function totalTime(r) {
  const t = minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60), m = t % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function recipePage(r, i) {
  const related = recipes.filter((x) => x !== r && x.cat === r.cat).slice(0, 3);
  const more = related.length < 3 ? recipes.filter((x) => x !== r && x.cat !== r.cat).slice(i % 5, (i % 5) + 3 - related.length) : [];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Recipe', name: r.titre, description: r.resume,
    datePublished: r.date.toISOString().slice(0, 10), author: { '@type': 'Organization', name: SITE.name },
    prepTime: isoDuration(r.preparation), cookTime: isoDuration(r.cuisson), totalTime: `PT${minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos)}M`,
    recipeYield: `${r.portions} ${r.unite || 'personnes'}`, recipeCategory: r.cat.name, recipeCuisine: 'Française',
    keywords: ['miel', r.miel, ...r.tags].join(', '), recipeIngredient: r.ingredientsList,
    recipeInstructions: r.steps.map((s) => ({ '@type': 'HowToStep', text: s.replace(/\*\*/g, '') })),
  };
  const body = `
<article class="recipe">
  <header class="recipe-hero tone-${tone(r)}">
    ${honeycomb}
    <div class="wrap recipe-hero-inner">
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Accueil</a> › <a href="/categories/${r.cat.slug}/">${esc(r.cat.name)}</a></nav>
      <span class="hero-emoji" aria-hidden="true">${r.emoji || '🍯'}</span>
      <h1>${esc(r.titre)}</h1>
      <p class="lede">${esc(r.resume)}</p>
      <dl class="facts">
        <div><dt>Préparation</dt><dd>${esc(r.preparation)}</dd></div>
        ${r.cuisson && r.cuisson !== '0 min' ? `<div><dt>Cuisson</dt><dd>${esc(r.cuisson)}</dd></div>` : ''}
        ${r.repos ? `<div><dt>Repos</dt><dd>${esc(r.repos)}</dd></div>` : ''}
        <div><dt>Difficulté</dt><dd>${esc(r.difficulte)}</dd></div>
        <div><dt>Miel conseillé</dt><dd>${esc(r.miel)}</dd></div>
      </dl>
    </div>
  </header>
  <div class="wrap recipe-grid">
    <aside class="ingredients-box" data-base="${r.portions}">
      <div class="box-head">
        <h2>Ingrédients</h2>
        <div class="servings" role="group" aria-label="Nombre de ${esc(r.unite || 'personnes')}">
          <button type="button" data-step="-1" aria-label="Moins">−</button>
          <output>${r.portions}</output>
          <button type="button" data-step="1" aria-label="Plus">+</button>
          <span>${esc(r.unite || 'personnes')}</span>
        </div>
      </div>
      ${r.ingredientsHtml}
      <button type="button" class="print-btn" onclick="window.print()">Imprimer la recette</button>
    </aside>
    <div class="recipe-main">
      ${r.intro ? `<div class="intro">${r.intro}</div>` : ''}
      <h2>Préparation</h2>
      <ol class="steps">${r.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>
      ${r.conseil ? `<div class="tip"><h2>Le conseil</h2>${r.conseil}</div>` : ''}
      ${r.variantes ? `<div class="variants"><h2>Variantes</h2>${r.variantes}</div>` : ''}
      <p class="published">Publiée le ${dateFr(r.date)} dans <a href="/categories/${r.cat.slug}/">${esc(r.cat.name)}</a>.</p>
    </div>
  </div>
  <section class="wrap related">
    <h2>À cuisiner aussi</h2>
    <div class="grid">${[...related, ...more].map(card).join('\n')}</div>
  </section>
</article>`;
  return layout({
    title: r.titre, description: r.resume, canonical: r.url, body,
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  });
}

function home() {
  const feature = recipes.find((r) => r.vedette === 'oui') || recipes[0];
  const latest = recipes.filter((r) => r !== feature).slice(0, 8);
  const body = `
<section class="hero">
  ${honeycomb}
  <div class="wrap hero-inner">
    <p class="kicker">Recettes sucrées & salées</p>
    <h1>Le miel, <em>de l'entrée</em><br>au dessert.</h1>
    <p class="lede">${recipes.length} recettes originales pour cuisiner le miel au quotidien, et une nouvelle tous les deux ou trois jours.</p>
    <form class="hero-search" action="/recettes/" role="search">
      <label class="sr" for="q">Rechercher une recette</label>
      <input id="q" name="q" type="search" placeholder="Poulet, lavande, madeleines…" autocomplete="off">
      <button type="submit">Chercher</button>
    </form>
  </div>
  <svg class="drip" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30H180C195 30 198 34 198 44V58C198 70 222 70 222 58V44C222 34 225 30 240 30H520C532 30 535 33 535 40V46C535 54 553 54 553 46V40C553 33 556 30 568 30H900C915 30 918 35 918 46V64C918 78 946 78 946 64V46C946 35 949 30 964 30H1220C1230 30 1233 33 1233 39V44C1233 51 1249 51 1249 44V39C1249 33 1252 30 1262 30H1440V80H0Z" fill="#FDF7EC"/></svg>
</section>

<section class="wrap feature">
  <a class="feature-card" href="${feature.url}">
    <div class="feature-visual tone-${tone(feature)}">${honeycomb}<span aria-hidden="true">${feature.emoji}</span></div>
    <div class="feature-text">
      <p class="kicker">La recette à la une</p>
      <h2>${esc(feature.titre)}</h2>
      <p>${esc(feature.resume)}</p>
      <p class="card-meta"><span>⏱ ${totalTime(feature)}</span><span>${esc(feature.difficulte)}</span><span>🍯 ${esc(feature.miel)}</span></p>
      <span class="btn">Voir la recette</span>
    </div>
  </a>
</section>

<section class="wrap">
  <div class="section-head"><h2>Les dernières recettes</h2><a href="/recettes/">Toutes les recettes →</a></div>
  <div class="grid">${latest.map(card).join('\n')}</div>
</section>

<section class="cats-band">
  <div class="wrap">
    <div class="section-head"><h2>Par envie</h2></div>
    <div class="cat-grid">
      ${CATEGORIES.map((c) => { const n = recipes.filter((r) => r.cat === c).length; return `<a class="cat-tile" href="/categories/${c.slug}/"><span class="cat-emoji" aria-hidden="true">${c.emoji}</span><span class="cat-name">${c.name}</span><span class="cat-count">${n} recette${n > 1 ? 's' : ''}</span></a>`; }).join('\n      ')}
    </div>
  </div>
</section>

<section class="wrap guide-teaser">
  <div>
    <p class="kicker">Bien choisir son miel</p>
    <h2>Acacia, lavande, châtaignier… lequel pour quelle recette ?</h2>
    <p>Chaque miel a son caractère. Notre guide vous aide à choisir le bon, et à remplacer le sucre par du miel sans rater vos gâteaux.</p>
    <a class="btn" href="/le-miel/">Lire le guide</a>
  </div>
  <ul class="swatches" aria-hidden="true">
    <li style="--c:#F6DC8B">Acacia</li><li style="--c:#EBB54C">Lavande</li><li style="--c:#D9932F">Toutes fleurs</li><li style="--c:#A9601E">Châtaignier</li><li style="--c:#6E3A12">Sarrasin</li>
  </ul>
</section>`;
  return layout({ title: '', canonical: '/', body, bodyClass: 'home' });
}

function listing() {
  const body = `
<section class="page-hero">${honeycomb}<div class="wrap"><h1>Toutes les recettes</h1><p class="lede">${recipes.length} recettes au miel, de l'apéritif au goûter.</p></div></section>
<section class="wrap">
  <div class="filters">
    <label class="sr" for="filtre-q">Rechercher</label>
    <input id="filtre-q" type="search" placeholder="Rechercher une recette, un miel, un ingrédient…" autocomplete="off">
    <div class="chips" role="group" aria-label="Filtrer par catégorie">
      <button type="button" class="chip is-on" data-filter="">Toutes</button>
      ${CATEGORIES.map((c) => `<button type="button" class="chip" data-filter="${c.slug}">${c.emoji} ${c.name}</button>`).join('\n      ')}
    </div>
  </div>
  <p class="empty" hidden>Aucune recette ne correspond. Essayez un autre mot.</p>
  <div class="grid" id="all">${recipes.map(card).join('\n')}</div>
</section>`;
  return layout({ title: 'Toutes les recettes', description: `Les ${recipes.length} recettes au miel de cuisineaumiel.fr.`, canonical: '/recettes/', body });
}

function categoryIndex() {
  const body = `
<section class="page-hero">${honeycomb}<div class="wrap"><h1>Catégories</h1><p class="lede">Choisissez selon l'envie du moment.</p></div></section>
<section class="wrap"><div class="cat-grid big">
${CATEGORIES.map((c) => { const n = recipes.filter((r) => r.cat === c).length; return `<a class="cat-tile" href="/categories/${c.slug}/"><span class="cat-emoji" aria-hidden="true">${c.emoji}</span><span class="cat-name">${c.name}</span><span class="cat-intro">${c.intro}</span><span class="cat-count">${n} recette${n > 1 ? 's' : ''}</span></a>`; }).join('\n')}
</div></section>`;
  return layout({ title: 'Catégories', canonical: '/categories/', body });
}

function categoryPage(c) {
  const list = recipes.filter((r) => r.cat === c);
  const body = `
<section class="page-hero">${honeycomb}<div class="wrap"><nav class="crumbs"><a href="/">Accueil</a> › <a href="/categories/">Catégories</a></nav><h1>${c.emoji} ${c.name}</h1><p class="lede">${c.intro}</p></div></section>
<section class="wrap"><div class="grid">${list.map(card).join('\n')}</div></section>`;
  return layout({ title: c.name, description: `Recettes au miel : ${c.name.toLowerCase()}. ${c.intro}`, canonical: `/categories/${c.slug}/`, body });
}

function staticPage(file) {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8'));
  const slug = file.replace(/\.md$/, '');
  const html = `
<section class="page-hero">${honeycomb}<div class="wrap"><h1>${esc(data.titre)}</h1>${data.resume ? `<p class="lede">${esc(data.resume)}</p>` : ''}</div></section>
<section class="wrap prose">${markdown(body)}</section>`;
  return { slug, html: layout({ title: data.titre, description: data.resume, canonical: `/${slug}/`, body: html }) };
}

function rss() {
  const items = recipes.slice(0, 30).map((r) => `<item><title>${esc(r.titre)}</title><link>${SITE.url}${r.url}</link><guid>${SITE.url}${r.url}</guid><pubDate>${r.date.toUTCString()}</pubDate><description>${esc(r.resume)}</description><category>${esc(r.cat.name)}</category></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${SITE.name}</title><link>${SITE.url}/</link><description>${esc(SITE.description)}</description><language>fr-FR</language>
${items}
</channel></rss>`;
}

function sitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${SITE.url}${u}</loc></url>`).join('\n')}
</urlset>`;
}

// ---------- construction ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });

const urls = ['/', '/recettes/', '/categories/'];
write('index.html', home());
write('recettes/index.html', listing());
write('categories/index.html', categoryIndex());
recipes.forEach((r, i) => { write(`recettes/${r.slug}/index.html`, recipePage(r, i)); urls.push(r.url); });
CATEGORIES.forEach((c) => { write(`categories/${c.slug}/index.html`, categoryPage(c)); urls.push(`/categories/${c.slug}/`); });
for (const f of fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.md'))) {
  const p = staticPage(f);
  write(`${p.slug}/index.html`, p.html);
  urls.push(`/${p.slug}/`);
}
write('404.html', layout({ title: 'Page introuvable', canonical: '/404.html', body: `<section class="page-hero">${honeycomb}<div class="wrap"><h1>Oups, cette page a fondu.</h1><p class="lede">Elle n'existe pas ou plus. <a href="/recettes/">Voir toutes les recettes</a>.</p></div></section>` }));
write('flux.xml', rss());
write('sitemap.xml', sitemap(urls));
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

console.log(`✓ ${recipes.length} recettes publiées, ${urls.length} pages générées dans _site/`);
