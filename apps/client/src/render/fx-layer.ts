import { Container, Graphics } from 'pixi.js';
import { ACCENT_COLOR, DANGER_COLOR } from './theme';
import type { Axial } from '@the-big-war/game-engine/world-tile/world-tile.types';
import { axialToPixel } from '@the-big-war/game-engine/world-tile/world-tile.service';

export type FxKind = 'cannonPuff' | 'captureFlash' | 'eliminationFade';

interface Fx {
  readonly object: Graphics;
  kind: FxKind;
  hex: Axial;
  
  size: number;
  age: number;
  
  life: number;
  color: number;
}

const LIFETIMES: Readonly<Record<FxKind, number>> = {
  cannonPuff: 0.6,
  captureFlash: 0.5,
  eliminationFade: 1.4,
};

const MAX_EFFECTS = 64;

export class FxLayer {
  
  readonly container: Container;
  private readonly active: Fx[] = [];
  private readonly free: Graphics[] = [];

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
  }

  spawn(kind: FxKind, hex: Axial, hexSize: number, color?: number): void {
    if (this.active.length >= MAX_EFFECTS) return;
    const object = this.free.pop() ?? new Graphics();
    object.eventMode = 'none';
    object.clear();
    this.container.addChild(object);
    this.active.push({
      object,
      kind,
      hex: { q: hex.q, r: hex.r },
      size: hexSize,
      age: 0,
      life: LIFETIMES[kind],
      color: color ?? defaultColor(kind),
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      if (!fx) continue;
      fx.age += dt;
      if (fx.age >= fx.life) {
        this.container.removeChild(fx.object);
        this.free.push(fx.object);
        this.active.splice(i, 1);
        continue;
      }
      this.render(fx);
    }
  }

  clear(): void {
    for (const fx of this.active) {
      this.container.removeChild(fx.object);
      this.free.push(fx.object);
    }
    this.active.length = 0;
  }

  get activeCount(): number {
    return this.active.length;
  }

  private render(fx: Fx): void {
    const g = fx.object;
    const t = fx.age / fx.life; 
    g.clear();
    const center = axialToPixel(fx.hex, fx.size);
    const alpha = 1 - t;
    switch (fx.kind) {
      case 'cannonPuff': {
        const radius = fx.size * (0.3 + t * 0.9);
        g.circle(center.x, center.y, radius);
        g.fill({ color: fx.color, alpha: alpha * 0.4 });
        g.circle(center.x, center.y, radius * 0.6);
        g.stroke({ width: 2, color: ACCENT_COLOR, alpha: alpha * 0.8 });
        break;
      }
      case 'captureFlash': {
        const radius = fx.size * (1.0 - t * 0.3);
        g.poly(hexagon(center, radius));
        g.fill({ color: fx.color, alpha: alpha * 0.45 });
        g.stroke({ width: 3, color: fx.color, alpha: alpha });
        break;
      }
      case 'eliminationFade': {
        const radius = fx.size * (0.4 + t * 0.8);
        g.poly(hexagon(center, radius));
        g.stroke({ width: 4 * (1 - t) + 1, color: fx.color, alpha: alpha * 0.7 });
        break;
      }
    }
    g.alpha = alpha;
  }
}

function defaultColor(kind: FxKind): number {
  if (kind === 'cannonPuff') return 0x555555;
  if (kind === 'captureFlash') return ACCENT_COLOR;
  return DANGER_COLOR;
}

function hexagon(center: { x: number; y: number }, size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i + 30) * Math.PI) / 180;
    points.push(center.x + size * Math.cos(angle), center.y + size * Math.sin(angle));
  }
  return points;
}
