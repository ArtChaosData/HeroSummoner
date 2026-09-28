/**
 * HeroSummoner — общие элементы интерфейса снаряжения (Э3, ТЗ 4.4.7 v0.32):
 * текст правила для панели «Правило» / шторки, инвентарь по категориям с «надет / снят» и КД.
 * Используют: шаг «Снаряжение» и «Финал» (create-new.js), лист персонажа (sheet.js).
 */
import { el } from './utils.js';
import {
  itemById, entryName, entryUnitWeight, itemStats, fmtWeight, fmtCoins, isProficient, armorClass,
  setEquipped, WEAPON_PROPERTIES, ARMOR_RULES, ITEM_GROUPS, PICK_GROUPS,
} from './equipment.js';

const ARTICLE_TITLE = {
  '95-armor-and-shields': 'Доспехи и щиты', '96-arms': 'Оружие', '98-equipment': 'Снаряжение', '100-tools': 'Инструменты',
};

/** Узлы описания предмета для панели «Правило» — только тексты dnd.su (без отсебятины). */
export function itemRuleNodes(item, { profs } = {}) {
  if (!item) return [];
  const out = [el('div', { class: 'cls-rules-title' }, item.name)];
  const stats = itemStats(item);
  const meta = [stats, `Цена: ${item.cost}`, item.weight ? `Вес: ${item.weight}` : null].filter(Boolean).join(' · ');
  out.push(el('p', { class: 'cls-rules-meta' }, meta));
  const grp = item.group && ITEM_GROUPS[item.group];
  if (grp && item.category !== 'armor' && item.category !== 'shield') out.push(el('p', { class: 'cls-rules-meta' }, grp.name));
  const prof = isProficient(item, profs);
  if (prof === true) out.push(el('p', { class: 'eq-rule-prof is-yes' }, '✓ Вы владеете'));
  if (prof === false) out.push(el('p', { class: 'eq-rule-prof is-no' }, '⚠️ Нет владения'));
  const para = (title, text) => {
    if (!text) return;
    out.push(el('p', { class: 'cls-rules-p' }, title ? el('strong', {}, title + '. ') : null, text));
  };
  if (item.description) {
    out.push(el('div', { class: 'cls-rules-lbl' }, 'Описание'));
    para(item.descriptionTitle || null, item.description);
  }
  if (item.category === 'weapon') {
    const props = [...(item.properties || [])];
    if (props.some(p => p.range) && !props.some(p => p.id === 'range')) props.push({ id: 'range' });
    if (props.length) out.push(el('div', { class: 'cls-rules-lbl' }, 'Свойства'));
    for (const p of props) {
      const r = WEAPON_PROPERTIES[p.id];
      if (r) para(r.name, r.text);
    }
  }
  if (item.category === 'armor' || item.category === 'shield') {
    const R = ARMOR_RULES.rules || {};
    out.push(el('div', { class: 'cls-rules-lbl' }, 'Правила'));
    if (item.category === 'armor') para(ITEM_GROUPS[item.group]?.name, ARMOR_RULES.intro?.[item.group]);
    if (item.category === 'shield') para('Щиты', R['Щиты']);
    if (item.strReq) para('Тяжёлые доспехи', R['Тяжёлые доспехи']);
    if (item.stealthDisadv) para('Скрытность', R['Скрытность']);
    if (prof === false) para('Владение доспехами', R['Владение доспехами']);
    const kind = item.category === 'shield' ? 'Щит' : ITEM_GROUPS[item.group]?.name;
    const dd = (ARMOR_RULES.donDoff || []).find(d => d.kind === kind);
    if (dd) out.push(el('p', { class: 'cls-rules-p' }, el('strong', {}, 'Надевание / снятие. '), `${dd.don} / ${dd.doff}`));
  }
  if (item.category === 'kit') {
    out.push(el('div', { class: 'cls-rules-lbl' }, 'Состав'));
    out.push(el('p', { class: 'cls-rules-p' }, item.contentsText));
    if (item.weightPartial) {
      out.push(el('p', { class: 'cls-rules-note' },
        `Вес набора в таблице PHB не указан; ≈ ${fmtWeight(item.weightLb)} — сумма предметов состава, которые есть в таблице снаряжения.`));
    }
  }
  if (grp?.description && !item.description) {
    out.push(el('div', { class: 'cls-rules-lbl' }, grp.name));
    para(null, grp.description);
  }
  if (!item.description && !['weapon', 'armor', 'shield', 'kit'].includes(item.category) && !grp?.description) {
    out.push(el('p', { class: 'cls-rules-note' }, 'Описания этого предмета на dnd.su нет — только цена и вес.'));
  }
  const page = (item.url || '').match(/inventory\/([^/]+)\//)?.[1];
  out.push(el('div', { class: 'cls-rules-src' }, 'Источник: dnd.su — ',
    el('a', { href: item.url, target: '_blank', rel: 'noopener' }, ARTICLE_TITLE[page] || 'Инвентарь'), ' (PHB)'));
  return out;
}

/** Описание группы вложенного выбора (фокусировки, инструменты). */
export function groupRuleNodes(groupKey) {
  const g = PICK_GROUPS[groupKey];
  const src = { 'musical-instrument': 'musical-instrument', 'arcane-focus': 'arcane-focus', 'holy-symbol': 'holy-symbol',
    'druidic-focus': 'druidic-focus' }[groupKey];
  const d = src && ITEM_GROUPS[src]?.description;
  return [el('div', { class: 'cls-rules-title' }, g?.label || ''), d ? el('p', { class: 'cls-rules-p' }, d) : null].filter(Boolean);
}

// ─── Панель «Правило» (≥1200 px) / шторка (узкие экраны) ─────────────────────

const WIDE = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1200px)') : { matches: false };

export function makeRulePanel(emptyText = 'Нажмите ⓘ у предмета, чтобы увидеть описание и правила dnd.su.') {
  const aside = el('aside', { class: 'cls-rules eq-rules', 'aria-live': 'polite' });
  const reset = () => {
    aside.innerHTML = '';
    aside.append(el('div', { class: 'cls-rules-title is-empty' }, 'Правило'), el('p', { class: 'cls-rules-note' }, emptyText));
  };
  reset();
  function openSheet(nodes) {
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const sheet = el('div', { class: 'cls-sheet', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'cls-sheet-grip' }),
      el('button', { class: 'cls-sheet-x', 'aria-label': 'Закрыть', onClick: close }, '✕'),
      el('div', { class: 'cls-sheet-body' }, ...nodes),
    );
    const bg = el('div', { class: 'cls-sheet-bg' }, sheet);
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(bg);
  }
  function show(nodes) {
    if (WIDE.matches && aside.isConnected) { aside.innerHTML = ''; aside.append(...nodes); }
    else openSheet(nodes);
  }
  /** Кнопка «ⓘ»: nodesFn() строит содержимое по клику. */
  function infoBtn(nodesFn, title = 'Описание и правила') {
    const b = el('button', { class: 'cls-info-btn eq-info', type: 'button', title, 'aria-label': title }, 'i');
    b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); show(nodesFn()); });
    return b;
  }
  return { aside, show, infoBtn, reset };
}

// ─── Состав набора строками (B-10, вариант А Совета 2026-09-28) ───────────────
// Набор хранится одной записью (цена и вес — целиком), а показывается раскрытым: под заголовком
// набора — предметы состава dnd.su (contents) с количеством, весом и ⓘ. Предметы состава,
// которых нет в таблице снаряжения PHB (id: null), — строкой текста dnd.su без веса.

/** Строки состава набора. kitQty — сколько наборов в записи. */
export function kitContentRows(kit, kitQty = 1, { rules, profs } = {}) {
  if (!kit || kit.category !== 'kit' || !Array.isArray(kit.contents)) return [];
  return kit.contents.map(c => {
    const it = c.id ? itemById(c.id) : null;
    const n = (c.qty || 1) * (kitQty || 1);
    const w = it?.weightLb != null ? it.weightLb * n : null;
    return el('div', { class: 'eq-kit-row' },
      el('span', { class: 'eq-kit-name' }, it ? it.name : c.text, it && n > 1 ? el('span', { class: 'eq-qty' }, ` ×${n}`) : null),
      el('span', { class: 'eq-kit-meta' }, w ? fmtWeight(w) : ''),
      rules && it ? rules.infoBtn(() => itemRuleNodes(it, { profs })) : el('span', { class: 'eq-kit-noinfo' }),
    );
  });
}

// ─── Инвентарь по категориям (Финал, лист) ────────────────────────────────────

const VIEW_CATS = [
  { id: 'weapon', label: 'Оружие',     test: it => it?.category === 'weapon' },
  { id: 'armor',  label: 'Доспехи',    test: it => it?.category === 'armor' || it?.category === 'shield' },
  { id: 'gear',   label: 'Снаряжение', test: () => true },
];
const SOURCE_LABEL = { class: 'класс', background: 'предыстория', purchase: 'куплено' };

/**
 * Список инвентаря по категориям Оружие / Доспехи / Снаряжение / Золото, КД и ⚠️.
 * entries — equipment.items; onToggle(entries) — после «надеть / снять» (null → только чтение).
 */
export function buildInventoryView({ entries, coins, stats, profs, onToggle, rules, acTotal = true }) {
  const root = el('div', { class: 'eq-view' });
  function render() {
    root.innerHTML = '';
    const acInfo = armorClass(entries, stats, profs);
    const used = new Set();
    for (const cat of VIEW_CATS) {
      const rows = entries.filter(e => !used.has(e) && !e.custom && cat.test(itemById(e.id)) || (cat.id === 'gear' && !used.has(e)));
      rows.forEach(e => used.add(e));
      if (!rows.length) continue;
      root.append(el('div', { class: 'eq-view-cat' }, cat.label));
      for (const e of rows) {
        root.append(invRow(e, acInfo));
        if (!e.custom) {
          const kitRows = kitContentRows(itemById(e.id), e.qty || 1, { rules, profs });
          if (kitRows.length) root.append(el('div', { class: 'eq-kit-list' }, ...kitRows));
        }
      }
    }
    root.append(el('div', { class: 'eq-view-cat' }, 'Золото'), el('div', { class: 'eq-view-row' },
      el('span', { class: 'eq-view-name' }, fmtCoins(coins))));
    root.append(acBlock(acInfo, { total: acTotal }));
  }
  function invRow(e, acInfo) {
    const it = itemById(e.id);
    const wearable = it && !e.custom && (it.category === 'armor' || it.category === 'shield');
    const prof = isProficient(it, profs);
    const w = entryUnitWeight(e);
    const row = el('div', { class: `eq-view-row${e.equipped ? ' is-equipped' : ''}` },
      el('span', { class: 'eq-view-name' }, entryName(e), e.qty > 1 ? el('span', { class: 'eq-qty' }, ` ×${e.qty}`) : null,
        e.custom ? el('span', { class: 'eq-badge is-custom' }, 'Свой предмет') : null,
        prof === false ? el('span', { class: 'eq-badge is-noprof', title: 'Нет владения' }, 'нет владения') : null),
      el('span', { class: 'eq-view-stat' }, it && !e.custom ? itemStats(it) : ''),
      el('span', { class: 'eq-view-meta' }, [SOURCE_LABEL[e.source], w ? fmtWeight(w * (e.qty || 1)) : null].filter(Boolean).join(' · ')),
    );
    if (rules && it && !e.custom) row.append(rules.infoBtn(() => itemRuleNodes(it, { profs })));
    if (wearable) {
      const btn = el('button', { class: `eq-wear-btn${e.equipped ? ' is-on' : ''}`, type: 'button' }, e.equipped ? 'надет' : 'снят');
      if (onToggle) {
        btn.addEventListener('click', () => { setEquipped(entries, e, !e.equipped); onToggle(entries); render(); });
      } else btn.disabled = true;
      row.append(btn);
    }
    return row;
  }
  render();
  return root;
}

/** Итог КД + предупреждения (тексты правил — дословно dnd.su). */
/** total: false — без строки итога КД (на «Финале» итог — в «Боевых параметрах», v0.39), только предупреждения. */
export function acBlock(acInfo, { total = true } = {}) {
  const worn = [acInfo.armor?.name, acInfo.shield?.name].filter(Boolean).join(' + ') || 'без доспеха';
  const box = el('div', { class: `eq-ac${total ? '' : ' is-warn-only'}` },
    total ? el('div', { class: 'eq-ac-main' }, el('span', { class: 'eq-ac-val' }, String(acInfo.ac)), el('span', { class: 'eq-ac-lbl' }, 'КД'),
      el('span', { class: 'eq-ac-worn' }, worn)) : null,
  );
  for (const w of acInfo.warnings) {
    if (w.kind === 'stealth') {
      box.append(el('p', { class: 'eq-ac-note' }, `Скрытность: Помеха (${w.items.join(', ')})`));
      continue;
    }
    const head = w.kind === 'prof' ? `⚠️ Нет владения: ${w.items.join(', ')}. ` : `⚠️ Не хватает Силы для «${w.items[0]}» — скорость −10 фт. `;
    box.append(el('p', { class: 'eq-ac-warn' }, head, w.text));
  }
  return box;
}
