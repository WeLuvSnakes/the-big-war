import { createSignal } from 'solid-js';
import type { HoverMenu, HoverMenuProps } from './HoverMenu.types';
import { useOutsidePointer } from '../outside-pointer/OutsidePointer.hook';

export type * from './HoverMenu.types';

export function canHover(): boolean {
  return globalThis.matchMedia?.('(hover: hover)').matches ?? false;
}

export function useHoverMenu(element: () => HTMLElement | undefined): HoverMenu {
  const [open, setOpen] = createSignal(false);

  useOutsidePointer(open, element, () => setOpen(false));

  const rootProps: HoverMenuProps = {
    onPointerEnter: event => {
      if (event.pointerType === 'mouse') setOpen(true);
    },
    onPointerLeave: event => {
      const focused = document.activeElement;
      const keyboardFocused =
        focused instanceof HTMLElement && event.currentTarget.contains(focused) && focused.matches(':focus-visible');
      if (!keyboardFocused) setOpen(false);
    },
    onFocusIn: event => {
      if ((event.target as HTMLElement).matches(':focus-visible')) setOpen(true);
    },
    onFocusOut: event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    },
    onKeyDown: event => {
      if (event.key === 'Escape') setOpen(false);
    },
  };

  return { open, setOpen, rootProps };
}
