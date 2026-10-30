export interface FrameLoopOptions {
  readonly maxFrameSeconds?: number;
}

export interface FrameLoop {
  start(): void;

  stop(): void;

  running(): boolean;
}
