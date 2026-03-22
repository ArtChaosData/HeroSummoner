/**
 * HeroSummoner — Main App Entry
 */
import { Router }           from './router.js';
import { renderCharacters } from './screens/characters.js';
import { renderCreate }     from './screens/create.js';
import { renderSheet }      from './screens/sheet.js';

const main   = document.getElementById('main');
const router = new Router();

router
  .on('/',           ()       => renderCharacters(main, router))
  .on('/create',     ()       => renderCreate(main, router))
  .on('/edit/:id',   params   => renderCreate(main, router, params))
  .on('/sheet/:id',  params   => renderSheet(main, router, params))
  .start();

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* silent */});
  });
}
