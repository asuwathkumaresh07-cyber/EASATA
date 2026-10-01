import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Laptop, Snowflake, Loader2, Mail, MapPin, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, Sparkles, Zap } from 'lucide-react';
import {
  CITIES, CUSTOMERS, NODES, RULES, THRESHOLD, clock, explain, first, fromHHMM, inr, knownPayees, nm, plural, preset, score, simStore, toHHMM, useSim,
  currentStore, type SimInput, type SimMode, type Tx,
} from '@/lib/easata';
import { getAutoEmail, sendAlerts, setAutoEmail, type SendResult } from '@/lib/easataMail';
import { EmailSetupNotice, ResultLine, ScoreBar, TxLabel, useMailStatus, useSimUi } from './common';

export default function SimRun() {
  const { sim, frozen } = useSim();
  const { toast } = useSimUi();
  const nav = useNavigate();
  const [input, setInput] = useState<SimInput>(() => preset('normal', 'asha'));
  const [result, setResult] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(getAutoEmail());
  const [mailing, setMailing] = useState<{ busy: boolean; sent: number; total: number; last?: SendResult } | null>(null);
  const mail = useMailStatus();
  const set = (p: Partial<SimInput>) => setInput((i) => ({ ...i, ...p }));
  const choose = (mode: SimMode) => setInput((i) => preset(mode, i.from));
  const attack = input.mode === 'attack';
  const medium = input.mode === 'medium';
  const home = NODES[input.from].home!;
  const frozenBy = frozen[input.from];

  // live preview of the first payment, scored with the same rules
  const preview = useMemo(() => {
    const to = input.to === 'new' ? '__new' : input.to;
    const earlier = sim.txs.filter((x) => x.from === input.from && x.min <= input.min);
    const t = {
      id: 'preview', from: input.from, to, amount: input.amount, min: input.min, city: input.city, newDevice: input.newDevice,
      device: input.newDevice ? 'New device' : NODES[input.from].device!, fresh: true, fraud: false, story: '',
      recent: earlier.filter((x) => input.min - x.min <= 60).length,
      newReceiver: input.to === 'new' || (!knownPayees(input.from).includes(to) && !earlier.some((x) => x.to === to)),
      score: 0, flagged: false,
    } as Tx;
    return score(t);
  }, [input, sim]);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const ids = simStore.run(input);
      setResult(ids);
      setBusy(false);
      setMailing(null);
      if (auto) {
        const { sim: now, status } = currentStore();
        const newAlerts = ids.map((id) => now.txs.find((t) => t.id === id)!).filter((t) => t.flagged);
        if (newAlerts.length) {
          setMailing({ busy: true, sent: 0, total: newAlerts.length });
          sendAlerts(now, newAlerts, (n) => status[n] ?? 'new', (done, r) =>
            setMailing((m) => ({ busy: done < newAlerts.length && r.sent, sent: (m?.sent ?? 0) + (r.sent ? 1 : 0), total: newAlerts.length, last: r })),
          ).then(() => setMailing((m) => (m ? { ...m, busy: false } : m)));
        }
      }
      toast(attack ? 'Attack simulated. See what EASATA caught below.' : medium ? 'Medium-risk payment simulated. See the result below.' : 'Payment simulated. See the result below.');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }, 450);
  };

  const created = (result ?? []).map((id) => sim.txs.find((t) => t.id === id)).filter(Boolean) as Tx[];
  const flagged = created.filter((t) => t.flagged);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Simulate a payment</h1>
        <p className="text-white/55 mt-2">Pick a normal, medium-risk or high-risk scenario. Its details are filled in for you; change any of them, then see how EASATA reacts and why.</p>
      </div>

      {/* ---------- 1. choose ---------- */}
      <Label n={1}>What do you want to simulate?</Label>
      <div className="grid sm:grid-cols-3 gap-4">
        <ModeCard
          on={input.mode === 'normal'}
          kind="normal"
          onClick={() => choose('normal')}
          icon={<ShieldCheck className="w-6 h-6" />}
          title="Normal"
          text="An everyday payment to someone the customer already knows, during the day, from their usual phone."
        />
        <ModeCard
          on={medium}
          kind="medium"
          onClick={() => choose('medium')}
          icon={<AlertTriangle className="w-6 h-6" />}
          title="Medium risk"
          text="An evening payment to a new receiver from a new device in another city. A few warning signs, but not enough for an alert."
        />
        <ModeCard
          on={attack}
          kind="attack"
          onClick={() => choose('attack')}
          icon={<ShieldAlert className="w-6 h-6" />}
          title="High risk (attack)"
          text="A criminal takes over the account at night on a new phone, sends money to an unknown account in several payments, and moves it on."
        />
      </div>
      <p className="text-xs text-white/40 mt-2">Each button fills in the details below. You can then edit any field before running it.</p>

      {/* ---------- 2. inputs ---------- */}
      <Label n={2}>Details (pre-filled, edit as you like)</Label>
      <div className="glass p-5 md:p-6">
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
          <Field label="Customer (sender)">
            <select className="field w-full !py-2.5" value={input.from} onChange={(e) => setInput(preset(input.mode, e.target.value))}>
              {CUSTOMERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.home} · usually {inr(c.avg)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Receiver">
            <select className="field w-full !py-2.5" value={input.to} onChange={(e) => set({ to: e.target.value })}>
              <option value="new">A new, unknown account</option>
              <optgroup label={`People and shops ${first(input.from)} has paid before`}>
                {knownPayees(input.from).map((id) => (
                  <option key={id} value={id}>
                    {nm(id)}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label={attack ? 'Amount of the first payment (two smaller ones follow)' : 'Amount'}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">₹</span>
              <input className="field w-full !py-2.5 !pl-7" type="number" min={1} step={100} value={input.amount} onChange={(e) => set({ amount: Math.max(1, Number(e.target.value)) })} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[2000, 25000, 49000, 65000, 90000].map((a) => (
                <button key={a} onClick={() => set({ amount: a })} className={`px-2.5 py-0.5 rounded-full text-xs ${input.amount === a ? 'bg-white text-slate-900' : 'bg-white/5 text-white/60 hover:text-white'}`}>
                  {inr(a)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Time of the payment (today)">
            <input className="field w-full !py-2.5" type="time" value={toHHMM(input.min)} onChange={(e) => set({ min: fromHHMM(e.target.value) })} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                ['Night 2:10 AM', 130],
                ['Morning 9:30 AM', 570],
                ['Afternoon 2:30 PM', 870],
                ['Evening 8:00 PM', 1200],
              ].map(([l, m]) => (
                <button key={l} onClick={() => set({ min: m as number })} className={`px-2.5 py-0.5 rounded-full text-xs ${input.min === m ? 'bg-white text-slate-900' : 'bg-white/5 text-white/60 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Device">
            <div className="grid grid-cols-2 gap-2">
              <Seg on={!input.newDevice} onClick={() => set({ newDevice: false })} icon={<Smartphone className="w-4 h-4" />}>
                Usual ({NODES[input.from].device})
              </Seg>
              <Seg on={input.newDevice} onClick={() => set({ newDevice: true })} icon={<Laptop className="w-4 h-4" />}>
                A new device
              </Seg>
            </div>
          </Field>
          <Field label="Where the payment was made">
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <select className="field w-full !py-2.5 !pl-9" value={input.city} onChange={(e) => set({ city: e.target.value })}>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {c === home ? ' (home city)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        {/* live preview */}
        <div className="mt-6 rounded-2xl bg-black/30 ring-1 ring-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-white/50">Live preview{attack ? ' of the first payment' : ''}: </span>
              <b className={preview.flagged ? 'text-rose-300' : 'text-emerald-300'}>{preview.flagged ? 'will be flagged' : 'will be cleared'}</b>
            </div>
            <div className="w-full sm:w-72">
              <ScoreBar score={preview.total} big />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {RULES.map((r) => {
              const hit = preview.matched.some((m) => m.id === r.id);
              return (
                <span
                  key={r.id}
                  title={r.plain}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all duration-300 ${hit ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40' : 'bg-white/[0.04] text-white/30'}`}
                >
                  {r.name} {hit ? `+${r.points}` : ''}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-white/40 mt-2">Each lit rule adds points. {THRESHOLD} points or more raises an alert.</p>
        </div>

        {frozenBy !== undefined && (
          <div className="mt-6 rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-400/30 p-4 text-sm text-cyan-100 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Snowflake className="w-4 h-4" /> {nm(input.from)}'s account is frozen (Alert #{frozenBy}), so new payments from it are blocked.
            </span>
            <button className="btn btn-ghost !py-1 !px-3 !text-xs" onClick={() => (simStore.unfreeze(input.from), toast(`${nm(input.from)}'s account was unfrozen.`))}>
              Unfreeze
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <button
            onClick={run}
            disabled={busy || frozenBy !== undefined}
            className={`run-btn btn !px-7 !py-3.5 !text-base text-white ${attack ? '!bg-gradient-to-r from-rose-500 to-orange-500' : medium ? '!bg-gradient-to-r from-amber-500 to-orange-400' : '!bg-gradient-to-r from-emerald-500 to-cyan-500'}`}
          >
            {busy ? <Sparkles className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {busy ? 'Simulating…' : attack ? 'Simulate the attack' : medium ? 'Simulate the medium-risk payment' : 'Simulate the normal payment'}
          </button>
          <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer select-none">
            <span className={`relative w-10 h-6 rounded-full transition-colors ${auto ? 'bg-cyan-500' : 'bg-white/15'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${auto ? 'left-5' : 'left-1'}`} />
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                setAutoEmail(e.target.checked);
              }}
            />
            <Mail className="w-4 h-4" /> Email flagged alerts automatically
          </label>
          <button
            className="text-xs text-white/40 hover:text-white inline-flex items-center gap-1.5"
            onClick={() => {
              simStore.newDay();
              setResult(null);
              toast('Started a fresh day of payments.');
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Start a fresh day
          </button>
        </div>
      </div>

      {auto && (
        <div className="mt-4">
          <EmailSetupNotice {...mail} />
        </div>
      )}

      {/* ---------- 3. result ---------- */}
      <div ref={resultRef} className="scroll-mt-24">
        {created.length > 0 && (
          <>
            <Label n={3}>Result</Label>
            <div className="glass p-5 md:p-6 sim-page">
              <h2 className="text-xl font-semibold">
                {attack || created.length > 1
                  ? `Your ${created[0].fraud ? 'attack' : 'simulation'} created ${plural(created.length, 'payment', 'payments')}. EASATA flagged ${flagged.length}.`
                  : created[0].flagged
                    ? 'EASATA flagged this payment.'
                    : 'EASATA cleared this payment.'}
              </h2>
              <p className="text-white/55 text-sm mt-1">
                {flagged.length
                  ? 'Open an alert to see the relationship graph, the full explanation, the incident report and the email button.'
                  : 'Nothing looked risky enough to stop. Raise the amount, pick a night time, or try the high-risk attack to see an alert.'}
              </p>
              {mailing && (
                <div className="mt-4 space-y-2">
                  {mailing.busy ? (
                    <div className="flex items-center gap-2 text-sm text-cyan-200">
                      <Loader2 className="w-4 h-4 animate-spin" /> Emailing alerts… {mailing.sent} of {mailing.total} sent
                    </div>
                  ) : mailing.last?.sent ? (
                    <ResultLine r={{ ...mailing.last, detail: `${mailing.sent} alert email${mailing.sent === 1 ? '' : 's'} sent to ${mailing.last.to}.` }} />
                  ) : (
                    mailing.last && <ResultLine r={mailing.last} />
                  )}
                </div>
              )}
              <div className="space-y-3 mt-5 sim-stagger">
                {created.map((t) => (
                  <div key={t.id} className={`rounded-2xl p-4 border-l-4 bg-white/[0.03] ring-1 ring-white/10 ${t.flagged ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {clock(t.min)} · {nm(t.from)} → {nm(t.to)} · {inr(t.amount)}
                        </div>
                        <div className="text-xs text-white/45">
                          {t.city} · {t.device}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <TxLabel t={t} />
                        <div className="w-44">
                          <ScoreBar score={t.score} />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-white/75 mt-2">{explain(t)}</p>
                    {t.flagged && (
                      <button className="btn btn-primary mt-3 !py-1.5" onClick={() => nav(`/simulate/alerts/${t.alertNo}`)}>
                        Open Alert #{t.alertNo} <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-5">
                <Link className="btn btn-ghost" to="/simulate/dashboard">
                  See all transactions
                </Link>
                <Link className="btn btn-ghost" to="/simulate/alerts">
                  See all alerts
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Label({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-3">
      <span className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-900">{n}</span>
      <h2 className="text-lg font-semibold">{children}</h2>
    </div>
  );
}

const KIND_STYLE = {
  normal: { icon: 'bg-emerald-500/15 text-emerald-300', text: 'text-emerald-300' },
  medium: { icon: 'bg-amber-500/15 text-amber-300', text: 'text-amber-300' },
  attack: { icon: 'bg-rose-500/15 text-rose-300', text: 'text-rose-300' },
};

function ModeCard({ on, kind, onClick, icon, title, text }: { on: boolean; kind: SimMode; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      data-on={on}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      className={`mode-card ${kind} glass lift text-left p-5 md:p-6 cursor-pointer ${on ? '' : 'opacity-70 hover:opacity-100'}`}
    >
      <div className={`w-12 h-12 rounded-2xl grid place-items-center ${KIND_STYLE[kind].icon}`}>{icon}</div>
      <div className="text-lg font-semibold mt-4">{title}</div>
      <p className="text-sm text-white/60 mt-1">{text}</p>
      <div className={`mt-4 text-xs font-semibold ${on ? KIND_STYLE[kind].text : 'text-white/35'}`}>{on ? '● Selected' : 'Click to choose'}</div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/55 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Seg({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all ${on ? 'bg-white text-slate-900 font-semibold' : 'bg-white/[0.04] text-white/60 ring-1 ring-white/10 hover:text-white'}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
