import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import type { WebSocket } from 'ws';
import { openDatabase, transaction } from './db.js';
import { stationMessage, type StationAdapter, type StationMessage } from '../shared/protocol.js';
import { scenarios, newProgress, performScenarioAction, scenarioSummary, scenarioView, ScenarioActionError, type ScenarioDefinition, type ScenarioProgress } from '../shared/scenarios.js';

type Role = 'admin' | 'gm';
type SessionRow = { id: string; status: 'ready' | 'running' | 'paused' | 'finished'; elapsed_ms: number; started_at: string | null; configuration_snapshot: string; configuration_id: string };
type Config = { id: string; name: string; duration_seconds: number; allow_team_changes: number; archived: number };
type Team = { id: string; session_id: string; active: number };
type Score = { id: string; session_id: string; team_id: string; delta: number };
type Station = { id: string; session_id: string; status: string };

const name = z.string().trim().min(1).max(100);
const uuid = z.uuid();
const configInput = z.object({
  name, durationSeconds: z.number().int().min(1).max(86400),
  allowTeamChanges: z.boolean(), stations: z.array(name).max(100).refine(a => new Set(a).size === a.length),
}).strict();
const teamInput = z.object({ name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
const scoreInput = z.object({ teamId: uuid, delta: z.number().int().min(-100000).max(100000).refine(n => n !== 0), reason: name }).strict();
const eventInput = z.object({ type: z.enum(['hint', 'intervention']), message: z.string().trim().min(1).max(500) }).strict();
const idParams = z.object({ id: uuid }).strict();

class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export type AppOptions = {
  dbPath: string; origin: string; adminPassword: string; gmPassword: string;
  silentSeconds: number; serveStatic?: boolean;
};

export async function buildApp(options: AppOptions) {
  if (options.adminPassword.length < 12 || options.gmPassword.length < 12 || options.adminPassword === options.gmPassword) {
    throw new Error('Deux mots de passe distincts de 12 caractères minimum sont requis.');
  }
  const app = Fastify({ logger: { level: 'error' }, bodyLimit: 65536 });
  const db = openDatabase(options.dbPath);
  const startedAt = new Date().toISOString();
  const salt = randomBytes(32);
  const passwords = {
    admin: scryptSync(options.adminPassword, salt, 32),
    gm: scryptSync(options.gmPassword, salt, 32),
  };
  const logins = new Map<string, { role: Role; expires: number }>();
  const failures = new Map<string, { count: number; until: number }>();
  const sockets = new Map<WebSocket, string>();
  const now = () => new Date().toISOString();
  const actor = (request: { cookies: Record<string, string | undefined> }): Role | undefined => {
    const token = request.cookies.orbita;
    const login = token && logins.get(token);
    if (!login) return undefined;
    if (login.expires <= Date.now()) { logins.delete(token!); return undefined; }
    return login.role;
  };
  const notify = () => {
    for (const [ws, token] of sockets) {
      const login = logins.get(token);
      if (!login || login.expires <= Date.now()) ws.close(1008);
      else if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'changed' }));
    }
  };
  const addEvent = (sessionId: string | null, type: string, who: string, message: string) =>
    db.prepare('INSERT INTO session_events VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), sessionId, type, who, message, now());
  const getSession = (id: string) => {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!row) throw new HttpError(404, 'Session introuvable');
    return row;
  };
  const mutable = (id: string) => {
    const session = getSession(id);
    if (session.status === 'finished') throw new HttpError(409, 'Session terminée');
    return session;
  };
  const getConfig = (id: string) => {
    const config = db.prepare('SELECT * FROM configurations WHERE id = ?').get(id) as Config | undefined;
    if (!config) throw new HttpError(404, 'Configuration introuvable');
    return config;
  };
  const getTeam = (id: string) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!team) throw new HttpError(404, 'Équipe introuvable');
    return team;
  };
  const teamChangeAllowed = (session: SessionRow) => {
    const snapshot = JSON.parse(session.configuration_snapshot) as { allow_team_changes: number };
    if (session.status !== 'ready' && !snapshot.allow_team_changes) throw new HttpError(409, 'Modification des équipes interdite pendant la partie');
  };
  const getStation = (id: string) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(id) as Station | undefined;
    if (!station) throw new HttpError(404, 'Poste introuvable');
    return station;
  };
  const sessionDetail = (id: string) => {
    const session = getSession(id);
    const snapshot = JSON.parse(session.configuration_snapshot) as { duration_seconds: number };
    const elapsed = session.elapsed_ms + (session.status === 'running' && session.started_at ? Math.max(0, Date.now() - Date.parse(session.started_at)) : 0);
    const teams = db.prepare(`SELECT t.*, COALESCE(SUM(s.delta), 0) AS score FROM teams t
      LEFT JOIN score_events s ON s.team_id = t.id WHERE t.session_id = ? GROUP BY t.id ORDER BY score DESC, t.name ASC`).all(id);
    const stations = db.prepare('SELECT * FROM stations WHERE session_id = ? ORDER BY name').all(id).map(row => ({
      ...row,
      effective_status: row.status !== 'offline' && (!row.last_seen || Date.now() - Date.parse(String(row.last_seen)) > options.silentSeconds * 1000) ? 'offline' : row.status,
    }));
    const scenario = db.prepare('SELECT definition, progress FROM session_scenarios WHERE session_id = ?').get(id);
    return {
      ...session, configuration: snapshot, elapsed_ms: elapsed,
      remaining_ms: Math.max(0, snapshot.duration_seconds * 1000 - elapsed),
      scenario: scenario ? scenarioView(JSON.parse(String(scenario.definition)) as ScenarioDefinition, JSON.parse(String(scenario.progress)) as ScenarioProgress, session.status) : null,
      teams, stations,
      events: db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 200').all(id),
      scores: db.prepare(`SELECT s.*, t.name AS team_name, EXISTS(SELECT 1 FROM score_events c WHERE c.compensates = s.id) AS compensated
        FROM score_events s JOIN teams t ON t.id = s.team_id WHERE s.session_id = ? ORDER BY s.rowid DESC`).all(id),
    };
  };
  const receiveStation = (stationId: string, message: StationMessage, source: string) => {
      const station = getStation(stationId);
      mutable(station.session_id);
      const parsed = stationMessage.parse(message);
      if (parsed.type === 'event' && station.status === 'offline') throw new HttpError(409, 'Poste hors ligne');
      transaction(db, () => {
        db.prepare('UPDATE stations SET status = ?, last_seen = ?, last_message = ? WHERE id = ?')
          .run(parsed.type === 'status' ? parsed.status : station.status, now(), parsed.message ?? null, stationId);
        addEvent(station.session_id, parsed.type === 'status' ? `station_${parsed.status}` : 'station_event', source, `${stationId} : ${parsed.message ?? (parsed.type === 'status' ? parsed.status : '')}`);
      });
      notify();
  };
  const simulator: StationAdapter = {
    receive(stationId: string, message: StationMessage) { receiveStation(stationId, message, 'simulateur'); },
    command(stationId, command) {
      getStation(stationId);
      if (command.version !== 1 || command.type !== 'ping') throw new HttpError(400, 'Commande invalide');
    },
  };

  await app.register(cookie);
  await app.register(websocket);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws')) return;
    if ((request.method !== 'GET' || request.url.startsWith('/ws')) && request.headers.origin !== options.origin) {
      return reply.code(403).send({ error: 'Origine interdite' });
    }
    if (request.url === '/api/login') return;
    const role = actor(request);
    if (!role) return reply.code(401).send({ error: 'Authentification requise' });
    if (request.url.startsWith('/api/admin/') && role !== 'admin') return reply.code(403).send({ error: 'Accès administrateur requis' });
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Entrée invalide' });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    if (typeof error === 'object' && error && (('code' in error && String(error.code).startsWith('SQLITE_CONSTRAINT')) || ('errcode' in error && typeof error.errcode === 'number' && (error.errcode & 255) === 19))) {
      return reply.code(409).send({ error: 'Conflit de données' });
    }
    if (typeof error === 'object' && error && 'statusCode' in error && error.statusCode === 400) return reply.code(400).send({ error: 'Requête invalide' });
    app.log.error(error);
    return reply.code(500).send({ error: 'Erreur interne' });
  });
  app.addHook('onClose', async () => { for (const ws of sockets.keys()) ws.close(); db.close(); });

  app.post('/api/login', async (request, reply) => {
    const { role, password } = z.object({ role: z.enum(['admin', 'gm']), password: z.string().max(512) }).strict().parse(request.body);
    const attempt = failures.get(request.ip);
    if (attempt && attempt.until > Date.now() && attempt.count >= 5) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard');
    const hash = scryptSync(password, salt, 32);
    if (!timingSafeEqual(hash, passwords[role])) {
      const count = attempt && attempt.until > Date.now() ? attempt.count + 1 : 1;
      failures.set(request.ip, { count, until: Date.now() + 60000 });
      throw new HttpError(401, 'Identifiants invalides');
    }
    failures.delete(request.ip);
    const token = randomBytes(32).toString('hex');
    logins.set(token, { role, expires: Date.now() + 8 * 60 * 60 * 1000 });
    reply.setCookie('orbita', token, { httpOnly: true, sameSite: 'strict', secure: options.origin.startsWith('https:'), path: '/', maxAge: 8 * 60 * 60 });
    return { role };
  });
  app.post('/api/logout', async (request, reply) => {
    if (request.cookies.orbita) {
      logins.delete(request.cookies.orbita);
      for (const [socket, token] of sockets) if (token === request.cookies.orbita) socket.close(1008);
    }
    reply.clearCookie('orbita', { path: '/' });
    return { ok: true };
  });
  app.get('/api/me', async request => ({ role: actor(request) }));
  app.get('/ws', { websocket: true }, (socket, request) => {
    const token = request.cookies.orbita!;
    sockets.set(socket, token);
    const interval = setInterval(() => { if (!token || !logins.get(token) || logins.get(token)!.expires <= Date.now()) socket.close(1008); }, 10000);
    socket.on('close', () => { clearInterval(interval); sockets.delete(socket); });
    socket.on('message', () => socket.close(1008));
  });
  app.get('/api/configurations', async () => db.prepare('SELECT * FROM configurations ORDER BY created_at DESC').all().map(row => ({
    ...row, stations: db.prepare('SELECT * FROM configuration_stations WHERE configuration_id = ? ORDER BY name').all(String(row.id)),
  })));
  app.get('/api/scenarios', async () => scenarios.map(scenarioSummary));
  app.post('/api/admin/configurations', async request => {
    const input = configInput.parse(request.body);
    const id = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO configurations VALUES (?, ?, ?, ?, 0, ?)').run(id, input.name, input.durationSeconds, Number(input.allowTeamChanges), now());
      for (const station of input.stations) db.prepare('INSERT INTO configuration_stations VALUES (?, ?, ?)').run(randomUUID(), id, station);
      addEvent(null, 'configuration_created', actor(request)!, input.name);
    });
    notify(); return { id };
  });
  app.put('/api/admin/configurations/:id', async request => {
    const { id } = idParams.parse(request.params); const input = configInput.parse(request.body); getConfig(id);
    transaction(db, () => {
      db.prepare('UPDATE configurations SET name = ?, duration_seconds = ?, allow_team_changes = ? WHERE id = ?').run(input.name, input.durationSeconds, Number(input.allowTeamChanges), id);
      const current = db.prepare('SELECT * FROM configuration_stations WHERE configuration_id = ?').all(id);
      for (const station of current) if (!input.stations.includes(String(station.name))) db.prepare('DELETE FROM configuration_stations WHERE id = ?').run(String(station.id));
      for (const station of input.stations) if (!current.some(row => row.name === station)) db.prepare('INSERT INTO configuration_stations VALUES (?, ?, ?)').run(randomUUID(), id, station);
      addEvent(null, 'configuration_updated', actor(request)!, input.name);
    });
    notify(); return { ok: true };
  });
  app.post('/api/admin/configurations/:id/archive', async request => {
    const { id } = idParams.parse(request.params); const config = getConfig(id);
    transaction(db, () => { db.prepare('UPDATE configurations SET archived = 1 WHERE id = ?').run(id); addEvent(null, 'configuration_archived', actor(request)!, config.name); });
    notify(); return { ok: true };
  });
  app.get('/api/sessions', async () => db.prepare('SELECT id, status, created_at, finished_at, configuration_snapshot FROM sessions ORDER BY created_at DESC').all());
  app.post('/api/sessions', async request => {
    const { configurationId, scenarioId } = z.object({ configurationId: uuid, scenarioId: z.string().min(1).max(100).optional() }).strict().parse(request.body);
    const config = getConfig(configurationId);
    if (config.archived) throw new HttpError(409, 'Configuration archivée');
    const scenario = scenarioId ? scenarios.find(item => item.id === scenarioId) : undefined;
    if (scenarioId && !scenario) throw new HttpError(404, 'Scénario introuvable');
    const stations = db.prepare('SELECT * FROM configuration_stations WHERE configuration_id = ?').all(configurationId);
    const id = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO sessions (id, configuration_id, configuration_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?)').run(id, configurationId, JSON.stringify({ ...config, stations }), 'ready', now());
      if (scenario) db.prepare('INSERT INTO session_scenarios VALUES (?, ?, ?)').run(id, JSON.stringify(scenario), JSON.stringify(newProgress()));
      for (const station of stations) db.prepare('INSERT INTO stations (id, session_id, name, status) VALUES (?, ?, ?, ?)').run(randomUUID(), id, String(station.name), 'offline');
      addEvent(id, 'session_created', actor(request)!, 'Session créée');
    });
    notify(); return { id };
  });
  app.get('/api/sessions/:id', async request => sessionDetail(idParams.parse(request.params).id));
  app.get('/api/sessions/:id/export', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const detail = sessionDetail(id);
    const events = db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY rowid').all(id);
    return reply.header('Content-Disposition', `attachment; filename="orbita-${id}.json"`).send({ ...detail, events });
  });
  app.post('/api/sessions/:id/scenario/actions/:actionId', async request => {
    const { id, actionId } = z.object({ id: uuid, actionId: z.string().min(1).max(100) }).strict().parse(request.params);
    const { answer } = z.object({ answer: z.string().max(100).optional() }).strict().parse(request.body);
    if (mutable(id).status !== 'running') throw new HttpError(409, 'La session doit être en cours');
    const row = db.prepare('SELECT definition, progress FROM session_scenarios WHERE session_id = ?').get(id);
    if (!row) throw new HttpError(404, 'Aucun scénario pour cette session');
    const definition = JSON.parse(String(row.definition)) as ScenarioDefinition;
    const progress = JSON.parse(String(row.progress)) as ScenarioProgress;
    let result: ReturnType<typeof performScenarioAction>;
    try { result = performScenarioAction(definition, progress, actionId, answer, actor(request)!, now()); }
    catch (error) { if (error instanceof ScenarioActionError) throw new HttpError(409, error.message); throw error; }
    transaction(db, () => {
      db.prepare('UPDATE session_scenarios SET progress = ? WHERE session_id = ?').run(JSON.stringify(progress), id);
      addEvent(id, result.correct ? 'scenario_action_completed' : 'scenario_answer_incorrect', actor(request)!, result.title);
    });
    notify(); return { correct: result.correct };
  });
  app.post('/api/sessions/:id/transition', async request => {
    const { id } = idParams.parse(request.params);
    const { action } = z.object({ action: z.enum(['start', 'pause', 'resume', 'finish']) }).strict().parse(request.body);
    const session = mutable(id);
    const expected = { start: 'ready', pause: 'running', resume: 'paused', finish: session.status } as const;
    if (session.status !== expected[action]) throw new HttpError(409, 'Transition impossible');
    const status = { start: 'running', pause: 'paused', resume: 'running', finish: 'finished' }[action];
    const elapsed = session.elapsed_ms + (session.status === 'running' && session.started_at ? Math.max(0, Date.now() - Date.parse(session.started_at)) : 0);
    transaction(db, () => {
      db.prepare('UPDATE sessions SET status = ?, elapsed_ms = ?, started_at = ?, finished_at = ? WHERE id = ?').run(status, elapsed, status === 'running' ? now() : null, status === 'finished' ? now() : null, id);
      addEvent(id, `session_${action}`, actor(request)!, action);
    });
    notify(); return sessionDetail(id);
  });
  app.post('/api/sessions/:id/reset', async request => {
    const { id } = idParams.parse(request.params); const session = mutable(id); const newId = randomUUID();
    transaction(db, () => {
      const elapsed = session.elapsed_ms + (session.status === 'running' && session.started_at ? Math.max(0, Date.now() - Date.parse(session.started_at)) : 0);
      db.prepare("UPDATE sessions SET status = 'finished', elapsed_ms = ?, started_at = NULL, finished_at = ? WHERE id = ?").run(elapsed, now(), id);
      addEvent(id, 'session_reset', actor(request)!, 'Session clôturée par réinitialisation');
      db.prepare('INSERT INTO sessions (id, configuration_id, configuration_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?)').run(newId, session.configuration_id, session.configuration_snapshot, 'ready', now());
      db.prepare('INSERT INTO session_scenarios SELECT ?, definition, ? FROM session_scenarios WHERE session_id = ?').run(newId, JSON.stringify(newProgress()), id);
      for (const t of db.prepare('SELECT * FROM teams WHERE session_id = ? AND active = 1').all(id)) db.prepare('INSERT INTO teams (id, session_id, name, color) VALUES (?, ?, ?, ?)').run(randomUUID(), newId, String(t.name), String(t.color));
      for (const s of db.prepare('SELECT * FROM stations WHERE session_id = ?').all(id)) db.prepare("INSERT INTO stations (id, session_id, name, status) VALUES (?, ?, ?, 'offline')").run(randomUUID(), newId, String(s.name));
      addEvent(newId, 'session_created', actor(request)!, 'Session créée par réinitialisation');
    });
    notify(); return { id: newId };
  });
  app.post('/api/sessions/:id/teams', async request => {
    const { id } = idParams.parse(request.params); const input = teamInput.parse(request.body); const session = mutable(id); teamChangeAllowed(session);
    const teamId = randomUUID();
    transaction(db, () => { db.prepare('INSERT INTO teams (id, session_id, name, color) VALUES (?, ?, ?, ?)').run(teamId, id, input.name, input.color); addEvent(id, 'team_created', actor(request)!, input.name); });
    notify(); return { id: teamId };
  });
  app.put('/api/teams/:id', async request => {
    const { id } = idParams.parse(request.params); const input = teamInput.parse(request.body); const team = getTeam(id); teamChangeAllowed(mutable(team.session_id));
    if (!team.active) throw new HttpError(409, 'Équipe retirée');
    transaction(db, () => { db.prepare('UPDATE teams SET name = ?, color = ? WHERE id = ?').run(input.name, input.color, id); addEvent(team.session_id, 'team_updated', actor(request)!, input.name); });
    notify(); return { ok: true };
  });
  app.post('/api/teams/:id/remove', async request => {
    const { id } = idParams.parse(request.params); const team = getTeam(id); teamChangeAllowed(mutable(team.session_id));
    if (!team.active) throw new HttpError(409, 'Équipe déjà retirée');
    transaction(db, () => { db.prepare('UPDATE teams SET active = 0 WHERE id = ?').run(id); addEvent(team.session_id, 'team_removed', actor(request)!, id); });
    notify(); return { ok: true };
  });
  app.post('/api/sessions/:id/scores', async request => {
    const { id } = idParams.parse(request.params); const input = scoreInput.parse(request.body); mutable(id); const team = getTeam(input.teamId);
    if (team.session_id !== id || !team.active) throw new HttpError(409, 'Équipe indisponible');
    const scoreId = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO score_events VALUES (?, ?, ?, ?, ?, ?, ?, NULL)').run(scoreId, id, input.teamId, input.delta, input.reason, actor(request)!, now());
      addEvent(id, 'score_changed', actor(request)!, `${input.teamId} : ${input.delta} — ${input.reason}`);
    });
    notify(); return { id: scoreId };
  });
  app.post('/api/scores/:id/compensate', async request => {
    const { id } = idParams.parse(request.params);
    const { reason } = z.object({ reason: name }).strict().parse(request.body);
    const score = db.prepare('SELECT * FROM score_events WHERE id = ?').get(id) as Score | undefined;
    if (!score) throw new HttpError(404, 'Score introuvable');
    mutable(score.session_id);
    if (db.prepare('SELECT id FROM score_events WHERE compensates = ?').get(id)) throw new HttpError(409, 'Score déjà compensé');
    transaction(db, () => {
      db.prepare('INSERT INTO score_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), score.session_id, score.team_id, -score.delta, reason, actor(request)!, now(), id);
      addEvent(score.session_id, 'score_compensated', actor(request)!, `${id} : ${reason}`);
    });
    notify(); return { ok: true };
  });
  app.post('/api/sessions/:id/events', async request => {
    const { id } = idParams.parse(request.params); const input = eventInput.parse(request.body); mutable(id);
    addEvent(id, input.type, actor(request)!, input.message); notify(); return { ok: true };
  });
  app.post('/api/stations/:id/simulate', async request => {
    const { id } = idParams.parse(request.params); const message = stationMessage.parse(request.body);
    simulator.receive(id, message); return { ok: true };
  });
  app.post('/api/stations/:id/messages', async request => {
    const { id } = idParams.parse(request.params);
    receiveStation(id, stationMessage.parse(request.body), actor(request)!);
    return { ok: true };
  });
  app.get('/api/admin/health', async () => ({
    backend: 'ok', startedAt, database: db.prepare('SELECT 1 AS ok').get() ? 'ok' : 'error', silentSeconds: options.silentSeconds,
    events: db.prepare('SELECT * FROM session_events ORDER BY rowid DESC LIMIT 100').all(),
  }));
  if (options.serveStatic && existsSync(resolve('dist'))) {
    await app.register(fastifyStatic, { root: resolve('dist'), prefix: '/' });
  }
  return app;
}
