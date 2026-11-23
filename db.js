// Opens the SQLite database file and creates the tables on first run.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'lostfound.db'));

db.exec(`
  PRAGMA foreign_keys = ON;

  -- Location: district -> upazila -> area (village / mohalla)
  CREATE TABLE IF NOT EXISTS districts (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS upazilas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    district_id INTEGER NOT NULL REFERENCES districts(id),
    name        TEXT NOT NULL,
    UNIQUE (district_id, name)
  );

  CREATE TABLE IF NOT EXISTS areas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    upazila_id INTEGER NOT NULL REFERENCES upazilas(id),
    name       TEXT NOT NULL,
    UNIQUE (upazila_id, name)
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    nid           TEXT NOT NULL UNIQUE,
    phone         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- status: available -> claimed -> returned
  --         flagged  = hidden because the finder was reported
  --         removed  = deleted by the finder
  CREATE TABLE IF NOT EXISTS items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    finder_id       INTEGER NOT NULL REFERENCES users(id),
    category        TEXT NOT NULL,
    description     TEXT NOT NULL,
    area_id         INTEGER NOT NULL REFERENCES areas(id),
    photo           TEXT,
    secret_question TEXT NOT NULL,
    secret_answer   TEXT NOT NULL DEFAULT '', -- the finder's own notes; never shown to claimants
    status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'claimed', 'returned', 'flagged', 'removed')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- One claim per person per item, so nobody can guess the answer repeatedly.
  CREATE TABLE IF NOT EXISTS claims (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER NOT NULL REFERENCES items(id),
    claimant_id INTEGER NOT NULL REFERENCES users(id),
    answer      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'reported')),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_id, claimant_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id         INTEGER NOT NULL REFERENCES claims(id),
    reporter_id      INTEGER NOT NULL REFERENCES users(id),
    reported_user_id INTEGER NOT NULL REFERENCES users(id),
    reason           TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (claim_id, reporter_id)
  );

  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
  CREATE INDEX IF NOT EXISTS idx_items_finder ON items(finder_id);
  CREATE INDEX IF NOT EXISTS idx_claims_item  ON claims(item_id);
`);

// Run several statements as one all-or-nothing unit.
db.tx = function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

// Load the places from locations.js. Safe to run on every start: anything already
// in the database is skipped, anything new is added.
const LOCATIONS = require('./locations');
db.tx(() => {
  const addDistrict = db.prepare('INSERT OR IGNORE INTO districts (name) VALUES (?)');
  const findDistrict = db.prepare('SELECT id FROM districts WHERE name = ?');
  const addUpazila = db.prepare('INSERT OR IGNORE INTO upazilas (district_id, name) VALUES (?, ?)');
  const findUpazila = db.prepare('SELECT id FROM upazilas WHERE district_id = ? AND name = ?');
  const addArea = db.prepare('INSERT OR IGNORE INTO areas (upazila_id, name) VALUES (?, ?)');

  for (const [district, upazilas] of Object.entries(LOCATIONS)) {
    addDistrict.run(district);
    const districtId = findDistrict.get(district).id;
    for (const [upazila, areas] of Object.entries(upazilas)) {
      addUpazila.run(districtId, upazila);
      const upazilaId = findUpazila.get(districtId, upazila).id;
      for (const area of areas) addArea.run(upazilaId, area);
    }
  }
});

module.exports = db;
