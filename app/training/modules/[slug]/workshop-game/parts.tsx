import type { ItemId } from './game-logic';

export function PartMesh({ id }: { id: ItemId }) {
  switch (id) {
    case 'phillips-small':
      return <PhillipsDriver handleColor="#c9342a" />;
    case 'soldering-iron':
      return <PhillipsDriver handleColor="#2a2a2a" tipColor="#ff5a3a" emissive />;
    case 'hex-set':
      return <HexSet />;
    case 'snips':
      return <Snips />;
    case 'm3-screws':
      return <ScrewBin color="#8a6f4f" screwLen={0.07} />;
    case 'm4-screws':
      return <ScrewBin color="#7d6543" screwLen={0.09} />;
    case 'caliper':
      return <Caliper />;
    case 'multimeter':
      return <Multimeter />;
    case 'bracket-printed':
      return <PrintedBracket />;
    case 'spool-pla':
      return <FilamentSpool color="#1f5fa6" />;
    case 'spool-petg':
      return <FilamentSpool color="#0e6b4e" />;
    case 'spool-abs':
      return <FilamentSpool color="#b03a1f" />;
    case 'dremel':
      return <Dremel />;
    case 'hacksaw':
      return <Hacksaw />;
    case 'acetone':
      return <Bottle color="#cfd6da" />;
    case 'torch':
      return <Torch />;
    default:
      return (
        <mesh>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      );
  }
}

function PhillipsDriver({
  handleColor,
  tipColor = '#bdbdbd',
  emissive = false
}: {
  handleColor: string;
  tipColor?: string;
  emissive?: boolean;
}) {
  // Lay the screwdriver horizontally with the handle behind and tip forward.
  // Total length ~0.42m. Origin sits roughly at the bolster.
  return (
    <group rotation={[0, 0, -Math.PI / 2]}>
      {/* Dome end-cap on the back of the handle */}
      <mesh position={[0, -0.24, 0]} castShadow>
        <sphereGeometry args={[0.046, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={handleColor} roughness={0.55} />
      </mesh>
      {/* Handle barrel — slightly tapered, ergonomic */}
      <mesh position={[0, -0.13, 0]} castShadow>
        <cylinderGeometry args={[0.046, 0.05, 0.22, 28]} />
        <meshStandardMaterial color={handleColor} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Three darker grip ribs around the handle */}
      {[-0.06, -0.12, -0.18].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.012, 28]} />
          <meshStandardMaterial color="#1f1f1f" roughness={0.5} />
        </mesh>
      ))}
      {/* Hex bolster between handle and shaft */}
      <mesh position={[0, 0.0, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.026, 0.04, 6]} />
        <meshStandardMaterial color="#4a4a4a" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Steel shaft */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.0125, 0.0125, 0.22, 18]} />
        <meshStandardMaterial
          color={tipColor}
          metalness={0.9}
          roughness={0.18}
          emissive={emissive ? '#ff3010' : '#000000'}
          emissiveIntensity={emissive ? 0.6 : 0}
        />
      </mesh>
      {/* Tip — a proper Phillips cross machined into a small cone */}
      <group position={[0, 0.255, 0]}>
        <mesh castShadow>
          <coneGeometry args={[0.014, 0.024, 12]} />
          <meshStandardMaterial color={tipColor} metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Phillips cut: two thin perpendicular slots */}
        <mesh position={[0, -0.005, 0]}>
          <boxGeometry args={[0.028, 0.01, 0.005]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
        <mesh position={[0, -0.005, 0]}>
          <boxGeometry args={[0.005, 0.01, 0.028]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      </group>
    </group>
  );
}

function HexSet() {
  const angles = [-30, -18, -6, 6, 18, 30];
  return (
    <group>
      {/* Holder block */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.16, 0.04, 0.05]} />
        <meshStandardMaterial color="#3f3a32" roughness={0.7} />
      </mesh>
      {/* Hex keys protruding */}
      {angles.map((deg, i) => (
        <group key={i} position={[-0.07 + i * 0.028, 0.045, 0]} rotation={[0, 0, (deg * Math.PI) / 180]}>
          {/* Vertical leg */}
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.007, 0.007, 0.14, 6]} />
            <meshStandardMaterial color="#6a6a6a" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Bent short leg */}
          <mesh position={[0.02, 0.14, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.007, 0.007, 0.04, 6]} />
            <meshStandardMaterial color="#6a6a6a" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Snips() {
  return (
    <group rotation={[0, 0, 0]}>
      {/* Handle A */}
      <mesh position={[-0.08, -0.02, 0]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.14, 0.025, 0.018]} />
        <meshStandardMaterial color="#a23030" />
      </mesh>
      {/* Handle B */}
      <mesh position={[-0.08, 0.02, 0]} rotation={[0, 0, -0.4]}>
        <boxGeometry args={[0.14, 0.025, 0.018]} />
        <meshStandardMaterial color="#a23030" />
      </mesh>
      {/* Pivot */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.03, 10]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.7} />
      </mesh>
      {/* Jaws */}
      <mesh position={[0.07, 0.012, 0]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.1, 0.018, 0.014]} />
        <meshStandardMaterial color="#6a6a6a" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0.07, -0.012, 0]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.1, 0.018, 0.014]} />
        <meshStandardMaterial color="#6a6a6a" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

function ScrewBin({ color, screwLen }: { color: string; screwLen: number }) {
  return (
    <group>
      {/* Bin */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.28, 0.08, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* Front lip darker */}
      <mesh position={[0, 0.04, 0.092]}>
        <boxGeometry args={[0.28, 0.08, 0.005]} />
        <meshStandardMaterial color="#5a4a30" />
      </mesh>
      {/* Screws sticking up */}
      {[-0.09, -0.045, 0, 0.045, 0.09].map((x, i) => (
        <group key={i} position={[x, 0.085 + screwLen / 2, (i % 2 === 0 ? 0.02 : -0.02)]}>
          <mesh>
            <cylinderGeometry args={[0.008, 0.008, screwLen, 6]} />
            <meshStandardMaterial color="#a8a8a8" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, screwLen / 2, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.01, 8]} />
            <meshStandardMaterial color="#a8a8a8" metalness={0.7} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Caliper() {
  return (
    <group>
      {/* Main beam */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.3, 0.02, 0.018]} />
        <meshStandardMaterial color="#b8bcbe" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Fixed jaw */}
      <mesh position={[-0.14, 0.07, 0]}>
        <boxGeometry args={[0.022, 0.1, 0.02]} />
        <meshStandardMaterial color="#b8bcbe" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Movable jaw */}
      <mesh position={[-0.04, 0.07, 0]}>
        <boxGeometry args={[0.022, 0.1, 0.02]} />
        <meshStandardMaterial color="#b8bcbe" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Digital display */}
      <mesh position={[0.06, 0.04, 0]}>
        <boxGeometry args={[0.08, 0.035, 0.022]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.06, 0.04, 0.012]}>
        <boxGeometry args={[0.06, 0.022, 0.001]} />
        <meshStandardMaterial color="#7aa478" emissive="#7aa478" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Multimeter() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.22, 0.1, 0.04]} />
        <meshStandardMaterial color="#1c4a1c" />
      </mesh>
      {/* Display */}
      <mesh position={[0, 0.085, 0.021]}>
        <boxGeometry args={[0.16, 0.04, 0.002]} />
        <meshStandardMaterial color="#a8c0a8" emissive="#a8c0a8" emissiveIntensity={0.3} />
      </mesh>
      {/* Dial */}
      <mesh position={[0, 0.035, 0.021]}>
        <cylinderGeometry args={[0.035, 0.035, 0.005, 16]} />
        <meshStandardMaterial color="#101010" />
      </mesh>
      {/* Dial pointer */}
      <mesh position={[0, 0.05, 0.024]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.004, 0.03, 0.002]} />
        <meshStandardMaterial color="#ffd34a" />
      </mesh>
    </group>
  );
}

function PrintedBracket() {
  return (
    <group>
      {/* Vertical leg */}
      <mesh position={[-0.05, 0.06, 0]}>
        <boxGeometry args={[0.02, 0.12, 0.07]} />
        <meshStandardMaterial color="#e2c200" />
      </mesh>
      {/* Horizontal leg */}
      <mesh position={[0.02, 0.01, 0]}>
        <boxGeometry args={[0.14, 0.02, 0.07]} />
        <meshStandardMaterial color="#e2c200" />
      </mesh>
      {/* Mounting holes (visual) */}
      <mesh position={[0.02, 0.022, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.005, 10]} />
        <meshStandardMaterial color="#7a6a00" />
      </mesh>
    </group>
  );
}

function FilamentSpool({ color }: { color: string }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Outer disc */}
      <mesh>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Side flange darker */}
      <mesh position={[0, 0.032, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.004, 32]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[0, -0.032, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.004, 32]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* Center hub */}
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 0.07, 16]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function Dremel() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh position={[-0.05, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 16]} />
        <meshStandardMaterial color="#cdb56a" />
      </mesh>
      {/* Collet */}
      <mesh position={[0.08, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.05, 12]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.8} />
      </mesh>
      {/* Bit */}
      <mesh position={[0.13, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.04, 8]} />
        <meshStandardMaterial color="#9a9a9a" metalness={0.8} />
      </mesh>
      {/* Switch */}
      <mesh position={[-0.08, 0.045, 0]}>
        <boxGeometry args={[0.06, 0.012, 0.02]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function Hacksaw() {
  return (
    <group>
      {/* Frame top */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.28, 0.012, 0.014]} />
        <meshStandardMaterial color="#7a4a14" />
      </mesh>
      {/* Frame left */}
      <mesh position={[-0.14, 0.07, 0]}>
        <boxGeometry args={[0.012, 0.12, 0.014]} />
        <meshStandardMaterial color="#7a4a14" />
      </mesh>
      {/* Frame right */}
      <mesh position={[0.14, 0.07, 0]}>
        <boxGeometry args={[0.012, 0.12, 0.014]} />
        <meshStandardMaterial color="#7a4a14" />
      </mesh>
      {/* Blade */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.28, 0.012, 0.005]} />
        <meshStandardMaterial color="#9a9a9a" metalness={0.6} />
      </mesh>
      {/* Handle */}
      <mesh position={[-0.18, 0.07, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.05, 0.08, 0.025]} />
        <meshStandardMaterial color="#3a2515" />
      </mesh>
    </group>
  );
}

function Bottle({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.16, 16]} />
        <meshStandardMaterial color={color} transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.175, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.03, 12]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* Hazard label */}
      <mesh position={[0, 0.08, 0.046]}>
        <boxGeometry args={[0.05, 0.06, 0.001]} />
        <meshStandardMaterial color="#b03a1f" emissive="#b03a1f" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function Torch() {
  return (
    <group>
      {/* Tank */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.08, 0.1, 0.05]} />
        <meshStandardMaterial color="#5a5a5a" />
      </mesh>
      {/* Nozzle */}
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.06, 8]} />
        <meshStandardMaterial color="#9a9a9a" metalness={0.7} />
      </mesh>
      {/* Trigger */}
      <mesh position={[0.04, 0.06, 0]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.02, 0.04, 0.02]} />
        <meshStandardMaterial color="#b03a1f" />
      </mesh>
    </group>
  );
}
