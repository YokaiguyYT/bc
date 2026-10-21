import GUI from 'lil-gui';
import { tuning, resetTuning } from '../config/tuning';
import type { Game } from '../game/Game';

/**
 * Backquote (`) toggles this. Every slider writes straight into `tuning`, which
 * the physics reads every step, so changes are live.
 */
export class DevPanel {
  private gui: GUI;
  private visible = true;

  constructor(private game: Game) {
    this.gui = new GUI({ title: 'Fragile Freight · tuning (` to hide)', width: 330 });
    const T = tuning;
    const f = (name: string, open = false) => {
      const folder = this.gui.addFolder(name);
      if (!open) folder.close();
      return folder;
    };

    const bal = f('Balance (wobbliness)', true);
    bal.add(T.balance, 'uprightK', 20, 500, 1).name('upright stiffness');
    bal.add(T.balance, 'uprightC', 1, 60, 0.5).name('upright damping');
    bal.add(T.balance, 'maxTorque', 50, 1500, 10).name('balance strength');
    bal.add(T.balance, 'yawK', 10, 300, 1).name('turn stiffness');
    bal.add(T.balance, 'yawC', 1, 40, 0.5).name('turn damping');
    bal.add(T.balance, 'waddle', 0, 0.3, 0.005).name('waddle');
    bal.add(T.balance, 'accelLean', 0, 0.08, 0.001).name('lean into accel');
    bal.add(T.balance, 'fallAngle', 30, 90, 1).name('fall-over angle');

    const grip = f('Grip', true);
    grip.add(T.grip, 'handForce', 20, 400, 1).name('grip strength (N/hand)');
    grip.add(T.grip, 'springK', 10, 250, 1).name('grip stiffness');
    grip.add(T.grip, 'springC', 1, 40, 0.5).name('grip damping');
    grip.add(T.grip, 'ledgeForce', 100, 900, 5).name('ledge grip (N/hand)');
    grip.add(T.grip, 'slipStretch', 0.2, 1.5, 0.01).name('slip stretch (m)');
    grip.add(T.grip, 'slipTime', 0.05, 2, 0.01).name('slip time (s)');
    grip.add(T.grip, 'carryHeight', -0.3, 0.5, 0.01).name('carry height');
    grip.add(T.grip, 'spinDamping', 0, 20, 0.1).name('held spin damping');
    grip.add(T.grip, 'holdRotK', 0, 80, 0.5).name('held orientation hold');
    grip.add(T.grip, 'setDownSpeed', 0.1, 2, 0.01).name('put-down speed (m/s)');
    grip.add(T.grip, 'reach', 0.3, 1.2, 0.01).name('reach');

    const mv = f('Movement');
    mv.add(T.move, 'maxSpeed', 1, 9, 0.1).name('max speed');
    mv.add(T.move, 'accel', 2, 80, 0.5).name('acceleration');
    mv.add(T.move, 'airAccel', 0, 40, 0.5).name('air control');
    mv.add(T.move, 'carrySpeed', 0.2, 1.2, 0.01).name('carry speed ×');
    mv.add(T.jump, 'velocity', 1, 9, 0.1).name('jump speed');
    mv.add(T.physics, 'gravity', 4, 25, 0.1).name('gravity');

    const body = f('Body / floating spring');
    body.add(T.float, 'rideHeight', 0.6, 1.1, 0.005).name('ride height');
    body.add(T.float, 'springK', 50, 800, 5).name('spring stiffness');
    body.add(T.float, 'springC', 2, 80, 0.5).name('spring damping');
    body.add(T.float, 'bob', 0, 0.12, 0.005).name('walk bob');

    const limbs = f('Limbs');
    limbs.add(T.arms, 'stiffness', 10, 800, 5).name('arm stiffness');
    limbs.add(T.arms, 'damping', 1, 60, 0.5).name('arm damping');
    limbs.add(T.arms, 'reachStiffness', 50, 1200, 5).name('reach stiffness');
    limbs.add(T.arms, 'maxTorque', 5, 200, 1).name('arm strength');
    limbs.add(T.arms, 'swing', 0, 1.5, 0.01).name('arm swing');
    limbs.add(T.legs, 'stiffness', 10, 800, 5).name('leg stiffness');
    limbs.add(T.legs, 'stepRate', 0.5, 6, 0.05).name('step rate');
    limbs.add(T.legs, 'swing', 0, 1.4, 0.01).name('leg swing');
    limbs.add(T.legs, 'knee', 0, 2, 0.01).name('knee lift');
    limbs.add(T.head, 'stiffness', 5, 400, 1).name('head stiffness');
    limbs.add(T.head, 'stabilize', 0, 1, 0.01).name('head stabilize');

    const knock = f('Knockdowns');
    knock.add(T.knock, 'impact', 2, 25, 0.1).name('knock threshold (m/s)');
    knock.add(T.knock, 'duration', 0.2, 5, 0.05).name('knocked time (s)');

    const cam = f('Camera');
    cam.add(T.camera, 'pitch', 20, 80, 1).name('pitch');
    cam.add(T.camera, 'fov', 20, 70, 1).name('fov');
    cam.add(T.camera, 'minDistance', 3, 20, 0.5).name('min distance');
    cam.add(T.camera, 'maxDistance', 10, 50, 0.5).name('max distance');
    cam.add(T.camera, 'padding', 0, 6, 0.1).name('framing padding');
    cam.add(T.camera, 'follow', 0.5, 10, 0.1).name('follow speed');

    const dmg = f('Damage / physics');
    dmg.add(T.damage, 'scale', 0, 3, 0.05).name('damage ×');
    dmg.add(T.physics, 'solverIterations', 1, 16, 1).name('solver iterations');

    const actions = {
      reset: () => {
        resetTuning();
        this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
      },
      copy: () => {
        const text = JSON.stringify(tuning, null, 2);
        navigator.clipboard?.writeText(text).catch(() => {});
        console.log(text);
      },
      respawn: () => this.game.session?.respawnAll(false),
      win: () => {
        const s = this.game.session;
        if (s) s.goalProgress = s.goalNeeded;
      },
    };
    this.gui.add(actions, 'respawn').name('↺ respawn at checkpoint');
    this.gui.add(actions, 'copy').name('⧉ copy tuning JSON');
    this.gui.add(actions, 'reset').name('⟲ reset all to defaults');
  }

  toggle() {
    this.visible = !this.visible;
    this.gui.show(this.visible);
  }
}
