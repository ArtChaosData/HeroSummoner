/**
 * HeroSummoner — Create Character (new flow)
 * Steps: landing → concept | mechanics
 */
import { el } from '../utils.js';

// ─── State ────────────────────────────────────────────────────────────────────

function freshState() {
  return {
    step:       'landing',
    // concept
    name: '', playerName: '', alignment: '',
    age:  '', height: '', weight: '', eyes: '', skin: '', hair: '',
    traits: '', ideals: '', bonds: '', flaws: '',
    appearance: '', backstory: '', allies: '', features: '', treasure: '',
    portrait: null,
    // mechanics
    mecStep:     'edition',
    mecMaxStep:  0,
    mecEdition:  null,
    mecSources:  [],
    mecClass:      null,
    mecRace:       null,
    mecSubrace:    null,
    mecBackground: null,
  };
}

let _st = null;

// ─── Draft persistence (localStorage, 15-min TTL) ─────────────────────────────

const DRAFT_KEY = 'hs_create_draft';
const DRAFT_TTL = 15 * 60 * 1000;
let _saveTimer  = null;

function saveDraft(st) {
  try {
    // Exclude step (URL owns it) and portrait (base64 too large for localStorage)
    const { step: _step, portrait: _portrait, ...data } = st;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > DRAFT_TTL) { localStorage.removeItem(DRAFT_KEY); return null; }
    return data;
  } catch { return null; }
}

function scheduleSave(st) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveDraft(st), 800);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(label, key, st, { rows, placeholder = '' } = {}) {
  const isArea = rows > 1;
  const inp = isArea
    ? el('textarea', { class: 'cnew-textarea', rows: String(rows), placeholder })
    : el('input',    { class: 'cnew-input',    type: 'text',        placeholder });
  inp.value = st[key] || '';
  inp.addEventListener('input', () => { st[key] = inp.value; scheduleSave(st); });
  return el('div', { class: 'cnew-field' },
    el('label', { class: 'cnew-label' }, label),
    inp,
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function buildLanding(st, go) {
  const nameInp = el('input', {
    class: 'cnew-name-input', type: 'text', placeholder: 'Имя персонажа',
  });
  nameInp.value = st.name;
  nameInp.addEventListener('input', () => { st.name = nameInp.value; scheduleSave(st); });

  return el('div', { class: 'cnew-landing' },
    el('div', { class: 'cnew-landing-card' },

      el('div', { class: 'cnew-name-block' },
        nameInp,
        el('p', { class: 'cnew-name-hint' },
          'Так мы узнаем, кого мы призовём. Не беспокойтесь — имя можно будет поменять во вкладке «Концепт».'
        ),
      ),

      el('p', { class: 'cnew-order-hint' },
        'Начните с концепта или механики — порядок не важен, мы сохраним ваш прогресс.'
      ),

      el('div', { class: 'cnew-big-btns' },
        el('button', { class: 'cnew-big-btn', onClick: () => go('concept') },
          el('span', { class: 'cnew-big-btn-icon',  html: SVG_CONCEPT }),
          el('span', { class: 'cnew-big-btn-title' }, 'Концепт'),
          el('span', { class: 'cnew-big-btn-sub'   }, 'Внешность, история, характер'),
        ),
        el('button', { class: 'cnew-big-btn cnew-big-btn--secondary', onClick: () => go('mechanics') },
          el('span', { class: 'cnew-big-btn-icon',  html: SVG_MECHANICS }),
          el('span', { class: 'cnew-big-btn-title' }, 'Механика'),
          el('span', { class: 'cnew-big-btn-sub'   }, 'Класс, характеристики, умения'),
        ),
      ),
    ),
  );
}

// ─── Concept screen ───────────────────────────────────────────────────────────

function sec(title, ...children) {
  return el('div', { class: 'cnew-sec' },
    el('p', { class: 'cnew-sec-title' }, title),
    ...children,
  );
}

function buildConcept(st, go) {

  // Portrait upload
  const fileInp = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const portrait = el('div', { class: 'cnew-portrait', onClick: () => fileInp.click() });

  function renderPortrait() {
    portrait.innerHTML = '';
    portrait.append(st.portrait
      ? el('img', { class: 'cnew-portrait-img', src: st.portrait, alt: '' })
      : el('div', { class: 'cnew-portrait-ph' },
          el('span', { class: 'cnew-portrait-ph-icon', html: SVG_CAMERA }),
          el('span', {}, 'Аватар'),
        )
    );
  }
  renderPortrait();
  fileInp.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { st.portrait = ev.target.result; renderPortrait(); };
    reader.readAsDataURL(file);
  });

  // Physical traits
  const PHYS = [
    ['Возраст','age'],['Рост','height'],['Вес','weight'],
    ['Глаза','eyes'],['Кожа','skin'],['Волосы','hair'],
  ];
  const physGrid = el('div', { class: 'cnew-phys-row' },
    ...PHYS.map(([label, key]) => {
      const inp = el('input', { class: 'cnew-phys-input', type: 'text' });
      inp.value = st[key] || '';
      inp.addEventListener('input', () => { st[key] = inp.value; scheduleSave(st); });
      return el('div', { class: 'cnew-phys-field' },
        el('label', { class: 'cnew-phys-label' }, label), inp,
      );
    }),
  );

  return el('div', { class: 'cnew-concept' },

    // Header
    el('div', { class: 'cnew-concept-hd' },
      el('span', { class: 'cnew-concept-hd-title' }, 'Концепт'),
      el('button', { class: 'cnew-back-btn', onClick: () => go('landing') }, '← Назад'),
    ),

    // ── Блок 1: Личность ─────────────────────────────────────────────────────
    sec('Личность',
      el('div', { class: 'cnew-identity-row' },
        field('Имя персонажа', 'name',       st, { placeholder: 'Как зовут героя?' }),
        field('Имя игрока',    'playerName', st, { placeholder: 'Кто за ним?' }),
        field('Мировоззрение', 'alignment',  st, { placeholder: 'Нейтральный…' }),
      ),
    ),

    // ── Блок 2: Внешность + Характер ─────────────────────────────────────────
    el('div', { class: 'cnew-mid' },
      // Внешность: аватар + физические параметры + описание
      sec('Внешность',
        el('div', { class: 'cnew-appear-top' },
          el('div', { class: 'cnew-portrait-wrap' }, portrait, fileInp),
          physGrid,
        ),
        field('Описание', 'appearance', st, { rows: 7, placeholder: 'Как выглядит персонаж…' }),
      ),
      // Характер — возвращён на место
      sec('Характер',
        field('Черты характера', 'traits', st, { rows: 2, placeholder: 'Привычки, причуды…' }),
        field('Идеалы',          'ideals', st, { rows: 2, placeholder: 'Во что верит персонаж…' }),
        field('Привязанности',   'bonds',  st, { rows: 2, placeholder: 'Люди, места, предметы…' }),
        field('Слабости',        'flaws',  st, { rows: 2, placeholder: 'Пороки, страхи…' }),
      ),
    ),

    // ── Блоки на всю ширину ───────────────────────────────────────────────────
    sec('Предыстория',
      field('', 'backstory', st, { rows: 6, placeholder: 'История до начала приключений…' }),
    ),
    sec('Союзники и организации',
      field('', 'allies', st, { rows: 4, placeholder: 'Фракции, покровители, враги…' }),
    ),
    sec('Доп. умения и особенности',
      field('', 'features', st, { rows: 4, placeholder: 'Языки, навыки, способности…' }),
    ),
    sec('Сокровища',
      field('', 'treasure', st, { rows: 4, placeholder: 'Ценные предметы, реликвии…' }),
    ),

    el('div', { class: 'cnew-save-bar' },
      el('button', { class: 'cnew-save-btn', onClick: () => { saveDraft(st); go('landing'); } }, 'Сохранить'),
    ),
  );
}

// ─── Mechanics: constants ─────────────────────────────────────────────────────

const MECH_STEPS = [
  { id: 'edition',    label: 'Редакция' },
  { id: 'class',      label: 'Класс' },
  { id: 'race',       label: 'Раса' },
  { id: 'background', label: 'Предыстория' },
  { id: 'stats',      label: 'Характеристики' },
  { id: 'spells',     label: 'Заклинания', magic: true },
  { id: 'equipment',  label: 'Снаряжение' },
  { id: 'abilities',  label: 'Способности' },
  { id: 'final',      label: 'Финал' },
];

const SOURCEBOOKS = {
  '5e': [
    { id: 'PHB',  name: "Player's Handbook",                      desc: 'Основная книга правил — всегда активна.', locked: true },
    { id: 'XGtE', name: "Xanathar's Guide to Everything",         desc: 'Дополнительные подклассы, заклинания и правила.' },
    { id: 'TCE',  name: "Tasha's Cauldron of Everything",         desc: 'Необязательные правила и новые подклассы.' },
    { id: 'SCAG', name: "Sword Coast Adventurer's Guide",         desc: 'Расы и подклассы Побережья Мечей.' },
    { id: 'MToF', name: "Mordenkainen's Tome of Foes",           desc: 'Расы и монстры высших планов.' },
    { id: 'VGtM', name: "Volo's Guide to Monsters",              desc: 'Нестандартные расы и монстры.' },
    { id: 'MPMM', name: "Mordenkainen Presents: Monsters of the Multiverse", desc: 'Обновлённые расы и монстры мультивселенной.' },
    { id: 'VRGR', name: "Van Richten's Guide to Ravenloft",      desc: 'Сеттинг ужасов и подклассы.' },
    { id: 'SCC',  name: "Strixhaven: A Curriculum of Chaos",     desc: 'Академия магии — расы и подклассы.' },
    { id: 'WBW',  name: "The Wild Beyond the Witchlight",        desc: 'Фейские расы и приключения.' },
    { id: 'MOT',  name: "Mythic Odysseys of Theros",             desc: 'Греческий сеттинг — расы и подклассы.' },
    { id: 'GGR',  name: "Guildmasters' Guide to Ravnica",        desc: 'Сеттинг Равники — расы и гильдии.' },
    { id: 'RLW',  name: "Eberron: Rising from the Last War",     desc: 'Сеттинг Эберрона — расы и подклассы.' },
    { id: 'SAS',  name: "Spelljammer: Adventures in Space",      desc: 'Космические расы и правила.' },
    { id: 'AI',   name: "Acquisitions Incorporated",             desc: 'Корпоративные правила и подкласс.' },
    { id: 'POA',  name: "Princes of the Apocalypse",             desc: 'Приключение с доп. заклинаниями и предметами.' },
    { id: 'TP',   name: "Tortle Package",                        desc: 'Раса Черепахолюдей.' },
    { id: 'OGA',  name: "One Grung Above",                       desc: 'Раса Гранг.' },
    { id: 'LR',   name: "Locathah Rising",                       desc: 'Раса Локата.' },
  ],
  'one-dnd': [
    { id: 'PHB24', name: "Player's Handbook 2024", desc: 'Обновлённая Книга Игрока — всегда активна.', locked: true },
  ],
};

// ─── Sourcebook content (races + subclasses) ──────────────────────────────────
// subs: [[ClassName, sub1, sub2, ...], ...]

const SRC_CONTENT = {
  PHB: {
    races: [
      'Дварф (Горный)', 'Дварф (Холмовой)',
      'Эльф (Высший)', 'Эльф (Лесной)', 'Дроу',
      'Полурослик (Легконогий)', 'Полурослик (Крепкий)',
      'Человек', 'Человек (Вариант)',
      'Драконид',
      'Гном (Каменный)', 'Гном (Лесной)',
      'Полуэльф', 'Полуорк', 'Тифлинг',
    ],
    subs: [],
  },
  XGtE: {
    rules: 'Расширяет правила инструментов, отдыха, встреч и ловушек.',
    races: [],
    subs: [
      ['Варвар',    'Путь Предка-Стража', 'Путь Вихря Бури', 'Путь Ревностного'],
      ['Бард',      'Коллегия Гламура', 'Коллегия Мечей', 'Коллегия Шёпота'],
      ['Жрец',      'Домен Кузницы', 'Домен Могилы'],
      ['Друид',     'Круг Снов', 'Круг Пастыря'],
      ['Воин',      'Аркейнный Стрелок', 'Кавалерист', 'Самурай'],
      ['Монах',     'Путь Пьяного Мастера', 'Путь Кенсэй', 'Путь Солнечной Души'],
      ['Паладин',   'Клятва Завоевания', 'Клятва Искупления'],
      ['Следопыт',  'Преследователь Сумрака', 'Страж Горизонта', 'Истребитель Чудовищ'],
      ['Плут',      'Инквизитор', 'Интриган', 'Разведчик', 'Щёголь'],
      ['Чародей',   'Божественная Душа', 'Тёмная Магия', 'Магия Бурь'],
      ['Колдун',    'Небесный', 'Кормилец Клинков'],
      ['Волшебник', 'Боевая Магия'],
    ],
  },
  TCE: {
    rules: 'Необязательные классовые умения, кастомизация происхождения, сайдкики, групповые покровители.',
    races: [],
    subs: [
      ['Изобретатель', 'Алхимик', 'Доспешник', 'Арсеналист', 'Оружейник'],
      ['Варвар',    'Путь Зверя', 'Путь Дикой Магии'],
      ['Бард',      'Коллегия Созидания', 'Коллегия Красноречия'],
      ['Жрец',      'Домен Порядка', 'Домен Мира', 'Домен Сумерек'],
      ['Друид',     'Круг Звёзд', 'Круг Спор'],
      ['Воин',      'Псионический Рыцарь', 'Рунный Рыцарь'],
      ['Монах',     'Путь Преданности Духу', 'Путь Длинной Смерти (рев.)', 'Путь Четырёх Элементов (рев.)'],
      ['Паладин',   'Клятва Мира', 'Клятва Слав'],
      ['Плут',      'Призрак', 'Пройдоха'],
      ['Чародей',   'Аберрантный Разум', 'Тело Заклинателя'],
      ['Колдун',    'Джинн', 'Безликий'],
      ['Волшебник', 'Хронург', 'Порядок Писцов'],
    ],
  },
  SCAG: {
    races: ['Дварф Серого Пика', 'Дроу (вар.)', 'Эладрин', 'Лесной Гном (дикарь)', 'Полуэльф (вар.)'],
    subs: [
      ['Бард',      'Коллегия Мечей'],
      ['Жрец',      'Домен Арканы'],
      ['Воин',      'Рыцарь Пурпурного Дракона'],
      ['Монах',     'Путь Длинной Смерти', 'Путь Открытой Руки (рев.)'],
      ['Паладин',   'Клятва Короны'],
      ['Плут',      'Мастер Сладкой Речи'],
      ['Колдун',    'Повелитель Клинков'],
      ['Волшебник', 'Воплощение', 'Чертёжник'],
    ],
  },
  MToF: {
    races: ['Гифт', 'Юань-Ти', 'Эладрин', 'Гитьянки', 'Гитзерай', 'Дуэргар', 'Шемасх', 'Деваид'],
    subs: [
      ['Жрец',    'Домен Ковена'],
      ['Паладин', 'Клятва Завоевания (рев.)'],
    ],
  },
  VGtM: {
    races: ['Аасимар', 'Ящеролюд', 'Фирболг', 'Голиаф', 'Кенку', 'Кобольд', 'Орк', 'Табакси', 'Тифлинг (вар.)', 'Тритон', 'Юань-Ти Чистокровный'],
    subs: [],
  },
  MPMM: {
    races: ['Аасимар', 'Autognome', 'Centaur', 'Changeling', 'Duergar', 'Eladrin', 'Fairy', 'Фирболг', 'Гифт', 'Голиаф', 'Гитьянки', 'Гитзерай', 'Harengon', 'Hobgoblin', 'Kenku', 'Кобольд', 'Leonin', 'Ящеролюд', 'Minotaur', 'Орк', 'Satyr', 'Sea Elf', 'Shadar-kai', 'Shifter', 'Simic Hybrid', 'Табакси', 'Tortle', 'Тритон', 'Vedalken', 'Warforged', 'Юань-Ти'],
    subs: [],
  },
  VRGR: {
    races: ['Dhampir', 'Hexblood', 'Reborn'],
    subs: [
      ['Бард',      'Коллегия Духов'],
      ['Следопыт',  'Охотник на Призраков'],
      ['Плут',      'Призрак (рев.)'],
      ['Колдун',    'Духи Нечисти'],
      ['Волшебник', 'Порядок Писцов (рев.)'],
    ],
  },
  SCC: {
    races: ['Owlin'],
    subs: [
      ['Бард',      'Коллегия Красноречия (рев.)'],
      ['Жрец',      'Домен Порядка (рев.)'],
      ['Друид',     'Круг Звёзд (рев.)'],
      ['Воин',      'Псионический Рыцарь (рев.)'],
      ['Паладин',   'Клятва Ваших', 'Клятва Мира (рев.)'],
      ['Следопыт',  'Хранитель Дальнего'],
      ['Плут',      'Пройдоха (рев.)'],
      ['Чародей',   'Аберрантный Разум (рев.)'],
      ['Волшебник', 'Лор Мастер'],
    ],
  },
  WBW:  { races: ['Fairy', 'Harengon'], subs: [] },
  MOT: {
    races: ['Centaur', 'Leonin', 'Minotaur', 'Satyr', 'Тритон'],
    subs: [
      ['Жрец',    'Домен Благословения'],
      ['Паладин', 'Клятва Слав'],
    ],
  },
  GGR: {
    races: ['Centaur', 'Goblin', 'Loxodon', 'Minotaur', 'Simic Hybrid', 'Vedalken'],
    subs: [
      ['Жрец',      'Домен Порядка'],
      ['Паладин',   'Клятва Завоевания (рев.)'],
      ['Плут',      'Инквизитор (рев.)'],
      ['Волшебник', 'Биомаг'],
    ],
  },
  RLW: {
    races: ['Changeling', 'Kalashtar', 'Орк Эберрона', 'Shifter', 'Warforged'],
    subs: [
      ['Воин',      'Рыцарь Метки'],
      ['Монах',     'Путь Четырёх Ветров'],
      ['Следопыт',  'Рейнджер Зверей (рев.)'],
      ['Волшебник', 'Маг Метки'],
    ],
  },
  SAS: {
    races: ['Astral Elf', 'Autognome', 'Giff', 'Hadozee', 'Plasmoid', 'Thri-kreen'],
    subs: [],
  },
  AI: {
    races: [],
    subs: [
      ['Жрец',   'Домен Порядка (рев.)'],
      ['Плут',   'Корпоративный Агент'],
    ],
  },
  POA:  { races: [], subs: [] },
  TP:   { races: ['Tortle'], subs: [] },
  OGA:  { races: ['Grung'], subs: [] },
  LR:   { races: ['Locathah'], subs: [] },
};

function buildSrcBlock(src, c) {
  const bodyRows = [];

  if (c.rules) bodyRows.push(
    el('p', { class: 'mech-pr-rules' }, '⚙ ' + c.rules),
  );

  if (c.races.length) {
    bodyRows.push(el('p', { class: 'mech-pr-section' }, 'Расы:'));
    bodyRows.push(el('div', { class: 'mech-pr-grid' },
      ...c.races.map(r => el('span', { class: 'mech-pr-item' }, r)),
    ));
  }

  if (c.subs.length) {
    bodyRows.push(el('p', { class: 'mech-pr-section' }, 'Подклассы:'));
    bodyRows.push(el('div', { class: 'mech-pr-subs-grid' },
      ...c.subs.map(([cls, ...names]) =>
        el('div', { class: 'mech-pr-cls-block' },
          el('p', { class: 'mech-pr-cls' }, cls + ':'),
          ...names.map(n => el('span', { class: 'mech-pr-item' }, n)),
        )
      ),
    ));
  }

  const details = document.createElement('details');
  details.className = 'mech-src-block';

  const summary = document.createElement('summary');
  summary.className = 'mech-src-block-hd';
  summary.append(
    Object.assign(document.createElement('span'), { className: 'mech-pr-id',   textContent: src.id }),
    Object.assign(document.createElement('span'), { className: 'mech-pr-name', textContent: src.name }),
    Object.assign(document.createElement('span'), { className: 'mech-pr-desc', textContent: ' — ' + src.desc }),
    Object.assign(document.createElement('span'), { className: 'mech-src-chevron', textContent: '▾' }),
  );
  details.append(summary);
  if (bodyRows.length) details.append(el('div', { class: 'mech-src-body' }, ...bodyRows));
  return details;
}

function buildSrcPreview(st) {
  const books = SOURCEBOOKS[st.mecEdition] || [];
  const active = books.filter(b => !b.locked && st.mecSources.includes(b.id));
  if (!active.length) return null;

  const blocks = active.map(src => {
    const c = SRC_CONTENT[src.id];
    return c ? buildSrcBlock(src, c) : null;
  }).filter(Boolean);

  return blocks.length ? el('div', { class: 'mech-src-preview' }, ...blocks) : null;
}

// ─── Mechanics: sourcebook tooltip ───────────────────────────────────────────

let _srcTip = null;
function showSrcTip(e, src) {
  hideSrcTip();
  _srcTip = el('div', { class: 'src-tip' },
    el('strong', { class: 'src-tip-name' }, src.name),
    el('span',   { class: 'src-tip-desc' }, src.desc),
  );
  document.body.append(_srcTip);
  const r = e.target.getBoundingClientRect();
  _srcTip.style.left = r.left + 'px';
  _srcTip.style.top  = (r.bottom + 6) + 'px';
}
function hideSrcTip() { _srcTip?.remove(); _srcTip = null; }

// ─── Mechanics: progress bar ──────────────────────────────────────────────────

function buildMechProgress(st, goMech, magic) {
  const steps  = MECH_STEPS.filter(s => !s.magic || magic);
  const cur    = steps.findIndex(s => s.id === (st.mecStep || 'edition'));
  const maxIdx = st.mecMaxStep || 0;
  return el('nav', { class: 'mech-progress' },
    ...steps.flatMap((s, i) => {
      const reachable = i <= maxIdx;
      const cls = 'mech-step' + (i === cur ? ' is-current' : reachable ? ' is-past' : ' is-future');
      const attrs = { class: cls };
      if (!reachable) attrs.disabled = 'true';
      if (reachable && i !== cur) attrs.onClick = () => goMech(s.id);
      const btn = el('button', attrs, s.label);
      return i < steps.length - 1 ? [btn, el('span', { class: 'mech-sep' }, '›')] : [btn];
    }),
  );
}

// ─── Mechanics: edition step ──────────────────────────────────────────────────

function buildEditionStep(st, goMech) {
  const ed   = st.mecEdition;
  const srcs = ed ? SOURCEBOOKS[ed] : null;

  function selectEd(val) {
    st.mecEdition = val;
    st.mecSources = val === '5e' ? ['PHB'] : ['PHB24'];
    scheduleSave(st);
    goMech('edition');
  }

  // Preview updated in-place — no full re-render on chip toggle
  const previewWrap = el('div', {});
  function refreshPreview() {
    previewWrap.innerHTML = '';
    const p = buildSrcPreview(st);
    if (p) previewWrap.append(p);
  }
  refreshPreview();

  function toggleSrc(id, chipEl) {
    st.mecSources = st.mecSources.includes(id)
      ? st.mecSources.filter(x => x !== id)
      : [...st.mecSources, id];
    chipEl.classList.toggle('is-active', st.mecSources.includes(id));
    scheduleSave(st);
    refreshPreview();
  }

  const ED_META = {
    '5e':      ['2014', 'D&D 5e',    'Классическое издание'],
    'one-dnd': ['2024', 'D&D One',   'Переработанное издание'],
  };

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите редакцию'),

    el('div', { class: 'mech-ed-cards' },
      ...Object.entries(ED_META).map(([val, [year, name, sub]]) =>
        el('button', {
          class: `mech-ed-card${ed === val ? ' is-selected' : ''}`,
          onClick: () => selectEd(val),
        },
          el('span', { class: 'mech-ed-year' }, year),
          el('span', { class: 'mech-ed-name' }, name),
          el('span', { class: 'mech-ed-sub'  }, sub),
        )
      ),
    ),

    srcs ? el('div', { class: 'mech-sources' },
      el('p', { class: 'mech-sources-label' }, 'Дополнения'),
      el('div', { class: 'mech-src-chips' },
        ...srcs.map(src => {
          const chipAttrs = {
            class: `mech-src-chip${st.mecSources.includes(src.id) ? ' is-active' : ''}${src.locked ? ' is-locked' : ''}`,
          };
          if (src.locked) chipAttrs.disabled = 'true';
          else chipAttrs.onClick = e => toggleSrc(src.id, e.currentTarget);
          const chip = el('button', chipAttrs, src.id);
          chip.addEventListener('mouseenter', e => showSrcTip(e, src));
          chip.addEventListener('mouseleave', hideSrcTip);
          return chip;
        }),
      ),
      el('p', { class: 'mech-src-hint' }, 'Если вы не знаете, что выбрать — уточните у Мастера.'),
    ) : null,

    previewWrap,

    ed ? el('div', { class: 'mech-foot' },
      ed === 'one-dnd'
        ? el('button', { class: 'cnew-save-btn mech-foot-wip', disabled: 'true' }, 'В разработке')
        : el('button', { class: 'cnew-save-btn', onClick: () => goMech('class') }, 'Далее → Класс'),
    ) : null,
  );
}

// ─── Mechanics: main wrapper ──────────────────────────────────────────────────

function buildMechanics(st, go, container) {
  if (!st.mecStep)    st.mecStep    = 'edition';
  if (!st.mecSources) st.mecSources = [];

  const magic = false; // will be true once a spellcasting class is selected

  function goMech(step) {
    st.mecStep = step;
    const idx = MECH_STEPS.findIndex(s => s.id === step);
    if (idx > (st.mecMaxStep || 0)) st.mecMaxStep = idx;
    scheduleSave(st);
    container.innerHTML = '';
    container.append(buildMechanics(st, go, container));
  }

  return el('div', { class: 'mech-wrap' },
    el('div', { class: 'mech-header' },
      el('span', { class: 'cnew-concept-hd-title' }, 'Механика'),
      el('button', { class: 'cnew-back-btn', onClick: () => go('landing') }, '← Назад'),
    ),
    buildMechProgress(st, goMech, magic),
    el('div', { class: 'mech-content' },
      st.mecStep === 'edition'      ? buildEditionStep(st, goMech)
        : st.mecStep === 'class'      ? buildClassStep(st, goMech)
        : st.mecStep === 'race'       ? buildRaceStep(st, goMech)
        : st.mecStep === 'background' ? buildBackgroundStep(st, goMech)
        : el('div', { class: 'cnew-wip' }, st.mecStep + ' — скоро'),
    ),
  );
}

// ─── Class step: data ─────────────────────────────────────────────────────────

const ROLE_DESC = {
  'Танк':       'Держит удар, привлекает внимание врагов на себя.',
  'Дамагер':    'Наносит максимальный урон за раунд.',
  'Дизейблер':  'Контролирует поле боя — станы, замедления, страх.',
  'Саппорт':    'Усиливает союзников, лечит, защищает.',
  'Скаут':      'Разведка, мобильность, работа в тени.',
  'Социальщик': 'Переговоры, обман, убеждение.',
};
function rpLabel(cls) {
  if (cls.rp === 1) return 'Требуется минимальный отыгрыш';
  if (cls.rp === 2) return 'Нужно не забывать про отыгрыш';
  return `Отыгрыш — важная часть игры за ${cls.gen}`;
}

const CLASS_DATA = [
  { id: 'barbarian',  name: 'Варвар',        gen: 'Варвара',       roles: ['Танк', 'Дамагер'],                    rp: 1, stats: 'Сила, Телосложение',           desc: 'Воин, черпающий силу из первобытной ярости. Мощные атаки и природная живучесть без магии.' },
  { id: 'bard',       name: 'Бард',          gen: 'Барда',         roles: ['Дизейблер', 'Саппорт', 'Социальщик'], rp: 3, stats: 'Харизма',                         desc: 'Маг и артист, вдохновляющий союзников и дурачащий врагов. Универсальный класс с широким набором заклинаний.' },
  { id: 'cleric',     name: 'Жрец',          gen: 'Жреца',         roles: ['Саппорт', 'Танк'],                    rp: 2, stats: 'Мудрость',                         desc: 'Служитель бога, несущий свет или тьму по его воле. Лучший целитель в игре с доступом к тяжёлым доспехам.' },
  { id: 'druid',      name: 'Друид',         gen: 'Друида',        roles: ['Саппорт', 'Дизейблер'],               rp: 2, stats: 'Мудрость',                         desc: 'Страж природы, меняющий облик и повелевающий стихиями. Гибкий класс с уникальными формами зверей.' },
  { id: 'fighter',    name: 'Воин',          gen: 'Воина',         roles: ['Танк', 'Дамагер'],                    rp: 1, stats: 'Сила или Ловкость, Телосложение',  desc: 'Мастер боя с любым оружием и доспехами. Простой в освоении, эффективный на любом уровне.' },
  { id: 'monk',       name: 'Монах',         gen: 'Монаха',        roles: ['Дамагер', 'Скаут', 'Дизейблер'],      rp: 1, stats: 'Ловкость, Мудрость',              desc: 'Аскет, преобразующий внутреннюю энергию ки в боевые приёмы. Быстрый и мобильный ближний боец.' },
  { id: 'paladin',    name: 'Паладин',       gen: 'Паладина',      roles: ['Танк', 'Саппорт'],                    rp: 3, stats: 'Сила, Харизма',                   desc: 'Священный воин, связанный клятвой служения. Сочетает тяжёлые доспехи с мощными заклинаниями.' },
  { id: 'ranger',     name: 'Следопыт',      gen: 'Следопыта',     roles: ['Скаут', 'Дамагер'],                   rp: 1, stats: 'Ловкость, Мудрость',              desc: 'Охотник и следопыт, мастер дальних пространств. Специализируется на конкретном враге или местности.' },
  { id: 'rogue',      name: 'Плут',          gen: 'Плута',         roles: ['Скаут', 'Дамагер', 'Социальщик'],     rp: 1, stats: 'Ловкость',                         desc: 'Хитрец и мастер теней. Наносит огромный урон из засады и незаменим в разведке.' },
  { id: 'sorcerer',   name: 'Чародей',       gen: 'Чародея',       roles: ['Дамагер', 'Саппорт'],                 rp: 2, stats: 'Харизма',                         desc: 'Маг с врождённой магией в крови. Меньше заклинаний, чем у волшебника, но больше гибкости в их использовании.' },
  { id: 'warlock',    name: 'Колдун',        gen: 'Колдуна',       roles: ['Дамагер', 'Дизейблер'],               rp: 3, stats: 'Харизма',                         desc: 'Смертный, заключивший сделку с могущественным существом. Восстанавливает слоты заклинаний на коротком отдыхе.' },
  { id: 'wizard',     name: 'Волшебник',     gen: 'Волшебника',    roles: ['Дамагер', 'Саппорт', 'Дизейблер'],    rp: 2, stats: 'Интеллект',                       desc: 'Учёный магии с самым широким арсеналом заклинаний. Требует подготовки, но открывает огромные возможности.' },
  { id: 'artificer',  name: 'Изобретатель',  gen: 'Изобретателя',  roles: ['Саппорт', 'Дамагер'],                 rp: 2, stats: 'Интеллект',                       tag: 'TCE', desc: 'Мастер магических устройств и зелий. Единственный класс, использующий магические предметы как основной инструмент.' },
];

// ─── Class step: builder ──────────────────────────────────────────────────────

function buildClassStep(st, goMech) {
  const listEl   = el('div', { class: 'mech-cls-list' });
  const detailEl = el('div', { class: 'mech-cls-detail' });

  function updateDetail() {
    detailEl.innerHTML = '';
    const cls = CLASS_DATA.find(c => c.id === st.mecClass);
    if (!cls) {
      detailEl.append(el('p', { class: 'mech-cls-ph' }, 'Выберите класс'));
      return;
    }
    const badges = cls.roles.map(role => {
      const b = el('span', { class: 'mech-cls-role' }, role);
      b.addEventListener('mouseenter', e => showSrcTip(e, { name: role, desc: ROLE_DESC[role] }));
      b.addEventListener('mouseleave', hideSrcTip);
      return b;
    });
    detailEl.append(
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, cls.name),
        el('div', { class: 'mech-cls-roles' }, ...badges),
      ),
      el('p', { class: `mech-cls-rp rp-${cls.rp}` }, rpLabel(cls)),
      el('p', { class: 'mech-cls-rp rp-1' }, 'Ключевые характеристики: ' + cls.stats),
      el('p', { class: 'mech-cls-desc' }, cls.desc),
    );
  }

  function updateList() {
    listEl.innerHTML = '';
    const visible = CLASS_DATA
      .filter(cls => !cls.tag || st.mecSources.includes(cls.tag))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    visible.forEach(cls => {
      const btn = el('button', {
        class: `mech-cls-item${st.mecClass === cls.id ? ' is-selected' : ''}`,
        onClick: () => {
          st.mecClass = cls.id;
          scheduleSave(st);
          listEl.querySelectorAll('.mech-cls-item').forEach(b =>
            b.classList.toggle('is-selected', b.dataset.id === cls.id)
          );
          updateDetail();
          footEl.innerHTML = '';
          footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('race') }, 'Далее → Раса'));
        },
      },
        cls.name,
        cls.tag ? el('span', { class: 'mech-cls-tag' }, cls.tag) : null,
      );
      btn.dataset.id = cls.id;
      listEl.append(btn);
    });
  }

  const footEl = el('div', { class: 'mech-foot' });
  if (st.mecClass) {
    footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('race') }, 'Далее → Раса'));
  }

  updateList();
  updateDetail();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите класс'),
    el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl),
    footEl,
  );
}

// ─── Race data ────────────────────────────────────────────────────────────────

const RACE_DATA = {
  PHB: [
    { name: 'Дварф',      sub: ['Горный', 'Холмовой'],       desc: 'Стойкий подземный народ с многовековой традицией кузнечного дела и горной добычи. Непоколебимы в бою, верны клану и слову.' },
    { name: 'Эльф',       sub: ['Высший', 'Лесной', 'Дроу'], desc: 'Долгоживущий изящный народ с врождённой связью с магией. Острые чувства, природная грация и глубокая память делают эльфов превосходными магами и лучниками.' },
    { name: 'Полурослик', sub: ['Легконогий', 'Крепкий'],    desc: 'Небольшой, но бесстрашный народ. Природная удача и умение оставаться в тени помогают им выходить из самых сложных переделок.' },
    { name: 'Человек',    sub: ['Стандартный', 'Вариант'],   desc: 'Самая распространённая и разнообразная раса. Люди быстро учатся и адаптируются, нередко превосходя другие народы за счёт амбиций.' },
    { name: 'Драконид',   sub: [],                           desc: 'Гордый народ с чешуёй и кровью дракона. Наделены оружейным дыханием и врождённой устойчивостью к стихиям.' },
    { name: 'Гном',       sub: ['Каменный', 'Лесной'],       desc: 'Любопытный изобретательный народ, живущий столетиями. Прирождённые учёные и механики с природной устойчивостью к магии.' },
    { name: 'Полуэльф',   sub: [],                           desc: 'Наследники двух миров — человеческой гибкости и эльфийской грации. Харизматичны, универсальны и умеют ладить с кем угодно.' },
    { name: 'Полуорк',    sub: [],                           desc: 'Потомки людей и орков, наследующие выносливость обоих. Физически мощны и не уступают там, где другие давно сложили бы оружие.' },
    { name: 'Тифлинг',   sub: [],                           desc: 'Потомки людей с инфернальным наследием от давнего дьявольского договора. Несмотря на предрассудки, многие тифлинги куют собственную судьбу.' },
  ],
  SCAG: [
    { name: 'Дварф Серого Пика', sub: [],                           desc: 'Горные дварфы, укрывшиеся в Горах Серого Пика. Суровее своих собратьев, с природной магией земли.' },
    { name: 'Эладрин',           sub: ['Весенний', 'Летний', 'Осенний', 'Зимний'], desc: 'Эльфы Страны Фей, чей облик и настрой меняется вместе со временами года. Непредсказуемы и прекрасны.' },
    { name: 'Дроу (Восход)',     sub: [],                           desc: 'Дроу, отвергнувшие культ Ллос и поднявшиеся на поверхность. Несут тяжесть прошлого, но выбирают собственный путь.' },
    { name: 'Полуэльф (вар.)',   sub: [],                           desc: 'Вариант полуэльфа с улучшенными расовыми чертами, привязанными к эльфийскому наследию.' },
  ],
  MToF: [
    { name: 'Гитьянки',  sub: [], desc: 'Воинственные завоеватели Астрального плана. Жёсткая иерархия, телепатия и врождённое владение псионикой.' },
    { name: 'Гитзерай',  sub: [], desc: 'Монахи и философы, ищущие совершенства разума. Мастера псионики и самодисциплины.' },
    { name: 'Эладрин',   sub: ['Весенний', 'Летний', 'Осенний', 'Зимний'], desc: 'Фейские эльфы, воплощающие силу времён года. Могут менять подрасу на длинном отдыхе.' },
    { name: 'Гифт',      sub: [], desc: 'Астральные торговцы с телепатическими способностями и природной тягой к торговле и дипломатии.' },
    { name: 'Юань-Ти',   sub: [], desc: 'Потомки людей, смешавших кровь со змеями. Холодны, расчётливы и устойчивы к магии.' },
    { name: 'Шемасх',    sub: [], desc: 'Демонические гуманоиды, порождённые Пучиной. Хаотичны, непредсказуемы, но обладают мощными врождёнными способностями.' },
    { name: 'Деваид',    sub: [], desc: 'Небесные гуманоиды из Семи Небес. Благородны, излучают свет и несут в себе часть небесной силы.' },
    { name: 'Дуэргар',   sub: [], desc: 'Серые дварфы Подземья, порабощённые иллитидами. Мрачны, выносливы, обладают псионической невидимостью и ростом.' },
  ],
  VGtM: [
    { name: 'Аасимар',   sub: ['Защитник', 'Каратель', 'Падший'], desc: 'Потомки небесных существ, несущие в душе искру горнего света. Каждый аасимар — воплощение своей небесной линии.' },
    { name: 'Фирболг',   sub: [], desc: 'Великаноподобные лесные отшельники, говорящие с природой. Предпочитают мир войне, но страшны в схватке.' },
    { name: 'Голиаф',    sub: [], desc: 'Горные гиганты, живущие по строгому кодексу чести. Каждый поступок оценивается общиной — слабости недопустимы.' },
    { name: 'Кенку',     sub: [], desc: 'Птицеподобные имитаторы, утратившие собственный голос. Общаются звуками и фразами из памяти, мастера маскировки.' },
    { name: 'Кобольд',   sub: [], desc: 'Маленькие чешуйчатые существа, живущие стаями. Компенсируют слабость числом, ловушками и неугасимой трусостью.' },
    { name: 'Ящеролюд',  sub: [], desc: 'Хладнокровные рептилии с практичным взглядом на мир. Не знают эмоций в человеческом смысле, зато обладают природными доспехами.' },
    { name: 'Орк',       sub: [], desc: 'Мощные воины с силой и выносливостью, превосходящими большинство рас. Движимы первобытной страстью к схватке.' },
    { name: 'Табакси',   sub: [], desc: 'Кошачьи следопыты из далёких джунглей. Непревзойдённые скалолазы, бегуны и охотники за редкими знаниями.' },
    { name: 'Тритон',    sub: [], desc: 'Морской народ, веками охранявший глубины от тьмы. Гордятся своей миссией и с трудом привыкают к жизни на суше.' },
    { name: 'Юань-Ти (Чистокровный)', sub: [], desc: 'Наиболее человекоподобные из юань-ти, скрывающие змеиную природу под внешностью людей. Устойчивы к ядам и магии.' },
  ],
  MPMM: [
    { name: 'Аасимар',   sub: ['Защитник', 'Каратель', 'Падший'], desc: 'Обновлённые правила аасимара из MPMM. Небесное наследие с гибкой настройкой характеристик.' },
    { name: 'Centaur',   sub: [], desc: 'Полулюди-полукони с природной скоростью и силой копыт.' },
    { name: 'Changeling', sub: [], desc: 'Оборотни-социальщики, меняющие облик по желанию.' },
    { name: 'Duergar',   sub: [], desc: 'Серые дварфы Подземья с псионической невидимостью.' },
    { name: 'Эладрин',   sub: ['Весенний', 'Летний', 'Осенний', 'Зимний'], desc: 'Фейские эльфы со сменой сезонных подрас.' },
    { name: 'Fairy',     sub: [], desc: 'Крылатый фейский народ с природной магией.' },
    { name: 'Фирболг',   sub: [], desc: 'Лесные великаны с даром природной магии.' },
    { name: 'Гифт',      sub: [], desc: 'Астральные телепаты-торговцы.' },
    { name: 'Голиаф',    sub: [], desc: 'Горные гиганты, живущие по кодексу чести.' },
    { name: 'Harengon',  sub: [], desc: 'Зайцеподобный фейский народ с природной удачей.' },
    { name: 'Кенку',     sub: [], desc: 'Птицеподобные имитаторы без собственного голоса.' },
    { name: 'Кобольд',   sub: [], desc: 'Маленькие чешуйчатые существа, сильные в стае.' },
    { name: 'Leonin',    sub: [], desc: 'Гордый львиноподобный народ с природным бесстрашием.' },
    { name: 'Ящеролюд',  sub: [], desc: 'Хладнокровные рептилии с практичным взглядом на мир.' },
    { name: 'Minotaur',  sub: [], desc: 'Мощные быкоголовые воины с природной стойкостью.' },
    { name: 'Орк',       sub: [], desc: 'Выносливые воины с первобытной страстью к схватке.' },
    { name: 'Satyr',     sub: [], desc: 'Козлоногий фейский народ, устойчивый к магии.' },
    { name: 'Табакси',   sub: [], desc: 'Кошачьи следопыты — мастера скорости и лазанья.' },
    { name: 'Тритон',    sub: [], desc: 'Морской народ, стражи глубин.' },
    { name: 'Warforged', sub: [], desc: 'Живые боевые конструкты из металла и дерева. Не нуждаются в сне и пище, но стремятся понять смысл своего существования.' },
    { name: 'Юань-Ти',  sub: [], desc: 'Змеелюди с холодным расчётом и устойчивостью к яду.' },
  ],
  VRGR: [
    { name: 'Dhampir',   sub: [], desc: 'Полувампиры на грани двух природ. Питаются жизненной силой, но сохраняют разум живых.' },
    { name: 'Hexblood',  sub: [], desc: 'Отмеченные ведьминым договором. Несут в себе тёмную магию фей и чувствуют сверхъестественное.' },
    { name: 'Reborn',    sub: [], desc: 'Вернувшиеся из смерти с туманными воспоминаниями. Устойчивы к яду и болезням, не нуждаются во сне.' },
  ],
  WBW: [
    { name: 'Fairy',    sub: [], desc: 'Крылатый народ Страны Фей с природной магией и способностью летать.' },
    { name: 'Harengon', sub: [], desc: 'Зайцеподобные существа из Страны Фей с природной удачей и невероятной прыжковой способностью.' },
  ],
  MOT: [
    { name: 'Centaur',  sub: [], desc: 'Гордый народ полулюдей-полуконей из мира Терос. Быстры, сильны и верны традициям предков.' },
    { name: 'Leonin',   sub: [], desc: 'Величественный львиноподобный народ, хранящий независимость от богов Терос.' },
    { name: 'Minotaur', sub: [], desc: 'Быкоголовые воители с природной яростью и острым чутьём к опасности.' },
    { name: 'Satyr',    sub: [], desc: 'Козлоногие гуляки, устойчивые к любой магии. Обожают веселье и ценят свободу превыше всего.' },
    { name: 'Тритон',   sub: [], desc: 'Морской народ, посланный богами охранять побережья Терос.' },
  ],
  GGR: [
    { name: 'Centaur',      sub: [], desc: 'Полулюди-полукони из гильдии Груул — дикие и свободолюбивые.' },
    { name: 'Goblin',       sub: [], desc: 'Маленькие хитрые существа, члены гильдии Имеркул. Умны, злопамятны и мастерски прячутся.' },
    { name: 'Loxodon',      sub: [], desc: 'Слоноподобный народ гильдии Селесния — мудрые, спокойные и физически мощные.' },
    { name: 'Minotaur',     sub: [], desc: 'Быкоголовые воины гильдии Боррос — прямолинейны, яростны и верны долгу.' },
    { name: 'Simic Hybrid', sub: [], desc: 'Люди и мерфолки, модифицированные магией Симика. Несут черты морских существ — плавники, жабры, щупальца.' },
    { name: 'Vedalken',     sub: [], desc: 'Синекожие интеллектуалы гильдии Иззет. Рациональны, холодны и одержимы совершенством.' },
  ],
  RLW: [
    { name: 'Changeling', sub: [], desc: 'Оборотни Эберрона с даром принимать любой облик. Прирождённые шпионы и дипломаты.' },
    { name: 'Kalashtar',  sub: [], desc: 'Люди, сросшиеся с духами кварри. Псионические способности и природная защита от зла снов.' },
    { name: 'Орк Эберрона', sub: [], desc: 'Орки Эберрона — стражи природы и духов, а не просто варвары. Гармонируют с миром иначе, чем их аналоги из других сеттингов.' },
    { name: 'Shifter',    sub: ['Beasthide', 'Longtooth', 'Swiftstride', 'Wildhunt'], desc: 'Потомки ликантропов Эберрона, способные временно усиливать звериные черты.' },
    { name: 'Warforged',  sub: [], desc: 'Боевые конструкты, созданные для Последней Войны. Теперь ищут своё место в мире, который их больше не нуждается в бою.' },
  ],
  SAS: [
    { name: 'Astral Elf', sub: [], desc: 'Эльфы, живущие в вечности Астрального плана. Медитация заменяет им сон, а время для них почти остановилось.' },
    { name: 'Autognome',  sub: [], desc: 'Самосозданные гномьи конструкты, вырвавшиеся на свободу. Механическое тело, но живой разум.' },
    { name: 'Giff',       sub: [], desc: 'Бегемотоподобные наёмники с любовью к огнестрельному оружию и военной дисциплине.' },
    { name: 'Hadozee',    sub: [], desc: 'Обезьяноподобные моряки с перепончатыми крыльями. Прирождённые вахтенные и воздушные акробаты.' },
    { name: 'Plasmoid',   sub: [], desc: 'Разумные амёбы, принимающие любую форму. Могут сжиматься в щели и поглощать предметы.' },
    { name: 'Thri-kreen', sub: [], desc: 'Насекомоподобные охотники с четырьмя руками и природной телепатией. Никогда не спят.' },
  ],
  TP:  [{ name: 'Tortle',    sub: [], desc: 'Черепахолюди с природным панцирем вместо доспехов. Мудрые, медлительные и невозмутимые странники.' }],
  OGA: [{ name: 'Grung',     sub: [], desc: 'Ядовитые лягушкоподобные существа из джунглей. Высокомерны и считают все другие расы ниже себя.' }],
  LR:  [{ name: 'Locathah',  sub: [], desc: 'Рыбоподобный прибрежный народ, долго пребывавший в рабстве. Восстание дало им свободу и несгибаемую волю.' }],
  AI:  [],
  POA: [],
  XGtE: [],
  TCE: [],
};

// ─── Background data ──────────────────────────────────────────────────────────

const BACKGROUND_DATA = {
  PHB: [
    {
      name: 'Аколит',
      skills: 'Проницательность, Религия',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы провели годы, служа в храме — помогали жрецам проводить ритуалы, ухаживали за святилищем и наставляли верующих. Годы смиренного служения сформировали вашу веру, и теперь вы несёте свет избранного пантеона в широкий мир. Боги вашего храма готовы бесплатно оказывать вам лечебную помощь, а вы можете найти пристанище в любом храме, связанном с вашей верой.',
    },
    {
      name: 'Артист',
      skills: 'Акробатика, Выступление',
      extra: 'Инструменты: один музыкальный инструмент, набор для грима',
      desc: 'Вы умеете привлекать к себе внимание и развлекать толпу. Музыка, акробатика, поэзия или театральное искусство — вы мастер своего дела. Выступая в тавернах, на ярмарках и при дворах знати, вы завоевали поклонников и связи. Артисты и развлекатели могут принять вас и оказать помощь, а публика охотно бросает монеты к вашим ногам.',
    },
    {
      name: 'Беспризорник',
      skills: 'Ловкость рук, Скрытность',
      extra: 'Инструменты: воровские инструменты, набор для грима',
      desc: 'Вы выросли на улицах города без семьи и крова, научившись выживать там, где другие погибли бы. Улица научила вас двигаться незаметно, находить пропитание и ценить каждое убежище. Вы знаете тайные ходы и переулки знакомого города, а среди уличного люда всегда найдёте кров и кусок хлеба в обмен на мелкую услугу.',
    },
    {
      name: 'Благородный',
      skills: 'История, Убеждение',
      extra: 'Инструменты: один игровой набор. Языки: 1 по выбору',
      desc: 'Вы выросли среди богатства, власти и привилегий. Ваша семья владеет землями, имеет авторитет при дворе и поколениями влияет на судьбы региона. Вы знаете придворный этикет, умеете вести себя среди знати и привыкли к тому, что люди обращают внимание на ваш титул. Ваши знакомства открывают двери туда, куда простолюдинам вход закрыт.',
    },
    {
      name: 'Гильдейский мастер',
      skills: 'Проницательность, Убеждение',
      extra: 'Инструменты: один ремесленный инструмент по выбору. Языки: 1 по выбору',
      desc: 'Вы — опытный мастер своего ремесла и полноправный член торговой или ремесленной гильдии. Гильдия — ваша семья: она обеспечивает работу, защиту и социальные связи. В любом городе, где есть отделение вашей гильдии, вы можете рассчитывать на бесплатный ночлег и помощь соратников. Гильдия также поможет с юридической защитой, если дело дойдёт до суда.',
    },
    {
      name: 'Жулик',
      skills: 'Обман, Ловкость рук',
      extra: 'Инструменты: набор для грима, набор мошенника',
      desc: 'Вы всегда умели видеть слабости людей и использовать их в своих целях. Фальшивые личности, ловкий язык, убедительная ложь — всё это ваши главные инструменты. Возможно, вы торговали поддельными снадобьями, продавали "уникальные реликвии" или просто обчищали карманы зазевавшихся богачей. У вас всегда есть запасная легенда, а подобные вам мошенники готовы укрыть вас и передать весточку без лишних вопросов.',
    },
    {
      name: 'Матрос',
      skills: 'Атлетика, Восприятие',
      extra: 'Инструменты: навигационные инструменты, транспортные средства (водные)',
      desc: 'Вы провели годы на море: на торговом судне, рыбацкой шхуне или военном корабле. Жизнь под парусом закалила тело, обострила чувства и научила работать в команде. Вы умеете читать ветер, предсказывать погоду и найдёте общий язык с любым моряком. В портовых городах вам без труда найдётся попутное судно, а морские кабаки встретят вас как своего.',
    },
    {
      name: 'Мудрец',
      skills: 'История, Магия',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы провели годы, погружённых в книги, свитки и манускрипты в поисках знаний о мире. Библиотеки, академии и архивы были вашим домом. Вы изучали историю, магию, естественные науки или богословие — а может быть, всё сразу. Другие учёные и исследователи готовы делиться с вами знаниями в обмен на ваши, а любая крупная библиотека, вероятно, хранит труды, к которым вы имеете доступ.',
    },
    {
      name: 'Народный герой',
      skills: 'Уход за животными, Выживание',
      extra: 'Инструменты: один ремесленный инструмент, транспортные средства (наземные)',
      desc: 'Вы — простой человек из простой семьи, но однажды судьба поставила вас перед выбором, и вы поступили правильно. Теперь люди из вашей деревни или округи смотрят на вас как на заступника и надеются, что вы защитите их от тирании и зла. Простые крестьяне и ремесленники рады помочь вам: спрятать, накормить, передать весть, — ведь вы один из них.',
    },
    {
      name: 'Отшельник',
      skills: 'Медицина, Религия',
      extra: 'Инструменты: набор для трав. Языки: 1 по выбору',
      desc: 'Долгие годы вы провели в уединении вдали от общества — в монастырской келье, лесной хижине или пещере. Одиночество давало вам время для размышлений, молитвы или исследований. Быть может, вы искали ответы на великие вопросы, бежали от преследования или несли суровое покаяние. Теперь за вами стоит открытие или понимание, изменившее ваш взгляд на мир.',
    },
    {
      name: 'Преступник',
      skills: 'Обман, Скрытность',
      extra: 'Инструменты: один игровой набор, воровские инструменты',
      desc: 'До приключений вы нарушали закон — и довольно успешно. Кражи, контрабанда, шантаж или убийства на заказ: у вас за плечами богатый опыт незаконной деятельности. Вы знаете, как связаться с фехтовальщиками краденого, скупщиками информации и другими преступниками. Члены воровских гильдий и уличных банд, как правило, относятся к вам с уважением — или по меньшей мере не мешают.',
    },
    {
      name: 'Скиталец',
      skills: 'Атлетика, Выживание',
      extra: 'Инструменты: один музыкальный инструмент. Языки: 1 по выбору',
      desc: 'Вы выросли вдали от цивилизации — в лесах, тундре, степях или горах. Дикая природа была вашим домом, а племя или семья — всем миром. Вы умеете выживать там, где городской житель обречён на гибель: находить пропитание, строить укрытие и ориентироваться без карт. Люди племён и охотники встретят вас как своего, если вы разделите их обычаи.',
    },
    {
      name: 'Солдат',
      skills: 'Атлетика, Запугивание',
      extra: 'Инструменты: один игровой набор, транспортные средства (наземные)',
      desc: 'Вы долгие годы служили в армии — регулярных войсках, городской страже или наёмном отряде. Война научила вас дисциплине, тактике и тому, как выжить в хаосе битвы. У вас есть звание и послужной список: солдаты и ветераны признают в вас своего, офицеры уважают ваш опыт, а военные лагеря и гарнизоны готовы принять вас.',
    },
  ],
  SCAG: [
    {
      name: 'Городская стража',
      skills: 'Атлетика, Проницательность',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы служили в городской страже или дозоре, охраняя покой мирных жителей от преступников и монстров. Годы патрулирования улиц научили вас читать людей, замечать подозрительное поведение и действовать решительно. Вы знаете, как работают силы правопорядка в большинстве городов, и представители власти склонны прислушиваться к вам.',
    },
    {
      name: 'Клановый мастер',
      skills: 'История, Проницательность',
      extra: 'Инструменты: ремесленные инструменты. Языки: 1 по выбору',
      desc: 'Вы выросли в клане гномов-мастеров или иного народа с богатыми традициями ремесла. Ваши изделия — предмет гордости клана, а секреты мастерства передавались из рук в руки поколениями. Вы умеете ценить качественную работу и сразу видите, когда мастер халтурит. Гномские кланы-мастера повсюду примут вас как равного и помогут с торговыми контактами.',
    },
    {
      name: 'Монастырский учёный',
      skills: 'История + 1 из: Магия, Природа, Религия',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы получили образование в монастырском скриптории или академическом хранилище знаний — месте, где книги переписывались вручную и тщательно охранялись. Вы усвоили строгую методологию и доступ к редким источникам. Учёные заведения обычно готовы предоставить вам доступ к архивам в обмен на помощь с исследованиями, а академики относятся к вам как к коллеге.',
    },
    {
      name: 'Придворный',
      skills: 'Проницательность, Убеждение',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы вращались при королевском или герцогском дворе, постигая тонкости дипломатии, интриг и этикета. Придворная жизнь научила вас читать политические течения, выбирать слова с ювелирной точностью и никогда не показывать истинных намерений. Дворяне и чиновники знакомы с вашим типом: они готовы принять вас на аудиенции там, куда обычный человек не попадёт.',
    },
    {
      name: 'Дальний странник',
      skills: 'Восприятие + 1 по выбору',
      extra: 'Инструменты или языки: 1 по выбору. Языки: 1 по выбору',
      desc: 'Вы пришли из страны настолько далёкой, что большинство людей здесь никогда о ней не слышали. Ваш акцент, одежда и обычаи выдают в вас чужеземца, вызывая у людей смесь восхищения и подозрения. Вы сохранили связи с теми, кто путешествует между мирами и народами, — торговцами дальних маршрутов, дипломатами, лазутчиками.',
    },
    {
      name: 'Наследник',
      skills: 'Выживание + 1 по выбору',
      extra: 'Инструменты: игровой набор или музыкальный инструмент. Языки: 1 по выбору',
      desc: 'Вы унаследовали нечто ценное — старинный артефакт, долг, миссию или тайну. Это наследство определяет ваш путь и не даёт вам покоя. Быть может, вы единственный, кто знает о нём, или, напротив, многие хотят забрать его у вас силой. Те, кто связан с вашим наследством, могут стать союзниками или врагами.',
    },
    {
      name: 'Рыцарь ордена',
      skills: 'Убеждение + 1 по выбору',
      extra: 'Инструменты: 1 по выбору. Языки: 1 по выбору',
      desc: 'Вы посвящены в рыцарский или религиозный орден, преследующий особые цели: защиту слабых, уничтожение зла или охрану реликвий. Орден обеспечивает вас братством, ресурсами и кровом в подконтрольных ему местах. Взамен вы несёте его символ и обязаны блюсти устав. Члены ордена относятся к вам как к брату, а простые люди нередко чтят вашу принадлежность к нему.',
    },
    {
      name: 'Ветеран наёмника',
      skills: 'Атлетика, Убеждение',
      extra: 'Инструменты: один игровой набор, транспортные средства (наземные)',
      desc: 'Вы продавали меч тому, кто платил больше, сражаясь в разных армиях и под разными знамёнами. Наёмная жизнь научила вас оценивать нанимателей, не задавать лишних вопросов и знать, когда пора уходить. Другие ветераны наёмных отрядов узнают вас по манере держаться и охотно делятся слухами о контрактах и войнах.',
    },
    {
      name: 'Городской охотник',
      skills: '3 из: Обман, Скрытность, Проницательность, Убеждение',
      extra: 'Инструменты: 1 по выбору',
      desc: 'Вы охотились за беглецами и разыскиваемыми преступниками в городских трущобах. Ваша работа требовала терпения, умения вживаться в образ и готовности действовать грязными методами. Вы знаете, как найти нужного человека в мегаполисе, а сеть информаторов — таверщики, уличные торговцы, прачки — готова сообщить о передвижениях за небольшую плату.',
    },
    {
      name: 'Член племени Угтардов',
      skills: 'Атлетика, Выживание',
      extra: 'Инструменты: один музыкальный инструмент. Языки: 1 по выбору',
      desc: 'Вы выросли в одном из кочевых племён Угтардов — варварского народа севера Фаэруна, хранящего память о своих предках-великанах. Охота, набеги и жизнь под открытым небом — вот что сформировало вас. Угтарды уважают силу и чтут предков: вы знаете ритуалы, которые позволят вам найти приют у любого отделившегося племени на Севере.',
    },
    {
      name: 'Дворянин Уотердипа',
      skills: 'История, Убеждение',
      extra: 'Инструменты: один игровой набор. Языки: 2 по выбору',
      desc: 'Вы происходите из одной из благородных семей Уотердипа — богатейшего торгового города Побережья Мечей. Ваши связи в городе открывают двери в советы лордов, купеческие клубы и тайные ложи. За пределами Уотердипа ваш титул значит меньше, зато золото и письма с рекомендациями заменяют его с лихвой.',
    },
  ],
  GGR: [
    {
      name: 'Агент Азория',
      skills: 'Проницательность, Убеждение',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы служили в рядах гильдии Азорий — законодательного совета Равники, пишущего законы и толкующего их в судах. Вы хорошо знаете букву закона и умеете использовать её в своих целях. Члены гильдии окажут вам правовую помощь, а в суде у вас есть шанс получить снисхождение, если вы готовы апеллировать к нужным статутам.',
    },
    {
      name: 'Культист Груула',
      skills: 'Атлетика, Запугивание',
      extra: 'Инструменты: один музыкальный инструмент',
      desc: 'Вы принадлежите к дикарским кланам Груул — разрушителей цивилизации, живущих в руинах на краю Равники. Цивилизация для вас — тюрьма, а дикость — освобождение. Члены кланов Груул примут вас в лагере и поделятся пищей, а животные Диких земель чувствуют в вас родственную душу.',
    },
    {
      name: 'Дитя Диммира',
      skills: 'Обман, Скрытность',
      extra: 'Языки: 2 по выбору',
      desc: 'Вы выросли в тенях гильдии Диммир — культа теней и секретов, торгующего информацией и плетущего заговоры. Вас приучили хранить тайны, использовать псевдонимы и никому не доверять полностью. Шпионы Диммира передадут вам засекреченные сведения, если сочтут это выгодным для гильдии.',
    },
  ],
  VRGR: [
    {
      name: 'Преследуемый',
      skills: 'Медицина, Скрытность',
      extra: 'Инструменты: один игровой набор или музыкальный инструмент. Языки: 1 по выбору',
      desc: 'Вы пережили нечто ужасное — нападение монстра, контакт с тёмной магией или трагедию, оставившую след на вашей душе. Кошмары не дают вам покоя, а странные видения порой смешиваются с реальностью. Те, кто также прошёл через ужасы, видят в вас своего и готовы укрыть вас — ведь вы знаете, что значит бояться темноты.',
    },
    {
      name: 'Следователь',
      skills: 'Медицина + 1 по выбору',
      extra: 'Инструменты: 1 по выбору. Языки: 1 по выбору',
      desc: 'Вы методично распутываете тайны: ищете улики, опрашиваете свидетелей и выстраиваете картину произошедшего из разрозненных фрагментов. Вас нанимали для расследования преступлений, исчезновений или сверхъестественных явлений. Информаторы, библиотекари и репортёры охотно общаются с вами — каждый надеется на свою выгоду от вашего расследования.',
    },
  ],
  WBW: [
    {
      name: 'Работник балагана',
      skills: 'Акробатика, Обман',
      extra: 'Инструменты: набор для грима или один музыкальный инструмент',
      desc: 'Вы работали в Балагане Диковин Лускин — таинственном фейском передвижном цирке, путешествующем между мирами. Акробат, дрессировщик, иллюзионист или просто разнорабочий — вы видели чудеса, недоступные смертным. Сотрудники балагана по всему Мультивселенной узнают вас по особому жесту и окажут мелкую помощь.',
    },
  ],
};

// ─── Race step ────────────────────────────────────────────────────────────────

function buildRaceStep(st, goMech) {
  const listEl   = el('div', { class: 'mech-cls-list' });
  const detailEl = el('div', { class: 'mech-cls-detail' });
  const footEl   = el('div', { class: 'mech-foot' });

  function updateDetail() {
    detailEl.innerHTML = '';
    if (!st.mecRace) {
      detailEl.append(el('p', { class: 'mech-cls-ph' }, 'Выберите расу'));
      return;
    }
    const [srcId, raceName] = st.mecRace.split('::');
    const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
    if (!raceObj) return;
    const srcObj = (SOURCEBOOKS[st.mecEdition] || []).find(s => s.id === srcId);

    const badge = el('span', { class: 'mech-race-src-badge' }, srcId);
    if (srcObj) {
      badge.addEventListener('mouseenter', e => showSrcTip(e, srcObj));
      badge.addEventListener('mouseleave', hideSrcTip);
    }

    detailEl.append(
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, raceObj.name),
        badge,
      ),
      el('p', { class: 'mech-cls-desc' }, raceObj.desc),
    );

    if (raceObj.sub.length) {
      detailEl.append(
        el('p', { class: 'mech-pr-section' }, 'Подраса:'),
        el('div', { class: 'mech-subrace-btns' },
          ...raceObj.sub.map(s =>
            el('button', {
              class: `mech-subrace-btn${st.mecSubrace === s ? ' is-selected' : ''}`,
              onClick: () => {
                st.mecSubrace = s;
                scheduleSave(st);
                detailEl.querySelectorAll('.mech-subrace-btn').forEach(b =>
                  b.classList.toggle('is-selected', b.textContent === s)
                );
              },
            }, s)
          ),
        ),
      );
    }
  }

  function selectRace(srcId, raceName) {
    const key = `${srcId}::${raceName}`;
    st.mecRace = key;
    st.mecSubrace = null;
    scheduleSave(st);
    listEl.querySelectorAll('.mech-cls-item').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.key === key)
    );
    updateDetail();
    if (!footEl.querySelector('.cnew-save-btn')) {
      footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('background') }, 'Далее → Предыстория'));
    }
  }

  const books = (SOURCEBOOKS[st.mecEdition] || []).filter(b => st.mecSources.includes(b.id));
  books.forEach(book => {
    const races = (RACE_DATA[book.id] || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!races.length) return;

    const chevron = el('span', { class: 'mech-race-chevron' }, '▾');
    const groupLabel = el('button', { class: 'mech-race-group-hd' },
      el('span', { class: 'mech-race-group-id' }, book.id),
      chevron,
    );
    groupLabel.addEventListener('click', () => {
      const items = listEl.querySelectorAll(`[data-group="${book.id}"]`);
      const hidden = items[0]?.style.display === 'none';
      items.forEach(b => { b.style.display = hidden ? '' : 'none'; });
      chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
    });
    listEl.append(groupLabel);

    races.forEach(race => {
      const key = `${book.id}::${race.name}`;
      const btn = el('button', {
        class: `mech-cls-item${st.mecRace === key ? ' is-selected' : ''}`,
        onClick: () => selectRace(book.id, race.name),
      }, race.name);
      btn.dataset.key   = key;
      btn.dataset.group = book.id;
      listEl.append(btn);
    });
  });

  if (st.mecRace) {
    footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('background') }, 'Далее → Предыстория'));
  }
  updateDetail();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите расу'),
    el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl),
    footEl,
  );
}

// ─── Background step ──────────────────────────────────────────────────────────

function buildBackgroundStep(st, goMech) {
  const listEl   = el('div', { class: 'mech-cls-list' });
  const detailEl = el('div', { class: 'mech-cls-detail' });
  const footEl   = el('div', { class: 'mech-foot' });

  function updateDetail() {
    detailEl.innerHTML = '';
    if (!st.mecBackground) {
      detailEl.append(el('p', { class: 'mech-cls-ph' }, 'Выберите предысторию'));
      return;
    }
    const [srcId, bgName] = st.mecBackground.split('::');
    const bgObj  = (BACKGROUND_DATA[srcId] || []).find(b => b.name === bgName);
    if (!bgObj) return;
    const srcObj = (SOURCEBOOKS[st.mecEdition] || []).find(s => s.id === srcId);

    const badge = el('span', { class: 'mech-race-src-badge' }, srcId);
    if (srcObj) {
      badge.addEventListener('mouseenter', e => showSrcTip(e, srcObj));
      badge.addEventListener('mouseleave', hideSrcTip);
    }

    detailEl.append(
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, bgObj.name),
        badge,
      ),
      el('p', { class: 'mech-cls-desc' }, bgObj.desc),
      el('p', { class: 'mech-cls-rp rp-1' }, 'Навыки: ' + bgObj.skills),
      el('p', { class: 'mech-cls-rp rp-1' }, bgObj.extra),
    );
  }

  function selectBg(srcId, bgName) {
    const key = `${srcId}::${bgName}`;
    st.mecBackground = key;
    scheduleSave(st);
    listEl.querySelectorAll('.mech-cls-item').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.key === key)
    );
    updateDetail();
    if (!footEl.querySelector('.cnew-save-btn')) {
      footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('stats') }, 'Далее → Характеристики'));
    }
  }

  // PHB is always included; other books only if selected
  const allBooks = (SOURCEBOOKS[st.mecEdition] || []).filter(b =>
    b.locked || st.mecSources.includes(b.id)
  );
  allBooks.forEach(book => {
    const bgs = (BACKGROUND_DATA[book.id] || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!bgs.length) return;

    const chevron = el('span', { class: 'mech-race-chevron' }, '▾');
    const groupLabel = el('button', { class: 'mech-race-group-hd' },
      el('span', { class: 'mech-race-group-id' }, book.id),
      chevron,
    );
    groupLabel.addEventListener('click', () => {
      const items = listEl.querySelectorAll(`[data-group="${book.id}"]`);
      const hidden = items[0]?.style.display === 'none';
      items.forEach(b => { b.style.display = hidden ? '' : 'none'; });
      chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
    });
    listEl.append(groupLabel);

    bgs.forEach(bg => {
      const key = `${book.id}::${bg.name}`;
      const btn = el('button', {
        class: `mech-cls-item${st.mecBackground === key ? ' is-selected' : ''}`,
        onClick: () => selectBg(book.id, bg.name),
      }, bg.name);
      btn.dataset.key   = key;
      btn.dataset.group = book.id;
      listEl.append(btn);
    });
  });

  if (st.mecBackground) {
    footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech('stats') }, 'Далее → Характеристики'));
  }
  updateDetail();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите предысторию'),
    el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl),
    footEl,
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

// Font Awesome 5 Solid — hat-wizard (svgicons.com/icon/36308)
const SVG_CONCEPT   = `<svg width="32" height="32" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M496 448H16c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h480c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zm-304-64l-64-32 64-32 32-64 32 64 64 32-64 32-16 32h208l-86.41-201.63a63.955 63.955 0 0 1-1.89-45.45L416 0 228.42 107.19a127.989 127.989 0 0 0-53.46 59.15L64 416h144zm64-224l16-32 16 32 32 16-32 16-16 32-16-32-32-16z"/></svg>`;
// Font Awesome 5 Solid — dice-d20 (svgicons.com/icon/36504)
const SVG_MECHANICS = `<svg width="32" height="32" viewBox="0 0 480 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M106.75 215.06L1.2 370.95c-3.08 5 .1 11.5 5.93 12.14l208.26 22.07zM7.41 315.43L82.7 193.08 6.06 147.1c-2.67-1.6-6.06.32-6.06 3.43v162.81c0 4.03 5.29 5.53 7.41 2.09zm10.84 108.17 194.4 87.66c5.3 2.45 11.35-1.43 11.35-7.26v-65.67l-203.55-22.3c-4.45-.5-6.23 5.59-2.2 7.57zm81.22-257.78L179.4 22.88c4.34-7.06-3.59-15.25-10.78-11.14L17.81 110.35c-2.47 1.62-2.39 5.26.13 6.78zM240 176h109.21L253.63 7.62C250.5 2.54 245.25 0 240 0s-10.5 2.54-13.63 7.62L130.79 176zm233.94-28.9-76.64 45.99 75.29 122.35c2.11 3.44 7.41 1.94 7.41-2.1V150.53c0-3.11-3.39-5.03-6.06-3.43zm-93.41 18.72 81.53-48.7c2.53-1.52 2.6-5.16.13-6.78l-150.81-98.6c-7.19-4.11-15.12 4.08-10.78 11.14zm79.02 250.21L256 438.32v65.67c0 5.84 6.05 9.71 11.35 7.26l194.4-87.66c4.03-1.97 2.25-8.06-2.2-7.56zm-86.3-200.97-108.63 190.1 208.26-22.07c5.83-.65 9.01-7.14 5.93-12.14zM240 208H139.57L240 383.75 340.43 208z"/></svg>`;
const SVG_CAMERA    = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

// ─── Entry point ──────────────────────────────────────────────────────────────

export function renderCreateNew(container, router, step = 'landing') {
  // Restore draft or init fresh; step always comes from URL
  if (!_st) {
    const draft = loadDraft();
    _st = draft ? Object.assign(freshState(), draft) : freshState();
  }
  _st.step = step;
  const st = _st;

  // Clear header actions — create flow has its own controls
  const headerActions = document.getElementById('header-actions');
  if (headerActions) headerActions.innerHTML = '';

  function go(newStep) {
    if (newStep === 'landing') router.navigate('/create');
    else router.navigate('/create/' + newStep);
  }

  container.innerHTML = '';
  if      (step === 'landing')   container.append(buildLanding(st, go));
  else if (step === 'concept')   container.append(buildConcept(st, go));
  else if (step === 'mechanics') container.append(buildMechanics(st, go, container));
  else container.append(el('div', { class: 'cnew-wip' }, step + ' — скоро'));
}
