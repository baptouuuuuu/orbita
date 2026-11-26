# ORBITA

Application locale, générique et autonome de pilotage de jeux physiques. Aucun scénario ni matériel particulier n'est fourni. Le serveur Fastify, l'interface React et SQLite fonctionnent sur une seule machine ; Internet n'est nécessaire que pour installer les dépendances.

## Installation et lancement

Prérequis : Node.js 24 ou supérieur et npm. Depuis le répertoire du projet :

```sh
npm ci
npm run build
export ORBITA_ADMIN_PASSWORD='choisir-un-secret-admin-long-et-unique'
export ORBITA_GM_PASSWORD='choisir-un-autre-secret-long-et-unique'
npm start
```

Les deux mots de passe doivent être distincts et contenir au moins 12 caractères ; le serveur refuse de démarrer sinon. Les exemples ci-dessus sont des indications à remplacer, **pas des secrets de production**. Préférez un gestionnaire de secrets local ou une saisie hors historique shell ; ne commitez jamais ces valeurs. Les mots de passe sont fournis au processus par l'environnement, dérivés avec scrypt au démarrage et ne sont pas stockés en base ; les variables d'environnement restent néanmoins accessibles aux utilisateurs/processus autorisés de la machine.

Ouvrir <http://127.0.0.1:3000>. Connectez-vous comme administrateur, créez une configuration avec une durée et des postes, puis créez une session depuis Pilotage. Créez des équipes, lancez la partie et utilisez les boutons des postes pour la simulation. Une seule session non terminée est autorisée. Une réinitialisation clôture l'ancienne session et en crée une nouvelle, avec ses équipes actives et des scores à zéro.

`.env.example` décrit les variables disponibles : il n'est pas chargé automatiquement. `ORBITA_DB` vaut `./data/orbita.sqlite`, `ORBITA_SILENT_SECONDS` vaut 60, et le port TCP HTTP/WebSocket vaut 3000 par défaut. `npm test`, `npm run lint` et `npm run build` exécutent les contrôles. Les migrations SQL sont appliquées au démarrage et enregistrées dans la base.

## Tablette et sécurité réseau

Par défaut le serveur écoute **uniquement sur 127.0.0.1**. Pour une tablette, choisissez une adresse IP LAN fixe pour la machine, isolez le réseau avec un pare-feu, puis configurez par exemple :

```sh
export ORBITA_HOST=0.0.0.0
export ORBITA_PORT=3000
export ORBITA_ORIGIN=http://192.168.1.10:3000
npm start
```

Utilisez exactement cette origine sur tous les clients ; remplacez l'adresse par celle de votre machine. N'exposez pas le port à Internet. En HTTP, les mots de passe et cookies traversent le réseau **sans chiffrement** : réservez ce mode à un LAN physiquement fiable et isolé. Pour un réseau partagé, utilisez un proxy HTTPS local de confiance et indiquez son origine HTTPS exacte dans `ORBITA_ORIGIN` ; le cookie reçoit alors l'attribut `Secure`. Configurez aussi les règles de pare-feu, la terminaison TLS et le transfert WebSocket du proxy. Le serveur n'installe ni certificat ni proxy.

Les deux rôles partagent chacun un mot de passe local, sans compte nominatif. Les journaux identifient le rôle, pas une personne. Les sessions en mémoire expirent après huit heures ou au redémarrage ; le cookie est HttpOnly et SameSite strict. Les mutations et WebSocket exigent l'origine configurée, et les routes Admin vérifient le rôle côté serveur. Les échecs de connexion sont limités en mémoire par adresse IP ; cette protection n'est pas distribuée et se réinitialise au redémarrage. N'utilisez pas ces contrôles comme substitut à l'isolation réseau.

## Sauvegarde, restauration et conservation

L'export JSON d'une session est disponible dans Pilotage, y compris pour une session terminée ; il inclut les équipes, scores, événements complets et la configuration figée. L'interface limite l'affichage du journal d'une session aux 200 événements les plus récents, pas l'export.

Pour une sauvegarde cohérente en cours de fonctionnement, utilisez l'API de sauvegarde SQLite (adaptez les chemins) :

```sh
node --input-type=module -e "import { DatabaseSync, backup } from 'node:sqlite'; const db = new DatabaseSync('./data/orbita.sqlite', { readOnly: true }); await backup(db, './orbita-sauvegarde.sqlite'); db.close();"
```

Pour restaurer, **arrêtez ORBITA**, sauvegardez d'abord la base actuelle, retirez les éventuels fichiers WAL/SHM associés à la base arrêtée, puis copiez la sauvegarde à l'emplacement `ORBITA_DB` et redémarrez. Une restauration remplace les données courantes ; testez régulièrement vos sauvegardes. Protégez ces fichiers comme les données opérationnelles.

Les événements et scores sont append-only ; aucune purge automatique n'est exécutée. L'exploitant doit exporter et conserver les sauvegardes selon sa politique locale et surveiller l'espace disque. Une rotation ou purge sélective avec conservation de l'intégrité n'est pas encore implémentée.

## Comportements et limites de cette version

- Pilotage, score calculé côté serveur, compensation journalisée, classement, indices/interventions, historique, configuration copiée par session, postes simulés, diagnostic et export JSON sont disponibles.
- La durée est un compte à rebours indicatif : à zéro, la session **ne se termine pas automatiquement** ; le maître du jeu décide. Le temps écoulé continue pendant un arrêt du serveur si la session était en cours.
- Le statut silencieux est calculé à la lecture après le seuil ; il ne génère pas lui-même un événement de déconnexion. Les changements explicitement simulés sont journalisés. Il n'y a pas de heartbeat automatique du simulateur : un poste connecté devient silencieux sans nouvelle action.
- Les configurations comprennent la durée, la liste des postes et l'autorisation de modifier les équipes. Les règles de score paramétrables, autres modes de classement, catalogue d'équipes réutilisables et gestion individuelle des comptes ne sont pas implémentés. Le classement trie par score décroissant puis nom ; les équipes retirées restent visibles pour préserver les résultats.
- La sauvegarde/restauration est manuelle, sans écran dédié ; export CSV, purge, notifications et diagnostic matériel avancé ne sont pas implémentés. L'adaptateur est une interface interne : aucun transport ou pilote de matériel réel n'est fourni et la commande générique `ping` n'est pas exposée par l'API.
- L'indice est un texte saisi et consigné par l'opérateur, sans écran joueur séparé. Les journaux techniques et les statuts sont limités aux informations reçues par le serveur ; aucune découverte automatique de matériel n'est réalisée.

## Dépannage

- Démarrage refusé : vérifier les deux mots de passe, le port et les permissions du dossier de base.
- `Origine interdite` ou WebSocket déconnecté : vérifier que l'URL dans le navigateur correspond exactement à `ORBITA_ORIGIN`, y compris protocole et port.
- La tablette ne se connecte pas : vérifier l'écoute LAN, le pare-feu et le réseau ; ne pas utiliser `127.0.0.1` depuis la tablette.
- Poste hors ligne : envoyer un état simulé ou vérifier le seuil de silence ; la session reste pilotable.
- Après un redémarrage, reconnectez-vous ; les sessions d'authentification ne sont pas persistées.

L'API et le protocole sont décrits dans [API.md](API.md).
