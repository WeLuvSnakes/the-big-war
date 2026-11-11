import './CameraReset.css';
import { Show } from 'solid-js';
import type { CameraResetProps } from './CameraReset.types';
import { FaUndo } from '@the-big-war/frontend/ui/icons/icons';

export type { CameraResetProps };

export const CameraReset = (props: CameraResetProps) => (
  <Show when={props.cameraMoved}>
    <div class="camera-reset street-tray kit-glass">
      <button
        type="button"
        class="street-action is-wide camera-reset-button"
        title="Reset map view"
        aria-label="Reset map view"
        onClick={() => props.onReset()}
      >
        <FaUndo />
      </button>
    </div>
  </Show>
);
