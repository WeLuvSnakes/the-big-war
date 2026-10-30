import type { FrameLoop, FrameLoopOptions } from './frame-loop.types';

export type * from './frame-loop.types';

const DEFAULT_MAX_FRAME_SECONDS = 0.1;

export function createFrameLoop(onFrame: (dt: number) => void, options: FrameLoopOptions = {}): FrameLoop {
  const maxFrameSeconds = options.maxFrameSeconds ?? DEFAULT_MAX_FRAME_SECONDS;
  let frame = 0;
  let lastTime = 0;

  const loop = (time: number): void => {
    frame = requestAnimationFrame(loop);
    const dt = lastTime === 0 ? 0 : Math.min(maxFrameSeconds, (time - lastTime) / 1000);
    lastTime = time;
    onFrame(dt);
  };

  return {
    start(): void {
      if (frame) return;
      lastTime = 0;
      frame = requestAnimationFrame(loop);
    },
    stop(): void {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    running: () => frame !== 0,
  };
}
