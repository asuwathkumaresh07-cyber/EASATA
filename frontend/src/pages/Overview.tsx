import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { useMode } from '@/lib/mode';
import { BAND_PLAIN, oneIn } from '@/lib/labels';
import { BAND_COLOR, Band, Card, ErrorBox, Loading, PageHeader, Stat, TOOLTIP_STYLE, money, num, pct } from '@/components/ui';
import { ChartNote, Donut } from '@/components/charts';

const BANDS = ['PROCEED', 'STEP_UP', 'HOLD', 'BLOCK'];

export default function Overview() {
  const plain = useMode().mode === 'plain';
  const { data: o, error } = useApi<any>('/api/overview');
  const { data: mon } = useApi<any>('/api/monitoring');

  if (error) return <ErrorBox error={error} />;
  if (!o) return <Loading />;

  const wf = o.workflow;
  const donut = BANDS.map((b) => ({ key: b, label: plain ? BAND_PLAIN[b].title : b.replace('_', '-'), value: o.bands[b] ?? 0, color: BAND_COLOR[b] }));
  const monthly = (mon?.monthly ?? []).filter((m: any) => !mon.skipped_small_months?.includes(m.month));
  const avgAlert = monthly.length ? monthly.reduce((s: number, m: any) => s + m.alert_rate, 0) / monthly.length : 0;

  return (
    <>
      <PageHeader title={plain ? 'At a glance' : 'Overview'} sub={`${o.period[0].slice(0, 10)} → ${o.period[1].slice(0, 10)} · synthetic bank transactions`} />

      {plain && (
        <div className="panel p-5 mb-4 text-base md:text-lg leading-relaxed">
          We checked <b>{o.transactions.toLocaleString()}</b> payments. About <b>{Math.round(o.alerts_per_1000 / 10)} in 100</b> looked suspicious enough to flag. In this data {oneIn(o.synthetic_label_rate)} payments is
          really fraud, so most flags are a nuisance, and the system only interrupts the customer when the risk or amount is high.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={plain ? 'Payments checked' : 'Transactions'} value={o.transactions.toLocaleString()} />
        <Stat label={plain ? 'Flagged as suspicious' : 'Alerts'} value={o.alerts.toLocaleString()} sub={plain ? `${(o.alerts_per_1000 / 10).toFixed(1)} in every 100` : `${o.alerts_per_1000.toFixed(1)} per 1,000`} accent="#fb923c" />
        <Stat label={plain ? 'Money at risk in flagged payments' : 'Expected loss flagged'} value={money(o.expected_loss_flagged_total)} sub={plain ? 'chance of fraud × amount, added up' : 'Σ p × amount over alerts'} />
        <Stat label={plain ? 'Real fraud in the data' : 'Synthetic label rate'} value={pct(o.synthetic_label_rate)} sub={plain ? oneIn(o.synthetic_label_rate) + ' payments' : 'is_fraud mean'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title={plain ? 'What happens to payments' : 'Decision bands'}>
          <div className="flex flex-col items-center">
            <Donut data={donut} center={o.transactions >= 1000 ? `${Math.round(o.transactions / 1000)}k` : String(o.transactions)} sub={plain ? 'payments' : 'transactions'} />
            <ul className="w-full mt-4 space-y-2 text-sm">
              {donut.map((d) => (
                <li key={d.key} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="flex-1">
                    {d.label}
                    {plain && <span className="block text-[11px] text-white/40">{BAND_PLAIN[d.key].text}</span>}
                  </span>
                  <span className="text-white/60">{pct(d.value / o.transactions)}</span>
                </li>
              ))}
            </ul>
          </div>
          <ChartNote>{plain ? 'Hover the ring. Most payments go straight through; only a small slice is stopped.' : 'Bands from p vs 0.5t/t/2t, bumped +1 when p×amount ≥ expected-loss-high.'}</ChartNote>
        </Card>

        <Card
          title={plain ? 'Is the system still behaving normally?' : 'Model health: monthly rates & PSI drift'}
          className="lg:col-span-2"
          right={
            mon && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full ring-1 ${mon.status === 'stable' ? 'text-emerald-300 ring-emerald-400/30 bg-emerald-500/10' : 'text-amber-300 ring-amber-400/30'}`}>
                {plain ? (mon.status === 'stable' ? '● Steady' : '● Changing') : `PSI: ${mon.status}`}
              </span>
            )
          }
        >
          {mon ? (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={monthly} margin={{ left: -8, right: 12, top: 10 }}>
                    <defs>
                      <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fb7185" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [pct(v, 2), n]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} />
                    <ReferenceLine y={avgAlert} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" label={{ value: plain ? 'average' : `mean ${pct(avgAlert)}`, fill: 'rgba(255,255,255,0.45)', fontSize: 10, position: 'insideTopRight' }} />
                    <Area type="monotone" dataKey="alert_rate" name={plain ? 'Share flagged' : 'alert rate'} stroke="#22d3ee" strokeWidth={2} fill="url(#gA)" />
                    <Area type="monotone" dataKey="label_rate" name={plain ? 'Share really fraud' : 'label rate'} stroke="#fb7185" strokeWidth={2} fill="url(#gL)" />
                    {!plain && <Area type="monotone" dataKey="mean_score" name="mean score" stroke="#a78bfa" strokeWidth={1.5} fill="none" strokeDasharray="3 3" />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <ChartNote>
                {plain
                  ? 'If the blue line suddenly jumped or fell, the system would be behaving differently from when it was trained, and someone should check it. Here both lines stay flat, which is what we want.'
                  : `Reference month ${mon.reference_month}. PSI across ${mon.features_monitored?.length ?? 0} monitored features; status ${mon.status}. ${mon.notes?.[0] ?? ''}`}
              </ChartNote>
            </>
          ) : (
            <Loading />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title={plain ? 'Customer responses' : 'Response workflow'}>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-white/50">{plain ? 'Accounts frozen' : 'Frozen accounts'}</dt>
            <dd className="text-right">{wf.frozen_accounts}</dd>
            <dt className="text-white/50">{plain ? 'Remembered safe habits' : 'Active trusted patterns'}</dt>
            <dd className="text-right">{wf.active_trusted_patterns}</dd>
            <dt className="text-white/50">{plain ? 'Test payments made' : 'Simulated payments'}</dt>
            <dd className="text-right">{wf.simulated_transactions}</dd>
            <dt className="text-white/50">{plain ? '"Not me" / "It was me"' : 'Feedback: not me / was me'}</dt>
            <dd className="text-right">
              {wf.feedback?.not_me ?? 0} / {wf.feedback?.was_me ?? 0}
            </dd>
            {Object.entries(wf.cases_by_status ?? {}).map(([k, v]) => (
              <Row key={k} k={`Cases ${k.replace(/_/g, ' ').toLowerCase()}`} v={v as number} />
            ))}
          </dl>
          {!plain && (
            <div className="mt-4 pt-4 border-t border-white/5 text-xs text-white/45">
              Test: AP {num(o.model.test_avg_precision)} · precision {pct(o.model.test_precision)} · recall {pct(o.model.test_recall)}
            </div>
          )}
        </Card>
        <ReplayFeed plain={plain} />
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <>
      <dt className="text-white/50 capitalize">{k}</dt>
      <dd className="text-right">{v}</dd>
    </>
  );
}

function ReplayFeed({ plain }: { plain: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [pulse, setPulse] = useState<{ s: number; b: string }[]>([]);
  const [running, setRunning] = useState(true);
  const cursor = useRef(0);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      try {
        const r = await api<any>(`/api/replay?cursor=${cursor.current}&limit=4`);
        cursor.current = r.done ? 0 : r.next_cursor;
        setItems((prev) => [...r.items.slice().reverse(), ...prev].slice(0, 10));
        setPulse((prev) => [...prev, ...r.items.map((i: any) => ({ s: i.score, b: i.band }))].slice(-80));
      } catch {
        /* keep polling */
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, [running]);

  const maxS = Math.max(0.3, ...pulse.map((p) => p.s));
  return (
    <Card
      title={plain ? 'Payments arriving now (replay)' : 'Live replay stream'}
      className="lg:col-span-2"
      right={
        <button className="btn btn-ghost !py-1 !px-3 text-xs" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} {running ? 'Pause' : 'Play'}
        </button>
      }
    >
      {/* risk pulse: one bar per payment, height = score, colour = band */}
      <div className="h-16 flex items-end gap-[3px] mb-4 px-1 rounded-lg bg-white/[0.02]">
        {pulse.map((p, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ height: `${Math.max(4, (p.s / maxS) * 100)}%`, background: BAND_COLOR[p.b], opacity: 0.35 + (0.65 * i) / pulse.length, transition: 'height .4s' }}
            title={`${p.b} · ${p.s.toFixed(3)}`}
          />
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>{plain ? 'When' : 'Time'}</th>
              {!plain && <th>Transaction</th>}
              <th>{plain ? 'Shop' : 'Merchant'}</th>
              <th className="text-right">Amount</th>
              <th className="text-right">{plain ? 'Fraud chance' : 'Score'}</th>
              <th>{plain ? 'Action' : 'Band'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.cursor}>
                <td className="text-white/50">{t.ts}</td>
                {!plain && (
                  <td>
                    <Link className="text-cyan-300 hover:underline" to={`/alerts/${t.transaction_id}`}>
                      {t.transaction_id}
                    </Link>
                  </td>
                )}
                <td>
                  {plain ? (
                    <Link className="hover:underline" to={`/alerts/${t.transaction_id}`}>
                      {t.merchant_category}
                    </Link>
                  ) : (
                    t.merchant_category
                  )}
                </td>
                <td className="text-right">{money(t.transaction_amount)}</td>
                <td className="text-right">{plain ? `${Math.round(t.score * 100)}%` : num(t.score)}</td>
                <td>{plain ? <span style={{ color: BAND_COLOR[t.band] }}>{BAND_PLAIN[t.band].title}</span> : <Band band={t.band} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChartNote>{plain ? 'The strip on top is a heartbeat of risk: each bar is one payment, taller = more suspicious, coloured by what we would do.' : 'Pulse: last 80 replayed rows, bar height ∝ score, colour = band.'}</ChartNote>
    </Card>
  );
}
