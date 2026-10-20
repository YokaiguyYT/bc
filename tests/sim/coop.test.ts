import * as THREE from 'three';
import { makeSim, addStaticBox, addCrate, fmt } from './harness';
import { Player } from '../../src/entities/Player';

const sim = await makeSim();
addStaticBox(sim, [0, -0.5, 0], [60, 0.5, 60]);
const p1 = new Player(sim, { index: 0, name: 'P1', color: 0xff8844, position: new THREE.Vector3(0, 0, -1.25), yaw: 0 });
const p2 = new Player(sim, { index: 1, name: 'P2', color: 0x4488ff, position: new THREE.Vector3(0, 0, 1.25), yaw: Math.PI });
for (const p of [p1, p2]) { sim.physics.preStep.push((dt) => p.preStep(dt)); sim.physics.postStep.push((dt) => p.postStep(dt)); }
const crate = addCrate(sim, [0, 0.45, 0], [0.3, 0.3, 0.6], 25);
let knocks = 0; sim.events.on('knock', (e) => { knocks++; console.log('  KNOCK p', e.player, e.strength.toFixed(1)); });
let slips = 0; sim.events.on('slip', () => slips++);
const tilt = (b: any) => { const r = b.rotation(); const up = new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(r.x,r.y,r.z,r.w)); return Math.acos(Math.min(1, up.y))*57.3; };
const run = (sec: number, i1: any, i2: any, label: string) => {
  Object.assign(p1.intent, i1); Object.assign(p2.intent, i2);
  let maxCT = 0, minY = 9, maxY = 0, maxS = 0;
  const t0 = performance.now();
  const n = Math.round(sec * 120);
  for (let i = 0; i < n; i++) { sim.physics.stepOnce(); const y = crate.translation().y; minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxCT = Math.max(maxCT, tilt(crate)); maxS = Math.max(maxS, p1.maxGripStretch(), p2.maxGripStretch()); }
  const ms = (performance.now() - t0) / n;
  console.log(`${label.padEnd(22)} crate=${fmt(crate.translation())} v=${fmt(crate.linvel())} y[${minY.toFixed(2)},${maxY.toFixed(2)}] tilt<=${maxCT.toFixed(0)} p1=${fmt(p1.body.translation())} p2=${fmt(p2.body.translation())} grips=${p1.hands.map(h=>+!!h.grip).join('')}/${p2.hands.map(h=>+!!h.grip).join('')} str<=${maxS.toFixed(2)} yaw=${(new THREE.Euler().setFromQuaternion(new THREE.Quaternion(crate.rotation().x,crate.rotation().y,crate.rotation().z,crate.rotation().w),'YXZ').y*57.3).toFixed(0)} ${ms.toFixed(2)}ms/step`);
};
run(1, {}, {}, 'settle');
run(1.2, { grab: true, moveZ: 0.15 }, { grab: true, moveZ: -0.15 }, 'both grab');
run(1.2, { grab: true, moveZ: 0 }, { grab: true, moveZ: 0 }, 'lift');
run(3, { grab: true, moveX: 1 }, { grab: true, moveX: 1 }, 'strafe +X together');
run(1, { grab: true, moveX: 0 }, { grab: true, moveX: 0 }, 'stop');
run(2.5, { grab: true, moveZ: 1 }, { grab: true, moveZ: 1 }, 'walk +Z (p2 fwd)');
run(1, { grab: true, moveZ: 0 }, { grab: true, moveZ: 0 }, 'stop');
run(2.5, { grab: true, moveX: 0.5 }, { grab: true, moveX: -0.5 }, 'rotate slow');
run(1, { grab: true, moveX: 0 }, { grab: true, moveX: 0 }, 'stop');
run(2, { grab: true, moveX: 1 }, { grab: true, moveX: -1 }, 'rotate (opposite)');
run(1, { grab: true, moveX: 0 }, { grab: true, moveX: 0 }, 'stop');
run(1.5, { grab: true }, { grab: false }, 'p2 lets go');
run(2.5, { grab: true, moveX: -1 }, { grab: false }, 'p1 alone drag -X');
console.log('knocks', knocks, 'slips', slips);
