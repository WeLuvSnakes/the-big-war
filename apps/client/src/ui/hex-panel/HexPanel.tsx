import './HexPanel.css';
import { createSignal, Show } from 'solid-js';
import { ownerCss } from '../../render/theme';
import { buildingLabel, terrainLabel } from '../text';
import type { HexPanelProps } from './HexPanel.types';
import { Bar } from '@the-big-war/frontend/ui/bar/Bar';
import { populationOf } from '../../game/unit/unit.service';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import { gameStore, live } from '../../game/store/store.service';
import { hasUnlock } from '../../game/research/research.service';
import { trenchOccupants } from '../../game/trench/trench.service';
import { buildingState, ownNeighbourCount } from './HexPanel.utility';
import { boatsFrom, portBoatLimit } from '../../game/ship/ship.service';
import { gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { portUpgradeCost, upgradeError } from '../../game/building/building.service';

export type { HexPanelProps };

export const HexPanel = (props: HexPanelProps) => {
  const store = gameStore();
  const [confirmDemolish, setConfirmDemolish] = createSignal(false);

  const hex = () => props.controllers.selectedHex();
  const cell = live(() => {
    const selected = hex();
    return selected ? (gridAt(store.state.grid, selected) ?? null) : null;
  });
  const player = () => store.state.playerEmpire;
  const isOwn = () => cell()?.owner === player();
  const isForeign = () => {
    const current = cell();
    return !!current && current.owner !== player() && current.owner >= 0;
  };
  const owner = () => {
    const current = cell();
    return current && current.owner >= 0 ? store.state.empires[current.owner] : null;
  };

  const building = () => cell()?.building ?? null;
  const canFire = () => {
    const current = building();
    return !!current && current.kind === 'cannon' && isOwn() && current.cooldown <= 0;
  };

  const liveBuilding = live(() => building());
  const upgradeBlocker = live(() => {
    const selected = hex();
    return selected ? upgradeError(store.state, player(), selected) : null;
  });
  const upgrade = () => {
    const selected = hex();
    if (!selected) return;
    props.controllers.run({ type: 'UpgradeBuilding', empire: player(), hex: selected });
  };

  const ownPort = live(() => {
    const current = building();
    return current?.kind === 'port' && isOwn() && current.buildRemaining <= 0 ? current : null;
  });
  const buildShip = () => {
    const selected = hex();
    if (!selected) return;
    props.controllers.run({ type: 'BuildShip', empire: player(), hex: selected });
  };

  const demolish = () => {
    const selected = hex();
    if (!selected) return;
    props.controllers.run({ type: 'DemolishBuilding', empire: player(), hex: selected });
    setConfirmDemolish(false);
  };

  const startFire = () => {
    const selected = hex();
    if (!selected) return;
    props.controllers.setTool({ kind: 'cannon', from: selected });
    props.onClose();
  };

  const trench = () => {
    const current = building();
    return current && current.kind === 'trench' && isOwn() && current.buildRemaining <= 0 ? current : null;
  };
  const stationed = live(() => {
    const current = cell();
    return current && trench() ? trenchOccupants(store.state, current).length : 0;
  });
  const foreignArmy = live(() => {
    const current = cell();
    return current && current.owner >= 0 ? populationOf(store.state, current.owner) : 0;
  });

  const ownNeighbours = () => {
    const selected = hex();
    return selected ? ownNeighbourCount(store.state, selected, player()) : 0;
  };

  return (
    <Panel
      title={hex() ? `${hex()!.q}, ${hex()!.r}` : 'Territory'}
      kind={cell() ? terrainLabel(cell()!.terrain) : undefined}
      onClose={props.onClose}
    >
      <Show when={cell()} fallback={<div class="kit-empty">Nothing here</div>}>
        {current => (
          <>
            <div class="kit-row">
              <span
                class="hud-card-swatch"
                style={{
                  background:
                    current().owner >= 0 ? ownerCss(current().owner) : 'var(--street-border-hover)',
                }}
              />
              <span class="hud-card-sub">
                {current().owner >= 0 ? (owner()?.name ?? '') : 'Unclaimed'}
                {isOwn() ? ' · You' : ''}
              </span>
            </div>

            <Show when={building()}>
              {entry => (
                <div class="kit-col">
                  <div class="kit-row">
                    <strong class="hud-card-name">{buildingLabel(entry().kind)}</strong>
                    <span class="street-drawer-panel-kind">{buildingState(liveBuilding() ?? entry())}</span>
                  </div>
                  <Show when={isOwn()}>
                    <div class="kit-row">
                      <Show when={canFire()}>
                        <button
                          type="button"
                          class="kit-button is-danger"
                          style={{
                            padding: '6px 16px',
                            display: 'inline-flex',
                            'align-items': 'center',
                            gap: '8px',
                            'font-weight': '700',
                          }}
                          onClick={startFire}
                        >
                          Fire Cannon  ·  {store.state.config.cannon.cost} Gold
                        </button>
                      </Show>
                    </div>
                    <Show when={ownPort()}>
                      {port => (
                        <div class="kit-col">
                          <span class="kit-note kit-num">
                            Boats at sea {boatsFrom(store.state, port().id)} / {portBoatLimit(store.state, port())}
                          </span>
                          <button type="button" class="kit-button" disabled={upgradeBlocker() !== null} onClick={upgrade}>
                            Upgrade port · {portUpgradeCost(store.state, port())} Gold
                          </button>
                          <Show when={hasUnlock(store.state.empires[player()]!, 'ship:battleship')}>
                            <button type="button" class="kit-button" disabled={port().shipBuild > 0} onClick={buildShip}>
                              {port().shipBuild > 0
                                ? `Building ship ${Math.ceil(port().shipBuild)}s`
                                : `Build battleship · ${store.state.config.ship.battleshipCost} Gold`}
                            </button>
                          </Show>
                        </div>
                      )}
                    </Show>
                    <Show
                      when={confirmDemolish()}
                      fallback={
                        <button type="button" class="kit-button is-danger" onClick={() => setConfirmDemolish(true)}>
                          Demolish
                        </button>
                      }
                    >
                      <div class="kit-col">
                        <span class="kit-note">Stays active 10s, then disappears. No refund.</span>
                        <div class="kit-row">
                          <button type="button" class="kit-button is-danger" onClick={demolish}>
                            Confirm demolish
                          </button>
                          <button type="button" class="kit-button is-ghost" onClick={() => setConfirmDemolish(false)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Show>
                  </Show>
                </div>
              )}
            </Show>

            <Show when={trench()}>
              <div class="kit-col">
                <span class="street-label">Trench</span>
                <Bar
                  label="Stationed"
                  ratio={stationed() / Math.max(1, store.state.config.trench.capacity)}
                  value={`${stationed()} / ${store.state.config.trench.capacity}`}
                  variant="accent"
                />
                <span class="kit-note">Select infantry, then click this trench to station them inside.</span>
              </div>
            </Show>

            <Show when={isForeign()}>
              <div class="kit-col">
                <span class="kit-note kit-num">Army size {foreignArmy()}</span>
              </div>
            </Show>

            <Show when={isOwn()}>
              <span class="kit-note">
                Pick a building, then click one of your hexes. Buildings need an empty hex around them. · {ownNeighbours()}/6
              </span>
            </Show>

          </>
        )}
      </Show>
    </Panel>
  );
};
