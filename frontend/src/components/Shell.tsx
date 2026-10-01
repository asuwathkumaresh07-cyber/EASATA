import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X, KeyRound } from 'lucide-react';
import { Logo } from './Logo';
import { getOpsKey, setOpsKey } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ModeToggle } from '@/lib/mode';

export const APP_LINKS = [
  { to: '/overview', label: 'Overview' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/simulate', label: 'Simulate' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/cases', label: 'Cases' },
  { to: '/evaluation', label: 'Evaluation' },
];

export default function Shell() {
  const [open, setOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState(getOpsKey());
  const meta = useApi<any>('/api/meta');

  return (
    <div className="min-h-screen bg-black text-white relative">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(52,211,153,0.08),transparent_50%)]" />
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/60 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8 py-3">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-90">
            <Logo className="w-7 h-7" />
            <span className="font-bold tracking-wider">EASATA</span>
            <span className="hidden sm:inline text-xs text-white/40 tracking-wide">Every alert has a story</span>
          </Link>
          <nav className="hidden xl:flex items-center gap-1">
            {APP_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-sm transition-colors ${isActive ? 'bg-white text-slate-900 font-semibold' : 'text-white/70 hover:text-white'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex"><ModeToggle /></span>
            <span className="sm:hidden"><ModeToggle compact /></span>
            <button onClick={() => setKeyOpen((v) => !v)} className="btn btn-ghost !px-3 !py-1.5" title="Bank-ops key">
              <KeyRound className="w-4 h-4" />
            </button>
            <button onClick={() => setOpen((v) => !v)} className="xl:hidden btn btn-ghost !px-3 !py-1.5" aria-label="Menu">
              {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="xl:hidden flex flex-wrap gap-2 px-4 pb-3">
            {APP_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `px-3 py-1.5 rounded-full text-sm ${isActive ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/80'}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
        {keyOpen && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 pb-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
            <span>Bank-ops key (optional in dev: the Vite proxy adds it from backend/data/ops_api_key.txt)</span>
            <input className="field !py-1 w-72" value={key} onChange={(e) => setKey(e.target.value)} placeholder="X-Ops-Key" type="password" />
            <button
              className="btn btn-ghost !py-1"
              onClick={() => {
                setOpsKey(key.trim());
                setKeyOpen(false);
              }}
            >
              Save
            </button>
          </div>
        )}
      </header>

      {meta.data && (
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-4">
          <div className="text-[11px] text-amber-200/80 bg-amber-500/5 ring-1 ring-amber-400/15 rounded-full px-4 py-1.5 w-fit">{meta.data.disclaimer}</div>
          {meta.data.warnings?.length > 0 && <div className="text-xs text-rose-300 mt-2">{meta.data.warnings.join(' · ')}</div>}
        </div>
      )}

      <main className="relative max-w-7xl mx-auto px-4 md:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
