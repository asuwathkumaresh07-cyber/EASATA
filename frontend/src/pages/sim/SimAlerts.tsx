import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Mail, Search } from 'lucide-react';
import { STATUS_LABEL, THRESHOLD, alertsOf, clock, explain, inr, level, nm, score, useSim, type AlertStatus } from '@/lib/easata';
import { ScoreBar, useSimUi } from './common';

export const STATUS_STYLE: Record<AlertStatus, string> = {
  new: 'bg-white/10 text-white/70',
  fraud: 'bg-rose-500/15 text-rose-300',
  legit: 'bg-emerald-500/15 text-emerald-300',
};

export default function SimAlerts() {
  const { sim, status, emailed } = useSim();
  const { sendOne, sendAll } = useSimUi();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | AlertStatus>('all');
  const [sort, setSort] = useState<'score' | 'amount' | 'time' | 'newest'>('newest');
  const [q, setQ] = useState('');

  const all = alertsOf(sim);
  const st = (n: number): AlertStatus => status[n] ?? 'new';
  const counts = useMemo(() => {
    const c = { all: all.length, new: 0, fraud: 0, legit: 0 };
    all.forEach((t) => c[st(t.alertNo!)]++);
    return c;
  }, [all, status]);

  let list = all.filter((t) => filter === 'all' || st(t.alertNo!) === filter);
  if (q) list = list.filter((t) => `${nm(t.from)} ${nm(t.to)} #${t.alertNo} ${t.amount}`.toLowerCase().includes(q.toLowerCase()));
  list = [...list].sort((a, b) =>
    sort === 'score' ? b.score - a.score : sort === 'amount' ? b.amount - a.amount : sort === 'time' ? a.min - b.min : b.alertNo! - a.alertNo!,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-white/55 mt-1">Every payment that reached {THRESHOLD} points. Click an alert to see its relationship graph, full explanation and report.</p>
        </div>
        <button className="btn btn-primary" onClick={sendAll}>
          <Mail className="w-4 h-4" /> Send all alerts by email
        </button>
      </div>

      <div className="glass !rounded-2xl p-3 mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'new', 'fraud', 'legit'] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs transition-all ${filter === k ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/60 hover:text-white'}`}>
              {k === 'all' ? 'All' : STATUS_LABEL[k]} ({counts[k]})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input className="field !pl-9 w-52" type="search" placeholder="Search name, amount or #" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search alerts" />
          </div>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort">
            <option value="newest">Newest alert first</option>
            <option value="score">Highest score first</option>
            <option value="amount">Largest amount first</option>
            <option value="time">Earliest in the day first</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 mt-4 sim-stagger">
        {list.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && nav(`/simulate/alerts/${t.alertNo}`)}
            onClick={() => nav(`/simulate/alerts/${t.alertNo}`)}
            className="glass lift !rounded-2xl p-4 md:p-5 grid md:grid-cols-[72px_minmax(0,1fr)_auto] gap-4 items-center cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30 grid place-items-center text-lg font-extrabold text-rose-300">#{t.alertNo}</div>
            <div className="min-w-0">
              <div className="font-semibold text-[15px]">
                {inr(t.amount)} from {nm(t.from)} to {nm(t.to)}
              </div>
              <div className="text-xs text-white/50 mt-1 flex flex-wrap items-center gap-1.5">
                {clock(t.min)} · {t.city} · Risk level {level(t.score)}
                <span className={`px-2 py-0.5 rounded-full ${STATUS_STYLE[st(t.alertNo!)]}`}>{STATUS_LABEL[st(t.alertNo!)]}</span>
                {t.byUser && <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200">Simulated by you</span>}
                {emailed[t.alertNo!] && <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200">Emailed</span>}
              </div>
              <p className="text-sm text-white/65 mt-2">{explain(t)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {score(t).matched.map((r) => (
                  <span key={r.id} className="px-2 py-0.5 rounded-full text-[11px] bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/20">
                    {r.name} +{r.points}
                  </span>
                ))}
              </div>
              <div className="max-w-xs mt-3">
                <ScoreBar score={t.score} />
              </div>
            </div>
            <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-ghost" onClick={() => sendOne(t.alertNo!)}>
                <Mail className="w-4 h-4" /> Send
              </button>
              <button className="btn btn-primary" onClick={() => nav(`/simulate/alerts/${t.alertNo}`)}>
                Open <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="glass p-10 text-center text-white/50">No alerts match.</div>}
      </div>
    </>
  );
}
