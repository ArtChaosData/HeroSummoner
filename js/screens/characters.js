/**
 * HeroSummoner — Screen 1: Character List
 */
import { DB }  from '../db.js';
import { el, toast, hpClass, initials, classColor, confirm, downloadBlob } from '../utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',     label: 'Все',       icon: '📜' },
  { key: 'fav',     label: 'Избранные', icon: '⭐' },
  { key: 'active',  label: 'Активные',  icon: '⚔️' },
  { key: 'dead',    label: 'Кладбище',  icon: '💀' },
  { key: 'archive', label: 'Архив',     icon: '📦' },
];

const EDITION_OPTIONS = [
  { key: 'all',  label: 'Все',      short: 'Все' },
  { key: '2014', label: '5e · 2014', short: '5e'  },
  { key: '2024', label: '5.5 · 2024', short: '5.5' },
];

const EMPTY_MESSAGES = {
  all:     { icon: '📜', title: 'Нет персонажей',  text: 'Создай своего первого героя — нажми «Создать».' },
  fav:     { icon: '⭐', title: 'Нет избранных',   text: 'Нажми звёздочку на карточке, чтобы добавить в избранные.' },
  active:  { icon: '⚔️', title: 'Нет активных',    text: 'Здесь будут персонажи, которых ты сейчас водишь.' },
  dead:    { icon: '💀', title: 'Кладбище пусто',   text: 'Все твои герои пока живы. Удачи!' },
  archive: { icon: '📦', title: 'Архив пуст',       text: 'Сюда можно отправить персонажей на хранение.' },
};

// ─── State ────────────────────────────────────────────────────────────────────

let _currentFilter  = 'all';
let _editionFilter  = 'all';   // 'all' | '2014' | '2024'
let _allChars       = [];
let _grid           = null;    // DOM ref for in-place re-renders

// ─── Filtering ────────────────────────────────────────────────────────────────

function applyFilters(chars) {
  let result = chars;

  // Edition filter
  if (_editionFilter !== 'all') {
    result = result.filter(c => (c.edition || '2014') === _editionFilter);
  }

  // Tab filter
  switch (_currentFilter) {
    case 'fav':     return result.filter(c => c.favorite);
    case 'active':  return result.filter(c => c.status === 'active' && !c.favorite);
    case 'dead':    return result.filter(c => c.status === 'dead');
    case 'archive': return result.filter(c => c.status === 'archive');
    default:        return result.filter(c => c.status !== 'archive');
  }
}

/** Counts per tab, respecting current edition filter. */
function tabCounts(chars) {
  const base = _editionFilter === 'all'
    ? chars
    : chars.filter(c => (c.edition || '2014') === _editionFilter);
  return {
    all:     base.filter(c => c.status !== 'archive').length,
    fav:     base.filter(c => c.favorite).length,
    active:  base.filter(c => c.status === 'active').length,
    dead:    base.filter(c => c.status === 'dead').length,
    archive: base.filter(c => c.status === 'archive').length,
  };
}

/** Counts per edition (for switcher badges). */
function editionCounts(chars) {
  return {
    all:  chars.length,
    2014: chars.filter(c => (c.edition || '2014') === '2014').length,
    2024: chars.filter(c => c.edition === '2024').length,
  };
}

// ─── Card Builder ─────────────────────────────────────────────────────────────

function buildCard(char, router) {
  const isDead  = char.status === 'dead';
  const isFav   = char.favorite;
  const edition = char.edition || '2014';
  const color   = classColor(char.class);
  const hpBadge = isDead ? 'hp-dead' : hpClass(char.hp ?? char.maxHp, char.maxHp);
  const hpLabel = isDead
    ? '✝ Пал в бою'
    : `${char.hp ?? char.maxHp} / ${char.maxHp ?? '—'} HP`;

  // Portrait
  const portrait = el('div', { class: 'portrait' });
  if (char.portrait) {
    portrait.append(
      el('img', { class: 'portrait-img', src: char.portrait, alt: char.name, loading: 'lazy' })
    );
  } else {
    portrait.append(
      el('div', { class: 'portrait-fallback' },
        el('span', { class: 'portrait-fallback-text' }, initials(char.name))
      )
    );
  }
  if (isDead) {
    portrait.append(
      el('div', { class: 'dead-overlay' },
        el('span', { class: 'dead-overlay-icon' }, '💀')
      )
    );
  }
  portrait.append(el('span', { class: 'badge badge-level' }, `Ур. ${char.level || 1}`));
  portrait.append(el('span', { class: `badge badge-hp ${hpBadge}` }, hpLabel));

  // Edition badge (top-center of portrait)
  portrait.append(
    el('span', {
      class: `badge badge-edition badge-edition--${edition === '2024' ? '2024' : '2014'}`,
    }, edition === '2024' ? '5.5' : '5e')
  );

  // Favourite button
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

  // Info block
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
        onClick: e => { e.stopPropagation(); router.navigate(`/sheet/${char.id}`); },
      }, '▶', el('span', {}, 'Открыть')),
      el('button', { class: 'card-action action-pdf', 'data-tip': 'PDF',
        onClick: e => { e.stopPropagation(); toast('PDF-экспорт — Этап 5', 'default'); },
      }, '📄'),
      el('button', { class: 'card-action action-json', 'data-tip': 'JSON',
        onClick: async e => {
          e.stopPropagation();
          downloadBlob(
            new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' }),
            `${char.name || 'character'}.json`
          );
        },
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
            if (_grid) renderGrid(_grid, router);
            updateTabCounts();
            updateEditionBadges();
          }
        },
      }, '🗑'),
    ),
  );

  return card;
}

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
    el('div', { class: 'new-card-hint' }, 'D&D 5e · 2014 или 2024'),
  );
}

function buildEmpty(filter) {
  const m = EMPTY_MESSAGES[filter] || EMPTY_MESSAGES.all;
  return el('div', { class: 'empty-state' },
    el('div', { class: 'empty-state-icon'  }, m.icon),
    el('div', { class: 'empty-state-title' }, m.title),
    el('div', { class: 'empty-state-text'  }, m.text),
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function renderGrid(grid, router) {
  grid.innerHTML = '';
  const visible = applyFilters(_allChars);

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

function updateTabCounts() {
  const counts = tabCounts(_allChars);
  document.querySelectorAll('.tab[data-filter]').forEach(t => {
    const badge = t.querySelector('.tab-count');
    if (badge) badge.textContent = counts[t.dataset.filter] ?? 0;
  });
  const pageBadge = document.querySelector('.page-badge');
  if (pageBadge) pageBadge.textContent = counts.all;
}

function updateEditionBadges() {
  const counts = editionCounts(_allChars);
  document.querySelectorAll('.edition-btn[data-edition]').forEach(btn => {
    const badge = btn.querySelector('.edition-count');
    if (badge) badge.textContent = counts[btn.dataset.edition] ?? 0;
  });
}

// ─── Edition Switcher UI ──────────────────────────────────────────────────────

function buildEditionSwitcher(router) {
  const counts = editionCounts(_allChars);

  const switcher = el('div', { class: 'edition-switcher', 'aria-label': 'Фильтр по редакции' });

  for (const { key, label } of EDITION_OPTIONS) {
    const btn = el('button', {
      class: `edition-btn${_editionFilter === key ? ' is-active' : ''}`,
      'data-edition': key,
      onClick: () => {
        if (_editionFilter === key) return;
        _editionFilter = key;
        switcher.querySelectorAll('.edition-btn').forEach(b =>
          b.classList.toggle('is-active', b.dataset.edition === key)
        );
        updateTabCounts();
        if (_grid) renderGrid(_grid, router);
      },
    },
      label,
      el('span', { class: 'edition-count' }, String(counts[key] ?? 0)),
    );
    switcher.append(btn);
  }

  return switcher;
}

// ─── Main render ──────────────────────────────────────────────────────────────

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

  _allChars = await DB.getAll();
  const counts = tabCounts(_allChars);

  // Header buttons
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

  const wrap = el('div', { class: 'page-wrap' });

  // ── Page header row ──
  const editionSwitcher = buildEditionSwitcher(router);

  wrap.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'page-title-group' },
        el('h1', { class: 'page-title' }, 'Персонажи'),
        el('span', { class: 'page-badge' }, String(counts.all)),
      ),
      editionSwitcher,
    )
  );

  // ── Filter tabs ──
  const tabsEl = el('div', { class: 'filter-tabs' });
  for (const { key, label, icon } of TABS) {
    const t = el('button', {
      class: `tab${_currentFilter === key ? ' is-active' : ''}`,
      'data-filter': key,
      onClick: () => {
        _currentFilter = key;
        document.querySelectorAll('.tab[data-filter]').forEach(b =>
          b.classList.toggle('is-active', b.dataset.filter === key)
        );
        if (_grid) renderGrid(_grid, router);
      },
    },
      el('span', { class: 'tab-icon' }, icon),
      label,
      el('span', { class: 'tab-count' }, String(counts[key] ?? 0)),
    );
    tabsEl.append(t);
  }
  wrap.append(el('div', { class: 'filter-wrap' }, tabsEl));

  // ── Import bar ──
  const fileInput = el('input', {
    type: 'file', accept: '.json', id: 'import-file-input',
    onChange: async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const n = await DB.importJSON(text);
        _allChars = await DB.getAll();
        updateTabCounts();
        updateEditionBadges();
        if (_grid) renderGrid(_grid, router);
        toast(`Импортировано: ${n}`, 'success');
      } catch {
        toast('Ошибка импорта. Проверь формат файла.', 'error');
      }
    },
  });
  wrap.append(
    el('div', { class: 'import-bar', onClick: () => fileInput.click() },
      el('span', { class: 'import-bar-icon' }, '📂'),
      el('div', { class: 'import-bar-text' },
        el('strong', {}, 'Импорт персонажа'),
        ' — JSON-файл',
      ),
      fileInput,
    )
  );

  // ── Grid ──
  _grid = el('div', { class: 'char-grid' });
  renderGrid(_grid, router);
  wrap.append(_grid);

  container.append(wrap);
}
