import { createEffect, onCleanup } from 'solid-js';

export function useOutsidePointer(
  active: () => boolean,
  element: () => HTMLElement | undefined,
  onOutside: () => void,
): void {
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
