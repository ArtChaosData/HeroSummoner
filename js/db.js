/**
 * HeroSummoner — IndexedDB wrapper
 *
 * Object stores:
 *   characters  character model v1 (schemaVersion 5) — see js/character.js and
 *               docs/SPECIFICATION.md §2.1. DB_VERSION 2/3 migrate stored records once
 *               (3: снаряжение в записи — Э3, ТЗ 4.4.7 v0.32).
 *   backup_v4   (DB_VERSION 5, П3) — копия всех записей ДО миграции на schemaVersion 5, как были (резервная копия;
 *               мигрирует только `characters`, эта копия не меняется).
 */
import { migrateCharacter } from './character.js';

const DB_NAME    = 'HeroSummonerDB';
const DB_VERSION = 5;   // 2: character model v1 (E1); 3: equipment (E3); 4: названия языков dnd.su (B-14); 5: backgroundFeature (B-22) + backup_v4 — records migrated in onupgradeneeded

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };

    req.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('characters')) {
        const store = db.createObjectStore('characters', { keyPath: 'id' });
        store.createIndex('status',   'status',   { unique: false });
        store.createIndex('favorite', 'favorite', { unique: false });
        store.createIndex('updatedAt','updatedAt', { unique: false });
      }

      // П3 (schemaVersion 5): резервная копия записей до миграции — отдельное хранилище, не меняется
      const backup = e.oldVersion >= 1 && e.oldVersion < 5 && !db.objectStoreNames.contains('backup_v4')
        ? db.createObjectStore('backup_v4', { keyPath: 'id' }) : null;

      // v1 → v2 → v3 → v4 → v5: migrate every stored character in the upgrade transaction (one pass, never deletes).
      if (e.oldVersion >= 1 && e.oldVersion < 5) {
        const cursorReq = req.transaction.objectStore('characters').openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          try { if (backup && cursor.value?.id) backup.put(structuredClone(cursor.value)); }
          catch (err) { console.error('HeroSummoner: backup failed for', cursor.value?.id, err); }
          try {
            cursor.update(migrateCharacter(cursor.value));
          } catch (err) {
            // Keep the record untouched; migrateCharacter runs again on the next read.
            console.error('HeroSummoner: migration failed for', cursor.value?.id, err);
          }
          cursor.continue();
        };
      }
    };
  });
}

function store(mode = 'readonly') {
  return openDB().then(db =>
    db.transaction('characters', mode).objectStore('characters')
  );
}

function wrap(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export const DB = {
  /** Return all characters, sorted: favorites first, then by updatedAt desc. */
  async getAll() {
    const s = await store();
    const all = (await wrap(s.getAll())).map(migrateCharacter);
    return all.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return  1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  },

  async get(id) {
    const s = await store();
    return migrateCharacter(await wrap(s.get(id)));
  },

  async put(character) {
    if (!character.id)        character.id        = crypto.randomUUID();
    if (!character.createdAt) character.createdAt = Date.now();
    character.updatedAt = Date.now();

    const s = await store('readwrite');
    await wrap(s.put(character));
    return character;
  },

  async delete(id) {
    const s = await store('readwrite');
    return wrap(s.delete(id));
  },

  /** Export all characters as JSON blob. */
  async exportJSON() {
    const all = await this.getAll();
    const blob = new Blob(
      [JSON.stringify({ version: 2, characters: all }, null, 2)],
      { type: 'application/json' }
    );
    return blob;
  },

  /** Import characters from JSON (merges by id). */
  async importJSON(jsonText) {
    const data = JSON.parse(jsonText);
    const chars = Array.isArray(data) ? data : (data.characters || []);
    const s = await store('readwrite');
    for (const raw of chars) {
      const c = migrateCharacter(raw);
      if (!c.id) c.id = crypto.randomUUID();
      await wrap(s.put(c));
    }
    return chars.length;
  },
};
