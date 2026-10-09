/**
 * HeroSummoner — Screen 1: Character List
 */
import { DB }  from '../db.js';
import { el, toast, hpClass, initials, classColor, confirm } from '../utils.js';
// 2026-09-27 (ТЗ v0.24/v0.29): экспорт PDF/JSON и импорт убраны из хаба до перепроектирования (ТЗ, раздел 6, п. 9).
import { legacyView } from '../character.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',     label: 'Все',       icon: '📜' },
  { key: 'fav',     label: 'Избранные', icon: '⭐' },
  { key: 'active',  label: 'Активные',  icon: '⚔️' },
  { key: 'dead',    label: 'Кладбище',  icon: '💀' },
  { key: 'archive', label: 'Архив',     icon: '📦' },
];

const EMPTY_MESSAGES = {
  all:     { icon: '📜', title: 'Нет персонажей',  text: 'Создайте своего первого героя — нажмите «Создать».' },
  fav:     { icon: '⭐', title: 'Нет избранных',   text: 'Нажмите звёздочку на карточке, чтобы добавить в избранные.' },
  active:  { icon: '⚔️', title: 'Нет активных',    text: 'Здесь будут персонажи, которыми вы сейчас играете.' },
  dead:    { icon: '💀', title: 'Кладбище пусто',   text: 'Все ваши герои пока живы. Удачи!' },
  archive: { icon: '📦', title: 'Архив пуст',       text: 'Сюда можно отправить персонажей на хранение.' },
};

// ─── State ────────────────────────────────────────────────────────────────────

let _currentFilter  = 'all';
let _allChars       = [];
let _grid           = null;    // DOM ref for in-place re-renders

// ─── Filtering ────────────────────────────────────────────────────────────────

function applyFilters(chars) {
  let result = chars;

  // Tab filter
  switch (_currentFilter) {
    case 'fav':     return result.filter(c => c.favorite);
    case 'active':  return result.filter(c => c.status === 'active' && !c.favorite);
    case 'dead':    return result.filter(c => c.status === 'dead');
    case 'archive': return result.filter(c => c.status === 'archive' || c.status === 'draft');
    default:        return result.filter(c => c.status !== 'archive' && c.status !== 'draft');
  }
}

/** Counts per tab. */
function tabCounts(chars) {
  return {
    all:     chars.filter(c => c.status !== 'archive' && c.status !== 'draft').length,
    fav:     chars.filter(c => c.favorite).length,
    active:  chars.filter(c => c.status === 'active').length,
    dead:    chars.filter(c => c.status === 'dead').length,
    archive: chars.filter(c => c.status === 'archive' || c.status === 'draft').length,
  };
}

// ─── Card Builder ─────────────────────────────────────────────────────────────

function buildCard(char, router) {
  const isDead  = char.status === 'dead';
  const isDraft = char.status === 'draft';
  const isFav   = char.favorite;
  const v       = legacyView(char);   // model v1 → display names, level, hp (js/character.js)
  const color   = classColor(v.class);
  const hpBadge = isDead ? 'hp-dead' : hpClass(v.hp, v.maxHp);
  const hpLabel = isDead
    ? '✝ Пал в бою'
    : `${v.hp} / ${v.maxHp ?? '—'} HP`;

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
  portrait.append(el('span', { class: 'badge badge-level' }, `Ур. ${v.level}`));
  portrait.append(el('span', { class: `badge badge-hp ${hpBadge}` }, hpLabel));

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
  const subParts = [v.class, v.subclass].filter(Boolean);

  if (isDraft) {
    portrait.append(el('span', { class: 'badge badge-draft' }, 'Черновик'));
  }
  // ТЗ v0.28 §2.1: миграция не смогла сопоставить данные — персонаж цел, но показываем ⚠️.
  const warnings = char.migrationWarnings || [];

  const card = el('div', {
    class: `char-card${isDead ? ' is-dead' : ''}${isDraft ? ' is-draft' : ''}`,
    style: `--card-accent: ${color}`,
    onClick: () => router.navigate(isDraft ? `/edit/${char.id}` : `/sheet/${char.id}`),
  },
    portrait,
    el('div', { class: 'card-info' },
      el('div', { class: 'card-name' }, char.name || 'Безымянный',
        warnings.length ? el('span', { class: 'card-warn', title: warnings.join('\n') }, ' ⚠️') : null),
      el('div', { class: 'card-class' },
        el('span', { class: 'card-class-name' }, subParts.join(' · ') || '—'),
      ),
      el('div', { class: 'card-race' }, v.race || ''),
      el('div', { class: 'card-background' }, v.background || ''),
    ),
    el('div', { class: 'card-actions' },
      el('button', { class: 'card-action action-open', 'data-tip': isDraft ? 'Редактировать' : 'Открыть',
        onClick: e => { e.stopPropagation(); router.navigate(isDraft ? `/edit/${char.id}` : `/sheet/${char.id}`); },
      }, isDraft ? '✎' : '▶', el('span', {}, isDraft ? 'Редактировать' : 'Открыть')),
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

function buildArchiveSubsection(title, chars, router, emptyText) {
  const sub = el('div', { class: 'archive-sub' },
    el('div', { class: 'archive-sub-hd' },
      el('span', { class: 'archive-sub-title' }, title),
      el('span', { class: 'archive-sub-count' }, String(chars.length)),
    ),
  );
  if (chars.length === 0) {
    sub.append(el('p', { class: 'archive-sub-empty' }, emptyText));
  } else {
    const inner = el('div', { class: 'char-grid archive-sub-grid' });
    for (const c of chars) inner.append(buildCard(c, router));
    sub.append(inner);
  }
  return sub;
}

function renderGrid(grid, router) {
  grid.innerHTML = '';
  const visible = applyFilters(_allChars);

  if (_currentFilter === 'archive') {
    const drafts   = visible.filter(c => c.status === 'draft');
    const resting  = visible.filter(c => c.status === 'archive');
    if (drafts.length === 0 && resting.length === 0) {
      grid.append(buildEmpty('archive'));
      return;
    }
    grid.append(
      buildArchiveSubsection('Черновики', drafts, router, 'Нет черновиков призыва.'),
      buildArchiveSubsection('На отдыхе', resting, router, 'Нет персонажей в архиве.'),
    );
    return;
  }

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

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderCharacters(container, router) {
  container.innerHTML = '';
  document.querySelector('.create-header-id')?.remove();
  document.querySelector('.app-header')?.classList.remove('app-header--create');

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
      el('button', { class: 'btn btn-primary btn-sm',
        onClick: () => router.navigate('/create'),
      }, '＋ Создать'),
    );
  }

  const wrap = el('div', { class: 'page-wrap' });

  // ── Page header row ──
  wrap.append(
    el('div', { class: 'page-header' },
      el('div', { class: 'page-title-group' },
        el('h1', { class: 'page-title' }, 'Персонажи'),
        el('span', { class: 'page-badge' }, String(counts.all)),
      ),
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

  // ── Grid ──
  _grid = el('div', { class: 'char-grid' });
  renderGrid(_grid, router);
  wrap.append(_grid);

  // ── Attribution button ──
  wrap.append(buildAttributionBtn());

  container.append(wrap);
}

// ─── Attribution ───────────────────────────────────────────────────────────────

function buildAttributionBtn() {
  const btn = el('button', { class: 'attr-btn', title: 'Лицензии и атрибуция' });
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" stroke-width="3"/><polyline points="12 12 12 16"/></svg>`;
  btn.addEventListener('click', () => {
    if (document.getElementById('attr-modal')) return;
    const overlay = el('div', { id: 'attr-modal', class: 'attr-overlay' });
    const modal = el('div', { class: 'attr-modal' },
      el('div', { class: 'attr-header' },
        el('span', { class: 'attr-title' }, 'Лицензии и атрибуция'),
        el('button', { class: 'attr-close', onClick: () => overlay.remove() }, '×'),
      ),
      el('div', { class: 'attr-body' },
        el('section', { class: 'attr-section' },
          el('h3', { class: 'attr-section-title' }, 'Иконки'),
          el('p', {},
            el('strong', { class: 'attr-item-name' }, 'Шляпа волшебника, Dice d20'),
            ' — ',
            el('a', { href: 'https://fontawesome.com', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'Font Awesome 5 Free'),
            ' (Solid), через ',
            el('a', { href: 'https://svgicons.com', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'svgicons.com'),
            '. Лицензия: ',
            el('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'CC BY 4.0'),
            '.',
          ),
          el('p', {},
            el('strong', { class: 'attr-item-name' }, 'Иконки оружия, типов атаки, UI'),
            ' — кастомные SVG в стиле ',
            el('a', { href: 'https://lucide.dev', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'Lucide'),
            '. Лицензия: ',
            el('a', { href: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'MIT'),
            '.',
          ),
          el('p', {},
            el('strong', { class: 'attr-item-name' }, 'Эмодзи в интерфейсе'),
            ' — Unicode Standard. Отображение зависит от платформы.',
          ),
        ),
        el('section', { class: 'attr-section' },
          el('h3', { class: 'attr-section-title' }, 'Шрифты'),
          el('p', {},
            el('strong', { class: 'attr-item-name' }, 'Philosopher'),
            ' — Jovanny Lemonad. ',
            el('a', { href: 'https://fonts.google.com/specimen/Philosopher', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'Google Fonts'),
            '. Лицензия: SIL Open Font License 1.1. Коммерческое использование разрешено.',
          ),
          el('p', {},
            el('strong', { class: 'attr-item-name' }, 'Inter'),
            ' — Rasmus Andersson. ',
            el('a', { href: 'https://fonts.google.com/specimen/Inter', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'Google Fonts'),
            '. Лицензия: SIL Open Font License 1.1. Коммерческое использование разрешено.',
          ),
        ),
        el('section', { class: 'attr-section' },
          el('h3', { class: 'attr-section-title' }, 'Контент'),
          el('p', {}, 'Dungeons & Dragons, связанные материалы, правила и механики являются интеллектуальной собственностью ',
            el('a', { href: 'https://www.wizards.com', target: '_blank', rel: 'noopener', class: 'attr-link' }, 'Wizards of the Coast LLC'),
            ', подразделения Hasbro, Inc.',
          ),
          el('p', { class: 'attr-disclaimer' },
            'Этот проект не является официальным продуктом и не связан с Wizards of the Coast.',
          ),
        ),
      ),
    );
    overlay.append(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);
  });
  return btn;
}
