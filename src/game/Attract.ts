import type { LevelSession } from './LevelSession';

/**
 * Menu background: the two movers goof around in the practice yard on their
 * own while the camera slowly circles.
 */
export class Attract {
  private t = 0;
  private plans = [
    { t: 0, x: 0, z: 0, grab: false, jump: false },
    { t: 0, x: 0, z: 0, grab: false, jump: false },
  ];

  constructor(private session: LevelSession) {
    session.attractMode = true;
  }

  update(dt: number) {
    this.t += dt;
    const s = this.session;
    if (!s || !s.attractMode) return;
    s.players.forEach((p, i) => {
      const plan = this.plans[i];
      plan.t -= dt;
      if (plan.t <= 0) {
        const r = Math.random();
        const cargo = s.cargo.position(p.bodyPos.clone());
        const toCargo = cargo.sub(p.bodyPos);
        toCargo.y = 0;
        if (r < 0.35 && toCargo.length() > 1) {
          // wander over to the crate and grab it
          toCargo.normalize();
          plan.x = toCargo.x;
          plan.z = toCargo.z;
          plan.grab = true;
          plan.t = 1.5 + Math.random() * 2;
        } else if (r < 0.7) {
          const a = Math.random() * Math.PI * 2;
          const home = p.bodyPos.clone().multiplyScalar(-0.12);
          plan.x = Math.cos(a) * 0.7 + home.x;
          plan.z = Math.sin(a) * 0.7 + home.z;
          plan.grab = Math.random() < 0.3;
          plan.t = 0.8 + Math.random() * 1.8;
        } else {
          plan.x = 0;
          plan.z = 0;
          plan.grab = Math.random() < 0.5;
          plan.t = 0.6 + Math.random();
        }
        plan.jump = Math.random() < 0.35;
      }
      p.intent.moveX = plan.x * 0.7;
      p.intent.moveZ = plan.z * 0.7;
      p.intent.grab = plan.grab;
      if (plan.jump && Math.random() < dt * 1.5) p.intent.jumpPressed = true;
      // keep them on the floor of the yard
      const pos = p.bodyPos;
      if (Math.abs(pos.x) > 6 || pos.z > 6 || pos.z < -6) {
        p.intent.moveX = -Math.sign(pos.x) * (Math.abs(pos.x) > 6 ? 1 : 0);
        p.intent.moveZ = pos.z > 6 ? -1 : pos.z < -6 ? 1 : 0;
      }
    });
    s.cameraRig.yaw += dt * 0.06;
  }
}
