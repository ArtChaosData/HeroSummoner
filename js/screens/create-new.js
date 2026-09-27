/**
 * HeroSummoner — Create Character (new flow)
 * Steps: landing → concept | mechanics
 */
import { el, toast } from '../utils.js';
import { DB } from '../db.js';
import {
  SCHEMA_VERSION, grant, raceIdByName, subraceIdByName, backgroundIdByName, featIdByName, migrateWizardState,
} from '../character.js';
import { FEATS } from '../data/feats.js';
import { ARMOUR, WEAPONS, EQUIPMENT, TOOLS } from '../data/equipment.js';
import { getSpellById } from '../data/spells.js';
import {
  buildSpellSections, prunePicks, takenMap, missingPicks, groupOptions, groupNeed, spellGrantSpecs,
  hasSpellSources, migrateSpellState, CLASS_NAME_BY_ID, LATE_CASTERS, SPELL_FEATS, STAT_SHORT as STAT_SHORT_SG, STAT_LABEL as STAT_LABEL_SG,
} from '../spell-groups.js';
import { RACE_DESCRIPTIONS } from '../data/race_descriptions.js';
import { CLASS_DESCRIPTIONS, CLASS_ORDER } from '../data/class_descriptions.js';
import { CLASS_FEATURES, featureName, isOptionalFeature } from '../data/class_features.js';
import { SUBCLASS_DESCRIPTIONS } from '../data/subclass_descriptions.js';
import { SOURCES } from '../data/sources.js';
import {
  TCE_TIMELINE, VARIANT_TOOLTIP, FIGHTING_STYLES, MANEUVERS, FAVORED_ENEMY_TYPES,
  FAVORED_TERRAINS, CLASS_FIXED_LANGUAGES, EXPERTISE_TEASER, SUBCLASS_PICK_LABEL,
} from '../data/class_lvl1.js';
import { SUBCLASS_LEVEL, LVL1_SUBCLASSES } from '../data/class_lvl1_subclasses.js';
import { RULES } from '../data/rules_text.js';
import { PROG_COLS, PROG_VALS, PROG_PB, PROG_TCEPLAIN, PROG_PHBFIX, PROG_TCEFIX } from '../data/class_progression.js';

// Maps RACE_DATA names that differ from RACE_DESCRIPTIONS keys
const RACE_DESC_ALIASES = {
};

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
    mecStep:     'class',
    mecMaxStep:  0,
    mecSources:  ['PHB'],
    mecClass:      null,
    mecRace:       null,
    mecSubrace:    null,
    mecBackground: null,
    mecStats:            { str:8, dex:8, con:8, int:8, wis:8, cha:8 },
    mecVariantHumanAsi:  {},
    mecHalfElfAsi:       {},
    mecRaceSkills:       [],
    mecRaceChoices:      {},
    mecDeviceChoices:    {},
    mecChosen:           [],
    mecStatMethod:       'pointbuy',
    mecStdAssign:        {},
    mecRolls:            [],
    mecRollAssign:       {},
    mecBgChoiceData: {},
    mecClassToolChoice: {},
    // ТЗ v0.25, шаг 4.4.2: версия класса, выборы 1 ур., подкласс
    mecClassVariant:    'phb',
    mecClassChoices:    {},
    mecSubclass:        null,
    mecSubclassChoices: {},
    mecSubclassPreview: null,
    // ТЗ 4.4.6 (Э2): выбор заклинаний по группам источников — { [ключ группы]: [id dnd.su] }; класс списка для черт
    mecSpellPicks:      {},
    mecSpellFeatClass:  {},
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

function field(label, key, st, { rows, placeholder = '', required = false } = {}) {
  const isArea = rows > 1;
  const inp = isArea
    ? el('textarea', { class: 'cnew-textarea', rows: String(rows), placeholder })
    : el('input',    { class: 'cnew-input',    type: 'text',        placeholder });
  inp.value = st[key] || '';
  inp.addEventListener('input', () => { st[key] = inp.value; scheduleSave(st); });
  const labelEl = el('label', { class: 'cnew-label' }, label);
  if (required) labelEl.append(el('span', { class: 'cnew-required-mark' }, ' *'));
  return el('div', { class: `cnew-field${required ? ' cnew-field--required' : ''}` },
    labelEl,
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
        field('Имя персонажа', 'name',       st, { placeholder: 'Как зовут героя?', required: true }),
        field('Имя игрока',    'playerName', st, { placeholder: 'Кто за ним?',     required: true }),
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
            el('option', { value: '' }, 'Мировоззрение'),
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
        field('Черты характера', 'traits', st, { rows: 2, placeholder: 'Привычки, причуды…',          required: true }),
        field('Идеалы',          'ideals', st, { rows: 2, placeholder: 'Во что верит персонаж…',      required: true }),
        field('Привязанности',   'bonds',  st, { rows: 2, placeholder: 'Люди, места, предметы…',      required: true }),
        field('Слабости',        'flaws',  st, { rows: 2, placeholder: 'Пороки, страхи…',             required: true }),
      ),
    ),

    // ── Блоки на всю ширину ───────────────────────────────────────────────────
    el('div', { class: 'cnew-sec' },
      el('p', { class: 'cnew-sec-title' },
        'Предыстория',
        el('span', { class: 'cnew-required-mark' }, ' *'),
      ),
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

// ─── Character model v1 (ТЗ v0.28 §2.1, этап Э1) ─────────────────────────────
// Всё, что персонаж получил на шагах мастера, пишется в реестр grants[] с источником и уровнем.
// Плоские списки (навыки, языки, инструменты) из записи больше не сохраняются — их считает
// poolValues() в js/character.js.
function splitProfList(str) {
  return str && str !== 'нет' ? str.split(', ').map(x => x.trim()).filter(Boolean) : [];
}

function buildCharacterGrants(st) {
  const g = [];
  const cls = st.mecClass || null;
  const prof = CLASS_PROF_DATA[cls] || {};
  // ── Класс
  for (const v of prof.saves || [])            g.push(grant('save',   v, 'class', cls));
  for (const v of splitProfList(prof.armor))   g.push(grant('armor',  v, 'class', cls));
  for (const v of splitProfList(prof.weapons)) g.push(grant('weapon', v, 'class', cls));
  const clsToolPicks = ((st.mecClassToolChoice || {})[cls] || []).map(k => k.split('::').slice(1).join('::'));
  for (const v of mecClassToolProfs(st)) {
    g.push(grant('tool', v, 'class', cls, clsToolPicks.includes(v) ? { kind: 'choice', slot: 'class_tools' } : {}));
  }
  for (const v of st.mecChosen || [])          g.push(grant('skill', v, 'class', cls, { kind: 'choice', slot: 'class_skills' }));
  for (const v of CLASS_FIXED_LANGUAGES[cls] || []) g.push(grant('language', v, 'class', cls));
  const cc = st.mecClassChoices || {};
  if (clsVariant(st) === 'phb' && cc.favored_enemy_language) {
    g.push(grant('language', cc.favored_enemy_language, 'class', cls, { kind: 'choice', slot: 'favored_enemy_language' }));
  }
  if (cc.fighting_style) g.push(grant('feature', cc.fighting_style, 'class', cls, { kind: 'choice', slot: 'fighting_style' }));
  for (const v of [].concat(cc.maneuver || [])) g.push(grant('feature', v, 'class', cls, { kind: 'choice', slot: 'maneuver' }));
  // ── Подкласс (1 ур.)
  const sub = clsSubclassObj(st);
  if (sub) {
    const sg = sub.grants || {}, sc = st.mecSubclassChoices || {};
    for (const v of sg.armor || [])     g.push(grant('armor',    v, 'subclass', sub.id));
    for (const v of sg.weapons || [])   g.push(grant('weapon',   v, 'subclass', sub.id));
    for (const v of sg.tools || [])     g.push(grant('tool',     v, 'subclass', sub.id));
    for (const v of sg.skills || [])    g.push(grant('skill',    v, 'subclass', sub.id));
    for (const v of sg.languages || []) g.push(grant('language', v, 'subclass', sub.id));
    for (const v of sc.skills || [])    g.push(grant('skill',    v, 'subclass', sub.id, { kind: 'choice', slot: 'subclass_skills' }));
    for (const v of sc.languages || []) g.push(grant('language', v, 'subclass', sub.id, { kind: 'choice', slot: 'subclass_languages' }));
  }
  // ── Раса и подраса
  if (st.mecRace) {
    const raceName = st.mecRace.split('::')[1];
    const raceId = raceIdByName(raceName);
    const subId = st.mecSubrace ? subraceIdByName(raceId, st.mecSubrace) : null;
    const raceDesc = _resolveRaceDesc(raceName);
    for (const v of mecRaceBaseLanguages(raceDesc)) g.push(grant('language', v, 'race', raceId));
    for (const [k, v] of Object.entries(mecRacialAsi(st))) {
      if (v) g.push(grant('asi', `${k}+${v}`, subId ? 'subrace' : 'race', subId || raceId));
    }
    if (raceDesc?.speed) g.push(grant('speed', raceDesc.speed, 'race', raceId));
    for (const v of mecRaceGrantedSkills(st)) g.push(grant('skill', v, 'race', raceId));
    for (const v of st.mecRaceSkills || [])   g.push(grant('skill', v, subId ? 'subrace' : 'race', subId || raceId, { kind: 'choice', slot: 'race_skills' }));
    const choices = st.mecRaceChoices || {}, devices = st.mecDeviceChoices || {};
    const subTraitTitles = new Set(((raceDesc?.subraces || []).find(sd => sd.name === st.mecSubrace)?.traits || []).map(t => t.title));
    for (const t of mecActiveRaceTraits(raceName, st.mecSubrace)) {
      const [srcType, srcId] = subTraitTitles.has(t.title) && subId ? ['subrace', subId] : ['race', raceId];
      if (t.choice) {
        for (const v of choices[t.title] || []) {
          if (t.choice.type === 'language') g.push(grant('language', v, srcType, srcId, { kind: 'choice', slot: t.title }));
          else if (t.choice.type === 'feat')  g.push(grant('feat', featIdByName(v) || v, srcType, srcId, { kind: 'choice', slot: t.title }));
        }
      }
      if (t.recordAs && t.devices?.some(d => d.name === devices[t.title])) {
        if (t.recordAs === 'tool') g.push(grant('tool', devices[t.title], srcType, srcId, { kind: 'choice', slot: t.title }));
        else g.push(grant('feature', `${t.title}: ${devices[t.title]}`, srcType, srcId, { kind: 'choice', slot: t.title }));
      }
    }
  }
  // ── Предыстория
  const bg = mecBgObj(st);
  if (bg) {
    const bgId = backgroundIdByName(bg.name);
    for (const v of mecBgSkills(st)) g.push(grant('skill', v, 'background', bgId));
    const fixedTools = bg.tools || [];
    for (const v of fixedTools) g.push(grant('tool', v, 'background', bgId));
    const { langs, tools } = mecBgProfs(st);
    for (const v of langs) g.push(grant('language', v, 'background', bgId, { kind: 'choice', slot: 'background_languages' }));
    for (const v of tools.filter(t => !fixedTools.includes(t))) {
      g.push(grant('tool', v, 'background', bgId, { kind: 'choice', slot: 'background_tools' }));
    }
  }
  // ── Заклинания (шаг 4.4.6, Э2): класс, подкласс, раса, черта — id dnd.su, с источником и слотом
  const { res: spellRes, picks: spellPicks } = spellState(st);
  for (const s of spellGrantSpecs(spellRes, spellPicks)) g.push(grant(s.pool, s.value, s.sourceType, s.sourceId, s.opts));
  return g;
}

async function saveCharToDB(st, status) {
  const clsObj   = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsName  = clsObj?.name ?? '';
  const bgName   = st.mecBackground ? st.mecBackground.split('::')[1] : '';
  const raceName = st.mecRace       ? st.mecRace.split('::')[1]       : '';
  const raceId   = raceIdByName(raceName);
  const asiMap   = mecRacialAsi(st);

  const stats = {};
  for (const key of ['str','dex','con','int','wis','cha']) {
    stats[key] = (effectiveBase(st, key) ?? 8) + (asiMap[key] || 0);
  }
  const conMod = Math.floor(((stats.con || 8) - 10) / 2);
  const die    = CLASS_HP_DIE[clsName] || 8;
  const maxHp  = Math.max(1, die + conMod + (st.mecSubclass === 'sorcerer-draconic' ? 1 : 0)); // Драконья кровь: +1 хит/ур.

  // Capture wizard state for edit-draft flow (exclude portrait to save space)
  const { portrait: _p, ...wizardSnap } = st;

  mecSyncBgItems(st);
  const subObj  = clsSubclassObj(st);
  const grants  = buildCharacterGrants(st);
  const prev    = st._charId ? await DB.get(st._charId).catch(() => null) : null;
  const curHp   = prev?.hp?.max === maxHp ? (prev.hp.current ?? maxHp) : maxHp;

  const record = {
    schemaVersion: SCHEMA_VERSION,
    name:       st.name?.trim() || 'Без имени',
    playerName: st.playerName?.trim() || '',
    alignment:  st.alignment || '',
    classId:      st.mecClass || null,
    classVariant: clsVariant(st),
    subclassId:   subObj?.id || null,
    raceId,
    subraceId:    raceId && st.mecSubrace ? subraceIdByName(raceId, st.mecSubrace) : null,
    backgroundId: bgName ? backgroundIdByName(bgName) : null,
    labels: { class: clsName || null, subclass: subObj?.name || null, race: raceName || null,
              subrace: st.mecSubrace || null, background: bgName || null },
    stats,
    statMethod: st.mecStatMethod || 'pointbuy',
    hp:         { current: curHp, max: maxHp },
    grants,
    levels: [{
      level: 1, classId: st.mecClass || null,
      hp: { method: 'max', value: maxHp },
      choices: {
        classVariant: clsVariant(st),
        class: st.mecClassChoices || {},
        subclass: subObj ? (st.mecSubclassChoices || {}) : {},
        spellFeatClass: st.mecSpellFeatClass || {},
      },
      grants: grants.map((_, i) => i),
    }],
    migrationWarnings: [],
    portrait:   st.portrait || null,
    status,
    favorite:   prev?.favorite ?? false,
    _wizardState: wizardSnap,
  };
  if (st._charId) record.id = st._charId;
  if (prev?.createdAt) record.createdAt = prev.createdAt;
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
    { id: 'OGA',  name: "One Grung Above",                       desc: 'Раса Грунг.' },
    { id: 'LR',   name: "Locathah Rising",                       desc: 'Раса Локата.' },
  ],
};

// ─── Sourcebook content (races + subclasses) ──────────────────────────────────
// subs: [[ClassName, sub1, sub2, ...], ...]

const SRC_CONTENT = {
  PHB: {
    races: [
      'Дварф (Горный)', 'Дварф (Холмовой)',
      'Эльф (Высший)', 'Эльф (Лесной)', 'Тёмный эльф (дроу)',
      'Полурослик (Легконогий)', 'Полурослик (Коренастый)',
      'Человек', 'Человек (Альтернативный)',
      'Драконорождённый',
      'Гном (Лесной)', 'Гном (Скальный)',
      'Полуэльф', 'Полуорк', 'Тифлинг',
    ],
    subs: [],
  },
  XGtE: {
    rules: 'Расширяет правила инструментов, отдыха, встреч и ловушек.',
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
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
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
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
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
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
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Жрец',    'Домен Ковена'],
      ['Паладин', 'Клятва Завоевания (рев.)'],
    ],
  },
  VGtM: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [],
  },
  MPMM: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [],
  },
  VRGR: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Бард',      'Коллегия Духов'],
      ['Следопыт',  'Охотник на Призраков'],
      ['Плут',      'Призрак (рев.)'],
      ['Колдун',    'Духи Нечисти'],
      ['Волшебник', 'Порядок Писцов (рев.)'],
    ],
  },
  SCC: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
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
  WBW:  { races: [] /* 2026-09-27: расы не из PHB удалены из данных */, subs: [] },
  MOT: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Жрец',    'Домен Благословения'],
      ['Паладин', 'Клятва Слав'],
    ],
  },
  GGR: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Жрец',      'Домен Порядка'],
      ['Паладин',   'Клятва Завоевания (рев.)'],
      ['Плут',      'Инквизитор (рев.)'],
      ['Волшебник', 'Биомаг'],
    ],
  },
  RLW: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Воин',      'Рыцарь Метки'],
      ['Монах',     'Путь Четырёх Ветров'],
      ['Следопыт',  'Рейнджер Зверей (рев.)'],
      ['Волшебник', 'Маг Метки'],
    ],
  },
  SAS: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [],
  },
  AI: {
    races: [] /* 2026-09-27: расы не из PHB удалены из данных */,
    subs: [
      ['Жрец',   'Домен Порядка (рев.)'],
      ['Плут',   'Корпоративный Агент'],
    ],
  },
  POA:  { races: [] /* 2026-09-27: расы не из PHB удалены из данных */, subs: [] },
  TP:   { races: [] /* 2026-09-27: расы не из PHB удалены из данных */, subs: [] },
  OGA:  { races: [] /* 2026-09-27: расы не из PHB удалены из данных */, subs: [] },
  LR:   { races: [] /* 2026-09-27: расы не из PHB удалены из данных */, subs: [] },
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
  const books = SOURCEBOOKS['5e'] || [];
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
  // Паладин/Следопыт без заклинаний расы/черты: шаг виден, но пропускается — «Магия придёт на 2 уровне» (ТЗ 4.4.6)
  const lateMagic = !magic && LATE_CASTERS.has(st.mecClass);
  const steps     = MECH_STEPS.filter(s => !s.magic || magic || lateMagic);
  const cur       = steps.findIndex(s => s.id === (st.mecStep || 'class'));
  // mecMaxStep — индекс в полном MECH_STEPS; переводим в индекс видимого списка
  const maxIdx    = steps.filter(s => MECH_STEPS.indexOf(s) <= (st.mecMaxStep || 0)).length - 1;
  const statsIdx  = steps.findIndex(s => s.id === 'stats');
  const spellsIdx = magic ? steps.findIndex(s => s.id === 'spells') : -1;
  const spellsOk  = spellsIdx < 0 || spellStepDone(st);
  return el('nav', { class: 'mech-progress' },
    ...steps.flatMap((s, i) => {
      const afterStats = statsIdx >= 0 && i > statsIdx;
      if (lateMagic && s.id === 'spells') {
        const b = el('button', { class: 'mech-step is-future is-late', disabled: 'true', title: 'Магия придёт на 2 уровне' }, s.label);
        return i < steps.length - 1 ? [b, el('span', { class: 'mech-sep' }, '›')] : [b];
      }
      const reachable  = i <= maxIdx
        && (s.id !== 'stats' || st.mecBgOk !== false)
        && (!afterStats || st.mecStatsOk)
        && (spellsIdx < 0 || i <= spellsIdx || spellsOk);
      const cls = 'mech-step' + (i === cur ? ' is-current' : reachable ? ' is-past' : ' is-future');
      const attrs = { class: cls };
      if (!reachable) attrs.disabled = 'true';
      if (reachable && i !== cur) attrs.onClick = () => goMech(s.id);
      const btn = el('button', attrs, s.label);
      return i < steps.length - 1 ? [btn, el('span', { class: 'mech-sep' }, '›')] : [btn];
    }),
  );
}

// ─── Buy mode: shop + inventory panel ────────────────────────────────────────

function buildBuyMode(st, footBtn, onCartChange, ref = {}) {
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
    if (onCartChange) onCartChange();
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
  ref.addItem = addItem;

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
    el('option', { value: '' }, 'Не выбрано'),
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
  // 2026-09-26: только предметы-инструменты (см. схему `item`), не владения.
  function matChoiceEls(resolvedBgName) {
    if (!resolvedBgName) return [];
    mecSyncBgItems(st);
    return mecBgItemChoices(st).map(({ ch, profVal }) => buildBgItemEl(st, ch, profVal));
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
  // 2026-09-26: единый источник — mecBgProfs(); предмет в снаряжении на владение не влияет.
  const { langs, tools } = mecBgProfs(st);

  // Class profs
  const AB_SHORT2 = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
  const clsSavesStr  = (clsData?.saves || []).map(k => AB_SHORT2[k] ?? k).join(', ');
  const clsSkillsStr = (st.mecChosen || []).join(', ');
  // Class tool proficiency (fixed, e.g. Друид → «набор травника», Плут → «воровские инструменты»)
  // — was shown on the class-select screen (CLASS_PROF_DATA) but never carried into this review
  // or into pdf.js. For Бард/Монах/Изобретатель, CLASS_PROF_DATA.tools was only ever descriptive
  // text ("три музыкальных инструмента на выбор") because the actual picker (CLASS_TOOL_CHOICE)
  // wrote its selection to a key nothing downstream read — now that it's wired to
  // `st.mecClassToolChoice`, show the real picks once made (Изобретатель keeps its two fixed
  // tools alongside the chosen one; Бард/Монах's descriptive text is choice-only, so the actual
  // picks replace it).
  const clsToolPickNames = ((st.mecClassToolChoice || {})[st.mecClass] || [])
    .map(k => k.split('::').slice(1).join('::'));
  const clsFixedToolsStr = (CLASS_PROF_DATA[st.mecClass]?.tools && CLASS_PROF_DATA[st.mecClass].tools !== 'нет')
    ? CLASS_PROF_DATA[st.mecClass].tools
    : '';
  const clsToolsStr = clsToolPickNames.length
    ? (st.mecClass === 'artificer'
        ? [...new Set([...(clsFixedToolsStr ? clsFixedToolsStr.split(', ') : []), ...clsToolPickNames])].join(', ')
        : clsToolPickNames.join(', '))
    : clsFixedToolsStr;

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

  const clsProfCol = (clsData && (clsSavesStr || clsSkillsStr || clsToolsStr)) ? profCol(clsName, 'is-class', [
    clsSavesStr  ? profRow('Спасброски',   clsSavesStr)  : null,
    clsSkillsStr ? profRow('Навыки',       clsSkillsStr) : null,
    clsToolsStr  ? profRow('Инструменты',  clsToolsStr)  : null,
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

  // ── Заклинания (ТЗ 4.4.8, Э2): только если есть источник заклинаний ───────
  let spellsSec = null;
  if (hasSpellStep(st)) {
    const { res: sRes, picks: sPicks } = spellState(st);
    const rows = [];
    for (const sec of sRes.sections) {
      const src = sec.label.split(' — ').pop();
      const lines = [];
      for (const g of sec.groups) {
        const ids = g.kind === 'fixed'
          ? g.fixed.map(f => ({ id: f.spell.id, later: f.from > 1 ? f.from : 0 }))
          : (sPicks[g.key] || []).map(id => ({ id, later: 0 }));
        if (!ids.length) continue;
        const names = ids.map(({ id, later }) => {
          const sp = getSpellById(id);
          return (sp ? sp.name : String(id)) + (later ? ` (с ${later} ур.)` : '');
        });
        lines.push(el('div', { class: 'final-prof-row' },
          el('span', { class: 'final-prof-type' }, g.title),
          el('span', { class: 'final-prof-values' }, names.join(', '))));
      }
      if (lines.length) rows.push(el('div', { class: 'final-profs-col' },
        el('span', { class: `final-profs-source is-${sec.type === 'race' ? 'bg' : 'class'}` }, src), ...lines));
    }
    const cols = PROG_COLS[st.mecClass] || [];
    const vals = PROG_VALS[st.mecClass] || [];
    const slotIdx = cols.indexOf('Ячейки заклинаний'), lvlIdx = cols.indexOf('Уровень ячеек');
    const slots = slotIdx >= 0 ? vals[slotIdx]?.[0] : null;
    const slotLine = slots && slots !== '—'
      ? `Ячейки заклинаний на 1 уровне: ${slots}${lvlIdx >= 0 ? ` (уровень ячеек ${vals[lvlIdx]?.[0]})` : ' (1 круг)'}` : null;
    spellsSec = el('div', { class: 'final-section final-profs-sec' },
      el('div', { class: 'final-section-hd' },
        el('span', { class: 'final-section-title' }, 'Заклинания'),
        editBtn('spells'),
      ),
      el('div', { class: 'final-profs-grid' }, ...rows),
      slotLine ? el('div', { class: 'final-gold-line' }, slotLine) : null,
    );
  }

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
      spellsSec,
      equipSec,
    ),
    el('div', { class: 'mech-foot' }, saveBtn),
  );
}

// ─── Mechanics: main wrapper ──────────────────────────────────────────────────


function buildMechanics(st, go, container) {
  if (!st.mecStep || st.mecStep === 'edition') st.mecStep = 'class';
  if (!st.mecSources || !st.mecSources.length) st.mecSources = ['PHB'];

  // Шаг «Заклинания» — у любого персонажа с источником заклинаний на 1 ур. (ТЗ v0.29)
  const magic = hasSpellStep(st);

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
      st.mecStep === 'class'      ? buildClassStep(st, goMech)
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

// Derived from CLASS_DESCRIPTIONS (js/data/class_descriptions.js) — single source of truth
// for class name/roles/rp-complexity/flavor text. Do NOT hardcode class data here again;
// see docs/reviews/2026-09-08_backend-frontend-review.md (finding #1) for why this was split
// into two drifting copies before.
const CLASS_DATA = CLASS_ORDER.map(name => {
  const c = CLASS_DESCRIPTIONS[name];
  return {
    id:    c.id,
    name,
    gen:   c.gen,
    roles: c.roles,
    rp:    c.rpComplexity,
    stats: c.statsLabel,
    desc:  c.description,
    ...(c.tag ? { tag: c.tag } : {}),
  };
});

// ─── Class proficiency data ──────────────────────────────────────────────────

const CLASS_PROF_DATA = {
  barbarian: { hitDie:'к12', armor:'лёгкие, средние, щиты',        weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Сила','Телосложение'] },
  bard:      { hitDie:'к8',  armor:'лёгкие',                        weapons:'простое, короткие мечи, длинные мечи, рапира, ручные арбалеты', tools:'три музыкальных инструмента на выбор',        saves:['Ловкость','Харизма'] },
  cleric:    { hitDie:'к8',  armor:'лёгкие, средние, щиты',        weapons:'простое',                                                    tools:'нет',                                          saves:['Мудрость','Харизма'] },
  druid:     { hitDie:'к8',  armor:'лёгкие, средние (не металл), щиты (не металл)', weapons:'боевые посохи, булавы, дротики, дубинки, кинжалы, копья, метательные копья, пращи, серпы, скимитары', tools:'набор травника',                 saves:['Интеллект','Мудрость'] },
  fighter:   { hitDie:'к10', armor:'все, щиты',                    weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Сила','Телосложение'] },
  monk:      { hitDie:'к8',  armor:'нет',                          weapons:'простое, короткие мечи',                                     tools:'один вид ремесленных или муз. инструментов',  saves:['Сила','Ловкость'] },
  paladin:   { hitDie:'к10', armor:'все, щиты',                    weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Мудрость','Харизма'] },
  ranger:    { hitDie:'к10', armor:'лёгкие, средние, щиты',        weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Сила','Ловкость'] },
  rogue:     { hitDie:'к8',  armor:'лёгкие',                       weapons:'простое, короткие мечи, длинные мечи, рапира, ручные арбалеты', tools:'воровские инструменты',                     saves:['Ловкость','Интеллект'] },
  sorcerer:  { hitDie:'к6',  armor:'нет',                          weapons:'кинжалы, дротики, посохи, пращи, лёгкие арбалеты',           tools:'нет',                                          saves:['Телосложение','Харизма'] },
  warlock:   { hitDie:'к8',  armor:'лёгкие',                       weapons:'простое',                                                    tools:'нет',                                          saves:['Мудрость','Харизма'] },
  wizard:    { hitDie:'к6',  armor:'нет',                          weapons:'кинжалы, дротики, пращи, боевые посохи, лёгкие арбалеты',    tools:'нет',                                          saves:['Интеллект','Мудрость'] },
  artificer: { hitDie:'к8',  armor:'лёгкие, средние, щиты',        weapons:'простое',                                                    tools:'воровские инструменты, инструменты умельца', saves:['Телосложение','Интеллект'] },
};

// ─── Class step: builder ──────────────────────────────────────────────────────

// ─── Class step: выборы 1 ур., переключатель «PHB | Таша», подкласс ─────────────
// ТЗ v0.25, шаг 4.4.2 (③ инструменты/языки, ④ выборы 1 ур. + чек-лист, ⑤ подкласс).
// Данные: js/data/class_lvl1.js (ручные списки) и js/data/class_lvl1_subclasses.js
// (генерируется tools/gen_class_lvl1.py из docs/reviews/lvl1_choices.json).
// Не сделано на этом этапе (см. порядок реализации в ТЗ): «озёра выборов» между шагами,
// шаг 4.4.4a «Компетентность», фильтр TCE-расширений списков на шаге «Заклинания».

/** Версия класса: у Изобретателя всегда 'tce' (класс целиком из TCE), у остальных — переключатель. */
function clsVariant(st) {
  if (st.mecClass === 'artificer') return 'tce';
  return st.mecClassVariant === 'tce' ? 'tce' : 'phb';
}

function clsSkillProgress(st) {
  const clsData = mecClsData(st);
  if (!clsData) return { have: 0, need: 0 };
  const opts = clsData.list ?? Object.values(SKILLS_BY_AB).flat();
  const have = (st.mecChosen || []).filter(s => opts.includes(s)).length;
  return { have: Math.min(have, clsData.count), need: clsData.count };
}

function clsToolProgress(st) {
  const spec = CLASS_TOOL_CHOICE[st.mecClass];
  if (!spec) return null;
  const need = spec.count || 1;
  const have = ((st.mecClassToolChoice || {})[st.mecClass] || []).length;
  return { have: Math.min(have, need), need };
}

function clsStylesFor(variant) {
  return FIGHTING_STYLES.filter(s => variant === 'tce' || s.source === 'PHB');
}

/** Язык избранного врага (решение заказчика 2026-09-27): для гуманоидов обязателен, для типов существ —
 *  необязателен («…если он вообще умеет говорить», dnd.su). 'yes' | 'maybe' | null (враг не выбран). */
function clsEnemySpeaks(fe) {
  if (!fe) return null;
  if (fe.mode === 'humanoids') return clsHumanoidRaces(fe).length ? 'yes' : null;
  return fe.type ? 'maybe' : null;
}
const clsHumanoidRaces = fe => (fe?.races || []).map(r => String(r).trim()).filter(Boolean);

function clsSubclassList(st) { return LVL1_SUBCLASSES[st.mecClass] || null; }
function clsSubclassObj(st) {
  return (clsSubclassList(st) || []).find(s => s.id === st.mecSubclass) || null;
}
function clsSubChoice(st, id) { return ((st.mecSubclassChoices || {})[id]) || []; }

/** Навыки, которые подкласс даёт на выбор (Домен знаний/природы/порядка/мира) — для блокировки дублей с навыками класса. */
function clsSubclassSkillPicks(st) {
  const sub = clsSubclassObj(st);
  if (!sub) return [];
  return sub.choices.filter(c => c.id === 'skills').flatMap(c => clsSubChoice(st, c.id));
}

/** Особенности 1 ур. (read-only) по версии класса — из CLASS_FEATURES; TCE-замены встают на место базовых. */
function clsLvl1FeatureNames(clsName, variant) {
  const arr = (CLASS_FEATURES[clsName] || {})[1] || [];
  const HIDDEN = new Set(['Дополнительные заклинания', 'Варианты боевых стилей']); // это не умения, а расширение списков — см. подпись переключателя
  const replaced = new Set(variant === 'tce'
    ? arr.filter(f => isOptionalFeature(f) && f.replaces).map(f => f.replaces) : []);
  return arr
    .filter(f => typeof f === 'string'
      ? !HIDDEN.has(f) && !replaced.has(f)
      : variant === 'tce' && !!f.replaces)
    .map(featureName);
}

/** Чек-лист «Осталось выбрать» (ТЗ ④D) — строится из данных. Пункт: { key, label, done }. */
function classChecklist(st) {
  const items = [];
  if (!st.mecClass) return items;
  const v  = clsVariant(st);
  const cc = st.mecClassChoices || {};

  const sk = clsSkillProgress(st);
  items.push({ key: 'skills', label: `Навыки (${sk.have}/${sk.need})`, done: sk.have >= sk.need });

  const tp = clsToolProgress(st);
  if (tp) items.push({ key: 'tools', label: tp.need > 1 ? `Инструменты (${tp.have}/${tp.need})` : 'Инструмент', done: tp.have >= tp.need });

  if (st.mecClass === 'fighter') {
    const ok = clsStylesFor(v).some(s => s.name === cc.fighting_style);
    items.push({ key: 'fighting_style', label: 'Боевой стиль', done: ok });
    if (ok && cc.fighting_style === 'Превосходная техника')
      items.push({ key: 'maneuver', label: 'Приём', done: !!cc.maneuver });
  }

  if (st.mecClass === 'ranger' && v === 'phb') {
    const fe = cc.favored_enemy;
    const feDone = !!fe && (fe.mode === 'humanoids' ? clsHumanoidRaces(fe).length === 2 : !!fe.type);
    items.push({ key: 'favored_enemy', label: 'Избранный враг', done: feDone });
    if (feDone && clsEnemySpeaks(fe) === 'yes')
      items.push({ key: 'favored_enemy_language', label: 'Язык врага', done: !!cc.favored_enemy_language });
    items.push({ key: 'favored_terrain', label: 'Избранная местность', done: !!cc.favored_terrain });
  }

  const subs = clsSubclassList(st);
  if (subs) {
    const sub = clsSubclassObj(st);
    items.push({ key: 'subclass', label: SUBCLASS_PICK_LABEL[st.mecClass].short, done: !!sub });
    if (sub) sub.choices.filter(c => !c.optional).forEach(c => {
      const have = Math.min(clsSubChoice(st, c.id).length, c.n);
      // «Навыки»/«Языки» подкласса отличаем от навыков класса в чек-листе: «Навыки домена (0/2)»
      const lbl = (c.id === 'skills' || c.id === 'languages') ? `${c.label} ${SUBCLASS_PICK_LABEL[st.mecClass].gen}` : c.label;
      items.push({ key: 'sub_' + c.id, label: c.n > 1 ? `${lbl} (${have}/${c.n})` : lbl, done: have >= c.n });
    });
  }
  return items;
}

/** Что сбросится при смене версии PHB ↔ Таша (для диалога подтверждения, замечание @designer). */
function clsVariantLosses(st, next) {
  const cc = st.mecClassChoices || {};
  const out = [];
  if (st.mecClass === 'fighter' && next === 'phb' && cc.fighting_style
      && !clsStylesFor('phb').some(s => s.name === cc.fighting_style)) {
    out.push(`боевой стиль «${cc.fighting_style}»`);
    if (cc.maneuver) out.push(`приём «${cc.maneuver}»`);
  }
  if (st.mecClass === 'ranger' && next === 'tce') {
    const fe = cc.favored_enemy;
    if (fe?.mode === 'humanoids' && clsHumanoidRaces(fe).length) out.push(`избранный враг «${clsHumanoidRaces(fe).join(', ')}»`);
    else if (fe?.type) out.push(`избранный враг «${fe.type}»`);
    if (cc.favored_enemy_language) out.push(`язык врага «${cc.favored_enemy_language}»`);
    if (cc.favored_terrain) out.push(`избранная местность «${cc.favored_terrain}»`);
  }
  return out;
}

function clsApplyVariant(st, next) {
  const cc = st.mecClassChoices || (st.mecClassChoices = {});
  if (st.mecClass === 'fighter' && next === 'phb'
      && cc.fighting_style && !clsStylesFor('phb').some(s => s.name === cc.fighting_style)) {
    delete cc.fighting_style; delete cc.maneuver;
  }
  if (st.mecClass === 'ranger' && next === 'tce') {
    delete cc.favored_enemy; delete cc.favored_enemy_language; delete cc.favored_terrain;
  }
  st.mecClassVariant = next;
}

/** Сброс всех зависимых выборов при смене класса (ТЗ 4.4.2 «Смена класса»). */
function clsResetForNewClass(st) {
  st.mecChosen          = [];
  st.mecClassVariant    = 'phb';
  st.mecClassChoices    = {};
  st.mecSubclass        = null;
  st.mecSubclassChoices = {};
  st.mecSubclassPreview = null;
  st.mecClassToolChoice = {};
}

/** Модалка подтверждения (стили — как у модалки «Свой предмет»). */
function openConfirmModal({ title, text, lines = [], okText = 'Да', onOk }) {
  const overlay = el('div', { class: 'shop-modal-bg' },
    el('div', { class: 'shop-modal cls-confirm' },
      el('h3', { class: 'shop-modal-title' }, title),
      text ? el('p', { class: 'cls-confirm-text' }, text) : null,
      lines.length ? el('ul', { class: 'cls-confirm-list' }, ...lines.map(l => el('li', {}, l))) : null,
      el('div', { class: 'shop-modal-btns' },
        el('button', { class: 'shop-modal-cancel', onClick: () => overlay.remove() }, 'Отмена'),
        el('button', { class: 'shop-modal-save', onClick: () => { overlay.remove(); onOk(); } }, okText),
      ),
    ),
  );
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// ─── Развитие по уровням (ТЗ v0.27, 4.4.2 ④E) ───
const TCE_PLAIN_SET = new Set(PROG_TCEPLAIN);
// Улучшения умений описаны внутри текста самого умения
const LEVEL_TEXT_ALIAS = {
  'Улучшение дикого облика': 'ДИКИЙ ОБЛИК', 'Улучшение избранного врага': 'ИЗБРАННЫЙ ВРАГ',
  'Улучшение исследователя природы': 'ИССЛЕДОВАТЕЛЬ ПРИРОДЫ', 'Улучшенное движение без доспехов': 'ДВИЖЕНИЕ БЕЗ ДОСПЕХОВ',
  'Улучшение божественного вмешательства': 'БОЖЕСТВЕННОЕ ВМЕШАТЕЛЬСТВО', 'Улучшения ауры': 'АУРА ЗАЩИТЫ',
};
const featNorm = n => n.replace(/\s*\(.*?\)\s*$/, '').trim().toUpperCase().replace(/Ё/g, 'Е');
let _rulesLevels = null; // rules_levels.js грузится лениво — при первом клике по строке уровня

/** Строки таблицы класса: { lvl, pb, vals, feats: [{ name, kind: 'phb'|'tce'|'gone', replacedBy?, removedByTce?, ruleKey?, short? }] }.
 *  PHB-умения — из CLASS_FEATURES без TCE-строк; в версии TCE — добавки золотом, заменённые помечаются 'gone'. */
function progRows(cls, variant) {
  const table  = CLASS_FEATURES[cls.name] || {};
  const tl     = TCE_TIMELINE[cls.id] || [];
  const fix    = PROG_TCEFIX[cls.id] || {};
  const phbFix = PROG_PHBFIX[cls.id] || {};
  return Array.from({ length: 20 }, (_, i) => {
    const lvl = i + 1;
    const raw = table[lvl] || [];
    const phb = phbFix[lvl] || raw.filter(f => typeof f === 'string' && !TCE_PLAIN_SET.has(f));
    const feats = phb.map(n => ({ name: n, kind: 'phb' }));
    if (variant === 'tce' && cls.id !== 'artificer') {
      const tce = [];
      raw.filter(f => typeof f !== 'string').forEach(f => tce.push({ name: f.name, replaces: f.replaces }));
      tl.filter(e => e[0] === lvl).forEach(([, name, short, key]) => {
        const ex = tce.find(t => t.name === name);
        if (ex) Object.assign(ex, { ruleKey: key, short }); else tce.push({ name, ruleKey: key, short });
      });
      (fix[lvl] || []).forEach(f => {
        if (f.remove) { tce.push({ remove: f.remove }); return; }
        const ex = tce.find(t => t.name === f.name);
        if (ex) Object.assign(ex, f); else tce.push({ ...f });
      });
      tce.forEach(t => {
        const target = t.remove || t.replaces;
        const old = target ? feats.find(f => f.name === target && f.kind === 'phb') : null;
        if (t.remove) { if (old) Object.assign(old, { kind: 'gone', removedByTce: true }); return; }
        const item = { name: t.name, kind: 'tce', ruleKey: t.ruleKey, short: t.short, replaces: old ? target : null };
        if (old) { old.kind = 'gone'; old.replacedBy = t.name; feats.splice(feats.indexOf(old) + 1, 0, item); }
        else feats.push(item);
      });
    }
    return { lvl, feats, pb: PROG_PB[i], vals: (PROG_VALS[cls.id] || []).map(col => col[i]) };
  });
}

/** Блоки текста правила (ТЗ v0.27): { h } подзаголовок, { p } абзац, { t, head } таблица. */
function renderRuleBlocks(blocks) {
  return (blocks || []).map(b => {
    if (b.h) return el('div', { class: 'cls-rules-h' }, b.h);
    if (b.t) return el('table', { class: 'cls-rules-t' },
      b.head?.length ? el('thead', {}, el('tr', {}, ...b.head.map(h => el('th', {}, h)))) : null,
      el('tbody', {}, ...b.t.map(r => el('tr', {}, ...r.map(c => el('td', {}, c))))));
    return el('p', { class: 'cls-rules-p' }, b.p || '');
  });
}

// Книги, которых нет в sources.js (там только книги шага 4.4.1). Названия — как в строке «Источник: «…»» на dnd.su
// (сверено по скачанным страницам 2026-09-27; dnd.su пишет названия этих книг по-английски).
const SUB_SOURCE_EXTRA = {
  DMG:    { name: 'Dungeon Master’s Guide', year: 2014 },
  VRGR:   { name: 'Van Richten’s Guide to Ravenloft', year: 2021 },
  DSotDQ: { name: 'Dragonlance: Shadow of the Dragon Queen', year: 2022 },
};
// Названия книг — как пишет dnd.su (по-английски), решение заказчика 2026-09-27
const DNDSU_BOOK_TITLE = {
  PHB: 'Player’s Handbook', XGE: 'Xanathar’s Guide to Everything', SCAG: 'Sword Coast Adventurer’s Guide',
  TCE: 'Tasha’s Cauldron of Everything',
};
function subSourceInfo(code) {
  const s = code ? SOURCES.find(x => x.code === code) : null;
  if (s) return { name: DNDSU_BOOK_TITLE[code] || s.name, year: s.year, desc: s.description };
  return SUB_SOURCE_EXTRA[code] || { name: code ? code : 'Прочие источники', year: 9000 };
}
/** Порядок групп подклассов (ТЗ v0.26): PHB → XGE → остальные по году выхода → DMG (злодейский) → TCE. */
function subSourceRank(code) {
  if (code === 'PHB') return 0;
  if (code === 'XGE') return 1;
  if (code === 'DMG') return 99998;
  if (code === 'TCE') return 99999;
  return 10 + subSourceInfo(code).year;
}
/** Группирует элементы по коду источника в порядке subSourceRank; внутри группы — исходный порядок. */
function groupBySource(items, codeOf) {
  const map = new Map();
  items.forEach(it => { const c = codeOf(it) || ''; if (!map.has(c)) map.set(c, []); map.get(c).push(it); });
  return [...map.entries()].sort((a, b) => subSourceRank(a[0]) - subSourceRank(b[0]));
}
let _rulesSubprev = null; // rules_subprev.js грузится лениво — только при первом показе предпросмотра

/** «Что даёт на 1 уровне» — plain-language строки из grants подкласса. */
function clsGrantLines(g) {
  const L = [];
  if (g.armor)       L.push('Доспехи: ' + g.armor.join(', '));
  if (g.weapons)     L.push('Оружие: ' + g.weapons.join(', '));
  if (g.skills)      L.push('Навык: ' + g.skills.join(', '));
  if (g.tools)       L.push('Инструменты: ' + g.tools.join(', '));
  if (g.languages)   L.push('Язык: ' + g.languages.join(', '));
  if (g.hp_per_level) L.push(`+${g.hp_per_level} хит за каждый уровень`);
  if (g.unarmored_ac) L.push('Класс доспеха без доспехов: ' + g.unarmored_ac);
  if (g.darkvision)  L.push(`Тёмное зрение ${g.darkvision} фт`);
  if (g.swim_speed)  L.push(`Скорость плавания ${g.swim_speed} фт`);
  if (g.water_breathing) L.push('Дышит под водой');
  if (g.spells_always)   L.push('Заклинания, которые всегда подготовлены: ' + g.spells_always.join(', '));
  if (g.expanded_list)   L.push('Расширенный список заклинаний: ' + g.expanded_list.join(', '));
  if (g.cantrips_bonus)  L.push('Бонусный заговор: ' + g.cantrips_bonus.join(', '));
  if (g.spells_known_bonus) L.push('Дополнительно известные заклинания: ' + g.spells_known_bonus.join(', '));
  if (g.other)       L.push('Особенности: ' + g.other);
  return L;
}

/** Одноручное оружие для «Проклятого воителя» (Ведьмовской клинок): без свойства «двуручное». */
function clsHexWeaponOptions() {
  return WEAPONS.filter(w => !(w.props || []).some(p => /двуручн/i.test(p))).map(w => w.name);
}

function buildClassStep(st, goMech) {
  const listEl   = el('div', { class: 'mech-cls-list' });
  const detailEl = el('div', { class: 'mech-cls-detail' });
  const footEl   = el('div', { class: 'mech-foot' });
  let checklistEl = null;

  const ALL_SKILLS = Object.values(SKILLS_BY_AB).flat();
  if (!st.mecClassChoices)    st.mecClassChoices = {};
  if (!st.mecSubclassChoices) st.mecSubclassChoices = {};

  function missing() { return classChecklist(st).filter(i => !i.done); }

  function updateFoot() {
    footEl.innerHTML = '';
    if (!st.mecClass) return;
    const miss = missing();
    const btn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('race') }, 'Далее → Раса');
    if (miss.length) { btn.disabled = true; btn.classList.add('is-disabled'); }
    if (miss.length) footEl.append(el('span', { class: 'cls-foot-reason' }, 'Осталось выбрать: ' + miss.map(i => i.label).join(' · ')));
    footEl.append(btn);
  }

  function flash(key) {
    const target = detailEl.querySelector(`[data-ck="${key}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-flash');
    void target.offsetWidth; // перезапуск анимации
    target.classList.add('is-flash');
    setTimeout(() => target.classList.remove('is-flash'), 1400);
  }

  function renderChecklist() {
    if (!checklistEl) return;
    checklistEl.innerHTML = '';
    const items = classChecklist(st);
    const miss  = items.filter(i => !i.done);
    if (!miss.length) {
      checklistEl.classList.add('is-done');
      checklistEl.append(el('span', { class: 'cls-ck-done' }, '✓ Все выборы сделаны'));
      return;
    }
    checklistEl.classList.remove('is-done');
    checklistEl.append(el('span', { class: 'cls-ck-label' }, 'Осталось выбрать:'));
    miss.forEach(i => checklistEl.append(
      el('button', { class: 'cls-ck-item', onClick: () => flash(i.key) }, i.label),
    ));
  }

  /** Лёгкое обновление без перерисовки панели (не закрывает открытые пикеры). */
  function refreshStatus() { renderChecklist(); updateFoot(); }

  /** Полная перерисовка панели с сохранением прокрутки. */
  function rerender() {
    const keep = detailEl.scrollTop;
    updateDetail();
    detailEl.scrollTop = keep;
    updateFoot();
  }

  function save() { scheduleSave(st); }

  // ── ⑥ Панель «Правило» (ТЗ v0.26): правая колонка на ≥1200 px, шторка снизу на узких экранах ──
  const WIDE    = window.matchMedia('(min-width: 1200px)');
  const rulesEl = el('aside', { class: 'cls-rules', 'aria-live': 'polite' });
  let pinnedRule = null;   // правило последнего выбранного варианта — показывается, когда курсор ушёл
  let progAll    = false;  // таблица уровней развёрнута до 20 ур.
  let selLvl     = null;   // выбранная строка таблицы уровней

  async function resolveRule(spec) {
    if (spec?.level) {
      if (!_rulesLevels) _rulesLevels = (await import('../data/rules_levels.js')).RULES_LEVELS;
      return { levels: _rulesLevels };
    }
    if (!spec?.key) return null;
    if (spec.key.startsWith('subprev:')) {
      if (!_rulesSubprev) _rulesSubprev = (await import('../data/rules_subprev.js')).RULES_SUBPREV;
      return _rulesSubprev[spec.key] || null;
    }
    return RULES[spec.key] || null;
  }
  function ruleBody(spec, rule) {
    const full = rule?.full;
    return [
      el('div', { class: 'cls-rules-title' }, spec.title || rule?.title || ''),
      spec.short ? el('div', { class: 'cls-rules-lbl' }, 'Коротко') : null,
      spec.short ? el('p', { class: 'cls-rules-short' }, spec.short) : null,
      spec.lines?.length ? el('ul', { class: 'cls-rules-lines' }, ...spec.lines.map(l => el('li', {}, l))) : null,
      full ? el('div', { class: 'cls-rules-lbl' }, 'Полностью') : null,
      full ? el('div', { class: 'cls-rules-full' }, ...renderRuleBlocks(full)) : null,
      !full ? el('p', { class: 'cls-rules-note' }, 'Полного текста правила в базе пока нет — см. dnd.su.') : null,
      rule?.source ? el('div', { class: 'cls-rules-src' }, 'Источник: ' + rule.source) : null,
    ];
  }
  /** Панель уровня: все умения уровня (ТЗ v0.27 ④E). */
  function levelBody(spec, levels) {
    const { level: r, cls } = spec;
    const cols = PROG_COLS[cls.id] || [];
    const meta = ['Бонус мастерства ' + r.pb, ...cols.map((c, i) => `${c}: ${r.vals[i]}`)].join(' · ');
    const sub = clsSubclassObj(st);
    const out = [
      el('div', { class: 'cls-rules-title' }, `${r.lvl} уровень`),
      el('p', { class: 'cls-rules-meta' }, meta),
    ];
    if (!r.feats.length) out.push(el('p', { class: 'cls-rules-note' }, 'Новых умений на этом уровне нет.'));
    r.feats.forEach(f => {
      out.push(el('div', { class: 'cls-rules-feat is-' + f.kind }, f.name,
        f.kind === 'tce' ? el('span', { class: 'cls-rules-tag' }, 'TCE') : null));
      if (f.kind === 'gone') {
        out.push(el('p', { class: 'cls-rules-note' }, f.replacedBy ? `В версии TCE заменено на «${f.replacedBy}».` : 'В версии TCE этого улучшения нет.'));
        return;
      }
      let blocks = null;
      if (f.kind === 'tce' && f.ruleKey && RULES[f.ruleKey]) blocks = RULES[f.ruleKey].full;
      else if (/^Умение /.test(f.name) || /(архетип|традиц|домен|покровител|происхожден|клятв|путь|коллеги|круг|специальност)/i.test(f.name) && !levels[`${cls.name}:${featNorm(f.name)}`]) {
        out.push(el('p', { class: 'cls-rules-note' }, sub && r.lvl === 1 && RULES['sub:' + sub.id]
          ? `Выбран: ${sub.name}.` : 'Зависит от выбранного подкласса — смотрите его описание.'));
        if (sub && r.lvl === 1 && RULES['sub:' + sub.id]) out.push(...renderRuleBlocks(RULES['sub:' + sub.id].full));
        return;
      } else {
        const hit = levels[`${cls.name}:${LEVEL_TEXT_ALIAS[f.name] || featNorm(f.name)}`];
        blocks = hit?.full || null;
      }
      if (f.short) out.push(el('p', { class: 'cls-rules-short' }, f.short));
      if (blocks) out.push(el('div', { class: 'cls-rules-full' }, ...renderRuleBlocks(blocks)));
      else if (!f.short) out.push(el('p', { class: 'cls-rules-note' }, 'Полного текста в базе пока нет — см. dnd.su.'));
    });
    return out;
  }
  function specBody(spec, rule) {
    return (spec?.level ? levelBody(spec, rule.levels) : ruleBody(spec, rule)).filter(Boolean);
  }

  let _ruleSeq = 0;
  async function showRule(spec) {
    const seq = ++_ruleSeq;
    const rule = await resolveRule(spec);
    if (seq !== _ruleSeq) return; // пришёл более свежий запрос
    rulesEl.innerHTML = '';
    if (!spec) {
      rulesEl.append(
        el('div', { class: 'cls-rules-title is-empty' }, 'Правило'),
        el('p', { class: 'cls-rules-note' }, 'Наведите на вариант, чтобы увидеть, как он работает по правилам.'));
      return;
    }
    rulesEl.append(...specBody(spec, rule)); // specBody отфильтровывает null — DOM append превратил бы его в текст «null»
  }
  async function openRuleSheet(spec) {
    const rule = await resolveRule(spec);
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const sheet = el('div', { class: 'cls-sheet', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'cls-sheet-grip' }),
      el('button', { class: 'cls-sheet-x', 'aria-label': 'Закрыть', onClick: close }, '✕'),
      el('div', { class: 'cls-sheet-body' }, ...specBody(spec, rule)),
    );
    const bg = el('div', { class: 'cls-sheet-bg' }, sheet);
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    let y0 = null;
    sheet.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      if (y0 != null && e.changedTouches[0].clientY - y0 > 70 && sheet.querySelector('.cls-sheet-body').scrollTop <= 0) close();
      y0 = null;
    });
    document.addEventListener('keydown', onKey);
    document.body.append(bg);
  }
  /** Вешает на узел показ правила (наведение/фокус на широком экране) и возвращает кнопку «ⓘ». */
  function ruleHook(node, spec) {
    node.addEventListener('mouseenter', () => { if (WIDE.matches) showRule(spec); });
    node.addEventListener('mouseleave', () => { if (WIDE.matches) showRule(pinnedRule); });
    node.addEventListener('focusin',   () => { if (WIDE.matches) showRule(spec); });
    const info = el('span', { class: 'cls-info-btn', role: 'button', tabindex: '0', title: 'Как это работает', 'aria-label': 'Как это работает' }, 'i');
    const act = e => {
      e.stopPropagation(); e.preventDefault();
      if (WIDE.matches) { pinnedRule = spec; showRule(spec); } else openRuleSheet(spec);
    };
    info.addEventListener('click', act);
    info.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') act(e); });
    return info;
  }
  /** Правило на весь блок выбора: «ⓘ» в заголовке + наведение на блок. */
  function blockRule(block, spec) {
    const hd = block.querySelector('.cls-choice-hd');
    const info = ruleHook(block, spec);
    if (hd) hd.append(info);
    return block;
  }

  // ── мелкие строительные блоки ──
  function chip(label, { picked, dim, title, onClick, extra = '' }) {
    const attrs = { class: 'cls-chip' + (picked ? ' is-picked' : '') + (dim ? ' is-dim' : '') + extra, onClick };
    if (title) attrs.title = title;
    const b = el('button', attrs, (picked ? '✓ ' : '') + label);
    if (dim) b.disabled = true;
    return b;
  }
  function srcBadge(code, tipName) {
    const b = el('span', { class: 'cls-src-badge' + (code === 'PHB' ? ' is-phb' : '') }, code);
    b.title = tipName || subSourceInfo(code).name;
    return b;
  }
  function choiceBlock(ck, title, hint, ...body) {
    const attrs = { class: 'cls-choice' };
    if (ck) attrs['data-ck'] = ck;
    return el('div', attrs,
      el('div', { class: 'cls-choice-hd' }, title),
      hint ? el('p', { class: 'cls-choice-hint' }, hint) : null,
      ...body,
    );
  }
  function infoCard(title, text, ruleKey = null) {
    const t = el('div', { class: 'cls-info-title' }, title);
    const card = el('div', { class: 'cls-info-card' }, t, el('p', { class: 'cls-info-text' }, text));
    if (ruleKey) t.append(ruleHook(card, { key: ruleKey, title, short: text }));
    return card;
  }
  /** Мульти-выбор чипами с лимитом n. `blocked` — Map<option, причина> (уже есть из другого источника). */
  function multiChips(options, selected, n, onChange, blocked = new Map(), ruleFor = null) {
    const set = new Set(selected);
    const atLimit = set.size >= n;
    return el('div', { class: 'cls-chips' }, ...options.map(o => {
      const isPicked = set.has(o);
      const why = blocked.get(o);
      const dim = !isPicked && ((n > 1 && atLimit) || !!why); // n = 1 — как радио: можно сразу переключить
      const c = chip(o + (why && !isPicked ? ` (${why})` : ''), {
        picked: isPicked, dim, title: why ? `Уже есть: ${why}` : undefined,
        onClick: () => {
          if (isPicked) set.delete(o);
          else if (n === 1) { set.clear(); set.add(o); }
          else if (!atLimit) set.add(o);
          else return;
          if (ruleFor && set.has(o)) pinnedRule = ruleFor(o);
          onChange([...set]);
        },
      });
      if (ruleFor) c.append(ruleHook(c, ruleFor(o)));
      return c;
    }));
  }
  function langSelect(value, onChange, placeholder = '— выберите язык —') {
    const sel = el('select', { class: 'mech-bg-select' },
      el('option', { value: '' }, placeholder),
      ...LANGUAGES.map(l => el('option', { value: l }, l)),
    );
    sel.value = value || '';
    sel.addEventListener('change', () => onChange(sel.value || null));
    return sel;
  }

  // ── ③ Владения, инструменты, фиксированные языки ──
  function buildProfBlock(cls) {
    const prof = CLASS_PROF_DATA[cls.id];
    if (!prof) return null;
    const row = (label, value, cellCls = 'cls-prof-cell cls-prof-cell--full') =>
      el('div', { class: 'cls-prof-row' },
        el('div', { class: cellCls },
          el('span', { class: 'cls-prof-label' }, label),
          typeof value === 'string' ? el('span', { class: 'cls-prof-value' }, value) : value,
        ),
      );
    let toolRow = null;
    const spec = CLASS_TOOL_CHOICE[cls.id];
    if (spec) {
      const groups = spec.groups || [{ label: spec.label, type: spec.type }];
      const max    = spec.count || 1;
      if (!st.mecClassToolChoice) st.mecClassToolChoice = {};
      const msEl = buildBgMultiSel({
        label: max > 1 ? 'Выберите ' + max : 'Выберите', // дизайн 2026-09-27: подпись уже над контролом
        max,
        groups,
        initialSelected: st.mecClassToolChoice[cls.id] || [],
        onChange: (_n, keys) => {
          st.mecClassToolChoice[cls.id] = keys;
          save();
          refreshStatus();
        },
      });
      toolRow = el('div', { class: 'cls-prof-row', 'data-ck': 'tools' },
        el('div', { class: 'cls-prof-cell cls-prof-cell--full' },
          el('span', { class: 'cls-prof-label' }, spec.label),
          el('div', { class: 'cls-tool-choices' }, msEl),
        ),
      );
    }
    const fixedLangs = CLASS_FIXED_LANGUAGES[cls.id];
    return el('div', { class: 'cls-prof-block' },
      el('div', { class: 'cls-prof-row' },
        el('div', { class: 'cls-prof-cell' },
          el('span', { class: 'cls-prof-label' }, 'Кость Хитов'),
          el('span', { class: 'cls-prof-value cls-prof-hitdie' }, prof.hitDie),
        ),
        el('div', { class: 'cls-prof-cell' },
          el('span', { class: 'cls-prof-label' }, 'Спасброски'),
          el('span', { class: 'cls-prof-value' }, prof.saves.join(', ')),
        ),
      ),
      row('Доспехи', prof.armor),
      row('Оружие', prof.weapons),
      prof.tools !== 'нет' ? row('Инструменты', prof.tools) : null,
      toolRow,
      fixedLangs ? row('Языки', fixedLangs.join(', ') + ' — известен сразу, выбирать не нужно') : null,
    );
  }

  // ── Навыки ──
  function buildSkillBlock() {
    const clsData  = mecClsData(st);
    const opts     = clsData ? (clsData.list ?? ALL_SKILLS) : [];
    const count    = clsData?.count ?? 0;
    const chosen   = new Set(st.mecChosen || []);
    const clsPicks = [...chosen].filter(s => opts.includes(s));
    const atLimit  = clsPicks.length >= count;
    const fromSub  = new Set(clsSubclassSkillPicks(st));

    const skillChips = [...opts].sort((a, b) => ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b)).map(name => {
      const isPicked   = chosen.has(name);
      const isFromSub  = !isPicked && fromSub.has(name);
      const isDisabled = !isPicked && (atLimit || isFromSub);
      const c = el('button', {
        class: 'cls-skill-chip' + (isPicked ? ' is-picked' : '') + (isDisabled ? ' is-dim' : ''),
        onClick: () => {
          const s = new Set(st.mecChosen || []);
          if (isPicked) s.delete(name);
          else if (!isDisabled) s.add(name);
          else return;
          st.mecChosen = [...s];
          save();
          rerender();
        },
      }, (isPicked ? '✓ ' : '') + name + (isFromSub ? ' (от подкласса)' : ''));
      c.disabled = isDisabled;
      const colorVar = skillColorVar(name);
      if (colorVar) c.style.setProperty('--chip-c', colorVar);
      return c;
    });
    return el('div', { class: 'cls-skill-block', 'data-ck': 'skills' },
      el('div', { class: 'cls-skill-block-header' },
        el('span', { class: 'cls-skill-block-title' }, 'Навыки владения'),
        el('span', { class: 'cls-skill-counter' + (atLimit ? ' is-done' : '') }, `Выбрано навыков: ${clsPicks.length} / ${count}`),
      ),
      el('div', { class: 'cls-skill-chips' }, ...skillChips),
    );
  }

  // ── Переключатель «PHB | Таша» в шапке ──
  function buildVariantSwitch(cls) {
    if (cls.id === 'artificer') return null;
    const v = clsVariant(st);
    const seg = (id, label) => el('button', {
      class: 'cls-variant-btn' + (v === id ? ' is-on' : ''),
      'aria-pressed': v === id ? 'true' : 'false',
      onClick: () => {
        if (clsVariant(st) === id) return;
        const losses = clsVariantLosses(st, id);
        const apply = () => { clsApplyVariant(st, id); save(); rerender(); };
        if (!losses.length) { apply(); return; }
        openConfirmModal({
          title: id === 'tce' ? 'Включить TCE?' : 'Вернуться к PHB?',
          text: 'Эти выборы есть только в текущей версии и сбросятся:',
          lines: losses.map(l => l[0].toUpperCase() + l.slice(1)),
          okText: 'Сбросить и переключить',
          onOk: apply,
        });
      },
    }, label);
    const help = el('button', { class: 'cls-variant-help', title: VARIANT_TOOLTIP, 'aria-label': 'Что это?' }, '?');
    help.addEventListener('mouseenter', e => showSrcTip(e, { name: 'PHB или Таша?', desc: VARIANT_TOOLTIP }));
    help.addEventListener('mouseleave', hideSrcTip);
    help.addEventListener('click', () => {
      const hint = detailEl.querySelector('.cls-variant-hint');
      if (hint) hint.hidden = !hint.hidden;
    });
    return el('div', { class: 'cls-variant' },
      el('div', { class: 'cls-variant-seg', role: 'group', 'aria-label': 'Версия класса' },
        seg('phb', 'PHB'), seg('tce', 'TCE')),
      help,
    );
  }

  function buildVariantNote(cls) {
    if (cls.id === 'artificer') return null;
    const on = clsVariant(st) === 'tce';
    const tceLv = progRows(cls, 'tce').filter(r => r.feats.some(f => f.kind !== 'phb')).map(r => r.lvl);
    const hint = el('p', { class: 'cls-variant-hint' }, VARIANT_TOOLTIP);
    hint.hidden = true;
    return el('div', { class: 'cls-variant-notes' },
      hint,
      tceLv.length ? el('button', {
        class: 'cls-tce-toggle',
        onClick: () => {
          if (tceLv.some(l => l > 5)) progAll = true;
          rerender();
          detailEl.querySelector('[data-sec="prog"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, 'TCE меняет: ' + tceLv.join(' · ') + ' ур. — смотреть в таблице') : null,
      on ? el('p', { class: 'cls-variant-warn' }, 'Включён вариант TCE (Tasha\'s Cauldron of Everything) — уточни у Мастера, какой вариант используется.') : null,
    );
  }

  // ── ④E Развитие по уровням (ТЗ v0.27) ──
  function pickLevel(cls, r) {
    selLvl = r.lvl;
    const spec = { level: r, cls, title: `${r.lvl} уровень` };
    pinnedRule = spec;
    detailEl.querySelectorAll('[data-lvl]').forEach(n => n.classList.toggle('is-sel', +n.dataset.lvl === r.lvl));
    if (WIDE.matches) showRule(spec); else openRuleSheet(spec);
  }
  function buildProgressionSection(cls) {
    const v    = clsVariant(st);
    const rows = progRows(cls, v);
    const tceLv = cls.id === 'artificer' ? [] : progRows(cls, 'tce').filter(r => r.feats.some(f => f.kind !== 'phb')).map(r => r.lvl);
    const cols = PROG_COLS[cls.id] || [];
    const shown = progAll ? rows : rows.slice(0, 5);
    const featEls = r => r.feats.length
      ? r.feats.flatMap((f, i) => [i ? el('span', { class: 'cls-prog-sep' }, ', ') : null,
          el('span', { class: 'cls-prog-f is-' + f.kind, title: f.kind === 'gone' ? (f.replacedBy ? `Заменено на «${f.replacedBy}»` : 'Нет в версии TCE') : '' }, f.name)])
      : [el('span', { class: 'cls-prog-f is-none' }, '—')];
    const rowCls = r => (selLvl === r.lvl ? ' is-sel' : '') + (v === 'tce' && tceLv.includes(r.lvl) ? ' has-tce' : '');
    const table = el('table', { class: 'cls-prog' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Ур.'), el('th', { title: 'Бонус мастерства' }, 'БМ'), el('th', {}, 'Умения'),
        ...cols.map(c => el('th', { class: 'cls-prog-num' }, c)))),
      el('tbody', {}, ...shown.map(r => {
        const tr = el('tr', { class: 'cls-prog-row' + rowCls(r), tabindex: '0', 'data-lvl': String(r.lvl), onClick: () => pickLevel(cls, r) },
          el('td', { class: 'cls-prog-lv' }, String(r.lvl)),
          el('td', { class: 'cls-prog-pb' }, r.pb),
          el('td', { class: 'cls-prog-feats' }, ...featEls(r)),
          ...r.vals.map(x => el('td', { class: 'cls-prog-num' }, x)));
        tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickLevel(cls, r); } });
        return tr;
      })),
    );
    // Мобиле — список строк вместо таблицы
    const list = el('div', { class: 'cls-prog-list' }, ...shown.map(r =>
      el('button', { class: 'cls-prog-item' + rowCls(r), 'data-lvl': String(r.lvl), onClick: () => pickLevel(cls, r) },
        el('span', { class: 'cls-prog-item-hd' },
          el('span', { class: 'cls-prog-item-lv' }, r.lvl + ' ур.'),
          el('span', { class: 'cls-prog-item-meta' }, [r.pb, ...cols.map((c, i) => `${c} ${r.vals[i]}`)].join(' · '))),
        el('span', { class: 'cls-prog-item-feats' }, ...featEls(r)))));
    const laterTce = tceLv.filter(l => l > 5);
    return el('section', { class: 'cls-sec', 'data-sec': 'prog' },
      el('div', { class: 'cls-sec-hd' }, 'Развитие по уровням',
        v === 'tce' ? el('span', { class: 'cls-prog-legend' }, el('span', { class: 'cls-prog-f is-tce' }, 'золотом — TCE'), ' · ', el('span', { class: 'cls-prog-f is-gone' }, 'заменено')) : null),
      el('p', { class: 'cls-choice-hint' }, 'Нажмите на уровень, чтобы увидеть все его умения.'),
      table, list,
      !progAll ? el('div', { class: 'cls-prog-more' },
        el('button', { class: 'cls-prog-all', onClick: () => { progAll = true; rerender(); } }, 'Показать все 20 уровней'),
        laterTce.length ? el('span', { class: 'cls-prog-more-tce' }, 'ещё TCE: ' + laterTce.join(', ') + ' ур.') : null)
        : el('div', { class: 'cls-prog-more' },
            el('button', { class: 'cls-prog-all', onClick: () => { progAll = false; rerender(); } }, 'Свернуть до 5 уровня')),
    );
  }

  // ── ④ Особенности и выборы 1-го уровня ──
  function buildLvl1Section(cls) {
    const v  = clsVariant(st);
    const cc = st.mecClassChoices;
    const blocks = [];

    if (cls.id === 'fighter') {
      const styles = clsStylesFor(v);
      blocks.push(choiceBlock('fighting_style', 'Боевой стиль', 'Пассивная техника боя — работает всю игру автоматически.',
        el('div', { class: 'cls-opt-grid' }, ...styles.map(s => {
          const on = cc.fighting_style === s.name;
          const spec = { key: 'style:' + s.name, title: s.name, short: s.desc };
          const nameEl = el('span', { class: 'cls-opt-name' }, (on ? '✓ ' : '') + s.name, s.source === 'TCE' ? srcBadge('TCE') : null);
          const card = el('button', {
            class: 'cls-opt' + (on ? ' is-on' : ''),
            onClick: () => {
              pinnedRule = spec;
              if (on) { showRule(spec); return; }
              cc.fighting_style = s.name;
              if (s.name !== 'Превосходная техника') delete cc.maneuver;
              save(); rerender();
            },
          }, nameEl, el('span', { class: 'cls-opt-desc' }, s.desc));
          nameEl.append(ruleHook(card, spec));
          return card;
        })),
      ));
      if (cc.fighting_style === 'Превосходная техника' && v === 'tce') {
        const pick = cc.maneuver ? [cc.maneuver] : [];
        const onPick = arr => { cc.maneuver = arr[0] || null; save(); rerender(); };
        const mRule = o => ({ key: 'maneuver:' + o, title: o });
        blocks.push(blockRule(choiceBlock('maneuver', 'Приём мастера боевых искусств',
          'Один особый приём и одна кость превосходства (к6), которая восстанавливается на отдыхе.',
          el('div', { class: 'cls-chip-group' }, 'Книга игрока'),
          multiChips(MANEUVERS.PHB, pick, 1, onPick, new Map(), mRule),
          el('div', { class: 'cls-chip-group' }, 'Котёл Таши'),
          multiChips(MANEUVERS.TCE, pick, 1, onPick, new Map(), mRule),
        ), { key: 'style:Превосходная техника', title: 'Превосходная техника', short: 'Один приём мастера боевых искусств и одна кость превосходства к6.' }));
      }
    }

    if (cls.id === 'ranger' && v === 'phb') {
      const fe = cc.favored_enemy || { mode: 'type' };
      const setFe = next => {
        cc.favored_enemy = next;
        save(); rerender();
      };
      const modeBtn = (mode, label) => el('button', {
        class: 'cls-mode-btn' + (fe.mode === mode ? ' is-on' : ''),
        onClick: () => { if (fe.mode !== mode) { delete cc.favored_enemy_language; setFe({ mode }); } },
      }, label);
      const body = fe.mode === 'humanoids'
        // Решение заказчика 2026-09-27: без своего списка рас — свободный ввод, подсказка — пример с dnd.su
        ? [el('p', { class: 'cls-choice-sub' }, 'Впишите две гуманоидные расы (например, гноллов и орков):'),
           el('div', { class: 'cls-hum-inputs' }, ...[0, 1].map(i => {
             const inp = el('input', { class: 'cnew-input cls-hum-input', type: 'text', placeholder: i ? 'Вторая раса' : 'Первая раса' });
             inp.value = (fe.races || [])[i] || '';
             inp.addEventListener('input', () => {
               const races = [...(cc.favored_enemy?.races || ['', ''])];
               races[i] = inp.value;
               const was = clsEnemySpeaks(cc.favored_enemy);
               cc.favored_enemy = { mode: 'humanoids', races };
               save();
               if (was !== clsEnemySpeaks(cc.favored_enemy)) rerender(); else refreshStatus();
             });
             return inp;
           }))]
        : [multiChips(FAVORED_ENEMY_TYPES.map(t => t.name), fe.type ? [fe.type] : [], 1,
            arr => setFe({ mode: 'type', type: arr[0] || null }))];
      const feRule = { key: 'feat:Следопыт:ИЗБРАННЫЙ ВРАГ', title: 'Избранный враг', short: 'Против кого ваш персонаж особенно опасен: его легче выследить и о нём больше знаешь.' };
      blocks.push(blockRule(choiceBlock('favored_enemy', 'Избранный враг', feRule.short,
        el('div', { class: 'cls-mode' }, modeBtn('type', 'Тип существ'), modeBtn('humanoids', 'Две расы гуманоидов')),
        ...body,
      ), feRule));
      const speaks = clsEnemySpeaks(cc.favored_enemy);
      if (speaks === 'yes' || speaks === 'maybe') {
        blocks.push(choiceBlock(speaks === 'yes' ? 'favored_enemy_language' : null,
          'Язык избранного врага' + (speaks === 'maybe' ? ' (необязательно)' : ''),
          'Когда вы получаете это умение, вы также обучаетесь одному из языков, на котором говорит ваш избранный враг, если он вообще умеет говорить.', // dnd.su
          langSelect(cc.favored_enemy_language, val => { cc.favored_enemy_language = val; save(); refreshStatus(); }),
        ));
        blockRule(blocks[blocks.length - 1], feRule);
      }
      const neRule = { key: 'feat:Следопыт:ИССЛЕДОВАТЕЛЬ ПРИРОДЫ', title: 'Исследователь природы', short: 'Где ваш персонаж как дома: там он не плутает и находит больше припасов.' };
      blocks.push(blockRule(choiceBlock('favored_terrain', 'Избранная местность', neRule.short,
        multiChips(FAVORED_TERRAINS, cc.favored_terrain ? [cc.favored_terrain] : [], 1,
          arr => { cc.favored_terrain = arr[0] || null; save(); rerender(); }),
      ), neRule));
    }
    if (cls.id === 'ranger' && v === 'tce') {
      blocks.push(infoCard('Предпочтительный противник', 'Заменяет «Избранного врага». Выбирать ничего не нужно: в бою вы отмечаете цель и наносите ей дополнительный урон.', 'feat:Следопыт:Предпочтительный противник'));
      blocks.push(infoCard('Искусный исследователь', 'Заменяет «Исследователя природы». Компетентность в одном навыке и 2 языка. ' + EXPERTISE_TEASER, 'feat:Следопыт:Искусный исследователь'));
    }
    if (cls.id === 'rogue') {
      blocks.push(infoCard('Компетентность', 'Два навыка (или навык и воровские инструменты), в которых вы особенно хороши. ' + EXPERTISE_TEASER));
    }

    const feats = clsLvl1FeatureNames(cls.name, v);
    const hasChoices = blocks.length > 0;
    return el('section', { class: 'cls-sec' },
      el('div', { class: 'cls-sec-hd' }, 'Особенности и выборы 1-го уровня'),
      feats.length
        ? el('div', { class: 'cls-feat-line' },
            el('span', { class: 'cls-prof-label' }, 'Получаете автоматически'),
            el('div', { class: 'cls-feat-chips' }, ...feats.map(f => el('span', { class: 'cls-feat' }, f))))
        : null,
      ...blocks,
      !hasChoices && !clsSubclassList(st)
        ? el('p', { class: 'cls-choice-hint' }, 'На 1 уровне больше выбирать нечего — особенности работают сами.')
        : null,
    );
  }

  // ── ⑤ Подкласс ──
  function buildSubclassNested(sub) {
    const out = [];
    const sc = st.mecSubclassChoices;
    const classSkills = new Set(st.mecChosen || []);
    sub.choices.forEach(c => {
      const cur = clsSubChoice(st, c.id);
      const set = arr => { sc[c.id] = arr; save(); rerender(); };
      let body;
      if (c.from === '@language') {
        body = multiChips(LANGUAGES, cur, c.n, set);
      } else if (c.from === '@weapon') {
        const sel = el('select', { class: 'mech-bg-select' },
          el('option', { value: '' }, '— не выбрано —'),
          ...clsHexWeaponOptions().map(w => el('option', { value: w }, w)));
        sel.value = cur[0] || '';
        sel.addEventListener('change', () => { sc[c.id] = sel.value ? [sel.value] : []; save(); });
        body = sel;
      } else {
        const blocked = new Map();
        if (c.id === 'skills') c.from.forEach(o => { if (classSkills.has(o)) blocked.set(o, 'навык класса'); });
        body = multiChips(c.from, cur, c.n, set, blocked);
      }
      const hint = c.optional
        ? 'Необязательно при создании: оружие можно сменить после продолжительного отдыха.'
        : c.expertise ? 'Эти навыки вы получаете с компетентностью — удвоенным бонусом мастерства.' : null;
      out.push(choiceBlock(c.optional ? null : 'sub_' + c.id,
        c.label + (c.n > 1 ? ` — выберите ${c.n}` : '') + (c.optional ? ' (необязательно)' : ''), hint, body));
    });
    (sub.spellStepNote || []).forEach(n =>
      out.push(el('p', { class: 'cls-choice-hint' }, `${n} — выберете на шаге «Заклинания».`)));
    return out;
  }

  /** Подзаголовок группы подклассов: полное название книги + код, тултип с описанием книги (ТЗ v0.26). */
  function subGroupHeader(code) {
    const inf = subSourceInfo(code);
    const h = el('div', { class: 'cls-sub-group' },
      el('span', { class: 'cls-sub-group-name' }, inf.name),
      code ? el('span', { class: 'cls-sub-group-code' }, code) : null);
    if (inf.desc) {
      h.addEventListener('mouseenter', e => showSrcTip(e, { name: inf.name, desc: inf.desc }));
      h.addEventListener('mouseleave', hideSrcTip);
    }
    return h;
  }

  /** Единая карточка подкласса для режимов A и B (решение @designer, ТЗ v0.26): маркер · название · описание, без бейджа. */
  function subCard({ name, desc, on, mode, onPick, spec, extra = [] }) {
    const marker = mode === 'A'
      ? el('span', { class: 'cls-sub-radio' }, on ? '●' : '○')
      : el('span', { class: 'cls-sub-mark' + (on ? ' is-on' : '') }, on ? '★ намечено' : '☆ наметить');
    const hd = el('button', { class: 'cls-sub-hd', 'aria-pressed': on ? 'true' : 'false',
      onClick: () => { pinnedRule = spec; onPick(); } },
      mode === 'A' ? marker : null,
      el('span', { class: 'cls-opt-name' }, name),
      mode === 'B' ? marker : null,
    );
    const card = el('div', { class: 'cls-sub' + (on ? ' is-on' : '') },
      el('div', { class: 'cls-sub-top' }, hd),
      desc ? el('p', { class: 'cls-opt-desc' }, desc) : null,
      ...extra,
    );
    card.querySelector('.cls-sub-top').append(ruleHook(card, spec));
    return card;
  }

  function buildSubclassSection(cls) {
    const subs = clsSubclassList(st);
    if (subs) {
      const lbl = SUBCLASS_PICK_LABEL[cls.id];
      return el('section', { class: 'cls-sec', 'data-ck': 'subclass' },
        el('div', { class: 'cls-sec-hd' }, lbl.title, el('span', { class: 'cls-sec-req' }, 'обязательно')),
        el('p', { class: 'cls-choice-hint' }, 'Это ключевой выбор, который определяет вашу магию с первого уровня. ' + lbl.pick + '.'),
        ...groupBySource(subs, s => s.source).flatMap(([code, arr]) => [
          subGroupHeader(code),
          el('div', { class: 'cls-sub-list' }, ...arr.map(s => {
            const on = st.mecSubclass === s.id;
            const lines = clsGrantLines(s.grants);
            const extra = [
              s.dmOnly ? el('p', { class: 'cls-sub-dm' }, 'Вариант из Руководства Мастера для злодеев — только с разрешения Мастера.') : null,
            ];
            if (on) extra.push(
              lines.length ? el('div', { class: 'cls-sub-gives' },
                el('span', { class: 'cls-prof-label' }, 'Что даёт на 1 уровне'),
                el('ul', {}, ...lines.map(l => el('li', {}, l)))) : null,
              ...buildSubclassNested(s),
            );
            return subCard({
              name: s.name, desc: s.desc, on, mode: 'A', extra,
              spec: { key: 'sub:' + s.id, title: s.name, short: s.desc, lines },
              onPick: () => {
                if (on) { showRule(pinnedRule); return; }
                st.mecSubclass = s.id;
                st.mecSubclassChoices = {};
                save(); rerender();
              },
            });
          })),
        ]),
      );
    }
    // Режим B — предпросмотр
    const lvl = SUBCLASS_LEVEL[cls.id] || 3;
    const list = Object.entries(SUBCLASS_DESCRIPTIONS).filter(([, d]) => d.class === cls.name);
    if (!list.length) return null;
    const codeOf = ([, d]) => SOURCES.find(s => s.id === d.sourceId)?.code || '';
    const det = el('details', { class: 'cls-sec cls-sub-preview' },
      el('summary', { class: 'cls-sec-hd' }, 'Уже думаете о специализации? ▾'),
      el('p', { class: 'cls-choice-hint' },
        `Подкласс выбирается на ${lvl}-м уровне. Здесь можно наметить направление — это ни к чему не обязывает.`),
      ...groupBySource(list, codeOf).flatMap(([code, arr]) => [
        subGroupHeader(code),
        el('div', { class: 'cls-sub-list' }, ...arr.map(([name, d]) => {
          const on = st.mecSubclassPreview === name;
          return subCard({
            name, desc: d.description, on, mode: 'B',
            spec: { key: `subprev:${cls.name}:${name}`, title: name, short: d.description },
            onPick: () => { st.mecSubclassPreview = on ? null : name; save(); rerender(); },
          });
        })),
      ]),
    );
    if (st.mecSubclassPreview) det.open = true;
    return det;
  }

  function updateDetail() {
    detailEl.innerHTML = '';
    const cls = CLASS_DATA.find(c => c.id === st.mecClass);
    if (!cls) {
      checklistEl = null;
      detailEl.append(el('p', { class: 'mech-cls-ph' }, 'Выберите класс'));
      return;
    }
    const badges = cls.roles.map(role => {
      const b = el('span', { class: 'mech-cls-role' }, role);
      b.addEventListener('mouseenter', e => showSrcTip(e, { name: role, desc: ROLE_DESC[role] }));
      b.addEventListener('mouseleave', hideSrcTip);
      return b;
    });
    checklistEl = el('div', { class: 'cls-checklist', role: 'status' });
    renderChecklist();

    detailEl.append(
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, cls.name),
        buildVariantSwitch(cls),
        el('div', { class: 'mech-cls-roles' }, ...badges),
      ),
      buildVariantNote(cls),
      checklistEl,
      el('p', { class: `mech-cls-rp rp-${cls.rp}` }, rpLabel(cls)),
      el('p', { class: 'mech-cls-rp rp-1' }, 'Ключевые характеристики: ' + cls.stats),
      el('p', { class: 'mech-cls-desc' }, cls.desc),
      buildProgressionSection(cls),
      buildProfBlock(cls),
      buildSkillBlock(),
      buildLvl1Section(cls),
      buildSubclassSection(cls),
    );
    showRule(pinnedRule);
  }

  function updateList() {
    listEl.innerHTML = '';
    // All classes are always shown, regardless of mecSources — the class list isn't
    // gated by sourcebook selection (that flow is deferred, see docs/plans). A class
    // sourced from a supplement just carries a `tag` badge with a tooltip naming it.
    // Tagged (non-core) classes sort after the core alphabetical list — better UX
    // than slotting Изобретатель alphabetically among the PHB classes.
    const visible = CLASS_DATA
      .slice()
      .sort((a, b) => {
        if (!!a.tag !== !!b.tag) return a.tag ? 1 : -1;
        return a.name.localeCompare(b.name, 'ru');
      });
    visible.forEach(cls => {
      let tagEl = null;
      if (cls.tag) {
        const srcObj = (SOURCEBOOKS['5e'] || []).find(s => s.id === cls.tag);
        tagEl = el('span', { class: 'mech-cls-tag' }, cls.tag);
        if (srcObj) {
          tagEl.addEventListener('mouseenter', e => showSrcTip(e, srcObj));
          tagEl.addEventListener('mouseleave', hideSrcTip);
        }
      }
      const btn = el('button', {
        class: `mech-cls-item${st.mecClass === cls.id ? ' is-selected' : ''}`,
        onClick: () => {
          // ТЗ 4.4.2 «Смена класса»: сбрасываются все зависимые выборы
          if (st.mecClass !== cls.id) { clsResetForNewClass(st); pinnedRule = null; progAll = false; selLvl = null; }
          st.mecClass = cls.id;
          scheduleSave(st);
          listEl.querySelectorAll('.mech-cls-item').forEach(b =>
            b.classList.toggle('is-selected', b.dataset.id === cls.id)
          );
          detailEl.scrollTop = 0;
          updateDetail();
          updateFoot();
          placeDetail();
          if (mq.matches) btn.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
        cls.name,
        tagEl,
      );
      btn.dataset.id = cls.id;
      listEl.append(btn);
    });
  }

  // Мобиле (ТЗ 4.4.3 «Мобильная вёрстка», относится и к шагу Класс): одна прокрутка страницы,
  // панель детали раскрывается аккордеоном под выбранной строкой списка.
  const layoutEl = el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl);
  const mq = window.matchMedia('(max-width: 600px)');
  function placeDetail() {
    if (mq.matches) {
      const selBtn = listEl.querySelector('.mech-cls-item.is-selected');
      if (selBtn) selBtn.after(detailEl);
      else listEl.after(detailEl);
    } else if (detailEl.parentElement !== layoutEl) {
      layoutEl.insertBefore(detailEl, rulesEl.parentElement === layoutEl ? rulesEl : null);
    }
  }
  mq.addEventListener('change', placeDetail);
  // Панель «Правило» — третья колонка только на ≥1200 px; уже — шторка по «ⓘ»
  function placeRules() {
    if (WIDE.matches) { layoutEl.append(rulesEl); layoutEl.classList.add('has-rules'); }
    else { rulesEl.remove(); layoutEl.classList.remove('has-rules'); }
  }
  WIDE.addEventListener('change', placeRules);
  placeRules();

  updateList();
  updateDetail();
  updateFoot();
  placeDetail();

  return el('div', { class: 'mech-step-body is-cls' },
    el('h2', { class: 'mech-step-title' }, 'Выберите класс'),
    layoutEl,
    footEl,
  );
}

// ─── Race data ────────────────────────────────────────────────────────────────

const RACE_DATA = {
  // 2026-09-27 (заказчик): расы не из PHB удалены из данных — в них были ошибки и выдуманные записи
  // (docs/reviews/2026-09-27_dndsu-content-audit.md). Будут заведены заново по dnd.su.
  PHB: [
    { name: 'Дварф',      sub: ['Горный', 'Холмовой'],       desc: 'Стойкий подземный народ с многовековой традицией кузнечного дела и горной добычи. Непоколебимы в бою, верны клану и слову.' },
    { name: 'Эльф',       sub: ['Высший', 'Лесной', 'Тёмный эльф (дроу)'], desc: 'Долгоживущий изящный народ с врождённой связью с магией. Острые чувства, природная грация и глубокая память делают эльфов превосходными магами и лучниками.' },
    { name: 'Полурослик', sub: ['Легконогий', 'Коренастый'], desc: 'Небольшой, но бесстрашный народ. Природная удача и умение оставаться в тени помогают им выходить из самых сложных переделок.' },
    { name: 'Человек',    sub: ['Стандартный', 'Альтернативный'],   desc: 'Самая распространённая и разнообразная раса. Люди быстро учатся и адаптируются, нередко превосходя другие народы за счёт амбиций.' },
    { name: 'Драконорождённый', sub: [],                     desc: 'Гордый народ с чешуёй и кровью дракона. Наделены оружейным дыханием и врождённой устойчивостью к стихиям.' },
    { name: 'Гном',       sub: ['Лесной', 'Скальный'],       desc: 'Любопытный изобретательный народ, живущий столетиями. Прирождённые учёные и механики с природной устойчивостью к магии.' },
    { name: 'Полуэльф',   sub: [],                           desc: 'Наследники двух миров — человеческой гибкости и эльфийской грации. Харизматичны, универсальны и умеют ладить с кем угодно.' },
    { name: 'Полуорк',    sub: [],                           desc: 'Потомки людей и орков, наследующие выносливость обоих. Физически мощны и не уступают там, где другие давно сложили бы оружие.' },
    { name: 'Тифлинг',   sub: [],                           desc: 'Потомки людей с инфернальным наследием от давнего дьявольского договора. Несмотря на предрассудки, многие тифлинги куют собственную судьбу.' },
  ],
};

// ─── Background data ──────────────────────────────────────────────────────────

const LANGUAGES     = ['Бездны','Великанский','Гномский','Гоблинский','Глубокая речь','Дварфский','Драконий','Инфернальный','Небесный','Орочий','Первозданный','Полуросликов','Сильван','Общий Подземья','Эльфийский'];
// PHB (2014) feats, for the race-trait "choose one feat" selector (Alternate/Variant Human).
const PHB_FEATS = FEATS.map(f => f.name);   // 42 черты PHB — js/data/feats.js (dnd.su, генератор tools/gen_dndsu_extras.py)
const INSTRUMENTS   = ['Барабан','Виола','Волынка','Лира','Лютня','Рог','Скрипка','Флейта','Цимбалы','Шалмей'];
const SIMPLE_WEAPONS = ['Булава','Дубина','Дротик','Жезл','Копьё','Кинжал','Кулак друида','Лёгкий арбалет','Посох','Праща','Ручной арбалет','Серп','Топор дровосека'];
const GAMING_SETS = ['Игральные кости','Карты','Три Дракона Анти','Шахматы Дракона'];
const ARTISAN_TOOLS = ['Инструменты алхимика','Инструменты бондаря','Инструменты гончара','Инструменты кожевника','Инструменты кузнеца','Инструменты каллиграфа','Инструменты каменщика','Инструменты плотника','Инструменты повара','Инструменты пивовара','Инструменты резчика','Инструменты сапожника','Инструменты стеклодува','Инструменты ткача','Инструменты ювелира'];

// Class-level "pick a tool" proficiency choices (distinct from CLASS_PROF_DATA.tools,
// which only displays the fixed/descriptive proficiency text). See docs/reviews/
// 2026-09-10_class-screen-feedback.md and the 2026-09-10 re-review — Изобретатель needs
// a 3rd (chosen) artisan tool on top of thieves'/tinker's tools; Монах needs a single
// artisan-or-musical choice, shown as two grouped option lists (not one flat merged list);
// Бард needs 3 independent musical-instrument picks ("три музыкальных инструмента на выбор").
//
// ⚠️ 2026-09-12: this used to render as `count` independent <select> elements (via
// makeChoiceSel), each defaulting to `opts[0]` when unset — so on a fresh Bard all three
// dropdowns silently showed the same instrument ("Барабан") with nothing forcing the player
// to actually change any of them, which reads as "the selectors are broken/linked" even
// though each one *did* write to its own state key. Replaced with `buildBgMultiSel` (the
// same chip-style multi-pick widget the background step already uses for e.g. "Язык × 2"):
// it starts with nothing pre-selected, can't select the same item twice, and its result is
// now actually consumed downstream (see `mecClassToolChoice` in buildFinalStep / pdf.js) —
// previously the picked value was written to `st.mecEquipChoices['cls_tool_...']` but never
// read back anywhere, so the choice had no effect on the final sheet or PDF either way.
const CLASS_TOOL_CHOICE = {
  bard:      { label: 'Музыкальный инструмент', type: 'instrument', count: 3 },
  artificer: { label: 'Ремесленный инструмент (на выбор)', type: 'artisan', count: 1 },
  monk:      { label: 'Инструмент (на выбор)', groups: [
                 { label: 'Инструменты ремесла',     type: 'artisan' },
                 { label: 'Музыкальные инструменты', type: 'instrument' },
               ] },
};

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

// 2026-09-26 (заказчик): выбор типа instrument / artisan / gaming в `choices` — это ВЛАДЕНИЕ
// (умение пользоваться), выбирается на экране предыстории и хранится в st.mecBgChoiceData[ci]
// как ['<type>::<значение>']. Если книга ВДОБАВОК кладёт такой инструмент в стартовое снаряжение,
// у выбора есть `item`:
//   item: {}                 — предмет выбирается на шаге «Снаряжение» из того же списка
//                              (по умолчанию — тот, которым персонаж владеет), хранится в
//                              st.mecEquipChoices['bgch_<type>'] и на владение НЕ влияет;
//   item: { list: [...] }    — предмет из своего списка (Солдат: кости или карты);
//   item: { extra: [...] }   — к списку добавляются варианты (Гладиатор: трезубец, сеть);
//   item: { same: true }     — предмет = инструмент, которым владеет («…with which you are
//                              proficient», SCAG), отдельного выбора нет.
// Без `item` — только владение, в снаряжение ничего не попадает (Благородный, Преступник, Чужеземец).
const BACKGROUND_DATA = {
  // 2026-09-27 (заказчик): предыстории не из PHB удалены из данных — названия, навыки и снаряжение расходились с dnd.su
  // (docs/reviews/2026-09-27_dndsu-content-audit.md). Будут заведены заново по dnd.su.
  PHB: [
    {
      name: 'Прислужник',
      skills: 'Проницательность, Религия',
      equipment: 'Священный символ (подаренный вам в момент принятия священного сана), молитвенник или молитвенный барабан, 5 палочек благовоний, ряса, комплект обычной одежды, поясной кошель с 15 зм', // dnd.su 2026-09-27

      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы провели годы, служа в храме — помогали жрецам проводить ритуалы, ухаживали за святилищем и наставляли верующих. Годы смиренного служения сформировали вашу веру, и теперь вы несёте свет избранного пантеона в широкий мир. Боги вашего храма готовы бесплатно оказывать вам лечебную помощь, а вы можете найти пристанище в любом храме, связанном с вашей верой.',
    },
    {
      name: 'Артист',
      skills: 'Акробатика, Выступление',
      equipment: 'Музыкальный инструмент (на ваш выбор), подарок от поклонницы (любовное письмо, локон волос или безделушка), костюм, поясной кошель с 15 зм', // dnd.su 2026-09-27
      tools: ['Набор для грима'],
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1, item: {} }],
      desc: 'Вы умеете привлекать к себе внимание и развлекать толпу. Музыка, акробатика, поэзия или театральное искусство — вы мастер своего дела. Выступая в тавернах, на ярмарках и при дворах знати, вы завоевали поклонников и связи. Артисты и развлекатели могут принять вас и оказать помощь, а публика охотно бросает монеты к вашим ногам.',
    },
    {
      name: 'Гладиатор',
      skills: 'Акробатика, Выступление',
      equipment: 'Музыкальный инструмент (на ваш выбор) или недорогое, но необычное оружие, такое как трезубец или сеть, подарок от поклонницы (любовное письмо, локон волос или безделушка), костюм, поясной кошель с 15 зм', // dnd.su 2026-09-27
      tools: ['Набор для грима'],
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1, item: { extra: ['Трезубец', 'Сеть'] } }],
      desc: 'Вы сражались на потеху толпе — на аренах и в ямах для боёв, где публика жаждет крови и зрелища не меньше, чем музыки или стихов. Каждый ваш выход — представление: эффектный удар, дерзкая поза, заигрывание с трибунами. Артисты и владельцы арен готовы принять вас, а публика охотно бросает монеты к вашим ногам после удачного боя.',
    },
    {
      name: 'Беспризорник',
      skills: 'Ловкость рук, Скрытность',
      equipment: 'Маленький нож, карта города, в котором вы выросли, ручная мышь, безделушка в память о родителях, комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      tools: ['Воровские инструменты', 'Набор для грима'],
      choices: [],
      desc: 'Вы выросли на улицах города без семьи и крова, научившись выживать там, где другие погибли бы. Улица научила вас двигаться незаметно, находить пропитание и ценить каждое убежище. Вы знаете тайные ходы и переулки знакомого города, а среди уличного люда всегда найдёте кров и кусок хлеба в обмен на мелкую услугу.',
    },
    {
      name: 'Благородный',
      skills: 'История, Убеждение',
      equipment: 'Комплект отличной одежды, кольцо-печатка, свиток с генеалогическим древом, кошелёк с 25 зм', // dnd.su 2026-09-27
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли среди богатства, власти и привилегий. Ваша семья владеет землями, имеет авторитет при дворе и поколениями влияет на судьбы региона. Вы знаете придворный этикет, умеете вести себя среди знати и привыкли к тому, что люди обращают внимание на ваш титул. Ваши знакомства открывают двери туда, куда простолюдинам вход закрыт.',
    },
    {
      name: 'Рыцарь',
      skills: 'История, Убеждение',
      equipment: 'Комплект отличной одежды, кольцо-печатка, свиток с генеалогическим древом, кошелёк с 25 зм; можно добавить в снаряжение знамя или подарок от леди, которой вы вручили своё сердце', // dnd.su 2026-09-27
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли среди богатства, власти и привилегий, но ваше место в обществе связано не только с происхождением, но и с данной клятвой — служить сюзерену, ордену или идее. Вас обучали этикету, верховой езде и обращению с оружием, а за вами присматривают верные слуги, готовые сопровождать вас в путешествиях. Знакомства вашей семьи открывают двери туда, куда простолюдинам вход закрыт.',
    },
    {
      name: 'Гильдейский ремесленник',
      skills: 'Проницательность, Убеждение',
      equipment: 'Один вид ремесленных инструментов, рекомендательное письмо из гильдии, комплект дорожной одежды, поясной кошель с 15 зм', // dnd.su 2026-09-27
      choices: [{ label: 'Ремесленный инструмент', type: 'artisan', count: 1, item: {} }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы — опытный мастер своего ремесла и полноправный член торговой или ремесленной гильдии. Гильдия — ваша семья: она обеспечивает работу, защиту и социальные связи. В любом городе, где есть отделение вашей гильдии, вы можете рассчитывать на бесплатный ночлег и помощь соратников. Гильдия также поможет с юридической защитой, если дело дойдёт до суда.',
    },
    {
      name: 'Купец гильдии',
      skills: 'Проницательность, Убеждение',
      // dnd.su 2026-09-27, «Разновидность гильдейского ремесленника: гильдейский купец»: «Вместо владения ремесленным
      // инструментом вы можете овладеть инструментами навигатора или дополнительным языком. А вместо наличия ремесленных
      // инструментов вы можете начать игру с мулом и телегой.»
      equipment: 'Мул и телега, рекомендательное письмо из гильдии, комплект дорожной одежды, поясной кошель с 15 зм', // dnd.su 2026-09-27
      choices: [
        { label: 'Язык', type: 'language', count: 1 },
        { label: 'Инструменты навигатора или язык', type: 'nav_or_lang', count: 1, groups: [
          { label: 'Инструменты навигатора', type: 'fixed', value: 'Инструменты навигатора' },
          { label: 'Язык', type: 'language' },
        ] },
      ],
      desc: 'Вы — опытный торговец и полноправный член купеческой гильдии, ведущей дела в разных городах и странах. Караваны, склады и деловые связи — ваш мир. Гильдия — ваша семья: она обеспечивает работу, защиту и социальные связи. В любом городе, где есть отделение вашей гильдии, вы можете рассчитывать на бесплатный ночлег и помощь соратников. Гильдия также поможет с юридической защитой, если дело дойдёт до суда.',
    },
    {
      name: 'Шарлатан',
      skills: 'Обман, Ловкость рук',
      equipment: 'Комплект отличной одежды, набор для грима, приспособление для жульничества на ваш выбор (десять запечатанных бутылей с подкрашенной жидкостью, набор шулерских костей, колода краплёных карт или кольцо с печатью какого-нибудь воображаемого герцога), поясной кошель с 15 зм', // dnd.su 2026-09-27

      tools: ['Набор для грима', 'Набор для фальсификации'],
      choices: [],
      desc: 'Вы всегда умели видеть слабости людей и использовать их в своих целях. Фальшивые личности, ловкий язык, убедительная ложь — всё это ваши главные инструменты. Возможно, вы торговали поддельными снадобьями, продавали "уникальные реликвии" или просто обчищали карманы зазевавшихся богачей. У вас всегда есть запасная легенда, а подобные вам мошенники готовы укрыть вас и передать весточку без лишних вопросов.',
    },
    {
      name: 'Моряк',
      skills: 'Атлетика, Восприятие',
      equipment: 'Кофель-нагель (дубинка), 50 футов шёлковой верёвки, талисман, такой как кроличья лапка или камень с дыркой (можете совершить бросок по таблице безделушек), комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      tools: ['Инструменты навигатора', 'Транспорт (водный)'],
      choices: [],
      desc: 'Вы провели годы на море: на торговом судне, рыбацкой шхуне или военном корабле. Жизнь под парусом закалила тело, обострила чувства и научила работать в команде. Вы умеете читать ветер, предсказывать погоду и найдёте общий язык с любым моряком. В портовых городах вам без труда найдётся попутное судно, а морские кабаки встретят вас как своего.',
    },
    {
      name: 'Пират',
      skills: 'Атлетика, Восприятие',
      equipment: 'Кофель-нагель (дубинка), 50 футов шёлковой верёвки, талисман, такой как кроличья лапка или камень с дыркой (можете совершить бросок по таблице безделушек), комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      tools: ['Инструменты навигатора', 'Транспорт (водный)'],
      choices: [],
      desc: 'Вы бороздили моря под чёрным флагом — грабили торговые суда и делили добычу с командой, для которой закон был пустым звуком. Ваше имя внушает страх в портовых тавернах: буйная матросня предпочитает не связываться с человеком вашей репутации, а стражники нередко закрывают глаза на мелкие проступки, лишь бы не иметь с вами дела.',
    },
    {
      name: 'Мудрец',
      skills: 'История, Магия',
      equipment: 'Бутылочка чернил, писчее перо, небольшой нож, письмо от мёртвого коллеги с вопросом, на который вы пока не можете ответить, комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27

      choices: [{ label: 'Язык', type: 'language', count: 2 }],
      desc: 'Вы провели годы, погружённых в книги, свитки и манускрипты в поисках знаний о мире. Библиотеки, академии и архивы были вашим домом. Вы изучали историю, магию, естественные науки или богословие — а может быть, всё сразу. Другие учёные и исследователи готовы делиться с вами знаниями в обмен на ваши, а любая крупная библиотека, вероятно, хранит труды, к которым вы имеете доступ.',
    },
    {
      name: 'Народный герой',
      skills: 'Уход за животными, Выживание',
      equipment: 'Ремесленные инструменты (один вид на ваш выбор), лопата, железный горшок, комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      tools: ['Транспорт (наземный)'],
      choices: [{ label: 'Ремесленный инструмент', type: 'artisan', count: 1, item: {} }],
      desc: 'Вы — простой человек из простой семьи, но однажды судьба поставила вас перед выбором, и вы поступили правильно. Теперь люди из вашей деревни или округи смотрят на вас как на заступника и надеются, что вы защитите их от тирании и зла. Простые крестьяне и ремесленники рады помочь вам: спрятать, накормить, передать весть, — ведь вы один из них.',
    },
    {
      name: 'Отшельник',
      skills: 'Медицина, Религия',
      equipment: 'Контейнер для свитков, битком набитый вашими молитвами и изысканиями, тёплое одеяло, комплект обычной одежды, набор травника, 5 зм', // dnd.su 2026-09-27

      tools: ['Набор травника'],
      choices: [{ label: 'Язык', type: 'language', count: 1 }],
      desc: 'Долгие годы вы провели в уединении вдали от общества — в монастырской келье, лесной хижине или пещере. Одиночество давало вам время для размышлений, молитвы или исследований. Быть может, вы искали ответы на великие вопросы, бежали от преследования или несли суровое покаяние. Теперь за вами стоит открытие или понимание, изменившее ваш взгляд на мир.',
    },
    {
      name: 'Преступник',
      skills: 'Обман, Скрытность',
      equipment: 'Ломик, комплект обычной тёмной одежды с капюшоном, поясной кошель с 15 зм', // dnd.su 2026-09-27
      tools: ['Воровские инструменты'],
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'До приключений вы нарушали закон — и довольно успешно. Кражи, контрабанда, шантаж или убийства на заказ: у вас за плечами богатый опыт незаконной деятельности. Вы знаете, как связаться с фехтовальщиками краденого, скупщиками информации и другими преступниками. Члены воровских гильдий и уличных банд, как правило, относятся к вам с уважением — или по меньшей мере не мешают.',
    },
    {
      name: 'Шпион',
      skills: 'Обман, Скрытность',
      equipment: 'Ломик, комплект обычной тёмной одежды с капюшоном, поясной кошель с 15 зм', // dnd.su 2026-09-27
      tools: ['Воровские инструменты'],
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1 }],
      desc: 'До приключений вы работали на разведку — собирали сведения, вели наблюдение и передавали донесения тем, кто платил за информацию. Слежка, шифры и явочные квартиры — привычная часть вашей прошлой жизни. Вы знаете, как связаться с осведомителями, скупщиками информации и другими агентами. Люди из мира тайных служб и преступного подполья, как правило, относятся к вам с уважением — или по меньшей мере не мешают.',
    },
    {
      name: 'Чужеземец',
      skills: 'Атлетика, Выживание',
      equipment: 'Посох, капкан, трофей с убитого животного, комплект дорожной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      choices: [{ label: 'Муз. инструмент', type: 'instrument', count: 1 }, { label: 'Язык', type: 'language', count: 1 }],
      desc: 'Вы выросли вдали от цивилизации — в лесах, тундре, степях или горах. Дикая природа была вашим домом, а племя или семья — всем миром. Вы умеете выживать там, где городской житель обречён на гибель: находить пропитание, строить укрытие и ориентироваться без карт. Люди племён и охотники встретят вас как своего, если вы разделите их обычаи.',
    },
    {
      name: 'Солдат',
      skills: 'Атлетика, Запугивание',
      equipment: 'Знак отличия, трофей с убитого врага (кинжал, сломанный клинок или кусок знамени), набор игровых костей или колода карт, комплект обычной одежды, поясной кошель с 10 зм', // dnd.su 2026-09-27
      tools: ['Транспорт (наземный)'],
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1, item: { list: ['Игральные кости', 'Карты'] } }],
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
};

// ─── Race step ────────────────────────────────────────────────────────────────

function buildRaceStep(st, goMech) {
  const listEl   = el('div', { class: 'mech-cls-list' });
  const detailEl = el('div', { class: 'mech-cls-detail' });
  const footEl   = el('div', { class: 'mech-foot' });
  const ALL_SKILLS = Object.values(SKILLS_BY_AB).flat();

  function updateDetail() {
    detailEl.innerHTML = '';
    if (!st.mecRace) {
      detailEl.append(el('p', { class: 'mech-cls-ph' }, 'Выберите расу'));
      return;
    }
    const [srcId, raceName] = st.mecRace.split('::');
    const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
    if (!raceObj) return;
    const srcObj = (SOURCEBOOKS['5e'] || []).find(s => s.id === srcId);

    const badge = el('span', { class: 'mech-race-src-badge' }, srcId);
    if (srcObj) {
      badge.addEventListener('mouseenter', e => showSrcTip(e, srcObj));
      badge.addEventListener('mouseleave', hideSrcTip);
    }

    // ── Race desc lookup (must be before ASI block) ──
    const _rn = raceObj.name;
    const raceDesc = RACE_DESCRIPTIONS[_rn]
      || RACE_DESCRIPTIONS[RACE_DESC_ALIASES[_rn]]
      || RACE_DESCRIPTIONS[_rn.replace(' (Чистокровный)', '')]
      || RACE_DESCRIPTIONS[_rn.replace(/\s*\([^)]+\)$/, '')]; // strip any trailing (…) suffix

    // ── ASI block ──
    // 2026-09-11 (заказчик, UX-правка): бонус подрасы больше не показывается как
    // текст-заглушка "+ подраса" — вместо этого он подмешивается прямо сюда, в общий
    // блок «Бонусы», как только подраса выбрана. renderAsiBlock() пересчитывает блок
    // заново при каждом выборе подрасы (см. обработчик клика на кнопке подрасы ниже).
    const STAT_LABELS = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
    const asiBlock = el('div', { class: 'mech-race-asi' });

    // 2026-09-12 (заказчик, UX-правка v2): игрок отверг отдельный чип-пикер под «Бонусы» —
    // «нужно дать селектор внутри блока Бонусов. Примерно как выбор муз инструмента у Барда».
    // Теперь для Полуэльфа два свободных +1 (кроме уже зафиксированной +2 Харизмы) выбираются
    // прямо здесь, парой инлайновых <select>, в том же стиле, что и пикер муз. инструмента
    // барда на шаге снаряжения (классы equip-choice-sel/equip-choice-wrap/equip-choice-arrow).
    // Без пустого состояния — сразу подставляются первые две подходящие характеристики.
    const isHalfElf = raceObj.name === 'Полуэльф';

    function buildHalfElfAsiInline() {
      const pickable = ABILITIES.filter(a => a.key !== 'cha');
      let keys = Object.keys(st.mecHalfElfAsi || {});
      if (keys.length !== 2) {
        const defaults = pickable.slice(0, 2).map(a => a.key);
        st.mecHalfElfAsi = { [defaults[0]]: 1, [defaults[1]]: 1 };
        scheduleSave(st);
        keys = defaults;
      }
      const [a, b] = keys;
      function makeAbilitySel(current, otherKey, onPick) {
        const opts = pickable.filter(x => x.key !== otherKey);
        const sel = el('select', { class: 'equip-choice-sel' }, ...opts.map(x => el('option', { value: x.key }, x.label)));
        sel.value = current;
        sel.addEventListener('change', () => onPick(sel.value));
        return el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'));
      }
      return el('span', { class: 'mech-race-asi-choice' },
        el('span', { class: 'mech-race-asi-choice-pair' },
          el('span', { class: 'mech-race-asi-choice-plus' }, '+1'),
          makeAbilitySel(a, b, v => { st.mecHalfElfAsi = { [v]: 1, [b]: 1 }; scheduleSave(st); renderAsiBlock(); }),
        ),
        el('span', { class: 'mech-race-asi-choice-pair' },
          el('span', { class: 'mech-race-asi-choice-plus' }, '+1'),
          makeAbilitySel(b, a, v => { st.mecHalfElfAsi = { [a]: 1, [v]: 1 }; scheduleSave(st); renderAsiBlock(); }),
        ),
      );
    }

    function renderAsiBlock() {
      asiBlock.innerHTML = '';
      const baseAsi = STAT_RACE_ASI[raceObj.name] || raceDesc?.asi || {};
      let subAsi = {};
      if (st.mecSubrace && st.mecSubrace !== 'Альтернативный') {
        const sInfo = (raceDesc?.subraces || []).find(sd =>
          sd.name === st.mecSubrace || sd.name.includes(st.mecSubrace) || st.mecSubrace.includes(sd.name.split(' ')[0]));
        subAsi = sInfo?.asi || STAT_SUBRACE_ASI[st.mecSubrace] || {};
      }
      const merged = { ...baseAsi };
      Object.entries(subAsi).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; });
      const entries = Object.entries(merged);
      asiBlock.style.display = (entries.length || isHalfElf) ? '' : 'none';
      if (!entries.length && !isHalfElf) return;
      asiBlock.append(
        el('span', { class: 'mech-race-asi-label' }, 'Бонусы:'),
        ...entries.map(([k, v]) =>
          el('span', { class: 'mech-race-asi-badge' }, `${STAT_LABELS[k] || k} ${v > 0 ? '+' : ''}${v}`),
        ),
      );
      if (isHalfElf) asiBlock.append(buildHalfElfAsiInline());
    }
    renderAsiBlock();

    // ── Speed / Size / Languages chips ──
    // 2026-09-12 (заказчик): Лесной эльф больше не описывает возросшую скорость отдельной
    // чертой «Быстрые ноги» — вместо этого чип скорости наверху должен сам показывать
    // 35 фут. для этой подрасы. Поэтому чип скорости больше не статичен на весь рендер
    // расы — subrace.speed (если задан) переопределяет raceDesc.speed, и весь блок
    // пересчитывается при каждом переключении подрасы (см. renderStatsChips() ниже).
    const statsChipsEl = el('div', { class: 'mech-race-stats' });
    function renderStatsChips() {
      statsChipsEl.innerHTML = '';
      let speed = raceDesc?.speed;
      if (st.mecSubrace) {
        const sInfo = (raceDesc?.subraces || []).find(sd =>
          sd.name === st.mecSubrace || sd.name.includes(st.mecSubrace) || st.mecSubrace.includes(sd.name.split(' ')[0]));
        if (sInfo?.speed) speed = sInfo.speed;
      }
      const hasAny = speed || raceDesc?.size || raceDesc?.languages;
      statsChipsEl.style.display = hasAny ? '' : 'none';
      if (!hasAny) return;
      statsChipsEl.append(
        speed              ? el('span', { class: 'mech-race-stat-chip' }, `⚡ ${speed} фут.`) : null,
        raceDesc.size      ? el('span', { class: 'mech-race-stat-chip' }, `📐 ${raceDesc.size}`) : null,
        raceDesc.languages ? el('span', { class: 'mech-race-stat-chip mech-race-stat-chip--lang' }, `🗣 ${raceDesc.languages}`) : null,
      );
    }
    renderStatsChips();

    // ── Traits block (race traits + currently-selected subrace's traits, one list) ──
    // 2026-09-11 (заказчик): подрасовые черты (напр. «Ремесленные знания»/«Жестянщик» у
    // гнома) — это тоже расовые черты, поэтому выводятся в ТОМ ЖЕ списке «РАСОВЫЕ ЧЕРТЫ:»,
    // что и общие черты расы, а не отдельным блоком под описанием подрасы. Пересчитывается
    // через renderTraitsBlock() при каждом выборе подрасы, как и блок «Бонусы».
    // 2026-09-11: `text-in-backticks` inside trait text renders as monospaced <code>
    // (dice notation like `2к6`, DC formulas like `8 + модификатор Телосложения + бонус
    // мастерства`) so mechanical bits stand out from the surrounding prose.
    function renderInline(str) {
      return str.split(/`([^`]+)`/g)
        .filter(part => part !== '')
        .map((part, i) => i % 2 === 1 ? el('code', { class: 'mech-trait-formula' }, part) : part);
    }
    function buildTraitLi(t) {
      // 2026-09-11: t.text can be a string or an array of paragraphs (e.g. Dragonborn's
      // multi-paragraph "Оружие дыхания") — the first paragraph stays inline after the
      // title, the rest render as separate <p> blocks within the same trait item.
      const paragraphs = Array.isArray(t.text) ? t.text : [t.text];
      const li = el('li', { class: 'mech-race-trait-item' },
        el('span', { class: 'mech-race-trait-title' }, t.title + '. '),
        el('span', { class: 'mech-race-trait-text' }, ...renderInline(paragraphs[0])),
        ...paragraphs.slice(1).map(p => el('p', { class: 'mech-race-trait-text-p' }, ...renderInline(p))),
      );
      if (t.devices?.length) {
        // Reuses the existing subrace-picker button/text classes (mech-subrace-btns /
        // mech-subrace-btn / mech-subrace-desc-text) instead of new device-* classes,
        // since css/create-new.css isn't in this checkout to add matching rules to —
        // this way the picker is already styled on the user's machine, no CSS needed.
        // 2026-09-11: keyed by trait title in st.mecDeviceChoices (was a single shared
        // st.mecTinkerDevice field) so two different "choose one of N" traits — e.g. Gnome's
        // Жестянщик and Dwarf's Владение инструментами — never collide on the same key.
        if (!st.mecDeviceChoices) st.mecDeviceChoices = {};
        const devWrap = el('div', { class: 'mech-subrace-device-wrap' });
        // 2026-09-11: a device can be a plain { name, text } (e.g. Gnome's Жестянщик
        // options) or a structured { name, components, summary, checks[], dc[] } card
        // (e.g. Dwarf's tool proficiencies, ported from the ttg.club item pages) —
        // buildDeviceCard renders whichever shape is present instead of one flat <p>.
        function buildDeviceCard(d) {
          if (!d.checks && !d.dc && !d.components) {
            return el('p', { class: 'mech-subrace-desc-text' }, d.text);
          }
          return el('div', { class: 'mech-device-card' },
            d.summary ? el('p', { class: 'mech-device-summary' }, d.summary) : null,
            d.components ? el('p', { class: 'mech-device-components' },
              el('span', { class: 'mech-device-components-label' }, 'Состав: '), d.components) : null,
            d.checks?.length ? el('ul', { class: 'mech-device-checks' },
              ...d.checks.map(c => el('li', { class: 'mech-device-check-item' },
                el('span', { class: 'mech-device-check-label' }, c.label + '. '),
                c.text,
              )),
            ) : null,
            d.dc?.length ? el('ul', { class: 'mech-device-dc' },
              ...d.dc.map(x => el('li', { class: 'mech-device-dc-item' },
                el('span', { class: 'mech-device-dc-action' }, x.action),
                el('span', { class: 'mech-device-dc-value' }, 'Сл ' + x.value),
              )),
            ) : null,
          );
        }
        const renderDevices = () => {
          devWrap.innerHTML = '';
          // 2026-09-26: у обязательного выбора (required) не подставляем первый вариант —
          // иначе игрок видит подсвеченный «Белый», хотя ничего не выбирал.
          const current = t.devices.find(d => d.name === st.mecDeviceChoices[t.title])
            || (t.required ? null : t.devices[0]);
          devWrap.append(
            el('div', { class: 'mech-subrace-btns' },
              ...t.devices.map(d =>
                el('button', {
                  class: `mech-subrace-btn${current?.name === d.name ? ' is-selected' : ''}`,
                  onClick: () => {
                    st.mecDeviceChoices[t.title] = d.name;
                    scheduleSave(st);
                    renderDevices();
                    updateRaceFoot();
                  },
                }, d.name)
              ),
            ),
            current ? buildDeviceCard(current)
              : el('p', { class: 'mech-subrace-desc-text' }, 'Выберите вариант, чтобы продолжить.'),
          );
        };
        renderDevices();
        li.append(devWrap);
      }
      // 2026-09-12 (заказчик): «Универсальность навыков» и подобные черты дают владение
      // N навыками на выбор игрока (не привязано к списку класса — любой навык), поэтому
      // нужен собственный пул выбора, отдельный от st.mecChosen (черты класса). Переиспользует
      // готовую вёрстку/стили пикера навыков со шага класса (cls-skill-* классы), чтобы не
      // тянуть новый CSS — только новое состояние st.mecRaceSkills и свой счётчик по count.
      if (t.skillChoice) {
        if (!st.mecRaceSkills) st.mecRaceSkills = [];
        const count = t.skillChoice.count || 1;
        const pool  = t.skillChoice.list || ALL_SKILLS;
        const skillWrap = el('div', { class: 'cls-skill-block' });
        function renderSkillPicker() {
          skillWrap.innerHTML = '';
          // 2026-09-12 (заказчик): нужно показать (некликабельно) какие навыки уже даёт
          // класс — игрок иначе не поймёт, почему навык недоступен для выбора у расы.
          // Заодно подчищаем st.mecRaceSkills от навыков, которые СТАЛИ классовыми уже
          // после того, как игрок выбрал их у расы (например, вернулся на шаг класса и
          // поменял выбор) — иначе счётчик застрянет на «выбрано», хотя выбор больше не
          // валиден, и игрок не поймёт, почему кнопка «Далее» снова заблокирована.
          const classChosen = new Set(st.mecChosen || []);
          const cleaned = (st.mecRaceSkills || []).filter(s => !classChosen.has(s));
          if (cleaned.length !== (st.mecRaceSkills || []).length) {
            st.mecRaceSkills = cleaned;
            scheduleSave(st);
          }
          const chosen  = new Set(st.mecRaceSkills || []);
          const picks   = [...chosen].filter(s => pool.includes(s));
          const atLimit = picks.length >= count;
          const chips = [...pool].sort((a, b) => ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b)).map(name => {
            const isFromClass = classChosen.has(name);
            const isPicked    = chosen.has(name);
            const isDisabled  = isFromClass || (!isPicked && atLimit);
            const chip = el('button', {
              class: 'cls-skill-chip'
                + (isPicked ? ' is-picked' : '')
                + (isFromClass ? ' is-from-class' : '')
                + (isDisabled && !isFromClass ? ' is-dim' : ''),
              onClick: () => {
                if (isFromClass) return;
                const s = new Set(st.mecRaceSkills || []);
                if (isPicked) s.delete(name);
                else if (!atLimit) s.add(name);
                else return;
                st.mecRaceSkills = [...s];
                scheduleSave(st);
                renderSkillPicker();
                updateRaceFoot();
              },
            }, (isFromClass ? '🔒 ' : isPicked ? '✓ ' : '') + name + (isFromClass ? ' (класс)' : ''));
            chip.disabled = isDisabled;
            const colorVar = skillColorVar(name);
            if (colorVar) chip.style.setProperty('--chip-c', colorVar);
            return chip;
          });
          skillWrap.append(
            el('div', { class: 'cls-skill-block-header' },
              el('span', { class: 'cls-skill-block-title' }, 'Выберите навыки'),
              el('span', { class: 'cls-skill-counter' + (atLimit ? ' is-done' : '') }, `Выбрано навыков: ${picks.length} / ${count}`),
            ),
            el('div', { class: 'cls-skill-chips' }, ...chips),
          );
        }
        renderSkillPicker();
        li.append(skillWrap);
      }
      // 2026-09-12 (заказчик): черты типа «Дополнительный язык» (Человек) и «Черта»
      // (Альтернативный человек — feat на выбор) — простой выбор N вариантов из
      // фиксированного списка, без завязки на класс/предысторию. В отличие от навыков
      // (список большой и «пиковый» отбор нагляднее чипами), тут игрок выбирает
      // из готового списка — удобнее инлайновым <select>, как ASI-выбор у Полуэльфа,
      // с сразу подставленным значением по умолчанию (без блокировки «Далее»).
      // Э2 (ТЗ v0.29): заговор расы (Высший эльф) выбирается на шаге «Заклинания»
      if (t.choice?.type === 'spell') {
        li.append(el('p', { class: 'cls-choice-hint' }, 'Заговор выберете на шаге «Заклинания».'));
        return li;
      }
      if (t.choice) {
        if (!st.mecRaceChoices) st.mecRaceChoices = {};
        const count = t.choice.count || 1;
        // 2026-09-26: для языка исключаем языки, которые раса уже знает (Полуэльфу не
        // предлагаем Эльфийский, Высшему эльфу — Эльфийский и т.д.).
        const pool  = t.choice.list || (t.choice.type === 'feat' ? PHB_FEATS
          : LANGUAGES.filter(l => !mecRaceBaseLanguages(raceDesc).includes(l)));
        const key   = t.title;
        const choiceWrap = el('div', { class: 'mech-race-choice-selects' });
        function renderChoiceSelects() {
          choiceWrap.innerHTML = '';
          const saved = st.mecRaceChoices[key] || [];
          let picks = saved.filter(v => pool.includes(v));
          if (picks.length !== count || picks.length !== saved.length) {
            picks = pool.slice(0, count);
            st.mecRaceChoices[key] = picks;
            scheduleSave(st);
          }
          const selects = picks.map((val, idx) => {
            const otherPicks = picks.filter((_, i) => i !== idx);
            const opts = pool.filter(o => !otherPicks.includes(o));
            const sel = el('select', { class: 'equip-choice-sel' }, ...opts.map(o => el('option', { value: o }, o)));
            sel.value = val;
            sel.addEventListener('change', () => {
              const next = [...picks];
              next[idx] = sel.value;
              st.mecRaceChoices[key] = next;
              scheduleSave(st);
              renderChoiceSelects();
            });
            return el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'));
          });
          choiceWrap.append(...selects);
          // Э2: у черт с заклинаниями выбор заклинаний — на шаге «Заклинания»
          if (t.choice.type === 'feat' && picks.some(n => SPELL_FEATS[featIdByName(n)])) {
            choiceWrap.append(el('p', { class: 'cls-choice-hint' }, 'Заклинания черты выберете на шаге «Заклинания».'));
          }
        }
        renderChoiceSelects();
        li.append(choiceWrap);
      }
      return li;
    }

    const traitsBlockEl = el('div', { class: 'mech-race-traits' });
    function renderTraitsBlock() {
      traitsBlockEl.innerHTML = '';
      // 2026-09-12: this used to also skip 'Альтернативный' (was 'Вариант') the same way
      // renderAsiBlock's subAsi lookup does — but that ASI-only exclusion doesn't belong
      // here: Альтернативный now carries its own trait («Черта», feat choice) that must
      // still render. Only renderAsiBlock's subAsi (fixed +N by subrace) should skip it,
      // since Альтернативный's ASI is entirely player-chosen via mecVariantHumanAsi.
      const allTraits = mecActiveRaceTraits(raceObj.name, st.mecSubrace);
      traitsBlockEl.style.display = allTraits.length ? '' : 'none';
      if (!allTraits.length) return;
      traitsBlockEl.append(
        el('p', { class: 'mech-pr-section' }, 'Расовые черты:'),
        el('ul', { class: 'mech-race-trait-list' }, ...allTraits.map(buildTraitLi)),
      );
    }
    renderTraitsBlock();

    detailEl.append(
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, raceObj.name),
        badge,
      ),
      el('p', { class: 'mech-cls-desc' }, raceObj.desc),
      statsChipsEl,
    );

    // 2026-09-11 (заказчик, UX-правка): выбор подрасы — сразу под чипами скорости/размера/
    // языков, блок «Бонусы» — сразу под селектором подрасы (бонус подрасы уже подмешан
    // renderAsiBlock()), затем текст описания подрасы, и в самом низу — единый список
    // расовых черт (renderTraitsBlock()).
    let subraceDescEl = null;
    if (raceObj.sub.length) {
      const subraceDescs = raceDesc?.subraces || [];
      subraceDescEl = el('div', { class: 'mech-subrace-desc' });
      function updateSubraceDesc(s) {
        subraceDescEl.innerHTML = '';
        if (!s) return;
        const sInfo = subraceDescs.find(sd => sd.name === s || sd.name.includes(s) || s.includes(sd.name.split(' ')[0]));
        if (!sInfo) return;
        if (sInfo.description) subraceDescEl.append(el('p', { class: 'mech-subrace-desc-text' }, sInfo.description));

        // Special case: Variant human — ASI is player's choice, show interactive picker here
        // (its own +1/+1 picks are handled separately, not merged into the race ASI block)
        if (s === 'Альтернативный') {
          subraceDescEl.append(buildAsiChoicePicker('mecVariantHumanAsi', [], '+1 к двум характеристикам'));
        }
      }
      if (st.mecSubrace) updateSubraceDesc(st.mecSubrace);
      detailEl.append(
        el('p', { class: 'mech-pr-section' }, 'Подраса:'),
        el('div', { class: 'mech-subrace-btns' },
          ...raceObj.sub.map(s =>
            el('button', {
              class: `mech-subrace-btn${st.mecSubrace === s ? ' is-selected' : ''}`,
              onClick: () => {
                const prev = st.mecSubrace;
                st.mecSubrace = s;
                // Clear Variant Human bonus picks when switching away from Вариант
                if (prev === 'Альтернативный' && s !== 'Альтернативный') st.mecVariantHumanAsi = {};
                // 2026-09-26: навыки, выбранные по черте подрасы (Альтернативный → «Навык»),
                // не должны переживать смену подрасы — обрезаем до нового требуемого числа.
                const reqSkills = mecRequiredRaceSkillCount(raceObj.name, s);
                if ((st.mecRaceSkills || []).length > reqSkills) st.mecRaceSkills = (st.mecRaceSkills || []).slice(0, reqSkills);
                scheduleSave(st);
                detailEl.querySelectorAll('.mech-subrace-btn').forEach(b =>
                  b.classList.toggle('is-selected', b.textContent === s)
                );
                updateSubraceDesc(s);
                renderAsiBlock();
                renderStatsChips();
                renderTraitsBlock();
                updateRaceFoot();
              },
            }, s)
          ),
        ),
      );
    }

    detailEl.append(asiBlock);
    if (subraceDescEl) detailEl.append(subraceDescEl);
    detailEl.append(traitsBlockEl);
  }

  const _isVariantHuman = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Человек' && st.mecSubrace === 'Альтернативный';
  const _isHalfElf = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Полуэльф';

  // 2026-09-12: generalized "+1 to N abilities of your choice" picker — originally written
  // just for Variant Human's ASI, now reused for Half-Elf's two free +1s (which exclude
  // Харизма, already fixed at +2). Self-contained: owns its own wrapper and re-renders
  // itself on pick instead of the caller re-querying the DOM by class.
  function buildAsiChoicePicker(stateKey, excludeKeys, title) {
    const STAT_LABELS_ASI = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
    const wrap = el('div', { class: 'vh-asi-picker' });
    function render() {
      wrap.innerHTML = '';
      const chosen     = st[stateKey] || {};
      const chosenKeys = Object.keys(chosen);
      const needed     = 2 - chosenKeys.length;
      const hint = needed > 0 ? `Выберите ещё ${needed}` : '✓ Выбрано';
      const pickable = ABILITIES.filter(({ key }) => !excludeKeys.includes(key));

      const chips = pickable.map(({ key }) => {
        const isChosen = !!chosen[key];
        const canPick  = isChosen || chosenKeys.length < 2;
        const btn = el('button', {
          class: `vh-asi-chip${isChosen ? ' is-chosen' : ''}${!canPick ? ' is-disabled' : ''}`,
          onClick: () => {
            if (!st[stateKey]) st[stateKey] = {};
            if (isChosen) {
              delete st[stateKey][key];
            } else if (Object.keys(st[stateKey]).length < 2) {
              st[stateKey][key] = 1;
            }
            scheduleSave(st);
            render();
            updateRaceFoot();
          },
        }, isChosen ? `${STAT_LABELS_ASI[key]} +1` : STAT_LABELS_ASI[key]);
        btn.disabled = !canPick;
        return btn;
      });

      wrap.append(
        el('div', { class: 'vh-asi-header' },
          el('span', { class: 'vh-asi-title' }, title),
          el('span', { class: `vh-asi-hint${needed === 0 ? ' done' : ''}` }, hint),
        ),
        el('div', { class: 'vh-asi-chips' }, ...chips),
      );
    }
    render();
    return wrap;
  }

  function updateRaceFoot() {
    footEl.innerHTML = '';
    if (!st.mecRace) return;
    const [srcId, raceName] = st.mecRace.split('::');
    const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
    const needsSub = raceObj?.sub?.length > 0;
    const vhIncomplete = _isVariantHuman() && Object.keys(st.mecVariantHumanAsi || {}).length < 2;
    const heIncomplete = _isHalfElf() && Object.keys(st.mecHalfElfAsi || {}).length < 2;
    const requiredSkills = mecRequiredRaceSkillCount(raceName, st.mecSubrace);
    const skillsIncomplete = requiredSkills > 0 && (st.mecRaceSkills || []).length < requiredSkills;
    const missingDevices = mecMissingRequiredDevices(st);
    const blocked = (needsSub && !st.mecSubrace) || vhIncomplete || heIncomplete || skillsIncomplete
      || missingDevices.length > 0;
    const tipText = !st.mecSubrace && needsSub ? 'Выберите подрасу, чтобы продолжить'
      : (vhIncomplete || heIncomplete) ? 'Выберите +1 к двум характеристикам'
      : skillsIncomplete ? 'Выберите навыки, чтобы продолжить'
      : missingDevices.length ? `Сделайте выбор: ${missingDevices.map(t => t.title).join(', ')}`
      : '';
    const btn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('background') }, 'Далее → Предыстория');
    btn.disabled = blocked;
    btn.addEventListener('mouseenter', e => {
      if (btn.disabled) showSrcTip(e, { name: '', desc: tipText });
    });
    btn.addEventListener('mouseleave', hideSrcTip);
    footEl.append(btn);
  }

  function selectRace(srcId, raceName) {
    const key = `${srcId}::${raceName}`;
    st.mecRace    = key;
    st.mecSubrace = null;
    st.mecVariantHumanAsi = {};
    st.mecHalfElfAsi = {};
    st.mecRaceSkills = [];
    st.mecRaceChoices = {};
    st.mecDeviceChoices = {};
    scheduleSave(st);
    listEl.querySelectorAll('.mech-cls-item').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.key === key)
    );
    updateDetail();
    updateRaceFoot();
  }

  // 2026-09-11 (заказчик, UX-правка, не код): пока полный перенос ~93 рас с ttg.club не
  // выверен, в списке показываем только PHB — это фильтр на отображение, а не удаление
  // данных: RACE_DATA/SRC_CONTENT для остальных допов остаются в коде как есть, так что
  // возврат к полному списку — это снова одна строка здесь, без повторного ввода данных.
  const books = (SOURCEBOOKS['5e'] || []).filter(b => b.id === 'PHB');
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
    trigger.classList.toggle('is-filled', names.length > 0); // дизайн 2026-09-27: выбрано → --text-primary
    trigger.title = names.join(', ');
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
    trigger.classList.toggle('is-filled', initNames.length > 0);
    trigger.title = initNames.join(', ');
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
    const srcObj = (SOURCEBOOKS['5e'] || []).find(s => s.id === srcId);

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
    const toolProfSelects = [];
    let choiceIdx = 0;
    const EQUIP_CHOICE_TYPES = new Set(['instrument', 'artisan', 'gaming', 'bg_equipment']); // shown on equipment screen
    const choiceEls = (bgObj.choices || []).flatMap(ch => {
      const ci = choiceIdx++;
      if (EQUIP_CHOICE_TYPES.has(ch.type)) {
        if (ch.type === 'bg_equipment') return [];
        // 2026-09-26 (заказчик): это ВЛАДЕНИЕ инструментом (умение), выбирается здесь и
        // хранится в mecBgChoiceData[ci] — отдельно от предмета в снаряжении (см. схему `item`
        // над BACKGROUND_DATA). Показывается в строке «Владение инструментами» рядом с
        // фиксированными владениями предыстории (renderToolProfRow ниже).
        const opts = bgChoiceOptions(ch.type);
        let current = mecBgToolProfValue(st, ci, ch);
        if (current && !Array.isArray(st.mecBgChoiceData[ci])) {
          // миграция черновика до 2026-09-26: переносим старое значение во владение
          st.mecBgChoiceData[ci] = [`${ch.type}::${current}`];
          st.mecBgProfSplit = true;
          scheduleSave(st);
        }
        checkers.push(() => !!current);
        const selEl = el('select', { class: 'mech-bg-select' },
          el('option', { value: '' }, ch.label.charAt(0).toUpperCase() + ch.label.slice(1)),
          ...opts.map(o => el('option', { value: o }, o)),
        );
        selEl.value = current;
        selEl.addEventListener('change', () => {
          current = selEl.value;
          if (current) st.mecBgChoiceData[ci] = [`${ch.type}::${current}`];
          else delete st.mecBgChoiceData[ci];
          st.mecBgProfSplit = true;
          scheduleSave(st);
          recheckFoot();
        });
        toolProfSelects.push(selEl);
        return [];
      }
      if (ch.type === 'pick2of3') {
        const saved = st.mecBgChoiceData[ci] || [];
        let cnt = saved.length;
        checkers.push(() => cnt >= 2);
        // дизайн 2026-09-27: мультиселект — в той же сетке «ПОДПИСЬ | контрол», что и select
        return [el('div', { class: 'mech-bg-row' },
          el('span', { class: 'mech-bg-row-label' }, 'Владение инструментами'),
          buildBgMultiSel({ label: ch.label.replace(/:\s*$/, ''), max: 2, maxPerGroup: 1, groups: ch.options,
            initialSelected: saved,
            onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; recheckFoot(); } }))];
      }
      if (ch.count >= 2 || ch.groups) { // groups — выбор из нескольких групп (Гильдейский купец: навигатор или язык)
        const saved = st.mecBgChoiceData[ci] || [];
        let cnt = saved.length;
        checkers.push(() => cnt >= ch.count);
        return [el('div', { class: 'mech-bg-row' },
          el('span', { class: 'mech-bg-row-label' }, ch.label),
          buildBgMultiSel({
            label: 'Выберите ' + ch.count,
            max: ch.count,
            maxPerGroup: ch.maxPerGroup,
            groups: ch.groups || [{ label: ch.label, type: ch.type }],
            initialSelected: saved,
            onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; recheckFoot(); },
          }))];
      }
      const savedVal = st.mecBgChoiceData[ci] || '';
      let chosen = !!savedVal;
      checkers.push(() => chosen);
      const selEl = el('select', { class: 'mech-bg-select' },
        el('option', { value: '' }, 'Выберите'),
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
      ((bgObj.tools && bgObj.tools.length) || toolProfSelects.length) ? el('div', { class: 'mech-bg-row' },
        el('span', { class: 'mech-bg-row-label' }, 'Владение инструментами'),
        el('span', { class: 'mech-bg-row-value mech-bg-tool-profs' },
          ...(bgObj.tools || []).flatMap((t, i) => [i ? ', ' : '', t]),
          ...toolProfSelects.flatMap((sel, i) => [(i || (bgObj.tools || []).length) ? ', ' : '', sel]),
        ),
      ) : null,
      ...choiceEls,
      hintEl,
    ].filter(Boolean));
  }

  function selectBg(srcId, bgName) {
    const key = `${srcId}::${bgName}`;
    if (st.mecBackground !== key) {
      st.mecBgChoiceData = {};
      // 2026-09-26: инструмент/набор теперь выбирается на этом шаге — при смене предыстории
      // сбрасываем его, чтобы владение от прошлой предыстории не утекло в новую.
      if (st.mecEquipChoices) for (const t of BG_TOOL_TYPES) delete st.mecEquipChoices[`bgch_${t}`];
      st.mecBgItemCustom = {};
    }
    st.mecBackground = key;
    st.mecBgOk = false;
    scheduleSave(st);
    listEl.querySelectorAll('.mech-cls-item').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.key === key)
    );
    updateDetail();
  }

  // PHB is always included; other books only if selected
  const allBooks = (SOURCEBOOKS['5e'] || []).filter(b =>
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
  int: ['Расследование', 'История', 'Магия', 'Природа', 'Религия'],
  wis: ['Восприятие', 'Выживание', 'Медицина', 'Проницательность', 'Уход за животными'],
  cha: ['Выступление', 'Запугивание', 'Обман', 'Убеждение'],
};

// Reverse lookup (skill name -> ability key) + the CSS var each ability paints its
// skill chips with (--ab-str etc, defined in css/tokens.css). "Палитра 2" from the
// 2026-09-10 colour pass — see docs/reviews/2026-09-10_class-screen-feedback.md.
const SKILL_ABILITY = Object.fromEntries(
  Object.entries(SKILLS_BY_AB).flatMap(([ab, names]) => names.map(name => [name, ab]))
);
const ABILITY_COLOR_VAR = { str: '--ab-str', dex: '--ab-dex', int: '--ab-int', wis: '--ab-wis', cha: '--ab-cha' };
function skillColorVar(name) {
  const ab = SKILL_ABILITY[name];
  return ab && ABILITY_COLOR_VAR[ab] ? `var(${ABILITY_COLOR_VAR[ab]})` : null;
}

const STAT_CLASSES = {
  'Бард':         { saves:['dex','cha'], count:3, list:null },
  'Варвар':       { saves:['str','con'], count:2, list:['Атлетика','Восприятие','Природа','Запугивание','Уход за животными','Выживание'] },
  'Воин':         { saves:['str','con'], count:2, list:['Акробатика','Атлетика','История','Проницательность','Восприятие','Уход за животными','Запугивание','Выживание'] },
  'Волшебник':    { saves:['int','wis'], count:2, list:['История','Магия','Проницательность','Расследование','Медицина','Религия'] },
  'Друид':        { saves:['int','wis'], count:2, list:['Восприятие','Выживание','Магия','Медицина','Уход за животными','Природа','Проницательность','Религия'] },
  'Жрец':         { saves:['wis','cha'], count:2, list:['История','Медицина','Проницательность','Религия','Убеждение'] },
  'Изобретатель': { saves:['con','int'], count:2, list:['История','Магия','Медицина','Природа','Расследование','Восприятие','Ловкость рук'] },
  'Колдун':       { saves:['wis','cha'], count:2, list:['История','Магия','Обман','Запугивание','Природа','Религия','Расследование'] },
  'Монах':        { saves:['str','dex'], count:2, list:['Акробатика','Атлетика','История','Проницательность','Религия','Скрытность'] },
  'Паладин':      { saves:['wis','cha'], count:2, list:['Атлетика','Запугивание','Медицина','Проницательность','Религия','Убеждение'] },
  'Плут':         { saves:['dex','int'], count:4, list:['Акробатика','Атлетика','Восприятие','Обман','Запугивание','Расследование','Ловкость рук','Проницательность','Скрытность','Убеждение','Выступление'] },
  'Следопыт':     { saves:['str','dex'], count:3, list:['Атлетика','Восприятие','Выживание','Природа','Проницательность','Расследование','Скрытность','Уход за животными'] },
  'Чародей':      { saves:['con','cha'], count:2, list:['Запугивание','Магия','Обман','Проницательность','Религия','Убеждение'] },
};

const STAT_RACE_ASI = {
  'Дварф':     { con:2 },        'Эльф':      { dex:2 },
  'Полурослик':{ dex:2 },        'Человек':   {},
  'Драконорождённый': { str:2,cha:1 }, 'Гном': { int:2 },
  'Полуэльф':  { cha:2 },        'Полуорк':   { str:2,con:1 },
  'Тифлинг':   { int:1,cha:2 },  
};

const STAT_SUBRACE_ASI = {
  'Горный':      { str:2 },              'Холмовой':  { wis:1 },
  'Высший':      { int:1 },              'Лесной':    { wis:1 },  'Тёмный эльф (дроу)': { cha:1 },
  'Легконогий':  { cha:1 },              'Коренастый': { con:1 },
  'Скальный':    { con:1 },
  // Human subraces — Standard gets +1 to all, Variant is player's choice (handled separately)
  'Стандартный': { str:1,dex:1,con:1,int:1,wis:1,cha:1 },
};

// ─── Stats step helpers ───────────────────────────────────────────────────────

function pbSpent(stats) {
  return Object.values(stats).reduce((a, v) => a + (PB_COST[v] ?? 0), 0);
}
const statMod = s => Math.floor((s - 10) / 2);
const signNum  = n => n >= 0 ? `+${n}` : `${n}`;

// 2026-09-26: фиксированные языки расы из строки `languages` («Общий, Эльфийский + один на
// выбор»), без хвоста «+ … на выбор» и с приведением написания к списку LANGUAGES.
const LANG_ALIASES = { 'Дварфийский': 'Дварфский', 'Великаний': 'Великанский' };
function mecRaceBaseLanguages(raceDesc) {
  if (!raceDesc?.languages) return [];
  return raceDesc.languages.split(/,|\+/)
    .map(s => s.replace(/\(.*\)/, '').trim())
    .filter(s => s && !/на выбор/i.test(s))
    .map(s => LANG_ALIASES[s] || s);
}

function _resolveRaceDesc(raceName) {
  return RACE_DESCRIPTIONS[raceName]
    || RACE_DESCRIPTIONS[RACE_DESC_ALIASES[raceName]]
    || RACE_DESCRIPTIONS[raceName.replace(' (Чистокровный)', '')]
    || RACE_DESCRIPTIONS[raceName.replace(/\s*\([^)]+\)$/, '')];
}

function mecRacialAsi(st) {
  if (!st.mecRace) return {};
  const raceName = st.mecRace.split('::')[1];
  const base = { ...(STAT_RACE_ASI[raceName] || _resolveRaceDesc(raceName)?.asi || {}) };
  if (st.mecSubrace) {
    // Prefer asi from race_descriptions (handles per-race subrace conflicts like Гном/Эльф 'Лесной')
    const raceDesc = _resolveRaceDesc(raceName);
    const sInfo = raceDesc?.subraces?.find(sd => sd.name === st.mecSubrace);
    const sub = sInfo?.asi || STAT_SUBRACE_ASI[st.mecSubrace] || {};
    for (const [k, v] of Object.entries(sub)) base[k] = (base[k] || 0) + v;
  }
  // Variant Human: merge player's chosen +1 bonuses
  if (st.mecVariantHumanAsi) {
    for (const [k, v] of Object.entries(st.mecVariantHumanAsi)) base[k] = (base[k] || 0) + v;
  }
  // Half-Elf: merge player's chosen +1 to two abilities (besides the fixed +2 Харизма above)
  if (raceName === 'Полуэльф' && st.mecHalfElfAsi) {
    for (const [k, v] of Object.entries(st.mecHalfElfAsi)) base[k] = (base[k] || 0) + v;
  }
  return base;
}

// 2026-09-12: some race traits grant proficiency in N skills of the player's choice
// (e.g. Half-Elf's «Универсальность навыков» — any 2 skills, PHB) via `trait.skillChoice
// = { count, list? }`. Sums the requirement across common + currently-selected subrace
// traits so the race step's footer button can gate on it, same as the ASI-choice traits.
// 2026-09-26: единый расчёт активного списка расовых черт (общие + выбранной подрасы с
// учётом replaces / insertAfter / renderLast). Раньше жил только внутри renderTraitsBlock(),
// из-за чего валидация «Далее» и запись в персонажа не знали, какие черты реально активны.
function mecActiveRaceTraits(raceName, subraceName) {
  const raceDesc = raceName ? _resolveRaceDesc(raceName) : null;
  if (!raceDesc) return [];
  let subTraits = [];
  if (subraceName) {
    const sInfo = (raceDesc.subraces || []).find(sd =>
      sd.name === subraceName || sd.name.includes(subraceName) || subraceName.includes(sd.name.split(' ')[0]));
    subTraits = sInfo?.traits || [];
  }
  const commonTraits = raceDesc.traits || [];
  const allTraits = commonTraits.filter(t => !t.renderLast);
  const deferred = commonTraits.filter(t => t.renderLast);
  for (const tr of subTraits) {
    if (tr.replaces) {
      const ridx = allTraits.findIndex(x => x.title === tr.replaces);
      if (ridx !== -1) { allTraits.splice(ridx, 1, tr); continue; }
    }
    const idx = tr.insertAfter ? allTraits.findIndex(x => x.title === tr.insertAfter) : -1;
    if (idx !== -1) allTraits.splice(idx + 1, 0, tr);
    else allTraits.push(tr);
  }
  allTraits.push(...deferred);
  return allTraits;
}

// 2026-09-26: обязательные «выбери один из N» черты (devices + required: true — цвет дракона,
// инструмент дварфа), по которым игрок ещё ничего не выбрал.
function mecMissingRequiredDevices(st) {
  if (!st.mecRace) return [];
  const traits = mecActiveRaceTraits(st.mecRace.split('::')[1], st.mecSubrace);
  const picks = st.mecDeviceChoices || {};
  return traits.filter(t => t.required && t.devices?.length &&
    !t.devices.some(d => d.name === picks[t.title]));
}

// 2026-09-26: всё, что игрок выбрал на шаге расы, в виде полей персонажа. Раньше в record
// уходили только характеристики и навыки — язык, заговор, черта, инструмент и цвет дракона
// оставались лишь в _wizardState. Читаем только АКТИВНЫЕ черты, чтобы устаревшие ключи
// (например, от прошлой подрасы) не протекали в персонажа.
function mecRaceRecordChoices(st) {
  const out = { languages: [], cantrips: [], feats: [], tools: [], dragonAncestry: '' };
  if (!st.mecRace) return out;
  const raceName = st.mecRace.split('::')[1];
  out.languages.push(...mecRaceBaseLanguages(_resolveRaceDesc(raceName)));
  const choices = st.mecRaceChoices || {};
  const devices = st.mecDeviceChoices || {};
  for (const t of mecActiveRaceTraits(raceName, st.mecSubrace)) {
    if (t.choice) {
      const picks = choices[t.title] || [];
      if (t.choice.type === 'language') out.languages.push(...picks);
      else if (t.choice.type === 'spell') out.cantrips.push(...picks);
      else if (t.choice.type === 'feat') out.feats.push(...picks);
    }
    if (t.recordAs && t.devices?.some(d => d.name === devices[t.title])) {
      if (t.recordAs === 'tool') out.tools.push(devices[t.title]);
      else if (t.recordAs === 'dragonAncestry') out.dragonAncestry = devices[t.title];
    }
  }
  out.languages = [...new Set(out.languages)];
  return out;
}

// 2026-09-26: навыки, которые раса даёт без выбора (`grantsSkills` у черты — Эльф
// «Обострённые чувства» → Восприятие, Полуорк «Угрожающий вид» → Запугивание).
function mecRaceGrantedSkills(st) {
  if (!st.mecRace) return [];
  return mecActiveRaceTraits(st.mecRace.split('::')[1], st.mecSubrace)
    .flatMap(t => t.grantsSkills || []);
}

function mecRequiredRaceSkillCount(raceName, subraceName) {
  const raceDesc = _resolveRaceDesc(raceName);
  if (!raceDesc) return 0;
  let subTraits = [];
  if (subraceName) {
    const sInfo = (raceDesc.subraces || []).find(sd =>
      sd.name === subraceName || sd.name.includes(subraceName) || subraceName.includes(sd.name.split(' ')[0]));
    subTraits = sInfo?.traits || [];
  }
  const allTraits = [...(raceDesc.traits || []), ...subTraits];
  return allTraits.reduce((sum, t) => sum + (t.skillChoice?.count || 0), 0);
}

// ─── 2026-09-26: владения инструментами vs предметы предыстории ──────────────
// См. схему `item` над BACKGROUND_DATA. Владение — mecBgChoiceData[ci] (['<type>::<знач.>']),
// предмет — mecEquipChoices['bgch_<type>'] (+ mecBgItemCustom[type], если игрок поменял
// предмет вручную; иначе предмет следует за владением).
const BG_TOOL_TYPES = ['instrument', 'artisan', 'gaming'];

function mecBgObjByName(name) {
  return name ? Object.values(BACKGROUND_DATA).flat().find(b => b.name === name) : null;
}
function mecBgObj(st) {
  if (!st.mecBackground) return null;
  const [srcId, bgName] = st.mecBackground.split('::');
  return (BACKGROUND_DATA[srcId] || []).find(b => b.name === bgName) || null;
}

// Выбранное владение инструментом для choices[ci] ('' — не выбрано). Черновики до 2026-09-26
// хранили выбор только в mecEquipChoices['bgch_<type>'] (владение и предмет одним значением) —
// для них, пока новый выбор не сделан (нет mecBgProfSplit), читаем оттуда.
function mecBgToolProfValue(st, ci, ch) {
  const data = st.mecBgChoiceData?.[ci];
  if (Array.isArray(data) && data[0]) return data[0].split('::').slice(1).join('::');
  if (!st.mecBgProfSplit) {
    const legacy = st.mecEquipChoices?.[`bgch_${ch.type}`];
    if (bgChoiceOptions(ch.type).includes(legacy)) return legacy;
  }
  return '';
}

function mecBgItemOptions(ch, profVal) {
  if (ch.item?.same) return profVal ? [profVal] : bgChoiceOptions(ch.type);
  if (ch.item?.list) return ch.item.list;
  return [...bgChoiceOptions(ch.type), ...(ch.item?.extra || [])];
}
function mecBgItemValue(st, ch, profVal) {
  const opts  = mecBgItemOptions(ch, profVal);
  const saved = st.mecEquipChoices?.[`bgch_${ch.type}`];
  if (!ch.item?.same && st.mecBgItemCustom?.[ch.type] && opts.includes(saved)) return saved;
  if (profVal && opts.includes(profVal)) return profVal;
  return opts[0] || '';
}

// Пары { ch, profVal } для предметов-инструментов текущей предыстории (для «Собственной» —
// предметы выбранной на шаге снаряжения чужой предыстории, владения у них нет).
function mecBgItemChoices(st) {
  const bgObj = mecBgObj(st);
  if (!bgObj) return [];
  if (bgObj.name === 'Собственная предыстория') {
    const src = mecBgObjByName(st.mecEquipChoices?.bgch_bg_equipment);
    return (src?.choices || []).filter(ch => ch.item).map(ch => ({ ch, profVal: '' }));
  }
  const out = [];
  (bgObj.choices || []).forEach((ch, ci) => {
    if (!ch.item) return;
    // предмет появляется только после выбора владения (оно обязательно на шаге «Предыстория»),
    // иначе дефолтный предмет, записанный в bgch_<type>, приняли бы за старое владение.
    const profVal = mecBgToolProfValue(st, ci, ch);
    if (profVal) out.push({ ch, profVal });
  });
  return out;
}

// Записывает актуальные предметы в mecEquipChoices['bgch_<type>'] (их читают «Финал» и pdf.js)
// и убирает ключи инструментов, которых эта предыстория в снаряжение не даёт.
function mecSyncBgItems(st) {
  if (!st.mecEquipChoices) st.mecEquipChoices = {};
  const items = mecBgItemChoices(st);
  const keep = new Set(items.map(({ ch }) => ch.type));
  for (const t of BG_TOOL_TYPES) if (!keep.has(t)) delete st.mecEquipChoices[`bgch_${t}`];
  for (const { ch, profVal } of items) {
    const v = mecBgItemValue(st, ch, profVal);
    if (v) st.mecEquipChoices[`bgch_${ch.type}`] = v;
  }
}

// Селект предмета (или фиксированная строка для item.same / единственного варианта).
function buildBgItemEl(st, ch, profVal, onChange) {
  const opts = mecBgItemOptions(ch, profVal);
  const key  = `bgch_${ch.type}`;
  const val  = mecBgItemValue(st, ch, profVal);
  if (ch.item?.same && profVal) return el('div', { class: 'equip-item' }, val);
  const sel = el('select', { class: 'equip-choice-sel' }, ...opts.map(o => el('option', { value: o }, o)));
  sel.value = val;
  sel.addEventListener('change', () => {
    if (!st.mecEquipChoices) st.mecEquipChoices = {};
    st.mecEquipChoices[key] = sel.value;
    if (!st.mecBgItemCustom) st.mecBgItemCustom = {};
    st.mecBgItemCustom[ch.type] = true;
    scheduleSave(st);
    if (onChange) onChange();
  });
  return el('div', { class: 'equip-item is-choice' },
    el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾')),
  );
}

// Владения предыстории: { langs, tools } — фиксированные tools + все выборы (языки, инструменты,
// «Собственная»: any_prof / pick2of3). Предметы снаряжения сюда НЕ входят.
function mecBgProfs(st) {
  const langs = [], tools = [];
  const bgObj = mecBgObj(st);
  if (!bgObj) return { langs, tools };
  (bgObj.choices || []).forEach((ch, ci) => {
    if (ch.type === 'bg_equipment') return;
    if (BG_TOOL_TYPES.includes(ch.type)) {
      const v = mecBgToolProfValue(st, ci, ch);
      if (v) tools.push(v);
      return;
    }
    const data = st.mecBgChoiceData?.[ci];
    if (Array.isArray(data)) {
      data.forEach(key => {
        const [type, ...rest] = key.split('::');
        const val = rest.join('::');
        if (type === 'language') langs.push(val);
        else if (type !== 'skill') tools.push(val);
      });
    } else if (typeof data === 'string' && data) {
      if (ch.type === 'language') langs.push(data);
      else if (ch.type !== 'skill') tools.push(data);
    }
  });
  (bgObj.tools || []).forEach(t => tools.push(t));
  return { langs, tools };
}

// Владения инструментами от класса: выбранные (Бард/Монах/Изобретатель) + фиксированные.
// Описательный текст «три музыкальных инструмента на выбор» — не владение, пока нет выбора.
function mecClassToolProfs(st) {
  const picks = ((st.mecClassToolChoice || {})[st.mecClass] || []).map(k => k.split('::').slice(1).join('::'));
  const fixedStr = CLASS_PROF_DATA[st.mecClass]?.tools;
  const fixed = fixedStr && fixedStr !== 'нет' ? fixedStr.split(', ') : [];
  if (CLASS_TOOL_CHOICE[st.mecClass]) return st.mecClass === 'artificer' ? [...fixed, ...picks] : picks;
  return fixed;
}

// Без учёта регистра: Плут даёт «воровские инструменты», Преступник — «Воровские инструменты».
function dedupeCI(list) {
  const seen = new Set();
  return list.filter(x => { const k = String(x).trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
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
  if (!st.mecStats)           st.mecStats           = { str:8, dex:8, con:8, int:8, wis:8, cha:8 };
  if (!st.mecChosen)          st.mecChosen          = [];
  if (!st.mecStatMethod)      st.mecStatMethod      = 'pointbuy';
  if (!st.mecStdAssign)       st.mecStdAssign       = {};
  if (!st.mecRolls || !st.mecRolls.length) st.mecRolls = Array(6).fill(null);
  if (!st.mecRollAssign)      st.mecRollAssign      = {};
  if (!st.mecVariantHumanAsi) st.mecVariantHumanAsi = {};
  if (!st.mecHalfElfAsi)      st.mecHalfElfAsi      = {};

  const STD_ARRAY = [15, 14, 13, 12, 10, 8];
  const bodyEl  = el('div', { class: 'mech-stats-scroll' });
  const _isMagicCls = hasSpellStep(st);
  const footBtn = el('button', { class: 'cnew-save-btn',
    onClick: () => goMech(_isMagicCls ? 'spells' : 'equipment'),
  }, _isMagicCls ? 'Далее → Заклинания' : 'Далее → Снаряжение');
  footBtn.addEventListener('mouseenter', e => {
    if (!footBtn.disabled) return;
    showSrcTip(e, { name: '', desc: 'Заполните все характеристики, чтобы продолжить' });
  });
  footBtn.addEventListener('mouseleave', hideSrcTip);
  const footEl  = el('div', { class: 'mech-foot' }, footBtn);

  const _isVariantHuman = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Человек' && st.mecSubrace === 'Альтернативный';
  const _isHalfElf = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Полуэльф';

  function allAssigned() {
    if (_isVariantHuman() && Object.keys(st.mecVariantHumanAsi || {}).length < 2) return false;
    if (_isHalfElf() && Object.keys(st.mecHalfElfAsi || {}).length < 2) return false;
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

    // Skills are chosen at the class step — read-only here
    const skillEls = [...skills].sort((a, b) => a.localeCompare(b, 'ru')).map(name => {
      const fromBg     = bgProfs.includes(name);
      const fromClass  = chosen.has(name);
      const proficient = fromBg || fromClass;
      const bonus      = mod + (proficient ? 2 : 0);
      let cbCls = 'sk-cb';
      if (fromBg)         cbCls += ' src-bg has-check';
      else if (fromClass) cbCls += ' src-class has-check';
      return el('div', { class: 'skill-row locked' },
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
  // 2026-09-27: предметы — по строке «Снаряжение» страниц dnd.su (tools/raw_dndsu/2014/pages). Без монет (BG_GOLD)
  // и без предметов, которые выбираются через choices[].item (муз. инструмент, ремесленные инструменты, игровой набор Солдата).
  'Прислужник': ['Священный символ (подаренный вам в момент принятия священного сана)', 'Молитвенник или молитвенный барабан', '5 палочек благовоний', 'Ряса', 'Комплект обычной одежды'],
  'Артист': ['Подарок от поклонницы (любовное письмо, локон волос или безделушка)', 'Костюм'],
  'Гладиатор': ['Подарок от поклонницы (любовное письмо, локон волос или безделушка)', 'Костюм'],
  'Беспризорник': ['Маленький нож', 'Карта города, в котором вы выросли', 'Ручная мышь', 'Безделушка в память о родителях', 'Комплект обычной одежды'],
  'Благородный': ['Комплект отличной одежды', 'Кольцо-печатка', 'Свиток с генеалогическим древом'],
  'Рыцарь': ['Комплект отличной одежды', 'Кольцо-печатка', 'Свиток с генеалогическим древом'],
  'Гильдейский ремесленник': ['Рекомендательное письмо из гильдии', 'Комплект дорожной одежды'],
  'Купец гильдии': ['Мул и телега', 'Рекомендательное письмо из гильдии', 'Комплект дорожной одежды'],
  'Шарлатан': ['Комплект отличной одежды', 'Набор для грима', 'Приспособление для жульничества на ваш выбор (десять запечатанных бутылей с подкрашенной жидкостью, набор шулерских костей, колода краплёных карт или кольцо с печатью какого-нибудь воображаемого герцога)'],
  'Моряк': ['Кофель-нагель (дубинка)', '50 футов шёлковой верёвки', 'Талисман (такой как кроличья лапка или камень с дыркой)', 'Комплект обычной одежды'],
  'Пират': ['Кофель-нагель (дубинка)', '50 футов шёлковой верёвки', 'Талисман (такой как кроличья лапка или камень с дыркой)', 'Комплект обычной одежды'],
  'Мудрец': ['Бутылочка чернил', 'Писчее перо', 'Небольшой нож', 'Письмо от мёртвого коллеги с вопросом, на который вы пока не можете ответить', 'Комплект обычной одежды'],
  'Народный герой': ['Лопата', 'Железный горшок', 'Комплект обычной одежды'],
  'Отшельник': ['Контейнер для свитков, битком набитый вашими молитвами и изысканиями', 'Тёплое одеяло', 'Комплект обычной одежды', 'Набор травника'],
  'Преступник': ['Ломик', 'Комплект обычной тёмной одежды с капюшоном'],
  'Шпион': ['Ломик', 'Комплект обычной тёмной одежды с капюшоном'],
  'Чужеземец': ['Посох', 'Капкан', 'Трофей с убитого животного', 'Комплект дорожной одежды'],
  'Солдат': ['Знак отличия', 'Трофей с убитого врага (кинжал, сломанный клинок или кусок знамени)', 'Комплект обычной одежды'],
};

const BG_GOLD = {
  // PHB
  'Прислужник': 15, 'Артист': 15, 'Гладиатор': 15, 'Беспризорник': 10, 'Благородный': 25, 'Рыцарь': 25,
  'Гильдейский ремесленник': 15, 'Купец гильдии': 15, 'Шарлатан': 15, 'Моряк': 10, 'Пират': 10, 'Мудрец': 10,
  'Народный герой': 10, 'Отшельник': 5, 'Преступник': 15, 'Шпион': 15, 'Чужеземец': 10,
  'Солдат': 10, 'Собственная предыстория': 0,
  // SCAG
  // GGR
  // VRGR
  // WBW
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

/**
 * Same as makeChoiceSel but for an "either/or" choice between two categories
 * (e.g. Монах: artisan tool OR musical instrument) — renders as one <select>
 * with an <optgroup> per category instead of one flat alphabetized list, so
 * the two kinds of tool stay visually separated.
 *
 * ⚠️ 2026-09-12: no longer called — Монах's tool choice in CLASS_TOOL_CHOICE now goes
 * through buildBgMultiSel instead (see the 2026-09-12 note above CLASS_TOOL_CHOICE).
 * Left in place rather than deleted (not currently confident nothing else expects it —
 * this project has been burned once already this session by removing a function on the
 * assumption it was unused without grepping thoroughly enough first).
 */
function makeGroupedChoiceSel(groups, key, st, onChange) {
  if (!st.mecEquipChoices) st.mecEquipChoices = {};
  const sel = el('select', { class: 'equip-choice-sel' },
    ...groups.map(g => el('optgroup', { label: g.label },
      ...g.items.map(o => el('option', { value: o }, o)),
    )),
  );
  const firstVal = groups[0]?.items[0];
  sel.value = st.mecEquipChoices[key] ?? firstVal;
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
  // 2026-09-27: «или» внутри скобок — это пояснение из dnd.su («трофей (кинжал … или кусок знамени)»), а не выбор
  if (item.replace(/\([^)]*\)/g, '').includes(' или ')) return item.split(' или ');
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

// ─── Spells step (ТЗ 4.4.6: v0.23 + v0.24 + v0.29, этап Э2) ──────────────────
// Все выборы заклинаний персонажа — класс, подкласс, раса, черта — на одном шаге, по группам источников.
// Логика групп, «🔒 уже есть», чистка и проверка — js/spell-groups.js; здесь только профиль и UI.

/** Профиль персонажа для buildSpellSections() из состояния мастера. */
function spellProfile(st) {
  const raceName = st.mecRace ? st.mecRace.split('::')[1] : '';
  const raceId = raceName ? raceIdByName(raceName) : null;
  const subraceId = raceId && st.mecSubrace ? subraceIdByName(raceId, st.mecSubrace) : null;
  const raceDesc = raceName ? _resolveRaceDesc(raceName) : null;
  const subTraitTitles = new Set(((raceDesc?.subraces || []).find(sd => sd.name === st.mecSubrace)?.traits || []).map(t => t.title));
  const traits = raceName ? mecActiveRaceTraits(raceName, st.mecSubrace) : [];
  const raceTraits = traits.map(t => {
    const sub = subTraitTitles.has(t.title) && subraceId;
    return { title: t.title, text: typeof t.text === 'string' ? t.text : null, choice: t.choice || null,
             srcType: sub ? 'subrace' : 'race', srcId: sub ? subraceId : raceId };
  });
  const choices = st.mecRaceChoices || {};
  const featNames = {};
  const featIds = [];
  for (const t of traits) {
    if (t.choice?.type !== 'feat') continue;
    for (const n of choices[t.title] || []) { const id = featIdByName(n); if (id) { featIds.push(id); featNames[id] = n; } }
  }
  const asi = mecRacialAsi(st);
  const scores = {}, mods = {};
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    scores[k] = (effectiveBase(st, k) ?? 10) + (asi[k] || 0);
    mods[k] = Math.floor((scores[k] - 10) / 2);
  }
  const raceLabel = st.mecSubrace && st.mecSubrace !== 'Стандартный' && st.mecSubrace !== 'Альтернативный'
    ? (/\(|эльф/i.test(st.mecSubrace) ? st.mecSubrace : `${raceName} (${st.mecSubrace})`) : raceName;
  return {
    classId: st.mecClass || null, variant: clsVariant(st),
    subclass: clsSubclassObj(st), subclassChoices: st.mecSubclassChoices || {},
    raceId, subraceId, raceLabel, raceTraits,
    featIds, featNames, featClass: st.mecSpellFeatClass || {},
    scores, mods,
  };
}

/** Источники заклинаний персонажа + очищенный выбор (без мутации st). */
function spellState(st) {
  const res = buildSpellSections(spellProfile(st));
  const picks = prunePicks(res, st.mecSpellPicks || {});
  return { res, picks };
}

/** Шаг «Заклинания» есть, если хоть один источник даёт заклинания на 1 ур. (ТЗ v0.29). */
function hasSpellStep(st) {
  return !!st.mecClass && hasSpellSources(spellState(st).res);
}
function spellStepDone(st) {
  const { res, picks } = spellState(st);
  return missingPicks(res, picks).length === 0;
}

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
  'Чародей':     'Магия в твоей крови — врождённая сила. Знаешь заклинания наизусть. Особая механика: Очки Чародейства для дополнительных слотов.',
};

const spellSigned = n => (n >= 0 ? '+' : '−') + Math.abs(n);
/** Материальный компонент со стоимостью (зм/см/мм/пм) — отдельный бейдж на карточке (ТЗ 4.4.6 ⑤). */
const costlyMaterial = sp => sp.components?.m && /\d[\d\s]*\s*(зм|см|мм|пм|эм)/.test(sp.components.material || '');

function buildSpellsStep(st, goMech) {
  const { res, picks } = spellState(st);
  st.mecSpellPicks = picks;                     // устаревшие/недопустимые выборы убраны
  if (!st._spellOpen) st._spellOpen = [];       // раскрытые карточки (UI, не в БД)
  const taken = takenMap(res, picks);
  const missing = missingPicks(res, picks);

  const clsSec = res.sections.find(s => s.type === 'class');
  const className = CLASS_NAME_BY_ID[st.mecClass] || '';

  function rebuild(focusSearch = false) {
    scheduleSave(st);
    const wrap = document.querySelector('.mech-spell-wrap');
    if (!wrap) return;
    const top = wrap.scrollTop;
    const next = buildSpellsStep(st, goMech);
    wrap.replaceWith(next);
    next.scrollTop = top;
    if (focusSearch) {
      const inp = next.querySelector('.mech-spell-search');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }

  // ── Фильтр (поиск + школы) — общий для всех групп выбора
  const filterText = (st._spellFilter || '').trim().toLowerCase();
  const filterSchool = st._spellSchool || null;
  const passes = sp => (!filterText || sp.name.toLowerCase().includes(filterText) || (sp.nameEn || '').toLowerCase().includes(filterText))
    && (!filterSchool || sp.school === filterSchool);

  // ── Карточка заклинания: «коротко + раскрыть»
  function spellCard(sp, { tags = [], selected = false, disabled = false, locked = null, fixedFrom = null, onToggle = null } = {}) {
    const open = st._spellOpen.includes(sp.id);
    const badges = [];
    if (fixedFrom && fixedFrom > 1) badges.push(el('span', { class: 'spl-badge spl-badge--lvl' }, `с ${fixedFrom} ур.`));
    if (sp.ritual)        badges.push(el('span', { class: 'spl-badge' }, 'Ритуал'));
    if (sp.concentration) badges.push(el('span', { class: 'spl-badge' }, 'Конц.'));
    if (costlyMaterial(sp)) badges.push(el('span', { class: 'spl-badge spl-badge--mat', title: sp.components.material }, 'М: ' + sp.components.material));
    for (const t of tags) badges.push(el('span', { class: 'spl-badge spl-badge--tag' + (t === 'Опц. TCE' ? ' is-tce' : ''),
      title: t === 'Опц. TCE' ? 'Это расширение списка класса из Tasha\'s Cauldron — уточни у Мастера.' : '' }, t));
    for (const a of sp.sourceAbbr || []) badges.push(el('span', { class: 'spl-src' }, a));

    const chevron = el('button', {
      class: 'spl-chevron' + (open ? ' is-open' : ''), type: 'button', 'aria-expanded': open ? 'true' : 'false',
      title: open ? 'Свернуть' : 'Подробнее',
      onClick: e => {
        e.stopPropagation();
        st._spellOpen = open ? st._spellOpen.filter(x => x !== sp.id) : [...st._spellOpen, sp.id];
        rebuild();
      },
    }, open ? '▴' : '▾');

    const comp = [sp.components?.v && 'В', sp.components?.s && 'С', sp.components?.m && 'М'].filter(Boolean).join(', ');
    const body = open ? el('div', { class: 'spl-body' },
      el('p', { class: 'spl-meta' }, `${sp.level === 0 ? 'Заговор' : sp.level + ' уровень'}, ${String(sp.school || '').toLowerCase()}`),
      el('p', { class: 'spl-meta' }, `Компоненты: ${comp}${sp.components?.material ? ` (${sp.components.material})` : ''}`),
      ...String(sp.description || '').split('\n').filter(Boolean).map(p => el('p', { class: 'spl-desc' }, p)),
      sp.higherLevels ? el('p', { class: 'spl-desc spl-higher' }, el('b', {}, 'На больших уровнях. '), sp.higherLevels) : null,
      sp.url ? el('a', { class: 'spl-link', href: sp.url, target: '_blank', rel: 'noopener', onClick: e => e.stopPropagation() }, 'на dnd.su ↗') : null,
    ) : null;

    const cls = 'spl-card' + (selected ? ' is-selected' : '') + (disabled ? ' is-disabled' : '')
      + (locked ? ' is-locked' : '') + (fixedFrom ? ' is-fixed' : '') + (fixedFrom > 1 ? ' is-later' : '');
    const card = el('div', { class: cls },
      el('div', { class: 'spl-top' },
        el('span', { class: 'spl-mark' }, fixedFrom || locked ? '🔒' : selected ? '✓' : ''),
        el('div', { class: 'spl-head' },
          el('span', { class: 'spl-name' }, sp.name),
          el('span', { class: 'spl-school' }, sp.school || ''),
        ),
        chevron,
      ),
      el('div', { class: 'spl-params' }, [sp.castingTime, sp.range, sp.duration].filter(Boolean).join(' · ')),
      locked ? el('div', { class: 'spl-locked' }, `🔒 уже есть — ${locked}`) : null,
      badges.length ? el('div', { class: 'spl-badges' }, ...badges) : null,
      body,
    );
    if (onToggle && !disabled && !locked) {
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.addEventListener('click', onToggle);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } });
    }
    return card;
  }

  // ── Группа выбора
  function choiceGroup(sec, g) {
    const cur = picks[g.key] || [];
    const need = groupNeed(g, picks, taken);
    const options = groupOptions(g, picks);
    const shown = options.filter(o => passes(o.spell) || cur.includes(o.spell.id));
    const full = cur.length >= g.count;
    const cards = shown.map(o => {
      const id = o.spell.id;
      const owner = taken.get(id);
      const locked = !g.fromGroup && owner && owner.key !== g.key ? owner.label : null;
      const selected = cur.includes(id);
      return spellCard(o.spell, {
        tags: o.tags, selected, locked, disabled: !selected && full,
        onToggle: () => {
          const list = [...(st.mecSpellPicks[g.key] || [])];
          if (selected) list.splice(list.indexOf(id), 1); else if (list.length < g.count) list.push(id);
          st.mecSpellPicks = { ...st.mecSpellPicks, [g.key]: list };
          rebuild();
        },
      });
    });
    const done = cur.length >= need;
    let empty = null;
    if (!options.length) empty = g.fromGroup ? 'Сначала выберите заклинания в книгу.' : 'Нет доступных вариантов.';
    else if (!shown.length) empty = 'Ничего не найдено — сбросьте фильтр.';
    return el('div', { class: 'spl-group', id: 'spl-' + g.key.replace(/[^\w-]/g, '_') },
      el('div', { class: 'spl-group-hd' },
        el('h4', { class: 'spl-group-title' }, `${g.title} — выберите ${g.count}`),
        el('span', { class: 'spl-count' + (done ? ' is-done' : '') }, `${cur.length} / ${need}`),
      ),
      g.formula ? el('p', { class: 'spl-hint' }, `Формула: ${g.formula}.`) : null,
      g.hint ? el('p', { class: 'spl-hint' }, g.hint) : null,
      empty ? el('p', { class: 'mech-spell-empty' }, empty) : el('div', { class: 'spl-grid' }, ...cards),
    );
  }

  function fixedGroup(sec, g) {
    return el('div', { class: 'spl-group' },
      el('div', { class: 'spl-group-hd' },
        el('h4', { class: 'spl-group-title' }, g.title),
        el('span', { class: 'spl-count is-done' }, 'уже есть'),
      ),
      g.hint ? el('p', { class: 'spl-hint' }, g.hint) : null,
      el('div', { class: 'spl-grid' }, ...g.fixed.map(f => spellCard(f.spell, { fixedFrom: f.from, tags: f.note ? [f.note] : [] }))),
    );
  }

  function featClassPicker(sec) {
    const cp = sec.classPicker;
    const sel = el('select', { class: 'equip-choice-sel' },
      el('option', { value: '' }, '— выберите класс —'),
      ...cp.options.map(o => el('option', { value: o.id }, o.name)));
    sel.value = cp.value || '';
    sel.addEventListener('change', () => {
      st.mecSpellFeatClass = { ...(st.mecSpellFeatClass || {}), [cp.featId]: sel.value || null };
      rebuild();
    });
    return el('div', { class: 'spl-feat-class' },
      el('span', { class: 'spl-feat-class-lbl' }, 'Список заклинаний класса:'),
      el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾')),
      cp.stat ? el('span', { class: 'spl-hint' }, `Базовая характеристика — ${STAT_LABEL_SG[cp.stat]}.`) : null,
    );
  }

  function sectionEl(sec) {
    const feat = sec.type === 'feat' ? FEATS.find(f => f.id === sec.id) : null;
    return el('section', { class: 'spl-sec spl-sec--' + sec.type },
      el('h3', { class: 'spl-sec-title' }, sec.label),
      feat ? el('details', { class: 'spl-feat-text' },
        el('summary', {}, 'Текст черты'),
        ...feat.text.map(t => el('p', {}, t)),
        el('a', { class: 'spl-link', href: feat.url, target: '_blank', rel: 'noopener' }, 'на dnd.su ↗')) : null,
      sec.warning ? el('p', { class: 'spl-warn' }, '⚠️ ' + sec.warning) : null,
      ...(sec.notes || []).map(n => el('p', { class: 'spl-hint' }, n)),
      sec.classPicker ? featClassPicker(sec) : null,
      ...sec.groups.map(g => g.kind === 'fixed' ? fixedGroup(sec, g) : choiceGroup(sec, g)),
    );
  }

  // ── ① Паспорт магии класса
  let passport = null;
  if (clsSec) {
    const cfg = clsSec.cfg;
    const mod = spellProfile(st).mods[cfg.stat] ?? 0;
    const HAS_RITUAL = ['Бард', 'Волшебник', 'Друид', 'Жрец', 'Изобретатель'];
    const focusMap = {
      'Бард': 'Музыкальный инструмент', 'Волшебник': 'Магический фокус или компонентный мешочек',
      'Жрец': 'Священный символ', 'Друид': 'Друидский фокус',
      'Колдун': 'Магический фокус', 'Чародей': 'Магический фокус',
      'Изобретатель': 'Воровские инструменты или набор умельца',
    };
    const feat = (label, text) => el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, label),
      el('span', { class: 'mech-spell-passport-feature-text' }, text));
    const features = [];
    if (cfg.type === 'book') features.push(feat('📖 Книга заклинаний', 'Ты знаешь все заклинания из книги. Каждое утро выбираешь, какие подготовить — найденные свитки тоже можно скопировать.'));
    if (HAS_RITUAL.includes(className)) features.push(feat('🕯 Ритуальное колдовство', 'Заклинания с тегом «ритуал» можно читать без расхода слота — на 10 мин дольше.'));
    if (focusMap[className]) features.push(feat('🔮 Фокусировка', `${focusMap[className]} — вместо материальных компонентов.`));
    if (className === 'Колдун')  features.push(feat('✦ Воззвания', 'На 2-м уровне выбираешь Воззвания — пассивные улучшения и способности от Покровителя.'));
    if (className === 'Чародей') features.push(feat('✦ Метамагия', 'На 3-м уровне: усиляй заклинания, тратя Очки Чародейства.'));
    if (st._spellPassportOpen === undefined) st._spellPassportOpen = true;
    const isOpen = st._spellPassportOpen;
    passport = el('div', { class: 'mech-spell-passport' },
      el('div', { class: 'mech-spell-passport-header' },
        el('span', { class: 'mech-spell-class-name' }, className),
        el('span', { class: 'mech-spell-type-badge' },
          el('span', { class: 'mech-spell-type-badge-label' }, 'Тип: '), CAST_TYPE_LABEL[cfg.type]),
        el('button', { class: 'mech-spell-passport-toggle',
          onClick: () => { st._spellPassportOpen = !st._spellPassportOpen; rebuild(); } }, isOpen ? '▲' : '▼'),
      ),
      isOpen ? el('div', { class: 'mech-spell-passport-body' },
        el('div', { class: 'mech-spell-stat-line' },
          el('span', { class: 'mech-spell-stat-chip' }, STAT_SHORT_SG[cfg.stat]),
          el('span', { class: 'mech-spell-stat-hint' },
            `${STAT_LABEL_SG[cfg.stat]} — ключевая характеристика. Сложность спасброска: ${8 + 2 + mod}. Бонус атаки заклинанием: ${spellSigned(2 + mod)}.`),
        ),
        el('p', { class: 'mech-spell-flavor' }, SPELL_FLAVOR[className] || ''),
        features.length ? el('div', { class: 'mech-spell-passport-features' }, ...features) : null,
      ) : null,
    );
  }

  // ── ② Сводка счётчиков (липкая)
  const choiceGroups = res.sections.flatMap(s => s.groups.filter(g => g.kind === 'choice').map(g => ({ s, g })));
  const counter = el('div', { class: 'mech-spell-counter' },
    ...(choiceGroups.length ? choiceGroups.map(({ s, g }) => {
      const need = groupNeed(g, picks, taken), have = (picks[g.key] || []).length;
      return el('button', {
        class: 'mech-spell-counter-item spl-jump' + (have >= need ? ' is-done' : ''), type: 'button',
        onClick: () => document.getElementById('spl-' + g.key.replace(/[^\w-]/g, '_'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      }, `${s.type === 'class' ? '' : s.label.split(' — ').pop() + ': '}${g.title} ${have}/${need}`);
    }) : [el('span', { class: 'mech-spell-counter-item' }, missing.length
      ? 'Выберите класс, из списка которого черта даёт заклинания.'
      : 'Выбирать нечего — заклинания уже известны.')]),
  );

  // ── Фильтр
  const schools = [...new Set(choiceGroups.flatMap(({ g }) => groupOptions(g, picks).map(o => o.spell.school)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const searchInp = el('input', { class: 'mech-spell-search', type: 'text', placeholder: '🔍 Поиск по названию…' });
  searchInp.value = st._spellFilter || '';
  searchInp.addEventListener('input', () => { st._spellFilter = searchInp.value; rebuild(true); });
  const filterBar = choiceGroups.length ? el('div', { class: 'mech-spell-filter-bar' },
    searchInp,
    el('div', { class: 'mech-spell-schools' },
      el('button', { class: 'mech-spell-school-chip' + (!filterSchool ? ' is-active' : ''),
        onClick: () => { st._spellSchool = null; rebuild(); } }, 'Все'),
      ...schools.map(sch => el('button', {
        class: 'mech-spell-school-chip' + (filterSchool === sch ? ' is-active' : ''),
        onClick: () => { st._spellSchool = filterSchool === sch ? null : sch; rebuild(); },
      }, sch)),
    ),
  ) : null;

  const lateNote = res.lateCaster
    ? el('p', { class: 'spl-hint spl-late' }, `Заклинания класса (${className}) придут на 2 уровне — на экране прокачки. Здесь — только заклинания расы и черты.`)
    : null;

  // ── Далее
  const nextBtn = el('button', {
    class: 'btn btn-primary mech-next-btn' + (missing.length ? ' is-disabled' : ''),
    onClick: () => { scheduleSave(st); goMech('equipment'); },
  }, 'Далее → Снаряжение');
  nextBtn.disabled = missing.length > 0;
  const left = missing.map(m => m.group ? `${m.section.label.split(' — ').pop()}: ${m.group.title} (${m.have}/${m.need})`
    : m.section.classPicker && !m.section.classPicker.value ? `${m.section.label}: класс списка` : `${m.section.label}: выбор на шаге «Класс»`);

  return el('div', { class: 'mech-spell-wrap' },
    el('div', { class: 'mech-step-header' }, el('h2', { class: 'mech-step-title' }, '🔮 Заклинания')),
    passport,
    lateNote,
    counter,
    filterBar,
    ...res.sections.map(sectionEl),
    el('div', { class: 'mech-step-footer' },
      left.length ? el('p', { class: 'spl-left' }, 'Осталось выбрать: ' + left.join(' · ')) : null,
      nextBtn),
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
      // 2026-09-26: здесь только ПРЕДМЕТЫ. Владение инструментом выбрано на шаге «Предыстория»
      // и отсюда не меняется; предмет по умолчанию равен ему, но может отличаться.
      mecSyncBgItems(st);
      const bgChoiceEls = [
        ...activeBgMatChoices.filter(ch => ch.type === 'bg_equipment')
          .map(ch => makeChoiceSel(bgChoiceOptions(ch.type), `bgch_${ch.type}`, st, renderBody)),
        ...mecBgItemChoices(st).map(({ ch, profVal }) => buildBgItemEl(st, ch, profVal)),
      ];
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

      // ── Верхняя панель статистики (золото + вес) ──────────────────────────────
      const statGoldLeftEl  = el('span', { class: 'equip-buy-stat-v' });
      const statWeightEl    = el('span', { class: 'equip-buy-stat-v' });
      function refreshTopStats() {
        const left = rolled ? cartGoldLeft(st) : null;
        const tw   = cartTotalLb(st);
        const cap  = charCarryCap(st);
        if (left !== null) {
          statGoldLeftEl.textContent = `${fmtGp(left)} / ${st.mecEquipGold} зм`;
          statGoldLeftEl.className   = `equip-buy-stat-v${left < 0 ? ' is-danger' : ''}`;
        } else {
          statGoldLeftEl.textContent = '— зм';
          statGoldLeftEl.className   = 'equip-buy-stat-v is-pending';
        }
        statWeightEl.textContent = `${tw} / ${cap} фнт.`;
        statWeightEl.className   = `equip-buy-stat-v${tw > cap ? ' is-danger' : ''}`;
      }
      refreshTopStats();

      // ── Кнопка броска ──────────────────────────────────────────────────────────
      const rollRow = !rolled
        ? (() => {
            const diceBtn = el('button', {
              class: 'btn btn-primary equip-roll-dice-btn',
              onClick: () => {
                if (!goldInfo) return;
                st.mecEquipGold = Array.from({ length: goldInfo.rolls },
                  () => Math.floor(Math.random() * goldInfo.die) + 1
                ).reduce((a, b) => a + b, 0) * goldInfo.mult;
                scheduleSave(st);
                renderBody();
              },
            }, `🎲 ${goldInfo ? goldInfo.formula : '…'}`, el('span', { class: 'equip-roll-dice-hint' }, ' зм'));
            diceBtn.disabled = !goldInfo; // DOM property, not setAttribute
            return el('div', { class: 'equip-roll-row' },
              el('span', { class: 'equip-roll-prompt' }, 'Бросьте кубики, чтобы узнать стартовый капитал:'),
              diceBtn,
            );
          })()
        : null;

      // ── Кнопка сброса (после броска) ──────────────────────────────────────────
      const resetRow = rolled
        ? el('div', { class: 'equip-reset-row' },
            el('button', { class: 'btn btn-ghost btn-sm equip-reset-btn',
              onClick: () => {
                st.mecEquipGold = null;
                st.mecCart      = [];
                scheduleSave(st);
                renderBody();
              },
            }, '↺ Сбросить бросок и корзину'),
          )
        : null;

      // ── Панель сверху с показателями ──────────────────────────────────────────
      const statsBar = el('div', { class: `equip-buy-statsbar${!rolled ? ' is-pre-roll' : ''}` },
        el('div', { class: 'equip-buy-stat-item' },
          el('span', { class: 'equip-buy-stat-l' }, rolled ? 'Осталось' : 'Стартовый капитал'),
          statGoldLeftEl,
        ),
        rolled
          ? el('div', { class: 'equip-buy-stat-item' },
              el('span', { class: 'equip-buy-stat-l' }, 'Вес'),
              statWeightEl,
            )
          : null,
        rollRow,
        resetRow,
      );

      // ── Подсказка новичку ──────────────────────────────────────────────────────
      // dbName — точное имя в equipment.js; label — отображаемое имя; qty — сколько добавлять
      const STARTER_ITEMS = [
        { label: 'Рюкзак',            dbName: 'Рюкзак',                    hint: 'для переноски всего',      qty: 1 },
        { label: 'Спальник',          dbName: 'Спальник',                  hint: 'отдых в дороге',           qty: 1 },
        { label: 'Бурдюк',            dbName: 'Бурдюк',                    hint: 'вода в пути',              qty: 1 },
        { label: 'Пайки (5 дней)',    dbName: 'Рационы (1 день)',          hint: 'еда в дороге',             qty: 5 },
        { label: 'Верёвка (50 фт)',   dbName: 'Верёвка пеньковая (50 фт)', hint: 'универсальный инструмент', qty: 1 },
        { label: 'Трутница',          dbName: 'Трутница',                  hint: 'разжечь костёр',           qty: 1 },
        { label: 'Факелы (10 шт.)',   dbName: 'Факел',                     hint: 'свет в темноте',           qty: 10 },
        { label: 'Зелье лечения',     dbName: 'Зелье лечения',             hint: 'спасёт жизнь',             qty: 1 },
      ];

      const buyRef = {};
      const buyModeNode = buildBuyMode(st, footBtn, refreshTopStats, buyRef);

      // Найти данные предмета по имени в SHOP_CATS
      function findEquipItem(dbName) {
        for (const cat of SHOP_CATS) {
          const it = cat.items.find(i => i.name === dbName);
          if (it) return { cat, it };
        }
        return null;
      }

      let _tipsOpen = false;
      const tipsBody = el('div', { class: 'equip-tips-body', style: 'display:none' },
        el('p', { class: 'equip-tips-intro' }, 'Опытные авантюристы всегда берут с собой базовый набор — даже если золото кончается:'),
        el('ul', { class: 'equip-tips-list' },
          ...STARTER_ITEMS.map(i => {
            const found = findEquipItem(i.dbName);
            const addBtn = el('button', { class: 'equip-tips-add-btn', onClick: () => {
              if (!found || !buyRef.addItem) return;
              const { cat, it } = found;
              const id = `${cat.id}::${it.name}`;
              for (let n = 0; n < i.qty; n++) {
                buyRef.addItem({ id, name: it.name, costGp: it.costGp, weightLb: parseWeightLb(it.weight), category: cat.label });
              }
            }}, '+ В корзину');
            return el('li', { class: 'equip-tips-item' },
              el('span', { class: 'equip-tips-name' }, i.label),
              el('span', { class: 'equip-tips-hint' }, ` — ${i.hint}`),
              addBtn,
            );
          }),
        ),
      );
      const tipsToggle = el('button', { class: 'equip-tips-toggle', onClick: () => {
        _tipsOpen = !_tipsOpen;
        tipsBody.style.display = _tipsOpen ? '' : 'none';
        tipsToggle.querySelector('.equip-tips-arrow').textContent = _tipsOpen ? '▲' : '▼';
      }},
        el('span', { class: 'equip-tips-icon' }, '💡'),
        el('span', {}, 'Совет новичку — что купить в первую очередь?'),
        el('span', { class: 'equip-tips-arrow' }, '▼'),
      );
      const tipsCard = el('div', { class: 'equip-tips-card' }, tipsToggle, tipsBody);

      bodyEl.append(statsBar, buyModeNode, tipsCard, footEl);
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
        migrateWizardState(char._wizardState ?? {}),
        { _charId: char.id },
      );
    }
  }
  // Restore draft or init fresh; step always comes from URL
  if (!_st) {
    const draft = loadDraft();
    _st = draft ? Object.assign(freshState(), migrateWizardState(draft)) : freshState();
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
