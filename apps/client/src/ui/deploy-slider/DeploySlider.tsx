import './DeploySlider.css';
import type { DeploySliderProps } from './DeploySlider.types';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { useOutsidePointer } from '@the-big-war/frontend/ui/hooks/hooks';
import { FaUndo, GiCrossedSwords } from '@the-big-war/frontend/ui/icons/icons';

export type { DeploySliderProps };

const PERCENTS = [25, 50, 75, 100] as const;

export const DeploySlider = (props: DeploySliderProps) => {
  const percent = () => props.controllers.troopPercent();
  const [open, setOpen] = createSignal(false);
  let drop: HTMLDivElement | undefined;

  useOutsidePointer(open, () => drop, () => setOpen(false));

  const [height, setHeight] = createSignal<number | null>(null);
  onMount(() => {
    const hotbar = document.querySelector<HTMLElement>('.hud-hotbar');
    if (!hotbar) return;
    const observer = new ResizeObserver(() => setHeight(hotbar.offsetHeight));
    observer.observe(hotbar);
    onCleanup(() => observer.disconnect());
  });

  const trayHeight = () => (height() === null ? undefined : `${height()}px`);

  return (
    <div class="deploy-slider-dock">
      <Show when={props.cameraMoved}>
        <div class="deploy-slider-reset-tray street-tray kit-glass">
          <button
            type="button"
            class="street-action is-wide deploy-slider-reset"
            title="Reset map view"
            aria-label="Reset map view"
            onClick={() => props.onReset()}
          >
            <FaUndo />
          </button>
        </div>
      </Show>
      <div class="deploy-slider street-tray kit-glass" style={{ height: trayHeight() }}>
        <div
          ref={el => (drop = el)}
          class={`hud-speed-drop deploy-slider-drop${open() ? ' is-open' : ''}`}
          onPointerEnter={event => {
            if (event.pointerType === 'mouse') setOpen(true);
          }}
          onPointerLeave={event => {
            const focused = document.activeElement;
            const keyboardFocused =
              focused instanceof HTMLElement && event.currentTarget.contains(focused) && focused.matches(':focus-visible');
            if (!keyboardFocused) setOpen(false);
          }}
          onFocusIn={event => {
            if ((event.target as HTMLElement).matches(':focus-visible')) setOpen(true);
          }}
          onFocusOut={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <button
            type="button"
            class="street-action deploy-slider-trigger"
            aria-label="Change troop deployment"
            title="Troop deployment"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-live="polite"
            onClick={() => setOpen(!open())}
          >
            <GiCrossedSwords />
            <span class="deploy-slider-value">{percent()}%</span>
          </button>
          <div class="hud-speed-menu kit-glass" role="menu" aria-label="Troop deployment">
            <For each={PERCENTS}>
              {value => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={percent() === value}
                  class={`street-action hud-speed${percent() === value ? ' is-active' : ''}`}
                  onClick={event => {
                    props.controllers.setTroopPercent(value);
                    setOpen(false);
                    event.currentTarget.blur();
                  }}
                >
                  {value}%
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
