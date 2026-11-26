import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Role = 'admin' | 'gm';
type Station = { id: string; name: string; status: string; effective_status: string; last_seen: string | null; last_message: string | null };
type Config = { id: string; name: string; duration_seconds: number; allow_team_changes: number; archived: number; stations: Station[] };
type Team = { id: string; name: string; color: string; active: number; score: number };
type Event = { id: string; type: string; actor: string; message: string; created_at: string };
type Score = { id: string; team_name: string; delta: number; reason: string; actor: string; created_at: string; compensated: number; compensates: string | null };
type SessionSummary = { id: string; status: string; created_at: string; configuration_snapshot: string };
type Session = { id: string; status: string; elapsed_ms: number; remaining_ms: number; configuration: { name: string; allow_team_changes: number }; teams: Team[]; stations: Station[]; events: Event[]; scores: Score[] };
type Health = { backend: string; database: string; startedAt: string; silentSeconds: number; events: Event[] };

const labels: Record<string, string> = {
  ready: 'Prête', running: 'En cours', paused: 'En pause', finished: 'Terminée',
  offline: 'Hors ligne', busy: 'Occupé', error: 'En erreur',
};
async function api<T>(url: string, method = 'GET', body?: object): Promise<T> {
  if (__ORBITA_DEMO__) {
    const { demoApi } = await import('./demo.js');
    return demoApi(url, method, body) as T;
  }
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Erreur réseau' })) as { error?: string };
    throw new Error(data.error ?? 'Erreur réseau');
  }
  return response.json() as Promise<T>;
}
function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function date(value: string | null) { return value ? new Date(value).toLocaleString('fr-FR') : 'Jamais'; }

function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginRole, setLoginRole] = useState<Role>('gm');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('Connexion…');
  const [configs, setConfigs] = useState<Config[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tab, setTab] = useState<'game' | 'admin'>('game');
  const [configId, setConfigId] = useState('');
  const [configName, setConfigName] = useState('');
  const [duration, setDuration] = useState(3600);
  const [allowChanges, setAllowChanges] = useState(true);
  const [stationNames, setStationNames] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamColor, setTeamColor] = useState('#3273dc');
  const [scoreTeam, setScoreTeam] = useState('');
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [eventType, setEventType] = useState<'hint' | 'intervention'>('hint');
  const [eventText, setEventText] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [receivedAt, setReceivedAt] = useState(Date.now());

  useEffect(() => {
    api<{ role: Role }>('/api/me').then(data => setRole(data.role)).catch(() => setRole(null)).finally(() => setChecking(false));
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const refresh = useCallback(async () => {
    const [nextConfigs, nextSessions] = await Promise.all([api<Config[]>('/api/configurations'), api<SessionSummary[]>('/api/sessions')]);
    setConfigs(nextConfigs); setSessions(nextSessions);
    const id = selected || nextSessions.find(s => s.status !== 'finished')?.id || '';
    if (id) { setSelected(id); setSession(await api<Session>(`/api/sessions/${id}`)); setReceivedAt(Date.now()); }
    else setSession(null);
    if (role === 'admin') setHealth(await api<Health>('/api/admin/health'));
  }, [role, selected]);
  useEffect(() => {
    if (!role) return;
    let active = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    const update = () => { refresh().catch(e => { if (active) setError(e.message); }); };
    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socket.onopen = () => { setConnection('Connecté'); update(); };
      socket.onmessage = update;
      socket.onclose = () => { if (active) { setConnection('Déconnecté — reconnexion'); retry = setTimeout(connect, 3000); } };
      socket.onerror = () => socket?.close();
    };
    let unsubscribe: (() => void) | undefined;
    update();
    if (__ORBITA_DEMO__) {
      setConnection('Simulation dans ce navigateur');
      void import('./demo.js').then(({ subscribeDemo }) => { if (active) unsubscribe = subscribeDemo(update); });
    } else connect();
    const poll = setInterval(update, 5000);
    return () => { active = false; clearTimeout(retry); clearInterval(poll); unsubscribe?.(); socket?.close(); };
  }, [role, refresh]);
  const act = async (fn: () => Promise<unknown>, success = 'Action enregistrée') => {
    setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur réseau'); }
  };
  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try { const result = await api<{ role: Role }>('/api/login', 'POST', { role: loginRole, password }); setPassword(''); setRole(result.role); }
    catch (e) { setError(e instanceof Error ? e.message : 'Connexion impossible'); }
  };
  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: configName, durationSeconds: Number(duration), allowTeamChanges: allowChanges, stations: stationNames.split('\n').map(s => s.trim()).filter(Boolean) };
    await act(async () => {
      await api(configId ? `/api/admin/configurations/${configId}` : '/api/admin/configurations', configId ? 'PUT' : 'POST', body);
      setConfigId(''); setConfigName(''); setStationNames('');
    }, 'Configuration enregistrée');
  };
  const startEditing = (config: Config) => {
    setConfigId(config.id); setConfigName(config.name); setDuration(config.duration_seconds); setAllowChanges(!!config.allow_team_changes); setStationNames(config.stations.map(s => s.name).join('\n'));
  };
  const demoNotice = __ORBITA_DEMO__ && <aside className="demo-notice" aria-label="Mode démonstration"><strong>Démonstration — données fictives, sans serveur</strong><p>Les données restent dans ce navigateur et peuvent être effacées. Ne saisissez aucune information sensible ; ce mode ne protège pas les accès.</p><div className="row"><a href="https://github.com/baptouuuuuu/orbita/issues/new" target="_blank" rel="noreferrer">Donner un retour sur GitHub</a><button type="button" className="secondary compact" onClick={() => { if (confirm('Effacer toutes les données de démonstration de ce navigateur ?')) void import('./demo.js').then(({ resetDemo }) => { resetDemo(); location.reload(); }); }}>Effacer la démonstration</button></div></aside>;
  const exportDemo = async (id: string) => {
    try {
      const data = await api<object>(`/api/sessions/${id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `orbita-demo-${id}.json`; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export impossible'); }
  };
  if (checking) return <main><p>Chargement…</p></main>;
  if (!role) return <main className="login">{demoNotice}<div className="login-intro"><div className="brand-mark" aria-hidden="true"><span /></div><p className="eyebrow">Centre de contrôle</p><h1>ORBITA</h1><p>Pilotez vos jeux, ensemble et en temps réel.</p></div><form onSubmit={submitLogin}>
    <div className="login-form-heading"><h2>Bienvenue</h2><p>Choisissez votre espace pour commencer.</p></div>
    <label>Rôle<select value={loginRole} onChange={e => setLoginRole(e.target.value as Role)}><option value="gm">Maître du jeu</option><option value="admin">Administrateur</option></select></label>
    {!__ORBITA_DEMO__ && <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>}
    <button>{__ORBITA_DEMO__ ? 'Entrer dans la démonstration' : 'Se connecter'}</button>{error && <p role="alert" className="error">{error}</p>}
  </form></main>;
  const active = session && session.status !== 'finished';
  const teamEditable = active && (session.status === 'ready' || !!session.configuration.allow_team_changes);
  const remaining = session ? Math.max(0, session.remaining_ms - (session.status === 'running' ? tick - receivedAt : 0)) : 0;
  return <main>
    {demoNotice}
    <header className="app-header"><div className="brand"><div className="brand-mark" aria-hidden="true"><span /></div><div><h1>ORBITA</h1><p>Centre de contrôle</p></div></div>
      <div className="header-actions"><div className="connection"><span className={`connection-dot ${connection.startsWith('Déconnecté') ? 'is-disconnected' : ''}`} aria-hidden="true" /><span>{connection}</span></div><span className="role-label">{role === 'admin' ? 'Administrateur' : 'Maître du jeu'}</span>
      <button className="secondary" onClick={() => { void api('/api/logout', 'POST', {}).then(() => { setRole(null); setSelected(''); setSession(null); setError(''); setMessage(''); }).catch(e => setError(e instanceof Error ? e.message : 'Déconnexion impossible')); }}>Déconnexion</button></div></header>
    <nav aria-label="Navigation"><button className={tab === 'game' ? 'active' : ''} aria-current={tab === 'game' ? 'page' : undefined} onClick={() => setTab('game')}>Pilotage</button>{role === 'admin' && <button className={tab === 'admin' ? 'active' : ''} aria-current={tab === 'admin' ? 'page' : undefined} onClick={() => setTab('admin')}>Administration</button>}</nav>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {tab === 'game' ? <>
      <div className="page-heading"><div><p className="eyebrow">Espace de jeu</p><h2>Pilotage</h2><p>Tout ce qu’il vous faut pour suivre votre partie.</p></div><span className="page-heading-tag">Vue d’ensemble</span></div>
      <section className="sessions-section"><div className="section-heading"><div><p className="eyebrow">Votre activité</p><h2>Sessions</h2></div><p>Retrouvez une partie ou lancez-en une nouvelle.</p></div><div className="row session-picker">
        <label>Historique<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choisir une session</option>{sessions.map(s => <option key={s.id} value={s.id}>{JSON.parse(s.configuration_snapshot).name} — {labels[s.status]} — {date(s.created_at)}</option>)}</select></label>
        <label>Nouvelle session<select id="new-config" defaultValue=""><option value="" disabled>Choisir une configuration</option>{configs.filter(c => !c.archived).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <button onClick={() => { const id = (document.getElementById('new-config') as HTMLSelectElement).value; if (!id) { setError('Choisissez une configuration'); return; } void act(async () => { const result = await api<{ id: string }>('/api/sessions', 'POST', { configurationId: id }); setSelected(result.id); }, 'Session créée'); }}>Créer la session</button>
      </div>{!sessions.length && <p>{configs.some(c => !c.archived) ? 'Aucune session. Choisissez une configuration pour en créer une.' : 'Aucune session. Un administrateur doit créer une configuration.'}</p>}</section>
      {session ? <>
        <section className="session-overview"><div className="session-head"><div><p className="eyebrow">Session sélectionnée</p><h2>{session.configuration.name}</h2><p><span className={`status-badge status-${session.status}`}><span aria-hidden="true" />{labels[session.status]}</span></p>{__ORBITA_DEMO__ ? <button className="secondary compact" onClick={() => void exportDemo(session.id)}>Exporter les résultats JSON</button> : <a href={`/api/sessions/${session.id}/export`}>Exporter les résultats JSON</a>}</div><div className="timer" aria-label="Temps restant">{clock(remaining)}<small>temps restant{remaining === 0 ? ' — écoulé' : ''}</small></div></div>
          <div className="row session-actions">
            {session.status === 'ready' && <button onClick={() => act(() => api(`/api/sessions/${session.id}/transition`, 'POST', { action: 'start' }))}>Lancer</button>}
            {session.status === 'running' && <button onClick={() => act(() => api(`/api/sessions/${session.id}/transition`, 'POST', { action: 'pause' }))}>Pause</button>}
            {session.status === 'paused' && <button onClick={() => act(() => api(`/api/sessions/${session.id}/transition`, 'POST', { action: 'resume' }))}>Reprendre</button>}
            {active && <><button className="danger" onClick={() => { if (confirm('Terminer définitivement cette session ?')) void act(() => api(`/api/sessions/${session.id}/transition`, 'POST', { action: 'finish' })); }}>Terminer</button>
              <button className="secondary" onClick={() => { if (confirm('Clôturer cette session et en créer une nouvelle avec les mêmes équipes ?')) void act(async () => { const result = await api<{ id: string }>(`/api/sessions/${session.id}/reset`, 'POST', {}); setSelected(result.id); }); }}>Réinitialiser</button></>}
          </div>
        </section>
        <div className="grid"><section><h2>Équipes et classement</h2>{session.teams.length ? <ol className="ranking">{session.teams.map(t => <li key={t.id}><span className="dot" style={{ backgroundColor: t.color }} /> <strong>{t.name}</strong> — {t.score} pts {!t.active && '(retirée)'}
          {teamEditable && !!t.active && <span className="row"><button className="secondary compact" onClick={() => { const name = prompt('Nom de l’équipe', t.name); if (name === null) return; const color = prompt('Couleur au format #RRGGBB', t.color); if (color !== null) void act(() => api(`/api/teams/${t.id}`, 'PUT', { name, color })); }}>Modifier</button><button className="secondary compact" onClick={() => { if (confirm(`Retirer ${t.name} ?`)) void act(() => api(`/api/teams/${t.id}/remove`, 'POST', {})); }}>Retirer</button></span>}</li>)}</ol> : <p>Aucune équipe.</p>}
          {teamEditable && <form onSubmit={e => { e.preventDefault(); void act(async () => { await api(`/api/sessions/${session.id}/teams`, 'POST', { name: teamName, color: teamColor }); setTeamName(''); }); }}><label>Nom de l’équipe<input required maxLength={100} value={teamName} onChange={e => setTeamName(e.target.value)} /></label><label>Couleur<input type="color" value={teamColor} onChange={e => setTeamColor(e.target.value)} /></label><button>Ajouter l’équipe</button></form>}
          {active && <form onSubmit={e => { e.preventDefault(); void act(async () => { await api(`/api/sessions/${session.id}/scores`, 'POST', { teamId: scoreTeam, delta: Number(delta), reason }); setReason(''); }); }}><h3>Modifier le score</h3><label>Équipe<select required value={scoreTeam} onChange={e => setScoreTeam(e.target.value)}><option value="">Choisir</option>{session.teams.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Variation (+ ou −)<input type="number" required value={delta} onChange={e => setDelta(Number(e.target.value))} /></label><label>Motif obligatoire<input required maxLength={100} value={reason} onChange={e => setReason(e.target.value)} /></label><button>Enregistrer les points</button></form>}
        </section><section><h2>Postes</h2>{session.stations.length ? session.stations.map(s => <article key={s.id} className="station"><h3>{s.name} — {labels[s.effective_status]}</h3><p>Dernier message : {s.last_message || 'Aucun'} · {date(s.last_seen)}</p>
          {active && <div className="row">{(['ready', 'busy', 'finished', 'error', 'offline'] as const).map(status => <button className="secondary compact" key={status} onClick={() => act(() => api(`/api/stations/${s.id}/simulate`, 'POST', { version: 1, type: 'status', status, message: `Simulation : ${labels[status]}` }))}>{labels[status]}</button>)}
            <button className="secondary compact" onClick={() => { const message = prompt('Événement simulé'); if (message) void act(() => api(`/api/stations/${s.id}/simulate`, 'POST', { version: 1, type: 'event', message })); }}>Événement simulé</button></div>}</article>) : <p>Aucun poste configuré.</p>}
          <p>Un poste silencieux est affiché hors ligne ; la partie reste pilotable.</p>
        </section></div>
        <div className="grid"><section><h2>Journal de partie</h2>{active && <form onSubmit={e => { e.preventDefault(); void act(async () => { await api(`/api/sessions/${session.id}/events`, 'POST', { type: eventType, message: eventText }); setEventText(''); }); }}><label>Type<select value={eventType} onChange={e => setEventType(e.target.value as 'hint' | 'intervention')}><option value="hint">Indice donné</option><option value="intervention">Intervention</option></select></label><label>Message<textarea required maxLength={500} value={eventText} onChange={e => setEventText(e.target.value)} /></label><button>Consigner</button></form>}
          {session.events.length ? <ul className="log">{session.events.map(ev => <li key={ev.id}><time>{date(ev.created_at)}</time> · {ev.actor} · {ev.type}<br />{ev.message}</li>)}</ul> : <p>Aucun événement.</p>}</section>
          <section><h2>Historique des scores</h2>{session.scores.length ? <ul className="log">{session.scores.map(s => <li key={s.id}>{date(s.created_at)} · {s.team_name} · {s.delta > 0 ? '+' : ''}{s.delta} points · {s.reason} ({s.actor}) {s.compensated ? '— compensé' : ''}{s.compensates ? ' — correction' : ''}
            {active && !s.compensated && !s.compensates && <button className="secondary compact" onClick={() => { const reason = prompt('Motif de la correction'); if (reason && confirm('Enregistrer une opération compensatoire ?')) void act(() => api(`/api/scores/${s.id}/compensate`, 'POST', { reason })); }}>Compenser</button>}</li>)}</ul> : <p>Aucun score enregistré.</p>}</section></div>
      </> : <section className="empty-state"><div className="empty-icon" aria-hidden="true">◎</div><h2>Prêt à jouer ?</h2><p>Sélectionnez ou créez une session pour accéder au pilotage.</p></section>}
    </> : <>
      <div className="page-heading"><div><p className="eyebrow">Espace administrateur</p><h2>Administration</h2><p>Configurez vos parties et surveillez votre installation.</p></div></div>
      <div className="grid"><section><h2>Configurations</h2><form onSubmit={saveConfig}><label>Nom<input required maxLength={100} value={configName} onChange={e => setConfigName(e.target.value)} /></label><label>Durée par défaut (secondes)<input type="number" min="1" max="86400" required value={duration} onChange={e => setDuration(Number(e.target.value))} /></label><label className="checkbox"><input type="checkbox" checked={allowChanges} onChange={e => setAllowChanges(e.target.checked)} /> Autoriser les changements d’équipe pendant la partie</label><label>Postes (un nom par ligne)<textarea value={stationNames} onChange={e => setStationNames(e.target.value)} /></label><button>{configId ? 'Enregistrer les modifications' : 'Créer la configuration'}</button>{configId && <button type="button" className="secondary" onClick={() => { setConfigId(''); setConfigName(''); setStationNames(''); }}>Annuler</button>}</form>
        {configs.length ? configs.map(c => <article key={c.id}><h3>{c.name} {c.archived ? '— archivée' : ''}</h3><p>{c.duration_seconds} secondes · {c.stations.length} poste(s)</p><button className="secondary compact" onClick={() => startEditing(c)}>Modifier</button> {!c.archived && <button className="secondary compact" onClick={() => { if (confirm(`Archiver ${c.name} ?`)) void act(() => api(`/api/admin/configurations/${c.id}/archive`, 'POST', {})); }}>Archiver</button>}</article>) : <p>Aucune configuration.</p>}
      </section><section><h2>Diagnostic</h2>{health ? <><p>Serveur : {health.backend} · Base : {health.database}</p><p>Démarrage : {date(health.startedAt)} · Seuil de silence : {health.silentSeconds} s</p><p>Temps réel : {connection}</p><h3>Actions et événements récents</h3><ul className="log">{health.events.map(ev => <li key={ev.id}>{date(ev.created_at)} · {ev.actor} · {ev.type} : {ev.message}</li>)}</ul></> : <p>Chargement du diagnostic…</p>}</section></div>
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
