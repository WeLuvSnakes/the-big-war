import { signed, signedPercent } from '@the-big-war/frontend/ui/format/format';


import './FactionPicker.css';
import { For } from 'solid-js';
import { FACTIONS } from '../../game/faction/faction.constants';
import type { FactionPickerProps } from './FactionPicker.types';
import type { Modifier } from '../../game/modifier/modifier.types';

export type { FactionPickerProps };

function bonusLine(modifier: Modifier): string {
  const name = modifier.key;
  if (modifier.mul !== undefined) return `${signedPercent(Math.round((modifier.mul - 1) * 100))} ${name}`;
  if (modifier.add !== undefined) return `${signed(modifier.add)} ${name}`;
  return name;
}

export const FactionPicker = (props: FactionPickerProps) => (
  <div class="kit-screen">
    <div class="kit-screen-inner">
      <h1 class="kit-title">Choose your faction</h1>
      <p class="kit-note">Build your empire. Make theirs fall.</p>

      <div class="kit-factions">
        <For each={FACTIONS}>
          {faction => (
            <button
              type="button"
              class={`kit-faction-card${props.selected === faction.id ? ' is-selected' : ''}`}
              aria-pressed={props.selected === faction.id}
              onClick={() => props.onSelect(faction.id)}
            >
              <span class="hud-card-swatch" style={{ background: `var(--faction-${faction.colorIndex})` }} />
              <span class="kit-faction-name">{faction.name}</span>
              <span class="kit-faction-blurb">{faction.blurb}</span>
              <span class="kit-faction-bonuses">
                <For each={faction.bonuses}>{modifier => <span>{bonusLine(modifier)}</span>}</For>
              </span>
            </button>
          )}
        </For>
      </div>

      <div class="kit-actions">
        <button type="button" class="kit-button is-ghost" onClick={() => props.onBack()}>
          Back
        </button>
        <button type="button" class="kit-button is-primary" onClick={() => props.onConfirm()}>
          Begin the war
        </button>
      </div>
    </div>
  </div>
);
