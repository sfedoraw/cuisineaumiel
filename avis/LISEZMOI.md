# Notes et commentaires des lecteurs

Le site est statique (GitHub Pages) : les avis sont stockés par un petit service Cloudflare gratuit (`worker.js`).
Tant que `data/avis.json` a une adresse `api` vide, la section « Vos avis » n'apparaît pas sur le site.

## Ce que fait le service

- **Les notes** (1 à 5 étoiles) comptent tout de suite. Une seule note par personne et par recette pendant 30 jours.
- **Les commentaires** attendent votre validation : rien n'est publié sans vous.
- **La page de modération** est à l'adresse `https://<votre-worker>/admin?cle=<votre mot de passe>` : un bouton « Publier », un bouton « Supprimer ».
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
