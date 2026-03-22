/**
 * HeroSummoner — IndexedDB wrapper
 *
 * Object stores:
 *   characters  { id, name, class, subclass, race, subrace, background,
 *                 level, hp, maxHp, stats, skills, portrait, status,
 *                 favorite, createdAt, updatedAt, … }
 */

const DB_NAME    = 'HeroSummonerDB';
const DB_VERSION = 1;

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
    const all = await wrap(s.getAll());
    return all.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return  1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  },

  async get(id) {
    const s = await store();
    return wrap(s.get(id));
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
      [JSON.stringify({ version: 1, characters: all }, null, 2)],
      { type: 'application/json' }
    );
    return blob;
  },

  /** Import characters from JSON (merges by id). */
  async importJSON(jsonText) {
    const data = JSON.parse(jsonText);
    const chars = Array.isArray(data) ? data : (data.characters || []);
    const s = await store('readwrite');
    for (const c of chars) {
      if (!c.id) c.id = crypto.randomUUID();
      await wrap(s.put(c));
    }
    return chars.length;
  },
};
