// Input: keyboard + mouse + pointer lock, written into a plain input
// object the sim consumes each fixed step. No game logic lives here.
export function makeInput() {
  return {
    forward: false, back: false, left: false, right: false,
    sprint: false, crouch: false, jump: false,
    fire: false, reload: false, ads: false, plant: false,
    lookDX: 0, lookDY: 0,
    throwHE: false, throwSmoke: false, throwFlash: false,
    switchPrimary: false, switchSidearm: false,
    _firedOnce: false,
  };
}

export class Input {
  constructor(input, canvas, callbacks) {
    this.input = input;
    this.callbacks = callbacks; // {onLockChange, onBuyToggle, onBuyKey, onPause}
    this.locked = false;
    this.keys = new Set();
    this._onKeyDown = (e) => this.key(e, true);
    this._onKeyUp = (e) => this.key(e, false);
    this._onMouseDown = (e) => this.mouse(e, true);
    this._onMouseUp = (e) => this.mouse(e, false);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      input.lookDX += e.movementX || 0;
      input.lookDY += e.movementY || 0;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.callbacks.onLockChange) this.callbacks.onLockChange(this.locked);
    };
    this._onClick = () => {
      if (!this.locked && this.callbacks.requestLock) this.callbacks.requestLock();
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('click', this._onClick);
  }

  key(e, down) {
    const i = this.input;
    if (e.repeat) return;
    const code = e.code;
    if (down) this.keys.add(code); else this.keys.delete(code);
    switch (code) {
      case 'KeyW': case 'ArrowUp': i.forward = down; break;
      case 'KeyS': case 'ArrowDown': i.back = down; break;
      case 'KeyA': case 'ArrowLeft': i.left = down; break;
      case 'KeyD': case 'ArrowRight': i.right = down; break;
      case 'ShiftLeft': case 'ShiftRight': i.sprint = down; break;
      case 'ControlLeft': case 'KeyC': i.crouch = down; break;
      case 'Space': if (down) i.jump = true; break;
      case 'KeyR': if (down) i.reload = true; else i.reload = false; break;
      case 'KeyE': i.plant = down; break;
      case 'Digit1': if (down) i.switchPrimary = true; break;
      case 'Digit2': if (down) i.switchSidearm = true; break;
      case 'Digit4': if (down) i.throwHE = true; break;
      case 'Digit5': if (down) i.throwSmoke = true; break;
      case 'Digit6': if (down) i.throwFlash = true; break;
      case 'KeyB': if (down && this.callbacks.onBuyToggle) this.callbacks.onBuyToggle(); break;
      case 'KeyG': if (down && this.callbacks.onBuyKey) this.callbacks.onBuyKey(); break;
      default: break;
    }
    // Prevent the page from scrolling on game keys.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  }

  mouse(e, down) {
    const i = this.input;
    if (e.button === 0) i.fire = down;
    if (e.button === 2) i.ads = down;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
