import type { Theme } from '../render/Renderer';

export type Vec3 = [number, number, number];

/** Surface presets: look (texture + tint), friction and impact sound. */
export type Surface =
  | 'plain'
  | 'wood'
  | 'woodDark'
  | 'woodLight'
  | 'tiles'
  | 'checker'
  | 'concrete'
  | 'grass'
  | 'brick'
  | 'carpet'
  | 'wallpaper'
  | 'plaster'
  | 'asphalt'
  | 'metal'
  | 'ice'
  | 'hazard'
  | 'cardboard'
  | 'paint'
  | 'snow';

export type CargoKind = 'crate' | 'glass' | 'tv' | 'aquarium' | 'clock' | 'cake' | 'swan' | 'egg' | 'piano' | 'painting' | 'balloons';

interface Base {
  pos: Vec3;
  /** Euler rotation in degrees (XYZ). */
  rot?: Vec3;
  color?: number;
  surface?: Surface;
  /** Optional tag so hazards / scripts can find objects. */
  tag?: string;
  /** Pointy (cactus, pins…): pops balloons that touch it. */
  sharp?: boolean;
}

export interface BoxObj extends Base {
  type: 'box';
  size: Vec3;
  /** Corner rounding radius (m). Default scales with size. */
  radius?: number;
  friction?: number;
  /** false = visual only. */
  collide?: boolean;
  /** false = collider only (invisible wall). */
  visible?: boolean;
  /** Present = dynamic prop with this mass (kg). */
  dynamic?: { mass: number };
  grabbable?: boolean;
  /** Conveyor belt surface velocity (m/s). */
  surfaceVel?: Vec3;
  castShadow?: boolean;
  /** Texture metres-per-repeat override. */
  tile?: number;
  /** Fade out when it blocks the camera's view of the movers (walls). */
  fade?: boolean;
}

export interface CylinderObj extends Base {
  type: 'cylinder';
  radius: number;
  height: number;
  /** Top radius if different (cones, tapered posts). */
  radiusTop?: number;
  collide?: boolean;
  visible?: boolean;
  dynamic?: { mass: number };
  segments?: number;
  friction?: number;
}

export interface BallObj extends Base {
  type: 'ball';
  radius: number;
  collide?: boolean;
  dynamic?: { mass: number };
}

/** A glTF model from the manifest (falls back to primitives if missing). */
export interface ModelObj extends Base {
  type: 'model';
  model: string;
  /** Target bounding-box size in metres; the model is scaled to fit. */
  size?: Vec3;
  /** Collider: 'box' (default, from size), 'none', or a custom box. */
  collider?: 'box' | 'none' | { size: Vec3; offset?: Vec3 };
  dynamic?: { mass: number };
  grabbable?: boolean;
  /** 'bottom' (default): pos is where the model sits on the floor. 'center': pos is its bounding-box centre. */
  align?: 'bottom' | 'center';
}

/** Billboard text / signs painted on a plane. */
export interface SignObj extends Base {
  type: 'sign';
  text: string;
  size: Vec3; // width, height, thickness
  textColor?: string;
  bg?: string;
  post?: boolean;
  fontSize?: number;
}

export interface HazardObj {
  type: 'hazard';
  kind:
    | 'wreckingBall'
    | 'seesaw'
    | 'elevator'
    | 'mover'
    | 'spinner'
    | 'drunk'
    | 'dog'
    | 'car'
    | 'pedestrian'
    | 'pigeons'
    | 'fan'
    | 'swingDoor'
    | 'revolvingDoor'
    | 'truck'
    | 'crusher'
    | 'sprinkler'
    | 'conveyor'
    | 'trafficLight'
    | 'chandelier'
    | 'heater'
    | 'skiers'
    | 'riders'
    | 'laser'
    | 'light';
  pos: Vec3;
  rot?: Vec3;
  /** Kind-specific parameters. */
  params?: Record<string, unknown>;
  tag?: string;
}

export interface TriggerZone {
  pos: Vec3;
  size: Vec3;
}

export interface SpawnSet {
  p1: Vec3;
  p2: Vec3;
  cargo: Vec3;
  /** Facing yaw for the players (degrees). */
  yaw: number;
  cargoYaw?: number;
  /**
   * Full cargo rotation in degrees [tilt X, turn Y, roll Z]; the tilt/roll is
   * applied first, then the turn. [-90, 90, 0] = on its back, top pointing -X.
   * Overrides cargoYaw.
   */
  cargoRot?: Vec3;
  /** Positions are relative to this moving hazard (tag), e.g. riding in a truck. */
  attach?: string;
}

export type LevelObject = BoxObj | CylinderObj | BallObj | ModelObj | SignObj | HazardObj;

export interface LevelDef {
  /** Made by the job generator (online, the guest gets the whole description, not just the id). */
  generated?: boolean;
  id: string;
  name: string;
  tagline: string;
  /** Position in the level list. */
  order: number;
  cargo: CargoKind;
  theme?: Partial<Theme>;
  /** Initial camera yaw (degrees); 0 = looking toward -Z. */
  cameraYaw: number;
  spawn: SpawnSet;
  goal: TriggerZone & { label?: string };
  checkpoints: (TriggerZone & { spawn: SpawnSet })[];
  /** Falling below this height = out of bounds. */
  killY: number;
  /** Cargo floating above this height is lost too (things that float). */
  ceilingY?: number;
  /** "Par" time in seconds (for the time bonus). */
  parTime: number;
  objects: LevelObject[];
  /** Short tips shown on the HUD when the level starts. */
  hints?: string[];
  /** Tips shown once per attempt when the cargo or a mover gets within `radius` of `pos`. */
  tips?: { pos: Vec3; radius: number; text: string }[];
  /** Hidden from the level list (dev playground). */
  hidden?: boolean;
}
