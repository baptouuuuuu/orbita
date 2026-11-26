import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { buildApp } from '../src/server/app.js';

const origin = 'http://127.0.0.1:3000';
const options = { origin, adminPassword: 'admin-password-for-tests', gmPassword: 'game-password-for-tests', silentSeconds: 1 };
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const dirs: string[] = [];
async function setup(path = ':memory:') {
  const app = await buildApp({ ...options, dbPath: path });
  apps.push(app);
  return app;
}
async function login(app: Awaited<ReturnType<typeof setup>>, role: 'admin' | 'gm') {
  const response = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { role, password: role === 'admin' ? options.adminPassword : options.gmPassword } });
  expect(response.statusCode).toBe(200);
  return response.cookies[0].value;
}
async function call(app: Awaited<ReturnType<typeof setup>>, token: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({ method, url, headers: { origin, cookie: `orbita=${token}` }, payload });
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pilotage local', () => {
  it('joue et conserve une mission complète, ses erreurs et sa réinitialisation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbita-scenario-')); dirs.push(dir);
    const path = join(dir, 'test.sqlite');
    let app = await setup(path);
    const admin = await login(app, 'admin'); let gm = await login(app, 'gm');
    const config = (await call(app, admin, 'POST', '/api/admin/configurations', { name: 'Lune', durationSeconds: 3600, allowTeamChanges: true, stations: ['Panneaux', 'Antenne'] })).json().id;
    const catalog = (await call(app, gm, 'GET', '/api/scenarios')).json();
    expect(catalog[0].id).toBe('lunar-relay');
    expect(catalog[0].stages).toHaveLength(7);
    expect(catalog[0].stages[0].actions[0].title).toBe('Inventorier et installer');
    expect(JSON.stringify(catalog)).not.toContain('"answer"');
    expect((await call(app, gm, 'POST', '/api/sessions', { configurationId: config, scenarioId: 'inconnu' })).statusCode).toBe(404);
    const id = (await call(app, gm, 'POST', '/api/sessions', { configurationId: config, scenarioId: 'lunar-relay' })).json().id;
    const action = (actionId: string, answer?: string) => call(app, gm, 'POST', `/api/sessions/${id}/scenario/actions/${actionId}`, answer === undefined ? {} : { answer });
    expect((await action('inventory')).statusCode).toBe(409);
    await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'start' });
    expect((await action('cabling')).statusCode).toBe(409);
    expect((await action('inventory')).json()).toEqual({ correct: true });
    expect((await action('inventory')).statusCode).toBe(409);
    expect((await action('cabling')).json().correct).toBe(true);
    expect((await action('safety', '8')).json().correct).toBe(false);
    await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'pause' });
    expect((await action('safety', '9')).statusCode).toBe(409);
    await app.close(); apps.splice(apps.indexOf(app), 1);
    app = await setup(path); gm = await login(app, 'gm');
    let detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.scenario.completed).toBe(2);
    expect(detail.scenario.stages[0].actions[2].attempts).toBe(1);
    expect(JSON.stringify(detail.scenario)).not.toContain('"answer"');
    await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'resume' });
    const actions: [string, string?][] = [
      ['safety', '9'], ['solar-angle', '60'], ['solar-balance', '30'], ['power-check'],
      ['boot-order', '123'], ['clock', '14:32'], ['diagnostic'], ['lunar-azimuth', '125'], ['lunar-elevation', '32'], ['lunar-lock'],
      ['earth-target', 'b'], ['relay-turn', '60'], ['relay-confirm'], ['channel', '13'], ['encrypt', 'OXQH'], ['transmit-check'],
      ['decrypt', 'SALUT'], ['checksum', '10'], ['final'],
    ];
    for (const [actionId, answer] of actions) expect((await action(actionId, answer)).json()).toEqual({ correct: true });
    detail = (await call(app, gm, 'GET', `/api/sessions/${id}/export`)).json();
    expect(detail.scenario.result).toBe('completed');
    expect(detail.scenario.completed).toBe(21);
    expect(detail.events.some((event: { type: string }) => event.type === 'scenario_answer_incorrect')).toBe(true);
    const next = (await call(app, gm, 'POST', `/api/sessions/${id}/reset`, {})).json().id;
    expect((await call(app, gm, 'GET', `/api/sessions/${id}`)).json().scenario.result).toBe('completed');
    detail = (await call(app, gm, 'GET', `/api/sessions/${next}`)).json();
    expect(detail.scenario.completed).toBe(0);
    expect(detail.scenario.version).toBe(1);
    await call(app, gm, 'POST', `/api/sessions/${next}/transition`, { action: 'finish' });
    expect((await call(app, gm, 'GET', `/api/sessions/${next}`)).json().scenario.result).toBe('incomplete');
  });

  it('conserve transitions, scores, compensation et résultats après redémarrage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbita-test-')); dirs.push(dir);
    const path = join(dir, 'test.sqlite');
    let app = await setup(path);
    const admin = await login(app, 'admin'); const gm = await login(app, 'gm');
    expect((await call(app, gm, 'POST', '/api/admin/configurations', {})).statusCode).toBe(403);
    const config = await call(app, admin, 'POST', '/api/admin/configurations', { name: 'Test', durationSeconds: 120, allowTeamChanges: true, stations: ['Poste A'] });
    expect(config.statusCode).toBe(200);
    const session = await call(app, gm, 'POST', '/api/sessions', { configurationId: config.json().id });
    const id = session.json().id;
    expect(session.statusCode).toBe(200);
    const team = await call(app, gm, 'POST', `/api/sessions/${id}/teams`, { name: 'Alpha', color: '#123456' });
    const teamId = team.json().id;
    expect(team.statusCode).toBe(200);
    const otherTeam = await call(app, gm, 'POST', `/api/sessions/${id}/teams`, { name: 'Beta', color: '#abcdef' });
    expect(otherTeam.statusCode).toBe(200);
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/scores`, { teamId, delta: 5, reason: '' })).statusCode).toBe(400);
    const score = await call(app, gm, 'POST', `/api/sessions/${id}/scores`, { teamId, delta: 5, reason: 'Action' });
    expect(score.statusCode).toBe(200);
    let detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.teams[0].name).toBe('Alpha');
    expect(detail.teams[0].score).toBe(5);
    expect(detail.events.some((event: { type: string }) => event.type === 'score_changed')).toBe(true);
    expect((await call(app, gm, 'POST', `/api/scores/${score.json().id}/compensate`, { reason: 'Correction' })).statusCode).toBe(200);
    expect((await call(app, gm, 'POST', `/api/scores/${score.json().id}/compensate`, { reason: 'Encore' })).statusCode).toBe(409);
    detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.scores).toHaveLength(2);
    expect(detail.teams[0].score).toBe(0);
    const stationId = detail.stations[0].id;
    expect((await call(app, gm, 'POST', `/api/stations/${stationId}/simulate`, { version: 2, type: 'status', status: 'ready' })).statusCode).toBe(400);
    expect((await call(app, gm, 'POST', `/api/stations/${stationId}/messages`, { version: 1, type: 'status', status: 'busy', message: 'Tension stable' })).statusCode).toBe(200);
    detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.stations[0].effective_status).toBe('busy');
    expect(detail.stations[0].last_message).toBe('Tension stable');
    expect(detail.events.some((event: { actor: string; type: string }) => event.actor === 'gm' && event.type === 'station_busy')).toBe(true);
    for (const status of ['ready', 'error', 'offline']) {
      expect((await call(app, gm, 'POST', `/api/stations/${stationId}/simulate`, { version: 1, type: 'status', status })).statusCode).toBe(200);
      detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
      expect(detail.stations[0].effective_status).toBe(status);
    }
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'start' })).statusCode).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 30));
    const paused = (await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'pause' })).json();
    expect(paused.elapsed_ms).toBeGreaterThan(0);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect((await call(app, gm, 'GET', `/api/sessions/${id}`)).json().elapsed_ms).toBe(paused.elapsed_ms);
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'resume' })).statusCode).toBe(200);
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'finish' })).statusCode).toBe(200);
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/scores`, { teamId, delta: 1, reason: 'Tard' })).statusCode).toBe(409);
    await app.close(); apps.splice(apps.indexOf(app), 1);
    app = await setup(path);
    const newToken = await login(app, 'gm');
    detail = (await call(app, newToken, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.status).toBe('finished');
    expect(detail.scores).toHaveLength(2);
    expect(detail.teams.find((t: { id: string }) => t.id === teamId).score).toBe(0);
  });

  it('diffuse les changements aux clients autorisés et refuse les autres origines', async () => {
    const app = await setup(); const token = await login(app, 'admin');
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Adresse indisponible');
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, { headers: { origin, cookie: `orbita=${token}` } });
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const received = new Promise<string>(resolve => ws.once('message', data => resolve(data.toString())));
    await call(app, token, 'POST', '/api/admin/configurations', { name: 'Direct', durationSeconds: 60, allowTeamChanges: false, stations: [] });
    expect(JSON.parse(await received)).toEqual({ type: 'changed' });
    const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)));
    await call(app, token, 'POST', '/api/logout', {});
    expect(await closed).toBe(1008);
    expect((await call(app, token, 'GET', '/api/configurations')).statusCode).toBe(401);
    const denied = await app.inject({ method: 'POST', url: '/api/login', headers: { origin: 'https://evil.example' }, payload: { role: 'admin', password: options.adminPassword } });
    expect(denied.statusCode).toBe(403);
  });

  it('isole la configuration et conserve les données lors de la réinitialisation', async () => {
    const app = await setup(); const admin = await login(app, 'admin'); const gm = await login(app, 'gm');
    const payload = { name: 'Initiale', durationSeconds: 30, allowTeamChanges: false, stations: ['A'] };
    const config = (await call(app, admin, 'POST', '/api/admin/configurations', payload)).json().id;
    const stationId = (await call(app, gm, 'GET', '/api/configurations')).json()[0].stations[0].id;
    const id = (await call(app, gm, 'POST', '/api/sessions', { configurationId: config })).json().id;
    const teamId = (await call(app, gm, 'POST', `/api/sessions/${id}/teams`, { name: 'A', color: '#000000' })).json().id;
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/teams`, { name: 'A', color: '#000000' })).statusCode).toBe(409);
    expect((await call(app, admin, 'PUT', `/api/admin/configurations/${config}`, { ...payload, name: 'Modifiée', durationSeconds: 90 })).statusCode).toBe(200);
    expect((await call(app, gm, 'GET', '/api/configurations')).json()[0].stations[0].id).toBe(stationId);
    let detail = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json();
    expect(detail.configuration.name).toBe('Initiale');
    expect(detail.configuration.duration_seconds).toBe(30);
    await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'start' });
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/teams`, { name: 'B', color: '#000000' })).statusCode).toBe(409);
    await call(app, gm, 'POST', `/api/sessions/${id}/scores`, { teamId, delta: 7, reason: 'Test' });
    const reset = await call(app, gm, 'POST', `/api/sessions/${id}/reset`, {});
    expect(reset.statusCode).toBe(200);
    expect((await call(app, gm, 'GET', `/api/sessions/${id}`)).json().teams[0].score).toBe(7);
    detail = (await call(app, gm, 'GET', `/api/sessions/${reset.json().id}`)).json();
    expect(detail.status).toBe('ready');
    expect(detail.teams[0].score).toBe(0);
    expect(detail.configuration.duration_seconds).toBe(30);
    expect((await call(app, gm, 'GET', `/api/sessions/${id}/export`)).json().scores).toHaveLength(1);
  });

  it('détecte un poste silencieux sans bloquer la partie', async () => {
    const app = await setup(); const admin = await login(app, 'admin'); const gm = await login(app, 'gm');
    const config = (await call(app, admin, 'POST', '/api/admin/configurations', { name: 'Test', durationSeconds: 10, allowTeamChanges: true, stations: ['A'] })).json().id;
    const id = (await call(app, gm, 'POST', '/api/sessions', { configurationId: config })).json().id;
    const station = (await call(app, gm, 'GET', `/api/sessions/${id}`)).json().stations[0].id;
    await call(app, gm, 'POST', `/api/stations/${station}/simulate`, { version: 1, type: 'status', status: 'ready' });
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect((await call(app, gm, 'GET', `/api/sessions/${id}`)).json().stations[0].effective_status).toBe('offline');
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/transition`, { action: 'start' })).statusCode).toBe(200);
    expect((await call(app, gm, 'POST', `/api/sessions/${id}/events`, { type: 'hint', message: 'Aide' })).statusCode).toBe(200);
  });
});
