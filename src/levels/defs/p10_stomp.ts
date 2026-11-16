import type { LevelObject } from '../types';
import { party } from '../party';
import { STOMP_BLOCKS, STOMP_HALF as H } from '../../entities/hazards/party/stomp';

const walls: LevelObject[] = [];
for (const s of [-1, 1]) {
  // a bouncy-castle wall: fat and round
  walls.push({ type: 'box', pos: [0, 0.7, s * (H + 0.35)], size: [H * 2 + 1.4, 1.4, 0.7], color: s < 0 ? 0xff7fa8 : 0x58c7c2, radius: 0.3, fade: true, grabbable: false });
  walls.push({ type: 'box', pos: [s * (H + 0.35), 0.7, 0], size: [0.7, 1.4, H * 2], color: s < 0 ? 0xffd23f : 0x9b7fe8, radius: 0.3, fade: true, grabbable: false });
  // (over the walls, out of sight: springy boots or not, nobody leaves)
  walls.push({ type: 'box', pos: [0, 4.4, s * (H + 0.5)], size: [H * 2 + 2, 6, 0.4], visible: false, grabbable: false });
  walls.push({ type: 'box', pos: [s * (H + 0.5), 4.4, 0], size: [0.4, 6, H * 2 + 2], visible: false, grabbable: false });
}
const tiles: LevelObject[] = [];
for (let i = -3; i <= 3; i++)
  for (let j = -3; j <= 3; j++)
    if ((i + j) % 2 === 0) tiles.push({ type: 'box', pos: [i * 1.9, 0.003, j * 1.9], size: [1.9, 0.006, 1.9], color: 0xfff1c9, collide: false, castShadow: false });

export default party('stomp', {
  name: 'Balloon Stomp',
  order: 10,
  theme: { skyTop: 0x6fb6f2, skyHorizon: 0xfff0d8, fog: 0xf7ead6 },
  spawn: { p1: [-4.6, 0, 0], p2: [4.6, 0, 0] },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [H * 2 + 1.4, 0.5, H * 2 + 1.4], color: 0xffe3a3 },
    ...tiles,
    ...walls,
    // soft blocks to jump off
    ...STOMP_BLOCKS.map(([x, z, hw, hd, h], i): LevelObject => ({ type: 'box', pos: [x, h / 2, z], size: [hw * 2, h, hd * 2], color: [0xff7fa8, 0x58c7c2, 0x9b7fe8, 0xffa24f][i % 4], radius: 0.12, grabbable: false })),
    { type: 'sign', pos: [0, 3, -H - 1], size: [6, 1.1, 0.1], text: 'BALLOON STOMP', bg: '#e8559a' },
  ],
});
