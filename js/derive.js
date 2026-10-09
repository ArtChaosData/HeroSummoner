/**
 * HeroSummoner — общий расчёт персонажа (П2, ТЗ v0.51; план работ, решение Совета 2026-09-29).
 * Одна функция на число — её читают и «Финал» мастера, и лист персонажа, поэтому они совпадают по построению.
 *
 *   armorClassFor(ctx)  — КД с умениями класса 1 ур. (доспех/щит, «Оборона», ЗбД Варвара и Монаха,
 *                         «Драконья устойчивость») + ⚠️ «КД в доспехе N, без доспеха было бы M» (B-35)
 *   speedFor(ctx)       — скорость из расы/подрасы, −10 фт. без Силы для тяжёлого доспеха (кроме дварфа, B-27)
 *   deriveCharacter(rec)— всё для листа по записи персонажа (B-04, B-05)
 *
 * ctx: { classId, subclassId, fightingStyle, items, stats, profs, raceName, subraceName }.
 * Тексты умений — дословно dnd.su (как было в create-new.js, v0.39).
 */
import { armorClass, itemById, equipProfs } from './equipment.js';
import { RACE_DESCRIPTIONS } from './data/race_descriptions.js';
import { featSpeedBonus } from './feats-mech.js';

const mod = s => Math.floor(((s ?? 10) - 10) / 2);
const signNum = n => (n >= 0 ? `+${n}` : `${n}`);

/** Описание расы по названию (как в мастере: «… (Чистокровный)», уточнение в скобках). */
export function raceDescFor(raceName) {
  if (!raceName) return null;
  return RACE_DESCRIPTIONS[raceName]
    || RACE_DESCRIPTIONS[raceName.replace(' (Чистокровный)', '')]
    || RACE_DESCRIPTIONS[raceName.replace(/\s*\([^)]+\)$/, '')] || null;
}
function subraceInfo(desc, subraceName) {
  if (!desc || !subraceName) return null;
  return (desc.subraces || []).find(sd => sd.name === subraceName || sd.name.includes(subraceName) || subraceName.includes(sd.name.split(' ')[0])) || null;
}

/** КД без сравнения «без доспеха» (B-35). */
function armorClassRaw({ classId, subclassId, fightingStyle, items, stats, profs }) {
  const acBase = armorClass(items, stats, profs);
  const st = stats || {};
  const dexM = mod(st.dex), conM = mod(st.con), wisM = mod(st.wis);
  const sh = acBase.shield ? 2 : 0;
  const shTxt = sh ? ' + щит (+2)' : '';
  if (acBase.armor) {
    const r = { ac: acBase.ac, how: `${acBase.armor.name}${acBase.mamBonus ? ' + «Мастер средних доспехов» (+1)' : ''}${shTxt}`, src: 'Доспех надет — умения «без доспехов» не действуют.', base: acBase };
    if (acBase.mamBonus) r.src += ' «Мастер средних доспехов»: «Когда вы носите средний доспех, вы можете добавлять к КД 3, а не 2, если ваша Ловкость 16 или выше.»';
    if (fightingStyle === 'Оборона') {
      r.ac += 1; r.how += ' + «Оборона» (+1)';
      r.src += ' Боевой стиль «Оборона»: «Пока вы носите доспехи, вы получаете бонус +1 к КД».';
    }
    return r;
  }
  const opts = [{ ac: 10 + dexM + sh, how: `10 + ЛОВ (${signNum(dexM)})${shTxt}`, src: 'Без доспеха.' }];
  if (classId === 'barbarian') opts.push({ ac: 10 + dexM + conM + sh, how: `10 + ЛОВ (${signNum(dexM)}) + ТЕЛ (${signNum(conM)})${shTxt}`,
    src: '«Защита без доспехов» (Варвар): «Если вы не носите доспехов, ваш Класс Доспеха равен 10 + модификатор Ловкости + модификатор Телосложения. Вы можете использовать щит, не теряя этого преимущества.»' });
  if (classId === 'monk' && !acBase.shield) opts.push({ ac: 10 + dexM + wisM, how: `10 + ЛОВ (${signNum(dexM)}) + МДР (${signNum(wisM)})`,
    src: '«Защита без доспехов» (Монах): «Если вы не носите ни доспех, ни щит, ваш Класс Доспеха равен 10 + модификатор Ловкости + модификатор Мудрости.»' });
  if (subclassId === 'sorcerer-draconic') opts.push({ ac: 13 + dexM + sh, how: `13 + ЛОВ (${signNum(dexM)})${shTxt}`,
    src: '«Драконья устойчивость»: «Если вы не носите доспехов, ваш Класс Доспеха равен 13 + модификатор Ловкости.»' });
  return { ...opts.reduce((best, o) => (o.ac > best.ac ? o : best)), base: acBase };
}

/**
 * КД → { ac, how, src, base } (base — armorClass(): доспех, щит, предупреждения).
 * noCompare — без ⚠️ «без доспеха было бы выше» (для перебора автонадевания).
 */
export function armorClassFor(ctx, { noCompare = false } = {}) {
  const r = armorClassRaw(ctx);
  if (noCompare || !(r.base.armor || r.base.shield)) return r;
  const cat = e => (e.custom ? null : itemById(e.id)?.category);
  const without = cats => armorClassRaw({ ...ctx, items: (ctx.items || []).map(e => (cats.includes(cat(e)) ? { ...e, equipped: false } : e)) });
  const variants = [];
  if (r.base.armor) variants.push({ cats: ['armor'], label: 'без доспеха' });
  if (r.base.shield) variants.push({ cats: ['shield'], label: 'без щита' });
  if (r.base.armor && r.base.shield) variants.push({ cats: ['armor', 'shield'], label: 'без доспеха и щита' });
  let best = null;
  for (const v of variants) { const c = without(v.cats); if (!best || c.ac > best.c.ac) best = { ...v, c }; }
  if (best && best.c.ac > r.ac) {
    const worn = [r.base.armor ? 'в доспехе' : null, r.base.shield ? 'со щитом' : null].filter(Boolean).join(' и ');
    r.base = { ...r.base, warnings: [...r.base.warnings, { kind: 'ac-lower', items: [],
      text: `⚠️ КД ${worn} ${r.ac}, ${best.label} было бы ${best.c.ac}. ${best.c.src}` }] };
  }
  return r;
}

/**
 * Скорость → { value, base, penalty, note }: раса/подраса (dnd.su), −10 фт., если не хватает Силы для надетого
 * тяжёлого доспеха (кроме расы с «Ношение тяжёлых доспехов не снижает вашу скорость» — дварф, B-27).
 */
export function speedFor({ raceName, subraceName, items, stats, profs, feats = [] }) {
  const desc = raceDescFor(raceName);
  let base = desc?.speed || 30;
  const sub = subraceInfo(desc, subraceName);
  if (sub?.speed) base = sub.speed;
  const heavyIgnored = (desc?.traits || []).some(t => /не снижает вашу скорость/.test(t.text || ''));
  const armor = armorClass(items, stats, profs).armor;
  const short = !!(armor?.strReq && (stats?.str ?? 10) < armor.strReq);
  const penalty = short && !heavyIgnored;
  const featBonus = featSpeedBonus(feats); // П9: «Подвижный» — «Ваша скорость увеличивается на 10 футов.»
  const note = `Из расы: ${base} фт.${penalty ? ' −10 фт.: не хватает Силы для надетого тяжёлого доспеха.' : ''}`
    + (short && heavyIgnored ? ' Ношение тяжёлых доспехов не снижает вашу скорость.' : '')
    + (featBonus ? ` +${featBonus} фт.: «Подвижный» — «Ваша скорость увеличивается на 10 футов.»` : '');
  return { value: (penalty ? base - 10 : base) + featBonus, base, penalty, note };
}

/** Боевой стиль из реестра (слот fighting_style). */
const fightingStyleOf = grants => (grants || []).find(g => g.slot === 'fighting_style')?.value || null;

/**
 * Числа листа по записи персонажа (B-04, B-05): { ac, speed, initiative, pb }.
 * ac/speed — те же функции, что на «Финале» мастера.
 */
export function deriveCharacter(record) {
  if (!record) return null;
  const items = record.equipment?.items || [];
  const stats = record.stats || {};
  const profs = equipProfs(record.grants);
  const ctx = {
    classId: record.classId, subclassId: record.subclassId, fightingStyle: fightingStyleOf(record.grants),
    items, stats, profs, raceName: record.labels?.race || null, subraceName: record.labels?.subrace || null,
    feats: (record.grants || []).filter(g => g.pool === 'feat').map(g => g.value), // П9
  };
  const alert = (record.grants || []).some(g => g.pool === 'feat' && g.value === 'alert');
  const level = record.level || (record.levels || []).length || 1;
  return {
    ac: armorClassFor(ctx),
    speed: speedFor(ctx),
    initiative: { value: mod(stats.dex) + (alert ? 5 : 0), alert },
    pb: Math.ceil(level / 4) + 1,
    ctx,
  };
}

/**
 * B-32/B-24: подписи «Финала» и листа.
 * raceLabel: полное название подрасы («Холмовой дварф», «Тёмный эльф (дроу)»), у драконорождённого — «Драконорождённый · <цвет>».
 * classLabel: «Жрец · Домен войны».
 */
export function subraceFullName(subraceName, raceName) {
  if (!subraceName) return raceName || '';
  if (!raceName) return subraceName;
  const stem = raceName.toLowerCase().replace(/\s*\(.*\)$/, '');
  return subraceName.toLowerCase().includes(stem) ? subraceName : `${subraceName} ${stem}`;
}
export function raceLabel(raceName, subraceName, dragonAncestry = null) {
  if (!raceName) return null;
  const base = raceName.replace(' (Чистокровный)', '');
  return subraceName ? subraceFullName(subraceName, base) : dragonAncestry ? `${base} · ${dragonAncestry}` : base;
}
export const classLabel = (className, subclassName) => [className, subclassName].filter(Boolean).join(' · ') || null;
/** Цвет наследия драконов из реестра grants (значение «Наследие драконов: <цвет>»). */
export const dragonAncestryOf = grants => (grants || []).find(g => g.pool === 'feature' && /^Наследие драконов: /.test(g.value || ''))?.value.replace(/^Наследие драконов: /, '') || null;
