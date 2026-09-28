/**
 * HeroSummoner — Service Worker
 * Strategy: cache-first for assets, always update in background.
 */
const CACHE = 'herosummoner-v66';
// 2026-09-27 (ТЗ v0.29): js/pdf.js и js/data/background_descriptions.js (читает только pdf.js) убраны из
// precache — экспорт PDF снят с хаба до перепроектирования; файлы остаются в репозитории.

// NOTE (2026-09-08 review): this list had drifted from the actual import graph — it precached
// the retired create.js/create.css screen (never imported by app.js, see docs/reviews/
// 2026-09-08_backend-frontend-review.md) while missing the *active* create-new.js/create-new.css
// and the data files it actually reads. Rebuilt from js/app.js's real import graph below.
// js/data/class_features.js, class_feature_descriptions.js and subclass_features.js are
// intentionally NOT precached yet — nothing imports them (see docs/FIX_PLAN.md, P0) — add them
// back here once a screen actually wires them in, otherwise this ships dead weight offline.
// 2026-09-12: added js/data/background_descriptions.js — it WAS already imported (by js/pdf.js),
// just missing from this list; a prior pass mistakenly assumed it was unused (see
// docs/reviews/2026-09-12_backgrounds-naming-review.md) and briefly stubbed it out, which broke
// the background-feature line in PDF exports offline and online. Root cause of the "unused" miss:
// grepped only create-new.js/sheet.js/app.js/router.js/db.js, never pdf.js.
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/base.css',
  './css/characters.css',
  './css/create-new.css',
  './css/sheet.css',
  './js/app.js',
  './js/router.js',
  './js/db.js',
  './js/utils.js',
  './js/screens/characters.js',
  './js/screens/create-new.js',
  './js/screens/sheet.js',
  './js/data/equipment.js',
  './js/data/spells.js',
  './js/data/race_descriptions.js',
  './js/data/class_descriptions.js',
  // 2026-09-27 (ТЗ v0.25, шаг Класс): экран класса теперь импортирует эти файлы
  './js/data/class_features.js',
  './js/data/subclass_descriptions.js',
  './js/data/sources.js',
  './js/data/class_lvl1.js',
  './js/data/class_lvl1_subclasses.js',
  // 2026-09-27 (ТЗ v0.26): панель «Правило»; rules_subprev.js грузится лениво, но офлайн тоже нужен
  './js/data/rules_text.js',
  './js/data/rules_subprev.js',
  // 2026-09-27 (ТЗ v0.27): таблица «Развитие по уровням»; rules_levels.js грузится лениво
  './js/data/class_progression.js',
  './js/data/rules_levels.js',
  // 2026-09-27 (ТЗ v0.28, Э1): модель персонажа v1 + черты PHB с dnd.su. warlock_invocations.js,
  // metamagic.js, class_starting_equipment.js пока никто не импортирует — не кэшируем (см. NOTE выше).
  './js/character.js',
  './js/spell-groups.js',
  './js/data/feats.js',
  // 2026-09-28 (ТЗ 4.4.7 v0.32, Э3): снаряжение — логика, общий вид и стартовое снаряжение классов
  './js/equipment.js',
  './js/equipment-view.js',
  './js/pools.js',
  './js/data/background_features.js',
  './js/data/race_traits.js',
  './js/data/class_starting_equipment.js',
  './assets/icon_4.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting(); // Take over immediately
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Don't intercept external requests (Google Fonts, etc.)
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
