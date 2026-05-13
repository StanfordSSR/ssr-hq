type Kind = 'circuit' | 'gear' | 'shield' | 'ledger' | 'broadcast' | 'compass' | 'workshop';

export function ChapterIllustration({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'circuit':
      return <CircuitIllustration />;
    case 'gear':
      return <GearIllustration />;
    case 'shield':
      return <ShieldIllustration />;
    case 'ledger':
      return <LedgerIllustration />;
    case 'broadcast':
      return <BroadcastIllustration />;
    case 'compass':
      return <CompassIllustration />;
    case 'workshop':
      return <WorkshopIllustration />;
    default:
      return null;
  }
}

function WorkshopIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="40" y="80" width="160" height="100" rx="6" fill={FILL} stroke={STROKE} strokeWidth="1.6" />
      <rect x="55" y="110" width="48" height="58" rx="3" fill="none" stroke={STROKE} strokeWidth="1.2" />
      <rect x="115" y="110" width="48" height="58" rx="3" fill="none" stroke={STROKE} strokeWidth="1.2" />
      <line x1="55" y1="135" x2="103" y2="135" stroke={STROKE_FAINT} strokeWidth="1" />
      <line x1="55" y1="155" x2="103" y2="155" stroke={STROKE_FAINT} strokeWidth="1" />
      <line x1="115" y1="135" x2="163" y2="135" stroke={STROKE_FAINT} strokeWidth="1" />
      <line x1="115" y1="155" x2="163" y2="155" stroke={STROKE_FAINT} strokeWidth="1" />
      <rect x="60" y="120" width="14" height="8" fill={STROKE} />
      <rect x="120" y="120" width="14" height="8" fill={STROKE} />
      <circle cx="170" cy="65" r="14" fill={STROKE} />
      <rect x="158" y="60" width="24" height="14" fill="none" stroke={STROKE_FAINT} strokeWidth="1" />
      <text x="50" y="72" fontSize="9" fontFamily="system-ui" fill={STROKE} fontWeight="700">
        WORKSHOP
      </text>
    </svg>
  );
}

const STROKE = 'rgba(255,255,255,0.85)';
const STROKE_FAINT = 'rgba(255,255,255,0.4)';
const FILL = 'rgba(255,255,255,0.12)';

function CircuitIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="120" cy="120" r="92" fill="none" stroke={STROKE_FAINT} strokeWidth="1" />
      <rect x="80" y="80" width="80" height="80" rx="10" fill={FILL} stroke={STROKE} strokeWidth="1.5" />
      <rect x="100" y="100" width="40" height="40" rx="4" fill="none" stroke={STROKE} strokeWidth="1.2" />
      <circle cx="120" cy="120" r="6" fill={STROKE} />
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI) / 2;
        const x1 = 120 + Math.cos(angle) * 40;
        const y1 = 120 + Math.sin(angle) * 40;
        const x2 = 120 + Math.cos(angle) * 92;
        const y2 = 120 + Math.sin(angle) * 92;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth="1.4" />
            <circle cx={x2} cy={y2} r="4" fill={STROKE} />
          </g>
        );
      })}
      {[45, 135, 225, 315].map((deg, i) => {
        const angle = (deg * Math.PI) / 180;
        const x1 = 120 + Math.cos(angle) * 60;
        const y1 = 120 + Math.sin(angle) * 60;
        const x2 = 120 + Math.cos(angle) * 110;
        const y2 = 120 + Math.sin(angle) * 110;
        return (
          <line
            key={`d-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={STROKE_FAINT}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        );
      })}
    </svg>
  );
}

function GearIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g transform="translate(120 120)">
        <g>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * Math.PI) / 6;
            const x = Math.cos(angle) * 78;
            const y = Math.sin(angle) * 78;
            return (
              <rect
                key={i}
                x={x - 8}
                y={y - 8}
                width="16"
                height="16"
                fill={STROKE}
                transform={`rotate(${(i * 180) / 6} ${x} ${y})`}
                opacity={0.8}
              />
            );
          })}
          <circle r="60" fill={FILL} stroke={STROKE} strokeWidth="1.5" />
          <circle r="20" fill="none" stroke={STROKE} strokeWidth="1.5" />
          <circle r="4" fill={STROKE} />
        </g>
      </g>
      <g transform="translate(40 200)" opacity="0.7">
        <circle r="22" fill={FILL} stroke={STROKE_FAINT} strokeWidth="1" />
        <circle r="6" fill={STROKE_FAINT} />
      </g>
    </svg>
  );
}

function ShieldIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M120 30 L180 60 L180 130 C180 165 155 195 120 210 C85 195 60 165 60 130 L60 60 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth="1.6"
      />
      <path d="M120 80 L120 175" stroke={STROKE} strokeWidth="1.3" />
      <path d="M85 110 L155 110" stroke={STROKE} strokeWidth="1.3" />
      <circle cx="120" cy="80" r="6" fill={STROKE} />
      <circle cx="120" cy="175" r="6" fill={STROKE} />
      <circle cx="85" cy="110" r="5" fill={STROKE_FAINT} />
      <circle cx="155" cy="110" r="5" fill={STROKE_FAINT} />
    </svg>
  );
}

function LedgerIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="55" y="50" width="130" height="160" rx="10" fill={FILL} stroke={STROKE} strokeWidth="1.6" />
      <line x1="55" y1="82" x2="185" y2="82" stroke={STROKE} strokeWidth="1.2" />
      {[100, 118, 136, 154, 172, 190].map((y, i) => (
        <line
          key={i}
          x1="68"
          y1={y}
          x2={i % 2 === 0 ? 170 : 152}
          y2={y}
          stroke={STROKE_FAINT}
          strokeWidth="1"
        />
      ))}
      <circle cx="70" cy="68" r="5" fill={STROKE} />
      <text x="84" y="72" fontSize="10" fontFamily="system-ui" fill={STROKE} fontWeight="700">
        SSR LEDGER
      </text>
    </svg>
  );
}

function BroadcastIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="120" cy="130" r="14" fill={STROKE} />
      <circle cx="120" cy="130" r="32" fill="none" stroke={STROKE} strokeWidth="1.4" />
      <circle cx="120" cy="130" r="56" fill="none" stroke={STROKE_FAINT} strokeWidth="1.2" />
      <circle cx="120" cy="130" r="84" fill="none" stroke={STROKE_FAINT} strokeWidth="1" strokeDasharray="3 5" />
      <path d="M120 130 L120 60" stroke={STROKE} strokeWidth="1.6" />
      <rect x="110" y="40" width="20" height="22" rx="3" fill={STROKE} />
    </svg>
  );
}

function CompassIllustration() {
  return (
    <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="120" cy="120" r="90" fill={FILL} stroke={STROKE} strokeWidth="1.6" />
      <circle cx="120" cy="120" r="68" fill="none" stroke={STROKE_FAINT} strokeWidth="1" />
      <polygon points="120,40 132,120 120,200 108,120" fill={STROKE} opacity="0.9" />
      <polygon points="120,40 132,120 120,120" fill={STROKE} />
      <circle cx="120" cy="120" r="6" fill="#171414" stroke={STROKE} strokeWidth="1.5" />
      <text x="115" y="32" fontSize="10" fontFamily="system-ui" fill={STROKE} fontWeight="700">
        N
      </text>
    </svg>
  );
}
