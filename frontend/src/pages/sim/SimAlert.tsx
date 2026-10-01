import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Snowflake, ChevronLeft, ChevronRight, Copy, Mail, Printer, XCircle } from 'lucide-react';
import {
  DATE_LABEL, EMAIL_TO, MAX_POINTS, NODES, RULES, STATUS_LABEL, THRESHOLD, alertsOf, byAlert, clock, copyText, counterfactuals, inr, level, network, nm,
  recommendation, reportText, score, simStore, useSim, VERY_HIGH, type Counterfactual,
} from '@/lib/easata';
import { GREEN, RED, Section, useSimUi } from './common';
import { STATUS_STYLE } from './SimAlerts';
import { RelationshipGraph } from './SimGraph';
import { Report, Timeline } from './SimJourney';

const SEG_COLORS = ['#e11d48', '#f97316', '#d97706', '#a855f7', '#3b82f6', '#06b6d4', '#64748b'];
const SECTIONS = [
  ['summary', 'Summary'],
  ['graph', 'Relationship graph'],
  ['why', 'Why it was flagged'],
  ['how', 'How it was flagged'],
  ['counterfactual', 'What would have avoided it'],
  ['timeline', 'How it happened'],
  ['report', 'Incident report'],
  ['actions', 'Next actions'],
] as const;

export default function SimAlert() {
  const { n: nStr } = useParams();
  const n = Number(nStr);
  const { sim, status, emailed, frozen } = useSim();
  const { sendOne, toast } = useSimUi();
  const t = byAlert(sim, n);
  const [active, setActive] = useState('summary');

  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-30% 0px -60% 0px' });
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [n]);

  if (!t)
    return (
      <div className="glass p-8 text-center text-white/60">
        Alert #{nStr} is not in this simulation. <Link className="text-cyan-300 underline" to="/simulate/alerts">Back to alerts</Link>
      </div>
    );

  const sc = score(t);
  const cfs = counterfactuals(t);
  const st = status[n] ?? 'new';
  const ids = alertsOf(sim).map((x) => x.alertNo!);
  const pos = ids.indexOf(n);
  const over = t.score - THRESHOLD;
  let run = 0;

  const print = () => {
    document.body.classList.add('print-report');
    window.print();
    setTimeout(() => document.body.classList.remove('print-report'), 500);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 print:hidden">
        <Link to="/simulate/alerts" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> All alerts
        </Link>
        <div className="flex gap-2">
          {pos > 0 && (
            <Link className="btn btn-ghost !py-1 !px-3 !text-xs" to={`/simulate/alerts/${ids[pos - 1]}`}>
              <ChevronLeft className="w-3.5 h-3.5" /> #{ids[pos - 1]}
            </Link>
          )}
          {pos < ids.length - 1 && (
            <Link className="btn btn-ghost !py-1 !px-3 !text-xs" to={`/simulate/alerts/${ids[pos + 1]}`}>
              #{ids[pos + 1]} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid xl:grid-cols-[200px_minmax(0,1fr)] gap-6">
        {/* section menu */}
        <nav className="hidden xl:block print:hidden" aria-label="Sections">
          <div className="sticky top-24 space-y-0.5">
            {SECTIONS.map(([id, label], i) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all ${active === id ? 'bg-white/10 text-white font-medium' : 'text-white/45 hover:text-white'}`}
              >
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${active === id ? 'bg-cyan-400 text-slate-900' : 'bg-white/10'}`}>{i + 1}</span>
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-5 min-w-0">
          {/* 1. SUMMARY */}
          <Section id="summary" n={1} title="Summary">
            <div className="flex flex-wrap items-center gap-6">
              <ScoreRing score={t.score} />
              <div className="flex-1 min-w-[260px]">
                <h1 className="text-2xl md:text-3xl font-bold">
                  Alert #{n}: {inr(t.amount)} payment flagged
                </h1>
                <p className="text-white/75 mt-2 text-[15px] leading-relaxed">
                  {nm(t.from)} sent <b className="text-white">{inr(t.amount)}</b> to <b className="text-white">{nm(t.to)}</b> at <b className="text-white">{clock(t.min)}</b> on {DATE_LABEL}. It scored{' '}
                  <b className="text-white">{t.score} points</b>, {over === 0 ? 'exactly at' : `${over} ${over === 1 ? 'point' : 'points'} above`} the alert line of {THRESHOLD}, so EASATA flagged it for a person to check.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 font-semibold">Flagged</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/70">Risk level: {level(t.score)}</span>
                  <span className={`px-2.5 py-1 rounded-full ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                  {t.byUser && <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-200">Simulated by you</span>}
                  {frozen[t.from] !== undefined && (
                    <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-200 inline-flex items-center gap-1">
                      <Snowflake className="w-3 h-3" /> {nm(t.from)}'s account frozen
                    </span>
                  )}
                </div>
                {t.score >= VERY_HIGH && (
                  <div className="mt-3 print:hidden">
                    {frozen[t.from] === undefined ? (
                      <button className="btn btn-danger !py-1.5" onClick={() => (simStore.freeze(n), toast(`${nm(t.from)}'s account was frozen.`))}>
                        <Snowflake className="w-4 h-4" /> Freeze account
                      </button>
                    ) : (
                      <button className="btn btn-ghost !py-1.5" onClick={() => (simStore.unfreeze(t.from), toast(`${nm(t.from)}'s account was unfrozen.`))}>
                        Unfreeze account
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
              <Fact k="Sender" v={nm(t.from)} sub={NODES[t.from].home ? `Home: ${NODES[t.from].home}` : undefined} />
              <Fact k="Receiver" v={nm(t.to)} />
              <Fact k="Amount" v={inr(t.amount)} />
              <Fact k="Time" v={clock(t.min)} sub={DATE_LABEL} />
              <Fact k="Where" v={t.city} />
              <Fact k="Device" v={t.device} />
            </div>
            <div className="mt-6 rounded-2xl p-4 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 ring-1 ring-cyan-400/20 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="text-sm">
                <div className="font-semibold">Send this alert by email</div>
                <div className="text-white/55">
                  To {EMAIL_TO}, with the full explanation and incident report.
                  {emailed[n] && <span className="text-emerald-300"> Already emailed.</span>}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => sendOne(n)}>
                <Mail className="w-4 h-4" /> Email this alert
              </button>
            </div>
          </Section>

          {/* 2. GRAPH */}
          <Section id="graph" n={2} title="Transaction relationship graph">
            <p className="text-sm text-white/60 mb-4">
              Everyone connected to this alert. Each circle is a person, shop or account, and each arrow is one payment from sender to receiver. The white moving line is this alert's payment.
            </p>
            <RelationshipGraph txs={network(sim, t)} focus={t} />
          </Section>

          {/* 3. WHY */}
          <Section id="why" n={3} title="Why it was flagged">
            <p className="text-sm text-white/60 mb-4">
              EASATA checks every payment against {RULES.length} simple rules. {plainCount(sc.matched.length)} matched, using the real values from this payment:
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {RULES.map((r) => {
                const hit = r.test(t);
                return (
                  <div key={r.id} className={`rounded-2xl p-4 ring-1 transition-all ${hit ? 'bg-rose-500/[0.08] ring-rose-400/30' : 'bg-white/[0.02] ring-white/5 opacity-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 font-semibold">
                        {hit ? <XCircle className="w-4 h-4 text-rose-300" /> : <CheckCircle2 className="w-4 h-4 text-white/40" />}
                        {r.name}
                      </div>
                      <span className={`text-sm font-bold ${hit ? 'text-rose-300' : 'text-white/35'}`}>{hit ? `+${r.points}` : '0'}</span>
                    </div>
                    <p className="text-xs text-white/50 mt-1">{r.plain}</p>
                    <p className={`text-sm mt-2 ${hit ? 'text-white' : 'text-white/40'}`}>{hit ? r.value(t) : 'Did not match'}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 4. HOW */}
          <Section id="how" n={4} title="How it was flagged">
            <p className="text-sm text-white/60">
              The scoring method is a simple sum. Every payment starts at 0 points, each matching rule adds its points, and the payment is flagged if the total reaches {THRESHOLD}.
            </p>
            <div className="mt-4 max-w-xl text-sm">
              <Row i="0" label="Start" plus="" run={0} />
              {sc.matched.map((r, i) => {
                run += r.points;
                return <Row key={r.id} i={String(i + 1)} label={r.name} plus={`+${r.points}`} run={run} />;
              })}
              <div className="border-t-2 border-white/70 mt-2 pt-2">
                <Row i="" label={<b>Total score</b>} plus="" run={<b className="text-white">{sc.total}</b>} />
                <Row i="" label="Alert line" plus="" run={THRESHOLD} />
              </div>
              <p className="mt-2 font-semibold">
                Result: {sc.total} ≥ {THRESHOLD}, so the payment is flagged.
              </p>
            </div>
            <div className="relative mt-10 mb-2">
              <div className="h-10 rounded-xl bg-white/5 flex overflow-hidden" role="img" aria-label="Score made of matching rules">
                {sc.matched.map((r, i) => (
                  <div
                    key={r.id}
                    title={`${r.name} +${r.points}`}
                    className="bar-grow h-full grid place-items-center text-xs font-bold text-white border-r-2 border-[#0b0f17] overflow-hidden whitespace-nowrap"
                    style={{ width: `${(r.points / MAX_POINTS) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length], animationDelay: `${i * 0.08}s` }}
                  >
                    +{r.points}
                  </div>
                ))}
              </div>
              <div className="absolute -top-6 -bottom-1.5 border-l-2 border-dashed border-white" style={{ left: `${(THRESHOLD / MAX_POINTS) * 100}%` }}>
                <span className="absolute top-0 left-1.5 text-xs font-bold whitespace-nowrap">Alert line {THRESHOLD}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
              {sc.matched.map((r, i) => (
                <span key={r.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} /> {r.name}
                </span>
              ))}
              <span className="text-white/35">Full bar = {MAX_POINTS} points (every rule matching)</span>
            </div>
          </Section>

          {/* 5. COUNTERFACTUAL */}
          <Section id="counterfactual" n={5} title="Counterfactual Explanation: What would have avoided this alert?">
            <p className="text-sm text-white/60">A counterfactual answers one question: what is the smallest thing that would have had to be different for this payment not to be flagged?</p>
            {cfs.length ? (
              <>
                <div className="mt-4 rounded-2xl p-5 ring-2 ring-emerald-400/60 bg-emerald-500/10">
                  <div className="text-[11px] tracking-[0.14em] font-bold text-emerald-300">SMALLEST CHANGE</div>
                  <p className="text-lg font-semibold mt-1">{cfs[0].sentence}</p>
                  <BeforeAfter c={cfs[0]} />
                </div>
                {cfs.length > 1 && (
                  <>
                    <h3 className="font-semibold mt-5 mb-2">Other ways to avoid the alert</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      {cfs.slice(1).map((c) => (
                        <div key={c.sentence} className="rounded-2xl p-4 ring-1 ring-white/10 bg-white/[0.02] text-sm">
                          {c.sentence}
                          <BeforeAfter c={c} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="mt-3">No simple change would have kept this payment below the alert line.</p>
            )}
            <p className="text-xs text-white/40 mt-3">This shows how the rules work. It does not mean the payment is safe or unsafe; a person should still check it.</p>
          </Section>

          {/* 6. TIMELINE */}
          <Section id="timeline" n={6} title="How it happened (timeline)">
            <p className="text-sm text-white/60 mb-4">Everything around this payment, in time order. The red box is the payment that raised Alert #{n}.</p>
            <Timeline sim={sim} t={t} />
          </Section>

          {/* 7. REPORT */}
          <Section id="report" n={7} title="Incident report">
            <div className="flex flex-wrap gap-2 mb-4 print:hidden">
              <button className="btn btn-primary" onClick={async () => toast((await copyText(reportText(sim, t, st))) ? 'Report copied to the clipboard.' : 'Could not copy.')}>
                <Copy className="w-4 h-4" /> Copy report
              </button>
              <button className="btn btn-ghost" onClick={print}>
                <Printer className="w-4 h-4" /> Print report
              </button>
              <button className="btn btn-ghost" onClick={() => sendOne(n)}>
                <Mail className="w-4 h-4" /> Email report
              </button>
            </div>
            <Report sim={sim} t={t} st={st} />
          </Section>

          {/* 8. NEXT ACTIONS */}
          <Section id="actions" n={8} title="Next actions">
            <ol className="space-y-2">
              {recommendation(sim, t).map((r, i) => (
                <li key={r} className="flex gap-3 text-white/85">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-white/10 grid place-items-center text-xs font-bold">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 mt-5 print:hidden">
              <button className="btn btn-primary" onClick={() => sendOne(n)}>
                <Mail className="w-4 h-4" /> Send this alert
              </button>
              <button className="btn btn-danger" onClick={() => (simStore.setStatus(n, 'fraud'), toast(`Alert #${n} marked as confirmed fraud.`))}>
                Mark as confirmed fraud
              </button>
              <button className="btn !bg-emerald-600 !text-white hover:!bg-emerald-500" onClick={() => (simStore.setStatus(n, 'legit'), toast(`Alert #${n} marked as a false alarm.`))}>
                Mark as false alarm
              </button>
              {st !== 'new' && (
                <button className="btn btn-ghost" onClick={() => simStore.setStatus(n, 'new')}>
                  Reset status
                </button>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

const plainCount = (k: number) => (k === 1 ? 'One rule' : `${['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][k] ?? k} rules`);

function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const frac = Math.min(1, score / MAX_POINTS);
  const line = THRESHOLD / MAX_POINTS;
  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={RED} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)' }} />
        <line x1={64 + (r - 9) * Math.cos(line * 2 * Math.PI)} y1={64 + (r - 9) * Math.sin(line * 2 * Math.PI)} x2={64 + (r + 9) * Math.cos(line * 2 * Math.PI)} y2={64 + (r + 9) * Math.sin(line * 2 * Math.PI)} stroke="#fff" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-extrabold text-rose-300 leading-none">{score}</div>
          <div className="text-[10px] text-white/50 mt-1">
            points · line {THRESHOLD}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07] px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{k}</div>
      <div className="font-semibold truncate" title={v}>
        {v}
      </div>
      {sub && <div className="text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}

function Row({ i, label, plus, run }: { i: string; label: React.ReactNode; plus: string; run: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)_60px_56px] gap-3 items-center py-1">
      <span className={i ? 'w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[11px] font-bold text-white/60' : ''}>{i}</span>
      <span>{label}</span>
      <span className="text-right font-bold text-rose-300">{plus}</span>
      <span className="text-right tabular-nums text-white/60">{run}</span>
    </div>
  );
}

export function BeforeAfter({ c }: { c: Counterfactual }) {
  const bar = (v: number, color: string) => (
    <div className="relative h-3 rounded-full bg-white/10">
      <div className="bar-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (v / MAX_POINTS) * 100)}%`, background: color }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-white/80" style={{ left: `${(THRESHOLD / MAX_POINTS) * 100}%` }} />
    </div>
  );
  return (
    <div className="mt-3">
      <div className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 items-center text-xs">
        <span>
          Now: <b className="text-rose-300">{c.before}</b>
        </span>
        {bar(c.before, RED)}
        <span>
          After: <b className="text-emerald-300">{c.after}</b>
        </span>
        {bar(c.after, GREEN)}
      </div>
      <div className="text-xs text-white/50 mt-1.5">
        Score {c.before} → {c.after}, against an alert line of {THRESHOLD}.
      </div>
    </div>
  );
}

