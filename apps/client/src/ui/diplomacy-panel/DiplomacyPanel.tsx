import './DiplomacyPanel.css';
import { For, Show } from 'solid-js';
import { Panel } from '@the-big-war/frontend/ui/panel/Panel';
import type { Empire } from '../../game/empire/empire.types';
import type { DiplomacyPanelProps } from './DiplomacyPanel.types';
import { gameStore, live as tracked } from '../../game/store/store.service';
import { getRelation, offerCooldown, pendingOffer, treatySecondsLeft } from '../../game/diplomacy/diplomacy.service';

export type { DiplomacyPanelProps };

export const DiplomacyPanel = (props: DiplomacyPanelProps) => {
  const store = gameStore();
  const live = tracked(() => store.state);
  const player = () => live().playerEmpire;
  const others = () => live().empires.filter(empire => empire.id !== player() && empire.alive);

  const atWar = (empire: Empire) => getRelation(live(), player(), empire.id).status === 'war';

  const offersPeace = (empire: Empire) => pendingOffer(live(), empire.id, player()) !== null;

  const waitSeconds = (empire: Empire): number => {
    if (!atWar(empire)) return Math.ceil(treatySecondsLeft(live(), player(), empire.id));
    if (offersPeace(empire)) return 0;
    const cooldown = offerCooldown(live(), player(), empire.id);
    return cooldown ? Math.ceil(cooldown.until - live().elapsed) : 0;
  };

  const toggle = (empire: Empire) => {
    const result = offersPeace(empire)
      ? store.dispatch({ type: 'RespondOffer', empire: player(), from: empire.id, accept: true })
      : store.dispatch({ type: atWar(empire) ? 'OfferPeace' : 'DeclareWar', empire: player(), target: empire.id });
    if (!result.ok) props.controllers?.notice(result.reason);
  };

  return (
    <Panel title="Diplomacy" kind={`${others().length}`} onClose={props.onClose}>
      <div class="diplo-list">
        <For each={others()}>
          {empire => (
            <div class={`diplo-row${atWar(empire) ? ' is-war' : ''}`}>
              <span class="diplo-name">{empire.name}</span>
              <button
                type="button"
                class={`diplo-action ${atWar(empire) ? 'is-good' : 'is-bad'}`}
                disabled={waitSeconds(empire) > 0}
                onClick={() => toggle(empire)}
              >
                {atWar(empire) ? 'Peace' : 'War'}
                <Show when={waitSeconds(empire) > 0}>
                  <span class="kit-num"> {waitSeconds(empire)}s</span>
                </Show>
              </button>
            </div>
          )}
        </For>
      </div>
    </Panel>
  );
};
