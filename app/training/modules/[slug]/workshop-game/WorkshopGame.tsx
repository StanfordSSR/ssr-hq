'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { Suspense, useMemo, useRef, useState } from 'react';
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
  type RoundDef,
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

// ---- Shelf layout: each shelf is a small zone in world space ------------------------------

const SHELF_LAYOUT: Record<Shelf, { position: [number, number, number]; size: [number, number]; rotY: number; label: string }> = {
  'hand-tools':    { position: [-5.5, 0, -2], size: [3, 1.4], rotY: Math.PI / 2, label: 'Hand tools' },
  'screws':        { position: [-5.5, 0,  1.5], size: [3, 1.4], rotY: Math.PI / 2, label: 'Screws' },
  'measurement':   { position: [-2.5, 0,  5.5], size: [3, 1.4], rotY: 0, label: 'Measurement' },
  'electronics':   { position: [ 1.5, 0,  5.5], size: [3, 1.4], rotY: 0, label: 'Electronics' },
  'printed-parts': { position: [ 5.5, 0,  2], size: [3, 1.4], rotY: -Math.PI / 2, label: 'Printed parts' },
  'filament':      { position: [ 5.5, 0, -1.5], size: [3, 1.4], rotY: -Math.PI / 2, label: 'Filament' },
  'forbidden':     { position: [ 0, 0, -5.5], size: [4, 1.4], rotY: Math.PI, label: 'Misc shelf — NOT for this room' }
};

const BENCH_POS: [number, number, number] = [0, 0, 0];
const PRINTER_POS: [number, number, number] = [3.5, 0, -3];
const FUME_ZONE_POS: [number, number, number] = [-3.5, 0, -4];
const DOOR_POS: [number, number, number] = [0, 0, 6.5];

// ---- Components ---------------------------------------------------------------------------

function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#2a2424" />
      </mesh>
      {/* Floor grid lines */}
      <gridHelper args={[14, 14, '#3d2f2f', '#3d2f2f']} position={[0, 0, 0]} />
      {/* Walls (subtle) */}
      <mesh position={[0, 1.5, -7]}>
        <boxGeometry args={[14, 3, 0.1]} />
        <meshStandardMaterial color="#1a1414" />
      </mesh>
      <mesh position={[-7, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 14]} />
        <meshStandardMaterial color="#1a1414" />
      </mesh>
      <mesh position={[7, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 14]} />
        <meshStandardMaterial color="#1a1414" />
      </mesh>
      <mesh position={[0, 1.5, 7]}>
        <boxGeometry args={[14, 3, 0.1]} />
        <meshStandardMaterial color="#1a1414" />
      </mesh>
    </group>
  );
}

function ShelfZone({ shelfId }: { shelfId: Shelf }) {
  const cfg = SHELF_LAYOUT[shelfId];
  return (
    <group position={cfg.position} rotation={[0, cfg.rotY, 0]}>
      {/* Shelf surface */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[cfg.size[0], 0.06, cfg.size[1]]} />
        <meshStandardMaterial color={shelfId === 'forbidden' ? '#3a2222' : '#3a3030'} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[cfg.size[0], 0.06, cfg.size[1]]} />
        <meshStandardMaterial color={shelfId === 'forbidden' ? '#3a2222' : '#3a3030'} />
      </mesh>
      {/* Label hanging above */}
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.22}
        color={shelfId === 'forbidden' ? '#ff7070' : '#ffd9d9'}
        anchorX="center"
        anchorY="middle"
      >
        {cfg.label}
      </Text>
    </group>
  );
}

function Workbench() {
  return (
    <group position={BENCH_POS}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[3, 0.06, 1.6]} />
        <meshStandardMaterial color="#5b3a1f" />
      </mesh>
      {/* legs */}
      {[
        [-1.4, 0.2, -0.7],
        [1.4, 0.2, -0.7],
        [-1.4, 0.2, 0.7],
        [1.4, 0.2, 0.7]
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshStandardMaterial color="#3a2515" />
        </mesh>
      ))}
      <Text position={[0, 0.5, 0.95]} fontSize={0.14} color="#ffd9d9" anchorX="center" anchorY="middle">
        Workbench
      </Text>
    </group>
  );
}

function Printer({ position, label, color }: { position: [number, number, number]; label: string; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1, 1.1, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.55, 0.51]}>
        <boxGeometry args={[0.78, 0.78, 0.02]} />
        <meshStandardMaterial color="#0a0a0a" transparent opacity={0.6} />
      </mesh>
      <Text position={[0, 1.4, 0]} fontSize={0.14} color="#ffd9d9" anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}

function FumeZone() {
  return (
    <group position={FUME_ZONE_POS}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[2.4, 2]} />
        <meshStandardMaterial color="#8c1515" transparent opacity={0.3} />
      </mesh>
      <Text position={[0, 0.2, 0]} fontSize={0.12} color="#ffb0b0" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
        NO machining · NO soldering · NO fumes
      </Text>
    </group>
  );
}

function Door({ knocking }: { knocking: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current && knocking) {
      ref.current.position.x = BENCH_POS[0] + Math.sin(state.clock.elapsedTime * 8) * 0.04;
    } else if (ref.current) {
      ref.current.position.x = 0;
    }
  });
  return (
    <group position={DOOR_POS}>
      <mesh ref={ref} position={[0, 1, 0]}>
        <boxGeometry args={[1.2, 2, 0.1]} />
        <meshStandardMaterial color={knocking ? '#b03a1f' : '#3a2515'} />
      </mesh>
      <Text position={[0, 2.3, 0]} fontSize={0.14} color="#ffd9d9" anchorX="center" anchorY="middle">
        Door
      </Text>
      {knocking ? (
        <Text position={[0, 2.55, 0]} fontSize={0.16} color="#ffb0b0" anchorX="center" anchorY="middle">
          ⚠ Someone is knocking
        </Text>
      ) : null}
    </group>
  );
}

// Compute item world position. If on a shelf, distributes along the shelf.
// If on bench, stacks them in a row.
function getItemPosition(
  itemId: ItemId,
  benchItems: ItemId[],
  shelfItems: Record<Shelf, ItemId[]>,
  carrying: ItemId | null
): [number, number, number] {
  if (carrying === itemId) {
    return [BENCH_POS[0] + 1.8, 1.6, BENCH_POS[2]]; // floating tray
  }
  const benchIdx = benchItems.indexOf(itemId);
  if (benchIdx >= 0) {
    const offset = (benchIdx - (benchItems.length - 1) / 2) * 0.5;
    return [BENCH_POS[0] + offset, 0.55, BENCH_POS[2]];
  }
  // On a shelf
  const item = getItem(itemId);
  const shelf = item.shelf;
  const list = shelfItems[shelf] || [];
  const idx = list.indexOf(itemId);
  const cfg = SHELF_LAYOUT[shelf];
  const totalWidth = cfg.size[0] - 0.4;
  const step = list.length > 1 ? totalWidth / (list.length - 1) : 0;
  const localX = list.length > 1 ? -totalWidth / 2 + step * idx : 0;
  // Apply shelf rotation
  const cos = Math.cos(cfg.rotY);
  const sin = Math.sin(cfg.rotY);
  const worldX = cfg.position[0] + cos * localX;
  const worldZ = cfg.position[2] + sin * localX;
  return [worldX, 0.65, worldZ];
}

function ItemMesh({
  def,
  position,
  onClick,
  pulse
}: {
  def: ItemDef;
  position: [number, number, number];
  onClick: () => void;
  pulse?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current && pulse) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 4) * 0.04;
    } else if (groupRef.current) {
      groupRef.current.position.y = position[1];
    }
  });

  let mesh;
  switch (def.shape) {
    case 'rod':
      mesh = (
        <mesh castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
      break;
    case 'cyl':
      mesh = (
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.18, 0.22, 16]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
      break;
    case 'plate':
      mesh = (
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.04, 0.18]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
      break;
    case 'bin':
      mesh = (
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.18, 0.22]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
      break;
    default:
      mesh = (
        <mesh castShadow>
          <boxGeometry args={[0.24, 0.18, 0.18]} />
          <meshStandardMaterial color={def.color} />
        </mesh>
      );
  }

  return (
    <group ref={groupRef} position={[position[0], position[1], position[2]]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {mesh}
      <Text position={[0, 0.28, 0]} fontSize={0.09} color="#ffe9e9" anchorX="center" anchorY="middle">
        {def.label}
      </Text>
    </group>
  );
}

function BenchTarget({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <mesh position={[BENCH_POS[0], 0.44, BENCH_POS[2]]} onClick={(e) => { e.stopPropagation(); onClick(); }} visible={active}>
      <boxGeometry args={[3.2, 0.04, 1.8]} />
      <meshStandardMaterial color="#ffd34a" transparent opacity={0.35} />
    </mesh>
  );
}

function ShelfTarget({ shelfId, active, onClick }: { shelfId: Shelf; active: boolean; onClick: () => void }) {
  const cfg = SHELF_LAYOUT[shelfId];
  return (
    <mesh
      position={cfg.position}
      rotation={[0, cfg.rotY, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      visible={active}
    >
      <boxGeometry args={[cfg.size[0] + 0.2, 1.4, cfg.size[1] + 0.2]} />
      <meshStandardMaterial color="#ffd34a" transparent opacity={0.2} />
    </mesh>
  );
}

// ---- Main game ----------------------------------------------------------------------------

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

  const round = ROUNDS[state.roundIdx];
  const itemsOnShelves = useMemo(() => round.itemsOnShelves, [round]);

  const shelfItems = useMemo(() => {
    const map: Record<Shelf, ItemId[]> = {
      'hand-tools': [],
      screws: [],
      measurement: [],
      'printed-parts': [],
      filament: [],
      electronics: [],
      forbidden: []
    };
    itemsOnShelves.forEach((id) => {
      if (state.benchItems.includes(id)) return;
      if (state.carrying === id) return;
      const item = getItem(id);
      map[item.shelf].push(id);
    });
    return map;
  }, [itemsOnShelves, state.benchItems, state.carrying]);

  const stepNeeds = useMemo(() => {
    // Find the first unmet step
    for (const step of round.steps) {
      if (step.needs.length === 0) continue;
      const ok = step.needs.every((id) => state.benchItems.includes(id));
      if (!ok) return step;
    }
    return null;
  }, [round, state.benchItems]);

  const benchTargetActive = state.carrying !== null;
  const shelfTargetActive = (shelfId: Shelf) => {
    if (state.carrying === null) return false;
    const item = getItem(state.carrying);
    return item.shelf === shelfId;
  };

  const pushToast = (text: string, tone: 'good' | 'bad') => {
    setState((prev) => {
      const id = Date.now() + Math.random();
      const toasts = [...prev.toasts, { id, text, tone }].slice(-4);
      return { ...prev, toasts };
    });
    window.setTimeout(() => {
      setState((prev) => ({ ...prev, toasts: prev.toasts.filter((t) => t.text !== text) }));
    }, 3500);
  };

  // Pick up an item from a shelf
  const handlePickup = (id: ItemId) => {
    if (state.carrying || state.finished || state.failedHard) return;
    const item = getItem(id);
    if (item.forbidden) {
      // Penalty + immediate drop back
      setState((prev) => ({ ...prev, scoreRaw: prev.scoreRaw + POINTS.forbiddenPickup }));
      pushToast(`✗ ${item.reason}`, 'bad');
      return;
    }
    setState((prev) => ({ ...prev, carrying: id, scoreRaw: prev.scoreRaw + POINTS.correctPickup }));
    pushToast(`✓ Picked up ${item.label}`, 'good');
  };

  // Place carried item on the workbench
  const handleBenchPlace = () => {
    if (!state.carrying) return;
    setState((prev) => {
      const benchItems = [...prev.benchItems, prev.carrying!];
      let score = prev.scoreRaw;
      // Check if this completes a step
      const allSteps = round.steps;
      for (const step of allSteps) {
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
    pushToast('✓ Placed on workbench', 'good');
  };

  // Return carried item to its shelf
  const handleShelfReturn = (shelfId: Shelf) => {
    if (!state.carrying) return;
    const item = getItem(state.carrying);
    if (item.shelf !== shelfId) {
      pushToast(`✗ That tool belongs on ${SHELF_LAYOUT[item.shelf].label}`, 'bad');
      return;
    }
    setState((prev) => ({
      ...prev,
      carrying: null,
      scoreRaw: prev.scoreRaw + POINTS.correctReturn
    }));
    pushToast(`✓ Returned ${item.label} to ${SHELF_LAYOUT[shelfId].label}`, 'good');
  };

  // Pick up an item that's currently on the bench
  const handleBenchPickup = (id: ItemId) => {
    if (state.carrying || state.finished || state.failedHard) return;
    setState((prev) => ({
      ...prev,
      carrying: id,
      benchItems: prev.benchItems.filter((x) => x !== id)
    }));
    pushToast(`Picked ${getItem(id).label} off the workbench`, 'good');
  };

  const advanceRound = () => {
    if (state.roundIdx === ROUNDS.length - 1) {
      // Apply final-round cleanup penalty if needed
      let finalScore = state.scoreRaw;
      if (round.cleanupRequired && state.benchItems.length > 0) {
        finalScore += POINTS.toolLeftOnBench * state.benchItems.length;
        pushToast(`✗ ${state.benchItems.length} tool(s) left on the workbench overnight`, 'bad');
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

  // Trigger the visitor event when the gather step of round 3 is done
  const gatherDoneRound3 =
    round.visitorEvent &&
    round.steps[0].needs.every((id) => state.benchItems.includes(id)) &&
    !state.visitorPrompted &&
    !state.visitorHandled;

  if (gatherDoneRound3) {
    setTimeout(() => {
      setState((prev) => ({ ...prev, visitorPrompted: true }));
    }, 50);
  }

  const handleVisitorDecline = () => {
    setState((prev) => ({ ...prev, visitorPrompted: false, visitorHandled: true, scoreRaw: prev.scoreRaw + 2 }));
    pushToast('✓ Declined politely and directed them to email an Exec Board officer', 'good');
  };

  const handleVisitorAccept = () => {
    setState((prev) => ({
      ...prev,
      visitorPrompted: false,
      visitorHandled: true,
      scoreRaw: prev.scoreRaw + POINTS.letVisitorIn,
      failedHard: true
    }));
    pushToast('✗ Letting an unauthorized visitor in is an immediate fail of this round.', 'bad');
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

  // ---- Render ----
  const stepProgress = round.steps.map((step) => {
    const ok = step.needs.length === 0
      ? state.benchItems.length === 0 && state.roundIdx > 0 || round.cleanupRequired === undefined
      : step.needs.every((id) => state.benchItems.includes(id));
    return { step, ok };
  });

  const cleanupReady =
    round.steps[round.steps.length - 1].needs.length === 0 &&
    state.benchItems.length === 0 &&
    (!round.visitorEvent || state.visitorHandled);

  const allStepsDone = round.steps.every((step) =>
    step.needs.length === 0
      ? state.benchItems.length === 0 && (!round.visitorEvent || state.visitorHandled)
      : step.needs.every((id) => state.benchItems.includes(id))
  );

  const canAdvance = allStepsDone && !state.failedHard;
  const normalizedScore = normalizeScore(state.scoreRaw);
  const passed = normalizedScore >= passingScore;

  return (
    <div className="workshop-game">
      <div className="workshop-canvas-wrap">
        <Canvas shadows={false} camera={{ position: [9, 8, 11], fov: 45 }} dpr={[1, 2]}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[6, 10, 4]} intensity={0.7} />
          <Suspense fallback={null}>
            <Room />
            {(Object.keys(SHELF_LAYOUT) as Shelf[]).map((s) => (
              <ShelfZone key={s} shelfId={s} />
            ))}
            <Workbench />
            <Printer position={PRINTER_POS} label="Prusa Core One+" color="#ec6b1a" />
            <Printer position={[PRINTER_POS[0] + 1.8, 0, PRINTER_POS[2]]} label="Bambu H2D" color="#1f8a4a" />
            <FumeZone />
            <Door knocking={state.visitorPrompted} />

            {/* Items on shelves */}
            {itemsOnShelves.map((id) => {
              const def = getItem(id);
              if (state.benchItems.includes(id)) return null;
              if (state.carrying === id) return null;
              const pos = getItemPosition(id, state.benchItems, shelfItems, state.carrying);
              return (
                <ItemMesh
                  key={id}
                  def={def}
                  position={pos}
                  onClick={() => handlePickup(id)}
                  pulse={def.forbidden}
                />
              );
            })}

            {/* Items on bench */}
            {state.benchItems.map((id) => {
              const def = getItem(id);
              const pos = getItemPosition(id, state.benchItems, shelfItems, state.carrying);
              return (
                <ItemMesh
                  key={`b-${id}`}
                  def={def}
                  position={pos}
                  onClick={() => handleBenchPickup(id)}
                />
              );
            })}

            {/* Carried item floats */}
            {state.carrying ? (
              <ItemMesh
                def={getItem(state.carrying)}
                position={getItemPosition(state.carrying, state.benchItems, shelfItems, state.carrying)}
                onClick={() => {}}
                pulse
              />
            ) : null}

            {/* Drop targets */}
            <BenchTarget active={benchTargetActive} onClick={handleBenchPlace} />
            {(Object.keys(SHELF_LAYOUT) as Shelf[]).map((s) => (
              <ShelfTarget
                key={`t-${s}`}
                shelfId={s}
                active={shelfTargetActive(s)}
                onClick={() => handleShelfReturn(s)}
              />
            ))}

            <OrbitControls
              enablePan={false}
              minPolarAngle={Math.PI / 5}
              maxPolarAngle={Math.PI / 2.4}
              minDistance={8}
              maxDistance={18}
            />
          </Suspense>
        </Canvas>
      </div>

      <aside className="workshop-overlay">
        <div className="workshop-overlay-top">
          <p className="workshop-round">{round.title}</p>
          <p className="workshop-brief">{round.brief}</p>
          <ol className="workshop-steps">
            {round.steps.map((step) => {
              const ok =
                step.needs.length === 0
                  ? state.benchItems.length === 0 && (!round.visitorEvent || state.visitorHandled)
                  : step.needs.every((id) => state.benchItems.includes(id));
              return (
                <li key={step.id} className={`workshop-step ${ok ? 'is-done' : ''}`}>
                  <span className="workshop-step-marker">{ok ? '✓' : '○'}</span>
                  <span>{step.label}</span>
                </li>
              );
            })}
          </ol>
          {stepNeeds ? (
            <p className="workshop-need-hint">
              <strong>Next:</strong> need{' '}
              {stepNeeds.needs
                .filter((id) => !state.benchItems.includes(id))
                .map((id) => getItem(id).label)
                .join(', ')}{' '}
              on the workbench.
            </p>
          ) : null}
        </div>

        <div className="workshop-score-bar">
          <div className="workshop-score-num">
            Score: <strong>{Math.round(normalizedScore * 100)}%</strong>{' '}
            <span className="workshop-score-raw">({state.scoreRaw} / {TOTAL_MAX})</span>
          </div>
          <div className="workshop-score-track">
            <div
              className="workshop-score-fill"
              style={{
                width: `${Math.max(0, normalizedScore) * 100}%`,
                background: normalizedScore >= passingScore ? '#0e6b4e' : '#b06012'
              }}
            />
            <div
              className="workshop-score-threshold"
              style={{ left: `${passingScore * 100}%` }}
              title={`Pass at ${Math.round(passingScore * 100)}%`}
            />
          </div>
        </div>

        <div className="workshop-toasts">
          {state.toasts.map((t) => (
            <div key={t.id} className={`workshop-toast workshop-toast-${t.tone}`}>
              {t.text}
            </div>
          ))}
        </div>

        {!state.finished && !state.failedHard ? (
          <div className="workshop-actions">
            <button
              type="button"
              className="button-primary"
              onClick={advanceRound}
              disabled={!canAdvance}
              title={canAdvance ? '' : 'Finish every step before advancing.'}
            >
              {state.roundIdx === ROUNDS.length - 1 ? 'Finish simulation →' : 'Next round →'}
            </button>
            <button type="button" className="button-ghost" onClick={restartGame}>
              Restart
            </button>
          </div>
        ) : null}

        {state.failedHard ? (
          <div className="workshop-result workshop-result-fail">
            <h3>Round failed.</h3>
            <p>The simulation ended because of a hard safety violation. Restart to try again.</p>
            <button type="button" className="button" onClick={restartGame}>
              Restart simulation
            </button>
          </div>
        ) : null}

        {state.finished ? (
          <div className={`workshop-result ${passed ? 'workshop-result-pass' : 'workshop-result-fail'}`}>
            <h3>{passed ? 'Passed' : 'Did not pass'}</h3>
            <p>
              Final score: <strong>{Math.round(normalizedScore * 100)}%</strong> (need {Math.round(passingScore * 100)}%
              to pass).
            </p>
            {passed ? (
              <button type="button" className="button-primary" onClick={submitFinal} disabled={submitting}>
                {submitting ? 'Recording...' : 'Record completion →'}
              </button>
            ) : (
              <button type="button" className="button" onClick={restartGame}>
                Restart simulation
              </button>
            )}
            {submitError ? <p className="helper" style={{ color: '#8c1515' }}>{submitError}</p> : null}
          </div>
        ) : null}

        {state.visitorPrompted ? (
          <div className="workshop-modal-backdrop">
            <div className="workshop-modal">
              <p className="workshop-modal-eyebrow">Door event</p>
              <h3 className="workshop-modal-title">Someone is knocking.</h3>
              <p>
                Through the door: <em>“Hey, I’m a friend of someone in the club. Can I come in to borrow a tool real quick?”</em>
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
      </aside>
    </div>
  );
}
