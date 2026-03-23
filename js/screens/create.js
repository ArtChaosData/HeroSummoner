/**
 * HeroSummoner — Screen 2: Create / Edit Character
 */
import { DB }        from '../db.js';
import { el, toast } from '../utils.js';

// ─── Game Data ────────────────────────────────────────────────────────────────

const PB_MIN  = 8;
const PB_MAX  = 15;
const PB_POOL = 27;
const PB_COST = { 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9 };

const ABILITIES = [
  { key:'str', label:'Сила' },
  { key:'dex', label:'Ловкость' },
  { key:'con', label:'Телосложение' },
  { key:'int', label:'Интеллект' },
  { key:'wis', label:'Мудрость' },
  { key:'cha', label:'Харизма' },
];

const SKILLS_BY_AB = {
  str: [{ name:'Атлетика' }],
  dex: [{ name:'Акробатика' }, { name:'Ловкость рук' }, { name:'Скрытность' }],
  con: [],
  int: [{ name:'Магия' }, { name:'История' }, { name:'Расследование' }, { name:'Природа' }, { name:'Религия' }],
  wis: [{ name:'Уход за животными' }, { name:'Проницательность' }, { name:'Медицина' }, { name:'Восприятие' }, { name:'Выживание' }],
  cha: [{ name:'Обман' }, { name:'Запугивание' }, { name:'Выступление' }, { name:'Убеждение' }],
};

const CLASSES = {
  'Бард':      { die:8,  saves:['dex','cha'], count:3, list:null },
  'Варвар':    { die:12, saves:['str','con'], count:2, list:['Атлетика','Восприятие','Природа','Запугивание','Уход за животными','Выживание'] },
  'Воин':      { die:10, saves:['str','con'], count:2, list:['Акробатика','Атлетика','История','Восприятие','Уход за животными','Запугивание','Выживание'] },
  'Волшебник': { die:6,  saves:['int','wis'], count:2, list:['Магия','История','Расследование','Медицина','Природа','Религия'] },
  'Друид':     { die:8,  saves:['int','wis'], count:2, list:['Магия','Медицина','Природа','Восприятие','Религия','Уход за животными','Выживание'] },
  'Жрец':      { die:8,  saves:['wis','cha'], count:2, list:['История','Магия','Медицина','Религия','Убеждение'] },
  'Искусник':  { die:8,  saves:['con','int'], count:2, list:['Магия','История','Расследование','Медицина','Природа','Восприятие','Ловкость рук'] },
  'Колдун':    { die:8,  saves:['wis','cha'], count:2, list:['Магия','Обман','История','Запугивание','Природа','Религия'] },
  'Монах':     { die:8,  saves:['str','dex'], count:2, list:['Акробатика','Атлетика','История','Магия','Религия','Скрытность'] },
  'Паладин':   { die:10, saves:['wis','cha'], count:2, list:['Атлетика','Магия','История','Медицина','Убеждение','Религия'] },
  'Плут':      { die:8,  saves:['dex','int'], count:4, list:['Акробатика','Атлетика','Восприятие','Обман','Запугивание','Расследование','Ловкость рук','Магия','Скрытность','Убеждение','Выступление'] },
  'Следопыт':  { die:10, saves:['str','dex'], count:3, list:['Атлетика','Восприятие','Магия','Природа','Скрытность','Уход за животными','Выживание'] },
  'Чародей':   { die:6,  saves:['con','cha'], count:2, list:['Магия','Обман','Запугивание','Расследование','Убеждение','Религия'] },
};

const RACES = {
  'Аасимар':        { asi:{cha:2}, speed:30, sub:['Аасимар-защитник','Аасимар-искупитель','Аасимар-карающий'] },
  'Гном':           { asi:{int:2}, speed:25, sub:['Лесной гном','Скальный гном'] },
  'Голиаф':         { asi:{str:2,con:1}, speed:30, sub:null },
  'Дварф':          { asi:{con:2}, speed:25, sub:['Холмовой дварф','Горный дварф'] },
  'Дракорождённый': { asi:{str:2,cha:1}, speed:30, sub:null },
  'Кенку':          { asi:{dex:2,wis:1}, speed:30, sub:null },
  'Полуорк':        { asi:{str:2,con:1}, speed:30, sub:null },
  'Полурослик':     { asi:{dex:2}, speed:25, sub:['Легконогий','Крепкий'] },
  'Полуэльф':       { asi:{cha:2}, speed:30, sub:null },
  'Таваксия':       { asi:{dex:2,cha:1}, speed:30, sub:null },
  'Тифлинг':        { asi:{int:1,cha:2}, speed:30, sub:null },
  'Тритон':         { asi:{str:1,con:1,cha:1}, speed:30, sub:null },
  'Фирболг':        { asi:{wis:2,str:1}, speed:30, sub:null },
  'Человек':        { asi:{str:1,dex:1,con:1,int:1,wis:1,cha:1}, speed:30, sub:null },
  'Эльф':           { asi:{dex:2}, speed:30, sub:['Высший эльф','Лесной эльф','Тёмный эльф'] },
};

const SUB_ASI = {
  'Аасимар-защитник':  { wis:1 },
  'Аасимар-искупитель':{ cha:1 },
  'Аасимар-карающий':  { str:1 },
  'Горный дварф':      { str:2 },
  'Высший эльф':       { int:1 },
  'Крепкий':           { con:1 },
  'Легконогий':        { cha:1 },
  'Лесной гном':       { dex:1 },
  'Лесной эльф':       { wis:1 },
  'Скальный гном':     { con:1 },
  'Тёмный эльф':       { cha:1 },
  'Холмовой дварф':    { wis:1 },
};

const BACKGROUNDS = {
  'Аколит':                  { skills:['Религия','Проницательность'] },
  'Артист':                  { skills:['Акробатика','Выступление'] },
  'Беспризорник':            { skills:['Скрытность','Ловкость рук'] },
  'Городской страж':         { skills:['Атлетика','Проницательность'] },
  'Гильдейский ремесленник': { skills:['Проницательность','Убеждение'] },
  'Дворянин':                { skills:['История','Убеждение'] },
  'Моряк':                   { skills:['Атлетика','Восприятие'] },
  'Мудрец':                  { skills:['История','Магия'] },
  'Народный герой':          { skills:['Уход за животными','Выживание'] },
  'Отшельник':               { skills:['Медицина','Религия'] },
  'Преступник':              { skills:['Обман','Скрытность'] },
  'Солдат':                  { skills:['Атлетика','Запугивание'] },
  'Чужестранец':             { skills:['Восприятие','Проницательность'] },
  'Шарлатан':                { skills:['Обман','Ловкость рук'] },
};

const ALIGNMENTS = [
  'Законопослушный добрый',
  'Законопослушный злой',
  'Законопослушный нейтральный',
  'Истинный нейтральный',
  'Нейтральный добрый',
  'Нейтральный злой',
  'Хаотичный добрый',
  'Хаотичный злой',
  'Хаотичный нейтральный',
];

const CLASS_EQUIP = {
  'Бард':      ['Рапира или длинный меч', 'Набор дипломата', 'Музыкальный инструмент', 'Кожаный доспех + кинжал'],
  'Варвар':    ['Боевой топор или 2 простых оружия', 'Набор путешественника', '4 метательных топора'],
  'Воин':      ['Кольчуга или кожаный доспех + лук', 'Щит или боевое оружие', 'Арбалет + 20 болтов', 'Набор путешественника'],
  'Волшебник': ['Посох или кинжал', 'Книга заклинаний', 'Компонентный мешочек', 'Набор учёного'],
  'Друид':     ['Щит или простое оружие', 'Кожаный доспех', 'Деревянный щит', 'Набор путешественника'],
  'Жрец':      ['Боевой молот или простое оружие', 'Кольчуга', 'Символ веры', 'Набор священника'],
  'Искусник':  ['2 кинжала', 'Любое простое оружие', 'Воровские инструменты', 'Кожаный доспех', 'Набор подземелья'],
  'Колдун':    ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор учёного', 'Кожаный доспех + 2 кинжала'],
  'Монах':     ['Короткий меч или простое оружие', 'Набор путешественника', '10 дротиков'],
  'Паладин':   ['Боевое оружие + щит', 'Метательные копья ×5', 'Кольчуга', 'Набор священника'],
  'Плут':      ['Рапира или короткий меч', 'Короткий меч или лук + 20 стрел', 'Набор взломщика', 'Кожаный доспех + 2 кинжала'],
  'Следопыт':  ['Кольчужная рубаха', '2 коротких меча', 'Набор путешественника', 'Лук + 20 стрел'],
  'Чародей':   ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор мага', '2 кинжала'],
};

const BG_EQUIP = {
  'Аколит':                  ['Символ веры', 'Молитвенник', '5 свечей', 'Облачение', '15 зм'],
  'Артист':                  ['Музыкальный инструмент', 'Сувенир', 'Дорожный костюм', '15 зм'],
  'Беспризорник':            ['Небольшой нож', 'Карта города', 'Тёмный плащ', '10 зм'],
  'Городской страж':         ['Форменная одежда', 'Рожок', 'Кандалы', '10 зм'],
  'Гильдейский ремесленник': ['Инструменты ремесла', 'Письмо от гильдии', 'Опрятная одежда', '15 зм'],
  'Дворянин':                ['Тонкие одежды', 'Перстень с гербом', 'Рекомендательное письмо', '25 зм'],
  'Моряк':                   ['Дубина', '50 фут. канат', 'Дорожная одежда', '10 зм'],
  'Мудрец':                  ['Чернила', 'Перо', 'Нож для бумаги', 'Письмо с вопросом', '10 зм'],
  'Народный герой':          ['Инструменты ремесла', 'Лопата', 'Горшок', 'Дорожная одежда', '10 зм'],
  'Отшельник':               ['Свитки с заметками', 'Зимнее одеяло', 'Огниво', '5 зм'],
  'Преступник':              ['Воровские инструменты', 'Тёмная одежда с капюшоном', '15 зм'],
  'Солдат':                  ['Знак воинского звания', 'Трофей с врага', 'Кости', 'Дорожная одежда', '10 зм'],
  'Чужестранец':             ['Путевые дневники', 'Карты родной земли', 'Дорожные одежды', '10 зм'],
  'Шарлатан':                ['Шулерские карты', 'Одежда разных сословий', '15 зм'],
};

const CLASS_GOLD = {
  'Бард':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Варвар':    { formula:'2к4×10', rolls:2, die:4, mult:10 },
  'Воин':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Волшебник': { formula:'4к4×10', rolls:4, die:4, mult:10 },
  'Друид':     { formula:'2к4×10', rolls:2, die:4, mult:10 },
  'Жрец':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Искусник':  { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Колдун':    { formula:'4к4×10', rolls:4, die:4, mult:10 },
  'Монах':     { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Паладин':   { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Плут':      { formula:'4к4×10', rolls:4, die:4, mult:10 },
  'Следопыт':  { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Чародей':   { formula:'3к4×10', rolls:3, die:4, mult:10 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mod  = s => Math.floor((s - 10) / 2);
const sign = n => n >= 0 ? `+${n}` : `${n}`;

function pbSpent(stats) {
  return Object.values(stats).reduce((a, v) => a + (PB_COST[v] ?? 0), 0);
}

function racialAsi(state) {
  if (!state.race) return {};
  const base = { ...(RACES[state.race]?.asi || {}) };
  const sub  = state.subrace ? (SUB_ASI[state.subrace] || {}) : {};
  for (const [k, v] of Object.entries(sub)) base[k] = (base[k] || 0) + v;
  return base;
}

const totalStat  = (state, key) => state.stats[key] + (racialAsi(state)[key] || 0);
const bgSkills   = state => BACKGROUNDS[state.background]?.skills || [];
const clsOptions = state => {
  if (!state.class) return [];
  const cls = CLASSES[state.class];
  return cls.list ?? Object.values(SKILLS_BY_AB).flat().map(s => s.name);
};
const isProf = (state, name) => bgSkills(state).includes(name) || state.chosen.has(name);

function rollDice(rolls, die) {
  let total = 0;
  for (let i = 0; i < rolls; i++) total += Math.ceil(Math.random() * die);
  return total;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeSel(opts, cur, onChange, placeholder = '— Выбрать —') {
  const s = el('select', {});
  s.append(el('option', { value: '', disabled: true }, placeholder));
  s.options[0].disabled = true;
  for (const o of opts) {
    const opt = el('option', { value: o }, o);
    s.append(opt);
  }
  s.value = cur || '';
  s.addEventListener('change', e => onChange(e.target.value));
  return s;
}

function buildIdRow(state, refresh) {
  const nameInp = el('input', { type:'text', placeholder:'Имя персонажа', value: state.name });
  nameInp.addEventListener('input', e => { state.name = e.target.value; refresh(); });

  const playerInp = el('input', { type:'text', placeholder:'Имя игрока', value: state.playerName });
  playerInp.addEventListener('input', e => { state.playerName = e.target.value; });

  const classNames = Object.keys(CLASSES).sort((a,b) => a.localeCompare(b, 'ru'));
  const raceNames  = Object.keys(RACES).sort((a,b) => a.localeCompare(b, 'ru'));
  const bgNames    = Object.keys(BACKGROUNDS).sort((a,b) => a.localeCompare(b, 'ru'));
  const aligns     = ALIGNMENTS.slice().sort((a,b) => a.localeCompare(b, 'ru'));

  const raceData = state.race ? RACES[state.race] : null;
  const subraces = raceData?.sub || [];

  const fields = [
    el('div', { class:'id-field id-name' },        el('label',{}, 'Имя персонажа'), nameInp),
    el('div', { class:'id-field id-class-f is-class' }, el('label',{}, 'Класс'),
      makeSel(classNames, state.class, v => { state.class = v; state.chosen.clear(); refresh(); })
    ),
    el('div', { class:'id-field' },                el('label',{}, 'Уровень'), el('div',{ class:'level-badge' }, '1')),
    el('div', { class:'id-field id-race-f is-race' }, el('label',{}, 'Раса'),
      makeSel(raceNames, state.race, v => {
        state.race = v;
        state.subrace = RACES[v]?.sub?.[0] || '';
        refresh();
      })
    ),
    ...(subraces.length ? [
      el('div', { class:'id-field id-subrace-f is-race' }, el('label',{}, 'Подраса'),
        makeSel(subraces, state.subrace, v => { state.subrace = v; refresh(); })
      ),
    ] : []),
    el('div', { class:'id-field id-bg-f is-bg' }, el('label',{}, 'Предыстория'),
      makeSel(bgNames, state.background, v => { state.background = v; refresh(); })
    ),
    el('div', { class:'id-field id-align-f' },     el('label',{}, 'Мировоззрение'),
      makeSel(aligns, state.alignment, v => { state.alignment = v; })
    ),
    el('div', { class:'id-field id-player-f' },    el('label',{}, 'Имя игрока'), playerInp),
    // Edition toggle — far right
    el('div', { class:'id-field id-edition', style:'margin-left:auto' },
      el('label',{}, 'Редакция'),
      el('div', { class:'edition-toggle' },
        ...['2014','2024'].map(ed =>
          el('button', {
            class: `edition-btn${state.edition === ed ? ' active' : ''}`,
            onClick: () => { state.edition = ed; refresh(); },
          }, ed)
        )
      )
    ),
  ];

  return el('div', { class: 'id-row' }, ...fields);
}

function buildPbHeader(state) {
  const spent  = pbSpent(state.stats);
  const remain = PB_POOL - spent;
  const cls    = remain < 0 ? 'over' : remain <= 7 ? 'low' : 'ok';
  const pct    = Math.min(100, (spent / PB_POOL) * 100);

  return el('div', { class: 'pb-header' },
    el('span', { class: 'pb-label' }, 'Point Buy'),
    el('div',  { class: 'pb-counter' },
      el('span', { class: `pb-remaining ${cls}` }, remain),
      el('span', { class: 'pb-of' }, `/ ${PB_POOL}`),
      el('span', { class: 'pb-unit' }, 'очков'),
    ),
    el('div', { class: 'pb-track' },
      el('div', { class: `pb-fill ${cls === 'ok' ? '' : cls}`, style: `width:${pct}%` })
    )
  );
}

function buildAbBlock(state, ability, refresh) {
  const { key, label } = ability;
  const base     = state.stats[key];
  const asi      = racialAsi(state)[key] || 0;
  const total    = base + asi;
  const modifier = mod(total);
  const hasSave  = state.class ? CLASSES[state.class]?.saves.includes(key) : false;
  const saveVal  = modifier + (hasSave ? 2 : 0);
  const passWis  = key === 'wis' ? 10 + modifier + (isProf(state, 'Восприятие') ? 2 : 0) : null;

  const spent  = pbSpent(state.stats);
  const canDec = base > PB_MIN;
  const canInc = base < PB_MAX && (PB_POOL - spent) >= ((PB_COST[base + 1] ?? 99) - PB_COST[base]);

  const btnDec = el('button', { class: 'ab-btn', onClick: () => { if (canDec) { state.stats[key]--; refresh(); } } }, '−');
  const btnInc = el('button', { class: 'ab-btn', onClick: () => { if (canInc) { state.stats[key]++; refresh(); } } }, '+');
  if (!canDec) btnDec.disabled = true;
  if (!canInc) btnInc.disabled = true;

  const statRow = el('div', { class: 'ab-stat-row' },
    el('span', { class: 'ab-name' }, label),
    el('div',  { class: 'ab-stepper' }, btnDec, el('span', { class: 'ab-base-val' }, base), btnInc),
    el('span', { class: 'ab-cost' }, `(${PB_COST[base]})`),
    el('div',  { class: 'ab-vsep' }),
    ...(asi !== 0 ? [
      el('span', { class: 'ab-racial-badge' }, asi > 0 ? `+${asi}` : asi),
      el('span', { class: 'ab-arrow' }, '→'),
    ] : []),
    el('span', { class: 'ab-total' }, total),
    el('span', { class: 'ab-deriv-lbl' }, 'мод'),
    el('span', { class: 'ab-mod' }, sign(modifier)),
    el('span', { class: 'ab-deriv-lbl' }, 'СБ'),
    el('span', { class: `ab-save${hasSave ? ' prof' : ''}` }, sign(saveVal)),
    el('div',  { class: `ms-pip${hasSave ? ' active' : ''}` }),
    ...(passWis !== null ? [el('span', { class: 'ab-passive-inline' }, `👁 ${passWis}`)] : []),
  );

  const skills   = SKILLS_BY_AB[key];
  const bgProfs  = bgSkills(state);
  const opts     = clsOptions(state);
  const maxPicks = state.class ? (CLASSES[state.class]?.count || 2) : 0;
  const picked   = [...state.chosen].filter(s => opts.includes(s)).length;

  const skillEls = skills.map(({ name }) => {
    const fromBg    = bgProfs.includes(name);
    const fromClass = state.chosen.has(name);
    const proficient = fromBg || fromClass;
    const canPick   = opts.includes(name) && !fromBg;
    const atLimit   = picked >= maxPicks;
    const bonus     = modifier + (proficient ? 2 : 0);

    let cbCls = 'sk-cb';
    if (fromBg)         cbCls += ' src-bg has-check';
    else if (fromClass) cbCls += ' src-class has-check';
    else if (canPick)   cbCls += ' opt-class';

    return el('div', {
      class: `skill-row${fromBg ? ' locked' : ''}`,
      onClick: () => {
        if (fromBg) return;
        if (fromClass) { state.chosen.delete(name); refresh(); }
        else if (canPick && !atLimit) { state.chosen.add(name); refresh(); }
      },
    },
      el('div', { class: cbCls }),
      el('span', { class: `sk-name${proficient ? ' proficient' : ''}` }, name),
      el('span', { class: `sk-bonus${fromClass ? ' col-class' : fromBg ? ' col-bg' : ''}` }, sign(bonus))
    );
  });

  return el('div', { class: 'ab-block' },
    statRow,
    skills.length
      ? el('div', { class: 'ab-skills-grid' }, ...skillEls)
      : el('div', { class: 'ab-noskills' }, 'нет навыков')
  );
}

function buildEquipPanel(state, refresh) {
  const cls = state.class;
  const bg  = state.background;
  const mode = state.equipMode;
  const goldInfo = cls ? CLASS_GOLD[cls] : null;

  const tabs = el('div', { class: 'equip-tabs' },
    ...['standard','buy'].map(m =>
      el('button', {
        class: `equip-tab${mode === m ? ' active' : ''}`,
        onClick: () => { state.equipMode = m; refresh(); },
      }, m === 'standard' ? 'Стандарт' : 'Закуп')
    )
  );

  let body;
  if (mode === 'standard') {
    const classItems = cls ? (CLASS_EQUIP[cls] || []) : [];
    const bgItems    = bg  ? (BG_EQUIP[bg]    || []) : [];

    body = el('div', { class: 'equip-standard' },
      classItems.length ? el('div', {},
        el('div', { class: 'equip-section-title' }, cls ? `От класса · ${cls}` : 'Класс не выбран'),
        el('ul', { class: 'equip-items' },
          ...classItems.map(i => el('li', { class: 'equip-item' }, i))
        )
      ) : el('div', { class: 'equip-empty' }, 'Выбери класс'),
      bgItems.length ? el('div', { style: 'margin-top:10px' },
        el('div', { class: 'equip-section-title' }, bg ? `От предыстории · ${bg}` : ''),
        el('ul', { class: 'equip-items' },
          ...bgItems.map(i => el('li', { class: 'equip-item' }, i))
        )
      ) : (bg ? null : el('div', { class: 'equip-empty', style:'margin-top:8px' }, 'Выбери предыстории'))
    );
  } else {
    // Buy mode
    const goldResult = state.equipGold;
    const rollRow = el('div', { class: 'equip-gold-roll-row' },
      el('span', { class: 'equip-gold-formula' }, goldInfo ? goldInfo.formula : '— зм'),
      el('button', {
        class: 'btn btn-sm equip-roll-btn',
        onClick: () => {
          if (!goldInfo) return;
          state.equipGold = rollDice(goldInfo.rolls, goldInfo.die) * goldInfo.mult;
          refresh();
        },
      }, '🎲 Бросить'),
    );

    const resultEl = goldResult !== null
      ? el('div', { class: 'equip-gold-result-row' },
          el('span', { class: 'equip-gold-lbl' }, 'Золото:'),
          el('span', { class: 'equip-gold-val' }, `${goldResult} зм`),
          el('button', {
            class: 'btn btn-sm btn-primary equip-buy-btn',
            onClick: () => openEquipModal(),
          }, 'Закупиться →'),
        )
      : null;

    body = el('div', { class: 'equip-buy' },
      !cls ? el('div', { class: 'equip-empty' }, 'Выбери класс') : null,
      cls ? rollRow : null,
      resultEl,
    );
  }

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('span', { class: 'panel-title' }, 'Снаряжение'),
      tabs
    ),
    el('div', { class: 'panel-body' }, body)
  );
}

function openEquipModal() {
  const overlay = el('div', { class: 'equip-modal-overlay',
    onClick: e => { if (e.target === overlay) overlay.remove(); }
  },
    el('div', { class: 'equip-modal' },
      el('div', { class: 'equip-modal-head' },
        el('span', { class: 'equip-modal-title' }, 'Закупка снаряжения'),
        el('button', { class: 'equip-modal-close', onClick: () => overlay.remove() }, '✕')
      ),
      el('div', { class: 'equip-modal-body' },
        el('div', { class: 'equip-modal-stub' }, '⚒', el('p', {}, 'Раздел в разработке'))
      )
    )
  );
  document.body.append(overlay);
}

function buildRightPanel(state, refresh) {
  const cls    = state.class ? CLASSES[state.class] : null;
  const conMod = mod(totalStat(state, 'con'));
  const dexMod = mod(totalStat(state, 'dex'));
  const hp     = cls ? Math.max(1, cls.die + conMod) : '—';
  const speed  = state.race ? (RACES[state.race]?.speed || 30) : '—';
  const saves  = cls?.saves || [];
  const saveNames = { str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма' };

  return el('div', { class: 'create-right' },
    // HP
    el('div', { class: 'panel' },
      el('div', { class: 'panel-head' },
        el('span', { class: 'panel-title' }, 'Хиты'),
        el('span', { class: 'panel-badge' }, cls ? `к${cls.die}` : '—')
      ),
      el('div', { class: 'hp-row' },
        el('span', { class: 'hp-val' }, hp),
        el('span', { class: 'hp-max-label' }, '/ макс')
      ),
      cls ? el('div', { class: 'hp-formula' }, `к${cls.die} ${sign(conMod)} (Тел)`) : null
    ),
    // Combat stats
    el('div', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Боевые статы')),
      el('div', { class: 'combat-grid' },
        ...[
          ['КД',          10 + dexMod,   '10 + Ловк'],
          ['Инициатива',  sign(dexMod),  'мод Ловкости'],
          [`${speed} фт`, '',            'Скорость'],
          ['+2',          '',            'Мастерство'],
        ].map(([val, sub, lbl]) =>
          el('div', { class: 'cs-chip' },
            el('div', { class: 'cs-val'   }, String(val)),
            el('div', { class: 'cs-label' }, lbl),
            sub ? el('div', { class: 'cs-detail' }, String(sub)) : null
          )
        )
      )
    ),
    // Proficiencies
    el('div', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Владения')),
      el('div', { class: 'panel-body' },
        el('div', { class: 'prof-list' },
          el('div', { class: 'prof-row' },
            el('span', { class: 'prof-cat' }, 'Спасбр.'),
            el('div',  { class: 'prof-tags' },
              saves.length
                ? saves.map(s => el('span', { class: 'prof-tag class-t' }, saveNames[s]))
                : [el('span', { class: 'prof-tag' }, '—')]
            )
          ),
          el('div', { class: 'prof-row' },
            el('span', { class: 'prof-cat' }, 'Навыки'),
            el('div',  { class: 'prof-tags' },
              ...bgSkills(state).map(s => el('span', { class: 'prof-tag bg-t' }, s)),
              ...[...state.chosen].map(s => el('span', { class: 'prof-tag class-t' }, s)),
            )
          )
        )
      )
    ),
    // Equipment
    buildEquipPanel(state, refresh)
  );
}

function buildActionBar(state, router) {
  const spent = pbSpent(state.stats);
  const valid = state.name.trim() && state.class && state.race && state.background && spent <= PB_POOL;
  const hint  = !state.name.trim()    ? 'Введи имя персонажа'
    : !state.class                    ? 'Выбери класс'
    : !state.race                     ? 'Выбери расу'
    : !state.background               ? 'Выбери предысторию'
    : spent > PB_POOL                 ? `Превышен лимит: ${spent}/${PB_POOL} очков`
    : `Готово · потрачено ${spent}/${PB_POOL} очков`;

  const saveBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      if (!valid) return;
      const final = {};
      for (const { key } of ABILITIES) final[key] = totalStat(state, key);
      const cls   = CLASSES[state.class];
      const maxHp = Math.max(1, cls.die + mod(final.con));

      await DB.put({
        name:       state.name.trim(),
        playerName: state.playerName.trim(),
        edition:    state.edition,
        class:      state.class,
        subclass:   '',
        race:       state.race,
        subrace:    state.subrace,
        background: state.background,
        alignment:  state.alignment,
        level:      1,
        stats:      final,
        skills:     [...state.chosen, ...bgSkills(state)],
        maxHp,
        hp:         maxHp,
        status:     'active',
        favorite:   false,
      });
      toast('Персонаж создан!', 'success');
      router.navigate('/');
    },
  }, 'Создать →');

  if (!valid) saveBtn.disabled = true;

  return el('div', { class: 'create-action-bar' },
    el('span', { class: 'bar-hint' }, hint),
    el('div',  { class: 'bar-btns' },
      el('button', { class: 'btn btn-ghost', onClick: () => router.navigate('/') }, '← Назад'),
      saveBtn
    )
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function renderCreate(container, router, _params = {}) {
  container.innerHTML = '';
  const ha = document.getElementById('header-actions');
  if (ha) ha.innerHTML = '';

  const state = {
    edition:    '2014',
    name:       '',
    playerName: '',
    class:      '',
    race:       '',
    subrace:    '',
    background: '',
    alignment:  '',
    stats:      { str:8, dex:8, con:8, int:8, wis:8, cha:8 },
    chosen:     new Set(),
    equipMode:  'standard',
    equipGold:  null,
  };

  let strip, body, bar;

  function buildStrip(st) {
    return el('div', { class: 'identity-strip' }, buildIdRow(st, refresh));
  }

  function buildBody(st) {
    return el('div', { class: 'create-body' },
      el('div', { class: 'stats-area' },
        buildPbHeader(st),
        el('div', { class: 'stats-grid' },
          ...ABILITIES.map(ab => buildAbBlock(st, ab, refresh))
        )
      ),
      buildRightPanel(st, refresh)
    );
  }

  function refresh() {
    const s2 = buildStrip(state);
    const b2 = buildBody(state);
    const r2 = buildActionBar(state, router);
    strip.replaceWith(s2); strip = s2;
    body.replaceWith(b2);  body  = b2;
    bar.replaceWith(r2);   bar   = r2;
  }

  strip = buildStrip(state);
  body  = buildBody(state);
  bar   = buildActionBar(state, router);

  container.append(strip, body, bar);
}
