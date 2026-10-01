/* EASATA simulation engine: a simulated day of payments, simple point-based rules, user-run
   simulations (normal payments and attacks), counterfactuals, journeys, incident reports and
   email drafts. All data is simulated. */
import { useSyncExternalStore } from 'react';

export const EMAIL_TO = 'customer@example.test';
export const THRESHOLD = 50; // a payment with this many points or more is flagged
export const MAX_POINTS = 125; // every rule matching

/* ---------------- helpers ---------------- */
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const pad = (n: number) => String(n).padStart(2, '0');
export function clock(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}
export const toHHMM = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.round(min) % 60)}`;
export const fromHHMM = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const DATE_LABEL = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/* ---------------- the world ---------------- */
export type NodeType = 'person' | 'shop' | 'unknown';
export type WNode = { id: string; name: string; type: NodeType; home?: string; avg?: number; device?: string; known?: string[] };

export const CUSTOMERS = [
  { id: 'asha', name: 'Asha Rao', home: 'Chennai', avg: 2400, device: 'iPhone 13' },
  { id: 'vikram', name: 'Vikram Singh', home: 'Delhi', avg: 5200, device: 'Pixel 7' },
  { id: 'priya', name: 'Priya Nair', home: 'Kochi', avg: 1800, device: 'Galaxy S22' },
  { id: 'rahul', name: 'Rahul Mehta', home: 'Mumbai', avg: 6500, device: 'iPhone 14' },
  { id: 'kavya', name: 'Kavya Iyer', home: 'Bengaluru', avg: 3100, device: 'OnePlus 11' },
  { id: 'arjun', name: 'Arjun Das', home: 'Kolkata', avg: 1500, device: 'Redmi Note 12' },
  { id: 'meera', name: 'Meera Pillai', home: 'Pune', avg: 4200, device: 'iPhone 12' },
  { id: 'imran', name: 'Imran Khan', home: 'Hyderabad', avg: 2800, device: 'Galaxy A54' },
];
export const CITIES = ['Chennai', 'Delhi', 'Kochi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Pune', 'Hyderabad', 'Goa', 'Bhopal', 'Ranchi', 'Patna', 'Jaipur'];
const SHOPS = [
  { id: 'freshmart', name: 'FreshMart Grocery' },
  { id: 'citypower', name: 'CityPower Electricity' },
  { id: 'quickkart', name: 'QuickKart Online' },
  { id: 'metrofuel', name: 'Metro Fuel Station' },
  { id: 'carewell', name: 'CareWell Pharmacy' },
];
const EXTRA: WNode[] = [
  { id: 'sunil', name: 'Sunil Verma (landlord)', type: 'person' },
  { id: 'goldleaf', name: 'GoldLeaf Jewellers', type: 'shop' },
  { id: 'seaview', name: 'Seaview Resort, Goa', type: 'shop' },
  { id: 'm4471', name: 'Unknown account ••4471', type: 'unknown', home: 'Ranchi', avg: 2000, device: 'Unknown phone' },
  { id: 'm9083', name: 'Unknown account ••9083', type: 'unknown', home: 'Ranchi', avg: 2000, device: 'Unknown phone' },
  { id: 'm2210', name: 'Unknown account ••2210', type: 'unknown', home: 'Jaipur', avg: 2000, device: 'Unknown phone' },
  { id: 'shadyshop', name: 'Unknown online store', type: 'unknown' },
];
const FRIENDS: Record<string, string[]> = {
  asha: ['priya', 'kavya'], vikram: ['rahul', 'imran'], priya: ['asha', 'meera'], rahul: ['vikram', 'meera', 'sunil'],
  kavya: ['asha', 'arjun'], arjun: ['kavya', 'imran'], meera: ['priya', 'rahul'], imran: ['vikram', 'arjun'],
};
export const NODES: Record<string, WNode> = {};
CUSTOMERS.forEach((p) => (NODES[p.id] = { ...p, type: 'person', known: [...SHOPS.map((s) => s.id), ...FRIENDS[p.id]] }));
SHOPS.forEach((s) => (NODES[s.id] = { ...s, type: 'shop' }));
EXTRA.forEach((x) => (NODES[x.id] = { ...x }));
export const nm = (id: string) => NODES[id]?.name ?? id;
export const isCustomer = (id: string) => CUSTOMERS.some((p) => p.id === id);
export const first = (id: string) => (isCustomer(id) ? nm(id).split(' ')[0] : nm(id));
/** Receivers a customer has paid before (shown in the simulation form). */
export const knownPayees = (id: string) => NODES[id]?.known ?? [];
function unknownAccount(seed: number, home: string) {
  const digits = String(1000 + (Math.abs(seed) % 9000));
  const id = `u${digits}`;
  if (!NODES[id]) NODES[id] = { id, name: `Unknown account ••${digits}`, type: 'unknown', home, avg: 2000, device: 'Unknown phone' };
  return id;
}

/* ---------------- transactions & rules ---------------- */
export type Tx = {
  id: string; from: string; to: string; amount: number; min: number; device: string; city: string;
  newDevice: boolean; fresh: boolean; fraud: boolean; story: string; byUser?: boolean; batch?: number;
  recent: number; newReceiver: boolean; score: number; flagged: boolean; alertNo?: number;
};
export type Rule = { id: string; name: string; points: number; plain: string; test: (t: Tx) => boolean; value: (t: Tx) => string };

const avgOf = (t: Tx) => NODES[t.from].avg ?? 2000;
export const RULES: Rule[] = [
  { id: 'amount', name: 'Large amount', points: 30, plain: 'The payment is ₹50,000 or more.',
    test: (t) => t.amount >= 50000, value: (t) => `${inr(t.amount)} (the limit is ₹50,000)` },
  { id: 'night', name: 'Late-night payment', points: 20, plain: 'The payment was made between midnight and 6 AM.',
    test: (t) => Math.floor(t.min / 60) < 6, value: (t) => `Made at ${clock(t.min)}` },
  { id: 'burst', name: 'Many payments in a short time', points: 20, plain: 'This is the third payment (or more) by the same person within one hour.',
    test: (t) => t.recent >= 2, value: (t) => `${plural(t.recent, 'other payment', 'other payments')} in the hour before this one` },
  { id: 'newPayee', name: 'New receiver', points: 15, plain: 'The sender has never paid this receiver before.',
    test: (t) => t.newReceiver, value: (t) => `First payment from ${first(t.from)} to ${nm(t.to)}` },
  { id: 'newDevice', name: 'New device', points: 15, plain: "The payment came from a phone or computer the sender hasn't used before.",
    test: (t) => t.newDevice, value: (t) => `${t.device} (usual device: ${NODES[t.from].device})` },
  { id: 'bigForThem', name: 'Much bigger than usual', points: 15, plain: "The amount is at least five times the sender's usual payment.",
    test: (t) => t.amount >= 5 * avgOf(t), value: (t) => `${inr(t.amount)} is ${(t.amount / avgOf(t)).toFixed(1)}× their usual ${inr(avgOf(t))}` },
  { id: 'place', name: 'Unusual location', points: 10, plain: "The payment was made away from the sender's home city.",
    test: (t) => t.city !== NODES[t.from].home, value: (t) => `${t.city} (home city: ${NODES[t.from].home})` },
];
export function score(t: Tx) {
  const matched = RULES.filter((r) => r.test(t));
  const total = matched.reduce((s, r) => s + r.points, 0);
  return { matched, total, flagged: total >= THRESHOLD };
}
/** Very high risk: only these alerts get a "Freeze account" button in the email. */
export const VERY_HIGH = 80;
export const level = (s: number) => (s >= VERY_HIGH ? 'Critical' : s >= THRESHOLD ? 'High' : s >= 30 ? 'Medium' : 'Low');

/** One plain-English sentence explaining a decision. */
export function explain(t: Tx) {
  const sc = score(t);
  const reasons = sc.matched.map((r) => r.name.toLowerCase());
  const list = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}` : reasons[0];
  if (t.flagged) return `Flagged because of ${list}. Together these add up to ${sc.total} points, which reaches the alert line of ${THRESHOLD}.`;
  if (!reasons.length) return `Cleared. Nothing about this payment was unusual, so it scored 0 points.`;
  return `Cleared. It showed ${list} (${sc.total} points), but that stays below the alert line of ${THRESHOLD}.`;
}

/* ---------------- counterfactuals ---------------- */
type Lever = { id: string; group: string; applies: (t: Tx) => boolean; apply: (t: Tx) => Tx; clause: (t: Tx) => string };
const LEVERS: Lever[] = [
  { id: 'amount50', group: 'amount', applies: (t) => t.amount >= 50000, apply: (t) => ({ ...t, amount: Math.min(t.amount, 49999) }),
    clause: () => 'the amount had been below ₹50,000' },
  { id: 'amountUsual', group: 'amount', applies: (t) => t.amount >= 5 * avgOf(t), apply: (t) => ({ ...t, amount: Math.min(t.amount, 5 * avgOf(t) - 1) }),
    clause: (t) => `the amount had been below ${inr(5 * avgOf(t))} (five times ${first(t.from)}'s usual payment)` },
  { id: 'daytime', group: 'time', applies: (t) => Math.floor(t.min / 60) < 6, apply: (t) => ({ ...t, min: 600 }),
    clause: () => 'the payment had been made during the day (after 6 AM)' },
  { id: 'fewer', group: 'burst', applies: (t) => t.recent >= 2, apply: (t) => ({ ...t, recent: 0 }),
    clause: (t) => `this had been ${first(t.from)}'s only payment in that hour (it was the ${ordinal(t.recent + 1)})` },
  { id: 'knownPayee', group: 'payee', applies: (t) => t.newReceiver, apply: (t) => ({ ...t, newReceiver: false }),
    clause: (t) => `${first(t.from)} had paid ${nm(t.to)} before` },
  { id: 'usualDevice', group: 'device', applies: (t) => t.newDevice, apply: (t) => ({ ...t, newDevice: false }),
    clause: (t) => `the payment had come from ${first(t.from)}'s usual device (${NODES[t.from].device})` },
  { id: 'home', group: 'place', applies: (t) => t.city !== NODES[t.from].home, apply: (t) => ({ ...t, city: NODES[t.from].home! }),
    clause: (t) => `the payment had been made from ${NODES[t.from].home}, ${first(t.from)}'s home city` },
];
export type Counterfactual = { changes: string[]; before: number; after: number; sentence: string };
export function counterfactuals(t: Tx): Counterfactual[] {
  const before = score(t).total;
  const levers = LEVERS.filter((l) => l.applies(t));
  const found: { levers: Lever[]; after: number }[] = [];
  const combos = (k: number, start: number, cur: Lever[]) => {
    if (cur.length === k) {
      if (new Set(cur.map((l) => l.group)).size !== cur.length) return;
      let x = t;
      cur.forEach((l) => (x = l.apply(x)));
      const after = score(x).total;
      if (after < THRESHOLD && !found.some((f) => f.levers.every((l) => cur.includes(l)))) found.push({ levers: [...cur], after });
      return;
    }
    for (let i = start; i < levers.length; i++) combos(k, i + 1, [...cur, levers[i]]);
  };
  for (let k = 1; k <= levers.length && found.length < 6; k++) combos(k, 0, []);
  // fewest changes first; then the one that only just clears the line (the smallest change)
  found.sort((a, b) => a.levers.length - b.levers.length || b.after - a.after);
  return found.slice(0, 4).map((f) => {
    const changes = f.levers.map((l) => l.clause(t));
    return { changes, before, after: f.after, sentence: `If ${changes.join(' and ')}, the alert would not have been raised.` };
  });
}

/* ---------------- building the day ---------------- */
export type SimEvent = { min: number; actor: string; type: 'warn' | 'signin' | 'payee'; text: string };
export type Sim = { seed: number; txs: Tx[]; events: SimEvent[]; nextAlert: number; nextBatch: number };
type NewTx = Partial<Tx> & { from: string; to: string; amount: number; min: number };

const blank = (o: NewTx): Tx => ({
  id: '', device: NODES[o.from].device ?? 'Unknown phone', city: NODES[o.from].home ?? 'Unknown', newDevice: false, fresh: false, fraud: false,
  story: 'Everyday payment', recent: 0, newReceiver: false, score: 0, flagged: false, ...o,
});

/** Works out the history-based facts for one payment, scores it and adds its journey events. */
function finish(sim: Sim, t: Tx) {
  const earlier = sim.txs.filter((x) => x !== t && x.from === t.from && x.min <= t.min);
  t.recent = earlier.filter((x) => t.min - x.min <= 60).length;
  t.newReceiver = t.fresh && !earlier.some((x) => x.to === t.to);
  const sc = score(t);
  t.score = sc.total;
  t.flagged = sc.flagged;
  if (t.flagged) t.alertNo = sim.nextAlert++;
  if (t.newDevice && !sim.events.some((e) => e.actor === t.from && e.type === 'signin' && t.min - e.min >= 0 && t.min - e.min < 90))
    sim.events.push({ min: t.min - 3, actor: t.from, type: 'signin', text: `${nm(t.from)}'s account signed in on a new device (${t.device}) from ${t.city}.` });
  if (t.newReceiver) sim.events.push({ min: t.min - 1, actor: t.from, type: 'payee', text: `${nm(t.from)} added a new payee: ${nm(t.to)}.` });
}

export function baseDay(seed: number): Sim {
  const rnd = mulberry32(seed);
  const rint = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const raw: Tx[] = [];
  const events: SimEvent[] = [];
  const add = (o: NewTx) => raw.push(blank(o));

  for (let i = 0; i < 18; i++) {
    const p = pick(CUSTOMERS);
    add({ from: p.id, to: pick(NODES[p.id].known!), amount: round(p.avg * (0.25 + rnd() * 1.6), 10), min: rint(8 * 60, 21 * 60 + 50) });
  }
  for (let i = 0; i < 2; i++) {
    const p = pick(CUSTOMERS);
    const to = pick(CUSTOMERS.filter((q) => q.id !== p.id && !NODES[p.id].known!.includes(q.id))).id;
    add({ from: p.id, to, amount: round(p.avg * (0.4 + rnd()), 10), min: rint(9 * 60, 20 * 60), fresh: true, story: 'Paying a new friend back' });
  }
  add({ from: 'rahul', to: 'sunil', amount: 55000, min: rint(9 * 60, 11 * 60), story: 'Monthly rent (genuine)' });
  add({ from: 'meera', to: 'goldleaf', amount: round(rint(62000, 90000), 500), min: rint(12 * 60, 18 * 60), fresh: true, story: 'Wedding jewellery purchase (genuine)' });
  add({ from: 'kavya', to: 'seaview', amount: round(rint(16000, 24000), 100), min: rint(20 * 60, 23 * 60), fresh: true, city: 'Goa', story: 'Holiday hotel booking (genuine)' });

  // background fraud so the dashboard and evaluation have something to find
  const v = pick(CUSTOMERS.filter((p) => !['rahul', 'meera', 'kavya'].includes(p.id)));
  const start = rint(90, 200);
  const city = pick(['Bhopal', 'Ranchi', 'Patna']);
  events.push({ min: start - 18, actor: v.id, type: 'warn', text: `A password reset was requested for ${v.name}'s account from an unknown phone number.` });
  const amts = [round(rint(52000, 80000), 500), round(rint(30000, 60000), 500), round(rint(20000, 45000), 500)];
  [0, rint(6, 12), rint(16, 26)].forEach((g, i) =>
    add({ from: v.id, to: 'm4471', amount: amts[i], min: start + g, device: 'Unknown Android phone', city, newDevice: true, fresh: true, fraud: true, story: 'Account takeover' }),
  );
  add({ from: 'm4471', to: 'm9083', amount: round(amts.reduce((s, a) => s + a, 0) * 0.9, 500), min: start + rint(38, 55), city: 'Ranchi', fresh: true, fraud: true, story: 'Money moved on (mule account)' });
  const w = pick(CUSTOMERS.filter((p) => p.id !== v.id && !['rahul', 'meera', 'kavya'].includes(p.id)));
  const m = rint(11 * 60, 16 * 60);
  events.push({ min: m - 12, actor: w.id, type: 'warn', text: `${w.name} received a text message saying their KYC would expire today, with a link to "update" it.` });
  add({ from: w.id, to: 'm2210', amount: round(rint(45000, 49900), 100), min: m, fresh: true, fraud: true, story: 'Phishing (customer tricked)' });

  raw.sort((a, b) => a.min - b.min);
  const sim: Sim = { seed, txs: [], events, nextAlert: 1, nextBatch: 1 };
  raw.forEach((t, i) => {
    t.id = 'T' + String(i + 1).padStart(3, '0');
    sim.txs.push(t);
    finish(sim, t);
  });
  return sim;
}

/* ---------------- user simulations ---------------- */
export type SimMode = 'normal' | 'medium' | 'attack';
export type SimInput = { mode: SimMode; from: string; to: string; amount: number; min: number; newDevice: boolean; city: string };

export function preset(mode: SimMode, from: string): SimInput {
  const p = NODES[from];
  if (mode === 'normal') return { mode, from, to: p.known![0], amount: round((p.avg ?? 2000) * 0.8, 10), min: 14 * 60 + 30, newDevice: false, city: p.home! };
  // medium: a new receiver from a new device in another city, in the evening, about twice the usual amount (40 points, below the alert line)
  if (mode === 'medium')
    return { mode, from, to: 'new', amount: Math.min(45000, round((p.avg ?? 2000) * 2, 100)), min: 20 * 60, newDevice: true, city: p.home === 'Mumbai' ? 'Pune' : 'Mumbai' };
  return { mode, from, to: 'new', amount: 65000, min: 2 * 60 + 10, newDevice: true, city: p.home === 'Ranchi' ? 'Patna' : 'Ranchi' };
}

/** Adds the payments for one simulation run. Returns the ids of the new payments. */
function applyRun(sim: Sim, input: SimInput, k: number): string[] {
  const batch = sim.nextBatch++;
  const created: Tx[] = [];
  const push = (o: NewTx) => {
    const t = blank({ ...o, byUser: true, batch });
    t.id = 'S' + String(sim.txs.length + 1).padStart(3, '0');
    sim.txs.push(t);
    finish(sim, t);
    created.push(t);
  };
  const dev = input.newDevice ? (input.mode === 'attack' ? 'Unknown Android phone' : 'New laptop') : NODES[input.from].device!;
  const to = input.to === 'new' ? unknownAccount(sim.seed + k * 7919, input.city === NODES[input.from].home ? 'Unknown' : input.city) : input.to;
  const fresh = !knownPayees(input.from).includes(to);

  if (input.mode !== 'attack') {
    const story = input.mode === 'medium' ? 'Your simulated medium-risk payment' : 'Your simulated normal payment';
    push({ from: input.from, to, amount: input.amount, min: input.min, device: dev, newDevice: input.newDevice, city: input.city, fresh, story });
  } else {
    sim.events.push({ min: input.min - 18, actor: input.from, type: 'warn', text: `A password reset was requested for ${nm(input.from)}'s account from an unknown phone number.` });
    const amts = [input.amount, round(input.amount * 0.6, 500), round(input.amount * 0.4, 500)];
    [0, 9, 21].forEach((g, i) =>
      push({ from: input.from, to, amount: amts[i], min: input.min + g, device: dev, newDevice: input.newDevice, city: input.city, fresh, fraud: true, story: 'Your simulated attack' }),
    );
    const next = unknownAccount(sim.seed + k * 104729 + 1, NODES[to].home ?? 'Unknown');
    push({ from: to, to: next, amount: round(amts.reduce((s, a) => s + a, 0) * 0.9, 500), min: input.min + 40, city: NODES[to].home ?? 'Unknown', fresh: true, fraud: true, story: 'Money moved on (mule account)' });
  }
  return created.map((t) => t.id);
}

/* ---------------- store (persisted per browser; rebuilt deterministically) ---------------- */
export type AlertStatus = 'new' | 'fraud' | 'legit';
export const STATUS_LABEL: Record<AlertStatus, string> = { new: 'New', fraud: 'Confirmed fraud', legit: 'False alarm' };
type Saved = { seed: number; runs: SimInput[]; status: Record<number, AlertStatus>; emailed: Record<number, boolean>; frozen: Record<string, number> };
type Store = Saved & { sim: Sim; last: string[] };

function build(saved: Saved): Store {
  const sim = baseDay(saved.seed);
  let last: string[] = [];
  saved.runs.forEach((r, k) => (last = applyRun(sim, r, k)));
  return { ...saved, sim, last };
}
function loadStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem('easata-sim-v2') || 'null');
    if (raw?.seed) return build({ seed: raw.seed, runs: raw.runs || [], status: raw.status || {}, emailed: raw.emailed || {}, frozen: raw.frozen || {} });
  } catch {
    /* ignore */
  }
  return build({ seed: 20260929, runs: [], status: {}, emailed: {}, frozen: {} });
}
let store: Store = loadStore();
const listeners = new Set<() => void>();
function commit(next: Store) {
  store = next;
  try {
    localStorage.setItem('easata-sim-v2', JSON.stringify({ seed: store.seed, runs: store.runs, status: store.status, emailed: store.emailed, frozen: store.frozen }));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const simStore = {
  run: (input: SimInput) => {
    const next = build({ seed: store.seed, runs: [...store.runs, input], status: store.status, emailed: store.emailed, frozen: store.frozen });
    commit(next);
    return next.last;
  },
  newDay: () => commit(build({ seed: Math.floor(Math.random() * 1e9), runs: [], status: {}, emailed: {}, frozen: {} })),
  setStatus: (n: number, s: AlertStatus) => {
    const status = { ...store.status };
    if (s === 'new') delete status[n];
    else status[n] = s;
    commit({ ...store, status });
  },
  /** Freezes the sender's account because of alert n (simulated) and marks the alert as confirmed fraud. */
  freeze: (n: number) => {
    const t = byAlert(store.sim, n);
    if (!t) return;
    commit({ ...store, frozen: { ...store.frozen, [t.from]: n }, status: { ...store.status, [n]: 'fraud' } });
  },
  unfreeze: (customer: string) => {
    const frozen = { ...store.frozen };
    delete frozen[customer];
    commit({ ...store, frozen });
  },
  markEmailed: (ns: number[]) => commit({ ...store, emailed: { ...store.emailed, ...Object.fromEntries(ns.map((n) => [n, true])) } }),
};
/** Current state, for code outside React render (e.g. right after a run). */
export const currentStore = () => store;

export function useSim() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store,
  );
}

/* ---------------- derived: alerts, journeys, reports, emails ---------------- */
export const alertsOf = (sim: Sim) => sim.txs.filter((t) => t.flagged).sort((a, b) => a.alertNo! - b.alertNo!);
export const byAlert = (sim: Sim, n: number) => sim.txs.find((t) => t.alertNo === n);

/** Payments connected to an alert: everything the sender and receiver sent or received. */
export function network(sim: Sim, t: Tx) {
  const ids = new Set([t.from, t.to]);
  return sim.txs.filter((x) => ids.has(x.from) || ids.has(x.to));
}

export type JourneyItem = { min: number; kind: 'warn' | 'signin' | 'payee' | 'pay' | 'pay-flag' | 'alert'; text: string; tx?: Tx; key?: boolean; onward?: boolean };
export function journey(sim: Sim, t: Tx): JourneyItem[] {
  const lo = t.min - 240, hi = t.min + 120;
  const items: JourneyItem[] = [];
  sim.events.filter((e) => e.actor === t.from && e.min >= lo && e.min <= hi).forEach((e) => items.push({ min: e.min, kind: e.type, text: e.text }));
  const pay = (x: Tx, onward = false) => {
    items.push({ min: x.min, kind: x.flagged ? 'pay-flag' : 'pay', tx: x, key: x.id === t.id, onward, text: `${nm(x.from)} sent ${inr(x.amount)} ${onward ? 'on ' : ''}to ${nm(x.to)}.` });
    if (x.flagged) items.push({ min: x.min + 0.01, kind: 'alert', tx: x, onward, text: `EASATA raised Alert #${x.alertNo} on this ${onward ? 'onward ' : ''}payment (score ${x.score}).` });
  };
  sim.txs.filter((x) => x.from === t.from && x.min >= lo && x.min <= hi).forEach((x) => pay(x));
  sim.txs.filter((x) => x.from === t.to && x.min >= t.min && x.min <= t.min + 180).forEach((x) => pay(x, true));
  return items.sort((a, b) => a.min - b.min);
}

export function recommendation(sim: Sim, t: Tx): string[] {
  const onward = sim.txs.find((x) => x.from === t.to && x.min >= t.min && x.min <= t.min + 180);
  const recs: string[] = [];
  if (t.score >= 80) recs.push(`Block further outgoing payments from ${nm(t.from)}'s account straight away and call the customer on their registered phone number.`);
  else recs.push(`Hold this payment and ask ${nm(t.from)} to confirm it through the banking app or a call to their registered phone number.`);
  if (t.newDevice) recs.push('Sign out all other devices and ask the customer to reset their password and PIN.');
  if (NODES[t.to].type === 'unknown') recs.push(`Ask the receiving bank to put a hold on ${nm(t.to)} while the case is checked.`);
  if (onward) recs.push(`Trace the onward payment of ${inr(onward.amount)} from ${nm(onward.from)} to ${nm(onward.to)} at ${clock(onward.min)}.`);
  recs.push('If the customer confirms that they made the payment, mark the alert as a false alarm so that the rules can be improved.');
  return recs;
}

// lower-case only a leading article ("A password reset…"), never a name
const lc = (s: string) => s.replace(/^(A|An|The) /, (m) => m.toLowerCase());

export function reportData(sim: Sim, t: Tx) {
  const sc = score(t);
  const cfs = counterfactuals(t);
  const j = journey(sim, t);
  const same = sim.txs.filter((x) => x.from === t.from && x.to === t.to).sort((a, b) => a.min - b.min);
  const what: string[] = [];
  what.push(`On ${DATE_LABEL} at ${clock(t.min)}, ${nm(t.from)} sent ${inr(t.amount)} to ${nm(t.to)}${t.city !== NODES[t.from].home ? ` from ${t.city}` : ''}. EASATA flagged the payment and raised Alert #${t.alertNo}.`);
  const before = j.filter((e) => e.min < t.min && !e.tx);
  if (before.length) what.push('Before the payment: ' + before.map((e, i) => `${i ? 'Then, at' : 'at'} ${clock(e.min)}, ${lc(e.text)}`).join(' '));
  if (same.length > 1)
    what.push(`In total, ${nm(t.from)} made ${plural(same.length, 'payment', 'payments')} to ${nm(t.to)} between ${clock(same[0].min)} and ${clock(same[same.length - 1].min)}, worth ${inr(same.reduce((s, x) => s + x.amount, 0))}.`);
  const onward = j.filter((e) => e.onward && e.kind !== 'alert');
  if (onward.length) what.push('Afterwards, ' + onward.map((e, i) => `${i ? 'then, at' : 'at'} ${clock(e.min)}, ${lc(e.text)}`).join(' '));
  let run = 0;
  const how = sc.matched.map((r) => {
    run += r.points;
    return `${r.name}: +${r.points} points (running total ${run})`;
  });
  return { sc, cfs, what, how, recs: recommendation(sim, t) };
}

export function reportText(sim: Sim, t: Tx, status: AlertStatus) {
  const d = reportData(sim, t);
  const L: string[] = [];
  L.push(`INCIDENT REPORT – ALERT #${t.alertNo}`, `Prepared by EASATA on ${DATE_LABEL} · Transaction ${t.id} · Status: ${STATUS_LABEL[status]}`, '');
  L.push('WHAT HAPPENED', ...d.what, '');
  L.push('WHY IT WAS FLAGGED', ...d.sc.matched.map((r) => `- ${r.name} (+${r.points} points): ${r.value(t)}.`), '');
  L.push('HOW IT WAS FLAGGED', 'Every payment starts at 0 points. Each rule that matches adds its points:', ...d.how.map((h) => `- ${h}`));
  L.push(`Total: ${d.sc.total} points. Alert line: ${THRESHOLD} points. Result: flagged (risk level: ${level(d.sc.total)}).`, '');
  L.push('COUNTERFACTUAL EXPLANATION');
  if (d.cfs.length) {
    L.push(`${d.cfs[0].sentence} The score would have been ${d.cfs[0].after} instead of ${d.cfs[0].before}.`);
    d.cfs.slice(1).forEach((c) => L.push(`- Alternative: ${c.sentence} (score ${c.after})`));
  } else L.push('No simple change would have kept this payment below the alert line.');
  L.push('', 'RECOMMENDATION', ...d.recs.map((r) => `- ${r}`), '', 'This report is based on simulated data. An alert means "check this payment", not proof of fraud.');
  return L.join('\n');
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Link in the email that opens the freeze confirmation page. Opening it changes nothing; the page needs a click. */
export const freezeLink = (n: number) => `${window.location.origin}/simulate/freeze/${n}`;

export function emailFor(sim: Sim, t: Tx, status: AlertStatus) {
  const subject = `EASATA Alert #${t.alertNo} – ${inr(t.amount)} payment flagged (Score ${t.score})`;
  const canFreeze = t.score >= VERY_HIGH && !store.frozen[t.from];
  const facts: [string, string][] = [
    ['Sender', nm(t.from)],
    ['Receiver', nm(t.to)],
    ['Amount', inr(t.amount)],
    ['Time', `${DATE_LABEL}, ${clock(t.min)}`],
    ['Risk score', `${t.score} (alert line ${THRESHOLD}, risk level ${level(t.score)})`],
  ];
  const report = reportText(sim, t, status);
  const link = freezeLink(t.alertNo!);
  const body = [
    `EASATA Alert #${t.alertNo}`,
    ...facts.map(([k, v]) => `${k}: ${v}`),
    ...(canFreeze ? ['', `VERY HIGH RISK. Freeze ${nm(t.from)}'s account: ${link}`] : []),
    '',
    report,
  ].join('\n');
  const button = canFreeze
    ? `<tr><td style="padding:18px 0 6px">
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:14px 16px;color:#9f1239;font-size:14px">
          <b>Very high risk.</b> This payment scored ${t.score} points. Freeze ${esc(nm(t.from))}'s account to stop further payments.
        </div>
        <a href="${esc(link)}" style="display:inline-block;margin-top:14px;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:8px">&#10052; Freeze account</a>
        <div style="color:#64748b;font-size:12px;margin-top:8px">Opens EASATA, where you confirm the freeze. Nothing changes until you press the button there.</div>
      </td></tr>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;padding:24px">
<tr><td><div style="font-size:12px;letter-spacing:2px;color:#0891b2;font-weight:700">EASATA · EVERY ALERT HAS A STORY</div>
<h1 style="font-size:22px;margin:8px 0 14px">Alert #${t.alertNo}: ${esc(inr(t.amount))} payment flagged</h1></td></tr>
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">
${facts.map(([k, v]) => `<tr><td style="color:#64748b;padding:3px 16px 3px 0">${esc(k)}</td><td style="font-weight:600">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
${button}
<tr><td><pre style="white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.5;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-top:18px">${esc(report)}</pre></td></tr>
</table></body></html>`;
  return { subject, body, html };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* ignore */
    }
    ta.remove();
    return ok;
  }
}

/** Opens a pre-filled draft in Gmail or the default email app. The user presses Send.
    Long bodies go to the clipboard because mail links have length limits. */
export async function openDraft(kind: 'gmail' | 'mailto', subject: string, body: string): Promise<string> {
  const enc = encodeURIComponent;
  const url = (b: string) =>
    kind === 'gmail'
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(EMAIL_TO)}&su=${enc(subject)}&body=${enc(b)}`
      : `mailto:${EMAIL_TO}?subject=${enc(subject)}&body=${enc(b)}`;
  let b = body;
  let copied = false;
  if (url(b).length > (kind === 'gmail' ? 7000 : 1800)) {
    copied = await copyText(body);
    b = copied
      ? 'The full alert details were copied to your clipboard. Please paste them here (Ctrl+V or Cmd+V) before sending.'
      : body.slice(0, 1200) + '\n…(shortened; open EASATA to copy the full text)';
  }
  if (kind === 'gmail') window.open(url(b), '_blank', 'noopener');
  else window.location.href = url(b);
  return copied ? 'Draft opened. The full text is on your clipboard; paste it into the email.' : 'Draft opened. Check it and press Send.';
}
