import { previewPixels } from './map-preview-pixels';
import type { MatchSettings } from '../../session/flow';

export { previewPixels };

const CACHE_LIMIT = 44;

interface PreviewJob {
  readonly key: string;
  readonly settings: MatchSettings;
  readonly canvas: HTMLCanvasElement;
}

interface PreviewResult {
  readonly key: string;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
}

const cache = new Map<string, ImageData>();
const pending: PreviewJob[] = [];
let active: PreviewJob | null = null;
let worker: Worker | null = null;

const previewKey = (settings: MatchSettings): string => `${settings.preset}:${settings.mapSize}:${settings.seed}`;

function draw(canvas: HTMLCanvasElement, image: ImageData): void {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')?.putImageData(image, 0, 0);
}

function finish(result: PreviewResult): void {
  const image = new ImageData(result.pixels, result.width, result.height);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(result.key, image);
  if (active?.key === result.key) draw(active.canvas, image);
  for (const job of pending.filter(item => item.key === result.key)) {
    draw(job.canvas, image);
    pending.splice(pending.indexOf(job), 1);
  }
  active = null;
  next();
}

function previewWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./map-preview.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = event => finish(event.data as PreviewResult);
  return worker;
}

function next(): void {
  if (active) return;
  const job = pending.shift();
  if (!job) return;
  active = job;
  previewWorker().postMessage({ key: job.key, settings: job.settings });
}

export function paintPreview(canvas: HTMLCanvasElement, settings: MatchSettings): () => void {
  const key = previewKey(settings);
  const cached = cache.get(key);
  if (cached) {
    draw(canvas, cached);
    return () => {};
  }
  const job: PreviewJob = { key, settings: { ...settings }, canvas };
  pending.push(job);
  next();
  return () => {
    const at = pending.indexOf(job);
    if (at >= 0) pending.splice(at, 1);
  };
}
