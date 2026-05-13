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
};

export const ITEMS: ItemDef[] = [
  { id: 'phillips-small', label: 'Phillips driver', shelf: 'hand-tools' },
  { id: 'hex-set', label: 'Hex key set', shelf: 'hand-tools' },
  { id: 'snips', label: 'Wire snips', shelf: 'hand-tools' },
  { id: 'm3-screws', label: 'M3 screw bin', shelf: 'screws' },
  { id: 'm4-screws', label: 'M4 screw bin', shelf: 'screws' },
  { id: 'caliper', label: 'Digital calipers', shelf: 'measurement' },
  { id: 'multimeter', label: 'Multimeter', shelf: 'electronics' },
  { id: 'bracket-printed', label: 'Printed bracket', shelf: 'printed-parts' },
  { id: 'spool-pla', label: 'PLA spool', shelf: 'filament' },
  { id: 'spool-petg', label: 'PETG spool', shelf: 'filament' },
  // forbidden
  {
    id: 'soldering-iron',
    label: 'Soldering iron',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Soldering is forbidden in this room — flux fumes.'
  },
  {
    id: 'dremel',
    label: 'Dremel',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Machining is forbidden in this room — metal particulate.'
  },
  {
    id: 'hacksaw',
    label: 'Hacksaw',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Cutting metal is forbidden in this room.'
  },
  {
    id: 'spool-abs',
    label: 'ABS spool',
    shelf: 'filament',
    forbidden: true,
    reason: 'ABS off-gasses VOCs — not allowed in this room.'
  },
  {
    id: 'acetone',
    label: 'Acetone',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Solvents are not handled in this room.'
  },
  {
    id: 'torch',
    label: 'Butane torch',
    shelf: 'forbidden',
    forbidden: true,
    reason: 'Open flame is not allowed in this room.'
  }
];

export function getItem(id: ItemId): ItemDef {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown item ${id}`);
  return item;
}

export type BuildLocation = 'workstation' | 'bambu' | 'prusa';

export type BuildAction = {
  id: string;
  prompt: string;
  tool?: ItemId;
  durationMs: number;
  at?: BuildLocation; // defaults to 'workstation'
};

export type Phase =
  | { kind: 'gather'; label: string; needs: ItemId[] }
  | { kind: 'visitor'; label: string }
  | { kind: 'build'; label: string; actions: BuildAction[] }
  | { kind: 'return'; label: string };

export type RoundDef = {
  number: number;
  title: string;
  brief: string;
  itemsOnShelves: ItemId[];
  phases: Phase[];
  cleanupRequired?: boolean;
};

export const ROUNDS: RoundDef[] = [
  {
    number: 1,
    title: 'Round 1 · Bumper subassembly',
    brief:
      'Gather the Phillips driver, an M3 screw bin, and a printed bracket on the workstation. Drive the screws to seat the bracket, then return every tool to its shelf.',
    itemsOnShelves: [
      'phillips-small',
      'hex-set',
      'snips',
      'm3-screws',
      'm4-screws',
      'bracket-printed',
      'soldering-iron'
    ],
    phases: [
      {
        kind: 'gather',
        label: 'Gather parts on the workstation',
        needs: ['phillips-small', 'm3-screws', 'bracket-printed']
      },
      {
        kind: 'build',
        label: 'Assemble the subassembly',
        actions: [
          { id: 'assemble', prompt: 'Drive the M3 screws and seat the printed bracket', tool: 'phillips-small', durationMs: 2000 }
        ]
      },
      { kind: 'return', label: 'Return every tool to its shelf' }
    ]
  },
  {
    number: 2,
    title: 'Round 2 · Start a print',
    brief:
      'Pick a filament that is allowed in this room and load it into the Bambu H2D. Start the print, then return the spool to its shelf.',
    itemsOnShelves: ['spool-pla', 'spool-petg', 'spool-abs', 'phillips-small', 'multimeter'],
    phases: [
      {
        kind: 'gather',
        label: 'Bring a PLA spool to the workstation',
        needs: ['spool-pla']
      },
      {
        kind: 'build',
        label: 'Load and start the print',
        actions: [
          { id: 'load-start', prompt: 'Load the filament into the Bambu H2D and start the print', tool: 'spool-pla', durationMs: 2200, at: 'bambu' }
        ]
      },
      { kind: 'return', label: 'Return the spool to its shelf' }
    ]
  },
  {
    number: 3,
    title: 'Round 3 · Full session',
    brief:
      'Build a measured bracket assembly. A visitor may knock during the session — handle it properly. Every tool must end up back on its shelf before you finish.',
    itemsOnShelves: [
      'phillips-small',
      'hex-set',
      'm3-screws',
      'm4-screws',
      'bracket-printed',
      'caliper',
      'multimeter',
      'snips',
      'soldering-iron',
      'dremel'
    ],
    phases: [
      {
        kind: 'gather',
        label: 'Gather: Phillips, M3, bracket, calipers',
        needs: ['phillips-small', 'm3-screws', 'bracket-printed', 'caliper']
      },
      { kind: 'visitor', label: 'Handle the door knock' },
      {
        kind: 'build',
        label: 'Assemble and measure',
        actions: [
          { id: 'assemble', prompt: 'Drive the M3 screws and seat the bracket', tool: 'phillips-small', durationMs: 2000 },
          { id: 'measure', prompt: 'Take a final measurement with the calipers', tool: 'caliper', durationMs: 1800 }
        ]
      },
      { kind: 'return', label: 'Return every tool to its shelf' }
    ],
    cleanupRequired: true
  }
];

// Scoring
export const POINTS = {
  correctPickup: 2,
  buildAction: 4,
  correctReturn: 2,
  forbiddenPickup: -4,
  letVisitorIn: -12,
  toolLeftOnBench: -3,
  visitorDeclined: 2
};

// Max points per round, used to normalize
export const MAX_SCORE_PER_ROUND = [
  // Round 1: 3 pickups (6) + 1 build action (4) + 3 returns (6) = 16
  16,
  // Round 2: 1 pickup (2) + 1 build action (4) + 1 return (2) = 8
  8,
  // Round 3: 4 pickups (8) + visitor decline (2) + 2 build actions (8) + 4 returns (8) = 26
  26
];

export const TOTAL_MAX = MAX_SCORE_PER_ROUND.reduce((a, b) => a + b, 0);

export function normalizeScore(raw: number): number {
  return Math.max(0, Math.min(1, raw / TOTAL_MAX));
}
