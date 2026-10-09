# budget-lib

Les règles métier de Budget App, partagées par la version bureau (**GTK**, `gtk-budget`) et la
version mobile (**NativeScript**, `nativescript/budget-mobile`).

TypeScript pur : aucune interface, aucun stockage, aucun réseau ni API de plateforme. Le code
tourne tel quel sous Node et dans le moteur JavaScript d'un téléphone (aucune regex `\p{…}`,
par exemple, que NativeScript refuse).

## Contenu

| Module | Rôle |
| --- | --- |
| `transaction` | modèle d'une transaction, validation, tri, totaux, filtre et recherche sans accents |
| `month` | clés de mois (`2026-09`), navigation, dates et jours du mois |
| `recurrence` | récurrences (mensuelle, trimestrielle, annuelle) et génération des occurrences |
| `category` | catégories, catégories par défaut, lecture de l'ancien format |
| `category-icons` | noms d'icônes de catégorie partagés et conversion des anciens emoji |
| `balance` | seuils du solde et niveau (`critical` → `high`) |
| `general-settings` | préférences d'affichage (langue, devise, formats, thème) |
| `backup` | sauvegarde complète : création, lecture, remplacement ou fusion idempotente |
| `calendar-ics` | une transaction ↔ un événement iCalendar « journée entière » (champs `X-BUDGET-*`) |
| `caldav` | client CalDAV minimal (config, PROPFIND/REPORT/PUT/DELETE, Basic) ; le transport HTTP est fourni par l'application |
| `calendar-sync` | synchronisation à trois voies (référence / local / agenda) des transactions ; l'agenda l'emporte en cas de conflit |
| `csv` | export et import tolérant des transactions pour un tableur |
| `pie-chart` | parts et couleurs d'un camembert par catégorie |
| `bank` | import bancaire : transactions d'Enable Banking → transactions du budget (catégorie devinée, identifiants stables), adresse de retour, fenêtre d'import |
| `bank-state` | ce qu'une application retient de la connexion bancaire (réglages, accès, identifiants déjà importés) et la règle de l'import automatique |
| `enable-banking` | client de l'API Enable Banking (jeton, appels, pagination, erreurs) ; le transport HTTP et la signature RSA sont fournis par l'application |

Tout est exporté depuis le point d'entrée : `import { filterTransactions, mergeMonth } from 'budget-lib'`.

Le format des fichiers (`categories.json`, `thresholds.json`, `recurrences.json`,
`months/YYYY-MM.json`) est celui des deux applications : elles peuvent partager le même
dossier distant.

## Développement

```bash
npm install           # installe et compile (script « prepare »)
npm run build         # tsc → dist/ (ESM + déclarations)
npm run typecheck     # sources et tests
npm test              # vitest
npm run test:coverage
```

Node 20 ou plus.

## Utilisation dans une application

Tant que la bibliothèque n'est pas publiée sur npm, on la référence par son dépôt Git :

```json
{ "dependencies": { "budget-lib": "git+https://github.com/cgreg21/budget-lib.git" } }
```

`npm install` récupère le dépôt (le dossier `dist/` y est versionné). Pour développer la
bibliothèque en local en même temps qu'une application, utiliser `npm link` ou
`npm install ../budget-lib` temporairement, sans committer ce changement.

## Migration des applications

**Fait** : les deux applications consomment cette bibliothèque ; les dossiers `src/domain/` (GTK) et
`src/app/domain/` (mobile) ont été supprimés et leurs imports pointent sur `budget-lib`. Tous les
noms exportés par le domaine GTK existent à l'identique. Le stockage WebDAV/iCloud a été remplacé
par la synchronisation des transactions avec un agenda CalDAV (voir `calendar-sync`).

Autres points à connaître :

- `DEFAULT_GENERAL_SETTINGS.theme` vaut `system` (valeur du bureau) ; le mobile, sombre par défaut,
  le surcharge : `{ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' }`.
- `categoryGlyph` et `icons.ts` (correspondance nom d'icône → glyphe Material Design Icons) restent
  dans le mobile ; `CATEGORY_ICON_CHOICES` ne porte plus que `name` et `legacyEmoji`.
- Les imports internes portent l'extension `.js` (`module: nodenext`) : sans conséquence pour les
  applications, qui consomment `dist/`.

## Ce qui reste dans les applications

Ce qui dépend d'une plateforme n'a pas sa place ici : stockage (fichiers JSON et trousseau côté
GTK, SQLite et stockage sécurisé côté mobile), traductions, formatage
des montants et dates, widgets, graphiques et correspondance des icônes.
