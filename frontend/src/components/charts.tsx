import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { BAND_COLOR, TOOLTIP_STYLE } from './ui';
import { BAND_PLAIN, FAMILY_DESC, FAMILY_PLAIN, feat, strength } from '@/lib/labels';

/* ------------------------------------------------------------------ helpers */

export function ChartNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-white/45 mt-3">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-300/70" />
      <span>{children}</span>
    </p>
  );
}

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a0 - a1 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/* ------------------------------------------------------------------ risk gauge */

const ZONES = ['PROCEED', 'STEP_UP', 'HOLD', 'BLOCK'] as const;

/** Semicircle gauge. Each band gets a quarter of the arc (the real cut-offs are 0.5t, t, 2t). */
export function RiskGauge({ score, threshold, band, plain }: { score: number; threshold: number; band: string; plain: boolean }) {
  const t = threshold;
  const cuts = [0, 0.5 * t, t, 2 * t, 1];
  const frac = (p: number) => {
    for (let i = 0; i < 4; i++) {
      if (p <= cuts[i + 1]) {
        const span = cuts[i + 1] - cuts[i];
        const local = i === 3 ? Math.sqrt((p - cuts[i]) / span) : (p - cuts[i]) / span;
        return (i + Math.min(1, Math.max(0, local))) / 4;
      }
    }
    return 1;
  };
  const W = 260, cx = 130, cy = 130, r = 100;
  const ang = (f: number) => Math.PI * (1 - f);
  const needle = ang(frac(score));
  const [nx, ny] = polar(cx, cy, r - 18, needle);
  const tickVals = [0.5 * t, t, 2 * t];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} 150`} className="w-full max-w-[280px]" role="img" aria-label={`Risk gauge: ${band}`}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ZONES.map((z, i) => (
          <path
            key={z}
            d={arcPath(cx, cy, r, ang(i / 4) - 0.012, ang((i + 1) / 4) + 0.012)}
            stroke={BAND_COLOR[z]}
            strokeOpacity={z === band ? 1 : 0.28}
            strokeWidth={z === band ? 16 : 12}
            fill="none"
            strokeLinecap="butt"
            filter={z === band ? 'url(#glow)' : undefined}
          />
        ))}
        {tickVals.map((v, i) => {
          const a = ang((i + 1) / 4);
          const [x0, y0] = polar(cx, cy, r + 10, a);
          const [x1, y1] = polar(cx, cy, r + 20, a);
          return (
            <g key={v}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(255,255,255,0.35)" />
              {!plain && (
                <text x={x1} y={y1 - 3} fill="rgba(255,255,255,0.45)" fontSize="9" textAnchor="middle">
                  {v.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ transition: 'all .8s cubic-bezier(.2,.8,.2,1)' }} />
        <circle cx={cx} cy={cy} r="7" fill="#fff" />
        <circle cx={cx} cy={cy} r="3" fill="#0b0f17" />
        <text x={cx} y={cy - 38} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">
          {plain ? `${Math.round(score * 100)}%` : score.toFixed(3)}
        </text>
        <text x={cx} y={cy - 22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">
          {plain ? 'chance of fraud' : 'calibrated probability'}
        </text>
      </svg>
      <div className="grid grid-cols-4 w-full max-w-[280px] text-[10px] text-center -mt-1">
        {ZONES.map((z) => (
          <span key={z} style={{ color: z === band ? BAND_COLOR[z] : 'rgba(255,255,255,0.35)' }} className={z === band ? 'font-semibold' : ''}>
            {plain ? BAND_PLAIN[z].title : z.replace('_', '-')}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ waterfall */

type WItem = { feature: string; shap: number; value?: unknown };

/** Starts at the model's average (base value) and shows how each factor pushes suspicion up or down. */
export function Waterfall({ base, items, plain }: { base: number; items: WItem[]; plain: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows: { label: string; start: number; end: number; v: number; value?: unknown; total?: boolean }[] = [];
  let acc = base;
  for (const it of items) {
    rows.push({ label: feat(it.feature, plain), start: acc, end: acc + it.shap, v: it.shap, value: it.value });
    acc += it.shap;
  }
  const all = [base, acc, ...rows.flatMap((r) => [r.start, r.end])];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 0.5;
  const min = lo - pad, max = hi + pad;
  const LW = 168, W = 560, RH = 24, top = 26;
  const x = (v: number) => LW + ((v - min) / (max - min)) * (W - LW - 60);
  const H = top + (rows.length + 2) * RH + 8;

  const endRow = (label: string, v: number, y: number, color: string) => (
    <g>
      <text x={LW - 8} y={y + 15} fill="rgba(255,255,255,0.85)" fontSize="11" textAnchor="end" fontWeight="600">
        {label}
      </text>
      <circle cx={x(v)} cy={y + 11} r="6" fill={color} />
      <text x={x(v) + 11} y={y + 15} fill="rgba(255,255,255,0.7)" fontSize="10.5">
        {plain ? '' : v.toFixed(2)}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Contribution waterfall">
      <text x={LW} y={12} fill="rgba(255,255,255,0.35)" fontSize="9.5">
        {plain ? '← less suspicious' : '← log-odds'}
      </text>
      <text x={W - 60} y={12} fill="rgba(255,255,255,0.35)" fontSize="9.5" textAnchor="end">
        {plain ? 'more suspicious →' : 'log-odds →'}
      </text>
      <line x1={x(base)} y1={top} x2={x(base)} y2={H - 6} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
      {endRow(plain ? 'Typical payment' : 'Base value', base, top, '#94a3b8')}
      {rows.map((r, i) => {
        const y = top + (i + 1) * RH;
        const up = r.v >= 0;
        const x0 = x(Math.min(r.start, r.end));
        const w = Math.max(2, Math.abs(x(r.end) - x(r.start)));
        const c = up ? '#fb7185' : '#34d399';
        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <rect x={0} y={y} width={W} height={RH} fill={hover === i ? 'rgba(255,255,255,0.04)' : 'transparent'} />
            <text x={LW - 8} y={y + 15} fill="rgba(255,255,255,0.7)" fontSize="11" textAnchor="end">
              {r.label.length > 26 ? r.label.slice(0, 25) + '…' : r.label}
            </text>
            <rect x={x0} y={y + 5} width={w} height={RH - 10} rx="3" fill={c} fillOpacity={hover === null || hover === i ? 0.9 : 0.35}>
              <animate attributeName="width" from="0" to={w} dur="0.6s" begin={`${i * 0.04}s`} fill="freeze" />
            </rect>
            {i < rows.length - 1 && <line x1={x(r.end)} y1={y + RH - 5} x2={x(r.end)} y2={y + RH + 5} stroke="rgba(255,255,255,0.25)" />}
            <text x={Math.max(x(r.start), x(r.end)) + 6} y={y + 15} fill={c} fontSize="10">
              {plain ? `${up ? '▲' : '▼'} ${strength(r.v)}` : `${up ? '+' : ''}${r.v.toFixed(2)}`}
              {!plain && r.value !== undefined && r.value !== null && (
                <tspan fill="rgba(255,255,255,0.4)"> · {typeof r.value === 'number' ? +Number(r.value).toFixed(2) : String(r.value)}</tspan>
              )}
            </text>
          </g>
        );
      })}
      {endRow(plain ? 'This payment' : 'Base + top factors', acc, top + (rows.length + 1) * RH, acc > base ? '#fb7185' : '#34d399')}
    </svg>
  );
}

/* ------------------------------------------------------------------ family radar */

export function FamilyRadar({ families, plain }: { families: Record<string, number>; plain: boolean }) {
  const data = Object.entries(families).map(([k, v]) => ({
    family: plain ? FAMILY_PLAIN[k] ?? k : k,
    raises: Math.max(0, v),
    lowers: Math.max(0, -v),
    raw: v,
    desc: FAMILY_DESC[k],
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="family" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
          <PolarRadiusAxis tick={false} axisLine={false} />
          <Radar name={plain ? 'Raises suspicion' : 'positive SHAP'} dataKey="raises" stroke="#fb7185" fill="#fb7185" fillOpacity={0.35} />
          <Radar name={plain ? 'Lowers suspicion' : 'negative SHAP'} dataKey="lowers" stroke="#34d399" fill="#34d399" fillOpacity={0.25} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: any, n: any, p: any) => [plain ? strength(p.payload.raw) : Number(p.payload.raw).toFixed(3), plain ? `${p.payload.desc}` : 'Σ SHAP (log-odds)']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ dumbbell (what changed) */

export function Dumbbell({ rows, threshold, plain }: { rows: { family: string; original_score: number; hypothetical_score: number }[]; threshold: number; plain: boolean }) {
  const max = Math.max(threshold * 1.4, ...rows.map((r) => Math.max(r.original_score, r.hypothetical_score))) * 1.08;
  const LW = 120, W = 520, RH = 34, top = 22;
  const x = (v: number) => LW + (v / max) * (W - LW - 20);
  const H = top + rows.length * RH + 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="What-if comparison">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
        </marker>
      </defs>
      <rect x={x(threshold)} y={top - 8} width={W - 20 - x(threshold)} height={rows.length * RH + 8} fill="#fb7185" fillOpacity="0.06" />
      <line x1={x(threshold)} y1={top - 12} x2={x(threshold)} y2={top + rows.length * RH} stroke="#fb7185" strokeDasharray="4 3" />
      <text x={x(threshold) + 4} y={top - 12} fill="#fb7185" fontSize="9.5">
        {plain ? 'flag line' : `threshold ${threshold.toFixed(3)}`}
      </text>
      {rows.map((r, i) => {
        const y = top + i * RH + RH / 2;
        const below = r.hypothetical_score < threshold;
        return (
          <g key={r.family}>
            <text x={LW - 10} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.75)" fontSize="11">
              {plain ? `Normal ${(FAMILY_PLAIN[r.family] ?? r.family).toLowerCase()}` : r.family}
            </text>
            <line x1={x(0)} y1={y} x2={W - 20} y2={y} stroke="rgba(255,255,255,0.05)" />
            <line x1={x(r.original_score)} y1={y} x2={x(r.hypothetical_score) + (r.hypothetical_score < r.original_score ? 7 : -7)} y2={y} stroke="#22d3ee" strokeWidth="2" markerEnd="url(#arr)" />
            <circle cx={x(r.original_score)} cy={y} r="5" fill="#fb7185" />
            <circle cx={x(r.hypothetical_score)} cy={y} r="5" fill={below ? '#34d399' : '#fbbf24'} stroke="#0b0f17" strokeWidth="1.5" />
            <text x={Math.min(x(r.hypothetical_score), x(r.original_score)) - 8} y={y + 4} textAnchor="end" fill={below ? '#34d399' : 'rgba(255,255,255,0.55)'} fontSize="10">
              {plain ? (below ? 'not flagged' : 'still flagged') : r.hypothetical_score.toFixed(3)}
            </text>
          </g>
        );
      })}
      <text x={x(0)} y={H - 4} fill="rgba(255,255,255,0.35)" fontSize="9.5">
        {plain ? 'less suspicious' : '0'}
      </text>
      <text x={W - 20} y={H - 4} fill="rgba(255,255,255,0.35)" fontSize="9.5" textAnchor="end">
        {plain ? 'more suspicious' : max.toFixed(2)}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ donut */

export function Donut({ data, center, sub }: { data: { key: string; label: string; value: number; color: string }[]; center: string; sub: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 100, cy = 100, r = 78;
  let a = Math.PI / 2;
  const h = data.find((d) => d.key === hover);
  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[220px]" role="img" aria-label="Band distribution">
      {data.map((d) => {
        const sweep = (d.value / total) * Math.PI * 2;
        const a0 = a, a1 = a - sweep;
        a = a1;
        const [x0, y0] = polar(cx, cy, r, a0);
        const [x1, y1] = polar(cx, cy, r, a1 + 0.0001);
        return (
          <path
            key={d.key}
            d={`M ${x0} ${y0} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}`}
            stroke={d.color}
            strokeWidth={hover === d.key ? 26 : 20}
            fill="none"
            strokeOpacity={hover && hover !== d.key ? 0.3 : 1}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
            style={{ transition: 'all .2s', cursor: 'pointer' }}
          />
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700">
        {h ? `${((h.value / total) * 100).toFixed(1)}%` : center}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">
        {h ? h.label : sub}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ 100 dots */

/** "Out of 100" pictogram: n1 coloured a, n2 coloured b, rest grey. */
export function HundredDots({ parts }: { parts: { n: number; color: string; label: string }[] }) {
  const cells: string[] = [];
  parts.forEach((p) => {
    for (let i = 0; i < Math.round(p.n); i++) cells.push(p.color);
  });
  while (cells.length < 100) cells.push('rgba(255,255,255,0.12)');
  return (
    <div>
      <div className="grid grid-cols-10 gap-1.5 w-fit">
        {cells.slice(0, 100).map((c, i) => (
          <span key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: c, transition: `background .4s ${i * 6}ms` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-white/60">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
