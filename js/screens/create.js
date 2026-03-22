/**
 * HeroSummoner — Screen 2: Create / Edit Character
 * Этап 2 — полная реализация. Пока — заглушка.
 */
import { el } from '../utils.js';

export function renderCreate(container, router, params = {}) {
  container.innerHTML = '';

  const headerActions = document.getElementById('header-actions');
  if (headerActions) headerActions.innerHTML = '';

  const isEdit = Boolean(params.id);

  container.append(
    el('div', { class: 'page-wrap' },
      el('div', { class: 'page-header' },
        el('div', { class: 'page-title-group' },
          el('h1', { class: 'page-title' }, isEdit ? 'Редактирование' : 'Новый персонаж'),
        ),
        el('button', { class: 'btn btn-ghost btn-sm',
          onClick: () => router.navigate('/'),
        }, '← Назад'),
      ),
      el('div', {
        style: 'text-align:center; padding: 100px 20px; color: var(--text-muted)',
      },
        el('div', { style: 'font-size:48px; margin-bottom:16px; opacity:.3' }, '🧙'),
        el('div', { style: 'font-family:var(--font-display); font-size:20px; color:var(--text-secondary); margin-bottom:10px' },
          'Этап 2 — в разработке'
        ),
        el('div', { style: 'font-size:13px; max-width:320px; margin:0 auto; line-height:1.6' },
          'Здесь будет полный экран создания персонажа: point-buy, классы, расы, навыки, заклинания.'
        ),
      ),
    )
  );
}
