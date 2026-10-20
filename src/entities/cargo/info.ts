import type { CargoKind } from '../../levels/types';

/** Static info about each cargo type for menus (kept separate so UI doesn't load meshes). */
export const CARGO_INFO: Record<CargoKind, { name: string; icon: string; value: number; blurb: string }> = {
  crate: { name: 'Wooden Crate', icon: '📦', value: 150, blurb: 'Practice cargo. Pretty tough.' },
  tv: { name: 'CRT Television', icon: '📺', value: 400, blurb: 'Heavy and top-heavy. Keep it upright.' },
  glass: { name: 'Pane of Glass', icon: '🪟', value: 650, blurb: 'Wide, wobbly and hates corners.' },
  aquarium: { name: 'Aquarium', icon: '🐠', value: 900, blurb: 'Sloshes. Spilled water is lost money.' },
  clock: { name: 'Grandfather Clock', icon: '🕰️', value: 1500, blurb: 'Tall. Tilt it to fit through doors.' },
  cake: { name: 'Wedding Cake', icon: '🎂', value: 1200, blurb: 'Breathe on it wrong and it squishes.' },
};
