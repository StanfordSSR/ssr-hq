'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Edges } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ITEMS,
  POINTS,
  ROUNDS,
  TOTAL_MAX,
  getItem,
  normalizeScore,
  type ItemDef,
  type ItemId,
  type Shelf
} from './game-logic';

type Toast = { id: number; text: string; tone: 'good' | 'bad' };

type GameState = {
  roundIdx: number;
  scoreRaw: number;
  benchItems: ItemId[];
  carrying: ItemId | null;
  visitorPrompted: boolean;
  visitorHandled: boolean;
  toasts: Toast[];
  finished: boolean;
  failedHard: boolean;
};

const initialState: GameState = {
  roundIdx: 0,
  scoreRaw: 0,
  benchItems: [],
  carrying: null,
  visitorPrompted: false,
  visitorHandled: false,
  toasts: [],
  finished: false,
  failedHard: false
};

// ---- Room layout (matches the user's sketch) ----------------------------------------------

const ROOM_W = 14;
const ROOM_D = 14;
const WALL_H = 3.2;

type ShelfCfg = {
  position: [number, number, number];
  rotY: number;
  width: number;
  depth: number;
  height: number; // total cabinet height
  shelves: number;
  label: string;
  tone?: 'normal' | 'forbidden';
};

const SHELF_LAYOUT: Record<Shelf, ShelfCfg> = {
  // West wall, upper: peg-board "tool wall"
  'hand-tools':    { position: [-6.85,  0, -3.3], rotY:  Math.PI / 2, width: 3.4, depth: 0.3, height: 2.4, shelves: 3, label: 'Tool wall' },
  // West wall, lower: long shelf for filament
  'filament':      { position: [-6.85,  0,  2.5], rotY:  Math.PI / 2, width: 4.0, depth: 0.5, height: 1.6, shelves: 2, label: 'Filament' },
  // North wall, right side: small shelf
  'printed-parts': { position: [ 2.6,  0, -6.85], rotY: 0,             width: 2.6, depth: 0.5, height: 1.6, shelves: 2, label: 'Printed parts' },
  // East wall, upper: tall shelf for measurement tools
  'measurement':   { position: [ 6.85,  0, -4.0], rotY: -Math.PI / 2, width: 2.4, depth: 0.5, height: 2.0, shelves: 3, label: 'Measurement' },
  // East wall, upper-mid: electronics shelf
  'electronics':   { position: [ 6.85,  0, -1.6], rotY: -Math.PI / 2, width: 2.0, depth: 0.5, height: 1.6, shelves: 2, label: 'Electronics' },
  // South wall, left half: screws bins
  'screws':        { position: [-2.8,  0,  6.85], rotY: Math.PI,       width: 2.8, depth: 0.5, height: 1.4, shelves: 2, label: 'Screws' },
  // South wall, middle: forbidden shelf (the trap zone)
  'forbidden':     { position: [ 0.6,  0,  6.85], rotY: Math.PI,       width: 2.8, depth: 0.5, height: 1.6, shelves: 2, label: 'Misc — NOT for this room', tone: 'forbidden' }
};

// Workstation (assembly bench) against the NORTH wall
const BENCH_CFG = { position: [-2.0, 0, -6.5] as [number, number, number], width: 4.5, depth: 1.2, height: 0.95 };

// 3D printers on a table against the EAST wall
const PRINTER_TABLE_CFG = { position: [6.5, 0, 1.5] as [number, number, number], width: 1.4, depth: 3.0, height: 0.85 };

// Door is on the EAST wall toward the south corner
const DOOR_CFG = { position: [6.99, 0, 5.0] as [number, number, number] };

// ---- Helpers -------------------------------------------------------------------------------

const FLOOR_COLOR = '#dcd2c2';
const WALL_COLOR = '#f5f1ec';
const SHELF_FRAME_COLOR = '#c9beae';
const FORBIDDEN_FRAME = '#e3b6b0';
const BENCH_TOP_COLOR = '#a07a4e';
const BENCH_LEG_COLOR = '#3f2a16';

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

// ---- Room geometry -------------------------------------------------------------------------

function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={FLOOR_COLOR} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#fdfbf6" />
      </mesh>
      {/* Walls (interior-facing) */}
      <mesh position={[0, WALL_H / 2, -ROOM_D / 2]}>
        <boxGeometry args={[ROOM_W, WALL_H, 0.1]} />
        <meshStandardMaterial color={WALL_COLOR} />
      </mesh>
      <mesh position={[-ROOM_W / 2, WALL_H / 2, 0]}>
        <boxGeometry args={[0.1, WALL_H, ROOM_D]} />
        <meshStandardMaterial color={WALL_COLOR} />
      </mesh>
      <mesh position={[ROOM_W / 2, WALL_H / 2, 0]}>
        <boxGeometry args={[0.1, WALL_H, ROOM_D]} />
        <meshStandardMaterial color={WALL_COLOR} />
      </mesh>
      <mesh position={[0, WALL_H / 2, ROOM_D / 2]}>
        <boxGeometry args={[ROOM_W, WALL_H, 0.1]} />
        <meshStandardMaterial color={WALL_COLOR} />
      </mesh>
      {/* Baseboard trim around the perimeter */}
      {[
        { pos: [0, 0.05, -ROOM_D / 2 + 0.06], size: [ROOM_W, 0.1, 0.04] },
        { pos: [0, 0.05, ROOM_D / 2 - 0.06], size: [ROOM_W, 0.1, 0.04] },
        { pos: [-ROOM_W / 2 + 0.06, 0.05, 0], size: [0.04, 0.1, ROOM_D] },
        { pos: [ROOM_W / 2 - 0.06, 0.05, 0], size: [0.04, 0.1, ROOM_D] }
      ].map((t, i) => (
        <mesh key={i} position={t.pos as [number, number, number]}>
          <boxGeometry args={t.size as [number, number, number]} />
          <meshStandardMaterial color="#bfb3a1" />
        </mesh>
      ))}
    </group>
  );
}

function ShelfFurniture({ shelfId, highlight }: { shelfId: Shelf; highlight: boolean }) {
  const cfg = SHELF_LAYOUT[shelfId];
  const color = cfg.tone === 'forbidden' ? FORBIDDEN_FRAME : SHELF_FRAME_COLOR;
  const shelfStep = cfg.height / (cfg.shelves + 0.5);
  return (
    <group position={cfg.position} rotation={[0, cfg.rotY, 0]}>
      {/* Back panel */}
      <mesh position={[0, cfg.height / 2, -cfg.depth / 2 - 0.02]}>
        <boxGeometry args={[cfg.width, cfg.height, 0.04]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Sides */}
      <mesh position={[-cfg.width / 2 + 0.04, cfg.height / 2, 0]}>
        <boxGeometry args={[0.08, cfg.height, cfg.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[cfg.width / 2 - 0.04, cfg.height / 2, 0]}>
        <boxGeometry args={[0.08, cfg.height, cfg.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Shelves */}
      {Array.from({ length: cfg.shelves }).map((_, i) => (
        <mesh key={i} position={[0, shelfStep * (i + 0.5), 0]}>
          <boxGeometry args={[cfg.width - 0.16, 0.04, cfg.depth - 0.04]} />
          <meshStandardMaterial color="#ece3d3" />
        </mesh>
      ))}
      {/* Highlight outline */}
      {highlight ? (
        <mesh position={[0, cfg.height / 2, 0.02]}>
          <boxGeometry args={[cfg.width + 0.1, cfg.height + 0.1, cfg.depth + 0.4]} />
          <meshBasicMaterial color="#ffd34a" transparent opacity={0.18} />
        </mesh>
      ) : null}
      {/* Label above */}
      <Text position={[0, cfg.height + 0.15, 0.05]} fontSize={0.16} color={cfg.tone === 'forbidden' ? '#8c1515' : '#3a2f24'} anchorX="center" anchorY="middle">
        {cfg.label}
      </Text>
    </group>
  );
}

function Workbench({ highlight }: { highlight: boolean }) {
  const cfg = BENCH_CFG;
  return (
    <group position={cfg.position}>
      {/* Top */}
      <mesh position={[0, cfg.height, 0]} castShadow>
        <boxGeometry args={[cfg.width, 0.08, cfg.depth]} />
        <meshStandardMaterial color={BENCH_TOP_COLOR} />
        <Edges color="#6a4a26" />
      </mesh>
      {/* Legs */}
      {[
        [-cfg.width / 2 + 0.1, cfg.height / 2, -cfg.depth / 2 + 0.1],
        [cfg.width / 2 - 0.1, cfg.height / 2, -cfg.depth / 2 + 0.1],
        [-cfg.width / 2 + 0.1, cfg.height / 2, cfg.depth / 2 - 0.1],
        [cfg.width / 2 - 0.1, cfg.height / 2, cfg.depth / 2 - 0.1]
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, cfg.height, 0.08]} />
          <meshStandardMaterial color={BENCH_LEG_COLOR} />
        </mesh>
      ))}
      {/* Front rail */}
      <mesh position={[0, cfg.height - 0.18, cfg.depth / 2 - 0.05]}>
        <boxGeometry args={[cfg.width - 0.18, 0.08, 0.04]} />
        <meshStandardMaterial color={BENCH_LEG_COLOR} />
      </mesh>
      {highlight ? (
        <mesh position={[0, cfg.height + 0.05, 0]}>
          <boxGeometry args={[cfg.width + 0.1, 0.08, cfg.depth + 0.1]} />
          <meshBasicMaterial color="#ffd34a" transparent opacity={0.35} />
        </mesh>
      ) : null}
      <Text position={[0, cfg.height + 0.45, 0]} fontSize={0.18} color="#3a2f24" anchorX="center" anchorY="middle">
        Workstation
      </Text>
    </group>
  );
}

function PrinterPiece({ x, color, label }: { x: number; color: string; label: string }) {
  return (
    <group position={[0, 0, x]}>
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.9, 1.0, 0.9]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.46, 0.95, 0]}>
        <boxGeometry args={[0.04, 0.7, 0.7]} />
        <meshStandardMaterial color="#202020" transparent opacity={0.7} />
      </mesh>
      <Text position={[0, 1.7, 0]} fontSize={0.14} color="#3a2f24" anchorX="center" anchorY="middle" rotation={[0, -Math.PI / 2, 0]}>
        {label}
      </Text>
    </group>
  );
}

function PrinterTable() {
  const cfg = PRINTER_TABLE_CFG;
  return (
    <group position={cfg.position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, cfg.height, 0]} castShadow>
        <boxGeometry args={[cfg.depth, 0.08, cfg.width]} />
        <meshStandardMaterial color="#cabba0" />
      </mesh>
      {[[-0.55, 0.42, -1.3], [0.55, 0.42, -1.3], [-0.55, 0.42, 1.3], [0.55, 0.42, 1.3]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, 0.85, 0.08]} />
          <meshStandardMaterial color="#4a3a26" />
        </mesh>
      ))}
      <PrinterPiece x={-0.9} color="#ec6b1a" label="Prusa Core One+" />
      <PrinterPiece x={0.9} color="#1f8a4a" label="Bambu H2D" />
    </group>
  );
}

function Door({ knocking }: { knocking: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    if (knocking) {
      ref.current.position.z = DOOR_CFG.position[2] + Math.sin(state.clock.elapsedTime * 8) * 0.05;
    } else {
      ref.current.position.z = DOOR_CFG.position[2];
    }
  });
  return (
    <group>
      <group ref={ref} position={DOOR_CFG.position}>
        {/* Door slab */}
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[0.06, 2.0, 1.0]} />
          <meshStandardMaterial color={knocking ? '#b03a1f' : '#3a2515'} />
        </mesh>
        {/* Handle */}
        <mesh position={[-0.06, 1.0, -0.35]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color="#7d6a44" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      <Text position={[DOOR_CFG.position[0] - 0.05, 2.4, DOOR_CFG.position[2]]} fontSize={0.16} color="#3a2f24" anchorX="center" anchorY="middle" rotation={[0, -Math.PI / 2, 0]}>
        Door
      </Text>
      {knocking ? (
        <Text position={[DOOR_CFG.position[0] - 0.05, 2.62, DOOR_CFG.position[2]]} fontSize={0.18} color="#b03a1f" anchorX="center" anchorY="middle" rotation={[0, -Math.PI / 2, 0]}>
          ⚠ Knock knock
        </Text>
      ) : null}
    </group>
  );
}

// ---- Item placement ------------------------------------------------------------------------

function getShelfWorldPos(shelfId: Shelf, slotIndex: number, slotCount: number): [number, number, number] {
  const cfg = SHELF_LAYOUT[shelfId];
  const spacing = cfg.width - 0.4;
  const step = slotCount > 1 ? spacing / (slotCount - 1) : 0;
  const localX = slotCount > 1 ? -spacing / 2 + step * slotIndex : 0;
  const cos = Math.cos(cfg.rotY);
  const sin = Math.sin(cfg.rotY);
  // Items sit on the lowest shelf in front of the cabinet
  const localY = cfg.height / (cfg.shelves + 0.5) * 0.5 + 0.16;
  const localZ = 0;
  const worldX = cfg.position[0] + cos * localX + sin * localZ;
  const worldZ = cfg.position[2] - sin * localX + cos * localZ;
  return [worldX, localY, worldZ];
}

function getBenchSlotPos(slotIndex: number, slotCount: number): [number, number, number] {
  const benchTop = BENCH_CFG.height + 0.06;
  const spread = BENCH_CFG.width - 0.6;
  const step = slotCount > 1 ? spread / (slotCount - 1) : 0;
  const localX = slotCount > 1 ? -spread / 2 + step * slotIndex : 0;
  // Bench is along the north wall, facing south; players stand south of it
  return [BENCH_CFG.position[0] + localX, benchTop, BENCH_CFG.position[2] + 0.3];
}

// ---- Items in world ------------------------------------------------------------------------

type WorldItem = {
  id: ItemId;
  position: THREE.Vector3;
  def: ItemDef;
};

function ItemMeshLite({ def }: { def: ItemDef }) {
  switch (def.shape) {
    case 'rod':
      return (
        <mesh>
          <cylinderGeometry args={[0.045, 0.045, 0.34, 10]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
    case 'cyl':
      return (
        <mesh>
          <cylinderGeometry args={[0.16, 0.16, 0.22, 16]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
    case 'plate':
      return (
        <mesh>
          <boxGeometry args={[0.3, 0.05, 0.18]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
    case 'bin':
      return (
        <mesh>
          <boxGeometry args={[0.34, 0.18, 0.22]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
    default:
      return (
        <mesh>
          <boxGeometry args={[0.22, 0.18, 0.18]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
  }
}

function ItemInWorld({ item, hovered }: { item: WorldItem; hovered: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const wobble = hovered ? Math.sin(state.clock.elapsedTime * 6) * 0.04 : 0;
    ref.current.position.set(item.position.x, item.position.y + 0.18 + wobble, item.position.z);
  });
  return (
    <group ref={ref}>
      <ItemMeshLite def={item.def} />
      <Text position={[0, 0.32, 0]} fontSize={0.085} color={hovered ? '#000000' : '#3a2f24'} anchorX="center" anchorY="middle">
        {item.def.label}
      </Text>
      {hovered ? (
        <mesh position={[0, -0.05, 0]}>
          <ringGeometry args={[0.22, 0.28, 24]} />
          <meshBasicMaterial color="#ffd34a" side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function CarriedItem({ itemId }: { itemId: ItemId }) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!ref.current) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = camera.position
      .clone()
      .add(forward.clone().multiplyScalar(0.55))
      .add(right.clone().multiplyScalar(0.3))
      .add(up.clone().multiplyScalar(-0.22));
    ref.current.position.copy(pos);
    ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={ref}>
      <ItemMeshLite def={getItem(itemId)} />
    </group>
  );
}

// ---- Player + interaction --------------------------------------------------------------------

function Player({
  enabled,
  onPositionChange
}: {
  enabled: boolean;
  onPositionChange?: (pos: THREE.Vector3) => void;
}) {
  const { camera } = useThree();
  const move = useRef({ forward: 0, right: 0 });
  useEffect(() => {
    camera.position.set(0, 1.65, 4.5);
    camera.lookAt(0, 1.65, -1);
  }, [camera]);

  useEffect(() => {
    const handle = (e: KeyboardEvent, down: boolean) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          move.current.forward = down ? 1 : 0;
          break;
        case 'KeyS':
        case 'ArrowDown':
          move.current.forward = down ? -1 : 0;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          move.current.right = down ? -1 : 0;
          break;
        case 'KeyD':
        case 'ArrowRight':
          move.current.right = down ? 1 : 0;
          break;
      }
    };
    const downH = (e: KeyboardEvent) => handle(e, true);
    const upH = (e: KeyboardEvent) => handle(e, false);
    window.addEventListener('keydown', downH);
    window.addEventListener('keyup', upH);
    return () => {
      window.removeEventListener('keydown', downH);
      window.removeEventListener('keyup', upH);
      move.current.forward = 0;
      move.current.right = 0;
    };
  }, []);

  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (!enabled) {
      move.current.forward = 0;
      move.current.right = 0;
    }
    const speed = 3.6;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const dx = forward.x * move.current.forward + right.x * move.current.right;
    const dz = forward.z * move.current.forward + right.z * move.current.right;
    camera.position.x = clamp(camera.position.x + dx * speed * delta, -ROOM_W / 2 + 0.6, ROOM_W / 2 - 0.6);
    camera.position.z = clamp(camera.position.z + dz * speed * delta, -ROOM_D / 2 + 0.6, ROOM_D / 2 - 0.6);
    camera.position.y = 1.65;
    if (onPositionChange) onPositionChange(camera.position);
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

type Hover =
  | { kind: 'item'; itemId: ItemId; distance: number }
  | { kind: 'bench'; distance: number }
  | { kind: 'shelf'; shelfId: Shelf; distance: number }
  | null;

function HoverDetector({
  worldItems,
  carrying,
  onHover
}: {
  worldItems: WorldItem[];
  carrying: ItemId | null;
  onHover: (h: Hover) => void;
}) {
  const { camera } = useThree();
  const lastRef = useRef<Hover>(null);

  useFrame(() => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    if (carrying) {
      // Looking for placement targets: bench or matching shelf
      const benchCenter = new THREE.Vector3(BENCH_CFG.position[0], 1.0, BENCH_CFG.position[2] + 0.3);
      const toBench = benchCenter.clone().sub(camera.position);
      const benchDist = toBench.length();
      let best: Hover = null;
      if (benchDist < 3.2) {
        const dot = forward.dot(toBench.clone().normalize());
        if (dot > 0.6) {
          best = { kind: 'bench', distance: benchDist };
        }
      }
      // Check correct shelf for carried item
      const carriedItem = getItem(carrying);
      const cfg = SHELF_LAYOUT[carriedItem.shelf];
      const shelfCenter = new THREE.Vector3(cfg.position[0], cfg.height / 2, cfg.position[2]);
      const toShelf = shelfCenter.clone().sub(camera.position);
      const shelfDist = toShelf.length();
      if (shelfDist < 3.0) {
        const dot = forward.dot(toShelf.clone().normalize());
        if (dot > 0.55 && (!best || shelfDist < best.distance)) {
          best = { kind: 'shelf', shelfId: carriedItem.shelf, distance: shelfDist };
        }
      }
      if (JSON.stringify(best) !== JSON.stringify(lastRef.current)) {
        lastRef.current = best;
        onHover(best);
      }
      return;
    }

    // Looking for items to pick up
    let bestDist = Infinity;
    let bestItem: WorldItem | null = null;
    for (const w of worldItems) {
      const toItem = w.position.clone().sub(camera.position);
      const dist = toItem.length();
      if (dist > 2.8) continue;
      toItem.y = 0;
      toItem.normalize();
      const dot = forward.dot(toItem);
      if (dot < 0.55) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestItem = w;
      }
    }
    const next: Hover = bestItem ? { kind: 'item', itemId: bestItem.id, distance: bestDist } : null;
    if (JSON.stringify(next) !== JSON.stringify(lastRef.current)) {
      lastRef.current = next;
      onHover(next);
    }
  });

  return null;
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#ffffff', '#cdbfaa', 0.5]} />
      <directionalLight position={[6, 9, 6]} intensity={0.6} />
      <directionalLight position={[-5, 8, -4]} intensity={0.35} />
    </>
  );
}

// ---- Main game ------------------------------------------------------------------------------

export function WorkshopGame({
  passingScore,
  onComplete
}: {
  passingScore: number;
  onComplete: (score: number) => Promise<void>;
}) {
  const [state, setState] = useState<GameState>(initialState);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  const round = ROUNDS[state.roundIdx];

  const worldItems: WorldItem[] = useMemo(() => {
    const shelfCounts: Record<Shelf, ItemId[]> = {
      'hand-tools': [],
      screws: [],
      measurement: [],
      'printed-parts': [],
      filament: [],
      electronics: [],
      forbidden: []
    };
    round.itemsOnShelves.forEach((id) => {
      if (state.benchItems.includes(id)) return;
      if (state.carrying === id) return;
      const item = getItem(id);
      shelfCounts[item.shelf].push(id);
    });
    const result: WorldItem[] = [];
    (Object.keys(shelfCounts) as Shelf[]).forEach((s) => {
      shelfCounts[s].forEach((id, idx) => {
        const pos = getShelfWorldPos(s, idx, shelfCounts[s].length);
        const def = getItem(id);
        result.push({ id, def, position: new THREE.Vector3(pos[0], pos[1], pos[2]) });
      });
    });
    // Bench items
    state.benchItems.forEach((id, idx) => {
      const pos = getBenchSlotPos(idx, state.benchItems.length);
      const def = getItem(id);
      result.push({ id, def, position: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    });
    return result;
  }, [round, state.benchItems, state.carrying]);

  const pushToast = (text: string, tone: 'good' | 'bad') => {
    const id = Date.now() + Math.random();
    setState((prev) => ({ ...prev, toasts: [...prev.toasts.slice(-3), { id, text, tone }] }));
    window.setTimeout(() => {
      setState((prev) => ({ ...prev, toasts: prev.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  };

  const pickupItem = (id: ItemId) => {
    if (state.carrying || state.finished || state.failedHard) return;
    const item = getItem(id);
    if (item.forbidden) {
      setState((prev) => ({ ...prev, scoreRaw: prev.scoreRaw + POINTS.forbiddenPickup }));
      pushToast(`✗ ${item.reason}`, 'bad');
      return;
    }
    setState((prev) => {
      // Determine if we're picking off the bench
      const fromBench = prev.benchItems.includes(id);
      return {
        ...prev,
        carrying: id,
        benchItems: fromBench ? prev.benchItems.filter((x) => x !== id) : prev.benchItems,
        scoreRaw: fromBench ? prev.scoreRaw : prev.scoreRaw + POINTS.correctPickup
      };
    });
    pushToast(`✓ Picked up ${item.label}`, 'good');
  };

  const placeOnBench = () => {
    if (!state.carrying) return;
    setState((prev) => {
      const benchItems = [...prev.benchItems, prev.carrying!];
      let score = prev.scoreRaw;
      for (const step of round.steps) {
        if (step.needs.length === 0) continue;
        const ok = step.needs.every((id) => benchItems.includes(id));
        const wasOk = step.needs.every((id) => prev.benchItems.includes(id));
        if (ok && !wasOk) {
          score += POINTS.correctStep;
          break;
        }
      }
      return { ...prev, carrying: null, benchItems, scoreRaw: score };
    });
    pushToast('✓ Placed on workstation', 'good');
  };

  const returnToShelf = (shelfId: Shelf) => {
    if (!state.carrying) return;
    const item = getItem(state.carrying);
    if (item.shelf !== shelfId) {
      pushToast(`✗ Wrong shelf — ${item.label} goes on ${SHELF_LAYOUT[item.shelf].label}`, 'bad');
      return;
    }
    setState((prev) => ({ ...prev, carrying: null, scoreRaw: prev.scoreRaw + POINTS.correctReturn }));
    pushToast(`✓ Returned ${item.label}`, 'good');
  };

  const handleInteract = () => {
    if (hover?.kind === 'item') {
      pickupItem(hover.itemId);
    } else if (hover?.kind === 'bench') {
      placeOnBench();
    } else if (hover?.kind === 'shelf') {
      returnToShelf(hover.shelfId);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.visitorPrompted) return;
      if (e.code === 'KeyE') {
        handleInteract();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setPanelOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Visitor event in round 3 after the gather step
  const gatherDoneRound3 =
    round.visitorEvent &&
    round.steps[0].needs.every((id) => state.benchItems.includes(id)) &&
    !state.visitorPrompted &&
    !state.visitorHandled;
  useEffect(() => {
    if (gatherDoneRound3) {
      const t = window.setTimeout(() => {
        setState((prev) => ({ ...prev, visitorPrompted: true }));
        if (document.pointerLockElement) {
          (document as any).exitPointerLock?.();
        }
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [gatherDoneRound3]);

  const handleVisitorDecline = () => {
    setState((prev) => ({ ...prev, visitorPrompted: false, visitorHandled: true, scoreRaw: prev.scoreRaw + 2 }));
    pushToast('✓ Declined politely', 'good');
  };

  const handleVisitorAccept = () => {
    setState((prev) => ({
      ...prev,
      visitorPrompted: false,
      visitorHandled: true,
      scoreRaw: prev.scoreRaw + POINTS.letVisitorIn,
      failedHard: true
    }));
    pushToast('✗ Letting an unauthorized visitor in is an immediate fail.', 'bad');
  };

  const allStepsDone = round.steps.every((step) =>
    step.needs.length === 0
      ? state.benchItems.length === 0 && (!round.visitorEvent || state.visitorHandled)
      : step.needs.every((id) => state.benchItems.includes(id))
  );

  const advanceRound = () => {
    if (state.roundIdx === ROUNDS.length - 1) {
      let finalScore = state.scoreRaw;
      if (round.cleanupRequired && state.benchItems.length > 0) {
        finalScore += POINTS.toolLeftOnBench * state.benchItems.length;
        pushToast(`✗ ${state.benchItems.length} tool(s) left on the workstation`, 'bad');
      }
      setState((prev) => ({ ...prev, scoreRaw: finalScore, finished: true }));
      return;
    }
    setState((prev) => ({
      ...prev,
      roundIdx: prev.roundIdx + 1,
      benchItems: [],
      carrying: null,
      visitorPrompted: false,
      visitorHandled: false
    }));
  };

  const restartGame = () => setState(initialState);

  const submitFinal = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const score = normalizeScore(state.scoreRaw);
    try {
      await onComplete(score);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not record completion.');
      setSubmitting(false);
    }
  };

  const normalizedScore = normalizeScore(state.scoreRaw);
  const passed = normalizedScore >= passingScore;

  const interactPrompt = (() => {
    if (state.carrying) {
      if (hover?.kind === 'bench') return 'Press E to place on workstation';
      if (hover?.kind === 'shelf') return `Press E to return to ${SHELF_LAYOUT[hover.shelfId].label}`;
      return `Carrying ${getItem(state.carrying).label} — look at the workstation or its shelf`;
    }
    if (hover?.kind === 'item') return `Press E to pick up ${getItem(hover.itemId).label}`;
    return null;
  })();

  return (
    <div className="workshop-shell">
      <div className="workshop-stage" ref={stageRef}>
        <Canvas shadows={false} dpr={[1, 2]} camera={{ fov: 70, near: 0.05, far: 80 }}>
          <color attach="background" args={['#e8e2d4']} />
          <fog attach="fog" args={['#f1ebde', 14, 28]} />
          <Lighting />
          <Suspense fallback={null}>
            <Room />
            {(Object.keys(SHELF_LAYOUT) as Shelf[]).map((s) => (
              <ShelfFurniture
                key={s}
                shelfId={s}
                highlight={hover?.kind === 'shelf' && hover.shelfId === s}
              />
            ))}
            <Workbench highlight={hover?.kind === 'bench'} />
            <PrinterTable />
            <Door knocking={state.visitorPrompted} />

            {worldItems.map((w) => (
              <ItemInWorld
                key={`${w.id}-${w.position.x.toFixed(2)}-${w.position.z.toFixed(2)}`}
                item={w}
                hovered={hover?.kind === 'item' && hover.itemId === w.id}
              />
            ))}

            {state.carrying ? <CarriedItem itemId={state.carrying} /> : null}

            <Player enabled={pointerLocked && !state.visitorPrompted && !state.finished && !state.failedHard} />
            <HoverDetector worldItems={worldItems} carrying={state.carrying} onHover={setHover} />

            {!state.visitorPrompted && !state.finished && !state.failedHard ? (
              <PointerLockControls
                onLock={() => setPointerLocked(true)}
                onUnlock={() => setPointerLocked(false)}
              />
            ) : null}
          </Suspense>
        </Canvas>

        {/* Crosshair */}
        {pointerLocked ? <div className="workshop-crosshair" aria-hidden>+</div> : null}

        {/* Top bar */}
        <div className="workshop-hud-top">
          <div className="workshop-hud-round">{round.title}</div>
          <div className="workshop-hud-score">
            <span className="workshop-hud-score-num">{Math.round(normalizedScore * 100)}%</span>
            <div className="workshop-hud-score-track">
              <div
                className="workshop-hud-score-fill"
                style={{
                  width: `${Math.max(0, normalizedScore) * 100}%`,
                  background: normalizedScore >= passingScore ? '#0e6b4e' : '#b06012'
                }}
              />
              <div className="workshop-hud-score-thresh" style={{ left: `${passingScore * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Side objective panel */}
        {panelOpen ? (
          <div className="workshop-hud-objective">
            <div className="workshop-hud-objective-head">
              <span>Objective</span>
              <button type="button" className="workshop-hud-collapse" onClick={() => setPanelOpen(false)} aria-label="Hide objectives">
                ×
              </button>
            </div>
            <p className="workshop-hud-brief">{round.brief}</p>
            <ol className="workshop-hud-steps">
              {round.steps.map((step) => {
                const ok =
                  step.needs.length === 0
                    ? state.benchItems.length === 0 && (!round.visitorEvent || state.visitorHandled)
                    : step.needs.every((id) => state.benchItems.includes(id));
                return (
                  <li key={step.id} className={ok ? 'is-done' : ''}>
                    <span>{ok ? '✓' : '○'}</span> {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <button type="button" className="workshop-hud-objective-toggle" onClick={() => setPanelOpen(true)}>
            Show objective
          </button>
        )}

        {/* Bottom interact prompt */}
        {interactPrompt && pointerLocked ? (
          <div className="workshop-hud-prompt">
            <kbd>E</kbd> {interactPrompt}
          </div>
        ) : null}

        {/* Toasts */}
        <div className="workshop-hud-toasts">
          {state.toasts.map((t) => (
            <div key={t.id} className={`workshop-toast workshop-toast-${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>

        {/* Click-to-play overlay */}
        {!pointerLocked && !state.visitorPrompted && !state.finished && !state.failedHard ? (
          <div className="workshop-hud-start">
            <div className="workshop-hud-start-card">
              <p className="workshop-hud-start-eyebrow">Workshop simulation</p>
              <h3>Click to enter the room</h3>
              <p className="workshop-hud-start-body">
                Use <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to walk. Move the mouse to look. Press <kbd>E</kbd> to pick up tools and place them on the workstation. Press <kbd>Esc</kbd> to release the cursor. <kbd>Tab</kbd> toggles the objective panel.
              </p>
            </div>
          </div>
        ) : null}

        {/* Round nav */}
        {pointerLocked && allStepsDone && !state.finished && !state.failedHard ? (
          <div className="workshop-hud-advance">
            <button type="button" className="button-primary" onClick={advanceRound}>
              {state.roundIdx === ROUNDS.length - 1 ? 'Finish simulation →' : 'Next round →'}
            </button>
          </div>
        ) : null}

        {/* Failure modal */}
        {state.failedHard ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Round failed</p>
              <h3 className="workshop-modal-title">Hard safety violation.</h3>
              <p className="workshop-modal-body">The simulation ended early. Restart to try again.</p>
              <div className="workshop-modal-actions">
                <button type="button" className="button" onClick={restartGame}>
                  Restart simulation
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Pass / fail summary */}
        {state.finished ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">{passed ? 'Passed' : 'Did not pass'}</p>
              <h3 className="workshop-modal-title">
                Final score: {Math.round(normalizedScore * 100)}%
              </h3>
              <p className="workshop-modal-body">
                You need at least {Math.round(passingScore * 100)}% to complete the training.
              </p>
              <div className="workshop-modal-actions">
                {passed ? (
                  <button type="button" className="button-primary" onClick={submitFinal} disabled={submitting}>
                    {submitting ? 'Recording…' : 'Record completion'}
                  </button>
                ) : (
                  <button type="button" className="button" onClick={restartGame}>
                    Restart simulation
                  </button>
                )}
              </div>
              {submitError ? <p className="helper" style={{ color: '#8c1515' }}>{submitError}</p> : null}
            </div>
          </div>
        ) : null}

        {/* Visitor modal */}
        {state.visitorPrompted ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Door event</p>
              <h3 className="workshop-modal-title">Someone is knocking.</h3>
              <p>
                <em>“Hey, I’m a friend of someone in the club. Can I come in to borrow a tool real quick?”</em>
              </p>
              <p className="workshop-modal-body">
                You do not recognize this person. They have not done the training. What do you do?
              </p>
              <div className="workshop-modal-actions">
                <button type="button" className="button" onClick={handleVisitorDecline}>
                  Decline and direct them to email the Exec Board
                </button>
                <button type="button" className="button-ghost" onClick={handleVisitorAccept}>
                  Open the door and let them in
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
