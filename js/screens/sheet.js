/**
 * HeroSummoner — Character Sheet (Game Mode)
 */
import { DB } from '../db.js';
import { el } from '../utils.js';
import { legacyView } from '../character.js';
import { equipProfs, itemById } from '../equipment.js';
import { buildInventoryView, makeRulePanel } from '../equipment-view.js';
import { RACE_DESCRIPTIONS } from '../data/race_descriptions.js';
import { deriveCharacter } from '../derive.js'; // П2: общий расчёт (тот же, что на «Финале»)
import * as DV from '../derive.js'; // B-32/B-24: подписи класса и расы

// ─── Data tables ──────────────────────────────────────────────────────────────

const SKILL_ABILITY = {
  'Атлетика':          'str',
  'Акробатика':        'dex', 'Ловкость рук':     'dex', 'Скрытность':        'dex',
  'История':           'int', 'Магия':             'int', 'Природа':           'int',
  'Расследование':     'int', 'Религия':           'int',
  'Восприятие':        'wis', 'Выживание':         'wis', 'Медицина':          'wis',
  'Проницательность':  'wis', 'Уход за животными': 'wis',
  'Выступление':       'cha', 'Запугивание':       'cha', 'Обман':             'cha',
  'Убеждение':         'cha',
};

const CLASS_SAVES = {
  'Бард':         ['dex','cha'], 'Варвар':   ['str','con'], 'Воин':     ['str','con'],
  'Волшебник':    ['int','wis'], 'Друид':    ['int','wis'], 'Жрец':     ['wis','cha'],
  'Изобретатель': ['con','int'], 'Колдун':   ['wis','cha'], 'Монах':    ['str','dex'],
  'Паладин':      ['wis','cha'], 'Плут':     ['dex','int'], 'Следопыт': ['str','dex'],
  'Чародей':      ['con','cha'],
};

const STAT_KEYS  = ['str','dex','con','int','wis','cha'];
const STAT_SHORT = { str:'СИЛ', dex:'ЛОВ', con:'ТЕЛ', int:'ИНТ', wis:'МДР', cha:'ХАР' };
const STAT_FULL  = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mod      = s => Math.floor(((s ?? 10) - 10) / 2);
const sign     = n => (n >= 0 ? '+' : '') + n;
const profBonus = lvl => Math.ceil((lvl || 1) / 4) + 1;

function hpClass(hp, maxHp) {
  if (hp <= 0)             return 'cs-hp-val is-dead';
  if (hp / maxHp < 0.3)   return 'cs-hp-val is-low';
  return 'cs-hp-val';
}

/** П2 (B-04, B-05): КД и скорость — общий расчёт js/derive.js (ЗбД Варвара/Монаха, «Оборона», «Драконья устойчивость»). */
function computeDerived(record) { return deriveCharacter(record); }

const armorCat = e => (e.custom ? null : itemById(e.id)?.category);

// ─── Section builders ─────────────────────────────────────────────────────────

function buildAbilities(stats, saves, pb) {
  return el('div', { class: 'cs-abilities' },
    ...STAT_KEYS.map(key => {
      const score = stats[key] ?? 10;
      return el('div', { class: 'cs-ability' },
        el('div', { class: 'cs-ability-mod' }, sign(mod(score))),
        el('div', { class: 'cs-ability-score' }, score),
        el('div', { class: 'cs-ability-label' }, STAT_SHORT[key]),
      );
    }),
  );
}

function buildSaves(stats, saves, pb) {
  return el('div', { class: 'cs-card' },
    el('div', { class: 'cs-card-title' }, 'Спасброски'),
    ...STAT_KEYS.map(key => {
      const isProficient = saves.includes(key);
      const bonus = mod(stats[key]) + (isProficient ? pb : 0);
      return el('div', { class: 'cs-row' },
        el('span', { class: `cs-dot${isProficient ? ' is-filled' : ''}` }),
        el('span', { class: 'cs-row-val' }, sign(bonus)),
        el('span', { class: 'cs-row-label' }, STAT_FULL[key]),
      );
    }),
  );
}

function buildSkills(stats, profSkills, pb, expertise = []) {
  const profSet = new Set(profSkills || []);
  const expSet  = new Set((expertise || []).map(v => String(v).toLowerCase()));
  return el('div', { class: 'cs-card' },
    el('div', { class: 'cs-card-title' }, 'Навыки'),
    ...Object.entries(SKILL_ABILITY).map(([skill, abilKey]) => {
      const isProficient = profSet.has(skill);
      const isExpert = isProficient && expSet.has(skill.toLowerCase()); // компетентность: бонус мастерства ×2
      const bonus = mod(stats[abilKey] ?? 10) + (isProficient ? pb * (isExpert ? 2 : 1) : 0);
      const rowAttrs = { class: `cs-row${isProficient ? ' is-prof' : ''}${isExpert ? ' is-expert' : ''}` };
      if (isExpert) rowAttrs.title = 'Компетентность — бонус мастерства удваивается.';
      return el('div', rowAttrs,
        el('span', { class: `cs-dot${isProficient ? ' is-filled' : ''}${isExpert ? ' is-expert' : ''}` }),
        el('span', { class: 'cs-row-val' }, sign(bonus)),
        el('span', { class: 'cs-row-label' }, skill, isExpert ? el('span', { class: 'cs-exp' }, ' ×2') : null),
        el('span', { class: 'cs-row-ab' }, STAT_SHORT[abilKey]),
      );
    }),
  );
}

function buildCombat(char, pb, dv) {
  const dexMod = mod(char.stats?.dex);
  const wisMod = mod(char.stats?.wis);
  const hasPercProf = (char.skills || []).includes('Восприятие');
  const percExpert = hasPercProf && (char.expertise || []).some(v => String(v).toLowerCase() === 'восприятие');
  const passPerc = 10 + wisMod + (hasPercProf ? pb * (percExpert ? 2 : 1) : 0);
  const cells = [
    ['КД',            dv.ac.ac,                `КД ${dv.ac.ac} = ${dv.ac.how}. ${dv.ac.src}`],
    ['Инициатива',    sign(dv.initiative.value), dv.initiative.alert ? 'ЛОВ + «Бдительный» (+5)' : 'ЛОВ'],
    ['Скорость',      `${dv.speed.value} фт.`, dv.speed.note],
    ['Проф.',         sign(pb),                null],
    ['Пас. Воспр.',   passPerc,                null],
  ];
  return el('div', { class: 'cs-combat-row' },
    ...cells.map(([label, val, tip]) => el('div', { class: 'cs-combat-cell', ...(tip ? { title: tip } : {}) },
      el('div', { class: 'cs-combat-val' }, String(val)),
      el('div', { class: 'cs-combat-label' }, label),
    )),
  );
}

function buildHpTracker(char, onUpdate) {
  let curHp  = char.hp    ?? char.maxHp ?? 1;
  const maxHp = char.maxHp ?? 1;

  const hpValEl = el('div', { class: hpClass(curHp, maxHp) }, String(curHp));

  function setHp(n) {
    curHp = Math.max(0, Math.min(n, maxHp));
    hpValEl.textContent = curHp;
    hpValEl.className   = hpClass(curHp, maxHp);
    onUpdate(curHp);
  }

  const inp = el('input', {
    class: 'cs-hp-inp', type: 'number', placeholder: '±', min: '1',
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = parseInt(inp.value); if (!isNaN(v)) { setHp(curHp - v); inp.value = ''; } }
  });

  return el('div', { class: 'cs-hp-block' },
    el('div', { class: 'cs-card-title' }, 'Хиты'),
    el('div', { class: 'cs-hp-main' },
      el('button', { class: 'cs-hp-btn',         onClick: () => setHp(curHp - 1) }, '−'),
      el('div',    { class: 'cs-hp-display' }, hpValEl, el('div', { class: 'cs-hp-max' }, `/ ${maxHp}`)),
      el('button', { class: 'cs-hp-btn is-heal',  onClick: () => setHp(curHp + 1) }, '+'),
    ),
    el('div', { class: 'cs-hp-quick-row' },
      inp,
      el('button', { class: 'cs-hp-quick', onClick: () => {
        const v = parseInt(inp.value); if (!isNaN(v)) { setHp(curHp - v); inp.value = ''; }
      }}, 'Урон'),
      el('button', { class: 'cs-hp-quick is-heal', onClick: () => {
        const v = parseInt(inp.value); if (!isNaN(v)) { setHp(curHp + v); inp.value = ''; }
      }}, 'Лечение'),
    ),
  );
}

function buildIdentity(char) {
  const race = DV.raceLabel(char.race, char.subrace, DV.dragonAncestryOf(char.grants)) || '—'; // B-32 / B-24
  const rows = [
    ['Класс',         DV.classLabel(char.class, char.subclass) || '—'], // B-32
    ['Раса',          race                  ],
    ['Предыстория',   char.background || '—'],
    ['Мировоззрение', char.alignment  || '—'],
    ['Игрок',         char.playerName || '—'],
  ];
  return el('div', { class: 'cs-card' },
    el('div', { class: 'cs-card-title' }, 'Персонаж'),
    ...rows.map(([label, val]) => el('div', { class: 'cs-ident-row' },
      el('span', { class: 'cs-ident-label' }, label),
      el('span', { class: 'cs-ident-val'   }, val),
    )),
  );
}

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderSheet(container, router, { id } = {}) {
  container.innerHTML = '';
  document.querySelector('.create-header-id')?.remove();
  document.querySelector('.app-header')?.classList.remove('app-header--create');
  const headerActions = document.getElementById('header-actions');
  if (headerActions) headerActions.innerHTML = '';

  const record = id ? await DB.get(id) : null;
  // Model v1 (ТЗ v0.28 §2.1): the sheet reads a derived v0-shaped view; writes go to `record`.
  const char = legacyView(record);

  if (!char) {
    container.append(el('div', { class: 'page-wrap' },
      el('div', { style: 'text-align:center;padding:80px 20px;color:var(--text-muted)' },
        el('div', { style: 'font-size:16px;margin-bottom:12px;color:var(--text-secondary)' }, 'Персонаж не найден'),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => router.navigate('/') }, '← К списку'),
      ),
    ));
    return;
  }

  const pb    = profBonus(char.level || 1);
  let dv      = computeDerived(record);
  // П9: + спасбросок от черты («Устойчивый») — из реестра grants
  const SAVE_KEY = { 'Сила': 'str', 'Ловкость': 'dex', 'Телосложение': 'con', 'Интеллект': 'int', 'Мудрость': 'wis', 'Харизма': 'cha' };
  const saves = [...new Set([...(CLASS_SAVES[char.class] || []),
    ...(record.grants || []).filter(g => g.pool === 'save' && g.source?.type === 'feat').map(g => SAVE_KEY[g.value]).filter(Boolean)])];
  const stats = char.stats || {};

  async function onHpChange(hp) {
    record.hp = { ...(record.hp || {}), current: hp };
    await DB.put(record);
  }

  // Portrait
  const portraitEl = char.portrait
    ? el('div', { class: 'cs-portrait', style: `background-image:url(${char.portrait})` })
    : el('div', { class: 'cs-portrait is-initials' },
        el('span', {}, (char.name || '?')[0].toUpperCase()),
      );

  container.append(
    el('div', { class: 'cs-page' },

      // ── Header ────────────────────────────────────────────────────────────
      el('div', { class: 'cs-header' },
        portraitEl,
        el('div', { class: 'cs-header-info' },
          el('h1', { class: 'cs-name' }, char.name || 'Без имени'),
          el('div', { class: 'cs-sub' },
            [DV.classLabel(char.class, char.subclass), DV.raceLabel(char.race, char.subrace, DV.dragonAncestryOf(char.grants)), `Ур. ${char.level || 1}`].filter(Boolean).join(' · '), // B-32
          ),
        ),
        el('button', { class: 'cs-back-btn', onClick: () => router.navigate('/') }, '← Назад'),
      ),

      // ── Body ──────────────────────────────────────────────────────────────
      el('div', { class: 'cs-body' },

        // Left: ability scores + saving throws
        el('div', { class: 'cs-col cs-col-left' },
          buildAbilities(stats, saves, pb),
          buildSaves(stats, saves, pb),
        ),

        // Middle: HP + combat + identity
        el('div', { class: 'cs-col cs-col-mid' },
          buildHpTracker(char, onHpChange),
          buildCombat(char, pb, dv),
          buildIdentity(char),
        ),

        // Right: skills
        el('div', { class: 'cs-col cs-col-right' },
          buildSkills(stats, char.skills, pb, char.expertise),
        ),
      ),

      // ── Снаряжение (Э3): по категориям, доспех/щит — надет/снят, КД пересчитывается ──
      el('div', { class: 'cs-equip' },
        el('div', { class: 'cs-card' },
          el('div', { class: 'cs-card-title' }, 'Снаряжение'),
          record.equipment
            ? buildInventoryView({
                entries: record.equipment.items || [], coins: record.equipment.coins, stats: record.stats,
                profs: equipProfs(record.grants), rules: makeRulePanel(),
                acExtra: entries => deriveCharacter({ ...record, equipment: { ...record.equipment, items: entries } }).ac.base.warnings.filter(w => w.kind === 'ac-lower'), // B-35
                size: RACE_DESCRIPTIONS[char.race]?.size || null, // B-16: «Тяжёлое» у Маленьких
                onToggle: async entries => {
                  record.equipment.items = entries;
                  // мастер при редактировании строит «надето» из своего состояния — держим его в курсе
                  const ws = record._wizardState;
                  if (ws?.mecEquip) {
                    ws.mecEquip.equippedManual = {};
                    for (const cat of ['armor', 'shield']) {
                      const on = entries.find(e => e.equipped && !e.custom && armorCat(e) === cat);
                      ws.mecEquip.equippedManual[cat] = on ? on.id : null;
                    }
                  }
                  dv = computeDerived(record);
                  const row = container.querySelector('.cs-combat-row'); // П2: КД и скорость пересчитываются сразу
                  if (row) row.replaceWith(buildCombat(char, pb, dv));
                  await DB.put(record);
                },
              })
            : el('p', { class: 'cs-empty' }, 'Снаряжение не выбрано'),
        ),
      ),
    ),
  );
}
