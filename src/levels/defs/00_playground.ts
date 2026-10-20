import type { LevelDef } from '../types';
import { ramp, stairs } from '../helpers';

/** Dev/practice yard: flat floor, a ramp, steps, some boxes and the crate. */
const level: LevelDef = {
  id: 'playground',
  name: 'Practice Yard',
  tagline: 'Learn to lift without dropping things. In theory.',
  order: 0,
  cargo: 'crate',
  cameraYaw: 0,
  spawn: { p1: [-1.2, 0, 4], p2: [1.2, 0, 4], cargo: [0, 0.4, 2], yaw: 180 },
  goal: { pos: [0, 3.2, -15.2], size: [5, 2, 4], label: 'DROP-OFF' },
  checkpoints: [],
  killY: -8,
  parTime: 60,
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [16, 0.5, 14], surface: 'concrete' },
    // ramp up to a platform
    ramp([0, 0, -6.9], [0, 2.2, -12], 5, { surface: 'wood' }),
    { type: 'box', pos: [0, 1.95, -15], size: [8, 0.5, 6], surface: 'wood' },
    // steps on the side
    ...stairs([5.5, 0, -1.5], 180, 5, 0.18, 0.45, 3, { surface: 'tiles' }),
    { type: 'box', pos: [5.5, 0.45, -5.2], size: [3, 0.9, 2], surface: 'tiles' },
    // props to knock about
    { type: 'box', pos: [-4, 0.3, 1], size: [0.6, 0.6, 0.6], surface: 'cardboard', dynamic: { mass: 4 } },
    { type: 'box', pos: [-4.2, 0.9, 1.1], size: [0.5, 0.5, 0.5], surface: 'cardboard', dynamic: { mass: 3 } },
    { type: 'box', pos: [-5, 0.3, -1], size: [0.7, 0.6, 0.5], surface: 'cardboard', dynamic: { mass: 4 } },
    { type: 'cylinder', pos: [3, 0.45, 2], radius: 0.3, height: 0.9, color: 0xe9554b, dynamic: { mass: 8 } },
    // a low wall to climb
    { type: 'box', pos: [-5.5, 0.6, -6], size: [3, 1.2, 0.5], surface: 'brick' },
    { type: 'sign', pos: [3.2, 3.6, -15.5], size: [2.6, 0.8, 0.08], text: 'DROP-OFF', color: 0x2f7a5b, post: true },
  ],
  hints: ['Hold GRAB near the crate to latch on', 'Both grab it to lift heavy things'],
  hidden: true,
};

export default level;
