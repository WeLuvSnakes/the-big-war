export interface AStarProblem {
  readonly start: number;
  readonly goal: number;
  heuristic(node: number): number;
  neighbors(node: number, visit: (next: number, cost: number) => void): void;
}
