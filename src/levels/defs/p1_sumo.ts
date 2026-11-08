import { party } from '../party';

export default party('sumo', {
  name: 'Belly-Bump Sumo',
  order: 1,
  theme: { skyTop: 0x5aa8f0, skyHorizon: 0xd8f0ff, fog: 0xcfe8fb, fogNear: 30, fogFar: 110 },
  killY: -7,
  params: { target: 3 },
  objects: [
    // the pool round the ring
    { type: 'box', pos: [0, -3.2, 0], size: [70, 0.4, 70], color: 0x1f6fb8, collide: false },
    // stands at the back, and a banner
    { type: 'box', pos: [-9, -1.6, -10], size: [6, 3, 2.5], color: 0xe0c08a, collide: false },
    { type: 'box', pos: [-9, -0.4, -11.6], size: [6, 3, 1.4], color: 0xc9a46a, collide: false },
    { type: 'box', pos: [9, -1.6, -10], size: [6, 3, 2.5], color: 0xe0c08a, collide: false },
    { type: 'box', pos: [9, -0.4, -11.6], size: [6, 3, 1.4], color: 0xc9a46a, collide: false },
    { type: 'sign', pos: [0, 2.6, -11], size: [6.5, 1.1, 0.1], text: 'BELLY-BUMP SUMO', bg: '#d94a3a' },
  ],
});
