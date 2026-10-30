import type { Accessor, Setter } from 'solid-js';

export interface HoverMenuProps {
  readonly onPointerEnter: (event: PointerEvent & { readonly currentTarget: HTMLElement }) => void;
  readonly onPointerLeave: (event: PointerEvent & { readonly currentTarget: HTMLElement }) => void;
  readonly onFocusIn: (event: FocusEvent & { readonly currentTarget: HTMLElement }) => void;
  readonly onFocusOut: (event: FocusEvent & { readonly currentTarget: HTMLElement }) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export interface HoverMenu {
  readonly open: Accessor<boolean>;
  readonly setOpen: Setter<boolean>;
  readonly rootProps: HoverMenuProps;
}
