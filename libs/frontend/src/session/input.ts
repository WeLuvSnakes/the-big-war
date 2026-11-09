

import type { InputHost, PointerState } from './input.types';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export type * from './input.types';

export const DRAG_THRESHOLD = 6;

export const HELD_LONG_MS = 420;

const WHEEL_STEP = 1.0015;

const PINCH_STEP = 0.006;

export function attachInput(host: InputHost): () => void {
  const pointers = new Map<number, PointerState>();
  let pinchSpan = 0;

  const localPoint = (event: PointerEvent): Pixel => {
    const rect = host.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const clearTimer = (state: PointerState) => {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) {
      event.preventDefault();
      return;
    }
    if (event.button === 2) event.preventDefault();
    const at = localPoint(event);
    const state: PointerState = {
      id: event.pointerId,
      startX: at.x,
      startY: at.y,
      lastX: at.x,
      lastY: at.y,
      dragging: false,
      timer: null,
      consumed: false,
      button: event.button,
      box: event.button === 0 && event.pointerType === 'mouse',
      shift: event.shiftKey,
    };
    pointers.set(event.pointerId, state);
    host.element.setPointerCapture?.(event.pointerId);

    if (pointers.size === 2) {
      
      const [a, b] = [...pointers.values()];
      if (a && b) {
        pinchSpan = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
        for (const pointer of pointers.values()) {
          clearTimer(pointer);
          pointer.dragging = true;
        }
      }
      return;
    }

    if (event.pointerType === 'mouse') return;

    state.timer = setTimeout(() => {
      state.timer = null;
      if (!state.dragging) {
        state.consumed = true;
        host.onIntent({ kind: 'longPress', at: { x: state.startX, y: state.startY } });
      }
    }, HELD_LONG_MS);
  };

  const onPointerMove = (event: PointerEvent) => {
    const at = localPoint(event);
    const state = pointers.get(event.pointerId);

    if (pointers.size >= 2) {
      const ids = [...pointers.keys()];
      const first = pointers.get(ids[0]!);
      const second = pointers.get(ids[1]!);
      if (first && second) {
        
        if (state) {
          state.lastX = at.x;
          state.lastY = at.y;
          state.dragging = true;
        }
        const span = Math.hypot(first.lastX - second.lastX, first.lastY - second.lastY);
        if (pinchSpan > 0 && span > 0) {
          host.onIntent({
            kind: 'zoom',
            factor: 1 + (span - pinchSpan) * PINCH_STEP,
            anchor: { x: (first.lastX + second.lastX) / 2, y: (first.lastY + second.lastY) / 2 },
          });
        }
        pinchSpan = span;
      }
      return;
    }

    if (!state) {
      host.onIntent({ kind: 'hover', at });
      return;
    }

    if (state.box && !state.dragging && (event.buttons & 3) === 3) state.box = false;
    const dx = at.x - state.lastX;
    const dy = at.y - state.lastY;
    const travelled = Math.hypot(at.x - state.startX, at.y - state.startY);
    state.lastX = at.x;
    state.lastY = at.y;

    if (!state.dragging && travelled > DRAG_THRESHOLD) {
      state.dragging = true;
      clearTimer(state);
      if (state.box) host.onIntent({ kind: 'boxStart', at: { x: state.startX, y: state.startY } });
      else host.element.classList.add('is-dragging');
    }
    if (!state.dragging) return;
    if (state.box) host.onIntent({ kind: 'boxMove', at });
    else host.onIntent({ kind: 'pan', dx, dy });
  };

  const finish = (event: PointerEvent, cancelled: boolean) => {
    const state = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    host.element.releasePointerCapture?.(event.pointerId);
    if (!state) return;

    clearTimer(state);
    if (pointers.size < 2) pinchSpan = 0;

    if (cancelled) return;
    if (state.consumed) return;

    if (state.dragging && state.box) {
      host.onIntent({ kind: 'boxEnd', at: localPoint(event), shift: state.shift || event.shiftKey });
      return;
    }

    if (state.dragging) {
      if (pointers.size === 0) {
        host.element.classList.remove('is-dragging');
        host.onIntent({ kind: 'panEnd' });
      }
      return;
    }

    const at = localPoint(event);
    if (Math.hypot(at.x - state.startX, at.y - state.startY) > DRAG_THRESHOLD) return;
    if (state.button === 2) host.onIntent({ kind: 'context', at });
    else host.onIntent({ kind: 'tap', at, shift: state.shift || event.shiftKey });
  };

  const onPointerUp = (event: PointerEvent) => finish(event, false);
  const onPointerCancel = (event: PointerEvent) => finish(event, true);
  const onPointerLeave = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) host.onIntent({ kind: 'leave' });
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = host.element.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const step = event.ctrlKey ? -event.deltaY * 4 : -event.deltaY * (event.deltaMode === 0 ? 1 : 33);
    host.onIntent({ kind: 'zoom', factor: Math.pow(WHEEL_STEP, step), anchor });
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
    host.onIntent({ kind: 'key', key: event.key, shift: event.shiftKey });
  };
  const onKeyUp = (event: KeyboardEvent) => host.onIntent({ kind: 'keyUp', key: event.key });
  const onBlur = () => host.onIntent({ kind: 'blur' });

  host.element.addEventListener('pointerdown', onPointerDown);
  host.element.addEventListener('pointermove', onPointerMove);
  host.element.addEventListener('pointerup', onPointerUp);
  host.element.addEventListener('pointercancel', onPointerCancel);
  host.element.addEventListener('pointerleave', onPointerLeave);
  host.element.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    for (const state of pointers.values()) clearTimer(state);
    pointers.clear();
    host.element.removeEventListener('pointerdown', onPointerDown);
    host.element.removeEventListener('pointermove', onPointerMove);
    host.element.removeEventListener('pointerup', onPointerUp);
    host.element.removeEventListener('pointercancel', onPointerCancel);
    host.element.removeEventListener('pointerleave', onPointerLeave);
    host.element.removeEventListener('wheel', onWheel);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
