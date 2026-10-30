import { clock } from '@the-big-war/frontend/ui/format/format';


import './EndScreen.css';
import type { EndScreenProps } from './EndScreen.types';
import { gameStore } from '../../game/store/store.service';

export type { EndScreenProps };

export const EndScreen = (props: EndScreenProps) => {
  const store = gameStore();
  const reasonText = () => 'Last empire standing';

  return (
    <div class="kit-screen">
      <div class="kit-screen-inner">
        <div class="kit-result">
          <span
            class={`kit-result-outcome ${props.playerWon ? 'is-victory' : 'is-defeat'}`}
          >
            {props.playerWon ? 'Victory' : 'Defeat'}
          </span>
          <span class="kit-subtitle">{reasonText()}</span>
          <span class="kit-note">
            Empires: {store.state.empires.filter(empire => empire.alive).length} /{' '}
            {store.state.empires.length} · Time{' '}
            {clock(store.state.elapsed)}
          </span>
        </div>
        <div class="kit-actions">
          <button type="button" class="kit-button is-ghost" onClick={() => props.onMenu()}>
            Main menu
          </button>
          <button type="button" class="kit-button is-primary" onClick={() => props.onAgain()}>
            Fight again
          </button>
        </div>
      </div>
    </div>
  );
};
