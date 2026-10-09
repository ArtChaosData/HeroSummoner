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
import * as EQ from '../equipment.js';
import * as PL from '../pools.js';
import { makeRulePanel, itemRuleNodes, groupRuleNodes, buildInventoryView, acBlock, kitContentRows } from '../equipment-view.js';
import { getSpellById } from '../data/spells.js';
import {
  buildSpellSections, prunePicks, takenMap, missingPicks, groupOptions, groupNeed, spellGrantSpecs,
  hasSpellSources, migrateSpellState, CLASS_NAME_BY_ID, LATE_CASTERS, SPELL_FEATS, STAT_SHORT as STAT_SHORT_SG, STAT_LABEL as STAT_LABEL_SG,
} from '../spell-groups.js';
import { RACE_DESCRIPTIONS } from '../data/race_descriptions.js';
import { BG_FEATURES } from '../data/background_features.js';
import * as DV from '../derive.js'; // П2: общий расчёт персонажа
import * as FM from '../feats-mech.js'; // П9: механика черт альт. человека (B-17/B-18/B-40)
import { RACE_TRAITS } from '../data/race_traits.js';
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
import { SUBCLASS_LVL1_FEATURES } from '../data/subclass_lvl1_features.js'; // B-23 (П6): умения подкласса 1 ур. — dnd.su
import { FEATURE_RESOURCES, resourceTitle } from '../data/feature_resources.js'; // B-41 (П6): ресурсы умений

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
    // Э3 (ТЗ 4.4.7 v0.32): снаряжение — см. eqState(); mecEquipChoices — предметы предыстории (bgch_*)
    mecEquip:        { mode: 'standard', encumbrance: false, classChoices: {}, gold: null, goldClass: null, cart: [], equippedManual: {} },
    mecEquipChoices: {},
  };
}

let _st = null;

// ─── Сброс (Б2, решение заказчика 2026-10-09): «Начать заново» и «Сбросить механику» ───
const isMecKey = k => k.startsWith('mec');
/** Очистить только механику: концепт (имя, история, портрет) и привязка к сохранённому персонажу остаются. */
function resetMechanics(st) {
  const f = freshState();
  for (const k of Object.keys(st)) if (isMecKey(k)) delete st[k];
  for (const [k, v] of Object.entries(f)) if (isMecKey(k)) st[k] = v;
  clearTimeout(_saveTimer); _saveTimer = null; _pendingSt = null;
  saveDraft(st);
}
/** Начать заново: весь черновик стирается; открытый сохранённый персонаж не меняется — дальше создаётся новый. */
function resetAll(st) {
  for (const k of Object.keys(st)) if (k !== 'step') delete st[k];
  const { step: _s, ...f } = freshState();
  Object.assign(st, f);
  clearTimeout(_saveTimer); _saveTimer = null; _pendingSt = null;
  localStorage.removeItem(DRAFT_KEY);
}
const hasAnyInput = st => !!st._charId || Object.entries(freshState()).some(([k, v]) =>
  k !== 'step' && JSON.stringify(st[k] ?? null) !== JSON.stringify(v));

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

let _progressRefresh = null; // перерисовка прогресс-бара механики (ставит buildMechanics)
let _progressRaf = 0;
let _progressBusy = false;
let _pendingSt = null;
function scheduleSave(st) {
  clearTimeout(_saveTimer);
  _pendingSt = st;
  _saveTimer = setTimeout(() => { _saveTimer = null; _pendingSt = null; saveDraft(st); }, 800);
  // прогресс-бар зависит от заполненности шагов («Озёра», правило 2) — обновляем после любого изменения
  if (_progressRefresh && !_progressRaf && !_progressBusy) {
    _progressRaf = requestAnimationFrame(() => {
      _progressRaf = 0;
      _progressBusy = true; // перерисовка сама может звать scheduleSave (чистка выборов) — без зацикливания
      try { _progressRefresh?.(); } finally { _progressBusy = false; }
    });
  }
}

// B-43 (Б2): выбор, сделанный менее чем за 0,8 с до закрытия / перезагрузки вкладки, не терялся —
// отложенное сохранение черновика выполняем сразу, когда страница уходит.
function flushDraft() {
  if (!_saveTimer) return;
  clearTimeout(_saveTimer); _saveTimer = null;
  const st = _pendingSt; _pendingSt = null;
  if (st) saveDraft(st);
}
window.addEventListener('pagehide', flushDraft);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });

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

  const restartBtn = hasAnyInput(st) ? el('button', { class: 'cnew-back-btn cnew-restart-btn', type: 'button', onClick: () => openConfirmModal({
    title: 'Начать заново?',
    text: st._charId
      ? `Мастер очистится полностью — концепт и механика. Сохранённый персонаж${st.name ? ` «${st.name}»` : ''} не изменится: дальше будет создаваться новый.`
      : 'Все выборы концепта и механики будут удалены. Отменить это нельзя.',
    okText: 'Да, начать заново',
    onOk: () => {
      const wasEdit = location.hash.startsWith('#/edit/');
      resetAll(st); toast('Черновик очищен', 'success');
      if (wasEdit) go('landing'); else root.replaceWith(buildLanding(st, go)); // из /edit/:id — на /create, чтобы перезагрузка не открыла старого персонажа
    },
  }) }, 'Начать заново') : null;

  const root = el('div', { class: 'cnew-landing' },
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

      el('div', { class: 'cnew-landing-cta' }, ctaBtn,
        // B-39 А: что нужно для «Создать персонажа» (иначе — только черновик в архив)
        allDone ? null : el('p', { class: 'cnew-cta-hint' },
          `Чтобы создать персонажа, заполните ${[!conceptDone && '«Концепт»', !mechDone && '«Механику»'].filter(Boolean).join(' и ')}. Пока можно сохранить черновик — он попадёт в архив.`)),
      restartBtn,
    ),
  );
  return root;
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

// ord — порядковый номер шага для st.mecMaxStep (ТЗ v0.41): шаг «Компетентность» вставлен с дробным ord 2.5,
// чтобы у сохранённых черновиков (mecMaxStep — прежний индекс) номера остальных шагов не сдвинулись.
const MECH_STEPS = [
  { id: 'class',      label: 'Класс',          ord: 0 },
  { id: 'race',       label: 'Раса',           ord: 1 },
  { id: 'background', label: 'Предыстория',    ord: 2 },
  { id: 'expertise',  label: 'Компетентность', ord: 2.5, expertise: true },
  { id: 'stats',      label: 'Характеристики', ord: 3 },
  { id: 'spells',     label: 'Заклинания',     ord: 4, magic: true },
  { id: 'equipment',  label: 'Снаряжение',     ord: 5 },
  { id: 'final',      label: 'Финал',          ord: 6 },
];
const stepOrd = id => MECH_STEPS.find(s => s.id === id)?.ord ?? 0;
/** Шаг 4.4.4a «Компетентность» — только у Плута и у Следопыта в версии Таши (ТЗ 4.4.4a). */
function hasExpertiseStep(st) {
  return st.mecClass === 'rogue' || (st.mecClass === 'ranger' && clsVariant(st) === 'tce');
}
/** Шаг после «Предыстории». */
function stepAfterBackground(st) { return hasExpertiseStep(st) ? 'expertise' : 'stats'; }

function isConceptDone(st) {
  return !!(
    st.name?.trim() && st.playerName?.trim() && st.alignment?.trim() &&
    st.traits?.trim() && st.ideals?.trim() && st.bonds?.trim() && st.flaws?.trim() &&
    st.backstory?.trim()
  );
}
function isMechDone(st) {
  // B-19 (страховка): Финал открывали И ни один шаг не остался незаполненным (правило 2 могло снять выбор)
  return (st.mecMaxStep || 0) >= stepOrd('final') && !mecFirstIncomplete(st);
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
  // Шаг 4.4.4a «Компетентность» (ТЗ v0.41): Плут — «Компетентность», Следопыт (Таша) — «Искусный исследователь»
  if (hasExpertiseStep(st)) {
    for (const v of [].concat(cc.expertise || []).filter(Boolean)) g.push(grant('expertise', v, 'class', cls, { kind: 'choice', slot: 'expertise' }));
    if (cls === 'ranger') {
      for (const v of [].concat(cc.deft_explorer_languages || []).filter(Boolean)) {
        g.push(grant('language', v, 'class', cls, { kind: 'choice', slot: 'deft_explorer_languages' }));
      }
    }
  }
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
    // Домен знаний: навыки домена — с компетентностью (ТЗ 4.4.4a: ставится на навыки, которые даёт сам домен)
    if ((sub.choices || []).some(c => c.id === 'skills' && c.expertise)) {
      for (const v of sc.skills || []) g.push(grant('expertise', v, 'subclass', sub.id, { kind: 'choice', slot: 'subclass_skills' }));
    }
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
    // Э3: владения оружием/доспехами от расы (нужны для «владеете» и КД на шаге «Снаряжение»)
    for (const [srcType, srcId] of [['race', raceId], ['subrace', subId]]) {
      for (const [pool, vals] of Object.entries(EQ.RACE_EQUIP_GRANTS[srcId] || {})) {
        for (const v of vals) g.push(grant(pool, v, srcType, srcId));
      }
    }
    for (const v of mecRaceGrantedSkills(st)) g.push(grant('skill', v, 'race', raceId));
    for (const v of st.mecRaceSkills || [])   g.push(grant('skill', v, subId ? 'subrace' : 'race', subId || raceId, { kind: 'choice', slot: 'race_skills' }));
    const choices = st.mecRaceChoices || {}, devices = st.mecDeviceChoices || {};
    const subTraitTitles = new Set(((raceDesc?.subraces || []).find(sd => sd.name === st.mecSubrace)?.traits || []).map(t => t.title));
    for (const t of mecActiveRaceTraits(raceName, st.mecSubrace)) {
      const [srcType, srcId] = subTraitTitles.has(t.title) && subId ? ['subrace', subId] : ['race', raceId];
      if (t.choice) {
        for (const v of (choices[t.title] || []).filter(Boolean)) {
          if (t.choice.type === 'language') g.push(grant('language', v, srcType, srcId, { kind: 'choice', slot: t.title }));
          else if (t.choice.type === 'feat')  g.push(grant('feat', featIdByName(v) || v, srcType, srcId, { kind: 'choice', slot: t.title }));
        }
      }
      if (t.recordAs && t.devices?.some(d => d.name === devices[t.title])) {
        if (t.recordAs === 'tool') g.push(grant('tool', devices[t.title], srcType, srcId, { kind: 'choice', slot: t.title }));
        else g.push(grant('feature', `${t.title}: ${devices[t.title]}`, srcType, srcId, { kind: 'choice', slot: t.title }));
      }
    }
    // П9 (ТЗ 4.4.3 ⑤а, п. 1–2): черта — +1 к характеристике, владения без выбора, спасбросок «Устойчивого»
    const featPicks = st.mecFeatAsi || {};
    let featBase = mecScoresNoFeat(st);
    for (const id of mecFeatIds(st)) {
      const m = FM.FEAT_MECH[id];
      if (!m) continue;
      const one = FM.featAsiMap([id], featPicks, featBase);
      for (const [k, v] of Object.entries(one)) { g.push(grant('asi', `${k}+${v}`, 'feat', id, m.asi?.choice ? { kind: 'choice', slot: 'feat_asi' } : {})); featBase = { ...featBase, [k]: featBase[k] + v }; }
      for (const v of m.armor || [])  g.push(grant('armor', v, 'feat', id));
      for (const v of m.weapon || []) g.push(grant('weapon', v, 'feat', id));
      if (m.saveFromAsi && m.asi.choice.includes(featPicks[id])) g.push(grant('save', FM.ABIL_NAME[featPicks[id]], 'feat', id, { kind: 'choice', slot: 'feat_save' }));
    }
    // П10 (ТЗ 4.4.3 ⑤а, п. 3, 5): выборы внутри черты — языки, оружие, навыки/инструменты
    for (const id of mecFeatIds(st)) {
      const ch = (st.mecFeatChoices || {})[id] || {};
      for (const v of (ch.languages || []).filter(Boolean)) g.push(grant('language', v, 'feat', id, { kind: 'choice', slot: 'feat_languages' }));
      for (const v of (ch.weapons || []).filter(Boolean))   g.push(grant('weapon', v, 'feat', id, { kind: 'choice', slot: 'feat_weapons' }));
      for (const k of (ch.skillsOrTools || []).filter(Boolean)) {
        const [pool, ...rest] = k.split('::');
        g.push(grant(pool === 'tool' ? 'tool' : 'skill', rest.join('::'), 'feat', id, { kind: 'choice', slot: 'feat_skilled' }));
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
    // B-21 (ТЗ «Свой ключ у каждого выбора шага»): у каждого выбора предыстории свой слот background_<пул>:<индекс>
    for (const v of mecBgChoiceValues(st)) {
      g.push(grant(v.pool, v.value, 'background', bgId, { kind: 'choice', slot: `background_${v.pool}:${v.ci}` }));
    }
  }
  // ── «Озёра», правило 3: замена владения, выданного двумя источниками (st.mecPoolReplace)
  for (const [key, r] of Object.entries(st.mecPoolReplace || {})) {
    if (!r?.value) continue;
    const pool = key.split(':')[0];
    const src = r.step === 'class' ? ['class', cls] : r.step === 'race'
      ? ['race', st.mecRace ? raceIdByName(st.mecRace.split('::')[1]) : null]
      : ['background', bg ? backgroundIdByName(bg.name) : null];
    g.push(grant(pool, r.value, src[0], src[1], { kind: 'replacement', slot: 'pool_replace:' + key, replaces: key.slice(pool.length + 1) }));
  }
  // ── Заклинания (шаг 4.4.6, Э2): класс, подкласс, раса, черта — id dnd.su, с источником и слотом
  const { res: spellRes, picks: spellPicks } = spellState(st);
  for (const s of spellGrantSpecs(spellRes, spellPicks)) g.push(grant(s.pool, s.value, s.sourceType, s.sourceId, s.opts));
  return g;
}

/**
 * Прибавка к максимуму хитов за каждый уровень (B-01/B-02, dnd.su 5e14):
 *  • Холмовой дварф, «Дварфийская выдержка»: +1 к максимуму и +1 с каждым новым уровнем (раса «Дварф»);
 *  • черта «Крепкий»: +2 × уровень, на котором взята, и +2 с каждым следующим (feats/118-tough);
 *  • подкласс с grants.hp_per_level (Наследие драконьей крови: +1) — из данных подкласса.
 * На 1 уровне всё это даёт ровно «бонус за уровень» × 1.
 */
function hpBonusPerLevel(st, grants) {
  const raceId = st.mecRace ? raceIdByName(st.mecRace.split('::')[1]) : null;
  const subId  = raceId && st.mecSubrace ? subraceIdByName(raceId, st.mecSubrace) : null;
  let b = 0;
  if (subId === 'dwarf-hill') b += 1;
  if (grants.some(g => g.pool === 'feat' && g.value === 'tough')) b += 2;
  b += clsSubclassObj(st)?.grants?.hp_per_level || 0;
  return b;
}

async function saveCharToDB(st, status) {
  const clsObj   = CLASS_DATA.find(c => c.id === st.mecClass);
  const clsName  = clsObj?.name ?? '';
  const bgName   = st.mecBackground ? st.mecBackground.split('::')[1] : '';
  const raceName = st.mecRace       ? st.mecRace.split('::')[1]       : '';
  const raceId   = raceIdByName(raceName);
  const asiMap   = mecTotalAsi(st); // П9: раса + черты

  const stats = {};
  for (const key of ['str','dex','con','int','wis','cha']) {
    stats[key] = (effectiveBase(st, key) ?? 8) + (asiMap[key] || 0);
  }
  // Capture wizard state for edit-draft flow (exclude portrait to save space)
  const { portrait: _p, ...wizardSnap } = st;

  mecSyncBgItems(st);
  const subObj  = clsSubclassObj(st);
  const grants  = buildCharacterGrants(st);

  const conMod = Math.floor(((stats.con || 8) - 10) / 2);
  const die    = CLASS_HP_DIE[clsName] || 8;
  const maxHp  = Math.max(1, die + conMod + hpBonusPerLevel(st, grants)); // 1 ур.: бонус «за уровень» × 1
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
    // schemaVersion 5 (B-22): умение предыстории — ссылка на умение предыстории PHB или своё (с Мастером)
    backgroundFeature: !bgName ? null : bgName !== 'Собственная предыстория' ? { from: bgName }
      : st.mecBgFeature?.custom ? { custom: { title: String(st.mecBgFeature.custom.title || '').trim(), text: String(st.mecBgFeature.custom.text || '').trim() } }
      : st.mecBgFeature?.from ? { from: st.mecBgFeature.from } : null,
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
    equipment:  eqRecord(st),
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
  clearTimeout(_saveTimer); _saveTimer = null; _pendingSt = null; // B-43: отложенное сохранение не воскрешает черновик
  localStorage.removeItem(DRAFT_KEY);
  return saved;
}

const SOURCEBOOKS = {
  '5e': [
    { id: 'PHB',  name: 'Player’s Handbook',                      desc: 'Основная книга правил — всегда активна.', locked: true },
    { id: 'XGtE', name: 'Xanathar’s Guide to Everything',         desc: 'Дополнительные подклассы, заклинания и правила.' },
    { id: 'TCE',  name: 'Tasha’s Cauldron of Everything',         desc: 'Необязательные правила и новые подклассы.' },
    { id: 'SCAG', name: 'Sword Coast Adventurer’s Guide',         desc: 'Расы и подклассы Побережья Мечей.' },
    { id: 'MToF', name: 'Mordenkainen’s Tome of Foes',           desc: 'Расы и монстры высших планов.' },
    { id: 'VGtM', name: 'Volo’s Guide to Monsters',              desc: 'Нестандартные расы и монстры.' },
    { id: 'MPMM', name: 'Mordenkainen Presents: Monsters of the Multiverse', desc: 'Обновлённые расы и монстры мультивселенной.' },
    { id: 'VRGR', name: 'Van Richten’s Guide to Ravenloft',      desc: 'Сеттинг ужасов и подклассы.' },
    { id: 'SCC',  name: 'Strixhaven: A Curriculum of Chaos',     desc: 'Академия магии — расы и подклассы.' },
    { id: 'WBW',  name: 'The Wild Beyond the Witchlight',        desc: 'Фейские расы и приключения.' },
    { id: 'MOT',  name: 'Mythic Odysseys of Theros',             desc: 'Греческий сеттинг — расы и подклассы.' },
    { id: 'GGR',  name: 'Guildmasters’ Guide to Ravnica',        desc: 'Сеттинг Равники — расы и гильдии.' },
    { id: 'RLW',  name: 'Eberron: Rising from the Last War',     desc: 'Сеттинг Эберрона — расы и подклассы.' },
    { id: 'SAS',  name: 'Spelljammer: Adventures in Space',      desc: 'Космические расы и правила.' },
    { id: 'AI',   name: 'Acquisitions Incorporated',             desc: 'Корпоративные правила и подкласс.' },
    { id: 'POA',  name: 'Princes of the Apocalypse',             desc: 'Приключение с доп. заклинаниями и предметами.' },
    { id: 'TP',   name: 'Tortle Package',                        desc: 'Раса Черепахолюдей.' },
    { id: 'OGA',  name: 'One Grung Above',                       desc: 'Раса Грунг.' },
    { id: 'LR',   name: 'Locathah Rising',                       desc: 'Раса Локата.' },
  ],
};

// 2026-09-28 (B-15): удалены SRC_CONTENT / buildSrcBlock / buildSrcPreview — нигде не вызывались,
// списки подклассов дополнений в них были не с dnd.su. Подклассы 1 ур. — js/data/class_lvl1_subclasses.js.

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
  // не вылезать за правый край экрана (всплывашки «Финала» у правых плиток/чипов)
  _srcTip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - _srcTip.offsetWidth - 8)) + 'px';
  _srcTip.style.top  = top + 'px';
}
function hideSrcTip() { _srcTip?.remove(); _srcTip = null; }

// ─── Mechanics: progress bar ──────────────────────────────────────────────────

function buildMechProgress(st, goMech, magic) {
  // Паладин/Следопыт без заклинаний расы/черты: шаг виден, но пропускается — «Магия придёт на 2 уровне» (ТЗ 4.4.6)
  const lateMagic = !magic && LATE_CASTERS.has(st.mecClass);
  const expert    = hasExpertiseStep(st);
  const steps     = MECH_STEPS.filter(s => (!s.magic || magic || lateMagic) && (!s.expertise || expert));
  const cur       = steps.findIndex(s => s.id === (st.mecStep || 'class'));
  // mecMaxStep — ord шага (MECH_STEPS); переводим в индекс видимого списка
  const maxIdx    = steps.filter(s => s.ord <= (st.mecMaxStep || 0)).length - 1;
  const statsIdx  = steps.findIndex(s => s.id === 'stats');
  const spellsIdx = magic ? steps.findIndex(s => s.id === 'spells') : -1;
  const spellsOk  = spellsIdx < 0 || spellStepDone(st);
  // «Озёра», правило 2: дальше первого незаполненного шага (Класс → Раса → Предыстория) не пускаем.
  // B-09 (2026-09-28): назад (на шаги до текущего) можно всегда; незаполненный шаг помечен «!»,
  // на заблокированном шаге — подсказка, что и где не заполнено.
  const pc = PL.conflicts(buildCharacterGrants(st));
  const gate = [['class', mecClassMissing(st, pc)], ['race', mecRaceMissing(st, pc)], ['background', mecBgMissing(st, pc)]];
  if (expert) gate.push(['expertise', mecExpertiseMissing(st)]); // шаг 4.4.4a
  const firstOpen = gate.findIndex(([, miss]) => miss.length);
  const openIdx = firstOpen < 0 ? Infinity : steps.findIndex(s => s.id === gate[firstOpen][0]);
  const labelOf = id => MECH_STEPS.find(s => s.id === id)?.label || id;

  /** Почему шаг i закрыт: { text, goto } — goto: шаг, куда ведёт подсказка. null — открыт. */
  function lockReason(i) {
    if (i > openIdx) {
      const [id, miss] = gate[firstOpen];
      return { text: `Не заполнен шаг «${labelOf(id)}» — ${mecLeftText(miss)}.`, goto: id };
    }
    const s = steps[i];
    if (s.id === 'stats' && st.mecBgOk === false) return { text: 'Не заполнен шаг «Предыстория»: заполните выборы предыстории.', goto: 'background' };
    if (statsIdx >= 0 && i > statsIdx && !st.mecStatsOk) return { text: 'Не заполнен шаг «Характеристики»: распределите все значения.', goto: 'stats' };
    if (spellsIdx >= 0 && i > spellsIdx && !spellsOk) return { text: 'Не заполнен шаг «Заклинания»: выберите все заклинания.', goto: 'spells' };
    if (i > maxIdx) {
      const prev = steps[Math.min(maxIdx, steps.length - 1)];
      return { text: `Шаги открываются по порядку: закончите «${prev.label}» и нажмите «Далее».`, goto: prev.id };
    }
    return null;
  }

  const hint = el('p', { class: 'mech-progress-hint', hidden: true });
  function showHint(r) {
    hint.innerHTML = '';
    hint.append('🔒 ' + r.text + ' ');
    if (r.goto && r.goto !== st.mecStep) {
      hint.append(el('button', { class: 'mech-progress-hint-go', onClick: () => goMech(r.goto) }, `Перейти к шагу «${labelOf(r.goto)}» →`));
    }
    hint.hidden = false;
  }

  const nav = el('nav', { class: 'mech-progress' },
    ...steps.flatMap((s, i) => {
      if (lateMagic && s.id === 'spells') {
        const b = el('button', { class: 'mech-step is-future is-late', disabled: 'true', title: 'Магия придёт на 2 уровне' }, s.label);
        return i < steps.length - 1 ? [b, el('span', { class: 'mech-sep' }, '›')] : [b];
      }
      // Назад — всегда; вперёд — если шаг уже открывали и ничего до него не блокирует
      const lock = i < cur ? null : lockReason(i);
      const reachable = i < cur || (i <= maxIdx && !lock);
      // П4 (B-31): заклинание снято в окне совпадений — шаг «Заклинания» помечен «!», пока не выбрано новое
      const spellIssue = s.id === 'spells' && spellsIdx >= 0 && i <= maxIdx && !spellsOk && i !== openIdx;
      const hasIssue = i === openIdx || spellIssue;
      const cls = 'mech-step'
        + (i === cur ? ' is-current' : reachable ? ' is-past' : ' is-future is-locked')
        + (hasIssue ? ' has-issue' : '');
      const attrs = { class: cls };
      if (hasIssue) attrs.title = spellIssue ? cap1(mecLeftText(mecSpellsMissing(st))) : cap1(mecLeftText(gate[firstOpen][1]));
      if (i !== cur) {
        if (reachable) attrs.onClick = () => goMech(s.id);
        else {
          attrs['aria-disabled'] = 'true';
          attrs.title = lock.text;
          attrs.onClick = () => showHint(lock);
        }
      }
      const btn = el('button', attrs, s.label, hasIssue ? el('span', { class: 'mech-step-issue', 'aria-hidden': 'true' }, '!') : null);
      return i < steps.length - 1 ? [btn, el('span', { class: 'mech-sep' }, '›')] : [btn];
    }),
  );
  return el('div', { class: 'mech-progress-wrap' }, nav, hint);
}

// ─── Final step ───────────────────────────────────────────────────────────────

/**
 * КД с умениями класса 1 ур. (ТЗ v0.39, решение заказчика 2026-09-28; тексты — dnd.su, rules_levels.js / rules_text.js).
 * Лучший из: доспех + ЛОВ + щит (+1 «Оборона» в доспехе) · 10 + ЛОВ · ЗбД Варвара (10+ЛОВ+ТЕЛ, щит можно) ·
 * ЗбД Монаха (10+ЛОВ+МДР, без щита) · «Драконья устойчивость» (13+ЛОВ, без доспеха).
 * → { ac, how, src, base } — base: EQ.armorClass (доспех, щит, предупреждения).
 */
function classArmorClass(st, inv, stats, profs, { noCompare = false } = {}) {
  return DV.armorClassFor(mecDeriveCtx(st, inv, stats, profs), { noCompare }); // П2: общий расчёт (js/derive.js)
}
function classArmorClassRaw(st, inv, stats, profs) { return classArmorClass(st, inv, stats, profs, { noCompare: true }); }
/** П2: контекст общего расчёта из состояния мастера (те же поля, что в записи персонажа). */
function mecDeriveCtx(st, inv, stats, profs) {
  return {
    classId: st.mecClass || null, subclassId: st.mecSubclass || null,
    fightingStyle: (st.mecClassChoices || {}).fighting_style || null,
    items: inv, stats, profs,
    raceName: st.mecRace ? st.mecRace.split('::')[1] : null, subraceName: st.mecSubrace || null,
    feats: mecFeatIds(st), // П9: «Подвижный» +10 фт.
  };
}

// ── П6/П7: выборы внутри умений, тёмное зрение, модификации заклинаний ──
const eNorm = v => String(v || '').toLowerCase().replace(/ё/g, 'е').trim();
const DV_TRAIT_RX = /тёмное зрение/i;
const DV_FT_RX = /(?:На расстоянии в|радиус|в пределах) (\d+) фут/;
/** Ключ подрасы в RACE_TRAITS по названию подрасы мастера. */
function rtSubKey(rt, subrace) {
  if (!rt || !subrace) return null;
  return Object.keys(rt.subraces || {}).find(k => k === subrace || k.startsWith(subrace.slice(0, 8)) || subrace.startsWith(k.split(' ')[0])) || null;
}
/** B-24: цвет наследия драконов (выбор на шаге «Раса»). */
function mecDragonAncestry(st) {
  return st.mecRace && /Драконорожд/.test(st.mecRace) ? (st.mecDeviceChoices || {})['Наследие драконов'] || null : null;
}
/** B-24: строка таблицы «Наследие драконов» dnd.su по выбранному цвету: { color, text, damage, form, save }. */
function mecDragonAncestryInfo(st) {
  const color = mecDragonAncestry(st);
  if (!color) return null;
  const t = (_resolveRaceDesc(st.mecRace.split('::')[1])?.traits || []).find(x => x.recordAs === 'dragonAncestry');
  const d = t?.devices?.find(x => x.name === color);
  if (!d) return null;
  const m = d.text.match(/Вид урона: ([^.]+)\. Оружие дыхания: (.+?) \(спасбросок ([^)]+)\)/) || [];
  return { color, text: d.text, damage: m[1] || '', form: m[2] || '', save: m[3] || '' };
}
/** B-24: название умения подкласса с выбором внутри («Драконий предок: Красный — огонь», «Сосуд гения: Ифрит (огонь)»). */
function mecSubFeatureName(st, subF, sl1, title) {
  const pick = id => clsSubChoice(st, id)[0] || null;
  if (subF.id === 'sorcerer-draconic' && title === 'Драконий предок' && pick('dragon_ancestor')) {
    const c = pick('dragon_ancestor');
    const dmg = Object.entries(sl1.ancestorDamage || {}).find(([k]) => eNorm(k) === eNorm(c))?.[1];
    return `Драконий предок: ${c}${dmg ? ` — ${dmg.toLowerCase()}` : ''}`;
  }
  if (subF.id === 'warlock-genie' && title === 'Сосуд гения' && pick('genie_kind')) {
    const m = pick('genie_kind').match(/^(\S+) \((?:[^;]+); ([^)]+)\)$/);
    return m ? `Сосуд гения: ${m[1]} (${m[2]})` : `Сосуд гения: ${pick('genie_kind')}`;
  }
  if (subF.id === 'sorcerer-divine-soul' && title === 'Божественная магия' && pick('affinity')) return `Божественная магия: ${pick('affinity')}`;
  return title;
}
/** B-33: тёмное зрение персонажа — { ft (наибольшая), sources:[{label, ft}], replaced } или null. */
function mecDarkvision(st) {
  const raceName = st.mecRace ? st.mecRace.split('::')[1] : null;
  const rid = raceName ? raceIdByName(raceName) : null;
  const rt = rid ? RACE_TRAITS[rid] : null;
  const sources = [];
  if (rt) {
    const subKey = rtSubKey(rt, st.mecSubrace);
    for (const t of [...rt.traits, ...(subKey ? rt.subraces[subKey] : [])]) {
      const m = DV_TRAIT_RX.test(t.name) && [].concat(t.text).join(' ').match(DV_FT_RX);
      if (m) sources.push({ label: `«${t.name}» (${subKey && rt.subraces[subKey].includes(t) ? DV.subraceFullName(st.mecSubrace, raceName) : raceName})`, ft: +m[1], trait: t.name });
    }
  }
  const sub = clsSubclassObj(st);
  for (const f of (sub && SUBCLASS_LVL1_FEATURES[sub.id]?.features) || []) {
    const tx = f.paras.filter(p => typeof p === 'string').join(' ');
    const m = /тёмн[а-яё]* зрени/i.test(tx) && tx.match(DV_FT_RX);
    if (m) sources.push({ label: `«${f.title}» (${sub.name})`, ft: +m[1] });
  }
  if (!sources.length) return null;
  const replaced = sources.some(x => x.trait === 'Превосходное тёмное зрение');
  const shown = replaced ? sources.filter(x => x.trait !== 'Тёмное зрение') : sources;
  return { ft: Math.max(...shown.map(x => x.ft)), sources: shown, replaced };
}
/** B-34: «умение меняет заклинание» — модификации заклинания у выбранного подкласса: [{ text, src, params }]. */
function mecSpellMods(st, sp) {
  const sub = clsSubclassObj(st);
  const mods = (sub && SUBCLASS_LVL1_FEATURES[sub.id]?.spellMods) || [];
  return mods.filter(m => eNorm(m.spell) === eNorm(sp?.name)).map(m => ({
    text: m.text, src: `${sub.name}, «${m.feature}»`,
    params: { range: /дистанци/i.test(m.text), castingTime: /действием|накладывать/i.test(m.text) },
  }));
}

// ── П10: карточка черты на шаге «Раса» (ТЗ 4.4.3 ⑤а, п. 3, 5) ──
/** Набор <select> на N слотов: groups — [{ label?, options: [{ value, text }] }]; why(value) → причина замка или null. */
function featSlotSelects({ count, values, groups, why, placeholder, onSet }) {
  const vals = Array.from({ length: count }, (_, i) => (values || [])[i] || '');
  return el('div', { class: 'mech-race-choice-selects feat-slots' }, ...vals.map((val, idx) => {
    const others = new Set(vals.filter((_, i) => i !== idx && vals[i]));
    const optEl = o => {
      const w = o.value !== val ? (others.has(o.value) ? 'уже выбрано' : why?.(o.value)) : null;
      const opt = el('option', { value: o.value }, w ? `🔒 ${o.text} — ${w}` : o.text);
      if (w) opt.disabled = true;
      return opt;
    };
    const sel = el('select', { class: `equip-choice-sel${!val ? ' is-empty' : ''}` },
      el('option', { value: '' }, placeholder),
      ...groups.flatMap(g => g.label ? [el('optgroup', { label: g.label }, ...g.options.map(optEl))] : g.options.map(optEl)));
    sel.value = val;
    sel.addEventListener('change', () => { const next = [...vals]; next[idx] = sel.value; onSet(next); });
    return el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'));
  }));
}
function featChoiceState(st, id) {
  const all = st.mecFeatChoices || (st.mecFeatChoices = {});
  return all[id] || (all[id] = {});
}
/** Стихийный адепт: вид урона (dnd.su: «звук, кислота, огонь, холод или электричество»). */
function featDamagePicker(st, id, rerender) {
  const c = FM.FEAT_CHOICES[id], ch = featChoiceState(st, id);
  return el('div', { class: 'feat-choice' },
    el('span', { class: 'feat-choice-lbl' }, `«${FM.featById(id).name}» — вид урона:`),
    el('div', { class: 'vh-asi-chips feat-dmg-chips' }, ...c.damage.map(d => el('button', {
      class: `vh-asi-chip${ch.damage === d ? ' is-chosen' : ''}`, type: 'button',
      onClick: () => { ch.damage = d; scheduleSave(st); rerender(); },
    }, d))));
}
function buildFeatCard(st, id, rerender) {
  const feat = FM.featById(id);
  if (!feat) return null;
  const c = FM.FEAT_CHOICES[id] || {};
  const ch = featChoiceState(st, id);
  const set = (key, next) => { ch[key] = next; scheduleSave(st); rerender(); };
  const parts = [];
  const lbl = t => el('span', { class: 'feat-choice-lbl' }, t);
  if (c.languages) {
    const locks = mecLocks(st, 'language', ['feat:feat_languages']);
    parts.push(el('div', { class: 'feat-choice' }, lbl(`Языки (${c.languages}):`), featSlotSelects({
      count: c.languages, values: ch.languages, placeholder: '— выберите язык —',
      groups: [{ options: LANGUAGES.map(v => ({ value: v, text: v })) }],
      why: v => { const w = locks.get(PL.norm(v)); return w ? mecLockText(w) : null; },
      onSet: next => set('languages', next) })));
  }
  if (c.skillsOrTools) {
    const lS = mecLocks(st, 'skill', ['feat:feat_skilled']), lT = mecLocks(st, 'tool', ['feat:feat_skilled']);
    parts.push(el('div', { class: 'feat-choice' }, lbl(`Навыки или инструменты (${c.skillsOrTools}, в любом сочетании):`), featSlotSelects({
      count: c.skillsOrTools, values: ch.skillsOrTools, placeholder: '— навык или инструмент —',
      groups: [{ label: 'Навыки', options: [...ALL_SKILL_NAMES()].sort((a, b) => a.localeCompare(b, 'ru')).map(v => ({ value: 'skill::' + v, text: v })) },
               { label: 'Инструменты', options: ALL_TOOL_NAMES().map(v => ({ value: 'tool::' + v, text: v })) }],
      why: v => { const [p, ...r] = v.split('::'); const w = (p === 'tool' ? lT : lS).get(PL.norm(r.join('::'))); return w ? mecLockText(w) : null; },
      onSet: next => set('skillsOrTools', next) })));
  }
  if (c.weapons) {
    const own = EQ.equipProfs(buildCharacterGrants(st).filter(g => g.slot !== 'feat_weapons')).weapons;
    const W = grp => EQ.ITEMS.filter(i => i.category === 'weapon' && i.group?.startsWith(grp)).map(i => ({ value: i.name, text: i.name }));
    parts.push(el('div', { class: 'feat-choice' }, lbl(`Оружие (${c.weapons} вида, простое или воинское):`), featSlotSelects({
      count: c.weapons, values: ch.weapons, placeholder: '— выберите оружие —',
      groups: [{ label: 'Простое оружие', options: W('simple') }, { label: 'Воинское оружие', options: W('martial') }],
      why: v => (own.has(EQ.itemByName(v)?.id) ? 'уже владеете' : null),
      onSet: next => set('weapons', next) })));
  }
  if (c.maneuvers) {
    const M = list => list.map(v => ({ value: v, text: v }));
    parts.push(el('div', { class: 'feat-choice' }, lbl(`Приёмы мастера боевых искусств (${c.maneuvers}):`), featSlotSelects({
      count: c.maneuvers, values: ch.maneuvers, placeholder: '— выберите приём —',
      groups: [{ label: 'Player’s Handbook', options: M(MANEUVERS.PHB) }, { label: 'Tasha’s Cauldron of Everything', options: M(MANEUVERS.TCE) }],
      onSet: next => set('maneuvers', next) }),
      (ch.maneuvers || []).some(v => MANEUVERS.TCE.includes(v))
        ? el('p', { class: 'cls-choice-hint' }, 'Приёмы из Tasha’s Cauldron of Everything — уточните у Мастера.') : null));
    parts.push(el('div', { class: 'feat-choice' }, lbl('Сл приёмов — модификатор:'),
      el('div', { class: 'vh-asi-chips feat-dmg-chips' }, ...c.dcStat.map(k => el('button', {
        class: `vh-asi-chip${ch.dcStat === k ? ' is-chosen' : ''}`, type: 'button',
        onClick: () => { ch.dcStat = k; scheduleSave(st); rerender(); },
      }, FM.ABIL_NAME[k])))));
  }
  if (c.damage && !hasSpellStep(st)) parts.push(featDamagePicker(st, id, rerender)); // без шага «Заклинания» — здесь
  else if (c.damage) parts.push(el('p', { class: 'cls-choice-hint' }, 'Вид урона черты выберете на шаге «Заклинания».'));
  return el('div', { class: 'feat-card' },
    el('details', { class: 'feat-card-text' },
      el('summary', {}, `Текст черты «${feat.name}»`),
      ...feat.text.map(t => el('p', {}, t)),
      feat.note ? el('p', { class: 'feat-note' }, el('b', {}, 'Пояснение dnd.su: '), feat.note) : null,
      el('a', { class: 'spl-link', href: feat.url, target: '_blank', rel: 'noopener' }, 'на dnd.su ↗')),
    ...parts);
}

/** B-34: строка параметров карточки заклинания (изменённые умением — подсвечены) + строка «Для вас (…): …». */
function spellParamsEls(st, sp) {
  const mods = mecSpellMods(st, sp);
  const hi = { castingTime: mods.some(m => m.params.castingTime), range: mods.some(m => m.params.range) };
  const parts = [['castingTime', sp.castingTime], ['range', sp.range], ['duration', sp.duration]].filter(([, v]) => v);
  const params = el('div', { class: 'spl-params' }, ...parts.flatMap(([k, v], i) => [
    i ? ' · ' : null,
    hi[k] ? el('span', { class: 'spl-param-mod', title: 'Для вас меняется — см. ниже' }, v) : v,
  ]).filter(x => x !== null));
  const modEls = mods.map(m => el('div', { class: 'spl-mod' }, el('b', {}, `Для вас (${m.src}): `), m.text.replace(/^Для вас /, '')));
  return [params, ...modEls];
}

function buildFinalStep(st, goMech, go) {
  // Тексты «Ритуальное колдовство» — rules_levels.js (ленивая загрузка; после неё «Финал» перерисуется)
  // (умения подкласса 1 ур. — статический subclass_lvl1_features.js, B-23)
  if (!_rulesLevels) import('../data/rules_levels.js').then(m => { _rulesLevels = m.RULES_LEVELS; }).then(() => {
    const cur = document.querySelector('.final-body');
    if (cur) cur.replaceWith(buildFinalStep(st, goMech, go));
  }).catch(() => {});
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

  const asiMap   = mecTotalAsi(st); // П9: раса + черты
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

  // ── Общие данные «Финала» (v0.39, B-11): реестр владений, характеристики, инвентарь ──
  const fGrants = buildCharacterGrants(st);
  const fStats  = eqStats(st);
  const fMod    = k => statMod(fStats[k] ?? 10);
  const PB      = 2;
  const skillGrant = new Map();   // norm(навык) → grant (первый источник)
  for (const g of fGrants) if (g.pool === 'skill' && !skillGrant.has(PL.norm(g.value))) skillGrant.set(PL.norm(g.value), g);
  // Компетентность (шаг 4.4.4a, Домен знаний): бонус мастерства ×2 — только для владений персонажа
  const expertSet = new Set(fGrants.filter(g => g.pool === 'expertise').map(g => PL.norm(g.value)));
  const EXPERT_TIP = 'Компетентность — бонус мастерства удваивается.';
  const skillPB = name => (skillGrant.has(PL.norm(name)) ? PB * (expertSet.has(PL.norm(name)) ? 2 : 1) : 0);
  const expBadge = () => el('span', { class: 'sk-exp', title: EXPERT_TIP }, '×2');
  /** Всплывашка при наведении (и по тапу): название + текст. */
  function tipOn(node, name, desc) {
    node.classList.add('has-ftip');
    node.addEventListener('mouseenter', e => showSrcTip(e, { name, desc }));
    node.addEventListener('mouseleave', hideSrcTip);
    node.addEventListener('click', e => { e.stopPropagation(); showSrcTip(e, { name, desc }); setTimeout(hideSrcTip, 6000); });
    return node;
  }

  // ── Overview (class / race / background) ────────────────────────────────
  function overviewCard(label, value, step, extra = {}) {
    const card = el('div', { class: `final-card${extra.ref ? ' is-ref' : ''}` },
      el('span', { class: 'final-card-label' }, label, extra.info || null),
      el('span', { class: `final-card-value${!value ? ' is-empty' : ''}` }, value ?? '—'),
      extra.meta ? el('span', { class: 'final-card-meta' }, extra.meta) : null,
      editBtn(step),
    );
    return card;
  }
  const bgFeat = mecBgFeature(st); // B-22: у «Собственной» — выбранное умение (или своё, с Мастером)
  const bgInfo = bgFeat ? tipOn(el('span', { class: 'cls-info-btn final-info' }, 'i'), `Умение: ${bgFeat.title}`, bgFeat.paras.join(' ') || 'Своё умение — с разрешения Мастера.') : null;
  const overviewRow = el('div', { class: 'final-overview' },
    overviewCard('Класс',      DV.classLabel(clsName, clsSubclassObj(st)?.name), 'class'), // B-32
    overviewCard('Раса',       DV.raceLabel(raceName, subrace, mecDragonAncestry(st)), 'race'), // B-24
    overviewCard('Предыстория', bgName, 'background', { ref: true, info: bgInfo, meta: bgName ? 'справочно · владения — в блоке «Владения»' : null }),
  );

  // ── Stats + Skills (ab-block style, read-only) ───────────────────────────
  const clsOpts = clsData ? (clsData.list ?? Object.values(SKILLS_BY_AB).flat()) : [];

  function buildFinalAbBlock({ key, label }) {
    const base    = effectiveBase(st, key) ?? 8;
    const asi     = asiMap[key] || 0;
    const total   = base + asi;
    const mod     = statMod(total);
    const hasSave = (clsData?.saves.includes(key) ?? false) || mecFeatSaveKeys(st).includes(key); // П9: «Устойчивый»
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
      // v0.39: владение навыком — из реестра grants (все источники, включая расу и замены «Озёр»)
      const g         = skillGrant.get(PL.norm(name));
      const srcT      = g?.source?.type;
      const fromBg    = srcT === 'background';
      const fromClass = srcT === 'class' || srcT === 'subclass';
      const fromRace  = srcT === 'race' || srcT === 'subrace' || srcT === 'feat';
      const prof      = !!g;
      const expert    = prof && expertSet.has(PL.norm(name));
      const bonus     = mod + skillPB(name);
      let cbCls = 'sk-cb';
      if (fromBg)         cbCls += ' src-bg has-check';
      else if (fromClass) cbCls += ' src-class has-check';
      else if (fromRace)  cbCls += ' src-race has-check';
      if (expert) cbCls += ' is-expert';
      const row = el('div', { class: `skill-row locked${expert ? ' is-expert' : ''}` },
        el('div',  { class: cbCls }),
        el('span', { class: `sk-name${prof ? ' proficient' : ''}` }, name),
        expert ? expBadge() : null,
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: `sk-bonus${fromClass ? ' col-class' : fromBg ? ' col-bg' : fromRace ? ' col-race' : ''}` }, signNum(bonus)),
        ),
      );
      if (expert) row.title = `${name}: ${signNum(mod)} (мод.) + ${PB * 2} (бонус мастерства ×2, компетентность)`;
      return row;
    });

    if (key === 'wis') {
      skillEls.push(el('div', { class: 'skill-row locked passive-row' },
        el('div',  { class: 'sk-cb sk-cb-passive' }),
        el('span', { class: 'sk-name' }, 'Пасс. Внимательность'),
        el('div',  { class: 'sk-bonus-wrap' },
          el('span', { class: 'sk-bonus' }, String(10 + mod + skillPB('Восприятие') + FM.featPassive(mecFeatIds(st), 'perception'))), // П9
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
    el('div', { class: 'mech-stats-grid final-abs-grid' }, ...ABILITIES.map(buildFinalAbBlock)),
  );

  // ── Снаряжение (ТЗ 4.4.8 «Блок Снаряжение» + 4.4.7 «Надето и КД»): по категориям, доспех/щит — надет/снят ──
  const eqQ = eqState(st);
  const eqProfsF = eqProfs(st), eqStatsF = eqStats(st);
  const eqInv = eqInventory(st, eqProfsF, eqStatsF);
  const eqStatus = eqStepStatus(st, eqInv, eqProfsF, eqStatsF);
  const eqRules = makeRulePanel();
  let refreshCombatTiles = null; // B-35 (назначается ниже, после плиток)
  const equipSec = el('div', { class: 'final-section' },
    el('div', { class: 'final-section-hd' },
      el('span', { class: 'final-section-title' }, 'Снаряжение'),
      el('span', { class: 'final-equip-mode' }, eqQ.mode === 'purchase' ? 'Закуп' : 'Стандарт'),
      editBtn('equipment'),
    ),
    eqStatus.ok ? null : el('p', { class: 'eq-ac-warn' }, `⚠️ ${eqStatus.reason} — шаг «Снаряжение».`),
    buildInventoryView({
      entries: eqInv, coins: eqCoins(st), stats: eqStatsF, profs: eqProfsF, rules: eqRules, acTotal: false, size: mecRaceSize(st),
      acExtra: entries => classArmorClass(st, entries, eqStatsF, eqProfsF).base.warnings.filter(w => w.kind === 'ac-lower'), // B-35
      onToggle: entries => {
        for (const cat of ['armor', 'shield']) {
          const on = entries.find(e => e.equipped && !e.custom && EQ.itemById(e.id)?.category === cat);
          eqQ.equippedManual[cat] = on ? on.id : null;
        }
        scheduleSave(st);
        refreshCombatTiles?.(entries); // B-35: плитки КД и скорости пересчитываются сразу
      },
    }),
  );

  // ── Боевые параметры (v0.39, B-11): КД с умениями класса 1 ур., хиты, инициатива, скорость… ──
  const dexM = fMod('dex'), conM = fMod('con'), wisM = fMod('wis');
  const acF = classArmorClass(st, eqInv, eqStatsF, eqProfsF);
  const acBase = acF.base;
  const hpDie = CLASS_HP_DIE[clsName] || 8;
  const hpBonus = hpBonusPerLevel(st, fGrants);
  const hpMax = Math.max(1, hpDie + conM + hpBonus);
  const alert = fGrants.some(g => g.pool === 'feat' && g.value === 'alert');
  const initV = dexM + (alert ? 5 : 0);
  const speedTile = inv => { // П2/B-27: скорость — общий расчёт (тот же, что на листе)
    const sp = DV.speedFor(mecDeriveCtx(st, inv, eqStatsF, eqProfsF));
    return tile(sp.value, 'Скорость', 'фт.', 'Скорость', sp.note);
  };
  const acTile = c => tile(c.ac, 'КД', c.base.armor ? c.base.armor.name : 'без доспеха', `КД ${c.ac} = ${c.how}`, c.src + ' «Надет / снят» — в блоке «Снаряжение».', 'is-main');
  const featIdsF = mecFeatIds(st);
  const percFeat = FM.featPassive(featIdsF, 'perception'), invFeat = FM.featPassive(featIdsF, 'investigation'); // П9: «Внимательный»
  const percP = 10 + wisM + skillPB('Восприятие') + percFeat;
  function tile(v, k, sub, tipTitle = null, tipText = null, cls = '') {
    const t = el('div', { class: `final-tile ${cls}`.trim() },
      el('span', { class: 'final-tile-v' }, String(v)),
      el('span', { class: 'final-tile-k' }, k),
      sub ? el('span', { class: 'final-tile-s' }, sub) : null);
    return tipText ? tipOn(t, tipTitle, tipText) : t;
  }
  let combatTilesEl = null;
  const combatTiles = [
    acTile(acF),
    tile(hpMax, 'Хиты', 'максимум', `Хиты ${hpMax}`, `${hpDie} (кость хитов на 1 ур.) + ТЕЛ (${signNum(conM)})${hpBonus ? ` + ${hpBonus} (прибавка за уровень: дварфийская выдержка / «Крепкий» / подкласс)` : ''}.`, 'is-main'),
    tile(`1к${hpDie}`, 'Кость хитов', '×1'),
    tile(signNum(initV), 'Инициатива', alert ? 'ЛОВ + «Бдительный»' : 'ЛОВ'),
    speedTile(eqInv),
    tile(signNum(PB), 'Бонус мастерства', '1 ур.'),
    tile(percP, 'Пасс. внимат.', (expertSet.has(PL.norm('Восприятие')) && skillGrant.has(PL.norm('Восприятие')) ? '10 + Восприятие (×2)' : '10 + Восприятие') + (percFeat ? ` + ${percFeat}` : ''),
      percFeat ? `Пасс. внимательность ${percP}` : null, percFeat ? `10 + Восприятие (${signNum(wisM + skillPB('Восприятие'))}) + ${percFeat} («Внимательный»: «Вы получаете бонус +5 к пассивной проверке Мудрости (Восприятие) и пассивной проверке Интеллекта (Расследование).»)` : null),
  ];
  if (invFeat) { // П9 (решение 2026-10-09): «Пасс. расслед.» — только у персонажей с «Внимательным»
    const invP = 10 + fMod('int') + skillPB('Расследование') + invFeat;
    combatTiles.push(tile(invP, 'Пасс. расслед.', `10 + Расследование + ${invFeat}`, `Пасс. расследование ${invP}`,
      `10 + Расследование (${signNum(fMod('int') + skillPB('Расследование'))}) + ${invFeat} («Внимательный»).`));
  }
  const dvF = mecDarkvision(st); // B-33: тёмное зрение — одна плитка, наибольшая дальность
  if (dvF) combatTiles.push(tile(dvF.ft, 'Тёмное зрение', 'фт.', `Тёмное зрение ${dvF.ft} фт.`,
    `${dvF.sources.map(x => `${x.label}: ${x.ft} фт.`).join('; ')}. Берётся наибольшая дальность, не сумма.`
    + (dvF.replaced ? ' «Превосходное тёмное зрение» заменяет «Тёмное зрение».' : '')));
  combatTilesEl = el('div', { class: 'final-tiles' }, ...combatTiles);
  // B-35: после «надет/снят» в блоке «Снаряжение» — плитки КД и скорости сразу (индексы 0 и 4 в combatTiles)
  refreshCombatTiles = entries => {
    const c = classArmorClass(st, entries, eqStatsF, eqProfsF);
    const kids = combatTilesEl.children;
    kids[0]?.replaceWith(acTile(c));
    kids[4]?.replaceWith(speedTile(entries));
  };
  let magicTiles = [];
  if (hasSpellStep(st)) {
    const { res: mRes, picks: mPicks } = spellState(st);
    const cSec = mRes.sections.find(x => x.type === 'class');
    if (cSec) {
      const cfg = cSec.cfg, sm = spellProfile(st).mods[cfg.stat] ?? 0;
      const statS = STAT_SHORT_SG[cfg.stat];
      magicTiles.push(tile(8 + PB + sm, 'Сл спасброска', 'от заклинаний', 'Сл спасброска', `8 + бонус мастерства (${signNum(PB)}) + ${statS} (${signNum(sm)}).`));
      magicTiles.push(tile(signNum(PB + sm), 'Бонус атаки', 'заклинанием', 'Бонус атаки заклинанием', `Бонус мастерства (${signNum(PB)}) + ${statS} (${signNum(sm)}).`));
      const cols = PROG_COLS[st.mecClass] || [], vals = PROG_VALS[st.mecClass] || [];
      const si = cols.indexOf('Ячейки заклинаний'), li = cols.indexOf('Уровень ячеек');
      const slots = si >= 0 ? vals[si]?.[0] : null;
      if (slots && slots !== '—') magicTiles.push(tile(slots, `Ячейки ${li >= 0 ? vals[li]?.[0] : 1} круга`, st.mecClass === 'warlock' ? 'восст. — кор. отдых' : 'восст. — прод. отдых'));
      const gCan = cSec.groups.find(g => g.grant?.slot === 'cantrips');
      if (gCan) magicTiles.push(tile(gCan.count, 'Заговоры', 'известно'));
      const gPrep = cSec.groups.find(g => g.grant?.slot === 'prepared');
      const gBook = cSec.groups.find(g => g.grant?.slot === 'spellbook');
      const gKnown = cSec.groups.find(g => g.grant?.slot === 'spells');
      if (gPrep) {
        const have = (mPicks[gPrep.key] || []).length;
        const short = (gPrep.formula || '').replace(/\s*=\s*\d+$/, '').replace('уровень', 'ур.').replace(/ ½ уровня \(вниз\) \d+/, ' ½ ур.');
        magicTiles.push(tile(`${have} / ${gPrep.count}`, 'Подготовлено', short, `Максимум подготовленных: ${gPrep.count}`,
          `${gPrep.formula || ''}. ${gBook ? 'Выбираются из книги заклинаний' : 'Выбираются из списка класса'}; менять — после продолжительного отдыха.`));
      }
      if (gKnown) magicTiles.push(tile(gKnown.count, 'Известно', 'заклинаний 1 круга'));
      if (gBook) {
        const book = mPicks[gBook.key] || [], prep = new Set(mPicks[gPrep?.key] || []);
        magicTiles.push(tile(book.length, 'В книге', 'заклинаний 1 круга'));
        const rit = book.filter(id => !prep.has(id) && getSpellById(id)?.ritual);
        if (rit.length) {
          const rt = ritualRuleText(className_(st)) || '';
          magicTiles.push(tile(rit.length, 'Ритуалы без подготовки', 'из книги, не подготовлены', 'Ритуальное колдовство',
            `${rt}${rt ? '\n\n' : ''}Не подготовлены, но доступны ритуалом: ${rit.map(id => getSpellById(id)?.name).join(', ')}.`, 'is-ritual'));
        }
      }
    }
  }
  const combatSec = el('div', { class: 'final-section' },
    el('div', { class: 'final-section-hd' }, el('span', { class: 'final-section-title' }, 'Боевые параметры')),
    combatTilesEl,
    magicTiles.length ? el('div', { class: 'final-tiles is-magic' }, ...magicTiles) : null,
  );

  // ── Владения (v0.39): один блок из grants — все источники, подпись источника у значения ──
  const AB_SHORT2 = { str:'Сила', dex:'Ловкость', con:'Телосложение', int:'Интеллект', wis:'Мудрость', cha:'Харизма' };
  function srcTag(g) {
    const t = g.source?.type;
    if (t === 'class') return el('span', { class: 'final-src is-class' }, 'класс');
    if (t === 'subclass') return el('span', { class: 'final-src is-class' }, clsSubclassObj(st)?.name || 'подкласс'); // B-32
    if (t === 'subrace') return el('span', { class: 'final-src is-race' }, DV.subraceFullName(subrace, raceName) || 'подраса'); // B-32
    if (t === 'race') return el('span', { class: 'final-src is-race' }, 'раса');
    if (t === 'background') return el('span', { class: 'final-src is-bg' }, bgName || 'предыстория');
    if (t === 'feat') return el('span', { class: 'final-src is-race' }, FM.featById(g.source.id)?.name || 'черта'); // П9: подпись черты
    return null;
  }
  // Тексты dnd.su для владений, которых нет в каталоге снаряжения (100-tools, раздел XGE «Наземный и водный транспорт»)
  const TOOL_EXTRA = {
    'транспорт (водный)': 'Владение водным транспортом охватывает всё, что перемещается по водным путям. (dnd.su, «Инструменты», XGE)',
    'транспорт (наземный)': 'Владение наземным транспортом покрывает широкий спектр вариантов, от колесниц и паланкинов до повозок и телег. (dnd.su, «Инструменты», XGE)',
  };
  function profChip(g, pool, more = []) {
    const label = pool === 'save' ? (AB_SHORT2[g.value] || g.value) : cap1(String(g.value));
    const tags = [g, ...more].map(srcTag).filter(Boolean)
      .filter((t, i, a) => a.findIndex(x => x.textContent === t.textContent) === i); // B-33: один предмет — все источники
    const chip = el('span', { class: 'final-prof-chip' }, label, ...tags);
    if ((pool === 'skill' || pool === 'tool') && expertSet.has(PL.norm(g.value))) chip.append(expBadge());
    if (pool === 'tool') {
      const it = EQ.itemByName(g.value) || EQ.itemByName(EQ.TOOL_RENAMES?.[g.value] || '');
      const extra = TOOL_EXTRA[PL.norm(g.value)];
      const text = it?.description || extra || 'Описания этого инструмента на dnd.su нет — только цена и вес.';
      chip.append(el('span', { class: 'cls-info-btn final-info' }, 'i'));
      tipOn(chip, it?.name || label, text);
    }
    return chip;
  }
  const PROF_ROWS = [['save', 'Спасброски'], ['skill', 'Навыки'], ['armor', 'Доспехи'], ['weapon', 'Оружие'], ['tool', 'Инструменты'], ['language', 'Языки']];
  // B-33: оружие сравнивается по предмету каталога («короткие мечи» класса = «короткий меч» расы) — одна строка,
  // название — как у класса, источники — все
  const profKey = (g, pool) => {
    if (pool === 'weapon') { const ids = EQ.weaponProfIds(g.value); if (ids.length === 1) return `item:${ids[0]}`; }
    return PL.norm(g.value);
  };
  const profRowsEls = PROF_ROWS.map(([pool, label]) => {
    const groups = new Map();
    for (const g of fGrants.filter(x => x.pool === pool)) {
      const k = profKey(g, pool);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    }
    const list = [...groups.values()].map(gs => {
      const main = gs.find(g => g.source?.type === 'class' || g.source?.type === 'subclass') || gs[0];
      return profChip(main, pool, gs.filter(g => g !== main));
    });
    return [el('span', { class: 'final-prof-k' }, label),
      el('span', { class: 'final-prof-v' }, ...(list.length ? list : [el('span', { class: 'final-prof-none' }, 'нет')]))];
  }).flat();
  const profSec = el('div', { class: 'final-section final-profs-sec' },
    el('div', { class: 'final-section-hd' }, el('span', { class: 'final-section-title' }, 'Владения')),
    el('div', { class: 'final-profs-all' }, ...profRowsEls),
  );

  // ── Умения и особенности (v0.40, B-13): раса, класс, подкласс, предыстория, черты — тексты dnd.su ──
  // П6/П7: B-23 (подкласс — subclass_lvl1_features.js), B-41 (строка ресурса в названии), B-24 (выборы внутри умений),
  // B-33 (тёмное зрение — в плитке, не в «Умениях»)
  const featItems = [];   // { name, src, cls, paras: [строка | {h}] }
  const rulesParas = full => (full || []).flatMap(b => b.p ? [b.p] : b.h ? [{ h: b.h }] : []);
  const lvlF = 1;
  const resEnv = {
    level: lvlF, pb: PB,
    mods: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => [k, fMod(k)])),
    colVal: col => { const i = (PROG_COLS[st.mecClass] || []).indexOf(col); return i < 0 ? null : (PROG_VALS[st.mecClass]?.[i]?.[lvlF - 1] ?? null); },
  };
  const resName = (key, nm) => resourceTitle(nm, FEATURE_RESOURCES[key], resEnv);
  // Раса и подраса (js/data/race_traits.js — dnd.su; числа/владения/языки — в других блоках)
  const raceIdF = raceName ? raceIdByName(raceName) : null;
  const rt = raceIdF ? RACE_TRAITS[raceIdF] : null;
  const anc = mecDragonAncestryInfo(st);
  if (rt) {
    const subKey = rtSubKey(rt, subrace);
    for (const t of [...rt.traits, ...(subKey ? rt.subraces[subKey] : [])]) {
      if (DV_TRAIT_RX.test(t.name)) continue; // B-33: пассивное тёмное зрение — в плитке «Боевых параметров»
      let name = t.name, paras = t.text;
      if (anc && t.name === 'Наследие драконов') { name = `Наследие драконов: ${anc.color}`; paras = [{ h: anc.text }, ...paras]; }
      if (anc && t.name === 'Оружие дыхания') {
        const dice = (paras.join(' ').match(/урона (\d+к\d+)/) || [])[1] || '';
        paras = [{ h: `Сл ${8 + fMod('con') + PB} (8 + ТЕЛ ${signNum(fMod('con'))} + БМ ${PB})${dice ? ` · ${dice}` : ''} · ${anc.form} (спасбросок ${anc.save})` }, ...paras];
      }
      if (anc && t.name === 'Сопротивление урону') paras = [{ h: `Вид урона: ${anc.damage}` }, ...paras];
      const isSub = subKey && rt.subraces[subKey].includes(t);
      featItems.push({ name: resName(`race:${raceIdF}:${t.name}`, name), src: isSub ? DV.subraceFullName(subrace, raceName).toLowerCase() : 'раса', cls: 'is-race', paras });
    }
  }
  // Класс, 1 ур. (CLASS_FEATURES + тексты rules_levels.js)
  const CLASS_SKIP = new Set(['Использование заклинаний', 'Магия договора', 'Дополнительные заклинания', 'Варианты боевых стилей']);
  if (clsName) {
    const tce = clsVariant(st) === 'tce';
    const lvl1 = (CLASS_FEATURES[clsName] || {})[1] || [];
    const replaced = new Set(tce ? lvl1.filter(f => isOptionalFeature(f) && f.replaces).map(f => f.replaces) : []);
    const cc = st.mecClassChoices || {};
    for (const f of lvl1) {
      const nm = featureName(f);
      if (CLASS_SKIP.has(nm)) continue;
      if (isOptionalFeature(f) && !(tce && f.replaces)) continue;
      if (!isOptionalFeature(f) && replaced.has(nm)) continue;
      const bare = nm.replace(/\s*\(.*\)$/, '');
      const r = _rulesLevels?.[`${clsName}:${bare.toUpperCase()}`];
      if (nm === 'Боевой стиль' && cc.fighting_style) {
        featItems.push({ name: `Боевой стиль: ${cc.fighting_style}`, src: 'класс', cls: 'is-class', paras: rulesParas(RULES[`style:${cc.fighting_style}`]?.full) });
        for (const mv of [].concat(cc.maneuver || [])) {
          featItems.push({ name: `Приём: ${mv}`, src: 'класс', cls: 'is-class', paras: rulesParas(RULES[`maneuver:${mv}`]?.full) });
        }
        continue;
      }
      // Шаг 4.4.4a: к «Компетентности» / «Искусному исследователю» — что выбрано
      const expPick = (nm === 'Компетентность' || nm === 'Искусный исследователь') && hasExpertiseStep(st)
        ? [...[].concat(cc.expertise || []), ...(nm === 'Искусный исследователь' ? [].concat(cc.deft_explorer_languages || []) : [])].filter(Boolean)
        : [];
      featItems.push({ name: expPick.length ? `${nm}: ${expPick.join(', ')}` : resName(`class:${st.mecClass}:${bare}`, nm), src: 'класс', cls: 'is-class', paras: r ? rulesParas(r.full) : [] });
    }
  }
  // Подкласс, 1 ур. (B-23: subclass_lvl1_features.js — генератор из кэша dnd.su, все 31 подкласс)
  const subF = clsSubclassObj(st);
  const sl1 = subF ? SUBCLASS_LVL1_FEATURES[subF.id] : null;
  for (const f of sl1?.features || []) {
    featItems.push({ name: resName(`subclass:${subF.id}:${f.title}`, mecSubFeatureName(st, subF, sl1, f.title)), src: subF.name, cls: 'is-class', paras: f.paras });
  }
  // Предыстория (background_features.js — dnd.su)
  if (bgFeat) featItems.push({ name: bgFeat.title + (bgFeat.custom ? ' (с разрешения Мастера)' : ''), src: bgFeat.src, cls: 'is-bg', paras: bgFeat.paras }); // B-25 / B-22
  // Черты (feats.js — dnd.su)
  for (const g of fGrants.filter(x => x.pool === 'feat')) {
    const ft = FEATS.find(f => f.id === g.value);
    if (!ft) continue;
    const ch = (st.mecFeatChoices || {})[ft.id] || {};
    let name = ft.name;
    const paras = [...ft.text, ...(ft.note ? [{ note: ft.note }] : [])]; // П10: пояснение редакции dnd.su — отдельной пометкой
    if (ft.id === 'elemental-adept' && ch.damage) name = `Стихийный адепт: ${ch.damage}`;
    if (ft.id === 'inspiring-leader') name += ` (временные хиты: ${1 + fMod('cha')})`; // «вашему уровню + ваш модификатор Харизмы»
    if (ft.id === 'martial-adept' && ch.dcStat) {
      const dc = 8 + PB + fMod(ch.dcStat);
      paras.unshift({ h: `Сл приёмов ${dc} (8 + БМ ${PB} + ${FM.ABIL_NAME[ch.dcStat].slice(0, 3).toUpperCase()} ${signNum(fMod(ch.dcStat))})` });
    }
    featItems.push({ name: resName(`feat:${ft.id}`, name), src: ft.name, cls: 'is-race', paras });
    if (ft.id === 'martial-adept') for (const mv of (ch.maneuvers || []).filter(Boolean)) {
      featItems.push({ name: `Приём: ${mv}`, src: ft.name, cls: 'is-race', paras: rulesParas(RULES[`maneuver:${mv}`]?.full) });
    }
  }
  const featsSec = featItems.length ? el('div', { class: 'final-section' },
    el('div', { class: 'final-section-hd' }, el('span', { class: 'final-section-title' }, 'Умения и особенности')),
    el('div', { class: 'final-feats' }, ...featItems.map(f => el('details', { class: 'final-feat' },
      el('summary', {}, el('span', { class: 'final-feat-n' }, f.name), el('span', { class: `final-src ${f.cls}` }, f.src)),
      el('div', { class: 'final-feat-body' }, ...(f.paras.length
        ? f.paras.map(pp => typeof pp === 'string' ? el('p', {}, pp) : pp.note ? el('p', { class: 'feat-note' }, el('b', {}, 'Пояснение dnd.su: '), pp.note) : el('p', { class: 'final-feat-h' }, pp.h))
        : [el('p', { class: 'final-feat-none' }, 'Текста в данных нет.')])),
    ))),
  ) : null;

  // ── Заклинания (v0.39): карточками, как на шаге «Заклинания» ───────────────
  let spellsSec = null;
  if (hasSpellStep(st)) {
    const { res: sRes, picks: sPicks } = spellState(st);
    const clsRit = ritualRuleText(className_(st));
    function fCard(id, { prepared = false, later = 0, section = null } = {}) {
      const sp = getSpellById(id);
      if (!sp) return null;
      const badges = [];
      if (later > 1) badges.push(el('span', { class: 'spl-badge spl-badge--lvl' }, `с ${later} ур.`));
      if (sp.ritual) {
        const rb = el('span', { class: 'spl-badge spl-badge--ritual' }, '🕯 Ритуал');
        if (clsRit && section?.type === 'class') tipOn(rb, 'Ритуальное колдовство', clsRit);
        badges.push(rb);
      }
      if (sp.concentration) badges.push(el('span', { class: 'spl-badge' }, 'Конц.'));
      if (costlyMaterial(sp)) badges.push(el('span', { class: 'spl-badge spl-badge--mat', title: sp.components.material }, 'М: ' + sp.components.material));
      return el('div', { class: 'spl-card' + (prepared ? ' is-selected' : '') + (sp.ritual ? ' is-ritual' : '') },
        el('div', { class: 'spl-top' },
          el('span', { class: 'spl-mark' }, prepared ? '✓' : ''),
          el('div', { class: 'spl-head' }, el('span', { class: 'spl-name' }, sp.name), el('span', { class: 'spl-school' }, sp.school || ''))),
        ...spellParamsEls(st, sp), // B-34
        badges.length ? el('div', { class: 'spl-badges' }, ...badges) : null,
      );
    }
    const blocks = [];
    const group = (title, cards, sub = '') => {
      const cs = cards.filter(Boolean);
      if (cs.length) blocks.push(el('div', { class: 'final-spg' },
        el('div', { class: 'final-spg-t' }, title, sub ? el('span', {}, ` — ${sub}`) : null),
        el('div', { class: 'spl-grid' }, ...cs)));
    };
    for (const sec of sRes.sections) {
      const pre = sec.type === 'class' ? '' : `${sec.label}: `;
      const gPrep = sec.groups.find(g => g.grant?.slot === 'prepared');
      const gBook = sec.groups.find(g => g.grant?.slot === 'spellbook');
      const prepIds = new Set(gPrep ? (sPicks[gPrep.key] || []) : []);
      for (const g of sec.groups) {
        if (g.kind === 'fixed') { group(pre + g.title, g.fixed.map(f => fCard(f.spell.id, { later: f.from, section: sec }))); continue; }
        if (gBook && g === gPrep) continue;            // подготовленные волшебника — отдельной группой ниже
        const ids = sPicks[g.key] || [];
        if (g === gBook) {
          const prep = ids.filter(id => prepIds.has(id)), rest = ids.filter(id => !prepIds.has(id));
          group('Подготовленные', prep.map(id => fCard(id, { prepared: true, section: sec })), `${prep.length} из книги`);
          const nRit = rest.filter(id => getSpellById(id)?.ritual).length;
          group('В книге, не подготовлены', rest.map(id => fCard(id, { section: sec })),
            `${rest.length}${nRit ? ` · 🕯 ритуалы можно сотворить без подготовки` : ''}`);
          continue;
        }
        group(pre + g.title, ids.map(id => fCard(id, { prepared: g === gPrep, section: sec })), String(ids.length));
      }
    }
    spellsSec = el('div', { class: 'final-section' },
      el('div', { class: 'final-section-hd' },
        el('span', { class: 'final-section-title' }, 'Заклинания'),
        editBtn('spells'),
      ),
      ...blocks,
    );
  }

  // ── B-19, страховка: незаполненный шаг — предупреждение со ссылкой (персонаж не будет «Заполнен» на лендинге)
  const inc = mecFirstIncomplete(st);
  const incompleteNote = inc ? el('p', { class: 'mech-progress-hint final-incomplete', role: 'alert' },
    `⚠️ Персонаж ещё не готов: не заполнен шаг «${inc.label}» — ${mecLeftText(inc.missing)}. `,
    el('button', { class: 'mech-progress-hint-go', onClick: () => goMech(inc.id) }, `Перейти к шагу «${inc.label}» →`)) : null;
  // B-40: требования черт — предупреждение, не запрет
  const featWarnEls = mecFeatWarnings(st).map(w => el('p', { class: 'feat-req-warn', role: 'alert' }, '⚠️ ' + w));

  // ── Save button ───────────────────────────────────────────────────────────
  const saveBtn = el('button', {
    class: 'cnew-save-btn final-save-btn',
    onClick: () => { scheduleSave(st); go('landing'); },
  }, '← Назад к призыву');

  // ── Layout ────────────────────────────────────────────────────────────────
  return el('div', { class: 'mech-step-body final-body' },
    el('div', { class: 'final-scroll' },
      el('h2', { class: 'mech-step-title' }, 'Финал'),
      incompleteNote,
      ...featWarnEls,
      identSec,
      overviewRow,
      combatSec,
      profSec,
      featsSec,
      absSec,
      spellsSec,
      equipSec,
    ),
    el('div', { class: 'mech-foot' }, saveBtn),
  );
}

// ─── П4: «Окно конфликтов при переходе вперёд» (ТЗ «Озёра», B-19, B-31; тексты и вид — Гейт 0, 2026-10-03) ───
// Совпадения не снимаются молча: при любом переходе вперёд (кнопка «Далее» и клик по следующему шагу прогресс-бара)
// открывается окно; выбор остаётся в состоянии мастера, пока игрок не решит в окне («Остаться» — ничего не меняет).

/** Вид владения для текстов окна (решение заказчика: всегда называть вид — для согласования). */
const CF_KIND = {
  skill:    { nom: 'навык', which: 'который', chosen: 'выбран', other: 'другой навык', any: 'любой другой навык', title: 'Навык', ph: 'Выберите навык…' },
  language: { nom: 'язык', which: 'который', chosen: 'выбран', other: 'другой язык', any: 'другой язык', title: 'Язык', ph: 'Выберите язык…' },
  tool:     { nom: 'владение инструментом', which: 'которое', chosen: 'выбрано', other: 'другой инструмент', any: 'любое другое владение инструментом', title: 'Владение инструментом', ph: 'Выберите инструмент…' },
};

/** Источник владения для текстов окна: «предыстория «Преступник»» (gen — «предыстории «Преступник»»). */
function mecSrcName(st, g, gen = false) {
  const t = g?.source?.type;
  const raceName = st.mecRace?.split('::')[1] || '—';
  if (t === 'class')    return `${gen ? 'класса' : 'класс'} «${CLASS_DATA.find(c => c.id === st.mecClass)?.name || '—'}»`;
  if (t === 'subclass') return `${gen ? 'подкласса' : 'подкласс'} «${clsSubclassObj(st)?.name || '—'}»`;
  if (t === 'race')     return `${gen ? 'расы' : 'раса'} «${raceName}»`;
  if (t === 'subrace')  return `${gen ? 'расы' : 'раса'} «${DV.subraceFullName(st.mecSubrace, raceName)}»`; // B-39: без «Тёмный эльф (дроу) эльф»
  if (t === 'background') return `${gen ? 'предыстории' : 'предыстория'} «${mecBgObj(st)?.name || '—'}»`;
  if (t === 'feat')     return gen ? 'черты' : 'черта';
  return gen ? 'другого шага' : 'другой шаг';
}

/** Варианты выбора предыстории ch для пула pool (с группами «навигатор или язык», pick2of3). */
function mecBgChoiceOptions(ch, pool) {
  const poolOfType = t => (t === 'language' ? 'language' : t === 'skill' ? 'skill' : 'tool');
  if (BG_TOOL_TYPES.includes(ch.type)) return bgChoiceOptions(ch.type);
  const groups = ch.groups || ch.options;
  if (groups) return groups.flatMap(gr => (gr.type === 'fixed' ? (pool === 'tool' ? [gr.value] : []) : poolOfType(gr.type) === pool ? bgChoiceOptions(gr.type) : []));
  return bgChoiceOptions(ch.type);
}

/** Варианты слота, из которого сделан выбор g: { opts, optional }. */
function mecSlotOptions(st, g) {
  const slot = g.slot || '';
  const ALL = g.pool === 'skill' ? ALL_SKILL_NAMES() : g.pool === 'tool' ? ALL_TOOL_NAMES() : LANGUAGES;
  let opts = ALL, optional = false;
  if (slot === 'class_skills') opts = mecClsData(st)?.list ?? ALL_SKILL_NAMES();
  else if (slot === 'class_tools') {
    const spec = CLASS_TOOL_CHOICE[st.mecClass];
    if (spec) opts = (spec.groups || [{ type: spec.type }]).flatMap(gr => (gr.type === 'fixed' ? [gr.value] : bgChoiceOptions(gr.type)));
  } else if (slot === 'favored_enemy_language') {
    optional = clsEnemySpeaks((st.mecClassChoices || {}).favored_enemy) === 'maybe'; // «…если он вообще умеет говорить» (dnd.su)
  } else if (slot === 'race_skills') {
    const raceName = st.mecRace?.split('::')[1];
    const t = mecActiveRaceTraits(raceName, st.mecSubrace).find(x => x.skillChoice);
    opts = t?.skillChoice?.list || ALL_SKILL_NAMES();
  } else if (slot.startsWith('background_')) {
    const ch = mecBgObj(st)?.choices?.[Number(slot.split(':')[1])];
    if (ch) opts = mecBgChoiceOptions(ch, g.pool);
  } else if (slot === 'feat_skilled' || slot === 'feat_languages') { // П10: «Одарённый» — любой навык или инструмент, «Языковед» — любой язык
    opts = ALL;
  } else if ((g.source.type === 'race' || g.source.type === 'subrace') && g.pool === 'tool') {
    const t = mecActiveRaceTraits(st.mecRace?.split('::')[1], st.mecSubrace).find(x => x.title === slot);
    if (t?.devices) opts = t.devices.map(d => d.name);
  }
  return { opts: [...new Set(opts)], optional };
}

/** Заменить выбор g на значение val в его слоте (val пустое — оставить слот пустым). */
function mecSlotSet(st, g, val) {
  const slot = g.slot || '';
  const repStep = slot.startsWith('pool_replace:') ? st.mecPoolReplace?.[slot.slice(13)]?.step : null;
  mecPoolRemove(st, g);
  if (!val) return;
  const cc = st.mecClassChoices || (st.mecClassChoices = {});
  const keyFor = (groups, fallbackType) => {
    const gr = (groups || []).find(x => (x.type === 'fixed' ? x.value === val : bgChoiceOptions(x.type).includes(val)));
    return `${gr?.type || fallbackType}::${val}`;
  };
  if (slot === 'class_skills') (st.mecChosen || (st.mecChosen = [])).push(val);
  else if (slot === 'class_tools') {
    const spec = CLASS_TOOL_CHOICE[st.mecClass] || {};
    const m = st.mecClassToolChoice || (st.mecClassToolChoice = {});
    (m[st.mecClass] || (m[st.mecClass] = [])).push(keyFor(spec.groups || [{ type: spec.type }], spec.type));
  } else if (slot === 'favored_enemy_language') cc.favored_enemy_language = val;
  else if (slot === 'deft_explorer_languages') cc.deft_explorer_languages = [...[].concat(cc.deft_explorer_languages || []), val];
  else if (slot === 'subclass_languages') {
    const sc = st.mecSubclassChoices || (st.mecSubclassChoices = {});
    sc.languages = [...(sc.languages || []), val];
  } else if (slot === 'race_skills') st.mecRaceSkills = [...(st.mecRaceSkills || []), val];
  else if (slot === 'feat_languages' || slot === 'feat_skilled') { // П10
    const all = st.mecFeatChoices || (st.mecFeatChoices = {});
    const ch = all[g.source.id] || (all[g.source.id] = {});
    const key = slot === 'feat_languages' ? 'languages' : 'skillsOrTools';
    const v = slot === 'feat_languages' ? val : `${g.pool}::${val}`;
    const arr = [...(ch[key] || [])]; const i = arr.findIndex(x => !x);
    if (i >= 0) arr[i] = v; else arr.push(v);
    ch[key] = arr;
  }
  else if (slot.startsWith('pool_replace:')) st.mecPoolReplace[slot.slice(13)] = { step: repStep || PL.stepOf(g), value: val };
  else if (slot.startsWith('background_')) {
    const ci = slot.split(':')[1];
    const ch = mecBgObj(st)?.choices?.[Number(ci)];
    const d = st.mecBgChoiceData || (st.mecBgChoiceData = {});
    if (!ch) return;
    if (BG_TOOL_TYPES.includes(ch.type)) { d[ci] = [`${ch.type}::${val}`]; st.mecBgProfSplit = true; }
    else if (ch.groups || ch.options || ch.count >= 2 || ch.type === 'pick2of3') {
      d[ci] = [...(Array.isArray(d[ci]) ? d[ci] : []), keyFor(ch.groups || ch.options || [{ type: ch.type }], ch.type)];
    } else d[ci] = val;
  } else if (g.source.type === 'race' || g.source.type === 'subrace') {
    if (g.pool === 'language') { const rc = st.mecRaceChoices || (st.mecRaceChoices = {}); rc[slot] = [...[].concat(rc[slot] || []).filter(Boolean), val]; }
    else if (g.pool === 'tool') (st.mecDeviceChoices || (st.mecDeviceChoices = {}))[slot] = val;
  }
}

/**
 * B-31, заклинания (Гейт 0): фиксированный заговор/заклинание (раса, подкласс, черта) совпал с выбранным игроком
 * на шаге «Заклинания». Подготовка (жрец и др.): заклинание домена всегда подготовлено — в окно не попадает (вариант А).
 */
function mecSpellConflicts(st) {
  if (!st.mecClass) return [];
  const res = buildSpellSections(spellProfile(st));
  const raw = st.mecSpellPicks || {};
  const fixed = new Map();
  for (const sec of res.sections) for (const g of sec.groups) {
    if (g.kind === 'fixed') for (const f of g.fixed) if (f.from <= 1 && !fixed.has(f.spell.id)) fixed.set(f.spell.id, { sec, g });
  }
  const out = [];
  for (const sec of res.sections) for (const g of sec.groups) {
    if (g.kind !== 'choice' || g.fromGroup || g.grant?.slot === 'prepared') continue;
    for (const id of raw[g.key] || []) {
      const f = fixed.get(id);
      if (f && f.g.key !== g.key) out.push({ gkey: g.key, id, src: f.sec, spell: getSpellById(id) });
    }
  }
  return out;
}

/** Все нерешённые совпадения: правило 2 (выбор совпал), правило 3 (бонус), заклинания. */
function mecConflictBlocks(st) {
  const grants = buildCharacterGrants(st);
  const c = PL.conflicts(grants);
  const blocks = [];
  for (const g of c.removals) {
    const holder = grants.find(h => h !== g && h.pool === g.pool && PL.norm(h.value) === PL.norm(g.value)
      && (PL.isHard(h) || !c.removals.includes(h)));
    blocks.push({ type: 'lost', g, holder });
  }
  for (const r of c.replacements) if (!st.mecPoolReplace?.[r.key]?.value) blocks.push({ type: 'bonus', r });
  for (const s of mecSpellConflicts(st)) blocks.push({ type: 'spell', s });
  return blocks;
}

/** Для страховки (Финал, лендинг): первое нерешённое совпадение → { id, label, missing }. */
function mecConflictIncomplete(st) {
  const b = mecConflictBlocks(st)[0];
  if (!b) return null;
  const id = b.type === 'lost' ? PL.stepOf(b.g) : b.type === 'bonus' ? b.r.step : 'spells';
  const label = MECH_STEPS.find(s => s.id === id)?.label || id;
  const what = b.type === 'spell' ? `другое заклинание вместо «${b.s.spell?.name || '—'}»`
    : `замену совпавшего владения «${cap1(b.type === 'lost' ? b.g.value : b.r.value)}» (откроется при «Далее»)`;
  return { id, label, missing: [what] };
}

function closeConflictWindow() { document.querySelector('.cf-bg')?.remove(); document.removeEventListener('keydown', cfEsc); }
function cfEsc(e) { if (e.key === 'Escape') closeConflictWindow(); }

/**
 * Окно (на телефоне — шторка снизу). onGo(target?) — применить решения и перейти (target — шаг из кнопки блока
 * заклинаний, иначе исходный шаг перехода).
 */
function openConflictWindow(st, blocks, onGo) {
  closeConflictWindow();
  const grants = buildCharacterGrants(st);
  const pending = new Map(); // блок → выбранное значение ('' — не выбрано; '__empty__' — оставить пустым)
  const need = blocks.filter(b => b.type !== 'spell'); // заклинания не входят в «Осталось выбрать» и не мешают «Далее»
  const left = el('span', { class: 'cf-left' });
  const goBtn = el('button', { class: 'btn btn-primary' }, 'Далее');
  const sels = []; // Б2 (B-42): выбранное в одном поле окна недоступно в другом поле того же пула
  const refresh = () => {
    for (const { b, sel, pool } of sels) {
      const taken = new Set(sels.filter(x => x.b !== b && x.pool === pool).map(x => PL.norm(pending.get(x.b) || '')).filter(Boolean));
      for (const op of sel.options) {
        if (!op.value || op.value === '__empty__' || op.dataset.lock) continue;
        const busy = taken.has(PL.norm(op.value));
        op.disabled = busy;
        op.textContent = busy ? `${op.value} — уже выбрано в этом окне` : op.value;
      }
    }
    const n = need.filter(b => !pending.get(b)).length;
    left.textContent = n ? `Осталось выбрать: ${n}` : '';
    goBtn.disabled = n > 0;
    for (const b of blocks.filter(x => x.type === 'spell')) b.btn.disabled = n > 0;
  };
  const apply = target => {
    for (const b of blocks) {
      const v = pending.get(b);
      if (b.type === 'lost') mecSlotSet(st, b.g, v === '__empty__' ? '' : v);
      else if (b.type === 'bonus') st.mecPoolReplace[b.r.key] = { step: b.r.step, value: v };
      else if (b.type === 'spell') {
        const p = st.mecSpellPicks || {};
        p[b.s.gkey] = (p[b.s.gkey] || []).filter(id => id !== b.s.id);
      }
    }
    scheduleSave(st);
    closeConflictWindow();
    onGo(target);
  };
  const mkSelect = (b, options, placeholder, lockOwn, optional) => {
    const locks = mecLocks(st, lockOwn.pool, [lockOwn.slot], grants);
    // значения, уже выбранные в этом же слоте (кроме совпавшего), — не предлагаем: будет дубль внутри поля
    const same = new Set(grants.filter(x => x !== b.g && x.pool === lockOwn.pool && PL.slotKey(x) === lockOwn.slot).map(x => PL.norm(x.value)));
    options = options.filter(o => !same.has(PL.norm(o)));
    const free = options.filter(o => !locks.has(PL.norm(o)));
    // правило 4: все варианты слота заняты — любой того же вида
    const list = free.length ? options : (lockOwn.pool === 'skill' ? ALL_SKILL_NAMES() : lockOwn.pool === 'tool' ? ALL_TOOL_NAMES() : LANGUAGES);
    const sel = el('select', { class: 'cf-sel' },
      el('option', { value: '' }, placeholder),
      optional ? el('option', { value: '__empty__' }, '— Оставить пустым —') : null,
      ...[...list].sort((a, c) => a.localeCompare(c, 'ru')).map(o => {
        const why = locks.get(PL.norm(o));
        const op = el('option', { value: o }, why ? `🔒 ${o} — ${mecLockText(why)}` : o);
        if (why) { op.disabled = true; op.dataset.lock = '1'; }
        return op;
      }));
    sel.addEventListener('change', () => { pending.set(b, sel.value); refresh(); });
    sels.push({ b, sel, pool: lockOwn.pool });
    return sel;
  };
  const body = blocks.map(b => {
    if (b.type === 'lost') {
      const K = CF_KIND[b.g.pool] || CF_KIND.skill;
      const { opts, optional } = mecSlotOptions(st, b.g);
      const stepLbl = PL.STEP_LABEL[PL.stepOf(b.g)] || '—';
      const h = b.holder;
      const holderSameBg = h && h.kind !== 'fixed' && String(h.slot || '').startsWith('background_') && b.g.source.type === 'background';
      const txt = !h ? [`${cap1(K.nom)} `, el('b', {}, `«${cap1(b.g.value)}»`), ` уже есть. Выберите ${K.other}.`]
        : PL.isHard(h)
          ? [`${cap1(mecSrcName(st, h))} даёт ${K.nom} `, el('b', {}, `«${cap1(b.g.value)}»`), `, ${K.which} вы выбрали на шаге «${stepLbl}». Выберите ${K.other}${optional ? ' или оставьте пустым' : ''}.`]
          : holderSameBg
            ? [`${cap1(K.nom)} `, el('b', {}, `«${cap1(b.g.value)}»`), ` уже ${K.chosen} в поле «${mecBgFieldLabel(st, h.slot) || '—'}» этой предыстории. Выберите ${K.other}${optional ? ' или оставьте пустым' : ''}.`]
            : [`${cap1(K.nom)} `, el('b', {}, `«${cap1(b.g.value)}»`), ` уже ${K.chosen} на шаге «${PL.STEP_LABEL[PL.stepOf(h)] || '—'}» (${mecSrcName(st, h)}). Выберите ${K.other}${optional ? ' или оставьте пустым' : ''}.`];
      return el('div', { class: 'cf-blk lost' },
        el('p', { class: 'cf-tag' }, 'Выбор совпал'),
        el('p', { class: 'cf-txt' }, ...txt),
        mkSelect(b, opts.filter(o => PL.norm(o) !== PL.norm(b.g.value)), K.ph, { pool: b.g.pool, slot: PL.slotKey(b.g) }, optional));
    }
    if (b.type === 'bonus') {
      const K = CF_KIND[b.r.pool] || CF_KIND.skill;
      const srcs = b.r.holders.map(h => mecSrcName(st, h));
      const opts = b.r.pool === 'skill' ? ALL_SKILL_NAMES() : ALL_TOOL_NAMES();
      return el('div', { class: 'cf-blk bonus' },
        el('p', { class: 'cf-tag' }, 'Бонус от совпадения'),
        el('p', { class: 'cf-txt' }, `${K.title} `, el('b', {}, `«${cap1(b.r.value)}»`),
          ` дают и ${srcs.join(', и ')}. По правилам PHB вы можете выбрать ${K.any}.`),
        mkSelect(b, opts, K.ph, { pool: b.r.pool, slot: `${b.r.step}:pool_replace:${b.r.key}` }, false));
    }
    // заклинание
    const sp = b.s.spell;
    const isCantrip = (sp?.level ?? 0) === 0;
    const typeNom = { race: 'раса', subclass: 'подкласс', feat: 'черта', class: 'класс' }[b.s.src.type] || 'источник';
    const srcName = b.s.src.label.split(' — ').pop();
    b.btn = el('button', { class: 'btn btn-ghost btn-sm', onClick: () => apply('spells') }, 'Перейти к шагу «Заклинания» →');
    return el('div', { class: 'cf-blk lost' },
      el('p', { class: 'cf-tag' }, 'Выбор совпал'),
      el('p', { class: 'cf-txt' }, `${cap1(typeNom)} «${srcName}» даёт ${isCantrip ? 'заговор' : 'заклинание'} `, el('b', {}, `«${sp?.name || '—'}»`),
        `, ${isCantrip ? 'который' : 'которое'} вы выбрали на шаге «Заклинания». Выберите ${isCantrip ? 'другой заговор' : 'другое заклинание'}.`),
      b.btn);
  });
  goBtn.addEventListener('click', () => { if (!goBtn.disabled) apply(); });
  const stayBtn = el('button', { class: 'btn btn-ghost', onClick: closeConflictWindow }, 'Остаться');
  const win = el('div', { class: 'cf', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Есть совпадения' },
    el('div', { class: 'cf-grip' }),
    el('div', { class: 'cf-head' },
      el('p', { class: 'cf-title' }, 'Есть совпадения'),
      el('p', { class: 'cf-sub' }, 'Выберите замену, чтобы перейти дальше.')),
    el('div', { class: 'cf-body' }, ...body),
    el('div', { class: 'cf-foot' }, left, stayBtn, goBtn));
  const bg = el('div', { class: 'cf-bg' }, win);
  bg.addEventListener('click', e => { if (e.target === bg) closeConflictWindow(); });
  document.addEventListener('keydown', cfEsc);
  document.body.append(bg);
  refresh();
  (win.querySelector('select') || goBtn).focus?.();
}

// ─── Mechanics: main wrapper ──────────────────────────────────────────────────


function buildMechanics(st, go, container) {
  if (!st.mecStep || st.mecStep === 'edition') st.mecStep = 'class';
  if (st.mecStep === 'expertise' && !hasExpertiseStep(st)) st.mecStep = 'stats'; // класс сменили — шага 4.4.4a нет
  if (!st.mecSources || !st.mecSources.length) st.mecSources = ['PHB'];

  // Шаг «Заклинания» — у любого персонажа с источником заклинаний на 1 ур. (ТЗ v0.29)
  const magic = hasSpellStep(st);
  mecPoolSync(st); // «Озёра», правила 2–3 — до прогресс-бара и шага

  function goMech(step) {
    if (step === 'expertise' && !hasExpertiseStep(st)) step = 'stats'; // шаг 4.4.4a есть не у всех
    // П4 (B-19, B-31): при любом переходе вперёд — окно совпадений; решения применяются в окне, «Остаться» — ничего не меняет
    if (stepOrd(step) > stepOrd(st.mecStep || 'class')) {
      const blocks = mecConflictBlocks(st);
      if (blocks.length) { openConflictWindow(st, blocks, target => goMech(target || step)); return; }
    }
    closeConflictWindow();
    st.mecStep = step;
    const ord = stepOrd(step);
    if (ord > (st.mecMaxStep || 0)) st.mecMaxStep = ord;
    scheduleSave(st);
    container.innerHTML = '';
    container.append(buildMechanics(st, go, container));
  }

  let progressEl = buildMechProgress(st, goMech, magic);
  _progressRefresh = () => {
    if (!progressEl.isConnected) { _progressRefresh = null; return; }
    const next = buildMechProgress(st, goMech, hasSpellStep(st));
    progressEl.replaceWith(next);
    progressEl = next;
  };

  return el('div', { class: 'mech-wrap' },
    el('div', { class: 'mech-header' },
      el('span', { class: 'cnew-concept-hd-title' }, 'Механика'),
      el('div', { class: 'mech-header-btns' },
        el('button', { class: 'cnew-back-btn mech-reset-btn', type: 'button', onClick: () => openConfirmModal({
          title: 'Сбросить механику?',
          text: 'Класс, раса, предыстория, характеристики, заклинания и снаряжение будут очищены. Концепт (имя, история, внешность) останется.'
            + (st._charId ? ' Сохранённый персонаж изменится, только если вы сохраните его снова.' : ''),
          okText: 'Да, сбросить',
          onOk: () => { closeConflictWindow(); resetMechanics(st); container.innerHTML = ''; container.append(buildMechanics(st, go, container)); toast('Механика сброшена', 'success'); },
        }) }, 'Сбросить механику'),
        el('button', { class: 'cnew-back-btn', onClick: () => go('landing') }, '← Назад'),
      ),
    ),
    progressEl,
    el('div', { class: 'mech-content' },
      st.mecStep === 'class'      ? buildClassStep(st, goMech)
        : st.mecStep === 'race'       ? buildRaceStep(st, goMech)
        : st.mecStep === 'background' ? buildBackgroundStep(st, goMech)
        : st.mecStep === 'expertise'  ? buildExpertiseStep(st, goMech)
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
  bard:      { hitDie:'к8',  armor:'лёгкие',                        weapons:'простое, короткие мечи, длинные мечи, рапиры, ручные арбалеты', tools:'три музыкальных инструмента на выбор',        saves:['Ловкость','Харизма'] },
  cleric:    { hitDie:'к8',  armor:'лёгкие, средние, щиты',        weapons:'простое',                                                    tools:'нет',                                          saves:['Мудрость','Харизма'] },
  druid:     { hitDie:'к8',  armor:'лёгкие, средние (не металл), щиты (не металл)', weapons:'боевые посохи, булавы, дротики, дубинки, кинжалы, копья, метательные копья, пращи, серпы, скимитары', tools:'набор травника',                 saves:['Интеллект','Мудрость'] },
  fighter:   { hitDie:'к10', armor:'все, щиты',                    weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Сила','Телосложение'] },
  monk:      { hitDie:'к8',  armor:'нет',                          weapons:'простое, короткие мечи',                                     tools:'один вид ремесленных или муз. инструментов',  saves:['Сила','Ловкость'] },
  paladin:   { hitDie:'к10', armor:'все, щиты',                    weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Мудрость','Харизма'] },
  ranger:    { hitDie:'к10', armor:'лёгкие, средние, щиты',        weapons:'простое, воинское',                                          tools:'нет',                                          saves:['Сила','Ловкость'] },
  rogue:     { hitDie:'к8',  armor:'лёгкие',                       weapons:'простое, короткие мечи, длинные мечи, рапиры, ручные арбалеты', tools:'воровские инструменты',                     saves:['Ловкость','Интеллект'] },
  sorcerer:  { hitDie:'к6',  armor:'нет',                          weapons:'кинжалы, дротики, посохи, пращи, лёгкие арбалеты',           tools:'нет',                                          saves:['Телосложение','Харизма'] },
  warlock:   { hitDie:'к8',  armor:'лёгкие',                       weapons:'простое',                                                    tools:'нет',                                          saves:['Мудрость','Харизма'] },
  wizard:    { hitDie:'к6',  armor:'нет',                          weapons:'кинжалы, дротики, пращи, боевые посохи, лёгкие арбалеты',    tools:'нет',                                          saves:['Интеллект','Мудрость'] },
  artificer: { hitDie:'к8',  armor:'лёгкие, средние, щиты',        weapons:'простое',                                                    tools:'воровские инструменты, инструменты ремонтника', saves:['Телосложение','Интеллект'] },
};

// ─── Class step: builder ──────────────────────────────────────────────────────

// ─── Class step: выборы 1 ур., переключатель «PHB | Таша», подкласс ─────────────
// ТЗ v0.25, шаг 4.4.2 (③ инструменты/языки, ④ выборы 1 ур. + чек-лист, ⑤ подкласс).
// Данные: js/data/class_lvl1.js (ручные списки) и js/data/class_lvl1_subclasses.js
// (генерируется tools/gen_class_lvl1.py из docs/reviews/lvl1_choices.json).
// «Озёра выборов» — v0.34 (js/pools.js), шаг 4.4.4a «Компетентность» — v0.41 (buildExpertiseStep).
// Не сделано: фильтр TCE-расширений списков на шаге «Заклинания».

/** Версия класса: у Изобретателя всегда 'tce' (класс целиком из TCE), у остальных — переключатель. */
function clsVariant(st) {
  if (st.mecClass === 'artificer') return 'tce';
  return st.mecClassVariant === 'tce' ? 'tce' : 'phb';
}

function clsSkillProgress(st) {
  const clsData = mecClsData(st);
  if (!clsData) return { have: 0, need: 0 };
  // «Озёра», правило 4: список может открыться до любого навыка — считаем все выборы слота
  const have = (st.mecChosen || []).length;
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

  // П4: замена по правилу 3 выбирается в «Окне конфликтов» («Бонус от совпадения»), не в чек-листе

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
  if (st.mecClass === 'ranger' && next === 'phb') {
    const ex = [].concat(cc.expertise || []).filter(Boolean);
    const dl = [].concat(cc.deft_explorer_languages || []).filter(Boolean);
    if (ex.length) out.push(`компетентность «${ex.join(', ')}»`);
    if (dl.length) out.push(`языки «${dl.join(', ')}»`);
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
  if (st.mecClass === 'ranger' && next === 'phb') { delete cc.expertise; delete cc.deft_explorer_languages; } // шаг 4.4.4a
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
// Названия книг — как пишет dnd.su (по-английски), решение заказчика 2026-09-27;
// PHB тоже по-английски, апостроф ’ (Б2, решение заказчика 2026-10-09 по заключению @persona-expert)
const DNDSU_BOOK_TITLE = {
  PHB: 'Player’s Handbook', XGE: 'Xanathar’s Guide to Everything', SCAG: 'Sword Coast Adventurer’s Guide',
  TCE: 'Tasha’s Cauldron of Everything',
};
function subSourceInfo(code) {
  const s = code ? SOURCES.find(x => x.code === code) : null;
  if (s) return { name: DNDSU_BOOK_TITLE[code] || (s.nameEn || s.name).replace(/'/g, '’'), year: s.year, desc: s.description };
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
  return EQ.ITEMS.filter(w => w.category === 'weapon' && !(w.properties || []).some(p => p.id === 'two-handed')).map(w => w.name);
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
      rule?.source ? el('div', { class: 'cls-rules-src' }, 'Источник: ' + String(rule.source).replace(/'/g, '’')) : null,
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
  function multiChips(options, selected, n, onChange, blocked = new Map(), ruleFor = null, noted = new Map()) {
    const set = new Set(selected);
    const atLimit = set.size >= n;
    return el('div', { class: 'cls-chips' }, ...options.map(o => {
      const isPicked = set.has(o);
      const why = blocked.get(o);
      const note = !why && !isPicked ? noted.get(o) : null; // B-20: можно выбрать, но с подписью
      const dim = !isPicked && ((n > 1 && atLimit) || !!why); // n = 1 — как радио: можно сразу переключить
      const c = chip((why && !isPicked ? '🔒 ' : '') + o + (why && !isPicked ? ` — уже есть: ${why}` : note ? ` — ${note}` : ''), {
        picked: isPicked, dim, title: why ? `Уже есть: ${why}` : note ? cap1(note) : undefined,
        onClick: () => {
          if (why && !isPicked) return; // «Озёра», правило 1
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
    const locks = mecLocks(st, 'language', ['class:favored_enemy_language']); // «Озёра», правило 1
    const sel = el('select', { class: 'mech-bg-select' },
      el('option', { value: '' }, placeholder),
      ...LANGUAGES.map(l => {
        const why = locks.get(PL.norm(l));
        const o = el('option', { value: l }, why ? `🔒 ${l} — уже есть: ${why}` : l);
        if (why && l !== value) o.disabled = true;
        return o;
      }),
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
        blocked: mecLocks(st, 'tool', ['class:class_tools']), // «Озёра», правило 1
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
    const count    = clsData?.count ?? 0;
    const chosen   = new Set(st.mecChosen || []);
    // «Озёра»: правило 1 — навыки с других шагов/слотов видны заблокированными; правило 4 — если свободных не хватает, любой навык
    const locks    = mecLocks(st, 'skill', ['class:class_skills']);
    const wide     = PL.widenIfExhausted(clsData ? (clsData.list ?? ALL_SKILLS) : [], ALL_SKILLS, mecHardLocks(st, 'skill', ['class:class_skills']), count, [...chosen]); // B-20
    const opts     = wide.options;
    const clsPicks = [...chosen];
    const atLimit  = clsPicks.length >= count;

    const skillChips = [...opts].sort((a, b) => ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b)).map(name => {
      const isPicked   = chosen.has(name);
      const lockWhy    = !isPicked ? locks.get(PL.norm(name)) : null;
      const isFromSub  = !!lockWhy;
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
      }, (isPicked ? '✓ ' : isFromSub ? '🔒 ' : '') + name + (isFromSub ? ` — уже есть: ${lockWhy}` : ''));
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
      wide.widened ? el('p', { class: 'pool-info' },
        `Все навыки списка класса уже есть (${wide.exhausted.join(', ')}) — по правилу PHB можно выбрать любой навык.`) : null,
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
      on ? el('p', { class: 'cls-variant-warn' }, 'Включён вариант TCE (Tasha\'s Cauldron of Everything) — уточните у Мастера, какой вариант используется.') : null,
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
          el('div', { class: 'cls-chip-group' }, 'Player’s Handbook'),
          multiChips(MANEUVERS.PHB, pick, 1, onPick, new Map(), mRule),
          el('div', { class: 'cls-chip-group' }, 'Tasha’s Cauldron of Everything'), // B-08: названия книг как на dnd.su
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
      const feRule = { key: 'feat:Следопыт:ИЗБРАННЫЙ ВРАГ', title: 'Избранный враг', short: 'Против кого ваш персонаж особенно опасен: его легче выследить и о нём больше знаете.' };
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
    const poolGrants = buildCharacterGrants(st);
    const toBlocked = (opts, locks) => new Map(opts.filter(o => locks.has(PL.norm(o))).map(o => [o, locks.get(PL.norm(o))]));
    sub.choices.forEach(c => {
      const cur = clsSubChoice(st, c.id);
      const set = arr => { sc[c.id] = arr; save(); rerender(); };
      let body;
      if (c.from === '@language') {
        body = multiChips(LANGUAGES, cur, c.n, set, toBlocked(LANGUAGES, mecLocks(st, 'language', ['subclass:subclass_languages'], poolGrants)));
      } else if (c.from === '@weapon') {
        const sel = el('select', { class: 'mech-bg-select' },
          el('option', { value: '' }, '— не выбрано —'),
          ...clsHexWeaponOptions().map(w => el('option', { value: w }, w)));
        sel.value = cur[0] || '';
        sel.addEventListener('change', () => { sc[c.id] = sel.value ? [sel.value] : []; save(); });
        body = sel;
      } else {
        // B-20 «Приоритет подкласса»: навыки подкласса — всегда из своего списка (правило 4 не применяется);
        // уже полученный на другом шаге навык не 🔒, а с подписью — замену выберете на том шаге.
        let noted = new Map();
        if (c.id === 'skills') {
          const locks = mecLocks(st, 'skill', ['subclass:subclass_skills'], poolGrants);
          noted = new Map(c.from.filter(o => locks.has(PL.norm(o)) && !cur.includes(o))
            .map(o => [o, `уже есть: ${locks.get(PL.norm(o))} — там выберете замену`]));
        }
        body = multiChips(c.from, cur, c.n, set, new Map(), null, noted);
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
    mecPoolSync(st);
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

    detailEl.append(...[ // B-29: нативный append печатает null как текст «null» — пустые блоки отбрасываем
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, cls.name),
        buildVariantSwitch(cls),
        el('div', { class: 'mech-cls-roles' }, ...badges),
      ),
      buildVariantNote(cls),
      checklistEl,
      buildPoolPanel(st, 'class', rerender),
      el('p', { class: `mech-cls-rp rp-${cls.rp}` }, rpLabel(cls)),
      el('p', { class: 'mech-cls-rp rp-1' }, 'Ключевые характеристики: ' + cls.stats),
      el('p', { class: 'mech-cls-desc' }, cls.desc),
      buildProgressionSection(cls),
      buildProfBlock(cls),
      buildSkillBlock(),
      buildLvl1Section(cls),
      buildSubclassSection(cls),
    ].filter(Boolean));
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
          // ТЗ 4.4.7 «Смена класса»: снаряжение класса, бросок и корзина «Закупа» сбрасываются после подтверждения
          const eqLoss = st.mecClass && st.mecClass !== cls.id ? eqClassLosses(st) : [];
          if (eqLoss.length) {
            openConfirmModal({ title: `Сменить класс на «${cls.name}»?`, text: 'Сбросится снаряжение:', lines: eqLoss,
              okText: 'Да, сменить', onOk: () => { eqResetForClass(st); pick(); } });
            return;
          }
          pick();
        },
      },
        cls.name,
        tagEl,
      );
      function pick() {
          // ТЗ 4.4.2 «Смена класса»: сбрасываются все зависимые выборы
          if (st.mecClass !== cls.id) { clsResetForNewClass(st); eqResetForClass(st); pinnedRule = null; progAll = false; selLvl = null; }
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
      }
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

// B-14 (2026-09-28): названия — как на dnd.su (формы из текстов рас/подклассов dnd.su: «на Общем и Дварфийском»,
// «Гномьем», «Великаньем», «Первичном», «Подземном»). «Глубокая речь», «Небесный» — ⚠️ в кэше dnd.su не встретились.
const LANGUAGES     = ['Бездны','Великаний','Гномий','Гоблинский','Глубокая речь','Дварфийский','Драконий','Инфернальный','Небесный','Орочий','Первичный','Полуросликов','Сильван','Подземный','Эльфийский'];
// PHB (2014) feats, for the race-trait "choose one feat" selector (Alternate/Variant Human).
const PHB_FEATS = FEATS.map(f => f.name);   // 42 черты PHB — js/data/feats.js (dnd.su, генератор tools/gen_dndsu_extras.py)
// Э3 (решение заказчика 2026-09-28): списки инструментов — из таблицы dnd.su (100-tools) через js/data/equipment.js.
const INSTRUMENTS   = EQ.TOOL_NAMES.instrument;
const GAMING_SETS   = EQ.TOOL_NAMES.gaming;
const ARTISAN_TOOLS = EQ.TOOL_NAMES.artisan;

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
  if (type === 'bg_sample_tools') return bgSampleTools();
  return [];
}

/**
 * B-22 (ТЗ 4.4.4 «Собственная предыстория»): инструменты «из образцов других предысторий» — собираются из данных
 * предысторий: фиксированные владения (воровские, грим, фальсификация, травник, навигатор, транспорт) + списки выбора
 * (музыкальные, игровые наборы, ремесленные). Набора отравителя нет — его не даёт ни одна предыстория PHB.
 */
function bgSampleTools() {
  const out = new Set();
  for (const bg of Object.values(BACKGROUND_DATA).flat()) {
    if (bg.name === 'Собственная предыстория') continue;
    for (const t of bg.tools || []) out.add(t);
    for (const ch of bg.choices || []) {
      if (BG_TOOL_TYPES.includes(ch.type)) bgChoiceOptions(ch.type).forEach(t => out.add(t));
      for (const g of ch.groups || []) {
        if (g.type === 'fixed' && g.value) out.add(g.value);
        else if (BG_TOOL_TYPES.includes(g.type)) bgChoiceOptions(g.type).forEach(t => out.add(t));
      }
      for (const g of ch.options || []) if (BG_TOOL_TYPES.includes(g.type)) bgChoiceOptions(g.type).forEach(t => out.add(t));
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * B-22: умения предысторий PHB для «Собственной предыстории» — 13 основных + «Слуги» (Рыцарь) и «Дурная репутация»
 * (Пират); тексты — BG_FEATURES (dnd.su). → [{ from, title }] без повторов (варианты с тем же умением — один раз).
 */
function bgFeatureChoices() {
  const seen = new Set(), out = [];
  for (const [from, f] of Object.entries(BG_FEATURES)) {
    if (seen.has(f.title)) continue;
    seen.add(f.title); out.push({ from, title: f.title });
  }
  return out;
}
/** Умение предыстории персонажа: { title, paras, src, custom } или null. */
function mecBgFeature(st) {
  const bg = mecBgObj(st);
  if (!bg) return null;
  if (bg.name !== 'Собственная предыстория') {
    const f = BG_FEATURES[bg.name];
    return f ? { title: f.title, paras: f.paras || [f.text], src: bg.name, custom: false } : null;
  }
  const sel = st.mecBgFeature || {};
  if (sel.custom) {
    const title = String(sel.custom.title || '').trim();
    return title ? { title, paras: [String(sel.custom.text || '').trim()].filter(Boolean), src: 'Собственная предыстория', custom: true } : null;
  }
  const f = sel.from ? BG_FEATURES[sel.from] : null;
  return f ? { title: f.title, paras: f.paras || [f.text], src: 'Собственная предыстория', custom: false } : null;
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
      desc: 'Вы провели годы, погрузившись в книги, свитки и манускрипты в поисках знаний о мире. Библиотеки, академии и архивы были вашим домом. Вы изучали историю, магию, естественные науки или богословие — а может быть, всё сразу. Другие учёные и исследователи готовы делиться с вами знаниями в обмен на ваши, а любая крупная библиотека, вероятно, хранит труды, к которым вы имеете доступ.',
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
      desc: 'До приключений вы нарушали закон — и довольно успешно. Кражи, контрабанда, шантаж или убийства на заказ: у вас за плечами богатый опыт незаконной деятельности. Вы знаете, как связаться со скупщиками краденого, торговцами информацией и другими преступниками. Члены воровских гильдий и уличных банд, как правило, относятся к вам с уважением — или по меньшей мере не мешают.',
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
      choices: [{ label: 'Игровой набор', type: 'gaming', count: 1, item: { list: ['Кости', 'Карты'] } }],
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
          { label: 'Инструменты (из образцов предысторий)', type: 'bg_sample_tools' }, // B-22
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

  const poolHost = el('div', { class: 'pool-host' }); // «Озёра»: пометки и слоты замены шага Раса
  function updateDetail() {
    detailEl.innerHTML = '';
    mecPoolSync(st);
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
    // B-24 (П7): выбор «один из N» вынесен в функцию — «Наследие драконов» показывается под расой, как подраса
    function devicePicker(t) {
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
        // ТЗ «Озёра», правило 1: инструмент, которым персонаж уже владеет (класс/предыстория), — заблокирован
        const locks = t.recordAs === 'tool' ? mecLocks(st, 'tool', [`race:${t.title}`, `subrace:${t.title}`]) : new Map();
        devWrap.append(
          el('div', { class: 'mech-subrace-btns' },
            ...t.devices.map(d => {
              const why = current?.name !== d.name ? locks.get(PL.norm(d.name)) : null;
              const b = el('button', {
                class: `mech-subrace-btn${current?.name === d.name ? ' is-selected' : ''}${why ? ' is-locked' : ''}`,
                title: why ? `Уже есть: ${why}` : '',
                onClick: () => {
                  if (why) return;
                  st.mecDeviceChoices[t.title] = d.name;
                  scheduleSave(st);
                  renderDevices();
                  updateRaceFoot();
                },
              }, (why ? '🔒 ' : '') + d.name + (why ? ` — уже есть: ${why}` : ''));
              if (why) b.disabled = true;
              return b;
            }),
          ),
          current ? buildDeviceCard(current)
            : el('p', { class: 'mech-subrace-desc-text' }, 'Выберите вариант, чтобы продолжить.'),
        );
      };
      renderDevices();
      return devWrap;
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
      if (t.devices?.length && t.recordAs !== 'dragonAncestry') li.append(devicePicker(t));
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
          // ТЗ «Озёра»: правило 1 — навыки класса/подкласса/предыстории/других черт расы видны заблокированными
          // (раньше только навыки класса); правило 4 — если свободных не хватает, открывается любой навык.
          const locks   = mecLocks(st, 'skill', ['race:race_skills', 'subrace:race_skills']);
          const chosen  = new Set(st.mecRaceSkills || []);
          const wide    = PL.widenIfExhausted(pool, ALL_SKILLS, mecHardLocks(st, 'skill', ['race:race_skills', 'subrace:race_skills']), count, [...chosen]); // B-20
          const picks   = [...chosen];
          const atLimit = picks.length >= count;
          const chips = [...wide.options].sort((a, b) => ALL_SKILLS.indexOf(a) - ALL_SKILLS.indexOf(b)).map(name => {
            const isPicked    = chosen.has(name);
            const why         = !isPicked ? locks.get(PL.norm(name)) : null;
            const isFromClass = !!why;
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
            }, (isFromClass ? '🔒 ' : isPicked ? '✓ ' : '') + name + (isFromClass ? ` — уже есть: ${why}` : ''));
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
        // ТЗ «Озёра», правило 1: языки класса/подкласса/предыстории видны в списке, но заблокированы.
        // Вопрос 16 ТЗ: язык не подставляется по умолчанию — слот пустой, пока игрок не выберет.
        const isLang = t.choice.type === 'language';
        const isFeat = t.choice.type === 'feat';
        const emptyFirst = isLang || isFeat; // B-18: черта, как и язык, не подставляется — пустой слот
        const locks = isLang ? mecLocks(st, 'language', [`race:${t.title}`, `subrace:${t.title}`]) : new Map();
        const pool  = t.choice.list || (t.choice.type === 'feat' ? PHB_FEATS
          : LANGUAGES.filter(l => !mecRaceBaseLanguages(raceDesc).includes(l)));
        const key   = t.title;
        const choiceWrap = el('div', { class: 'mech-race-choice-selects' });
        function renderChoiceSelects() {
          choiceWrap.innerHTML = '';
          const saved = st.mecRaceChoices[key] || [];
          let picks;
          if (emptyFirst) {
            picks = Array.from({ length: count }, (_, i) => {
              const v = saved[i];
              return v && pool.includes(v) && !locks.has(PL.norm(v)) ? v : '';
            });
            if (picks.join('|') !== saved.join('|')) { st.mecRaceChoices[key] = picks; scheduleSave(st); }
          } else {
            picks = saved.filter(v => pool.includes(v));
            if (picks.length !== count || picks.length !== saved.length) {
              picks = pool.slice(0, count);
              st.mecRaceChoices[key] = picks;
              scheduleSave(st);
            }
          }
          const selects = picks.map((val, idx) => {
            const otherPicks = picks.filter((_, i) => i !== idx);
            const opts = pool.filter(o => !otherPicks.includes(o));
            const sel = el('select', { class: `equip-choice-sel${emptyFirst && !val ? ' is-empty' : ''}` },
              isLang ? el('option', { value: '' }, '— выберите язык —') : isFeat ? el('option', { value: '' }, '— выберите черту —') : null,
              ...opts.map(o => {
                const why = locks.get(PL.norm(o));
                const opt = el('option', { value: o }, why ? `🔒 ${o} — уже есть: ${why}` : o);
                if (why) opt.disabled = true;
                return opt;
              }));
            sel.value = val;
            sel.addEventListener('change', () => {
              const next = [...picks];
              next[idx] = sel.value;
              st.mecRaceChoices[key] = next;
              scheduleSave(st);
              renderChoiceSelects();
              updateRaceFoot();
            });
            return el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'));
          });
          choiceWrap.append(...selects);
          // Э2: у черт с заклинаниями выбор заклинаний — на шаге «Заклинания»
          if (t.choice.type === 'feat' && picks.some(n => SPELL_FEATS[featIdByName(n)])) {
            choiceWrap.append(el('p', { class: 'cls-choice-hint' }, 'Заклинания черты выберете на шаге «Заклинания».'));
          }
          // П9: где делается выбор внутри черты (ТЗ 4.4.3 ⑤а, п. 1)
          if (isFeat) for (const n of picks.filter(Boolean)) {
            const a = FM.FEAT_MECH[featIdByName(n)]?.asi;
            if (a?.choice) choiceWrap.append(el('p', { class: 'cls-choice-hint' }, `+1 к характеристике черты выберете на шаге «Характеристики» (${a.choice.length === 6 ? 'любая' : a.choice.map(k => FM.ABIL_NAME[k]).join(' или ')}).`));
          }
          // B-40: требования черты — предупреждение, не запрет
          if (isFeat) for (const w of mecFeatWarnings(st)) choiceWrap.append(el('p', { class: 'feat-req-warn', role: 'alert' }, '⚠️ ' + w));
          // П10 (ТЗ 4.4.3 ⑤а, п. 3, 5): карточка черты — текст dnd.su и выборы, которым нет места на других шагах
          if (isFeat) for (const n of picks.filter(Boolean)) {
            const card = buildFeatCard(st, featIdByName(n), () => { renderChoiceSelects(); updateRaceFoot(); });
            if (card) choiceWrap.append(card);
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
      poolHost,
    );

    // B-24 (ТЗ 4.4.8, v0.43): «Наследие драконов» — обязательный выбор сразу под расой, как подраса у эльфа
    // (термин dnd.su; подрасой не называем). Данные прежние: st.mecDeviceChoices['Наследие драконов'].
    const ancTrait = mecActiveRaceTraits(raceObj.name, st.mecSubrace).find(t => t.recordAs === 'dragonAncestry' && t.devices?.length);
    if (ancTrait) detailEl.append(el('p', { class: 'mech-pr-section' }, `${ancTrait.title}:`), devicePicker(ancTrait));

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
    const poolPanel = buildPoolPanel(st, 'race', () => { updateDetail(); updateRaceFoot(); });
    poolHost.replaceChildren(...(poolPanel ? [poolPanel] : []));
    const langMissing = mecActiveRaceTraits(st.mecRace.split('::')[1], st.mecSubrace)
      .some(t => t.choice?.type === 'language' && ((st.mecRaceChoices || {})[t.title] || []).filter(Boolean).length < (t.choice.count || 1));
    const repMissing = false; // П4: замена — в окне конфликтов
    const [srcId, raceName] = st.mecRace.split('::');
    const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
    const needsSub = raceObj?.sub?.length > 0;
    const vhIncomplete = _isVariantHuman() && Object.keys(st.mecVariantHumanAsi || {}).length < 2;
    const heIncomplete = _isHalfElf() && Object.keys(st.mecHalfElfAsi || {}).length < 2;
    const requiredSkills = mecRequiredRaceSkillCount(raceName, st.mecSubrace);
    const skillsIncomplete = requiredSkills > 0 && (st.mecRaceSkills || []).length < requiredSkills;
    const missingDevices = mecMissingRequiredDevices(st);
    const featMissing = mecActiveRaceTraits(raceName, st.mecSubrace) // B-18: черта не выбрана — «Далее» закрыто
      .some(t => t.choice?.type === 'feat' && ((st.mecRaceChoices || {})[t.title] || []).filter(Boolean).length < (t.choice.count || 1));
    const featChoicesMissing = mecFeatChoicesMissing(st, 'race').length > 0; // П10
    const blocked = (needsSub && !st.mecSubrace) || vhIncomplete || heIncomplete || skillsIncomplete
      || missingDevices.length > 0 || langMissing || repMissing || featMissing || featChoicesMissing;
    const tipText = !st.mecSubrace && needsSub ? 'Выберите подрасу, чтобы продолжить'
      : (vhIncomplete || heIncomplete) ? 'Выберите +1 к двум характеристикам'
      : skillsIncomplete ? 'Выберите навыки, чтобы продолжить'
      : missingDevices.length ? `Сделайте выбор: ${missingDevices.map(t => t.title).join(', ')}`
      : langMissing ? 'Выберите язык, чтобы продолжить'
      : featMissing ? 'Выберите черту, чтобы продолжить'
      : featChoicesMissing ? 'Сделайте выбор в карточке черты'
      : repMissing ? 'Выберите замену владения (правило PHB)'
      : '';
    const btn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('background') }, 'Далее → Предыстория');
    btn.disabled = blocked;
    if (blocked) footEl.append(mecFootReason(mecRaceMissing(st)) || ''); // B-30: видно без наведения
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
  // данных: RACE_DATA для остальных допов остаётся в коде как есть, так что
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

function buildBgMultiSel({ label, max, maxPerGroup, groups, onChange, onClose = null, initialSelected = [], blocked = new Map() }) {
  let dirty = false; // B-21: после закрытия списка с изменениями — перерисовать шаг (замки в других полях)
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
      // «Озёра», правило 1: blocked — Map<norm(значение), подпись> (языки, инструменты, навыки)
      const why     = grp.type !== 'fixed' && !initialSelected.includes(key) ? blocked.get(PL.norm(o)) : null;
      if (why) { // ТЗ «Озёра», правило 1: уже есть — виден, но заблокирован и подписан
        panel.append(el('div', { class: 'mech-bg-ms-item is-disabled is-locked', title: cap1(mecLockText(why)) },
          el('span', { class: 'mech-bg-ms-check' }, '🔒'), el('span', {}, `${o} — ${mecLockText(why)}`)));
        return;
      }
      const checkEl = el('span', { class: 'mech-bg-ms-check' });
      const itemEl  = el('div', { class: 'mech-bg-ms-item' }, checkEl, el('span', {}, o));
      itemEl.addEventListener('click', () => {
        const groupSel = sel.get(gi);
        if (groupSel.has(key)) { groupSel.delete(key); }
        else if (groupSel.size < mpg && totalSelected() < max) { groupSel.add(key); }
        dirty = true;
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

  const closed = () => { if (dirty && onClose && wrap.isConnected) { dirty = false; onClose(); } };
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    triggerArrow.style.transform = panel.hidden ? '' : 'rotate(180deg)';
    if (panel.hidden) closed();
  });

  const wrap = el('div', { class: 'mech-bg-ms-wrap' }, trigger, panel);
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target) && !panel.hidden) { panel.hidden = true; triggerArrow.style.transform = ''; closed(); }
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
    const nextBtn  = el('button', { class: 'cnew-save-btn', onClick: () => goMech(stepAfterBackground(st)) },
      hasExpertiseStep(st) ? 'Далее → Компетентность' : 'Далее → Характеристики');
    nextBtn.addEventListener('mouseenter', e => {
      if (nextBtn.disabled) showSrcTip(e, { name: '', desc: 'Заполните все выборы, чтобы продолжить' });
    });
    nextBtn.addEventListener('mouseleave', hideSrcTip);
    const bgReasonEl = el('span', { class: 'cls-foot-reason' }); // B-30: «Осталось выбрать» без наведения
    const recheckFoot = () => {
      const ok = checkers.length === 0 || checkers.every(fn => fn());
      nextBtn.disabled = !ok;
      st.mecBgOk = ok;
      const miss = ok ? [] : mecBgMissing(st);
      bgReasonEl.textContent = miss.length ? cap1(mecLeftText(miss)) : '';
      bgReasonEl.hidden = !miss.length;
    };

    if (!st.mecBgChoiceData) st.mecBgChoiceData = {};
    // ТЗ «Озёра»: правила 2/3 (снятие дублей, замены) — mecPoolSync; правило 1 — замки в списках ниже
    mecPoolSync(st);
    // B-21: правило 1 внутри шага — у каждого поля свой слот; взятое в другом поле этой предыстории — 🔒 с подписью поля
    const bgGrants = buildCharacterGrants(st);
    const locksFor = ci => mecLocksAll(st, PL.POOLS.map(p => `background:background_${p}:${ci}`), bgGrants);
    const toolProfSelects = [];
    let choiceIdx = 0;
    const EQUIP_CHOICE_TYPES = new Set(['instrument', 'artisan', 'gaming', 'bg_equipment']); // shown on equipment screen
    const choiceEls = (bgObj.choices || []).flatMap(ch => {
      const ci = choiceIdx++;
      const bgLocks = locksFor(ci);
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
        // «Озёра»: правило 1 — замки; правило 4 — все варианты уже есть → любой инструмент
        const wideT = PL.widenIfExhausted(opts, ALL_TOOL_NAMES(), bgLocks, 1, current ? [current] : []);
        const selEl = el('select', { class: 'mech-bg-select' },
          el('option', { value: '' }, ch.label.charAt(0).toUpperCase() + ch.label.slice(1)),
          ...wideT.options.map(o => {
            const why = o !== current ? bgLocks.get(PL.norm(o)) : null;
            const opt = el('option', { value: o }, why ? `🔒 ${o} — ${mecLockText(why)}` : o);
            if (why) opt.disabled = true;
            return opt;
          }),
        );
        selEl.value = current;
        selEl.addEventListener('change', () => {
          current = selEl.value;
          if (current) st.mecBgChoiceData[ci] = [`${ch.type}::${current}`];
          else delete st.mecBgChoiceData[ci];
          st.mecBgProfSplit = true;
          scheduleSave(st);
          updateDetail(); // B-21: замки в других полях
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
            initialSelected: saved, blocked: bgLocks, onClose: updateDetail, // B-21/B-37
            onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; scheduleSave(st); recheckFoot(); } }))]; // B-28: сохранять черновик
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
            blocked: bgLocks,
            onClose: updateDetail, // B-21: замки в других полях
            onChange: (n, keys) => { cnt = n; st.mecBgChoiceData[ci] = keys; scheduleSave(st); recheckFoot(); }, // B-28
          }))];
      }
      const savedVal = st.mecBgChoiceData[ci] || '';
      let chosen = !!savedVal;
      checkers.push(() => chosen);
      const selEl = el('select', { class: 'mech-bg-select' },
        el('option', { value: '' }, 'Выберите'),
        ...bgChoiceOptions(ch.type).map(o => {
          const why = bgLocks.get(PL.norm(o));
          const opt = el('option', { value: o }, why ? `🔒 ${o} — ${mecLockText(why)}` : o);
          if (why) opt.disabled = true;
          return opt;
        }),
      );
      selEl.value = savedVal;
      selEl.addEventListener('change', () => {
        chosen = !!selEl.value;
        st.mecBgChoiceData[ci] = selEl.value;
        scheduleSave(st); // B-28
        updateDetail(); // B-21: замки в других полях
      });
      return [el('div', { class: 'mech-bg-row' },
        el('span', { class: 'mech-bg-row-label' }, ch.label),
        selEl,
      )];
    });

    // ── B-22 (ТЗ 4.4.4): «Собственная предыстория» — умение предыстории: одно из PHB или «Своё умение (с Мастером)»
    let featEl = null;
    if (bgObj.name === 'Собственная предыстория') {
      const CUSTOM = '__custom__';
      const fsel = st.mecBgFeature || {};
      const feats = bgFeatureChoices();
      const featSel = el('select', { class: 'mech-bg-select' },
        el('option', { value: '' }, 'Выберите умение'),
        ...feats.map(f => el('option', { value: f.from }, `${f.title} (${f.from})`)),
        el('option', { value: CUSTOM }, 'Своё умение (с Мастером)'));
      featSel.value = fsel.custom ? CUSTOM : (fsel.from || '');
      featSel.addEventListener('change', () => {
        st.mecBgFeature = featSel.value === CUSTOM ? { custom: { title: '', text: '' } } : featSel.value ? { from: featSel.value } : null;
        scheduleSave(st);
        updateDetail();
      });
      const cur = mecBgFeature(st);
      const info = cur && !cur.custom ? el('span', { class: 'cls-info-btn' }, 'i') : null;
      if (info) {
        const tip = e => showSrcTip(e, { name: `Умение: ${cur.title}`, desc: cur.paras.join(' ') });
        info.addEventListener('mouseenter', tip);
        info.addEventListener('mouseleave', hideSrcTip);
        info.addEventListener('click', e => { e.stopPropagation(); tip(e); setTimeout(hideSrcTip, 6000); });
      }
      const rows = [el('div', { class: 'mech-bg-row' },
        el('span', { class: 'mech-bg-row-label' }, 'Умение предыстории'),
        el('span', { class: 'mech-bg-row-value' }, featSel, info))];
      if (fsel.custom) {
        const tIn = el('input', { class: 'shop-modal-inp', type: 'text', placeholder: 'Название умения', maxlength: '80' });
        const dIn = el('textarea', { class: 'shop-modal-inp', rows: '3', placeholder: 'Что даёт умение' });
        tIn.value = fsel.custom.title || ''; dIn.value = fsel.custom.text || '';
        tIn.addEventListener('input', () => { st.mecBgFeature.custom.title = tIn.value; scheduleSave(st); recheckFoot(); });
        dIn.addEventListener('input', () => { st.mecBgFeature.custom.text = dIn.value; scheduleSave(st); });
        rows.push(el('div', { class: 'mech-bg-custom-feat' },
          el('span', { class: 'eq-badge is-custom' }, 'с разрешения Мастера'),
          // текст — дословно dnd.su («Предыстории» → «Собственная предыстория»); утверждён заказчиком 2026-10-04
          el('p', { class: 'cls-choice-hint' }, 'Если вы не можете выбрать умение предыстории, которое подходит именно вам, посоветуйтесь с Мастером и создайте свою собственную.'),
          tIn, dIn));
      }
      featEl = el('div', {}, ...rows);
      checkers.push(() => !!mecBgFeature(st));
    }

    recheckFoot();
    footEl.innerHTML = '';
    footEl.append(bgReasonEl, nextBtn);

    detailEl.append(...[
      el('div', { class: 'mech-cls-header' },
        el('h3', { class: 'mech-cls-name' }, bgObj.name),
        badge,
      ),
      el('p', { class: 'mech-cls-desc' }, bgObj.desc),
      buildPoolPanel(st, 'background', updateDetail),
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
      featEl,
      hintEl,
    ].filter(Boolean));
  }

  function selectBg(srcId, bgName) {
    const key = `${srcId}::${bgName}`;
    if (st.mecBackground !== key) {
      st.mecBgChoiceData = {};
      st.mecBgFeature = null; // B-22
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
    footEl.append(el('button', { class: 'cnew-save-btn', onClick: () => goMech(stepAfterBackground(st)) },
      hasExpertiseStep(st) ? 'Далее → Компетентность' : 'Далее → Характеристики'));
  }
  updateDetail();

  return el('div', { class: 'mech-step-body' },
    el('h2', { class: 'mech-step-title' }, 'Выберите предысторию'),
    el('div', { class: 'mech-cls-layout' }, el('div', { class: 'mech-list-wrap' }, listEl), detailEl),
    footEl,
  );
}

// ─── Шаг 4.4.4a «Компетентность» (ТЗ v0.41, B-03) ────────────────────────────────
// Плут: «Компетентность» — 2 владения (2 навыка или навык + воровские инструменты).
// Следопыт (Таша): «Искусный исследователь», «Хитрец» — 1 навык + 2 языка (языки — по правилам «Озёр»).
// Выбор: st.mecClassChoices.expertise / .deft_explorer_languages → grants (pool 'expertise' / 'language').
// Тексты правил — только dnd.su (rules_levels.js: «Плут:КОМПЕТЕНТНОСТЬ», «Следопыт:ИСКУСНЫЙ ИССЛЕДОВАТЕЛЬ»).

/** { n, tools, langs, ruleKey, title } — что выбирается на шаге; null — шага нет. */
function mecExpertiseSpec(st) {
  if (st.mecClass === 'rogue') return { n: 2, tools: true, langs: 0, ruleKey: 'Плут:КОМПЕТЕНТНОСТЬ', title: 'Компетентность' };
  if (st.mecClass === 'ranger' && clsVariant(st) === 'tce') {
    return { n: 1, tools: false, langs: 2, ruleKey: 'Следопыт:ИСКУСНЫЙ ИССЛЕДОВАТЕЛЬ', title: 'Искусный исследователь' };
  }
  return null;
}
const isThievesTools = v => PL.norm(v) === 'воровские инструменты';

/** Варианты: все навыки, которыми персонаж владеет (+ воровские инструменты у Плута) — [{ value, pool, who }]. */
function mecExpertiseOptions(st, grants = buildCharacterGrants(st)) {
  const spec = mecExpertiseSpec(st);
  if (!spec) return [];
  const out = new Map();
  for (const g of grants) {
    if (!(g.pool === 'skill' || (spec.tools && g.pool === 'tool' && isThievesTools(g.value)))) continue;
    const k = PL.norm(g.value);
    if (!out.has(k)) out.set(k, { value: cap1(g.value), pool: g.pool, who: mecWho(st, g) });
  }
  return [...out.values()].sort((a, b) => (a.pool === b.pool ? a.value.localeCompare(b.value, 'ru') : a.pool === 'skill' ? -1 : 1));
}

/** Снимает компетентность с владений, которых у персонажа больше нет (ТЗ 4.4.4a). true — что-то снято. */
function mecExpertiseSync(st) {
  const spec = mecExpertiseSpec(st);
  const cc = st.mecClassChoices;
  if (!spec || !cc || !Array.isArray(cc.expertise) || !cc.expertise.length) return false;
  const owned = new Set(mecExpertiseOptions(st).map(o => PL.norm(o.value)));
  const cur = cc.expertise;
  const keep = cur.filter(v => owned.has(PL.norm(v))).slice(0, spec.n);
  if (keep.length === cur.length) return false;
  const notes = st.mecPoolNotes || (st.mecPoolNotes = {});
  const list = notes.expertise || (notes.expertise = []);
  for (const v of cur.filter(v => !keep.includes(v))) {
    const msg = `«${cap1(v)}» больше нет среди ваших владений — выберите другое владение для компетентности.`;
    if (!list.includes(msg)) list.push(msg);
  }
  cc.expertise = keep;
  return true;
}

/** Чего не хватает на шаге (для прогресс-бара и «Далее»). */
function mecExpertiseMissing(st) {
  const spec = mecExpertiseSpec(st);
  if (!spec) return [];
  const cc = st.mecClassChoices || {};
  const owned = new Set(mecExpertiseOptions(st).map(o => PL.norm(o.value)));
  const have = [].concat(cc.expertise || []).filter(v => v && owned.has(PL.norm(v))).length;
  const out = [];
  if (have < spec.n) out.push(`компетентность (${have}/${spec.n})`);
  if (spec.langs) {
    const hl = [].concat(cc.deft_explorer_languages || []).filter(Boolean).length;
    if (hl < spec.langs) out.push(`языки (${hl}/${spec.langs})`);
  }
  return out;
}

/** Абзацы правила 1-го уровня (у «Искусного исследователя» — до «Бродяги (6-й уровень)»). */
function expertiseRuleParas(full) {
  const out = [];
  for (const b of full || []) {
    if (b.h && /\((\d+)-й уровень\)/.test(b.h) && !/\(1-й уровень\)/.test(b.h)) break;
    out.push(b);
  }
  return out;
}

function buildExpertiseStep(st, goMech) {
  if (!st.mecClassChoices) st.mecClassChoices = {};
  const cc = st.mecClassChoices;
  const spec = mecExpertiseSpec(st);
  const body = el('div', { class: 'exp-body' });
  const footEl = el('div', { class: 'mech-foot' });
  const clsName = CLASS_DATA.find(c => c.id === st.mecClass)?.name || '';

  function ruleCard() {
    const r = _rulesLevels?.[spec.ruleKey];
    const paras = r ? expertiseRuleParas(r.full) : [];
    return el('details', { class: 'exp-rule', open: 'true' },
      el('summary', {}, `${clsName}: «${spec.title}»`, el('span', { class: 'exp-rule-src' }, 'dnd.su')),
      el('div', { class: 'exp-rule-body' }, ...(r
        ? paras.map(b => (b.h ? el('p', { class: 'exp-rule-h' }, b.h) : el('p', {}, b.p)))
        : [el('p', { class: 'exp-rule-wait' }, 'Загружаем текст правила…')])),
    );
  }

  function render() {
    mecPoolSync(st);
    const grants = buildCharacterGrants(st);
    const opts = mecExpertiseOptions(st, grants);
    const picked = [].concat(cc.expertise || []).filter(Boolean);
    const pickedK = new Set(picked.map(PL.norm));
    const atLimit = picked.length >= spec.n;
    const miss = mecExpertiseMissing(st);
    if (!miss.length && st.mecPoolNotes?.expertise) { delete st.mecPoolNotes.expertise; scheduleSave(st); }
    const notes = st.mecPoolNotes?.expertise || [];

    // ── Выбор владений ──
    const chips = el('div', { class: 'cls-chips exp-chips' }, ...opts.map(o => {
      const isPicked = pickedK.has(PL.norm(o.value));
      const dim = !isPicked && spec.n > 1 && atLimit;
      const b = el('button', {
        class: 'cls-chip exp-chip' + (isPicked ? ' is-picked' : '') + (dim ? ' is-dim' : ''),
        onClick: () => {
          let next = picked.slice();
          if (isPicked) next = next.filter(v => PL.norm(v) !== PL.norm(o.value));
          else if (spec.n === 1) next = [o.value];
          else if (!atLimit) next.push(o.value);
          else return;
          cc.expertise = next;
          scheduleSave(st); render();
        },
      }, (isPicked ? '✓ ' : '') + o.value, el('span', { class: 'exp-chip-src' }, o.who));
      if (dim) b.disabled = true;
      return b;
    }));
    const pickHd = spec.n > 1
      ? `Выберите ${spec.n} владения (${picked.length}/${spec.n})`
      : `Выберите навык (${picked.length}/${spec.n})`;
    const pickHint = spec.tools
      ? 'Два навыка — или один навык и воровские инструменты. В списке — всё, чем персонаж уже владеет, и откуда это владение.'
      : 'В списке — все навыки, которыми персонаж уже владеет, и откуда это владение.';
    const blocks = [
      el('div', { class: 'cls-choice', 'data-ck': 'expertise' },
        el('div', { class: 'cls-choice-hd' }, pickHd),
        el('p', { class: 'cls-choice-hint' }, pickHint),
        opts.length ? chips : el('p', { class: 'cls-choice-hint' }, 'Пока нет ни одного навыка — выберите навыки на шаге «Класс».')),
    ];

    // ── Языки «Искусного исследователя» (Следопыт, Таша) ──
    if (spec.langs) {
      const langs = [].concat(cc.deft_explorer_languages || []);
      const locks = mecLocks(st, 'language', ['class:deft_explorer_languages'], grants); // «Озёра», правило 1
      const sels = [];
      for (let i = 0; i < spec.langs; i++) {
        const cur = langs[i] || '';
        const other = langs.filter((v, j) => j !== i && v).map(PL.norm);
        const sel = el('select', { class: 'mech-bg-select' },
          el('option', { value: '' }, `— язык ${i + 1} —`),
          ...LANGUAGES.map(l => {
            const why = l !== cur ? (locks.get(PL.norm(l)) || (other.includes(PL.norm(l)) ? 'выбран в соседнем поле' : null)) : null;
            const o = el('option', { value: l }, why ? `🔒 ${l} — уже есть: ${why}` : l);
            if (why) o.disabled = true;
            return o;
          }));
        sel.value = cur;
        sel.addEventListener('change', () => {
          const next = [];
          for (let j = 0; j < spec.langs; j++) next[j] = j === i ? (sel.value || null) : (langs[j] || null);
          cc.deft_explorer_languages = next.filter(Boolean);
          scheduleSave(st); render();
        });
        sels.push(sel);
      }
      const hl = langs.filter(Boolean).length;
      blocks.push(el('div', { class: 'cls-choice', 'data-ck': 'deft_explorer_languages' },
        el('div', { class: 'cls-choice-hd' }, `Языки — выберите ${spec.langs} (${hl}/${spec.langs})`),
        el('p', { class: 'cls-choice-hint' }, 'Вы также можете говорить, читать и писать на двух дополнительных языках по вашему выбору.'), // dnd.su
        el('div', { class: 'exp-langs' }, ...sels)));
    }

    body.innerHTML = '';
    body.append(
      el('div', { class: 'cls-info-card exp-newbie' },
        el('p', { class: 'cls-info-text' }, 'Компетентность — навык, в котором ваш персонаж настоящий профи: бонус мастерства к нему удваивается.')),
      ruleCard(),
      ...(notes.length ? [el('div', { class: 'pool-panel' }, ...notes.map(n => el('p', { class: 'pool-note' }, '⚠️ ' + n)))] : []),
      ...blocks,
    );

    footEl.innerHTML = '';
    const btn = el('button', { class: 'cnew-save-btn', onClick: () => goMech('stats') }, 'Далее → Характеристики');
    if (miss.length) {
      btn.disabled = true; btn.classList.add('is-disabled');
      footEl.append(el('span', { class: 'cls-foot-reason' }, 'Осталось выбрать: ' + miss.join(' · ')));
    }
    footEl.append(btn);
  }

  if (!_rulesLevels) {
    import('../data/rules_levels.js').then(m => { _rulesLevels = m.RULES_LEVELS; if (body.isConnected) render(); }).catch(() => {});
  }
  render();

  return el('div', { class: 'mech-step-body is-expertise' },
    el('h2', { class: 'mech-step-title' }, spec.langs ? 'Компетентность и языки' : 'Компетентность'),
    body,
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
const LANG_ALIASES = {}; // написание в race_descriptions.js → название из LANGUAGES (B-14: данные выровнены, алиасы не нужны)
/** Размер расы из race_descriptions.js (dnd.su): «Маленький» / «Средний» (B-16). */
function mecRaceSize(st) {
  return st.mecRace ? (_resolveRaceDesc(st.mecRace.split('::')[1])?.size || null) : null;
}
function mecRaceBaseLanguages(raceDesc) {
  if (!raceDesc?.languages) return [];
  return raceDesc.languages.split(/,|\+/)
    .map(s => s.replace(/\(.*\)/, '').trim())
    .filter(s => s && !/на выбор/i.test(s))
    .map(s => LANG_ALIASES[s] || s);
}

// ─── «Озёра выборов» (ТЗ: правила 1–4; логика — js/pools.js) ─────────────────────────────
// Навыки, инструменты, языки с шагов Класс · Раса · Предыстория. Замены по правилу 3 — st.mecPoolReplace
// ({ [ключ пула]: { step, value } }), пометки правила 2 — st.mecPoolNotes ({ [шаг]: [текст] }).
const ALL_SKILL_NAMES = () => Object.values(SKILLS_BY_AB).flat();
const ALL_TOOL_NAMES = () => [...EQ.ITEMS.filter(i => i.category === 'tool').map(i => i.name), 'Транспорт (наземный)', 'Транспорт (водный)'];

/** Подпись источника для «🔒 … — уже есть: Раса (Дварф)». */
function mecWho(st, g) {
  const t = g?.source?.type;
  if (t === 'class') return `Класс (${CLASS_DATA.find(c => c.id === st.mecClass)?.name || '—'})`;
  if (t === 'subclass') return `Класс (${clsSubclassObj(st)?.name || 'подкласс'})`;
  if (t === 'race') return `Раса (${st.mecRace?.split('::')[1] || '—'})`;
  if (t === 'subrace') return `Раса (${DV.subraceFullName(st.mecSubrace, st.mecRace?.split('::')[1]) || ''})`; // B-39
  if (t === 'background') {
    // B-21: выбор в другом поле этой же предыстории
    if (g.kind !== 'fixed' && String(g.slot || '').startsWith('background_') && st.mecStep === 'background') {
      const f = mecBgFieldLabel(st, g.slot);
      if (f) return `поле «${f}» этой предыстории`;
    }
    return `Предыстория (${mecBgObj(st)?.name || '—'})`;
  }
  if (t === 'feat') return `Черта («${FM.featById(g.source.id)?.name || '—'}»)`; // П10
  return 'другой шаг';
}

/** Текст замка: «уже есть: Раса (Дварф)» или (B-21) «уже выбран в поле «Язык» этой предыстории». */
function mecLockText(why) { return String(why).startsWith('поле «') ? `уже выбран в ${why}` : `уже есть: ${why}`; }
/** Правило 1: Map<norm(значение), подпись> для пула; ownSlots — ключи слотов «тип:slot», которые не блокируют себя. */
function mecLocks(st, pool, ownSlots, grants = buildCharacterGrants(st)) {
  return PL.lockMap(grants, pool, ownSlots, g => mecWho(st, g));
}
/** B-20: правило 4 для слотов класса и расы считает занятыми только «твёрдые» владения (фиксированные и выбор подкласса). */
function mecHardLocks(st, pool, ownSlots, grants = buildCharacterGrants(st)) {
  return PL.lockMap(grants.filter(PL.isHard), pool, ownSlots, g => mecWho(st, g));
}
/** Замок для списка значений (все пулы сразу) — для мультиселекта предыстории. */
function mecLocksAll(st, ownSlots, grants = buildCharacterGrants(st)) {
  const out = new Map();
  for (const pool of PL.POOLS) for (const [k, v] of mecLocks(st, pool, ownSlots, grants)) if (!out.has(k)) out.set(k, v);
  return out;
}

const cap1 = v => { const t = String(v || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const bgTypePool = t => (t === 'language' ? 'language' : t === 'skill' ? 'skill' : 'tool');

/** Снять выбор (правило 2) из состояния мастера по слоту grant'а. */
function mecPoolRemove(st, g) {
  const k = PL.norm(g.value);
  // Б2 (B-42): снимается одно вхождение (дубль в старом черновике не должен уносить оба)
  const drop = arr => { const a = [...(arr || [])]; const i = a.findIndex(v => PL.norm(String(v).includes('::') ? v.split('::').slice(1).join('::') : v) === k); if (i >= 0) a.splice(i, 1); return a; };
  const slot = g.slot || '';
  if (slot === 'class_skills') st.mecChosen = drop(st.mecChosen);
  else if (slot === 'class_tools') { const c = st.mecClassToolChoice || {}; c[st.mecClass] = drop(c[st.mecClass]); }
  else if (slot === 'favored_enemy_language') delete (st.mecClassChoices || {}).favored_enemy_language;
  else if (slot === 'deft_explorer_languages') {
    const cc = st.mecClassChoices || {};
    cc.deft_explorer_languages = drop(cc.deft_explorer_languages);
  }
  else if (slot === 'subclass_skills' || slot === 'subclass_languages') {
    const id = slot === 'subclass_skills' ? 'skills' : 'languages';
    if (st.mecSubclassChoices) st.mecSubclassChoices[id] = drop(st.mecSubclassChoices[id]);
  } else if (slot === 'race_skills') st.mecRaceSkills = drop(st.mecRaceSkills);
  else if (slot === 'feat_languages' || slot === 'feat_skilled') { // П10: выборы черты
    const ch = (st.mecFeatChoices || {})[g.source.id];
    if (ch && slot === 'feat_languages') ch.languages = (ch.languages || []).map(v => (v && PL.norm(v) === k ? '' : v));
    if (ch && slot === 'feat_skilled') ch.skillsOrTools = (ch.skillsOrTools || []).map(v => (v && v.startsWith(g.pool + '::') && PL.norm(v.split('::').slice(1).join('::')) === k ? '' : v));
  }
  else if (slot.startsWith('pool_replace:')) delete (st.mecPoolReplace || {})[slot.slice(13)];
  else if (slot.startsWith('background_')) {
    // B-21: снимается значение только своего поля (background_<пул>:<индекс>)
    const d = st.mecBgChoiceData || {};
    const own = slot.includes(':') ? [slot.split(':')[1]] : Object.keys(d);
    for (const ci of own) {
      if (!(ci in d)) continue;
      if (Array.isArray(d[ci])) d[ci] = d[ci].filter(key => !(bgTypePool(key.split('::')[0]) === g.pool && PL.norm(key.split('::').slice(1).join('::')) === k));
      else if (typeof d[ci] === 'string' && PL.norm(d[ci]) === k) delete d[ci];
    }
  } else if (g.source.type === 'race' || g.source.type === 'subrace') {
    if (g.pool === 'language' && st.mecRaceChoices?.[slot]) st.mecRaceChoices[slot] = drop(st.mecRaceChoices[slot]);
    if (g.pool === 'tool' && st.mecDeviceChoices?.[slot] && PL.norm(st.mecDeviceChoices[slot]) === k) delete st.mecDeviceChoices[slot];
  }
}

/**
 * Правила 2 и 3: чистит устаревшие замены (правило 3) и выборы вне списка; совпадения НЕ снимает (П4 — окно конфликтов).
 * Возвращает conflicts() для пометок на странице шага.
 */
function mecPoolSync(st) {
  if (!st.mecPoolNotes || typeof st.mecPoolNotes !== 'object') st.mecPoolNotes = {};
  if (!st.mecPoolReplace || typeof st.mecPoolReplace !== 'object') st.mecPoolReplace = {};
  // B-22: «Собственная предыстория» — инструменты только из образцов предысторий (старый тип all_tools → bg_sample_tools)
  if (mecBgObj(st)?.name === 'Собственная предыстория' && st.mecBgChoiceData) {
    const sample = new Set(bgSampleTools());
    for (const ci of Object.keys(st.mecBgChoiceData)) {
      const d = st.mecBgChoiceData[ci];
      if (!Array.isArray(d) || !d.some(k => k.startsWith('all_tools::'))) continue;
      st.mecBgChoiceData[ci] = d.flatMap(k => !k.startsWith('all_tools::') ? [k]
        : sample.has(k.slice(11)) ? ['bg_sample_tools::' + k.slice(11)] : []);
      scheduleSave(st);
    }
  }
  // B-20: навыки подкласса — только из своего списка; выбор из прежнего «любого» слота (правило 4) снимается
  const sub = clsSubclassObj(st), sc = st.mecSubclassChoices;
  if (sub && sc) for (const ch of sub.choices || []) {
    if (ch.id !== 'skills' || !Array.isArray(ch.from) || !Array.isArray(sc[ch.id])) continue;
    const bad = sc[ch.id].filter(v => !ch.from.includes(v));
    if (!bad.length) continue;
    sc[ch.id] = sc[ch.id].filter(v => ch.from.includes(v));
    const list = st.mecPoolNotes.class || (st.mecPoolNotes.class = []);
    for (const v of bad) {
      const msg = `«${cap1(v)}» не входит в список навыков подкласса «${sub.name}» — выберите навык из списка.`;
      if (!list.includes(msg)) list.push(msg);
    }
    scheduleSave(st);
  }
  let c;
  for (let pass = 0; pass < 5; pass++) {
    const grants = buildCharacterGrants(st);
    c = PL.conflicts(grants);
    let changed = false;
    const need = new Map(c.replacements.map(r => [r.key, r]));
    for (const key of Object.keys(st.mecPoolReplace)) {
      const r = need.get(key);
      if (!r || st.mecPoolReplace[key]?.step !== r.step) { delete st.mecPoolReplace[key]; changed = true; }
    }
    // П4: правило 2 больше не снимает выбор сразу — совпадение решается в «Окне конфликтов» при переходе вперёд
    if (!changed) break;
    scheduleSave(st);
  }
  if (mecExpertiseSync(st)) scheduleSave(st); // шаг 4.4.4a: компетентность только во владениях персонажа
  return c;
}

function mecReplaceDone(st, step, c = PL.conflicts(buildCharacterGrants(st))) {
  return c.replacements.filter(r => r.step === step).every(r => !!st.mecPoolReplace?.[r.key]?.value);
}

/**
 * Заполнен ли шаг (для прогресс-бара: дальше незаполненного шага не пускаем — правило 2).
 * *Missing() возвращают, чего не хватает (для подсказки на заблокированном шаге, B-09).
 */
function mecReplaceMissing(st, step, c) {
  return mecReplaceDone(st, step, c) ? [] : ['замену совпавшего владения'];
}
function mecClassMissing(st, c) {
  if (!st.mecClass) return ['класс'];
  return classChecklist(st).filter(i => !i.done).map(i => i.label); // П4: совпадения — в окне, не в «Осталось выбрать»
}
function mecRaceMissing(st, c) {
  if (!st.mecRace) return ['расу'];
  const out = [];
  const [srcId, raceName] = st.mecRace.split('::');
  const raceObj = (RACE_DATA[srcId] || []).find(r => r.name === raceName);
  if (raceObj?.sub?.length && !st.mecSubrace) return ['подрасу'];
  if (raceName === 'Человек' && st.mecSubrace === 'Альтернативный' && Object.keys(st.mecVariantHumanAsi || {}).length < 2) out.push('+1 к двум характеристикам');
  if (raceName === 'Полуэльф' && Object.keys(st.mecHalfElfAsi || {}).length < 2) out.push('+1 к двум характеристикам');
  const req = mecRequiredRaceSkillCount(raceName, st.mecSubrace);
  const haveSk = (st.mecRaceSkills || []).length;
  if (req > 0 && haveSk < req) out.push(`навыки (${haveSk}/${req})`);
  for (const t of mecMissingRequiredDevices(st)) out.push(`«${t.title}»`);
  for (const t of mecActiveRaceTraits(raceName, st.mecSubrace)) {
    if (t.choice?.type === 'language' && ((st.mecRaceChoices || {})[t.title] || []).filter(Boolean).length < (t.choice.count || 1)) out.push('язык');
    if (t.choice?.type === 'feat' && ((st.mecRaceChoices || {})[t.title] || []).filter(Boolean).length < (t.choice.count || 1)) out.push('черту'); // B-18
  }
  out.push(...mecFeatChoicesMissing(st, 'race')); // П10
  return out;
}
/** П10: чего не хватает в выборах черт на шаге step ('race' | 'spells'): вид урона «Стихийного адепта» — на «Заклинаниях», если шаг есть. */
function mecFeatChoicesMissing(st, step) {
  const out = [];
  for (const id of mecFeatIds(st)) {
    const name = FM.featById(id)?.name || id;
    const ch = (st.mecFeatChoices || {})[id] || {};
    for (const m of FM.featChoiceMissing(id, ch)) {
      const onSpells = m === 'вид урона' && hasSpellStep(st);
      if ((step === 'spells') === onSpells) out.push(`«${name}»: ${m}`);
    }
  }
  return out;
}
function mecBgMissing(st, c) {
  const bg = mecBgObj(st);
  if (!bg) return ['предысторию'];
  const d = st.mecBgChoiceData || {};
  // B-30: что именно не выбрано — подписью поля (обычными словами), со счётчиком для «выберите N»
  const out = [];
  (bg.choices || []).forEach((ch, ci) => {
    if (ch.type === 'bg_equipment') return;
    const label = cap1(String(ch.label || '').replace(/:\s*$/, ''));
    if (BG_TOOL_TYPES.includes(ch.type)) { if (!mecBgToolProfValue(st, ci, ch)) out.push(label); return; }
    const need = ch.type === 'pick2of3' ? 2 : (ch.count >= 2 || ch.groups) ? ch.count : 0;
    if (need) {
      const have = (Array.isArray(d[ci]) ? d[ci] : []).length;
      if (have < need) out.push(`${label} (${have}/${need})`);
    } else if (!d[ci]) out.push(label);
  });
  if (bg.name === 'Собственная предыстория' && !mecBgFeature(st)) out.push('умение предыстории'); // B-22
  return out;
}
function mecClassDone(st, c) { return mecClassMissing(st, c).length === 0; }
function mecRaceDone(st, c)  { return mecRaceMissing(st, c).length === 0; }
function mecBgDone(st, c)    { return mecBgMissing(st, c).length === 0; }

// ─── B-19 (страховка) и B-30: чего не хватает на шаге — одна проверка для «Далее», Финала и лендинга ───
/** Характеристики: способ распределения + «+1» альт. человека / полуэльфа. */
function mecStatsMissing(st) {
  const out = [];
  const race = st.mecRace ? st.mecRace.split('::')[1] : '';
  if (race === 'Человек' && st.mecSubrace === 'Альтернативный' && Object.keys(st.mecVariantHumanAsi || {}).length < 2) out.push('+1 к двум характеристикам');
  if (race === 'Полуэльф' && Object.keys(st.mecHalfElfAsi || {}).length < 2) out.push('+1 к двум характеристикам');
  for (const id of FM.featAsiMissing(mecFeatIds(st), st.mecFeatAsi || {})) out.push(`+1 от черты «${FM.featById(id)?.name || id}»`); // П9
  const m = st.mecStatMethod || 'pointbuy';
  const ok = m === 'pointbuy' ? pbSpent(st.mecStats || { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }) === PB_POOL
    : m === 'standard' ? Object.keys(st.mecStdAssign || {}).length === ABILITIES.length
    : (st.mecRolls || []).length === ABILITIES.length && st.mecRolls.every(r => r !== null) && Object.keys(st.mecRollAssign || {}).length === ABILITIES.length;
  if (!ok) {
    if (m === 'pointbuy') out.push(`очки характеристик (${pbSpent(st.mecStats || { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })}/${PB_POOL})`);
    else if (m === 'standard') out.push(`значения характеристик (${Object.keys(st.mecStdAssign || {}).length}/${ABILITIES.length})`);
    else out.push((st.mecRolls || []).every(r => r !== null) && (st.mecRolls || []).length ? `значения характеристик (${Object.keys(st.mecRollAssign || {}).length}/${ABILITIES.length})` : 'броски характеристик');
  }
  return out;
}
/** Заклинания: те же строки, что «Осталось выбрать» на шаге «Заклинания». */
function mecSpellsMissing(st) {
  const { res, picks } = spellState(st);
  return [...mecFeatChoicesMissing(st, 'spells'), ...missingPicks(res, picks).map(m => m.group ? `${m.section.label.split(' — ').pop()}: ${m.group.title} (${m.have}/${m.need})`
    : m.section.classPicker && !m.section.classPicker.value ? `${m.section.label}: класс списка` : `${m.section.label}: выбор на шаге «Класс»`)];
}
/** Снаряжение: причина из eqStepStatus (то же, что в подвале шага). */
function mecEquipMissing(st) {
  const profs = eqProfs(st), stats = eqStats(st);
  const s = eqStepStatus(st, eqInventory(st, profs, stats), profs, stats);
  if (s.ok) return [];
  const NOUN = { 'Выберите класс': 'класс', 'Выберите все варианты снаряжения класса': 'все варианты снаряжения класса',
    'Выберите снаряжение предыстории': 'снаряжение предыстории', 'Бросьте кости стартового золота': 'бросок стартового золота' };
  return [NOUN[s.reason] || s.reason.charAt(0).toLowerCase() + s.reason.slice(1)];
}
/** B-30: «Осталось выбрать: язык · навыки (1/2)» — одна формулировка для подвалов шагов, прогресс-бара и Финала. */
function mecLeftText(miss) {
  return 'осталось выбрать: ' + miss.map(m => /^[А-ЯЁ][а-яё]/.test(m) ? m.charAt(0).toLowerCase() + m.slice(1) : m).join(' · ');
}
function mecFootReason(miss) { return miss.length ? el('span', { class: 'cls-foot-reason' }, cap1(mecLeftText(miss))) : null; }
/** Чего не хватает на шаге id (обычными словами; пусто — шаг заполнен). */
function mecStepMissing(st, id, c = PL.conflicts(buildCharacterGrants(st))) {
  switch (id) {
    case 'class':      return mecClassMissing(st, c);
    case 'race':       return mecRaceMissing(st, c);
    case 'background': return mecBgMissing(st, c);
    case 'expertise':  return hasExpertiseStep(st) ? mecExpertiseMissing(st) : [];
    case 'stats':      return mecStatsMissing(st);
    case 'spells':     return hasSpellStep(st) ? mecSpellsMissing(st) : [];
    case 'equipment':  return mecEquipMissing(st);
    default:           return [];
  }
}
/**
 * ТЗ «Озёра» → «Окно конфликтов», страховка (B-19): первый незаполненный шаг мастера по порядку.
 * → { id, label, missing[] } или null. Финал и лендинг не считают механику заполненной, пока он есть.
 */
function mecFirstIncomplete(st) {
  const c = PL.conflicts(buildCharacterGrants(st));
  const cf = mecConflictIncomplete(st); // П4: нерешённые совпадения тоже не дают «Заполнено»
  if (cf) return cf;
  for (const s of MECH_STEPS) {
    if (s.id === 'final') break;
    const miss = mecStepMissing(st, s.id, c);
    if (miss.length) return { id: s.id, label: s.label, missing: miss };
  }
  return null;
}

/**
 * Блок «Озёр» на шаге: пометки правила 2, обязательные слоты замены (правило 3), пометки о дубле языка.
 * onChange — перерисовка шага.
 */
function buildPoolPanel(st, step, onChange) {
  const c = mecPoolSync(st);
  const done = step === 'class' ? mecClassDone(st, c) : step === 'race' ? mecRaceDone(st, c) : mecBgDone(st, c);
  if (done && st.mecPoolNotes?.[step]) { delete st.mecPoolNotes[step]; scheduleSave(st); }
  const notes = st.mecPoolNotes?.[step] || [];
  const reps = c.replacements.filter(r => r.step === step);
  const langs = c.langDups.filter(r => r.step === step);
  if (!notes.length && !reps.length && !langs.length) return null;
  const box = el('div', { class: 'pool-panel', 'data-ck': 'pool_replace' });
  for (const n of notes) box.append(el('p', { class: 'pool-note' }, '⚠️ ' + n));
  // П4: замена по правилу 3 выбирается в «Окне конфликтов» при «Далее»; на странице — пометка без выбора
  for (const r of reps) {
    const K = CF_KIND[r.pool] || CF_KIND.skill;
    const other = r.holders.find(h => PL.stepOf(h) !== step) || r.holders[0];
    const cur = st.mecPoolReplace?.[r.key]?.value;
    const p = el('p', { class: 'pool-note' },
      `${K.title} «${cap1(r.value)}» уже есть от ${mecSrcName(st, other, true)} — `,
      cur ? `вместо него выбрано «${cur}». ` : `после «Далее» вы выберете ${K.other}.`);
    if (cur) p.append(el('button', { class: 'mech-progress-hint-go', onClick: () => {
      delete st.mecPoolReplace[r.key]; scheduleSave(st); onChange?.();
    } }, 'Изменить'));
    box.append(p);
  }
  for (const r of langs) {
    const other = r.holders.find(h => PL.stepOf(h) !== step) || r.holders[0];
    box.append(el('p', { class: 'pool-info' }, `Язык «${cap1(r.value)}» уже есть от ${mecSrcName(st, other, true)}.`));
  }
  return box;
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

// ── П9 (B-17): черты альтернативного человека — id выбранных черт, +1 от черт, итог бонусов к характеристикам ──
/** id черт, выбранных на шаге «Раса» (черта альт. человека). */
function mecFeatIds(st) {
  if (!st.mecRace) return [];
  const raceName = st.mecRace.split('::')[1];
  const ch = st.mecRaceChoices || {};
  const out = [];
  for (const t of mecActiveRaceTraits(raceName, st.mecSubrace)) {
    if (t.choice?.type !== 'feat') continue;
    for (const n of ch[t.title] || []) { const id = n && featIdByName(n); if (id) out.push(id); }
  }
  return out;
}
/** Значения с расовыми бонусами, без +1 черт (так проверяется требование «13+», решение 2026-10-09). */
function mecScoresNoFeat(st) {
  const asi = mecRacialAsi(st);
  return Object.fromEntries(FM.ABIL.map(k => [k, (effectiveBase(st, k) ?? 8) + (asi[k] || 0)]));
}
/** +1 от черт (фиксированные и выбранные на шаге «Характеристики», максимум 20). */
function mecFeatAsi(st) { return FM.featAsiMap(mecFeatIds(st), st.mecFeatAsi || {}, mecScoresNoFeat(st)); }
/** Спасброски от черт («Устойчивый») — ключи характеристик. */
function mecFeatSaveKeys(st) {
  return mecFeatIds(st).filter(id => FM.FEAT_MECH[id]?.saveFromAsi).map(id => (st.mecFeatAsi || {})[id]).filter(k => FM.ABIL.includes(k));
}
/** Все бонусы к характеристикам: раса + черты. */
function mecTotalAsi(st) {
  const out = { ...mecRacialAsi(st) };
  for (const [k, v] of Object.entries(mecFeatAsi(st))) out[k] = (out[k] || 0) + v;
  return out;
}
/** B-40: предупреждения о требованиях выбранных черт. upTo — до какого шага уже известно (ability — после «Характеристик»). */
function mecFeatWarnings(st, { abilities = true } = {}) {
  const ids = mecFeatIds(st);
  if (!ids.length) return [];
  const grants = buildCharacterGrants(st);
  const out = [];
  for (const id of ids) {
    const feat = FM.featById(id);
    const armor = EQ.equipProfs(grants.filter(g => !(g.source?.type === 'feat' && g.source.id === id))).armor;
    // «Способность накладывать хотя бы одно заклинание» — заклинания класса/подкласса на 1 ур. (не самой черты)
    const canCast = spellState(st).res.sections.some(x => x.type === 'class' || x.type === 'subclass');
    const w = FM.featRequirementWarning(feat, {
      scores: abilities && !mecStatsMissing(st).some(m => !m.startsWith('+1')) ? mecScoresNoFeat(st) : null, // значения распределены
      armor: st.mecClass ? armor : null,
      canCast: st.mecClass ? canCast : null,
    });
    if (w) out.push(w);
  }
  return out;
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
      const picks = (choices[t.title] || []).filter(Boolean);
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

/**
 * B-21: все выборы владений предыстории по полям — [{ ci, pool, value, label }] (pool: skill | language | tool).
 * ci — индекс выбора в bgObj.choices: из него строится слот background_<pool>:<ci>.
 */
function mecBgChoiceValues(st) {
  const out = [];
  const bgObj = mecBgObj(st);
  if (!bgObj) return out;
  (bgObj.choices || []).forEach((ch, ci) => {
    if (ch.type === 'bg_equipment') return;
    const label = cap1(String(ch.label || '').replace(/:\s*$/, ''));
    const add = (type, value) => {
      if (!value) return;
      const pool = type === 'skill' ? 'skill' : type === 'language' ? 'language' : 'tool';
      out.push({ ci, pool, value, label });
    };
    if (BG_TOOL_TYPES.includes(ch.type)) { add('tool', mecBgToolProfValue(st, ci, ch)); return; }
    const data = st.mecBgChoiceData?.[ci];
    if (Array.isArray(data)) data.forEach(key => { const [type, ...rest] = key.split('::'); add(type, rest.join('::')); });
    else if (typeof data === 'string' && data) add(ch.type, data);
  });
  return out;
}
/** B-21: поле предыстории по слоту background_<пул>:<ci> → подпись поля. */
function mecBgFieldLabel(st, slot) {
  const ci = Number(String(slot || '').split(':')[1]);
  const ch = mecBgObj(st)?.choices?.[ci];
  return ch ? cap1(String(ch.label || '').replace(/:\s*$/, '')) : null;
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
  const statsReasonEl = el('span', { class: 'cls-foot-reason', hidden: true }); // B-30
  const footEl  = el('div', { class: 'mech-foot' }, statsReasonEl, footBtn);

  const _isVariantHuman = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Человек' && st.mecSubrace === 'Альтернативный';
  const _isHalfElf = () =>
    !!st.mecRace && st.mecRace.split('::')[1] === 'Полуэльф';

  function allAssigned() {
    if (_isVariantHuman() && Object.keys(st.mecVariantHumanAsi || {}).length < 2) return false;
    if (_isHalfElf() && Object.keys(st.mecHalfElfAsi || {}).length < 2) return false;
    if (FM.featAsiMissing(mecFeatIds(st), st.mecFeatAsi || {}).length) return false; // П9
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
    const asi     = mecTotalAsi(st)[key] || 0; // П9: раса + черты
    const featAsi = mecFeatAsi(st)[key] || 0;
    const total   = baseNum + asi;
    const mod     = statMod(total);
    const clsData = mecClsData(st);
    const hasSave = (clsData?.saves.includes(key) ?? false) || mecFeatSaveKeys(st).includes(key); // П9: «Устойчивый»
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
          el('span', { class: 'ab-racial-badge', title: featAsi ? `Раса ${signNum(asi - featAsi)}, черта +${featAsi}` : '' }, asi > 0 ? `+${asi}` : `${asi}`),
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
      const passVal  = 10 + mod + (percProf ? 2 : 0) + FM.featPassive(mecFeatIds(st), 'perception'); // П9: «Внимательный»
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

  // П9 (ТЗ 4.4.3 ⑤а, п. 1): +1 от черты альт. человека — фиксированная подставляется сама, на выбор — пустой слот;
  // B-40: требования черт к характеристикам — предупреждение (после распределения значений)
  function buildFeatAsiBlock() {
    const ids = mecFeatIds(st).filter(id => FM.FEAT_MECH[id]?.asi);
    const warns = mecFeatWarnings(st);
    if (!ids.length && !warns.length) return null;
    if (!st.mecFeatAsi) st.mecFeatAsi = {};
    const rows = ids.map(id => {
      const feat = FM.featById(id), a = FM.FEAT_MECH[id].asi;
      if (a.fixed) return el('div', { class: 'feat-asi-row' },
        el('span', { class: 'feat-asi-name' }, `Черта «${feat.name}»`),
        el('span', { class: 'feat-asi-fixed' }, `+1 к ${FM.ABIL_DAT[a.fixed]}`));
      const cur = st.mecFeatAsi[id];
      return el('div', { class: 'feat-asi-row' },
        el('span', { class: 'feat-asi-name' }, `Черта «${feat.name}»: +1 к ${a.choice.length === 6 ? 'любой характеристике' : a.choice.map(k => FM.ABIL_DAT[k]).join(' или ')}`,
          FM.FEAT_MECH[id].saveFromAsi ? el('span', { class: 'feat-asi-sub' }, ' и владение её спасброском') : null),
        el('div', { class: 'vh-asi-chips feat-asi-chips' }, ...a.choice.map(k => el('button', {
          class: `vh-asi-chip${cur === k ? ' is-chosen' : ''}`, type: 'button',
          onClick: () => { st.mecFeatAsi = { ...st.mecFeatAsi, [id]: k }; scheduleSave(st); refresh(); },
        }, FM.ABIL_NAME[k]))));
    });
    return el('div', { class: 'feat-asi-block' },
      ...rows,
      ...warns.map(w => el('p', { class: 'feat-req-warn', role: 'alert' }, '⚠️ ' + w)));
  }

  function refresh() {
    st.mecStatsOk = allAssigned();
    { const miss = st.mecStatsOk ? [] : mecStatsMissing(st);
      statsReasonEl.textContent = miss.length ? cap1(mecLeftText(miss)) : ''; statsReasonEl.hidden = !miss.length; }
    bodyEl.innerHTML = '';
    bodyEl.append(...[ // native append превращает null в текст «null» — фильтруем (как B-29)
      buildMethodRow(),
      buildFeatAsiBlock(),
      el('div', { class: 'mech-stats-grid' }, ...ABILITIES.map(buildAbBlock)),
      footEl,
    ].filter(Boolean));
    footBtn.disabled = !st.mecStatsOk;
  }

  refresh();

  // ── Character info in title row ──
  const AB_DAT = { str:'Силе', dex:'Ловкости', con:'Телосложению', int:'Интеллекту', wis:'Мудрости', cha:'Харизме' };
  const AB_GEN = { str:'Силы', dex:'Ловкости', con:'Телосложения', int:'Интеллекта', wis:'Мудрости', cha:'Харизмы' };

  const raceStr = st.mecRace ? DV.raceLabel(st.mecRace.split('::')[1], st.mecSubrace, mecDragonAncestry(st)) : null; // B-32: полное название подрасы
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

// ─── Equipment step: data (Э3, ТЗ 4.4.7 v0.32) ────────────────────────────────
// Только PHB. Каталог — js/data/equipment.js (генератор tools/gen_equipment.py, dnd.su).
// Стартовое снаряжение классов — js/data/class_starting_equipment.js (dnd.su), разбор вариантов а)/б)/в)
// и вложенных выборов — js/equipment.js. Снаряжение предысторий — BG_EQUIP (строки dnd.su),
// ссылки на каталог — EQ.BG_ITEM_REFS, монеты кошеля — BG_GOLD.
// Состояние мастера: st.mecEquip = { mode, encumbrance, classChoices, gold, goldClass, cart, equippedManual }.
// В запись персонажа уходит character.equipment (schemaVersion 3) — см. eqRecord().

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


function eqState(st) {
  if (!st.mecEquip || typeof st.mecEquip !== 'object') st.mecEquip = {};
  const q = st.mecEquip;
  if (q.mode !== 'purchase') q.mode = 'standard';
  q.encumbrance = !!q.encumbrance;
  if (!q.classChoices || typeof q.classChoices !== 'object') q.classChoices = {};
  if (!Array.isArray(q.cart)) q.cart = [];
  if (!q.equippedManual || typeof q.equippedManual !== 'object') q.equippedManual = {};
  if (q.gold === undefined) q.gold = null;
  // бросок другого класса (черновик до сброса) — недействителен
  if (q.gold && q.goldClass && st.mecClass && q.goldClass !== st.mecClass) { q.gold = null; q.goldClass = null; q.cart = []; }
  return q;
}

function eqStats(st) {
  const asi = mecTotalAsi(st); // П9: раса + черты
  const out = {};
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) out[k] = (effectiveBase(st, k) ?? 8) + (asi[k] || 0);
  return out;
}
const eqProfs = st => EQ.equipProfs(buildCharacterGrants(st));

/** Чьё снаряжение даёт предыстория: она сама или (для «Собственной») выбранная на шаге «Снаряжение». */
function eqBgSource(st) {
  const bg = mecBgObj(st);
  if (!bg) return null;
  if (bg.name === 'Собственная предыстория') return mecBgObjByName(st.mecEquipChoices?.bgch_bg_equipment) || null;
  return bg;
}

/** Предметы предыстории: строки dnd.su (со ссылкой на каталог, где dnd.su называет предмет таблицы PHB) + инструменты-предметы. */
/**
 * B-39 В (решение заказчика 2026-09-29): в снаряжении предыстории «А или Б» — выбор. Варианты — дословно из строки
 * снаряжения dnd.su, в именительном падеже. Выбор — st.mecEquipChoices['bgtext:<строка>'].
 */
const BG_EQUIP_TEXT_CHOICES = {
  'Молитвенник или молитвенный барабан': ['Молитвенник', 'Молитвенный барабан'],
  'Приспособление для жульничества на ваш выбор (десять запечатанных бутылей с подкрашенной жидкостью, набор шулерских костей, колода краплёных карт или кольцо с печатью какого-нибудь воображаемого герцога)': [
    'Десять запечатанных бутылей с подкрашенной жидкостью', 'Набор шулерских костей', 'Колода краплёных карт',
    'Кольцо с печатью какого-нибудь воображаемого герцога'],
};

function eqBackgroundItems(st) {
  const src = eqBgSource(st);
  if (!src) return [];
  const out = (BG_EQUIP[src.name] || []).map(text => {
    if (BG_EQUIP_TEXT_CHOICES[text]) { // B-39 В
      const v = st.mecEquipChoices?.[`bgtext:${text}`];
      if (!v || !BG_EQUIP_TEXT_CHOICES[text].includes(v)) return { id: null, name: text, qty: 1, source: 'background', text, textChoice: text, unresolved: true };
      const vid = EQ.BG_ITEM_REFS[v] || EQ.itemByName(v)?.id;
      return vid ? { id: vid, qty: 1, source: 'background', text: v, textChoice: text } : { id: null, name: v, qty: 1, source: 'background', text: v, textChoice: text };
    }
    const id = EQ.BG_ITEM_REFS[text];
    return id ? { id, qty: 1, source: 'background', text } : { id: null, name: text, qty: 1, source: 'background', text };
  });
  mecSyncBgItems(st);
  for (const { ch, profVal } of mecBgItemChoices(st)) {
    const v = mecBgItemValue(st, ch, profVal);
    if (!v) continue;
    const it = EQ.itemByName(v);
    out.push(it ? { id: it.id, qty: 1, source: 'background', text: v, fromChoice: ch.type }
                : { id: null, name: v, qty: 1, source: 'background', text: v, fromChoice: ch.type });
  }
  return out;
}
const eqBgGold = st => { const src = eqBgSource(st); return src ? (BG_GOLD[src.name] ?? 0) : 0; };

function eqSpent(st) {
  return Math.round(eqState(st).cart.reduce((a, e) => a + EQ.entryUnitCost(e) * (e.qty || 1), 0) * 100) / 100;
}
function eqGoldLeft(st) {
  const q = eqState(st);
  return q.gold ? Math.round((q.gold.total - eqSpent(st)) * 100) / 100 : 0;
}

/**
 * Значок владения у предмета в «Снаряжении». B-26: у друида металлический доспех/щит — «⚠️ металл» вместо «✓ владеете»
 * (dnd.su, «Друид» → «Владения»: «друиды не носят доспехи и щиты из металла»); материал не указан — «уточните у Мастера».
 */
function eqProfBadge(it, prof, profs, showProf = true) {
  if (profs?.druid && prof !== false) {
    const m = EQ.druidMetal(it);
    if (m === true) return el('span', { class: 'eq-badge is-noprof', title: `Друид: ${EQ.DRUID_METAL_TEXT} (dnd.su)` }, '⚠️ металл');
    if (m === null) return el('span', { class: 'eq-badge is-custom', title: `Друид: ${EQ.DRUID_METAL_TEXT} (dnd.su). Материал в описании не указан.` }, 'уточните у Мастера');
  }
  if (prof === true) return showProf ? el('span', { class: 'eq-badge is-prof' }, '✓ владеете') : null;
  if (prof === false) return el('span', { class: 'eq-badge is-noprof' }, 'нет владения');
  return null;
}

/** Инвентарь текущего режима с «надето»: авто (лучший доспех с владением + щит), затем ручные правки. */
function eqInventory(st, profs = eqProfs(st), stats = eqStats(st)) {
  const q = eqState(st);
  const items = q.mode === 'purchase'
    ? q.cart.map(({ legacy: _l, ...e }) => ({ ...e, source: 'purchase' }))
    : [...EQ.classItems(st.mecClass, q.classChoices).map(e => ({ ...e, source: 'class' })),
       ...eqBackgroundItems(st).map(({ text: _t, fromChoice: _f, textChoice: _c, unresolved: _u, ...e }) => e)];
  EQ.autoEquip(items, profs, stats);
  // B-35: доспех и щит надеваются сами, только если КД становится выше, чем без них (ЗбД Варвара/Монаха,
  // «Драконья устойчивость»); при равном КД — не надевать
  const isCat = (e, cat) => !e.custom && EQ.itemById(e.id)?.category === cat;
  const autoA = items.find(e => e.equipped && isCat(e, 'armor')) || null;
  const autoS = items.find(e => e.equipped && isCat(e, 'shield')) || null;
  if (autoA || autoS) {
    let best = null;
    for (const a of autoA ? [autoA, null] : [null]) for (const sh of autoS ? [autoS, null] : [null]) {
      for (const e of items) if (isCat(e, 'armor') || isCat(e, 'shield')) e.equipped = e === a || e === sh;
      const ac = classArmorClassRaw(st, items, stats, profs).ac;
      const worn = (a ? 1 : 0) + (sh ? 1 : 0);
      if (!best || ac > best.ac || (ac === best.ac && worn < best.worn)) best = { a, sh, ac, worn };
    }
    for (const e of items) if (isCat(e, 'armor') || isCat(e, 'shield')) e.equipped = e === best.a || e === best.sh;
  }
  for (const cat of ['armor', 'shield']) {
    if (!(cat in q.equippedManual)) continue;
    const want = q.equippedManual[cat];
    let done = false;
    for (const e of items) {
      if (e.custom || EQ.itemById(e.id)?.category !== cat) continue;
      e.equipped = !done && want != null && e.id === want;
      if (e.equipped) done = true;
    }
  }
  return items;
}

function eqCoins(st) {
  const q = eqState(st);
  if (q.mode === 'purchase') return EQ.gpToCoins(Math.max(0, eqGoldLeft(st)));
  return { gp: eqBgGold(st), sp: 0, cp: 0 };
}

/** Можно ли идти дальше: { ok, reason }. */
function eqStepStatus(st, inv, profs, stats) {
  const q = eqState(st);
  if (!st.mecClass) return { ok: false, reason: 'Выберите класс' };
  if (q.mode === 'standard') {
    if (!EQ.classChoicesComplete(st.mecClass, q.classChoices, profs)) return { ok: false, reason: 'Выберите все варианты снаряжения класса' };
    if (mecBgObj(st)?.name === 'Собственная предыстория' && !eqBgSource(st)) return { ok: false, reason: 'Выберите снаряжение предыстории' };
    if (eqBackgroundItems(st).some(e => e.unresolved)) return { ok: false, reason: 'Выберите снаряжение предыстории' }; // B-39 В
  } else if (!q.gold) return { ok: false, reason: 'Бросьте кости стартового золота' };
  // B-12 (решение заказчика): в «Закупе» Волшебник покупает Книгу заклинаний сам — предупреждаем, «Далее» не блокируем
  const bookWarn = q.mode === 'purchase' && st.mecClass === 'wizard' && !q.cart.some(e => !e.custom && e.id === 'spellbook')
    ? '⚠️ Волшебнику нужна Книга заклинаний — купите её в «Закупе».' : '';
  if (q.encumbrance) {
    const w = EQ.totalWeight(inv), cap = EQ.carryCapacity(stats.str);
    if (w > cap) return { ok: false, reason: `Перегруз: ${EQ.fmtWeight(w)} из ${cap} фнт. (Сила × 15)` };
  }
  return { ok: true, reason: bookWarn };
}

/** character.equipment (ТЗ 4.4.7 «Данные», schemaVersion 3). */
function eqRecord(st) {
  const q = eqState(st);
  const items = eqInventory(st).map(e => {
    const o = { id: e.id || null, qty: e.qty || 1, source: e.source };
    if (!e.id || e.custom) o.name = EQ.entryName(e);
    if (e.custom) o.custom = { costGp: +e.custom.costGp || 0, weightLb: +e.custom.weightLb || 0, ...(e.custom.costText ? { costText: e.custom.costText } : {}) };
    const cat = EQ.itemById(e.id)?.category;
    if (!e.custom && (cat === 'armor' || cat === 'shield')) o.equipped = !!e.equipped;
    return o;
  });
  return {
    mode: q.mode,
    encumbrance: q.encumbrance,
    // B-36: в персонажа — только текущий вариант (запомненные выборы других вариантов остаются в мастере)
    classChoices: q.mode === 'standard'
      ? Object.fromEntries(Object.entries(q.classChoices).map(([k, c]) => [k, { option: c?.option, picks: [...(c?.picks || [])] }])) : {},
    gold: q.gold ? { ...q.gold, spent: eqSpent(st) } : null,
    items,
    coins: eqCoins(st),
  };
}

/** Что потеряется при смене класса (ТЗ 4.4.7 «Смена класса / предыстории»). */
function eqClassLosses(st) {
  const q = st.mecEquip;
  if (!q) return [];
  const out = [];
  if (Object.keys(q.classChoices || {}).length) out.push('выбор стартового снаряжения класса');
  if (q.gold) out.push(`бросок стартового золота (${q.gold.total} зм)`);
  if ((q.cart || []).length) out.push(`покупки «Закупа» (${q.cart.length})`);
  return out;
}
function eqResetForClass(st) {
  const q = eqState(st);
  q.classChoices = {}; q.gold = null; q.goldClass = null; q.cart = []; q.equippedManual = {};
  delete q.legacyNote;
}

// ─── Equipment step: UI ───────────────────────────────────────────────────────

const EQ_LETTERS = ['а', 'б', 'в', 'г', 'д'];
const COIN_TO_GP = { зм: 1, см: 0.1, мм: 0.01 };
// Каталог «Закупа»: категории по порядку ТЗ, подгруппы — группы таблиц dnd.su.
const SHOP_CATS = [
  { id: 'weapon', label: 'Оружие',      test: it => it.category === 'weapon' },
  { id: 'armor',  label: 'Доспехи',     test: it => it.category === 'armor' || it.category === 'shield' },
  { id: 'gear',   label: 'Снаряжение',  test: it => ['gear', 'ammo', 'focus'].includes(it.category) },
  { id: 'kit',    label: 'Наборы',      test: it => it.category === 'kit' },
  { id: 'tool',   label: 'Инструменты', test: it => it.category === 'tool' },
];
// ─── «Совет новичку» под класс (B-12, v0.38) ─────────────────────────────────
// Решения заказчика 2026-09-28; сверка эксперта — docs/reviews/2026-09-28_expert-newbie-tips-check.md.
// Предметы, цены, КД, урон — только из каталога dnd.su. Подписи «зачем» не пишем (не утверждены).
/** Фокусировка по тексту класса dnd.su «Фокусировка заклинания». Мешочек — всем заклинателям:
 *  dnd.su 157-spellcasting, «Материальный (М)»: «Персонаж может использовать мешочек с компонентами
 *  или заклинательную фокусировку вместо указанных компонентов». Изобретатель (TCE) — текста нет, строки нет. */
const TIP_FOCUS = {
  wizard: 'arcane-focus', sorcerer: 'arcane-focus', warlock: 'arcane-focus',
  cleric: 'holy-symbol', druid: 'druidic-focus', bard: 'musical-instrument',
};
/** Боеприпасы и тара к дальнобойному оружию (dnd.su: колчан — «20 стрел», контейнер — «20 арбалетных болтов»). */
const TIP_AMMO = {
  shortbow: ['arrows-20', 'quiver'], longbow: ['arrows-20', 'quiver'],
  'crossbow-light': ['crossbow-bolts-20', 'case-crossbow-bolt'], 'crossbow-hand': ['crossbow-bolts-20', 'case-crossbow-bolt'],
  'crossbow-heavy': ['crossbow-bolts-20', 'case-crossbow-bolt'], sling: ['sling-bullets-20'], blowgun: ['blowgun-needles-50'],
};
/** Инструменты, которыми класс владеет с 1 ур. и которые есть в его стартовом снаряжении. */
const TIP_CLASS_TOOLS = { rogue: ['thieves-tools'] };
/** «Защита без доспехов» (dnd.su): Варвар — 10 + ЛОВ + ТЕЛ, щит можно; Монах — 10 + ЛОВ + МДР, без щита. */
function tipUnarmoredAC(classId, stats) {
  const m = v => Math.floor(((v ?? 10) - 10) / 2);
  if (classId === 'barbarian') return 10 + m(stats.dex) + m(stats.con);
  if (classId === 'monk') return 10 + m(stats.dex) + m(stats.wis);
  return null;
}

function buildEquipStep(st, goMech) {
  const q = eqState(st);
  const clsName = CLASS_DATA.find(c => c.id === st.mecClass)?.name ?? null;
  const profs = eqProfs(st);
  const stats = eqStats(st);
  const cap = EQ.carryCapacity(stats.str);
  const rules = makeRulePanel();
  const save = () => scheduleSave(st);

  let shopQuery = '';
  let invOpen = false;          // мобиле: раскрыт ли список «В сумке»
  let tipsOpen = false;         // «Совет новичку» раскрыт — закрывает только сам игрок (не сбрасывается при покупке)
  let onlyProf = false;         // каталог: только то, чем владеете (ссылка из совета)
  const openCats = new Set();   // раскрытые категории каталога

  const bodyEl = el('div', { class: 'eq-body' });
  const footSum = el('span', { class: 'eq-foot-sum' });
  const footReason = el('span', { class: 'eq-foot-reason' });
  const nextBtn = el('button', { class: 'cnew-save-btn', onClick: () => { if (!nextBtn.disabled) goMech('final'); } }, 'Далее → Финал');
  const foot = el('div', { class: 'mech-foot eq-foot' }, footSum, footReason, nextBtn);

  function refreshFoot() {
    const inv = eqInventory(st, profs, stats);
    const w = EQ.totalWeight(inv);
    const ac = classArmorClass(st, inv, stats, profs); // v0.39: с умениями класса (ЗбД, «Оборона», «Драконья устойчивость»)
    footSum.textContent = `КД ${ac.ac} · Вес ${EQ.fmtWeight(w)}${q.encumbrance ? ` из ${cap}` : ''}`;
    footSum.classList.toggle('is-danger', q.encumbrance && w > cap);
    const s = eqStepStatus(st, inv, profs, stats);
    nextBtn.disabled = !s.ok;
    footReason.textContent = s.reason;
  }

  // ── Строка предмета (оружие — урон и свойства, доспех — КД, Сила, Скрытность) ──
  function itemRow(it, { qty = 1, showProf = false, label = null, extra = [] } = {}) {
    const prof = EQ.isProficient(it, profs);
    return el('div', { class: `eq-item${prof === false ? ' is-noprof' : ''}` },
      el('div', { class: 'eq-item-main' },
        el('span', { class: 'eq-item-name' }, label || it.name, qty > 1 ? el('span', { class: 'eq-qty' }, ` ×${qty}`) : null),
        eqProfBadge(it, prof, profs, showProf), // B-26
        rules.infoBtn(() => itemRuleNodes(it, { profs })),
      ),
      EQ.itemStats(it) ? el('div', { class: 'eq-item-stat' }, EQ.itemStats(it)) : null,
      it.category === 'kit' ? el('details', { class: 'eq-kit' }, el('summary', {}, 'Состав набора'), el('p', {}, it.contentsText)) : null,
      ...extra,
    );
  }
  const textRow = text => el('div', { class: 'eq-item is-text' }, el('div', { class: 'eq-item-main' }, el('span', { class: 'eq-item-name' }, text)));

  // ── Вложенный выбор: второй список конкретных предметов группы ──
  function pickSelect(pk, value, onPick) {
    const ids = EQ.PICK_GROUPS[pk.group].ids.filter(id => !pk.except.includes(id));
    const byGroup = {};
    for (const id of ids) { const it = EQ.itemById(id); (byGroup[it.group] = byGroup[it.group] || []).push(it); }
    const optEl = it => {
      const prof = EQ.isProficient(it, profs);
      const stat = it.category === 'weapon' ? ` — ${it.damageText}` : '';
      return el('option', { value: it.id }, `${it.name}${stat}${prof === false ? ' (нет владения)' : ''}`);
    };
    const groups = Object.entries(byGroup);
    const sel = el('select', { class: 'equip-choice-sel eq-pick-sel', 'aria-label': pk.label },
      el('option', { value: '' }, `— ${pk.label}: выберите —`),
      ...(groups.length > 1
        ? groups.map(([g, list]) => el('optgroup', { label: EQ.ITEM_GROUPS[g]?.name || g }, ...list.map(optEl)))
        : ids.map(id => optEl(EQ.itemById(id)))),
    );
    sel.value = value || '';
    sel.addEventListener('change', () => onPick(sel.value || null));
    return el('div', { class: `eq-pick${value ? '' : ' is-empty'}` },
      el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾')),
      rules.infoBtn(() => groupRuleNodes(pk.group), pk.label));
  }

  function optionBody(opt, si) {
    const wrap = el('div', { class: 'eq-opt-body' });
    const ch = q.classChoices[si] || { option: 0, picks: [] };
    let pi = 0;
    for (const part of opt.parts) {
      if (part.id) { wrap.append(itemRow(EQ.itemById(part.id), { qty: part.qty })); continue; }
      for (let k = 0; k < (part.n || 1); k++) {
        const idx = pi++;
        const pk = { group: part.pick, except: part.except || [], label: EQ.PICK_GROUPS[part.pick].label };
        const val = ch.picks?.[idx] || null;
        wrap.append(pickSelect(pk, val, id => {
          const c = q.classChoices[si] || (q.classChoices[si] = { option: 0, picks: [] });
          c.picks = [...(c.picks || [])]; c.picks[idx] = id;
          delete q.legacyNote; save(); renderBody();
        }));
        if (val) wrap.append(itemRow(EQ.itemById(val)));
      }
    }
    return wrap;
  }

  function slotEl(slot, si) {
    const box = el('div', { class: 'eq-slot' });
    if (!slot.choice) {
      box.append(el('div', { class: 'eq-slot-text' }, slot.text), optionBody(slot.options[0], si));
      return box;
    }
    const cur = q.classChoices[si]?.option;
    slot.options.forEach((opt, oi) => {
      const allowed = EQ.optionAllowed(opt, profs);
      const sel = cur === oi;
      const radio = el('input', { type: 'radio', name: `eq-slot-${si}` });
      radio.checked = sel;
      radio.disabled = !allowed;
      radio.addEventListener('change', () => {
        // B-36: вложенный выбор запоминается для каждого варианта а)/б)/в) — а) → б) → а) возвращает прежнее оружие
        const prev = q.classChoices[si] || {};
        const byOption = { ...(prev.byOption || {}) };
        if (Number.isInteger(prev.option) && (prev.picks || []).length) byOption[prev.option] = [...prev.picks];
        q.classChoices[si] = { option: oi, picks: [...(byOption[oi] || [])], byOption };
        delete q.legacyNote; save(); renderBody();
      });
      box.append(el('label', { class: `eq-opt${sel ? ' is-sel' : ''}${allowed ? '' : ' is-locked'}` },
        radio,
        el('span', { class: 'eq-opt-letter' }, `${EQ_LETTERS[oi]})`),
        el('span', { class: 'eq-opt-text' }, opt.text),
        allowed ? null : el('span', { class: 'eq-badge is-noprof' }, '🔒 нет владения'),
      ));
      if (sel && allowed) box.append(optionBody(opt, si));
    });
    return box;
  }

  // ── Стандарт ──
  function renderStandard() {
    const clsSec = el('section', { class: 'equip-section' },
      el('div', { class: 'equip-section-hd' },
        el('span', { class: 'equip-section-source is-class' }, 'Класс'),
        el('span', { class: 'equip-section-name' }, clsName ?? 'не выбран')),
    );
    if (q.legacyNote && !Object.keys(q.classChoices).length) clsSec.append(el('p', { class: 'eq-legacy-note' }, '⚠️ ' + q.legacyNote));
    const slots = EQ.classSlots(st.mecClass);
    if (!slots.length) clsSec.append(el('p', { class: 'equip-empty' }, 'Выберите класс'));
    slots.forEach((slot, si) => clsSec.append(slotEl(slot, si)));

    const bg = mecBgObj(st);
    const bgSec = el('section', { class: 'equip-section' },
      el('div', { class: 'equip-section-hd' },
        el('span', { class: 'equip-section-source is-bg' }, 'Предыстория'),
        el('span', { class: 'equip-section-name' }, bg?.name ?? 'не выбрана')),
    );
    if (!bg) bgSec.append(el('p', { class: 'equip-empty' }, 'Выберите предысторию'));
    else {
      if (bg.name === 'Собственная предыстория') {
        const opts = bgChoiceOptions('bg_equipment');
        const sel = el('select', { class: 'equip-choice-sel', 'aria-label': 'Снаряжение предыстории' },
          el('option', { value: '' }, '— выберите предысторию —'), ...opts.map(o => el('option', { value: o }, o)));
        sel.value = st.mecEquipChoices?.bgch_bg_equipment || '';
        sel.addEventListener('change', () => {
          if (!st.mecEquipChoices) st.mecEquipChoices = {};
          if (sel.value) st.mecEquipChoices.bgch_bg_equipment = sel.value; else delete st.mecEquipChoices.bgch_bg_equipment;
          save(); renderBody();
        });
        bgSec.append(el('label', { class: 'eq-donor' }, el('span', { class: 'eq-donor-lbl' }, 'Снаряжение какой предыстории взять:'),
          el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'))));
      }
      const src = eqBgSource(st);
      if (src) {
        mecSyncBgItems(st);
        const choiceEls = new Map(mecBgItemChoices(st).map(({ ch, profVal }) => [ch.type, buildBgItemEl(st, ch, profVal, renderBody)]));
        for (const e of eqBackgroundItems(st)) {
          if (e.fromChoice && choiceEls.has(e.fromChoice)) { bgSec.append(choiceEls.get(e.fromChoice)); choiceEls.delete(e.fromChoice); }
          if (e.textChoice) { // B-39 В: «А или Б» в снаряжении предыстории — выбор
            const key = `bgtext:${e.textChoice}`;
            const sel = el('select', { class: 'equip-choice-sel', 'aria-label': e.textChoice },
              el('option', { value: '' }, '— выберите —'), ...BG_EQUIP_TEXT_CHOICES[e.textChoice].map(o => el('option', { value: o }, o)));
            sel.value = st.mecEquipChoices?.[key] || '';
            sel.addEventListener('change', () => {
              if (!st.mecEquipChoices) st.mecEquipChoices = {};
              if (sel.value) st.mecEquipChoices[key] = sel.value; else delete st.mecEquipChoices[key];
              save(); renderBody();
            });
            bgSec.append(el('div', { class: `eq-pick${e.unresolved ? ' is-empty' : ''}` },
              el('span', { class: 'eq-donor-lbl' }, e.textChoice.replace(/ \(.*\)$/, '') + ':'),
              el('span', { class: 'equip-choice-wrap' }, sel, el('span', { class: 'equip-choice-arrow' }, '▾'))));
            if (e.unresolved) continue;
          }
          const it = EQ.itemById(e.id);
          bgSec.append(it ? itemRow(it, { label: e.fromChoice ? null : e.text }) : textRow(e.text));
        }
        for (const node of choiceEls.values()) bgSec.append(node);
        bgSec.append(el('div', { class: 'eq-coins' }, el('span', { class: 'eq-coins-lbl' }, 'Монеты'), el('span', { class: 'eq-coins-val' }, `${eqBgGold(st)} зм`)));
      }
    }
    const inv = eqInventory(st, profs, stats);
    const acSec = el('section', { class: 'equip-section eq-ac-sec' },
      el('div', { class: 'equip-section-hd' }, el('span', { class: 'equip-section-name' }, 'Надето')),
      (() => {
        const c = classArmorClass(st, inv, stats, profs);
        const sh = EQ.smallHeavyWarning(inv, mecRaceSize(st)); // B-16
        return acBlock({ ...c.base, ac: c.ac, warnings: [...c.base.warnings, ...(sh ? [sh] : [])] });
      })(),
      el('p', { class: 'eq-hint' }, 'Доспех и щит надеваются автоматически; снять или надеть другой можно на «Финале».'),
    );
    return [clsSec, bgSec, acSec];
  }

  // ── Закуп ──
  function autoRoll() {
    const f = EQ.goldFormula(st.mecClass);
    if (!f) return;
    q.gold = EQ.rollGold(f);
    q.goldClass = st.mecClass;
    save();
  }

  function addToCart(entry, times = 1) {
    const cost = EQ.entryUnitCost(entry) * times;
    if (cost > eqGoldLeft(st) + 1e-9) return false;
    const ex = entry.id && !entry.custom && q.cart.find(c => c.id === entry.id && !c.custom);
    if (ex) ex.qty += times; else q.cart.push({ ...entry, qty: times });
    save();
    return true;
  }

  function renderPurchase() {
    if (!q.gold && st.mecClass) autoRoll();
    const g = q.gold;
    const left = eqGoldLeft(st);
    const cart = q.cart;
    const w = EQ.totalWeight(cart);
    const nItems = cart.reduce((a, e) => a + (e.qty || 1), 0);

    const rollLine = g ? el('div', { class: 'eq-roll' },
      el('span', { class: 'eq-roll-f' }, `🎲 ${g.formula || 'золото'}`),
      g.rolls?.length ? el('span', { class: 'eq-roll-dice' }, ...g.rolls.map(r => el('span', { class: 'eq-die' }, String(r)))) : null,
      g.rolls?.length && g.mult > 1 ? el('span', { class: 'eq-roll-x' }, `× ${g.mult}`) : null,
      el('span', { class: 'eq-roll-total' }, `= ${g.total} зм`),
    ) : el('p', { class: 'equip-empty' }, 'Выберите класс — от него зависит стартовое золото');
    const goldNote = el('p', { class: 'eq-hint' }, EQ.classGoldText(st.mecClass), ' Бросок делается один раз.');

    // Плашка «Золото · Вес · Предметов N» (на мобиле липкая, с раскрытием списка)
    const bar = el('div', { class: 'eq-bar' },
      el('span', { class: `eq-bar-v${left < 0 ? ' is-danger' : ''}` }, `${EQ.fmtGp(left)} зм`, el('span', { class: 'eq-bar-l' }, ` из ${g?.total ?? 0}`)),
      el('span', { class: `eq-bar-v${q.encumbrance && w > cap ? ' is-danger' : ''}` }, EQ.fmtWeight(w), q.encumbrance ? el('span', { class: 'eq-bar-l' }, ` из ${cap}`) : null),
      el('span', { class: 'eq-bar-v' }, `Предметов ${nItems}`),
      el('button', { class: `eq-bar-toggle${invOpen ? ' is-open' : ''}`, type: 'button', onClick: () => {
        invOpen = !invOpen; renderBody();
        if (invOpen) bodyEl.querySelector('.eq-inv')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } },
        invOpen ? 'Скрыть сумку ▴' : 'В сумке ▾'),
    );

    const invList = el('div', { class: `eq-inv${invOpen ? ' is-open' : ''}` });
    if (!cart.length) invList.append(el('p', { class: 'shop-inv-empty' }, 'Сумка пуста'));
    const cats = [...SHOP_CATS, { id: 'custom', label: 'Свои предметы', test: () => false }];
    for (const cat of cats) {
      const rows = cart.filter(e => cat.id === 'custom' ? !!e.custom : (!e.custom && cat.test(EQ.itemById(e.id) || {})));
      if (!rows.length) continue;
      invList.append(el('div', { class: 'eq-inv-cat' }, cat.label));
      for (const e of rows) {
        const unit = EQ.entryUnitCost(e);
        const it = e.custom ? null : EQ.itemById(e.id);
        // B-10: ⓘ у каждой купленной строки (как в каталоге); набор — раскрытым (вариант А)
        invList.append(el('div', { class: `eq-inv-row${it?.category === 'kit' ? ' is-kit' : ''}` },
          el('span', { class: 'eq-inv-name' }, EQ.entryName(e),
            e.custom ? el('span', { class: 'eq-badge is-custom' }, 'Свой предмет') : null,
            it ? rules.infoBtn(() => itemRuleNodes(it, { profs })) : null),
          el('span', { class: 'eq-inv-cost' }, `${EQ.fmtGp(unit * e.qty)} зм`),
          el('span', { class: 'eq-inv-ctrl' },
            el('button', { class: 'shop-qty-btn', type: 'button', 'aria-label': 'Меньше', onClick: () => {
              e.qty -= 1; if (e.qty <= 0) q.cart = q.cart.filter(x => x !== e); save(); renderBody();
            } }, '−'),
            el('span', { class: 'shop-qty-n' }, `×${e.qty}`),
            (() => {
              const b = el('button', { class: 'shop-qty-btn', type: 'button', 'aria-label': 'Больше', onClick: () => {
                if (unit <= eqGoldLeft(st) + 1e-9) { e.qty += 1; save(); renderBody(); }
              } }, '+');
              b.disabled = unit > left + 1e-9;
              return b;
            })(),
            el('button', { class: 'shop-rm-btn', type: 'button', title: 'Убрать (цена вернётся)', 'aria-label': 'Убрать', onClick: () => {
              q.cart = q.cart.filter(x => x !== e); save(); renderBody();
            } }, '×'),
          ),
        ));
        const kitRows = kitContentRows(it, e.qty, { rules, profs });
        if (kitRows.length) invList.append(el('div', { class: 'eq-kit-list' }, ...kitRows));
      }
    }

    // Каталог
    const search = el('input', { class: 'shop-search', type: 'search', placeholder: 'Поиск предмета…', 'aria-label': 'Поиск предмета' });
    search.value = shopQuery;
    search.addEventListener('input', () => { shopQuery = search.value; renderCatalog(); });
    const addCustom = el('button', { class: 'shop-add-btn', type: 'button', onClick: () => openCustomItemModal() }, '+ Свой предмет');
    const catalog = el('div', { class: 'eq-catalog' });
    function renderCatalog() {
      catalog.innerHTML = '';
      const qn = shopQuery.trim().toLowerCase().replace(/ё/g, 'е');
      for (const cat of SHOP_CATS) {
        let items = EQ.ITEMS.filter(it => cat.test(it) && it.costGp != null);
        if (onlyProf) items = items.filter(it => EQ.isProficient(it, profs) !== false);
        if (qn) items = items.filter(it => it.name.toLowerCase().replace(/ё/g, 'е').includes(qn));
        if (!items.length) continue;
        const det = el('details', { class: 'shop-cat-det' });
        det.open = !!qn || openCats.has(cat.id);
        det.addEventListener('toggle', () => { if (!qn) { if (det.open) openCats.add(cat.id); else openCats.delete(cat.id); } });
        det.append(el('summary', { class: 'shop-cat-sum' }, el('span', {}, cat.label), el('span', { class: 'shop-count' }, String(items.length))));
        let lastGroup;
        for (const it of items) {
          const grp = it.group && EQ.ITEM_GROUPS[it.group] && it.category !== 'kit' ? EQ.ITEM_GROUPS[it.group].name : null;
          if (grp !== lastGroup && (grp || lastGroup)) det.append(el('div', { class: 'shop-sub-sum' }, grp || 'Прочее'));
          lastGroup = grp;
          const prof = EQ.isProficient(it, profs);
          const cant = it.costGp > left + 1e-9;
          const buy = el('button', { class: `shop-buy-btn${cant ? ' is-broke' : ''}`, type: 'button', title: cant ? 'Недостаточно золота' : 'Купить', 'aria-label': `Купить: ${it.name}`,
            onClick: () => { if (addToCart({ id: it.id })) renderBody(); } }, '+');
          buy.disabled = cant;
          det.append(el('div', { class: `eq-shop-row${prof === true ? ' is-prof' : ''}${prof === false ? ' is-noprof' : ''}` },
            el('div', { class: 'eq-shop-main' },
              el('span', { class: 'eq-shop-name' }, it.name),
              eqProfBadge(it, prof, profs), // B-26
              rules.infoBtn(() => itemRuleNodes(it, { profs }))),
            EQ.itemStats(it) ? el('div', { class: 'eq-item-stat' }, EQ.itemStats(it)) : null,
            el('span', { class: 'eq-shop-cost' }, it.cost),
            el('span', { class: 'eq-shop-wt' }, it.category === 'kit' ? `≈ ${EQ.fmtWeight(it.weightLb)}` : (it.weightLb ? it.weight : '—')),
            buy,
          ));
        }
        catalog.append(det);
      }
      if (onlyProf) catalog.prepend(el('div', { class: 'eq-onlyprof' }, 'Показано только то, чем владеете',
        el('button', { class: 'eq-onlyprof-x', type: 'button', onClick: () => { onlyProf = false; renderCatalog(); } }, 'показать всё ✕')));
      if (!catalog.children.length) catalog.append(el('p', { class: 'shop-inv-empty' }, 'Ничего не найдено'));
    }
    renderCatalog();

    // «Совет новичку» под класс (B-12): строки — только нужные классу; строка зачёркнута, когда в сумке есть предмет строки
    const cartIds = new Set(cart.filter(e => !e.custom).map(e => e.id));
    const inCart = ids => ids.filter(id => cartIds.has(id));
    const dexMod = Math.floor(((stats.dex ?? 10) - 10) / 2);
    const cls = st.mecClass;
    function tipChip(id, { stat = null, warn = null } = {}) {
      const it = EQ.itemById(id);
      if (!it) return null;
      const cant = (it.costGp || 0) > left + 1e-9;
      const b = el('button', { class: 'eq-tip-chip', type: 'button', title: cant ? 'Недостаточно золота' : `Купить: ${it.name}`,
        onClick: () => { if (addToCart({ id })) renderBody(); } },
        el('span', {}, it.name), stat ? el('span', { class: 'eq-tip-stat' }, stat) : null,
        warn ? el('span', { class: 'eq-badge is-tce', title: warn.title }, warn.text) : null,
        el('span', { class: 'eq-tip-cost' }, it.costGp != null ? `${EQ.fmtGp(it.costGp)} зм` : it.cost));
      b.disabled = cant;
      return b;
    }
    function tipRow({ ico, title, pill = null, sub = null, ids, chips = null, link = null }) {
      const have = inCart(ids);
      const done = have.length > 0;
      return el('li', { class: `eq-tip-row${done ? ' is-have' : ''}${pill ? ' is-must' : ''}` },
        el('div', { class: 'eq-tip-hd' },
          el('span', { class: 'eq-tip-ico' }, ico),
          el('span', { class: 'eq-tip-title' }, title),
          pill ? el('span', { class: 'eq-tip-pill' }, pill) : null,
          sub ? el('span', { class: 'eq-tip-sub' }, sub) : null,
          done ? el('span', { class: 'equip-tips-have' }, '✓ есть: ' + have.map(id => EQ.itemById(id)?.name).join(', ')) : null),
        done ? null : (chips ? el('div', { class: 'eq-tip-chips' }, ...chips.filter(Boolean)) : link));
    }
    const tipRows = [];
    if (cls) {
      // 1. Набор — всем
      tipRows.push(tipRow({ ico: '🎒', title: 'Набор снаряжения', sub: 'другие наборы — в каталоге «Наборы»',
        ids: EQ.ITEMS.filter(it => it.category === 'kit').map(it => it.id), chips: [tipChip('explorers-pack')] }));
      // 2. Книга заклинаний — Волшебнику (решение заказчика: в «Закупе» её надо купить)
      if (cls === 'wizard') tipRows.push(tipRow({ ico: '📖', title: 'Книга заклинаний', pill: 'нужно классу', ids: ['spellbook'], chips: [tipChip('spellbook')] }));
      // 3. Мешочек с компонентами или фокусировка
      const fg = TIP_FOCUS[cls];
      if (fg) {
        let fIds = EQ.PICK_GROUPS[fg].ids;
        if (fg === 'musical-instrument') { const own = fIds.filter(id => profs.tools.has(id)); if (own.length) fIds = own; }
        tipRows.push(tipRow({ ico: '🔮', title: `Мешочек с компонентами или ${EQ.PICK_GROUPS[fg].label.toLowerCase()}`,
          ids: ['component-pouch', ...EQ.PICK_GROUPS[fg].ids], chips: [tipChip('component-pouch'), ...fIds.map(id => tipChip(id))] }));
      }
      // 4. Доспех — только владеемый; друиду — без металла; Варвару/Монаху — только если КД выше «Защиты без доспехов»
      const ud = tipUnarmoredAC(cls, stats);
      const armors = EQ.ITEMS.filter(it => it.category === 'armor' && EQ.isProficient(it, profs)
        && !(cls === 'druid' && EQ.ARMOR_METAL[it.id] === true)
        && (ud == null || EQ.armorAC(it, dexMod) > ud));
      if (armors.length) {
        tipRows.push(tipRow({ ico: '🛡', title: 'Доспех', sub: ud != null ? `только те, что лучше «Защиты без доспехов» (КД ${ud})` : 'только те, которыми владеете',
          ids: EQ.ITEMS.filter(it => it.category === 'armor').map(it => it.id),
          chips: armors.map(it => tipChip(it.id, {
            stat: `КД ${EQ.armorAC(it, dexMod)}${it.strReq ? ` · Сил ${it.strReq}` : ''}`,
            warn: cls === 'druid' && EQ.ARMOR_METAL[it.id] === null ? { text: 'уточните у Мастера', title: `Друиды не носят доспехи из металла. ${it.description || ''}` } : null,
          })) }));
      }
      // 5. Щит — если владеет
      const shield = EQ.itemById('shield');
      if (shield && EQ.isProficient(shield, profs)) {
        tipRows.push(tipRow({ ico: '⛨', title: 'Щит', ids: ['shield'], chips: [tipChip('shield', {
          stat: 'КД +2',
          warn: cls === 'druid' ? { text: 'деревянный', title: 'Друиды не используют щиты из металла; щит изготавливается из дерева или металла (dnd.su).' } : null,
        })] }));
      }
      // 6. Оружие — только владеемое; ≤ 6 видов — плашками, иначе ссылка на каталог с фильтром
      const weapons = EQ.ITEMS.filter(it => it.category === 'weapon' && EQ.isProficient(it, profs) && it.costGp != null);
      if (weapons.length) {
        tipRows.push(tipRow({ ico: '⚔', title: 'Оружие', sub: `владеете: ${weapons.length}`,
          ids: EQ.ITEMS.filter(it => it.category === 'weapon').map(it => it.id),
          chips: weapons.length <= 6 ? weapons.map(it => tipChip(it.id, { stat: it.damageText })) : null,
          link: weapons.length > 6 ? el('button', { class: 'eq-tip-link', type: 'button', onClick: () => {
            onlyProf = true; openCats.add('weapon'); renderCatalog();
            catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } }, 'Открыть в каталоге — только то, чем владеете →') : null }));
      }
      // 7. Боеприпасы — к купленному дальнобойному оружию без них
      const missAmmo = [...new Set([...cartIds].flatMap(id => TIP_AMMO[id] || []))].filter(id => !cartIds.has(id));
      if (missAmmo.length) tipRows.push(tipRow({ ico: '🏹', title: 'Боеприпасы', sub: 'к вашему дальнобойному оружию', ids: [], chips: missAmmo.map(id => tipChip(id)) }));
      // 8. Инструменты класса (владеет, есть в стартовом снаряжении класса)
      for (const id of (TIP_CLASS_TOOLS[cls] || []).filter(id => profs.tools.has(id))) {
        tipRows.push(tipRow({ ico: '🔧', title: EQ.itemById(id)?.name || id, sub: 'владеете', ids: [id], chips: [tipChip(id)] }));
      }
    }
    const tipsBody = el('div', { class: 'equip-tips-body', style: tipsOpen ? '' : 'display:none' },
      tipRows.length ? el('ul', { class: 'eq-tip-list' }, ...tipRows) : el('p', { class: 'equip-tips-intro' }, 'Выберите класс.'),
    );
    const tipsToggle = el('button', { class: 'equip-tips-toggle', type: 'button', onClick: () => {
      tipsOpen = !tipsOpen; tipsBody.style.display = tipsOpen ? '' : 'none';
      tipsToggle.querySelector('.equip-tips-arrow').textContent = tipsOpen ? '▲' : '▼';
    } }, el('span', { class: 'equip-tips-icon' }, '💡'), el('span', {}, 'Совет новичку — что купить в первую очередь?'),
    el('span', { class: 'equip-tips-arrow' }, tipsOpen ? '▲' : '▼'));

    return [
      el('div', { class: 'eq-roll-wrap' }, rollLine, goldNote),
      el('div', { class: 'eq-shop' },
        el('div', { class: 'eq-shop-inv' }, bar, invList),
        el('div', { class: 'eq-shop-cat' }, el('div', { class: 'shop-bar' }, search, addCustom), catalog,
          el('div', { class: 'equip-tips-card' }, tipsToggle, tipsBody)),
      ),
    ];
  }

  // «Свой предмет» (хоумбрю Мастера): цена и вес ≥ 0, на КД/атаки/владения не влияет
  function openCustomItemModal() {
    const nameInp = el('input', { class: 'shop-modal-inp', type: 'text', placeholder: 'Название', maxlength: '80' });
    const costInp = el('input', { class: 'shop-modal-cost-inp', type: 'number', placeholder: 'Цена', min: '0', step: '1', inputmode: 'decimal' });
    const coinSel = el('select', { class: 'shop-modal-coin' }, ...Object.keys(COIN_TO_GP).map(c => el('option', { value: c }, c)));
    const wtInp = el('input', { class: 'shop-modal-inp', type: 'number', placeholder: 'Вес (фнт.)', min: '0', step: '0.1', inputmode: 'decimal' });
    const err = el('p', { class: 'eq-modal-err' });
    const close = () => overlay.remove();
    const overlay = el('div', { class: 'shop-modal-bg' },
      el('div', { class: 'shop-modal' },
        el('h3', { class: 'shop-modal-title' }, 'Свой предмет'),
        el('p', { class: 'eq-hint' }, 'Для предметов Мастера. На КД, атаки и владения не влияет.'),
        nameInp, el('div', { class: 'shop-modal-cost-row' }, costInp, coinSel), wtInp, err,
        el('div', { class: 'shop-modal-btns' },
          el('button', { class: 'shop-modal-cancel', type: 'button', onClick: close }, 'Отмена'),
          el('button', { class: 'shop-modal-save', type: 'button', onClick: () => {
            const name = nameInp.value.trim();
            const amount = costInp.value === '' ? 0 : Number(costInp.value);
            const wt = wtInp.value === '' ? 0 : Number(wtInp.value);
            if (!name) { err.textContent = 'Введите название'; nameInp.focus(); return; }
            if (!Number.isFinite(amount) || amount < 0) { err.textContent = 'Цена не может быть отрицательной'; costInp.focus(); return; }
            if (!Number.isFinite(wt) || wt < 0) { err.textContent = 'Вес не может быть отрицательным'; wtInp.focus(); return; }
            const costGp = Math.round(amount * COIN_TO_GP[coinSel.value] * 100) / 100;
            if (costGp > eqGoldLeft(st) + 1e-9) { err.textContent = 'Не хватает золота'; return; }
            q.cart.push({ id: null, name, qty: 1, custom: { costGp, weightLb: Math.round(wt * 100) / 100, costText: amount ? `${amount} ${coinSel.value}` : '' } });
            save(); close(); renderBody();
          } }, 'Добавить'),
        ),
      ),
    );
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.append(overlay);
    nameInp.focus();
  }

  function renderBody() {
    bodyEl.innerHTML = '';
    bodyEl.className = `eq-body is-${q.mode}`;
    bodyEl.append(...(q.mode === 'purchase' ? renderPurchase() : renderStandard()));
    refreshFoot();
  }

  // ── Шапка: грузоподъёмность + режим ──
  const encCb = el('input', { type: 'checkbox' });
  encCb.checked = q.encumbrance;
  encCb.addEventListener('change', () => { q.encumbrance = encCb.checked; save(); renderBody(); encHint.textContent = encText(); });
  const encText = () => q.encumbrance ? `Сила ${stats.str} × 15 = ${cap} фнт.` : 'вес показывается справочно';
  const encHint = el('span', { class: 'eq-enc-hint' }, encText());

  function switchMode(m) {
    if (q.mode === m) return;
    const losses = m === 'purchase'
      ? (Object.keys(q.classChoices).length ? ['выбор стартового снаряжения класса (а/б/в и вложенные списки)'] : [])
      : (q.cart.length ? [`покупки «Закупа» (${q.cart.length})`] : []);
    const apply = () => {
      if (m === 'purchase') q.classChoices = {}; else q.cart = [];
      q.mode = m; q.equippedManual = {};
      save();
      modeBar.querySelectorAll('.equip-mode-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === m));
      renderBody();
    };
    if (!losses.length) { apply(); return; }
    openConfirmModal({
      title: m === 'purchase' ? 'Перейти к «Закупу»?' : 'Вернуться к «Стандарту»?',
      text: m === 'purchase'
        ? 'По PHB «Закуп» — это отказ от снаряжения класса и предыстории (включая монеты). Сбросится:'
        : 'Сбросится:',
      lines: losses, okText: 'Да, переключить', onOk: apply,
    });
  }
  const modeBar = el('div', { class: 'equip-mode-bar' },
    ...[['standard', 'Стандарт'], ['purchase', 'Закуп']].map(([m, label]) => {
      const b = el('button', { class: `equip-mode-btn${q.mode === m ? ' is-active' : ''}`, type: 'button', onClick: () => switchMode(m) }, label);
      b.dataset.mode = m;
      return b;
    }),
    el('label', { class: 'eq-enc' }, encCb, el('span', {}, 'Мастер учитывает грузоподъёмность'), encHint),
  );

  renderBody();

  return el('div', { class: 'mech-step-body is-equip' },
    el('h2', { class: 'mech-step-title' }, 'Снаряжение'),
    modeBar,
    el('div', { class: 'eq-layout' }, el('div', { class: 'eq-main' }, bodyEl), rules.aside),
    foot,
  );
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
  const asi = mecTotalAsi(st); // П9: раса + черты
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
  return missingPicks(res, picks).length === 0 && mecFeatChoicesMissing(st, 'spells').length === 0; // П10: вид урона «Стихийного адепта»
}

const CAST_TYPE_LABEL = {
  known:    'Известные заклинания',
  prepared: 'Подготовленные заклинания',
  book:     'Книга заклинаний',
  pact:     'Заклинания пакта',
};

const SPELL_FLAVOR = { // наши тексты для новичка; B-39 А — на «вы», «единицы чародейства» (термин dnd.su)
  'Бард':        'Магия — ваше искусство. Вы знаете небольшой набор заклинаний наизусть. На каждом новом уровне можете заменить одно из них.',
  'Волшебник':   'Вы учёный магии. Заклинания записаны в книге заклинаний. Каждый день вы выбираете, какие подготовить, — найденные свитки можно копировать в книгу.',
  'Друид':       'Природа говорит с вами. Весь список заклинаний открыт — каждый день вы подготавливаете нужные по ситуации.',
  'Жрец':        'Ваша магия — дар бога. Весь список доступен всегда. Каждый день вы заново выбираете, какие молитвы подготовить.',
  'Изобретатель':'Магия через изобретения. Вы подготавливаете заклинания каждый день из открытого списка.',
  'Колдун':      'Ваша сила — договор с покровителем. Заклинаний мало, но ячейки восстанавливаются уже после короткого отдыха.',
  'Чародей':     'Магия в вашей крови — врождённая сила. Вы знаете заклинания наизусть. Особая механика — единицы чародейства для дополнительных ячеек.',
};

const spellSigned = n => (n >= 0 ? '+' : '−') + Math.abs(n);
/** Материальный компонент со стоимостью (зм/см/мм/пм) — отдельный бейдж на карточке (ТЗ 4.4.6 ⑤). */
const costlyMaterial = sp => sp.components?.m && /\d[\d\s]*\s*(зм|см|мм|пм|эм)/.test(sp.components.material || '');

const className_ = st => CLASS_NAME_BY_ID[st.mecClass] || '';

/** Текст dnd.su «Ритуальное колдовство» класса (из rules_levels.js; null — пока не загружен или у класса нет). */
function ritualRuleText(className) {
  if (!_rulesLevels || !className) return null;
  for (const [k, r] of Object.entries(_rulesLevels)) {
    if (!k.startsWith(className + ':')) continue;
    const i = (r.full || []).findIndex(b => b.h === 'Ритуальное колдовство');
    if (i >= 0 && r.full[i + 1]?.p) return r.full[i + 1].p;
  }
  return null;
}

function buildSpellsStep(st, goMech) {
  // Тексты «Ритуальное колдовство» — из rules_levels.js (ленивая загрузка; после неё шаг перерисуется)
  if (!_rulesLevels) import('../data/rules_levels.js').then(m => { _rulesLevels = m.RULES_LEVELS; rebuild(); }).catch(() => {});
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
  function spellCard(sp, { tags = [], selected = false, disabled = false, locked = null, fixedFrom = null, onToggle = null, ritualTip = null } = {}) {
    const open = st._spellOpen.includes(sp.id);
    const badges = [];
    if (fixedFrom && fixedFrom > 1) badges.push(el('span', { class: 'spl-badge spl-badge--lvl' }, `с ${fixedFrom} ур.`));
    if (sp.ritual) {
      // Золотая рамка карточки + тултип на плашке: текст «Ритуальное колдовство» класса дословно с dnd.su (2026-09-28)
      const rb = el('span', { class: 'spl-badge spl-badge--ritual' + (ritualTip ? ' has-tip' : '') }, '🕯 Ритуал');
      if (ritualTip) {
        rb.addEventListener('mouseenter', e => showSrcTip(e, { name: 'Ритуальное колдовство', desc: ritualTip }));
        rb.addEventListener('mouseleave', hideSrcTip);
      }
      badges.push(rb);
    }
    if (sp.concentration) badges.push(el('span', { class: 'spl-badge' }, 'Конц.'));
    if (costlyMaterial(sp)) badges.push(el('span', { class: 'spl-badge spl-badge--mat', title: sp.components.material }, 'М: ' + sp.components.material));
    for (const t of tags) badges.push(el('span', { class: 'spl-badge spl-badge--tag' + (t === 'Опц. TCE' ? ' is-tce' : ''),
      title: t === 'Опц. TCE' ? 'Это расширение списка класса из Tasha\'s Cauldron — уточните у Мастера.' : '' }, t));
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
      + (locked ? ' is-locked' : '') + (fixedFrom ? ' is-fixed' : '') + (fixedFrom > 1 ? ' is-later' : '')
      + (sp.ritual ? ' is-ritual' : '');
    const card = el('div', { class: cls },
      el('div', { class: 'spl-top' },
        el('span', { class: 'spl-mark' }, fixedFrom || locked ? '🔒' : selected ? '✓' : ''),
        el('div', { class: 'spl-head' },
          el('span', { class: 'spl-name' }, sp.name),
          el('span', { class: 'spl-school' }, sp.school || ''),
        ),
        chevron,
      ),
      ...spellParamsEls(st, sp), // B-34
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
        ritualTip: sec.type === 'class' ? ritualRuleText(className) : null,
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
      el('div', { class: 'spl-grid' }, ...g.fixed.map(f => spellCard(f.spell, { fixedFrom: f.from, tags: f.note ? [f.note] : [], ritualTip: ['class', 'subclass'].includes(sec.type) ? ritualRuleText(className) : null }))),
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
    // B-08 (Гейт 0, ТЗ v0.45): дословно раздел «Фокусировка заклинания» класса на dnd.su
    // (изобретатель — абзац «Необходимый инструмент» целиком); кэш tools/raw_dndsu/2014/pages
    const focusMap = {
      'Бард': 'Вы можете использовать музыкальный инструмент в качестве фокусировки для ваших заклинаний барда.',
      'Жрец': 'Вы можете использовать священный символ в качестве заклинательной фокусировки для заклинаний жреца.',
      'Друид': 'Вы можете использовать фокусировку друидов в качестве заклинательной фокусировки для заклинаний друида.',
      'Волшебник': 'Вы можете использовать магическую фокусировку в качестве заклинательной фокусировки для заклинаний волшебника.',
      'Колдун': 'Вы можете использовать магическую фокусировку в качестве заклинательной фокусировки для заклинаний колдуна.',
      'Чародей': 'Вы можете использовать магическую фокусировку в качестве фокусировки для заклинаний чародея.',
      'Изобретатель': 'Вы создаёте эффекты ваших заклинаний изобретателя с помощью ваших инструментов. При накладывании любого заклинания с помощью умения «Использование заклинаний» вы должны держать в руках воровские инструменты или любые из инструментов ремесленника в качестве магической фокусировки (это значит, что у заклинаний есть материальный компонент, когда вы их накладываете). Вы должны иметь владение инструментом, чтобы использовать его таким образом. Смотрите главу 5 «Снаряжение» в «Книге игрока», где представлены описания всех инструментов. После получения умения «Инфузирование предмета» на 2-м уровне вы сможете в качестве магической фокусировки использовать любой предмет, насыщенный одной из ваших инфузий.',
    };
    const feat = (label, text) => el('div', { class: 'mech-spell-passport-feature' },
      el('span', { class: 'mech-spell-passport-feature-label' }, label),
      el('span', { class: 'mech-spell-passport-feature-text' }, text));
    const features = [];
    if (cfg.type === 'book') features.push(feat('📖 Книга заклинаний', 'На 1-м уровне у вас есть книга заклинаний, содержащая шесть заклинаний волшебника 1-го уровня по вашему выбору. Ваша книга заклинаний является хранилищем известных вам заклинаний волшебника, за исключением заговоров, которые вы всегда помните.')); // B-08: dnd.su
    // B-07: текст — дословно dnd.su (раздел «Использование заклинаний» класса); прежняя фраза была не с dnd.su
    const ritualText = ritualRuleText(className);
    if (ritualText) features.push(feat('🕯 Ритуальное колдовство', ritualText));
    if (focusMap[className]) features.push(feat('🔮 Фокусировка', focusMap[className]));
    // B-08: «Воззвания» (2 ур.) и «Метамагия» (3 ур.) убраны — справочно они на шаге «Класс» (таблица «Развитие по уровням»)
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
  const featLeft = mecFeatChoicesMissing(st, 'spells'); // П10
  nextBtn.disabled = missing.length > 0 || featLeft.length > 0;
  if (featLeft.length) nextBtn.classList.add('is-disabled');
  const left = [...featLeft, ...missing.map(m => m.group ? `${m.section.label.split(' — ').pop()}: ${m.group.title} (${m.have}/${m.need})`
    : m.section.classPicker && !m.section.classPicker.value ? `${m.section.label}: класс списка` : `${m.section.label}: выбор на шаге «Класс»`)];

  // П10 (ТЗ 4.4.3 ⑤а, п. 4): «Стихийный адепт» — вид урона на шаге «Заклинания»
  const eaIds = mecFeatIds(st).filter(id => FM.FEAT_CHOICES[id]?.damage);
  const elemBlock = eaIds.length ? el('div', { class: 'feat-card is-spells' },
    ...eaIds.map(id => featDamagePicker(st, id, () => rebuild()))) : null;

  return el('div', { class: 'mech-spell-wrap' },
    el('div', { class: 'mech-step-header' }, el('h2', { class: 'mech-step-title' }, '🔮 Заклинания')),
    passport,
    lateNote,
    elemBlock,
    counter,
    filterBar,
    ...res.sections.map(sectionEl),
    el('div', { class: 'mech-step-footer' },
      left.length ? el('p', { class: 'spl-left' }, 'Осталось выбрать: ' + left.join(' · ')) : null,
      nextBtn),
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
