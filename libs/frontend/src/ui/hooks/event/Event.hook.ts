import { onCleanup, onMount } from 'solid-js';

export function useEvent<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  listener: (event: WindowEventMap[K]) => void,
): void {
  onMount(() => {
    target.addEventListener(type, listener);
    onCleanup(() => target.removeEventListener(type, listener));
  });
}
