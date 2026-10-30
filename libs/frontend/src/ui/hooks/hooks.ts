import { createEffect, onCleanup, onMount } from 'solid-js';

export function useEvent<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  listener: (event: WindowEventMap[K]) => void,
): void {
  onMount(() => {
    target.addEventListener(type, listener);
    onCleanup(() => target.removeEventListener(type, listener));
  });
}

export function useOutsidePointer(active: () => boolean, element: () => HTMLElement | undefined, onOutside: () => void): void {
  createEffect(() => {
    if (!active()) return;
    const handle = (event: PointerEvent) => {
      const el = element();
      if (el && !el.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('pointerdown', handle);
    onCleanup(() => document.removeEventListener('pointerdown', handle));
  });
}
