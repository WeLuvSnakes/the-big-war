import type { GameConfig } from './config.types';
import { mapTileScale } from '../map/terrain.service';

export function scaleConfigToMap(config: GameConfig): GameConfig {
  const scale = Math.max(1, mapTileScale(config.map.width, config.map.height));
  if (scale === 1) return config;
  const range = (value: number) => Math.round(value * scale);
  return {
    ...config,
    cannon: { ...config.cannon, range: range(config.cannon.range), blastRadius: range(config.cannon.blastRadius) },
    battery: { ...config.battery, range: range(config.battery.range) },
    ship: { ...config.ship, range: range(config.ship.range), blockadeRadius: range(config.ship.blockadeRadius) },
  };
}
