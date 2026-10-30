import type { GameConfig } from './config.types';
import { mapTileScale } from '../map/terrain.service';

const MAX_SUPPORT_SCALE = 2;

export function scaleConfigToMap(config: GameConfig): GameConfig {
  const scale = Math.max(1, mapTileScale(config.map.width, config.map.height));
  if (scale === 1) return config;
  const range = (value: number) => Math.round(value * scale);
  const support = (value: number) => Math.round(value * Math.min(scale, MAX_SUPPORT_SCALE));
  const radii = config.support;
  return {
    ...config,
    cannon: { ...config.cannon, range: range(config.cannon.range), blastRadius: range(config.cannon.blastRadius) },
    battery: { ...config.battery, range: range(config.battery.range) },
    ship: { ...config.ship, range: range(config.ship.range), blockadeRadius: range(config.ship.blockadeRadius) },
    support: {
      ...radii,
      cityDefenceRadius: support(radii.cityDefenceRadius),
      cityAttackRadius: support(radii.cityAttackRadius),
      barracksAttackRadius: support(radii.barracksAttackRadius),
      fortDefenceRadius: support(radii.fortDefenceRadius),
      machineGunRadius: support(radii.machineGunRadius),
      bunkerRadius: support(radii.bunkerRadius),
      tankRadius: support(radii.tankRadius),
    },
  };
}
