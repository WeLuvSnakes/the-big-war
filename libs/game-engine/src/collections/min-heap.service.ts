import type { MinHeap } from './min-heap.types';

export function createMinHeap(): MinHeap {
  return { items: [], scores: [] };
}

export function heapSize(heap: MinHeap): number {
  return heap.items.length;
}

export function heapClear(heap: MinHeap): void {
  heap.items.length = 0;
  heap.scores.length = 0;
}

function swap(heap: MinHeap, a: number, b: number): void {
  const item = heap.items[a]!;
  const score = heap.scores[a]!;
  heap.items[a] = heap.items[b]!;
  heap.scores[a] = heap.scores[b]!;
  heap.items[b] = item;
  heap.scores[b] = score;
}

export function heapPush(heap: MinHeap, item: number, score: number): void {
  heap.items.push(item);
  heap.scores.push(score);
  let at = heap.items.length - 1;
  while (at > 0) {
    const parent = (at - 1) >> 1;
    if (heap.scores[parent]! <= heap.scores[at]!) return;
    swap(heap, at, parent);
    at = parent;
  }
}

export function heapPop(heap: MinHeap): number | undefined {
  const size = heap.items.length;
  if (size === 0) return undefined;
  const top = heap.items[0]!;
  const last = size - 1;
  swap(heap, 0, last);
  heap.items.pop();
  heap.scores.pop();
  let at = 0;
  for (;;) {
    const left = at * 2 + 1;
    const right = left + 1;
    let smallest = at;
    if (left < last && heap.scores[left]! < heap.scores[smallest]!) smallest = left;
    if (right < last && heap.scores[right]! < heap.scores[smallest]!) smallest = right;
    if (smallest === at) return top;
    swap(heap, at, smallest);
    at = smallest;
  }
}
