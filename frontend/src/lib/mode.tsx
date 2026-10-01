import React, { createContext, useContext, useState } from 'react';
import { Briefcase, MessageCircle } from 'lucide-react';

// Two ways to read every screen: 'pro' (analyst terms, raw numbers) and 'plain' (everyday language).
export type Mode = 'pro' | 'plain';

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: 'plain', setMode: () => {} });

function initial(): Mode {
  try {
    return (localStorage.getItem('viewMode') as Mode) || 'plain';
  } catch {
    return 'plain';
  }
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, set] = useState<Mode>(initial);
  const setMode = (m: Mode) => {
    set(m);
    try {
      localStorage.setItem('viewMode', m);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);

/** Pick the right text for the current mode. */
export function useT() {
  const { mode } = useMode();
  return <T,>(pro: T, plain: T) => (mode === 'pro' ? pro : plain);
}

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useMode();
  const opts: [Mode, string, typeof Briefcase][] = [
    ['plain', 'Plain English', MessageCircle],
    ['pro', 'Professional', Briefcase],
  ];
  return (
    <div className="liquid-glass inline-flex items-center p-1 rounded-full text-xs" role="radiogroup" aria-label="Explanation style">
      {opts.map(([m, label, Icon]) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          title={m === 'pro' ? 'Analyst view: scores, log-odds, metrics' : 'Everyday language, no jargon'}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
            mode === m ? 'bg-white text-slate-900 shadow-md font-semibold' : 'text-white/60 hover:text-white'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
