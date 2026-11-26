CREATE TABLE configurations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, duration_seconds INTEGER NOT NULL CHECK(duration_seconds > 0),
  allow_team_changes INTEGER NOT NULL CHECK(allow_team_changes IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL
);
CREATE TABLE configuration_stations (
  id TEXT PRIMARY KEY, configuration_id TEXT NOT NULL REFERENCES configurations(id), name TEXT NOT NULL,
  UNIQUE(configuration_id, name)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, configuration_id TEXT NOT NULL REFERENCES configurations(id),
  configuration_snapshot TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','running','paused','finished')),
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0), started_at TEXT, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE UNIQUE INDEX one_unfinished_session ON sessions ((1)) WHERE status != 'finished';
CREATE TABLE teams (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), name TEXT NOT NULL, color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), UNIQUE(session_id, name)
);
CREATE TABLE stations (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('offline','ready','busy','finished','error')),
  last_seen TEXT, last_message TEXT
);
CREATE TABLE score_events (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), team_id TEXT NOT NULL REFERENCES teams(id),
  delta INTEGER NOT NULL CHECK(delta != 0), reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
  compensates TEXT UNIQUE REFERENCES score_events(id)
);
CREATE TABLE session_events (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id), type TEXT NOT NULL, actor TEXT NOT NULL,
  message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX session_events_by_session ON session_events(session_id, created_at);
CREATE INDEX scores_by_team ON score_events(team_id, created_at);
CREATE TRIGGER score_events_no_update BEFORE UPDATE ON score_events BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER score_events_no_delete BEFORE DELETE ON score_events BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER session_events_no_update BEFORE UPDATE ON session_events BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER session_events_no_delete BEFORE DELETE ON session_events BEGIN SELECT RAISE(ABORT, 'append only'); END;
