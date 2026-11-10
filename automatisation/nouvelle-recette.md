# Consigne de la routine « nouvelle recette »

Cette consigne est exécutée automatiquement deux fois par semaine (lundi et jeudi) par une routine Claude branchée sur ce dépôt. Une seule recette par exécution.

## Tâche

1. Lis tous les fichiers de `recettes/` pour connaître les recettes existantes (titres, catégories, miels utilisés).
2. Choisis une **nouvelle** recette originale autour du miel qui n'existe pas encore sur le site :
   - Équilibre les catégories : privilégie celle qui a le moins de recettes, sans jamais publier deux fois de suite dans la même catégorie.
   - Varie les miels (acacia, lavande, châtaignier, thym, sapin, tilleul, oranger, sarrasin, bruyère, romarin, toutes fleurs…).
   - Tiens compte de la saison en France à la date du jour (fruits et légumes de saison, fêtes à venir).
   - Une recette réaliste, testable à la maison, avec des ingrédients faciles à trouver. Pas de copie d'une recette publiée ailleurs.
3. Écris-la en français dans `recettes/<slug>.md`, en suivant exactement le format des recettes existantes :
   - Front matter : `titre`, `date` (date du jour, AAAA-MM-JJ), `categorie` (un des slugs : aperitifs-entrees, plats, desserts, patisserie, petit-dejeuner, boissons, sauces-condiments), `miel`, `photo` (identifiant Unsplash, voir ci-dessous), `credit` (nom du photographe), `preparation`, `cuisson`, `repos` si besoin, `portions`, `unite` si ce ne sont pas des personnes, `difficulte` (Très facile, Facile, Moyenne, Difficile), `resume` (une ou deux phrases), `tags`.
   - Un paragraphe d'introduction qui explique le rôle du miel dans la recette.
   - `## Ingrédients` (avec des sous-titres `###` si utile), chaque ligne commence par la quantité en chiffres pour que l'ajustement des portions fonctionne.
   - `## Préparation` en étapes numérotées.
   - `## Le conseil`, et éventuellement `## Variantes`.
   - Le slug : en minuscules, sans accents, mots séparés par des tirets.
4. Photo : avec WebFetch, ouvre `https://unsplash.com/s/photos/<plat-en-anglais>` et choisis une photo **gratuite** (jamais `plus.unsplash.com` ni Unsplash+) dont la description correspond bien au plat. Mets dans `photo` la partie après `photo-` de l'URL `images.unsplash.com/photo-...` et le nom du photographe dans `credit`. N'utilise pas une photo déjà présente dans une autre recette. La photo du miel est choisie automatiquement selon le miel indiqué.
5. **Double vérification, avant toute publication** (voir la section ci-dessous). Prends le temps nécessaire : une recette juste vaut mieux qu'une recette publiée à l'heure.
6. Lance `node build.js` et vérifie qu'il se termine sans erreur.
7. Fais un commit `Nouvelle recette : <titre>` et pousse sur `main`. La publication est automatique. Dans le message de commit, ajoute une ligne `Vérifiée deux fois : <ce que tu as corrigé, ou « rien à corriger »>`.

## Double vérification

Une recette du site doit marcher du premier coup chez le lecteur. Une erreur (une proportion fausse, un ingrédient oublié) fait perdre sa confiance, et celle de Google.

### Première lecture : les chiffres et la cohérence

Relis le fichier en entier et vérifie chaque point. Fais les calculs, ne les estime pas.

- **Le résumé et l'introduction disent la même chose que la recette.** Chaque affirmation (« un tiers de seigle », « sans beurre », « peu sucré », « 10 minutes ») doit être vraie au vu des ingrédients et des étapes. Calcule les proportions annoncées.
- **Chaque ingrédient de la liste sert dans une étape, et chaque ingrédient cité dans les étapes est dans la liste**, avec une quantité.
- **Les quantités sont réalistes** pour le nombre de portions (par exemple 120 à 180 g de viande ou de poisson par personne en plat, 1 œuf pour environ 50 à 60 g de farine en pâte à crêpes). Le miel est bien dosé : il doit se sentir sans écraser le plat.
- **Les temps du front matter collent aux étapes** : `preparation`, `cuisson` et `repos` correspondent à l'addition des étapes.
- **Températures et cuissons justes et sûres** : four, cuisson à cœur des volailles et du porc, réfrigération des préparations crues (œufs, crème, foie gras). Le miel caramélise vite : vérifie que la température et la durée ne le brûlent pas.
- **La technique fonctionne** : l'ordre des étapes est logique (préchauffer avant d'enfourner, laisser refroidir avant de démouler, etc.).
- **Les règles du site sont respectées** : aucune allégation santé, mention « déconseillé aux enfants de moins d'un an » si la recette s'adresse aux enfants, mention de la loi Évin si la recette contient de l'alcool.
- **La photo correspond bien au plat** (relis la description de la photo Unsplash).

Corrige tout ce qui ne va pas.

### Deuxième lecture : comme un lecteur en cuisine

Relis ensuite la recette **depuis le début**, comme quelqu'un qui la cuisine pour la première fois, ustensiles en main :

- Est-ce qu'il manque une information pour réussir (taille du moule, épaisseur, signe que c'est cuit) ?
- Est-ce qu'une phrase peut être comprise de deux façons ?
- Est-ce que le conseil final est vraiment utile, et propre à cette recette ?

Corrige encore si besoin, puis refais rapidement la première lecture sur ce que tu as changé.

### En cas de doute

Si un doute demeure sur une proportion, une cuisson ou la sécurité alimentaire, **ne publie pas** : choisis une autre recette plus sûre, ou n'en publie aucune ce jour-là. Mieux vaut sauter une publication que publier une recette fausse.

## Règles

- Ne modifie aucun autre fichier que la nouvelle recette.
- Si la construction échoue, corrige ta recette ; ne touche pas à `build.js`.
