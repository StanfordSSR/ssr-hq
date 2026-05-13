'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Edges } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  POINTS,
  ROUNDS,
  TOTAL_MAX,
  getItem,
  normalizeScore,
  type BuildAction,
  type ItemId,
  type Phase,
  type Shelf
} from './game-logic';
import { PartMesh } from './parts';

type Toast = { id: number; text: string; tone: 'good' | 'bad' };

type BuildInProgress = {
  actionId: string;
  startedAt: number;
  durationMs: number;
  tool?: ItemId;
};

type GameState = {
  roundIdx: number;
  phaseIdx: number;
  scoreRaw: number;
  benchItems: ItemId[];
  carrying: ItemId | null;
  buildActionsDone: Record<string, boolean>;
  buildInProgress: BuildInProgress | null;
  visitorPrompted: boolean;
  visitorHandled: boolean;
  toasts: Toast[];
  finished: boolean;
  failedHard: boolean;
};

const initialState: GameState = {
  roundIdx: 0,
  phaseIdx: 0,
  scoreRaw: 0,
  benchItems: [],
  carrying: null,
  buildActionsDone: {},
  buildInProgress: null,
  visitorPrompted: false,
  visitorHandled: false,
  toasts: [],
  finished: false,
  failedHard: false
};

// ---- Room layout ---------------------------------------------------------------------------

const ROOM_W = 14;
const ROOM_D = 14;
const WALL_H = 3.2;

type ShelfCfg = {
  position: [number, number, number];
  rotY: number;
  width: number;
  depth: number;
  height: number;
  shelves: number;
  label: string;
  tone?: 'normal' | 'forbidden';
};

const SHELF_LAYOUT: Record<Shelf, ShelfCfg> = {
  'hand-tools':    { position: [-6.85,  0, -3.3], rotY:  Math.PI / 2, width: 3.4, depth: 0.3, height: 2.4, shelves: 3, label: 'Tool wall' },
  'filament':      { position: [-6.85,  0,  2.5], rotY:  Math.PI / 2, width: 4.0, depth: 0.5, height: 1.6, shelves: 2, label: 'Filament' },
  'printed-parts': { position: [ 2.6,  0, -6.85], rotY: 0,             width: 2.6, depth: 0.5, height: 1.6, shelves: 2, label: 'Printed parts' },
  'measurement':   { position: [ 6.85,  0, -4.0], rotY: -Math.PI / 2, width: 2.4, depth: 0.5, height: 2.0, shelves: 3, label: 'Measurement' },
  'electronics':   { position: [ 6.85,  0, -1.6], rotY: -Math.PI / 2, width: 2.0, depth: 0.5, height: 1.6, shelves: 2, label: 'Electronics' },
  'screws':        { position: [-2.8,  0,  6.85], rotY: Math.PI,       width: 2.8, depth: 0.5, height: 1.4, shelves: 2, label: 'Screws' },
  'forbidden':     { position: [ 0.6,  0,  6.85], rotY: Math.PI,       width: 2.8, depth: 0.5, height: 1.6, shelves: 2, label: 'Misc — NOT for this room', tone: 'forbidden' }
};

const BENCH_CFG = { position: [-2.0, 0, -6.3] as [number, number, number], width: 4.5, depth: 1.2, height: 0.95 };
// Printer table sits clearly inside the room, away from the east wall.
const PRINTER_TABLE_CFG = { position: [5.7, 0, 1.5] as [number, number, number], widthX: 1.3, depthZ: 3.0, height: 0.85 };
const PRUSA_POS: [number, number, number] = [5.7, PRINTER_TABLE_CFG.height, 0.5];
const BAMBU_POS: [number, number, number] = [5.7, PRINTER_TABLE_CFG.height, 2.5];
const DOOR_CFG = { position: [6.99, 0, 5.0] as [number, number, number] };

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
      {/* Polished concrete / epoxy floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.45} metalness={0.05} />
      </mesh>
      {/* Faint grid stripes baked into the floor */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`fx-${i}`} position={[0, 0.001, -ROOM_D / 2 + (i + 1) * (ROOM_D / 8)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ROOM_W - 0.4, 0.012]} />
          <meshStandardMaterial color="#c4b69e" transparent opacity={0.5} />
        </mesh>
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`fz-${i}`} position={[-ROOM_W / 2 + (i + 1) * (ROOM_W / 8), 0.001, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[ROOM_D - 0.4, 0.012]} />
          <meshStandardMaterial color="#c4b69e" transparent opacity={0.5} />
        </mesh>
      ))}
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#fdfbf6" roughness={0.95} />
      </mesh>
      {/* Walls */}
      <mesh position={[0, WALL_H / 2, -ROOM_D / 2]} receiveShadow>
        <boxGeometry args={[ROOM_W, WALL_H, 0.1]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
      </mesh>
      <mesh position={[-ROOM_W / 2, WALL_H / 2, 0]} receiveShadow>
        <boxGeometry args={[0.1, WALL_H, ROOM_D]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
      </mesh>
      <mesh position={[ROOM_W / 2, WALL_H / 2, 0]} receiveShadow>
        <boxGeometry args={[0.1, WALL_H, ROOM_D]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
      </mesh>
      <mesh position={[0, WALL_H / 2, ROOM_D / 2]} receiveShadow>
        <boxGeometry args={[ROOM_W, WALL_H, 0.1]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
      </mesh>
      {/* Baseboard */}
      {[
        { pos: [0, 0.06, -ROOM_D / 2 + 0.06], size: [ROOM_W, 0.12, 0.04] },
        { pos: [0, 0.06, ROOM_D / 2 - 0.06], size: [ROOM_W, 0.12, 0.04] },
        { pos: [-ROOM_W / 2 + 0.06, 0.06, 0], size: [0.04, 0.12, ROOM_D] },
        { pos: [ROOM_W / 2 - 0.06, 0.06, 0], size: [0.04, 0.12, ROOM_D] }
      ].map((t, i) => (
        <mesh key={i} position={t.pos as [number, number, number]}>
          <boxGeometry args={t.size as [number, number, number]} />
          <meshStandardMaterial color="#bfb3a1" />
        </mesh>
      ))}

      {/* Ceiling light fixtures (emissive bars) */}
      {[
        [-3, WALL_H - 0.05, -2],
        [3, WALL_H - 0.05, -2],
        [-3, WALL_H - 0.05, 3],
        [3, WALL_H - 0.05, 3]
      ].map((p, i) => (
        <group key={`fx-${i}`} position={p as [number, number, number]}>
          <mesh>
            <boxGeometry args={[1.6, 0.08, 0.4]} />
            <meshStandardMaterial color="#202020" />
          </mesh>
          <mesh position={[0, -0.045, 0]}>
            <boxGeometry args={[1.5, 0.005, 0.32]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}

      {/* Safety poster on north wall */}
      <group position={[5.0, 1.7, -6.95]}>
        <mesh>
          <boxGeometry args={[0.8, 1.0, 0.02]} />
          <meshStandardMaterial color="#8c1515" />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <boxGeometry args={[0.7, 0.9, 0.005]} />
          <meshStandardMaterial color="#fdfbf6" />
        </mesh>
        <Text position={[0, 0.3, 0.018]} fontSize={0.07} color="#8c1515" anchorX="center" anchorY="middle" fontWeight={700}>
          SAFETY FIRST
        </Text>
        <Text position={[0, 0.1, 0.018]} fontSize={0.04} color="#3a2f24" anchorX="center" anchorY="middle" maxWidth={0.6}>
          No machining · No soldering No fumes · No food
        </Text>
        <Text position={[0, -0.15, 0.018]} fontSize={0.04} color="#3a2f24" anchorX="center" anchorY="middle" maxWidth={0.6}>
          Card access only Door must stay closed
        </Text>
      </group>

      {/* Fire extinguisher near the door */}
      <group position={[6.6, 0, 5.8]}>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 0.45, 16]} />
          <meshStandardMaterial color="#b03a1f" roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.83, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.06, 0.85, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.18]} />
          <meshStandardMaterial color="#2a2a2a" metalness={0.5} />
        </mesh>
      </group>

      {/* Trash bin in the corner */}
      <group position={[-6.3, 0, 5.8]}>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.6, 14]} />
          <meshStandardMaterial color="#5a5a5a" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.625, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.04, 14]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      </group>
    </group>
  );
}

function ShelfFurniture({ shelfId, highlight }: { shelfId: Shelf; highlight: boolean }) {
  const cfg = SHELF_LAYOUT[shelfId];
  const color = cfg.tone === 'forbidden' ? FORBIDDEN_FRAME : SHELF_FRAME_COLOR;
  const shelfStep = cfg.height / (cfg.shelves + 0.5);
  return (
    <group position={cfg.position} rotation={[0, cfg.rotY, 0]}>
      <mesh position={[0, cfg.height / 2, -cfg.depth / 2 - 0.02]}>
        <boxGeometry args={[cfg.width, cfg.height, 0.04]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-cfg.width / 2 + 0.04, cfg.height / 2, 0]}>
        <boxGeometry args={[0.08, cfg.height, cfg.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[cfg.width / 2 - 0.04, cfg.height / 2, 0]}>
        <boxGeometry args={[0.08, cfg.height, cfg.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {Array.from({ length: cfg.shelves }).map((_, i) => (
        <mesh key={i} position={[0, shelfStep * (i + 0.5), 0]}>
          <boxGeometry args={[cfg.width - 0.16, 0.04, cfg.depth - 0.04]} />
          <meshStandardMaterial color="#ece3d3" />
        </mesh>
      ))}
      {highlight ? (
        <mesh position={[0, cfg.height / 2, 0.02]}>
          <boxGeometry args={[cfg.width + 0.1, cfg.height + 0.1, cfg.depth + 0.4]} />
          <meshBasicMaterial color="#ffd34a" transparent opacity={0.18} />
        </mesh>
      ) : null}
      <Text position={[0, cfg.height + 0.15, 0.05]} fontSize={0.16} color={cfg.tone === 'forbidden' ? '#8c1515' : '#3a2f24'} anchorX="center" anchorY="middle">
        {cfg.label}
      </Text>
    </group>
  );
}

function Workbench({ highlight, buildActive }: { highlight: boolean; buildActive: boolean }) {
  const cfg = BENCH_CFG;
  return (
    <group position={cfg.position}>
      {/* Top — thicker beech-style countertop */}
      <mesh position={[0, cfg.height, 0]} castShadow receiveShadow>
        <boxGeometry args={[cfg.width, 0.1, cfg.depth]} />
        <meshStandardMaterial color={BENCH_TOP_COLOR} roughness={0.55} />
        <Edges color="#6a4a26" />
      </mesh>
      {/* Drawer fronts on the front face */}
      {[-1.4, -0.0, 1.4].map((dx, i) => (
        <group key={`drawer-${i}`} position={[dx, cfg.height - 0.18, cfg.depth / 2 - 0.04]}>
          <mesh>
            <boxGeometry args={[1.3, 0.22, 0.02]} />
            <meshStandardMaterial color="#7d5a32" roughness={0.65} />
            <Edges color="#3a2515" />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.18, 0.025, 0.02]} />
            <meshStandardMaterial color="#9a8a64" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Toe-kick */}
      <mesh position={[0, 0.08, cfg.depth / 2 - 0.1]}>
        <boxGeometry args={[cfg.width - 0.04, 0.14, 0.04]} />
        <meshStandardMaterial color="#3a2515" />
      </mesh>
      {/* Back panel against the wall */}
      <mesh position={[0, cfg.height / 2, -cfg.depth / 2 + 0.03]}>
        <boxGeometry args={[cfg.width - 0.04, cfg.height, 0.04]} />
        <meshStandardMaterial color="#3a2515" />
      </mesh>
      {/* Pegboard on the north wall directly above the bench */}
      <group position={[0, cfg.height + 0.95, -cfg.depth / 2 - 0.13]}>
        <mesh>
          <boxGeometry args={[cfg.width - 0.2, 1.4, 0.04]} />
          <meshStandardMaterial color="#e6d9be" roughness={0.85} />
          <Edges color="#7a6a44" />
        </mesh>
        {/* Holes (decorative) */}
        {Array.from({ length: 6 }).flatMap((_, row) =>
          Array.from({ length: 14 }).map((_, col) => (
            <mesh
              key={`peg-${row}-${col}`}
              position={[-1.95 + col * 0.28, -0.55 + row * 0.22, 0.025]}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.01, 8]} />
              <meshStandardMaterial color="#3a2515" />
            </mesh>
          ))
        )}
        {/* Tool silhouettes hanging on the pegboard */}
        <mesh position={[-1.5, 0.2, 0.05]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.04, 0.5, 0.02]} />
          <meshStandardMaterial color="#3a2f24" />
        </mesh>
        <mesh position={[-1.3, 0.2, 0.05]}>
          <boxGeometry args={[0.04, 0.5, 0.02]} />
          <meshStandardMaterial color="#3a2f24" />
        </mesh>
        <mesh position={[0.0, 0.2, 0.05]}>
          <boxGeometry args={[0.5, 0.04, 0.02]} />
          <meshStandardMaterial color="#3a2f24" />
        </mesh>
        <mesh position={[1.4, 0.2, 0.05]}>
          <ringGeometry args={[0.16, 0.2, 24]} />
          <meshStandardMaterial color="#3a2f24" />
        </mesh>
        {/* Under-cabinet light strip */}
        <mesh position={[0, -0.78, 0.06]}>
          <boxGeometry args={[cfg.width - 0.4, 0.05, 0.05]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.0} />
        </mesh>
      </group>
      {highlight || buildActive ? (
        <mesh position={[0, cfg.height + 0.07, 0]}>
          <boxGeometry args={[cfg.width + 0.1, 0.08, cfg.depth + 0.1]} />
          <meshBasicMaterial color={buildActive ? '#7ad27a' : '#ffd34a'} transparent opacity={0.4} />
        </mesh>
      ) : null}
      <Text position={[0, cfg.height + 1.85, -cfg.depth / 2 - 0.1]} fontSize={0.16} color="#3a2f24" anchorX="center" anchorY="middle">
        Workstation
      </Text>
    </group>
  );
}

function PrinterTable() {
  const cfg = PRINTER_TABLE_CFG;
  return (
    <group position={cfg.position}>
      {/* Tabletop — extends along Z (north-south) */}
      <mesh position={[0, cfg.height, 0]} castShadow receiveShadow>
        <boxGeometry args={[cfg.widthX, 0.08, cfg.depthZ]} />
        <meshStandardMaterial color="#cabba0" roughness={0.7} />
        <Edges color="#7a6a4a" />
      </mesh>
      {/* Legs */}
      {[
        [-cfg.widthX / 2 + 0.1, cfg.height / 2, -cfg.depthZ / 2 + 0.1],
        [cfg.widthX / 2 - 0.1, cfg.height / 2, -cfg.depthZ / 2 + 0.1],
        [-cfg.widthX / 2 + 0.1, cfg.height / 2, cfg.depthZ / 2 - 0.1],
        [cfg.widthX / 2 - 0.1, cfg.height / 2, cfg.depthZ / 2 - 0.1]
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, cfg.height, 0.08]} />
          <meshStandardMaterial color="#4a3a26" />
        </mesh>
      ))}
      {/* Under-shelf */}
      <mesh position={[0, cfg.height - 0.7, 0]}>
        <boxGeometry args={[cfg.widthX - 0.1, 0.05, cfg.depthZ - 0.1]} />
        <meshStandardMaterial color="#a89776" />
      </mesh>
    </group>
  );
}

function PrusaPrinter({ highlight, buildActive }: { highlight: boolean; buildActive: boolean }) {
  return (
    <group position={PRUSA_POS}>
      {/* Outer enclosure — orange CoreXY frame */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.78, 0.84, 0.78]} />
        <meshStandardMaterial color="#ec6b1a" roughness={0.45} metalness={0.2} />
        <Edges color="#7a3308" />
      </mesh>
      {/* Front clear panel */}
      <mesh position={[0, 0.42, 0.391]}>
        <boxGeometry args={[0.66, 0.66, 0.005]} />
        <meshStandardMaterial color="#101020" transparent opacity={0.55} roughness={0.05} metalness={0.4} />
      </mesh>
      {/* Internal build plate (peeking through) */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.55, 0.04, 0.55]} />
        <meshStandardMaterial color="#c6c6c6" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Top handle */}
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.5, 0.05, 0.08]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* Side spool holder */}
      <group position={[-0.42, 0.55, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.12, 8]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[-0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.14, 0.05, 24]} />
          <meshStandardMaterial color="#1f5fa6" />
        </mesh>
      </group>
      {/* Front display */}
      <mesh position={[0.2, 0.18, 0.392]}>
        <boxGeometry args={[0.12, 0.05, 0.005]} />
        <meshStandardMaterial color="#7aa478" emissive="#7aa478" emissiveIntensity={0.6} />
      </mesh>
      {/* Highlight ring on the floor */}
      {(highlight || buildActive) ? (
        <mesh position={[0, -0.83, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 28]} />
          <meshBasicMaterial color={buildActive ? '#7ad27a' : '#ffd34a'} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <Text position={[0, 1.0, 0]} fontSize={0.11} color="#3a2f24" anchorX="center" anchorY="middle">
        Prusa Core One+
      </Text>
    </group>
  );
}

function BambuPrinter({ highlight, buildActive }: { highlight: boolean; buildActive: boolean }) {
  return (
    <group position={BAMBU_POS}>
      {/* Main enclosure — dark grey with green accents */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.78, 0.9, 0.78]} />
        <meshStandardMaterial color="#262626" roughness={0.35} metalness={0.25} />
        <Edges color="#0a0a0a" />
      </mesh>
      {/* Green logo strip */}
      <mesh position={[0, 0.85, 0.391]}>
        <boxGeometry args={[0.6, 0.06, 0.005]} />
        <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.3} />
      </mesh>
      {/* Front panel — glass */}
      <mesh position={[0, 0.45, 0.391]}>
        <boxGeometry args={[0.66, 0.66, 0.005]} />
        <meshStandardMaterial color="#101020" transparent opacity={0.55} roughness={0.05} metalness={0.4} />
      </mesh>
      {/* Internal build plate */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.55, 0.04, 0.55]} />
        <meshStandardMaterial color="#c6c6c6" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Top with handle */}
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[0.4, 0.04, 0.08]} />
        <meshStandardMaterial color="#444" metalness={0.5} />
      </mesh>
      {/* AMS unit on the side */}
      <group position={[-0.55, 0.35, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.4, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.4} />
          <Edges color="#0a0a0a" />
        </mesh>
        {/* AMS lid stripe */}
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[0.3, 0.02, 0.4]} />
          <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.4} />
        </mesh>
        {/* Spool slots */}
        {[-0.13, 0, 0.13].map((dz, i) => (
          <mesh key={i} position={[0.16, 0, dz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.04, 18]} />
            <meshStandardMaterial color={['#1f5fa6', '#0e6b4e', '#e2c200'][i]} />
          </mesh>
        ))}
      </group>
      {/* Front touchscreen */}
      <mesh position={[0.18, 0.18, 0.392]}>
        <boxGeometry args={[0.16, 0.09, 0.005]} />
        <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.6} />
      </mesh>
      {(highlight || buildActive) ? (
        <mesh position={[0, -0.83, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.68, 28]} />
          <meshBasicMaterial color={buildActive ? '#7ad27a' : '#ffd34a'} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <Text position={[0, 1.05, 0]} fontSize={0.11} color="#3a2f24" anchorX="center" anchorY="middle">
        Bambu H2D
      </Text>
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
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[0.06, 2.0, 1.0]} />
          <meshStandardMaterial color={knocking ? '#b03a1f' : '#3a2515'} />
        </mesh>
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

// ---- Build animation: the active tool spins above the bench ---------------------------------

function BuildToolAnimation({
  buildInProgress,
  location
}: {
  buildInProgress: BuildInProgress | null;
  location: 'workstation' | 'bambu' | 'prusa';
}) {
  const ref = useRef<THREE.Group>(null);
  const base =
    location === 'bambu'
      ? ([BAMBU_POS[0], BAMBU_POS[1] + 0.85, BAMBU_POS[2]] as [number, number, number])
      : location === 'prusa'
        ? ([PRUSA_POS[0], PRUSA_POS[1] + 0.85, PRUSA_POS[2]] as [number, number, number])
        : ([BENCH_CFG.position[0], BENCH_CFG.height + 0.35, BENCH_CFG.position[2]] as [number, number, number]);
  useFrame(() => {
    if (!ref.current || !buildInProgress) return;
    const t = (Date.now() - buildInProgress.startedAt) / buildInProgress.durationMs;
    ref.current.rotation.y = t * Math.PI * 4;
    ref.current.position.y = base[1] + Math.sin(t * Math.PI * 6) * 0.05;
  });
  if (!buildInProgress?.tool) return null;
  return (
    <group ref={ref} position={base}>
      <PartMesh id={buildInProgress.tool} />
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
  const localY = (cfg.height / (cfg.shelves + 0.5)) * 0.5 + 0.16;
  const worldX = cfg.position[0] + cos * localX;
  const worldZ = cfg.position[2] - sin * localX;
  return [worldX, localY, worldZ];
}

function getBenchSlotPos(slotIndex: number, slotCount: number): [number, number, number] {
  const benchTop = BENCH_CFG.height + 0.06;
  const spread = BENCH_CFG.width - 0.6;
  const step = slotCount > 1 ? spread / (slotCount - 1) : 0;
  const localX = slotCount > 1 ? -spread / 2 + step * slotIndex : 0;
  return [BENCH_CFG.position[0] + localX, benchTop, BENCH_CFG.position[2] + 0.3];
}

// ---- Items in world ------------------------------------------------------------------------

type WorldItem = {
  id: ItemId;
  position: THREE.Vector3;
};

function ItemInWorld({ item, hovered }: { item: WorldItem; hovered: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const wobble = hovered ? Math.sin(state.clock.elapsedTime * 6) * 0.04 : 0;
    ref.current.position.set(item.position.x, item.position.y + 0.05 + wobble, item.position.z);
  });
  const def = getItem(item.id);
  return (
    <group ref={ref}>
      <PartMesh id={item.id} />
      <Text position={[0, 0.32, 0]} fontSize={0.085} color={hovered ? '#000000' : '#3a2f24'} anchorX="center" anchorY="middle">
        {def.label}
      </Text>
      {hovered ? (
        <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.24, 24]} />
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
      <PartMesh id={itemId} />
    </group>
  );
}

// ---- Player + interaction -------------------------------------------------------------------

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
  onHover,
  onProximity
}: {
  worldItems: WorldItem[];
  carrying: ItemId | null;
  onHover: (h: Hover) => void;
  onProximity: (zone: 'workstation' | 'bambu' | 'prusa' | null) => void;
}) {
  const { camera } = useThree();
  const lastHoverRef = useRef<string>('');
  const lastZoneRef = useRef<'workstation' | 'bambu' | 'prusa' | null>(null);

  useFrame(() => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Proximity zones — closest one wins
    const zones: Array<{ name: 'workstation' | 'bambu' | 'prusa'; pos: THREE.Vector3; range: number }> = [
      { name: 'workstation', pos: new THREE.Vector3(BENCH_CFG.position[0], 1.0, BENCH_CFG.position[2] + 0.3), range: 2.6 },
      { name: 'bambu', pos: new THREE.Vector3(BAMBU_POS[0], 1.0, BAMBU_POS[2]), range: 2.2 },
      { name: 'prusa', pos: new THREE.Vector3(PRUSA_POS[0], 1.0, PRUSA_POS[2]), range: 2.2 }
    ];
    let bestZone: 'workstation' | 'bambu' | 'prusa' | null = null;
    let bestDist = Infinity;
    for (const z of zones) {
      const d = z.pos.clone().sub(camera.position).length();
      if (d < z.range && d < bestDist) {
        bestDist = d;
        bestZone = z.name;
      }
    }
    if (bestZone !== lastZoneRef.current) {
      lastZoneRef.current = bestZone;
      onProximity(bestZone);
    }

    const benchCenter = zones[0].pos;
    const benchDist = benchCenter.clone().sub(camera.position).length();

    let next: Hover = null;

    if (carrying) {
      const toBench = benchCenter.clone().sub(camera.position);
      const benchDot = forward.dot(toBench.clone().normalize());
      if (benchDist < 3.2 && benchDot > 0.55) {
        next = { kind: 'bench', distance: benchDist };
      }
      const carriedItem = getItem(carrying);
      const cfg = SHELF_LAYOUT[carriedItem.shelf];
      const shelfCenter = new THREE.Vector3(cfg.position[0], cfg.height / 2, cfg.position[2]);
      const toShelf = shelfCenter.clone().sub(camera.position);
      const shelfDist = toShelf.length();
      const shelfDot = forward.dot(toShelf.clone().normalize());
      if (shelfDist < 3.0 && shelfDot > 0.5 && (!next || shelfDist < next.distance)) {
        next = { kind: 'shelf', shelfId: carriedItem.shelf, distance: shelfDist };
      }
    } else {
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
      if (bestItem) next = { kind: 'item', itemId: bestItem.id, distance: bestDist };
    }

    const key = next
      ? next.kind === 'item'
        ? `item-${next.itemId}`
        : next.kind === 'shelf'
          ? `shelf-${next.shelfId}`
          : 'bench'
      : '';
    if (key !== lastHoverRef.current) {
      lastHoverRef.current = key;
      onHover(next);
    }
  });

  return null;
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fff7ea', '#d8ccb0', 0.55]} />
      <directionalLight
        position={[5, 12, 6]}
        intensity={0.85}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0008}
      />
      <pointLight position={[-3, 2.9, -2]} intensity={0.35} distance={9} decay={1.5} color="#ffefd0" />
      <pointLight position={[3, 2.9, -2]} intensity={0.35} distance={9} decay={1.5} color="#ffefd0" />
      <pointLight position={[-3, 2.9, 3]} intensity={0.35} distance={9} decay={1.5} color="#ffefd0" />
      <pointLight position={[3, 2.9, 3]} intensity={0.35} distance={9} decay={1.5} color="#ffefd0" />
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
  const [nearZone, setNearZone] = useState<'workstation' | 'bambu' | 'prusa' | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const nearBench = nearZone === 'workstation';

  const round = ROUNDS[state.roundIdx];
  const phase: Phase | undefined = round.phases[state.phaseIdx];
  const roundComplete = state.phaseIdx >= round.phases.length;

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
        result.push({ id, position: new THREE.Vector3(pos[0], pos[1], pos[2]) });
      });
    });
    state.benchItems.forEach((id, idx) => {
      const pos = getBenchSlotPos(idx, state.benchItems.length);
      result.push({ id, position: new THREE.Vector3(pos[0], pos[1], pos[2]) });
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

  // --- Phase auto-advance: detects when a phase is complete and bumps phaseIdx
  useEffect(() => {
    if (!phase) return;
    let shouldAdvance = false;
    if (phase.kind === 'gather') {
      shouldAdvance = phase.needs.every((id) => state.benchItems.includes(id));
    } else if (phase.kind === 'visitor') {
      shouldAdvance = state.visitorHandled;
    } else if (phase.kind === 'build') {
      shouldAdvance = phase.actions.every((a) => state.buildActionsDone[a.id]);
    } else if (phase.kind === 'return') {
      shouldAdvance = state.benchItems.length === 0;
    }
    if (shouldAdvance) {
      const t = window.setTimeout(() => {
        setState((prev) => {
          if (prev.phaseIdx !== state.phaseIdx) return prev;
          return { ...prev, phaseIdx: prev.phaseIdx + 1 };
        });
      }, 350);
      return () => window.clearTimeout(t);
    }
  }, [phase, state.benchItems, state.visitorHandled, state.buildActionsDone, state.phaseIdx]);

  // --- Trigger visitor modal when we enter the visitor phase
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phase?.kind === 'visitor' && !state.visitorPrompted && !state.visitorHandled) {
      setState((prev) => ({ ...prev, visitorPrompted: true }));
      if (document.pointerLockElement) {
        (document as unknown as { exitPointerLock?: () => void }).exitPointerLock?.();
      }
    }
  }, [phase, state.visitorPrompted, state.visitorHandled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- Pickup / place / return
  const pickupItem = (id: ItemId) => {
    if (state.carrying || state.finished || state.failedHard) return;
    const item = getItem(id);
    if (item.forbidden) {
      setState((prev) => ({ ...prev, scoreRaw: prev.scoreRaw + POINTS.forbiddenPickup }));
      pushToast(`✗ ${item.reason}`, 'bad');
      return;
    }
    setState((prev) => {
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
    setState((prev) => ({ ...prev, carrying: null, benchItems: [...prev.benchItems, prev.carrying!] }));
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
    if (hover?.kind === 'item') pickupItem(hover.itemId);
    else if (hover?.kind === 'bench') placeOnBench();
    else if (hover?.kind === 'shelf') returnToShelf(hover.shelfId);
  };

  // --- Build action: B at bench
  const nextBuildAction: BuildAction | null = (() => {
    if (phase?.kind !== 'build') return null;
    return phase.actions.find((a) => !state.buildActionsDone[a.id]) || null;
  })();

  const startBuildAction = (action: BuildAction) => {
    if (state.buildInProgress) return;
    setState((prev) => ({
      ...prev,
      buildInProgress: {
        actionId: action.id,
        startedAt: Date.now(),
        durationMs: action.durationMs,
        tool: action.tool
      }
    }));
    pushToast(`… ${action.prompt}`, 'good');
    window.setTimeout(() => {
      setState((prev) => {
        if (!prev.buildInProgress || prev.buildInProgress.actionId !== action.id) return prev;
        return {
          ...prev,
          buildInProgress: null,
          buildActionsDone: { ...prev.buildActionsDone, [action.id]: true },
          scoreRaw: prev.scoreRaw + POINTS.buildAction
        };
      });
      pushToast(`✓ ${action.prompt}`, 'good');
    }, action.durationMs);
  };

  // --- Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.visitorPrompted) return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        handleInteract();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        if (!nextBuildAction) return;
        const required = nextBuildAction.at || 'workstation';
        if (nearZone !== required) return;
        startBuildAction(nextBuildAction);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setPanelOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Visitor handling
  const handleVisitorDecline = () => {
    setState((prev) => ({
      ...prev,
      visitorPrompted: false,
      visitorHandled: true,
      scoreRaw: prev.scoreRaw + POINTS.visitorDeclined
    }));
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

  // --- Round complete → advance or finish
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
      phaseIdx: 0,
      benchItems: [],
      carrying: null,
      buildActionsDone: {},
      buildInProgress: null,
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

  // --- HUD prompt
  const interactPrompt = (() => {
    if (state.buildInProgress) {
      const action = phase?.kind === 'build' ? phase.actions.find((a) => a.id === state.buildInProgress?.actionId) : null;
      return action ? `${action.prompt}…` : 'Building…';
    }
    if (state.carrying) {
      if (hover?.kind === 'bench') return 'Press E to place on the workstation';
      if (hover?.kind === 'shelf') return `Press E to return to ${SHELF_LAYOUT[hover.shelfId].label}`;
      return `Carrying ${getItem(state.carrying).label}`;
    }
    if (phase?.kind === 'build' && nextBuildAction) {
      const required = nextBuildAction.at || 'workstation';
      const zoneLabel = required === 'bambu' ? 'Bambu H2D' : required === 'prusa' ? 'Prusa Core One+' : 'workstation';
      if (nearZone === required) {
        return `Press B at the ${zoneLabel} to ${nextBuildAction.prompt.toLowerCase()}`;
      }
      return `Walk to the ${zoneLabel} to ${nextBuildAction.prompt.toLowerCase()}`;
    }
    if (hover?.kind === 'item') return `Press E to pick up ${getItem(hover.itemId).label}`;
    return null;
  })();

  // --- Phase progress visualization for the objective panel
  const phaseSummaries = round.phases.map((p, idx) => {
    const isCurrent = idx === state.phaseIdx;
    const isDone = idx < state.phaseIdx;
    let label = p.label;
    if (p.kind === 'gather') {
      const have = p.needs.filter((id) => state.benchItems.includes(id)).length;
      label = `${p.label} (${have}/${p.needs.length})`;
    } else if (p.kind === 'build') {
      const have = p.actions.filter((a) => state.buildActionsDone[a.id]).length;
      label = `${p.label} (${have}/${p.actions.length})`;
    }
    return { idx, label, isCurrent, isDone };
  });

  return (
    <div className="workshop-shell">
      <div className="workshop-stage">
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 70, near: 0.05, far: 80 }}>
          <color attach="background" args={['#e8e2d4']} />
          <fog attach="fog" args={['#f1ebde', 14, 28]} />
          <Lighting />
          <Suspense fallback={null}>
            <Room />
            {(Object.keys(SHELF_LAYOUT) as Shelf[]).map((s) => (
              <ShelfFurniture key={s} shelfId={s} highlight={hover?.kind === 'shelf' && hover.shelfId === s} />
            ))}
            <Workbench
              highlight={hover?.kind === 'bench'}
              buildActive={Boolean(state.buildInProgress) && (nextBuildAction?.at || 'workstation') === 'workstation'}
            />
            <PrinterTable />
            <PrusaPrinter
              highlight={nearZone === 'prusa' && phase?.kind === 'build' && nextBuildAction?.at === 'prusa'}
              buildActive={Boolean(state.buildInProgress) && state.buildInProgress?.tool != null && (phase?.kind === 'build' && phase.actions.find((a) => a.id === state.buildInProgress?.actionId)?.at === 'prusa')}
            />
            <BambuPrinter
              highlight={nearZone === 'bambu' && phase?.kind === 'build' && nextBuildAction?.at === 'bambu'}
              buildActive={Boolean(state.buildInProgress) && (phase?.kind === 'build' && phase.actions.find((a) => a.id === state.buildInProgress?.actionId)?.at === 'bambu')}
            />
            <Door knocking={state.visitorPrompted} />
            <BuildToolAnimation
              buildInProgress={state.buildInProgress}
              location={
                phase?.kind === 'build' && state.buildInProgress
                  ? (phase.actions.find((a) => a.id === state.buildInProgress?.actionId)?.at || 'workstation')
                  : 'workstation'
              }
            />

            {worldItems.map((w) => (
              <ItemInWorld
                key={`${w.id}-${w.position.x.toFixed(2)}-${w.position.z.toFixed(2)}`}
                item={w}
                hovered={hover?.kind === 'item' && hover.itemId === w.id}
              />
            ))}

            {state.carrying ? <CarriedItem itemId={state.carrying} /> : null}

            <Player enabled={pointerLocked && !state.visitorPrompted && !state.finished && !state.failedHard} />
            <HoverDetector
              worldItems={worldItems}
              carrying={state.carrying}
              onHover={setHover}
              onProximity={setNearZone}
            />

            {!state.visitorPrompted && !state.finished && !state.failedHard ? (
              <PointerLockControls
                onLock={() => setPointerLocked(true)}
                onUnlock={() => setPointerLocked(false)}
              />
            ) : null}
          </Suspense>
        </Canvas>

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

        {/* Objective panel */}
        {panelOpen ? (
          <div className="workshop-hud-objective">
            <div className="workshop-hud-objective-head">
              <span>Objective</span>
              <button type="button" className="workshop-hud-collapse" onClick={() => setPanelOpen(false)} aria-label="Hide">
                ×
              </button>
            </div>
            <p className="workshop-hud-brief">{round.brief}</p>
            <ol className="workshop-hud-steps">
              {phaseSummaries.map((p) => (
                <li key={p.idx} className={p.isDone ? 'is-done' : p.isCurrent ? 'is-current' : ''}>
                  <span>{p.isDone ? '✓' : p.isCurrent ? '▸' : '○'}</span> {p.label}
                </li>
              ))}
            </ol>
            {phase?.kind === 'build' ? (
              <div className="workshop-hud-build">
                <strong>Build steps:</strong>
                <ul>
                  {phase.actions.map((a) => (
                    <li key={a.id} className={state.buildActionsDone[a.id] ? 'is-done' : ''}>
                      <span>{state.buildActionsDone[a.id] ? '✓' : '○'}</span> {a.prompt}
                    </li>
                  ))}
                </ul>
                <p className="workshop-hud-build-hint">
                  Walk up to the workstation and press <kbd>B</kbd> to perform the next step.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="workshop-hud-objective-toggle" onClick={() => setPanelOpen(true)}>
            Show objective
          </button>
        )}

        {interactPrompt && pointerLocked ? (
          <div className="workshop-hud-prompt">{interactPrompt}</div>
        ) : null}

        <div className="workshop-hud-toasts">
          {state.toasts.map((t) => (
            <div key={t.id} className={`workshop-toast workshop-toast-${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>

        {!pointerLocked && !state.visitorPrompted && !state.finished && !state.failedHard ? (
          <div className="workshop-hud-start">
            <div className="workshop-hud-start-card">
              <p className="workshop-hud-start-eyebrow">Workshop simulation</p>
              <h3>Click to enter the room</h3>
              <p className="workshop-hud-start-body">
                <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> walk · mouse looks · <kbd>E</kbd> pick up / place / return · <kbd>B</kbd> build at the workstation · <kbd>Tab</kbd> toggle objectives · <kbd>Esc</kbd> release cursor.
              </p>
            </div>
          </div>
        ) : null}

        {pointerLocked && roundComplete && !state.finished && !state.failedHard ? (
          <div className="workshop-hud-advance">
            <button type="button" className="button-primary" onClick={advanceRound}>
              {state.roundIdx === ROUNDS.length - 1 ? 'Finish simulation →' : 'Next round →'}
            </button>
          </div>
        ) : null}

        {state.failedHard ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Round failed</p>
              <h3 className="workshop-modal-title">Hard safety violation.</h3>
              <p className="workshop-modal-body">The simulation ended early. Restart to try again.</p>
              <div className="workshop-modal-actions">
                <button type="button" className="button" onClick={restartGame}>Restart simulation</button>
              </div>
            </div>
          </div>
        ) : null}

        {state.finished ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">{passed ? 'Passed' : 'Did not pass'}</p>
              <h3 className="workshop-modal-title">Final score: {Math.round(normalizedScore * 100)}%</h3>
              <p className="workshop-modal-body">
                You need at least {Math.round(passingScore * 100)}% to complete the training.
              </p>
              <div className="workshop-modal-actions">
                {passed ? (
                  <button type="button" className="button-primary" onClick={submitFinal} disabled={submitting}>
                    {submitting ? 'Recording…' : 'Record completion'}
                  </button>
                ) : (
                  <button type="button" className="button" onClick={restartGame}>Restart simulation</button>
                )}
              </div>
              {submitError ? <p className="helper" style={{ color: '#8c1515' }}>{submitError}</p> : null}
            </div>
          </div>
        ) : null}

        {state.visitorPrompted ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Door event</p>
              <h3 className="workshop-modal-title">Someone is knocking.</h3>
              <p><em>“Hey, I’m a friend of someone in the club. Can I come in to borrow a tool real quick?”</em></p>
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
