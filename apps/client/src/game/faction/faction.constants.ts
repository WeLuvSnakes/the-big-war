import type { FactionDef } from './faction.types';

export const FACTIONS: readonly FactionDef[] = [
  {
    id: 'ironclad',
    name: 'Soldier',
    blurb: 'Might before coin: stronger armies, weaker treasury.',
    colorIndex: 0,
    bonuses: [
      { key: 'attack', mul: 1.15, label: 'Soldier' },
      { key: 'defence', mul: 1.1, label: 'Soldier' },
      { key: 'goldIncome', mul: 0.9, label: 'Soldier' },
    ],
  },
  {
    id: 'league',
    name: 'Merchant',
    blurb: 'Gold flows freely; soldiers do not come cheap.',
    colorIndex: 1,
    bonuses: [
      { key: 'goldIncome', mul: 1.3, label: 'Merchant' },
      { key: 'buildCost', mul: 0.9, label: 'Merchant' },
      { key: 'attack', mul: 0.95, label: 'Merchant' },
    ],
  },
  {
    id: 'verdant',
    name: 'Builder',
    blurb: 'Fast growth and cheap construction from the heartland.',
    colorIndex: 2,
    bonuses: [
      { key: 'growth', mul: 1.3, label: 'Builder' },
      { key: 'buildCost', mul: 0.85, label: 'Builder' },
      { key: 'defence', mul: 0.95, label: 'Builder' },
    ],
  },
  {
    id: 'academy',
    name: 'Researcher',
    blurb: 'Science first: faster research, tougher units, slower training.',
    colorIndex: 3,
    bonuses: [
      { key: 'scienceRate', mul: 1.35, label: 'Researcher' },
      { key: 'defence', mul: 1.1, label: 'Researcher' },
      { key: 'trainSpeed', mul: 0.9, label: 'Researcher' },
    ],
  },
];
