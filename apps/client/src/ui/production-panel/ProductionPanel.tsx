import './ProductionPanel.css';
import { For, Show } from 'solid-js';
import { buildingLabel } from '../text';
import type { UnitKind } from '../../game/unit/unit.types';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import { gameStore, live } from '../../game/store/store.service';
import type { ProductionPanelProps } from './ProductionPanel.types';
import { UNIT_KINDS, UNIT_STATS } from '../../game/unit/unit.constants';
import { populationCap, populationOf } from '../../game/unit/unit.service';
import { gridAt, gridIndex } from '@the-big-war/game-engine/world-tile/world-tile.service';

export type { ProductionPanelProps };

export const ProductionPanel = (props: ProductionPanelProps) => {
  const store = gameStore();
  const player = () => store.state.playerEmpire;
  const hex = () => props.controllers.selectedHex();
  const building = live(() => {
    const selected = hex();
    return selected ? (gridAt(store.state.grid, selected)?.building ?? null) : null;
  });
  const kinds = () => {
    const current = building();
    return current ? UNIT_KINDS.filter(kind => UNIT_STATS[kind].producer === current.kind) : [];
  };
  const line = live(() => {
    const selected = hex();
    const current = building();
    if (!selected || !current) return null;
    const at = gridIndex(store.state.grid, selected.q, selected.r);
    return store.state.production.find(item => item.at === at && item.building === current.id) ?? null;
  });
  const gold = live(() => store.state.empires[player()]?.gold ?? 0);
  const population = live(() => `${populationOf(store.state, player())} / ${populationCap(store.state, player())}`);
  const progress = () => {
    const current = line();
    const kind = current?.queue[0];
    return current && kind ? Math.min(1, current.progress / UNIT_STATS[kind].trainSeconds) : 0;
  };
  const train = (kind: UnitKind) => {
    const selected = hex();
    if (selected) props.controllers.run({ type: 'TrainUnit', empire: player(), hex: selected, kind });
  };
  const cancel = () => {
    const selected = hex();
    if (selected) props.controllers.run({ type: 'CancelUnit', empire: player(), hex: selected });
  };

  return (
    <Panel title={building() ? buildingLabel(building()!.kind) : 'Production'} kind={`Units ${population()}`} onClose={props.onClose}>
      <Show when={building()?.buildRemaining === 0} fallback={<div class="kit-empty">Still under construction</div>}>
        <div class="production-grid">
          <For each={kinds()}>
            {kind => (
              <button
                type="button"
                class="production-option"
                title={UNIT_STATS[kind].description}
                disabled={gold() < UNIT_STATS[kind].gold}
                onClick={() => train(kind)}
              >
                <strong>{UNIT_STATS[kind].name}</strong>
                <span class="kit-num">
                  {UNIT_STATS[kind].gold}g · {UNIT_STATS[kind].trainSeconds}s · {UNIT_STATS[kind].population} pop
                </span>
                <span class="production-stats kit-num">
                  HP {UNIT_STATS[kind].hp} · Armour {Math.round(UNIT_STATS[kind].armor * 100)}% · Range {UNIT_STATS[kind].weapon.range}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="production-queue">
          <Show when={(line()?.queue.length ?? 0) > 0} fallback={<span class="kit-note">Nothing in training</span>}>
            <div class="kit-row">
              <span class="kit-note">Training {UNIT_STATS[line()!.queue[0]!].name}</span>
              <div class="production-bar">
                <div class="production-bar-fill" style={{ width: `${Math.round(progress() * 100)}%` }} />
              </div>
            </div>
            <div class="kit-row">
              <For each={line()!.queue}>{kind => <span class="production-chip">{UNIT_STATS[kind].name}</span>}</For>
              <button type="button" class="kit-button is-ghost" onClick={cancel}>
                Cancel last
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </Panel>
  );
};
