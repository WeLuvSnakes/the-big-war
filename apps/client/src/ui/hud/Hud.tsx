import './Hud.css';
import { For, Show } from 'solid-js';
import type { HudProps } from './Hud.types';
import { ownerCss } from '../../render/theme';
import { OfferPrompts } from '../offer-prompts/OfferPrompts';
import type { GameSpeed } from '../../game/config/config.types';
import { gameStore, live } from '../../game/store/store.service';
import { perSecond } from '@the-big-war/frontend/ui/format/format';
import { hasUnlimitedResources } from '../../game/empire/empire.service';
import { useHoverMenu } from '@the-big-war/frontend/ui/hooks/hover-menu/HoverMenu.hook';
import { FaAtom, FaUsers, GiCoin, GiCrossedSwords } from '@the-big-war/frontend/ui/icons/icons';

const SPEEDS: readonly GameSpeed[] = [1, 2, 4];

const rateClass = (value: number): string => `hud-rate kit-num ${value <= 0 ? 'is-danger' : 'is-success'}`;

export type { HudProps };

export const Hud = (props: HudProps) => {
  const store = gameStore();
  let speedDrop: HTMLDivElement | undefined;
  const speedMenu = useHoverMenu(() => speedDrop);
  const speedOpen = speedMenu.open;

  const currentSpeed = live(() => store.state.speed);
  const me = live(() => store.state.empires[store.state.playerEmpire] ?? store.state.empires[0]!);

  const unlimited = () => hasUnlimitedResources(me());

  return (
    <header class="hud-top" aria-label="The Big War">
      <div class="street-tray kit-glass" role="group" aria-label="Resources">
        <div class="street-stat is-accent">
          <GiCoin class="hud-res-icon is-gold" />
          <span class="street-label">Gold</span>
          <Show when={!unlimited()} fallback={<strong class="hud-infinite">∞</strong>}>
            <strong>{Math.floor(me().gold)}<sup class={rateClass(me().goldBalance)}>{perSecond(me().goldBalance)}</sup></strong>
          </Show>
        </div>
        <div class="street-stat is-info">
          <FaAtom class="hud-res-icon is-science" />
          <span class="street-label">Science</span>
          <Show when={!unlimited()} fallback={<strong class="hud-infinite">∞</strong>}>
            <strong>{Math.floor(me().science)}<sup class={rateClass(me().scienceBalance)}>{perSecond(me().scienceBalance)}</sup></strong>
          </Show>
        </div>
        <div class="rail-divider" />
        <div class="street-stat">
          <FaUsers class="hud-res-icon" />
          <span class="street-label">Civilians</span>
          <strong>{Math.floor(me().civilians)}<sup class={rateClass(me().civilianBalance)}>{perSecond(me().civilianBalance)}</sup></strong>
        </div>
        <div class="street-stat">
          <GiCrossedSwords class="hud-res-icon is-troops" />
          <span class="street-label">Troops</span>
          <strong>{Math.floor(me().soldiers)}</strong>
          <span>/ {Math.floor(me().reserveCap)}<sup class={rateClass(me().troopBalance)}>{perSecond(me().troopBalance)}</sup></span>
        </div>
      </div>

      <div class="hud-side">
        <div class="street-tray kit-glass" role="group" aria-label="Game controls">
          <div class="street-stat hud-nation" title="Your nation">
            <span class="hud-card-swatch" style={{ background: ownerCss(me().colorIndex) }} />
            <span class="hud-nation-name">{me().name}</span>
          </div>
          <div class="rail-divider" />
          <div
            ref={el => (speedDrop = el)}
            class={`hud-speed-drop${speedOpen() ? ' is-open' : ''}`}
            {...speedMenu.rootProps}
          >
            <button
              type="button"
              class="street-action hud-speed-trigger"
              aria-label={store.paused() ? 'Resume' : 'Pause'}
              aria-pressed={store.paused()}
              title={store.paused() ? 'Resume' : 'Pause'}
              onClick={() => {
                store.setPaused(!store.paused());
                speedMenu.setOpen(false);
              }}
            >
              <span>{store.paused() ? '▶' : `${currentSpeed()}×`}</span>
            </button>
            <button
              type="button"
              class="street-action hud-speed-caret"
              aria-label="Change game speed"
              aria-haspopup="menu"
              aria-expanded={speedOpen()}
              title="Game speed"
              onClick={() => speedMenu.setOpen(!speedOpen())}
            >
              <span class="hud-speed-caret-icon" aria-hidden="true">▾</span>
            </button>
            <div class="hud-speed-menu kit-glass" role="menu" aria-label="Game speed">
              <For each={SPEEDS}>
                {speed => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentSpeed() === speed && !store.paused()}
                    class={`street-action hud-speed${currentSpeed() === speed && !store.paused() ? ' is-active' : ''}`}
                    aria-label={`Speed ${speed}×`}
                    onClick={event => {
                      store.setPaused(false);
                      store.setSpeed(speed);
                      speedMenu.setOpen(false);
                      event.currentTarget.blur();
                    }}
                  >
                    {speed}×
                  </button>
                )}
              </For>
              <div class="rail-divider" role="separator" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={store.paused()}
                class={`street-action hud-speed${store.paused() ? ' is-active' : ''}`}
                aria-label={store.paused() ? 'Resume' : 'Pause'}
                onClick={event => {
                  store.setPaused(!store.paused());
                  speedMenu.setOpen(false);
                  event.currentTarget.blur();
                }}
              >
                <span aria-hidden="true">{store.paused() ? '▶' : '❚❚'}</span>
              </button>
            </div>
          </div>
        </div>
        <OfferPrompts controllers={props.controllers} />
      </div>
    </header>
  );
};
