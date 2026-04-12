# HeroSummoner — План сбора данных по расам с dnd.su

**Цель**: Заполнить `js/data/race_descriptions.js` полными данными из блока «Особенности» dnd.su:
скорость, размер, тёмное зрение, увеличение характеристик, расовые черты, языки, подрасы.

**Формат записи** в `race_descriptions.js`:
```js
'Название': {
  speed: 30,             // скорость в футах
  size: 'Средний',       // размер
  senses: '...',         // тёмное зрение и т.п. (опционально)
  languages: '...',      // языки
  description: '...',    // 1-2 предложения-флейвор
  traits: [
    { title: '...', text: '...' },
  ],
  subraces: [
    { name: '...', asi: { str: 2 }, description: '...' },
  ],
},
```

---

## Прогресс

**Легенда**: ⬜ ожидает | 🔄 в работе | ✅ готово

---

## PHB (Player's Handbook)

| № | Раса | Ключ в RACE_DATA | URL dnd.su | Статус |
|---|------|-----------------|------------|--------|
| 1 | Дварф | `Дварф` | https://dnd.su/races/dwarf/ | ⬜ |
| 2 | Эльф | `Эльф` | https://dnd.su/races/elf/ | ⬜ |
| 3 | Полурослик | `Полурослик` | https://dnd.su/races/halfling/ | ⬜ |
| 4 | Человек | `Человек` | https://dnd.su/races/human/ | ⬜ |
| 5 | Драконид | `Драконид` / `Дракорождённый` | https://dnd.su/races/dragonborn/ | ⬜ |
| 6 | Гном | `Гном` | https://dnd.su/races/gnome/ | ⬜ |
| 7 | Полуэльф | `Полуэльф` | https://dnd.su/races/half-elf/ | ⬜ |
| 8 | Полуорк | `Полуорк` | https://dnd.su/races/half-orc/ | ⬜ |
| 9 | Тифлинг | `Тифлинг` | https://dnd.su/races/tiefling/ | ⬜ |

## VGtM (Volo's Guide to Monsters)

| № | Раса | Ключ | URL | Статус |
|---|------|------|-----|--------|
| 10 | Аасимар | `Аасимар` | https://dnd.su/races/aasimar/ | ⬜ |
| 11 | Ящеролюд | `Ящеролюд` | https://dnd.su/races/lizardfolk/ | ⬜ |
| 12 | Кенку | `Кенку` | https://dnd.su/races/kenku/ | ⬜ |
| 13 | Кобольд | `Кобольд` | https://dnd.su/races/kobold/ | ⬜ |
| 14 | Орк | `Орк` | https://dnd.su/races/orc-volo/ | ⬜ |
| 15 | Табакси | `Табакси` | https://dnd.su/races/tabaxi/ | ⬜ |
| 16 | Тритон | `Тритон` | https://dnd.su/races/triton/ | ⬜ |
| 17 | Голиаф | `Голиаф` | https://dnd.su/races/goliath/ | ⬜ |
| 18 | Юань-Ти | `Юань-Ти` | https://dnd.su/races/yuan-ti-pureblood/ | ⬜ |
| 19 | Юань-Ти Чистокровный | `Юань-Ти (Чистокровный)` | https://dnd.su/races/yuan-ti-pureblood/ | ⬜ |
| 20 | Фирболг | `Фирболг` | https://dnd.su/races/firbolg/ | ⬜ |

## MToF (Mordenkainen's Tome of Foes)

| № | Раса | Ключ | URL | Статус |
|---|------|------|-----|--------|
| 21 | Гитьянки | `Гитьянки` | https://dnd.su/races/githyanki/ | ⬜ |
| 22 | Гитзерай | `Гитзерай` | https://dnd.su/races/githzerai/ | ⬜ |
| 23 | Дуэргар | `Дуэргар` | https://dnd.su/races/duergar/ | ⬜ |
| 24 | Эладрин | `Эладрин` | https://dnd.su/races/eladrin/ | ⬜ |

## SCAG (Sword Coast Adventurer's Guide)

| № | Раса | Ключ | URL | Статус |
|---|------|------|-----|--------|
| 25 | Дварф Серого Пика | `Дварф Серого Пика` | https://dnd.su/races/gray-dwarf-duergar/ | ⬜ |
| 26 | Дроу (Восход) | `Дроу (Восход)` | https://dnd.su/races/elf/#dark-elf | ⬜ |

## MPMM / Другие

| № | Раса | Ключ | URL | Статус |
|---|------|------|-----|--------|
| 27 | Centaur | `Centaur` | https://dnd.su/races/centaur/ | ⬜ |
| 28 | Changeling | `Changeling` | https://dnd.su/races/changeling/ | ⬜ |
| 29 | Fairy | `Fairy` | https://dnd.su/races/fairy/ | ⬜ |
| 30 | Harengon | `Harengon` | https://dnd.su/races/harengon/ | ⬜ |
| 31 | Leonin | `Leonin` | https://dnd.su/races/leonin/ | ⬜ |
| 32 | Minotaur | `Minotaur` | https://dnd.su/races/minotaur/ | ⬜ |
| 33 | Satyr | `Satyr` | https://dnd.su/races/satyr/ | ⬜ |
| 34 | Warforged | `Warforged` | https://dnd.su/races/warforged/ | ⬜ |
| 35 | Tortle | `Tortle` | https://dnd.su/races/tortle/ | ⬜ |
| 36 | Goblin | `Goblin` | https://dnd.su/races/goblin/ | ⬜ |
| 37 | Loxodon | `Loxodon` | https://dnd.su/races/loxodon/ | ⬜ |
| 38 | Simic Hybrid | `Simic Hybrid` | https://dnd.su/races/simic-hybrid/ | ⬜ |
| 39 | Vedalken | `Vedalken` | https://dnd.su/races/vedalken/ | ⬜ |
| 40 | Kalashtar | `Kalashtar` | https://dnd.su/races/kalashtar/ | ⬜ |
| 41 | Shifter | `Shifter` | https://dnd.su/races/shifter/ | ⬜ |
| 42 | Dhampir | `Dhampir` | https://dnd.su/races/dhampir/ | ⬜ |
| 43 | Hexblood | `Hexblood` | https://dnd.su/races/hexblood/ | ⬜ |
| 44 | Reborn | `Reborn` | https://dnd.su/races/reborn/ | ⬜ |
| 45 | Astral Elf | `Astral Elf` | https://dnd.su/races/astral-elf/ | ⬜ |
| 46 | Autognome | `Autognome` | https://dnd.su/races/autognome/ | ⬜ |
| 47 | Giff | `Giff` | https://dnd.su/races/giff/ | ⬜ |
| 48 | Hadozee | `Hadozee` | https://dnd.su/races/hadozee/ | ⬜ |
| 49 | Plasmoid | `Plasmoid` | https://dnd.su/races/plasmoid/ | ⬜ |
| 50 | Thri-kreen | `Thri-kreen` | https://dnd.su/races/thri-kreen/ | ⬜ |
| 51 | Grung | `Grung` | https://dnd.su/races/grung/ | ⬜ |
| 52 | Locathah | `Locathah` | https://dnd.su/races/locathah/ | ⬜ |
| 53 | Орк Эберрона | `Орк Эберрона` | https://dnd.su/races/orc-eberron/ | ⬜ |

---

## Что извлекать с каждой страницы

С блока «Особенности» на dnd.su для каждой расы нужно забрать:

1. **Скорость** (`speed`) — в футах, обычно 25 или 30
2. **Размер** (`size`) — Маленький / Средний
3. **Увеличение характеристик** (ASI) — отдельно для расы и каждой подрасы
4. **Тёмное зрение** и другие особые чувства — дальность в футах
5. **Расовые черты** — полные описания, не краткие (title + полный text)
6. **Языки** — какие языки знает раса
7. **Подрасы** — название, ASI подрасы, черты подрасы

---

## Порядок работы при возобновлении

Если сессия прервалась — запусти: **«Продолжи сбор данных по расам с раса №N»**,
где N — номер из таблицы выше (первая строка со статусом ⬜).

Алгоритм за одну сессию:
1. Fetch `https://dnd.su/races/{slug}/` через WebFetch
2. Извлечь все особенности из блока «Особенности»
3. Записать в `race_descriptions.js` (Edit — обновить существующую запись или добавить новую)
4. Пометить строку в этом файле как ✅
5. Перейти к следующей расе
6. После каждых 5 рас — `git commit -m "data(races): add full traits for ..."`
