import './HexPanel.css';
import { createSignal, Show } from 'solid-js';
import { ownerCss } from '../../render/theme';
import { buildingLabel, terrainLabel } from '../text';
import type { HexPanelProps } from './HexPanel.types';
import { Bar } from '@the-big-war/frontend/ui/bar/Bar';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import { gameStore, live } from '../../game/store/store.service';
import { hasUnlock } from '../../game/research/research.service';
import { boatsFrom, portBoatLimit } from '../../game/ship/ship.service';
import { RESEARCH_BY_ID } from '../../game/research/research.constants';
import { distance, gridAt } from '@the-big-war/game-engine/world-tile/world-tile.service';
import { barracksTier, nextBarracksTier, portUpgradeCost, upgradeError } from '../../game/building/building.service';
import {
  attackFrom as findAttackFrom,
  buildingState,
  machineGunStatus as machineGunState,
  ownNeighbourCount,
  romanLevel,
  trenchTargets as countTrenchTargets,
} from './HexPanel.utility';

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

  const attackFrom = () => {
    const selected = hex();
    return selected ? findAttackFrom(store.state, selected, player()) : null;
  };

  const building = () => cell()?.building ?? null;
  const canFire = () => {
    const current = building();
    return !!current && current.kind === 'cannon' && isOwn() && current.cooldown <= 0;
  };

  const liveBuilding = live(() => building());
  const currentTier = () => {
    const current = liveBuilding();
    return current?.kind === 'barracks' ? barracksTier(store.state, current) : null;
  };
  const nextTier = live(() => {
    const current = building();
    return current && isOwn() && current.buildRemaining <= 0 ? nextBarracksTier(store.state, current) : null;
  });
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
  const machineGunStatus = () => {
    const current = cell();
    return current ? machineGunState(current) : 'None';
  };
  const trenchTargets = () => {
    const selected = hex();
    return selected ? countTrenchTargets(store.state, selected, player()) : 0;
  };
  const orderTrench = (type: 'ManTrench' | 'LeaveTrench', percent: number) => {
    const selected = hex();
    if (!selected) return;
    props.controllers.run({ type, empire: player(), hex: selected, percent });
  };
  const startTrenchAttack = () => {
    const selected = hex();
    if (!selected) return;
    props.controllers.setTool({ kind: 'trench-attack', from: selected });
    props.onClose();
  };

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
                    <span class="street-drawer-panel-kind">{buildingState(store.state, liveBuilding() ?? entry())}</span>
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
                    <Show when={currentTier()}>
                      {tier => (
                        <span class="kit-note kit-num">
                          Trains {tier().troop} · {tier().goldPerSoldier} gold each
                        </span>
                      )}
                    </Show>
                    <Show when={nextTier()}>
                      {tier => (
                        <div class="kit-col">
                          <button type="button" class="kit-button" disabled={upgradeBlocker() !== null} onClick={upgrade}>
                            Upgrade to {romanLevel((liveBuilding()?.level ?? 0) + 1)} ({tier().troop}) · {tier().upgradeCost} Gold
                          </button>
                          <Show when={upgradeBlocker() === 'not_researched' && tier().requiresResearch}>
                            {nodeId => (
                              <span class="kit-note">Requires {RESEARCH_BY_ID.get(nodeId())?.name ?? nodeId()}</span>
                            )}
                          </Show>
                        </div>
                      )}
                    </Show>
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
              {entry => (
                <div class="kit-col">
                  <span class="street-label">Trench</span>
                  <Bar
                    label="Garrison"
                    ratio={entry().garrison / Math.max(1, store.state.config.trench.capacity)}
                    value={`${Math.floor(entry().garrison)} / ${store.state.config.trench.capacity}`}
                    variant="accent"
                  />
                  <span class="kit-note">Machine gun: {machineGunStatus()}</span>
                  <div class="kit-row">
                    <button
                      type="button"
                      class="kit-button"
                      disabled={entry().garrison >= store.state.config.trench.capacity || (store.state.empires[player()]?.soldiers ?? 0) < 1}
                      onClick={() => orderTrench('ManTrench', props.controllers.troopPercent())}
                    >
                      Man trench · {props.controllers.troopPercent()}%
                    </button>
                    <button
                      type="button"
                      class="kit-button is-ghost"
                      disabled={entry().garrison < 1}
                      onClick={() => orderTrench('LeaveTrench', 100)}
                    >
                      Withdraw
                    </button>
                  </div>
                  <button
                    type="button"
                    class="kit-button is-danger"
                    disabled={entry().garrison < 1 || trenchTargets() === 0}
                    onClick={startTrenchAttack}
                  >
                    Attack from trench
                  </button>
                </div>
              )}
            </Show>

            <Show when={isForeign()}>
              <div class="kit-col">
                <Bar
                  label="Troops"
                  ratio={Math.min(1, (owner()?.soldiers ?? 0) / Math.max(1, owner()?.reserveCap ?? 1))}
                  value={Math.floor(owner()?.soldiers ?? 0)}
                  variant="danger"
                />
              </div>
            </Show>

            <Show when={isOwn()}>
              <span class="kit-note">
                Pick a building, then click one of your hexes. Buildings need an empty hex around them. · {ownNeighbours()}/6
              </span>
            </Show>

            <Show when={attackFrom() && isForeign()}>
              <span class="kit-note">
                Click foreign land to attack, drag to move the map.
                <Show when={distance(attackFrom()!, hex()!) === 1}> ✓</Show>
              </span>
            </Show>
          </>
        )}
      </Show>
    </Panel>
  );
};
