import type { AStarProblem } from './a-star.types';
import { createMinHeap, heapPop, heapPush } from '../collections/min-heap.service';

function walkBack(cameFrom: ReadonlyMap<number, number>, goal: number): number[] {
  const path = [goal];
  let at = cameFrom.get(goal);
  while (at !== undefined) {
    path.push(at);
    at = cameFrom.get(at);
  }
  return path.reverse();
}

export function aStar(problem: AStarProblem): number[] | null {
  const { start, goal } = problem;
  const open = createMinHeap();
  const best = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  heapPush(open, start, problem.heuristic(start));

  for (let node = heapPop(open); node !== undefined; node = heapPop(open)) {
    if (node === goal) return walkBack(cameFrom, goal);
    if (closed.has(node)) continue;
    closed.add(node);
    const current = node;
    const reached = best.get(current)!;
    problem.neighbors(current, (next, cost) => {
      const score = reached + cost;
      if (closed.has(next) || score >= (best.get(next) ?? Infinity)) return;
      best.set(next, score);
      cameFrom.set(next, current);
      heapPush(open, next, score + problem.heuristic(next));
    });
  }
  return null;
}
