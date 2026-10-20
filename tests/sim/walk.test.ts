import * as THREE from 'three';
import { makeSim, addStaticBox, addCrate, fmt } from './harness';
import { Player } from '../../src/entities/Player';

const sim = await makeSim();
addStaticBox(sim, [0, -0.5, 0], [50, 0.5, 50]);
const p = new Player(sim, { index: 0, name: 'P1', color: 0xff8844, position: new THREE.Vector3(0, 0, 0), yaw: 0 });
sim.physics.preStep.push((dt) => p.preStep(dt));
sim.physics.postStep.push((dt) => p.postStep(dt));
let knocks = 0;
sim.events.on('knock', () => knocks++);
const run = (sec: number, intent: Partial<typeof p.intent>, label: string) => {
  Object.assign(p.intent, intent);
  const n = Math.round(sec * 120);
  let maxTilt = 0;
  for (let i = 0; i < n; i++) {
    sim.physics.stepOnce();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.bodyQ);
    maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, up.y)) * 57.3);
  }
  const b = p.body;
  const hd = p.parts.head.translation();
  console.log(`${label.padEnd(18)} pos=${fmt(b.translation())} vel=${fmt(b.linvel())} head=${fmt(hd)} grounded=${p.grounded} gd=${p.groundDist.toFixed(2)} state=${p.state} maxTilt=${maxTilt.toFixed(1)} holding=${p.isHolding()}`);
};
run(1.5, {}, 'settle');
run(2, { moveZ: 1 }, 'walk +Z');
run(1, { moveZ: 0 }, 'stop');
run(1.5, { moveX: 1 }, 'walk +X (turn)');
run(0.6, { moveX: 0 }, 'stop');
p.intent.jumpPressed = true;
let maxY = 0;
for (let i = 0; i < 120; i++) { sim.physics.stepOnce(); maxY = Math.max(maxY, p.body.translation().y); }
console.log('jump apex body y', maxY.toFixed(2), 'state', p.state);
run(1, {}, 'after jump');
// grab a crate
const crate = addCrate(sim, [p.body.translation().x, 0.35, p.body.translation().z + 0.9], [0.35, 0.35, 0.35], 12);
p.facingYaw = 0;
run(1.0, { moveZ: 0.01 }, 'face crate');
run(1.5, { grab: true, moveZ: 0.2 }, 'reach+grab');
console.log('crate pos', fmt(crate.translation()), 'hands:', p.hands.map(h => !!h.grip));
run(2, { grab: true, moveZ: -1 }, 'drag back');
console.log('crate pos', fmt(crate.translation()), 'hands:', p.hands.map(h => !!h.grip), 'stretch', p.maxGripStretch().toFixed(2));
run(2, { grab: true, moveZ: 0, moveX: 1 }, 'carry sideways');
console.log('crate pos', fmt(crate.translation()), 'hands:', p.hands.map(h => !!h.grip));
run(1, { grab: false, moveX: 0 }, 'release');
console.log('crate pos', fmt(crate.translation()), 'knocks', knocks);
