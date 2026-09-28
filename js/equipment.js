/**
 * HeroSummoner — снаряжение: логика без DOM (этап Э3, ТЗ 4.4.7 v0.32).
 *
 * Данные — js/data/equipment.js (генерируется tools/gen_equipment.py с dnd.su, только PHB)
 * и js/data/class_starting_equipment.js (стартовое снаряжение классов, дословно с dnd.su).
 * Здесь: разбор вариантов а)/б)/в) в предметы каталога, вложенные выборы, владения,
 * КД из надетого, вес, монеты. Используют: шаг «Снаряжение», «Финал», лист персонажа, миграция.
 */
import { ITEMS, ITEM_GROUPS, WEAPON_PROPERTIES, ARMOR_RULES } from './data/equipment.js';
import { CLASS_START_EQUIP } from './data/class_starting_equipment.js';

export { ITEMS, ITEM_GROUPS, WEAPON_PROPERTIES, ARMOR_RULES, CLASS_START_EQUIP };

const BY_ID = new Map(ITEMS.map(i => [i.id, i]));
const normName = s => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');
const BY_NAME = new Map(ITEMS.map(i => [normName(i.name), i]));

export const itemById = id => (id ? BY_ID.get(id) || null : null);
export const itemByName = name => BY_NAME.get(normName(name)) || null;

// ─── Группы для вложенного выбора ─────────────────────────────────────────────
// «любое простое оружие» = простое рукопашное + простое дальнобойное (таблица «Оружие», 96-arms).
const ids = g => ITEM_GROUPS[g]?.ids || [];
export const PICK_GROUPS = {
  simple:               { label: 'Простое оружие',             ids: [...ids('simple-melee'), ...ids('simple-ranged')] },
  martial:              { label: 'Воинское оружие',            ids: [...ids('martial-melee'), ...ids('martial-ranged')] },
  'simple-melee':       { label: 'Простое рукопашное оружие',  ids: ids('simple-melee') },
  'martial-melee':      { label: 'Воинское рукопашное оружие', ids: ids('martial-melee') },
  'musical-instrument': { label: 'Музыкальный инструмент',     ids: ids('musical-instrument') },
  'arcane-focus':       { label: 'Магическая фокусировка',     ids: ids('arcane-focus') },
  'holy-symbol':        { label: 'Священный символ',           ids: ids('holy-symbol') },
  'druidic-focus':      { label: 'Фокусировка друидов',        ids: ids('druidic-focus') },
};

/** Названия инструментов по таблице dnd.su (100-tools) — для выборов владения (Класс, Предыстория). */
export const TOOL_NAMES = {
  instrument: ids('musical-instrument').map(id => BY_ID.get(id).name),
  artisan:    ids('artisan-tools').map(id => BY_ID.get(id).name),
  gaming:     ids('gaming-set').map(id => BY_ID.get(id).name),
};

// ─── Варианты стартового снаряжения классов → предметы каталога ───────────────
// Ключ — текст варианта из CLASS_START_EQUIP (dnd.su, дословно, в нижнем регистре).
// Часть: { id, qty } — конкретный предмет; { pick, n, except } — n вложенных выборов из группы;
// req — «(если владеете)»: вариант доступен только при владении (armor:<вид> / weapon:<id>).
// «20 болтов / 20 стрел» — одна позиция таблицы «Арбалетные болты (20)» / «Стрелы (20)».
const P = (pick, n = 1, except) => ({ pick, n, ...(except ? { except } : {}) });
const I = (id, qty = 1) => ({ id, qty });
const OPTION_PARTS = {
  'лёгкий арбалет и 20 болтов':                   [I('crossbow-light'), I('crossbow-bolts-20')],
  'любое простое оружие':                         [P('simple')],
  'одно простое оружие':                          [P('simple')],
  'два простых оружия на ваш выбор':              [P('simple', 2)],
  'простое рукопашное оружие':                    [P('simple-melee')],
  'любое простое рукопашное оружие':              [P('simple-melee')],
  'два простых рукопашных оружия':                [P('simple-melee', 2)],
  'любое воинское рукопашное оружие':             [P('martial-melee')],
  'воинское оружие и щит':                        [P('martial'), I('shield')],
  'два воинских оружия':                          [P('martial', 2)],
  'мешочек с компонентами':                       [I('component-pouch')],
  'магическая фокусировка':                       [P('arcane-focus')],
  'набор исследователя подземелий':               [I('dungeoneers-pack')],
  'набор путешественника':                        [I('explorers-pack')],
  'набор учёного':                                [I('scholars-pack')],
  'набор дипломата':                              [I('diplomats-pack')],
  'набор артиста':                                [I('entertainers-pack')],
  'набор священника':                             [I('priests-pack')],
  'набор взломщика':                              [I('burglars-pack')],
  'два кинжала':                                  [I('dagger', 2)],
  'кинжал':                                       [I('dagger')],
  'кожаный доспех, любое простое оружие и два кинжала': [I('leather'), P('simple'), I('dagger', 2)],
  'боевой посох':                                 [I('quarterstaff')],
  'книга заклинаний':                             [I('spellbook')],
  'проклёпанная кожа':                            [I('studded-leather')],
  'чешуйчатый доспех':                            [I('scale-mail')],
  'кожаный доспех':                               [I('leather')],
  'воровские инструменты и набор исследователя подземелий': [I('thieves-tools'), I('dungeoneers-pack')],
  'секира':                                       [I('greataxe')],
  'два ручных топора':                            [I('handaxe', 2)],
  'набор путешественника и четыре метательных копья': [I('explorers-pack'), I('javelin', 4)],
  'рапира':                                       [I('rapier')],
  'длинный меч':                                  [I('longsword')],
  'лютня':                                        [I('lute')],
  'любой другой музыкальный инструмент':          [P('musical-instrument', 1, ['lute'])],
  'кожаный доспех и кинжал':                      [I('leather'), I('dagger')],
  'булава':                                       [I('mace')],
  'боевой молот (если владеете)':                 [I('warhammer')],
  'кольчуга (если владеете)':                     [I('chain-mail')],
  'щит и священный символ':                       [I('shield'), P('holy-symbol')],
  'деревянный щит':                               [I('shield')],
  'скимитар':                                     [I('scimitar')],
  'кожаный доспех, набор путешественника и фокусировка друидов': [I('leather'), I('explorers-pack'), P('druidic-focus')],
  'кольчуга':                                     [I('chain-mail')],
  'кожаный доспех, длинный лук и 20 стрел':       [I('leather'), I('longbow'), I('arrows-20')],
  'короткий меч':                                 [I('shortsword')],
  '10 дротиков':                                  [I('dart', 10)],
  'пять метательных копий':                       [I('javelin', 5)],
  'кольчуга и священный символ':                  [I('chain-mail'), P('holy-symbol')],
  'два коротких меча':                            [I('shortsword', 2)],
  'длинный лук и колчан с 20 стрелами':           [I('longbow'), I('quiver'), I('arrows-20')],
  'короткий лук и колчан с 20 стрелами':          [I('shortbow'), I('quiver'), I('arrows-20')],
  'кожаная броня, два кинжала, воровские инструменты': [I('leather'), I('dagger', 2), I('thieves-tools')],
};
// «(если владеете)» — PHB: вариант доступен, только если персонаж владеет предметом.
const OPTION_REQ = {
  'боевой молот (если владеете)': { weapon: 'warhammer' },
  'кольчуга (если владеете)':     { armor: 'heavy' },
};

export function optionParts(text) {
  return OPTION_PARTS[String(text || '').trim().toLowerCase()] || null;
}

/** Слоты стартового снаряжения класса: [{ text, choice, options: [{ text, parts, req }] }]. */
export function classSlots(classId) {
  const data = CLASS_START_EQUIP[classId];
  if (!data) return [];
  return data.slots.map(s => ({
    text: s.text,
    choice: !!s.choice,
    options: s.options.map(o => ({
      text: o,
      parts: optionParts(o) || [],
      req: OPTION_REQ[String(o).trim().toLowerCase()] || null,
      unknown: !optionParts(o),
    })),
  }));
}

export const classGoldText = classId => CLASS_START_EQUIP[classId]?.goldText || '';
export const classSourceUrl = classId => CLASS_START_EQUIP[classId]?.url || '';

/** «5к4 × 10 зм» / «5к4 зм» → { n, die, mult, text }. */
export function goldFormula(classId) {
  const t = CLASS_START_EQUIP[classId]?.goldFormula;
  const m = t && t.match(/(\d+)\s*к\s*(\d+)(?:\s*×\s*(\d+))?/);
  if (!m) return null;
  return { n: +m[1], die: +m[2], mult: m[3] ? +m[3] : 1, text: t.replace(/\s*зм\s*$/, '').replace(/\s*×\s*/, ' × ') };
}

export function rollGold(f, rnd = Math.random) {
  const rolls = Array.from({ length: f.n }, () => Math.floor(rnd() * f.die) + 1);
  return { formula: f.text, rolls, mult: f.mult, total: rolls.reduce((a, b) => a + b, 0) * f.mult };
}

// ─── Владения (из grants) ─────────────────────────────────────────────────────
// Значения grants — строки из данных классов/подклассов/рас («простое», «короткие мечи», «лёгкие», «щиты»).
const W = g => PICK_GROUPS[g].ids;
const WEAPON_PROF = {
  'простое': W('simple'), 'простое оружие': W('simple'), 'воинское': W('martial'), 'воинское оружие': W('martial'),
  'короткие мечи': ['shortsword'], 'короткий меч': ['shortsword'], 'длинные мечи': ['longsword'], 'длинный меч': ['longsword'],
  'рапира': ['rapier'], 'рапиры': ['rapier'], 'ручные арбалеты': ['crossbow-hand'], 'ручной арбалет': ['crossbow-hand'],
  'боевые посохи': ['quarterstaff'], 'посохи': ['quarterstaff'], 'булавы': ['mace'], 'дротики': ['dart'],
  'дубинки': ['club'], 'кинжалы': ['dagger'], 'копья': ['spear'], 'метательные копья': ['javelin'],
  'пращи': ['sling'], 'серпы': ['sickle'], 'скимитары': ['scimitar'], 'лёгкие арбалеты': ['crossbow-light'],
  'боевой топор': ['battleaxe'], 'ручной топор': ['handaxe'], 'лёгкий молот': ['light-hammer'],
  'боевой молот': ['warhammer'], 'короткий лук': ['shortbow'], 'длинный лук': ['longbow'],
};
const ARMOR_PROF = {
  'лёгкие': ['light'], 'средние': ['medium'], 'тяжёлые': ['heavy'], 'все': ['light', 'medium', 'heavy'],
  'щиты': ['shield'], 'средние (не металл)': ['medium'], 'щиты (не металл)': ['shield'],
  'лёгкие доспехи': ['light'], 'средние доспехи': ['medium'], 'тяжёлые доспехи': ['heavy'],
};
// Владения оружием/доспехами от расы (race_descriptions.js, тексты dnd.su): id расы/подрасы → значения grants.
// «Дварфийская боевая тренировка», «Владение доспехами дварфов» (горный), «Владение эльфийским оружием»
// (высший, лесной), «Владение оружием дроу».
const ELF_WEAPONS = ['длинный меч', 'короткий меч', 'короткий лук', 'длинный лук'];
export const RACE_EQUIP_GRANTS = {
  'dwarf':          { weapon: ['боевой топор', 'ручной топор', 'лёгкий молот', 'боевой молот'] },
  'dwarf-mountain': { armor: ['лёгкие', 'средние'] },
  'elf-high':       { weapon: ELF_WEAPONS },
  'elf-wood':       { weapon: ELF_WEAPONS },
  'elf-drow':       { weapon: ['рапира', 'короткий меч', 'ручной арбалет'] },
  // «Жестянщик» (dnd.su, раса «Гном», скальный): «Вы владеете ремесленными инструментами (инструменты ремонтника)» — B-11
  'gnome-rock':     { tool: ['Инструменты ремонтника'] },
};

// Старые названия инструментов в сохранённых персонажах → названия таблицы dnd.su (миграция v2 → v3).
export const TOOL_RENAMES = {
  'Рог': 'Рожок', 'Игральные кости': 'Кости', 'Три Дракона Анти': 'Ставка трех драконов',
  'Шахматы Дракона': 'Драконьи шахматы', 'Инструменты резчика': 'Инструменты резчика по дереву',
  'инструменты умельца': 'инструменты ремонтника',
};
export const TOOL_REMOVED = ['Скрипка', 'Инструменты бондаря'];

/** Владения снаряжением персонажа: { weapons:Set(id), armor:Set(light|medium|heavy|shield), tools:Set(id) }. */
export function equipProfs(grants) {
  const out = { weapons: new Set(), armor: new Set(), tools: new Set() };
  for (const g of grants || []) {
    const v = String(g.value || '').trim().toLowerCase();
    if (g.pool === 'weapon') {
      (WEAPON_PROF[v] || (itemByName(v)?.category === 'weapon' ? [itemByName(v).id] : [])).forEach(id => out.weapons.add(id));
    } else if (g.pool === 'armor') {
      (ARMOR_PROF[v] || []).forEach(a => out.armor.add(a));
    } else if (g.pool === 'tool') {
      const it = itemByName(v) || itemByName(TOOL_RENAMES[v] || '');
      if (it) out.tools.add(it.id);
    }
  }
  return out;
}

/** Владеет ли персонаж предметом (true/false), null — к предмету владение не относится. */
export function isProficient(item, profs) {
  if (!item || !profs) return null;
  if (item.category === 'weapon') return profs.weapons.has(item.id);
  if (item.category === 'armor') return profs.armor.has(item.group);
  if (item.category === 'shield') return profs.armor.has('shield');
  if (item.category === 'tool') return profs.tools.has(item.id);
  return null;
}

export function optionAllowed(opt, profs) {
  if (!opt.req) return true;
  if (opt.req.armor) return profs.armor.has(opt.req.armor);
  if (opt.req.weapon) return profs.weapons.has(opt.req.weapon);
  return true;
}

// ─── Стартовое снаряжение класса: выбор → предметы ────────────────────────────
// choices: { [slotIdx]: { option: <idx>, picks: [<item id>, …] } } — picks по порядку pick-частей варианта.

/** Сколько вложенных выборов у варианта: [{ group, except, label }] по порядку. */
export function optionPicks(opt) {
  const out = [];
  for (const p of opt.parts) {
    if (!p.pick) continue;
    for (let i = 0; i < (p.n || 1); i++) out.push({ group: p.pick, except: p.except || [], label: PICK_GROUPS[p.pick].label });
  }
  return out;
}

export function slotOption(slot, choice) {
  if (!slot.choice) return slot.options[0];
  const i = choice?.option;
  return Number.isInteger(i) && slot.options[i] ? slot.options[i] : null;
}

/** Все ли слоты класса выбраны (включая вложенные списки). */
export function classChoicesComplete(classId, choices, profs) {
  return classSlots(classId).every((slot, si) => {
    const opt = slotOption(slot, choices?.[si]);
    if (!opt || (profs && !optionAllowed(opt, profs))) return false;
    const picks = choices?.[si]?.picks || [];
    return optionPicks(opt).every((pk, i) => picks[i] && PICK_GROUPS[pk.group].ids.includes(picks[i]));
  });
}

/** Предметы снаряжения класса по выбору: [{ id, qty }] (незавершённые выборы пропускаются). */
export function classItems(classId, choices) {
  const out = [];
  classSlots(classId).forEach((slot, si) => {
    const opt = slotOption(slot, choices?.[si]);
    if (!opt) return;
    const picks = choices?.[si]?.picks || [];
    let pi = 0;
    for (const p of opt.parts) {
      if (p.id) out.push({ id: p.id, qty: p.qty || 1 });
      else if (p.pick) for (let k = 0; k < (p.n || 1); k++) { const id = picks[pi++]; if (id) out.push({ id, qty: 1 }); }
    }
  });
  return mergeItems(out);
}

export function mergeItems(list) {
  const out = [];
  for (const it of list) {
    const ex = it.id && out.find(o => o.id === it.id && o.source === it.source && !o.custom);
    if (ex) ex.qty += it.qty || 1;
    else out.push({ ...it, qty: it.qty || 1 });
  }
  return out;
}

// ─── Снаряжение предысторий: текст dnd.su → предметы каталога ────────────────
// Только там, где dnd.su прямо называет предмет таблицы снаряжения PHB. Остальное — текстом (без веса и цены).
export const BG_ITEM_REFS = {
  'Комплект обычной одежды': 'clothes-common', 'Комплект отличной одежды': 'clothes-fine',
  'Комплект дорожной одежды': 'clothes-travelers', 'Костюм': 'clothes-costume', 'Ряса': 'robes',
  'Кольцо-печатка': 'signet-ring', 'Бутылочка чернил': 'ink-1-ounce-bottle', 'Писчее перо': 'ink-pen',
  'Лопата': 'shovel', 'Железный горшок': 'pot-iron', 'Набор травника': 'herbalism-kit',
  'Набор для грима': 'disguise-kit', 'Ломик': 'crowbar', '50 футов шёлковой верёвки': 'rope-silk-50-feet',
  'Кофель-нагель (дубинка)': 'club',
};

// ─── Вес, цена, статистика ────────────────────────────────────────────────────

/** Вес одной единицы записи инвентаря (фнт.), null — неизвестен. */
export function entryUnitWeight(e) {
  if (e.custom) return Number(e.custom.weightLb) || 0;
  const it = itemById(e.id);
  return it ? it.weightLb : null;
}
export function entryUnitCost(e) {
  if (e.custom) return Number(e.custom.costGp) || 0;
  return itemById(e.id)?.costGp ?? 0;
}
export const entryName = e => e.name || itemById(e.id)?.name || '—';

export function totalWeight(entries) {
  return Math.round((entries || []).reduce((a, e) => a + (entryUnitWeight(e) || 0) * (e.qty || 1), 0) * 100) / 100;
}

/** Краткая статистика предмета для строки списка. */
export function itemStats(it) {
  if (!it) return '';
  if (it.category === 'weapon') {
    return [it.damageText && it.damageText !== '-' ? it.damageText : null, it.propertiesText || null].filter(Boolean).join(' · ');
  }
  if (it.category === 'armor') {
    return [`КД ${it.acText}`, it.strReq ? `Сил ${it.strReq}` : null, it.stealthDisadv ? 'Скрытность: помеха' : null]
      .filter(Boolean).join(' · ');
  }
  if (it.category === 'shield') return `КД ${it.acText}`;
  return '';
}

export function fmtWeight(lb) {
  if (lb == null) return '—';
  const r = Math.round(lb * 100) / 100;
  return `${String(r).replace('.', ',')} фнт.`;
}
export function fmtGp(n) {
  const r = Math.round((n || 0) * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(2).replace(/0$/, '').replace('.', ',');
}

/** Золото (зм, дробное) → монеты { gp, sp, cp }. */
export function gpToCoins(gp) {
  const cp = Math.round((gp || 0) * 100);
  return { gp: Math.floor(cp / 100), sp: Math.floor((cp % 100) / 10), cp: cp % 10 };
}
export const coinsToGp = c => (c?.gp || 0) + (c?.sp || 0) / 10 + (c?.cp || 0) / 100;
export function fmtCoins(c) {
  const parts = [];
  if (c?.gp) parts.push(`${c.gp} зм`);
  if (c?.sp) parts.push(`${c.sp} см`);
  if (c?.cp) parts.push(`${c.cp} мм`);
  return parts.join(' ') || '0 зм';
}

// ─── Надето и КД (95-armor-and-shields) ──────────────────────────────────────

const mod = s => Math.floor(((s ?? 10) - 10) / 2);

export function armorAC(it, dexMod) {
  if (!it || it.category !== 'armor') return 10 + dexMod;
  if (it.dex === 'full') return it.ac + dexMod;
  if (it.dex === 'max2') return it.ac + Math.min(dexMod, 2);
  return it.ac;
}

/** Автонадевание: лучший по КД доспех, которым персонаж владеет, и щит при владении (ТЗ 4.4.7 «Надето и КД»). */
export function autoEquip(entries, profs, stats) {
  const dexMod = mod(stats?.dex);
  let best = null, bestAc = -1;
  for (const e of entries) {
    const it = itemById(e.id);
    if (it?.category === 'armor' && !e.custom && isProficient(it, profs)) {
      const ac = armorAC(it, dexMod);
      if (ac > bestAc) { best = e; bestAc = ac; }
    }
  }
  const shield = entries.find(e => !e.custom && itemById(e.id)?.category === 'shield' && profs.armor.has('shield'));
  for (const e of entries) {
    const it = itemById(e.id);
    if (it && !e.custom && (it.category === 'armor' || it.category === 'shield')) e.equipped = e === best || e === shield;
  }
  return entries;
}

/** Надеть/снять: одновременно один доспех и один щит. */
export function setEquipped(entries, entry, on) {
  const cat = itemById(entry.id)?.category;
  if (on) for (const e of entries) if (e !== entry && itemById(e.id)?.category === cat) e.equipped = false;
  entry.equipped = !!on;
  return entries;
}

/**
 * КД из надетого: { ac, armor, shield, parts, warnings[] }.
 * Защита без доспехов Варвара/Монаха — этап «Лист» (ТЗ 4.4.7), здесь не учитывается.
 */
export function armorClass(entries, stats, profs) {
  const dexMod = mod(stats?.dex);
  const armorE = (entries || []).find(e => e.equipped && itemById(e.id)?.category === 'armor');
  const shieldE = (entries || []).find(e => e.equipped && itemById(e.id)?.category === 'shield');
  const armor = itemById(armorE?.id), shield = itemById(shieldE?.id);
  let ac = armorAC(armor, dexMod);
  if (shield) ac += shield.acBonus || 2;
  const warnings = [];
  const rules = ARMOR_RULES.rules || {};
  if (profs) {
    const noProf = [armor, shield].filter(it => it && !isProficient(it, profs));
    if (noProf.length) warnings.push({ kind: 'prof', items: noProf.map(i => i.name), text: rules['Владение доспехами'] || '' });
  }
  if (armor?.strReq && (stats?.str ?? 10) < armor.strReq) {
    warnings.push({ kind: 'str', items: [armor.name], text: rules['Тяжёлые доспехи'] || '', speed: -10 });
  }
  if (armor?.stealthDisadv) warnings.push({ kind: 'stealth', items: [armor.name], text: rules['Скрытность'] || '' });
  return { ac, armor, shield, warnings };
}

export const carryCapacity = str => (str || 10) * 15;

// ─── Металл в доспехах — для друида (B-12/B-05, решение заказчика 2026-09-28) ─────
// dnd.su, Друид → Владения: «лёгкие доспехи, средние доспехи, щиты (друиды не носят доспехи и щиты из металла)».
// Материал — по описаниям доспехов dnd.su (98/95-armor-and-shields): true — в описании прямо «металл…»;
// false — описан без металла (ткань, кожа, шкуры); null — материал в описании не указан («шипами или заклёпками»,
// «толстыми кольцами»; щит — «из дерева или металла») → «уточни у Мастера».
export const ARMOR_METAL = {
  padded: false, leather: false, hide: false,
  'studded-leather': null, 'ring-mail': null, shield: null,
  'chain-shirt': true, 'scale-mail': true, breastplate: true, 'half-plate': true,
  'chain-mail': true, splint: true, plate: true,
};
