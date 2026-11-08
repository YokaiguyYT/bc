import type { LevelObject } from '../types';
import { party } from '../party';
import { PAINT_N } from '../../entities/hazards/party/paint';

const H = PAINT_N / 2;
const walls: LevelObject[] = [];
for (const s of [-1, 1]) {
  walls.push({ type: 'box', pos: [0, 0.4, s * (H + 0.25)], size: [PAINT_N + 1, 0.8, 0.5], color: 0xffffff, fade: true });
  walls.push({ type: 'box', pos: [s * (H + 0.25), 0.4, 0], size: [0.5, 0.8, PAINT_N], color: 0xffffff, fade: true });
}

export default party('paint', {
  name: 'Paint the Floor',
  order: 6,
  theme: { skyTop: 0x7fc4ff, skyHorizon: 0xfff2e0 },
  objects: [
    { type: 'box', pos: [0, -0.25, 0], size: [PAINT_N + 1, 0.5, PAINT_N + 1], color: 0xb9b2a6 },
    ...walls,
    // spilt paint pots round the outside, for the look of it
    ...[[-H - 1.4, -H + 1, 0xff5a4f], [H + 1.4, H - 2, 0x3d9bff], [-H + 3, H + 1.4, 0xffd23f], [H - 3, -H - 1.4, 0x52d39a]].map(
      ([x, z, c]): LevelObject => ({ type: 'cylinder', pos: [x, 0.3, z], radius: 0.35, height: 0.6, color: c }),
    ),
    { type: 'sign', pos: [0, 2.2, -H - 0.8], size: [5.5, 1, 0.1], text: 'PAINT THE FLOOR', bg: '#7a4adb' },
  ],
});
