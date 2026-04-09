/**
 * HeroSummoner — Create Character (new flow)
 * Steps: landing → concept | mechanics
 */
import { el, toast } from '../utils.js';
import { DB } from '../db.js';
import { ARMOUR, WEAPONS, EQUIPMENT, TOOLS } from '../data/equipment.js';
import { getCantripsForClass, getLevel1SpellsForClass } from '../data/spells.js';

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
    mecStats:       { str:8, dex:8, con:8, int:8, wis:8, cha:8 },
    mecChosen:      [],
    mecStatMethod:  'pointbuy',
    mecStdAssign:   {},
    mecRolls:       [],
    mecRollAssign:  {},
    mecBgChoiceData: {},
    mecEquipMode:    'standard',
    mecEquipGold:    null,
    mecEquipChoices: {},
    mecCart:         [],
    mecHomebrew:     [],
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

  const conceptDone = isConceptDone(st);
  const mechDone    = isMechDone(st);
  const allDone     = conceptDone && mechDone;

  function statusBadge(done) {
    return el('span', { class: 'cnew-big-btn-status' + (done ? ' is-done' : '') },
      done ? '✓ Заполнено' : 'Не заполнено',
    );
  }

  const ctaBtn = allDone
    ? el('button', { class: 'btn btn-primary cnew-cta-btn', onClick: async () => {
        await saveCharToDB(st, 'active');
        toast('Персонаж создан!', 'success');
        go('characters');
      }},
        'Создать персонажа',
      )
    : el('button', { class: 'btn btn-ghost cnew-cta-btn', onClick: async () => {
        await saveCharToDB(st, 'draft');
        toast('Черновик сохранён', 'success');
        go('characters');
      }},
        'Сохранить черновик призыва',
      );

  return el('div', { class: 'cnew-landing' },
    el('div', { class: 'cnew-landing-card' },

      el('div', { class: 'cnew-name-block' },
        nameInp,
        el('p', { class: 'cnew-name-hint' },
          'Так мы узнаем, кого мы призовём. Не беспокойтесь — имя можно будет поменять во вкладке «Концепт».'
        ),
      ),

      el('p', { class: 'cnew-order-hint' },
        'Начните с концепта или механики — порядок не важен. Если есть идеи, но нет полного представления — сохраните черновик призыва: его можно будет найти в архиве.',
      ),

      el('div', { class: 'cnew-big-btns' },
        el('button', { class: 'cnew-big-btn' + (conceptDone ? ' is-done' : ''), onClick: () => go('concept') },
          el('span', { class: 'cnew-big-btn-icon',  html: SVG_CONCEPT }),
          el('span', { class: 'cnew-big-btn-title' }, 'Концепт'),
          el('span', { class: 'cnew-big-btn-sub'   }, 'Внешность, история, характер'),
          statusBadge(conceptDone),
        ),
        el('button', { class: 'cnew-big-btn cnew-big-btn--secondary' + (mechDone ? ' is-done' : ''), onClick: () => go('mechanics') },
          el('span', { class: 'cnew-big-btn-icon',  html: SVG_MECHANICS }),
          el('span', { class: 'cnew-big-btn-title' }, 'Механика'),
          el('span', { class: 'cnew-big-btn-sub'   }, 'Класс, характеристики, умения'),
          statusBadge(mechDone),
        ),
      ),

      el('div', { class: 'cnew-landing-cta' }, ctaBtn),
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
        (() => {
          const ALIGNMENTS = [
            'Законопослушно-добрый',
            'Законопослушно-нейтральный',
            'Законопослушно-злой',
            'Нейтрально-добрый',
            'Истинно нейтральный',
            'Нейтрально-злой',
            'Хаотично-добрый',
            'Хаотично-нейтральный',
            'Хаотично-злой',
          ];
          const sel = el('select', { class: 'cnew-input cnew-alignment-sel' },
            el('option', { value: '' }, '— Мировоззрение —'),
            ...ALIGNMENTS.map(a => el('option', { value: a }, a)),
          );
          sel.value = st.alignment || '';
          sel.addEventListener('change', () => { st.alignment = sel.value; scheduleSave(st); });
          return el('div', { class: 'cnew-field' },
            el('label', { class: 'cnew-label' }, 'Мировоззрение'),
            sel,
          );
        })(),
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
  { id: 'final',      label: 'Финал' },
];

function isConceptDone(st) {
  return !!(
    st.name?.trim() && st.playerName?.trim() && st.alignment?.trim() &&
    st.traits?.trim() && st.ideals?.trim() && st.bonds?.trim() && st.flaws?.trim() &&
    st.backstory?.trim()
  );
}
function isMechDone(st) {
  return (st.mecMaxStep || 0) >= MECH_STEPS.findIndex(s => s.id === 'final');
}

const CLASS_HP_DIE = {
  'Варвар':12, 'Воин':10, 'Паладин':10, 'Следопыт':10,
  'Бард':8, 'Жрец':8, 'Друид':8, 'Монах':8, 'Плут':8, 'Колдун':8, 'Изобретатель':8,
  'Чародей':6, 'Волшебник':6,
};

async function saveCharToDB(st, status) {
  const clsObj   = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsName  = clsObj?.name ?? '';
  const bgName   = st.mecBackground ? st.mecBackground.split('::')[1] : '';
  const raceName = st.mecRace       ? st.mecRace.split('::')[1]       : '';
  const asiMap   = mecRacialAsi(st);
  const bgSkillsList = mecBgSkills(st);
  const edition  = st.mecEdition === 'one-dnd' ? '2024' : '2014';

  const stats = {};
  for (const key of ['str','dex','con','int','wis','cha']) {
    stats[key] = (effectiveBase(st, key) ?? 8) + (asiMap[key] || 0);
  }
  const conMod = Math.floor(((stats.con || 8) - 10) / 2);
  const die    = CLASS_HP_DIE[clsName] || 8;
  const maxHp  = Math.max(1, die + conMod);

  // Capture wizard state for edit-draft flow (exclude portrait to save space)
  const { portrait: _p, ...wizardSnap } = st;

  const record = {
    name:       st.name?.trim() || 'Без имени',
    playerName: st.playerName?.trim() || '',
    alignment:  st.alignment || '',
    edition,
    class:      clsName,
    subclass:   '',
    race:       raceName,
    subrace:    st.mecSubrace || '',
    background: bgName,
    level:      1,
    stats,
    skills:     [...(st.mecChosen || []), ...bgSkillsList],
    maxHp,
    hp:         maxHp,
    portrait:   st.portrait || null,
    status,
    favorite:   false,
    _wizardState: wizardSnap,
  };
  if (st._charId) record.id = st._charId;
  const saved = await DB.put(record);
  st._charId = saved.id;
  localStorage.removeItem(DRAFT_KEY);
  return saved;
}

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
  const r  = e.target.getBoundingClientRect();
  const th = _srcTip.offsetHeight;
  const top = (r.bottom + 6 + th > window.innerHeight)
    ? r.top - th - 6
    : r.bottom + 6;
  _srcTip.style.left = r.left + 'px';
  _srcTip.style.top  = top + 'px';
}
function hideSrcTip() { _srcTip?.remove(); _srcTip = null; }

// ─── Mechanics: progress bar ──────────────────────────────────────────────────

function buildMechProgress(st, goMech, magic) {
  const steps     = MECH_STEPS.filter(s => !s.magic || magic);
  const cur       = steps.findIndex(s => s.id === (st.mecStep || 'edition'));
  const maxIdx    = st.mecMaxStep || 0;
  const statsIdx  = steps.findIndex(s => s.id === 'stats');
  return el('nav', { class: 'mech-progress' },
    ...steps.flatMap((s, i) => {
      const afterStats = statsIdx >= 0 && i > statsIdx;
      const reachable  = i <= maxIdx
        && (s.id !== 'stats' || st.mecBgOk !== false)
        && (!afterStats || st.mecStatsOk);
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
    el('div', { class: 'mech-edition-scroll' },
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
    ),

    ed ? el('div', { class: 'mech-foot' },
      ed === 'one-dnd'
        ? el('button', { class: 'cnew-save-btn mech-foot-wip', disabled: 'true' }, 'В разработке')
        : el('button', { class: 'cnew-save-btn', onClick: () => goMech('class') }, 'Далее → Класс'),
    ) : null,
  );
}

// ─── Buy mode: shop + inventory panel ────────────────────────────────────────

function buildBuyMode(st, footBtn) {
  if (!Array.isArray(st.mecCart))     st.mecCart     = [];
  if (!Array.isArray(st.mecHomebrew)) st.mecHomebrew = [];
  let _q = '';

  const goldEl    = el('span', {});
  const weightEl  = el('span', {});
  const invListEl = el('div',  { class: 'shop-inv-list' });
  const catalogEl = el('div',  { class: 'shop-cat-body' });

  const gl  = () => st.mecEquipGold !== null ? cartGoldLeft(st) : -Infinity;
  const tw  = () => cartTotalLb(st);
  const cap = () => charCarryCap(st);

  function refreshInv() {
    const g = gl(), t = tw(), c = cap();
    goldEl.textContent = isFinite(g) ? `${fmtGp(g)} зм` : '— зм';
    goldEl.className   = `shop-stat-v${isFinite(g) && g < 0 ? ' is-danger' : ''}`;
    weightEl.textContent = `${t} / ${c} фнт.`;
    weightEl.className   = `shop-stat-v${t > c ? ' is-danger' : ''}`;
    invListEl.innerHTML  = '';
    if (!st.mecCart.length) {
      invListEl.append(el('p', { class: 'shop-inv-empty' }, 'Инвентарь пуст'));
    } else {
      st.mecCart.forEach(item => invListEl.append(
        el('div', { class: 'shop-inv-item' },
          el('div', { class: 'shop-inv-name' }, item.name),
          el('div', { class: 'shop-inv-info' },
            el('span', {}, `${fmtGp(item.costGp * item.qty)} зм`),
            el('span', {}, `${Math.round(item.weightLb * item.qty * 10) / 10} фнт.`),
          ),
          el('div', { class: 'shop-inv-ctrl' },
            el('button', { class: 'shop-qty-btn', onClick: () => changeQty(item.id, -1) }, '−'),
            el('span',   { class: 'shop-qty-n' },  `×${item.qty}`),
            el('button', { class: 'shop-qty-btn', onClick: () => changeQty(item.id, +1) }, '+'),
            el('button', { class: 'shop-rm-btn',  onClick: () => removeItem(item.id)    }, '×'),
          ),
        ),
      ));
    }
    footBtn.disabled = t > c;
    footBtn.title    = t > c ? `Перегрузка: ${t} / ${c} фнт. Продайте часть снаряжения.` : '';
  }

  function refreshBuyBtns() {
    const g = gl();
    catalogEl.querySelectorAll('[data-cost]').forEach(btn => {
      const cant = parseFloat(btn.dataset.cost) > g;
      btn.disabled = cant;
      btn.classList.toggle('is-broke', cant);
      btn.style.cursor = cant ? 'not-allowed' : '';
      btn.title = cant ? 'Недостаточно монет' : '';
    });
  }

  function changeQty(id, delta) {
    const item = st.mecCart.find(i => i.id === id);
    if (!item) return;
    if (delta > 0 && item.costGp > gl()) return;
    item.qty += delta;
    if (item.qty <= 0) st.mecCart = st.mecCart.filter(i => i.id !== id);
    scheduleSave(st); refreshInv(); refreshBuyBtns();
  }

  function removeItem(id) {
    st.mecCart = st.mecCart.filter(i => i.id !== id);
    scheduleSave(st); refreshInv(); refreshBuyBtns();
  }

  function addItem(item) {
    if (item.costGp > gl()) return;
    const ex = st.mecCart.find(i => i.id === item.id);
    if (ex) ex.qty++;
    else st.mecCart.push({ ...item, qty: 1 });
    scheduleSave(st); refreshInv(); refreshBuyBtns();
  }

  function buildCatalog() {
    catalogEl.innerHTML = '';
    const q = _q.toLowerCase();
    const g = gl();

    const allCats = [...SHOP_CATS];
    if (st.mecHomebrew.length) {
      allCats.push({ id: 'homebrew', label: 'Homebrew', items: st.mecHomebrew.map(it => ({
        ...it, type: 'Homebrew',
        weight: it.weightLb > 0 ? `${it.weightLb} фнт.` : '—',
        cost: it.costStr || `${fmtGp(it.costGp)} зм`,
      })) });
    }

    allCats.forEach(cat => {
      let items = cat.items.filter(it => it.costGp !== null);
      if (q) items = items.filter(it =>
        it.name.toLowerCase().includes(q) || (it.type || '').toLowerCase().includes(q),
      );
      if (!items.length) return;

      const byType = {};
      items.forEach(it => { (byType[it.type] = byType[it.type] || []).push(it); });

      const catDet = el('details', { class: 'shop-cat-det' });
      catDet.open = true;
      catDet.append(el('summary', { class: 'shop-cat-sum' },
        el('span', {}, cat.label),
        el('span', { class: 'shop-count' }, `${items.length}`),
      ));

      Object.entries(byType).forEach(([type, tItems]) => {
        const subDet = el('details', { class: 'shop-sub-det' });
        subDet.open = true;
        subDet.append(el('summary', { class: 'shop-sub-sum' }, type));
        tItems.forEach(it => {
          const id   = `${cat.id}::${it.name}`;
          const cant = it.costGp > g;
          const btn  = el('button', {
            class: `shop-buy-btn${cant ? ' is-broke' : ''}`,
            onClick: () => addItem({ id, name: it.name, costGp: it.costGp, weightLb: parseWeightLb(it.weight), category: cat.label }),
          }, '+');
          btn.dataset.cost = it.costGp;
          if (cant) { btn.disabled = true; btn.style.cursor = 'not-allowed'; btn.title = 'Недостаточно монет'; }
          subDet.append(el('div', { class: 'shop-row' },
            el('span', { class: 'shop-row-name' }, it.name),
            el('span', { class: 'shop-row-cost' }, it.cost),
            el('span', { class: 'shop-row-wt'   }, it.weight),
            btn,
          ));
        });
        catDet.append(subDet);
      });
      catalogEl.append(catDet);
    });
  }

  const searchInp = el('input', { class: 'shop-search', type: 'search', placeholder: 'Поиск предмета...' });
  searchInp.addEventListener('input', e => { _q = e.target.value; buildCatalog(); });
  const addBtn = el('button', { class: 'shop-add-btn', onClick: () => openHomebrewModal(st, buildCatalog) }, '+ Свой предмет');

  refreshInv();
  buildCatalog();

  return el('div', { class: 'shop-wrap' },
    el('div', { class: 'shop-inv' },
      el('div', { class: 'shop-inv-hd' },
        el('div', { class: 'shop-stat-row' }, el('span', { class: 'shop-stat-l' }, 'Осталось'), goldEl),
        el('div', { class: 'shop-stat-row' }, el('span', { class: 'shop-stat-l' }, 'Вес'),      weightEl),
      ),
      invListEl,
    ),
    el('div', { class: 'shop-panel' },
      el('div', { class: 'shop-bar' }, searchInp, addBtn),
      catalogEl,
    ),
  );
}

const COIN_TO_GP = { зм: 1, см: 0.1, мм: 0.01 };

function openHomebrewModal(st, onAdded) {
  const nameInp = el('input', { class: 'shop-modal-inp', type: 'text',   placeholder: 'Название'    });
  const costInp = el('input', { class: 'shop-modal-cost-inp', type: 'number', placeholder: 'Цена', min: '0', step: '1' });
  const coinSel = el('select', { class: 'shop-modal-coin' },
    el('option', { value: 'зм' }, 'зм'),
    el('option', { value: 'см' }, 'см'),
    el('option', { value: 'мм' }, 'мм'),
  );
  const wtInp = el('input', { class: 'shop-modal-inp', type: 'number', placeholder: 'Вес (фнт.)', min: '0', step: '0.1' });
  const overlay = el('div', { class: 'shop-modal-bg' },
    el('div', { class: 'shop-modal' },
      el('h3', { class: 'shop-modal-title' }, 'Свой предмет'),
      nameInp,
      el('div', { class: 'shop-modal-cost-row' }, costInp, coinSel),
      wtInp,
      el('div', { class: 'shop-modal-btns' },
        el('button', { class: 'shop-modal-cancel', onClick: () => overlay.remove() }, 'Отмена'),
        el('button', { class: 'shop-modal-save', onClick: () => {
          const name = nameInp.value.trim();
          if (!name) { nameInp.focus(); return; }
          const amount = parseFloat(costInp.value) || 0;
          const coin   = coinSel.value;
          const costGp = Math.round(amount * COIN_TO_GP[coin] * 100) / 100;
          const costStr = amount > 0 ? `${amount} ${coin}.` : '—';
          st.mecHomebrew.push({ name, costGp, costStr, weightLb: parseFloat(wtInp.value) || 0 });
          scheduleSave(st);
          overlay.remove();
          onAdded();
        }}, 'Добавить'),
      ),
    ),
  );
  document.body.append(overlay);
  nameInp.focus();
}

// ─── Final step ───────────────────────────────────────────────────────────────

function buildFinalStep(st, goMech, go) {
  const ALIGNMENTS = [
    'Законопослушный добрый',    'Нейтральный добрый',     'Хаотичный добрый',
    'Законопослушный нейтральный','Истинно нейтральный',   'Хаотичный нейтральный',
    'Законопослушный злой',      'Нейтральный злой',       'Хаотичный злой',
  ];

  const clsObj   = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsName  = clsObj?.name ?? null;
  const bgName   = st.mecBackground ? st.mecBackground.split('::')[1] : null;
  const raceName = st.mecRace ? st.mecRace.split('::')[1] : null;
  const subrace  = st.mecSubrace ?? null;

  const asiMap   = mecRacialAsi(st);
  const clsData  = mecClsData(st);
  const bgSkills = mecBgSkills(st);

  function eStat(key) {
    return (effectiveBase(st, key) ?? 8) + (asiMap[key] || 0);
  }

  function editBtn(step) {
    return el('button', { class: 'final-edit-btn', onClick: () => goMech(step) }, 'изменить');
  }

  // ── Identity ──────────────────────────────────────────────────────────────
  function textField(field, placeholder) {
    const inp = el('input', { class: 'final-inp', type: 'text', placeholder });
    inp.value = st[field] || '';
    inp.addEventListener('input', () => { st[field] = inp.value; scheduleSave(st); });
    return inp;
  }
  const alignSel = el('select', { class: 'final-inp final-select' },
    el('option', { value: '' }, '— не выбрано —'),
    ...ALIGNMENTS.map(a => el('option', { value: a }, a)),
  );
  alignSel.value = st.alignment || '';
  alignSel.addEventListener('change', () => { st.alignment = alignSel.value; scheduleSave(st); });

  const identSec = el('div', { class: 'final-ident' },
    el('div', { class: 'final-ident-field is-name' },
      el('label', { class: 'final-field-label' }, 'Имя персонажа'),
      textField('name', 'Введите имя'),
    ),
    el('div', { class: 'final-ident-field' },
      el('label', { class: 'final-field-label' }, 'Игрок'),
      textField('playerName', 'Имя игрока'),
    ),
    el('div', { class: 'final-ident-field' },
      el('label', { class: 'final-field-label' }, 'Мировоззрение'),
      alignSel,
    ),
  );

  // ── Overview (class / race / background) ────────────────────────────────
  function overviewCard(label, value, step) {
    return el('div', { class: 'final-card' },
      el('span', { class: 'final-card-label' }, label),
      el('span', { class: `final-card-value${!value ? ' is-empty' : ''}` }, value ?? '—'),
      editBtn(step),
    );
  }
  const overviewRow = el('div', { class: 'final-overview' },
    overviewCard('Класс',      clsName,                         'class'),
    overviewCard('Раса',       subrace ? `${subrace} ${raceName}` : raceName, 'race'),
    overviewCard('Предыстория', bgName,                         'background'),
  );

  // ── Stats + Skills (ab-block style, read-only) ───────────────────────────
  const clsOpts = clsData ? (clsData.list ?? Object.values(SKILLS_BY_AB).flat()) : [];

  function buildFinalAbBlock({ key, label }) {
    const base    = effectiveBase(st, key) ?? 8;
    const asi     = asiMap[key] || 0;
    const total   = base + asi;
    const mod     = statMod(total);
    const hasSave = clsData?.saves.includes(key) ?? false;
    const saveVal = mod + (hasSave ? 2 : 0);

    const statRow = el('div', { class: 'ab-stat-row' },
      el('span', { class: 'ab-name' }, label),
      el('div',  { class: 'ab-stepper' },
        el('span', { class: 'ab-base-val' }, String(base)),
      ),
      el('div', { class: 'ab-vsep' }),
      el('div', { class: 'ab-derived' },
        ...(asi !== 0 ? [
          el('span', { class: 'ab-racial-badge' }, asi > 0 ? `+${asi}` : String(asi)),
          el('span', { class: 'ab-arrow' }, '→'),
        ] : []),
        el('span', { class: 'ab-total' }, String(total)),
        el('span', { class: 'ab-deriv-lbl' }, 'МОД'),
        el('span', { class: 'ab-mod' },  signNum(mod)),
        el('div',  { class: `ms-pip${hasSave ? ' active' : ''}` }),
        el('span', { class: 'ab-deriv-lbl' }, 'СБ'),
        el('span', { class: `ab-save${hasSave ? ' prof' : ''}` }, signNum(saveVal)),
      ),
    );

    const skills = SKILLS_BY_AB[key] || [];
    const sorted = [...skills].sort((a, b) => a.localeCompare(b, 'ru'));
    const skillEls = sorted.map(name => {
      const fromBg    = bgSkills.includes(name);
      const fromClass = (st.mecChosen || []).includes(name);
      const prof      = fromBg || fromClass;
      const bonus     = mod + (prof ? 2 : 0);
      let cbCls = 'sk-cb';
      if (fromBg)         cbCls += ' src-bg has-check';
      else if (fromClass) cbCls += ' src-class has-check';
      return el('div', { class: `skill-row locked` },
        el('div',  { class: cbCls }),
        el('span', { class: `sk-name${prof ? ' proficient' : ''}` }, name),
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: `sk-bonus${fromClass ? ' col-class' : fromBg ? ' col-bg' : ''}` }, signNum(bonus)),
        ),
      );
    });

    if (key === 'wis') {
      const percProf = bgSkills.includes('Восприятие') || (st.mecChosen || []).includes('Восприятие');
      skillEls.push(el('div', { class: 'skill-row locked passive-row' },
        el('div',  { class: 'sk-cb sk-cb-passive' }),
        el('span', { class: 'sk-name' }, 'Пасс. Внимательность'),
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: 'sk-bonus' }, String(10 + mod + (percProf ? 2 : 0))),
        ),
      ));
    }

    return el('div', { class: 'ab-block' },
      statRow,
      skills.length ? el('div', { class: 'ab-skills-grid' }, ...skillEls) : null,
    );
  }

  const absSec = el('div', { class: 'final-section' },
    el('div', { class: 'final-section-hd' },
      el('span', { class: 'final-section-title' }, 'Характеристики и навыки'),
      editBtn('stats'),
    ),
    el('div', { class: 'mech-stats-grid' }, ...ABILITIES.map(buildFinalAbBlock)),
  );

  // ── Equipment ────────────────────────────────────────────────────────────
  const classItems = clsName ? (CLASS_EQUIP[clsName] || []) : [];
  const srcBgName  = bgName === 'Собственная предыстория'
    ? ((st.mecEquipChoices || {})['bgch_bg_equipment'] ?? null)
    : bgName;
  const bgItems    = srcBgName ? (BG_EQUIP[srcBgName] || []) : [];

  // Material choice items (instrument/artisan/gaming) selected on equip step
  function matChoiceEls(resolvedBgName) {
    if (!resolvedBgName) return [];
    const bgObj = Object.values(BACKGROUND_DATA).flat().find(b => b.name === resolvedBgName);
    return (bgObj?.choices || [])
      .filter(ch => ['instrument', 'artisan', 'gaming'].includes(ch.type))
      .map(ch => makeChoiceSel(bgChoiceOptions(ch.type), `bgch_${ch.type}`, st));
  }

  function equipCol(sourceLabel, sourceClass, items, prefix, extraEls) {
    const itemEls = items.flatMap((item, idx) => {
      const kit = EQUIP_KITS[item];
      if (kit) return [el('div', { class: 'final-equip-item is-kit' },
        el('span', { class: 'final-equip-kit-hd' }, item),
        el('span', { class: 'final-equip-kit-items' }, kit.join(', ')),
      )];
      const opts = resolveEquipOpts(item);
      if (opts) return [makeChoiceSel(opts, `${prefix}_${idx}`, st)];
      return [el('div', { class: 'final-equip-item' }, item)];
    });
    return el('div', { class: 'final-equip-col' },
      el('div', { class: `final-equip-source ${sourceClass}` }, sourceLabel),
      ...[...itemEls, ...(extraEls || [])],
    );
  }

  const goldLine = st.mecEquipMode === 'standard'
    ? `${BG_GOLD[bgName] ?? 0} зм — стартовые монеты`
    : (st.mecEquipGold != null ? `${st.mecEquipGold} зм — стартовый капитал` : '— зм (не брошено)');

  const equipSec = el('div', { class: 'final-section' },
    el('div', { class: 'final-section-hd' },
      el('span', { class: 'final-section-title' }, 'Снаряжение'),
      editBtn('equipment'),
    ),
    el('div', { class: 'final-equip-cols' },
      clsName   ? equipCol(clsName,              'is-class', classItems, 'cls', []) : null,
      srcBgName ? equipCol(srcBgName ?? bgName,  'is-bg',   bgItems,    'bg',  matChoiceEls(srcBgName)) : null,
    ),
    el('div', { class: 'final-gold-line' }, goldLine),
  );

  // ── Proficiencies (languages / tools from bg choices) ────────────────────
  const langs  = [];
  const tools  = [];
  if (st.mecBackground) {
    const [srcId, bName] = st.mecBackground.split('::');
    const bgObj = (BACKGROUND_DATA[srcId] || []).find(b => b.name === bName);
    const EQUIP_TYPES = new Set(['instrument', 'artisan', 'gaming', 'bg_equipment']);
    let ci = 0;
    (bgObj?.choices || []).forEach(ch => {
      if (EQUIP_TYPES.has(ch.type)) { ci++; return; }
      const data = st.mecBgChoiceData?.[ci];
      ci++;
      if (!data) return;
      if (Array.isArray(data)) {
        data.forEach(key => {
          const [type, ...rest] = key.split('::');
          const val = rest.join('::');
          if (type === 'language') langs.push(val);
          else tools.push(val);
        });
      } else if (typeof data === 'string' && data) {
        if (ch.type === 'language') langs.push(data);
        else tools.push(data);
      }
    });
  }
  // Also add tool choices made on equip step (instrument/artisan/gaming)
  if (st.mecBackground) {
    const [srcId, bName] = st.mecBackground.split('::');
    const bgObj = Object.values(BACKGROUND_DATA).flat().find(b => b.name === bName);
    (bgObj?.choices || [])
      .filter(ch => ['instrument', 'artisan', 'gaming'].includes(ch.type))
      .forEach(ch => {
        const val = (st.mecEquipChoices || {})[`bgch_${ch.type}`];
        if (val) tools.push(val);
      });
  }

  // Class profs
  const AB_SHORT2 = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
  const clsSavesStr  = (clsData?.saves || []).map(k => AB_SHORT2[k] ?? k).join(', ');
  const clsSkillsStr = (st.mecChosen || []).join(', ');

  function profCol(sourceLabel, sourceClass, rows) {
    return el('div', { class: 'final-profs-col' },
      el('span', { class: `final-profs-source ${sourceClass}` }, sourceLabel),
      ...rows.filter(Boolean),
    );
  }
  function profRow(type, values) {
    return el('div', { class: 'final-prof-row' },
      el('span', { class: 'final-prof-type' }, type),
      el('span', { class: 'final-prof-values' }, values),
    );
  }

  const clsProfCol = (clsData && (clsSavesStr || clsSkillsStr)) ? profCol(clsName, 'is-class', [
    clsSavesStr  ? profRow('Спасброски', clsSavesStr)  : null,
    clsSkillsStr ? profRow('Навыки',     clsSkillsStr) : null,
  ]) : null;

  const bgProfCol = (langs.length || tools.length) ? profCol(bgName ?? 'Предыстория', 'is-bg', [
    langs.length  ? profRow('Языки',        langs.join(', '))  : null,
    tools.length  ? profRow('Инструменты',  tools.join(', '))  : null,
  ]) : null;

  const profSec = (clsProfCol || bgProfCol) ? el('div', { class: 'final-section final-profs-sec' },
    el('div', { class: 'final-section-hd' },
      el('span', { class: 'final-section-title' }, 'Владения'),
    ),
    el('div', { class: 'final-profs-grid' }, clsProfCol, bgProfCol),
  ) : null;

  // ── Save button ───────────────────────────────────────────────────────────
  const saveBtn = el('button', {
    class: 'cnew-save-btn final-save-btn',
    onClick: () => { scheduleSave(st); go('landing'); },
  }, '← Назад к призыву');

  // ── Layout ────────────────────────────────────────────────────────────────
  return el('div', { class: 'mech-step-body final-body' },
    el('div', { class: 'final-scroll' },
      el('h2', { class: 'mech-step-title' }, 'Финал'),
      identSec,
      overviewRow,
      profSec,
      absSec,
      equipSec,
    ),
    el('div', { class: 'mech-foot' }, saveBtn),
  );
}

// ─── Mechanics: main wrapper ──────────────────────────────────────────────────

// Magical classes that require the Spells step
const MAGIC_CLASSES = new Set([
  'bard', 'wizard', 'druid', 'cleric',
  'artificer', 'warlock', 'paladin', 'ranger', 'sorcerer',
]);

function buildMechanics(st, go, container) {
  if (!st.mecStep)    st.mecStep    = 'edition';
  if (!st.mecSources) st.mecSources = [];

  // Dynamically determine if the selected class is a spellcaster
  const magic = !!(st.mecClass && MAGIC_CLASSES.has(st.mecClass));

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
        : st.mecStep === 'stats'      ? buildStatsStep(st, goMech)
        : st.mecStep === 'spells'     ? buildSpellsStep(st, goMech)
        : st.mecStep === 'equipment'  ? buildEquipStep(st, goMech)
        : st.mecStep === 'final'     ? buildFinalStep(st, goMech, go)
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

const LANGUAGES     = ['Бездны','Великанский','Гномский','Гоблинский','Глубокая речь','Дварфский','Драконий','Инфернальный','Небесный','Орочий','Первозданный','Полуросликов','Сильван','Общий Подземья','Эльфийский'];
const INSTRUMENTS   = ['Барабан','Виола','Волынка','Лира','Лютня','Рог','Скрипка','Флейта','Цимбалы','Шалмей'];
const SIMPLE_WEAPONS = ['Булава','Дубина','Дротик','Жезл','Копьё','Кинжал','Кулак друида','Лёгкий арбалет','Посох','Праща','Ручной арбалет','Серп','Топор дровосека'];
const GAMING_SETS = ['Игральные кости','Карты','Три Дракона Анти','Шахматы Дракона'];
const ARTISAN_TOOLS = ['Инструменты алхимика','Инструменты бондаря','Инструменты гончара','Инструменты кожевника','Инструменты кузнеца','Инструменты каллиграфа','Инструменты каменщика','Инструменты плотника','Инструменты повара','Инструменты пивовара','Инструменты резчика','Инструменты сапожника','Инструменты стеклодува','Инструменты ткача','Инструменты ювелира'];

function bgChoiceOptions(type) {
  if (type === 'language')    return LANGUAGES;
  if (type === 'instrument')  return INSTRUMENTS;
  if (type === 'gaming')      return GAMING_SETS;
  if (type === 'artisan')     return ARTISAN_TOOLS;
  if (type === 'skill')       return Object.values(SKILLS_BY_AB).flat().sort((a, b) => a.localeCompare(b, 'ru'));
  if (type === 'any_prof')    return [...LANGUAGES, ...INSTRUMENTS, ...GAMING_SETS, ...ARTISAN_TOOLS].sort((a, b) => a.localeCompare(b, 'ru'));
  if (type === 'all_tools')   return [...INSTRUMENTS, ...GAMING_SETS, ...ARTISAN_TOOLS].sort((a, b) => a.localeCompare(b, 'ru'));
  if (type === 'bg_equipment') return Object.values(BACKGROUND_DATA).flat().map(b => b.name).filter(n => n !== 'Собственная предыстория').sort((a, b) => a.localeCompare(b, 'ru'));
  return [];
}

const BACKGROUND_DATA = {
  PHB: [
    {
      name: 'Аколит',
      skills: 'Проницательность, Религия',
      equipment: 'Символ священного заступника, молитвенник или 5 палочек благовоний, набор облачения, простая одежда, кошель с 15 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы провели годы, служа в храме — помогали жрецам проводить ритуалы, ухаживали за святилищем и наставляли верующих. Годы смиренного служения сформировали вашу веру, и теперь вы несёте свет избранного пантеона в широкий мир. Боги вашего храма готовы бесплатно оказывать вам лечебную помощь, а вы можете найти пристанище в любом храме, связанном с вашей верой.',
    },
    {
      name: 'Артист',
      skills: 'Акробатика, Выступление',
      equipment: 'Подарок от поклонника, маскировочный костюм, набор для грима, кошель с 15 зм',
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }],
      desc: 'Вы умеете привлекать к себе внимание и развлекать толпу. Музыка, акробатика, поэзия или театральное искусство — вы мастер своего дела. Выступая в тавернах, на ярмарках и при дворах знати, вы завоевали поклонников и связи. Артисты и развлекатели могут принять вас и оказать помощь, а публика охотно бросает монеты к вашим ногам.',
    },
    {
      name: 'Беспризорник',
      skills: 'Ловкость рук, Скрытность',
      equipment: 'Небольшой нож, карта родного города, домашняя крыса, одежда бедняка, набор для грима, воровские инструменты, кошель с 10 зм',
      choices: [],
      desc: 'Вы выросли на улицах города без семьи и крова, научившись выживать там, где другие погибли бы. Улица научила вас двигаться незаметно, находить пропитание и ценить каждое убежище. Вы знаете тайные ходы и переулки знакомого города, а среди уличного люда всегда найдёте кров и кусок хлеба в обмен на мелкую услугу.',
    },
    {
      name: 'Благородный',
      skills: 'История, Убеждение',
      equipment: 'Комплект отличной одежды, кольцо с гербом, свиток родословной, кошель с 25 зм',
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли среди богатства, власти и привилегий. Ваша семья владеет землями, имеет авторитет при дворе и поколениями влияет на судьбы региона. Вы знаете придворный этикет, умеете вести себя среди знати и привыкли к тому, что люди обращают внимание на ваш титул. Ваши знакомства открывают двери туда, куда простолюдинам вход закрыт.',
    },
    {
      name: 'Гильдейский мастер',
      skills: 'Проницательность, Убеждение',
      equipment: 'Рекомендательное письмо от гильдии, комплект одежды мастера, кошель с 15 зм',
      choices: [{ label: 'Ремесленный инструмент', type: 'artisan', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы — опытный мастер своего ремесла и полноправный член торговой или ремесленной гильдии. Гильдия — ваша семья: она обеспечивает работу, защиту и социальные связи. В любом городе, где есть отделение вашей гильдии, вы можете рассчитывать на бесплатный ночлег и помощь соратников. Гильдия также поможет с юридической защитой, если дело дойдёт до суда.',
    },
    {
      name: 'Жулик',
      skills: 'Обман, Ловкость рук',
      equipment: 'Набор отличной одежды, набор для грима, набор инструментов мошенника, кошель с 15 зм',
      choices: [],
      desc: 'Вы всегда умели видеть слабости людей и использовать их в своих целях. Фальшивые личности, ловкий язык, убедительная ложь — всё это ваши главные инструменты. Возможно, вы торговали поддельными снадобьями, продавали "уникальные реликвии" или просто обчищали карманы зазевавшихся богачей. У вас всегда есть запасная легенда, а подобные вам мошенники готовы укрыть вас и передать весточку без лишних вопросов.',
    },
    {
      name: 'Матрос',
      skills: 'Атлетика, Восприятие',
      equipment: '50 футов шёлкового каната, сувенир на удачу, навигационные инструменты, общая одежда, кошель с 10 зм',
      choices: [],
      desc: 'Вы провели годы на море: на торговом судне, рыбацкой шхуне или военном корабле. Жизнь под парусом закалила тело, обострила чувства и научила работать в команде. Вы умеете читать ветер, предсказывать погоду и найдёте общий язык с любым моряком. В портовых городах вам без труда найдётся попутное судно, а морские кабаки встретят вас как своего.',
    },
    {
      name: 'Мудрец',
      skills: 'История, Магия',
      equipment: 'Бутылочка чернил, перо, небольшой нож, письмо от коллеги с неотвеченным вопросом, записная книжка, мешок с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы провели годы, погружённых в книги, свитки и манускрипты в поисках знаний о мире. Библиотеки, академии и архивы были вашим домом. Вы изучали историю, магию, естественные науки или богословие — а может быть, всё сразу. Другие учёные и исследователи готовы делиться с вами знаниями в обмен на ваши, а любая крупная библиотека, вероятно, хранит труды, к которым вы имеете доступ.',
    },
    {
      name: 'Народный герой',
      skills: 'Уход за животными, Выживание',
      equipment: 'Лопата, котёл для готовки, транспортные средства (наземные), общая одежда, кошель с 10 зм',
      choices: [{ label: 'Ремесленный инструмент', type: 'artisan', count: 1 }],
      desc: 'Вы — простой человек из простой семьи, но однажды судьба поставила вас перед выбором, и вы поступили правильно. Теперь люди из вашей деревни или округи смотрят на вас как на заступника и надеются, что вы защитите их от тирании и зла. Простые крестьяне и ремесленники рады помочь вам: спрятать, накормить, передать весть, — ведь вы один из них.',
    },
    {
      name: 'Отшельник',
      skills: 'Медицина, Религия',
      equipment: 'Принадлежности для рукоделия, дневник в кожаной обложке, набор трав, зимняя одежда, кошель с 5 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }],
      desc: 'Долгие годы вы провели в уединении вдали от общества — в монастырской келье, лесной хижине или пещере. Одиночество давало вам время для размышлений, молитвы или исследований. Быть может, вы искали ответы на великие вопросы, бежали от преследования или несли суровое покаяние. Теперь за вами стоит открытие или понимание, изменившее ваш взгляд на мир.',
    },
    {
      name: 'Преступник',
      skills: 'Обман, Скрытность',
      equipment: 'Ломик, тёмная одежда с капюшоном, воровские инструменты, кошель с 15 зм',
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'До приключений вы нарушали закон — и довольно успешно. Кражи, контрабанда, шантаж или убийства на заказ: у вас за плечами богатый опыт незаконной деятельности. Вы знаете, как связаться с фехтовальщиками краденого, скупщиками информации и другими преступниками. Члены воровских гильдий и уличных банд, как правило, относятся к вам с уважением — или по меньшей мере не мешают.',
    },
    {
      name: 'Скиталец',
      skills: 'Атлетика, Выживание',
      equipment: 'Посох, охотничий капкан, трофей убитого животного, дорожная одежда, кошель с 10 зм',
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли вдали от цивилизации — в лесах, тундре, степях или горах. Дикая природа была вашим домом, а племя или семья — всем миром. Вы умеете выживать там, где городской житель обречён на гибель: находить пропитание, строить укрытие и ориентироваться без карт. Люди племён и охотники встретят вас как своего, если вы разделите их обычаи.',
    },
    {
      name: 'Солдат',
      skills: 'Атлетика, Запугивание',
      equipment: 'Значок воинского звания, трофей с поверженного врага, транспортные средства (наземные), обычная одежда, кошель с 10 зм',
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'Вы долгие годы служили в армии — регулярных войсках, городской страже или наёмном отряде. Война научила вас дисциплине, тактике и тому, как выжить в хаосе битвы. У вас есть звание и послужной список: солдаты и ветераны признают в вас своего, офицеры уважают ваш опыт, а военные лагеря и гарнизоны готовы принять вас.',
    },
    {
      name: 'Собственная предыстория',
      skills: null,
      equipment: 'Снаряжение от любой другой стандартной предыстории — выберите его на этапе «Снаряжение»',
      choices: [
        { label: 'Навык', displayLabel: 'Навыки (выберите 2)', type: 'skill', count: 2 },
        { label: 'Владение', type: 'any_prof', count: 2, maxPerGroup: 2, groups: [
          { label: 'Языки', type: 'language' },
          { label: 'Инструменты', type: 'all_tools' },
        ]},
        { label: 'Снаряжение от предыстории', type: 'bg_equipment', count: 1 },
      ],
      desc: 'Возможно, вы захотите изменить некоторые особенности предыстории, чтобы они лучше подходили вашему персонажу или игровому миру. Для создания собственной предыстории вы можете изменить одно умение на любое другое, выбрать два любых навыка и выбрать владение инструментами и языками, чтобы в сумму их было не больше двух, из образцов других предысторий. Вы можете взять набор снаряжения из выбранной предыстории или потратить золото для закупки снаряжения, как сказано в главе 5. И наконец, выберите две черты характера, один идеал, одну привязанность и одну слабость.',
    },
  ],
  SCAG: [
    {
      name: 'Городская стража',
      skills: 'Атлетика, Проницательность',
      equipment: 'Эмблема городской стражи, манускрипт с городским уставом, обычная одежда, кошель с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы служили в городской страже или дозоре, охраняя покой мирных жителей от преступников и монстров. Годы патрулирования улиц научили вас читать людей, замечать подозрительное поведение и действовать решительно. Вы знаете, как работают силы правопорядка в большинстве городов, и представители власти склонны прислушиваться к вам.',
    },
    {
      name: 'Клановый мастер',
      skills: 'История, Проницательность',
      equipment: 'Памятный предмет из дома клана, обычная одежда, кошель с 5 зм',
      choices: [{ label: 'Ремесленный инструмент', type: 'artisan', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли в клане гномов-мастеров или иного народа с богатыми традициями ремесла. Ваши изделия — предмет гордости клана, а секреты мастерства передавались из рук в руки поколениями. Вы умеете ценить качественную работу и сразу видите, когда мастер халтурит. Гномские кланы-мастера повсюду примут вас как равного и помогут с торговыми контактами.',
    },
    {
      name: 'Монастырский учёный',
      skills: 'История + 1 из: Магия, Природа, Религия',
      equipment: 'Письмо о принятии в монастырь, записная книжка, перо и чернила, обычная одежда, кошель с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы получили образование в монастырском скриптории или академическом хранилище знаний — месте, где книги переписывались вручную и тщательно охранялись. Вы усвоили строгую методологию и доступ к редким источникам. Учёные заведения обычно готовы предоставить вам доступ к архивам в обмен на помощь с исследованиями, а академики относятся к вам как к коллеге.',
    },
    {
      name: 'Придворный',
      skills: 'Проницательность, Убеждение',
      equipment: 'Комплект придворной одежды, рекомендательное письмо ко двору, кошель с 5 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы вращались при королевском или герцогском дворе, постигая тонкости дипломатии, интриг и этикета. Придворная жизнь научила вас читать политические течения, выбирать слова с ювелирной точностью и никогда не показывать истинных намерений. Дворяне и чиновники знакомы с вашим типом: они готовы принять вас на аудиенции там, куда обычный человек не попадёт.',
    },
    {
      name: 'Дальний странник',
      skills: 'Восприятие + 1 по выбору',
      equipment: 'Путевые вещи, реликвия из далёкого дома, записная книжка, кошель с 5 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }, { label: 'Инструмент/набор', type: 'instrument', count: 1 }],
      desc: 'Вы пришли из страны настолько далёкой, что большинство людей здесь никогда о ней не слышали. Ваш акцент, одежда и обычаи выдают в вас чужеземца, вызывая у людей смесь восхищения и подозрения. Вы сохранили связи с теми, кто путешествует между мирами и народами, — торговцами дальних маршрутов, дипломатами, лазутчиками.',
    },
    {
      name: 'Наследник',
      skills: 'Выживание + 1 по выбору',
      equipment: 'Предмет наследства (согласуется с DM), путевая одежда, кошель с 15 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }, { label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'Вы унаследовали нечто ценное — старинный артефакт, долг, миссию или тайну. Это наследство определяет ваш путь и не даёт вам покоя. Быть может, вы единственный, кто знает о нём, или, напротив, многие хотят забрать его у вас силой. Те, кто связан с вашим наследством, могут стать союзниками или врагами.',
    },
    {
      name: 'Рыцарь ордена',
      skills: 'Убеждение + 1 по выбору',
      equipment: 'Символ ордена, путевая одежда, кошель с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }, { label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'Вы посвящены в рыцарский или религиозный орден, преследующий особые цели: защиту слабых, уничтожение зла или охрану реликвий. Орден обеспечивает вас братством, ресурсами и кровом в подконтрольных ему местах. Взамен вы несёте его символ и обязаны блюсти устав. Члены ордена относятся к вам как к брату, а простые люди нередко чтят вашу принадлежность к нему.',
    },
    {
      name: 'Ветеран наёмник',
      skills: 'Атлетика, Убеждение',
      equipment: 'Знак воинского звания, значок отряда, выбранный игровой набор, обычная одежда, кошель с 10 зм',
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'Вы продавали меч тому, кто платил больше, сражаясь в разных армиях и под разными знамёнами. Наёмная жизнь научила вас оценивать нанимателей, не задавать лишних вопросов и знать, когда пора уходить. Другие ветераны наёмных отрядов узнают вас по манере держаться и охотно делятся слухами о контрактах и войнах.',
    },
    {
      name: 'Городской охотник',
      skills: '3 из: Обман, Скрытность, Проницательность, Убеждение',
      equipment: 'Подходящая одежда, кошель с 20 зм',
      choices: [{ type: 'pick2of3', label: '2 из 3 на выбор:', options: [
        { label: 'Игровой набор',      type: 'gaming' },
        { label: 'Муз. инструмент',    type: 'instrument' },
        { label: 'Вор. инструменты',   type: 'fixed', value: 'Воровские инструменты' },
      ]}],
      desc: 'Вы охотились за беглецами и разыскиваемыми преступниками в городских трущобах. Ваша работа требовала терпения, умения вживаться в образ и готовности действовать грязными методами. Вы знаете, как найти нужного человека в мегаполисе, а сеть информаторов — таверщики, уличные торговцы, прачки — готова сообщить о передвижениях за небольшую плату.',
    },
    {
      name: 'Член племени Угтардов',
      skills: 'Атлетика, Выживание',
      equipment: 'Охотничий трофей, дорожная одежда, кошель с 10 зм',
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли в одном из кочевых племён Угтардов — варварского народа севера Фаэруна, хранящего память о своих предках-великанах. Охота, набеги и жизнь под открытым небом — вот что сформировало вас. Угтарды уважают силу и чтут предков: вы знаете ритуалы, которые позволят вам найти приют у любого отделившегося племени на Севере.',
    },
    {
      name: 'Дворянин Уотердипа',
      skills: 'История, Убеждение',
      equipment: 'Комплект отличной одежды, рекомендательное письмо, кошель с 20 зм',
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }, { label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы происходите из одной из благородных семей Уотердипа — богатейшего торгового города Побережья Мечей. Ваши связи в городе открывают двери в советы лордов, купеческие клубы и тайные ложи. За пределами Уотердипа ваш титул значит меньше, зато золото и письма с рекомендациями заменяют его с лихвой.',
    },
  ],
  GGR: [
    {
      name: 'Агент Азория',
      skills: 'Проницательность, Убеждение',
      equipment: 'Форменная одежда чиновника, набор чернил и пера, кошель с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы служили в рядах гильдии Азорий — законодательного совета Равники, пишущего законы и толкующего их в судах. Вы хорошо знаете букву закона и умеете использовать её в своих целях. Члены гильдии окажут вам правовую помощь, а в суде у вас есть шанс получить снисхождение, если вы готовы апеллировать к нужным статутам.',
    },
    {
      name: 'Культист Груула',
      skills: 'Атлетика, Запугивание',
      equipment: 'Ритуальный тотем, оружие с клановыми надписями, путевая одежда, кошель с 10 зм',
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }],
      desc: 'Вы принадлежите к дикарским кланам Груул — разрушителей цивилизации, живущих в руинах на краю Равники. Цивилизация для вас — тюрьма, а дикость — освобождение. Члены кланов Груул примут вас в лагере и поделятся пищей, а животные Диких земель чувствуют в вас родственную душу.',
    },
    {
      name: 'Дитя Диммира',
      skills: 'Обман, Скрытность',
      equipment: 'Тёмный плащ, набор для грима, кошель с 15 зм',
      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы выросли в тенях гильдии Диммир — культа теней и секретов, торгующего информацией и плетущего заговоры. Вас приучили хранить тайны, использовать псевдонимы и никому не доверять полностью. Шпионы Диммира передадут вам засекреченные сведения, если сочтут это выгодным для гильдии.',
    },
  ],
  VRGR: [
    {
      name: 'Преследуемый',
      skills: 'Медицина, Скрытность',
      equipment: 'Амулет с именем любимого человека, одежда с последнего мирного дня, кошель с 1 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }, { label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'Вы пережили нечто ужасное — нападение монстра, контакт с тёмной магией или трагедию, оставившую след на вашей душе. Кошмары не дают вам покоя, а странные видения порой смешиваются с реальностью. Те, кто также прошёл через ужасы, видят в вас своего и готовы укрыть вас — ведь вы знаете, что значит бояться темноты.',
    },
    {
      name: 'Следователь',
      skills: 'Медицина + 1 по выбору',
      equipment: 'Записная книжка со старыми заметками, чернила и перо, обычная одежда, кошель с 10 зм',
      choices: [{ label: 'Язык', type: 'language', count: 1 }, { label: 'Инструмент', type: 'artisan', count: 1 }],
      desc: 'Вы методично распутываете тайны: ищете улики, опрашиваете свидетелей и выстраиваете картину произошедшего из разрозненных фрагментов. Вас нанимали для расследования преступлений, исчезновений или сверхъестественных явлений. Информаторы, библиотекари и репортёры охотно общаются с вами — каждый надеется на свою выгоду от вашего расследования.',
    },
  ],
  WBW: [
    {
      name: 'Работник балагана',
      skills: 'Акробатика, Обман',
      equipment: 'Маскировочный костюм, набор для грима, путевая одежда, кошель с 8 зм',
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }],
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
                updateRaceFoot();
              },
            }, s)
          ),
        ),
      );
    }
  }

  function updateRaceFoot() {
    footEl.innerHTML = '';
    if (!st.mecRace) return;
    const [srcId, raceName] = st.mecRace.split('::');
    const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
    const needsSub = raceObj?.sub?.length > 0;
    const btn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('background') }, 'Далее → Предыстория');
    btn.disabled = needsSub && !st.mecSubrace;
    btn.addEventListener('mouseenter', e => {
      if (btn.disabled) showSrcTip(e, { name: '', desc: 'Выберите подрасу, чтобы продолжить' });
    });
    btn.addEventListener('mouseleave', hideSrcTip);
    footEl.append(btn);
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
    updateRaceFoot();
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

  updateRaceFoot();
  updateDetail();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите расу'),
    el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl),
    footEl,
  );
}

// ─── Background multiselect helper ───────────────────────────────────────────

function buildBgMultiSel({ label, max, maxPerGroup, groups, onChange, initialSelected = [] }) {
  const mpg = maxPerGroup !== undefined ? maxPerGroup : (groups.length > 1 ? 1 : max);
  const sel = new Map(groups.map((_, i) => [i, new Set()]));
  const allItems = []; // { el, groupIdx, key }

  const triggerText = document.createElement('span');
  triggerText.textContent = label;
  const triggerArrow = el('span', { class: 'mech-bg-ms-arrow' }, '▾');
  const trigger = el('button', { class: 'mech-bg-ms-trigger' }, triggerText, triggerArrow);
  const panel   = el('div',   { class: 'mech-bg-ms-panel' });
  panel.hidden  = true;

  function totalSelected() {
    let n = 0; sel.forEach(s => n += s.size); return n;
  }

  function refreshState() {
    const total = totalSelected();
    allItems.forEach(({ el: ie, groupIdx, key }) => {
      const groupSel = sel.get(groupIdx);
      const isChecked = groupSel.has(key);
      ie.classList.toggle('is-checked', isChecked);
      ie.querySelector('.mech-bg-ms-check').textContent = isChecked ? '✓' : '';
      ie.classList.toggle('is-disabled', !isChecked && (groupSel.size >= mpg || total >= max));
    });
    const names = [];
    const allKeys = [];
    sel.forEach(s => s.forEach(k => { names.push(k.split('::').slice(1).join('::')); allKeys.push(k); }));
    triggerText.textContent = names.length ? names.join(', ') : label;
    if (onChange) onChange(total, allKeys);
  }

  groups.forEach((grp, gi) => {
    const opts = grp.type === 'fixed' ? [grp.value] : bgChoiceOptions(grp.type);
    panel.append(el('div', { class: 'mech-bg-ms-group' }, grp.label));
    opts.forEach(o => {
      const key     = `${grp.type}::${o}`;
      const checkEl = el('span', { class: 'mech-bg-ms-check' });
      const itemEl  = el('div', { class: 'mech-bg-ms-item' }, checkEl, el('span', {}, o));
      itemEl.addEventListener('click', () => {
        const groupSel = sel.get(gi);
        if (groupSel.has(key)) { groupSel.delete(key); }
        else if (groupSel.size < mpg && totalSelected() < max) { groupSel.add(key); }
        refreshState();
      });
      allItems.push({ el: itemEl, groupIdx: gi, key });
      panel.append(itemEl);
    });
  });

  // Restore initial selections silently (no onChange)
  if (initialSelected.length) {
    initialSelected.forEach(key => {
      const item = allItems.find(it => it.key === key);
      if (!item) return;
      const groupSel = sel.get(item.groupIdx);
      if (groupSel.size < mpg && totalSelected() < max) groupSel.add(key);
    });
    allItems.forEach(({ el: ie, groupIdx, key }) => {
      const groupSel = sel.get(groupIdx);
      const isChecked = groupSel.has(key);
      ie.classList.toggle('is-checked', isChecked);
      ie.querySelector('.mech-bg-ms-check').textContent = isChecked ? '✓' : '';
      ie.classList.toggle('is-disabled', !isChecked && (groupSel.size >= mpg || totalSelected() >= max));
    });
    const initNames = [];
    sel.forEach(s => s.forEach(k => initNames.push(k.split('::').slice(1).join('::'))));
    triggerText.textContent = initNames.length ? initNames.join(', ') : label;
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    triggerArrow.style.transform = panel.hidden ? '' : 'rotate(180deg)';
  });

  const wrap = el('div', { class: 'mech-bg-ms-wrap' }, trigger, panel);
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) { panel.hidden = true; triggerArrow.style.transform = ''; }
  });

  return wrap;
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

    // Equipment label with tooltip
    const eqLabel = el('span', { class: 'mech-bg-eq-label' }, 'Стартовое снаряжение');
    eqLabel.addEventListener('mouseenter', e => showSrcTip(e, {
      name: '',
      desc: 'Персонаж возьмёт с собой эти вещи в приключение, если вы не решите закупить снаряжение самостоятельно',
    }));
    eqLabel.addEventListener('mouseleave', hideSrcTip);

    // Choice rows — with completion tracking
    const checkers = [];
    const hintEl   = el('p', { class: 'mech-bg-foot-hint', hidden: true });
    const nextBtn  = el('button', { class: 'cnew-save-btn', onClick: () => goMech('stats') }, 'Далее → Характеристики');
    nextBtn.addEventListener('mouseenter', e => {
      if (nextBtn.disabled) showSrcTip(e, { name: '', desc: 'Заполните все выборы, чтобы продолжить' });
    });
    nextBtn.addEventListener('mouseleave', hideSrcTip);
    const recheckFoot = () => {
      const ok = checkers.length === 0 || checkers.every(fn => fn());
      nextBtn.disabled = !ok;
      st.mecBgOk = ok;
    };

    if (!st.mecBgChoiceData) st.mecBgChoiceData = {};
    let choiceIdx = 0;
    const EQUIP_CHOICE_TYPES = new Set(['instrument', 'artisan', 'gaming', 'bg_equipment']); // shown on equipment screen
    const choiceEls = (bgObj.choices || []).flatMap(ch => {
      const ci = choiceIdx++;
      if (EQUIP_CHOICE_TYPES.has(ch.type)) {
        if (ch.type === 'bg_equipment') return [];
        return [el('div', { class: 'mech-bg-row' },
          el('span', { class: 'mech-bg-row-label' }, ch.label),
          el('span', { class: 'mech-bg-row-value is-deferred' }, '→ выбор на шаге «Снаряжение»'),
        )];
      }
      if (ch.type === 'pick2of3') {
        const saved = st.mecBgChoiceData[ci] || [];
        let cnt = saved.length;
        checkers.push(() => cnt >= 2);
        return [buildBgMultiSel({ label: ch.label, max: 2, maxPerGroup: 1, groups: ch.options,
          initialSelected: saved,
          onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; recheckFoot(); } })];
      }
      if (ch.count >= 2) {
        const saved = st.mecBgChoiceData[ci] || [];
        let cnt = saved.length;
        checkers.push(() => cnt >= ch.count);
        return [buildBgMultiSel({
          label: ch.displayLabel || (ch.label + ' × ' + ch.count),
          max: ch.count,
          maxPerGroup: ch.maxPerGroup,
          groups: ch.groups || [{ label: ch.label, type: ch.type }],
          initialSelected: saved,
          onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; recheckFoot(); },
        })];
      }
      const savedVal = st.mecBgChoiceData[ci] || '';
      let chosen = !!savedVal;
      checkers.push(() => chosen);
      const selEl = el('select', { class: 'mech-bg-select' },
        el('option', { value: '' }, '— выберите —'),
        ...bgChoiceOptions(ch.type).map(o => el('option', { value: o }, o)),
      );
      selEl.value = savedVal;
      selEl.addEventListener('change', () => {
        chosen = !!selEl.value;
        st.mecBgChoiceData[ci] = selEl.value;
        recheckFoot();
      });
      return [el('div', { class: 'mech-bg-row' },
        el('span', { class: 'mech-bg-row-label' }, ch.label),
        selEl,
      )];
    });

    recheckFoot();
    footEl.innerHTML = '';
    footEl.append(nextBtn);

    detailEl.append(...[
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, bgObj.name),
        badge,
      ),
      el('p', { class: 'mech-cls-desc' }, bgObj.desc),
      el('div', { class: 'mech-bg-section' },
        eqLabel,
        el('p', { class: 'mech-bg-eq-text' }, bgObj.equipment),
      ),
      bgObj.skills ? el('div', { class: 'mech-bg-row' },
        el('span', { class: 'mech-bg-row-label' }, 'Навыки'),
        el('span', { class: 'mech-bg-row-value' }, bgObj.skills),
      ) : null,
      ...choiceEls,
      hintEl,
    ].filter(Boolean));
  }

  function selectBg(srcId, bgName) {
    const key = `${srcId}::${bgName}`;
    if (st.mecBackground !== key) st.mecBgChoiceData = {};
    st.mecBackground = key;
    st.mecBgOk = false;
    scheduleSave(st);
    listEl.querySelectorAll('.mech-cls-item').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.key === key)
    );
    updateDetail();
  }

  // PHB is always included; other books only if selected
  const allBooks = (SOURCEBOOKS[st.mecEdition] || []).filter(b =>
    b.locked || st.mecSources.includes(b.id)
  );
  allBooks.forEach(book => {
    const bgs = (BACKGROUND_DATA[book.id] || []).slice().sort((a, b) => {
      if (a.name === 'Собственная предыстория') return 1;
      if (b.name === 'Собственная предыстория') return -1;
      return a.name.localeCompare(b.name, 'ru');
    });
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

// ─── Stats step data ──────────────────────────────────────────────────────────

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
  str: ['Атлетика'],
  dex: ['Акробатика', 'Ловкость рук', 'Скрытность'],
  con: [],
  int: ['История', 'Магия', 'Природа', 'Расследование', 'Религия'],
  wis: ['Восприятие', 'Выживание', 'Медицина', 'Проницательность', 'Уход за животными'],
  cha: ['Выступление', 'Запугивание', 'Обман', 'Убеждение'],
};

const STAT_CLASSES = {
  'Бард':         { saves:['dex','cha'], count:3, list:null },
  'Варвар':       { saves:['str','con'], count:2, list:['Атлетика','Восприятие','Природа','Запугивание','Уход за животными','Выживание'] },
  'Воин':         { saves:['str','con'], count:2, list:['Акробатика','Атлетика','История','Восприятие','Уход за животными','Запугивание','Выживание'] },
  'Волшебник':    { saves:['int','wis'], count:2, list:['История','Магия','Природа','Расследование','Медицина','Религия'] },
  'Друид':        { saves:['int','wis'], count:2, list:['Магия','Медицина','Природа','Восприятие','Религия','Уход за животными','Выживание'] },
  'Жрец':         { saves:['wis','cha'], count:2, list:['История','Магия','Медицина','Религия','Убеждение'] },
  'Изобретатель': { saves:['con','int'], count:2, list:['История','Магия','Медицина','Природа','Расследование','Восприятие','Ловкость рук'] },
  'Колдун':       { saves:['wis','cha'], count:2, list:['История','Магия','Обман','Запугивание','Природа','Религия'] },
  'Монах':        { saves:['str','dex'], count:2, list:['Акробатика','Атлетика','История','Магия','Религия','Скрытность'] },
  'Паладин':      { saves:['wis','cha'], count:2, list:['Атлетика','История','Магия','Медицина','Религия','Убеждение'] },
  'Плут':         { saves:['dex','int'], count:4, list:['Акробатика','Атлетика','Восприятие','Обман','Запугивание','Расследование','Ловкость рук','Магия','Скрытность','Убеждение','Выступление'] },
  'Следопыт':     { saves:['str','dex'], count:3, list:['Атлетика','Восприятие','Магия','Природа','Скрытность','Уход за животными','Выживание'] },
  'Чародей':      { saves:['con','cha'], count:2, list:['История','Магия','Обман','Запугивание','Расследование','Религия','Убеждение'] },
};

const STAT_RACE_ASI = {
  'Дварф':     { con:2 },        'Эльф':      { dex:2 },
  'Полурослик':{ dex:2 },        'Человек':   { str:1,dex:1,con:1,int:1,wis:1,cha:1 },
  'Драконид':  { str:2,cha:1 },  'Гном':      { int:2 },
  'Полуэльф':  { cha:2 },        'Полуорк':   { str:2,con:1 },
  'Тифлинг':   { int:1,cha:2 },  'Голиаф':    { str:2,con:1 },
  'Аасимар':   { cha:2 },        'Фирболг':   { wis:2,str:1 },
  'Кенку':     { dex:2,wis:1 },  'Тритон':    { str:1,con:1,cha:1 },
  'Юань-Ти':   { int:1,cha:2 },  'Табакси':   { dex:2,cha:1 },
  'Ящеролюд':  { con:2,int:1 },  'Орк':       { str:2,con:1 },
  'Кобольд':   { dex:2 },        'Гитьянки':  { str:2,int:1 },
  'Гитзерай':  { dex:2,wis:1 },  'Дуэргар':   { con:2,str:1 },
};

const STAT_SUBRACE_ASI = {
  'Горный':    { str:2 }, 'Холмовой':  { wis:1 },
  'Высший':    { int:1 }, 'Лесной':    { wis:1 }, 'Дроу':     { cha:1 },
  'Легконогий':{ cha:1 }, 'Крепкий':   { con:1 },
  'Каменный':  { con:1 },
  'Защитник':  { wis:1 }, 'Каратель':  { str:1 }, 'Падший':   { str:1 },
  'Весенний':  { dex:1,cha:1 }, 'Летний':  { str:1,dex:1 },
  'Осенний':   { con:1,wis:1 }, 'Зимний':  { int:1,wis:1 },
};

// ─── Stats step helpers ───────────────────────────────────────────────────────

function pbSpent(stats) {
  return Object.values(stats).reduce((a, v) => a + (PB_COST[v] ?? 0), 0);
}
const statMod = s => Math.floor((s - 10) / 2);
const signNum  = n => n >= 0 ? `+${n}` : `${n}`;

function mecRacialAsi(st) {
  if (!st.mecRace) return {};
  const raceName = st.mecRace.split('::')[1];
  const base = { ...(STAT_RACE_ASI[raceName] || {}) };
  if (st.mecSubrace) {
    const sub = STAT_SUBRACE_ASI[st.mecSubrace] || {};
    for (const [k, v] of Object.entries(sub)) base[k] = (base[k] || 0) + v;
  }
  return base;
}

function mecBgSkills(st) {
  if (!st.mecBackground) return [];
  const [srcId, bgName] = st.mecBackground.split('::');
  const bgObj = (BACKGROUND_DATA[srcId] || []).find(b => b.name === bgName);
  return bgObj?.skills ? bgObj.skills.split(', ').map(s => s.trim()) : [];
}

function mecClsData(st) {
  const clsObj = CLASS_DATA.find(c => c.id === st.mecClass);
  return clsObj ? (STAT_CLASSES[clsObj.name] || null) : null;
}

function effectiveBase(st, key) {
  if (!st.mecStatMethod || st.mecStatMethod === 'pointbuy') return (st.mecStats || {})[key] ?? 8;
  if (st.mecStatMethod === 'standard') return (st.mecStdAssign || {})[key] ?? null;
  // random
  const idx = (st.mecRollAssign || {})[key];
  const roll = idx !== undefined ? (st.mecRolls || [])[idx] : null;
  if (!roll) return null;
  return [...roll].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
}

// ─── Stats step ───────────────────────────────────────────────────────────────

function buildStatsStep(st, goMech) {
  if (!st.mecStats)      st.mecStats      = { str:8, dex:8, con:8, int:8, wis:8, cha:8 };
  if (!st.mecChosen)     st.mecChosen     = [];
  if (!st.mecStatMethod) st.mecStatMethod = 'pointbuy';
  if (!st.mecStdAssign)  st.mecStdAssign  = {};
  if (!st.mecRolls || !st.mecRolls.length) st.mecRolls = Array(6).fill(null);
  if (!st.mecRollAssign) st.mecRollAssign = {};

  const STD_ARRAY = [15, 14, 13, 12, 10, 8];
  const bodyEl  = el('div', { class: 'mech-stats-scroll' });
  const footBtn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('equipment') }, 'Далее → Снаряжение');
  footBtn.addEventListener('mouseenter', e => {
    if (footBtn.disabled) showSrcTip(e, { name: '', desc: 'Заполните все характеристики, чтобы продолжить' });
  });
  footBtn.addEventListener('mouseleave', hideSrcTip);
  const footEl  = el('div', { class: 'mech-foot' }, footBtn);

  function allAssigned() {
    const m = st.mecStatMethod;
    if (m === 'pointbuy') return pbSpent(st.mecStats) === PB_POOL;
    if (m === 'standard') return Object.keys(st.mecStdAssign).length === ABILITIES.length;
    return st.mecRolls.every(r => r !== null) && Object.keys(st.mecRollAssign).length === ABILITIES.length;
  }

  function switchMethod(id) { st.mecStatMethod = id; scheduleSave(st); refresh(); }

  const METHOD_HELP = `Распределение по очкам\n27 очков в диапазоне 8–15. Самый сбалансированный метод — полный контроль над каждой характеристикой.\n\nСтандартный массив\n[15, 14, 13, 12, 10, 8] — проверенный набор, быстрый старт без броска кубиков.\n\nСлучайная генерация\n4d6, отброс минимума — случайный результат, иногда удача, иногда нет.`;

  // ── Single method row: selector + help + inline content ──

  function buildMethodRow() {
    const selEl = el('select', { class: 'stat-method-sel' },
      el('option', { value: 'pointbuy' }, 'Распределение по очкам'),
      el('option', { value: 'standard' }, 'Стандартный массив'),
      el('option', { value: 'random'   }, 'Случайная генерация'),
    );
    selEl.value = st.mecStatMethod;
    selEl.addEventListener('change', () => switchMethod(selEl.value));

    const helpBtn = el('button', { class: 'stat-method-help', type: 'button' }, '?');
    helpBtn.addEventListener('mouseenter', e => showSrcTip(e, { name: 'Методы генерации', desc: METHOD_HELP }));
    helpBtn.addEventListener('mouseleave', hideSrcTip);

    const m = st.mecStatMethod;
    let inlineContent;

    if (m === 'pointbuy') {
      const spent  = pbSpent(st.mecStats);
      const remain = PB_POOL - spent;
      const cls    = remain < 0 ? 'over' : remain === 0 ? 'done' : remain <= 7 ? 'low' : 'ok';
      const pct    = Math.min(100, (spent / PB_POOL) * 100);
      inlineContent = el('div', { class: 'stat-inline-pb' },
        el('div', { class: 'pb-track stat-inline-pb-track' },
          el('div', { class: `pb-fill${cls !== 'ok' ? ' ' + cls : ''}`, style: `width:${pct}%` }),
        ),
        el('div', { class: 'pb-counter' },
          el('span', { class: `pb-remaining ${cls}` }, remain),
          el('span', { class: 'pb-of' }, `/ ${PB_POOL}`),
        ),
      );
    } else if (m === 'standard') {
      const usedVals = new Set(Object.values(st.mecStdAssign));
      inlineContent = el('div', { class: 'stat-std-chips' },
        ...STD_ARRAY.map(v => el('span', { class: `stat-std-chip${usedVals.has(v) ? ' is-used' : ''}` }, String(v))),
      );
    } else {
      inlineContent = el('div', { class: 'stat-rnd-blocks' },
        ...st.mecRolls.map((r, i) => {
          if (!r) {
            return el('button', {
              class: 'stat-rnd-roll-btn',
              onClick: () => {
                st.mecRolls[i] = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
                scheduleSave(st); refresh();
              },
            }, '🎲');
          }
          const sorted = [...r].sort((a, b) => b - a);
          const total  = sorted[0] + sorted[1] + sorted[2];
          const chip = el('span', { class: 'stat-std-chip stat-rnd-val' }, String(total));
          chip.addEventListener('mouseenter', e => showSrcTip(e, {
            name: 'На 4d6 выпало:',
            desc: sorted.join('  '),
          }));
          chip.addEventListener('mouseleave', hideSrcTip);
          return chip;
        }),
      );
    }

    return el('div', { class: 'stat-method-row' }, selEl, helpBtn, inlineContent);
  }

  // ── Ability block (method-aware) ──

  function buildAbBlock(ability) {
    const { key, label } = ability;
    const method  = st.mecStatMethod;
    const base    = effectiveBase(st, key);       // null if unassigned (std/rnd)
    const baseNum = base ?? 8;
    const asi     = mecRacialAsi(st)[key] || 0;
    const total   = baseNum + asi;
    const mod     = statMod(total);
    const clsData = mecClsData(st);
    const hasSave = clsData?.saves.includes(key) ?? false;
    const saveVal = mod + (hasSave ? 2 : 0);
    const hasVal  = base !== null;

    // Control section
    let controlEl;
    if (method === 'pointbuy') {
      const spent  = pbSpent(st.mecStats);
      const canDec = base > PB_MIN;
      const canInc = base < PB_MAX && (PB_POOL - spent) >= ((PB_COST[base + 1] ?? 99) - PB_COST[base]);
      const btnDec = el('button', { class: 'ab-btn', onClick: () => { if (canDec) { st.mecStats[key]--; scheduleSave(st); refresh(); } } }, '−');
      const btnInc = el('button', { class: 'ab-btn', onClick: () => { if (canInc) { st.mecStats[key]++; scheduleSave(st); refresh(); } } }, '+');
      if (!canDec) btnDec.disabled = true;
      if (!canInc) btnInc.disabled = true;
      const nextCost = base < PB_MAX ? (PB_COST[base + 1] ?? 0) - PB_COST[base] : null;
      const costSpan = el('span', { class: 'ab-cost' }, `(${PB_COST[base]})`);
      const tipDesc = nextCost === 2
        ? `Потрачено очков: ${PB_COST[base]}\nВнимание: повышение до ${base + 1} стоит 2 очка`
        : `Потрачено очков: ${PB_COST[base]}`;
      costSpan.addEventListener('mouseenter', e => showSrcTip(e, { name: '', desc: tipDesc }));
      costSpan.addEventListener('mouseleave', hideSrcTip);
      controlEl = el('div', { class: 'ab-control ab-control-pb' },
        el('div', { class: 'ab-stepper' }, btnDec, el('span', { class: 'ab-base-val' }, base), btnInc),
        costSpan,
      );
    } else if (method === 'standard') {
      const takenVals = Object.entries(st.mecStdAssign).filter(([k]) => k !== key).map(([, v]) => v);
      const sel = el('select', { class: 'stat-assign-sel' },
        el('option', { value: '' }, '—'),
        ...STD_ARRAY.map(v => {
          const attrs = { value: String(v) };
          if (takenVals.includes(v)) attrs.disabled = 'true';
          return el('option', attrs, String(v));
        }),
      );
      sel.value = base !== null ? String(base) : '';
      sel.addEventListener('change', () => {
        if (sel.value) st.mecStdAssign[key] = parseInt(sel.value);
        else delete st.mecStdAssign[key];
        scheduleSave(st); refresh();
      });
      controlEl = el('div', { class: `ab-control ab-control-std${hasVal ? ' is-assigned' : ''}` }, sel);
    } else { // random
      const usedIdx = Object.entries(st.mecRollAssign).filter(([k]) => k !== key).map(([, i]) => Number(i));
      const sel = el('select', { class: 'stat-assign-sel' },
        el('option', { value: '' }, '—'),
        ...st.mecRolls.flatMap((r, i) => {
          if (!r) return [];
          const sorted = [...r].sort((a, b) => b - a);
          const tot  = sorted[0] + sorted[1] + sorted[2];
          const attrs = { value: String(i) };
          if (usedIdx.includes(i)) attrs.disabled = 'true';
          return [el('option', attrs, String(tot))];
        }),
      );
      const assignedIdx = st.mecRollAssign[key];
      sel.value = assignedIdx !== undefined ? String(assignedIdx) : '';
      sel.addEventListener('change', () => {
        if (sel.value !== '') st.mecRollAssign[key] = parseInt(sel.value);
        else delete st.mecRollAssign[key];
        scheduleSave(st); refresh();
      });
      controlEl = el('div', { class: `ab-control ab-control-rnd${hasVal ? ' is-assigned' : ''}` }, sel);
    }

    const statRow = el('div', { class: 'ab-stat-row' },
      el('span', { class: 'ab-name' }, label),
      controlEl,
      el('div',  { class: 'ab-vsep' }),
      el('div',  { class: 'ab-derived' },
        ...(asi !== 0 ? [
          el('span', { class: 'ab-racial-badge' }, asi > 0 ? `+${asi}` : `${asi}`),
          el('span', { class: 'ab-arrow' }, '→'),
        ] : []),
        el('span', { class: 'ab-total' }, hasVal ? String(total) : '—'),
        el('span', { class: 'ab-deriv-lbl' }, 'МОД'),
        el('span', { class: 'ab-mod'  }, hasVal ? signNum(mod)     : '—'),
        el('div',  { class: `ms-pip${hasSave ? ' active' : ''}` }),
        el('span', { class: 'ab-deriv-lbl' }, 'СБ'),
        el('span', { class: `ab-save${hasSave ? ' prof' : ''}` }, hasVal ? signNum(saveVal) : '—'),
      ),
    );

    const bgProfs  = mecBgSkills(st);
    const chosen   = new Set(st.mecChosen);
    const skills   = SKILLS_BY_AB[key];
    const clsOpts  = clsData ? (clsData.list ?? Object.values(SKILLS_BY_AB).flat()) : [];
    const maxPicks = clsData?.count ?? 0;
    const picked   = [...chosen].filter(s => clsOpts.includes(s)).length;

    const skillEls = [...skills].sort((a, b) => a.localeCompare(b, 'ru')).map(name => {
      const fromBg     = bgProfs.includes(name);
      const fromClass  = chosen.has(name);
      const proficient = fromBg || fromClass;
      const canPick    = clsOpts.includes(name) && !fromBg;
      const atLimit    = picked >= maxPicks;
      const bonus      = mod + (proficient ? 2 : 0);
      let cbCls = 'sk-cb';
      if (fromBg)         cbCls += ' src-bg has-check';
      else if (fromClass) cbCls += ' src-class has-check';
      else if (canPick)   cbCls += ' opt-class';
      const locked = fromBg || (!fromClass && (!canPick || atLimit));
      return el('div', {
        class: `skill-row${locked ? ' locked' : ''}`,
        onClick: () => {
          if (fromBg) return;
          const s = new Set(st.mecChosen);
          if (fromClass)                s.delete(name);
          else if (canPick && !atLimit) s.add(name);
          else return;
          st.mecChosen = [...s]; scheduleSave(st); refresh();
        },
      },
        el('div',  { class: cbCls }),
        el('span', { class: `sk-name${proficient ? ' proficient' : ''}` }, name),
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: `sk-bonus${fromClass ? ' col-class' : fromBg ? ' col-bg' : ''}` }, signNum(bonus)),
        ),
      );
    });

    if (key === 'wis') {
      const percProf = bgProfs.includes('Восприятие') || chosen.has('Восприятие');
      const passVal  = 10 + mod + (percProf ? 2 : 0);
      skillEls.push(el('div', { class: 'skill-row locked' },
        el('div',  { class: 'sk-cb sk-cb-passive' }),
        el('span', { class: 'sk-name' }, 'Пасс. Внимательность'),
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: 'sk-bonus' }, String(passVal)),
        ),
      ));
    }

    return el('div', { class: 'ab-block' },
      statRow,
      skills.length ? el('div', { class: 'ab-skills-grid' }, ...skillEls) : null,
    );
  }

  function refresh() {
    st.mecStatsOk = allAssigned();
    bodyEl.innerHTML = '';
    bodyEl.append(
      buildMethodRow(),
      el('div', { class: 'mech-stats-grid' }, ...ABILITIES.map(buildAbBlock)),
      footEl,
    );
    footBtn.disabled = !st.mecStatsOk;
  }

  refresh();

  // ── Character info in title row ──
  const AB_DAT = { str:'Силе', dex:'Ловкости', con:'Телосложению', int:'Интеллекту', wis:'Мудрости', cha:'Харизме' };
  const AB_GEN = { str:'Силы', dex:'Ловкости', con:'Телосложения', int:'Интеллекта', wis:'Мудрости', cha:'Харизмы' };

  const raceStr = st.mecRace
    ? (st.mecSubrace ? `${st.mecSubrace} ${st.mecRace.split('::')[1]}` : st.mecRace.split('::')[1])
    : null;
  const clsObj2 = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsStr  = clsObj2?.name || null;
  const bgStr   = st.mecBackground ? st.mecBackground.split('::')[1] : null;

  const asiObj   = mecRacialAsi(st);
  const bgSkList = mecBgSkills(st);
  const clsData2 = mecClsData(st);

  const navSuffix = n => n === 1 ? 'навык' : n <= 4 ? 'навыка' : 'навыков';

  const asiText = Object.entries(asiObj).filter(([, v]) => v)
    .map(([k, v]) => `+${v} к ${AB_DAT[k]}`).join(', ');

  const raceTip = asiText ? `даёт бонусы к:\n${asiText}` : null;
  const clsTip  = clsData2 ? `• спасброски от ${(clsData2.saves || []).map(k => AB_GEN[k]).join(', ')}\n• ${clsData2.count} ${navSuffix(clsData2.count)} на выбор` : null;
  const bgTip   = bgSkList.length ? `навыки: ${bgSkList.join(', ')}` : null;

  const infoItems = [
    { text: st.name || 'Безымянный', cls: st.name ? 'is-char-name' : 'is-char-name is-unnamed', tip: null },
    ...(raceStr ? [{ text: raceStr, cls: 'is-race',  tip: raceTip ? { name: raceStr, desc: raceTip } : null }] : []),
    ...(clsStr  ? [{ text: clsStr,  cls: 'is-class', tip: clsTip  ? { name: clsStr,  desc: clsTip  } : null }] : []),
    ...(bgStr   ? [{ text: bgStr,   cls: 'is-bg',    tip: bgTip   ? { name: bgStr,   desc: bgTip   } : null }] : []),
  ];

  const infoEl = el('span', { class: 'mech-stat-char-info' });
  infoItems.forEach((item, i) => {
    if (i > 0) infoEl.append(el('span', { class: 'mech-stat-sep' }, ' · '));
    const span = el('span', { class: `mech-stat-entity ${item.cls}` }, item.text);
    if (item.tip) {
      span.addEventListener('mouseenter', e => showSrcTip(e, item.tip));
      span.addEventListener('mouseleave', hideSrcTip);
    }
    infoEl.append(span);
  });

  return el('div', { class: 'mech-step-body' },
    el('div', { class: 'mech-stats-title-row' },
      el('h2', { class: 'mech-step-title' }, 'Характеристики'),
      infoEl,
    ),
    bodyEl,
  );
}

// ─── Equipment step: data ─────────────────────────────────────────────────────

const CLASS_EQUIP = {
  'Бард':         ['Рапира или длинный меч', 'Набор дипломата', 'Музыкальный инструмент', 'Кожаный доспех + кинжал'],
  'Варвар':       ['Боевой топор или 2 простых оружия', 'Набор путешественника', '4 метательных топора'],
  'Воин':         ['Кольчуга или кожаный доспех + лук', 'Щит или боевое оружие', 'Арбалет + 20 болтов', 'Набор путешественника'],
  'Волшебник':    ['Посох или кинжал', 'Книга заклинаний', 'Компонентный мешочек', 'Набор учёного'],
  'Друид':        ['Щит или простое оружие', 'Кожаный доспех', 'Деревянный щит', 'Набор путешественника'],
  'Жрец':         ['Боевой молот или простое оружие', 'Кольчуга', 'Символ веры', 'Набор священника'],
  'Изобретатель': ['2 кинжала', 'Любое простое оружие', 'Воровские инструменты', 'Кожаный доспех', 'Набор подземелья'],
  'Колдун':       ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор учёного', 'Кожаный доспех + 2 кинжала'],
  'Монах':        ['Короткий меч или простое оружие', 'Набор путешественника', '10 дротиков'],
  'Паладин':      ['Боевое оружие + щит', 'Метательные копья ×5', 'Кольчуга', 'Набор священника'],
  'Плут':         ['Рапира или короткий меч', 'Короткий меч или лук + 20 стрел', 'Набор взломщика', 'Кожаный доспех + 2 кинжала'],
  'Следопыт':     ['Кольчужная рубаха', '2 коротких меча', 'Набор путешественника', 'Лук + 20 стрел'],
  'Чародей':      ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор мага', '2 кинжала'],
};

const BG_EQUIP = {
  'Аколит':           ['Символ веры', 'Молитвенник или 5 палочек благовоний', '5 свечей', 'Облачение'],
  'Артист':           ['Сувенир', 'Дорожный костюм'],
  'Беспризорник':     ['Небольшой нож', 'Карта города', 'Тёмный плащ'],
  'Благородный':      ['Тонкие одежды', 'Перстень с гербом', 'Рекомендательное письмо'],
  'Гильдейский мастер': ['Письмо от гильдии', 'Опрятная одежда'],
  'Городская стража':    ['Форменная одежда', 'Рожок', 'Кандалы'],
  'Клановый мастер':     ['Памятный предмет клана', 'Обычная одежда'],
  'Монастырский учёный': ['Письмо о принятии', 'Записная книжка', 'Перо и чернила', 'Обычная одежда'],
  'Придворный':          ['Придворная одежда', 'Рекомендательное письмо'],
  'Дальний странник':    ['Реликвия из дома', 'Записная книжка', 'Путевые вещи'],
  'Наследник':           ['Предмет наследства', 'Путевая одежда'],
  'Рыцарь ордена':       ['Символ ордена', 'Путевая одежда'],
  'Ветеран наёмника':    ['Знак воинского звания', 'Значок отряда', 'Обычная одежда'],
  'Городской охотник':   ['Подходящая одежда'],
  'Член племени Угтардов': ['Охотничий трофей', 'Дорожная одежда'],
  'Дворянин Уотердипа':  ['Отличная одежда', 'Рекомендательное письмо'],
  'Агент Азория':        ['Форменная одежда', 'Чернила и перо'],
  'Культист Груула':     ['Ритуальный тотем', 'Оружие с надписями', 'Путевая одежда'],
  'Дитя Диммира':        ['Тёмный плащ', 'Набор для грима'],
  'Преследуемый':        ['Амулет с именем любимого', 'Одежда с мирного дня'],
  'Следователь':         ['Записная книжка', 'Чернила и перо', 'Обычная одежда'],
  'Работник балагана':   ['Маскировочный костюм', 'Набор для грима', 'Путевая одежда'],
  'Жулик':            ['Шулерские карты', 'Одежда разных сословий'],
  'Матрос':           ['Дубина', '50 фут. канат', 'Дорожная одежда'],
  'Мудрец':           ['Чернила', 'Перо', 'Нож для бумаги', 'Письмо с вопросом'],
  'Народный герой':   ['Лопата', 'Горшок', 'Дорожная одежда'],
  'Отшельник':        ['Свитки с заметками', 'Зимнее одеяло', 'Огниво'],
  'Преступник':       ['Воровские инструменты', 'Тёмная одежда с капюшоном'],
  'Скиталец':         ['Путевые дневники', 'Карты родной земли', 'Дорожные одежды'],
  'Солдат':           ['Знак воинского звания', 'Трофей с врага', 'Дорожная одежда'],
};

const BG_GOLD = {
  // PHB
  'Аколит': 15, 'Артист': 15, 'Беспризорник': 10, 'Благородный': 25,
  'Гильдейский мастер': 15, 'Жулик': 15, 'Матрос': 10, 'Мудрец': 10,
  'Народный герой': 10, 'Отшельник': 5, 'Преступник': 15, 'Скиталец': 10,
  'Солдат': 10, 'Собственная предыстория': 0,
  // SCAG
  'Городская стража': 10, 'Клановый мастер': 5, 'Монастырский учёный': 10,
  'Придворный': 5, 'Дальний странник': 5, 'Наследник': 15,
  'Рыцарь ордена': 10, 'Ветеран наёмника': 10, 'Городской охотник': 20,
  'Член племени Угтардов': 10, 'Дворянин Уотердипа': 20,
  // GGR
  'Агент Азория': 10, 'Культист Груула': 10, 'Дитя Диммира': 15,
  // VRGR
  'Преследуемый': 1, 'Следователь': 10,
  // WBW
  'Работник балагана': 8,
};

const CLASS_GOLD = {
  'Бард':         { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Варвар':       { formula: '2к4×10', rolls: 2, die: 4, mult: 10 },
  'Воин':         { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Волшебник':    { formula: '4к4×10', rolls: 4, die: 4, mult: 10 },
  'Друид':        { formula: '2к4×10', rolls: 2, die: 4, mult: 10 },
  'Жрец':         { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Изобретатель': { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Колдун':       { formula: '4к4×10', rolls: 4, die: 4, mult: 10 },
  'Монах':        { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Паладин':      { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Плут':         { formula: '4к4×10', rolls: 4, die: 4, mult: 10 },
  'Следопыт':     { formula: '5к4×10', rolls: 5, die: 4, mult: 10 },
  'Чародей':      { formula: '3к4×10', rolls: 3, die: 4, mult: 10 },
};

// ─── Equipment step: kit contents ─────────────────────────────────────────────

const EQUIP_KITS = {
  'Набор дипломата':       ['Сундук', 'Чернила ×2', 'Перо', 'Бумага ×5', 'Духи', 'Воск для печатей', 'Придворная одежда'],
  'Набор путешественника': ['Ранец', 'Спальный мешок', 'Кружка', 'Дорожная одежда ×2', 'Огниво', 'Факелы ×10', 'Паёк ×10', 'Фляга воды', 'Верёвка 15 м'],
  'Набор учёного':         ['Книга', 'Чернила', 'Перо', 'Нож для бумаги', 'Мешочек с песком', 'Небольшой нож'],
  'Набор взломщика':       ['Ломик', 'Молоток', 'Стальные колья ×10', 'Фонарь с заслонкой', 'Масло ×2', 'Паёк ×5', 'Верёвка 15 м'],
  'Набор священника':      ['Одеяло', 'Свечи ×10', 'Огниво', 'Кадильница', 'Ладан', 'Стихарь', 'Паёк ×2'],
  'Набор мага':            ['Записная книжка', 'Чернила', 'Перо', 'Нож для бумаги', 'Мешочек с песком', 'Небольшой нож'],
  'Набор подземелья':      ['Ломик', 'Молоток', 'Стальные колья ×10', 'Свечи ×10', 'Огниво', 'Масло ×1', 'Паёк ×5', 'Верёвка 15 м'],
};

function makeChoiceSel(opts, key, st, onChange) {
  if (!st.mecEquipChoices) st.mecEquipChoices = {};
  const sel = el('select', { class: 'equip-choice-sel' },
    ...opts.map(o => el('option', { value: o }, o)),
  );
  sel.value = st.mecEquipChoices[key] ?? opts[0];
  sel.addEventListener('change', () => { st.mecEquipChoices[key] = sel.value; scheduleSave(st); if (onChange) onChange(); });
  return el('div', { class: 'equip-item is-choice' },
    el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾')),
  );
}

const EQUIP_FREE_CHOICES = {
  'Любое простое оружие':   SIMPLE_WEAPONS,
  'Музыкальный инструмент': INSTRUMENTS,
};

function resolveEquipOpts(item) {
  if (EQUIP_FREE_CHOICES[item]) return EQUIP_FREE_CHOICES[item];
  if (item.includes(' или ')) return item.split(' или ');
  return null;
}

function equipItemEls(items, st, prefix) {
  return items.map((item, idx) => {
    const kitItems = EQUIP_KITS[item];
    if (kitItems) {
      return el('div', { class: 'equip-kit' },
        el('span', { class: 'equip-kit-label' }, item),
        el('ul', { class: 'equip-kit-list' }, ...kitItems.map(ki => el('li', {}, ki))),
      );
    }
    const opts = resolveEquipOpts(item);
    if (opts) return makeChoiceSel(opts, `${prefix}_${idx}`, st);
    return el('div', { class: 'equip-item' }, item);
  });
}

function renderEquipItems(items, st, prefix) {
  return el('div', { class: 'equip-items' }, ...equipItemEls(items, st, prefix));
}

// ─── Equipment shop helpers ───────────────────────────────────────────────────

function parseWeightLb(w) {
  if (!w || w === '—') return 0;
  const m = w.match(/([\d,.]+)\s*фнт/);
  if (!m) return 0;
  const s = m[1].replace(',', '.');
  if (s.includes('/')) { const [a, b] = s.split('/'); return +a / +b; }
  return parseFloat(s) || 0;
}
function cartGoldLeft(st) {
  return Math.round(((st.mecEquipGold || 0) - (st.mecCart || []).reduce((a, i) => a + i.costGp * i.qty, 0)) * 100) / 100;
}
function cartTotalLb(st) {
  return Math.round((st.mecCart || []).reduce((a, i) => a + i.weightLb * i.qty, 0) * 10) / 10;
}
function charCarryCap(st) {
  const s = (effectiveBase(st, 'str') ?? 10) + (mecRacialAsi(st).str || 0);
  return s * 15;
}
function fmtGp(n) {
  const r = Math.round(n * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

// ─── Spells step ─────────────────────────────────────────────────────────────

// Per-class spellcasting configuration (5e14)
const SPELL_CONFIG = {
  'bard':      { type: 'known',    stat: 'cha', cantripCount: 2, spellCount: 4 },
  'wizard':    { type: 'book',     stat: 'int', cantripCount: 3, spellCount: 6, preparedCount: 2 },
  'druid':     { type: 'prepared', stat: 'wis', cantripCount: 2, spellCount: null },
  'cleric':    { type: 'prepared', stat: 'wis', cantripCount: 3, spellCount: null },
  'artificer': { type: 'prepared', stat: 'int', cantripCount: 2, spellCount: null },
  'warlock':   { type: 'pact',     stat: 'cha', cantripCount: 2, spellCount: 2 },
  'paladin':   { type: 'prepared', stat: 'cha', cantripCount: 0, spellCount: null },
  'ranger':    { type: 'known',    stat: 'wis', cantripCount: 0, spellCount: 2 },
  'sorcerer':  { type: 'known',    stat: 'cha', cantripCount: 4, spellCount: 2 },
};

const STAT_LABEL = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение',
                     int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
const STAT_SHORT = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ',
                     int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };

const CAST_TYPE_LABEL = {
  known:    'Известные заклинания',
  prepared: 'Подготовленные заклинания',
  book:     'Книга заклинаний',
  pact:     'Заклинания пакта',
};

const SPELL_FLAVOR = {
  'Бард':        'Магия — твоё искусство. Знаешь небольшой набор заклинаний наизусть. На каждом новом уровне можешь заменить одно из них.',
  'Волшебник':   'Ты учёный магии. Заклинания записаны в Книге заклинаний. Каждое утро выбираешь, какие изучить — найденные свитки можно копировать в книгу.',
  'Друид':       'Природа говорит с тобой. Весь пул заклинаний открыт — каждый день подготавливаешь нужные по ситуации.',
  'Жрец':        'Твоя магия — дар бога. Весь пул доступен всегда. Каждое утро заново выбираешь, какие молитвы подготовить.',
  'Изобретатель':'Магия через изобретения. Подготавливаешь заклинания каждый день из открытого пула.',
  'Колдун':      'Твоя сила — договор с Покровителем. Мало заклинаний, но твои слоты восполняются уже на коротком отдыхе.',
  'Паладин':     'Твои заклинания — клятва, воплощённая в силе. Пул открыт, каждый день выбираешь подготовленные.',
  'Следопыт':    'Магия природы поддерживает путь охотника. Знаешь заклинания наизусть, менять ежедневно не нужно.',
  'Чародей':     'Магия в твоей крови — врождённая сила. Знаешь заклинания наизусть. Особая механика: Очки Чародейства для дополнительных слотов.',
};

function spellStatMod(st, key) {
  const base = (effectiveBase(st, key) ?? 10) + (mecRacialAsi(st)[key] || 0);
  return Math.floor((base - 10) / 2);
}

function computePreparedCount(cfg, st) {
  if (cfg.spellCount !== null) return cfg.spellCount;
  const mod = spellStatMod(st, cfg.stat);
  if (cfg.type === 'prepared' && (cfg.stat === 'wis' || cfg.stat === 'cha')) {
    return Math.max(1, mod + 1); // +level, but at level 1 that's 1
  }
  return Math.max(1, Math.floor(1 / 2) + mod); // half_level = 0 at level 1, so just mod
}

function buildSpellsStep(st, goMech) {
  const clsId  = st.mecClass || '';
  const cfg    = SPELL_CONFIG[clsId];
  const clsObj = CLASS_DATA.find(c => c.id === clsId);
  const className = clsObj ? clsObj.name : clsId;
  if (!cfg) {
    return el('div', { class: 'mech-step-wrap' },
      el('p', { style: 'color:var(--text-muted);padding:32px' }, 'Класс не выбран — вернись к шагу «Класс».'),
    );
  }

  const cantrips   = getCantripsForClass(className);
  const lvl1spells = getLevel1SpellsForClass(className);

  // Init state
  if (!st.mecSpellsCantrips) st.mecSpellsCantrips = [];
  if (!st.mecSpellsLevel1)   st.mecSpellsLevel1   = [];
  if (!st.mecSpellsBook)     st.mecSpellsBook     = [];
  if (!st.mecSpellsPrepared) st.mecSpellsPrepared = [];

  // Filter state (UI-only, not persisted to DB)
  const filterText   = st._spellFilter  || '';
  const filterSchool = st._spellSchool  || null;

  function applyFilter(list) {
    return list.filter(s => {
      const q = filterText.trim().toLowerCase();
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (filterSchool && s.school !== filterSchool) return false;
      return true;
    });
  }

  const preparedCount = computePreparedCount(cfg, st);
  const statLabel     = STAT_LABEL[cfg.stat];
  const statShort     = STAT_SHORT[cfg.stat];
  const statModVal    = spellStatMod(st, cfg.stat);

  // ── Validation ──────────────────────────────────────────────────────────
  function isValid() {
    if (cfg.cantripCount > 0 && st.mecSpellsCantrips.length < cfg.cantripCount) return false;
    if (cfg.type === 'known' && cfg.spellCount !== null && st.mecSpellsLevel1.length < cfg.spellCount) return false;
    if (cfg.type === 'pact'  && st.mecSpellsLevel1.length < cfg.spellCount) return false;
    if (cfg.type === 'book'  && st.mecSpellsBook.length < cfg.spellCount)    return false;
    if (cfg.type === 'book'  && st.mecSpellsPrepared.length < cfg.preparedCount) return false;
    return true;
  }

  // ── Rebuild on selection ─────────────────────────────────────────────────
  function rebuild() {
    scheduleSave(st);
    const wrap = document.querySelector('.mech-spell-wrap');
    if (wrap) {
      const scrollTop = wrap.scrollTop;
      const newStep = buildSpellsStep(st, goMech);
      wrap.replaceWith(newStep);
      // Restore scroll position after DOM swap
      const newWrap = document.querySelector('.mech-spell-wrap');
      if (newWrap) newWrap.scrollTop = scrollTop;
    }
  }
  function rebuildFilter() {
    const prevVal = st._spellFilter;
    rebuild();
    if (prevVal !== undefined) {
      setTimeout(() => {
        const inp = document.querySelector('.mech-spell-search');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }, 0);
    }
  }

  // ── Spell card builder ───────────────────────────────────────────────────
  function spellCard(spell, selectedSet, limit) {
    const isSelected = selectedSet.includes(spell.name);
    const isDisabled = !isSelected && selectedSet.length >= limit;
    const badges = [];
    if (spell.ritual)        badges.push(el('span', { class: 'mech-spell-badge mech-spell-badge--ritual' }, 'Ритуал'));
    if (spell.concentration) badges.push(el('span', { class: 'mech-spell-badge mech-spell-badge--conc' },   'Конц.'));
    const cardAttrs = {
      class: 'mech-spell-card' + (isSelected ? ' is-selected' : '') + (isDisabled ? ' is-disabled' : ''),
    };
    if (!isDisabled) {
      cardAttrs.onClick = () => {
        if (isSelected) selectedSet.splice(selectedSet.indexOf(spell.name), 1);
        else             selectedSet.push(spell.name);
        rebuild();
      };
    }
    return el('div', cardAttrs,
      el('div', { class: 'mech-spell-card-name' }, spell.name),
      el('div', { class: 'mech-spell-card-school' }, spell.school || ''),
      el('p',   { class: 'mech-spell-card-desc' }, spell.description || ''),
      badges.length ? el('div', { class: 'mech-spell-badges' }, ...badges) : null,
    );
  }

  // ── ① Passport (class card with inline features) ─────────────────────────
  // Build feature rows for passport
  const hasRitual = ['Бард', 'Волшебник', 'Жрец', 'Друид', 'Изобретатель', 'Следопыт', 'Паладин'].includes(className);
  const focusMap  = {
    'Бард': 'Музыкальный инструмент', 'Волшебник': 'Магический фокус или компонентный мешочек',
    'Жрец': 'Священный символ', 'Паладин': 'Священный символ', 'Друид': 'Друидский фокус',
    'Колдун': 'Магический фокус', 'Чародей': 'Магический фокус',
    'Следопыт': 'Компонентный мешочек', 'Изобретатель': 'Воровские инструменты или набор умельца',
  };

  const passportFeatures = [];
  // Spellbook comes first for wizards
  if (cfg.type === 'book') {
    passportFeatures.push(el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, '📖 Книга заклинаний'),
      el('span', { class: 'mech-spell-passport-feature-text' },
        'Ты знаешь все заклинания из книги. Каждое утро выбираешь, какие подготовить — найденные свитки тоже можно скопировать.',
      ),
    ));
  }
  if (hasRitual) {
    passportFeatures.push(el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, '🕯 Ритуальное колдовство'),
      el('span', { class: 'mech-spell-passport-feature-text' },
        'Заклинания с тегом «ритуал» можно читать без расхода слота — на 10 мин дольше.',
      ),
    ));
  }
  if (focusMap[className]) {
    passportFeatures.push(el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, '🔮 Фокусировка'),
      el('span', { class: 'mech-spell-passport-feature-text' },
        `${focusMap[className]} — вместо материальных компонентов.`,
      ),
    ));
  }
  if (className === 'Колдун') {
    passportFeatures.push(el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, '✦ Воззвания'),
      el('span', { class: 'mech-spell-passport-feature-text' },
        'На 2-м уровне выбираешь Воззвания — пассивные улучшения и способности от Покровителя.',
      ),
    ));
  }
  if (className === 'Чародей') {
    passportFeatures.push(el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, '✦ Метамагия'),
      el('span', { class: 'mech-spell-passport-feature-text' },
        'На 3-м уровне: усиляй заклинания, тратя Очки Чародейства.',
      ),
    ));
  }

  if (st._spellPassportOpen === undefined) st._spellPassportOpen = true;
  const isOpen = st._spellPassportOpen;

  const toggleBtn = el('button', {
    class: 'mech-spell-passport-toggle',
    onClick: () => { st._spellPassportOpen = !st._spellPassportOpen; rebuild(); },
  }, isOpen ? '▲' : '▼');

  const passport = el('div', { class: 'mech-spell-passport' },
    el('div', { class: 'mech-spell-passport-header' },
      el('span', { class: 'mech-spell-class-name' }, className),
      el('span', { class: 'mech-spell-type-badge' },
        el('span', { class: 'mech-spell-type-badge-label' }, 'Тип: '),
        CAST_TYPE_LABEL[cfg.type],
      ),
      toggleBtn,
    ),
    isOpen ? el('div', { class: 'mech-spell-passport-body' },
      el('div', { class: 'mech-spell-stat-line' },
        el('span', { class: 'mech-spell-stat-chip' }, statShort),
        el('span', { class: 'mech-spell-stat-hint' },
          `${statLabel} — ключевая характеристика. Сложность твоих заклинаний: ${8 + statModVal + 2} (обычно). Бонус атаки заклинанием: +${statModVal + 2}.`,
        ),
      ),
      el('p', { class: 'mech-spell-flavor' }, SPELL_FLAVOR[className] || ''),
      passportFeatures.length
        ? el('div', { class: 'mech-spell-passport-features' }, ...passportFeatures)
        : null,
    ) : null,
  );

  // ── ② Counter bar ────────────────────────────────────────────────────────
  const counterParts = [];
  if (cfg.cantripCount > 0) {
    counterParts.push(`Кантрипов: ${st.mecSpellsCantrips.length} / ${cfg.cantripCount}`);
  }
  if (cfg.type === 'book') {
    counterParts.push(`В книге: ${st.mecSpellsBook.length} / ${cfg.spellCount}`);
    counterParts.push(`Подготовлено: ${st.mecSpellsPrepared.length} / ${cfg.preparedCount}`);
  } else if (cfg.type === 'prepared' && cfg.spellCount === null) {
    counterParts.push(`Подготовлено: ${st.mecSpellsLevel1.length} (рекомендуется ≤ ${preparedCount})`);
  } else if (cfg.type !== 'prepared') {
    const cnt = cfg.spellCount;
    if (cnt > 0) counterParts.push(`Заклинаний 1 ур.: ${st.mecSpellsLevel1.length} / ${cnt}`);
  }

  const counter = el('div', { class: 'mech-spell-counter' },
    ...counterParts.map(t => el('span', { class: 'mech-spell-counter-item' }, t)),
  );

  // ── Filter bar ──────────────────────────────────────────────────────────
  const allSpellsList = [...cantrips, ...lvl1spells];
  const schools = [...new Set(allSpellsList.map(s => s.school).filter(Boolean))].sort();

  const searchInp = el('input', {
    class: 'mech-spell-search',
    type: 'text',
    placeholder: '🔍 Поиск по названию...',
  });
  // Set value as DOM property (setAttribute sets default, not current value)
  searchInp.value = filterText;
  searchInp.addEventListener('input', () => {
    st._spellFilter = searchInp.value;
    rebuildFilter();
  });

  const filterBar = el('div', { class: 'mech-spell-filter-bar' },
    searchInp,
    el('div', { class: 'mech-spell-schools' },
      el('button', {
        class: 'mech-spell-school-chip' + (!filterSchool ? ' is-active' : ''),
        onClick: () => { st._spellSchool = null; rebuildFilter(); },
      }, 'Все'),
      ...schools.map(sch => el('button', {
        class: 'mech-spell-school-chip' + (filterSchool === sch ? ' is-active' : ''),
        onClick: () => { st._spellSchool = filterSchool === sch ? null : sch; rebuildFilter(); },
      }, sch)),
    ),
  );

  // Apply filters to spell lists
  const filteredCantrips  = applyFilter(cantrips);
  const filteredLvl1      = applyFilter(lvl1spells);

  // ── ③ Cantrips ───────────────────────────────────────────────────────────
  const cantripSection = cfg.cantripCount > 0
    ? el('div', { class: 'mech-spell-section' },
        el('h3', { class: 'mech-spell-section-title' },
          `Кантрипы — выберите ${cfg.cantripCount}`,
          el('span', { class: 'mech-spell-section-hint' }, ' (заговоры — заклинания без расхода слотов)'),
        ),
        el('div', { class: 'mech-spell-grid' },
          ...(filteredCantrips.length ? filteredCantrips.map(s => spellCard(s, st.mecSpellsCantrips, cfg.cantripCount)) : [el('p', { class: 'mech-spell-empty' }, 'Ничего не найдено')]),
        ),
      )
    : null;

  // ── ④ Level 1 spells ─────────────────────────────────────────────────────
  let spellSection = null;

  if (cfg.type === 'known' || cfg.type === 'pact') {
    const cnt = cfg.spellCount;
    spellSection = el('div', { class: 'mech-spell-section' },
      el('h3', { class: 'mech-spell-section-title' },
        `Заклинания 1 уровня — выберите ${cnt}`,
      ),
      el('div', { class: 'mech-spell-grid' },
        ...(filteredLvl1.length ? filteredLvl1.map(s => spellCard(s, st.mecSpellsLevel1, cnt)) : [el('p', { class: 'mech-spell-empty' }, 'Ничего не найдено')]),
      ),
    );

  } else if (cfg.type === 'book') {
    // Wizard: choose 6 in book, mark 2 prepared
    const prepCard = (spell) => {
      const inBook = st.mecSpellsBook.includes(spell.name);
      const isPrepared = st.mecSpellsPrepared.includes(spell.name);
      const isDisabledBook = !inBook && st.mecSpellsBook.length >= cfg.spellCount;
      const bookAttrs = {
        class: 'mech-spell-card mech-spell-card--book' + (inBook ? ' is-in-book' : '') + (isDisabledBook ? ' is-disabled' : ''),
      };
      if (!isDisabledBook) {
        bookAttrs.onClick = () => {
          if (inBook) {
            st.mecSpellsBook.splice(st.mecSpellsBook.indexOf(spell.name), 1);
            st.mecSpellsPrepared = st.mecSpellsPrepared.filter(n => n !== spell.name);
          } else {
            st.mecSpellsBook.push(spell.name);
          }
          rebuild();
        };
      }
      const card = el('div', bookAttrs,
        el('div', { class: 'mech-spell-card-head' },
          el('span', { class: 'mech-spell-card-name' }, spell.name),
          el('span', { class: 'mech-spell-card-school' }, spell.school),
        ),
        el('p', { class: 'mech-spell-card-desc' }, spell.description),
        inBook ? el('button', {
          class: 'mech-spell-prep-btn' + (isPrepared ? ' is-prepped' : ''),
          onClick: (e) => {
            e.stopPropagation();
            if (isPrepared) {
              st.mecSpellsPrepared = st.mecSpellsPrepared.filter(n => n !== spell.name);
            } else if (st.mecSpellsPrepared.length < cfg.preparedCount) {
              st.mecSpellsPrepared.push(spell.name);
            }
            rebuild();
          },
        }, isPrepared ? '✓ В подготовке' : `Подготовить (${st.mecSpellsPrepared.length}/${cfg.preparedCount})`)
        : null,
      );
      return card;
    };
    spellSection = el('div', { class: 'mech-spell-section' },
      el('h3', { class: 'mech-spell-section-title' }, 'Книга заклинаний — выберите 6'),
      el('p', { class: 'mech-spell-section-sub' }, `Из выбранных отметьте 2 подготовленными — их можно использовать сегодня.`),
      el('div', { class: 'mech-spell-grid' },
        ...(filteredLvl1.length ? filteredLvl1.map(prepCard) : [el('p', { class: 'mech-spell-empty' }, 'Ничего не найдено')]),
      ),
    );

  } else if (cfg.type === 'prepared') {
    const formula = cfg.spellCount === null
      ? `${statLabel} (${statModVal >= 0 ? '+' : ''}${statModVal}) + уровень (1) = рекомендуется ${preparedCount}`
      : `${preparedCount}`;
    spellSection = el('div', { class: 'mech-spell-section' },
      el('h3', { class: 'mech-spell-section-title' }, 'Заклинания 1 уровня'),
      el('p', { class: 'mech-spell-section-sub' },
        `Можно использовать любое заклинание своего класса. Формула подготовки: ${formula}. `,
        el('em', {}, 'Отметь те, что возьмёшь на сегодня — остальные тоже доступны завтра.'),
      ),
      el('div', { class: 'mech-spell-grid' },
        ...(filteredLvl1.length ? filteredLvl1.map(s => spellCard(s, st.mecSpellsLevel1, 99)) : [el('p', { class: 'mech-spell-empty' }, 'Ничего не найдено')]),
      ),
    );
  }

  // ── Next button ───────────────────────────────────────────────────────────
  // Note: disabled must be set as DOM property, not attribute —
  // setAttribute('disabled', false) still disables the button in HTML.
  const nextBtn = el('button', {
    class: 'btn btn-primary mech-next-btn' + (isValid() ? '' : ' is-disabled'),
    onClick: () => {
      scheduleSave(st);
      goMech('equipment');
    },
  }, 'Далее →');
  nextBtn.disabled = !isValid();

  return el('div', { class: 'mech-spell-wrap' },
    el('div', { class: 'mech-step-header' },
      el('h2', { class: 'mech-step-title' }, '🔮 Заклинания'),
    ),
    passport,
    counter,
    filterBar,
    cantripSection,
    spellSection,
    el('div', { class: 'mech-step-footer' }, nextBtn),
  );
}

// ─── Equipment step ───────────────────────────────────────────────────────────

const SHOP_CATS = [
  { id: 'weapons', label: 'Оружие',       items: WEAPONS   },
  { id: 'armour',  label: 'Доспехи',      items: ARMOUR    },
  { id: 'equip',   label: 'Снаряжение',   items: EQUIPMENT },
  { id: 'tools',   label: 'Инструменты',  items: TOOLS     },
];

// ─── Equipment step ───────────────────────────────────────────────────────────

function buildEquipStep(st, goMech) {
  if (!st.mecEquipMode) st.mecEquipMode = 'standard';

  const clsData  = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsName  = clsData?.name ?? null;
  const bgName   = st.mecBackground ? st.mecBackground.split('::')[1] : null;

  const classItems   = clsName ? (CLASS_EQUIP[clsName] || []) : [];
  const bgObj        = bgName  ? Object.values(BACKGROUND_DATA).flat().find(b => b.name === bgName) : null;
  const EQUIP_STEP_CHOICE_TYPES = ['instrument', 'artisan', 'gaming', 'bg_equipment'];
  const bgMatChoices = (bgObj?.choices || []).filter(ch => EQUIP_STEP_CHOICE_TYPES.includes(ch.type));

  const bgGold     = bgName  ? (BG_GOLD[bgName]      ?? null) : null;
  const goldInfo   = clsName ? (CLASS_GOLD[clsName]  ?? null) : null;

  const bodyEl  = el('div', {});
  const footBtn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('final') }, 'Далее → Финал');
  const footEl  = el('div', { class: 'mech-foot equip-foot' }, footBtn);

  function renderBody() {
    bodyEl.innerHTML = '';
    bodyEl.className = st.mecEquipMode === 'standard' ? 'equip-scroll' : 'equip-buy-body';
    footBtn.disabled = false;
    footBtn.title    = '';

    if (st.mecEquipMode === 'standard') {
      const moneyEl = el('div', { class: 'equip-money' },
        bgGold !== null
          ? el('span', { class: 'equip-money-val' }, `${bgGold} зм`)
          : el('span', { class: 'equip-money-empty' }, bgName ? 'нет данных' : 'выберите предысторию'),
        el('span', { class: 'equip-money-label' }, 'стартовые монеты'),
      );

      const clsSec = el('div', { class: 'equip-section' },
        el('div', { class: 'equip-section-hd' },
          el('span', { class: 'equip-section-source is-class' }, 'Класс'),
          el('span', { class: 'equip-section-name' }, clsName ?? 'не выбран'),
        ),
        classItems.length
          ? renderEquipItems(classItems, st, 'cls')
          : el('p', { class: 'equip-empty' }, 'Выберите класс'),
      );

      let bgItems = bgName ? (BG_EQUIP[bgName] || []) : [];
      let activeBgMatChoices = bgMatChoices;
      if (bgName === 'Собственная предыстория') {
        const srcBg = (st.mecEquipChoices || {})['bgch_bg_equipment'] ?? null;
        bgItems = srcBg ? (BG_EQUIP[srcBg] || []) : [];
        if (srcBg) {
          const srcBgObj = Object.values(BACKGROUND_DATA).flat().find(b => b.name === srcBg);
          const srcMatChoices = (srcBgObj?.choices || []).filter(ch =>
            EQUIP_STEP_CHOICE_TYPES.includes(ch.type) && ch.type !== 'bg_equipment',
          );
          activeBgMatChoices = [...bgMatChoices, ...srcMatChoices];
        }
      }
      const bgChoiceEls = activeBgMatChoices.map(ch =>
        makeChoiceSel(bgChoiceOptions(ch.type), `bgch_${ch.type}`, st, ch.type === 'bg_equipment' ? renderBody : null),
      );
      const bgAllEls = [...bgChoiceEls, ...equipItemEls(bgItems, st, 'bg')];
      const bgSec = el('div', { class: 'equip-section' },
        el('div', { class: 'equip-section-hd' },
          el('span', { class: 'equip-section-source is-bg' }, 'Предыстория'),
          el('span', { class: 'equip-section-name' }, bgName ?? 'не выбрана'),
        ),
        bgAllEls.length
          ? el('div', { class: 'equip-items' }, ...bgAllEls)
          : el('p', { class: 'equip-empty' }, 'Выберите предысторию'),
      );

      bodyEl.append(moneyEl, clsSec, bgSec, footEl);

    } else {
      const rolled = st.mecEquipGold !== null && st.mecEquipGold !== undefined;

      const rollBtn = el('button', { class: 'equip-roll-btn',
        onClick: () => {
          if (!goldInfo || rolled) return;
          st.mecEquipGold = Array.from({ length: goldInfo.rolls },
            () => Math.floor(Math.random() * goldInfo.die) + 1
          ).reduce((a, b) => a + b, 0) * goldInfo.mult;
          scheduleSave(st);
          renderBody();
        },
      }, goldInfo ? `Бросить ${goldInfo.formula}` : 'Бросить');
      rollBtn.disabled = !goldInfo || rolled;

      const moneyBuyEl = el('div', { class: 'equip-money' },
        el('span', { class: `equip-money-val${!rolled ? ' is-pending' : ''}` },
          rolled ? `${st.mecEquipGold} зм` : '— зм'),
        el('span', { class: 'equip-money-label' }, 'стартовый капитал'),
        !rolled ? rollBtn : null,
      );

      bodyEl.append(moneyBuyEl, buildBuyMode(st, footBtn), footEl);
    }
  }

  const equipHelp = el('button', { class: 'stat-method-help' }, '?');
  equipHelp.addEventListener('mouseenter', e => showSrcTip(e, {
    name: 'Как выбрать снаряжение?',
    desc: 'Стандарт — готовый набор вещей от класса и предыстории плюс стартовые монеты.\n\nЗакуп — бросаете кубики по таблице класса и тратите золото на снаряжение самостоятельно.',
  }));
  equipHelp.addEventListener('mouseleave', hideSrcTip);

  const modeBar = el('div', { class: 'equip-mode-bar' },
    ...['standard', 'buy'].map(m => {
      const btn = el('button', {
        class: `equip-mode-btn${st.mecEquipMode === m ? ' is-active' : ''}`,
        onClick: () => {
          st.mecEquipMode = m;
          scheduleSave(st);
          modeBar.querySelectorAll('.equip-mode-btn').forEach(b =>
            b.classList.toggle('is-active', b.dataset.mode === m)
          );
          renderBody();
        },
      }, m === 'standard' ? 'Стандарт' : 'Закуп');
      btn.dataset.mode = m;
      return btn;
    }),
    equipHelp,
  );

  renderBody();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Снаряжение'),
    modeBar,
    bodyEl,
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

// Font Awesome 5 Solid — hat-wizard (svgicons.com/icon/36308)
const SVG_CONCEPT   = `<svg width="32" height="32" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M496 448H16c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h480c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zm-304-64l-64-32 64-32 32-64 32 64 64 32-64 32-16 32h208l-86.41-201.63a63.955 63.955 0 0 1-1.89-45.45L416 0 228.42 107.19a127.989 127.989 0 0 0-53.46 59.15L64 416h144zm64-224l16-32 16 32 32 16-32 16-16 32-16-32-32-16z"/></svg>`;
// Font Awesome 5 Solid — dice-d20 (svgicons.com/icon/36504)
const SVG_MECHANICS = `<svg width="32" height="32" viewBox="0 0 480 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M106.75 215.06L1.2 370.95c-3.08 5 .1 11.5 5.93 12.14l208.26 22.07zM7.41 315.43L82.7 193.08 6.06 147.1c-2.67-1.6-6.06.32-6.06 3.43v162.81c0 4.03 5.29 5.53 7.41 2.09zm10.84 108.17 194.4 87.66c5.3 2.45 11.35-1.43 11.35-7.26v-65.67l-203.55-22.3c-4.45-.5-6.23 5.59-2.2 7.57zm81.22-257.78L179.4 22.88c4.34-7.06-3.59-15.25-10.78-11.14L17.81 110.35c-2.47 1.62-2.39 5.26.13 6.78zM240 176h109.21L253.63 7.62C250.5 2.54 245.25 0 240 0s-10.5 2.54-13.63 7.62L130.79 176zm233.94-28.9-76.64 45.99 75.29 122.35c2.11 3.44 7.41 1.94 7.41-2.1V150.53c0-3.11-3.39-5.03-6.06-3.43zm-93.41 18.72 81.53-48.7c2.53-1.52 2.6-5.16.13-6.78l-150.81-98.6c-7.19-4.11-15.12 4.08-10.78 11.14zm79.02 250.21L256 438.32v65.67c0 5.84 6.05 9.71 11.35 7.26l194.4-87.66c4.03-1.97 2.25-8.06-2.2-7.56zm-86.3-200.97-108.63 190.1 208.26-22.07c5.83-.65 9.01-7.14 5.93-12.14zM240 208H139.57L240 383.75 340.43 208z"/></svg>`;
const SVG_CAMERA    = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function renderCreateNew(container, router, step = 'landing', params = {}) {
  // If editing an existing draft, load it from DB
  if (params?.id && (!_st || _st._charId !== params.id)) {
    const char = await DB.get(params.id).catch(() => null);
    if (char) {
      // Always carry _charId so re-save updates the same record, not creates new
      _st = Object.assign(
        freshState(),
        char._wizardState ?? {},
        { _charId: char.id },
      );
    }
  }
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
    if (newStep === 'landing')         router.navigate('/create');
    else if (newStep === 'characters') { _st = null; router.navigate('/'); }
    else router.navigate('/create/' + newStep);
  }

  container.innerHTML = '';
  if      (step === 'landing')   container.append(buildLanding(st, go));
  else if (step === 'concept')   container.append(buildConcept(st, go));
  else if (step === 'mechanics') container.append(buildMechanics(st, go, container));
  else container.append(el('div', { class: 'cnew-wip' }, step + ' — скоро'));
}
