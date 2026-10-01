import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Search } from 'lucide-react';
import { THRESHOLD, clock, explain, inr, nm, useSim, type Tx } from '@/lib/easata';
import { ScoreBar, TxLabel } from './common';

type Filter = 'all' | 'flagged' | 'cleared' | 'mine';

export default function SimDashboard() {
  const { sim } = useSim();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<'time' | 'score' | 'amount'>('time');

  const txs = sim.txs;
  const flagged = txs.filter((t) => t.flagged);
  const mine = txs.filter((t) => t.byUser);
  const hours = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${i % 12 || 12}${i < 12 ? 'a' : 'p'}`, Cleared: 0, Flagged: 0 }));
    txs.forEach((t) => h[Math.floor(t.min / 60) % 24][t.flagged ? 'Flagged' : 'Cleared']++);
    return h;
  }, [txs]);

  let list = txs.filter((t) => (filter === 'all' ? true : filter === 'flagged' ? t.flagged : filter === 'cleared' ? !t.flagged : t.byUser));
  if (q) list = list.filter((t) => `${nm(t.from)} ${nm(t.to)} ${t.amount} ${t.city} ${t.id}`.toLowerCase().includes(q.toLowerCase()));
  list = [...list].sort((a, b) => (sort === 'time' ? a.min - b.min : sort === 'score' ? b.score - a.score : b.amount - a.amount));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-white/55 mt-1">Every transaction of the day in one place: the simulated background day plus everything you simulated.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5 sim-stagger">
        <Stat label="All transactions" value={txs.length} />
        <Stat label="Cleared" value={txs.length - flagged.length} color="text-emerald-300" />
        <Stat label="Flagged (alerts)" value={flagged.length} color="text-rose-300" />
        <Stat label="Money in flagged payments" value={inr(flagged.reduce((s, t) => s + t.amount, 0))} />
        <Stat label="Simulated by you" value={mine.length} color="text-cyan-300" />
      </div>

      <section className="glass p-5 mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Activity through the day</h2>
          <span className="text-xs text-white/45">Each bar is one hour. Red = flagged, green = cleared.</span>
        </div>
        <div className="h-44 mt-3">
          <ResponsiveContainer>
            <BarChart data={hours} margin={{ left: -24, right: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }}
                labelFormatter={(_, p) => (p?.[0] ? `${clock(p[0].payload.hour * 60)} – ${clock(p[0].payload.hour * 60 + 59)}` : '')}
              />
              <Bar dataKey="Cleared" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Flagged" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-white/40 mt-1">Notice the red bars at night: late-night payments add points, and most attacks happen while customers are asleep.</p>
      </section>

      <section className="glass p-5 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', `All (${txs.length})`],
                ['flagged', `Flagged (${flagged.length})`],
                ['cleared', `Cleared (${txs.length - flagged.length})`],
                ['mine', `Simulated by you (${mine.length})`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs transition-all ${filter === k ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/60 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input className="field !pl-9 w-56" type="search" placeholder="Search name, city, amount" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
            </div>
            <select className="field" value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort">
              <option value="time">By time</option>
              <option value="score">Highest score</option>
              <option value="amount">Largest amount</option>
            </select>
          </div>
        </div>

        <div className="hidden md:grid grid-cols-[80px_minmax(0,1.7fr)_110px_110px_minmax(150px,1fr)_28px] gap-4 px-4 pb-2 text-[11px] uppercase tracking-wider text-white/35">
          <span>Time</span>
          <span>From → To</span>
          <span className="text-right">Amount</span>
          <span>Result</span>
          <span>Score (line {THRESHOLD})</span>
          <span />
        </div>
        <div className="space-y-2">
          {list.map((t) => (
            <Row key={t.id} t={t} open={open === t.id} toggle={() => setOpen(open === t.id ? null : t.id)} openAlert={() => nav(`/simulate/alerts/${t.alertNo}`)} />
          ))}
          {list.length === 0 && <div className="text-center text-white/40 py-10">No transactions match.</div>}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="glass lift p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Row({ t, open, toggle, openAlert }: { t: Tx; open: boolean; toggle: () => void; openAlert: () => void }) {
  return (
    <div className={`rounded-xl border-l-4 ${t.flagged ? 'border-l-rose-500' : 'border-l-emerald-500'} bg-white/[0.025] ring-1 ring-white/[0.07] hover:bg-white/[0.05] transition-colors`}>
      <button onClick={toggle} className="w-full text-left px-4 py-3 grid grid-cols-2 md:grid-cols-[80px_minmax(0,1.7fr)_110px_110px_minmax(150px,1fr)_28px] gap-x-4 gap-y-1.5 items-center">
        <span className="text-sm text-white/50">{clock(t.min)}</span>
        <span className="text-right md:hidden font-bold tabular-nums">{inr(t.amount)}</span>
        <span className="col-span-2 md:col-span-1 min-w-0">
          <span className="block font-semibold truncate">
            {nm(t.from)} → {nm(t.to)}
          </span>
          <span className="block text-xs text-white/40 truncate">
            {t.byUser && <span className="text-cyan-300">Simulated by you · </span>}
            {t.city} · {t.device}
          </span>
        </span>
        <span className="hidden md:block text-right font-bold tabular-nums">{inr(t.amount)}</span>
        <span>
          <TxLabel t={t} />
        </span>
        <ScoreBar score={t.score} />
        <ChevronDown className={`hidden md:block w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 -mt-1 text-sm text-white/70 flex flex-wrap items-center justify-between gap-3 sim-page">
          <span>{explain(t)}</span>
          {t.flagged && (
            <button className="btn btn-primary !py-1.5" onClick={openAlert}>
              Open Alert #{t.alertNo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
