import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X, ShieldCheck, BadgeCheck, Sparkles, MailQuestion, Snowflake, Gauge, Scale, Activity, ChevronDown } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { APP_LINKS } from '@/components/Shell';
import { useApi } from '@/lib/useApi';
import { BAND_COLOR, money, pct } from '@/components/ui';
import { BAND_PLAIN } from '@/lib/labels';

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260613_180732_a54afbf6-b30d-470e-861f-669871f09f67.mp4';

const FEATURES = [
  { icon: Gauge, title: 'Calibrated risk score', text: 'When it says 10%, about 10% really are fraud. The alert line is chosen on held-out data, not guessed.' },
  { icon: BadgeCheck, title: 'Verified reasons', text: 'Every reason is filled from the data and re-checked. Anything that cannot be confirmed is removed.' },
  { icon: Sparkles, title: 'Two ways to read it', text: 'Analysts get SHAP waterfalls and log-odds. Everyone else gets plain English: what, why, and what happens next.' },
  { icon: Scale, title: 'Adaptive friction', text: 'Let it through → ask for a code → pause and ask → stop, set by chance of fraud × amount at stake.' },
  { icon: MailQuestion, title: '"Was this you?"', text: 'Single-use 30-minute links. Opening a link changes nothing, and "It was me" needs a code sent to the phone.' },
  { icon: Snowflake, title: 'One-click freeze', text: '"Not me" freezes the account, holds the payment and opens a case with deadlines and an audit trail.' },
];

const STEPS = [
  ['Score', 'Every payment gets a calibrated chance of fraud and an "is this unusual?" check.'],
  ['Explain', 'Checked reasons for analysts, and a customer-safe message with no scores in it.'],
  ['Ask', 'Risky payments pause, and the customer gets a single-use "Was this you?" link.'],
  ['Respond', '"Not me" freezes the account and opens a case. "It was me" + a code teaches it a safe habit.'],
];

/* ---------------- scroll choreography ----------------
   The video is a planet horizon. Poses are interpolated between scroll anchors:
   hero (full view) → sinks into a horizon and starts turning → keeps turning while you read → rises and zooms at the end. */
type Pose = { y: number; s: number; r: number; b: number; dock: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function poseAt(scroll: number, vh: number, max: number, mobile: boolean): Pose {
  const frames: [number, Pose][] = [
    [0, { y: 0, s: 1, r: 0, b: 1, dock: 0 }],
    [0.9 * vh, { y: mobile ? 30 : 34, s: 1.2, r: -7, b: 0.55, dock: 1 }],
    [Math.max(1.8 * vh, max - 1.3 * vh), { y: mobile ? 34 : 38, s: 1.3, r: -26, b: 0.45, dock: 1 }],
    [Math.max(2.5 * vh, max), { y: -4, s: 1.75, r: -34, b: 0.95, dock: 0.4 }],
  ];
  if (scroll <= 0) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [a, pa] = frames[i];
    const [b, pb] = frames[i + 1];
    if (scroll <= b) {
      const t = ease((scroll - a) / (b - a || 1));
      return { y: lerp(pa.y, pb.y, t), s: lerp(pa.s, pb.s, t), r: lerp(pa.r, pb.r, t), b: lerp(pa.b, pb.b, t), dock: lerp(pa.dock, pb.dock, t) };
    }
  }
  return frames[frames.length - 1][1];
}

// Points on the lit coastlines of the video frame (viewBox 1769×1000, same framing as object-cover).
const CITIES: [number, number][] = [
  [538, 729],
  [746, 903],
  [902, 816],
  [1050, 712],
  [1128, 608],
  [1319, 764],
];
const ROUTES: [number, number, string][] = [
  [0, 3, 'PROCEED'],
  [2, 5, 'HOLD'],
  [1, 4, 'PROCEED'],
  [3, 5, 'STEP_UP'],
  [0, 2, 'BLOCK'],
  [4, 1, 'PROCEED'],
];

function Globe({ alerts }: { alerts: any[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      const p = poseAt(reduce ? 0 : window.scrollY, vh, max, window.innerWidth < 768);
      const el = wrap.current;
      if (!el) return;
      el.style.transform = `translate3d(0, ${p.y}vh, 0) scale(${p.s}) rotate(${p.r}deg)`;
      if (dim.current) dim.current.style.opacity = String(1 - p.b);
      el.style.setProperty('--dock', String(p.dock));
      if (glow.current) glow.current.style.opacity = String(0.25 + p.dock * 0.6);
      document.documentElement.style.setProperty('--hero-p', String(Math.min(1, window.scrollY / (vh * 0.7))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div ref={wrap} className="absolute inset-0 will-change-transform" style={{ transformOrigin: '50% 140%' }}>
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" src={VIDEO} />
        {/* payment arcs travelling between cities, drawn on the planet so they turn with it */}
        <svg viewBox="0 0 1769 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" style={{ opacity: 'calc(0.25 + var(--dock, 0) * 0.75)' as any }}>
          {ROUTES.map(([a, b, band], i) => {
            const [x1, y1] = CITIES[a];
            const [x2, y2] = CITIES[b];
            const cx = (x1 + x2) / 2;
            const cy = Math.min(y1, y2) - 150 - Math.abs(x2 - x1) * 0.25;
            return (
              <g key={i}>
                <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="rgba(165,243,252,0.12)" strokeWidth="1.5" />
                <path
                  d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                  fill="none"
                  stroke={BAND_COLOR[band]}
                  strokeOpacity="0.3"
                  strokeWidth={band === 'BLOCK' ? 12 : 8}
                  strokeLinecap="round"
                  className="route"
                  style={{ animationDelay: `${i * 0.9}s` }}
                />
                <path
                  d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                  fill="none"
                  stroke={BAND_COLOR[band]}
                  strokeWidth={band === 'BLOCK' ? 4 : 2.5}
                  strokeLinecap="round"
                  className="route"
                  style={{ animationDelay: `${i * 0.9}s` }}
                />
              </g>
            );
          })}
          {CITIES.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill="#a5f3fc" />
              <circle cx={x} cy={y} r="5" fill="none" stroke="#67e8f9" strokeWidth="2" className="ping" style={{ animationDelay: `${i * 0.5}s` }} />
            </g>
          ))}
          {/* live alerts pinned to the planet */}
          {alerts.slice(0, 3).map((al, i) => {
            const [x, y] = CITIES[[4, 3, 0][i]];
            const w = 330;
            return (
              <g key={al.transaction_id} style={{ opacity: 'var(--dock, 0)' as any, transition: 'opacity .3s' }} transform={`translate(${x - w / 2}, ${y - 130 - i * 14})`}>
                <line x1={w / 2} y1={58} x2={w / 2} y2={125 + i * 14} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
                <rect width={w} height={58} rx="14" fill="rgba(5,10,20,0.72)" stroke={BAND_COLOR[al.band]} strokeOpacity="0.7" />
                <circle cx="24" cy="29" r="7" fill={BAND_COLOR[al.band]} className="blink" />
                <text x="42" y="25" fill="#fff" fontSize="19" fontWeight="700">
                  {BAND_PLAIN[al.band].title}
                </text>
                <text x="42" y="46" fill="rgba(255,255,255,0.65)" fontSize="15">
                  {money(al.transaction_amount)} · {al.merchant_category} · {al.city}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div ref={dim} className="absolute inset-0 bg-black" style={{ opacity: 0 }} />
      {/* atmospheric glow that brightens as the planet becomes a horizon */}
      <div ref={glow} className="absolute inset-x-0 bottom-0 h-[55vh] bg-[radial-gradient(ellipse_at_bottom,rgba(56,189,248,0.35),transparent_65%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40" />
    </div>
  );
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('revealed');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const overview = useApi<any>('/api/overview');
  const alerts = useApi<any>('/api/alerts?size=3');
  const o = overview.data;
  useReveal();

  useEffect(() => {
    let frame: number;
    if (mobileMenuOpen) frame = requestAnimationFrame(() => setMenuVisible(true));
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => {
    setMenuVisible(false);
    setTimeout(() => setMobileMenuOpen(false), 500);
  };
  const toggleMobileMenu = () => (menuVisible ? closeMobileMenu() : setMobileMenuOpen(true));

  return (
    <div className="bg-black text-white selection:bg-cyan-500 selection:text-white relative">
      <Globe alerts={alerts.data?.items ?? []} />

      {/* ============ HEADER ============ */}
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 lg:px-16 py-5 backdrop-blur-sm bg-gradient-to-b from-black/50 to-transparent">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 group" aria-label="EASATA home">
          <Logo className="w-8 h-8 group-hover:scale-105 transition-transform duration-300" />
          <span className="text-xl font-bold tracking-wider select-none">EASATA</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-8" aria-label="Main">
          {APP_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-white/80 hover:text-white text-sm tracking-wide transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:flex items-center">
          <Link
            to="/overview"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:opacity-95 text-white text-sm font-semibold px-6 py-2.5 rounded-full shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
          >
            <span>OPEN CONSOLE</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <button
          type="button"
          onClick={toggleMobileMenu}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          className="lg:hidden relative z-[60] w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer"
        >
          <Menu className={`w-6 h-6 absolute transition-all duration-300 ${menuVisible ? 'opacity-0 rotate-90 scale-75' : 'opacity-100'}`} />
          <X className={`w-6 h-6 absolute transition-all duration-300 ${menuVisible ? 'opacity-100' : 'opacity-0 -rotate-90 scale-75'}`} />
        </button>
      </header>

      {mobileMenuOpen && (
        <>
          <div onClick={closeMobileMenu} className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-md transition-opacity duration-400 ${menuVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden="true" />
          <div className="fixed left-0 right-0 top-[68px] z-50 px-6 pb-8">
            <div className={`absolute inset-0 backdrop-blur-xl bg-slate-950/40 rounded-b-2xl border-b border-white/10 transition-opacity duration-400 ${menuVisible ? 'opacity-100' : 'opacity-0'}`} />
            <div className="relative z-10 flex flex-col items-center gap-5 pt-4">
              {APP_LINKS.map((l, i) => (
                <Link
                  key={l.to}
                  to={l.to}
                  style={{ transitionDelay: menuVisible ? `${350 + i * 50}ms` : '0ms' }}
                  className={`text-lg font-light tracking-[0.08em] text-white/80 hover:text-white transition-all duration-400 ${menuVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="relative z-10">
        {/* ============ HERO ============ */}
        <section className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 pt-24 pb-10">
          <div
            className="text-center max-w-3xl"
            style={{ opacity: 'calc(1 - var(--hero-p, 0) * 1.1)' as any, transform: 'translateY(calc(var(--hero-p, 0) * -90px)) scale(calc(1 - var(--hero-p, 0) * 0.06))', filter: 'blur(calc(var(--hero-p, 0) * 6px))' }}
          >
            <div className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-white/80 mb-6">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Explainable fraud defence · synthetic data
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
              Every alert has a <span className="bg-gradient-to-r from-emerald-300 to-cyan-400 bg-clip-text text-transparent">story.</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-white/75 max-w-2xl mx-auto">
              EASATA flags suspicious payments around the world, explains each one in words anyone can follow, and runs a secure "Was this you?" workflow from freeze to case.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/alerts" className="btn btn-primary !px-6 !py-3">
                Review alerts <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/simulate" className="btn btn-ghost !px-6 !py-3 backdrop-blur">
                Simulate a payment
              </Link>
            </div>
          </div>
          <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-3" style={{ opacity: 'calc(1 - var(--hero-p, 0) * 2)' as any }}>
            <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-white/70">
              {o ? (
                <>
                  <span><b className="text-white">{o.transactions.toLocaleString()}</b> payments scored</span>
                  <span><b className="text-white">{o.alerts.toLocaleString()}</b> flagged</span>
                  <span>calibrated · Brier-checked · verified reasons</span>
                </>
              ) : (
                <span className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> {overview.error ? 'Backend offline: start the API on :8000' : 'Connecting to the model…'}</span>
              )}
            </div>
            <ChevronDown className="w-5 h-5 text-white/50 animate-bounce" />
          </div>
        </section>

        {/* ============ LIVE NUMBERS ============ */}
        {o && (
          <section className="px-6 md:px-12 lg:px-16 pt-10 pb-16">
            <div className="max-w-6xl mx-auto">
              <p data-reveal className="reveal text-cyan-300 text-xs tracking-[0.2em] font-semibold">RIGHT NOW, ACROSS THE PLANET</p>
              <h2 data-reveal className="reveal text-3xl md:text-5xl font-bold tracking-tight mt-2 max-w-3xl">
                {Math.round(o.alerts_per_1000 / 10)} in 100 payments raise a flag. Only the riskiest are ever stopped.
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
                {(['BLOCK', 'HOLD', 'STEP_UP', 'PROCEED'] as const).map((k, i) => (
                  <div key={k} data-reveal className="reveal panel p-5 !bg-black/40" style={{ transitionDelay: `${i * 90}ms` }}>
                    <div className="text-[11px] tracking-[0.14em]" style={{ color: BAND_COLOR[k] }}>
                      {BAND_PLAIN[k].title.toUpperCase()}
                    </div>
                    <div className="text-3xl font-semibold mt-1">{(o.bands[k] ?? 0).toLocaleString()}</div>
                    <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full grow-bar" style={{ width: `${Math.max(1.5, ((o.bands[k] ?? 0) / o.transactions) * 100)}%`, background: BAND_COLOR[k] }} />
                    </div>
                    <div className="text-xs text-white/45 mt-2">{pct((o.bands[k] ?? 0) / o.transactions)} of payments</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============ FEATURES ============ */}
        <section className="px-6 md:px-12 lg:px-16 py-24">
          <div className="max-w-6xl mx-auto">
            <h2 data-reveal className="reveal text-3xl md:text-4xl font-bold tracking-tight">Built to be trusted, not just accurate.</h2>
            <p data-reveal className="reveal text-white/60 mt-3 max-w-2xl">
              A score on its own doesn't help an analyst or a customer. EASATA shows why a payment was flagged and what happens next, in the reader's own language.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <div key={title} data-reveal className="reveal panel p-6 !bg-black/45 hover:!bg-black/60 hover:-translate-y-1 transition-all" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 ring-1 ring-cyan-400/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-cyan-300" />
                  </div>
                  <h3 className="font-semibold mt-4">{title}</h3>
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ WORKFLOW ============ */}
        <section className="px-6 md:px-12 lg:px-16 py-24">
          <div className="max-w-6xl mx-auto">
            <h2 data-reveal className="reveal text-3xl md:text-4xl font-bold tracking-tight">From flag to case in four steps</h2>
            <div className="grid md:grid-cols-4 gap-4 mt-10 relative">
              <div className="hidden md:block absolute top-9 left-[12%] right-[12%] h-px bg-gradient-to-r from-emerald-400/0 via-cyan-400/60 to-rose-400/0" />
              {STEPS.map(([t, d], i) => (
                <div key={t} data-reveal className="reveal panel p-6 relative !bg-black/45" style={{ transitionDelay: `${i * 120}ms` }}>
                  <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-900 relative">{i + 1}</div>
                  <h3 className="text-lg font-semibold mt-3">{t}</h3>
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FINAL CTA (the planet rises here) ============ */}
        <section className="min-h-[90vh] flex items-center justify-center px-6 text-center">
          <div data-reveal className="reveal max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)]">Watch it think.</h2>
            <p className="text-white/75 mt-4 text-lg">Open the console, pick an alert, and switch between Professional and Plain English views.</p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link to="/overview" className="btn btn-primary !px-7 !py-3.5">
                Open the console <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/evaluation" className="btn btn-ghost !px-7 !py-3.5 backdrop-blur">
                See honest metrics
              </Link>
            </div>
          </div>
        </section>

        <footer className="px-6 md:px-12 lg:px-16 py-8 border-t border-white/10 text-xs text-white/50 flex flex-col sm:flex-row gap-2 justify-between bg-black/60 backdrop-blur">
          <span className="flex items-center gap-2">
            <Logo className="w-4 h-4 opacity-60" /> EASATA · Every alert has a story
          </span>
          <span>{o?.disclaimer ?? "Synthetic data. Scores mean 'flagged for review', not proof of fraud. All outcomes are simulated."}</span>
        </footer>
      </div>
    </div>
  );
}
