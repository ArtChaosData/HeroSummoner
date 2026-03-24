/**
 * HeroSummoner — Shared Utilities
 */

/** Create a DOM element with attributes and children. */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class')        e.className = v;
    else if (k === 'html')    e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    e.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return e;
}

export const qs  = (sel, ctx = document) => ctx.querySelector(sel);
export const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Show a quick toast notification. */
let _toastContainer = null;
export function toast(message, type = 'default', durationMs = 3000) {
  if (!_toastContainer) {
    _toastContainer = el('div', { id: 'toast-container' });
    document.body.append(_toastContainer);
  }
  const t = el('div', { class: `toast toast-${type}` }, message);
  _toastContainer.prepend(t);
  setTimeout(() => t.remove(), durationMs);
}

/** Derive HP badge class from current/max hp. */
export function hpClass(current, max) {
  if (!max || max <= 0) return 'hp-full';
  const pct = current / max;
  if (pct >= 0.75) return 'hp-full';
  if (pct >= 0.25) return 'hp-mid';
  return 'hp-low';
}

/** Get character initials for fallback portrait. */
export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

/** Map class name → CSS accent var */
const CLASS_COLOR_MAP = {
  'Варвар':    'var(--c-barbarian)',
  'Бард':      'var(--c-bard)',
  'Жрец':      'var(--c-cleric)',
  'Друид':     'var(--c-druid)',
  'Воин':      'var(--c-fighter)',
  'Монах':     'var(--c-monk)',
  'Паладин':   'var(--c-paladin)',
  'Следопыт':  'var(--c-ranger)',
  'Плут':      'var(--c-rogue)',
  'Чародей':   'var(--c-sorcerer)',
  'Колдун':    'var(--c-warlock)',
  'Волшебник': 'var(--c-wizard)',
  'Изобретатель':  'var(--c-artificer)',
};
export function classColor(className) {
  return CLASS_COLOR_MAP[className] || 'var(--accent)';
}

/** Slugify class name for CSS class attribute. */
export function classSlug(className = '') {
  return className.toLowerCase().replace(/\s+/g, '-');
}

/** Download a Blob as a file. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Confirm dialog (promise-based). */
export function confirm(title, body) {
  return new Promise(resolve => {
    const backdrop = el('div', { class: 'modal-backdrop' },
      el('div', { class: 'modal' },
        el('div', { class: 'modal-title' }, title),
        el('div', { class: 'modal-body'  }, body),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn btn-ghost', onClick: () => { backdrop.remove(); resolve(false); } }, 'Отмена'),
          el('button', { class: 'btn btn-danger', onClick: () => { backdrop.remove(); resolve(true);  } }, 'Удалить'),
        )
      )
    );
    document.body.append(backdrop);
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) { backdrop.remove(); resolve(false); }
    });
  });
}
