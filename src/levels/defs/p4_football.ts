import type { LevelObject, Vec3 } from '../types';
import { party } from '../party';

const HX = 10;
const HZ = 6.5;
const M = 2;

const walls: LevelObject[] = [];
const box = (pos: Vec3, size: Vec3, o: Partial<{ visible: boolean; color: number; rot: Vec3 }> = {}): LevelObject => ({ type: 'box', pos, size, color: o.color ?? 0xf3f0e6, visible: o.visible, rot: o.rot, fade: o.visible !== false });
for (const s of [-1, 1]) {
  // the sides
  walls.push(box([0, 0.6, s * (HZ + 0.2)], [HX * 2 + 0.8, 1.2, 0.4]));
  // the ends, either side of the goal
  for (const t of [-1, 1]) walls.push(box([s * (HX + 0.2), 0.6, t * ((M + HZ) / 2)], [0.4, 1.2, HZ - M]));
  // the goal: back, sides, roof (the nets are drawn by the game)
  walls.push(box([s * (HX + 1.7), 1.2, 0], [0.3, 2.4, M * 2 + 0.4], { visible: false }));
  for (const t of [-1, 1]) walls.push(box([s * (HX + 0.85), 1.2, t * (M + 0.15)], [1.7, 2.4, 0.3], { visible: false }));
  walls.push(box([s * (HX + 0.85), 2.45, 0], [1.7, 0.2, M * 2 + 0.4], { visible: false }));
  // over the walls and the crossbar, out of sight: the ball stays in
  walls.push(box([0, 4, s * (HZ + 0.4)], [HX * 2 + 4, 5.6, 0.4], { visible: false }));
  walls.push(box([s * (HX + 0.4), 4.2, 0], [0.4, 3.6, HZ * 2 + 1], { visible: false }));
  // the corners are cut off, so the ball can't get stuck there
  for (const t of [-1, 1]) walls.push(box([s * (HX - 0.55), 0.6, t * (HZ - 0.55)], [2, 1.2, 0.4], { rot: [0, s * t * -45, 0] }));
}

export default party('football', {
  name: 'Mover Football',
  order: 4,
  cameraYaw: 0,
  theme: { skyTop: 0x4f9de8, skyHorizon: 0xe4f2ff },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [HX * 2 + 4, 0.5, HZ * 2 + 1], surface: 'grass', friction: 0.9 },
    // stripes mown into the grass
    ...[-4, -2, 0, 2, 4].map((i): LevelObject => ({ type: 'box', pos: [i * 2, 0.002, 0], size: [2, 0.004, HZ * 2], color: 0x5fae4a, collide: false })),
    ...walls,
    // the stands
    { type: 'box', pos: [0, 0.8, -HZ - 3], size: [HX * 2 + 4, 1.6, 3], color: 0x9aa7b8, collide: false },
    { type: 'box', pos: [0, 1.8, -HZ - 4.5], size: [HX * 2 + 4, 1.6, 2], color: 0x8593a6, collide: false },
    { type: 'sign', pos: [0, 3.6, -HZ - 5], size: [7, 1.2, 0.1], text: 'MOVER FOOTBALL', bg: '#2f7a3f' },
  ],
});
