import type { LevelDef, LevelObject } from '../types';
import { ramp, railing } from '../helpers';
import { island } from '../props';

/**
 * JOB 16 — Stack 'Em High (a pallet, and as many boxes as you dare)
 * The yard of a toy warehouse. Three crane pads on the way: stop the pallet
 * on one and hold still, and a box gets stacked on top. Up the ramp, along
 * the loading deck (mind the speed bumps), into the truck. Every box still
 * standing at the drop-off pays; a tall tower is worth a fortune and topples
 * if you so much as think about turning quickly.
 */
const DECK = 0.5;
const PALLET_Y = 0.1;

const objects: LevelObject[] = [
  // ---- the yard (z 4..-12), then the raised loading deck (along +x)
  ...island([0, 0, -4], [9, 17], 'concrete'),
  ramp([0, 0, -10.5], [0, DECK, -13.6], 4.2, { surface: 'concrete' }),
  { type: 'box', pos: [5, DECK - 0.25, -17.2], size: [18, 0.5, 7.6], surface: 'concrete', radius: 0.08 },
  { type: 'box', pos: [5, DECK - 2.2, -17.2], size: [17.4, 3.4, 7], color: 0xa8937d, collide: false },
  // lines painted on the way
  { type: 'box', pos: [0, 0.006, -4], size: [0.12, 0.01, 12], color: 0xffd23f, collide: false, castShadow: false },
  { type: 'box', pos: [5, DECK + 0.006, -17.2], size: [16, 0.01, 0.12], color: 0xffd23f, collide: false, castShadow: false },
  // low walls round the deck
  ...railing([-4, DECK, -13.4], [-4, DECK, -21], { color: 0x8f9bb0, height: 0.7 }),
  ...railing([-4, DECK, -21], [14, DECK, -21], { color: 0x8f9bb0, height: 0.7 }),
  ...railing([2.2, DECK, -13.4], [14, DECK, -13.4], { color: 0x8f9bb0, height: 0.7 }),
  // speed bumps across the deck
  ...[4.2, 6.6].map((x): LevelObject => ({ type: 'box', pos: [x, DECK + 0.04, -17.2], size: [0.34, 0.08, 6], color: 0xffd23f, radius: 0.03 })),
  // the truck at the end: its bed is the drop-off
  { type: 'box', pos: [13.5, DECK + 1.4, -15.3], size: [3.4, 2.8, 0.2], color: 0xf4f1ea, fade: true },
  { type: 'box', pos: [13.5, DECK + 1.4, -19.1], size: [3.4, 2.8, 0.2], color: 0xf4f1ea, fade: true },
  { type: 'box', pos: [15.3, DECK + 1.4, -17.2], size: [0.2, 2.8, 4], color: 0xf4f1ea },
  { type: 'box', pos: [13.5, DECK + 2.9, -17.2], size: [3.8, 0.2, 4], color: 0xe6e1d6, fade: true },
  { type: 'box', pos: [16.6, DECK + 1, -17.2], size: [2.2, 2, 3.6], color: 0x3d9bff },
  { type: 'sign', pos: [13.5, DECK + 3.4, -17.2], rot: [0, -90, 0], size: [3, 0.6, 0.08], text: 'DROP-OFF', bg: '#2f7a5b' },
  // stacks of boxes about the yard (looks)
  ...([[-3.4, 2.4], [3.4, -1], [-3.3, -7.5], [3.3, -8.6]] as const).flatMap(([x, z], i): LevelObject[] => [
    { type: 'box', pos: [x, 0.3, z], size: [0.6, 0.6, 0.6], color: 0xc8955b, radius: 0.02 },
    { type: 'box', pos: [x + 0.05, 0.85, z - 0.04], size: [0.5, 0.5, 0.5], color: 0xd8a86b, radius: 0.02, rot: [0, 12 + i * 9, 0] },
  ]),
  { type: 'sign', pos: [5, DECK + 2.6, -21.3], size: [5, 0.9, 0.1], text: "STACK 'EM HIGH", bg: '#7a4adb' },
  // the cranes
  { type: 'hazard', kind: 'tower', pos: [0, 0, 0], params: { stations: [[0, 0, -2.6], [0, DECK, -17.2], [9.4, DECK, -17.2]] } },
];

const level: LevelDef = {
  id: 'tower',
  name: "Stack 'Em High",
  tagline: 'Stack boxes on the pallet. Deliver the tower. Do not sneeze.',
  order: 16,
  cargo: 'pallet',
  cameraYaw: 0,
  spawn: { p1: [-1.45, 0, 1.4], p2: [1.45, 0, 1.4], cargo: [0, PALLET_Y, 1.4], yaw: 180, yaws: [90, -90] },
  goal: { pos: [13.5, DECK + 1, -17.2], size: [3, 2, 3.4], label: 'DROP-OFF' },
  checkpoints: [{ pos: [0, DECK + 1, -16], size: [4, 2, 3], spawn: { p1: [-1.45, DECK, -15.2], p2: [1.45, DECK, -15.2], cargo: [0, DECK + PALLET_Y, -15.2], yaw: 180, yaws: [90, -90] } }],
  killY: -6,
  parTime: 120,
  objects,
  hints: ['🏗️ Stop the pallet on a crane pad and hold still: a box gets stacked on', 'Every box still standing at the drop-off pays $90. How high dare you go?'],
  tips: [
    { pos: [0, DECK, -12], radius: 2.5, text: 'Up the ramp slowly: towers lean.' },
    { pos: [5.4, DECK, -17.2], radius: 2, text: 'Speed bumps! Lift it over gently.' },
  ],
  variety: { times: ['day', 'sunset'] },
  goals: [{ kind: 'nofalls' }],
};

export default level;
