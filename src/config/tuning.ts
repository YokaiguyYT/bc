/**
 * Every "feel" number in the game lives here. The dev panel (press ` backquote)
 * edits this object live, and systems read from it every physics step, so a
 * change in the panel takes effect immediately.
 *
 * Units: metres, seconds, kilograms. "accel" gains are mass-independent
 * (they get multiplied by the relevant mass before being applied as a force).
 */
export const tuning = {
  physics: {
    /** Fixed physics rate. 120 Hz keeps the explicit springs (floating body, grips) stable. */
    hz: 120,
    /** Rapier solver iterations per step (TGS substeps). More = stiffer joints, more CPU. */
    solverIterations: 6,
    /** Slightly heavier than Earth: jumps feel snappier and less floaty. */
    gravity: 11.5,
  },

  move: {
    /** Top walking speed (m/s). */
    maxSpeed: 4.3,
    /** How hard the mover pushes toward the target velocity on the ground (m/s²). */
    accel: 28,
    /** Same, while airborne. Lower = commit to your jumps. */
    airAccel: 7,
    /** Speed multiplier while holding something. */
    carrySpeed: 0.78,
    /** Acceleration while carrying something heavy (m/s²) — loads have momentum. */
    carryAccel: 4,
    /** Extra speed multiplier when the held thing is heavy (scaled by mass/40kg). */
    heavyCarrySlowdown: 0.35,
    /** Ground friction below this counts as "slippery" and cuts acceleration. */
    slipperyFriction: 0.15,
    slipperyAccelScale: 0.18,
  },

  jump: {
    /** Upward launch speed (m/s). ~0.8 m hop with the default gravity. */
    velocity: 4.4,
    /** Grace time after walking off a ledge where a jump still counts (s). */
    coyote: 0.12,
    /** A jump pressed slightly before landing still fires (s). */
    buffer: 0.14,
    /** Minimum time between jumps (s). */
    cooldown: 0.3,
    /** Floating spring is ignored for this long after a jump so it doesn't eat the launch (s). */
    springOff: 0.22,
  },

  /** The "floating capsule" that holds the torso up (Very Very Valet style). */
  float: {
    /** Ground to torso-centre distance when standing. */
    rideHeight: 0.84,
    /** How far below ride height we still look for ground (stairs down, slopes). */
    probeExtra: 0.32,
    /** Spring stiffness (1/s²) and damping (1/s). */
    springK: 300,
    springC: 26,
    /** Clamp of spring accel so big falls don't produce rocket launches (m/s²). */
    maxUp: 70,
    maxDown: 25,
    /** Steepest walkable slope (degrees). */
    maxSlope: 52,
    /** Walk bob height (m) — the goofy bounce. */
    bob: 0.035,
  },

  balance: {
    /** Upright spring (1/s²) / damping (1/s). This is the "how wobbly" knob. */
    uprightK: 160,
    uprightC: 18,
    /** Turning spring / damping around the vertical axis. */
    yawK: 70,
    yawC: 14,
    /** Max torque the balance can produce (N·m). Lower = carried weight tips you over. */
    maxTorque: 520,
    /** Effective rotational inertia used to scale the gains (kg·m²). */
    inertia: 5.5,
    /** Lean into acceleration (radians per m/s²). */
    accelLean: 0.022,
    /** Side-to-side waddle while walking (radians). */
    waddle: 0.07,
    /** Tilt past this for fallTime seconds and you fall over (degrees). */
    fallAngle: 62,
    fallTime: 0.35,
  },

  arms: {
    /** Joint motor gains (acceleration-based) when swinging freely. */
    stiffness: 220,
    damping: 18,
    /** When reaching to grab: snappier. */
    reachStiffness: 520,
    reachDamping: 30,
    /** While holding something the grip springs do the work; arms just follow. */
    holdStiffness: 160,
    holdDamping: 16,
    /** Max motor torque per axis (N·m). */
    maxTorque: 60,
    /** Explicit force pulling the hand onto its target point (1/s², 1/s) and cap (N). */
    handPullK: 260,
    handPullC: 20,
    handPullMax: 120,
    /** Arm swing while walking (radians). */
    swing: 0.55,
  },

  legs: {
    stiffness: 260,
    damping: 20,
    maxTorque: 90,
    /** Steps per second at full speed. */
    stepRate: 2.9,
    /** Hip swing amplitude (radians) and knee lift (radians). */
    swing: 0.62,
    knee: 0.95,
  },

  head: {
    stiffness: 120,
    damping: 9,
    maxTorque: 30,
    /** 0 = head follows torso, 1 = head stays perfectly level (chicken mode). */
    stabilize: 0.55,
  },

  grip: {
    /** How far a hand can reach from its shoulder to latch on (m). */
    reach: 0.62,
    /** How much lower than the shoulder you can reach by bending over (m). */
    bendReach: 0.5,
    /** Hand latches when its surface is this close to something (m). */
    latchDistance: 0.12,
    /** Grip spring between your torso and the held point (1/s², 1/s). */
    springK: 100,
    springC: 15,
    /** Max force one hand can exert on a held object (N). This is "grip strength". */
    handForce: 118,
    /** Hands are stronger on static ledges so you can hang and climb (N). */
    ledgeForce: 360,
    /** If the grip spring is stretched beyond this for slipTime, the hand lets go. */
    slipStretch: 0.7,
    slipTime: 0.6,
    /** Seconds to lift a grabbed thing from where you grabbed it up to carry height. */
    liftTime: 0.45,
    /** Carry pose relative to the torso centre (m): height and forward distance. */
    carryHeight: 0.24,
    carryForward: 0.5,
    /** Max distance between the two hands (m). */
    maxSpan: 0.78,
    /** Grip stretch (m) where walking away from the held point starts getting resisted… */
    tetherStart: 0.16,
    /** …and where it's fully blocked. Makes the cargo feel attached instead of slipping. */
    tetherFull: 0.42,
    /** Damps the held object's spin relative to you (1/s). Stops endless wobble. */
    spinDamping: 5,
    /** Soft orientation hold per player (1/s²) and its torque cap (N·m). */
    holdRotK: 18,
    holdRotMax: 60,
    /** Letting go of a load lowers it first: hand speed (m/s), squat rate (1/s), lowest hand height (torso-relative m), max time (s). */
    setDownSpeed: 0.3,
    setDownSquat: 0.75,
    setDownLow: -0.32,
    setDownMax: 2.2,
  },

  knock: {
    /** A non-gravity velocity change of the torso above this in one step knocks you down (m/s). */
    impact: 6.5,
    /** Seconds spent as a limp ragdoll. */
    duration: 1.6,
    /** Seconds to stand back up. */
    getUp: 0.6,
    /** Mashing jump while down shortens the knockout by this much per press (s). */
    mashBonus: 0.12,
  },

  camera: {
    /** Degrees above horizontal. */
    pitch: 46,
    fov: 38,
    minDistance: 8.5,
    maxDistance: 26,
    /** Extra framing margin around players and cargo (m). */
    padding: 2.6,
    /** Position smoothing (higher = snappier). */
    follow: 3.2,
    /** Degrees per second while Q/E is held. */
    rotateSpeed: 110,
  },

  damage: {
    /** Global damage multiplier. 0 = invincible cargo (practice). */
    scale: 1,
    /** Seconds of spawn protection. */
    spawnGrace: 1.2,
  },
};

export type Tuning = typeof tuning;

/** Snapshot of the defaults so the dev panel can reset. */
export const tuningDefaults: Tuning = JSON.parse(JSON.stringify(tuning));

export function resetTuning() {
  const d = JSON.parse(JSON.stringify(tuningDefaults));
  for (const k of Object.keys(d) as (keyof Tuning)[]) Object.assign(tuning[k], d[k]);
}
