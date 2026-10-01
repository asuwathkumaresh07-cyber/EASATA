import { useState } from 'react';
import { Link } from 'react-router-dom';
import { THRESHOLD, clock, inr, nm, score, useSim, type Tx } from '@/lib/easata';

export default function SimEval() {
  const { sim } = useSim();
  const [thr, setThr] = useState(THRESHOLD);
  const c: Record<'tp' | 'fp' | 'fn' | 'tn', Tx[]> = { tp: [], fp: [], fn: [], tn: [] };
  sim.txs.forEach((t) => {
    const f = t.score >= thr;
    c[t.fraud ? (f ? 'tp' : 'fn') : f ? 'fp' : 'tn'].push(t);
  });
  const P = c.tp.length + c.fp.length ? c.tp.length / (c.tp.length + c.fp.length) : 0;
  const R = c.tp.length + c.fn.length ? c.tp.length / (c.tp.length + c.fn.length) : 0;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const why = (t: Tx) => `score ${t.score}: ${score(t).matched.map((r) => r.name.toLowerCase()).join(', ') || 'no rules matched'}`;

  const Card = ({ k, title, text, color }: { k: keyof typeof c; title: string; text: string; color: string }) => (
    <div className="panel p-5" style={{ borderTop: `4px solid ${color}` }}>
      <div className="text-[11px] tracking-[0.14em] font-bold" style={{ color }}>
        {title}
      </div>
      <div className="text-4xl font-extrabold mt-1">{c[k].length}</div>
      <p className="text-sm text-white/60 mt-1">{text}</p>
    </div>
  );
  const List = ({ items }: { items: Tx[] }) =>
    items.length ? (
      <div className="divide-y divide-white/5">
        {items.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span>
              {clock(t.min)} · {nm(t.from)} → {nm(t.to)} · <b>{inr(t.amount)}</b>
              <span className="block text-xs text-white/45">
                {t.story} · {why(t)}
              </span>
            </span>
            {t.flagged && (
              <Link className="btn btn-ghost !py-1 !px-3 !text-xs" to={`/simulate/alerts/${t.alertNo}`}>
                Open #{t.alertNo}
              </Link>
            )}
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-white/40">None.</p>
    );

  return (
    <>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Evaluation</h1>
      <p className="text-white/55 mt-1 max-w-3xl">
        How well did EASATA do in this simulation? Because the payments are simulated, we know which ones were really fraud, so we can check every decision.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <Card k="tp" title="CAUGHT FRAUD" color="#22c55e" text="Fraud payments that EASATA flagged. Good." />
        <Card k="fp" title="FALSE ALARMS" color="#f59e0b" text="Genuine payments that EASATA flagged by mistake. They cost a customer some time." />
        <Card k="fn" title="MISSED FRAUD" color="#f43f5e" text="Fraud payments that EASATA cleared. These are the costly mistakes." />
        <Card k="tn" title="CORRECTLY CLEARED" color="#38bdf8" text="Genuine payments that EASATA let through. Good." />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <section className="panel p-5">
          <h2 className="text-lg font-semibold">Precision: {pc(P)}</h2>
          <Meter v={P} />
          <p className="text-white/75">
            <b>Precision</b> means: of all the payments we flagged, {pc(P)} were really fraud ({c.tp.length} out of {c.tp.length + c.fp.length}).
          </p>
          <h2 className="text-lg font-semibold mt-5">Recall: {pc(R)}</h2>
          <Meter v={R} />
          <p className="text-white/75">
            <b>Recall</b> means: of all the real fraud, we caught {pc(R)} ({c.tp.length} out of {c.tp.length + c.fn.length}).
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-semibold">Try a different alert line</h2>
          <p className="text-sm text-white/55">Move the slider to see what happens if the alert line is stricter or looser. The rest of EASATA keeps using {THRESHOLD}.</p>
          <input type="range" min={10} max={100} step={5} value={thr} onChange={(e) => setThr(Number(e.target.value))} className="w-full accent-cyan-400 mt-4" aria-label="Alert line" />
          <div className="flex justify-between text-xs text-white/50">
            <span>Looser (more alerts)</span>
            <b className="text-white text-sm">Alert line: {thr}</b>
            <span>Stricter (fewer alerts)</span>
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 mt-4 text-sm text-center">
            <div />
            <div className="text-white/50 font-semibold py-1">Flagged</div>
            <div className="text-white/50 font-semibold py-1">Cleared</div>
            <div className="text-white/50 font-semibold text-right pr-2 self-center">Really fraud</div>
            <div className="rounded-lg p-3 bg-emerald-500/15 text-emerald-300"><b className="text-xl">{c.tp.length}</b><br />caught</div>
            <div className="rounded-lg p-3 bg-rose-500/15 text-rose-300"><b className="text-xl">{c.fn.length}</b><br />missed</div>
            <div className="text-white/50 font-semibold text-right pr-2 self-center">Really genuine</div>
            <div className="rounded-lg p-3 bg-amber-500/15 text-amber-300"><b className="text-xl">{c.fp.length}</b><br />false alarms</div>
            <div className="rounded-lg p-3 bg-sky-500/10 text-sky-200"><b className="text-xl">{c.tn.length}</b><br />correctly cleared</div>
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <section className="panel p-5">
          <h2 className="font-semibold">Missed fraud at line {thr}</h2>
          <p className="text-xs text-white/45 mb-2">Why each one slipped through.</p>
          <List items={c.fn} />
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold">False alarms at line {thr}</h2>
          <p className="text-xs text-white/45 mb-2">Genuine payments that looked risky.</p>
          <List items={c.fp} />
        </section>
      </div>

      <section className="panel p-5 mt-4">
        <h2 className="text-lg font-semibold">How to improve the results</h2>
        <ul className="list-disc pl-5 space-y-2 mt-2 text-white/75">
          <li>
            <b className="text-white">Catch "just under the limit" payments.</b> Fraudsters often pay ₹49,000 to stay below ₹50,000. A rule for new receivers plus amounts close to the limit would catch these.
          </li>
          <li>
            <b className="text-white">Learn each customer's habits.</b> Compare each payment with the customer's own normal times, places and receivers instead of one rule for everyone. This cuts false alarms for people who often travel or buy big items.
          </li>
          <li>
            <b className="text-white">Use feedback.</b> Every alert marked "confirmed fraud" or "false alarm" shows which rules help and which cause mistakes. Adjust the points and the alert line using that feedback.
          </li>
          <li>
            <b className="text-white">Watch the whole chain.</b> Money that arrives in an account and leaves again within an hour is a strong sign of a mule account (an account used to pass on stolen money).
          </li>
        </ul>
        <p className="text-xs text-white/40 mt-3">Note: this simulation is small, so the numbers change from run to run. Real systems are tested on thousands of past payments.</p>
      </section>
    </>
  );
}

function Meter({ v }: { v: number }) {
  return (
    <div className="h-3.5 rounded-full bg-white/10 overflow-hidden my-2">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all duration-500" style={{ width: `${v * 100}%` }} />
    </div>
  );
}
