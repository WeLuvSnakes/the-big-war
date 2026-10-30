

import './ArmyPanel.css';
import { For, Show } from 'solid-js';

import { ownerCss } from '../../render/theme';
import type { ArmyPanelProps } from './ArmyPanel.types';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import { gameStore, live } from '../../game/store/store.service';
import { deployedTroops } from '../../game/troops/troops.service';
import { NEUTRAL_OWNER } from '../../game/empire/empire.constants';
import type { Offensive } from '../../game/offensive/offensive.types';
import { FaFlag, FaTimes, FaUsers } from '@the-big-war/frontend/ui/icons/icons';

export type { ArmyPanelProps };

export const ArmyPanel = (props: ArmyPanelProps) => {
  const store = gameStore();
  const player = live(() => store.state.playerEmpire);

  const myOffensives = live((): readonly Offensive[] =>
    store.state.offensives.filter(offensive => offensive.empire === player()),
  );
  const incoming = live((): readonly Offensive[] =>
    store.state.offensives.filter(offensive => offensive.target === player()),
  );
  const troopsOf = (offensive: Offensive): number => live(() => Math.ceil(offensive.troops))();
  const takenBy = (offensive: Offensive): number => live(() => offensive.taken)();
  const reserve = live(() => Math.floor(store.state.empires[player()]?.soldiers ?? 0));

  const nameOf = (empire: number): string =>
    empire === NEUTRAL_OWNER ? 'Wild' : (store.state.empires[empire]?.name ?? '');
  const swatch = (empire: number): string =>
    empire === NEUTRAL_OWNER ? 'var(--street-muted)' : ownerCss(empire);

  const deployed = live(() => deployedTroops(store.state, player()));
  const missionCount = () => myOffensives().length + incoming().length;
  const retreatPenalty = () => Math.round(store.state.config.wave.retreatPenalty * 100);

  const focus = (offensive: Offensive) => {
    props.controllers.selectHex(offensive.head);
    props.onClose();
  };

  const recall = (offensive: Offensive) => {
    store.dispatch({ type: 'RecallOffensive', empire: player(), offensive: offensive.id });
  };

  return (
    <Panel title="Combat" kind={`${missionCount()}`} onClose={props.onClose}>
      <div class="army-summary">
        <span class="army-stat" title="Troops at home">
          <FaUsers class="army-stat-icon" />
          <span class="kit-num">{reserve()}</span>
        </span>
        <span class="army-stat" title="Deployed">
          <FaFlag class="army-stat-icon" />
          <span class="kit-num">{Math.ceil(deployed())}</span>
        </span>
      </div>

      <Show
        when={missionCount() > 0}
        fallback={<div class="army-empty">No troops deployed. Click land to attack or claim it.</div>}
      >
        <For each={myOffensives()}>
          {offensive => (
            <div class="kit-col army-node">
              <div class="hud-card-head">
                <span class="hud-card-swatch" style={{ background: swatch(offensive.target) }} />
                <button type="button" class="army-front-name" title="Show on map" onClick={() => focus(offensive)}>
                  {nameOf(offensive.target)}
                </button>
                <span class="army-troops kit-num">{troopsOf(offensive)}</span>
                <button
                  type="button"
                  class="army-retreat"
                  title={`Recall (lose ${retreatPenalty()}% of troops)`}
                  aria-label={`Recall the attack on ${nameOf(offensive.target)}`}
                  onClick={() => recall(offensive)}
                >
                  <FaTimes />
                </button>
              </div>
              <span class="army-sub">{takenBy(offensive)} tiles taken</span>
            </div>
          )}
        </For>

        <For each={incoming()}>
          {offensive => (
            <div class="kit-col army-node">
              <div class="hud-card-head">
                <span class="hud-card-swatch" style={{ background: swatch(offensive.empire) }} />
                <button type="button" class="army-front-name" title="Show on map" onClick={() => focus(offensive)}>
                  {nameOf(offensive.empire)} attacking
                </button>
                <span class="army-troops kit-num">{troopsOf(offensive)}</span>
              </div>
              <span class="army-sub">{takenBy(offensive)} of your tiles taken</span>
            </div>
          )}
        </For>
      </Show>
    </Panel>
  );
};
