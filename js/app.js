/**
 * HeroSummoner — Main App Entry
 */
import { Router }           from './router.js';
import { renderCharacters } from './screens/characters.js';
// import { renderCreate }     from './screens/create.js';  // WIP — отцеплен
import { renderCreateNew }  from './screens/create-new.js';
import { renderSheet }      from './screens/sheet.js';

const main   = document.getElementById('main');
const router = new Router();

router
  .on('/',           ()       => renderCharacters(main, router))
  .on('/create',              () => renderCreateNew(main, router, 'landing'))
  .on('/create/concept',      () => renderCreateNew(main, router, 'concept'))
  .on('/create/mechanics',    () => renderCreateNew(main, router, 'mechanics'))
  .on('/edit/:id',   params   => renderCreateNew(main, router, 'landing', params))
  .on('/sheet/:id',  params   => renderSheet(main, router, params))
  .start();

// Register Service Worker + update banner
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      // When a new SW finishes installing and is waiting to activate
      const onWaiting = () => showUpdateBanner(reg);

      if (reg.waiting) onWaiting();

      reg.addEventListener('updatefound', () => {
        reg.installing.addEventListener('statechange', function () {
          if (this.state === 'installed' && navigator.serviceWorker.controller) onWaiting();
        });
      });

      // After skipWaiting — reload to get new files
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    } catch { /* silent */ }
  });
}

function showUpdateBanner(reg) {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.innerHTML = '<span>Доступна новая версия</span>';
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-primary';
  btn.textContent = 'Обновить';
  btn.onclick = () => {
    if (reg.waiting) { reg.waiting.postMessage('SKIP_WAITING'); } else { location.reload(); }
    banner.remove();
  };
  banner.append(btn);
  document.body.append(banner);
}
