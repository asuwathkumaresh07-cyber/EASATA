import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

export const BAND_STYLE: Record<string, string> = {
  PROCEED: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  STEP_UP: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  HOLD: 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
  BLOCK: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
};
export const BAND_COLOR: Record<string, string> = { PROCEED: '#34d399', STEP_UP: '#fbbf24', HOLD: '#fb923c', BLOCK: '#fb7185' };

export function Band({ band }: { band?: string }) {
  if (!band) return null;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ring-1 ${BAND_STYLE[band] ?? 'bg-white/10 ring-white/20'}`}>
      {band.replace('_', '-')}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  NOTIFIED: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
  CONFIRMED_NOT_ME: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
  CONFIRMED_LEGIT: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  OPEN: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  INVESTIGATING: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  SHADOW_CREDITED: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
  RESOLVED_REFUNDED: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  RESOLVED_REJECTED: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
  active: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  frozen: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/30',
};

export function Status({ s }: { s?: string | null }) {
  if (!s) return <span className="text-white/30">—</span>;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_STYLE[s] ?? 'bg-white/10 text-white/70 ring-white/20'}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

export function Card({ title, right, children, className = '' }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-sm font-semibold tracking-wide text-white/80">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-white/45 mt-1">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-white/50 mt-1">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-white/50 text-sm py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200 text-sm px-4 py-3">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{msg}</span>
    </div>
  );
}

export function Notice({ children, tone = 'ok' }: { children: React.ReactNode; tone?: 'ok' | 'warn' }) {
  const cls = tone === 'ok' ? 'bg-emerald-500/10 ring-emerald-400/30 text-emerald-200' : 'bg-amber-500/10 ring-amber-400/30 text-amber-200';
  const Icon = tone === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-xl ring-1 text-sm px-4 py-3 ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" /> <div>{children}</div>
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between text-xs text-white/50 mt-4">
      <span>{total.toLocaleString()} total</span>
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost !py-1 !px-3" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <span>
          {page} / {pages.toLocaleString()}
        </span>
        <button className="btn btn-ghost !py-1 !px-3" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export const money = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n?: number | null, d = 1) => (n == null ? '—' : `${(n * 100).toFixed(d)}%`);
export const num = (n?: number | null, d = 3) => (n == null ? '—' : n.toFixed(d));
export const when = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const TOOLTIP_STYLE = {
  contentStyle: { background: '#0b0f17', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 },
  labelStyle: { color: 'rgba(255,255,255,0.6)' },
  itemStyle: { color: '#fff' },
};
