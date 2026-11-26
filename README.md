# ORBITA

Application locale, générique et autonome de pilotage de jeux physiques. Une mission lunaire est proposée en exemple ; aucun matériel particulier n'est fourni. Le serveur Fastify, l'interface React et SQLite fonctionnent sur une seule machine ; Internet n'est nécessaire que pour installer les dépendances.

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

## Mission et équipements

Lors de la création d'une session, choisissez éventuellement **Lunar Relay — le dernier message**. Cette mission coopérative est commune à toute la session, pas propre à chaque équipe. Lancez la session : le maître du jeu lit les consignes, confirme les manipulations physiques et saisit les réponses de l'équipe. Les actions se débloquent dans l'ordre ; les indices sont facultatifs, les mauvaises réponses comptabilisées et la progression suspendue en pause. Les durées affichées sont indicatives, pas des chronomètres ni une garantie de durée. Une session terminée avant la dernière action donne un résultat « mission inachevée », sinon « mission accomplie ». Le résultat, les actions validées et les tentatives figurent dans le détail et l'export JSON ; la réinitialisation conserve l'ancien résultat et repart à zéro avec la même version du scénario.

Préparation : utiliser des **accessoires fictifs sans alimentation électrique réelle** (panneaux, régulateur, pupitre, radio, câbles et deux antennes ou montures graduées). Prévoir des étiquettes, du papier et des crayons ; répartir les rôles entre technicien, navigateur et opérateur radio, en les faisant tourner. Les consignes et données de chaque énigme sont dans le pilotage ; le maître du jeu peut les lire ou les recopier sur des fiches séparées pour encourager la communication. Les sept étapes couvrent installation, énergie, configuration, pointage lunaire, relais terrestre, émission chiffrée et réponse. Les vérifications physiques sont des confirmations humaines : Orbita ne détecte pas si un câble ou une antenne a réellement été manipulé. Les codes et le chiffrement sont des mécanismes de jeu, pas des moyens de sécurité.

Les **postes** d'une configuration représentent les équipements surveillés : chacun affiche son état déclaré, son dernier message et sa dernière activité ; un poste silencieux devient hors ligne. Les boutons sont uniquement un simulateur et les états ne déverrouillent pas automatiquement les actions de scénario. Une intégration externe de confiance peut envoyer les messages de statut ou d'événement à l'API authentifiée décrite dans [API.md](API.md). Aucun pilote matériel ni commande à distance n'est fourni ; l'intégration doit gérer la connexion et les messages périodiques. Les appareils ne disposent pas d'identifiants individuels.

La mission **Lunar Relay — simulation instrumentée** propose sept étapes et 21 interactions : branchements, interrupteurs, positions, liaisons et boutons. Dans Pilotage, choisissez cette mission, créez et lancez la session, puis ouvrez **Capteurs et interactions** pour simuler leurs états. L'action attendue est mise en évidence ; la barre indique la progression commune à toutes les équipes de la session, et non une progression individuelle. Les équipements physiques peuvent transmettre les mêmes états par l'API ; ils nécessitent une intégration distincte. Un changement d'état ne valide que l'action attendue ; un état envoyé trop tôt ne valide pas une action future, même s'il est répété : changez-le puis réémettez-le au bon moment. Les états et validations sont conservés dans la session et son export ; pause et fin interdisent leur modification. Les capteurs commencent à l'état inconnu et une réinitialisation les remet à zéro. Le simulateur n'atteste pas qu'une manipulation réelle a eu lieu.

Pour ajouter ou adapter une mission, modifier le catalogue `src/shared/scenarios.ts` : chaque scénario a un identifiant et une version, des étapes ordonnées et des actions à confirmation, à réponse exacte (insensible à la casse, espaces aux extrémités ignorés) ou à capteur. Un scénario instrumenté déclare ses capteurs (`id`, nom et valeurs possibles) ; chaque action de capteur référence l'identifiant et la valeur attendue. Donner à chaque étape, action et capteur un identifiant unique dans son scénario, renseigner consignes, indice et durée indicative, puis incrémenter la version lors d'une modification. Les scénarios sont actuellement définis dans le code, sans éditeur ni import utilisateur ; redéployer l'application pour les ajouter. Une copie complète est figée à la création de chaque session, y compris lors de la réinitialisation, afin que les parties existantes ne changent pas après une mise à jour. Les réponses ne sont pas un secret : cette interface est destinée au maître du jeu.

`.env.example` décrit les variables disponibles : il n'est pas chargé automatiquement. `ORBITA_DB` vaut `./data/orbita.sqlite`, `ORBITA_SILENT_SECONDS` vaut 60, et le port TCP HTTP/WebSocket vaut 3000 par défaut. `npm test`, `npm run lint` et `npm run build` exécutent les contrôles. Les migrations SQL sont appliquées au démarrage et enregistrées dans la base.

## Démonstration GitHub Pages

La démonstration utilise la même interface mais **simule le serveur dans le navigateur** : aucun serveur ORBITA, appareil ou mot de passe n'est nécessaire. Une configuration et deux postes fictifs sont proposés. Choisissez un rôle ; dans Pilotage, l'aperçu des scénarios présente leurs étapes avant la création d'une session. Choisissez un scénario et une configuration, créez la session, lancez-la puis validez ses actions et réponses pour tester sa gestion. Le rôle administrateur permet aussi de modifier les configurations. Le bouton « Donner un retour sur GitHub » ouvre une issue à remplir manuellement, sans transmettre automatiquement les données de test.

Les données sont stockées dans le navigateur (`localStorage`), partagées entre ses onglets et effaçables avec « Effacer la démonstration » ; le rôle est conservé dans l'onglet (`sessionStorage`). Elles ne sont ni partagées entre appareils ni garanties permanentes. Ne saisissez pas de données sensibles : cette version n'a aucune authentification réelle, n'est pas un système de production et ne teste pas les connexions matérielles, le serveur, SQLite ou la sécurité réelle. Le diagnostic et les changements temps réel sont simulés ; les accès simultanés peuvent écraser des modifications.

Pour tester le build localement :

```sh
npm run build:demo
npx vite preview --mode demo --host 127.0.0.1
```

Ouvrir l'URL affichée suivie de `/orbita/`. Le workflow `.github/workflows/pages.yml` vérifie chaque push et chaque pull request ; seuls les commits de `main` sont publiés sur le site stable. Pour activer la publication, dans **Settings → Pages**, choisir **GitHub Actions** comme source, et autoriser Actions si nécessaire. L'URL prévue est `https://baptouuuuuu.github.io/orbita/` après le premier déploiement réussi. La disponibilité et la visibilité de Pages pour un dépôt privé dépendent de l'offre et des paramètres GitHub ; ne rendez pas le dépôt public sans avoir vérifié son contenu et choisi sa visibilité. Le lien dans l'interface suppose que les issues du dépôt sont activées et accessibles aux personnes qui font les retours.

Le build normal `npm run build` produit dans `dist/` l'interface réelle avec authentification ; `build:demo` produit séparément `dist-demo/`. Ne déployez jamais `dist-demo/` sur la VM de production.

## Préparation du déploiement VM

Le workflow manuel **Préparer ou déployer la production VM** teste et construit toujours un artefact de production. Il ne contacte une VM que si la variable de dépôt `VM_DEPLOY_ENABLED` vaut explicitement `true` et que le lancement vise `main`. Configurez auparavant l'environnement GitHub `production` et ses approbations/protections ; ne l'activez pas avant d'avoir préparé et testé la VM.

Hypothèses du déploiement fourni : Linux, Node 24 et npm (`/usr/bin/npm` dans le service d'exemple ; adaptez le chemin si nécessaire), `tar`, `flock`, `curl`, `systemd`, accès SSH et accès au registre npm au moment du déploiement. Le serveur écoute `127.0.0.1:3000` ; un proxy HTTPS local et le pare-feu restent à configurer séparément. Préparer sur la VM :

1. Créer l'utilisateur système `orbita` et le répertoire `/var/lib/orbita` accessible en écriture à cet utilisateur. Créer `/opt/orbita/releases` et accorder au compte SSH de déploiement les droits d'écriture sur `/opt/orbita` et `releases` ; les autres utilisateurs ne doivent pas pouvoir modifier les versions.
2. Installer `deploy/orbita.service` dans `/etc/systemd/system/orbita.service`, puis exécuter `sudo systemctl daemon-reload` et `sudo systemctl enable orbita.service`. Le service utilise `/opt/orbita/current`, mis en place au premier déploiement.
3. Créer `/etc/orbita/orbita.env`, lisible uniquement par root, avec les deux mots de passe distincts, `ORBITA_DB=/var/lib/orbita/orbita.sqlite`, `ORBITA_HOST=127.0.0.1`, `ORBITA_PORT=3000` et `ORBITA_ORIGIN` correspondant exactement à l'URL HTTPS du proxy. Ne stockez pas ce fichier dans GitHub.
4. Autoriser le compte de déploiement à exécuter sans mot de passe **uniquement** `systemctl restart orbita.service` et `systemctl stop orbita.service` via sudo ; vérifiez les chemins absolus sur la VM. Restreindre sa clé SSH et son accès réseau.
5. Dans GitHub, définir les variables `VM_HOST`, `VM_USER` et `VM_PORT`, ainsi que les secrets `VM_SSH_PRIVATE_KEY` et `VM_KNOWN_HOSTS`. La clé d'hôte doit être vérifiée par un canal indépendant avant son ajout à `VM_KNOWN_HOSTS` ; le workflow refuse les hôtes non reconnus.

Le workflow transfère l'artefact, installe les dépendances de production, bascule le lien `current`, redémarre le service et vérifie son état et la page HTTP locale. En cas d'échec, il tente de rétablir le lien précédent. Il ne restaure **pas** la base : sauvegardez-la avant toute mise à jour et vérifiez la compatibilité des migrations avant un retour arrière. Une version dont le répertoire existe déjà n'est pas écrasée ; après un échec, examinez-la avant de la retirer manuellement. Aucun déploiement VM n'a lieu à chaque commit ni sans activation explicite.

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
