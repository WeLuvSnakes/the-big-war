export const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;

export const signedPercent = (delta: number): string => `${signed(delta)}%`;

export const perSecond = (value: number): string => `${signed(Number(value.toFixed(1)))}/s`;

export const multiplier = (value: number): string => `×${value.toFixed(2)}`;

export const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const classes = (...names: readonly (string | false | null | undefined)[]): string =>
  names.filter(Boolean).join(' ');
