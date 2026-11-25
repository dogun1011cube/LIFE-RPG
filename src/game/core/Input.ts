/**
 * Keyboard / mouse state. Uses KeyboardEvent.code so bindings work regardless of keyboard layout or Korean IME.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private mouseReleased = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** Set when the pointer lock was lost without us asking for it (e.g. the user pressed Esc). */
  onUnexpectedUnlock: (() => void) | null = null;
  private expectUnlock = false;
  private lockFailedAt = 0;
  /** Consecutive failed pointer-lock requests (iframes, automation, some browsers). */
  lockFailures = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => {
      this.lockFailedAt = performance.now();
      this.lockFailures++;
    });
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  private isTyping(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (['Tab', 'Space', 'AltLeft', 'AltRight', 'F1', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
    this.released.add(e.code);
  };

  private onBlur = () => {
    this.down.clear();
    this.mouseDown.clear();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.mouseDown.has(e.button)) this.mousePressed.add(e.button);
    this.mouseDown.add(e.button);
    if (e.button === 1) e.preventDefault();
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseDown.delete(e.button);
    this.mouseReleased.add(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.locked) {
      // Guard against occasional huge spikes some browsers report right after locking.
      if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.lockFailures = 0;
    if (was && !this.locked) {
      this.down.clear();
      this.mouseDown.clear();
      if (!this.expectUnlock) this.onUnexpectedUnlock?.();
      this.expectUnlock = false;
    }
  };

  requestLock() {
    if (this.locked) return;
    if (performance.now() - this.lockFailedAt < 300) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function')
        p.catch(() => {
          this.lockFailedAt = performance.now();
          this.lockFailures++;
        });
    } catch {
      this.lockFailedAt = performance.now();
      this.lockFailures++;
    }
  }

  exitLock() {
    if (!this.locked) return;
    this.expectUnlock = true;
    document.exitPointerLock();
  }

  isDown(code: string) {
    return this.down.has(code);
  }
  wasPressed(code: string) {
    return this.pressed.has(code);
  }
  wasReleased(code: string) {
    return this.released.has(code);
  }
  isMouseDown(btn: number) {
    return this.mouseDown.has(btn);
  }
  wasMousePressed(btn: number) {
    return this.mousePressed.has(btn);
  }
  wasMouseReleased(btn: number) {
    return this.mouseReleased.has(btn);
  }

  /** True when pointer lock keeps failing - clicks should then act normally instead of capturing the mouse. */
  get lockUnavailable() {
    return this.lockFailures >= 2;
  }

  /** Synthetic input used by automated tests / debug tools. */
  simulateKey(code: string, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
      this.released.add(code);
    }
  }
  simulateMouse(btn: number, isDown: boolean) {
    if (isDown) {
      if (!this.mouseDown.has(btn)) this.mousePressed.add(btn);
      this.mouseDown.add(btn);
    } else {
      this.mouseDown.delete(btn);
      this.mouseReleased.add(btn);
    }
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
