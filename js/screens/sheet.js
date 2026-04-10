/**
 * HeroSummoner — Character Sheet (Game Mode)
 */
import { DB } from '../db.js';
import { el } from '../utils.js';
import { ARMOUR } from '../data/equipment.js';

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

function computeAC(char) {
  const ws = char._wizardState || {};
  const dexMod = mod(char.stats?.dex);
  if (ws.mecEquipMode === 'buy' && ws.mecCart?.length) {
    const cartArmor = ws.mecCart.find(i => i.category === 'Доспехи' && i.name !== 'Щит');
    if (cartArmor) {
      const a = ARMOUR.find(x => x.name === cartArmor.name);
      if (a) {
        let ac = a.acBase;
        if (a.acDex === 'full')       ac += dexMod;
        else if (a.acDex === 'max2')  ac += Math.min(dexMod, 2);
        if (ws.mecCart.some(i => i.name === 'Щит')) ac += 2;
        return ac;
      }
    }
  }
  return 10 + dexMod;
}

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

function buildSkills(stats, profSkills, pb) {
  const profSet = new Set(profSkills || []);
  return el('div', { class: 'cs-card' },
    el('div', { class: 'cs-card-title' }, 'Навыки'),
    ...Object.entries(SKILL_ABILITY).map(([skill, abilKey]) => {
      const isProficient = profSet.has(skill);
      const bonus = mod(stats[abilKey] ?? 10) + (isProficient ? pb : 0);
      return el('div', { class: `cs-row${isProficient ? ' is-prof' : ''}` },
        el('span', { class: `cs-dot${isProficient ? ' is-filled' : ''}` }),
        el('span', { class: 'cs-row-val' }, sign(bonus)),
        el('span', { class: 'cs-row-label' }, skill),
        el('span', { class: 'cs-row-ab' }, STAT_SHORT[abilKey]),
      );
    }),
  );
}

function buildCombat(char, pb, ac) {
  const dexMod = mod(char.stats?.dex);
  const wisMod = mod(char.stats?.wis);
  const hasPercProf = (char.skills || []).includes('Восприятие');
  const passPerc = 10 + wisMod + (hasPercProf ? pb : 0);
  const cells = [
    ['КД',            ac              ],
    ['Инициатива',    sign(dexMod)    ],
    ['Скорость',      '30 фт.'       ],
    ['Проф.',         sign(pb)        ],
    ['Пас. Воспр.',   passPerc        ],
  ];
  return el('div', { class: 'cs-combat-row' },
    ...cells.map(([label, val]) => el('div', { class: 'cs-combat-cell' },
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
  const race = [char.subrace, char.race].filter(Boolean).join(' ') || '—';
  const rows = [
    ['Класс',         char.class      || '—'],
    ['Раса',          race                  ],
    ['Предыстория',   char.background || '—'],
    ['Мировоззрение', char.alignment  || '—'],
    ['Игрок',         char.playerName || '—'],
    ['Редакция',      char.edition    || '—'],
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

  const char = id ? await DB.get(id) : null;

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
  const ac    = computeAC(char);
  const saves = CLASS_SAVES[char.class] || [];
  const stats = char.stats || {};

  async function onHpChange(hp) {
    char.hp = hp;
    await DB.put(char);
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
            [char.class, char.race, `Ур. ${char.level || 1}`].filter(Boolean).join(' · '),
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
          buildCombat(char, pb, ac),
          buildIdentity(char),
        ),

        // Right: skills
        el('div', { class: 'cs-col cs-col-right' },
          buildSkills(stats, char.skills, pb),
        ),
      ),
    ),
  );
}
