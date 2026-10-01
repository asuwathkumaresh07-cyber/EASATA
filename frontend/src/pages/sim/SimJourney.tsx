import { Link } from 'react-router-dom';
import { DATE_LABEL, STATUS_LABEL, THRESHOLD, clock, journey, level, reportData, type AlertStatus, type JourneyItem, type Sim, type Tx } from '@/lib/easata';
import { TxLabel } from './common';

const DOT: Record<JourneyItem['kind'], string> = {
  warn: 'bg-amber-400',
  signin: 'bg-amber-400',
  payee: 'bg-sky-400',
  pay: 'bg-emerald-400',
  'pay-flag': 'bg-rose-400',
  alert: 'bg-rose-600',
};
const KIND_LABEL: Record<JourneyItem['kind'], string> = {
  warn: 'Warning sign',
  signin: 'Sign-in',
  payee: 'New payee',
  pay: 'Payment',
  'pay-flag': 'Payment',
  alert: 'Alert',
};

/** How the event happened, in time order. The payment that raised this alert is highlighted. */
export function Timeline({ sim, t }: { sim: Sim; t: Tx }) {
  const j = journey(sim, t);
  return (
    <ol className="relative ml-2 border-l-2 border-white/10 space-y-2.5">
      {j.map((e, i) => (
        <li key={i} className={`relative ml-6 rounded-xl px-3.5 py-2.5 transition-colors ${e.key ? 'bg-rose-500/15 ring-2 ring-rose-500/70' : 'hover:bg-white/[0.03]'}`}>
          <span className={`absolute rounded-full ring-4 ring-[#07090d] ${DOT[e.kind]} ${e.key ? 'w-4 h-4 -left-[33px] top-3.5 pulse-ring' : 'w-3 h-3 -left-[31px] top-4'}`} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <b className="text-white/80 tabular-nums">{clock(e.min)}</b>
            <span className="text-white/35 uppercase tracking-wider text-[10px]">{KIND_LABEL[e.kind]}</span>
            {e.tx && e.kind !== 'alert' && <TxLabel t={e.tx} />}
            {e.key && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-semibold">This alert</span>}
          </div>
          <div className="text-sm mt-0.5 text-white/85">
            {e.text}
            {e.tx && e.kind !== 'alert' && <span className="text-white/40"> Score {e.tx.score}.</span>}
          </div>
          {e.tx?.flagged && !e.key && e.kind !== 'alert' && (
            <Link className="text-xs text-cyan-300 hover:underline" to={`/simulate/alerts/${e.tx.alertNo}`}>
              Open Alert #{e.tx.alertNo}
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The written incident report (also used for copy, print and email). */
export function Report({ sim, t, st }: { sim: Sim; t: Tx; st: AlertStatus }) {
  const d = reportData(sim, t);
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs font-bold tracking-[0.14em] uppercase text-cyan-300 mt-6 mb-2">{children}</h3>;
  return (
    <article className="report rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-6 md:p-8 text-[15px] leading-relaxed">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
        <h2 className="text-xl font-bold">Incident report – Alert #{t.alertNo}</h2>
        <span className="text-xs text-white/45">
          EASATA · {DATE_LABEL} · {t.id} · {STATUS_LABEL[st]}
        </span>
      </div>
      <H>What happened</H>
      {d.what.map((p) => (
        <p key={p} className="mb-2 text-white/85">
          {p}
        </p>
      ))}
      <H>Why it was flagged</H>
      <ul className="list-disc pl-5 space-y-1 text-white/85">
        {d.sc.matched.map((r) => (
          <li key={r.id}>
            <b>{r.name}</b> (+{r.points} points): {r.value(t)}.
          </li>
        ))}
      </ul>
      <H>How it was flagged</H>
      <p className="text-white/85">Every payment starts at 0 points. Each rule that matches adds its points:</p>
      <ul className="list-disc pl-5 space-y-1 mt-1 text-white/85">
        {d.how.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <p className="mt-2 text-white/85">
        The total is <b>{d.sc.total} points</b>. The alert line is <b>{THRESHOLD} points</b>, so the payment was flagged (risk level: {level(d.sc.total)}).
      </p>
      <H>Counterfactual explanation</H>
      {d.cfs.length ? (
        <>
          <p className="text-white/85">
            {d.cfs[0].sentence} The score would have been {d.cfs[0].after} instead of {d.cfs[0].before}.
          </p>
          {d.cfs.length > 1 && (
            <>
              <p className="mt-2 text-white/85">Other ways the alert could have been avoided:</p>
              <ul className="list-disc pl-5 space-y-1 text-white/85">
                {d.cfs.slice(1).map((c) => (
                  <li key={c.sentence}>
                    {c.sentence} (score {c.after})
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p>No simple change would have kept this payment below the alert line.</p>
      )}
      <H>Recommendation</H>
      <ul className="list-disc pl-5 space-y-1 text-white/85">
        {d.recs.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="text-xs text-white/40 mt-6">This report is based on simulated data. An alert means "check this payment", not proof of fraud.</p>
    </article>
  );
}
