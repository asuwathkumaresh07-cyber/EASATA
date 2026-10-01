import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Cell, ComposedChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BadgeCheck, Mail, ShieldAlert, Snowflake } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { useMode } from '@/lib/mode';
import { BAND_PLAIN, FAMILY_PLAIN, feat, oneIn, plainVal } from '@/lib/labels';
import { BAND_COLOR, Band, Card, ErrorBox, Loading, Notice, Status, TOOLTIP_STYLE, money, num, when } from '@/components/ui';
import { ChartNote, Dumbbell, FamilyRadar, RiskGauge, Waterfall } from '@/components/charts';

/** One-paragraph verdict, in the reader's language. */
export function Verdict({ score, threshold, band, amount, plain }: { score: number; threshold: number; band: string; amount: number; plain: boolean }) {
  if (!plain) return null;
  const flagged = score >= threshold;
  return (
    <div className="rounded-2xl p-5 ring-1" style={{ background: `${BAND_COLOR[band]}14`, borderColor: BAND_COLOR[band], boxShadow: `inset 0 0 0 1px ${BAND_COLOR[band]}40` }}>
      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: BAND_COLOR[band] }}>
        In short
      </div>
      <p className="text-lg md:text-xl font-medium mt-1.5 leading-snug">
        {flagged ? (
          <>
            This payment looks suspicious. About <b>{Math.round(score * 100)}%</b> of payments like it ({oneIn(score)}) turn out to be fraud, where a normal payment is closer to 1 in 20.
          </>
        ) : (
          <>This payment looks mostly normal: {oneIn(score)} payments like it turn out to be fraud.</>
        )}{' '}
        Recommended action: <b style={{ color: BAND_COLOR[band] }}>{BAND_PLAIN[band].title.toLowerCase()}</b>. {BAND_PLAIN[band].text}
      </p>
      <p className="text-sm text-white/55 mt-2">
        Money at risk: <b className="text-white">{money(score * amount)}</b> (the chance of fraud × the {money(amount)} amount). This is a warning sign, not proof.
      </p>
    </div>
  );
}

export default function AlertDetail() {
  const { id } = useParams();
  const { mode } = useMode();
  const plain = mode === 'plain';
  const { data: d, error, reload } = useApi<any>(`/api/alerts/${id}`);
  const [busy, setBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<any>(null);
  const [notifyErr, setNotifyErr] = useState<unknown>(null);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;

  const t = d.transaction;
  const ex = d.explanation;
  const dec = d.decision;

  const notify = async () => {
    setBusy(true);
    setNotifyErr(null);
    try {
      setNotifyResult(await api(`/api/ops/alerts/${t.transaction_id}/notify`, { method: 'POST' }));
      reload();
    } catch (e) {
      setNotifyErr(e);
    } finally {
      setBusy(false);
    }
  };

  const hist = (d.history?.transactions ?? []).map((h: any) => ({ ...h, x: new Date(h.ts.replace(' ', 'T')).getTime() }));
  const nr = d.history?.normal_range;
  const alertStatus = d.alert?.status;
  const canNotify = ex.flagged && (!alertStatus || alertStatus === 'NEW' || alertStatus === 'NOTIFIED') && d.account?.status !== 'frozen';
  const timesUsual = nr?.high ? t.transaction_amount / nr.high : null;
  const cf = d.counterfactual;
  const topFamily = Object.entries(ex.families as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <>
      <Link to="/alerts" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> {plain ? 'All warnings' : 'Alerts'}
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{plain ? `Payment of ${money(t.transaction_amount)}` : t.transaction_id}</h1>
            <Band band={dec.band} />
            <Status s={alertStatus} />
            {d.account?.status === 'frozen' && <Status s="frozen" />}
          </div>
          <p className="text-sm text-white/55 mt-1.5">
            {plain ? (
              <>
                Paid by {t.payment_method.toLowerCase()} at a {t.merchant_category.toLowerCase()} shop in {t.city}, {t.country}, from a {t.device_type.toLowerCase()} on {when(t.ts)} ·{' '}
              </>
            ) : (
              <>
                {money(t.transaction_amount)} · {t.payment_method} to {t.merchant_category} · {t.city}, {t.country} · {t.device_type} · {t.ts} ·{' '}
              </>
            )}
            <Link className="text-cyan-300 hover:underline" to={`/customers/${t.customer_id}`}>
              {plain ? 'customer ' : ''}
              {t.customer_id}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.case && (
            <Link to={`/cases/${d.case.case_id}`} className="btn btn-ghost">
              <ShieldAlert className="w-4 h-4" /> Case #{d.case.case_id}
            </Link>
          )}
          <button className="btn btn-primary" disabled={!canNotify || busy} onClick={notify} title={canNotify ? '' : 'Not available for this alert state'}>
            <Mail className="w-4 h-4" /> {alertStatus === 'NOTIFIED' ? 'Re-send' : 'Send'} "Was this you?"
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <ErrorBox error={notifyErr} />
        {notifyResult && (
          <Notice>
            Email sent ({notifyResult.delivery?.delivery}) to {notifyResult.delivery?.recipient}. The link expires {when(notifyResult.expires_at)}.{' '}
            <Link className="underline" to={`/inbox?customer_id=${t.customer_id}`}>Open the demo inbox →</Link>
          </Notice>
        )}
      </div>

      <div className="mb-4">
        <Verdict score={d.score} threshold={ex.threshold} band={dec.band} amount={t.transaction_amount} plain={plain} />
      </div>

      {/* ---------------- scorecards ---------------- */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={plain ? 'How suspicious is it?' : 'Risk gauge'}>
          <RiskGauge score={d.score} threshold={ex.threshold} band={dec.band} plain={plain} />
          <ChartNote>
            {plain
              ? 'The needle shows how likely this is to be fraud. Each coloured zone is a different response, from "let it through" to "stop the payment".'
              : `Zones = base bands at 0.5t / t / 2t (t = ${num(ex.threshold, 4)}, chosen on validation). The last zone is square-root scaled. Expected loss can raise the band by one.`}
          </ChartNote>
        </Card>
        <Card title={plain ? 'How unusual is it?' : 'Anomaly percentile'}>
          <div className="flex items-end gap-2">
            <div className="text-5xl font-bold">{d.anomaly_percentile?.toFixed(0)}</div>
            <div className="text-white/50 pb-1.5">{plain ? '/ 100' : 'pctl'}</div>
          </div>
          <div className="mt-4 h-3 rounded-full bg-gradient-to-r from-emerald-400/40 via-amber-400/40 to-rose-500/60 relative">
            <div className="absolute -top-1 w-1.5 h-5 rounded bg-white shadow-lg" style={{ left: `calc(${Math.min(100, d.anomaly_percentile)}% - 3px)`, transition: 'left .8s' }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/35 mt-1">
            <span>{plain ? 'ordinary' : '0'}</span>
            <span>{plain ? 'very unusual' : '100'}</span>
          </div>
          <ChartNote>
            {plain
              ? `A second, separate check. This payment is stranger than ${d.anomaly_percentile?.toFixed(0)}% of normal payments. Unusual doesn't always mean fraud.`
              : d.anomaly_note}
          </ChartNote>
        </Card>
        <Card title={plain ? 'What should happen?' : 'Decision (simulated)'}>
          <div className="text-lg font-semibold" style={{ color: BAND_COLOR[dec.band] }}>
            {plain ? BAND_PLAIN[dec.band].title : dec.band}
          </div>
          <p className="text-sm text-white/70 mt-1">{plain ? BAND_PLAIN[dec.band].text : dec.label}</p>
          <div className="mt-4 text-sm grid grid-cols-2 gap-y-1.5">
            <span className="text-white/45">{plain ? 'Money at risk' : 'Expected loss'}</span>
            <span className="text-right font-semibold">{money(dec.expected_loss)}</span>
            {!plain && (
              <>
                <span className="text-white/45">High-loss line</span>
                <span className="text-right">{money(dec.expected_loss_high)}</span>
                <span className="text-white/45">Model band</span>
                <span className="text-right">{dec.model_band}</span>
              </>
            )}
          </div>
          {dec.trusted_pattern_applied && <div className="text-xs text-emerald-300 mt-2">{plain ? 'The customer confirmed similar payments before, so we are less strict.' : 'Trusted pattern lowered friction by one level'}</div>}
          {!plain && dec.notes?.length > 0 && (
            <ul className="text-xs text-white/55 list-disc pl-4 mt-3 space-y-1">
              {dec.notes.map((n: string) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------- why ---------------- */}
      <div className="grid lg:grid-cols-5 gap-4 mt-4">
        <Card
          className="lg:col-span-3"
          title={plain ? 'Why did we flag it?' : 'Verified reasons'}
          right={
            ex.numbers_verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-400/30 rounded-full px-2.5 py-0.5">
                <BadgeCheck className="w-3.5 h-3.5" /> {plain ? 'facts double-checked' : 'all numbers verified from data'}
              </span>
            ) : (
              <span className="text-xs text-amber-300">unverified</span>
            )
          }
        >
          {!plain && <p className="text-sm text-white/75 mb-4">{ex.summary}</p>}
          <ol className="space-y-2.5">
            {ex.reasons.map((r: any, i: number) => (
              <li key={r.feature} className="flex items-start gap-3 text-sm bg-white/[0.025] rounded-xl px-3 py-2.5">
                <span className={`mt-0.5 w-6 h-6 rounded-full shrink-0 grid place-items-center text-[11px] font-bold ${r.shap >= 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{i + 1}</span>
                <span className="flex-1">
                  {plain && <span className="block text-white/45 text-[11px] uppercase tracking-wide">{FAMILY_PLAIN[r.family] ?? r.family}</span>}
                  {r.text}
                </span>
                {!plain && (
                  <>
                    <span className="text-[11px] text-white/40 uppercase tracking-wide">{r.family}</span>
                    <span className="text-xs text-white/50 w-12 text-right">
                      {r.shap >= 0 ? '+' : ''}
                      {r.shap.toFixed(2)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          {ex.unverified_reasons_dropped > 0 && <p className="text-xs text-amber-300 mt-3">{ex.unverified_reasons_dropped} reason(s) dropped because their numbers could not be verified.</p>}
          {ex.limited_history && <p className="text-xs text-amber-300 mt-3">{plain ? "We don't know this customer's habits well yet, so comparisons with their past are weaker." : 'Limited customer history: habit features are less reliable.'}</p>}
          <ChartNote>
            {plain
              ? 'Every number in these reasons was re-read from the payment data by a second check before it is shown. Anything that could not be confirmed is removed.'
              : 'Reasons are templates filled from row/baseline values; a verifier re-derives each number. Ordered by |SHAP|.'}
          </ChartNote>
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="text-xs text-white/45 mb-2">{plain ? 'What the customer is told (no scores, so fraudsters learn nothing)' : 'Customer-safe message (email body, no model internals)'}</div>
            <p className="text-sm text-white/70 italic">"{ex.customer_message}"</p>
          </div>
        </Card>

        <Card className="lg:col-span-2" title={plain ? 'Which kinds of signals?' : 'Risk profile by feature family'}>
          <FamilyRadar families={ex.families} plain={plain} />
          <ChartNote>
            {plain ? (
              <>
                Red area = things that made us <b>more</b> suspicious, green = things that made us <b>less</b> suspicious. The biggest worry here is{' '}
                <b>{(FAMILY_PLAIN[topFamily] ?? topFamily)?.toLowerCase()}</b>.
              </>
            ) : (
              'Σ SHAP per family, split into positive (red) and negative (green) radii. Hover for exact log-odds.'
            )}
          </ChartNote>
        </Card>
      </div>

      <Card className="mt-4" title={plain ? 'How each detail moved the needle' : 'SHAP waterfall (top 12 features)'}>
        <Waterfall base={ex.shap_base_value} items={ex.shap_top} plain={plain} />
        <ChartNote>
          {plain
            ? 'Start at the top with an ordinary payment. Each bar shows one detail of this payment pushing suspicion up (red) or down (green). The dot at the bottom is where this payment ends up.'
            : `Cumulative log-odds from the base value ${num(ex.shap_base_value, 2)} (${ex.shap_units}). Remaining features are omitted, so the end point is approximate; calibration is applied after.`}
        </ChartNote>
      </Card>

      {/* ---------------- what if ---------------- */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card title={plain ? 'What would change our mind?' : 'Counterfactual & family swap'}>
          {cf?.needed ? (
            <div className="rounded-xl bg-cyan-500/5 ring-1 ring-cyan-400/20 p-4 text-sm">
              {plain ? (
                <>
                  If{' '}
                  {cf.changes.map((c: any, i: number) => (
                    <span key={c.feature}>
                      {i > 0 && ' and '}
                      <b className="text-cyan-300">{feat(c.feature, true).replace(/^\w/, (m: string) => m.toLowerCase())}</b> had been <b>{plainVal(c.feature, c.to)}</b> instead of {plainVal(c.feature, c.from)}
                    </span>
                  ))}
                  , we would {cf.reaches_below_threshold ? <b className="text-emerald-300">not have flagged it</b> : 'still have flagged it'}.
                </>
              ) : (
                <>
                  {cf.changes.map((c: any) => `${c.feature}: ${c.from} → ${c.to}`).join(', ')} ⇒ p {num(cf.original_score)} → <b>{num(cf.final_score)}</b>
                  {cf.reaches_below_threshold ? ' (below t)' : ' (still ≥ t)'}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/55">{plain ? 'Nothing to change: this payment is not flagged.' : 'Not flagged; no counterfactual needed.'}</p>
          )}
          <div className="mt-5">
            <Dumbbell rows={d.what_changed ?? []} threshold={ex.threshold} plain={plain} />
          </div>
          <ChartNote>
            {plain
              ? 'Each row imagines one group of details being normal. Red dot = now, arrow = where it would go. Green = it would no longer be flagged. This shows how the system thinks. It does not prove what caused the fraud.'
              : cf?.note ?? 'Family replaced with baseline values and re-scored. Model behaviour, not causation.'}
          </ChartNote>
        </Card>

        <Card title={plain ? "Compared with this customer's usual spending" : 'Sender history vs normal range'}>
          {hist.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <ComposedChart margin={{ left: 0, right: 16, top: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin - 86400000', 'dataMax + 86400000']}
                    scale="time"
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  />
                  <YAxis dataKey="transaction_amount" scale="log" domain={['auto', 'auto']} allowDataOverflow tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))} />
                  {nr && <ReferenceArea y1={Math.max(1, nr.low)} y2={nr.high} fill="#22d3ee" fillOpacity={0.1} stroke="#22d3ee" strokeOpacity={0.25} strokeDasharray="3 3" label={{ value: plain ? 'usual range' : 'normal range', fill: '#67e8f9', fontSize: 10, position: 'insideTopLeft' }} />}
                  <ReferenceLine y={t.transaction_amount} stroke="#fb7185" strokeDasharray="4 3" label={{ value: plain ? 'this payment' : money(t.transaction_amount), fill: '#fb7185', fontSize: 10, position: 'insideTopRight' }} />
                  <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => new Date(Number(v)).toLocaleString()} formatter={(v: any, n: any) => (n === 'x' ? [null, null] : [money(v), 'amount'])} />
                  <Scatter data={hist} dataKey="transaction_amount">
                    {hist.map((h: any) => (
                      <Cell key={h.transaction_id} fill={h.transaction_id === t.transaction_id ? '#fb7185' : h.alert ? '#fb923c' : '#94a3b8'} r={h.transaction_id === t.transaction_id ? 8 : 4} />
                    ))}
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-white/50">No history.</p>
          )}
          <ChartNote>
            {plain ? (
              <>
                Each dot is a past payment (log scale). The blue band is a normal amount{nr?.source === 'population' ? ' for customers in general (we have little history for this one)' : ' for this customer'}.
                {timesUsual && timesUsual > 1.2 && (
                  <>
                    {' '}This payment is <b className="text-rose-300">{timesUsual >= 10 ? Math.round(timesUsual) : timesUsual.toFixed(1)}×</b> the top of that range.
                  </>
                )}
              </>
            ) : (
              <>
                Log-scale amounts. Band = {nr?.source} 10th–90th pct ({money(nr?.low)}–{money(nr?.high)}, n={nr?.n}). {nr?.note}
              </>
            )}
          </ChartNote>
        </Card>
      </div>

      {(d.alert || d.notifications?.length > 0 || d.account?.status === 'frozen') && (
        <Card title={plain ? "What's happened so far" : 'Workflow'} className="mt-4">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-white/45 text-xs mb-1">Alert</div>
              {d.alert ? (
                <>
                  #{d.alert.alert_id} · <Status s={d.alert.status} /> · updated {when(d.alert.updated_at)}
                </>
              ) : (
                '—'
              )}
            </div>
            <div>
              <div className="text-white/45 text-xs mb-1">{plain ? 'Messages to the customer' : 'Notifications'}</div>
              {d.notifications?.map((n: any) => (
                <div key={n.id}>
                  sent {when(n.sent_at)} · {n.used_at ? `used ${when(n.used_at)}` : `expires ${when(n.expires_at)}`}
                </div>
              ))}
            </div>
            <div>
              <div className="text-white/45 text-xs mb-1">Account</div>
              <span className="inline-flex items-center gap-1.5">
                {d.account.status === 'frozen' && <Snowflake className="w-4 h-4 text-cyan-300" />}
                <Status s={d.account.status} /> {d.account.frozen_reason && <span className="text-white/50">{d.account.frozen_reason}</span>}
              </span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
