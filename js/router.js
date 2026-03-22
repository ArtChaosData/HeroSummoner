/**
 * HeroSummoner — Hash Router
 * Routes: #/  #/create  #/edit/:id  #/sheet/:id  #/settings
 */
export class Router {
  constructor() {
    this._routes = [];
    this._beforeEach = null;
    window.addEventListener('hashchange', () => this._resolve());
  }

  /** Register a route handler. Pattern supports :param placeholders. */
  on(pattern, handler) {
    const rx = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'
    );
    this._routes.push({ rx, handler });
    return this;
  }

  /** Called before every navigation. Return false to cancel. */
  beforeEach(fn) { this._beforeEach = fn; return this; }

  start() { this._resolve(); }

  navigate(path) { location.hash = '#' + path; }

  _resolve() {
    const hash = location.hash.slice(1) || '/';
    if (this._beforeEach && this._beforeEach(hash) === false) return;

    for (const { rx, handler } of this._routes) {
      const m = hash.match(rx);
      if (m) {
        handler(m.groups || {});
        return;
      }
    }
    // No match → go home
    this.navigate('/');
  }
}
