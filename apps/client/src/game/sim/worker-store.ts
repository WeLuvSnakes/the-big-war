import type { MirrorStore, SimReply } from './sim.types';
import { createMirrorStore } from './mirror-store.service';

export function createWorkerStore(demo = false): MirrorStore {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const store = createMirrorStore(
    {
      post: request => worker.postMessage(request),
      listen: handler => {
        worker.onmessage = (event: MessageEvent<SimReply>) => handler(event.data);
      },
    },
    demo,
  );
  document.addEventListener('visibilitychange', () => {
    worker.postMessage({ type: 'suspend', value: document.hidden });
  });
  return store;
}
