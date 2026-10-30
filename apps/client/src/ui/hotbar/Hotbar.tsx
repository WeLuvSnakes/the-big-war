import './Hotbar.css';
import { buildingLabel } from '../text';
import { buildingGlyph } from './building-glyph';
import type { HotbarProps } from './Hotbar.types';
import { createSignal, For, Show } from 'solid-js';
import { useEvent } from '@the-big-war/frontend/ui/hooks/hooks';
import { classes } from '@the-big-war/frontend/ui/format/format';
import { gameStore, live } from '../../game/store/store.service';
import { hasUnlock } from '../../game/research/research.service';
import { FaInfoCircle } from '@the-big-war/frontend/ui/icons/icons';
import { placementError } from '../../game/building/building.service';
import type { BuildingKind } from '../../game/building/building.types';
import { BUILDING_KINDS } from '../../game/building/building.constants';
import { resolveModifier } from '@the-big-war/game-engine/modifier/modifier.service';

export type { HotbarProps };

const DRAG_THRESHOLD = 6;

export const Hotbar = (props: HotbarProps) => {
  const store = gameStore();
  const me = live(() => store.state.empires[store.state.playerEmpire]!);

  const cost = (kind: BuildingKind): number =>
    resolveModifier(store.state.config.buildings[kind].cost, me().bonuses.buildCost);

  const unlocked = (kind: BuildingKind): boolean =>
    !store.state.config.buildings[kind].requiresResearch || hasUnlock(me(), `building:${kind}`);

  const [hovered, setHovered] = createSignal<BuildingKind | null>(null);

  const placeable = () => BUILDING_KINDS.filter(unlocked);

  const isSelected = (kind: BuildingKind) => {
    const current = props.controllers.tool();
    return current.kind === 'place' && current.building === kind;
  };

  const select = (kind: BuildingKind) => {
    if (isSelected(kind)) props.controllers.cancelTool();
    else if (me().gold >= cost(kind)) props.controllers.setTool({ kind: 'place', building: kind });
  };

  const startDrag = (kind: BuildingKind, event: PointerEvent) => {
    if (event.button !== 0) return;
    const wasSelected = isSelected(kind);
    if (!wasSelected) select(kind);
    if (!isSelected(kind)) return;
    const slot = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (move: PointerEvent) => {
      if (!dragging && Math.hypot(move.clientX - startX, move.clientY - startY) > DRAG_THRESHOLD) dragging = true;
      if (!dragging) return;
      props.controllers.dragOver({ x: move.clientX, y: move.clientY });
      const hex = props.controllers.hoverHex();
      const blocked = hex !== null && placementError(store.state, store.state.playerEmpire, hex, kind) !== null;
      document.body.style.cursor = blocked ? 'not-allowed' : '';
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      if (!dragging) {
        if (wasSelected) props.controllers.cancelTool();
        return;
      }
      const target = document.elementFromPoint(up.clientX, up.clientY);
      if (target?.closest('.hud-hotbar')) return;
      props.controllers.dropAt({ x: up.clientX, y: up.clientY });
    };
    slot.releasePointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEvent(window, 'keydown', event => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const index = Number(event.key) - 1;
    const kind = placeable()[index];
    if (Number.isInteger(index) && kind) select(kind);
  });

  return (
    <div class="hud-hotbar street-tray kit-glass">
      <For each={placeable()}>
        {kind => {
          const affordable = () => me().gold >= cost(kind);
          return (
            <div
              class={classes(
                'street-action hud-hotbar-slot',
                isSelected(kind) && 'is-active',
                affordable() ? 'is-affordable' : 'is-unaffordable',
              )}
              onMouseEnter={() => setHovered(kind)}
              onMouseLeave={() => setHovered(current => (current === kind ? null : current))}
              onPointerDown={event => startDrag(kind, event)}
            >
              <Show when={hovered() === kind}>
                <div
                  class="hud-hotbar-tip"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => event.stopPropagation()}
                >
                  <span>{buildingLabel(kind)}</span>
                  <button
                    type="button"
                    class="hud-hotbar-info"
                    aria-label={`About ${buildingLabel(kind)}`}
                    onClick={() => props.onInfo(kind)}
                  >
                    <FaInfoCircle />
                  </button>
                </div>
              </Show>
              {buildingGlyph(kind)}
              <span class="hud-hotbar-cost">
                {Math.round(cost(kind))}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
};
