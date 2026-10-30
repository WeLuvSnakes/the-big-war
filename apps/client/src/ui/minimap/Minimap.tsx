import './Minimap.css';
import { onCleanup, onMount } from 'solid-js';
import type { MinimapProps } from './Minimap.types';
import { gameStore } from '../../game/store/store.service';
import { NEUTRAL_COLOR, ownerColor } from '../../render/theme';

export type { MinimapProps };

const rgb = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
];

export const Minimap = (props: MinimapProps = {}) => {
  const store = gameStore();
  let canvas: HTMLCanvasElement | undefined;

  const draw = () => {
    const ctx = canvas?.getContext('2d');
    const grid = store.state.grid;
    if (!canvas || !ctx || grid.width === 0) return;
    if (canvas.width !== grid.width) canvas.width = grid.width;
    if (canvas.height !== grid.height) canvas.height = grid.height;
    const image = ctx.createImageData(grid.width, grid.height);
    grid.cells.forEach((cell, index) => {
      const color = cell.owner < 0 ? NEUTRAL_COLOR : ownerColor(cell.owner);
      const [r, g, b] = rgb(color);
      image.data.set([r, g, b, 255], index * 4);
    });
    ctx.putImageData(image, 0, 0);
  };

  onMount(() => {
    draw();
    const timer = setInterval(draw, props.refreshMs ?? 1000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <aside class="minimap" aria-label="Minimap">
      <canvas ref={el => (canvas = el)} />
    </aside>
  );
};
