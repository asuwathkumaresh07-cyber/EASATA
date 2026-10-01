import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BellRing, FlaskConical, LayoutDashboard, Scale } from 'lucide-react';
import { alertsOf, useSim } from '@/lib/easata';
import { SimUiProvider } from './common';
import './print.css';

const TABS = [
  { to: '/simulate', label: 'Simulate', icon: FlaskConical, end: true },
  { to: '/simulate/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: false },
  { to: '/simulate/alerts', label: 'Alerts', icon: BellRing, end: false },
  { to: '/simulate/evaluation', label: 'Evaluation', icon: Scale, end: false },
];

export default function SimLayout() {
  const { sim } = useSim();
  const loc = useLocation();
  const count = alertsOf(sim).length;
  return (
    <SimUiProvider>
      <div className="mb-6 print:hidden flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.2em] font-semibold bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">EASATA · EVERY ALERT HAS A STORY</div>
        </div>
        <nav className="glass !rounded-full p-1 flex gap-1 overflow-x-auto scroll-thin" aria-label="Simulation">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap px-4 py-1.5 rounded-full text-sm transition-all duration-200 ${
                  isActive ? 'bg-white text-slate-900 font-semibold shadow-lg' : 'text-white/65 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
              {label === 'Alerts' && count > 0 && <span className="min-w-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold text-center">{count}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      <div key={loc.pathname} className="sim-page">
        <Outlet />
      </div>
    </SimUiProvider>
  );
}
