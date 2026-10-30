import './Bar.css';
import { Show } from 'solid-js';
import type { BarProps, BarVariant } from './Bar.types';
import { clamp01 } from '@the-big-war/game-engine/math/math.service';

export type { BarProps, BarVariant };

export const Bar = (props: BarProps) => (
  <div class={`hud-bar hud-bar--${props.variant ?? 'neutral'}`}>
    <div class="hud-bar-fill" style={{ width: `${clamp01(props.ratio) * 100}%` }} />
    <span class="hud-bar-label">{props.label}</span>
    <Show when={props.value !== undefined}>
      <span class="hud-bar-value">{props.value}</span>
    </Show>
    {props.children}
  </div>
);
