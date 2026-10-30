# Consigne de la routine « nouvelle recette »

Cette consigne est exécutée automatiquement tous les 2 à 3 jours (lundi, mercredi, vendredi) par une routine Claude branchée sur ce dépôt.

## Tâche

1. Lis tous les fichiers de `recettes/` pour connaître les recettes existantes (titres, catégories, miels utilisés).
2. Choisis une **nouvelle** recette originale autour du miel qui n'existe pas encore sur le site :
   - Équilibre les catégories : privilégie celle qui a le moins de recettes, sans jamais publier deux fois de suite dans la même catégorie.
   - Varie les miels (acacia, lavande, châtaignier, thym, sapin, tilleul, oranger, sarrasin, bruyère, romarin, toutes fleurs…).
   - Tiens compte de la saison en France à la date du jour (fruits et légumes de saison, fêtes à venir).
   - Une recette réaliste, testable à la maison, avec des ingrédients faciles à trouver. Pas de copie d'une recette publiée ailleurs.
3. Écris-la en français dans `recettes/<slug>.md`, en suivant exactement le format des recettes existantes :
   - Front matter : `titre`, `date` (date du jour, AAAA-MM-JJ), `categorie` (un des slugs : aperitifs-entrees, plats, desserts, patisserie, petit-dejeuner, boissons, sauces-condiments), `miel`, `emoji`, `teinte` (ambre, clair, lavande, foret, agrume, rose, vert, epice), `preparation`, `cuisson`, `repos` si besoin, `portions`, `unite` si ce ne sont pas des personnes, `difficulte` (Très facile, Facile, Moyenne, Difficile), `resume` (une ou deux phrases), `tags`.
   - Un paragraphe d'introduction qui explique le rôle du miel dans la recette.
   - `## Ingrédients` (avec des sous-titres `###` si utile), chaque ligne commence par la quantité en chiffres pour que l'ajustement des portions fonctionne.
   - `## Préparation` en étapes numérotées.
   - `## Le conseil`, et éventuellement `## Variantes`.
   - Le slug : en minuscules, sans accents, mots séparés par des tirets.
4. Lance `node build.js` et vérifie qu'il se termine sans erreur.
5. Fais un commit `Nouvelle recette : <titre>` et pousse sur `main`. La publication est automatique.

## Règles

- Ne modifie aucun autre fichier que la nouvelle recette.
- Si la construction échoue, corrige ta recette ; ne touche pas à `build.js`.
