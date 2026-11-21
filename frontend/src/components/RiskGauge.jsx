import { useId } from 'react';
import { RISK_BANDS } from '../lib/flight';

const R = 92;
const C = 2 * Math.PI * R;
const SWEEP = 0.75 * C; // a 270° arc opening at the bottom

const COLORS = {
  low: ['#10B981', '#22D3EE'],
  moderate: ['#FBBF24', '#F59E0B'],
  high: ['#F59E0B', '#F25C54'],
};

// The arc starts at 135° (bottom left) and sweeps 270° clockwise.
function tickAt(percent) {
  const angle = ((135 + 2.7 * percent) * Math.PI) / 180;
  const at = (r) => [110 + r * Math.cos(angle), 110 + r * Math.sin(angle)];
  const [x1, y1] = at(R - 13);
  const [x2, y2] = at(R + 13);
  return { x1, y1, x2, y2 };
}

/**
 * Arc gauge. score: 0–100 or null for the empty state.
 * level: { key: 'low' | 'moderate' | 'high', label } from riskLevel().
 * Ticks mark where Low ends and High begins.
 * The fill is drawn at its final length; CSS only animates the sweep in,
 * so the gauge is correct even when animations don't run.
 */
export default function RiskGauge({ score = null, level = null, caption, dark = false }) {
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fill = (SWEEP * Math.min(Math.max(score ?? 0, 0), 100)) / 100;
  const [from, to] = COLORS[level?.key] ?? COLORS.high;
  const label = score == null ? 'No score yet' : `Risk score ${score.toFixed(1)} percent, ${level.label}`;

  return (
    <div className={`gauge${dark ? ' gauge-dark' : ''}`}>
      <svg viewBox="0 0 220 220" role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={R} className="gauge-track"
          strokeDasharray={`${SWEEP} ${C}`} transform="rotate(135 110 110)" />
        {score != null && (
          <circle key={score} cx="110" cy="110" r={R} className="gauge-fill" stroke={`url(#${gradientId})`}
            strokeDasharray={`${fill} ${C}`} style={{ '--gauge-from': `0 ${C}` }} transform="rotate(135 110 110)" />
        )}
        {[RISK_BANDS.low, RISK_BANDS.high].map((p) => <line key={p} {...tickAt(p)} className="gauge-tick" />)}
      </svg>
      <div className="gauge-center">
        {score == null
          ? <span className="gauge-value gauge-empty">—</span>
          : <span className="gauge-value">{score.toFixed(1)}<small>%</small></span>}
        <span className="gauge-caption">{caption ?? 'delay risk'}</span>
      </div>
    </div>
  );
}
