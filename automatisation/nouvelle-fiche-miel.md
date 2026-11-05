# Consigne de la routine « nouvelle fiche miel »

Cette consigne est exécutée automatiquement **deux fois par semaine** (mardi et vendredi) par une routine Claude branchée sur ce dépôt. Elle publie **une seule** fiche par exécution. Ne publie jamais plus d'une fiche par exécution, même si la file est longue : un rythme régulier et modéré est voulu pour Google.

## Tâche

1. Ouvre `automatisation/file-fiches-miels.md` et prends la **première ligne non cochée**. Si `miels/<slug>.md` existe déjà, coche la ligne et passe à la suivante.
2. Lis deux fiches existantes en entier (par exemple `miels/miel-de-tilleul.md` et `miels/miel-de-chataignier.md`) pour reprendre exactement le format, le ton et la structure. Lis aussi l'entrée correspondante dans `atlas/atlas.json` (sections `protege`, `europe` ou `monde`).
3. **Recherche** avec WebSearch et WebFetch. Vérifie chaque fait dans au moins une source crédible, et ouvre chaque lien avant de le citer. Sources à privilégier, dans cet ordre :
   - textes officiels : directive 2001/110/CE et directive (UE) 2024/1438, Codex Alimentarius (CXS 12-1981), registre européen eAmbrosia et cahier des charges INAO pour les AOP et IGP, ministères et agences publiques (Anses, INRAE, MPI pour la Nouvelle-Zélande, etc.) ;
   - publications scientifiques : Persano Oddo et al., « Main European unifloral honeys: descriptive sheets », *Apidologie* 35 (2004), doi 10.1051/apido:2004045, et articles à comité de lecture ;
   - organismes de filière reconnus : ITSAP, FranceAgriMer, Apimondia, syndicats d'appellation, Slow Food pour les Sentinelles.
   Si un fait ne peut pas être vérifié, ne l'écris pas.
4. Écris la fiche en français dans `miels/<slug>.md` :
   - Front matter complet comme les fiches existantes : `nom`, `titre` (optimisé SEO : « Miel de X : goût, origine, récolte et usages en cuisine » ou proche, moins de 70 caractères si possible), `resume` (150 à 160 caractères, avec le mot-clé), `famille` (clair, ambre ou fonce), `photo` et `credit` (voir plus bas), `plante` (avec le nom latin en italique), `couleur`, `gout`, `texture`, `cristallisation`, `recolte`, `regions`, `labels`, `profil` (5 notes de 0 à 5 : douceur, acidité, amertume, intensité, longueur), `profil_source` (`apidologie` seulement si le profil vient de la fiche *Apidologie* ; sinon ne mets pas ce champ), `teinte` (couleur hexadécimale proche du miel), `mois` (mois de récolte, ex. `6,7`), `crist` (1 très lente à 5 très rapide), `zones` (régions françaises de production au format `Nom|longitude|latitude;…`, seulement si le miel est produit en France), `accords`, `boissons`, `maj` (date du jour).
   - **Au moins 1 800 mots** de texte utile, sans remplissage ni répétition, pour une fiche unique et complète. Sections attendues (titres `##`, adaptés au miel) : la plante et son milieu ; couleur, parfum et goût ; composition et cristallisation ; où et quand il est récolté (régions, calendrier, conditions) ; labels, appellations et réglementation s'il y en a ; authenticité et fraude (comment le reconnaître, ce que dit l'étiquette) ; histoire et traditions ; comment l'utiliser en cuisine (accords sucrés, salés, boissons) ; comment le choisir et le conserver ; plaisir et bien-être ; questions fréquentes (`## Questions fréquentes` avec 5 à 7 questions en `###`, qui reprennent les vraies recherches des internautes) ; `## Sources` (liste à puces, 5 sources minimum, avec liens).
   - Ajoute des liens internes : vers les recettes du site qui utilisent ce miel ou un miel proche (`/recettes/<slug>/`), vers `/miels/atlas/`, vers les pages du guide (`/guide/trouver-un-apiculteur/`, `/guide/glossaire-du-miel/`, etc.) et vers les fiches de miels proches.
5. Photo : avec WebFetch, ouvre `https://unsplash.com/napi/search/photos?query=<plante ou miel en anglais>&per_page=30` et choisis une photo **gratuite** (jamais `plus.unsplash.com`, jamais `premium: true`) qui montre la plante en fleurs, le paysage ou le miel. Mets dans `photo` la partie après `photo-` de l'URL `images.unsplash.com/photo-...` et le nom du photographe dans `credit`. N'utilise pas une photo déjà présente sur le site (cherche l'identifiant avec `grep -r`).
6. Dans `atlas/atlas.json`, ajoute `"fiche": "<slug>"` à chaque entrée qui correspond à ce miel (appellation protégée, plante européenne ou miel du monde), sans rien changer d'autre.
7. Coche la ligne dans `automatisation/file-fiches-miels.md` : `- [x] <slug> : … (publiée le AAAA-MM-JJ)`.
8. Lance `node build.js`. Il doit se terminer sans erreur et sans avertissement pour la nouvelle fiche (moins de 1 000 mots ou aucune source). Corrige la fiche si besoin.
9. Fais un commit `Nouvelle fiche miel : <nom>` et pousse sur `main`. La publication est automatique.

## Règles éditoriales (très importantes)

- **Aucune allégation de santé.** Le règlement (CE) n° 1924/2006 interdit toute allégation de santé non autorisée, et aucune n'est autorisée pour le miel. Ne jamais écrire que le miel soigne, apaise la toux, renforce l'immunité, est antibactérien, antioxydant « pour la santé », etc. Pour le mānuka, on peut décrire le **méthylglyoxal (MGO)** et les grades commerciaux comme des faits de composition et d'étiquetage, sans aucune promesse santé. On parle de plaisir, de goût, de tradition et de bien-être.
- Toujours rappeler que **le miel ne doit pas être donné aux enfants de moins d'un an** (recommandation de l'Anses), dans la FAQ ou la section bien-être.
- Pour la fraude, utiliser la formule « l'un des aliments les plus fraudés au monde » et, si utile, le chiffre de l'enquête européenne « From the Hives » : 46 % des 320 échantillons de miels importés suspects (2021-2022, publié en mars 2023).
- **Ne jamais inventer** d'apiculteur, de marque, de chiffre, de date ou de citation. Pas de producteur nommé, sauf un organisme officiel ou un syndicat d'appellation cité comme source.
- Écrire simplement, en phrases complètes, pour le grand public. Pas de copie d'un texte publié ailleurs : reformuler entièrement.

## Ce qu'il ne faut pas faire

- Ne modifie aucun autre fichier que la nouvelle fiche, `atlas/atlas.json` (champ `fiche` uniquement) et la file d'attente.
- Ne touche pas à `build.js`. Si la construction échoue, corrige ta fiche.
- Une seule fiche par exécution.
