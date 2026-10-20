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
  | 'paint';

export type CargoKind = 'crate' | 'glass' | 'tv' | 'aquarium' | 'clock' | 'cake';

interface Base {
  pos: Vec3;
  /** Euler rotation in degrees (XYZ). */
  rot?: Vec3;
  color?: number;
  surface?: Surface;
  /** Optional tag so hazards / scripts can find objects. */
  tag?: string;
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
    | 'truck'
    | 'crusher'
    | 'sprinkler';
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
}

export type LevelObject = BoxObj | CylinderObj | BallObj | ModelObj | SignObj | HazardObj;

export interface LevelDef {
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
  /** "Par" time in seconds (for the time bonus). */
  parTime: number;
  objects: LevelObject[];
  /** Short tips shown on the HUD when the level starts. */
  hints?: string[];
  /** Hidden from the level list (dev playground). */
  hidden?: boolean;
}
