import './UnitMenu.css';
import { formationLabel } from '../text';
import { createSignal, For, Show } from 'solid-js';
import type { UnitMenuProps } from './UnitMenu.types';
import { FORMATIONS } from '../../game/unit/unit.constants';
import { useOutsidePointer } from '@the-big-war/frontend/ui/hooks/outside-pointer/OutsidePointer.hook';

export type { UnitMenuProps };

const MENU_WIDTH = 180;
const MENU_HEIGHT = 170;
const SUBMENU_WIDTH = 150;

export const UnitMenu = (props: UnitMenuProps) => {
  let root: HTMLDivElement | undefined;
  const [formationsOpen, setFormationsOpen] = createSignal(false);
  const units = () => props.controllers.units;
  const menu = () => units().menu();
  useOutsidePointer(
    () => menu() !== null,
    () => root,
    () => units().closeMenu(),
  );
  const left = () => Math.min(menu()?.at.x ?? 0, window.innerWidth - MENU_WIDTH - 8);
  const top = () => Math.min(menu()?.at.y ?? 0, window.innerHeight - MENU_HEIGHT - 60);
  const flip = () => left() + MENU_WIDTH + SUBMENU_WIDTH > window.innerWidth;

  return (
    <Show when={menu()}>
      {current => (
        <div
          ref={el => (root = el)}
          class={`unit-menu${flip() ? ' is-flipped' : ''}`}
          style={{ left: `${left()}px`, top: `${top()}px` }}
          onContextMenu={event => event.preventDefault()}
        >
          <div class="unit-menu-head">{current().count} selected</div>
          <button type="button" onClick={() => units().attack()}>
            {current().foe === null ? 'Attack' : 'Attack this unit'}
          </button>
          <button type="button" onClick={() => units().guard()}>
            Guard here
          </button>
          <button type="button" onClick={() => units().hold()}>
            Hold position
          </button>
          <div
            class={`unit-menu-sub${formationsOpen() ? ' is-open' : ''}`}
            onPointerEnter={() => setFormationsOpen(true)}
            onPointerLeave={() => setFormationsOpen(false)}
          >
            <button type="button" onClick={() => setFormationsOpen(open => !open)}>
              Formation <small>▸</small>
            </button>
            <div class="unit-menu-list">
              <For each={FORMATIONS}>
                {formation => (
                  <button type="button" onClick={() => units().arrange(formation)}>
                    {current().formation === formation ? '✓ ' : ''}
                    {formationLabel(formation)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
