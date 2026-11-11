import type { JSX } from 'solid-js';
import type { BuildingKind } from '../../game/building/building.types';
import {
  FaBuilding,
  FaCrosshairs,
  FaHammer,
  FaLayerGroup,
  FaShoppingBag,
  FaStar,
  FaUsers,
  FaVial,
  GiAnchor,
  GiCoin,
  GiGem,
  GiPineTree,
  GiSprout,
} from '@the-big-war/frontend/ui/icons/icons';

const GLYPHS: Record<BuildingKind, (props: { class?: string }) => JSX.Element> = {
  city: FaBuilding,
  market: FaShoppingBag,
  lumberjack: GiPineTree,
  miner: GiGem,
  farm: GiSprout,
  lab: FaVial,
  port: GiAnchor,
  fishery: GiCoin,
  barracks: FaUsers,
  cannon: FaCrosshairs,
  trench: FaLayerGroup,
  battery: FaStar,
  factory: FaHammer,
};

export function buildingGlyph(kind: BuildingKind): JSX.Element {
  return GLYPHS[kind]({});
}
