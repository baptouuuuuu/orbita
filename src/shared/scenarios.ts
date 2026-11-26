export type ScenarioAction = {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  answer?: string;
};
export type ScenarioStage = { id: string; title: string; duration: string; briefing: string; actions: ScenarioAction[] };
export type ScenarioDefinition = { id: string; version: number; title: string; summary: string; stages: ScenarioStage[] };
export type ScenarioProgress = { completed: { actionId: string; at: string; actor: string }[]; attempts: Record<string, number> };
export class ScenarioActionError extends Error {}

// Definitions are copied into each session: edits to the catalog never alter an existing game.
export const scenarios: ScenarioDefinition[] = [{
  id: 'lunar-relay', version: 1, title: 'Lunar Relay — le dernier message',
  summary: 'Une équipe lunaire doit rétablir une liaison avec la Terre et déchiffrer sa réponse avant la fin de la mission.',
  stages: [
    { id: 'deploy', title: '1. Installer la base', duration: '5–8 min', briefing: 'La base est en veille. Répartissez les rôles : technicien, navigateur et opérateur radio. Sécurisez le matériel avant toute mise sous tension.', actions: [
      { id: 'inventory', title: 'Inventorier et installer', instruction: 'Repérez le pupitre, les panneaux, les câbles et les deux antennes. Le technicien explique à un autre joueur le trajet de l’énergie et celui du signal ; installez les éléments dans cet ordre.', hint: 'L’énergie alimente le pupitre ; le signal part de la base vers le relais, puis vers la Terre.' },
      { id: 'cabling', title: 'Relier les modules', instruction: 'Reliez les panneaux au régulateur, le régulateur au pupitre et le pupitre à l’antenne lunaire. Faites contrôler chaque liaison par un autre joueur avant de confirmer.', hint: 'Ne reliez pas directement les panneaux à l’antenne.' },
      { id: 'safety', title: 'Déverrouiller la mise sous tension', instruction: 'Sur la liste de contrôle, additionnez les fusibles nécessaires : régulateur 4 A, pupitre 3 A, antenne 2 A. Saisissez le total en ampères.', hint: 'Additionnez les trois valeurs.', answer: '9' },
    ] },
    { id: 'power', title: '2. Capturer l’énergie solaire', duration: '5–8 min', briefing: 'La réserve est trop faible. Un joueur lit les relevés, un autre règle les panneaux et un troisième vérifie les calculs.', actions: [
      { id: 'solar-angle', title: 'Trouver l’orientation', instruction: 'Les relevés donnent 20 unités à 20°, 35 à 40°, 50 à 60° et 42 à 80°. Réglez les panneaux sur l’angle qui produit le plus et saisissez cet angle en degrés.', hint: 'Cherchez la valeur de production maximale.', answer: '60' },
      { id: 'solar-balance', title: 'Équilibrer la production', instruction: 'Deux panneaux fournissent chacun 50 unités. Le pupitre consomme 30, le relais 25 et la radio 15. Calculez la réserve restante.', hint: 'Additionnez la production puis soustrayez les trois consommations.', answer: '30' },
      { id: 'power-check', title: 'Stabiliser le circuit', instruction: 'Maintenez les panneaux dans leur position, raccordez le régulateur et faites confirmer par deux joueurs que la réserve calculée est positive.', hint: 'Si la réserve est positive, la base peut démarrer.' },
    ] },
    { id: 'configure', title: '3. Configurer la base', duration: '5–7 min', briefing: 'La console demande une séquence de démarrage. Le navigateur lit la procédure tandis que le technicien effectue les opérations.', actions: [
      { id: 'boot-order', title: 'Ordonner le démarrage', instruction: 'Associez 1 au régulateur, 2 au pupitre, 3 à la radio. Démarrez d’abord le régulateur, puis le pupitre et enfin la radio. Saisissez la séquence de trois chiffres.', hint: 'Suivez l’ordre du trajet de l’énergie.', answer: '123' },
      { id: 'clock', title: 'Synchroniser les horloges', instruction: 'L’horloge de référence indique 14:25. La console avance de 7 minutes : quelle heure affiche-t-elle ? Saisissez HH:MM.', hint: 'Ajoutez 7 minutes à 14:25.', answer: '14:32' },
      { id: 'diagnostic', title: 'Contrôler la configuration', instruction: 'Un joueur annonce la réserve, un autre l’heure de la console. Vérifiez ensemble les réglages et confirmez le diagnostic.', hint: 'Réutilisez les deux résultats précédents.' },
    ] },
    { id: 'uplink', title: '4. Pointer vers le relais lunaire', duration: '6–9 min', briefing: 'Le relais orbite autour de la Lune. Le navigateur calcule le pointage ; deux joueurs manœuvrent et contrôlent l’antenne.', actions: [
      { id: 'lunar-azimuth', title: 'Calculer l’azimut', instruction: 'Le relais passe à 110° ; la monture est décalée de +15°. Ajoutez le décalage et saisissez l’azimut de commande en degrés.', hint: '110 + 15.', answer: '125' },
      { id: 'lunar-elevation', title: 'Calculer l’élévation', instruction: 'L’horizon masque les 10 premiers degrés. Le relais est à 42° au-dessus de l’horizon géométrique : quelle élévation reste visible ?', hint: 'Retirez les 10° masqués.', answer: '32' },
      { id: 'lunar-lock', title: 'Acquérir le signal', instruction: 'Réglez l’antenne sur les deux valeurs calculées. Un joueur guide sans toucher la monture, un autre la règle ; inversez les rôles pour contrôler le pointage.', hint: 'Les deux valeurs viennent des deux calculs précédents.' },
    ] },
    { id: 'downlink', title: '5. Piloter le satellite relais', duration: '6–9 min', briefing: 'La liaison locale est établie. Depuis la base, configurez l’antenne du satellite pour viser le réseau terrestre.', actions: [
      { id: 'earth-target', title: 'Choisir le satellite terrestre', instruction: 'Trois cibles sont visibles : A (signal 40, occupée), B (signal 70, libre), C (signal 85, occupée). Choisissez la cible libre et saisissez sa lettre.', hint: 'Une cible occupée ne peut pas recevoir le message.', answer: 'B' },
      { id: 'relay-turn', title: 'Calculer la rotation', instruction: 'L’antenne du relais est à 35°. La cible choisie est à 95°. Calculez la rotation positive nécessaire en degrés.', hint: 'Soustrayez la position actuelle de la cible.', answer: '60' },
      { id: 'relay-confirm', title: 'Verrouiller les deux liaisons', instruction: 'Pilotez la rotation calculée et faites vérifier à voix haute le trajet base → relais lunaire → satellite terrestre. Confirmez quand les deux liaisons sont prêtes.', hint: 'Vérifiez aussi que la cible terrestre est libre.' },
    ] },
    { id: 'transmit', title: '6. Chiffrer et transmettre', duration: '6–10 min', briefing: 'La Terre attend le code de l’échantillon. La radio n’accepte que des lettres : un joueur chiffre, un autre contrôle et transmet.', actions: [
      { id: 'channel', title: 'Régler le canal', instruction: 'Le canal est la somme des chiffres du numéro de mission 274. Saisissez le résultat.', hint: '2 + 7 + 4.', answer: '13' },
      { id: 'encrypt', title: 'Chiffrer le message', instruction: 'Le message est LUNE. Décalez chaque lettre de 3 rangs vers l’avant dans l’alphabet (X devient A). Saisissez les quatre lettres chiffrées.', hint: 'L devient O ; appliquez le même décalage aux autres lettres.', answer: 'OXQH' },
      { id: 'transmit-check', title: 'Émettre et vérifier', instruction: 'Annoncez le canal et le message chiffré à un autre joueur, qui les répète avant de confirmer l’émission.', hint: 'Utilisez les deux résultats précédents.' },
    ] },
    { id: 'response', title: '7. Déchiffrer la réponse terrestre', duration: '5–8 min', briefing: 'Une réponse arrive : ne considérez pas la mission terminée avant de la vérifier collectivement.', actions: [
      { id: 'decrypt', title: 'Décoder la réponse', instruction: 'La Terre répond VDOXW avec le même décalage de 3. Reculez chaque lettre de 3 rangs et saisissez le mot obtenu.', hint: 'V devient S ; reculez aussi les autres lettres.', answer: 'SALUT' },
      { id: 'checksum', title: 'Vérifier l’intégrité', instruction: 'La somme de contrôle vaut le nombre de lettres du mot déchiffré multiplié par 2. Saisissez cette somme.', hint: 'Le mot comporte cinq lettres.', answer: '10' },
      { id: 'final', title: 'Rapporter le résultat', instruction: 'Présentez à toute l’équipe le message, la réponse et la somme de contrôle. Confirmez ensemble que la Terre a répondu : les données permettront de préparer le sauvetage.', hint: 'Reprenez les résultats des étapes de transmission et de réception.' },
    ] },
  ],
}];

export function newProgress(): ScenarioProgress { return { completed: [], attempts: {} }; }

export function scenarioSummary(definition: ScenarioDefinition) {
  const { id, version, title, summary } = definition;
  return { id, version, title, summary, stages: definition.stages.map(stage => ({
    id: stage.id, title: stage.title, duration: stage.duration, actions: stage.actions.map(({ id, title }) => ({ id, title })),
  })) };
}
export type ScenarioSummary = ReturnType<typeof scenarioSummary>;

export function scenarioView(definition: ScenarioDefinition, progress: ScenarioProgress, sessionStatus: string) {
  const completed = new Map(progress.completed.map(entry => [entry.actionId, entry]));
  const total = definition.stages.reduce((count, stage) => count + stage.actions.length, 0);
  let nextFound = false;
  const stages = definition.stages.map(stage => {
    const actions = stage.actions.map(({ answer, ...action }) => {
      const completion = completed.get(action.id);
      const available = !completion && !nextFound;
      if (!completion) nextFound = true;
      return { ...action, requiresAnswer: answer !== undefined, status: completion ? 'completed' : available ? 'available' : 'locked', completedAt: completion?.at ?? null, actor: completion?.actor ?? null, attempts: progress.attempts[action.id] ?? 0 };
    });
    return { ...stage, actions };
  });
  return { id: definition.id, version: definition.version, title: definition.title, summary: definition.summary, stages, completed: progress.completed.length, total, result: progress.completed.length === total ? 'completed' : sessionStatus === 'finished' ? 'incomplete' : 'in_progress' };
}
export type ScenarioView = ReturnType<typeof scenarioView>;

export function performScenarioAction(definition: ScenarioDefinition, progress: ScenarioProgress, actionId: string, answer: string | undefined, actor: string, at: string) {
  const actions = definition.stages.flatMap(stage => stage.actions);
  const action = actions.find(item => item.id === actionId);
  if (!action) throw new ScenarioActionError('Action introuvable');
  if (actions.find(item => !progress.completed.some(entry => entry.actionId === item.id))?.id !== actionId) throw new ScenarioActionError('Action non disponible');
  if (action.answer !== undefined && !answer?.trim()) throw new ScenarioActionError('Réponse requise');
  if (action.answer === undefined && answer !== undefined) throw new ScenarioActionError('Cette action ne demande pas de réponse');
  const correct = action.answer === undefined || answer!.trim().toLocaleUpperCase('fr-FR') === action.answer.toLocaleUpperCase('fr-FR');
  if (correct) progress.completed.push({ actionId, at, actor });
  else progress.attempts[actionId] = (progress.attempts[actionId] ?? 0) + 1;
  return { correct, title: action.title };
}
