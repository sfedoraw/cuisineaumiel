# cuisineaumiel.fr

Site de recettes au miel, en français. Site statique généré par `build.js` (Node 18+, aucune dépendance).

## Ajouter une recette

Créez un fichier `recettes/mon-slug.md` en copiant une recette existante, puis :

```sh
node build.js            # génère le site dans _site/
npm run serve            # aperçu sur http://localhost:8080
```

Une recette dont la `date` est dans le futur n'est publiée qu'à partir de ce jour-là : le site est reconstruit chaque matin par GitHub Actions. On peut donc programmer des recettes à l'avance.

## Structure

- `recettes/` : une recette par fichier Markdown (front matter + sections `## Ingrédients`, `## Préparation`, `## Le conseil`, `## Variantes`).
- `pages/` : pages de contenu (guide des miels, à propos).
- `static/` : CSS, JavaScript, favicon, CNAME, copiés tels quels.
- `build.js` : générateur (pages recettes, catégories, recherche, flux RSS, sitemap, données structurées schema.org Recipe pour Google).
- `automatisation/nouvelle-recette.md` : consigne suivie par la routine qui ajoute une recette tous les 2-3 jours.

## Publication

`.github/workflows/deploy.yml` publie sur GitHub Pages à chaque push sur `main` et tous les jours à 6 h UTC.
