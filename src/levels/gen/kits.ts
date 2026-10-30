import type { CargoKind, LevelObject, Surface, Vec3 } from '../types';
import type { Theme } from '../../render/Renderer';
import { UprightPiano } from '../../entities/cargo/UprightPiano';

/**
 * How each cargo starts (and restarts at checkpoints) in a generated job, and
 * what kind of course it can take. The stands and heights are the ones the
 * hand-made jobs use, which the pickup test checks for every cargo.
 */
export interface CargoKit {
  /** Under the cargo where it waits (stand, rack, pedestal), in local coordinates around (0, 0, 0). */
  stand: () => LevelObject[];
  /** Cargo centre height above the floor. */
  y: number;
  /** Cargo turn (local degrees), or a full [tilt, turn, roll] (turn local). */
  yaw?: number;
  rot?: Vec3;
  /** Where the two movers stand, local [x, z] relative to the cargo. */
  movers: [[number, number], [number, number]];
  /** The bot's carrying formation in the open, and through tight spots. */
  form: 'broad' | 'inline';
  tight: 'broad' | 'inline';
  /** Bot: how close either side of the load movers stay [min, max] (small loads want them close). */
  broad?: [number, number];
  /** Stairs are fine (not for things that slosh, roll, or tip over); 'down' only for long loads. */
  stairs: 'both' | 'down' | false;
  /** Steepest ramp (degrees). */
  maxSlope: number;
  /** Door gap it needs (m): the load plus the two movers walking beside it. */
  door: number;
  /** The test bot's grab setup (see deliver.mjs `setup`): on its back end to end, or a wider grip. */
  bot?: { lying?: boolean; half?: number };
}

const cakeStand = (): LevelObject[] => [
  { type: 'cylinder', pos: [0, 0.025, 0], radius: 0.34, height: 0.05, color: 0xfbfaf6, segments: 28 },
  { type: 'cylinder', pos: [0, 0.4, 0], radius: 0.13, height: 0.74, color: 0xfbfaf6, segments: 20 },
  { type: 'cylinder', pos: [0, 0.77, 0], radius: 0.27, height: 0.06, color: 0xffd6e0, segments: 28 },
];

const carvingStand = (): LevelObject[] => [
  { type: 'cylinder', pos: [0, 0.25, 0], radius: 0.2, height: 0.5, color: 0x8a5a36, segments: 16 },
  { type: 'cylinder', pos: [0, 0.03, 0], radius: 0.34, height: 0.06, color: 0x6e4a2c, segments: 20 },
];

const pedestal = (): LevelObject[] => [
  { type: 'cylinder', pos: [0, 0.19, 0], radius: 0.2, height: 0.38, color: 0x5b3a22, segments: 18 },
  { type: 'box', pos: [0, 0.4, 0], size: [0.44, 0.04, 0.44], color: 0x3b2616, radius: 0.012 },
  { type: 'cylinder', pos: [0, 0.02, 0], radius: 0.36, height: 0.04, color: 0x3b2616, segments: 20 },
  ...Array.from({ length: 11 }, (_, i): LevelObject => {
    const a = (i / 11) * Math.PI * 2;
    return { type: 'ball', pos: [Math.cos(a) * 0.28, 0.46, Math.sin(a) * 0.28], radius: 0.06, color: i % 2 ? 0xd9b25a : 0xc99a3f };
  }),
];

/** A padded glazier's rack: the pane stands on the board and leans back on the bar (+Z). */
const glassRack = (): LevelObject[] => [
  { type: 'box', pos: [0, 0.06, 0], size: [2.6, 0.12, 0.8], surface: 'wood', color: 0x8a5a36 },
  { type: 'box', pos: [0, 0.135, -0.14], size: [2.0, 0.03, 0.03], color: 0x2a2a30, radius: 0.01 },
  { type: 'box', pos: [-1.08, 0.6, 0.12], size: [0.08, 0.96, 0.08], color: 0x8a5a36, radius: 0.035, grabbable: false },
  { type: 'box', pos: [1.08, 0.6, 0.12], size: [0.08, 0.96, 0.08], color: 0x8a5a36, radius: 0.035, grabbable: false },
  { type: 'box', pos: [0, 1.0, 0.104], size: [2.3, 0.06, 0.06], color: 0x3d6fb0, radius: 0.028, grabbable: false, friction: 0.05 },
];

const floor = (): LevelObject[] => [];

export const KITS: Partial<Record<CargoKind, CargoKit>> = {
  crate: { stand: floor, y: 0.4, movers: [[-1.0, 0], [1.0, 0]], form: 'broad', tight: 'broad', stairs: 'both', maxSlope: 12, door: 2.9 },
  tv: { stand: floor, y: 0.45, movers: [[-0.9, 0], [0.9, 0]], form: 'broad', tight: 'inline', stairs: 'both', maxSlope: 11, door: 2.6 },
  aquarium: { stand: floor, y: 0.3, movers: [[-1.1, 0], [1.1, 0]], form: 'broad', tight: 'broad', stairs: false, maxSlope: 7, door: 3.6 },
  clock: { stand: floor, y: 0.21, rot: [-90, 0, 0], movers: [[0, 1.65], [0, -1.65]], form: 'inline', tight: 'inline', stairs: false, maxSlope: 11, door: 2.4, bot: { lying: true } },
  glass: { stand: glassRack, y: 0.73, rot: [8, 0, 0], movers: [[-1.4, -0.05], [1.4, -0.05]], form: 'broad', tight: 'broad', stairs: false, maxSlope: 10, door: 3.8 },
  cake: { stand: cakeStand, y: 0.83, movers: [[-1.05, 0], [1.05, 0]], form: 'broad', tight: 'broad', stairs: false, maxSlope: 8, door: 3.4 },
  swan: { stand: carvingStand, y: 0.5 + 0.11 + 0.02, movers: [[-1.05, 0], [1.05, 0]], form: 'broad', tight: 'broad', stairs: false, maxSlope: 9, door: 3.4 },
  egg: { stand: pedestal, y: 0.42 + 0.387 + 0.02, movers: [[-1.0, 0], [1.0, 0]], form: 'broad', tight: 'broad', broad: [0.62, 0.72], stairs: false, maxSlope: 9, door: 3.4 },
  piano: { stand: floor, y: UprightPiano.rideHeight, yaw: 180, movers: [[-1.35, 0], [1.35, 0]], form: 'broad', tight: 'broad', broad: [1.15, 1.35], stairs: false, maxSlope: 5, door: 4.0, bot: { half: 1.3 } },
};

/** Cargo a random job can pick. */
export const GEN_CARGO = Object.keys(KITS).filter((k) => k !== 'crate') as CargoKind[];

// ---------------------------------------------------------------- looks

export interface GenTheme {
  name: string;
  sky: Partial<Theme>;
  path: { surface: Surface; color?: number };
  verge: { surface: Surface; color?: number };
  /** Underside of the floating ground. */
  dirt: number;
  edge: 'kerb' | 'rail' | 'hedge';
  edgeColor: number;
  wall: { surface: Surface; color?: number };
  /** Things to dot along the sides (model, weight, optional size and a smaller collider, e.g. a tree's trunk). */
  decor: { model: string; w: number; size?: Vec3; collider?: Vec3 }[];
  /** Words for job names. */
  places: string[];
}

export const THEMES: GenTheme[] = [
  {
    name: 'docks',
    sky: { sunDir: [0.4, 0.85, 0.35], skyTop: 0x5e9bd8, skyHorizon: 0xdbe8f2 },
    path: { surface: 'concrete', color: 0xc8c4bc },
    verge: { surface: 'asphalt', color: 0x6c6f75 },
    dirt: 0x5b5148,
    edge: 'rail',
    edgeColor: 0xf2b134,
    wall: { surface: 'brick', color: 0x9a5a44 },
    decor: [
      { model: 'pallet', w: 3 },
      { model: 'forklift', w: 1 },
      { model: 'barrier', w: 2 },
      { model: 'dumpster', w: 1 },
      { model: 'cone', w: 3 },
          ],
    places: ['Pier 9', 'the Docks', 'Warehouse Row', 'Container Yard', 'the Loading Bay'],
  },
  {
    name: 'suburb',
    sky: { sunDir: [0.5, 0.9, 0.25] },
    path: { surface: 'concrete', color: 0xd9d4cc },
    verge: { surface: 'grass' },
    dirt: 0x7a5a3a,
    edge: 'hedge',
    edgeColor: 0x3f7f3a,
    wall: { surface: 'plaster', color: 0xf0e6d6 },
    decor: [
      { model: 'tree', w: 3, size: [3, 4.5, 3], collider: [0.5, 4, 0.5] },
      { model: 'mailbox', w: 2 },
      { model: 'hydrant', w: 2 },
      { model: 'flowerPot', w: 2 },
      { model: 'streetLamp', w: 1.5, collider: [0.3, 4.5, 0.3] },
      { model: 'trashCan', w: 1.5 },
      { model: 'bicycle', w: 1 },
    ],
    places: ['Maple Close', 'Elm Street', 'Sunnyside', 'Cul-de-Sac 4', 'Acacia Avenue'],
  },
  {
    name: 'park',
    sky: { sunDir: [0.3, 0.9, 0.4], skyTop: 0x62a8f0, skyHorizon: 0xe3f0fa },
    path: { surface: 'woodLight' },
    verge: { surface: 'grass' },
    dirt: 0x7a5a3a,
    edge: 'kerb',
    edgeColor: 0xd9d4cc,
    wall: { surface: 'woodDark' },
    decor: [
      { model: 'tree', w: 4, size: [3.4, 5, 3.4], collider: [0.5, 4.5, 0.5] },
      { model: 'bench', w: 2 },
      { model: 'parasol', w: 1, collider: [0.25, 2.4, 0.25] },
      { model: 'gardenTable', w: 1 },
      { model: 'hotdogCart', w: 0.6 },
      { model: 'plant', w: 2 },
    ],
    places: ['Central Park', 'the Boardwalk', 'Duck Pond Lane', 'the Botanic Garden', 'Picnic Hill'],
  },
  {
    name: 'snow',
    sky: { sunDir: [-0.4, 0.85, 0.35], skyTop: 0x7aa6e0, skyHorizon: 0xe8e4f0, fog: 0xe4e0ec },
    path: { surface: 'concrete', color: 0xe2eaf3 },
    verge: { surface: 'snow' },
    dirt: 0x8d8a96,
    edge: 'kerb',
    edgeColor: 0xf2f5fa,
    wall: { surface: 'woodDark' },
    decor: [
      { model: 'snowyPine', w: 5, size: [2.6, 3.6, 2.6], collider: [0.5, 3.6, 0.5] },
      { model: 'snowman', w: 1.5 },
      { model: 'streetLamp', w: 1, collider: [0.3, 4.5, 0.3] },
    ],
    places: ['Frostbite Pass', 'the Ski Lodge', 'Pine Ridge', 'Snowdrift Lane', 'the Ice Rink'],
  },
  {
    name: 'office',
    sky: { sunDir: [0.55, 0.8, 0.3], skyHorizon: 0xf3e6d6, fog: 0xefe2d2, hemiGround: 0xcfae8c },
    path: { surface: 'carpet', color: 0x7f8fb0 },
    verge: { surface: 'tiles', color: 0xe8e2d6 },
    dirt: 0x6c6258,
    edge: 'rail',
    edgeColor: 0xb8bcc6,
    wall: { surface: 'wallpaper', color: 0xd8cfc0 },
    decor: [
      { model: 'desk', w: 2 },
      { model: 'officeChair', w: 2 },
      { model: 'waterCooler', w: 1.5 },
      { model: 'plant', w: 2 },
      { model: 'vendingMachine', w: 1 },
      { model: 'bookshelf', w: 1 },
      { model: 'coatRack', w: 1 },
    ],
    places: ['Floor 37', 'Megacorp HQ', 'the Open-Plan Office', 'Accounts', 'the Boardroom'],
  },
  {
    name: 'sky',
    sky: { sunDir: [0.35, 0.85, 0.45], skyTop: 0x4f8fe0, skyHorizon: 0xf0e2ef, fog: 0xeadcea },
    path: { surface: 'wood' },
    verge: { surface: 'grass', color: 0x7fc46a },
    dirt: 0x8a6a4a,
    edge: 'rail',
    edgeColor: 0xfbfaf6,
    wall: { surface: 'wood' },
    decor: [
      { model: 'tree', w: 2, size: [2.6, 3.6, 2.6], collider: [0.5, 3.2, 0.5] },
      { model: 'plantSmall', w: 3 },
      { model: 'parasol', w: 1, collider: [0.25, 2.4, 0.25] },
      { model: 'flowerPot', w: 2 },
    ],
    places: ['Cloud Nine', 'the Floating Isles', 'Sky Harbour', 'Above the Clouds', 'the High Road'],
  },
];
