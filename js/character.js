/**
 * HeroSummoner — Character model v1 (schemaVersion 3).
 * Spec: docs/SPECIFICATION.md §2.1 (v0.28, stage E1).
 *
 *   ids        classId / subclassId / raceId / subraceId / backgroundId — canonical keys;
 *              `labels` is a name snapshot used only when an id is missing from the data.
 *   grants[]   { pool, value, source: { type, id }, level, kind: fixed|choice|replacement, slot, replaces }
 *              — the source of truth; flat lists (skills, languages, tools, feats, spells) are derived.
 *   levels[]   { level, classId, hp: { method, value }, choices, grants: [indexes into grants] }
 *
 *   equipment  { mode, encumbrance, classChoices, gold, items[{ id|null, qty, source, equipped?, name?, custom? }], coins }
 *              — schemaVersion 3 (Э3, ТЗ 4.4.7 v0.32). КД, атаки и вес на листе считаются из items + equipped.
 *
 * migrateCharacter() upgrades v1 (no schemaVersion) → v2 → v3. Pure: returns a new object.
 */
import { CLASS_DESCRIPTIONS } from './data/class_descriptions.js';
import { LVL1_SUBCLASSES } from './data/class_lvl1_subclasses.js';
import { FEATS } from './data/feats.js';
import { spellIdByName, getSpellById } from './data/spells.js';
import { migrateSpellState } from './spell-groups.js';
import {
  itemById, itemByName, autoEquip, equipProfs, gpToCoins,
  TOOL_RENAMES, TOOL_REMOVED, RACE_EQUIP_GRANTS,
} from './equipment.js';

export const SCHEMA_VERSION = 3;

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
    expertise: poolValues(char, 'expertise'), // компетентность (шаг 4.4.4a, Домен знаний) — бонус мастерства ×2
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
  // Э3: названия инструментов — по таблице dnd.su; снаряжение — в mecEquip
  renameToolsInWizard(out);
  migrateEquipWizard(out);
  return out;
}

const renameTool = v => TOOL_RENAMES[v] || v;
const renameTypedKey = k => {
  if (typeof k !== 'string' || !k.includes('::')) return k;
  const [t, ...rest] = k.split('::');
  return `${t}::${renameTool(rest.join('::'))}`;
};

function renameToolsInWizard(ws) {
  if (ws.mecBgChoiceData && typeof ws.mecBgChoiceData === 'object') {
    const d = {};
    for (const [k, v] of Object.entries(ws.mecBgChoiceData)) {
      d[k] = Array.isArray(v) ? v.map(renameTypedKey) : (typeof v === 'string' ? renameTool(v) : v);
    }
    ws.mecBgChoiceData = d;
  }
  if (ws.mecClassToolChoice && typeof ws.mecClassToolChoice === 'object') {
    const d = {};
    for (const [k, v] of Object.entries(ws.mecClassToolChoice)) d[k] = Array.isArray(v) ? v.map(renameTypedKey) : v;
    ws.mecClassToolChoice = d;
  }
  if (ws.mecEquipChoices && typeof ws.mecEquipChoices === 'object') {
    const d = { ...ws.mecEquipChoices };
    for (const k of Object.keys(d)) if (k.startsWith('bgch_') && typeof d[k] === 'string') d[k] = renameTool(d[k]);
    ws.mecEquipChoices = d;
  }
}

/** Старый предмет корзины (до Э3: { id: 'weapons::Длинный меч', name, costGp, weightLb, qty }) → запись инвентаря. */
function legacyCartEntry(c) {
  const name = String(c?.name || '').trim();
  const qty = Math.max(1, parseInt(c?.qty, 10) || 1);
  if (String(c?.id || '').startsWith('homebrew::')) {
    return { id: null, name, qty, custom: { costGp: Math.max(0, +c.costGp || 0), weightLb: Math.max(0, +c.weightLb || 0) } };
  }
  const it = itemByName(name) || itemByName(name.replace(/\(50 фт\)/, '(50 футов)'));
  if (it) return { id: it.id, qty };
  return { id: null, name, qty, custom: { costGp: Math.max(0, +c.costGp || 0), weightLb: Math.max(0, +c.weightLb || 0) }, legacy: true };
}

/** До Э3 снаряжение жило в mecEquipMode / mecEquipGold / mecCart / mecHomebrew / mecEquipChoices['cls_*']. */
function migrateEquipWizard(ws) {
  if (ws.mecEquip && typeof ws.mecEquip === 'object') return;
  const hasOld = 'mecEquipMode' in ws || 'mecCart' in ws || 'mecEquipGold' in ws;
  if (!hasOld) return;
  const cart = Array.isArray(ws.mecCart) ? ws.mecCart.map(legacyCartEntry) : [];
  ws.mecEquip = {
    mode: ws.mecEquipMode === 'buy' ? 'purchase' : 'standard',
    encumbrance: false,
    classChoices: {},
    gold: typeof ws.mecEquipGold === 'number' ? { formula: null, rolls: [], mult: 1, total: ws.mecEquipGold } : null,
    goldClass: typeof ws.mecEquipGold === 'number' ? (ws.mecClass || null) : null,
    cart,
    equippedManual: {},
    legacyNote: 'Выбор снаряжения класса сделан до обновления «Снаряжения» (PHB а/б/в) — выберите заново.',
  };
  delete ws.mecEquipMode; delete ws.mecEquipGold; delete ws.mecCart; delete ws.mecHomebrew;
  if (ws.mecEquipChoices) {
    for (const k of Object.keys(ws.mecEquipChoices)) if (/^(cls|bg)_\d+$/.test(k)) delete ws.mecEquipChoices[k];
  }
}

/**
 * v1 record → v2. Ids come from `_wizardState` (mecClass, mecSubclass, mecRace = 'PHB::Дварф', mecSubrace,
 * mecBackground), else from display names. Flat lists become grants with source `legacy` (v1 did not record
 * where a proficiency came from); re-saving the character in the wizard rebuilds full grants.
 * Nothing is dropped: the original (minus portrait) is kept in `_legacy`, problems go to `migrationWarnings`.
 */
export function migrateCharacter(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  let out = rec;
  if ((out.schemaVersion || 1) < 2) out = migrateV1toV2(out);
  if (out.schemaVersion < 3) out = migrateV2toV3(out);
  return out;
}

function migrateV1toV2(rec) {
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
    schemaVersion: 2,
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

// ─── Migration v2 → v3 (Э3, ТЗ 4.4.7 v0.32) ───────────────────────────────────

/**
 * v2 → v3: снаряжение в записи (`equipment`), названия инструментов по dnd.su, владения оружием/доспехами расы.
 * Инвентарь собирается из `_wizardState` (старые mecCart / mecEquipMode). Стандартный набор класса до Э3 был
 * неверным (CLASS_EQUIP) и в выборы а)/б)/в) не переводится — предупреждение в migrationWarnings.
 */
function migrateV2toV3(rec) {
  const warnings = [...(rec.migrationWarnings || [])];
  const removed = new Set();
  const grants = (rec.grants || []).map(g => {
    if (g.pool !== 'tool') return g;
    if (TOOL_REMOVED.includes(g.value)) removed.add(g.value);
    return TOOL_RENAMES[g.value] ? { ...g, value: TOOL_RENAMES[g.value] } : g;
  });
  for (const v of removed) warnings.push(`инструмента «${v}» нет в таблице PHB (dnd.su) — выберите владение заново в мастере`);
  const addRace = (id, type) => {
    const extra = RACE_EQUIP_GRANTS[id];
    if (!extra) return;
    for (const [pool, vals] of Object.entries(extra)) {
      for (const value of vals) {
        if (!grants.some(g => g.pool === pool && g.value === value && g.source?.id === id)) {
          grants.push({ pool, value, source: { type, id }, level: 1, kind: 'fixed', slot: null, replaces: null });
        }
      }
    }
  };
  addRace(rec.raceId, 'race');
  addRace(rec.subraceId, 'subrace');

  const ws = rec._wizardState ? migrateWizardState(rec._wizardState) : rec._wizardState;
  let equipment = rec.equipment || null;
  if (!equipment) {
    const eq = ws?.mecEquip;
    const items = [];
    if (eq?.mode === 'purchase') items.push(...(eq.cart || []).map(e => ({ ...e, source: 'purchase' })));
    const unknown = items.filter(e => e.legacy).map(e => e.name);
    if (unknown.length) warnings.push(`предметы не найдены в каталоге PHB (оставлены как «свой предмет»): ${unknown.join(', ')}`);
    if (eq && eq.mode !== 'purchase') warnings.push('стартовое снаряжение класса нужно выбрать заново (варианты а/б/в по PHB) — откройте шаг «Снаряжение»');
    const spent = items.reduce((a, e) => a + (e.custom ? +e.custom.costGp || 0 : itemById(e.id)?.costGp || 0) * e.qty, 0);
    const gold = eq?.gold ? { ...eq.gold, spent: Math.round(spent * 100) / 100 } : null;
    const clean = items.map(({ legacy: _l, ...e }) => e);
    autoEquip(clean, equipProfs(grants), rec.stats);
    equipment = {
      mode: eq?.mode || 'standard',
      encumbrance: false,
      classChoices: {},
      gold,
      items: clean,
      coins: gold ? gpToCoins(Math.max(0, gold.total - gold.spent)) : { gp: 0, sp: 0, cp: 0 },
    };
  }
  return { ...rec, schemaVersion: 3, grants, equipment, migrationWarnings: warnings, _wizardState: ws };
}
