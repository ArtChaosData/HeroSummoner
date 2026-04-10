// Sourcebook descriptions for the edition/sources selection step (4.4.1)
// Used to populate the sourcebook cards in the supplements modal.
// 'id' matches the dnd.su filter_source IDs used in spells.js.

export const SOURCES = [

  {
    id: 102,
    code: 'PHB',
    name: 'Книга игрока',
    nameEn: "Player's Handbook",
    year: 2014,
    edition: '5e14',
    alwaysOn: true,
    category: 'core',
    description: 'Основная книга правил D&D 5e: все базовые классы, расы, предыстории, заклинания и механики. Обязательна — всегда включена.',
    adds: ['12 классов + Монах/Плут', '9 рас', '14 предысторий', '~200 заклинаний'],
  },

  {
    id: 109,
    code: 'XGE',
    name: 'Руководство Занатара по всему',
    nameEn: "Xanathar's Guide to Everything",
    year: 2017,
    edition: '5e14',
    alwaysOn: false,
    category: 'expansion',
    description: 'Крупнейшее дополнение 5e14: новые подклассы для каждого класса, дополнительные заклинания и расширенные правила для исследования и крафта.',
    adds: ['32 новых подкласса', '~95 новых заклинаний', 'Таблицы случайных событий'],
  },

  {
    id: 117,
    code: 'TCE',
    name: 'Котёл Таши со всем',
    nameEn: "Tasha's Cauldron of Everything",
    year: 2020,
    edition: '5e14',
    alwaysOn: false,
    category: 'expansion',
    description: 'Масштабное обновление правил: новые подклассы, опциональные правила (кастомизация характеристик рас), Изобретатель как полноценный класс и новые заклинания.',
    adds: ['Изобретатель (Artificer)', '30+ подклассов', 'Опциональные правила рас', '~30 заклинаний'],
  },

  {
    id: 108,
    code: 'SCAG',
    name: 'Руководство авантюриста по Берегу Мечей',
    nameEn: "Sword Coast Adventurer's Guide",
    year: 2015,
    edition: '5e14',
    alwaysOn: false,
    category: 'setting',
    description: 'Сеттинговая книга по Забытым Королевствам: подклассы и кантрипы для игр во Фэйруне, включая знаменитые боевые кантрипы.',
    adds: ['Боевые кантрипы (громовой клинок, зелёное пламя)', '~10 подклассов', 'Расширенный лор Берега Мечей'],
  },

  {
    id: 107,
    code: 'EEPC',
    name: 'Руководство игрока по элементальному злу',
    nameEn: 'Elemental Evil Player\'s Companion',
    year: 2015,
    edition: '5e14',
    alwaysOn: false,
    category: 'expansion',
    description: 'Бесплатное дополнение к приключению «Принцы апокалипса»: стихийные расы и новые кантрипы/заклинания с акцентом на природные стихии.',
    adds: ['4 расы (Аасимар, Голиаф, Кенку, Аарококра)', 'Стихийные кантрипы и заклинания'],
  },

  {
    id: null,
    code: 'VGtM',
    name: 'Руководство Вolo по монстрам',
    nameEn: "Volo's Guide to Monsters",
    year: 2016,
    edition: '5e14',
    alwaysOn: false,
    category: 'expansion',
    description: 'Новые игровые расы из мира монстров: гоблины, хобгоблины, оркоки, табакси, тритоны, фирболги и другие необычные существа для персонажей.',
    adds: ['Аасимар (3 подрасы)', 'Голиаф', 'Кенку', 'Таваксия', 'Тритон', 'Фирболг', '7+ других рас'],
  },

  {
    id: null,
    code: 'MTF',
    name: 'Том Морденкайнена с врагами',
    nameEn: "Mordenkainen's Tome of Foes",
    year: 2018,
    edition: '5e14',
    alwaysOn: false,
    category: 'expansion',
    description: 'Лор о великих конфликтах многомировья и новые игровые расы: гифты, глубинные гномы, эладрины и другие.',
    adds: ['Глубинный гном (Svirfneblin)', 'Эладрин (сезонные эльфы)', '4 подрасы тифлинга', 'Расы гифтов'],
  },

  {
    id: 155,
    code: 'SCC',
    name: 'Стриксхэйвен: учебная программа хаоса',
    nameEn: 'Strixhaven: A Curriculum of Chaos',
    year: 2021,
    edition: '5e14',
    alwaysOn: false,
    category: 'setting',
    description: 'Сеттинг магического университета по вселенной Magic: The Gathering. Новые подклассы, заклинания и правила студенческой жизни.',
    adds: ['5 подклассов (факультеты)', 'Заклинания Strixhaven', 'Правила студенческих отношений'],
  },

  {
    id: 115,
    code: 'AI',
    name: 'Acquisitions Incorporated',
    nameEn: 'Acquisitions Incorporated',
    year: 2019,
    edition: '5e14',
    alwaysOn: false,
    category: 'setting',
    description: 'Сеттинг корпоративных приключений по вселенной одноимённого шоу. Включает уникальные «франшизные» подклассы и несколько комических заклинаний.',
    adds: ['6 подклассов (корпоративные роли)', 'Несколько уникальных заклинаний'],
  },

  {
    id: 120,
    code: 'IDRotF',
    name: 'Icewind Dale: Rime of the Frostmaiden',
    nameEn: 'Icewind Dale: Rime of the Frostmaiden',
    year: 2020,
    edition: '5e14',
    alwaysOn: false,
    category: 'setting',
    description: 'Приключение в арктическом Айсвинд Дейле. Содержит несколько новых заклинаний с ледяной тематикой.',
    adds: ['Ледяные заклинания (в т.ч. «Ледяные пальцы»)', 'Правила выживания в холоде'],
  },

];

/** Карта id→code для быстрого поиска */
export const SOURCE_BY_ID = Object.fromEntries(
  SOURCES.filter(s => s.id !== null).map(s => [s.id, s])
);

/** Только активируемые допкниги (не PHB) */
export const OPTIONAL_SOURCES = SOURCES.filter(s => !s.alwaysOn);
