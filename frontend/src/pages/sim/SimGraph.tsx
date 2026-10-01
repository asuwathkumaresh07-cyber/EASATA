import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NODES, clock, explain, first, inr, isCustomer, nm, type Tx } from '@/lib/easata';
import { ScoreBar, TxLabel } from './common';

const W = 860, H = 440;
const NODE_COLOR = { person: '#6366f1', shop: '#64748b', unknown: '#f59e0b' } as const;

/** Small deterministic force layout: nodes repel, connected nodes attract. */
function layout(txs: Tx[], pin: string[]) {
  const ids = [...new Set(txs.flatMap((t) => [t.from, t.to]))];
  const nodes = ids.map((id, i) => {
    const a = (i / ids.length) * Math.PI * 2;
    return { id, x: W / 2 + 230 * Math.cos(a), y: H / 2 + 150 * Math.sin(a), vx: 0, vy: 0 };
  });
  const at = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // put the alert's sender on the left and receiver on the right so money reads left → right
  if (at[pin[0]]) Object.assign(at[pin[0]], { x: W * 0.3, y: H / 2 });
  if (at[pin[1]]) Object.assign(at[pin[1]], { x: W * 0.7, y: H / 2 });
  const pairs = [...new Set(txs.map((t) => [t.from, t.to].sort().join('|')))].map((k) => k.split('|'));
  for (let it = 0; it < 400; it++) {
    const cool = 1 - it / 400;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 64), d = Math.sqrt(d2), f = 11000 / d2;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    pairs.forEach(([p, q]) => {
      const a = at[p], b = at[q];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 170) * 0.03;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    });
    nodes.forEach((n) => {
      if (pin.includes(n.id)) {
        n.vx = n.vy = 0;
        return;
      }
      n.vx += (W / 2 - n.x) * 0.004; n.vy += (H / 2 - n.y) * 0.01;
      n.x += Math.max(-20, Math.min(20, n.vx)) * cool; n.y += Math.max(-20, Math.min(20, n.vy)) * cool;
      n.vx *= 0.6; n.vy *= 0.6;
      n.x = Math.max(70, Math.min(W - 70, n.x)); n.y = Math.max(36, Math.min(H - 40, n.y));
    });
  }
  return at;
}

export function RelationshipGraph({ txs, focus }: { txs: Tx[]; focus: Tx }) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [selId, setSelId] = useState<string>(focus.id);
  const at = useMemo(() => layout(txs, [focus.from, focus.to]), [txs, focus]);
  const edges = txs.filter((t) => !flaggedOnly || t.flagged || t.id === focus.id);
  const sel = txs.find((t) => t.id === selId) ?? focus;
  const groups: Record<string, string[]> = {};
  txs.forEach((t) => (groups[[t.from, t.to].sort().join('|')] ||= []).push(t.id));
  const R = (id: string) => (id === focus.from || id === focus.to ? 22 : NODES[id].type === 'person' ? 16 : 13);
  const shown = new Set(edges.flatMap((t) => [t.from, t.to]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
          <span className="flex items-center gap-1.5"><span className="w-5 h-[3px] rounded bg-rose-500" /> Flagged payment</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-[3px] rounded bg-emerald-500" /> Cleared payment</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: NODE_COLOR.person }} /> Person</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: NODE_COLOR.shop }} /> Shop</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: NODE_COLOR.unknown }} /> Unknown account</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer select-none">
          <span className={`relative w-9 h-5 rounded-full transition-colors ${flaggedOnly ? 'bg-rose-500' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${flaggedOnly ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          <input type="checkbox" className="sr-only" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged payments only
        </label>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-2xl bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.10),transparent_70%)] ring-1 ring-white/10" role="img" aria-label="Who paid whom">
          <defs>
            {(['r', 'g'] as const).map((k) => (
              <marker key={k} id={`ah2-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={k === 'r' ? '#f43f5e' : '#22c55e'} />
              </marker>
            ))}
          </defs>
          {edges.map((t) => {
            const a = at[t.from], b = at[t.to];
            const g = groups[[t.from, t.to].sort().join('|')];
            const i = g.indexOf(t.id), m = g.length;
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const off = m === 1 ? 0 : (i - (m - 1) / 2) * 30 * (t.from < t.to ? 1 : -1);
            const cx = (a.x + b.x) / 2 + (-dy / d) * off, cy = (a.y + b.y) / 2 + (dx / d) * off;
            const trim = (px: number, py: number, r: number) => {
              const l = Math.hypot(cx - px, cy - py) || 1;
              return [px + ((cx - px) / l) * r, py + ((cy - py) / l) * r];
            };
            const [sx, sy] = trim(a.x, a.y, R(t.from) + 3);
            const [ex, ey] = trim(b.x, b.y, R(t.to) + 7);
            const path = `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
            const color = t.flagged ? '#f43f5e' : '#22c55e';
            const isSel = t.id === sel.id;
            const isFocus = t.id === focus.id;
            return (
              <g key={t.id} className="cursor-pointer" onClick={() => setSelId(t.id)} style={{ opacity: isSel || isFocus ? 1 : 0.55, transition: 'opacity .2s' }}>
                <path d={path} fill="none" stroke="transparent" strokeWidth={18}>
                  <title>{`${nm(t.from)} → ${nm(t.to)}: ${inr(t.amount)} (${t.flagged ? 'flagged' : 'cleared'}). Click for details.`}</title>
                </path>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={(isSel ? 1.5 : 0) + 1.6 + Math.log10(t.amount / 500 + 1) * 1.4}
                  markerEnd={`url(#ah2-${t.flagged ? 'r' : 'g'})`}
                  pointerEvents="none"
                  style={isSel ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
                />
                {isFocus && <path d={path} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2} className="edge-flow" pointerEvents="none" />}
                {(isSel || isFocus) && (
                  <text x={cx} y={cy - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" stroke="#0b0f17" strokeWidth={4} paintOrder="stroke" pointerEvents="none">
                    {inr(t.amount)} · {clock(t.min)}
                  </text>
                )}
              </g>
            );
          })}
          {Object.keys(at)
            .filter((id) => shown.has(id))
            .map((id) => {
              const p = at[id];
              const main = id === focus.from || id === focus.to;
              const label = isCustomer(id) ? first(id) : nm(id).replace('Unknown account ', 'Acct ');
              return (
                <g key={id}>
                  {main && <circle cx={p.x} cy={p.y} r={R(id) + 7} fill="none" stroke={NODE_COLOR[NODES[id].type]} strokeOpacity={0.35} strokeWidth={2} />}
                  <circle cx={p.x} cy={p.y} r={R(id)} fill={NODE_COLOR[NODES[id].type]} stroke="#0b0f17" strokeWidth={3}>
                    <title>{nm(id)}</title>
                  </circle>
                  <text x={p.x} y={p.y + R(id) + 16} textAnchor="middle" fontSize={main ? 13 : 11.5} fontWeight={main ? 700 : 600} fill="#e2e8f0" stroke="#0b0f17" strokeWidth={4} paintOrder="stroke">
                    {label}
                  </text>
                  {id === focus.from && (
                    <text x={p.x} y={p.y - R(id) - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">SENDER</text>
                  )}
                  {id === focus.to && (
                    <text x={p.x} y={p.y - R(id) - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">RECEIVER</text>
                  )}
                </g>
              );
            })}
        </svg>

        <aside className="rounded-2xl bg-black/30 ring-1 ring-white/10 p-4 h-fit">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{sel.id === focus.id ? 'This alert’s payment' : 'Selected payment'}</div>
          <div className="font-semibold mt-1">
            {nm(sel.from)} → {nm(sel.to)}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <TxLabel t={sel} />
            <span className="text-lg font-bold">{inr(sel.amount)}</span>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm mt-3">
            <dt className="text-white/45">Time</dt>
            <dd>{clock(sel.min)}</dd>
            <dt className="text-white/45">Where</dt>
            <dd>{sel.city}</dd>
            <dt className="text-white/45">Device</dt>
            <dd>{sel.device}</dd>
          </dl>
          <div className="my-3">
            <ScoreBar score={sel.score} />
          </div>
          <p className="text-sm text-white/65">{explain(sel)}</p>
          {sel.flagged && sel.id !== focus.id && (
            <Link className="btn btn-ghost mt-3 !py-1.5" to={`/simulate/alerts/${sel.alertNo}`}>
              Open Alert #{sel.alertNo}
            </Link>
          )}
          <p className="text-[11px] text-white/35 mt-3">Click any arrow to see that payment here.</p>
        </aside>
      </div>
    </div>
  );
}
