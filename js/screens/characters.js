/**
 * HeroSummoner — Screen 1: Character List
 */
import { DB }  from '../db.js';
import { el, toast, hpClass, initials, classColor, classSlug, confirm, downloadBlob } from '../utils.js';

const TABS = [
  { key: 'all',     label: 'Все',        icon: '📜' },
  { key: 'fav',     label: 'Избранные',  icon: '⭐' },
  { key: 'active',  label: 'Активные',   icon: '⚔️' },
  { key: 'dead',    label: 'Кладбище',   icon: '💀' },
  { key: 'archive', label: 'Архив',      icon: '📦' },
];

const EMPTY_MESSAGES = {
  all:     { icon: '📜', title: 'Нет персонажей', text: 'Создай своего первого героя — нажми «Создать».' },
  fav:     { icon: '⭐', title: 'Нет избранных',  text: 'Нажми звёздочку на карточке, чтобы добавить в избранные.' },
  active:  { icon: '⚔️', title: 'Нет активных',   text: 'Здесь будут персонажи, которых ты сейчас водишь.' },
  dead:    { icon: '💀', title: 'Кладбище пусто',  text: 'Все твои герои пока живы. Удачи!' },
  archive: { icon: '📦', title: 'Архив пуст',      text: 'Сюда можно отправить персонажей на хранение.' },
};

let _currentFilter = 'all';
let _allChars      = [];

/** Filter characters by active tab. */
function filterChars(chars, filter) {
  switch (filter) {
    case 'fav':     return chars.filter(c => c.favorite);
    case 'active':  return chars.filter(c => c.status === 'active' && !c.favorite);
    case 'dead':    return chars.filter(c => c.status === 'dead');
    case 'archive': return chars.filter(c => c.status === 'archive');
    case 'all':
    default:        return chars.filter(c => c.status !== 'archive');
  }
}

/** Count characters per tab. */
function tabCounts(chars) {
  return {
    all:     chars.filter(c => c.status !== 'archive').length,
    fav:     chars.filter(c => c.favorite).length,
    active:  chars.filter(c => c.status === 'active').length,
    dead:    chars.filter(c => c.status === 'dead').length,
    archive: chars.filter(c => c.status === 'archive').length,
  };
}

/** Build a character card element. */
function buildCard(char, router) {
  const isDead   = char.status === 'dead';
  const isFav    = char.favorite;
  const color    = classColor(char.class);
  const hpBadge  = isDead ? 'hp-dead' : hpClass(char.hp ?? char.maxHp, char.maxHp);
  const hpLabel  = isDead ? '✝ Пал в бою'
    : `${char.hp ?? char.maxHp} / ${char.maxHp ?? '—'} HP`;
  const lvlLabel = `Ур. ${char.level || 1}`;

  const portrait = el('div', { class: 'portrait' });
  if (char.portrait) {
    portrait.append(el('img', { class: 'portrait-img', src: char.portrait, alt: char.name, loading: 'lazy' }));
  } else {
    portrait.append(
      el('div', { class: 'portrait-fallback' },
        el('span', { class: 'portrait-fallback-text' }, initials(char.name))
      )
    );
  }
  if (isDead) {
    portrait.append(el('div', { class: 'dead-overlay' }, el('span', { class: 'dead-overlay-icon' }, '💀')));
  }
  portrait.append(el('span', { class: 'badge badge-level' }, lvlLabel));
  portrait.append(el('span', { class: `badge badge-hp ${hpBadge}` }, hpLabel));

  const favBtn = el('button', {
    class: `fav-btn${isFav ? ' is-active' : ''}`,
    'aria-label': isFav ? 'Убрать из избранных' : 'В избранные',
    onClick: async e => {
      e.stopPropagation();
      char.favorite = !char.favorite;
      favBtn.classList.toggle('is-active', char.favorite);
      favBtn.textContent = char.favorite ? '★' : '☆';
      favBtn.setAttribute('aria-label', char.favorite ? 'Убрать из избранных' : 'В избранные');
      await DB.put(char);
    },
  }, isFav ? '★' : '☆');
  portrait.append(favBtn);

  const subParts = [char.class, char.subclass].filter(Boolean);
  const card = el('div', {
    class: `char-card${isDead ? ' is-dead' : ''}`,
    style: `--card-accent: ${color}`,
    onClick: () => router.navigate(`/sheet/${char.id}`),
  },
    portrait,
    el('div', { class: 'card-info' },
      el('div', { class: 'card-name' }, char.name || 'Безымянный'),
      el('div', { class: 'card-class' },
        el('span', { class: 'card-class-name' }, subParts.join(' · ') || '—'),
      ),
      el('div', { class: 'card-race' }, char.race || ''),
      el('div', { class: 'card-background' }, char.background || ''),
    ),
    el('div', { class: 'card-actions' },
      el('button', { class: 'card-action action-open', 'data-tip': 'Открыть',
        onClick: e => { e.stopPropagation(); router.navigate(`/sheet/${char.id}`); } },
        '▶', el('span', {}, 'Открыть')
      ),
      el('button', { class: 'card-action action-pdf', 'data-tip': 'Экспорт PDF',
        onClick: async e => { e.stopPropagation(); toast('PDF-экспорт появится в Этапе 5', 'default'); } },
        '📄'
      ),
      el('button', { class: 'card-action action-json', 'data-tip': 'Экспорт JSON',
        onClick: async e => {
          e.stopPropagation();
          const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
          downloadBlob(blob, `${char.name || 'character'}.json`);
        }
      }, '{ }'),
      el('button', { class: 'card-action action-del', 'data-tip': 'Удалить',
        onClick: async e => {
          e.stopPropagation();
          const ok = await confirm(
            'Удалить персонажа?',
            `«${char.name}» будет удалён навсегда. Это действие нельзя отменить.`
          );
          if (ok) {
            await DB.delete(char.id);
            _allChars = _allChars.filter(c => c.id !== char.id);
            toast(`${char.name} удалён`, 'default');
            // Re-render grid without full page reload
            const grid = document.querySelector('.char-grid');
            if (grid) renderGrid(grid, router);
            updateCounts();
          }
        }
      }, '🗑'),
    ),
  );
  return card;
}

/** Build the "create" card. */
function buildNewCard(router) {
  return el('div', {
    class: 'new-card',
    role: 'button',
    tabindex: '0',
    onClick: () => router.navigate('/create'),
    onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') router.navigate('/create'); },
  },
    el('div', { class: 'new-card-icon' }, '＋'),
    el('div', { class: 'new-card-label' }, 'Создать персонажа'),
    el('div', { class: 'new-card-hint'  }, 'D&D 5e · SRD контент'),
  );
}

/** Build empty state. */
function buildEmpty(filter) {
  const m = EMPTY_MESSAGES[filter] || EMPTY_MESSAGES.all;
  return el('div', { class: 'empty-state' },
    el('div', { class: 'empty-state-icon'  }, m.icon),
    el('div', { class: 'empty-state-title' }, m.title),
    el('div', { class: 'empty-state-text'  }, m.text),
  );
}

/** (Re)render just the card grid. */
function renderGrid(grid, router) {
  grid.innerHTML = '';
  const visible = filterChars(_allChars, _currentFilter);
  if (visible.length === 0) {
    grid.append(buildEmpty(_currentFilter));
    if (_currentFilter === 'all' || _currentFilter === 'active') {
      grid.append(buildNewCard(router));
    }
    return;
  }
  for (const c of visible) grid.append(buildCard(c, router));
  if (_currentFilter === 'all' || _currentFilter === 'active') {
    grid.append(buildNewCard(router));
  }
}

/** Update tab counters after a mutation. */
function updateCounts() {
  const counts = tabCounts(_allChars);
  document.querySelectorAll('.tab').forEach(t => {
    const f = t.dataset.filter;
    const badge = t.querySelector('.tab-count');
    if (badge) badge.textContent = counts[f] ?? 0;
  });
  const pageBadge = document.querySelector('.page-badge');
  if (pageBadge) pageBadge.textContent = counts.all;
}

/** Main render function called by the router. */
export async function renderCharacters(container, router) {
  container.innerHTML = '';

  // Load stylesheet
  if (!document.getElementById('css-characters')) {
    const link = document.createElement('link');
    link.id   = 'css-characters';
    link.rel  = 'stylesheet';
    link.href = 'css/characters.css';
    document.head.append(link);
  }

  // Load data
  _allChars = await DB.getAll();
  const counts = tabCounts(_allChars);

  // Header actions (import/export all)
  const headerActions = document.getElementById('header-actions');
  if (headerActions) {
    headerActions.innerHTML = '';
    headerActions.append(
      el('button', { class: 'btn btn-ghost btn-sm',
        onClick: () => document.getElementById('import-file-input')?.click(),
      }, '↑ Импорт'),
      el('button', { class: 'btn btn-primary btn-sm',
        onClick: () => router.navigate('/create'),
      }, '＋ Создать'),
    );
  }

  // Build page
  const wrap = el('div', { class: 'page-wrap' });

  // Page heading
  wrap.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'page-title-group' },
        el('h1', { class: 'page-title' }, 'Персонажи'),
        el('span', { class: 'page-badge' }, String(counts.all)),
      ),
    )
  );

  // Filter tabs
  const tabsEl = el('div', { class: 'filter-tabs' });
  for (const { key, label, icon } of TABS) {
    const t = el('button', {
      class: `tab${_currentFilter === key ? ' is-active' : ''}`,
      'data-filter': key,
      onClick: () => {
        _currentFilter = key;
        document.querySelectorAll('.tab').forEach(el => el.classList.remove('is-active'));
        t.classList.add('is-active');
        renderGrid(grid, router);
      },
    },
      el('span', { class: 'tab-icon' }, icon),
      label,
      el('span', { class: 'tab-count' }, String(counts[key] ?? 0)),
    );
    tabsEl.append(t);
  }
  wrap.append(el('div', { class: 'filter-wrap' }, tabsEl));

  // Import bar
  const fileInput = el('input', {
    type: 'file', accept: '.json', id: 'import-file-input',
    onChange: async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const n = await DB.importJSON(text);
        _allChars = await DB.getAll();
        renderGrid(grid, router);
        updateCounts();
        toast(`Импортировано персонажей: ${n}`, 'success');
      } catch {
        toast('Ошибка импорта. Проверь формат файла.', 'error');
      }
    },
  });
  wrap.append(
    el('div', { class: 'import-bar',
      onClick: () => fileInput.click(),
    },
      el('span', { class: 'import-bar-icon' }, '📂'),
      el('div', { class: 'import-bar-text' },
        el('strong', {}, 'Импорт персонажа'),
        ' — перетащи JSON-файл или нажми сюда',
      ),
      fileInput,
    )
  );

  // Grid
  const grid = el('div', { class: 'char-grid' });
  renderGrid(grid, router);
  wrap.append(grid);

  container.append(wrap);
}
