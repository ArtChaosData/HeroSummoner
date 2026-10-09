/**
 * HeroSummoner — механика черт альтернативного человека (П9, ТЗ 4.4.3 ⑤а, B-17 / B-18 / B-40).
 * Группы Г0–Г4 отчёта эксперта (`docs/reviews/2026-09-29_expert-feats-mechanics.md`):
 *   Г0 требования (предупреждение, не запрет), Г1 фиксированная +1, Г2 +1 на выбор, Г3 владения без выбора,
 *   Г4 числа (скорость, пассивные). Г5–Г7 — П10.
 * Каждое правило — с дословной цитатой dnd.su из js/data/feats.js (`quote`); сверка: node tools/check_feat_mech.mjs.
 * Без DOM: используется мастером (create-new.js) и общим расчётом (derive.js).
 */
import { FEATS } from './data/feats.js';

export const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABIL_NAME = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
/** Винительный падеж — «доведите Силу до 13». */
export const ABIL_ACC = { str: 'Силу', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизму' };
/** Дательный — «+1 к Силе». */
export const ABIL_DAT = { str: 'Силе', dex: 'Ловкости', con: 'Телосложению', int: 'Интеллекту', wis: 'Мудрости', cha: 'Харизме' };

/**
 * asi:  { fixed: 'cha' } | { choice: ['str','dex'] }   — +1 при максимуме 20
 * saveFromAsi: true — владение спасброском выбранной характеристики (Устойчивый)
 * armor / weapon: значения пулов grants (как у классов: 'лёгкие', 'средние', 'щиты', 'тяжёлые')
 * speed: +N фт.; passive: { perception: +N, investigation: +N }
 */
export const FEAT_MECH = {
  'actor':              { asi: { fixed: 'cha' }, quote: 'Увеличьте значение Харизмы на 1 при максимуме 20.' },
  'athlete':            { asi: { choice: ['str', 'dex'] }, quote: 'Увеличьте значение Силы или Ловкости на 1 при максимуме 20.' },
  'observant':          { asi: { choice: ['int', 'wis'] }, passive: { perception: 5, investigation: 5 },
    quote: 'Увеличьте значение Интеллекта или Мудрости на 1 при максимуме 20.',
    quote2: 'Вы получаете бонус +5 к пассивной проверке Мудрости (Восприятие) и пассивной проверке Интеллекта (Расследование).' },
  'tavern-brawler':     { asi: { choice: ['str', 'con'] }, weapon: ['импровизированное оружие'],
    quote: 'Увеличьте значение Силы или Телосложения на 1 при максимуме 20.', quote2: 'Вы получаете владение импровизированным оружием.' },
  'lightly-armored':    { asi: { choice: ['str', 'dex'] }, armor: ['лёгкие'],
    quote: 'Увеличьте значение Силы или Ловкости на 1 при максимуме 20.', quote2: 'Вы получаете владение лёгкими доспехами.' },
  'moderately-armored': { asi: { choice: ['str', 'dex'] }, armor: ['средние', 'щиты'],
    quote: 'Увеличьте значение Силы или Ловкости на 1 при максимуме 20.', quote2: 'Вы получаете владение средними доспехами и щитами.' },
  'heavily-armored':    { asi: { fixed: 'str' }, armor: ['тяжёлые'],
    quote: 'Увеличьте значение Силы на 1 при максимуме 20.', quote2: 'Вы получаете владение тяжёлыми доспехами.' },
  'weapon-master':      { asi: { choice: ['str', 'dex'] }, quote: 'Увеличьте значение Силы или Ловкости на 1 при максимуме 20.' }, // 4 вида оружия — П10
  'heavy-armor-master': { asi: { fixed: 'str' }, quote: 'Увеличьте значение Силы на 1 при максимуме 20.' },
  'keen-mind':          { asi: { fixed: 'int' }, quote: 'Увеличьте значение Интеллекта на 1 при максимуме 20.' },
  'durable':            { asi: { fixed: 'con' }, quote: 'Увеличьте значение Телосложения на 1 при максимуме 20.' },
  'resilient':          { asi: { choice: ABIL }, saveFromAsi: true,
    quote: 'Увеличьте значение выбранной характеристики на 1 при максимуме 20.', quote2: 'Вы получаете владение спасбросками этой характеристики.' },
  'linguist':           { asi: { fixed: 'int' }, quote: 'Увеличьте значение Интеллекта на 1 при максимуме 20.' }, // 3 языка — П10
  'mobile':             { speed: 10, quote: 'Ваша скорость увеличивается на 10 футов.' },
};

export const featById = id => FEATS.find(f => f.id === id) || null;

/**
 * Требование черты (dnd.su, поле prerequisite) → { kind: 'ability'|'armor'|'spell', text, abilities?, min?, armor? }.
 * «Интеллект или Мудрость 13 или выше» → abilities: ['int','wis'], min: 13.
 */
export function featRequirement(feat) {
  const text = feat?.prerequisite;
  if (!text) return null;
  const m = text.match(/^(.+?) (\d+) или выше$/);
  if (m) {
    const abilities = m[1].split(' или ').map(n => ABIL.find(k => ABIL_NAME[k] === n.trim())).filter(Boolean);
    if (abilities.length) return { kind: 'ability', text, abilities, min: +m[2] };
  }
  const a = text.match(/^Владение (лёгкими|средними|тяжёлыми) доспехами$/);
  if (a) return { kind: 'armor', text, armor: { 'лёгкими': 'light', 'средними': 'medium', 'тяжёлыми': 'heavy' }[a[1]] };
  if (/накладывать хотя бы одно заклинание/.test(text)) return { kind: 'spell', text };
  return { kind: 'other', text };
}

/**
 * B-40: требование не выполнено → строка предупреждения, иначе null.
 * ctx: { scores } (с расовыми бонусами, без +1 самой черты — решение 2026-10-09), { armor: Set('light'|…) } (без владений самой черты),
 *      { canCast } (заклинания класса на 1 ур.). null в поле — ещё неизвестно (шаг не пройден) → не предупреждаем.
 */
export function featRequirementWarning(feat, ctx = {}) {
  const r = featRequirement(feat);
  if (!r) return null;
  if (r.kind === 'ability') {
    if (!ctx.scores) return null;
    const best = Math.max(...r.abilities.map(k => ctx.scores[k] ?? 0));
    if (best >= r.min) return null;
    const what = r.abilities.map(k => ABIL_ACC[k]).join(' или ');
    const now = r.abilities.map(k => `${ABIL_NAME[k]} ${ctx.scores[k] ?? '—'}`).join(', ');
    return `Черта «${feat.name}» требует «${r.text}» — доведите ${what} до ${r.min} (сейчас: ${now}).`;
  }
  if (r.kind === 'armor') {
    if (!ctx.armor || ctx.armor.has(r.armor)) return null;
    return `Черта «${feat.name}» требует «${r.text}» — у персонажа этого владения нет.`;
  }
  if (r.kind === 'spell') {
    if (ctx.canCast == null || ctx.canCast) return null;
    return `Черта «${feat.name}» требует «${r.text}» — у класса на 1-м уровне заклинаний нет.`;
  }
  return null;
}

/** +1 от черт: { [ability]: N }. picks — { [featId]: ability } для черт с выбором; base — значения до черт (максимум 20). */
export function featAsiMap(featIds, picks = {}, base = {}) {
  const out = {};
  for (const id of featIds || []) {
    const a = FEAT_MECH[id]?.asi;
    const k = a?.fixed || (a?.choice && a.choice.includes(picks[id]) ? picks[id] : null);
    if (!k) continue;
    const cur = (base[k] ?? 10) + (out[k] || 0);
    if (cur < 20) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Черты, у которых +1 надо выбрать, и выбор не сделан. */
export const featAsiMissing = (featIds, picks = {}) =>
  (featIds || []).filter(id => FEAT_MECH[id]?.asi?.choice && !FEAT_MECH[id].asi.choice.includes(picks[id]));

/** Скорость +N и пассивные от черт. */
export const featSpeedBonus = featIds => (featIds || []).reduce((s, id) => s + (FEAT_MECH[id]?.speed || 0), 0);
export const featPassive = (featIds, kind) => (featIds || []).reduce((s, id) => s + (FEAT_MECH[id]?.passive?.[kind] || 0), 0);

// ── П10 (ТЗ 4.4.3 ⑤а, п. 3–5): выборы внутри черт. Состояние мастера: st.mecFeatChoices[featId] ──
/**
 * languages: N языков (Языковед) · weapons: N видов простого/воинского оружия (Мастер оружия)
 * skillsOrTools: N навыков или инструментов в любом сочетании (Одарённый) — значения 'skill::X' / 'tool::X'
 * maneuvers: N приёмов «мастера боевых искусств» + dcStat (СИЛ/ЛОВ) (Воинский адепт)
 * damage: вид урона (Стихийный адепт)
 */
export const FEAT_CHOICES = {
  'linguist':        { languages: 3, quote: 'Вы узнаёте три языка на свой выбор.' },
  'weapon-master':   { weapons: 4, quote: 'Вы получаете владение четырьмя выбранными видами оружия. Выбранное оружие должно быть или простым, или воинским.' },
  'skilled':         { skillsOrTools: 3, quote: 'Вы получаете владение любой комбинацией из трёх навыков или инструментов на ваш выбор.' },
  'martial-adept':   { maneuvers: 2, dcStat: ['str', 'dex'], quote: 'Вы узнаёте два приёма на свой выбор из списка архетипа воина «мастер боевых искусств».',
    quote2: 'Сл спасброска равна 8 + ваш бонус мастерства + модификатор Силы или Ловкости (на ваш выбор).' },
  'elemental-adept': { damage: ['звук', 'кислота', 'огонь', 'холод', 'электричество'],
    quote: 'выберите один из видов урона: звук, кислота, огонь, холод или электричество.' },
};
/** Мастер средних доспехов (Г6, решение 2026-10-09 — в КД). */
export const MEDIUM_ARMOR_MASTER = {
  quote: 'Когда вы носите средний доспех, вы можете добавлять к КД 3, а не 2, если ваша Ловкость 16 или выше.',
  quote2: 'Ношение среднего доспеха не накладывает помеху к проверкам Ловкости (Скрытность).',
};

/** Чего не хватает в выборах черты: [строка] (пусто — всё выбрано). */
export function featChoiceMissing(id, ch = {}) {
  const c = FEAT_CHOICES[id];
  if (!c) return [];
  const n = arr => (arr || []).filter(Boolean).length;
  const out = [];
  if (c.languages && n(ch.languages) < c.languages) out.push(`языки (${n(ch.languages)}/${c.languages})`);
  if (c.weapons && n(ch.weapons) < c.weapons) out.push(`оружие (${n(ch.weapons)}/${c.weapons})`);
  if (c.skillsOrTools && n(ch.skillsOrTools) < c.skillsOrTools) out.push(`навыки или инструменты (${n(ch.skillsOrTools)}/${c.skillsOrTools})`);
  if (c.maneuvers && n(ch.maneuvers) < c.maneuvers) out.push(`приёмы (${n(ch.maneuvers)}/${c.maneuvers})`);
  if (c.dcStat && !c.dcStat.includes(ch.dcStat)) out.push('характеристику для Сл приёмов');
  if (c.damage && !c.damage.includes(ch.damage)) out.push('вид урона');
  return out;
}
