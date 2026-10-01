import { Bar, BarChart, CartesianGrid, Cell, Line, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis, ZAxis, ReferenceLine } from 'recharts';
import { useApi } from '@/lib/useApi';
import { useMode } from '@/lib/mode';
import { feat } from '@/lib/labels';
import { Card, ErrorBox, Loading, PageHeader, TOOLTIP_STYLE, num, pct } from '@/components/ui';
import { ChartNote, HundredDots } from '@/components/charts';

const MODELS: [string, string, string, string][] = [
  ['catboost', 'CatBoost (calibrated)', 'Our system', '#22d3ee'],
  ['isolation_forest', 'Isolation Forest', '"Is it unusual?" check alone', '#a78bfa'],
  ['amount_threshold_baseline', 'Amount-only baseline', 'Just looking at the amount', '#94a3b8'],
];

const axis = { tick: { fill: 'rgba(255,255,255,0.45)', fontSize: 11 }, axisLine: false, tickLine: false } as const;

export default function Evaluation() {
  const plain = useMode().mode === 'plain';
  const { data, error } = useApi<any>('/api/evaluation');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const e = data.evaluation;
  const cb = e.catboost;
  const base = cb.confusion.tp + cb.confusion.fn;
  const baseRate = base / (cb.confusion.tp + cb.confusion.fn + cb.confusion.fp + cb.confusion.tn);
  const imp = Object.entries(e.global_importance ?? {})
    .map(([k, v]) => ({ name: feat(k, plain), v: v as number }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 12);
  const cm = cb.confusion;
  const compare = MODELS.map(([k, pro, pl, c]) => ({ name: plain ? pl : pro, ap: e[k].avg_precision, auc: e[k].roc_auc, color: c }));

  return (
    <>
      <PageHeader
        title={plain ? 'How good is it, honestly?' : 'Evaluation'}
        sub={plain ? 'Measured on months of payments the system never saw while learning.' : `Untouched test period. Threshold ${num(data.threshold, 4)} (${data.threshold_mode}).`}
      />

      {/* ---------------- headline pictograms ---------------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={plain ? 'Out of every 100 warnings…' : 'Precision (per 100 alerts)'}>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <HundredDots
              parts={[
                { n: cb.precision * 100, color: '#fb7185', label: plain ? 'real fraud' : `TP ${pct(cb.precision)}` },
                { n: 100 - cb.precision * 100, color: 'rgba(251,146,60,0.35)', label: plain ? 'false alarm' : 'FP' },
              ]}
            />
            <p className="text-sm text-white/65 leading-relaxed">
              {plain ? (
                <>
                  About <b className="text-white">{Math.round(cb.precision * 100)}</b> are real fraud. That sounds low, but picking at random would find only about{' '}
                  <b className="text-white">{Math.round(baseRate * 100)}</b>, so warnings are <b className="text-cyan-300">{(cb.precision / baseRate).toFixed(1)}× more likely</b> to be fraud than a random payment.
                  That's why most warnings only ask the customer to confirm.
                </>
              ) : (
                <>
                  Precision {pct(cb.precision)} vs base rate {pct(baseRate)} → lift {(cb.precision / baseRate).toFixed(2)}×. F1 {num(cb.f1)}; {cb.alerts_per_1000.toFixed(1)} alerts / 1,000.
                </>
              )}
            </p>
          </div>
        </Card>
        <Card title={plain ? 'Out of every 100 real frauds…' : 'Recall (per 100 frauds)'}>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <HundredDots
              parts={[
                { n: cb.recall * 100, color: '#34d399', label: plain ? 'caught' : `TP ${pct(cb.recall)}` },
                { n: 100 - cb.recall * 100, color: 'rgba(148,163,184,0.35)', label: plain ? 'missed' : 'FN' },
              ]}
            />
            <p className="text-sm text-white/65 leading-relaxed">
              {plain ? (
                <>
                  We catch about <b className="text-white">{Math.round(cb.recall * 100)}</b>. The rest look just like normal payments in this (computer-generated) data, so no system could tell them apart well.
                </>
              ) : (
                <>
                  Recall {pct(cb.recall)} at the validation-chosen threshold; ROC-AUC {num(cb.roc_auc)}, AP {num(cb.avg_precision)}. TP {cm.tp.toLocaleString()} · FN {cm.fn.toLocaleString()}.
                </>
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* ---------------- comparison ---------------- */}
      <div className="grid lg:grid-cols-5 gap-4 mt-4">
        <Card className="lg:col-span-3" title={plain ? 'Better than simpler approaches?' : 'Model comparison: AP and ROC-AUC vs chance'}>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={compare} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} {...axis} tickFormatter={(v) => v.toFixed(1)} />
                <YAxis type="category" dataKey="name" width={170} {...axis} />
                <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v: any, n: any) => [Number(v).toFixed(3), n]} />
                <ReferenceLine x={0.5} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: plain ? 'coin flip' : 'AUC chance', fill: '#fbbf24', fontSize: 10, position: 'top' }} />
                <ReferenceLine x={baseRate} stroke="#fb7185" strokeDasharray="4 3" label={{ value: plain ? 'random' : 'AP chance', fill: '#fb7185', fontSize: 10, position: 'top' }} />
                <Bar dataKey="auc" name={plain ? 'Ranking skill' : 'ROC-AUC'} radius={4} barSize={12}>
                  {compare.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
                <Bar dataKey="ap" name={plain ? 'Hit rate' : 'Avg precision'} radius={4} barSize={12}>
                  {compare.map((c) => (
                    <Cell key={c.name} fill={c.color} fillOpacity={0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>
            {plain
              ? 'Solid bars: how well each approach puts risky payments above safe ones (0.5 = coin flip). Faded bars: how often its top picks are real fraud. Looking only at the amount is no better than a coin flip.'
              : 'Solid = ROC-AUC (chance 0.5), faded = average precision (chance = base rate).'}
          </ChartNote>
          {!plain && (
            <div className="overflow-x-auto mt-4">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="text-right">AP</th>
                    <th className="text-right">AUC</th>
                    <th className="text-right">Precision</th>
                    <th className="text-right">Recall</th>
                    <th className="text-right">F1</th>
                    <th className="text-right">Alerts/1k</th>
                  </tr>
                </thead>
                <tbody>
                  {MODELS.map(([k, l]) => (
                    <tr key={k} className={k === 'catboost' ? 'font-semibold' : 'text-white/70'}>
                      <td>{l}</td>
                      <td className="text-right">{num(e[k].avg_precision)}</td>
                      <td className="text-right">{num(e[k].roc_auc)}</td>
                      <td className="text-right">{num(e[k].precision)}</td>
                      <td className="text-right">{num(e[k].recall)}</td>
                      <td className="text-right">{num(e[k].f1)}</td>
                      <td className="text-right">{e[k].alerts_per_1000.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" title={plain ? 'Can you trust the percentages?' : `Reliability diagram (Brier ${num(e.calibration.brier, 4)})`}>
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={e.calibration.reliability} margin={{ left: -10, right: 10, top: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="predicted" type="number" domain={[0, 'dataMax']} {...axis} tickFormatter={(v) => (plain ? `${Math.round(v * 100)}%` : v.toFixed(2))} />
                <YAxis {...axis} tickFormatter={(v) => (plain ? `${Math.round(v * 100)}%` : v.toFixed(2))} />
                <ZAxis dataKey="n" range={[40, 400]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [n === 'n' ? Number(v).toLocaleString() : pct(v, 1), n]} />
                <Line dataKey="predicted" stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" dot={false} name={plain ? 'perfect' : 'y = x'} legendType="none" />
                <Scatter dataKey="observed" fill="#22d3ee" fillOpacity={0.75} stroke="#fff" strokeOpacity={0.3} name={plain ? 'what really happened' : 'observed'} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>
            {plain
              ? 'When the system says "10% chance", about 10% really are fraud: the bubbles sit on the dashed line. Bigger bubble = more payments in that group.'
              : 'Isotonic-calibrated; bubble area ∝ bin size. Points on y = x indicate calibration.'}
          </ChartNote>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title={plain ? 'Which details matter most overall?' : 'Global importance (mean |SHAP|)'}>
          <div style={{ height: imp.length * 24 + 20 }}>
            <ResponsiveContainer>
              <BarChart data={imp} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={170} {...axis} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => Number(v).toFixed(4)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="v" radius={4}>
                  {imp.map((d, i) => (
                    <Cell key={d.name} fill="#22d3ee" fillOpacity={1 - i * 0.06} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>{plain ? 'Late-night payments, wrong PIN tries, the type of shop and paying abroad matter most across all payments.' : 'Mean |SHAP| on the test period (log-odds).'}</ChartNote>
        </Card>

        <Card title={plain ? 'Does it work for every kind of fraud?' : 'Recall by fraud type'}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={e.recall_by_fraud_type} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" domain={[0, 1]} {...axis} tickFormatter={(v) => pct(v, 0)} />
                <YAxis type="category" dataKey="fraud_type" width={120} {...axis} />
                <ReferenceLine x={cb.recall} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => pct(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="recall" fill="#a78bfa" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>{plain ? 'About the same for every type of fraud, which is fair, but in this data the types behave identically anyway.' : 'Dashed = overall recall. fraud_type values are statistically indistinguishable in this dataset.'}</ChartNote>
        </Card>

        <Card title={plain ? 'Is it fair across countries?' : 'Group check: alert vs fraud rate by country'}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={e.group_check?.country ?? []} margin={{ left: -15, right: 5 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="country" {...axis} interval={0} angle={-35} textAnchor="end" height={50} />
                <YAxis {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [pct(v), n]} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="alert_rate" name={plain ? 'flagged' : 'alert rate'} fill="#22d3ee" radius={[3, 3, 0, 0]} />
                <Bar dataKey="fraud_rate" name={plain ? 'really fraud' : 'fraud rate'} fill="#fb7185" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartNote>{plain ? 'No country is flagged far more than others, so customers in one place are not singled out.' : 'Alert and label rate per country on the test period.'}</ChartNote>
        </Card>
      </div>

      <Card title={plain ? 'Limits we want you to know' : 'Notes and limits'} className="mt-4">
        <ul className="list-disc pl-5 text-sm text-white/65 space-y-1.5">
          {plain ? (
            <>
              <li>The data is computer-generated, not real bank customers.</li>
              <li>Even the most suspicious combination of signs is fraud only about 1 time in 5 here, so no system could be very precise.</li>
              <li>A warning means "take a closer look", never "this person is a fraudster".</li>
            </>
          ) : (
            <>
              {data.notes?.map((n: string) => <li key={n}>{n}</li>)}
              <li>Max achievable precision in this generator ≈ 22% (riskiest signal combination).</li>
              <li>Amount carries ~no signal (baseline AUC {num(e.amount_threshold_baseline.roc_auc)}).</li>
            </>
          )}
        </ul>
      </Card>
    </>
  );
}
