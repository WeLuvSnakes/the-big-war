import type { Accessor } from 'solid-js';
import type { ClientStore } from '../game/store/store.types';
import type { SelectionBox } from '../render/units-layer.types';
import type { Formation, UnitId, UnitKind } from '../game/unit/unit.types';
import type { Command, CommandResult } from '../game/commands/commands.types';
import type { Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface UnitMenu {
  readonly at: Pixel;
  readonly world: Pixel;
  readonly foe: UnitId | null;
  readonly count: number;
  readonly formation: Formation;
}

export interface UnitControls {
  readonly selected: Accessor<ReadonlySet<UnitId>>;
  readonly box: Accessor<SelectionBox | null>;
  readonly menu: Accessor<UnitMenu | null>;

  tap(world: Pixel, shift: boolean): boolean;
  boxStart(world: Pixel): void;
  boxMove(world: Pixel): void;
  boxEnd(world: Pixel, shift: boolean): void;
  context(world: Pixel, at: Pixel): boolean;
  closeMenu(): void;
  attack(): void;
  guard(): void;
  hold(): void;
  arrange(formation: Formation): void;
  selectKind(kind: UnitKind, add: boolean): void;
  selectAll(ids: readonly UnitId[]): void;
  clear(): boolean;
  centre(): Pixel | null;
  prune(): void;
}

export interface UnitControlDeps {
  readonly store: ClientStore;
  readonly run: (command: Command, onDone?: (result: CommandResult) => void) => void;
  readonly view: () => { readonly min: Pixel; readonly max: Pixel; readonly scale: number };
  readonly ping: (world: Pixel, color: number) => void;
}
