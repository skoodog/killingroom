// Keyboard / mouse / pointer-lock / touch input.

const CODE_ALIASES = {
  ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD',
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered, cleared each frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0, downEdge: 0, upEdge: 0 };
    this.locked = false;
    this.enabled = true;
    this.touch = { active: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0, fire: false, jump: false };
    this._binds = [];
    this._lockHandlers = new Set();
    this._install();
  }

  onLockChange(fn) { this._lockHandlers.add(fn); return () => this._lockHandlers.delete(fn); }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._binds.push(() => target.removeEventListener(type, fn, opts));
  }

  _install() {
    const c = this.canvas;

    this._on(window, 'keydown', (e) => {
      const code = CODE_ALIASES[e.code] || e.code;
      if (!this.enabled) return;
      if (KEYS_TO_EAT.has(code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(code);
      this.pressed.add(code);
    });

    this._on(window, 'keyup', (e) => {
      const code = CODE_ALIASES[e.code] || e.code;
      this.keys.delete(code);
      this.released.add(code);
    });

    this._on(window, 'blur', () => { this.keys.clear(); this.mouse.buttons = 0; });

    this._on(c, 'mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.buttons |= 1 << e.button;
      this.mouse.downEdge |= 1 << e.button;
    });

    this._on(window, 'mouseup', (e) => {
      this.mouse.buttons &= ~(1 << e.button);
      this.mouse.upEdge |= 1 << e.button;
    });

    this._on(window, 'mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      const s = this.settings ? this.settings.sensitivity : 1;
      this.mouse.dx += (e.movementX || 0) * s;
      this.mouse.dy += (e.movementY || 0) * s * (this.settings && this.settings.invertY ? -1 : 1);
    });

    this._on(window, 'wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    this._on(c, 'contextmenu', (e) => e.preventDefault());

    this._on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (!this.locked) { this.keys.clear(); this.mouse.buttons = 0; }
      for (const fn of this._lockHandlers) fn(this.locked);
    });

    this._on(document, 'pointerlockerror', () => { this.locked = false; });

    this._installTouch();
  }

  _installTouch() {
    if (typeof window === 'undefined' || !('ontouchstart' in window)) return;
    const c = this.canvas;
    let moveId = -1, lookId = -1;
    let moveOrigin = [0, 0], lookLast = [0, 0];

    const start = (e) => {
      this.touch.active = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && moveId < 0) {
          moveId = t.identifier; moveOrigin = [t.clientX, t.clientY];
        } else if (lookId < 0) {
          lookId = t.identifier; lookLast = [t.clientX, t.clientY];
        }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          const dx = t.clientX - moveOrigin[0], dy = t.clientY - moveOrigin[1];
          const r = 70;
          this.touch.moveX = Math.max(-1, Math.min(1, dx / r));
          this.touch.moveY = Math.max(-1, Math.min(1, dy / r));
        } else if (t.identifier === lookId) {
          this.mouse.dx += (t.clientX - lookLast[0]) * 1.6;
          this.mouse.dy += (t.clientY - lookLast[1]) * 1.6;
          lookLast = [t.clientX, t.clientY];
        }
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) { moveId = -1; this.touch.moveX = 0; this.touch.moveY = 0; }
        if (t.identifier === lookId) { lookId = -1; }
      }
      if (moveId < 0 && lookId < 0) this.touch.active = false;
      e.preventDefault();
    };
    this._on(c, 'touchstart', start, { passive: false });
    this._on(c, 'touchmove', move, { passive: false });
    this._on(c, 'touchend', end, { passive: false });
    this._on(c, 'touchcancel', end, { passive: false });
  }

  requestLock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => this.canvas.requestPointerLock?.());
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  up(code) { return this.released.has(code); }
  mouseDown(btn) { return (this.mouse.buttons & (1 << btn)) !== 0; }
  mouseHit(btn) { return (this.mouse.downEdge & (1 << btn)) !== 0; }

  /** Movement axes with touch fallback. x = strafe right, y = forward. */
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW')) y += 1;
    if (this.down('KeyS')) y -= 1;
    if (this.down('KeyD')) x += 1;
    if (this.down('KeyA')) x -= 1;
    if (this.touch.active) { x += this.touch.moveX; y -= this.touch.moveY; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }

  /** Consume accumulated look delta. */
  takeLook() {
    const d = [this.mouse.dx, this.mouse.dy];
    this.mouse.dx = 0; this.mouse.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.wheel = 0;
    this.mouse.downEdge = 0;
    this.mouse.upEdge = 0;
  }

  dispose() { for (const off of this._binds) off(); this._binds.length = 0; }
}

const KEYS_TO_EAT = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab', 'KeyE', 'KeyF', 'KeyR', 'KeyQ',
  'F3', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Slash',
]);
