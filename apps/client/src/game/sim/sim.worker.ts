import type { SimRequest } from './sim.types';
import { createSimHost } from './sim-host.service';

const LOOP_MS = 16;
const PUBLISH_MS = 30;
const MAX_FRAME_SECONDS = 0.1;

const scope = globalThis as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<SimRequest>) => void) | null;
};

const host = createSimHost((reply, transfer) => scope.postMessage(reply, transfer));

scope.onmessage = event => host.handle(event.data);

let last = performance.now();
let lastPublish = 0;

setInterval(() => {
  const now = performance.now();
  host.advance(Math.min(MAX_FRAME_SECONDS, (now - last) / 1000));
  last = now;
  if (now - lastPublish < PUBLISH_MS) return;
  lastPublish = now;
  host.publish();
}, LOOP_MS);
