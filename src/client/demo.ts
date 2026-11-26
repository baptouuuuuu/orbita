import { z, ZodError } from 'zod';
import { stationMessage } from '../shared/protocol.js';

type Role = 'gm' | 'admin';
type Event = { id: string; type: string; actor: string; message: string; created_at: string };
type Config = { id: string; name: string; duration_seconds: number; allow_team_changes: number; archived: number; created_at: string; stations: { id: string; name: string }[] };
type Team = { id: string; name: string; color: string; active: number };
type Score = { id: string; team_id: string; delta: number; reason: string; actor: string; created_at: string; compensates: string | null };
type Station = { id: string; name: string; status: string; last_seen: string | null; last_message: string | null };
type Session = { id: string; status: 'ready' | 'running' | 'paused' | 'finished'; configuration: Config; created_at: string; finished_at: string | null; elapsed_ms: number; started_at: string | null; teams: Team[]; stations: Station[]; scores: Score[]; events: Event[] };
type State = { configs: Config[]; sessions: Session[]; events: Event[]; startedAt: string };

const key = 'orbita-demo-v1';
const roleKey = 'orbita-demo-role-v1';
const name = z.string().trim().min(1).max(100);
const configInput = z.object({ name, durationSeconds: z.number().int().min(1).max(86400), allowTeamChanges: z.boolean(), stations: z.array(name).max(100).refine(a => new Set(a).size === a.length) }).strict();
const teamInput = z.object({ name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function initialState(): State {
  const created_at = now();
  return {
    startedAt: created_at, sessions: [], events: [],
    configs: [{ id: id(), name: 'Configuration de démonstration', duration_seconds: 3600, allow_team_changes: 1, archived: 0, created_at, stations: [{ id: id(), name: 'Poste A' }, { id: id(), name: 'Poste B' }] }],
  };
}
function read(): State {
  const value = localStorage.getItem(key);
  if (value) return JSON.parse(value) as State;
  const state = initialState();
  localStorage.setItem(key, JSON.stringify(state));
  return state;
}
function write(state: State) {
  localStorage.setItem(key, JSON.stringify(state));
  window.dispatchEvent(new Event('orbita-demo-changed'));
}
function role(): Role | null {
  const value = sessionStorage.getItem(roleKey);
  return value === 'admin' || value === 'gm' ? value : null;
}
function event(state: State, session: Session | null, type: string, message: string, actor = role() ?? 'simulateur') {
  const entry = { id: id(), type, actor, message, created_at: now() };
  state.events.unshift(entry);
  session?.events.unshift(entry);
}
function findSession(state: State, sessionId: string): Session {
  const result = state.sessions.find(s => s.id === sessionId);
  if (!result) throw new Error('Session introuvable');
  return result;
}
function mutable(session: Session) {
  if (session.status === 'finished') throw new Error('Session terminée');
}
function elapsed(session: Session) {
  return session.elapsed_ms + (session.status === 'running' && session.started_at ? Math.max(0, Date.now() - Date.parse(session.started_at)) : 0);
}
function detail(session: Session) {
  const elapsed_ms = elapsed(session);
  return {
    ...session, configuration_snapshot: JSON.stringify(session.configuration), elapsed_ms,
    remaining_ms: Math.max(0, session.configuration.duration_seconds * 1000 - elapsed_ms),
    teams: session.teams.map(t => ({ ...t, score: session.scores.filter(s => s.team_id === t.id).reduce((sum, s) => sum + s.delta, 0) })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    stations: session.stations.map(s => ({ ...s, effective_status: s.status !== 'offline' && (!s.last_seen || Date.now() - Date.parse(s.last_seen) > 60000) ? 'offline' : s.status })),
    scores: session.scores.map(s => ({ ...s, team_name: session.teams.find(t => t.id === s.team_id)?.name ?? '', compensated: Number(session.scores.some(c => c.compensates === s.id)) })),
    events: session.events.slice(0, 200),
  };
}
function newSession(config: Config): Session {
  return { id: id(), status: 'ready', configuration: structuredClone(config), created_at: now(), finished_at: null, elapsed_ms: 0, started_at: null, teams: [], scores: [], events: [], stations: config.stations.map(s => ({ id: id(), name: s.name, status: 'offline', last_seen: null, last_message: null })) };
}
function teamChange(session: Session) {
  mutable(session);
  if (session.status !== 'ready' && !session.configuration.allow_team_changes) throw new Error('Modification des équipes interdite pendant la partie');
}
function sessionWithTeam(state: State, teamId: string) {
  const session = state.sessions.find(s => s.teams.some(t => t.id === teamId));
  if (!session) throw new Error('Équipe introuvable');
  return { session, team: session.teams.find(t => t.id === teamId)! };
}
function sessionWithStation(state: State, stationId: string) {
  const session = state.sessions.find(s => s.stations.some(t => t.id === stationId));
  if (!session) throw new Error('Poste introuvable');
  return { session, station: session.stations.find(t => t.id === stationId)! };
}

export function subscribeDemo(listener: () => void) {
  const storage = (e: StorageEvent) => { if (e.key === key) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener('orbita-demo-changed', listener);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener('orbita-demo-changed', listener); };
}
export function resetDemo() {
  localStorage.removeItem(key);
  sessionStorage.removeItem(roleKey);
}
export function demoApi(url: string, method = 'GET', body?: object): unknown {
  try { return handle(url, method, body); }
  catch (error) { if (error instanceof ZodError) throw new Error('Entrée invalide'); throw error; }
}
function handle(url: string, method: string, body?: object): unknown {
  const state = read();
  if (url === '/api/login' && method === 'POST') {
    const input = z.object({ role: z.enum(['gm', 'admin']), password: z.string() }).strict().parse(body);
    sessionStorage.setItem(roleKey, input.role);
    return { role: input.role };
  }
  if (!role()) throw new Error('Authentification requise');
  if (url === '/api/me') return { role: role() };
  if (url === '/api/logout' && method === 'POST') { sessionStorage.removeItem(roleKey); return { ok: true }; }
  if (url.startsWith('/api/admin/') && role() !== 'admin') throw new Error('Accès administrateur requis');
  if (url === '/api/configurations' && method === 'GET') return state.configs;
  if (url === '/api/admin/health' && method === 'GET') return { backend: 'simulé', database: 'stockage du navigateur', startedAt: state.startedAt, silentSeconds: 60, events: state.events.slice(0, 100) };
  if (url === '/api/sessions' && method === 'GET') return state.sessions.map(s => ({ id: s.id, status: s.status, created_at: s.created_at, finished_at: s.finished_at, configuration_snapshot: JSON.stringify(s.configuration) }));
  if (url === '/api/admin/configurations' && method === 'POST') {
    const input = configInput.parse(body);
    const config: Config = { id: id(), name: input.name, duration_seconds: input.durationSeconds, allow_team_changes: Number(input.allowTeamChanges), archived: 0, created_at: now(), stations: input.stations.map(name => ({ id: id(), name })) };
    state.configs.unshift(config); event(state, null, 'configuration_created', config.name); write(state); return { id: config.id };
  }
  const configMatch = url.match(/^\/api\/admin\/configurations\/([^/]+)(\/archive)?$/);
  if (configMatch) {
    const config = state.configs.find(c => c.id === configMatch[1]);
    if (!config) throw new Error('Configuration introuvable');
    if (method === 'POST' && configMatch[2]) { config.archived = 1; event(state, null, 'configuration_archived', config.name); write(state); return { ok: true }; }
    if (method === 'PUT' && !configMatch[2]) {
      const input = configInput.parse(body);
      config.name = input.name; config.duration_seconds = input.durationSeconds; config.allow_team_changes = Number(input.allowTeamChanges);
      config.stations = input.stations.map(name => config.stations.find(s => s.name === name) ?? { id: id(), name });
      event(state, null, 'configuration_updated', config.name); write(state); return { ok: true };
    }
  }
  if (url === '/api/sessions' && method === 'POST') {
    const { configurationId } = z.object({ configurationId: z.uuid() }).strict().parse(body);
    const config = state.configs.find(c => c.id === configurationId && !c.archived);
    if (!config) throw new Error('Configuration indisponible');
    if (state.sessions.some(s => s.status !== 'finished')) throw new Error('Une session est déjà active');
    const session = newSession(config); state.sessions.unshift(session); event(state, session, 'session_created', 'Session créée'); write(state); return { id: session.id };
  }
  const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)(?:\/(transition|reset|teams|scores|events|export))?$/);
  if (sessionMatch) {
    const session = findSession(state, sessionMatch[1]);
    const action = sessionMatch[2];
    if (method === 'GET' && !action) return detail(session);
    if (method === 'GET' && action === 'export') return { ...detail(session), events: session.events.slice().reverse() };
    if (method !== 'POST') throw new Error('Requête inconnue');
    mutable(session);
    if (action === 'transition') {
      const { action: transition } = z.object({ action: z.enum(['start', 'pause', 'resume', 'finish']) }).strict().parse(body);
      const expected = { start: 'ready', pause: 'running', resume: 'paused', finish: session.status };
      if (session.status !== expected[transition]) throw new Error('Transition impossible');
      session.elapsed_ms = elapsed(session);
      session.status = { start: 'running', pause: 'paused', resume: 'running', finish: 'finished' }[transition] as Session['status'];
      session.started_at = session.status === 'running' ? now() : null;
      session.finished_at = session.status === 'finished' ? now() : null;
      event(state, session, `session_${transition}`, transition); write(state); return detail(session);
    }
    if (action === 'reset') {
      session.elapsed_ms = elapsed(session); session.started_at = null; session.status = 'finished'; session.finished_at = now();
      event(state, session, 'session_reset', 'Session clôturée par réinitialisation');
      const next = newSession(session.configuration); next.teams = session.teams.filter(t => t.active).map(t => ({ ...t, id: id() }));
      state.sessions.unshift(next); event(state, next, 'session_created', 'Session créée par réinitialisation'); write(state); return { id: next.id };
    }
    if (action === 'teams') {
      teamChange(session); const input = teamInput.parse(body);
      if (session.teams.some(t => t.name === input.name)) throw new Error('Conflit de données');
      const team = { ...input, id: id(), active: 1 }; session.teams.push(team); event(state, session, 'team_created', team.name); write(state); return { id: team.id };
    }
    if (action === 'scores') {
      const input = z.object({ teamId: z.uuid(), delta: z.number().int().min(-100000).max(100000).refine(n => n !== 0), reason: name }).strict().parse(body);
      if (!session.teams.some(t => t.id === input.teamId && t.active)) throw new Error('Équipe indisponible');
      const score: Score = { id: id(), team_id: input.teamId, delta: input.delta, reason: input.reason, actor: role()!, created_at: now(), compensates: null };
      session.scores.unshift(score); event(state, session, 'score_changed', `${input.teamId} : ${input.delta} — ${input.reason}`); write(state); return { id: score.id };
    }
    if (action === 'events') {
      const input = z.object({ type: z.enum(['hint', 'intervention']), message: z.string().trim().min(1).max(500) }).strict().parse(body);
      event(state, session, input.type, input.message); write(state); return { ok: true };
    }
  }
  const teamMatch = url.match(/^\/api\/teams\/([^/]+)(\/remove)?$/);
  if (teamMatch) {
    const { session, team } = sessionWithTeam(state, teamMatch[1]); teamChange(session);
    if (!team.active) throw new Error('Équipe retirée');
    if (method === 'POST' && teamMatch[2]) { team.active = 0; event(state, session, 'team_removed', team.id); write(state); return { ok: true }; }
    if (method === 'PUT' && !teamMatch[2]) {
      const input = teamInput.parse(body);
      if (session.teams.some(t => t.id !== team.id && t.name === input.name)) throw new Error('Conflit de données');
      Object.assign(team, input); event(state, session, 'team_updated', team.name); write(state); return { ok: true };
    }
  }
  const scoreMatch = url.match(/^\/api\/scores\/([^/]+)\/compensate$/);
  if (scoreMatch && method === 'POST') {
    const session = state.sessions.find(s => s.scores.some(score => score.id === scoreMatch[1]));
    if (!session) throw new Error('Score introuvable'); mutable(session);
    const original = session.scores.find(s => s.id === scoreMatch[1])!;
    if (session.scores.some(s => s.compensates === original.id)) throw new Error('Score déjà compensé');
    const { reason } = z.object({ reason: name }).strict().parse(body);
    session.scores.unshift({ id: id(), team_id: original.team_id, delta: -original.delta, reason, actor: role()!, created_at: now(), compensates: original.id });
    event(state, session, 'score_compensated', `${original.id} : ${reason}`); write(state); return { ok: true };
  }
  const stationMatch = url.match(/^\/api\/stations\/([^/]+)\/simulate$/);
  if (stationMatch && method === 'POST') {
    const { session, station } = sessionWithStation(state, stationMatch[1]); mutable(session);
    const input = stationMessage.parse(body);
    if (input.type === 'event' && station.status === 'offline') throw new Error('Poste hors ligne');
    if (input.type === 'status') station.status = input.status;
    station.last_seen = now(); station.last_message = input.message ?? null;
    event(state, session, input.type === 'status' ? `station_${input.status}` : 'station_event', `${station.id} : ${input.message ?? (input.type === 'status' ? input.status : '')}`, 'simulateur');
    write(state); return { ok: true };
  }
  throw new Error('Requête inconnue en mode démonstration');
}
