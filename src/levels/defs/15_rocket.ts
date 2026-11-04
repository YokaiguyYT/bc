import type { LevelDef, LevelObject, Vec3 } from '../types';
import { floor, ramp, railing, wall } from '../helpers';
import { island } from '../props';

/**
 * JOB 15 — Lift Off (a space rocket to the launch pad)
 * The assembly hangar, welders sparking away on both sides (keep the rocket
 * away from the sparks or it heats up, and if it overheats the engine
 * lights!), workers crossing → the cooling fans by the big doors → out
 * across the apron → up the ramp to the launch pad → onto the launch rail.
 * Carried lying down, end to end.
 */
const PAD = 1.6;
const RAIL = 0.25; // the launch rail's height
const RY = 0.38; // the rocket's middle, lying on the floor (it rests on its fins)
const LIE: Vec3 = [-90, 0, 0]; // lying down, nose toward -Z
const STEEL = 0x9aa3ad;

/** A welding bay: the bench throwing sparks, and a stack of parts. */
const bay = (x: number, z: number): LevelObject[] => [
  { type: 'hazard', kind: 'heater', pos: [x, 0, z], rot: [0, x < 0 ? 90 : -90, 0], params: { style: 'welder', radius: 2.4, power: 7 } },
  { type: 'box', pos: [x + Math.sign(x) * 1.2, 0.5, z - 1.1], size: [0.9, 1.0, 0.9], color: 0x5a6270, radius: 0.05 },
  { type: 'box', pos: [x, 0.006, z], size: [2.4, 0.01, 2.4], color: 0xffd23f, collide: false, castShadow: false, radius: 0.003 },
];

const objects: LevelObject[] = [
  ...island([0, 0, -6], [44, 64], 'concrete'),

  // ---- the assembly hangar (x -8..8, z -6..24)
  floor([0, 9], 0.01, [16, 30], 'concrete', { thickness: 0.05, color: 0xc9ced6 }),
  { type: 'box', pos: [0, 0.03, 9], size: [2.0, 0.01, 29], color: 0x3d6fb0, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-8, 0, 24], [8, 0, 24], 1.0, { surface: 'metal', color: 0xdfe6ee }),
  ...wall([-8, 0, -6], [-8, 0, 24], 4, { surface: 'metal', color: 0xdfe6ee, fade: true }),
  ...wall([8, 0, -6], [8, 0, 24], 4, { surface: 'metal', color: 0xdfe6ee, fade: true }),
  ...wall([-8, 0, -6], [8, 0, -6], 4, { surface: 'metal', color: 0xdfe6ee, fade: true, doors: [[0.5, 6.0, 3.6]] }),
  { type: 'sign', pos: [0, 3.7, -6.1], size: [4.6, 0.6, 0.05], text: 'ASSEMBLY HANGAR 1', color: 0x3d6fb0, rot: [0, 180, 0] },
  // where the rocket waits: a painted bay
  { type: 'box', pos: [0, 0.035, 19], size: [3, 0.01, 4.4], color: 0xffd23f, collide: false, castShadow: false, radius: 0.003 },
  { type: 'sign', pos: [0, 1.6, 23.8], size: [2.6, 0.5, 0.05], text: 'ROCKET FF-1', color: 0xd94a3d, rot: [0, 180, 0] },
  // the welders on both sides of the walkway
  ...bay(2.6, 13.0),
  ...bay(-2.6, 8.0),
  ...bay(2.6, 3.0),
  ...bay(-2.6, -1.6),
  { type: 'sign', pos: [-3.4, 1.9, 15.4], size: [2.8, 0.5, 0.06], text: 'SPARKS! KEEP THE ROCKET CLEAR', color: 0xd94a3d, post: true },
  // workers crossing the hangar
  { type: 'hazard', kind: 'pedestrian', pos: [-5.6, 0.02, 10.6], params: { points: [[0, 0, 0], [11.2, 0, 0]], speed: 0.7, color: 0xff7a1a } },
  { type: 'hazard', kind: 'pedestrian', pos: [5.6, 0.02, 0.6], params: { points: [[0, 0, 0], [-11.2, 0, 0]], speed: 0.7, color: 0xff7a1a } },
  // parts racks and a forklift parked along the walls
  { type: 'model', model: 'forklift', pos: [-6.4, 0, 18.6], rot: [0, 90, 0] },
  { type: 'model', model: 'factoryMachine', pos: [6.6, 0, 19.4], rot: [0, -90, 0] },
  { type: 'model', model: 'controlBox', pos: [7.6, 0, 9.4], rot: [0, -90, 0] },
  { type: 'model', model: 'controlBox', pos: [-7.6, 0, 3.6], rot: [0, 90, 0] },
  { type: 'model', model: 'oilBarrel', pos: [-7.2, 0, 13.6] },
  { type: 'model', model: 'oilBarrel', pos: [-6.4, 0, 13.2] },
  { type: 'model', model: 'rocket', pos: [6.2, 0, 15.2], size: [1.0, 2.6, 1.0] },
  // the cooling fans by the doors (cold air: cools a hot rocket down)
  { type: 'hazard', kind: 'heater', pos: [0, 0, -4.2], params: { style: 'none', radius: 3.4, power: -3 } },
  ...[-2.8, 2.8].map((x): LevelObject => ({ type: 'cylinder', pos: [x, 1.6, -5.6], radius: 0.7, height: 0.2, rot: [90, 0, 0], color: 0x8fd3ff, collide: false })),
  { type: 'sign', pos: [3.6, 1.9, -3.4], size: [2.2, 0.5, 0.06], text: 'COOLING FANS', color: 0x3d6fb0, post: true },

  // ---- the apron and the launch pad
  { type: 'box', pos: [0, 0.006, -12], size: [3.6, 0.01, 12], color: 0xffd23f, collide: false, castShadow: false, radius: 0.003 },
  ramp([0, 0, -14.0], [0, PAD, -21.0], 3.6, { surface: 'metal', color: STEEL }),
  ...railing([-1.8, 0, -14.0], [-1.8, PAD, -21.0], { color: 0xffd23f }),
  ...railing([1.8, 0, -14.0], [1.8, PAD, -21.0], { color: 0xffd23f }),
  { type: 'box', pos: [0, PAD / 2, -27], size: [12, PAD, 12], surface: 'concrete', color: 0xb8bec6, radius: 0.1 },
  { type: 'box', pos: [0, PAD + 0.01, -27], size: [6, 0.02, 6], color: 0xffd23f, collide: false, castShadow: false, radius: 0.003 },
  // the launch rail (the rocket lies on it, nose out)
  { type: 'box', pos: [0, PAD + RAIL / 2, -27.2], size: [0.7, RAIL, 2.4], color: 0x5a6270, radius: 0.04 },
  // the gantry tower and a flame trench
  { type: 'box', pos: [4.2, PAD + 4, -27.2], size: [1.4, 8, 1.4], color: 0xd94a3d, radius: 0.05 },
  { type: 'box', pos: [2.8, PAD + 6, -27.2], size: [1.6, 0.25, 0.5], color: STEEL, collide: false },
  { type: 'box', pos: [0, PAD + 0.02, -31.6], size: [5, 0.02, 1.4], color: 0x2b2b33, collide: false, castShadow: false },
  { type: 'sign', pos: [-3.6, PAD + 1.6, -24.2], size: [2.6, 0.5, 0.06], text: 'LAUNCH PAD 39F', color: 0x3d6fb0, post: true },
  // the spaceport round about
  { type: 'model', model: 'waterTower', pos: [-12, 0, -22] },
  { type: 'model', model: 'waterTower', pos: [13, 0, -12] },
  { type: 'model', model: 'controlBox', pos: [-5.0, PAD, -30.6] },
  { type: 'hazard', kind: 'pedestrian', pos: [-4.0, PAD + 0.02, -24.2], params: { points: [[0, 0, 0], [0, 0, -4.4]], speed: 0.4, color: 0xffffff } },
];

const level: LevelDef = {
  id: 'rocket',
  name: 'Lift Off',
  tagline: 'A space rocket to the launch pad. Keep it away from the sparks, or it goes without you.',
  order: 15,
  cargo: 'rocket',
  cameraYaw: 0,
  spawn: { p1: [0, 0, 20.65], p2: [0, 0, 17.35], cargo: [0, RY, 19.0], cargoRot: LIE, yaw: 180, yaws: [180, 0] },
  goal: { pos: [0, PAD + RAIL + 0.45, -27.2], size: [1.4, 1.0, 3.0], label: 'ON THE LAUNCH RAIL' },
  checkpoints: [
    { pos: [0, 1, -8.4], size: [6, 2, 2.4], spawn: { p1: [-4.4, 0, -8.35], p2: [-4.4, 0, -11.65], cargo: [-4.4, RY, -10.0], cargoRot: LIE, yaw: 180, yaws: [180, 0] } },
  ],
  killY: -6,
  parTime: 100,
  variety: { times: ['day', 'sunset', 'night'] },
  goals: [{ kind: 'mint', c: 0.9 }, { kind: 'under', s: 95 }],
  objects,
  hints: ['Carry it end to end. Keep it away from the welders!'],
  tips: [
    { pos: [0, 0, 15.6], radius: 2.2, text: 'Keep to the blue line, clear of the sparks!' },
    { pos: [0, 0, -3.6], radius: 2.2, text: 'The fans cool a hot rocket down.' },
    { pos: [0, 0, -13.0], radius: 2.2, text: 'Up the ramp to the pad, nose first.' },
  ],
  theme: {
    sunDir: [-0.4, 0.8, 0.4],
    skyTop: 0x6aa8e8,
    skyHorizon: 0xf0f2f4,
    fog: 0xeef0f2,
    hemiIntensity: 1.35,
  },
};

export default level;
