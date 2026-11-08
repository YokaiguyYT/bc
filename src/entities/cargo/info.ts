import type { CargoKind } from '../../levels/types';

/** Static info about each cargo type for menus (kept separate so UI doesn't load meshes). */
export const CARGO_INFO: Record<CargoKind, { name: string; icon: string; value: number; blurb: string }> = {
  crate: { name: 'Wooden Crate', icon: '📦', value: 150, blurb: 'Practice cargo. Pretty tough.' },
  tv: { name: 'CRT Television', icon: '📺', value: 400, blurb: 'Heavy and top-heavy. Keep it upright.' },
  glass: { name: 'Pane of Glass', icon: '🪟', value: 650, blurb: 'Wide, wobbly and hates corners.' },
  aquarium: { name: 'Aquarium', icon: '🐠', value: 900, blurb: 'Sloshes. Spilled water is lost money.' },
  clock: { name: 'Grandfather Clock', icon: '🕰️', value: 1500, blurb: 'Long and heavy. Carry it end to end.' },
  cake: { name: 'Wedding Cake', icon: '🎂', value: 1200, blurb: 'Breathe on it wrong and it squishes.' },
  swan: { name: 'Ice Swan', icon: '🦢', value: 1100, blurb: 'Melts while you dawdle, faster near anything warm.' },
  egg: { name: 'Dinosaur Egg', icon: '🥚', value: 2000, blurb: 'Priceless, paper-thin, and it rolls.' },
  piano: { name: 'Upright Piano', icon: '🎹', value: 1800, blurb: 'Rolls on its castors. On a hill it wants to run.' },
  painting: { name: 'Masterpiece', icon: '🖼️', value: 1600, blurb: 'Big, light, and catches the wind like a sail.' },
  balloons: { name: 'Balloon Bouquet', icon: '🎈', value: 500, blurb: 'Floats off if you let go. Pointy things pop it.' },
  chandelier: { name: 'Crystal Chandelier', icon: '💎', value: 2400, blurb: 'The crystals swing. Swing them too hard and they clink off.' },
  beehive: { name: 'Beehive', icon: '🐝', value: 1300, blurb: 'Jolt it and the bees get cross. Very cross.' },
  jelly: { name: 'Giant Jelly', icon: '🍮', value: 1000, blurb: 'Wibbles at every start and stop. Too much wobble tears it.' },
  snowman: { name: 'Snowman', icon: '⛄', value: 1200, blurb: 'Melts in the sun. Stick to the shade.' },
  rocket: { name: 'Space Rocket', icon: '🚀', value: 2600, blurb: 'Long and heavy. Overheat it and the engine lights!' },
  pallet: { name: 'Box Tower', icon: '🗼', value: 90, blurb: 'A pallet you stack boxes on. Every box still standing at the drop-off pays.' },
};
