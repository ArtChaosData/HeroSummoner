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

function buildFeatItem(name, desc, state, refresh) {
  const expanded = !!state.featExpanded[name];
  const hasDesc  = !!desc;
  const hdClass  = `feat-item-hd${expanded ? ' open' : ''}${hasDesc ? ' has-desc' : ''}`;
  return el('div', { class: 'feat-item' },
    el('div', {
      class: hdClass,
      onClick: hasDesc ? () => { state.featExpanded[name] = !expanded; refresh(); } : null,
    },
      el('span', { class: `feat-arrow${hasDesc ? '' : ' invis'}` }, expanded ? '▾' : '▸'),
      el('span', { class: 'feat-item-name' }, name),
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
      ...items.map(({ name, desc }) => buildFeatItem(name, desc, state, refresh))
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
        const baseName = name.replace(/\s*\([^)]*\)$/, '').trim();
        const item = { name, desc: lookupDesc(clsDescs, name) };
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
    const rollBtn = el('button', {
      class: 'btn btn-sm equip-roll-btn',
      onClick: () => {
        if (!goldInfo) return;
        state.equipGold = rollDice(goldInfo.rolls, goldInfo.die) * goldInfo.mult;
        refresh();
      },
    });
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

  return el('div', { class: 'panel magic-panel' },
    el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Магия')),
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
        el('div', { class: 'magic-chip-lbl' }, 'Хар-ка'),
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

  return el('div', { class: 'panel spells-panel' },
    el('div', { class: 'panel-head' }, el('span', { class: 'panel-title' }, 'Заклинания')),
    el('div', { class: 'panel-body spells-btns' },
      el('button', { class: 'btn btn-sm btn-ghost spells-btn', onClick: () => wipPopup('Заговоры') }, 'Выбрать заговоры'),
      el('button', { class: 'btn btn-sm btn-ghost spells-btn', onClick: () => wipPopup('Заклинания') }, 'Выбрать заклинания'),
    ),
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
  const hp     = cls ? Math.max(1, cls.die + conMod) : '—';
  const speed  = state.race ? (RACES[state.race]?.speed || 30) : '—';

  return el('div', { class: 'header-combat' },
    ...[
      [String(hp),          'Хиты',       'hc-hp'],
      [String(10 + dexMod), 'КД',         ''],
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
      el('div', { class: 'create-middle' }, feats),
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
