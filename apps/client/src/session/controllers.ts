import { audio } from '../audio/audio.service';
import { clampPercent } from '@the-big-war/game-engine/math/math.service';


import { createSignal } from 'solid-js';
import type { FrontId } from '../game/front/front.types';
import type { EmpireId } from '../game/empire/empire.types';
import { nearestOwnedHex } from '../game/troops/troops.service';
import type { BuildingKind } from '../game/building/building.types';
import type { CommandError } from '../game/commands/commands.types';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type {
  CommandNotice,
  ControllerDeps,
  Controllers,
  Tool,
} from './controllers.types';
import { distance, gridAt, neighbors, pixelToHex } from '@the-big-war/game-engine/world-tile/world-tile.service';

export type * from './controllers.types';

let noticeId = 0;

export function createControllers(deps: ControllerDeps): Controllers {
  const { store } = deps;
  const [selectedHex, setSelectedHex] = createSignal<Axial | null>(null);
  const [hoverHex, setHoverHex] = createSignal<Axial | null>(null);
  const [tool, setToolSignal] = createSignal<Tool>({ kind: 'idle' });
  const [troopPercent, setTroopPercentSignal] = createSignal(50);
  const [notices, setNotices] = createSignal<readonly CommandNotice[]>([]);

  const state = () => store.state;
  const player = (): EmpireId => state().playerEmpire;

  const noticeTimers = new Map<CommandError, ReturnType<typeof setTimeout>>();
  const notice = (reason: CommandError) => {
    audio.play('error');
    const pending = noticeTimers.get(reason);
    if (pending) clearTimeout(pending);
    else setNotices(current => [...current, { id: ++noticeId, reason }]);
    noticeTimers.set(
      reason,
      setTimeout(() => {
        noticeTimers.delete(reason);
        setNotices(current => current.filter(item => item.reason !== reason));
      }, 2600),
    );
  };

  const dismissNotice = (id: number) => {
    const dismissed = notices().find(item => item.id === id);
    if (dismissed) {
      clearTimeout(noticeTimers.get(dismissed.reason));
      noticeTimers.delete(dismissed.reason);
    }
    setNotices(current => current.filter(item => item.id !== id));
  };

  const hexAtScreen = (at: Pixel): Axial | null => deps.screenToHex(at);

  const own = (hex: Axial): boolean => gridAt(state().grid, hex)?.owner === player();
  const foreign = (hex: Axial): boolean => {
    const cell = gridAt(state().grid, hex);
    return !!cell && cell.owner !== player();
  };

  const attackFromFor = (target: Axial): Axial | null => {
    for (const candidate of neighbors(target)) {
      if (gridAt(state().grid, candidate)?.owner === player()) return candidate;
    }
    return null;
  };

  const sendTroops = (target: Axial) => {
    const from = attackFromFor(target) ?? nearestOwnedHex(state(), player(), target);
    if (!from) {
      notice('invalid_target');
      return;
    }
    const result = store.dispatch({
      type: 'SendTroops',
      empire: player(),
      hex: from,
      target,
      percent: troopPercent(),
      intent: 'attack',
    });
    if (result.ok) deps.onTroopsSent?.(from, target);
    else notice(result.reason);
  };

  const placeBuilding = (hex: Axial, building: BuildingKind) => {
    const result = store.dispatch({ type: 'PlaceBuilding', empire: player(), hex, kind: building });
    if (!result.ok) notice(result.reason);
  };

  const fireCannon = (from: Axial, target: Axial) => {
    const result = store.dispatch({ type: 'FireCannon', empire: player(), from, target });
    if (result.ok) setToolSignal({ kind: 'idle' });
    else notice(result.reason);
  };

  const trenchAttack = (from: Axial, target: Axial) => {
    if (distance(from, target) !== 1 || !foreign(target)) {
      notice('invalid_target');
      return;
    }
    const result = store.dispatch({ type: 'TrenchAttack', empire: player(), hex: from, target, percent: troopPercent() });
    if (!result.ok) {
      notice(result.reason);
      return;
    }
    deps.onTroopsSent?.(from, target);
    setTool({ kind: 'idle' });
  };

  const selectHex = (hex: Axial | null) => {
    setSelectedHex(hex);
  };

  const setTool = (next: Tool) => {
    setToolSignal(next);
    deps.onToolChanged?.(next);
  };

  const cancelTool = () => {
    if (tool().kind !== 'idle') setTool({ kind: 'idle' });
    else setSelectedHex(null);
  };

  const tap = (at: Pixel) => {
    const hex = hexAtScreen(at);
    if (!hex) {
      setSelectedHex(null);
      return;
    }

    const active = tool();
    if (active.kind === 'place') {
      placeBuilding(hex, active.building);
      return;
    }
    if (active.kind === 'cannon') {
      if (distance(active.from, hex) > state().config.cannon.range) {
        notice('invalid_target');
        return;
      }
      fireCannon(active.from, hex);
      return;
    }
    if (active.kind === 'trench-attack') {
      trenchAttack(active.from, hex);
      return;
    }

    if (own(hex)) {
      selectHex(hex);
      return;
    }
    if (foreign(hex)) {
      sendTroops(hex);
      return;
    }
    selectHex(hex);
  };

  const secondary = (at: Pixel) => {
    const hex = hexAtScreen(at);
    if (!hex) return;
    setSelectedHex(hex);
  };

  const key = (pressed: string) => {
    if (pressed === 'Escape') {
      cancelTool();
      return;
    }
    if (pressed === ' ') {
      store.setPaused(!store.paused());
      return;
    }
    if (pressed === '1') store.setSpeed(1);
    if (pressed === '2') store.setSpeed(2);
    if (pressed === '4') store.setSpeed(4);
  };

  return {
    selectedHex,
    hoverHex,
    tool,
    troopPercent,
    notices,
    selectHex,
    setHover: setHoverHex,
    setTroopPercent: percent => setTroopPercentSignal(clampPercent(percent)),
    setTool,
    cancelTool,
    hexAtScreen,
    tap,
    dragOver: client => setHoverHex(deps.clientToHex(client)),
    dropAt: client => {
      const active = tool();
      const hex = deps.clientToHex(client);
      if (active.kind === 'place' && hex) placeBuilding(hex, active.building);
    },
    secondary,
    key,
    notice,
    dismissNotice,
  };
}

export function frontsTouching(state: { readonly fronts: readonly { readonly id: FrontId; readonly hexA: Axial; readonly hexB: Axial }[] }, hex: Axial): FrontId[] {
  return state.fronts
    .filter(
      front =>
        (front.hexA.q === hex.q && front.hexA.r === hex.r) ||
        (front.hexB.q === hex.q && front.hexB.r === hex.r),
    )
    .map(front => front.id);
}

export { pixelToHex };
