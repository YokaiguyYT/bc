/**
 * Tiny typed event bus. Gameplay code emits, audio/particles/UI listen, so the
 * simulation never has to know about sound or rendering details.
 */
import type * as THREE from 'three';

export interface GameEvents {
  jump: { player: number; pos: THREE.Vector3 };
  land: { player: number; pos: THREE.Vector3; speed: number };
  step: { player: number; pos: THREE.Vector3; speed: number };
  grab: { player: number; pos: THREE.Vector3; kind: string };
  release: { player: number };
  slip: { player: number; pos: THREE.Vector3 };
  knock: { player: number; pos: THREE.Vector3; strength: number };
  getup: { player: number };
  impact: { pos: THREE.Vector3; speed: number; material: string };
  cargoDamage: { amount: number; pos: THREE.Vector3; health: number; kind: string };
  cargoBreak: { pos: THREE.Vector3; kind: string };
  cargoWobble: { amount: number; kind: string };
  checkpoint: { index: number; pos: THREE.Vector3 };
  respawn: { pos: THREE.Vector3 };
  goal: Record<string, never>;
  hazard: { pos: THREE.Vector3; kind: string };
  bark: { pos: THREE.Vector3 };
  honk: { pos: THREE.Vector3 };
  splash: { pos: THREE.Vector3; amount: number };
  chime: { pos: THREE.Vector3 };
  tick: { pos: THREE.Vector3; tock: boolean };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear() {
    this.handlers.clear();
  }
}
