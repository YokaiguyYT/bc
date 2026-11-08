import type { LevelDef, LevelObject, SpawnSet } from './types';
import type { Theme } from '../render/Renderer';

/**
 * A party game's arena as a (hidden) level: the floor and the scenery here,
 * the game itself as the one 'party' hazard. The online guest builds it by
 * its id like any other job.
 */
export function party(
  mode: string,
  o: {
    name: string;
    order: number;
    objects: LevelObject[];
    theme?: Partial<Theme>;
    cameraYaw?: number;
    killY?: number;
    spawn?: Partial<SpawnSet>;
    params?: Record<string, unknown>;
  },
): LevelDef {
  return {
    id: `party-${mode}`,
    name: o.name,
    tagline: '',
    order: 200 + o.order,
    cargo: 'crate',
    theme: o.theme,
    cameraYaw: o.cameraYaw ?? 0,
    spawn: { p1: [-2, 0, 0], p2: [2, 0, 0], cargo: [0, -300, 0], yaw: 0, yaws: [90, -90], ...(o.spawn ?? {}) },
    goal: { pos: [0, -300, 0], size: [1, 1, 1] },
    checkpoints: [],
    killY: o.killY ?? -8,
    parTime: 999,
    objects: [...o.objects, { type: 'hazard', kind: 'party', pos: [0, 0, 0], params: { mode, ...(o.params ?? {}) } }],
    hidden: true,
    party: mode,
  };
}

/**
 * A box van parked with its back open to the middle: its load bed is the floor
 * there (the game paints it in the owner's colour). `x0` is the open end, `s`
 * which way the van goes from it (-1 left, +1 right).
 */
export function truck(x0: number, s: -1 | 1, color: number, L = 4, W = 3, H = 2.6): LevelObject[] {
  const cx = x0 + (s * L) / 2;
  const wheel = (x: number, z: number): LevelObject => ({ type: 'cylinder', pos: [x, 0.42, z], rot: [90, 0, 0], radius: 0.42, height: 0.3, color: 0x2a2a30, collide: false });
  return [
    // the box: sides, front, roof
    { type: 'box', pos: [cx, H / 2, W / 2 + 0.1], size: [L, H, 0.2], color: 0xf4f1ea, fade: true },
    { type: 'box', pos: [cx, H / 2, -W / 2 - 0.1], size: [L, H, 0.2], color: 0xf4f1ea, fade: true },
    { type: 'box', pos: [x0 + s * (L + 0.1), H / 2, 0], size: [0.2, H, W + 0.4], color: 0xf4f1ea },
    { type: 'box', pos: [cx, H + 0.1, 0], size: [L + 0.2, 0.2, W + 0.4], color: 0xe6e1d6, fade: true },
    // a stripe down each side, in the team's colour
    { type: 'box', pos: [cx, 1.2, W / 2 + 0.21], size: [L, 0.35, 0.02], color, collide: false },
    { type: 'box', pos: [cx, 1.2, -W / 2 - 0.21], size: [L, 0.35, 0.02], color, collide: false },
    // the cab
    { type: 'box', pos: [x0 + s * (L + 1.3), 1.05, 0], size: [2, 2.1, W], color },
    { type: 'box', pos: [x0 + s * (L + 2.31), 1.35, 0], size: [0.04, 0.8, W - 0.5], color: 0x9fd0f0, collide: false },
    wheel(x0 + s * (L + 1.3), W / 2 + 0.1),
    wheel(x0 + s * (L + 1.3), -W / 2 - 0.1),
    wheel(x0 + s * 0.7, W / 2 + 0.25),
    wheel(x0 + s * 0.7, -W / 2 - 0.25),
  ];
}
