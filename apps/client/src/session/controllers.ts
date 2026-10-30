import { audio } from '../audio/audio.service';
import { clampPercent } from '@the-big-war/game-engine/math/math.service';


import { createSignal } from 'solid-js';
import type { ShipId } from '../game/ship/ship.types';
import { isClaimable } from '../game/map/terrain.service';
import { whenSettled } from '../game/store/store.service';
import type { EmpireId } from '../game/empire/empire.types';
import { isNavigable } from '../game/ship/sea-route.service';
import { shipById, shipsNear } from '../game/ship/ship.service';
import type { BuildingKind } from '../game/building/building.types';
import type { CommandError } from '../game/commands/commands.types';
import type { Axial, Pixel } from '@the-big-war/game-engine/world-tile/world-tile.types';
import type {
  CommandNotice,
  ControllerDeps,
  Controllers,
  Tool,
} from './controllers.types';
import { distance, gridAt, gridIndex, pixelToHex } from '@the-big-war/game-engine/world-tile/world-tile.service';

export type * from './controllers.types';

let noticeId = 0;

const SHIP_TAP_RADIUS = 1;

export function createControllers(deps: ControllerDeps): Controllers {
  const { store } = deps;
  const [selectedHex, setSelectedHex] = createSignal<Axial | null>(null);
  const [hoverHex, setHoverHex] = createSignal<Axial | null>(null);
  const [tool, setToolSignal] = createSignal<Tool>({ kind: 'idle' });
  const [troopPercent, setTroopPercentSignal] = createSignal(50);
  const [selectedShip, setSelectedShip] = createSignal<ShipId | null>(null);
  const [notices, setNotices] = createSignal<readonly CommandNotice[]>([]);

  const state = () => store.state;
  const player = (): EmpireId => state().playerEmpire;

  const noticeTimers = new Map<CommandError, ReturnType<typeof setTimeout>>();
  const notice = (reason: CommandError) => {
    if (reason === 'stale_match') return;
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
    return !!cell && cell.owner !== player() && isClaimable(cell.terrain);
  };

  const sendTroops = (target: Axial) => {
    whenSettled(store.dispatch({ type: 'SendTroops', empire: player(), target, percent: troopPercent() }), result => {
      if (result.ok) deps.onTroopsSent?.(target);
      else notice(result.reason);
    });
  };

  const placeBuilding = (hex: Axial, building: BuildingKind) => {
    whenSettled(store.dispatch({ type: 'PlaceBuilding', empire: player(), hex, kind: building }), result => {
      if (!result.ok) notice(result.reason);
    });
  };

  const fireCannon = (from: Axial, target: Axial) => {
    whenSettled(store.dispatch({ type: 'FireCannon', empire: player(), from, target }), result => {
      if (result.ok) setToolSignal({ kind: 'idle' });
      else notice(result.reason);
    });
  };

  const trenchAttack = (from: Axial, target: Axial) => {
    if (distance(from, target) !== 1 || !foreign(target)) {
      notice('invalid_target');
      return;
    }
    whenSettled(store.dispatch({ type: 'TrenchAttack', empire: player(), hex: from, target, percent: troopPercent() }), result => {
      if (!result.ok) {
        notice(result.reason);
        return;
      }
      deps.onTroopsSent?.(target);
      setTool({ kind: 'idle' });
    });
  };

  const tapShip = (hex: Axial): boolean => {
    const onBuilding = !!gridAt(state().grid, hex)?.building;
    const ship = onBuilding
      ? undefined
      : shipsNear(state(), hex, SHIP_TAP_RADIUS).find(item => item.empire === player() && item.kind === 'battleship');
    if (ship) {
      setSelectedShip(ship.id);
      return true;
    }
    const selected = selectedShip();
    if (selected === null) return false;
    setSelectedShip(null);
    if (!shipById(state(), selected)) return false;
    if (!isNavigable(state().map, gridIndex(state().grid, hex.q, hex.r))) return false;
    whenSettled(store.dispatch({ type: 'OrderShip', empire: player(), ship: selected, target: hex }), result => {
      if (result.ok) setSelectedShip(selected);
      else notice(result.reason);
    });
    return true;
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
    else {
      setSelectedHex(null);
      setSelectedShip(null);
    }
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

    if (tapShip(hex)) return;

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
    selectedShip,
    selectHex,
    selectShip: setSelectedShip,
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

export { pixelToHex };
