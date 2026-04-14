/**
 * HeroSummoner — PDF / Print Export
 * Official-style D&D 5e Russian character sheet (3 pages).
 * No external dependencies — works fully offline.
 */

import { ARMOUR } from './data/equipment.js';
import { CLASS_FEATURES } from './data/class_features.js';
import { RACE_DESCRIPTIONS } from './data/race_descriptions.js';
import { BACKGROUND_DESCRIPTIONS } from './data/background_descriptions.js';

// ─── D&D mechanics ────────────────────────────────────────────────────────────

const mod       = s => Math.floor(((s ?? 10) - 10) / 2);
const sign      = n => (n >= 0 ? '+' : '') + n;
const profBonus = lvl => Math.ceil((lvl || 1) / 4) + 1;

const STAT_KEYS  = ['str','dex','con','int','wis','cha'];
const STAT_FULL  = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
const STAT_LABEL = { str:'СИЛА', dex:'ЛОВКОСТЬ', con:'ТЕЛОСЛОЖЕНИЕ', int:'ИНТЕЛЛЕКТ', wis:'МУДРОСТЬ', cha:'ХАРИЗМА' };
const STAT_SHORT = { str:'Сил', dex:'Лов', con:'Тел', int:'Инт', wis:'Мдр', cha:'Хар' };

const CLASS_SAVES = {
  'Бард':['dex','cha'], 'Варвар':['str','con'], 'Воин':['str','con'],
  'Волшебник':['int','wis'], 'Друид':['int','wis'], 'Жрец':['wis','cha'],
  'Изобретатель':['con','int'], 'Колдун':['wis','cha'], 'Монах':['str','dex'],
  'Паладин':['wis','cha'], 'Плут':['dex','int'], 'Следопыт':['str','dex'],
  'Чародей':['con','cha'],
};

const CLASS_HIT_DIE = {
  'Варвар':12, 'Воин':10, 'Паладин':10, 'Волшебник':6,
  'Бард':8,'Друид':8,'Жрец':8,'Изобретатель':8,'Монах':8,'Плут':8,'Следопыт':8,'Колдун':8,'Чародей':8,
};

const CLASS_SPELL_ABILITY = {
  'Бард':'cha', 'Волшебник':'int', 'Друид':'wis', 'Жрец':'wis',
  'Изобретатель':'int', 'Колдун':'cha', 'Паладин':'cha', 'Следопыт':'wis', 'Чародей':'cha',
};

const MAGIC_CLASSES = new Set(['Бард','Волшебник','Друид','Жрец','Изобретатель','Колдун','Паладин','Следопыт','Чародей']);

// ─── Equipment data (mirrors create-new.js, not exported from there) ─────────

const CLASS_EQUIP = {
  'Бард':         ['Рапира или длинный меч', 'Набор дипломата', 'Музыкальный инструмент', 'Кожаный доспех', 'Кинжал'],
  'Варвар':       ['Боевой топор или 2 простых оружия', 'Набор путешественника', '4 метательных топора'],
  'Воин':         ['Кольчуга или кожаный доспех + лук', 'Щит или боевое оружие', 'Арбалет + 20 болтов', 'Набор путешественника'],
  'Волшебник':    ['Посох или кинжал', 'Книга заклинаний', 'Компонентный мешочек', 'Набор учёного'],
  'Друид':        ['Щит или простое оружие', 'Кожаный доспех', 'Деревянный щит', 'Набор путешественника'],
  'Жрец':         ['Боевой молот или простое оружие', 'Кольчуга', 'Символ веры', 'Набор священника'],
  'Изобретатель': ['2 кинжала', 'Любое простое оружие', 'Воровские инструменты', 'Кожаный доспех', 'Набор подземелья'],
  'Колдун':       ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор учёного', 'Кожаный доспех', '2 кинжала'],
  'Монах':        ['Короткий меч или простое оружие', 'Набор путешественника', '10 дротиков'],
  'Паладин':      ['Боевое оружие + щит', 'Метательные копья ×5', 'Кольчуга', 'Набор священника'],
  'Плут':         ['Рапира или короткий меч', 'Короткий меч или лук + 20 стрел', 'Набор взломщика', 'Кожаный доспех', '2 кинжала'],
  'Следопыт':     ['Кольчужная рубаха', '2 коротких меча', 'Набор путешественника', 'Лук + 20 стрел'],
  'Чародей':      ['Лёгкий арбалет + 20 болтов', 'Компонентный мешочек', 'Набор мага', '2 кинжала'],
};

const BG_EQUIP = {
  'Аколит':              ['Символ веры', 'Молитвенник или 5 палочек благовоний', '5 свечей', 'Облачение'],
  'Артист':              ['Сувенир', 'Дорожный костюм'],
  'Беспризорник':        ['Небольшой нож', 'Карта города', 'Тёмный плащ'],
  'Благородный':         ['Тонкие одежды', 'Перстень с гербом', 'Рекомендательное письмо'],
  'Гильдейский мастер':  ['Письмо от гильдии', 'Опрятная одежда'],
  'Городская стража':    ['Форменная одежда', 'Рожок', 'Кандалы'],
  'Клановый мастер':     ['Памятный предмет клана', 'Обычная одежда'],
  'Монастырский учёный': ['Письмо о принятии', 'Записная книжка', 'Перо и чернила', 'Обычная одежда'],
  'Придворный':          ['Придворная одежда', 'Рекомендательное письмо'],
  'Дальний странник':    ['Реликвия из дома', 'Записная книжка', 'Путевые вещи'],
  'Наследник':           ['Предмет наследства', 'Путевая одежда'],
  'Рыцарь ордена':       ['Символ ордена', 'Путевая одежда'],
  'Ветеран наёмника':    ['Знак воинского звания', 'Значок отряда', 'Обычная одежда'],
  'Городской охотник':   ['Подходящая одежда'],
  'Член племени Угтардов':['Охотничий трофей', 'Дорожная одежда'],
  'Дворянин Уотердипа':  ['Отличная одежда', 'Рекомендательное письмо'],
  'Агент Азория':        ['Форменная одежда', 'Чернила и перо'],
  'Культист Груула':     ['Ритуальный тотем', 'Оружие с надписями', 'Путевая одежда'],
  'Дитя Диммира':        ['Тёмный плащ', 'Набор для грима'],
  'Преследуемый':        ['Амулет с именем любимого', 'Одежда с мирного дня'],
  'Следователь':         ['Записная книжка', 'Чернила и перо', 'Обычная одежда'],
  'Работник балагана':   ['Маскировочный костюм', 'Набор для грима', 'Путевая одежда'],
  'Жулик':               ['Шулерские карты', 'Одежда разных сословий'],
  'Матрос':              ['Дубина', '50 фут. канат', 'Дорожная одежда'],
  'Мудрец':              ['Чернила', 'Перо', 'Нож для бумаги', 'Письмо с вопросом'],
  'Народный герой':      ['Лопата', 'Горшок', 'Дорожная одежда'],
  'Отшельник':           ['Свитки с заметками', 'Зимнее одеяло', 'Огниво'],
  'Преступник':          ['Воровские инструменты', 'Тёмная одежда с капюшоном'],
  'Скиталец':            ['Путевые дневники', 'Карты родной земли', 'Дорожные одежды'],
  'Солдат':              ['Знак воинского звания', 'Трофей с врага', 'Дорожная одежда'],
};

const BG_GOLD = {
  'Аколит':15,'Артист':15,'Беспризорник':10,'Благородный':25,'Гильдейский мастер':15,
  'Жулик':15,'Матрос':10,'Мудрец':10,'Народный герой':10,'Отшельник':5,'Преступник':15,
  'Скиталец':10,'Солдат':10,'Городская стража':10,'Клановый мастер':5,
  'Монастырский учёный':10,'Придворный':5,'Дальний странник':5,'Наследник':15,
  'Рыцарь ордена':10,'Ветеран наёмника':10,'Городской охотник':20,
  'Член племени Угтардов':10,'Дворянин Уотердипа':20,'Агент Азория':10,
  'Культист Груула':10,'Дитя Диммира':15,'Преследуемый':1,'Следователь':10,
  'Работник балагана':8,
};

const EQUIP_KITS = {
  'Набор дипломата':       ['Сундук', 'Чернила ×2', 'Перо', 'Бумага ×5', 'Духи', 'Воск для печатей', 'Придворная одежда'],
  'Набор путешественника': ['Ранец', 'Спальный мешок', 'Кружка', 'Дорожная одежда ×2', 'Огниво', 'Факелы ×10', 'Паёк ×10', 'Фляга воды', 'Верёвка 15 м'],
  'Набор учёного':         ['Книга', 'Чернила', 'Перо', 'Нож для бумаги', 'Мешочек с песком', 'Небольшой нож'],
  'Набор взломщика':       ['Ломик', 'Молоток', 'Стальные колья ×10', 'Фонарь с заслонкой', 'Масло ×2', 'Паёк ×5', 'Верёвка 15 м'],
  'Набор священника':      ['Одеяло', 'Свечи ×10', 'Огниво', 'Кадильница', 'Ладан', 'Стихарь', 'Паёк ×2'],
  'Набор мага':            ['Записная книжка', 'Чернила', 'Перо', 'Нож для бумаги', 'Мешочек с песком', 'Небольшой нож'],
  'Набор подземелья':      ['Ломик', 'Молоток', 'Стальные колья ×10', 'Свечи ×10', 'Огниво', 'Масло ×1', 'Паёк ×5', 'Верёвка 15 м'],
};

function expandEquipItems(items, choices, prefix) {
  const result = [];
  items.forEach((item, idx) => {
    // Resolve "или" choices
    if (item.includes(' или ')) {
      const key = `${prefix}_${idx}`;
      const chosen = (choices || {})[key];
      const parts  = item.split(' или ');
      result.push(chosen && parts.includes(chosen) ? chosen : parts[0]);
      return;
    }
    // Expand kits
    const kit = EQUIP_KITS[item];
    if (kit) { kit.forEach(k => result.push(k)); return; }
    result.push(item);
  });
  return result;
}

// Background starting equipment (from PHB/SCAG/GGR/VRGR/WBW)
const BG_EQUIPMENT = {
  'Аколит':             'Символ священного заступника, молитвенник или 5 палочек благовоний, набор облачения, простая одежда, кошель с 15 зм',
  'Артист':             'Подарок от поклонника, маскировочный костюм, набор для грима, кошель с 15 зм',
  'Беспризорник':       'Небольшой нож, карта родного города, домашняя крыса, одежда бедняка, набор для грима, воровские инструменты, кошель с 10 зм',
  'Благородный':        'Комплект отличной одежды, кольцо с гербом, свиток родословной, кошель с 25 зм',
  'Гильдейский мастер': 'Рекомендательное письмо от гильдии, комплект одежды мастера, кошель с 15 зм',
  'Жулик':              'Набор отличной одежды, набор для грима, набор инструментов мошенника, кошель с 15 зм',
  'Матрос':             '50 футов шёлкового каната, сувенир на удачу, навигационные инструменты, общая одежда, кошель с 10 зм',
  'Мудрец':             'Бутылочка чернил, перо, небольшой нож, письмо от коллеги, записная книжка, мешок с 10 зм',
  'Народный герой':     'Лопата, котёл для готовки, транспортные средства (наземные), общая одежда, кошель с 10 зм',
  'Отшельник':          'Принадлежности для рукоделия, дневник в кожаной обложке, набор трав, зимняя одежда, кошель с 5 зм',
  'Преступник':         'Ломик, тёмная одежда с капюшоном, воровские инструменты, кошель с 15 зм',
  'Скиталец':           'Посох, охотничий капкан, трофей убитого животного, дорожная одежда, кошель с 10 зм',
  'Солдат':             'Значок воинского звания, трофей с поверженного врага, транспортные средства (наземные), обычная одежда, кошель с 10 зм',
  'Городская стража':   'Эмблема городской стражи, манускрипт с городским уставом, обычная одежда, кошель с 10 зм',
  'Клановый мастер':    'Памятный предмет из дома клана, обычная одежда, кошель с 5 зм',
  'Монастырский учёный':'Письмо о принятии в монастырь, записная книжка, перо и чернила, обычная одежда, кошель с 10 зм',
  'Придворный':         'Комплект придворной одежды, рекомендательное письмо ко двору, кошель с 5 зм',
  'Дальний странник':   'Путевые вещи, реликвия из далёкого дома, записная книжка, кошель с 5 зм',
  'Наследник':          'Предмет наследства (согласуется с DM), путевая одежда, кошель с 15 зм',
  'Рыцарь ордена':      'Символ ордена, путевая одежда, кошель с 10 зм',
  'Ветеран наёмник':    'Знак воинского звания, значок отряда, игровой набор, обычная одежда, кошель с 10 зм',
  'Городской охотник':  'Подходящая одежда, кошель с 20 зм',
  'Член племени Угтардов': 'Охотничий трофей, дорожная одежда, кошель с 10 зм',
  'Дворянин Уотердипа': 'Комплект отличной одежды, рекомендательное письмо, кошель с 20 зм',
  'Агент Азория':       'Форменная одежда чиновника, набор чернил и пера, кошель с 10 зм',
  'Культист Груула':    'Ритуальный тотем, оружие с клановыми надписями, путевая одежда, кошель с 10 зм',
  'Дитя Диммира':       'Тёмный плащ, набор для грима, кошель с 15 зм',
  'Преследуемый':       'Амулет с именем любимого человека, одежда с последнего мирного дня, кошель с 1 зм',
  'Следователь':        'Записная книжка со старыми заметками, чернила и перо, обычная одежда, кошель с 10 зм',
  'Работник балагана':  'Маскировочный костюм, набор для грима, путевая одежда, кошель с 8 зм',
};

// Official Russian skill order (matches WotC sheet)
const SKILL_ORDER = [
  ['Акробатика','dex'],['Атлетика','str'],['Восприятие','wis'],
  ['Выживание','wis'],['Выступление','cha'],['Запугивание','cha'],
  ['История','int'],['Ловкость рук','dex'],['Магия','int'],
  ['Медицина','wis'],['Обман','cha'],['Природа','int'],
  ['Проницательность','wis'],['Расследование','int'],['Религия','int'],
  ['Скрытность','dex'],['Убеждение','cha'],['Уход за животными','wis'],
];

function computeAC(char) {
  const ws = char._wizardState || {};
  const dexMod = mod(char.stats?.dex);
  if (ws.mecEquipMode === 'buy' && ws.mecCart?.length) {
    const cartArmor = ws.mecCart.find(i => i.category === 'Доспехи' && i.name !== 'Щит');
    if (cartArmor) {
      const a = ARMOUR.find(x => x.name === cartArmor.name);
      if (a) {
        let ac = a.acBase;
        if (a.acDex === 'full')      ac += dexMod;
        else if (a.acDex === 'max2') ac += Math.min(dexMod, 2);
        if (ws.mecCart.some(i => i.name === 'Щит')) ac += 2;
        return ac;
      }
    }
  }
  return 10 + dexMod;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function dot(filled) {
  return filled ? `<span class="dot filled"></span>` : `<span class="dot"></span>`;
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildAbilities(stats, saves, pb) {
  return STAT_KEYS.map(key => {
    const score = stats[key] ?? 10;
    return `<div class="ability-block">
      <div class="ability-name">${STAT_LABEL[key]}</div>
      <div class="ability-score-box">${score}</div>
      <div class="ability-mod-circle">${sign(mod(score))}</div>
    </div>`;
  }).join('');
}

function buildSaves(stats, saves, pb) {
  return STAT_KEYS.map(key => {
    const prof = saves.includes(key);
    const val  = mod(stats[key] ?? 10) + (prof ? pb : 0);
    return `<div class="check-row">${dot(prof)}<span class="check-val">${sign(val)}</span><span class="check-label">${STAT_FULL[key]}</span></div>`;
  }).join('');
}

function buildSkills(stats, profSkills, pb) {
  const profSet = new Set(profSkills || []);
  return SKILL_ORDER.map(([skill, ab]) => {
    const prof = profSet.has(skill);
    const val  = mod(stats[ab] ?? 10) + (prof ? pb : 0);
    return `<div class="check-row">${dot(prof)}<span class="check-val">${sign(val)}</span><span class="check-label">${esc(skill)} <em>(${STAT_SHORT[ab]})</em></span></div>`;
  }).join('');
}

function buildAttackRows(attacks) {
  const rows = [...attacks];
  while (rows.length < 3) rows.push({name:'',bonus:'',damage:''});
  return rows.slice(0,3).map(a => `<div class="attack-row">
    <div class="attack-cell">${esc(a.name)}</div>
    <div class="attack-cell">${esc(a.bonus)}</div>
    <div class="attack-cell">${esc(a.damage)}</div>
  </div>`).join('');
}

function getWeaponAttacks(char) {
  const ws = char._wizardState || {};
  const pb = profBonus(char.level || 1);
  const strMod = mod(char.stats?.str);
  const dexMod = mod(char.stats?.dex);
  if (!ws.mecCart?.length) return [];
  return ws.mecCart
    .filter(i => i.category === 'Оружие')
    .slice(0,3)
    .map(i => ({ name: i.name, bonus: sign(Math.max(strMod, dexMod) + pb), damage: '—' }));
}

function buildEquipList(char) {
  const ws      = char._wizardState || {};
  const choices = ws.mecEquipChoices || {};
  const mode    = ws.mecEquipMode || 'standard';
  const all     = [];

  if (mode === 'buy') {
    // Buy mode: only cart items
    (ws.mecCart || []).forEach(i => {
      const qty = (i.qty ?? 1) > 1 ? ` ×${i.qty}` : '';
      all.push(i.name + qty);
    });
  } else {
    // Standard mode: class equipment + background equipment (expanded)
    const clsItems = expandEquipItems(CLASS_EQUIP[char.class] || [], choices, 'cls');
    const bgItems  = expandEquipItems(BG_EQUIP[char.background] || [], choices, 'bg');
    clsItems.forEach(s => all.push(s));
    bgItems.forEach(s => {
      if (!all.some(a => a.toLowerCase() === s.toLowerCase())) all.push(s);
    });

    // Gold
    const gold = BG_GOLD[char.background];
    if (gold != null) all.push(`Золото: ${gold} зм`);
  }

  if (!all.length) return '<div style="color:#999;font-style:italic">—</div>';
  return all.map(s => `<div class="equip-item">${esc(s)}</div>`).join('');
}

// Class armor/weapon proficiencies (PHB 5e14)
const CLASS_PROFS = {
  'Бард':         { armor: 'Лёгкие доспехи', weapons: 'Простое оружие, ручные арбалеты, длинные мечи, рапиры, короткие мечи' },
  'Варвар':       { armor: 'Лёгкие и средние доспехи, щиты', weapons: 'Простое и воинское оружие' },
  'Воин':         { armor: 'Все доспехи, щиты', weapons: 'Простое и воинское оружие' },
  'Волшебник':    { armor: '—', weapons: 'Кинжалы, дротики, пращи, посохи, лёгкие арбалеты' },
  'Друид':        { armor: 'Лёгкие и средние доспехи без металла, щиты без металла', weapons: 'Дубины, кинжалы, дротики, посохи, дубинки, серпы, пращи, копья' },
  'Жрец':         { armor: 'Лёгкие и средние доспехи, щиты', weapons: 'Простое оружие' },
  'Изобретатель': { armor: 'Лёгкие и средние доспехи, щиты', weapons: 'Простое оружие' },
  'Колдун':       { armor: 'Лёгкие доспехи', weapons: 'Простое оружие' },
  'Монах':        { armor: '—', weapons: 'Простое оружие, короткие мечи' },
  'Паладин':      { armor: 'Все доспехи, щиты', weapons: 'Простое и воинское оружие' },
  'Плут':         { armor: 'Лёгкие доспехи', weapons: 'Простое оружие, ручные арбалеты, длинные мечи, рапиры, короткие мечи' },
  'Следопыт':     { armor: 'Лёгкие и средние доспехи, щиты', weapons: 'Простое и воинское оружие' },
  'Чародей':      { armor: '—', weapons: 'Кинжалы, дротики, пращи, посохи, лёгкие арбалеты' },
};

// Known languages / tool sets — used to classify plain-string mecBgChoiceData entries
const KNOWN_LANGUAGES = new Set(['Бездны','Великанский','Гномский','Гоблинский','Глубокая речь','Дварфский','Драконий','Инфернальный','Небесный','Орочий','Первозданный','Полуросликов','Сильван','Общий Подземья','Эльфийский','Общий','Орчий','Карательский']);
const KNOWN_TOOLS = new Set(['Барабан','Виола','Волынка','Лира','Лютня','Рог','Скрипка','Флейта','Цимбалы','Шалмей','Игральные кости','Карты','Три Дракона Анти','Шахматы Дракона','Инструменты алхимика','Инструменты пивовара','Инструменты каллиграфа','Инструменты плотника','Инструменты сапожника','Инструменты повара','Инструменты стеклодува','Инструменты ювелира','Инструменты кожевника','Инструменты каменщика','Инструменты художника','Инструменты гончара','Инструменты кузнеца','Инструменты ткача','Инструменты резчика по дереву','Воровские инструменты','Навигационные инструменты','Отравительские принадлежности','Снаряжение травника','Набор для грима','Набор переодевания']);

// Background skill proficiencies (для справки)
const BG_SKILLS = {
  'Аколит':'Проницательность, Религия', 'Артист':'Акробатика, Выступление',
  'Беспризорник':'Ловкость рук, Скрытность', 'Благородный':'История, Убеждение',
  'Гильдейский мастер':'Проницательность, Убеждение', 'Жулик':'Обман, Ловкость рук',
  'Матрос':'Атлетика, Восприятие', 'Мудрец':'История, Магия',
  'Народный герой':'Уход за животными, Выживание', 'Отшельник':'Медицина, Религия',
  'Преступник':'Обман, Скрытность', 'Скиталец':'Атлетика, Выживание',
  'Солдат':'Атлетика, Запугивание', 'Городская стража':'Атлетика, Проницательность',
  'Клановый мастер':'История, Проницательность', 'Придворный':'Проницательность, Убеждение',
  'Рыцарь ордена':'Убеждение', 'Ветеран наёмника':'Атлетика, Убеждение',
  'Агент Азория':'Проницательность, Убеждение', 'Культист Груула':'Атлетика, Запугивание',
  'Дитя Диммира':'Обман, Скрытность', 'Преследуемый':'Медицина, Скрытность',
  'Следователь':'Медицина', 'Работник балагана':'Акробатика, Обман',
};

function buildProfsBlock(char) {
  const ws      = char._wizardState || {};
  const choices = ws.mecEquipChoices || {};
  const lines   = [];

  // ── Доспехи и оружие (из класса) ────────────────────────────────────────
  const clsProf = CLASS_PROFS[char.class];
  if (clsProf) {
    if (clsProf.armor  && clsProf.armor  !== '—') lines.push(`Доспехи: ${clsProf.armor}`);
    if (clsProf.weapons && clsProf.weapons !== '—') lines.push(`Оружие: ${clsProf.weapons}`);
  }

  // ── Языки (раса + выборы предыстории) ───────────────────────────────────
  const langs = [];
  // Race base languages
  const raceLangs = RACE_DESCRIPTIONS[char.race]?.languages;
  if (raceLangs) raceLangs.split(',').map(s => s.trim()).filter(Boolean).forEach(l => langs.push(l));

  // Background language/tool choices from mecBgChoiceData
  const bgChoiceData = ws.mecBgChoiceData || {};
  const tools = [];
  Object.values(bgChoiceData).forEach(data => {
    if (Array.isArray(data)) {
      data.forEach(key => {
        const [type, ...rest] = key.split('::');
        const val = rest.join('::');
        if (type === 'language') langs.push(val);
        else if (type !== 'skill') tools.push(val);  // instrument, artisan, gaming, any_prof, all_tools
      });
    } else if (typeof data === 'string' && data) {
      // Single-select: plain value (no type prefix) — classify by known sets
      if (KNOWN_LANGUAGES.has(data)) langs.push(data);
      else if (KNOWN_TOOLS.has(data)) tools.push(data);
    }
  });

  if (langs.length) lines.push(`Языки: ${[...new Set(langs)].join(', ')}`);
  // instrument/artisan/gaming from equipment step
  ['instrument','artisan','gaming'].forEach(t => {
    const val = choices[`bgch_${t}`];
    if (val) tools.push(val);
  });

  if (tools.length) lines.push(`Инструменты: ${[...new Set(tools)].join(', ')}`);

  // ── Пользовательский текст ───────────────────────────────────────────────
  if (ws.features) lines.push(ws.features);

  return lines.map(l => `<div class="profs-line">${esc(l)}</div>`).join('');
}

function buildFeaturesBlock(char) {
  const ws    = char._wizardState || {};
  const level = char.level || 1;
  const lines = [];

  // ── Class features for levels 1..level ──────────────────────────────
  const classFeats = CLASS_FEATURES[char.class] || {};
  for (let lvl = 1; lvl <= level; lvl++) {
    (classFeats[lvl] || []).forEach(f => lines.push(f));
  }

  // ── Racial traits ────────────────────────────────────────────────────
  const raceDesc = RACE_DESCRIPTIONS[char.race];
  if (raceDesc?.traits?.length) {
    if (lines.length) lines.push('');  // spacer
    raceDesc.traits.forEach(t => lines.push(`${t.title}: ${t.text}`));
  }

  // ── Subrace description ──────────────────────────────────────────────
  if (char.subrace && raceDesc?.subraces) {
    const sub = raceDesc.subraces.find(s => s.name === char.subrace);
    if (sub?.description) lines.push(sub.description);
  }

  // ── Background feature ───────────────────────────────────────────────
  const bgDesc = BACKGROUND_DESCRIPTIONS[char.background];
  if (bgDesc?.feature) {
    if (lines.length) lines.push('');
    lines.push(`${bgDesc.feature.title}: ${bgDesc.feature.text}`);
  }

  // ── User-typed free text ─────────────────────────────────────────────
  if (ws.features) {
    if (lines.length) lines.push('');
    lines.push(ws.features);
  }

  return lines
    .map(l => l === '' ? `<div class="feat-spacer"></div>` : `<div class="feat-line">${esc(l)}</div>`)
    .join('');
}

// ─── Spell page ───────────────────────────────────────────────────────────────

function buildSpellPage(char) {
  if (!MAGIC_CLASSES.has(char.class)) return '';

  const ws      = char._wizardState || {};
  const spellAb = CLASS_SPELL_ABILITY[char.class] || 'int';
  const pb      = profBonus(char.level || 1);
  const stats   = char.stats || {};
  const spellMod = mod(stats[spellAb] ?? 10);
  const spellDC  = 8 + pb + spellMod;
  const spellAtk = sign(pb + spellMod);

  // Only spells actually selected in the wizard
  const cantrips    = ws.mecSpellsCantrips || [];
  const preparedSet = new Set(ws.mecSpellsPrepared || []);
  const lvl1spells  = [...new Set([
    ...(ws.mecSpellsLevel1   || []),
    ...(ws.mecSpellsBook     || []),
    ...(ws.mecSpellsPrepared || []),
  ])];

  // If character has no _wizardState spells (e.g. created with old wizard), show empty-sheet notice
  const hasAnySpells = cantrips.length > 0 || lvl1spells.length > 0;
  if (!hasAnySpells && !char._wizardState) {
    return `<div class="page page-break" style="display:flex;align-items:center;justify-content:center;min-height:150mm">
      <div style="text-align:center;color:#888;font-size:11px;max-width:160mm">
        <div style="font-size:18px;margin-bottom:8px">✦</div>
        Заклинания не заполнены — персонаж создан до появления шага выбора заклинаний.<br>
        Откройте редактирование и пройдите шаг «Заклинания».
      </div>
    </div>`;
  }

  const spellLine = (name, prepared = false) =>
    `<div class="spell-row${prepared ? ' prepared' : ''}">
      <span class="spell-dot filled"></span>
      <span class="spell-name${prepared ? ' bold' : ''}">${esc(name)}${prepared ? ' ✓' : ''}</span>
    </div>`;

  const emptyLine = () => `<div class="spell-line"></div>`;

  // Cantrips: selected ones + empty lines up to a minimum of 8
  const cantripMin  = Math.max(cantrips.length, 8);
  const cantripRows = [
    ...cantrips.map(s => spellLine(s)),
    ...Array(Math.max(0, cantripMin - cantrips.length)).fill(emptyLine()),
  ].join('');

  // Level 1: selected ones + empty lines up to a minimum of 13
  const lvl1min  = Math.max(lvl1spells.length, 13);
  const lvl1rows = [
    ...lvl1spells.map(s => spellLine(s, preparedSet.has(s))),
    ...Array(Math.max(0, lvl1min - lvl1spells.length)).fill(emptyLine()),
  ].join('');

  return `
<div class="page page-break">

  <!-- Header -->
  <div class="sheet-header">
    <div class="header-logo">
      <div class="logo-dnd">D&amp;D</div>
      <div class="logo-sub">Заклинания</div>
    </div>
    <div class="header-fields">
      <div class="header-name-block">
        <div style="flex:1">
          <div class="char-name-val" style="font-size:14px">${esc(char.name || 'Без имени')}</div>
          <div class="hfield-label">ИМЯ ПЕРСОНАЖА</div>
        </div>
      </div>
      <div class="header-row">
        <div class="hfield">
          <div class="hfield-val">${esc(char.class || '—')}</div>
          <div class="hfield-label">КЛАСС ЗАКЛИНАТЕЛЯ</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${esc(STAT_FULL[spellAb])}</div>
          <div class="hfield-label">БАЗОВАЯ ХАРАКТЕРИСТИКА</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${spellDC}</div>
          <div class="hfield-label">СЛОЖНОСТЬ СПАСБРОСКА</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${spellAtk}</div>
          <div class="hfield-label">БОНУС БРОСКА АТАКИ</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Spell grid: 3 columns -->
  <div class="spell-grid">

    <!-- Cantrips + Level 1 -->
    <div class="spell-col">
      <div class="spell-level-box">
        <div class="spell-level-header">
          <span class="spell-level-num">0</span>
          <span class="spell-level-label">Заговоры</span>
        </div>
        <div class="spell-list">${cantripRows}</div>
        <div class="section-footer">Заговоры</div>
      </div>

      <div class="spell-level-box" style="margin-top:6px">
        <div class="spell-level-header">
          <span class="spell-level-num">1</span>
          <div class="spell-slots">
            <span class="slots-label">Ячеек:</span>
            <span class="slots-val">${char.level >= 1 ? '2' : '0'}</span>
          </div>
        </div>
        <div class="spell-list">${lvl1rows}</div>
        <div class="section-footer">Заклинания 1 уровня</div>
      </div>
    </div>

    <!-- Levels 2–5 (empty slots for manual fill) -->
    <div class="spell-col">
      ${[2,3,4,5].map(lvl => `
        <div class="spell-level-box" style="margin-bottom:6px">
          <div class="spell-level-header">
            <span class="spell-level-num">${lvl}</span>
            <div class="spell-slots"><span class="slots-label">Ячеек:</span><span class="slots-val">&nbsp;</span></div>
          </div>
          <div class="spell-list spell-list-empty">
            ${Array(6).fill('<div class="spell-line"></div>').join('')}
          </div>
          <div class="section-footer">Заклинания ${lvl} уровня</div>
        </div>`).join('')}
    </div>

    <!-- Levels 6–9 -->
    <div class="spell-col">
      ${[6,7,8,9].map(lvl => `
        <div class="spell-level-box" style="margin-bottom:6px">
          <div class="spell-level-header">
            <span class="spell-level-num">${lvl}</span>
            <div class="spell-slots"><span class="slots-label">Ячеек:</span><span class="slots-val">&nbsp;</span></div>
          </div>
          <div class="spell-list spell-list-empty">
            ${Array(5).fill('<div class="spell-line"></div>').join('')}
          </div>
          <div class="section-footer">Заклинания ${lvl} уровня</div>
        </div>`).join('')}
    </div>

  </div>
</div>`;
}

// ─── Full document ─────────────────────────────────────────────────────────────

function buildDocument(char) {
  const ws      = char._wizardState || {};  // ALL concept + mechanics data lives here
  const stats   = char.stats || {};
  const pb      = profBonus(char.level || 1);
  const ac      = computeAC(char);
  const saves   = CLASS_SAVES[char.class] || [];
  const hitDie  = CLASS_HIT_DIE[char.class] || 8;
  const dexMod  = mod(stats.dex);
  const wisMod  = mod(stats.wis);
  const hasPerc = (char.skills || []).includes('Восприятие');
  const passPerc = 10 + wisMod + (hasPerc ? pb : 0);
  const race    = [char.subrace, char.race].filter(Boolean).join(' ') || '—';
  const hp      = char.hp ?? char.maxHp ?? 1;
  const maxHp   = char.maxHp ?? 1;

  const portraitSection = char.portrait
    ? `<img class="portrait-img" src="${esc(char.portrait)}" alt="Портрет">`
    : `<div class="portrait-placeholder">${esc((char.name || '?')[0].toUpperCase())}</div>`;

  const spellPage = buildSpellPage(char);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${esc(char.name || 'Персонаж')} — Лист персонажа</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 10px;
  color: #111;
  background: #fff;
}

.page {
  width: 210mm;
  padding: 8mm 9mm;
  margin: 0 auto;
  background: #fff;
}

/* ── Header ─────────────────────────────── */
.sheet-header {
  display: grid;
  grid-template-columns: 160px 1fr;
  border: 2px solid #555;
  margin-bottom: 7px;
  border-radius: 3px;
  overflow: hidden;
}

.header-logo {
  border-right: 1.5px solid #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  text-align: center;
}
.logo-dnd { font-family: 'Times New Roman', serif; font-size: 18px; font-weight: bold; letter-spacing: -1px; }
.logo-sub { font-size: 7px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; margin-top: 2px; }

.header-name-block {
  border-bottom: 1px solid #999;
  padding: 3px 8px 2px;
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.header-fields { display: flex; flex-direction: column; }
.header-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); border-top: 1px solid #bbb; }
.hfield { padding: 2px 6px 1px; border-right: 1px solid #ccc; display: flex; flex-direction: column; justify-content: flex-end; }
.hfield:last-child { border-right: none; }
.hfield-val { font-size: 11px; font-weight: bold; min-height: 15px; border-bottom: 1px solid #bbb; padding-bottom: 1px; }
.hfield-label { font-size: 6.5px; text-transform: uppercase; letter-spacing: 0.07em; color: #666; margin-top: 1px; }
.char-name-val { font-size: 16px; font-weight: bold; border-bottom: 1.5px solid #555; min-height: 22px; padding-bottom: 1px; flex: 1; }

/* ── Body grid ──────────────────────────── */
.sheet-body {
  display: grid;
  grid-template-columns: 62px 148px 1fr 150px;
  gap: 6px;
  align-items: start;
}

/* ── Ability scores ─────────────────────── */
.col-abilities { display: flex; flex-direction: column; gap: 5px; }

.ability-block {
  border: 1.5px solid #333;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 2px 3px;
}
.ability-name { font-size: 6.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; margin-bottom: 2px; }
.ability-score-box { border: 1.5px solid #333; width: 46px; height: 40px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
.ability-mod-circle { border: 1.5px solid #333; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; margin-top: -6px; background: #fff; position: relative; z-index: 1; }

/* ── Checks col ─────────────────────────── */
.col-checks { display: flex; flex-direction: column; }

.small-labeled-row { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.small-box { border: 1.5px solid #333; border-radius: 3px; width: 32px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; }
.small-label { font-size: 7.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.2; }

.section-box { border: 1.5px solid #333; border-radius: 4px; margin-bottom: 5px; overflow: hidden; }
.section-inner { padding: 3px 5px 2px; }
.section-footer { background: #ebebeb; border-top: 1px solid #999; text-align: center; font-size: 6.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.07em; padding: 2px 3px; color: #333; }

/* ── Check row ──────────────────────────── */
.check-row { display: flex; align-items: center; gap: 3px; padding: 1.5px 0; font-size: 9px; border-bottom: 1px dotted #ddd; }
.check-row:last-child { border-bottom: none; }
.dot { width: 8px; height: 8px; border: 1px solid #333; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.dot.filled { background: #222; border-color: #222; }
.check-val { min-width: 20px; text-align: right; font-weight: bold; font-size: 9px; flex-shrink: 0; }
.check-label { flex: 1; font-size: 8.5px; line-height: 1.3; }
.check-label em { font-style: normal; font-size: 7.5px; color: #666; }

.passive-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; margin-top: 4px; }
.passive-box { border: 1.5px solid #333; border-radius: 3px; width: 32px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; }
.passive-label { font-size: 7px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.3; }
.profs-box { border: 1.5px solid #333; border-radius: 4px; }
.profs-inner { padding: 3px 5px; font-size: 8px; min-height: 35px; line-height: 1.5; }

/* ── Combat col ─────────────────────────── */
.col-combat { display: flex; flex-direction: column; }

.combat-top { display: flex; gap: 4px; margin-bottom: 5px; }
.combat-cell { flex: 1; border: 1.5px solid #333; border-radius: 4px; text-align: center; padding: 4px 2px 2px; }
.combat-val { font-size: 20px; font-weight: bold; line-height: 1; }
.combat-cell-label { font-size: 7px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-top: 2px; }

.hp-max-line { font-size: 8px; margin-bottom: 3px; padding-left: 2px; color: #444; }
.hp-big-box { border: 1.5px solid #333; border-radius: 4px; margin-bottom: 4px; overflow: hidden; }
.hp-big-inner { min-height: 38px; padding: 4px 8px; font-size: 28px; font-weight: bold; display: flex; align-items: center; justify-content: center; }
.hp-small-box { border: 1.5px solid #333; border-radius: 4px; margin-bottom: 4px; overflow: hidden; }
.hp-small-inner { min-height: 24px; padding: 3px 6px; }

.hitdice-death { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; }
.hitdice-box, .deathsave-box { border: 1.5px solid #333; border-radius: 4px; overflow: hidden; }
.hitdice-inner, .deathsave-inner { padding: 3px 5px; min-height: 30px; }
.deathsave-row { display: flex; align-items: center; gap: 3px; font-size: 7.5px; margin-bottom: 2px; }
.death-circle { width: 9px; height: 9px; border: 1px solid #333; border-radius: 50%; display: inline-block; margin-right: 1px; }

.attacks-table { border: 1.5px solid #333; border-radius: 4px; margin-bottom: 4px; overflow: hidden; }
.attacks-header { display: grid; grid-template-columns: 2fr 1fr 2fr; background: #e8e8e8; border-bottom: 1px solid #555; }
.attacks-header span { font-size: 7px; font-weight: bold; text-transform: uppercase; padding: 2px 4px; border-right: 1px solid #aaa; text-align: center; }
.attacks-header span:last-child { border-right: none; }
.attack-row { display: grid; grid-template-columns: 2fr 1fr 2fr; border-bottom: 1px solid #ddd; min-height: 18px; }
.attack-row:last-child { border-bottom: none; }
.attack-cell { padding: 2px 4px; font-size: 9px; border-right: 1px solid #ddd; display: flex; align-items: center; }
.attack-cell:last-child { border-right: none; }
.attacks-footer { background: #e8e8e8; border-top: 1px solid #555; font-size: 6.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; text-align: center; padding: 2px; color: #333; }

.equip-box { border: 1.5px solid #333; border-radius: 4px; overflow: visible; }
.equip-inner { padding: 4px 5px; }
.equip-item { font-size: 8.5px; padding: 1.5px 0; border-bottom: 1px dotted #ccc; line-height: 1.3; }
.equip-item:last-child { border-bottom: none; }

/* ── Personality col ────────────────────── */
.col-personality { display: flex; flex-direction: column; }
.pers-box { border: 1.5px solid #333; border-radius: 4px; margin-bottom: 4px; }
.pers-inner { padding: 4px 6px; min-height: 40px; font-size: 8.5px; line-height: 1.4; }
.feat-line { margin-bottom: 2px; font-size: 8px; line-height: 1.35; }
.feat-spacer { height: 4px; }
.equip-divider { font-size: 7.5px; color: #888; font-style: italic; padding: 2px 0; }
.spell-name.bold { font-weight: bold; }

/* ── Page 2 ─────────────────────────────── */
.p2-header { display: grid; grid-template-columns: 160px 1fr; border: 2px solid #555; margin-bottom: 7px; border-radius: 3px; overflow: hidden; }
.p2-name-col { border-right: 1.5px solid #666; padding: 5px 8px; display: flex; flex-direction: column; justify-content: flex-end; }
.p2-meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
.p2-meta-field { padding: 2px 6px 1px; border-left: 1px solid #ccc; border-bottom: 1px solid #ccc; display: flex; flex-direction: column; justify-content: flex-end; }
.p2-meta-field:nth-child(n+4) { border-bottom: none; }
.p2-body-top { display: grid; grid-template-columns: 140px 1fr; gap: 6px; margin-bottom: 6px; }
.portrait-box { border: 1.5px solid #333; border-radius: 4px; overflow: hidden; min-height: 120px; display: flex; align-items: center; justify-content: center; }
.portrait-img { width: 100%; height: 120px; object-fit: cover; display: block; }
.portrait-placeholder { font-size: 48px; font-weight: bold; color: #aaa; width: 100%; height: 120px; display: flex; align-items: center; justify-content: center; background: #f5f5f5; }
.p2-body-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tall-box { border: 1.5px solid #333; border-radius: 4px; overflow: hidden; min-height: 100px; }
.tall-inner { padding: 5px 6px; font-size: 8.5px; line-height: 1.5; min-height: 95px; }

/* ── Spell page ─────────────────────────── */
.spell-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; align-items: start; }
.spell-col { display: flex; flex-direction: column; }
.spell-level-box { border: 1.5px solid #333; border-radius: 4px; overflow: hidden; }
.spell-level-header { display: flex; align-items: center; gap: 6px; background: #e8e8e8; border-bottom: 1px solid #555; padding: 3px 6px; }
.spell-level-num { font-size: 16px; font-weight: bold; line-height: 1; }
.spell-level-label { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
.spell-slots { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.slots-label { font-size: 7.5px; color: #555; }
.slots-val { border: 1px solid #555; border-radius: 3px; width: 24px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
.spell-list { padding: 3px 5px; }
.spell-row { display: flex; align-items: center; gap: 5px; padding: 2px 0; border-bottom: 1px dotted #ddd; font-size: 9px; }
.spell-row:last-child { border-bottom: none; }
.spell-dot { width: 8px; height: 8px; border: 1px solid #333; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.spell-dot.filled { background: #222; }
.spell-name { flex: 1; }
.spell-row.prepared .spell-name { font-weight: bold; }
.spell-empty { font-size: 8px; color: #aaa; font-style: italic; padding: 4px 0; }
.spell-list-empty { padding: 2px 5px; }
.spell-line { height: 16px; border-bottom: 1px solid #ddd; }

/* ── Page break ─────────────────────────── */
.page-break { page-break-before: always; }

/* ── Print ───────────────────────────────── */
@media print {
  body { background: #fff; }
  .page { width: auto; padding: 5mm 8mm; margin: 0; }
  @page { size: A4 portrait; margin: 6mm 9mm; }
}
</style>
</head>
<body>

<!-- ══════════════════════ PAGE 1: MAIN SHEET ══════════════════════ -->
<div class="page">

  <div class="sheet-header">
    <div class="header-logo">
      <div class="logo-dnd">D&amp;D</div>
      <div class="logo-sub">Dungeons &amp; Dragons</div>
      <div style="font-size:6px;color:#aaa;margin-top:3px">HeroSummoner</div>
    </div>
    <div class="header-fields">
      <div class="header-name-block">
        <div style="flex:1">
          <div class="char-name-val">${esc(char.name || 'Без имени')}</div>
          <div class="hfield-label">ИМЯ ПЕРСОНАЖА</div>
        </div>
      </div>
      <div class="header-row">
        <div class="hfield">
          <div class="hfield-val">${esc(char.class || '—')} ${char.level || 1}</div>
          <div class="hfield-label">КЛАСС И УРОВЕНЬ</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${esc(char.background || '—')}</div>
          <div class="hfield-label">ПРЕДЫСТОРИЯ</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${esc(char.playerName || '—')}</div>
          <div class="hfield-label">ИМЯ ИГРОКА</div>
        </div>
      </div>
      <div class="header-row">
        <div class="hfield">
          <div class="hfield-val">${esc(race)}</div>
          <div class="hfield-label">РАСА</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${esc(char.alignment || '—')}</div>
          <div class="hfield-label">МИРОВОЗЗРЕНИЕ</div>
        </div>
        <div class="hfield">
          <div class="hfield-val">${char.edition === '2024' ? '5.5e · 2024' : '5e · 2014'}</div>
          <div class="hfield-label">РЕДАКЦИЯ</div>
        </div>
      </div>
    </div>
  </div>

  <div class="sheet-body">

    <!-- Col 1: Ability scores -->
    <div class="col-abilities">
      ${buildAbilities(stats, saves, pb)}
    </div>

    <!-- Col 2: Inspiration / PB / Saves / Skills / Passive / Profs -->
    <div class="col-checks">
      <div class="small-labeled-row">
        <div class="small-box">&nbsp;</div>
        <div class="small-label">Вдохновение</div>
      </div>
      <div class="small-labeled-row">
        <div class="small-box">${sign(pb)}</div>
        <div class="small-label">Бонус<br>мастерства</div>
      </div>
      <div class="section-box">
        <div class="section-inner">${buildSaves(stats, saves, pb)}</div>
        <div class="section-footer">Спасброски</div>
      </div>
      <div class="section-box">
        <div class="section-inner">${buildSkills(stats, char.skills, pb)}</div>
        <div class="section-footer">Навыки</div>
      </div>
      <div class="passive-row">
        <div class="passive-box">${passPerc}</div>
        <div class="passive-label">Пассивная<br>Мудрость<br>(Восприятие)</div>
      </div>
      <div class="profs-box">
        <div class="profs-inner">${buildProfsBlock(char)}</div>
        <div class="section-footer">Прочие владения и языки</div>
      </div>
    </div>

    <!-- Col 3: Combat / HP / Attacks / Equipment -->
    <div class="col-combat">
      <div class="combat-top">
        <div class="combat-cell">
          <div class="combat-val">${ac}</div>
          <div class="combat-cell-label">КД</div>
        </div>
        <div class="combat-cell">
          <div class="combat-val">${sign(dexMod)}</div>
          <div class="combat-cell-label">Инициатива</div>
        </div>
        <div class="combat-cell">
          <div class="combat-val">30</div>
          <div class="combat-cell-label">Скорость</div>
        </div>
      </div>

      <div class="hp-max-line">Максимум хитов: <strong>${maxHp}</strong></div>

      <div class="hp-big-box">
        <div class="hp-big-inner">${hp}</div>
        <div class="section-footer">Текущие хиты</div>
      </div>

      <div class="hp-small-box">
        <div class="hp-small-inner"></div>
        <div class="section-footer">Временные хиты</div>
      </div>

      <div class="hitdice-death">
        <div class="hitdice-box">
          <div class="hitdice-inner">
            <div style="font-size:8px;color:#555;margin-bottom:2px">Итого: 1d${hitDie}</div>
            <div style="font-size:15px;font-weight:bold">d${hitDie}</div>
          </div>
          <div class="section-footer">Кость хитов</div>
        </div>
        <div class="deathsave-box">
          <div class="deathsave-inner">
            <div class="deathsave-row">
              <span style="min-width:36px">Успехи</span>
              <span class="death-circle"></span><span class="death-circle"></span><span class="death-circle"></span>
            </div>
            <div class="deathsave-row">
              <span style="min-width:36px">Провалы</span>
              <span class="death-circle"></span><span class="death-circle"></span><span class="death-circle"></span>
            </div>
          </div>
          <div class="section-footer">Спасброски от смерти</div>
        </div>
      </div>

      <div class="attacks-table">
        <div class="attacks-header">
          <span>Название</span><span>Бонус атаки</span><span>Урон/Вид</span>
        </div>
        ${buildAttackRows(getWeaponAttacks(char))}
        <div class="attacks-footer">Атаки и заклинания</div>
      </div>

      <div class="equip-box">
        <div class="equip-inner">${buildEquipList(char)}</div>
        <div class="section-footer">Снаряжение</div>
      </div>
    </div>

    <!-- Col 4: Personality / Features -->
    <div class="col-personality">
      <div class="pers-box">
        <div class="pers-inner">${esc(ws.traits || '')}</div>
        <div class="section-footer">Черты характера</div>
      </div>
      <div class="pers-box">
        <div class="pers-inner">${esc(ws.ideals || '')}</div>
        <div class="section-footer">Идеалы</div>
      </div>
      <div class="pers-box">
        <div class="pers-inner">${esc(ws.bonds || '')}</div>
        <div class="section-footer">Привязанности</div>
      </div>
      <div class="pers-box">
        <div class="pers-inner">${esc(ws.flaws || '')}</div>
        <div class="section-footer">Слабости</div>
      </div>
      <div class="pers-box" style="flex:1">
        <div class="pers-inner" style="min-height:70px">${buildFeaturesBlock(char)}</div>
        <div class="section-footer">Умения и способности</div>
      </div>
    </div>

  </div>
</div>

<!-- ══════════════════════ PAGE 2: BACKSTORY ══════════════════════ -->
<div class="page page-break">

  <div class="p2-header">
    <div class="p2-name-col">
      <div class="char-name-val" style="font-size:13px">${esc(char.name || 'Без имени')}</div>
      <div class="hfield-label">ИМЯ ПЕРСОНАЖА</div>
    </div>
    <div class="p2-meta-grid">
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.age || '—')}</div><div class="hfield-label">ВОЗРАСТ</div></div>
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.height || '—')}</div><div class="hfield-label">РОСТ</div></div>
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.weight || '—')}</div><div class="hfield-label">ВЕС</div></div>
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.eyes || '—')}</div><div class="hfield-label">ГЛАЗА</div></div>
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.skin || '—')}</div><div class="hfield-label">КОЖА</div></div>
      <div class="p2-meta-field"><div class="hfield-val">${esc(ws.hair || '—')}</div><div class="hfield-label">ВОЛОСЫ</div></div>
    </div>
  </div>

  <div class="p2-body-top">
    <div class="portrait-box">${portraitSection}</div>
    <div style="display:flex;flex-direction:column;gap:6px;flex:1">
      <div class="tall-box" style="flex:1">
        <div class="tall-inner">${esc(ws.allies || '')}</div>
        <div class="section-footer">Союзники и организации</div>
      </div>
    </div>
  </div>

  <div class="p2-body-bottom">
    <div class="tall-box">
      <div class="tall-inner" style="min-height:150px">${esc(ws.backstory || '')}</div>
      <div class="section-footer">Предыстория персонажа</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div class="tall-box" style="flex:1">
        <div class="tall-inner">${esc(ws.appearance || '')}</div>
        <div class="section-footer">Внешний вид персонажа</div>
      </div>
      <div class="tall-box">
        <div class="tall-inner">${esc(ws.treasure || '')}</div>
        <div class="section-footer">Сокровища</div>
      </div>
    </div>
  </div>

</div>

<!-- ══════════════════════ PAGE 3: SPELLS ══════════════════════ -->
${spellPage}

<script>
  window.addEventListener('load', () => {
    window.print();
    window.addEventListener('afterprint', () => window.close());
  });
<\/script>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function exportPDF(char) {
  const html = buildDocument(char);
  const win  = window.open('', '_blank', 'width=960,height=800');
  if (!win) { alert('Разрешите всплывающие окна для экспорта PDF.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
