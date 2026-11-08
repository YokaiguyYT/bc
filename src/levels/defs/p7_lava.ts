import type { LevelObject } from '../types';
import { party } from '../party';
import { LAVA_N, LAVA_TILE } from '../../entities/hazards/party/lava';

const W = LAVA_N * LAVA_TILE;

export default party('lava', {
  name: 'The Floor is Lava',
  order: 7,
  killY: -6,
  theme: { skyTop: 0x2a1a3a, skyHorizon: 0xb4566a, fog: 0x5a2a3a, fogNear: 30, fogFar: 90, sun: 0xfff0e0, sunIntensity: 2.4, hemiSky: 0xd0d8ff, hemiGround: 0xff7a3a, hemiIntensity: 1.3 },
  objects: [
    // the lava, glowing
    { type: 'box', pos: [0, -2.6, 0], size: [70, 0.4, 70], color: 0xff5a14, collide: false },
    { type: 'box', pos: [0, -2.35, 0], size: [W + 3, 0.2, W + 3], color: 0xffb02a, collide: false },
    // rocks round the edge
    ...[-1, 1].flatMap((s): LevelObject[] => [
      { type: 'box', pos: [0, -1.6, s * (W / 2 + 2.6)], size: [W + 8, 2, 2], color: 0x3b2a2a, collide: false },
      { type: 'box', pos: [s * (W / 2 + 2.6), -1.6, 0], size: [2, 2, W + 3], color: 0x3b2a2a, collide: false },
    ]),
    { type: 'sign', pos: [0, 2.4, -W / 2 - 2.6], size: [6, 1, 0.1], text: 'THE FLOOR IS LAVA', bg: '#a8261a' },
  ],
});
