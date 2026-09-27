/**
 * HeroSummoner — Character model v1 (schemaVersion 2).
 * Spec: docs/SPECIFICATION.md §2.1 (v0.28, stage E1).
 *
 *   ids        classId / subclassId / raceId / subraceId / backgroundId — canonical keys;
 *              `labels` is a name snapshot used only when an id is missing from the data.
 *   grants[]   { pool, value, source: { type, id }, level, kind: fixed|choice|replacement, slot, replaces }
 *              — the source of truth; flat lists (skills, languages, tools, feats, spells) are derived.
 *   levels[]   { level, classId, hp: { method, value }, choices, grants: [indexes into grants] }
 *
 * migrateCharacter() upgrades a v1 record (no schemaVersion) to v2. Pure: returns a new object.
 */
import { CLASS_DESCRIPTIONS } from './data/class_descriptions.js';
import { LVL1_SUBCLASSES } from './data/class_lvl1_subclasses.js';
import { FEATS } from './data/feats.js';
import { spellIdByName, getSpellById } from './data/spells.js';
import { migrateSpellState } from './spell-groups.js';

export const SCHEMA_VERSION = 2;

// ─── Entity ids ───────────────────────────────────────────────────────────────
// Races/backgrounds: latin slug of the dnd.su page (/race/78-dwarf/ → dwarf, /backgrounds/766-acolyte/ → acolyte).
// Subraces: <race>-<subrace>. Background variants that live on the same dnd.su page: <page>-<variant>.

export const RACE_IDS = {
  'Дварф': 'dwarf', 'Эльф': 'elf', 'Полурослик': 'halfling', 'Человек': 'human', 'Драконорождённый': 'dragonborn',
  'Гном': 'gnome', 'Полуэльф': 'half-elf', 'Полуорк': 'half-orc', 'Тифлинг': 'tiefling',
};

export const SUBRACE_IDS = {
  dwarf:    { 'Горный': 'dwarf-mountain', 'Холмовой': 'dwarf-hill' },
  elf:      { 'Высший': 'elf-high', 'Лесной': 'elf-wood', 'Тёмный эльф (дроу)': 'elf-drow' },
  halfling: { 'Легконогий': 'halfling-lightfoot', 'Коренастый': 'halfling-stout' },
  human:    { 'Стандартный': 'human-standard', 'Альтернативный': 'human-variant' },
  gnome:    { 'Лесной': 'gnome-forest', 'Скальный': 'gnome-rock' },
};

export const BACKGROUND_IDS = {
  'Прислужник': 'acolyte', 'Артист': 'entertainer', 'Гладиатор': 'entertainer-gladiator', 'Беспризорник': 'urchin',
  'Благородный': 'noble', 'Рыцарь': 'noble-knight', 'Гильдейский ремесленник': 'guild-artisan',
  'Купец гильдии': 'guild-artisan-merchant', 'Шарлатан': 'charlatan', 'Моряк': 'sailor', 'Пират': 'pirate',
  'Мудрец': 'sage', 'Народный герой': 'folk-hero', 'Отшельник': 'hermit', 'Преступник': 'criminal',
  'Шпион': 'criminal-spy', 'Чужеземец': 'outlander', 'Солдат': 'soldier', 'Собственная предыстория': 'custom',
};

const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const RACE_NAMES = invert(RACE_IDS);
const SUBRACE_NAMES = Object.assign({}, ...Object.values(SUBRACE_IDS).map(invert));
const BACKGROUND_NAMES = invert(BACKGROUND_IDS);
const CLASS_NAMES = Object.fromEntries(Object.entries(CLASS_DESCRIPTIONS).map(([name, c]) => [c.id, name]));
const CLASS_IDS = invert(CLASS_NAMES);
const SUBCLASSES = Object.values(LVL1_SUBCLASSES).flat();
const FEAT_BY_NAME = new Map(FEATS.map(f => [f.name, f]));
const FEAT_BY_ID = new Map(FEATS.map(f => [f.id, f]));

export const classIdByName = name => CLASS_IDS[name] || null;
export const raceIdByName = name => RACE_IDS[name] || null;
export const subraceIdByName = (raceId, name) => (SUBRACE_IDS[raceId] || {})[name] || null;
export const backgroundIdByName = name => BACKGROUND_IDS[name] || null;
export const featIdByName = name => FEAT_BY_NAME.get(name)?.id || null;
export const featName = id => FEAT_BY_ID.get(id)?.name || id;

/** Display name for an entity id; falls back to the saved `labels` snapshot (content removed/renamed). */
export function entityName(char, kind) {
  const id = char?.[`${kind}Id`];
  if (!id) return char?.labels?.[kind] || '';
  const fromData = {
    class: CLASS_NAMES[id],
    subclass: SUBCLASSES.find(s => s.id === id)?.name,
    race: RACE_NAMES[id],
    subrace: SUBRACE_NAMES[id],
    background: BACKGROUND_NAMES[id],
  }[kind];
  return fromData || char.labels?.[kind] || '';
}

/** True if an id is set but no longer resolves in the data (show ⚠️). */
export function entityMissing(char, kind) {
  return !!char?.[`${kind}Id`] && !{
    class: CLASS_NAMES, race: RACE_NAMES, subrace: SUBRACE_NAMES, background: BACKGROUND_NAMES,
  }[kind]?.[char[`${kind}Id`]] && !(kind === 'subclass' && SUBCLASSES.some(s => s.id === char.subclassId));
}

// ─── Grants ───────────────────────────────────────────────────────────────────

export function grant(pool, value, sourceType, sourceId, opts = {}) {
  return {
    pool, value,
    source: { type: sourceType, id: sourceId ?? null },
    level: opts.level ?? 1,
    kind: opts.kind ?? 'fixed',
    slot: opts.slot ?? null,
    replaces: opts.replaces ?? null,
  };
}

const uniqCI = list => {
  const seen = new Set();
  return list.filter(x => { const k = String(x).trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Values of one pool, deduplicated (case-insensitive), in grant order. */
export function poolValues(char, pool) {
  return uniqCI((char?.grants || []).filter(g => g.pool === pool).map(g => g.value));
}

export const characterLevel = char => Math.max(1, (char?.levels || []).length);

/** Spell grant value → spell name (ids are numbers from spells.js). */
export const spellName = v => (typeof v === 'number' ? getSpellById(v)?.name : null) || String(v);

/**
 * Read-only view in the pre-E1 (v0) shape for screens that were written against it
 * (sheet.js, pdf.js). Everything here is derived from the v2 record.
 */
export function legacyView(char) {
  if (!char) return char;
  const spells = (char.grants || []).filter(g => g.pool === 'spell');
  return {
    ...char,
    class: entityName(char, 'class'),
    subclass: entityName(char, 'subclass'),
    race: entityName(char, 'race'),
    subrace: entityName(char, 'subrace'),
    background: entityName(char, 'background'),
    level: characterLevel(char),
    skills: poolValues(char, 'skill'),
    languages: poolValues(char, 'language'),
    toolProficiencies: poolValues(char, 'tool'),
    feats: poolValues(char, 'feat').map(featName),
    raceCantrips: spells.filter(g => g.source.type === 'race' || g.source.type === 'subrace').map(g => spellName(g.value)),
    maxHp: char.hp?.max ?? 1,
    hp: char.hp?.current ?? char.hp?.max ?? 1,
  };
}

// ─── Migration v1 → v2 ────────────────────────────────────────────────────────

/** Race-trait titles (= wizard choice keys) renamed after the dnd.su race-text audit (E1).
 *  Only these races: the High Elf's «Дополнительный язык» is a real dnd.su trait and keeps its title. */
const RACE_CHOICE_RENAMES = {
  'Человек':  { 'Дополнительный язык': 'Языки', 'Навык': 'Навыки' },
  'Полуэльф': { 'Дополнительный язык': 'Языки' },
};

export function migrateWizardState(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  const out = { ...ws };
  const raceName = typeof out.mecRace === 'string' ? out.mecRace.split('::').slice(1).join('::') : '';
  if (out.mecRaceChoices && RACE_CHOICE_RENAMES[raceName]) {
    const rc = { ...out.mecRaceChoices };
    for (const [from, to] of Object.entries(RACE_CHOICE_RENAMES[raceName])) {
      if (from in rc && !(to in rc)) { rc[to] = rc[from]; delete rc[from]; }
    }
    out.mecRaceChoices = rc;
  }
  delete out.mecEdition;
  // Э2: выбор заклинаний по названиям (mecSpellsCantrips/…/заговор Высшего эльфа) → mecSpellPicks по id
  migrateSpellState(out);
  return out;
}

/**
 * v1 record → v2. Ids come from `_wizardState` (mecClass, mecSubclass, mecRace = 'PHB::Дварф', mecSubrace,
 * mecBackground), else from display names. Flat lists become grants with source `legacy` (v1 did not record
 * where a proficiency came from); re-saving the character in the wizard rebuilds full grants.
 * Nothing is dropped: the original (minus portrait) is kept in `_legacy`, problems go to `migrationWarnings`.
 */
export function migrateCharacter(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  if ((rec.schemaVersion || 1) >= SCHEMA_VERSION) return rec;

  const ws = rec._wizardState || {};
  const warnings = [];
  const nameOf = key => (typeof ws[key] === 'string' && ws[key].includes('::')) ? ws[key].split('::').slice(1).join('::') : null;

  const classId = ws.mecClass || classIdByName(rec.class) || null;
  const subclassId = ws.mecSubclass || rec.subclassId || null;
  const raceName = nameOf('mecRace') || rec.race || '';
  const raceId = raceIdByName(raceName);
  const subraceName = ws.mecSubrace || rec.subrace || '';
  const subraceId = raceId && subraceName ? subraceIdByName(raceId, subraceName) : null;
  const bgName = nameOf('mecBackground') || rec.background || '';
  const backgroundId = backgroundIdByName(bgName);

  if (rec.class && !classId) warnings.push(`класс «${rec.class}» не найден в данных`);
  if (raceName && !raceId) warnings.push(`раса «${raceName}» не найдена в данных (возможно, удалена как не-PHB)`);
  if (subraceName && raceId && !subraceId) warnings.push(`подраса «${subraceName}» не найдена в данных`);
  if (bgName && !backgroundId) warnings.push(`предыстория «${bgName}» не найдена в данных (возможно, удалена как не-PHB)`);

  const legacy = (pool, values) => (values || []).filter(Boolean).map(v => grant(pool, v, 'legacy', null));
  const grants = [
    ...legacy('skill', rec.skills),
    ...legacy('language', rec.languages),
    ...legacy('tool', rec.toolProficiencies),
    ...(rec.feats || []).map(n => grant('feat', featIdByName(n) || n, 'legacy', null)),
    ...(rec.raceCantrips || []).map(n => grant('spell', spellIdByName(n) ?? n, 'race', raceId, { kind: 'choice' })),
  ];
  if (rec.dragonAncestry) grants.push(grant('feature', `Наследие драконов: ${rec.dragonAncestry}`, 'race', raceId, { kind: 'choice' }));
  if (grants.length) warnings.push('источники владений не восстановлены (запись до v0.28) — пересохраните персонажа в мастере');

  const maxHp = rec.maxHp ?? rec.hp?.max ?? 1;
  const curHp = typeof rec.hp === 'number' ? rec.hp : (rec.hp?.current ?? maxHp);
  const level = rec.level || 1;

  const { portrait: _p, _wizardState: _w, ...legacyCopy } = rec;
  const {
    class: _c, subclass: _s, race: _r, subrace: _sr, background: _b, edition: _e, level: _l,
    skills: _sk, languages: _la, toolProficiencies: _t, feats: _f, raceCantrips: _rc, dragonAncestry: _d,
    maxHp: _mh, hp: _h, classChoices, subclassChoices, classVariant, ...rest
  } = rec;

  return {
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    classId, classVariant: classVariant || ws.mecClassVariant || 'phb', subclassId,
    raceId, subraceId, backgroundId,
    labels: { class: rec.class || null, subclass: rec.subclass || null, race: raceName || null,
              subrace: subraceName || null, background: bgName || null },
    hp: { current: curHp, max: maxHp },
    grants,
    levels: Array.from({ length: level }, (_, i) => ({
      level: i + 1, classId,
      hp: i === 0 ? { method: 'max', value: maxHp } : null,
      choices: i === 0 ? { class: classChoices || {}, subclass: subclassChoices || {} } : {},
      grants: i === 0 ? grants.map((_, gi) => gi) : [],
    })),
    migrationWarnings: warnings,
    _legacy: legacyCopy,
    _wizardState: rec._wizardState ? migrateWizardState(rec._wizardState) : rec._wizardState,
  };
}
