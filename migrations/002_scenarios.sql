CREATE TABLE session_scenarios (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  definition TEXT NOT NULL,
  progress TEXT NOT NULL
);
