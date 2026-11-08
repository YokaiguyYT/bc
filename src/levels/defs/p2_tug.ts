import type { LevelObject } from '../types';
import { party, truck } from '../party';
import { TUG_BAY } from '../../entities/hazards/party/tug';

const HZ = 5;
const HX = 15.5;
const fence: LevelObject[] = [];
for (const s of [-1, 1]) {
  fence.push({ type: 'box', pos: [0, 0.4, s * (HZ + 0.2)], size: [HX * 2, 0.8, 0.4], color: 0xd9c79e, fade: true });
  fence.push({ type: 'box', pos: [s * (HX + 0.2), 0.4, 0], size: [0.4, 0.8, HZ * 2 + 0.8], color: 0xd9c79e });
}

export default party('tug', {
  name: 'Tug of War',
  order: 2,
  theme: { skyTop: 0x6fb2f5, skyHorizon: 0xf6e6c8 },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [HX * 2 + 1, 0.5, HZ * 2 + 1], surface: 'asphalt' },
    // the middle line
    { type: 'box', pos: [0, 0.006, 0], size: [0.18, 0.012, HZ * 2], color: 0xffffff, collide: false },
    ...[-1, 1].map((s): LevelObject => ({ type: 'box', pos: [s * 1.5, 0.006, 0], size: [0.08, 0.012, HZ * 2], color: 0xffe14a, collide: false })),
    ...fence,
    ...truck(-TUG_BAY, -1, 0xff7a3d),
    ...truck(TUG_BAY, 1, 0x3d9bff),
    { type: 'sign', pos: [0, 2.4, -HZ - 0.6], size: [5, 1, 0.1], text: 'TUG OF WAR', bg: '#c2413b' },
  ],
});
