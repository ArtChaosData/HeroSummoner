/**
 * HeroSummoner — источники заклинаний персонажа на 1 уровне (ТЗ 4.4.6: v0.23 + v0.24 + v0.29, этап Э2).
 *
 * Чистая логика без DOM: по профилю персонажа строит группы выбора/фиксированных заклинаний,
 * сгруппированные по источнику (Класс · Подкласс · Раса · Черта), считает «🔒 уже есть»,
 * чистит устаревшие выборы и проверяет, заполнены ли все счётчики.
 *
 * Выбор хранится в состоянии мастера: st.mecSpellPicks = { [group.key]: [id, …] } (id dnd.su),
 * класс для черты — st.mecSpellFeatClass = { [featId]: classId }.
 * Ключ группы включает id источника (класса, подкласса, подрасы, класса черты), поэтому смена
 * источника на предыдущих шагах автоматически «отвязывает» старый выбор.
 *
 * Правила (сверка — dnd.su, см. комментарии у таблиц):
 *   • лимиты класса — таблицы классов dnd.su (5e14), ТЗ 4.4.6 ④;
 *   • привязка «заклинание ↔ подкласс» — поле `subclasses` базы js/data/spells.js (ТЗ 4.4.6 ⑥);
 *   • что «не учитывается в количестве известных» — тексты умений подклассов (js/data/subclass_features.js,
 *     для DMG/SCAG/VRGR/DSotDQ — docs/reviews/lvl1_choices.json);
 *   • расовые заклинания — тексты черт js/data/race_descriptions.js;
 *   • черты — js/data/feats.js.
 */
import { SPELLS, getSpellById, getClassSpells, spellIdByName } from './data/spells.js';
import { CLASS_DESCRIPTIONS } from './data/class_descriptions.js';

// ─── Классы ───────────────────────────────────────────────────────────────────

/** Использование заклинаний на 1 ур. (таблицы классов dnd.su). Паладин/Следопыт — со 2 ур., их здесь нет. */
export const SPELLCASTING = {
  bard:      { type: 'known',    stat: 'cha', cantrips: 2, spells: 4 },
  wizard:    { type: 'book',     stat: 'int', cantrips: 3, spells: 6 },
  druid:     { type: 'prepared', stat: 'wis', cantrips: 2 },
  cleric:    { type: 'prepared', stat: 'wis', cantrips: 3 },
  artificer: { type: 'prepared', stat: 'int', cantrips: 2, halfLevel: true },
  warlock:   { type: 'pact',     stat: 'cha', cantrips: 2, spells: 2 },
  sorcerer:  { type: 'known',    stat: 'cha', cantrips: 4, spells: 2 },
};
/** Классы, у которых заклинания приходят на 2 уровне (PHB). */
export const LATE_CASTERS = new Set(['paladin', 'ranger']);

export const CLASS_NAME_BY_ID = Object.fromEntries(
  Object.entries(CLASS_DESCRIPTIONS).map(([name, c]) => [c.id, name]));

export const STAT_SHORT = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };
export const STAT_LABEL = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };

/** Сколько заклинаний подготовлено на 1 ур.: мод. + уровень (Изобретатель — мод. + ⌊ур./2⌋), минимум 1. */
export function preparedCount(classId, mod) {
  const cfg = SPELLCASTING[classId];
  if (!cfg) return 0;
  return Math.max(1, mod + (cfg.halfLevel ? Math.floor(1 / 2) : 1));
}

// ─── Подклассы ────────────────────────────────────────────────────────────────

/** Бонусные заговоры подкласса на выбор (не входят в лимит заговоров класса). */
const SUBCLASS_CANTRIP_CHOICES = {
  // «Послушник природы»: один заговор друида, не учитывается в количестве известных заговоров жреца.
  'cleric-nature': { count: 1, title: 'Заговор друида', filter: s => s.classes.includes('Друид') },
  // «Жнец» (DMG): один заговор некромантии из любого списка заклинаний.
  'cleric-death':  { count: 1, title: 'Заговор некромантии (любой список)',
                     filter: s => s.school === 'Некромантия' && (s.classes.length > 0 || s.classesTce.length > 0) },
  // «Посвящённый в тайны» (SCAG): два заговора волшебника, считаются заговорами жреца.
  'cleric-arcana': { count: 2, title: 'Заговоры волшебника', filter: s => s.classes.includes('Волшебник') },
};

/** Заклинания подкласса из базы (поле subclasses), уровень ≤ 1. */
function subclassDbSpells(className, subclassName) {
  return SPELLS.filter(s => s.level <= 1 && s.subclasses.some(sc => sc.class === className && sc.name === subclassName));
}

/** «Дао (Убежище; дробящий)» → «Убежище». */
const genieKindSpell = v => (String(v || '').match(/\(([^;)]+)/) || [])[1]?.trim() || null;
/** «Добро → Лечение ран» → «Лечение ран». */
const affinitySpell = v => String(v || '').split('→')[1]?.trim() || null;

/**
 * Что подкласс даёт на шаге «Заклинания».
 *   fixed      — известны сразу (не входят в лимит): [{ spell, note }]
 *   expanded   — добавляются к вариантам выбора класса (Колдун): [spell]
 *   extraList  — целый список другого класса к вариантам выбора (Божественная душа): имя класса
 *   choice     — бонусный заговор на выбор (SUBCLASS_CANTRIP_CHOICES)
 */
export function subclassSpellInfo(classId, sub, subChoices = {}) {
  const out = { fixed: [], expanded: [], extraList: null, choice: null, fixedNote: null };
  if (!sub) return out;
  const className = CLASS_NAME_BY_ID[classId];
  const db = subclassDbSpells(className, sub.name);
  if (classId === 'cleric') {
    for (const s of db) out.fixed.push({ spell: s, note: s.level === 0 ? 'бонусный заговор' : 'заклинание домена' });
    out.fixedNote = 'Заклинания домена всегда подготовлены и не входят в число подготовленных; бонусный заговор не входит в число известных.';
  } else if (classId === 'warlock') {
    const genie = sub.id === 'warlock-genie';
    const kindSpell = genie ? genieKindSpell((subChoices.genie_kind || [])[0]) : null;
    const GENIE_COMMON = 'Обнаружение зла и добра'; // общее заклинание гениев 1 круга (таблица «Расширенный список заклинаний гениев»)
    for (const s of db) {
      if (s.level === 0) out.fixed.push({ spell: s, note: 'бонусный заговор' });
      else if (!genie || s.name === GENIE_COMMON || s.name === kindSpell) out.expanded.push(s);
    }
    if (out.fixed.length) out.fixedNote = 'Эти заговоры считаются заговорами колдуна и не учитываются в числе известных.';
    if (genie && !kindSpell) out.needsKind = true;
  } else if (classId === 'sorcerer') {
    if (sub.id === 'sorcerer-divine-soul') {
      out.extraList = 'Жрец';
      const name = affinitySpell((subChoices.affinity || [])[0]);
      const s = name ? getSpellById(spellIdByName(name)) : null;
      if (s) out.fixed.push({ spell: s, note: 'склонность' });
      else out.needsAffinity = true;
      out.fixedNote = 'Заклинание склонности не учитывается в числе известных заклинаний чародея.';
    } else {
      for (const s of db) out.fixed.push({ spell: s, note: s.level === 0 ? 'заговор подкласса' : 'заклинание подкласса' });
      if (db.length) out.fixedNote = 'Считаются заклинаниями чародея и не учитываются в числе известных.';
    }
  }
  const ch = SUBCLASS_CANTRIP_CHOICES[sub.id];
  if (ch) out.choice = ch;
  return out;
}

// ─── Раса ─────────────────────────────────────────────────────────────────────

/** Фиксированные расовые заклинания (тексты черт race_descriptions.js: «Магия дроу», «Дьявольское наследие»,
 *  «Природная иллюзия»). from — уровень персонажа, с которого доступно. */
const RACE_FIXED_SPELLS = {
  'elf-drow':     { stat: 'cha', trait: 'Магия дроу',           list: [['Пляшущие огоньки', 1], ['Огонь фей', 3], ['Тьма', 5]] },
  'tiefling':     { stat: 'cha', trait: 'Дьявольское наследие', list: [['Чудотворство', 1], ['Адское возмездие', 3], ['Тьма', 5]] },
  'gnome-forest': { stat: 'int', trait: 'Природная иллюзия',    list: [['Малая иллюзия', 1]] },
};

// ─── Черты ────────────────────────────────────────────────────────────────────

/** Классы, из списков которых черты берут заклинания (feats.js: бард, волшебник, друид, жрец, колдун, чародей). */
export const FEAT_CLASSES = ['bard', 'wizard', 'druid', 'cleric', 'warlock', 'sorcerer'];
const FEAT_STAT = { bard: 'cha', warlock: 'cha', sorcerer: 'cha', wizard: 'int', druid: 'wis', cleric: 'wis' };
const SPELL_ATTACK_RE = /атак\S* заклинанием/i; // «Совершите дальнобойную/рукопашную атаку заклинанием»

export const SPELL_FEATS = {
  'magic-initiate': {
    groups: cls => [
      { part: 'cantrips', title: 'Заговоры', count: 2, filter: s => s.level === 0 && s.classes.includes(cls) },
      { part: 'spell',    title: 'Заклинание 1 уровня', count: 1, filter: s => s.level === 1 && s.classes.includes(cls),
        hint: 'Можно наложить единожды без ячейки; снова — после продолжительного отдыха.' },
    ],
  },
  'ritual-caster': {
    prereq: scores => (scores.int ?? 10) >= 13 || (scores.wis ?? 10) >= 13,
    prereqText: 'Интеллект или Мудрость 13 или выше',
    groups: cls => [
      { part: 'rituals', title: 'Ритуалы в ритуальной книге', count: 2,
        filter: s => s.level === 1 && s.ritual && s.classes.includes(cls) },
    ],
  },
  'spell-sniper': {
    groups: cls => [
      { part: 'cantrip', title: 'Заговор с броском атаки', count: 1,
        filter: s => s.level === 0 && s.classes.includes(cls) && SPELL_ATTACK_RE.test(s.description) },
    ],
  },
};

// ─── Сборка групп ─────────────────────────────────────────────────────────────

const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
const opt = (spell, tags = []) => ({ spell, tags });

function mergeOptions(lists) {
  const map = new Map();
  for (const [spells, tag] of lists) {
    for (const s of spells) {
      const t = tag ? [tag] : (s.isOptional ? ['Опц. TCE'] : []);
      if (map.has(s.id)) {
        const o = map.get(s.id);
        // базовый список важнее расширения: если заклинание есть в базовом — плашку расширения не показываем
        if (!t.length) o.tags = []; else if (o.tags.length) o.tags = [...new Set([...o.tags, ...t])];
      } else map.set(s.id, opt(getSpellById(s.id) || s, t));
    }
  }
  return [...map.values()].sort((a, b) => byName(a.spell, b.spell));
}

/**
 * profile: {
 *   classId, variant: 'phb'|'tce', subclass (объект LVL1_SUBCLASSES | null), subclassChoices,
 *   raceId, subraceId, raceLabel, raceTraits: [{ title, choice, srcType, srcId }],
 *   featIds: [], featClass: { [featId]: classId }, mods: {int,wis,cha,…}, scores: {…}
 * }
 * → { sections: [{ type, id, label, groups: [...], note?, classPicker?, warning? }], lateCaster }
 *
 * group: { key, title, kind: 'choice'|'fixed', count?, options?, fixed?, hint?, fromGroup?, grant: { srcType, srcId, slot } }
 */
export function buildSpellSections(p) {
  const sections = [];
  const classId = p.classId;
  const className = CLASS_NAME_BY_ID[classId];
  const cfg = SPELLCASTING[classId];
  const sub = p.subclass || null;
  const subInfo = subclassSpellInfo(classId, sub, p.subclassChoices || {});

  // ── Класс
  if (cfg) {
    const tce = p.variant === 'tce';
    const listFor = lvl => mergeOptions([
      [getClassSpells(className, lvl, { includeTce: tce }), null],
      [subInfo.expanded.filter(s => s.level === lvl), 'Покровитель'],
      ...(subInfo.extraList ? [[getClassSpells(subInfo.extraList, lvl), 'Список жреца']] : []),
    ]);
    const g = [];
    const src = { srcType: 'class', srcId: classId };
    g.push({ key: `class:${classId}:cantrips`, title: 'Заговоры', kind: 'choice', count: cfg.cantrips,
             options: listFor(0), grant: { ...src, slot: 'cantrips' } });
    const mod = p.mods?.[cfg.stat] ?? 0;
    if (cfg.type === 'book') {
      const prep = preparedCount(classId, mod);
      g.push({ key: `class:${classId}:book`, title: 'Книга заклинаний', kind: 'choice', count: cfg.spells,
               options: listFor(1), grant: { ...src, slot: 'spellbook' },
               hint: 'Шесть заклинаний волшебника 1-го уровня в вашей книге.' });
      g.push({ key: `class:${classId}:prepared`, title: 'Подготовленные', kind: 'choice', count: prep,
               fromGroup: `class:${classId}:book`, grant: { ...src, slot: 'prepared' },
               formula: `${STAT_SHORT[cfg.stat]} ${signed(mod)} + уровень 1 = ${prep}`,
               hint: 'Выбираются из заклинаний в книге.' });
    } else if (cfg.type === 'prepared') {
      const prep = preparedCount(classId, mod);
      g.push({ key: `class:${classId}:prepared`, title: 'Подготовленные заклинания 1 уровня', kind: 'choice', count: prep,
               options: listFor(1), grant: { ...src, slot: 'prepared' },
               formula: cfg.halfLevel
                 ? `${STAT_SHORT[cfg.stat]} ${signed(mod)} + ½ уровня (вниз) 0 = ${prep}`
                 : `${STAT_SHORT[cfg.stat]} ${signed(mod)} + уровень 1 = ${prep}`,
               hint: 'После продолжительного отдыха набор можно поменять из полного списка класса.' });
    } else {
      g.push({ key: `class:${classId}:spells`, title: 'Известные заклинания 1 уровня', kind: 'choice', count: cfg.spells,
               options: listFor(1), grant: { ...src, slot: 'spells' } });
    }
    sections.push({ type: 'class', id: classId, label: `Класс — ${className}`, stat: cfg.stat, cfg, groups: g });
  }

  // ── Подкласс
  if (cfg && sub) {
    const g = [];
    const src = { srcType: 'subclass', srcId: sub.id };
    if (subInfo.fixed.length) {
      g.push({ key: `subclass:${sub.id}:fixed`, title: classId === 'cleric' ? 'Заклинания домена' : 'Известны сразу',
               kind: 'fixed', fixed: subInfo.fixed.map(f => ({ spell: f.spell, from: 1, note: f.note })),
               hint: subInfo.fixedNote, grant: src });
    }
    if (subInfo.choice) {
      const c = subInfo.choice;
      g.push({ key: `subclass:${sub.id}:cantrips`, title: c.title, kind: 'choice', count: c.count,
               options: SPELLS.filter(s => s.level === 0 && c.filter(s)).map(s => opt(s)).sort((a, b) => byName(a.spell, b.spell)),
               hint: 'Бонусный заговор — не входит в число известных заговоров класса.', grant: { ...src, slot: 'subclass_cantrips' } });
    }
    const notes = [];
    if (subInfo.expanded.length) notes.push(`Расширенный список покровителя добавлен к выбору класса: ${subInfo.expanded.map(s => s.name).join(', ')} (плашка «Покровитель»).`);
    if (subInfo.extraList) notes.push('Заговоры и заклинания чародея можно выбирать и из списка жреца (плашка «Список жреца»).');
    if (subInfo.needsKind) notes.push('Выберите вид гения на шаге «Класс» — от него зависит расширенный список.');
    if (subInfo.needsAffinity) notes.push('Выберите склонность на шаге «Класс» — она даёт заклинание.');
    if (g.length || notes.length) sections.push({ type: 'subclass', id: sub.id, label: `Подкласс — ${sub.name}`, groups: g, notes,
      invalid: !!(subInfo.needsKind || subInfo.needsAffinity) });
  }

  // ── Раса
  {
    const g = [];
    const fixedKey = p.subraceId && RACE_FIXED_SPELLS[p.subraceId] ? p.subraceId : p.raceId;
    const rf = RACE_FIXED_SPELLS[fixedKey];
    if (rf) {
      g.push({ key: `race:${fixedKey}:fixed`, title: rf.trait, kind: 'fixed',
               fixed: rf.list.map(([n, from]) => ({ spell: getSpellById(spellIdByName(n)), from })).filter(f => f.spell),
               hint: `Базовая характеристика — ${STAT_LABEL[rf.stat]}.`,
               grant: { srcType: fixedKey === p.raceId ? 'race' : 'subrace', srcId: fixedKey } });
    }
    for (const t of p.raceTraits || []) {
      if (t.choice?.type !== 'spell') continue;
      const ids = (t.choice.list || []).map(spellIdByName).filter(id => id !== undefined);
      g.push({ key: `race:${t.srcId}:${t.title}`, title: t.title, kind: 'choice', count: t.choice.count || 1,
               options: ids.map(id => opt(getSpellById(id))).sort((a, b) => byName(a.spell, b.spell)),
               hint: t.text || null, grant: { srcType: t.srcType, srcId: t.srcId, slot: t.title } });
    }
    if (g.length) sections.push({ type: 'race', id: fixedKey || p.raceId, label: `Раса — ${p.raceLabel || ''}`.trim(), groups: g });
  }

  // ── Черты
  for (const featId of p.featIds || []) {
    const def = SPELL_FEATS[featId];
    if (!def) continue;
    const cls = (p.featClass || {})[featId] || null;
    const clsName = cls ? CLASS_NAME_BY_ID[cls] : null;
    const g = cls ? def.groups(clsName).map(d => ({
      key: `feat:${featId}:${cls}:${d.part}`, title: d.title, kind: 'choice', count: d.count, hint: d.hint || null,
      options: SPELLS.filter(d.filter).map(s => opt(s)).sort((a, b) => byName(a.spell, b.spell)),
      grant: { srcType: 'feat', srcId: featId, slot: `${featId}:${d.part}` },
    })) : [];
    const warning = def.prereq && p.scores && !def.prereq(p.scores) ? `Требование черты: ${def.prereqText}.` : null;
    sections.push({ type: 'feat', id: featId, label: `Черта — ${p.featNames?.[featId] || featId}`, groups: g, warning,
      classPicker: { featId, value: cls, options: FEAT_CLASSES.map(id => ({ id, name: CLASS_NAME_BY_ID[id] })),
                     stat: cls ? FEAT_STAT[cls] : null } });
  }

  return { sections, lateCaster: LATE_CASTERS.has(classId) };
}

const signed = n => (n >= 0 ? '+' : '−') + Math.abs(n);

// ─── Выбор: «уже есть», чистка, проверка ─────────────────────────────────────

const allGroups = res => res.sections.flatMap(s => s.groups);

/** Опции группы с учётом «из книги» (подготовленные волшебника берутся из выбранных в книге). */
export function groupOptions(group, picks) {
  if (!group.fromGroup) return group.options || [];
  return (picks[group.fromGroup] || []).map(id => getSpellById(id)).filter(Boolean).sort(byName).map(s => opt(s));
}

/**
 * Кто уже дал заклинание: Map id → { key, label }. Фиксированные (доступные с 1 ур.) — первыми,
 * затем выборы в порядке групп. Подготовленные из книги не считаются новым источником.
 */
export function takenMap(res, picks) {
  const m = new Map();
  for (const sec of res.sections) for (const g of sec.groups) {
    if (g.kind !== 'fixed') continue;
    for (const f of g.fixed) if (f.from <= 1 && !m.has(f.spell.id)) m.set(f.spell.id, { key: g.key, label: sec.label.split(' — ').pop() });
  }
  for (const sec of res.sections) for (const g of sec.groups) {
    if (g.kind !== 'choice' || g.fromGroup) continue;
    for (const id of picks[g.key] || []) if (!m.has(id)) m.set(id, { key: g.key, label: sec.label.split(' — ').pop() });
  }
  return m;
}

/** Удаляет недопустимые выборы (нет в вариантах, дубль с другим источником, сверх лимита). Возвращает новый picks. */
export function prunePicks(res, picks) {
  const out = {};
  const seen = new Map();
  for (const sec of res.sections) for (const g of sec.groups) {
    if (g.kind === 'fixed') for (const f of g.fixed) if (f.from <= 1) seen.set(f.spell.id, g.key);
  }
  for (const g of allGroups(res)) {
    if (g.kind !== 'choice') continue;
    const allowed = new Set(groupOptions(g, out).map(o => o.spell.id));
    const kept = [];
    for (const id of picks[g.key] || []) {
      if (!allowed.has(id) || kept.includes(id)) continue;
      if (!g.fromGroup && seen.has(id) && seen.get(id) !== g.key) continue;
      if (kept.length >= g.count) break;
      kept.push(id);
      if (!g.fromGroup) seen.set(id, g.key);
    }
    if (kept.length) out[g.key] = kept;
  }
  return out;
}

/** Сколько нужно выбрать в группе (если вариантов меньше лимита — все доступные). */
export function groupNeed(g, picks, taken) {
  if (g.fromGroup) return g.count;            // подготовленные из книги: лимит не меньше, чем заклинаний в книге (6)
  const opts = groupOptions(g, picks).filter(o => !taken || !taken.has(o.spell.id) || taken.get(o.spell.id).key === g.key || g.fromGroup);
  return Math.min(g.count, opts.length);
}

/** Незаполненные группы: [{ section, group, have, need }]. Пустой массив — шаг пройден. */
export function missingPicks(res, picks) {
  const taken = takenMap(res, picks);
  const out = [];
  for (const sec of res.sections) {
    if (sec.classPicker && !sec.classPicker.value) out.push({ section: sec, group: null, have: 0, need: 1 });
    if (sec.invalid) out.push({ section: sec, group: null, have: 0, need: 1 });
    for (const g of sec.groups) {
      if (g.kind !== 'choice') continue;
      const need = groupNeed(g, picks, taken), have = (picks[g.key] || []).length;
      if (have < need) out.push({ section: sec, group: g, have, need });
    }
  }
  return out;
}

/** Записи grants (без функции grant(), чтобы модуль не зависел от character.js): [{ pool, value, sourceType, sourceId, opts }]. */
export function spellGrantSpecs(res, picks) {
  const out = [];
  for (const sec of res.sections) {
    if (sec.classPicker?.value) {
      out.push({ pool: 'feature', value: `${sec.label.split(' — ').pop()}: класс ${CLASS_NAME_BY_ID[sec.classPicker.value]}`,
                 sourceType: 'feat', sourceId: sec.id, opts: { kind: 'choice', slot: `${sec.id}:class` } });
    }
    for (const g of sec.groups) {
      if (g.kind === 'fixed') {
        for (const f of g.fixed) if (f.from <= 1) out.push({ pool: 'spell', value: f.spell.id, sourceType: g.grant.srcType, sourceId: g.grant.srcId, opts: {} });
      } else {
        for (const id of picks[g.key] || []) out.push({ pool: 'spell', value: id, sourceType: g.grant.srcType, sourceId: g.grant.srcId,
                                                       opts: { kind: 'choice', slot: g.grant.slot } });
      }
    }
  }
  return out;
}

/** Есть ли у персонажа хоть один источник заклинаний на 1 ур. (шаг виден). */
export const hasSpellSources = res => res.sections.length > 0;

// ─── Миграция черновиков до Э2 (выбор по названиям) ──────────────────────────

const OLD_KEYS = ['mecSpellsCantrips', 'mecSpellsLevel1', 'mecSpellsBook', 'mecSpellsPrepared'];

export function migrateSpellState(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  const hasOld = OLD_KEYS.some(k => Array.isArray(ws[k]) && ws[k].length);
  const raceName = typeof ws.mecRace === 'string' ? ws.mecRace.split('::').slice(1).join('::') : '';
  const heCantrip = raceName === 'Эльф' && ws.mecSubrace === 'Высший' && (ws.mecRaceChoices || {})['Заговор'];
  if (!hasOld && !heCantrip) { OLD_KEYS.forEach(k => { if (k in ws) delete ws[k]; }); return ws; }
  const ids = names => (names || []).map(n => typeof n === 'number' ? n : spellIdByName(n)).filter(id => id !== undefined);
  const picks = { ...(ws.mecSpellPicks || {}) };
  const cls = ws.mecClass;
  const cfg = SPELLCASTING[cls];
  if (cls && cfg && hasOld) {
    const put = (part, names) => { const v = ids(names); if (v.length && !picks[`class:${cls}:${part}`]) picks[`class:${cls}:${part}`] = v; };
    put('cantrips', ws.mecSpellsCantrips);
    if (cfg.type === 'book') { put('book', ws.mecSpellsBook); put('prepared', ws.mecSpellsPrepared); }
    else if (cfg.type === 'prepared') put('prepared', ws.mecSpellsLevel1);
    else put('spells', ws.mecSpellsLevel1);
  }
  if (heCantrip) {
    const v = ids(heCantrip);
    if (v.length && !picks['race:elf-high:Заговор']) picks['race:elf-high:Заговор'] = v;
    const rc = { ...ws.mecRaceChoices }; delete rc['Заговор']; ws.mecRaceChoices = rc;
  }
  OLD_KEYS.forEach(k => delete ws[k]);
  ws.mecSpellPicks = picks;
  return ws;
}
