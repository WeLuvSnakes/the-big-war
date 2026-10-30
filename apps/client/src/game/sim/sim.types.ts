import type { Ship } from '../ship/ship.types';
import type { Empire } from '../empire/empire.types';
import type { ClientStore } from '../store/store.types';
import type { GameConfig } from '../config/config.types';
import type { Offensive } from '../offensive/offensive.types';
import type { GameState, EndReason } from '../state/state.types';
import type { Command, CommandResult } from '../commands/commands.types';
import type { MatchStatus } from '@the-big-war/game-engine/simulation/simulation.types';

export type OffensiveView = Omit<Offensive, 'frontier' | 'queued'>;

export type ShipView = Omit<Ship, 'path'> & { path?: number[] };

export interface FrameMessage {
  readonly type: 'frame';
  readonly status: MatchStatus;
  readonly playerEmpire: number;
  readonly paused: boolean;
  readonly speed: GameState['speed'];
  readonly tick: number;
  readonly elapsed: number;
  readonly winner: number | null;
  readonly endReason: EndReason | null;
  readonly tradeClock: number;
  readonly landHexCount: number;
  readonly spawnSites: GameState['spawnSites'];
  readonly agentAccumulator: number;
  readonly nextOffensiveId: number;
  readonly nextShipId: number;
  readonly nextBuildingId: number;
  readonly tiles: Float64Array<ArrayBuffer>;
  readonly buildings: Float64Array<ArrayBuffer>;
  readonly gatherers: Float64Array<ArrayBuffer>;
  readonly empires: readonly Empire[];
  readonly offensives: readonly OffensiveView[];
  readonly ships: readonly ShipView[];
  readonly relations: GameState['relations'];
  readonly offerCooldowns: GameState['offerCooldowns'];
  readonly pendingOffers: GameState['pendingOffers'];
}

export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly seq: number;
  readonly match: number;
  readonly config: GameConfig;
  readonly width: number;
  readonly height: number;
  readonly owners: Int32Array<ArrayBuffer>;
  readonly terrains: Uint8Array<ArrayBuffer>;
  readonly biomes: Uint8Array<ArrayBuffer>;
  readonly harvested: Float64Array<ArrayBuffer>;
  readonly landmass: Int32Array<ArrayBuffer>;
  readonly waterBody: Int32Array<ArrayBuffer>;
  readonly landSizes: readonly number[];
  readonly waterSizes: readonly number[];
  readonly frame: FrameMessage;
}

export interface SimPerf {
  readonly tickMs: readonly number[];
  readonly loopMs: readonly number[];
  readonly publishMs: readonly number[];
}

export type SimReply =
  | FrameMessage
  | SnapshotMessage
  | { readonly type: 'result'; readonly seq: number; readonly result: CommandResult }
  | { readonly type: 'perf'; readonly seq: number; readonly perf: SimPerf };

export type SimRequest =
  | { readonly type: 'start'; readonly seq: number; readonly config?: GameConfig; readonly demo: boolean }
  | { readonly type: 'menu'; readonly seq: number }
  | { readonly type: 'command'; readonly seq: number; readonly match: number; readonly command: Command }
  | { readonly type: 'paused'; readonly value: boolean }
  | { readonly type: 'speed'; readonly value: GameState['speed'] }
  | { readonly type: 'suspend'; readonly value: boolean }
  | { readonly type: 'perf'; readonly seq: number };

export interface SimLink {
  post(request: SimRequest): void;
  listen(handler: (reply: SimReply) => void): void;
}

export type PostReply = (reply: SimReply, transfer: Transferable[]) => void;

export interface SimHost {
  readonly state: GameState;
  handle(request: SimRequest): void;
  advance(dtSeconds: number): void;
  publish(): void;
}

export interface MirrorStore extends ClientStore {
  startMatch(config?: GameConfig): Promise<void>;
  perf(): Promise<SimPerf>;
}

export interface InProcessSim {
  readonly host: SimHost;
  readonly store: MirrorStore;
}

