# API locale et protocole

Toutes les réponses d'erreur ont la forme `{"error":"..."}`. Identifiants : UUID ; dates : ISO 8601 UTC. Sauf connexion, les routes exigent le cookie de session ; les mutations exigent aussi l'en-tête `Origin` égal à `ORBITA_ORIGIN`. JSON uniquement pour les corps. Les rôles ne sont jamais fournis par le client après authentification.

| Méthode | Route | Rôle | Corps ou résultat |
|---|---|---|---|
| POST | `/api/login` | public | `{"role":"gm" ou "admin","password":"..."}` |
| POST | `/api/logout` | connecté | Révoque la session |
| GET | `/api/me` | connecté | Rôle courant |
| GET | `/api/configurations` | connecté | Configurations et postes |
| POST | `/api/admin/configurations` | admin | `{"name":"...","durationSeconds":3600,"allowTeamChanges":true,"stations":["Poste A"]}` |
| PUT | `/api/admin/configurations/:id` | admin | Même corps ; les sessions existantes restent inchangées |
| POST | `/api/admin/configurations/:id/archive` | admin | Archive sans effacer |
| GET | `/api/sessions` | connecté | Historique |
| POST | `/api/sessions` | connecté | `{"configurationId":"UUID"}` |
| GET | `/api/sessions/:id` | connecté | Session, classement, postes, derniers événements, scores |
| GET | `/api/sessions/:id/export` | connecté | Export JSON, tous les événements |
| POST | `/api/sessions/:id/transition` | connecté | `{"action":"start" ou "pause" ou "resume" ou "finish"}` |
| POST | `/api/sessions/:id/reset` | connecté | Clôture et crée une nouvelle session |
| POST | `/api/sessions/:id/teams` | connecté | `{"name":"...","color":"#RRGGBB"}` |
| PUT | `/api/teams/:id` | connecté | Même corps |
| POST | `/api/teams/:id/remove` | connecté | Retrait logique |
| POST | `/api/sessions/:id/scores` | connecté | `{"teamId":"UUID","delta":5,"reason":"..."}` |
| POST | `/api/scores/:id/compensate` | connecté | `{"reason":"..."}` ; une seule compensation par événement |
| POST | `/api/sessions/:id/events` | connecté | `{"type":"hint" ou "intervention","message":"..."}` |
| POST | `/api/stations/:id/simulate` | connecté | Message de poste versionné ci-dessous |
| GET | `/api/admin/health` | admin | Démarrage, base et 100 événements récents |

`GET /ws` est un WebSocket authentifié avec origine contrôlée. Le serveur envoie `{"type":"changed"}` après mutation ; le client recharge les données autorisées. Les messages entrants sont refusés. La fermeture de session révoque aussi les connexions WebSocket.

## Protocole des postes v1

Le simulateur transmet des objets validés strictement côté serveur :

```json
{"version":1,"type":"status","status":"ready","message":"Prêt"}
```

Les statuts acceptés sont `ready`, `busy`, `finished`, `error` et `offline`. `message` est facultatif et limité à 500 caractères. Un événement de jeu est `{"version":1,"type":"event","message":"..."}` ; il est refusé pour un poste explicitement hors ligne. Les champs supplémentaires, versions inconnues et messages mal formés sont rejetés.

`StationAdapter` dans `src/shared/protocol.ts` sépare réception et commande générique `{"version":1,"type":"ping"}`. Seul le simulateur interne existe aujourd'hui : ce type ne constitue pas un transport matériel opérationnel. L'identifiant de poste est celui de la session ; il est stable pendant celle-ci.
