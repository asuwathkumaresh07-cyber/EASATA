import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ShieldAlert, Snowflake } from 'lucide-react';
import { DATE_LABEL, VERY_HIGH, byAlert, clock, inr, level, nm, simStore, useSim } from '@/lib/easata';
import { useSimUi } from './common';

/** Opened from the "Freeze account" button in a very-high-risk alert email. Opening it changes nothing;
    the freeze happens only when the button here is pressed (email scanners pre-open links). */
export default function SimFreeze() {
  const { n: nStr } = useParams();
  const n = Number(nStr);
  const { sim, frozen } = useSim();
  const { toast } = useSimUi();
  const t = byAlert(sim, n);

  if (!t)
    return (
      <div className="glass p-8 text-center text-white/60 max-w-xl mx-auto">
        Alert #{nStr} is not in the simulation in this browser. Open the link in the browser where the simulation ran.{' '}
        <Link className="text-cyan-300 underline" to="/simulate/alerts">
          Back to alerts
        </Link>
      </div>
    );

  const isFrozen = frozen[t.from] !== undefined;
  const allowed = t.score >= VERY_HIGH;

  return (
    <div className="max-w-xl mx-auto glass p-6 md:p-8">
      <div className={`w-14 h-14 rounded-2xl grid place-items-center ${isFrozen ? 'bg-cyan-500/15 text-cyan-300' : 'bg-rose-500/15 text-rose-300'}`}>
        {isFrozen ? <Snowflake className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
      </div>
      <h1 className="text-2xl font-bold mt-4">{isFrozen ? `${nm(t.from)}'s account is frozen` : `Freeze ${nm(t.from)}'s account?`}</h1>
      <p className="text-white/65 mt-2 text-[15px] leading-relaxed">
        Alert #{n}: {nm(t.from)} sent <b className="text-white">{inr(t.amount)}</b> to <b className="text-white">{nm(t.to)}</b> at {clock(t.min)} on {DATE_LABEL}. It scored{' '}
        <b className="text-white">{t.score} points</b> (risk level {level(t.score)}).
      </p>

      {isFrozen ? (
        <>
          <p className="text-cyan-200 mt-4 text-sm">
            Frozen (simulated) because of Alert #{frozen[t.from]}. New payments from this account are blocked in the simulator, and the alert is marked as confirmed fraud.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            <Link className="btn btn-primary" to={`/simulate/alerts/${n}`}>
              Open Alert #{n} <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="btn btn-ghost" onClick={() => (simStore.unfreeze(t.from), toast(`${nm(t.from)}'s account was unfrozen.`))}>
              Unfreeze
            </button>
          </div>
        </>
      ) : allowed ? (
        <>
          <p className="text-white/50 mt-4 text-sm">Freezing blocks new payments from this account in the simulator and marks the alert as confirmed fraud. You can unfreeze it later.</p>
          <div className="flex flex-wrap gap-2 mt-6">
            <button className="btn btn-danger !px-6 !py-3" onClick={() => (simStore.freeze(n), toast(`${nm(t.from)}'s account was frozen.`))}>
              <Snowflake className="w-4 h-4" /> Freeze account
            </button>
            <Link className="btn btn-ghost" to={`/simulate/alerts/${n}`}>
              Review the alert first
            </Link>
          </div>
        </>
      ) : (
        <p className="text-amber-200 mt-4 text-sm">
          Only very high risk alerts ({VERY_HIGH}+ points) can be frozen from an email.{' '}
          <Link className="underline" to={`/simulate/alerts/${n}`}>
            Open the alert
          </Link>{' '}
          to review it.
        </p>
      )}
    </div>
  );
}
