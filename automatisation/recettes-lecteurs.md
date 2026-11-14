# Recettes proposées par les lecteurs

Les recettes envoyées par le formulaire « Proposer une recette » arrivent dans la boîte mail du site (samuel@fedorawiez.com), envoyées par FormSubmit, avec pour objet « Recette proposée : … ».

Règle de Samuel (14/11/2026) : **un seul OK de sa part**. Je prépare tout, il valide d'un clic, puis je publie.

## Chaque matin

1. Chercher dans Gmail les mails FormSubmit « Recette proposée » qui n'ont pas le libellé `cuisineaumiel/traitee`.
2. Écarter sans rien publier :
   - les spams et les textes sans vraie recette ;
   - les recettes sans miel ;
   - les copies évidentes d'un livre ou d'un site (vérifier quelques phrases sur le web) ;
   - les doublons d'une recette du site.
   Leur mettre quand même le libellé `cuisineaumiel/traitee` et les citer dans le résumé.
3. Pour chaque recette retenue :
   - la réécrire au format du site, comme dans `nouvelle-recette.md` : front matter complet, `cout`, `## Le conseil`, `## Questions fréquentes` ;
   - ajouter `auteur: Prénom, Ville` (la ville seulement si elle est donnée) ;
   - ne jamais inventer d'histoire ni de détail sur l'auteur ;
   - garder ses quantités et son tour de main, et corriger seulement ce qui est faux ou incohérent ;
   - faire la **double vérification** de `nouvelle-recette.md`.
4. Mettre la recette sur une branche et ouvrir une PR (ne pas fusionner).
5. Montrer à Samuel une carte de décision : titre, auteur, 2 lignes de résumé, ce qui a été corrigé, lien vers la PR. Options : « Publier » ou « Ne pas publier ».
6. S'il choisit « Publier » : fusionner la PR, vérifier le déploiement, puis écrire à l'auteur pour le prévenir. Ce mail se fait en brouillon Gmail, que Samuel envoie lui-même.
7. Mettre le libellé `cuisineaumiel/traitee` sur le mail.

Quand il n'y a rien de nouveau, ne rien dire à Samuel.
