# Notes et commentaires des lecteurs

Le site est statique (GitHub Pages) : les avis sont stockés par un petit service Cloudflare gratuit (`worker.js`).
Tant que `data/avis.json` a une adresse `api` vide, la section « Vos avis » n'apparaît pas sur le site.

## Ce que fait le service

- **Les notes** (1 à 5 étoiles) comptent tout de suite. Une seule note par personne et par recette pendant 30 jours.
- **Les commentaires** attendent votre validation : rien n'est publié sans vous.
- **Les photos « Je l'ai fait ! »** : le lecteur peut joindre une photo de sa réalisation. Elle est réduite dans son navigateur (1080 px) avant l'envoi, puis attend votre validation, comme les commentaires. Une fois publiée, elle apparaît sous la recette dans « Ils l'ont fait ». Une photo non validée est effacée au bout de 60 jours.
- **La page de modération** est à l'adresse `https://<votre-worker>/admin?cle=<votre mot de passe>` : un bouton « Publier » (avec ou sans la photo), un bouton « Supprimer ».
- **Les étoiles dans Google** : à chaque construction du site (tous les jours), la moyenne réelle est ajoutée aux données structurées de la recette (`aggregateRating`). Aucune note n'est jamais inventée.

## Mise en place (10 minutes, une seule fois)

1. Créer un compte gratuit sur https://dash.cloudflare.com/sign-up.
2. **Workers & Pages** > **Create** > **Create Worker**, le nommer `avis-cuisineaumiel`, puis **Deploy**.
3. **Edit code** : remplacer tout le code par le contenu de `avis/worker.js`, puis **Deploy**.
4. **Storage & Databases** > **KV** > **Create** : nommer l'espace `AVIS`.
5. Dans le Worker : **Settings** > **Bindings** > **Add** > **KV namespace** : nom de variable `AVIS`, espace `AVIS`.
6. Dans le Worker : **Settings** > **Variables and Secrets** > **Add** > type **Secret** : nom `ADMIN_KEY`, valeur = un mot de passe long de votre choix.
7. Copier l'adresse du Worker (du type `https://avis-cuisineaumiel.<compte>.workers.dev`) et la mettre dans `data/avis.json` :

```json
{ "api": "https://avis-cuisineaumiel.<compte>.workers.dev" }
```

Le site se reconstruit, et la section « Vos avis » apparaît sur toutes les recettes.

## Proposer une recette en photo (facultatif)

Sur la page « Proposer une recette », le lecteur peut photographier sa fiche : Claude (l'IA d'Anthropic) la lit et remplit le formulaire. Le lecteur relit puis envoie, comme avant ; rien n'est publié sans vous. Limite : 5 photos par personne et par jour. Coût : environ 1 à 2 centimes par photo.

1. Créer un compte sur https://platform.claude.com, ajouter un moyen de paiement (avec une limite de dépense mensuelle, par exemple 10 €), puis **API keys** > **Create key**.
2. Dans le Worker Cloudflare : **Settings** > **Variables and Secrets** > **Add** > type **Secret** : nom `ANTHROPIC_API_KEY`, valeur = la clé.
3. Dans `data/avis.json`, mettre `"lecture": true`.

Le bouton « Prendre ma fiche en photo » apparaît alors, et les encarts de l'accueil et des recettes mettent la fonction en avant.
