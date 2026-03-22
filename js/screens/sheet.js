/**
 * HeroSummoner — Screen 3: Character Sheet (Game Mode)
 * Этап 3 — полная реализация. Пока — заглушка.
 */
import { DB } from '../db.js';
import { el } from '../utils.js';

export async function renderSheet(container, router, { id } = {}) {
  container.innerHTML = '';

  const headerActions = document.getElementById('header-actions');
  if (headerActions) headerActions.innerHTML = '';

  const char = id ? await DB.get(id) : null;

  if (!char) {
    container.append(
      el('div', { class: 'page-wrap' },
        el('div', { style: 'text-align:center; padding:80px 20px; color:var(--text-muted)' },
          el('div', { style: 'font-size:40px; margin-bottom:12px' }, '❓'),
          el('div', { style: 'font-size:16px; color:var(--text-secondary); margin-bottom:8px' }, 'Персонаж не найден'),
          el('button', { class: 'btn btn-ghost btn-sm', onClick: () => router.navigate('/') }, '← К списку'),
        )
      )
    );
    return;
  }

  container.append(
    el('div', { class: 'page-wrap' },
      el('div', { class: 'page-header' },
        el('div', { class: 'page-title-group' },
          el('h1', { class: 'page-title' }, char.name || 'Без имени'),
          el('span', { class: 'page-badge' }, `Ур. ${char.level || 1}`),
        ),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => router.navigate('/') }, '← Назад'),
      ),
      el('div', {
        style: 'text-align:center; padding:80px 20px; color:var(--text-muted)',
      },
        el('div', { style: 'font-size:48px; margin-bottom:16px; opacity:.3' }, '⚔️'),
        el('div', { style: 'font-family:var(--font-display); font-size:20px; color:var(--text-secondary); margin-bottom:10px' },
          'Этап 3 — в разработке'
        ),
        el('div', { style: 'font-size:13px; max-width:320px; margin:0 auto; line-height:1.6' },
          'Здесь будет полный игровой лист: HP, броски, заклинания, ресурсы, инвентарь.'
        ),
      ),
    )
  );
}
