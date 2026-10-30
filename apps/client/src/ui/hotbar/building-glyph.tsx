import type { JSX } from 'solid-js';
import type { BuildingKind } from '../../game/building/building.types';
import {
  FaBolt,
  FaBox,
  FaBuilding,
  FaCrosshairs,
  FaLayerGroup,
  FaShieldAlt,
  FaShoppingBag,
  FaStar,
  FaUsers,
  FaVial,
  GiAnchor,
  GiCoin,
  GiGem,
  GiPineTree,
  GiSprout,
  GiTank,
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
  fort: FaShieldAlt,
  cannon: FaCrosshairs,
  trench: FaLayerGroup,
  machine_gun: FaBolt,
  battery: FaStar,
  bunker: FaBox,
  tank: GiTank,
};

export function buildingGlyph(kind: BuildingKind): JSX.Element {
  return GLYPHS[kind]({});
}
