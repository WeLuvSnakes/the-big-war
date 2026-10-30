import type { Bot } from './bot.types';
import { BOT_TUNING } from './bot.constants';
import type { HexCell } from '../map/map.types';
import type { GameState } from '../state/state.types';
import type { Command } from '../commands/commands.types';
import { buildingCellsOf } from '../map/world-index.service';
import { defendersAt } from '../offensive/offensive.service';
import type { Offensive } from '../offensive/offensive.types';
import { findSite, hostileEdges } from './bot-queries.service';
import type { Empire, EmpireId } from '../empire/empire.types';
import { clamp } from '@the-big-war/game-engine/math/math.service';
import { nextInt } from '@the-big-war/game-engine/rng/rng.service';
import { buildingCost, isEncampment } from '../building/building.service';
import { distance } from '@the-big-war/game-engine/world-tile/world-tile.service';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';

export interface DefenceResult {
  readonly commands: Command[];
  readonly building: boolean;
  readonly holdAttacks: boolean;
}

interface Threat {
  readonly offensive: Offensive;
  readonly camp: HexCell;
}

function key(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

export function encampmentsOf(state: GameState, empire: EmpireId): HexCell[] {
  return buildingCellsOf(state, empire).filter(
    cell => cell.building !== null && isEncampment(cell.building.kind) && cell.building.buildRemaining <= 0,
  );
}

export function attackGroups(state: GameState, empire: EmpireId): Offensive[] {
  return state.offensives.filter(item => item.empire === empire && item.mission === 'attack');
}

function findThreats(state: GameState, empire: EmpireId, camps: readonly HexCell[]): Threat[] {
  const threats: Threat[] = [];
  for (const offensive of state.offensives) {
    if (offensive.target !== empire || offensive.mission === 'retreat' || offensive.troops <= 0) continue;
    let nearest: HexCell | null = null;
    let nearestDistance = BOT_TUNING.threatRadius;
    for (const camp of camps) {
      const d = distance(camp, offensive.head);
      if (d <= nearestDistance) {
        nearest = camp;
        nearestDistance = d;
      }
    }
    if (nearest) threats.push({ offensive, camp: nearest });
  }
  return threats;
}

function holdingAt(state: GameState, empire: EmpireId, spot: Axial): boolean {
  return state.offensives.some(
    item => item.empire === empire && item.mission === 'hold' && distance(item.focus, spot) <= 1,
  );
}

function nearestSource(camps: readonly HexCell[], spot: HexCell): HexCell | null {
  let best: HexCell | null = null;
  let bestDistance = Infinity;
  for (const camp of camps) {
    if (camp.q === spot.q && camp.r === spot.r) continue;
    if (camp.building!.garrison < BOT_TUNING.minDefenderGarrison) continue;
    const d = distance(camp, spot);
    if (d < bestDistance) {
      best = camp;
      bestDistance = d;
    }
  }
  return best;
}

function hostileCellNear(state: GameState, empire: EmpireId, attacker: EmpireId, spot: Axial): Axial | null {
  let best: Axial | null = null;
  let bestDistance = Infinity;
  for (const edge of hostileEdges(state, empire)) {
    if (edge.defender !== attacker) continue;
    const d = distance(edge.target, spot);
    if (d < bestDistance) {
      best = edge.target;
      bestDistance = d;
    }
  }
  return best;
}

export function defenceCommands(bot: Bot, state: GameState, empire: Empire, dt: number): DefenceResult {
  bot.clock += dt;
  const commands: Command[] = [];
  const camps = encampmentsOf(state, bot.empire);
  const threats = findThreats(state, bot.empire, camps);

  const live = new Set(threats.map(threat => threat.offensive.id));
  for (const id of [...bot.alarms.keys()]) if (!live.has(id)) bot.alarms.delete(id);
  for (const threat of threats) {
    if (bot.alarms.has(threat.offensive.id)) continue;
    const delay = BOT_TUNING.defenceReactionDelay + nextInt(bot.rng, BOT_TUNING.defenceReactionJitter + 1);
    bot.alarms.set(threat.offensive.id, { since: bot.clock, delay });
  }

  const pending = bot.pendingHold;
  if (pending) {
    const fresh = state.offensives.find(
      item => item.empire === bot.empire && !pending.known.has(item.id) && item.mission === 'attack',
    );
    if (fresh) {
      commands.push({ type: 'OrderOffensive', empire: bot.empire, offensive: fresh.id, target: pending.spot });
      bot.pendingHold = null;
    } else if (bot.clock >= pending.expires) bot.pendingHold = null;
  }

  let sent = bot.pendingHold !== null;
  for (const threat of threats) {
    const alarm = bot.alarms.get(threat.offensive.id)!;
    if (sent || bot.clock - alarm.since < alarm.delay) continue;
    const spot = threat.camp;
    const cooldown = bot.cooldowns.get(key(spot)) ?? -Infinity;
    if (bot.clock - cooldown < BOT_TUNING.defenceCooldown) continue;
    if (holdingAt(state, bot.empire, spot)) continue;
    const need = threat.offensive.troops * BOT_TUNING.defenceMargin;
    if (defendersAt(state, spot, threat.offensive.empire) >= need) continue;
    const source = nearestSource(camps, spot);
    const aim = hostileCellNear(state, bot.empire, threat.offensive.empire, spot);
    if (!source || !aim || empire.soldiers < 1) continue;
    const share = Math.min(need, source.building!.garrison);
    const percent = clamp(Math.ceil((share / empire.soldiers) * 100), 1, 100);
    commands.push({ type: 'SendTroops', empire: bot.empire, target: aim, percent });
    bot.pendingHold = {
      spot: { q: spot.q, r: spot.r },
      known: new Set(state.offensives.filter(item => item.empire === bot.empire).map(item => item.id)),
      expires: bot.clock + BOT_TUNING.holdOrderWindow,
    };
    bot.cooldowns.set(key(spot), bot.clock);
    sent = true;
  }

  let building = false;
  const total = buildingCellsOf(state, bot.empire).filter(cell => isEncampment(cell.building!.kind)).length;
  if (total < BOT_TUNING.minEncampments + (threats.length > 0 ? 1 : 0) && camps.length > 0) {
    const site = empire.gold >= buildingCost(state, bot.empire, 'fort') ? findSite(state, bot.empire, 'fort') : null;
    if (site) {
      commands.push({ type: 'PlaceBuilding', empire: bot.empire, hex: site, kind: 'fort' });
      building = true;
    }
  }

  return { commands, building, holdAttacks: threats.length > 0 || bot.pendingHold !== null };
}
