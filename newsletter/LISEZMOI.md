# Lettre d'information (Brevo)

Tout est prêt sur le site ; il ne manque que votre compte Brevo (gratuit jusqu'à 300 e-mails par jour).
Tant que `data/newsletter.json` a un « formulaire » vide, l'encart d'inscription n'apparaît nulle part.

## Ce que fait le site

- **L'inscription** : un encart en pied de page et sur l'accueil. Brevo envoie un e-mail de confirmation (double opt-in), puis ajoute l'adresse à votre liste.
- **La lettre du vendredi** : chaque vendredi matin, GitHub prépare la lettre avec les recettes et articles de la semaine, et la dépose dans Brevo.
  - Par défaut, c'est un **brouillon** : vous le relisez dans Brevo (Campagnes), puis vous cliquez sur Envoyer.
  - Pour un envoi automatique, mettez `"envoi_auto": true`.
- **L'aperçu** de la lettre de la semaine est visible sur https://cuisineaumiel.fr/newsletter/apercu/ (non référencé par Google).

## Mise en place (15 minutes, une seule fois)

1. Créer un compte sur https://onboarding.brevo.com/account/register et valider l'adresse d'expédition (par exemple `bonjour@cuisineaumiel.fr`). Brevo demande d'authentifier le domaine (quelques lignes DNS chez OVH, Brevo les indique).
2. **Contacts** > **Listes** > **Créer une liste** « Lettre cuisineaumiel ». Noter son numéro (ID).
3. **Contacts** > **Formulaires** > **Créer un formulaire d'inscription** : liste ci-dessus, double opt-in activé. À l'étape « Partager », copier l'adresse du formulaire (elle ressemble à `https://xxxx.sibforms.com/serve/MUIF...`).
4. **Paramètres** > **SMTP et API** > **Clés API** > **Générer une clé**.
5. Dans GitHub : dépôt `cuisineaumiel` > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** : nom `BREVO_API_KEY`, valeur = la clé.
6. Remplir `data/newsletter.json` :

```json
{
  "formulaire": "https://xxxx.sibforms.com/serve/MUIF...",
  "liste": 3,
  "expediteur": { "nom": "Cuisine au miel", "email": "bonjour@cuisineaumiel.fr" },
  "envoi_auto": false
}
```

Le site se reconstruit et l'encart d'inscription apparaît. Pour tester l'envoi sans attendre vendredi : GitHub > **Actions** > **Lettre de la semaine** > **Run workflow**.
