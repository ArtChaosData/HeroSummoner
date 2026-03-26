/**
 * HeroSummoner — Create Character (new flow)
 * Steps: landing → concept | mechanics
 */
import { el } from '../utils.js';

// ─── State ────────────────────────────────────────────────────────────────────

function freshState() {
  return {
    step:       'landing',
    name:       '', playerName: '', alignment: '',
    age:        '', height: '', weight: '', eyes: '', skin: '', hair: '',
    traits:     '', appearance: '', backstory: '',
    allies:     '', features:   '', treasure:  '',
    portrait:   null,
  };
}

let _st = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(label, key, st, { rows, placeholder = '' } = {}) {
  const isArea = rows > 1;
  const inp = isArea
    ? el('textarea', { class: 'cnew-textarea', rows: String(rows), placeholder })
    : el('input',    { class: 'cnew-input',    type: 'text',        placeholder });
  inp.value = st[key] || '';
  inp.addEventListener('input', () => { st[key] = inp.value; });
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
  nameInp.addEventListener('input', () => { st.name = nameInp.value; });

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

function buildConcept(st, go) {

  // Portrait upload
  const fileInp = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const portrait = el('div', { class: 'cnew-portrait', onClick: () => fileInp.click() });

  function renderPortrait() {
    portrait.innerHTML = '';
    if (st.portrait) {
      portrait.append(el('img', { class: 'cnew-portrait-img', src: st.portrait, alt: '' }));
    } else {
      portrait.append(
        el('div', { class: 'cnew-portrait-ph' },
          el('span', { class: 'cnew-portrait-ph-icon', html: SVG_CAMERA }),
          el('span', {}, 'Аватар'),
        )
      );
    }
  }
  renderPortrait();
  fileInp.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { st.portrait = ev.target.result; renderPortrait(); };
    reader.readAsDataURL(file);
  });

  // Physical traits row
  const PHYS = [
    ['Возраст', 'age'], ['Рост', 'height'], ['Вес', 'weight'],
    ['Глаза',   'eyes'], ['Кожа', 'skin'],  ['Волосы', 'hair'],
  ];
  const physRow = el('div', { class: 'cnew-phys-row' },
    ...PHYS.map(([label, key]) => {
      const inp = el('input', { class: 'cnew-phys-input', type: 'text' });
      inp.value = st[key] || '';
      inp.addEventListener('input', () => { st[key] = inp.value; });
      return el('div', { class: 'cnew-phys-field' },
        el('label', { class: 'cnew-phys-label' }, label),
        inp,
      );
    }),
  );

  return el('div', { class: 'cnew-concept' },

    el('div', { class: 'cnew-concept-hd' },
      el('button', { class: 'btn btn-ghost btn-sm', onClick: () => go('landing') }, '← Назад'),
      el('span', { class: 'cnew-concept-hd-title' }, 'Концепт'),
    ),

    // Top: portrait + identity
    el('div', { class: 'cnew-top' },
      el('div', { class: 'cnew-portrait-col' }, portrait, fileInp),
      el('div', { class: 'cnew-identity-col' },
        field('Имя персонажа', 'name',       st, { placeholder: 'Как зовут героя?' }),
        el('div', { class: 'cnew-row-2' },
          field('Имя игрока',    'playerName', st, { placeholder: 'Кто за ним?' }),
          field('Мировоззрение', 'alignment',  st, { placeholder: 'Нейтральный…' }),
        ),
        physRow,
      ),
    ),

    // Content grid
    el('div', { class: 'cnew-grid' },
      field('Черты характера',           'traits',      st, { rows: 4, placeholder: 'Привычки, убеждения, причуды…' }),
      field('Внешность',                 'appearance',  st, { rows: 4, placeholder: 'Как выглядит персонаж…' }),
      field('Предыстория',               'backstory',   st, { rows: 5, placeholder: 'История до начала приключений…' }),
      field('Союзники и организации',    'allies',      st, { rows: 5, placeholder: 'Фракции, покровители, враги…' }),
      field('Доп. умения и особенности', 'features',    st, { rows: 4, placeholder: 'Языки, навыки, способности…' }),
      field('Сокровища',                 'treasure',    st, { rows: 4, placeholder: 'Ценные предметы, реликвии…' }),
    ),
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

/* Wizard: pointed hat + head + beard + staff */
const SVG_CONCEPT   = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L7 11h10L12 2z"/><line x1="5.5" y1="11" x2="18.5" y2="11"/><circle cx="12" cy="15" r="3"/><path d="M9.5 17.5Q12 22 14.5 17.5"/><line x1="19.5" y1="8.5" x2="22" y2="21"/><circle cx="19.5" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>`;
/* D20: hexagon facets */
const SVG_MECHANICS = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5Z"/><path d="M12 2L3 7.5L12 11.5L21 7.5Z"/><path d="M3 16.5L12 11.5L21 16.5"/><line x1="12" y1="11.5" x2="12" y2="22"/></svg>`;
const SVG_CAMERA    = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

// ─── Entry point ──────────────────────────────────────────────────────────────

export function renderCreateNew(container, router) {
  if (!_st) _st = freshState();
  const st = _st;

  // Load stylesheet once
  if (!document.getElementById('css-create-new')) {
    const link = document.createElement('link');
    link.id   = 'css-create-new';
    link.rel  = 'stylesheet';
    link.href = 'css/create-new.css';
    document.head.append(link);
  }

  function go(step) { st.step = step; render(); }

  function render() {
    container.innerHTML = '';
    if      (st.step === 'landing')   container.append(buildLanding(st, go));
    else if (st.step === 'concept')   container.append(buildConcept(st, go));
    else container.append(el('div', { class: 'cnew-wip' }, 'Механика — скоро'));
  }

  render();
}
