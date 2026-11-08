import type { LevelObject } from '../types';
import { party, truck } from '../party';
import { KING_BAY } from '../../entities/hazards/party/king';

const HZ = 6.5;
const HX = 14.5;
const fence: LevelObject[] = [];
for (const s of [-1, 1]) {
  fence.push({ type: 'box', pos: [0, 0.5, s * (HZ + 0.2)], size: [HX * 2, 1, 0.4], color: 0x8f9bb0, fade: true });
  fence.push({ type: 'box', pos: [s * (HX + 0.2), 0.5, 0], size: [0.4, 1, HZ * 2 + 0.8], color: 0x8f9bb0 });
}

export default party('king', {
  name: 'King of the Truck',
  order: 3,
  theme: { skyTop: 0x8fc3ff, skyHorizon: 0xfff1d6 },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [HX * 2 + 1, 0.5, HZ * 2 + 1], surface: 'concrete' },
    // where the loot falls
    { type: 'box', pos: [0, 0.006, 0], size: [10.6, 0.012, 9], color: 0xffd23f, collide: false },
    { type: 'box', pos: [0, 0.008, 0], size: [10.2, 0.012, 8.6], color: 0xc9c2b4, collide: false },
    ...fence,
    ...truck(-KING_BAY, -1, 0xff7a3d),
    ...truck(KING_BAY, 1, 0x3d9bff),
    { type: 'sign', pos: [0, 2.6, -HZ - 0.6], size: [6, 1.1, 0.1], text: '👑 KING OF THE TRUCK', bg: '#7a4adb' },
  ],
});
