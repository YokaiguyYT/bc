import type { LevelObject } from '../types';
import { party } from '../party';
import { DODGE_HX as HX, DODGE_HZ as HZ } from '../../entities/hazards/party/dodge';

const walls: LevelObject[] = [];
for (const s of [-1, 1]) {
  walls.push({ type: 'box', pos: [0, 0.6, s * (HZ + 0.25)], size: [HX * 2 + 1, 1.2, 0.5], color: 0xf3f0e6, fade: true, grabbable: false });
  walls.push({ type: 'box', pos: [s * (HX + 0.25), 0.6, 0], size: [0.5, 1.2, HZ * 2], color: 0xf3f0e6, fade: true, grabbable: false });
  // (over the walls, out of sight: the balls stay in)
  walls.push({ type: 'box', pos: [0, 4, s * (HZ + 0.4)], size: [HX * 2 + 2, 5.6, 0.4], visible: false, grabbable: false });
  walls.push({ type: 'box', pos: [s * (HX + 0.4), 4, 0], size: [0.4, 5.6, HZ * 2 + 2], visible: false, grabbable: false });
}

export default party('dodge', {
  name: 'Dodgeball',
  order: 9,
  theme: { skyTop: 0x4f9de8, skyHorizon: 0xe4f2ff },
  spawn: { p1: [-5.6, 0, 0], p2: [5.6, 0, 0] },
  objects: [
    // a gym floor, a half each
    { type: 'box', pos: [0, -0.25, 0], size: [HX * 2 + 1, 0.5, HZ * 2 + 1], surface: 'woodLight' },
    { type: 'box', pos: [-HX / 2, 0.003, 0], size: [HX - 0.3, 0.006, HZ * 2 - 0.6], color: 0xffb08a, collide: false, castShadow: false },
    { type: 'box', pos: [HX / 2, 0.003, 0], size: [HX - 0.3, 0.006, HZ * 2 - 0.6], color: 0x9ccbf5, collide: false, castShadow: false },
    { type: 'box', pos: [0, 0.005, 0], size: [0.2, 0.01, HZ * 2], color: 0xffffff, collide: false, castShadow: false },
    ...walls,
    // benches and a banner
    { type: 'box', pos: [0, 0.5, -HZ - 2], size: [HX * 2, 1, 1.6], color: 0x9aa7b8, collide: false },
    { type: 'box', pos: [0, 1.2, -HZ - 3.2], size: [HX * 2, 1.2, 1.2], color: 0x8593a6, collide: false },
    { type: 'sign', pos: [0, 3.2, -HZ - 3.6], size: [6, 1.1, 0.1], text: 'DODGEBALL', bg: '#d94a3a' },
  ],
});
