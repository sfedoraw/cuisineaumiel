# Consigne de la routine « nouvel article du magazine »

Cette consigne est exécutée automatiquement **deux fois par semaine** (mercredi et samedi) par une routine Claude branchée sur ce dépôt. Elle publie **un seul** article par exécution.

Le rythme global du site est volontairement limité à 5 ou 6 publications par semaine : 2 recettes (lundi, jeudi), 2 fiches miels (mardi, vendredi), 2 articles (mercredi, samedi). Ne publie jamais plus d'un article par exécution.

## Tâche

1. Lis tous les articles de `magazine/` (titres, rubriques, dates) et les pages du guide (`guide/`) pour ne jamais refaire un sujet déjà traité.
2. Choisis le sujet, dans cet ordre de priorité :
   - **Actualité du miel** des 15 derniers jours, vérifiée à la source (Commission européenne, Journal officiel, ministère de l'Agriculture, FranceAgriMer, Anses, INAO, ITSAP, Apimondia, presse agricole reconnue) : réglementation, récolte, prix, fraude, appellations, recherche.
   - Sinon, un **dossier de saison** utile au lecteur (le miel en cuisine selon la saison, choisir un miel pour les fêtes, comprendre une étiquette, la cristallisation, les miels de montagne, le miel et le sport sans allégation, le métier d'apiculteur, etc.).
   Rubriques possibles : Actualité, Décryptage, Enquête, Dossier, Bien manger et sport.
3. **Recherche** avec WebSearch et WebFetch. Ouvre chaque source avant de la citer. Si un fait ne peut pas être vérifié, ne l'écris pas.
4. Écris l'article en français dans `magazine/<slug>.md`, au même format que les articles existants :
   - Front matter : `titre` (optimisé SEO, moins de 70 caractères si possible), `resume` (150 à 160 caractères), `date` (date du jour, AAAA-MM-JJ), `rubrique`, `photo` et `credit` (voir plus bas).
   - **900 à 1 500 mots**, avec un chapeau qui pose le sujet, 5 à 8 sections `##` formulées comme les questions que les gens tapent dans Google, au moins une liste.
   - `## Questions fréquentes` (3 à 5 questions en `###`) et `## Sources` (liste à puces avec liens, 3 sources minimum).
   - Des liens internes : fiches miels (`/miels/...`), atlas (`/miels/atlas/`), guide (`/guide/...`), outils (`/outils/...`) et recettes du site en rapport.
5. Photo : avec WebFetch, ouvre `https://unsplash.com/napi/search/photos?query=<sujet en anglais>&per_page=30`, choisis une photo **gratuite** (jamais `plus.unsplash.com`, jamais `premium: true`), sans visage reconnaissable, non utilisée ailleurs sur le site (`grep -r` sur l'identifiant). `photo` = la partie après `photo-` de l'URL `images.unsplash.com/photo-...`, `credit` = le photographe.
6. Lance `node build.js` : aucune erreur, aucun avertissement pour le nouvel article.
7. Fais un commit `Nouvel article : <titre>` et pousse sur `main`.

## Règles éditoriales (très importantes)

- **Aucune allégation de santé** (règlement (CE) n° 1924/2006 : aucune n'est autorisée pour le miel). Parler de plaisir, de goût, de tradition, de bien-être, jamais de soin, de remède, d'immunité ou de performance.
- Rappeler, quand le sujet s'y prête, que le miel ne doit pas être donné aux enfants de moins d'un an (Anses).
- Fraude : « l'un des aliments les plus fraudés au monde » et, si utile, 46 % des 320 échantillons importés suspects (enquête européenne « From the Hives », 2021-2022, publiée en mars 2023).
- Ne jamais inventer d'apiculteur, de citation, de chiffre ou de date.
- Ne modifie aucun autre fichier que le nouvel article. Ne touche pas à `build.js`.
