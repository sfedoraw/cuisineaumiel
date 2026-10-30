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
const PER_PAGE = 10;
const logoSvg = `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><path d="M20 2l15.6 9v18L20 38 4.4 29V11z" fill="#E3A33C"/><path d="M20 9l9.5 5.5v11L20 31l-9.5-5.5v-11z" fill="#FBE3A6"/><path d="M20 15.5c3 0 5 2.6 5 5.2 0 3.4-3 5.8-5 7.3-2-1.5-5-3.9-5-7.3 0-2.6 2-5.2 5-5.2z" fill="#A85B1A"/></svg>`;

function layout({ title, description, body, canonical, extraHead = '', ogImage = '' }) {
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
<meta name="theme-color" content="#FBF6EE">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${SITE.name}" href="/flux.xml">
<link rel="preconnect" href="https://images.unsplash.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Karla:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${extraHead}
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="masthead">
  <a class="brand" href="/">${logoSvg}<span>Cuisine <em>au</em> miel</span></a>
  <p class="tagline">Le carnet de recettes sucrées et salées autour du miel</p>
  <nav class="nav" aria-label="Navigation principale">
    <a href="/">Accueil</a>
    <a href="/recettes/">Toutes les recettes</a>
    ${CATEGORIES.slice(0, 4).map((c) => `<a href="/categories/${c.slug}/">${c.name.split(' &')[0]}</a>`).join('\n    ')}
    <a href="/le-miel/">Le miel</a>
  </nav>
</header>
<main id="contenu">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">Cuisine <em>au</em> miel</p>
      <p>Une nouvelle recette chaque jour, sucrée ou salée, et toujours au miel.</p>
      <p><a href="/flux.xml">S'abonner au flux RSS</a></p>
    </div>
    <nav aria-label="Catégories">
      <p class="footer-title">Catégories</p>
      ${CATEGORIES.map((c) => `<a href="/categories/${c.slug}/">${c.name}</a>`).join('\n      ')}
    </nav>
    <nav aria-label="Le site">
      <p class="footer-title">Le site</p>
      <a href="/recettes/">Toutes les recettes</a>
      <a href="/le-miel/">Guide des miels</a>
      <a href="/a-propos/">À propos</a>
    </nav>
  </div>
  <p class="wrap fine">© ${today.getUTCFullYear()} cuisineaumiel.fr · Photos : Unsplash · Le miel ne convient pas aux enfants de moins d'un an.</p>
</footer>
<script src="/main.js" defer></script>
</body>
</html>`;
}

function totalTime(r) {
  const t = minutes(r.preparation) + minutes(r.cuisson) + minutes(r.repos);
  if (t < 60) return `${t} min`;
  const h = Math.floor(t / 60), m = t % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
const meta = (r) => `<p class="post-meta"><a href="/categories/${r.cat.slug}/">${esc(r.cat.name)}</a><span>·</span><time datetime="${r.date.toISOString().slice(0, 10)}">${dateFr(r.date)}</time></p>`;
const facts = (r) => `<span>⏱ ${totalTime(r)}</span><span>${esc(r.difficulte)}</span><span>🍯 ${esc(r.miel)}</span>`;

// Un billet dans le fil du blog : photo à gauche, texte à droite.
function postRow(r) {
  return `<article class="post-row">
  <a class="post-photo" href="${r.url}" tabindex="-1" aria-hidden="true">${picture(r.photo, r.titre, { sizes: '(min-width: 760px) 340px, 100vw' })}</a>
  <div class="post-text">
    ${meta(r)}
    <h2><a href="${r.url}">${esc(r.titre)}</a></h2>
    <p>${esc(r.resume)}</p>
    <p class="post-facts">${facts(r)}</p>
    <a class="more" href="${r.url}">Lire la recette →</a>
  </div>
</article>`;
}

// Vignette compacte (archives, suggestions).
function tile(r) {
  return `<article class="tile" data-cat="${r.cat.slug}" data-search="${esc([r.titre, r.miel, r.resume, r.cat.name, ...r.tags].join(' ').toLowerCase())}">
  <a href="${r.url}">
    ${picture(r.photo, r.titre, { sizes: '(min-width: 900px) 280px, 50vw', ratio: '1 / 1' })}
    <span class="tile-cat">${esc(r.cat.name)}</span>
    <h3>${esc(r.titre)}</h3>
  </a>
</article>`;
}

function sidebar() {
  return `<aside class="sidebar">
  <section class="side-box">
    <h2>Bienvenue</h2>
    <p>Ici, le miel ne se limite pas à la tartine : il laque les volailles, adoucit les sauces et parfume les desserts. Une nouvelle recette chaque jour.</p>
    <a href="/a-propos/">En savoir plus →</a>
  </section>
  <section class="side-box">
    <h2>Rechercher</h2>
    <form action="/recettes/" role="search" class="side-search">
      <label class="sr" for="side-q">Rechercher une recette</label>
      <input id="side-q" name="q" type="search" placeholder="Poulet, lavande, madeleines…">
    </form>
  </section>
  <section class="side-box">
    <h2>Catégories</h2>
    <ul class="side-cats">${CATEGORIES.map((c) => { const n = recipes.filter((r) => r.cat === c).length; return `<li><a href="/categories/${c.slug}/">${c.name}</a><span>${n}</span></li>`; }).join('')}</ul>
  </section>
  <section class="side-box side-guide">
    ${picture(HONEY.ambre[0][0], 'Du miel qui coule d’une cuillère', { sizes: '300px', ratio: '3 / 2' })}
    <h2>Quel miel choisir ?</h2>
    <p>Acacia, lavande, châtaignier… Notre guide pour bien choisir et remplacer le sucre par du miel.</p>
    <a href="/le-miel/">Lire le guide →</a>
  </section>
</aside>`;
}

function pager(page, pages, base) {
  if (pages < 2) return '';
  const href = (p) => (p === 1 ? base : `${base}page/${p}/`);
  return `<nav class="pager" aria-label="Pages">
  ${page > 1 ? `<a href="${href(page - 1)}">← Recettes plus récentes</a>` : '<span></span>'}
  <span>Page ${page} sur ${pages}</span>
  ${page < pages ? `<a href="${href(page + 1)}">Recettes précédentes →</a>` : '<span></span>'}
</nav>`;
}

function feedPage(list, page, { base = '/', heading = '' } = {}) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  let items = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  let lead = '';
  if (page === 1 && base === '/') {
    const r = items[0];
    items = items.slice(1);
    lead = `<article class="lead">
  <a href="${r.url}" class="lead-photos">
    ${picture(r.photo, r.titre, { sizes: '(min-width: 1000px) 520px, 60vw', eager: true, cls: 'lead-dish' })}
    ${picture(r.honey.id, r.honey.alt, { sizes: '(min-width: 1000px) 260px, 40vw', ratio: '3 / 4', eager: true, cls: 'lead-honey' })}
  </a>
  <div class="lead-text">
    <p class="kicker">La recette du jour</p>
    <h1><a href="${r.url}">${esc(r.titre)}</a></h1>
    <p>${esc(r.resume)}</p>
    <p class="post-facts">${facts(r)}</p>
    <a class="btn" href="${r.url}">Voir la recette</a>
  </div>
</article>`;
  }
  return `${lead}
<div class="wrap columns">
  <div class="feed">
    ${heading}
    ${items.map(postRow).join('\n')}
    ${pager(page, pages, base)}
  </div>
  ${sidebar()}
</div>`;
}

function recipePage(r, i) {
  const same = recipes.filter((x) => x !== r && x.cat === r.cat);
  const others = recipes.filter((x) => x !== r && x.cat !== r.cat);
  const related = [...same.slice(i % Math.max(1, same.length - 2), (i % Math.max(1, same.length - 2)) + 2), ...others.slice(i % (others.length - 2), (i % (others.length - 2)) + 2)].slice(0, 4);
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
<article class="article">
  <header class="article-head wrap-narrow">
    ${meta(r)}
    <h1>${esc(r.titre)}</h1>
    <p class="lede">${esc(r.resume)}</p>
  </header>
  <div class="duo wrap">
    <figure class="duo-dish">
      ${picture(r.photo, r.titre, { sizes: '(min-width: 1000px) 640px, 60vw', eager: true })}
      <figcaption>Le plat</figcaption>
    </figure>
    <figure class="duo-honey">
      ${picture(r.honey.id, r.honey.alt, { sizes: '(min-width: 1000px) 320px, 40vw', ratio: '3 / 4', eager: true })}
      <figcaption>Le miel conseillé : ${esc(r.miel.replace(/^Miel (de |d'|d’)?/i, ''))}</figcaption>
    </figure>
  </div>
  <div class="wrap-narrow">
    <dl class="facts">
      <div><dt>Préparation</dt><dd>${esc(r.preparation)}</dd></div>
      ${r.cuisson && r.cuisson !== '0 min' ? `<div><dt>Cuisson</dt><dd>${esc(r.cuisson)}</dd></div>` : ''}
      ${r.repos ? `<div><dt>Repos</dt><dd>${esc(r.repos)}</dd></div>` : ''}
      <div><dt>Difficulté</dt><dd>${esc(r.difficulte)}</dd></div>
      <div><dt>Miel</dt><dd>${esc(r.miel)}</dd></div>
    </dl>
    ${r.intro ? `<div class="intro">${r.intro}</div>` : ''}
    <section class="ingredients-box" data-base="${r.portions}">
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
    </section>
    <h2>Préparation</h2>
    <ol class="steps">${r.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>
    ${r.conseil ? `<div class="tip"><h2>Le conseil</h2>${r.conseil}</div>` : ''}
    ${r.variantes ? `<div class="variants"><h2>Variantes</h2>${r.variantes}</div>` : ''}
    <p class="article-foot"><button type="button" class="print-btn" onclick="window.print()">Imprimer la recette</button>
    <span class="credits">Photos : ${esc(r.credit)}${r.honey.credit ? ` et ${esc(r.honey.credit)}` : ''} sur <a href="https://unsplash.com/fr" rel="nofollow">Unsplash</a>.</span></p>
  </div>
  <section class="wrap related">
    <h2>À cuisiner aussi</h2>
    <div class="tiles">${related.map(tile).join('\n')}</div>
  </section>
</article>`;
  return layout({
    title: r.titre, description: r.resume, canonical: r.url, body, ogImage: img(r.photo, 1200),
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  });
}

function archive() {
  const body = `
<section class="wrap page-head">
  <h1>Toutes les recettes</h1>
  <p class="lede">${recipes.length} recettes au miel, de l'apéritif au goûter.</p>
  <div class="filters">
    <label class="sr" for="filtre-q">Rechercher</label>
    <input id="filtre-q" type="search" placeholder="Rechercher une recette, un miel, un ingrédient…" autocomplete="off">
    <div class="chips" role="group" aria-label="Filtrer par catégorie">
      <button type="button" class="chip is-on" data-filter="">Toutes</button>
      ${CATEGORIES.map((c) => `<button type="button" class="chip" data-filter="${c.slug}">${c.name}</button>`).join('\n      ')}
    </div>
  </div>
  <p class="empty" hidden>Aucune recette ne correspond. Essayez un autre mot.</p>
  <div class="tiles" id="all">${recipes.map(tile).join('\n')}</div>
</section>`;
  return layout({ title: 'Toutes les recettes', description: `Les ${recipes.length} recettes au miel de cuisineaumiel.fr.`, canonical: '/recettes/', body });
}

function staticPage(file) {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8'));
  const slug = file.replace(/\.md$/, '');
  const cover = data.photo ? `<figure class="wrap-narrow cover">${picture(data.photo, data.titre, { sizes: '(min-width: 800px) 760px, 100vw', ratio: '16 / 9', eager: true })}</figure>` : '';
  const html = `
<header class="article-head wrap-narrow"><h1>${esc(data.titre)}</h1>${data.resume ? `<p class="lede">${esc(data.resume)}</p>` : ''}</header>
${cover}
<section class="wrap-narrow prose">${markdown(body)}</section>`;
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
function writeFeed(list, base, opts) {
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  for (let p = 1; p <= pages; p++) {
    const rel = p === 1 ? base : `${base}page/${p}/`;
    const title = opts.title ? (p > 1 ? `${opts.title}, page ${p}` : opts.title) : (p > 1 ? `Recettes, page ${p}` : '');
    write(`${rel.slice(1)}index.html`, layout({ title, description: opts.description, canonical: rel, body: feedPage(list, p, { base, heading: opts.heading || '' }) }));
    if (p > 1 || base !== '/') urls.push(rel);
  }
}
writeFeed(recipes, '/', {});
write('recettes/index.html', archive());
recipes.forEach((r, i) => { write(`recettes/${r.slug}/index.html`, recipePage(r, i)); urls.push(r.url); });
for (const c of CATEGORIES) {
  const list = recipes.filter((r) => r.cat === c);
  writeFeed(list, `/categories/${c.slug}/`, {
    title: c.name, description: `Recettes au miel : ${c.name.toLowerCase()}. ${c.intro}`,
    heading: `<header class="feed-head"><p class="kicker">Catégorie</p><h1>${c.name}</h1><p>${c.intro}</p></header>`,
  });
}
for (const f of fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.md'))) {
  const p = staticPage(f);
  write(`${p.slug}/index.html`, p.html);
  urls.push(`/${p.slug}/`);
}
write('404.html', layout({ title: 'Page introuvable', canonical: '/404.html', body: `<header class="article-head wrap-narrow"><h1>Oups, cette page a fondu.</h1><p class="lede">Elle n'existe pas ou plus. <a href="/recettes/">Voir toutes les recettes</a>.</p></header>` }));
write('flux.xml', rss());
write('sitemap.xml', sitemap(urls));
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);

console.log(`✓ ${recipes.length} recettes publiées, ${urls.length} pages générées dans _site/`);
