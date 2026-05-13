export type ItemId =
  | 'phillips-small'
  | 'hex-set'
  | 'm3-screws'
  | 'm4-screws'
  | 'bracket-printed'
  | 'caliper'
  | 'multimeter'
  | 'snips'
  | 'spool-pla'
  | 'spool-petg'
  // forbidden
  | 'soldering-iron'
  | 'dremel'
  | 'hacksaw'
  | 'spool-abs'
  | 'acetone'
  | 'torch';

export type Shelf =
  | 'hand-tools'
  | 'screws'
  | 'measurement'
  | 'printed-parts'
  | 'filament'
  | 'electronics'
  | 'forbidden';

export type ItemDef = {
  id: ItemId;
  label: string;
  shelf: Shelf;
  forbidden?: boolean;
  reason?: string;
  color: string;
  shape: 'rod' | 'box' | 'cyl' | 'plate' | 'bin';
};

export const ITEMS: ItemDef[] = [
  { id: 'phillips-small', label: 'Phillips driver', shelf: 'hand-tools', color: '#d9b66a', shape: 'rod' },
  { id: 'hex-set', label: 'Hex set', shelf: 'hand-tools', color: '#4f5b69', shape: 'box' },
  { id: 'snips', label: 'Wire snips', shelf: 'hand-tools', color: '#a23030', shape: 'rod' },
  { id: 'm3-screws', label: 'M3 screws', shelf: 'screws', color: '#7d6a53', shape: 'bin' },
  { id: 'm4-screws', label: 'M4 screws', shelf: 'screws', color: '#7d6a53', shape: 'bin' },
  { id: 'caliper', label: 'Calipers', shelf: 'measurement', color: '#c8c8c8', shape: 'plate' },
  { id: 'multimeter', label: 'Multimeter', shelf: 'electronics', color: '#1c4a1c', shape: 'box' },
  { id: 'bracket-printed', label: 'Printed bracket', shelf: 'printed-parts', color: '#e2c200', shape: 'plate' },
  { id: 'spool-pla', label: 'PLA spool', shelf: 'filament', color: '#1f5fa6', shape: 'cyl' },
  { id: 'spool-petg', label: 'PETG spool', shelf: 'filament', color: '#0e6b4e', shape: 'cyl' },
  // forbidden
  {
    id: 'soldering-iron',
    label: 'Soldering iron',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Soldering is forbidden in this room — flux fumes.',
    color: '#8c1515',
    shape: 'rod'
  },
  {
    id: 'dremel',
    label: 'Dremel',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Machining is forbidden in this room — metal particulate.',
    color: '#8c1515',
    shape: 'cyl'
  },
  {
    id: 'hacksaw',
    label: 'Hacksaw',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Cutting metal is forbidden in this room.',
    color: '#8c1515',
    shape: 'plate'
  },
  {
    id: 'spool-abs',
    label: 'ABS spool',
    shelf: 'filament',
    forbidden: true,
    reason: 'ABS off-gasses VOCs — not allowed in this room.',
    color: '#b03a1f',
    shape: 'cyl'
  },
  {
    id: 'acetone',
    label: 'Acetone',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Solvents are not handled in this room.',
    color: '#8c1515',
    shape: 'cyl'
  },
  {
    id: 'torch',
    label: 'Butane torch',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Open flame is not allowed in this room.',
    color: '#8c1515',
    shape: 'rod'
  }
];

export function getItem(id: ItemId): ItemDef {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item;
}

export type Step = {
  id: string;
  label: string;
  // What the player must do for this step
  needs: ItemId[]; // items that must currently be on the workbench
};

export type RoundDef = {
  number: number;
  title: string;
  brief: string;
  steps: Step[];
  // Tools available on shelves this round — both correct and trap items.
  itemsOnShelves: ItemId[];
  // Special end-of-round events
  visitorEvent?: boolean;
  cleanupRequired?: boolean;
};

export const ROUNDS: RoundDef[] = [
  {
    number: 1,
    title: 'Round 1 · Bumper subassembly',
    brief:
      'Build a simple bumper subassembly. Pick the small Phillips driver, the M3 screws bin, and a printed bracket. Place them on the workbench, then return each to its shelf.',
    steps: [
      { id: 'gather', label: 'Gather: Phillips driver, M3 screws, printed bracket on the workbench', needs: ['phillips-small', 'm3-screws', 'bracket-printed'] },
      { id: 'return', label: 'Return all three to their labeled shelves', needs: [] }
    ],
    itemsOnShelves: ['phillips-small', 'hex-set', 'snips', 'm3-screws', 'm4-screws', 'bracket-printed', 'soldering-iron']
  },
  {
    number: 2,
    title: 'Round 2 · Start a print',
    brief:
      'You need to print a part on the Bambu H2D. Pick the correct filament for this room and load it into the printer. Watch out — the wrong spool is also on the shelf.',
    steps: [
      { id: 'load-filament', label: 'Place a correct filament on the workbench (PLA or PETG)', needs: ['spool-pla'] },
      { id: 'cleanup-2', label: 'Return the spool to the filament shelf', needs: [] }
    ],
    itemsOnShelves: ['spool-pla', 'spool-petg', 'spool-abs', 'phillips-small', 'multimeter']
  },
  {
    number: 3,
    title: 'Round 3 · The full session',
    brief:
      'Assemble a small bracket assembly with screws, then take a caliper measurement. Mid-task, someone may knock at the door — handle it correctly. Before you finish, the workbench MUST be clear and every tool returned to its shelf.',
    steps: [
      { id: 'gather-3', label: 'Gather: Phillips driver, M3 screws, printed bracket, calipers on the workbench', needs: ['phillips-small', 'm3-screws', 'bracket-printed', 'caliper'] },
      { id: 'visitor', label: 'A visitor knocks at the door (event handled when triggered)', needs: ['phillips-small', 'm3-screws', 'bracket-printed', 'caliper'] },
      { id: 'cleanup-3', label: 'Return every tool to its labeled shelf — leave the workbench empty', needs: [] }
    ],
    itemsOnShelves: ['phillips-small', 'hex-set', 'm3-screws', 'm4-screws', 'bracket-printed', 'caliper', 'multimeter', 'snips', 'soldering-iron', 'dremel'],
    visitorEvent: true,
    cleanupRequired: true
  }
];

// Scoring
export const POINTS = {
  correctPickup: 2,
  correctStep: 4,
  correctReturn: 2,
  forbiddenPickup: -3,
  letVisitorIn: -10,
  toolLeftOnBench: -3
};

export const MAX_SCORE_PER_ROUND = [
  // Round 1: gather (3 items × pickup 2 + step 4) + return (3 items × 2) = 6 + 4 + 6 = 16
  16,
  // Round 2: filament pickup 2 + step 4 + return 2 = 8
  8,
  // Round 3: gather 4 items × pickup 2 + step 4 + return 4 × 2 = 8 + 4 + 8 = 20 (visitor handled correctly = +2)
  22
];

export const TOTAL_MAX = MAX_SCORE_PER_ROUND.reduce((a, b) => a + b, 0); // 46

export function normalizeScore(raw: number): number {
  const clamped = Math.max(0, raw);
  return Math.min(1, clamped / TOTAL_MAX);
}
