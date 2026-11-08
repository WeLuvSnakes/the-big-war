

declare module 'bun:test' {
  export type TestFn = (name: string, fn: () => void | Promise<void>, timeout?: number) => void;

  export const test: TestFn;
  export const it: TestFn;
  export const describe: TestFn;

  export interface Matchers<T> {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeCloseTo(expected: number, digits?: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: string): void;
    readonly not: Matchers<T>;
  }

  export function expect<T>(actual: T): Matchers<T>;
}
