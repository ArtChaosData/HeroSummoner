/**
 * HeroSummoner — Screen 2: Create / Edit Character
 */
import { DB }        from '../db.js';
import { el, toast } from '../utils.js';
import { CLASS_FEATURES }             from '../data/class_features.js';
import { CLASS_FEATURE_DESCRIPTIONS } from '../data/class_feature_descriptions.js';
import { SUBCLASS_FEATURES }          from '../data/subclass_features.js';

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

// Features from Tasha's Cauldron of Everything (optional rules)
const TASHA_FEATURES = new Set([
  'Дополнительные заклинания',     // Бард/Волшебник/Друид/Колдун/Чародей 1
  'Магическое вдохновение',        // Бард 2
  'Первобытное знание',            // Варвар 3, 10
  'Варианты боевых стилей',        // Воин 1, Паладин 2
  'Универсальность воина',         // Воин 4, Паладин 4, Следопыт 4
  'Формулы заговоров',             // Волшебник 3
  'Дикий спутник',                 // Друид 2
  'Универсальность заговоров',     // Друид 4, Жрец 4
  'Благословлённые удары',         // Жрец 8
  'Праведное восстановление',      // Жрец 2, Паладин 3
  'Вариант договора',              // Колдун 3
  'Мистическая универсальность',   // Колдун 4
  'Выбранное оружие',              // Монах 2
  'Атака, наделённая ци',          // Монах 3
  'Ускоренное исцеление',          // Монах 4
  'Фокусировка на цели',           // Монах 5
  'Точное прицеливание',           // Плут 3
  'Предпочтительный противник',    // Следопыт 1
  'Искусный исследователь',        // Следопыт 1
  'Заклинательная фокусировка',    // Следопыт 2
  'Изначальная осведомлённость',   // Следопыт 3
  'Природная завеса',              // Следопыт 10
  'Варианты метамагии',            // Чародей 3
  'Универсальность чародея',       // Чародей 4
  'Волшебное указание',            // Чародей 5
]);

const CLASSES = {
  'Бард':      { die:8,  saves:['dex','cha'], count:3, list:null },
  'Варвар':    { die:12, saves:['str','con'], count:2, list:['Атлетика','Восприятие','Природа','Запугивание','Уход за животными','Выживание'] },
  'Воин':      { die:10, saves:['str','con'], count:2, list:['Акробатика','Атлетика','История','Восприятие','Уход за животными','Запугивание','Выживание'] },
  'Волшебник': { die:6,  saves:['int','wis'], count:2, list:['Магия','История','Расследование','Медицина','Природа','Религия'] },
  'Друид':     { die:8,  saves:['int','wis'], count:2, list:['Магия','Медицина','Природа','Восприятие','Религия','Уход за животными','Выживание'] },
  'Жрец':      { die:8,  saves:['wis','cha'], count:2, list:['История','Магия','Медицина','Религия','Убеждение'] },
  'Изобретатель':  { die:8,  saves:['con','int'], count:2, list:['Магия','История','Расследование','Медицина','Природа','Восприятие','Ловкость рук'] },
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

// 3×3 alignment grid — row 0=good, row 1=neutral, row 2=evil
const ALIGN_GRID = [
  ['Законопослушный добрый',     'Нейтральный добрый',     'Хаотичный добрый'],
  ['Законопослушный нейтральный','Истинный нейтральный',   'Хаотичный нейтральный'],
  ['Законопослушный злой',       'Нейтральный злой',       'Хаотичный злой'],
];

const CLASS_EQUIP = {
  'Бард':      ['Рапира или длинный меч', 'Набор дипломата', 'Музыкальный инструмент', 'Кожаный доспех + кинжал'],
  'Варвар':    ['Боевой топор или 2 простых оружия', 'Набор путешественника', '4 метательных топора'],
  'Воин':      ['Кольчуга или кожаный доспех + лук', 'Щит или боевое оружие', 'Арбалет + 20 болтов', 'Набор путешественника'],
  'Волшебник': ['Посох или кинжал', 'Книга заклинаний', 'Компонентный мешочек', 'Набор учёного'],
  'Друид':     ['Щит или простое оружие', 'Кожаный доспех', 'Деревянный щит', 'Набор путешественника'],
  'Жрец':      ['Боевой молот или простое оружие', 'Кольчуга', 'Символ веры', 'Набор священника'],
  'Изобретатель':  ['2 кинжала', 'Любое простое оружие', 'Воровские инструменты', 'Кожаный доспех', 'Набор подземелья'],
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

// ─── Spellcasting data ────────────────────────────────────────────────────────

const SPELL_STAT = {
  'Бард':'cha','Жрец':'wis','Друид':'wis','Волшебник':'int',
  'Колдун':'cha','Паладин':'cha','Следопыт':'wis','Чародей':'cha','Изобретатель':'int',
};

// Full casters: slots per spell level [1..9] by class level
const SLOTS_FULL = [
  [2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],
  [4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],
  [4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],
  [4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],
  [4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1],
];
// Half casters (Paladin, Ranger)
const SLOTS_HALF = [
  [0,0,0,0,0],[2,0,0,0,0],[3,0,0,0,0],[3,0,0,0,0],[4,2,0,0,0],
  [4,2,0,0,0],[4,3,0,0,0],[4,3,0,0,0],[4,3,2,0,0],[4,3,2,0,0],
  [4,3,3,0,0],[4,3,3,0,0],[4,3,3,1,0],[4,3,3,1,0],[4,3,3,2,0],
  [4,3,3,2,0],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2],
];
// Artificer (half caster from L1)
const SLOTS_ARTIFICER = [
  [2,0,0,0,0],[2,0,0,0,0],[3,0,0,0,0],[3,0,0,0,0],[4,2,0,0,0],
  [4,2,0,0,0],[4,3,0,0,0],[4,3,0,0,0],[4,3,2,0,0],[4,3,2,0,0],
  [4,3,3,0,0],[4,3,3,0,0],[4,3,3,1,0],[4,3,3,1,0],[4,3,3,2,0],
  [4,3,3,2,0],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2],
];
// Warlock pact magic: [slots, slot_level] by class level
const SLOTS_WARLOCK = [
  [1,1],[2,1],[2,2],[2,2],[2,3],[2,3],[2,4],[2,4],[2,5],[2,5],
  [3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[4,5],[4,5],[4,5],[4,5],
];
const SPELL_SLOTS = {
  'Бард':SLOTS_FULL,'Жрец':SLOTS_FULL,'Друид':SLOTS_FULL,'Волшебник':SLOTS_FULL,'Чародей':SLOTS_FULL,
  'Паладин':SLOTS_HALF,'Следопыт':SLOTS_HALF,
  'Колдун':'warlock',
  'Изобретатель':SLOTS_ARTIFICER,
};

// Spells known per level (known-based casters)
const SPELLS_KNOWN_TABLE = {
  'Бард':     [2,5,7,9,10,11,12,13,14,15,16,17,17,18,18,19,20,20,20,22],
  'Следопыт': [0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
  'Чародей':  [2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
  'Колдун':   [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
};

// Preparation formula: prepared = floor(level / div) + stat_mod (min 1)
const SPELL_PREP_FORMULA = {
  'Волшебник':    { stat: 'int', div: 1 },
  'Жрец':         { stat: 'wis', div: 1 },
  'Друид':        { stat: 'wis', div: 1 },
  'Паладин':      { stat: 'cha', div: 2 },
  'Изобретатель': { stat: 'int', div: 2 },
};

// ─── Weapons ──────────────────────────────────────────────────────────────────
const W = (cat,dmg,dtype,fin,rng,hands,props=[]) => ({cat,dmg,dtype,fin,rng,hands,props});
const WEAPONS_DATA = {
  // Simple melee
  'Кинжал':          W('s','1d4','колющий',  1,0,1,['Лёгкое','Метание']),
  'Дубина':          W('s','1d4','дробящий', 0,0,1,['Лёгкое']),
  'Посох':           W('s','1d6','дробящий', 0,0,1,['Универс. 1d8']),
  'Копьё':           W('s','1d6','колющий',  0,0,1,['Метание','Универс. 1d8']),
  'Топорик':         W('s','1d6','рубящий',  0,0,1,['Лёгкое','Метание']),
  'Булава':          W('s','1d6','дробящий', 0,0,1),
  'Серп':            W('s','1d4','рубящий',  0,0,1,['Лёгкое']),
  'Дубинка':         W('s','1d4','дробящий', 0,0,1,['Лёгкое']),
  // Simple ranged
  'Праща':           W('s','1d4','дробящий', 0,1,1),
  'Дротик':          W('s','1d4','колющий',  1,1,1,['Метание']),
  'Короткий лук':    W('s','1d6','колющий',  0,1,2),
  'Лёгкий арбалет':  W('s','1d8','колющий',  0,1,2,['Перезарядка']),
  // Martial melee
  'Скимитар':        W('m','1d6','рубящий',  1,0,1,['Лёгкое']),
  'Рапира':          W('m','1d8','колющий',  1,0,1),
  'Короткий меч':    W('m','1d6','колющий',  1,0,1,['Лёгкое']),
  'Длинный меч':     W('m','1d8','рубящий',  0,0,1,['Универс. 1d10']),
  'Боевой топор':    W('m','1d8','рубящий',  0,0,1,['Универс. 1d10']),
  'Боевой молот':    W('m','1d8','дробящий', 0,0,1,['Универс. 1d10']),
  'Двуручный меч':   W('m','2d6','рубящий',  0,0,2,['Тяжёлое']),
  'Алебарда':        W('m','1d10','рубящий', 0,0,2,['Тяжёлое','Досягаемость']),
  'Пика':            W('m','1d10','колющий', 0,0,2,['Досягаемость']),
  // Martial ranged
  'Ручной арбалет':  W('m','1d6','колющий',  0,1,1,['Лёгкое','Перезарядка']),
  'Длинный лук':     W('m','1d8','колющий',  0,1,2,['Тяжёлое']),
  'Тяжёлый арбалет': W('m','1d10','колющий', 0,1,2,['Тяжёлое','Перезарядка']),
  // Special
  'Щит':             W('s',null,null,         0,0,1,['+2 КД']),
  'Безоружный':      W('s','1','дробящий',    0,0,0),
};

// ─── Proficiency data ─────────────────────────────────────────────────────────

const INSTRUMENTS  = ['Лютня','Лира','Флейта','Свирель','Рог','Барабан','Виола','Цимбалы','Волынка'];
const ARTISAN_TOOLS = ['Инстр. алхимика','Пивоваренные принадлежности','Плотницкие инстр.','Инстр. сапожника','Инстр. кузнеца','Инстр. картографа','Инстр. повара','Ювелирные инстр.','Гончарные инстр.','Инстр. столяра'];
const EXTRA_LANGS  = ['Карликовый','Эльфийский','Великаний','Гномий','Гоблинский','Орочий','Небесный','Глубинный','Инфернальный','Дракарис','Первобытный','Слоговый','Сильван','Подземный','Авраль'];

const CLASS_PROFS_DATA = {
  'Бард':      { armor:['Лёгкие доспехи'], weapons:['Простое оружие','Рапира','Длинный меч','Короткий меч','Метательные ножи'], tools:[{choose:3,from:INSTRUMENTS,label:'Инструмент'}], langs:0 },
  'Варвар':    { armor:['Лёгкие доспехи','Средние доспехи','Щиты'], weapons:['Простое оружие','Воинское оружие'], tools:[], langs:0 },
  'Воин':      { armor:['Все доспехи','Щиты'], weapons:['Простое оружие','Воинское оружие'], tools:[], langs:0 },
  'Волшебник': { armor:[], weapons:['Кинжалы','Дротики','Пращи','Посохи','Лёгкие арбалеты'], tools:[], langs:0 },
  'Друид':     { armor:['Лёгкие доспехи','Средние доспехи','Щиты (не металл)'], weapons:['Булавы','Серпы','Скимитары','Дубинки','Кинжалы','Дротики','Пращи','Копья','Боевые посохи'], tools:['Набор травника'], langs:0 },
  'Жрец':      { armor:['Лёгкие доспехи','Средние доспехи','Щиты'], weapons:['Простое оружие'], tools:[], langs:0 },
  'Изобретатель':  { armor:['Лёгкие доспехи','Средние доспехи','Щиты'], weapons:['Простое оружие','Огнестрельное оружие'], tools:['Воровские инструменты',{choose:1,from:ARTISAN_TOOLS,label:'Инстр. ремесленника'}], langs:0 },
  'Колдун':    { armor:['Лёгкие доспехи'], weapons:['Простое оружие'], tools:[], langs:0 },
  'Монах':     { armor:[], weapons:['Простое оружие','Короткие мечи'], tools:[{choose:1,from:[...ARTISAN_TOOLS,...INSTRUMENTS],label:'Инструмент'}], langs:0 },
  'Паладин':   { armor:['Все доспехи','Щиты'], weapons:['Простое оружие','Воинское оружие'], tools:[], langs:0 },
  'Плут':      { armor:['Лёгкие доспехи'], weapons:['Простое оружие','Рапиры','Короткие мечи','Длинные луки','Метательные ножи'], tools:['Воровские инструменты',{choose:1,from:INSTRUMENTS,label:'Муз. инструмент'}], langs:0 },
  'Следопыт':  { armor:['Лёгкие доспехи','Средние доспехи','Щиты'], weapons:['Простое оружие','Воинское оружие'], tools:[], langs:0 },
  'Чародей':   { armor:[], weapons:['Кинжалы','Дротики','Пращи','Посохи','Лёгкие арбалеты'], tools:[], langs:0 },
};

const RACE_LANGS_BASE = {
  'Аасимар':['Общий','Небесный'],'Гном':['Общий','Гномий'],'Голиаф':['Общий','Великаний'],
  'Дварф':['Общий','Карликовый'],'Дракорождённый':['Общий','Дракарис'],'Кенку':['Общий','Авраль'],
  'Полуорк':['Общий','Орочий'],'Полурослик':['Общий','Полурослика'],'Полуэльф':['Общий','Эльфийский'],
  'Таваксия':['Общий'],'Тифлинг':['Общий','Инфернальный'],'Тритон':['Общий','Первобытный'],
  'Фирболг':['Эльфийский','Великаний'],'Человек':['Общий'],'Эльф':['Общий','Эльфийский'],
};
const RACE_EXTRA_LANGS = { 'Человек':1, 'Полуэльф':2 };

const BG_PROFS = {
  'Аколит':                  { langs:2 },
  'Артист':                   { tools:[{choose:1,from:INSTRUMENTS,label:'Инструмент'}] },
  'Гильдейский ремесленник':  { tools:[{choose:1,from:ARTISAN_TOOLS,label:'Инстр. ремесленника'}] },
  'Дворянин':                 { tools:[{choose:1,from:INSTRUMENTS,label:'Инструмент'}], langs:1 },
  'Моряк':                    { tools:['Навигационные инструменты','Водный транспорт'] },
  'Мудрец':                   { langs:2 },
  'Народный герой':           { tools:[{choose:1,from:ARTISAN_TOOLS,label:'Инстр. ремесленника'},'Наземный транспорт'] },
  'Отшельник':                { tools:['Набор травника'] },
  'Преступник':               { tools:['Игровые кости','Воровские инструменты'] },
  'Солдат':                   { tools:[{choose:1,from:['Кости','Карты','Три дракона'],label:'Игровой набор'},'Наземный транспорт'] },
  'Чужестранец':              { langs:2 },
  'Шарлатан':                 { tools:['Набор для маскировки','Набор фальсификатора'] },
};

const SUBCLASSES = {
  'Бард':      { level:3, list:['Коллегия знания','Коллегия доблести','Коллегия шепотов','Коллегия гламура','Коллегия мечей','Коллегия красноречия'] },
  'Варвар':    { level:3, list:['Путь берсерка','Путь тотемного воина','Путь громового неба','Путь диких магов','Путь зверя'] },
  'Воин':      { level:3, list:['Чемпион','Боевой мастер','Мистический рыцарь','Рунный рыцарь','Псионический воин','Стрелок'] },
  'Волшебник': { level:2, list:['Школа ограждения','Школа воплощения','Школа некромантии','Школа иллюзий','Школа прорицания','Школа очарования','Школа призыва','Хронург'] },
  'Друид':     { level:2, list:['Круг земли','Круг луны','Круг звёзд','Круг спор','Круг огня','Круг пастыря'] },
  'Жрец':      { level:1, list:['Домен войны','Домен жизни','Домен смерти','Домен света','Домен природы','Домен бури','Домен знаний','Домен обмана','Домен порядка','Домен мира','Домен кузни'] },
  'Изобретатель':  { level:3, list:['Алхимик','Артиллерист','Боевой кузнец','Бронник'] },
  'Колдун':    { level:1, list:['Архифея','Великий древний','Небожитель','Фиенд','Клинок','Джинн','Нежить'] },
  'Монах':     { level:3, list:['Путь открытой ладони','Путь тьмы','Путь четырёх стихий','Путь сострадания','Путь пьяного мастера','Путь солнечной души'] },
  'Паладин':   { level:3, list:['Клятва преданности','Клятва древних','Клятва мщения','Клятва завоевания','Клятва искупления','Клятва славы'] },
  'Плут':      { level:3, list:['Взломщик','Убийца','Магический трюкач','Следователь','Фантом','Обманщик душ'] },
  'Следопыт':  { level:3, list:['Охотник','Зверовод','Странник горизонта','Убийца фей','Рой монстров'] },
  'Чародей':   { level:1, list:['Дикая магия','Драконье происхождение','Тень','Небесный','Буря','Часовой механизм'] },
};


const RACE_FEATURES_L1 = {
  'Аасимар':        ['Тёмное зрение 60 фт', 'Небесное сопротивление', 'Исцеляющие руки'],
  'Гном':           ['Тёмное зрение 60 фт', 'Гномья хитрость'],
  'Голиаф':         ['Атлетическая мощь', 'Горное происхождение', 'Могучий атлет'],
  'Дварф':          ['Тёмное зрение 60 фт', 'Дварфийская стойкость', 'Знание камня'],
  'Дракорождённый': ['Наследие дракона (дыхание)', 'Урон по типу дракона'],
  'Кенку':          ['Мастер мимикрии', 'Умения засады'],
  'Полуорк':        ['Тёмное зрение 60 фт', 'Свирепость', 'Устойчивость'],
  'Полурослик':     ['Везение', 'Храбрость', 'Ловкость полуросликов'],
  'Полуэльф':       ['Тёмное зрение 60 фт', 'Устойчивость к очарованию', '+2 навыка'],
  'Таваксия':       ['Кошачья грация', 'Тёмное зрение 60 фт'],
  'Тифлинг':        ['Тёмное зрение 60 фт', 'Адское сопротивление (огонь)', 'Адское наследие'],
  'Тритон':         ['Плавание 30 фт', 'Земноводный', 'Контроль воды'],
  'Фирболг':        ['Скрытая стопа', 'Обнаружение магии', 'Мощь великана'],
  'Человек':        ['Разностороннее развитие (+1 ко всем)'],
  'Эльф':           ['Тёмное зрение 60 фт', 'Острые чувства', 'Транс'],
};

const CLASS_GOLD = {
  'Бард':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Варвар':    { formula:'2к4×10', rolls:2, die:4, mult:10 },
  'Воин':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Волшебник': { formula:'4к4×10', rolls:4, die:4, mult:10 },
  'Друид':     { formula:'2к4×10', rolls:2, die:4, mult:10 },
  'Жрец':      { formula:'5к4×10', rolls:5, die:4, mult:10 },
  'Изобретатель':  { formula:'5к4×10', rolls:5, die:4, mult:10 },
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

function buildAlignWidget(state, refresh) {
  const ROW_CLS = ['align-good', 'align-neut', 'align-evil'];

  const dropdown = el('div', { class: 'align-dropdown' });

  // Portal to body — escapes overflow clipping in header
  document.querySelectorAll('.align-dropdown').forEach(d => d.remove());
  dropdown.style.position = 'fixed';
  document.body.append(dropdown);

  ALIGN_GRID.forEach((row, ri) =>
    row.forEach((full) => {
      const parts = full.replace('Законопослушный', 'Законно-').split(' ');
      const cell = el('button', {
        class: `align-cell ${ROW_CLS[ri]}${state.alignment === full ? ' active' : ''}`,
        onClick: (e) => {
          e.stopPropagation();
          state.alignment = full;
          dropdown.style.display = 'none';
          refresh();
        },
      });
      parts.forEach((p, i) => {
        if (i > 0) cell.append(document.createElement('br'));
        cell.append(document.createTextNode(p));
      });
      dropdown.append(cell);
    })
  );

  const trigger = el('button', {
    class: `align-trigger${state.alignment ? '' : ' placeholder'}`,
    onClick: (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'grid';
      if (isOpen) {
        dropdown.style.display = 'none';
      } else {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top  = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.display = 'grid';
        setTimeout(() => {
          document.addEventListener('click', () => { dropdown.style.display = 'none'; }, { once: true });
        }, 0);
      }
    },
  }, state.alignment || '— Выбрать —');

  return el('div', { class: 'id-field id-align-f' },
    el('label', {}, 'Мировоззрение'),
    trigger,
  );
}

// ─── Description renderer ─────────────────────────────────────────────────────

const profBonus = lvl => Math.floor((lvl - 1) / 4) + 2;

const STAT_KW = [
  ['Харизм',      'cha'],
  ['Мудрост',     'wis'],
  ['Интеллект',   'int'],
  ['Силы',        'str'],
  ['Ловкост',     'dex'],
  ['Телосложен',  'con'],
];

function calcFormula(line, state) {
  if (!line.includes('+') || !line.includes('модификатор')) return null;
  let total = 0;
  if (/=\s*8/.test(line) || /:\s*8\s*\+/.test(line)) total += 8;
  if (line.includes('мастерства')) total += profBonus(state.level);
  for (const [kw, key] of STAT_KW) {
    if (line.includes(kw)) { total += mod(totalStat(state, key)); break; }
  }
  return total;
}

function renderDesc(text, state) {
  const wrap = el('div', { class: 'feat-item-desc' });
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    if (i === 0) {
      wrap.append(el('span', { class: 'feat-desc-meta' }, t));
      return;
    }
    // Subheading: short, no formula, no sentence-ending punctuation, not ending with a conjunction
    const CONJ_END = /\s(И|В|НА|С|А|НО|ДЛЯ|ПО|ОТ|ДО|ИЛИ|ЖЕ|БЫ|ЛИ)$/i;
    if (t.length < 65 && !t.includes('=') && !/[.,;:]$/.test(t) && !CONJ_END.test(t)) {
      wrap.append(el('div', { class: 'feat-desc-hd' }, t));
      return;
    }
    const calc = state.class ? calcFormula(t, state) : null;
    if (calc !== null) {
      const p = el('p', { class: 'feat-desc-p feat-desc-formula-line' }, t,
        el('span', { class: 'feat-desc-formula' }, ` = ${calc}`)
      );
      wrap.append(p);
    } else {
      wrap.append(el('p', { class: 'feat-desc-p' }, t));
    }
  });
  return wrap;
}

// Case-insensitive description lookup
function lookupDesc(map, name) {
  if (!map) return null;
  if (map[name]) return map[name];
  const up = name.toUpperCase();
  for (const k of Object.keys(map)) if (k.toUpperCase() === up) return map[k];
  // Try stripping trailing parenthetical suffix, e.g. "Вдохновение барда (к6)" → "Вдохновение барда"
  const stripped = name.replace(/\s*\([^)]*\)$/, '').trim();
  if (stripped !== name) {
    if (map[stripped]) return map[stripped];
    const upStripped = stripped.toUpperCase();
    for (const k of Object.keys(map)) if (k.toUpperCase() === upStripped) return map[k];
  }
  return null;
}

// Title-case for ALL_CAPS subclass feature names
function toTitle(s) {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function buildFeatItem(name, desc, state, refresh, isTasha = false) {
  const expanded = !!state.featExpanded[name];
  const hasDesc  = !!desc;
  const hdClass  = `feat-item-hd${expanded ? ' open' : ''}${hasDesc ? ' has-desc' : ''}`;
  return el('div', { class: 'feat-item' },
    el('div', {
      class: hdClass,
      onClick: hasDesc ? () => { state.featExpanded[name] = !expanded; refresh(); } : null,
    },
      el('span', { class: `feat-arrow${hasDesc ? '' : ' invis'}` }, expanded ? '▾' : '▸'),
      el('span', { class: 'feat-item-name' },
        name,
        isTasha ? el('span', { class: 'feat-tasha-badge' }, 'Таша') : null,
      ),
    ),
    expanded && desc ? renderDesc(desc, state) : null,
  );
}

function buildFeatSection(key, title, items, state, refresh) {
  if (!items.length) return null;
  const LABELS = { class:'Класс', subclass:'Подкласс', race:'Раса', bg:'Предыстория' };
  const collapsed = !!state.featSections[key];
  return el('div', { class: 'feat-sec' },
    el('div', { class: 'feat-sec-hd', onClick: () => { state.featSections[key] = !collapsed; refresh(); } },
      el('span', { class: `feat-sec-tag feat-tag-${key}` }, LABELS[key]),
      el('span', { class: 'feat-sec-name' }, title),
      el('span', { class: 'feat-sec-arrow' }, collapsed ? '›' : '⌄'),
    ),
    collapsed ? null : el('div', { class: 'feat-items' },
      ...items.map(({ name, desc, tasha }) => buildFeatItem(name, desc, state, refresh, !!tasha))
    ),
  );
}

function buildFeaturesBlock(state, refresh) {
  if (!state.featSections) state.featSections = {};
  if (!state.featExpanded) state.featExpanded = {};

  const clsDescs = state.class ? CLASS_FEATURE_DESCRIPTIONS[state.class] : null;
  const clsItems = [];
  const clsBaseIdx = new Map(); // baseName → index in clsItems, for upgrade tracking
  if (state.class) {
    for (let lvl = 1; lvl <= state.level; lvl++) {
      for (const name of (CLASS_FEATURES[state.class]?.[lvl] || [])) {
        if (TASHA_FEATURES.has(name) && !state.tasha) continue;
        const baseName = name.replace(/\s*\([^)]*\)$/, '').trim();
        const item = { name, desc: lookupDesc(clsDescs, name), tasha: TASHA_FEATURES.has(name) };
        if (baseName !== name && clsBaseIdx.has(baseName)) {
          // Upgraded variant (e.g. "Вдохновение барда (к8)") — replace existing entry
          clsItems[clsBaseIdx.get(baseName)] = item;
        } else {
          clsBaseIdx.set(baseName, clsItems.length);
          clsItems.push(item);
        }
      }
    }
  }

  const subData  = state.subclass ? SUBCLASS_FEATURES[state.class]?.[state.subclass] : null;
  const subItems = [];
  if (subData) {
    for (let lvl = 1; lvl <= state.level; lvl++) {
      for (const raw of (subData.features[lvl] || [])) {
        const name = toTitle(raw);
        subItems.push({ name, desc: lookupDesc(subData.descriptions, raw) });
      }
    }
  }

  const raceItems = (RACE_FEATURES_L1[state.race] || []).map(name => ({ name, desc: null }));
  const bgSkillNames = BACKGROUNDS[state.background]?.skills || [];
  const bgItems = bgSkillNames.length
    ? [{ name: `Навыки: ${bgSkillNames.join(', ')}`, desc: null }] : [];

  const sections = [
    buildFeatSection('class',    state.class       || '—', clsItems,  state, refresh),
    buildFeatSection('subclass', state.subclass    || '—', subItems,  state, refresh),
    buildFeatSection('race',     state.race        || '—', raceItems, state, refresh),
    buildFeatSection('bg',       state.background  || '—', bgItems,   state, refresh),
  ].filter(Boolean);

  if (!sections.length) return null;

  const collapsed = state.featuresCollapsed;
  return el('div', { class: 'panel features-panel' },
    el('div', { class: 'panel-head' },
      el('span', { class: 'panel-title' }, 'Особенности'),
      el('button', { class: 'collapse-btn', onClick: () => { state.featuresCollapsed = !collapsed; refresh(); } }, collapsed ? '∨' : '∧'),
    ),
    collapsed ? null : el('div', { class: 'feat-body' }, ...sections),
  );
}

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
  const classNames = Object.keys(CLASSES).sort((a,b) => a.localeCompare(b, 'ru'));
  const raceNames  = Object.keys(RACES).sort((a,b) => a.localeCompare(b, 'ru'));
  const bgNames    = Object.keys(BACKGROUNDS).sort((a,b) => a.localeCompare(b, 'ru'));

  const subData     = state.class ? SUBCLASSES[state.class] : null;
  const showSub     = subData && state.level >= subData.level;

  const lvlDec = el('button', { class:'ab-btn', onClick:()=>{ if(state.level>1){ state.level--; refresh(); } } }, '−');
  const lvlInc = el('button', { class:'ab-btn', onClick:()=>{ if(state.level<20){ state.level++; refresh(); } } }, '+');
  if (state.level <= 1)  lvlDec.disabled = true;
  if (state.level >= 20) lvlInc.disabled = true;
  if (subData && state.level >= subData.level && !state.subclass) lvlInc.disabled = true;

  const raceData = state.race ? RACES[state.race] : null;
  const subraces = raceData?.sub || [];

  const fields = [
    // Edition toggle — leftmost
    el('div', { class:'id-field id-edition' },
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
    el('div', { class:'id-field id-tasha' },
      el('label', { class: 'tasha-toggle' },
        (() => {
          const cb = el('input', { type: 'checkbox', class: 'tasha-cb' });
          cb.checked = state.tasha;
          cb.addEventListener('change', () => { state.tasha = cb.checked; refresh(); });
          return cb;
        })(),
        el('span', { class: 'tasha-check' }),
        'Учитывать Ташу',
      )
    ),
    el('div', { class:'id-field id-class-f is-class' }, el('label',{}, 'Класс'),
      makeSel(classNames, state.class, v => { state.class = v; state.subclass = ''; state.chosen.clear(); refresh(); })
    ),
    el('div', { class:'id-field' }, el('label',{}, 'Уровень'),
      el('div', { class:'level-stepper' }, lvlDec, el('div',{ class:'level-badge' }, String(state.level)), lvlInc)
    ),
    ...(showSub ? [
      el('div', { class:'id-field is-class' }, el('label',{}, 'Подкласс'),
        makeSel(subData.list, state.subclass, v => { state.subclass = v; refresh(); })
      ),
    ] : []),
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
    buildAlignWidget(state, refresh),
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
    el('div', { class: 'pb-track' },
      el('div', { class: `pb-fill ${cls === 'ok' ? '' : cls}`, style: `width:${pct}%` })
    ),
    el('div',  { class: 'pb-counter' },
      el('span', { class: `pb-remaining ${cls}` }, remain),
      el('span', { class: 'pb-of' }, `/ ${PB_POOL}`),
    ),
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
  el('div',  { class: 'ab-derived' },
    ...(asi !== 0 ? [
      el('span', { class: 'ab-racial-badge' }, asi > 0 ? `+${asi}` : asi),
      el('span', { class: 'ab-arrow' }, '→'),
    ] : []),
    el('span', { class: 'ab-total' }, total),
    el('span', { class: 'ab-deriv-lbl' }, 'МОД'),
    el('span', { class: 'ab-mod' }, sign(modifier)),
    el('span', { class: 'ab-deriv-lbl' }, 'СБ'),
    el('span', { class: `ab-save${hasSave ? ' prof' : ''}` }, sign(saveVal)),
    el('div',  { class: `ms-pip${hasSave ? ' active' : ''}` }),
  ),
  );

  const skills   = SKILLS_BY_AB[key];
  const bgProfs  = bgSkills(state);
  const opts     = clsOptions(state);
  const maxPicks = state.class ? (CLASSES[state.class]?.count || 2) : 0;
  const picked   = [...state.chosen].filter(s => opts.includes(s)).length;

  const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const skillEls = sorted.map(({ name }) => {
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

    const locked = fromBg || (!fromClass && (!canPick || atLimit));
    return el('div', {
      class: `skill-row${locked ? ' locked' : ''}`,
      onClick: () => {
        if (fromBg) return;
        if (fromClass) { state.chosen.delete(name); refresh(); }
        else if (canPick && !atLimit) { state.chosen.add(name); refresh(); }
      },
    },
      el('div', { class: cbCls }),
      el('span', { class: `sk-name${proficient ? ' proficient' : ''}` }, name),
      el('div', { class: 'sk-bonus-wrap' },
        el('span', { class: `sk-bonus${fromClass ? ' col-class' : fromBg ? ' col-bg' : ''}` }, sign(bonus))
      )
    );
  });

  // Пассивная внимательность — только в блоке Мудрости, в конце
  if (key === 'wis') {
    const percProf = isProf(state, 'Восприятие');
    const passVal  = 10 + modifier + (percProf ? 2 : 0);
    skillEls.push(el('div', { class: 'skill-row locked passive-row' },
      el('div', { class: 'sk-cb sk-cb-passive' }),
      el('span', { class: 'sk-name' }, 'Пасс. Внимательность'),
      el('div', { class: 'sk-bonus-wrap' },
        el('span', { class: 'sk-bonus' }, String(passVal))
      )
    ));
  }

  return el('div', { class: 'ab-block' },
    statRow,
    skills.length
      ? el('div', { class: 'ab-skills-grid' }, ...skillEls)
      : null
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
    // Buy mode — per-class gold is stored in state.equipGoldByClass
    if (!state.equipGoldByClass) state.equipGoldByClass = {};
    const goldResult = cls ? (state.equipGoldByClass[cls] ?? null) : null;
    const rollBtn = el('button', { class: 'btn btn-sm equip-roll-btn',
      onClick: () => {
        if (!goldInfo || !cls || state.equipGoldByClass[cls] != null) return;
        state.equipGoldByClass[cls] = rollDice(goldInfo.rolls, goldInfo.die) * goldInfo.mult;
        refresh();
      },
    });
    rollBtn.disabled = goldResult !== null;
    rollBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" style="flex-shrink:0"><polygon points="10,1 19,6.5 19,13.5 10,19 1,13.5 1,6.5"/><polygon points="10,1 5,10 15,10"/><line x1="5" y1="10" x2="1" y2="6.5"/><line x1="15" y1="10" x2="19" y2="6.5"/><line x1="5" y1="10" x2="1" y2="13.5"/><line x1="15" y1="10" x2="19" y2="13.5"/></svg> Бросить`;
    const rollRow = el('div', { class: 'equip-gold-roll-row' },
      el('span', { class: 'equip-gold-formula' }, goldInfo ? goldInfo.formula : '— зм'),
      rollBtn,
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

  const collapsed = state.equipCollapsed;
  const toggleBtn = el('button', {
    class: 'collapse-btn',
    onClick: () => { state.equipCollapsed = !state.equipCollapsed; refresh(); },
  }, collapsed ? '∨' : '∧');

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('span', { class: 'panel-title' }, 'Снаряжение'),
      tabs,
      toggleBtn
    ),
    collapsed ? null : el('div', { class: 'panel-body' }, body)
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

// ─── Panel help tooltip ────────────────────────────────────────────────────────

function panelHelp(text) {
  const btn = el('button', { class: 'panel-help-btn', 'aria-label': 'Справка' }, '?');
  let tip = null;

  btn.addEventListener('mouseenter', () => {
    tip = el('div', { class: 'panel-tooltip' },
      ...text.split('\n').map(line => el('p', {}, line))
    );
    document.body.append(tip);
    const r = btn.getBoundingClientRect();
    tip.style.position = 'fixed';
    tip.style.top = (r.bottom + 6) + 'px';
    tip.style.left = Math.max(8, r.right - tip.offsetWidth) + 'px';
  });

  btn.addEventListener('mouseleave', () => { tip?.remove(); tip = null; });

  return el('span', { class: 'panel-help-wrap' }, btn);
}

// ─── Weapons block ────────────────────────────────────────────────────────────

function isWeaponProf(state, name) {
  const d = WEAPONS_DATA[name];
  if (!d || !state.class) return false;
  const cw = CLASS_PROFS_DATA[state.class]?.weapons || [];
  return cw.includes('Воинское оружие') ||
    (d.cat === 's' && cw.includes('Простое оружие')) ||
    cw.some(w => name.startsWith(w.replace(/[аыие]$/, '')));
}

function weaponCalc(state, w) {
  const d = WEAPONS_DATA[w.name];
  if (!d?.dmg) return null;
  const strM = mod(totalStat(state, 'str'));
  const dexM = mod(totalStat(state, 'dex'));
  const statMod = d.rng ? dexM : d.fin ? Math.max(strM, dexM) : strM;
  const pb = isWeaponProf(state, w.name) ? profBonus(state.level) : 0;
  return { atk: statMod + pb, dmgMod: statMod };
}

// Property tooltip texts
const PROP_TIPS = {
  'Лёгкое':       'Можно держать по одному лёгкому оружию в каждой руке и атаковать обоими.',
  'Финесс':       'Можно использовать модификатор Силы или Ловкости — на ваш выбор.',
  'Метание':      'Оружие можно бросить в цель. При броске используется Сила (или Ловкость для финесс).',
  'Двуручное':    'Требует обеих рук для атаки.',
  'Универс. 1d8': 'Одноручный урон 1d6. При держании двумя руками — 1d8.',
  'Универс. 1d10':'Одноручный урон 1d8. При держании двумя руками — 1d10.',
  'Тяжёлое':      'Маленькие существа атакуют с помехой. Нельзя использовать для Двойного боя.',
  'Досягаемость': '+1,5 м к дальности атаки (только в ближнем бою).',
  'Перезарядка':  'Можно выстрелить лишь один раз за ход, сколько бы атак у вас ни было.',
  '+2 КД':        'Щит повышает Класс Доспеха на 2. Занимает одну руку.',
};

function propBadge(text) {
  const tip = PROP_TIPS[text] ?? (text.startsWith('Универс.') ? 'При держании двумя руками урон увеличивается.' : null);
  const span = el('span', { class: `weapon-prop${tip ? ' has-tip' : ''}` }, text);
  if (!tip) return span;
  let tipEl = null;
  span.addEventListener('mouseenter', () => {
    tipEl = el('div', { class: 'weapon-prop-tip' }, tip);
    document.body.append(tipEl);
    const r = span.getBoundingClientRect();
    const tw = tipEl.offsetWidth || 200;
    tipEl.style.cssText = `position:fixed;top:${r.bottom + 5}px;left:${Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
  });
  span.addEventListener('mouseleave', () => { tipEl?.remove(); tipEl = null; });
  return span;
}

// Check if weapon slot is available given current hand state (excludes weapon at excludeIdx)
function handsOccupied(weapons, excludeIdx = -1) {
  let main = false, off = false;
  for (let j = 0; j < weapons.length; j++) {
    if (j === excludeIdx) continue;
    const w = weapons[j];
    if (w.slot === 'stowed') continue;
    const d = WEAPONS_DATA[w.name];
    if (!d) continue;
    if (d.hands === 2 || w.slot === 'both') { main = true; off = true; }
    else if (w.slot === 'off') off = true;
    else main = true;
  }
  return { main, off };
}

function canEquipSlot(weapons, idx, slot) {
  if (slot === 'stowed') return true;
  const { main, off } = handsOccupied(weapons, idx);
  if (slot === 'both') return !main && !off;
  if (slot === 'main') return !main;
  if (slot === 'off')  return !off;
  return true;
}

function buildWeaponsBlock(state, refresh) {
  if (!state.weapons) state.weapons = [];

  // Hand status label
  function handStatus() {
    const { main, off } = handsOccupied(state.weapons);
    const shield = state.weapons.some(w => w.slot !== 'stowed' && w.name === 'Щит');
    if (!main && !off)   return ['Руки свободны',   'free'];
    if (main && shield)  return ['Оружие + щит',    'full'];
    if (main && off)     return ['Обе руки заняты', 'full'];
    if (shield)          return ['Щит надет',        'mid'];
    return               ['Одна рука занята',        'mid'];
  }

  const [statusLabel, statusKey] = handStatus();

  // Pre-compute priority for sorting: 0=equipped, 1=stowed+can, 2=stowed+cant
  const weaponEntries = state.weapons.map((w, i) => {
    const d      = WEAPONS_DATA[w.name];
    const stowed = w.slot === 'stowed';
    const canEquip = stowed && (
      d?.hands === 2   ? canEquipSlot(state.weapons, i, 'both') :
      w.name === 'Щит' ? canEquipSlot(state.weapons, i, 'off')  :
      canEquipSlot(state.weapons, i, 'main') || canEquipSlot(state.weapons, i, 'off')
    );
    return { w, i, d, stowed, canEquip, priority: !stowed ? 0 : canEquip ? 1 : 2 };
  });
  weaponEntries.sort((a, b) => a.priority - b.priority);

  const rows = weaponEntries.map(({ w, i, d, stowed, canEquip }) => {
    const calc   = weaponCalc(state, w);
    const curSlot = w.slot || (d?.hands === 2 ? 'both' : w.name === 'Щит' ? 'off' : 'main');

    // Slot label
    const inHandLabel = w.name === 'Щит' ? 'Щит' : (curSlot === 'both' ? 'Обе руки' : 'В руке');
    const btnLabel    = stowed ? 'Убрано' : inHandLabel;

    // Range icon (monochrome SVG)
    const _iconSvg = w.name === 'Щит'
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
      : d?.rng
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>`;
    const typeIcon = el('span', { class: 'weapon-type-icon', html: _iconSvg });

    // Versatile two-hand toggle
    const versProp = d?.props.find(p => p.startsWith('Универс.'));
    const versDie  = versProp ? versProp.split(' ')[1] : null;
    const dmgDice  = versDie && w.twoHanded ? versDie : d?.dmg;

    const versCb = versDie ? (() => {
      const cb = el('input', { type: 'checkbox', class: 'weapon-vers-cb' });
      cb.checked = !!w.twoHanded;
      cb.addEventListener('change', () => {
        w.twoHanded = cb.checked;
        if (cb.checked) {
          if (canEquipSlot(state.weapons, i, 'both')) w.slot = 'both';
          else { cb.checked = w.twoHanded = false; }
        } else {
          if (w.slot === 'both') w.slot = canEquipSlot(state.weapons, i, 'main') ? 'main' : 'stowed';
        }
        refresh();
      });
      return el('label', { class: 'weapon-vers-label' }, cb, el('span', { class: 'weapon-vers-check' }), '2 руки');
    })() : null;

    return el('div', { class: `weapon-row${stowed ? ' weapon-stowed' : ''}${canEquip ? ' weapon-can-equip' : ''}` },
      el('div', { class: 'weapon-info' },
        typeIcon,
        el('span', { class: 'weapon-name' }, w.name),
        calc ? el('span', { class: 'weapon-atk' }, sign(calc.atk) + ' атк') : null,
        calc && dmgDice ? el('span', { class: 'weapon-dmg' },
          el('span', { class: 'weapon-dice' }, dmgDice + (calc.dmgMod ? sign(calc.dmgMod) : '')),
          el('span', { class: 'weapon-dtype' }, d.dtype),
        ) : null,
        ...(d?.props || []).map(p => propBadge(p)),
        versCb,
      ),
      el('div', { class: 'weapon-ctrl' },
        el('button', {
          class: `weapon-slot-btn${stowed ? ' is-stowed' : ''}`,
          onClick: () => {
            if (!stowed) {
              w.slot = 'stowed';
              if (w.twoHanded) w.twoHanded = false;
            } else if (w.name === 'Щит') {
              w.slot = canEquipSlot(state.weapons, i, 'off') ? 'off' : 'stowed';
            } else if (d?.hands === 2 || w.twoHanded) {
              w.slot = canEquipSlot(state.weapons, i, 'both') ? 'both' : 'stowed';
            } else {
              if      (canEquipSlot(state.weapons, i, 'main')) w.slot = 'main';
              else if (canEquipSlot(state.weapons, i, 'off'))  w.slot = 'off';
            }
            refresh();
          },
        }, btnLabel),
        el('button', { class: 'weapon-remove', onClick: () => { state.weapons.splice(i, 1); refresh(); } }, '×'),
      ),
    );
  });

  // Unarmed row — shown when nothing is in hand
  const anyInHand = state.weapons.some(w => w.slot !== 'stowed');
  const strMod    = mod(totalStat(state, 'str'));
  const unarmedRow = !anyInHand ? el('div', { class: 'weapon-row weapon-equipped' },
    el('div', { class: 'weapon-info' },
      el('span', { class: 'weapon-name weapon-name-muted' }, 'Безоружный'),
      el('span', { class: 'weapon-atk' }, sign(strMod + profBonus(state.level)) + ' атк'),
      el('span', { class: 'weapon-dmg' },
        el('span', { class: 'weapon-dice' }, '1' + (strMod > 0 ? sign(strMod) : '')),
        el('span', { class: 'weapon-dtype' }, 'дробящий'),
      ),
    ),
  ) : null;

  // Dropdown — flat, sorted A-Z (no Безоружный)
  const addSel = el('select', { class: 'weapon-add-sel' });
  addSel.append(el('option', { value: '' }, '＋ Добавить оружие'));
  const sortedWeapons = Object.keys(WEAPONS_DATA).filter(n => n !== 'Безоружный').sort((a, b) => a.localeCompare(b, 'ru'));
  for (const name of sortedWeapons) {
    addSel.append(el('option', { value: name }, name));
  }
  addSel.addEventListener('change', () => {
    if (!addSel.value) return;
    const d    = WEAPONS_DATA[addSel.value];
    const want = d?.hands === 2 ? 'both' : addSel.value === 'Щит' ? 'off' : 'main';
    let slot = canEquipSlot(state.weapons, -1, want) ? want :
               (want === 'main' && canEquipSlot(state.weapons, -1, 'off')) ? 'off' : 'stowed';
    state.weapons.push({ name: addSel.value, slot });
    addSel.value = '';
    refresh();
  });

  return el('div', { class: 'weapons-block' },
    el('div', { class: 'weapons-hd' },
      el('span', { class: 'weapons-title' }, 'Оружие · щиты'),
      el('span', { class: `hands-status hands-${statusKey}` }, statusLabel),
    ),
    unarmedRow,
    ...rows,
    el('div', { class: 'weapon-add-row' }, addSel),
  );
}

// ─── Magic panel ──────────────────────────────────────────────────────────────

function buildMagicPanel(state) {
  const spellStat = SPELL_STAT[state.class];
  if (!spellStat) return null;

  const pb      = profBonus(state.level);
  const statMod = mod(totalStat(state, spellStat));
  const dc      = 8 + pb + statMod;
  const atk     = pb + statMod;
  const statLbl = { str:'Сила',dex:'Ловкость',con:'Тел-ние',int:'Интеллект',wis:'Мудрость',cha:'Харизма' }[spellStat];

  const rawSlots = SPELL_SLOTS[state.class];
  let slotRows = [];
  if (rawSlots === 'warlock') {
    const [count, lvl] = SLOTS_WARLOCK[state.level - 1];
    slotRows = [[lvl, count]];
  } else if (rawSlots) {
    slotRows = rawSlots[state.level - 1]
      .map((c, i) => c > 0 ? [i + 1, c] : null).filter(Boolean);
  }

  const slotsRest = state.class === 'Колдун'
    ? 'Ячейки заклинаний восстанавливаются после короткого или долгого отдыха.'
    : 'Ячейки заклинаний восстанавливаются после долгого отдыха.';

  return el('div', { class: 'panel magic-panel' },
    el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Магия'), panelHelp(`СЛ спасброска = 8 + бонус мастерства + модификатор заклинательной хар-ки.\nБонус атаки = бонус мастерства + модификатор закл. хар-ки.\nЗакл. хар-ка зависит от класса: Интеллект — Волшебник, Изобретатель; Мудрость — Жрец, Друид, Следопыт; Харизма — Бард, Паладин, Чародей, Колдун.\n${slotsRest}`)),
    el('div', { class: 'magic-stats-row' },
      el('div', { class: 'magic-chip' },
        el('div', { class: 'magic-chip-val' }, String(dc)),
        el('div', { class: 'magic-chip-lbl' }, 'Сл сп.'),
      ),
      el('div', { class: 'magic-chip' },
        el('div', { class: 'magic-chip-val' }, sign(atk)),
        el('div', { class: 'magic-chip-lbl' }, 'Атака'),
      ),
      el('div', { class: 'magic-chip magic-chip-wide' },
        el('div', { class: 'magic-chip-val magic-chip-stat' }, statLbl),
        el('div', { class: 'magic-chip-lbl' }, 'Закл. хар-ка'),
      ),
    ),
    slotRows.length ? el('div', { class: 'magic-slots' },
      ...slotRows.map(([lvl, count]) =>
        el('div', { class: 'magic-slot-row' },
          el('span', { class: 'magic-slot-lbl' }, `${lvl} кр`),
          el('div', { class: 'magic-slot-pips' },
            ...Array.from({ length: count }, () => el('div', { class: 'slot-pip' }))
          ),
        )
      )
    ) : null,
  );
}

// ─── Spells panel ─────────────────────────────────────────────────────────────

function buildSpellsPanel(state) {
  if (!SPELL_STAT[state.class]) return null;

  function wipPopup(title) {
    const overlay = el('div', { class: 'equip-modal-overlay', onClick: e => { if (e.target === overlay) overlay.remove(); } },
      el('div', { class: 'equip-modal' },
        el('div', { class: 'equip-modal-head' },
          el('span', { class: 'equip-modal-title' }, title),
          el('button', { class: 'equip-modal-close', onClick: () => overlay.remove() }, '×'),
        ),
        el('div', { class: 'equip-modal-body' },
          el('div', { class: 'equip-modal-stub' }, '🚧', el('p', {}, 'Раздел в разработке')),
        ),
      )
    );
    document.body.append(overlay);
  }

  const lvl        = state.level;
  const knownTable  = SPELLS_KNOWN_TABLE[state.class];
  const prepFormula = SPELL_PREP_FORMULA[state.class];
  const spellChips  = [];

  if (knownTable) {
    spellChips.push(['Известно', String(knownTable[lvl - 1])]);
  } else if (prepFormula) {
    const statMod  = mod(totalStat(state, prepFormula.stat));
    const prepared = Math.max(1, Math.floor(lvl / prepFormula.div) + statMod);
    spellChips.push(['Подготовлено', String(prepared)]);
    if (state.class === 'Волшебник') {
      spellChips.push(['Книга заклинаний', String(6 + 2 * (lvl - 1))]);
    }
  }

  const spellHelpLines = knownTable
    ? 'Известно — фиксированное число заклинаний, которые персонаж всегда держит в голове. Сменить можно только при повышении уровня.'
    : state.class === 'Волшебник'
      ? 'Подготовлено — число заклинаний, выбираемых из книги после долгого отдыха (уровень + мод. Инт, мин. 1).\nКнига заклинаний — все записанные заклинания: 6 стартовых + 2 за каждый уровень.'
      : 'Подготовлено — число заклинаний, которые можно выбрать из списка класса после долгого отдыха.';

  return el('div', { class: 'panel spells-panel' },
    el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Заклинания'), panelHelp(spellHelpLines)),
    el('div', { class: 'panel-body spells-btns' },
      el('button', { class: 'btn btn-sm btn-ghost spells-btn', onClick: () => wipPopup('Заговоры') }, 'Выбрать заговоры'),
      el('button', { class: 'btn btn-sm btn-ghost spells-btn', onClick: () => wipPopup('Заклинания') }, 'Выбрать заклинания'),
    ),
    spellChips.length ? el('div', { class: 'spell-counts' },
      ...spellChips.map(([lbl, val]) =>
        el('div', { class: 'spell-count-chip' },
          el('span', { class: 'spell-count-val' }, val),
          el('span', { class: 'spell-count-lbl' }, lbl),
        )
      )
    ) : null,
  );
}

// ─── Proficiencies panel ──────────────────────────────────────────────────────

function buildProfChoice(key, opts, placeholder, state) {
  const s = el('select', { class: 'prof-choice-sel' });
  s.append(el('option', { value: '' }, `— ${placeholder} —`));
  for (const o of opts) {
    const opt = el('option', { value: o }, o);
    if ((state.profChoices[key] || '') === o) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener('change', () => { state.profChoices[key] = s.value; });
  return el('span', { class: 'prof-choice-wrap' }, s);
}

function buildProfsPanel(state) {
  const clsP  = CLASS_PROFS_DATA[state.class];
  const bgP   = BG_PROFS[state.background] || {};
  const raceLangs = RACE_LANGS_BASE[state.race] || [];
  const extraLangCount = (RACE_EXTRA_LANGS[state.race] || 0) + (bgP.langs || 0);

  // Collect all tool entries (static strings + choice objects)
  const allTools = [...(clsP?.tools || []), ...(bgP.tools || [])];

  let choiceIdx = 0;
  function renderToolItem(item) {
    if (typeof item === 'string') return el('span', { class: 'prof-tag' }, item);
    return buildProfChoice(`tool_${choiceIdx++}`, item.from, item.label, state);
  }

  const sections = [];

  if (clsP?.armor?.length) {
    sections.push(el('div', { class: 'profs-section' },
      el('div', { class: 'profs-section-lbl' }, 'Доспехи'),
      el('div', { class: 'profs-tags' }, ...clsP.armor.map(a => el('span', { class: 'prof-tag' }, a))),
    ));
  }
  if (clsP?.weapons?.length) {
    sections.push(el('div', { class: 'profs-section' },
      el('div', { class: 'profs-section-lbl' }, 'Оружие'),
      el('div', { class: 'profs-tags' }, ...clsP.weapons.map(w => el('span', { class: 'prof-tag' }, w))),
    ));
  }
  if (allTools.length) {
    sections.push(el('div', { class: 'profs-section' },
      el('div', { class: 'profs-section-lbl' }, 'Инструменты'),
      el('div', { class: 'profs-tags' }, ...allTools.map(t => renderToolItem(t))),
    ));
  }

  // Languages
  const langTags = raceLangs.map(l => el('span', { class: 'prof-tag' }, l));
  for (let i = 0; i < extraLangCount; i++) {
    langTags.push(buildProfChoice(`lang_${i}`, EXTRA_LANGS, 'Язык', state));
  }
  if (langTags.length) {
    sections.push(el('div', { class: 'profs-section' },
      el('div', { class: 'profs-section-lbl' }, 'Языки'),
      el('div', { class: 'profs-tags' }, ...langTags),
    ));
  }

  if (!sections.length) return null;

  return el('div', { class: 'panel profs-panel' },
    el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Владения')),
    el('div', { class: 'panel-body profs-body' }, ...sections),
  );
}

function buildHeaderCombat(state) {
  const cls    = state.class ? CLASSES[state.class] : null;
  const conMod = mod(totalStat(state, 'con'));
  const dexMod = mod(totalStat(state, 'dex'));
  const hp        = cls ? Math.max(1, cls.die + conMod) : '—';
  const speed     = state.race ? (RACES[state.race]?.speed || 30) : '—';
  const hasShield = (state.weapons || []).some(w => w.name === 'Щит' && w.slot !== 'stowed');
  const ac        = 10 + dexMod + (hasShield ? 2 : 0);

  return el('div', { class: 'header-combat' },
    ...[
      [String(hp),    'Хиты',       'hc-hp'],
      [String(ac),    'КД',         ''],
      [sign(dexMod),        'Инициатива', ''],
      [String(speed),       'Скорость',   ''],
      [sign(profBonus(state.level)), 'Мастерство', ''],
    ].map(([val, lbl, extra]) =>
      el('div', { class: `hc-chip${extra ? ' ' + extra : ''}` },
        el('div', { class: 'hc-val' }, val),
        el('div', { class: 'hc-lbl' }, lbl),
      )
    )
  );
}

function buildRightPanel(state, refresh) {
  return el('div', { class: 'create-right' },
    buildMagicPanel(state),
    buildSpellsPanel(state),
    buildEquipPanel(state, refresh),
  );
}

function buildActionBar(state, router) {
  const spent = pbSpent(state.stats);
  const valid = state.class && state.race && state.background && spent <= PB_POOL;
  const hint  = !state.class                    ? 'Выбери класс'
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

function cleanupCreateHeader() {
  document.querySelector('.create-header-id')?.remove();
  document.querySelector('.app-header')?.classList.remove('app-header--create');
}

export function renderCreate(container, router, _params = {}) {
  container.innerHTML = '';
  cleanupCreateHeader();
  const ha = document.getElementById('header-actions');
  if (ha) ha.innerHTML = '';

  const state = {
    edition:    '2014',
    tasha:      false,
    name:       '',
    playerName: '',
    class:      '',
    subclass:   '',
    level:      1,
    race:       '',
    subrace:    '',
    background: '',
    alignment:  '',
    stats:      { str:8, dex:8, con:8, int:8, wis:8, cha:8 },
    chosen:     new Set(),
    equipMode:       'standard',
    equipGold:       null,
    equipCollapsed:  false,
    featuresCollapsed: false,
    featSections:  {},
    featExpanded:  {},
    profChoices:   {},
    weapons:       [],
  };

  const appHeader = document.querySelector('.app-header');
  appHeader.classList.add('app-header--create');

  let headerIdEl, headerCombatEl, body, bar;

  function buildHeaderId(st) {
    return el('div', { class: 'create-header-id' }, buildIdRow(st, refresh));
  }

  function buildBody(st) {
    const feats = buildFeaturesBlock(st, refresh);
    return el('div', { class: 'create-body' },
      el('div', { class: 'stats-area' },
        buildPbHeader(st),
        el('div', { class: 'stats-grid' },
          ...['str','dex','con','int','wis','cha']
            .map(k => ABILITIES.find(a => a.key === k))
            .map(ab => buildAbBlock(st, ab, refresh))
        ),
        buildProfsPanel(st),
      ),
      el('div', { class: 'create-middle' }, feats, buildWeaponsBlock(st, refresh)),
      buildRightPanel(st, refresh)
    );
  }

  function refresh() {
    const hid2 = buildHeaderId(state);
    const hc2  = buildHeaderCombat(state);
    const b2   = buildBody(state);
    const r2   = buildActionBar(state, router);
    headerIdEl.replaceWith(hid2);    headerIdEl     = hid2;
    headerCombatEl.replaceWith(hc2); headerCombatEl = hc2;
    body.replaceWith(b2);            body           = b2;
    bar.replaceWith(r2);             bar            = r2;
  }

  headerIdEl     = buildHeaderId(state);
  headerCombatEl = buildHeaderCombat(state);
  appHeader.insertBefore(headerIdEl, ha);
  ha.append(headerCombatEl);

  body = buildBody(state);
  bar  = buildActionBar(state, router);

  container.append(body, bar);
}
