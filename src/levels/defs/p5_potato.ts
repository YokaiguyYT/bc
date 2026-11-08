import type { LevelObject } from '../types';
import { party } from '../party';
import { POTATO_HALF as H, POTATO_PILLARS } from '../../entities/hazards/party/potato';

const walls: LevelObject[] = [];
for (const s of [-1, 1]) {
  walls.push({ type: 'box', pos: [0, 0.6, s * (H + 0.25)], size: [H * 2 + 1, 1.2, 0.5], surface: 'brick', fade: true });
  walls.push({ type: 'box', pos: [s * (H + 0.25), 0.6, 0], size: [0.5, 1.2, H * 2], surface: 'brick', fade: true });
}

export default party('potato', {
  name: 'Hot Potato',
  order: 5,
  theme: { skyTop: 0xf3a46b, skyHorizon: 0xffe3c2, sun: 0xffd2a0, fog: 0xffe0c4 },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [H * 2 + 1, 0.5, H * 2 + 1], surface: 'checker' },
    ...walls,
    ...POTATO_PILLARS.map(([x, z]): LevelObject => ({ type: 'cylinder', pos: [x, 0.7, z], radius: 0.7, height: 1.4, color: 0xe86a4a })),
    ...POTATO_PILLARS.map(([x, z]): LevelObject => ({ type: 'cylinder', pos: [x, 1.5, z], radius: 0.8, height: 0.2, color: 0xffd23f, collide: false })),
    { type: 'sign', pos: [0, 2.6, -H - 0.6], size: [5, 1, 0.1], text: 'HOT POTATO', bg: '#e8553a' },
  ],
});
