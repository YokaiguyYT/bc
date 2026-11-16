import type { LevelObject } from '../types';
import { party } from '../party';
import { KEEP_BLOCKS, KEEP_HX as HX, KEEP_HZ as HZ } from '../../entities/hazards/party/keep';

const walls: LevelObject[] = [];
for (const s of [-1, 1]) {
  // (hands slide off the walls too: with grab held down to take the parcel, nobody means the wall)
  walls.push({ type: 'box', pos: [0, 0.7, s * (HZ + 0.25)], size: [HX * 2 + 1, 1.4, 0.5], surface: 'brick', fade: true, grabbable: false });
  walls.push({ type: 'box', pos: [s * (HX + 0.25), 0.7, 0], size: [0.5, 1.4, HZ * 2], surface: 'brick', fade: true, grabbable: false });
  // (over the walls, out of sight: the parcel stays in)
  walls.push({ type: 'box', pos: [0, 3.4, s * (HZ + 0.4)], size: [HX * 2 + 2, 4, 0.4], visible: false, grabbable: false });
  walls.push({ type: 'box', pos: [s * (HX + 0.4), 3.4, 0], size: [0.4, 4, HZ * 2 + 2], visible: false, grabbable: false });
}

export default party('keep', {
  name: 'Keep-Away',
  order: 8,
  theme: { skyTop: 0x6f7fd8, skyHorizon: 0xffd9c2, sun: 0xffe0b8, fog: 0xf6dccb },
  spawn: { p1: [-5.5, 0, 0], p2: [5.5, 0, 0] },
  params: { need: 20 },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [HX * 2 + 1, 0.5, HZ * 2 + 1], surface: 'concrete', color: 0xcfc6b8 },
    // a loading-yard cross painted on the floor
    { type: 'box', pos: [0, 0.003, 0], size: [HX * 2 - 1, 0.006, 0.18], color: 0xffd23f, collide: false, castShadow: false },
    { type: 'box', pos: [0, 0.003, 0], size: [0.18, 0.006, HZ * 2 - 1], color: 0xffd23f, collide: false, castShadow: false },
    ...walls,
    // stacks of crates to dodge round (hands slide off them: it's the parcel you're after)
    ...KEEP_BLOCKS.map(([x, z, hw, hd, h], i): LevelObject => ({ type: 'box', pos: [x, h / 2, z], size: [hw * 2, h, hd * 2], surface: i % 2 ? 'cardboard' : 'wood', grabbable: false })),
    { type: 'sign', pos: [0, 2.8, -HZ - 0.6], size: [5.2, 1, 0.1], text: 'KEEP-AWAY', bg: '#c98a1e' },
  ],
});
