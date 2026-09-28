/**
 * HeroSummoner — «Озёра выборов» (ТЗ «Озёра выборов: Класс · Раса · Предыстория», правила 1–4).
 * Чистая логика над реестром grants[] (без DOM и без состояния мастера).
 *
 * Пулы: навыки (skill), инструменты (tool), языки (language). Шаги по порядку мастера: Класс (класс + подкласс),
 * Раса (раса + подраса), Предыстория, Компетентность (языки «Искусного исследователя» — SLOT_STEP).
 *   Правило 1 — lockMap(): всё, что уже получено в другом месте, видно в списке заблокированным с подписью.
 *   Правило 2 — conflicts().removals: выбор, совпавший с фиксированным владением, снимается (слот пустеет);
 *               дубль двух выборов (старые черновики) — снимается более поздний.
 *   Правило 3 — conflicts().replacements: навык/инструмент, выданный фиксированно двумя источниками, —
 *               на более позднем шаге обязательный слот «выберите другой» (правило PHB, dnd.su «Предыстории»).
 *               Язык — без замены, только пометка (conflicts().langDups).
 *   Правило 4 — widenIfExhausted(): все варианты списка уже есть → открыть любой навык / инструмент.
 */

export const STEP_OF = { class: 'class', subclass: 'class', race: 'race', subrace: 'race', background: 'background' };
/** Слоты класса, которые выбираются на шаге 4.4.4a «Компетентность» (ТЗ v0.41): языки «Искусного исследователя». */
export const SLOT_STEP = { deft_explorer_languages: 'expertise' };
export const STEP_ORDER = ['class', 'race', 'background', 'expertise'];
export const STEP_LABEL = { class: 'Класс', race: 'Раса', background: 'Предыстория', expertise: 'Компетентность' };
export const POOLS = ['skill', 'tool', 'language'];
export const POOL_NOUN = { skill: 'навык', tool: 'инструмент', language: 'язык' };

export const norm = v => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е');
export const stepOf = g => SLOT_STEP[g?.slot] || STEP_OF[g?.source?.type] || null;
const rank = g => STEP_ORDER.indexOf(stepOf(g)) * 2 + (g.source.type === 'subclass' || g.source.type === 'subrace' ? 1 : 0);
/** Слот выбора: у одного слота выборы не блокируют сами себя. */
export const slotKey = g => `${g.source.type}:${g.slot || (g.kind === 'fixed' ? 'fixed' : 'choice')}`;
const isChoice = g => g.kind === 'choice' || g.kind === 'replacement';

/**
 * Конфликты в реестре: { removals: grant[], replacements: [{ pool, value, key, step, holders }], langDups: [...] }.
 * holders — фиксированные источники ([grant]) по порядку мастера.
 */
export function conflicts(grants) {
  const removals = [], replacements = [], langDups = [];
  for (const pool of POOLS) {
    const groups = new Map();
    for (const g of grants) {
      if (g.pool !== pool || !stepOf(g)) continue;
      const k = norm(g.value);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    }
    for (const [k, list] of groups) {
      if (list.length < 2) continue;
      const fixed = list.filter(g => g.kind === 'fixed').sort((a, b) => rank(a) - rank(b));
      const choices = list.filter(isChoice).sort((a, b) => rank(a) - rank(b));
      if (fixed.length) removals.push(...choices);            // правило 2
      else removals.push(...choices.slice(1));                // дубль выборов — оставляем самый ранний
      // фиксированные дубли из разных источников
      const srcs = [];
      for (const f of fixed) if (!srcs.some(s => s.source.type === f.source.type && s.source.id === f.source.id)) srcs.push(f);
      if (srcs.length >= 2) {
        const last = srcs[srcs.length - 1];
        const entry = { pool, value: fixed[0].value, key: `${pool}:${k}`, step: stepOf(last), holders: srcs };
        if (pool === 'language') langDups.push(entry); else replacements.push(entry); // правило 3
      }
    }
  }
  return { removals, replacements, langDups };
}

/**
 * Правило 1: Map<norm(значение), подпись> — всё в пуле, что получено не этим слотом.
 * who(grant) → подпись источника («Раса (Дварф)»).
 */
export function lockMap(grants, pool, ownSlots, who) {
  const own = new Set([].concat(ownSlots || []));
  const out = new Map();
  for (const g of grants) {
    if (g.pool !== pool || !stepOf(g) || own.has(slotKey(g))) continue;
    const k = norm(g.value);
    if (!out.has(k)) out.set(k, who(g));
  }
  return out;
}

/**
 * Правило 4: если свободных (не заблокированных) вариантов меньше, чем нужно выбрать, — список открывается
 * до «любого» того же вида. picked — уже выбранные этим слотом (они свободны).
 */
export function widenIfExhausted(options, anyOptions, locked, need, picked = []) {
  const pickedK = new Set(picked.map(norm));
  const free = options.filter(o => !locked.has(norm(o)) || pickedK.has(norm(o)));
  if (free.length >= need) return { options, widened: false };
  const merged = [...options, ...anyOptions.filter(o => !options.some(x => norm(x) === norm(o)))];
  return { options: merged, widened: true, exhausted: options.filter(o => locked.has(norm(o))) };
}
