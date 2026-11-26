import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoApi, resetDemo, subscribeDemo } from '../src/client/demo.js';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const call = <T>(url: string, method = 'GET', body?: object) => demoApi(url, method, body) as T;
type Detail = { status: string; teams: { id: string; score: number }[]; stations: { id: string; effective_status: string }[]; scores: { delta: number }[]; events: { type: string }[]; configuration: { name: string } };

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('démonstration autonome', () => {
  it('suit les actions du scénario et remet sa progression à zéro', () => {
    call('/api/login', 'POST', { role: 'gm', password: '' });
    const config = call<{ id: string }[]>('/api/configurations')[0];
    const catalog = call<{ id: string; stages: { title: string; actions: { title: string }[] }[] }[]>('/api/scenarios');
    expect(catalog[0].id).toBe('lunar-relay');
    expect(catalog[0].stages).toHaveLength(7);
    expect(catalog[0].stages[0].actions[0].title).toBe('Inventorier et installer');
    expect(JSON.stringify(catalog)).not.toContain('"answer"');
    const sessionId = call<{ id: string }>('/api/sessions', 'POST', { configurationId: config.id, scenarioId: 'lunar-relay' }).id;
    const action = (id: string, body = {}) => call<{ correct: boolean }>(`/api/sessions/${sessionId}/scenario/actions/${id}`, 'POST', body);
    expect(() => action('inventory')).toThrow('en cours');
    call(`/api/sessions/${sessionId}/transition`, 'POST', { action: 'start' });
    expect(() => action('cabling')).toThrow('non disponible');
    action('inventory'); action('cabling');
    expect(action('safety', { answer: '8' }).correct).toBe(false);
    const detail = call<{ scenario: { completed: number; stages: { actions: { attempts: number }[] }[] } }>(`/api/sessions/${sessionId}`);
    expect(detail.scenario.completed).toBe(2);
    expect(detail.scenario.stages[0].actions[2].attempts).toBe(1);
    const next = call<{ id: string }>(`/api/sessions/${sessionId}/reset`, 'POST', {}).id;
    expect(call<{ scenario: { completed: number } }>(`/api/sessions/${next}`).scenario.completed).toBe(0);
  });

  it('simule une partie et conserve son historique dans le navigateur', () => {
    call('/api/login', 'POST', { role: 'gm', password: '' });
    expect(() => call('/api/admin/configurations', 'POST', {})).toThrow('administrateur');
    const config = call<{ id: string }[]>('/api/configurations')[0];
    const changes = vi.fn(); const unsubscribe = subscribeDemo(changes);
    const sessionId = call<{ id: string }>('/api/sessions', 'POST', { configurationId: config.id }).id;
    const teamId = call<{ id: string }>(`/api/sessions/${sessionId}/teams`, 'POST', { name: 'Alpha', color: '#123456' }).id;
    expect(() => call(`/api/sessions/${sessionId}/scores`, 'POST', { teamId, delta: 5, reason: '' })).toThrow('Entrée invalide');
    const scoreId = call<{ id: string }>(`/api/sessions/${sessionId}/scores`, 'POST', { teamId, delta: 5, reason: 'Test' }).id;
    expect(call<Detail>(`/api/sessions/${sessionId}`).teams[0].score).toBe(5);
    call(`/api/scores/${scoreId}/compensate`, 'POST', { reason: 'Correction' });
    const stationId = call<Detail>(`/api/sessions/${sessionId}`).stations[0].id;
    expect(() => call(`/api/stations/${stationId}/simulate`, 'POST', { version: 2, type: 'status', status: 'ready' })).toThrow('Entrée invalide');
    call(`/api/stations/${stationId}/simulate`, 'POST', { version: 1, type: 'status', status: 'error' });
    expect(call<Detail>(`/api/sessions/${sessionId}`).stations[0].effective_status).toBe('error');
    for (const action of ['start', 'pause', 'resume', 'finish']) call(`/api/sessions/${sessionId}/transition`, 'POST', { action });
    const result = call<Detail>(`/api/sessions/${sessionId}/export`);
    expect(result.status).toBe('finished');
    expect(result.teams[0].score).toBe(0);
    expect(result.scores).toHaveLength(2);
    expect(result.events.some(e => e.type === 'score_compensated')).toBe(true);
    expect(changes).toHaveBeenCalled(); unsubscribe();
    resetDemo();
    expect(() => call('/api/me')).toThrow('Authentification requise');
    call('/api/login', 'POST', { role: 'gm', password: '' });
    expect(call<unknown[]>('/api/sessions')).toHaveLength(0);
  });

  it('fige les configurations et réinitialise sans effacer les résultats', () => {
    call('/api/login', 'POST', { role: 'admin', password: '' });
    const config = call<{ id: string }[]>('/api/configurations')[0];
    const sessionId = call<{ id: string }>('/api/sessions', 'POST', { configurationId: config.id }).id;
    call(`/api/admin/configurations/${config.id}`, 'PUT', { name: 'Modifiée', durationSeconds: 30, allowTeamChanges: true, stations: [] });
    const detail = call<Detail>(`/api/sessions/${sessionId}`);
    expect(detail.configuration.name).toBe('Configuration de démonstration');
    expect(detail.stations).toHaveLength(2);
    const next = call<{ id: string }>(`/api/sessions/${sessionId}/reset`, 'POST', {});
    expect(call<Detail>(`/api/sessions/${sessionId}`).status).toBe('finished');
    expect(call<Detail>(`/api/sessions/${next.id}`).status).toBe('ready');
  });
});
