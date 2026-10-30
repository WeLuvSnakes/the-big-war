import './DeploySlider.css';
import type { DeploySliderProps } from './DeploySlider.types';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { FaUndo, GiCrossedSwords } from '@the-big-war/frontend/ui/icons/icons';
import { useHoverMenu } from '@the-big-war/frontend/ui/hooks/hover-menu/HoverMenu.hook';

export type { DeploySliderProps };

const PERCENTS = [25, 50, 75, 100] as const;

export const DeploySlider = (props: DeploySliderProps) => {
  const percent = () => props.controllers.troopPercent();
  let drop: HTMLDivElement | undefined;
  const menu = useHoverMenu(() => drop);
  const open = menu.open;

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
          {...menu.rootProps}
        >
          <button
            type="button"
            class="street-action deploy-slider-trigger"
            aria-label="Change troop deployment"
            title="Troop deployment"
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-live="polite"
            onClick={() => menu.setOpen(!open())}
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
                    menu.setOpen(false);
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
