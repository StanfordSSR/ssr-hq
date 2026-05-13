'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Edges, Environment, useFBX } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
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
import { BuildMinigame } from './BuildMinigame';
import { FilamentMinigame } from './FilamentMinigame';
import { TorqueMinigame } from './TorqueMinigame';
import { CaliperMinigame } from './CaliperMinigame';

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
  roundStartScore: number;
  benchItems: ItemId[];
  carrying: ItemId | null;
  buildActionsDone: Record<string, boolean>;
  buildInProgress: BuildInProgress | null;
  activeMinigameActionId: string | null;
  visitorMode: 'idle' | 'entering' | 'inside' | 'exiting';
  visitorPromptedAt: number | null;
  visitorTurn: number;
  visitorPlayerLine: string | null;
  visitorWalking: boolean;
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
  roundStartScore: 0,
  benchItems: [],
  carrying: null,
  buildActionsDone: {},
  buildInProgress: null,
  activeMinigameActionId: null,
  visitorMode: 'idle',
  visitorPromptedAt: null,
  visitorTurn: 0,
  visitorPlayerLine: null,
  visitorWalking: false,
  visitorPrompted: false,
  visitorHandled: false,
  toasts: [],
  finished: false,
  failedHard: false
};

// ---- Room layout — compact industrial workshop (~12m × 10m) -------------------------------

const ROOM_W = 12;
const ROOM_D = 10;
const WALL_H = 3.4;

// ---- Visitor dialogue script -------------------------------------------------------------

const VISITOR_LINES = [
  "Yo, sup! I'm tryna get some batteries — Anish told me I could grab some. Mind if I look around?",
  "Pls bro, just two AAs. Anish literally said it's chill. I'll be in and out in like 30 seconds.",
  "Bruh c'mon. Tell you what — I'll Venmo you twenty bucks right now. For two batteries. Nobody has to know.",
  "Aight aight, my bad bro. I'll just text Anish to come down himself. Peace."
];

const DECLINE_LABELS = [
  "Sorry man, you can't be in here — you haven't done the training.",
  "I really can't, pls just have Anish come down and let you in.",
  "Bro, that's literally bribery. No. Out."
];

const BAD_OPTION_LABELS = [
  "Let them grab the batteries",
  'Fine, ONE quick look — but be fast',
  'Take the $20 and let them in (bribery)'
];

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
  'hand-tools':    { position: [-5.85,  0, -2.4], rotY:  Math.PI / 2, width: 3.2, depth: 0.3, height: 2.3, shelves: 3, label: 'Tool wall' },
  'filament':      { position: [-5.85,  0,  1.8], rotY:  Math.PI / 2, width: 3.4, depth: 0.5, height: 1.6, shelves: 2, label: 'Filament' },
  'printed-parts': { position: [ 1.8,  0, -4.85], rotY: 0,             width: 2.4, depth: 0.5, height: 1.6, shelves: 2, label: 'Printed parts' },
  'measurement':   { position: [ 5.85,  0, -2.7], rotY: -Math.PI / 2, width: 2.2, depth: 0.5, height: 2.0, shelves: 3, label: 'Measurement' },
  'electronics':   { position: [ 5.85,  0, -0.6], rotY: -Math.PI / 2, width: 1.8, depth: 0.5, height: 1.6, shelves: 2, label: 'Electronics' },
  'screws':        { position: [-2.4,  0,  4.85], rotY: Math.PI,       width: 2.6, depth: 0.5, height: 1.4, shelves: 2, label: 'Screws' },
  'forbidden':     { position: [ 0.6,  0,  4.85], rotY: Math.PI,       width: 2.6, depth: 0.5, height: 1.6, shelves: 2, label: 'Misc — NOT for this room', tone: 'forbidden' }
};

const BENCH_CFG = { position: [-1.8, 0, -4.4] as [number, number, number], width: 4.2, depth: 1.2, height: 0.95 };
const PRINTER_TABLE_CFG = { position: [4.85, 0, 1.6] as [number, number, number], widthX: 1.3, depthZ: 2.6, height: 0.85 };
const PRUSA_POS: [number, number, number] = [4.85, PRINTER_TABLE_CFG.height, 0.6];
const BAMBU_POS: [number, number, number] = [4.85, PRINTER_TABLE_CFG.height, 2.6];
const DOOR_CFG = { position: [5.99, 0, 3.6] as [number, number, number] };
const DOOR_W = 1.0;
const DOOR_H = 2.1;

const FLOOR_COLOR = '#a8a39a';
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
      {/* East wall — split around the door opening so the glass shows through */}
      {(() => {
        const doorZStart = DOOR_CFG.position[2] - DOOR_W / 2;
        const doorZEnd = DOOR_CFG.position[2] + DOOR_W / 2;
        const southZStart = -ROOM_D / 2;
        const southLen = doorZStart - southZStart;
        const northLen = ROOM_D / 2 - doorZEnd;
        // Lintel sits flush right above the door's metal header.
        const lintelStart = DOOR_H + 0.1;
        const lintelHeight = WALL_H - lintelStart;
        return (
          <>
            <mesh position={[ROOM_W / 2, WALL_H / 2, southZStart + southLen / 2]} receiveShadow>
              <boxGeometry args={[0.1, WALL_H, southLen]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
            </mesh>
            <mesh position={[ROOM_W / 2, WALL_H / 2, doorZEnd + northLen / 2]} receiveShadow>
              <boxGeometry args={[0.1, WALL_H, northLen]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
            </mesh>
            {/* Lintel directly above the door header */}
            <mesh
              position={[ROOM_W / 2, lintelStart + lintelHeight / 2, DOOR_CFG.position[2]]}
              receiveShadow
            >
              <boxGeometry args={[0.1, lintelHeight, DOOR_W]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.8} />
            </mesh>
          </>
        );
      })()}
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
      <group position={[3.6, 1.8, -4.95]}>
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
      <group position={[5.6, 0, 4.5]}>
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
      <group position={[-5.3, 0, 4.6]}>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.6, 14]} />
          <meshStandardMaterial color="#5a5a5a" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.625, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.04, 14]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      </group>

      {/* Recycle bin next to trash */}
      <group position={[-4.7, 0, 4.6]}>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 0.6, 14]} />
          <meshStandardMaterial color="#1f5fa6" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.625, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.04, 14]} />
          <meshStandardMaterial color="#14365f" />
        </mesh>
      </group>

      {/* Red tool chest on wheels (Snap-on style). Moved out of the line of sight
          to the tool wall so the items on that shelf are visible. */}
      <group position={[-3.5, 0, 2.2]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[0.7, 1.0, 0.5]} />
          <meshStandardMaterial color="#a01a1a" roughness={0.4} metalness={0.2} />
          <Edges color="#3a0808" />
        </mesh>
        {/* Drawer fronts */}
        {[0.15, 0.4, 0.65, 0.9].map((y, i) => (
          <group key={i} position={[0, y, 0.26]}>
            <mesh>
              <boxGeometry args={[0.66, 0.18, 0.01]} />
              <meshStandardMaterial color="#8a1414" />
              <Edges color="#3a0808" />
            </mesh>
            <mesh position={[0, 0, 0.008]}>
              <boxGeometry args={[0.4, 0.025, 0.02]} />
              <meshStandardMaterial color="#1a1a1a" metalness={0.7} />
            </mesh>
          </group>
        ))}
        {/* Casters */}
        {[[-0.28, 0.04, -0.20], [0.28, 0.04, -0.20], [-0.28, 0.04, 0.20], [0.28, 0.04, 0.20]].map((p, i) => (
          <mesh key={i} position={p as [number, number, number]}>
            <sphereGeometry args={[0.05, 12, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
        {/* Top tray label */}
        <Text position={[0, 1.1, 0]} fontSize={0.08} color="#ffffff" anchorX="center" anchorY="middle">
          Tool chest
        </Text>
      </group>

      {/* Floor clutter — cardboard boxes (industrial mess realism) */}
      <group position={[-3.8, 0, 3.7]} rotation={[0, 0.4, 0]}>
        <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.36, 0.4]} />
          <meshStandardMaterial color="#a17a4b" roughness={0.85} />
          <Edges color="#6a4a26" />
        </mesh>
        <mesh position={[0, 0.37, 0]}>
          <boxGeometry args={[0.46, 0.005, 0.41]} />
          <meshStandardMaterial color="#7a5a32" />
        </mesh>
      </group>
      <group position={[-3.3, 0, 4.0]} rotation={[0, -0.2, 0]}>
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.28, 0.32]} />
          <meshStandardMaterial color="#9c734a" roughness={0.85} />
          <Edges color="#5a3f1a" />
        </mesh>
      </group>
      <group position={[3.6, 0, -3.2]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.55, 0.44, 0.35]} />
          <meshStandardMaterial color="#a8804f" roughness={0.85} />
          <Edges color="#6a4a26" />
        </mesh>
      </group>

      {/* Water bottle on the printer table */}
      <group position={[5.0, 0.85, 1.6]}>
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.24, 16]} />
          <meshStandardMaterial color="#5db0d8" transparent opacity={0.55} roughness={0.1} metalness={0.0} />
        </mesh>
        <mesh position={[0, 0.255, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.02, 10]} />
          <meshStandardMaterial color="#1a5070" />
        </mesh>
      </group>

      {/* Coffee cup on the workstation */}
      <group position={[-3.5, 1.0, -4.2]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.035, 0.08, 14]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        <mesh position={[0.045, 0.04, 0]}>
          <torusGeometry args={[0.02, 0.006, 6, 12]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>

      {/* Notebook on the workstation */}
      <group position={[-2.0, 0.955, -4.2]}>
        <mesh position={[0, 0.008, 0]} castShadow>
          <boxGeometry args={[0.22, 0.015, 0.28]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.21, 0.001, 0.27]} />
          <meshStandardMaterial color="#fdfbf6" />
        </mesh>
      </group>

      {/* Loose papers on the workstation */}
      <group position={[-0.6, 0.955, -4.2]} rotation={[0, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.001, 0.22]} />
          <meshStandardMaterial color="#fdfbf6" />
        </mesh>
      </group>

      {/* Exposed ceiling ducts and pipes — silver HVAC and black water pipe */}
      <group>
        {/* Main silver duct running east-west */}
        <mesh position={[1.0, WALL_H - 0.35, -2.0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, ROOM_W - 1.0, 20]} />
          <meshStandardMaterial color="#d8d4cb" roughness={0.45} metalness={0.5} />
        </mesh>
        {/* Bracket holding the main duct */}
        {[-3, 0, 3].map((x, i) => (
          <mesh key={`db-${i}`} position={[x, WALL_H - 0.18, -2.0]}>
            <boxGeometry args={[0.03, 0.34, 0.08]} />
            <meshStandardMaterial color="#5a5a5a" metalness={0.6} />
          </mesh>
        ))}
        {/* Branching duct */}
        <mesh position={[1.6, WALL_H - 0.6, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 1.4, 16]} />
          <meshStandardMaterial color="#d8d4cb" roughness={0.45} metalness={0.5} />
        </mesh>
        {/* Black water pipe */}
        <mesh position={[-2.0, WALL_H - 0.22, 1.0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, ROOM_W - 2.0, 14]} />
          <meshStandardMaterial color="#101010" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Yellow caution tape strip on a pipe */}
        <mesh position={[1.5, WALL_H - 0.22, 1.0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.062, 0.062, 0.12, 14]} />
          <meshStandardMaterial color="#e8b500" />
        </mesh>
        {/* Second narrow black pipe running parallel */}
        <mesh position={[-2.0, WALL_H - 0.4, 1.4]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, ROOM_W - 1.5, 12]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        {/* Conduit cables along the south-east */}
        <mesh position={[3.5, WALL_H - 0.5, -0.5]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.025, 0.025, 4.0, 8]} />
          <meshStandardMaterial color="#5a4a3a" />
        </mesh>
        {/* North-south thin conduits across ceiling */}
        {[-1.5, 0.0, 1.0].map((x, i) => (
          <mesh key={`nsc-${i}`} position={[x, WALL_H - 0.16, 0.0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.015, 0.015, ROOM_D - 0.6, 8]} />
            <meshStandardMaterial color="#3a3a3a" />
          </mesh>
        ))}
        {/* Vent grille on the ceiling */}
        <mesh position={[2.0, WALL_H - 0.02, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.02]} />
          <meshStandardMaterial color="#cccccc" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Second vent grille */}
        <mesh position={[-2.5, WALL_H - 0.02, 2.0]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.02]} />
          <meshStandardMaterial color="#cccccc" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>

      {/* Electrical breaker panel on the south wall (next to the door) */}
      <group position={[4.4, 1.7, ROOM_D / 2 - 0.06]}>
        <mesh>
          <boxGeometry args={[0.45, 0.55, 0.1]} />
          <meshStandardMaterial color="#7a7a7a" metalness={0.55} roughness={0.45} />
          <Edges color="#2a2a2a" />
        </mesh>
        <mesh position={[0, 0, 0.052]}>
          <boxGeometry args={[0.4, 0.5, 0.005]} />
          <meshStandardMaterial color="#9a9a9a" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Conduit pipe going down to floor */}
        <mesh position={[0, -0.95, 0.04]}>
          <cylinderGeometry args={[0.025, 0.025, 1.4, 8]} />
          <meshStandardMaterial color="#5a5a5a" metalness={0.5} />
        </mesh>
      </group>

      {/* Smaller electrical box on north wall */}
      <group position={[-2.0, 2.4, -ROOM_D / 2 + 0.06]}>
        <mesh>
          <boxGeometry args={[0.25, 0.3, 0.08]} />
          <meshStandardMaterial color="#5a5a5a" metalness={0.5} />
        </mesh>
      </group>

      {/* Wall outlets dotted around */}
      {[
        [-4.0, 0.4, -ROOM_D / 2 + 0.055],
        [1.0, 0.4, -ROOM_D / 2 + 0.055],
        [-ROOM_W / 2 + 0.055, 0.4, 0.5],
        [-ROOM_W / 2 + 0.055, 0.4, 3.0]
      ].map((p, i) => (
        <group key={`outlet-${i}`} position={p as [number, number, number]}>
          <mesh>
            <boxGeometry args={[0.1, 0.14, 0.01]} />
            <meshStandardMaterial color="#fdfbf6" />
          </mesh>
          <mesh position={[0, 0.025, 0.006]}>
            <boxGeometry args={[0.022, 0.025, 0.005]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0, -0.025, 0.006]}>
            <boxGeometry args={[0.022, 0.025, 0.005]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </group>
      ))}

      {/* Black backpack slumped on the floor (matches the photo) */}
      <group position={[1.5, 0, 0.5]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.4, 0.4, 0.22]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.36, 0.04]}>
          <boxGeometry args={[0.32, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.85} />
        </mesh>
        {/* Strap loop on top */}
        <mesh position={[0, 0.44, 0]}>
          <torusGeometry args={[0.05, 0.012, 8, 12]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
      </group>

      {/* Another smaller bag */}
      <group position={[-1.0, 0, 1.5]} rotation={[0, -0.3, 0]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[0.32, 0.3, 0.18]} />
          <meshStandardMaterial color="#262626" roughness={0.85} />
        </mesh>
      </group>

      {/* Drone sitting up on the measurement shelf — loaded from the real STL */}
      <DroneSTL />


      {/* "Engineered for Efficiency" sign leaning against the wall */}
      <group position={[3.0, 0, ROOM_D / 2 - 0.5]} rotation={[0, 0, -0.05]}>
        <mesh position={[0, 0.45, 0]} rotation={[-0.1, 0, 0]} castShadow>
          <boxGeometry args={[0.6, 0.9, 0.02]} />
          <meshStandardMaterial color="#1f4d8a" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.65, 0.012]} rotation={[-0.1, 0, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.005]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>

      {/* Hanging cables from ceiling — small visual */}
      {[-3.5, 4.0].map((x, i) => (
        <mesh key={`hc-${i}`} position={[x, WALL_H - 0.6, -2.0]}>
          <cylinderGeometry args={[0.005, 0.005, 1.2, 6]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
    </group>
  );
}

// ---- Drone (real STL model) ---------------------------------------------------------------

function DroneSTL() {
  // Load the STL the user added under /public/drone.stl
  const geometry = useLoader(STLLoader, '/drone.stl');

  const { centeredGeometry, fitScale } = useMemo(() => {
    const g = (geometry as THREE.BufferGeometry).clone();
    g.computeBoundingBox();
    g.computeVertexNormals();
    const box = g.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    g.translate(-center.x, -center.y, -center.z);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    // Scale so the drone is ~0.6m across its widest axis
    const scale = 0.6 / longest;
    return { centeredGeometry: g, fitScale: scale };
  }, [geometry]);

  return (
    <group position={[5.5, 1.36, -2.7]} rotation={[0, 0, 0]} scale={fitScale}>
      <mesh geometry={centeredGeometry} castShadow>
        <meshStandardMaterial color="#2a2a2a" metalness={0.45} roughness={0.45} />
      </mesh>
    </group>
  );
}

// ---- Decorations layered into the shelves (blue parts bins) -------------------------------

function ShelfBins({ shelfId }: { shelfId: Shelf }) {
  const cfg = SHELF_LAYOUT[shelfId];
  // Stack a row of small blue parts bins on the lowest shelf level — only on the
  // "main" shelves the photos show them on.
  if (shelfId === 'forbidden') return null;
  const bins = 4;
  const shelfStep = cfg.height / (cfg.shelves + 0.5);
  return (
    <group position={cfg.position} rotation={[0, cfg.rotY, 0]}>
      {Array.from({ length: bins }).map((_, i) => {
        const spread = cfg.width - 0.6;
        const x = -spread / 2 + (spread / (bins - 1)) * i;
        const y = shelfStep * (cfg.shelves - 0.5) + 0.08;
        const color = i % 2 === 0 ? '#1f4d8a' : '#1a5fa6';
        return (
          <group key={i} position={[x, y, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.16, 0.1, 0.18]} />
              <meshStandardMaterial color={color} roughness={0.5} />
              <Edges color="#0a2a5a" />
            </mesh>
            {/* Label tab on front */}
            <mesh position={[0, 0.025, 0.091]}>
              <boxGeometry args={[0.12, 0.025, 0.002]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        );
      })}
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
  // Body comes from the user-supplied h2d.stl. We keep the procedural AMS box,
  // touchscreen, label, and floor highlight around it so it still reads as the
  // workshop's interactable printer station.
  const rawGeometry = useLoader(STLLoader, '/h2d.stl');

  const { centeredGeometry, fitScale, fitHeight } = useMemo(() => {
    const g = (rawGeometry as THREE.BufferGeometry).clone();
    g.computeBoundingBox();
    g.computeVertexNormals();
    const box = g.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    g.translate(-center.x, -center.y, -center.z);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    // Real Bambu H2D is ~0.46m on its longest side, but our procedural one was
    // 0.9m so we keep it at 0.85m so the player's eyeline still hits it well.
    const scale = 0.85 / longest;
    return { centeredGeometry: g, fitScale: scale, fitHeight: size.z * scale };
  }, [rawGeometry]);

  // STLs from CAD are typically Z-up. Rotate -π/2 around X to bring them to
  // Y-up so the printer sits upright on the table. If yours imports rotated
  // wrong, tweak this rotation.
  const stlRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

  return (
    <group position={BAMBU_POS}>
      <group position={[0, fitHeight / 2 + 0.04, 0]}>
        <group scale={fitScale} rotation={stlRotation}>
          <mesh geometry={centeredGeometry} castShadow>
            <meshStandardMaterial color="#1f2326" metalness={0.55} roughness={0.42} />
          </mesh>
        </group>
      </group>
      {/* Green Bambu accent stripe across the front, sized to the model */}
      <mesh position={[0, fitHeight - 0.06, 0.39]}>
        <boxGeometry args={[0.5, 0.04, 0.005]} />
        <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.4} />
      </mesh>
      {/* AMS unit on the side — kept from the procedural model */}
      <group position={[-0.55, 0.35, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.4, 0.4]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.4} />
          <Edges color="#0a0a0a" />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[0.3, 0.02, 0.4]} />
          <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.4} />
        </mesh>
        {[-0.13, 0, 0.13].map((dz, i) => (
          <mesh key={i} position={[0.16, 0, dz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.04, 18]} />
            <meshStandardMaterial color={['#1f5fa6', '#0e6b4e', '#e2c200'][i]} />
          </mesh>
        ))}
      </group>
      {/* Front touchscreen */}
      <mesh position={[0.18, 0.2, 0.392]}>
        <boxGeometry args={[0.16, 0.09, 0.005]} />
        <meshStandardMaterial color="#1f8a4a" emissive="#1f8a4a" emissiveIntensity={0.6} />
      </mesh>
      {(highlight || buildActive) ? (
        <mesh position={[0, -0.83, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.68, 28]} />
          <meshBasicMaterial color={buildActive ? '#7ad27a' : '#ffd34a'} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      <Text position={[0, fitHeight + 0.18, 0]} fontSize={0.11} color="#3a2f24" anchorX="center" anchorY="middle">
        Bambu H2D
      </Text>
    </group>
  );
}

function Door({ openAmount, knocking }: { openAmount: number; knocking: boolean }) {
  // Glass door that swings inward on its hinge. The hinge sits at the south edge
  // of the doorway (the +Z edge for our east-wall orientation). openAmount: 0 = closed,
  // 1 = fully open (~95° inward).
  const swingRef = useRef<THREE.Group>(null);
  const knockOffset = useRef(0);
  useFrame((state) => {
    if (!swingRef.current) return;
    const target = -openAmount * (Math.PI / 1.9); // swing inward (-X side)
    // Smoothly approach target
    swingRef.current.rotation.y += (target - swingRef.current.rotation.y) * 0.18;
    // Knocking wiggle only when fully closed
    if (knocking && openAmount < 0.05) {
      knockOffset.current = Math.sin(state.clock.elapsedTime * 9) * 0.03;
    } else {
      knockOffset.current *= 0.85;
    }
    swingRef.current.position.x = knockOffset.current;
  });
  const frameColor = '#9a9a9a';
  return (
    <group>
      {/* Frame — flush against the door, no floating transom */}
      <group position={[DOOR_CFG.position[0], 0, DOOR_CFG.position[2]]}>
        {/* Top header tight against the door slab */}
        <mesh position={[0, DOOR_H + 0.05, 0]}>
          <boxGeometry args={[0.12, 0.1, DOOR_W + 0.12]} />
          <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Side jambs */}
        <mesh position={[0, DOOR_H / 2, DOOR_W / 2 + 0.06]}>
          <boxGeometry args={[0.12, DOOR_H + 0.08, 0.06]} />
          <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, DOOR_H / 2, -DOOR_W / 2 - 0.06]}>
          <boxGeometry args={[0.12, DOOR_H + 0.08, 0.06]} />
          <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* Door slab — hinged at the +Z (south) edge of the doorway so the swing
          group rotates around the hinge instead of the door center. The inner
          group offsets the slab by -DOOR_W/2 so its geometry is centered. */}
      <group position={[DOOR_CFG.position[0], 0, DOOR_CFG.position[2] + DOOR_W / 2]}>
        <group ref={swingRef}>
          {/* Hinge cylinder */}
          <mesh position={[0, DOOR_H / 2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, DOOR_H, 8]} />
            <meshStandardMaterial color={frameColor} metalness={0.8} roughness={0.3} />
          </mesh>
          <group position={[0, 0, -DOOR_W / 2]}>
            {/* Bottom solid metal panel */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[0.04, 1.0, DOOR_W]} />
              <meshStandardMaterial color="#e8e4dc" metalness={0.4} roughness={0.45} />
            </mesh>
            {/* Top glass panel */}
            <mesh position={[0, 1.55, 0]}>
              <boxGeometry args={[0.02, 1.1, DOOR_W - 0.18]} />
              <meshPhysicalMaterial
                color="#dfe8ef"
                transparent
                opacity={0.28}
                transmission={0.78}
                roughness={0.04}
                metalness={0.0}
                ior={1.5}
                thickness={0.05}
              />
            </mesh>
            {/* Glass mounting frame */}
            <mesh position={[0, 2.1, 0]}>
              <boxGeometry args={[0.03, 0.04, DOOR_W - 0.18]} />
              <meshStandardMaterial color={frameColor} metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.0, 0]}>
              <boxGeometry args={[0.03, 0.04, DOOR_W - 0.18]} />
              <meshStandardMaterial color={frameColor} metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Door closer at top */}
            <mesh position={[-0.06, DOOR_H - 0.05, 0]}>
              <boxGeometry args={[0.1, 0.06, 0.4]} />
              <meshStandardMaterial color="#5a5a5a" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* Lever handle on the inside */}
            <mesh position={[-0.05, 1.05, -DOOR_W / 2 + 0.12]}>
              <boxGeometry args={[0.06, 0.025, 0.13]} />
              <meshStandardMaterial color="#a8a8a8" metalness={0.8} roughness={0.25} />
            </mesh>
            <mesh position={[-0.05, 1.05, -DOOR_W / 2 + 0.16]}>
              <sphereGeometry args={[0.03, 12, 8]} />
              <meshStandardMaterial color="#a8a8a8" metalness={0.8} roughness={0.25} />
            </mesh>
            {/* Skull sticker */}
            <group position={[0.012, 1.55, 0]}>
              <mesh>
                <boxGeometry args={[0.001, 0.2, 0.2]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <Text
                position={[0.01, 0, 0]}
                fontSize={0.14}
                color="#ec6b1a"
                anchorX="center"
                anchorY="middle"
                rotation={[0, -Math.PI / 2, 0]}
              >
                ☠
              </Text>
            </group>
          </group>
        </group>
      </group>

      {/* "Door" label above */}
      <Text
        position={[DOOR_CFG.position[0] - 0.05, DOOR_H + 0.95, DOOR_CFG.position[2]]}
        fontSize={0.14}
        color="#3a2f24"
        anchorX="center"
        anchorY="middle"
        rotation={[0, -Math.PI / 2, 0]}
      >
        Door
      </Text>
    </group>
  );
}

// ---- Visitor character (Roblox-style humanoid) ---------------------------------------------
//
// Lives OUTSIDE the room (positive X past the east wall). When the visitor event
// triggers, walks from off-screen toward the door, knocks twice, and stays put
// until the player decides.

// ---- Auto-orient player toward visitor on entering ---------------------------------------

function CameraOrient({ active }: { active: boolean }) {
  const { camera } = useThree();
  const targetRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      const targetX = DOOR_CFG.position[0] - 1.8;
      const targetZ = DOOR_CFG.position[2];
      const dx = targetX - camera.position.x;
      const dz = targetZ - camera.position.z;
      targetRef.current = Math.atan2(dx, dz);
    } else {
      targetRef.current = null;
    }
  }, [active, camera]);

  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (targetRef.current === null) return;
    const target = targetRef.current;
    const current = camera.rotation.y;
    let diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.01) {
      targetRef.current = null;
      return;
    }
    const step = Math.sign(diff) * Math.min(Math.abs(diff), delta * 2.6);
    camera.rotation.y = current + step;
    camera.rotation.x *= 0.85; // also flatten any pitch toward horizontal
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

// ---- Rigged Mixamo-style FBX character used as the visitor --------------------------------

// One lazily-loaded animation. Mounted only when its clip is the active one,
// so each FBX is only downloaded the first time it's actually needed.
// Animation updates throttled to ~30fps to save CPU.
function VisitorAnim({ url }: { url: string }) {
  const fbx = useFBX(url);
  const scene = useMemo(() => SkeletonUtils.clone(fbx), [fbx]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const accum = useRef(0);

  useEffect(() => {
    const clip = fbx.animations[0];
    if (clip) mixer.clipAction(clip).play();
    return () => {
      mixer.stopAllAction();
    };
  }, [fbx, mixer]);

  useFrame((_, delta) => {
    accum.current += delta;
    if (accum.current >= 1 / 30) {
      mixer.update(accum.current);
      accum.current = 0;
    }
  });

  return <primitive object={scene} />;
}

function VisitorRig({ mode, beingPushed }: { mode: 'idle' | 'entering' | 'inside' | 'exiting'; beingPushed: boolean }) {
  const showWalk = mode === 'entering' || mode === 'exiting';
  const showBack = mode === 'inside' && beingPushed;
  const showIdle = mode === 'inside' && !beingPushed;
  // Mixamo characters export in cm — scale 0.011 reads ~1.8m tall.
  return (
    <group scale={0.011}>
      {showIdle ? (
        <Suspense fallback={null}>
          <VisitorAnim url="/standing-idle.fbx" />
        </Suspense>
      ) : null}
      {showWalk ? (
        <Suspense fallback={null}>
          <VisitorAnim url="/walking.fbx" />
        </Suspense>
      ) : null}
      {showBack ? (
        <Suspense fallback={null}>
          <VisitorAnim url="/walking-back.fbx" />
        </Suspense>
      ) : null}
    </group>
  );
}

function Visitor({
  mode,
  playerPosRef,
  onArrivedInside,
  onPushedOut,
  onExited
}: {
  mode: 'idle' | 'entering' | 'inside' | 'exiting';
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  onArrivedInside: () => void;
  onPushedOut: () => void;
  onExited: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const modeStartedAt = useRef<number>(0);
  const [beingPushed, setBeingPushed] = useState(false);
  const lastMode = useRef<typeof mode>('idle');
  const arrivedFiredRef = useRef(false);
  const exitedFiredRef = useRef(false);
  const pushedFiredRef = useRef(false);
  const internalXRef = useRef<number | null>(null);

  // Visitor path waypoints
  const outsideX = DOOR_CFG.position[0] + 3.5;
  const insideStandX = DOOR_CFG.position[0] - 1.8; // 1.8m inside the room
  const z = DOOR_CFG.position[2];
  const pushThresholdX = DOOR_CFG.position[0] - 0.3; // Crosses this → considered pushed out

  useEffect(() => {
    if (mode !== lastMode.current) {
      modeStartedAt.current = Date.now();
      lastMode.current = mode;
      if (mode === 'entering') arrivedFiredRef.current = false;
      if (mode === 'inside') {
        pushedFiredRef.current = false;
        internalXRef.current = insideStandX;
      }
      if (mode === 'exiting') exitedFiredRef.current = false;
      if (mode === 'idle') internalXRef.current = null;
    }
  }, [mode, insideStandX]);

  useFrame((state, delta) => {
    if (!ref.current) return;

    if (mode === 'idle') {
      ref.current.position.set(outsideX + 8, 0, z);
      ref.current.rotation.y = Math.PI / 2;
      return;
    }

    const t = (Date.now() - modeStartedAt.current) / 1000;
    const walkDuration = 2.4;
    let posX = outsideX;
    let walking = false;
    let facing = Math.PI / 2; // facing -X (into room)

    if (mode === 'entering') {
      const p = Math.min(1, t / walkDuration);
      posX = outsideX + (insideStandX - outsideX) * p;
      walking = p < 1;
      facing = Math.PI / 2;
      if (p >= 1 && !arrivedFiredRef.current) {
        arrivedFiredRef.current = true;
        onArrivedInside();
      }
    } else if (mode === 'inside') {
      // Player can physically push the visitor by walking into them. Tight
      // contact radius so just walking past doesn't shove them.
      const curX = internalXRef.current ?? insideStandX;
      const px = playerPosRef.current.x;
      const pz = playerPosRef.current.z;
      const dxToPlayer = curX - px;
      const dzToPlayer = z - pz;
      const inZBand = Math.abs(dzToPlayer) < 0.55;
      let nextX = curX;
      // Player must be west of the visitor AND well inside the contact radius.
      let pushing = false;
      if (inZBand && dxToPlayer > 0 && dxToPlayer < 0.55) {
        const pushSpeed = (0.55 - dxToPlayer) * 3.6;
        nextX = curX + pushSpeed * delta;
        pushing = true;
      }
      // Face the player whenever they're around (continuously turning toward
      // wherever the camera is).
      const fdx = px - nextX;
      const fdz = pz - z;
      if (Math.abs(fdx) > 0.001 || Math.abs(fdz) > 0.001) {
        facing = Math.atan2(fdx, fdz);
      } else {
        facing = -Math.PI / 2; // default: facing into the room
      }
      if (pushing !== beingPushed) setBeingPushed(pushing);
      internalXRef.current = nextX;
      posX = nextX;

      if (nextX > pushThresholdX && !pushedFiredRef.current) {
        pushedFiredRef.current = true;
        onPushedOut();
      }
    } else if (mode === 'exiting') {
      const p = Math.min(1, t / walkDuration);
      const startX = internalXRef.current ?? insideStandX;
      posX = startX + (outsideX - startX) * p;
      walking = p < 1;
      facing = -Math.PI / 2;
      if (p >= 1 && !exitedFiredRef.current) {
        exitedFiredRef.current = true;
        onExited();
      }
    }

    ref.current.position.x = posX;
    ref.current.position.z = z;
    ref.current.rotation.y = facing;

    // Bob from walking is now driven by the FBX animation itself; just keep the
    // group on the floor.
    ref.current.position.y = 0;
    // walking flag is unused with rigged animations — silence the unused-var lint
    void walking;
    // t is only used for procedural bob; the FBX clip handles that
    void t;
  });

  return (
    <group ref={ref} position={[outsideX + 8, 0, z]}>
      <VisitorRig mode={mode} beingPushed={beingPushed} />
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

const EYE_HEIGHT = 1.65;
const JUMP_SPEED = 4.6;
const GRAVITY = 16;

function Player({
  enabled,
  onPositionChange
}: {
  enabled: boolean;
  onPositionChange?: (pos: THREE.Vector3) => void;
}) {
  const { camera } = useThree();
  const move = useRef({ forward: 0, right: 0 });
  const yVel = useRef(0);

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 4.5);
    camera.lookAt(0, EYE_HEIGHT, -1);
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
        case 'Space':
          if (down) {
            e.preventDefault();
            if (enabled && camera.position.y - EYE_HEIGHT < 0.02) {
              yVel.current = JUMP_SPEED;
            }
          }
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
  }, [enabled, camera]);

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

    // Vertical physics — gravity + jump
    yVel.current -= GRAVITY * delta;
    camera.position.y += yVel.current * delta;
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT;
      yVel.current = 0;
    }

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
      { name: 'workstation', pos: new THREE.Vector3(BENCH_CFG.position[0], 1.0, BENCH_CFG.position[2] + 0.3), range: 2.8 },
      { name: 'bambu', pos: new THREE.Vector3(BAMBU_POS[0], 1.0, BAMBU_POS[2]), range: 3.0 },
      { name: 'prusa', pos: new THREE.Vector3(PRUSA_POS[0], 1.0, PRUSA_POS[2]), range: 3.0 }
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
      // Gather accepts items currently on the bench OR currently in hand — so
      // round 2's "bring PLA to the Bambu" advances as soon as the player
      // picks up the spool, without forcing a detour to the workstation.
      shouldAdvance = phase.needs.every(
        (id) => state.benchItems.includes(id) || state.carrying === id
      );
    } else if (phase.kind === 'visitor') {
      shouldAdvance = state.visitorHandled;
    } else if (phase.kind === 'build') {
      shouldAdvance = phase.actions.every((a) => state.buildActionsDone[a.id]);
    } else if (phase.kind === 'return') {
      shouldAdvance = state.benchItems.length === 0 && state.carrying === null;
    }
    if (shouldAdvance) {
      const t = window.setTimeout(() => {
        setState((prev) => {
          if (prev.phaseIdx !== state.phaseIdx) return prev;
          const nextIdx = prev.phaseIdx + 1;
          const nextPhase = round.phases[nextIdx];
          if (nextPhase) {
            // Surface the new phase so the player knows what just changed
            const id = Date.now() + Math.random();
            const text = `→ ${nextPhase.label}`;
            window.setTimeout(() => {
              setState((p) => ({ ...p, toasts: p.toasts.filter((tt) => tt.id !== id) }));
            }, 3800);
            return {
              ...prev,
              phaseIdx: nextIdx,
              toasts: [...prev.toasts.slice(-3), { id, text, tone: 'good' }]
            };
          }
          return { ...prev, phaseIdx: nextIdx };
        });
      }, 350);
      return () => window.clearTimeout(t);
    }
  }, [phase, state.benchItems, state.carrying, state.visitorHandled, state.buildActionsDone, state.phaseIdx]);

  // --- Visitor: walks INTO the room, waves, talks via bottom subtitle, must be escorted out
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (
      phase?.kind === 'visitor' &&
      state.visitorMode === 'idle' &&
      !state.visitorHandled
    ) {
      setState((prev) => ({ ...prev, visitorMode: 'entering' }));
    }
  }, [phase, state.visitorMode, state.visitorHandled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Inaction timeout: if the visitor is standing inside for >25s without being
  // escorted out, the round hard-fails (they wandered off with parts).
  useEffect(() => {
    if (state.visitorMode === 'inside' && state.visitorPromptedAt) {
      const t = window.setTimeout(() => {
        setState((prev) => {
          if (prev.visitorMode !== 'inside') return prev;
          return {
            ...prev,
            failedHard: true,
            visitorHandled: true,
            scoreRaw: prev.scoreRaw + POINTS.letVisitorIn
          };
        });
      }, 25_000);
      return () => window.clearTimeout(t);
    }
  }, [state.visitorMode, state.visitorPromptedAt]);

  // Distance from player camera to where the visitor stands inside
  const [playerNearVisitor, setPlayerNearVisitor] = useState(false);
  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // --- Whenever the round is complete (all phases done), the game ends, the
  // visitor dialogue is showing, or a build minigame is active, release pointer
  // lock so the cursor is visible and the user can click options / buttons.
  useEffect(() => {
    const needsCursor =
      state.phaseIdx >= round.phases.length ||
      state.finished ||
      state.failedHard ||
      state.visitorMode === 'inside' ||
      state.activeMinigameActionId !== null;
    if (needsCursor && document.pointerLockElement) {
      (document as unknown as { exitPointerLock?: () => void }).exitPointerLock?.();
    }
  }, [
    state.phaseIdx,
    round.phases.length,
    state.finished,
    state.failedHard,
    state.visitorMode,
    state.activeMinigameActionId
  ]);

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
    if (state.activeMinigameActionId || state.buildInProgress) return;
    // Release pointer lock so the player can interact with the minigame overlay.
    if (document.pointerLockElement) {
      (document as unknown as { exitPointerLock?: () => void }).exitPointerLock?.();
    }
    setState((prev) => ({ ...prev, activeMinigameActionId: action.id }));
    pushToast(`… ${action.prompt}`, 'good');
  };

  const completeMinigame = () => {
    const actionId = state.activeMinigameActionId;
    if (!actionId) return;
    const action = phase?.kind === 'build' ? phase.actions.find((a) => a.id === actionId) : null;
    setState((prev) => ({
      ...prev,
      activeMinigameActionId: null,
      buildActionsDone: { ...prev.buildActionsDone, [actionId]: true },
      scoreRaw: prev.scoreRaw + POINTS.buildAction,
      // Trigger the workstation spin animation briefly so the room reacts.
      buildInProgress: action
        ? {
            actionId: action.id,
            startedAt: Date.now(),
            durationMs: 900,
            tool: action.tool
          }
        : prev.buildInProgress
    }));
    if (action) {
      pushToast(`✓ ${action.prompt}`, 'good');
      window.setTimeout(() => {
        setState((prev) => ({
          ...prev,
          buildInProgress: prev.buildInProgress?.actionId === action.id ? null : prev.buildInProgress
        }));
      }, 900);
    }
  };

  const cancelMinigame = () => {
    setState((prev) => ({ ...prev, activeMinigameActionId: null }));
  };

  // --- Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        // If the visitor is inside the room and the player is standing near them,
        // E escorts them out instead of doing a pick/place.
        if (state.visitorMode === 'inside' && playerNearVisitor) {
          setState((prev) => {
            if (prev.visitorMode !== 'inside') return prev;
            return { ...prev, visitorMode: 'exiting', scoreRaw: prev.scoreRaw + POINTS.visitorDeclined };
          });
          pushToast('✓ Politely walked them back out', 'good');
          return;
        }
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
  const visitorArrivedInside = () => {
    setState((prev) => {
      if (prev.visitorMode !== 'entering') return prev;
      return { ...prev, visitorMode: 'inside', visitorPromptedAt: Date.now() };
    });
  };

  const visitorExited = () => {
    setState((prev) => {
      if (prev.visitorMode !== 'exiting') return prev;
      return { ...prev, visitorMode: 'idle', visitorHandled: true };
    });
  };

  const escortVisitorOut = () => {
    setState((prev) => {
      if (prev.visitorMode !== 'inside') return prev;
      return {
        ...prev,
        visitorMode: 'exiting',
        visitorPlayerLine: "Sorry man, can't do it. Have Anish come down himself.",
        scoreRaw: prev.scoreRaw + POINTS.visitorDeclined
      };
    });
    pushToast('✓ Politely walked them back out', 'good');
  };

  const visitorPushedOut = () => {
    setState((prev) => {
      if (prev.visitorMode !== 'inside') return prev;
      return {
        ...prev,
        visitorMode: 'exiting',
        visitorPlayerLine: 'Yo, out you go. Have Anish come let you in himself.',
        scoreRaw: prev.scoreRaw + POINTS.visitorDeclined
      };
    });
    pushToast('✓ Shoved them right back out the door', 'good');
  };

  const declineVisitor = () => {
    setState((prev) => {
      if (prev.visitorMode !== 'inside') return prev;
      const nextTurn = prev.visitorTurn + 1;
      const playerLine = DECLINE_LABELS[prev.visitorTurn] || DECLINE_LABELS[DECLINE_LABELS.length - 1];
      // Turn 3 (final visitor line) — visitor backs off and walks out on their own.
      if (nextTurn >= VISITOR_LINES.length - 1) {
        // Show final visitor line briefly, then auto-exit.
        window.setTimeout(() => {
          setState((p) => {
            if (p.visitorMode !== 'inside') return p;
            return {
              ...p,
              visitorMode: 'exiting',
              visitorPlayerLine: null,
              scoreRaw: p.scoreRaw + POINTS.visitorDeclined
            };
          });
        }, 2200);
        return {
          ...prev,
          visitorTurn: VISITOR_LINES.length - 1,
          visitorPlayerLine: playerLine
        };
      }
      return {
        ...prev,
        visitorTurn: nextTurn,
        visitorPlayerLine: playerLine
      };
    });
  };

  const letVisitorStay = () => {
    setState((prev) => ({
      ...prev,
      visitorMode: 'idle',
      visitorHandled: true,
      visitorPromptedAt: null,
      visitorPlayerLine: null,
      scoreRaw: prev.scoreRaw + POINTS.letVisitorIn,
      failedHard: true
    }));
    pushToast('✗ You let an unauthorized visitor stay. That is an immediate fail.', 'bad');
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
      roundStartScore: prev.scoreRaw,
      benchItems: [],
      carrying: null,
      buildActionsDone: {},
      buildInProgress: null,
      visitorMode: 'idle',
      visitorPromptedAt: null,
      visitorTurn: 0,
      visitorPlayerLine: null,
      visitorWalking: false,
      visitorPrompted: false,
      visitorHandled: false
    }));
  };

  const restartGame = () => setState(initialState);

  const retryRound = () => {
    setState((prev) => ({
      ...prev,
      phaseIdx: 0,
      scoreRaw: prev.roundStartScore,
      benchItems: [],
      carrying: null,
      buildActionsDone: {},
      buildInProgress: null,
      activeMinigameActionId: null,
      visitorMode: 'idle',
      visitorPromptedAt: null,
      visitorTurn: 0,
      visitorPlayerLine: null,
      visitorWalking: false,
      visitorPrompted: false,
      visitorHandled: false,
      failedHard: false,
      toasts: []
    }));
  };

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
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 70, near: 0.05, far: 80 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05
          }}
        >
          <color attach="background" args={['#e8e2d4']} />
          <fog attach="fog" args={['#f1ebde', 14, 28]} />
          <Lighting />

          {/* Synchronous scene — always renders, never blocks on assets */}
          <Room />
          {(Object.keys(SHELF_LAYOUT) as Shelf[]).map((s) => (
            <ShelfFurniture key={s} shelfId={s} highlight={hover?.kind === 'shelf' && hover.shelfId === s} />
          ))}
          {(Object.keys(SHELF_LAYOUT) as Shelf[])
            .filter((s) => s === 'hand-tools' || s === 'electronics' || s === 'screws')
            .map((s) => (
              <ShelfBins key={`bins-${s}`} shelfId={s} />
            ))}
          <Workbench
            highlight={
              hover?.kind === 'bench' ||
              (phase?.kind === 'build' && (nextBuildAction?.at || 'workstation') === 'workstation')
            }
            buildActive={Boolean(state.buildInProgress) && (nextBuildAction?.at || 'workstation') === 'workstation'}
          />
          <PrinterTable />
          <PrusaPrinter
            highlight={phase?.kind === 'build' && nextBuildAction?.at === 'prusa'}
            buildActive={Boolean(state.buildInProgress) && state.buildInProgress?.tool != null && (phase?.kind === 'build' && phase.actions.find((a) => a.id === state.buildInProgress?.actionId)?.at === 'prusa')}
          />
          <Door
            openAmount={state.visitorMode === 'entering' || state.visitorMode === 'exiting' ? 1 : 0}
            knocking={false}
          />
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

          {/* Always-on player + look controls so the user can start the game
              even while heavy assets are still loading. */}
          <Player
            enabled={pointerLocked && !state.finished && !state.failedHard && !state.activeMinigameActionId}
            onPositionChange={(pos) => {
              playerPosRef.current.copy(pos);
              const dx = pos.x - (DOOR_CFG.position[0] - 1.8);
              const dz = pos.z - DOOR_CFG.position[2];
              const dist = Math.sqrt(dx * dx + dz * dz);
              const near = dist < 2.4;
              setPlayerNearVisitor((prev) => (prev === near ? prev : near));
            }}
          />
          <HoverDetector
            worldItems={worldItems}
            carrying={state.carrying}
            onHover={setHover}
            onProximity={setNearZone}
          />
          <CameraOrient active={state.visitorMode === 'entering'} />
          {!state.finished &&
          !state.failedHard &&
          !state.activeMinigameActionId &&
          state.visitorMode !== 'inside' &&
          state.phaseIdx < round.phases.length ? (
            <PointerLockControls
              onLock={() => setPointerLocked(true)}
              onUnlock={() => setPointerLocked(false)}
            />
          ) : null}

          {/* Asset-loading components — each in its own Suspense so they don't
              block siblings or the player controls while they download. */}
          <Suspense fallback={null}>
            <Environment preset="warehouse" background={false} environmentIntensity={0.55} />
          </Suspense>
          <Suspense fallback={null}>
            <DroneSTL />
          </Suspense>
          <Suspense fallback={null}>
            <BambuPrinter
              highlight={phase?.kind === 'build' && nextBuildAction?.at === 'bambu'}
              buildActive={Boolean(state.buildInProgress) && (phase?.kind === 'build' && phase.actions.find((a) => a.id === state.buildInProgress?.actionId)?.at === 'bambu')}
            />
          </Suspense>
          <Suspense fallback={null}>
            <Visitor
              mode={state.visitorMode}
              playerPosRef={playerPosRef}
              onArrivedInside={visitorArrivedInside}
              onPushedOut={visitorPushedOut}
              onExited={visitorExited}
            />
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

        {!pointerLocked && !state.finished && !state.failedHard ? (
          <div className="workshop-hud-start">
            <div className="workshop-hud-start-card">
              <p className="workshop-hud-start-eyebrow">Workshop simulation</p>
              <h3>Click to enter the room</h3>
              <p className="workshop-hud-start-body">
                <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> walk · mouse looks · <kbd>Space</kbd> jump · <kbd>E</kbd> pick up / place / return · <kbd>B</kbd> build at the highlighted station · <kbd>Tab</kbd> toggle objectives · <kbd>Esc</kbd> release cursor.
              </p>
            </div>
          </div>
        ) : null}

        {roundComplete && !state.finished && !state.failedHard ? (
          <div className="workshop-round-complete">
            <div className="workshop-round-complete-card">
              <p className="workshop-round-complete-eyebrow">Round {state.roundIdx + 1} complete</p>
              <h2 className="workshop-round-complete-title">
                Nice work — {Math.round(normalizedScore * 100)}%
              </h2>
              <p className="workshop-round-complete-body">
                {state.roundIdx === ROUNDS.length - 1
                  ? 'Wrap up the simulation to record your score.'
                  : 'Ready for the next round?'}
              </p>
              <button type="button" className="button-primary workshop-round-complete-btn" onClick={advanceRound} autoFocus>
                {state.roundIdx === ROUNDS.length - 1 ? 'Finish simulation →' : 'Continue to next round →'}
              </button>
            </div>
          </div>
        ) : null}

        {state.failedHard ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Round failed</p>
              <h3 className="workshop-modal-title">Hard safety violation.</h3>
              <p className="workshop-modal-body">
                You can retry just this round — your score from earlier rounds is preserved — or restart the whole simulation.
              </p>
              <div className="workshop-modal-actions">
                <button type="button" className="button-primary" onClick={retryRound} autoFocus>
                  Retry round {state.roundIdx + 1}
                </button>
                <button type="button" className="button-ghost" onClick={restartGame}>
                  Restart from round 1
                </button>
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

        {state.activeMinigameActionId ? (() => {
          const action =
            phase?.kind === 'build' ? phase.actions.find((a) => a.id === state.activeMinigameActionId) : null;
          if (!action) return null;
          const kind = action.minigame || 'screws';
          if (kind === 'filament') {
            return (
              <FilamentMinigame
                actionPrompt={action.prompt}
                onComplete={completeMinigame}
                onCancel={cancelMinigame}
              />
            );
          }
          if (kind === 'torque') {
            return (
              <TorqueMinigame
                actionPrompt={action.prompt}
                onComplete={completeMinigame}
                onCancel={cancelMinigame}
              />
            );
          }
          if (kind === 'caliper') {
            return (
              <CaliperMinigame
                actionPrompt={action.prompt}
                onComplete={completeMinigame}
                onCancel={cancelMinigame}
              />
            );
          }
          return (
            <BuildMinigame
              actionPrompt={action.prompt}
              onComplete={completeMinigame}
              onCancel={cancelMinigame}
            />
          );
        })() : null}

        {state.visitorMode === 'inside' || state.visitorMode === 'entering' ? (
          <div className="workshop-subtitle">
            <div className="workshop-subtitle-row">
              <div className="workshop-subtitle-speaker">Visitor</div>
              <p className="workshop-subtitle-text">
                {state.visitorMode === 'entering'
                  ? '*pushes the door open and walks in, waving*'
                  : `“${VISITOR_LINES[state.visitorTurn] || VISITOR_LINES[0]}”`}
              </p>
            </div>
            {state.visitorPlayerLine && state.visitorMode === 'inside' ? (
              <div className="workshop-subtitle-row workshop-subtitle-row-player">
                <div className="workshop-subtitle-speaker workshop-subtitle-speaker-you">You</div>
                <p className="workshop-subtitle-text">“{state.visitorPlayerLine}”</p>
              </div>
            ) : null}
            {state.visitorMode === 'inside' && state.visitorTurn < VISITOR_LINES.length - 1 ? (
              <div className="workshop-subtitle-options">
                <button
                  type="button"
                  className="workshop-subtitle-option"
                  onClick={declineVisitor}
                >
                  <span className="workshop-subtitle-option-marker">1.</span>
                  <span>“{DECLINE_LABELS[state.visitorTurn]}”</span>
                </button>
                <button
                  type="button"
                  className="workshop-subtitle-option workshop-subtitle-option-bad"
                  onClick={letVisitorStay}
                >
                  <span className="workshop-subtitle-option-marker">2.</span>
                  <span>{BAD_OPTION_LABELS[state.visitorTurn] || BAD_OPTION_LABELS[0]}</span>
                </button>
                <span className={`workshop-subtitle-prompt-inline ${playerNearVisitor ? 'is-active' : ''}`}>
                  {playerNearVisitor ? (
                    <>
                      Walk into them to physically push them out — or press <kbd>E</kbd>
                    </>
                  ) : (
                    <>
                      Or walk up and shove them out the door yourself
                    </>
                  )}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {state.visitorMode === 'exiting' ? (
          <div className="workshop-subtitle">
            <div className="workshop-subtitle-row">
              <div className="workshop-subtitle-speaker">You</div>
              <p className="workshop-subtitle-text">
                “{state.visitorPlayerLine || "Sorry man, can't do it. Have Anish come down himself."}”
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
