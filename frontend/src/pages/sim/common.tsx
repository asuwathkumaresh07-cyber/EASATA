import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send, X } from 'lucide-react';
import { EMAIL_TO, MAX_POINTS, THRESHOLD, alertsOf, byAlert, copyText, emailFor, first, inr, nm, openDraft, useSim, type Tx } from '@/lib/easata';
import { mailStatus, sendAlert, type MailStatus, type SendResult } from '@/lib/easataMail';

export const RED = '#f43f5e';
export const GREEN = '#22c55e';

export function ScoreBar({ score, thr = THRESHOLD, big = false }: { score: number; thr?: number; big?: boolean }) {
  const color = score >= thr ? RED : GREEN;
  return (
    <div className="flex items-center gap-2 min-w-[140px]" title={`Score ${score} (alert line ${thr})`}>
      <b className="tabular-nums w-8 text-right" style={{ color }}>
        {score}
      </b>
      <div className={`relative flex-1 rounded-full bg-white/10 ${big ? 'h-3' : 'h-2'}`}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (score / MAX_POINTS) * 100)}%`, background: color }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-white/80" style={{ left: `${(thr / MAX_POINTS) * 100}%` }} />
      </div>
    </div>
  );
}

export function TxLabel({ t }: { t: Pick<Tx, 'flagged'> }) {
  return t.flagged ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Flagged
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cleared
    </span>
  );
}

/* ---------------- email set-up state (shared) ---------------- */
export function useMailStatus() {
  const [s, setS] = useState<MailStatus | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    mailStatus().then(setS).catch(() => setErr(true));
  }, []);
  return { status: s, unreachable: err };
}

/** Explains, step by step, how to switch on real email delivery (shown only when it is off). */
export function EmailSetupNotice({ status, unreachable }: { status: MailStatus | null; unreachable: boolean }) {
  if (!unreachable && (!status || status.configured)) return null;
  return (
    <div className="rounded-2xl p-4 bg-amber-500/10 ring-1 ring-amber-400/30 text-sm">
      <div className="flex items-center gap-2 font-semibold text-amber-200">
        <AlertTriangle className="w-4 h-4" /> Emails can't be delivered yet
      </div>
      <p className="text-white/75 mt-1">{unreachable ? 'The backend is not running, so EASATA cannot send email. Start it on port 8000.' : status?.problem}</p>
      {!unreachable && (
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-white/70">
          <li>
            In your Google account, turn on 2-Step Verification, then create an <b>app password</b> (Google Account → Security → App passwords).
          </li>
          <li>
            In <code className="text-cyan-200">backend/.env</code>, set:
            <pre className="mt-1 rounded-lg bg-black/40 p-2 text-xs text-white/85 overflow-x-auto">{`SMTP_ENABLED=1
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_STARTTLS=1
SMTP_USER=your.address@gmail.com
SMTP_PASSWORD=your-16-letter-app-password`}</pre>
          </li>
          <li>Restart the backend. Alerts will then arrive at {status?.to ?? EMAIL_TO}.</li>
        </ol>
      )}
    </div>
  );
}

/* ---------------- toast + email modals (one provider for the whole section) ---------------- */
type Ctx = { toast: (m: string) => void; sendOne: (n: number) => void; sendAll: () => void };
const SimUi = createContext<Ctx>({ toast: () => {}, sendOne: () => {}, sendAll: () => {} });
export const useSimUi = () => useContext(SimUi);

let toastTimer = 0;
export function SimUiProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<{ kind: 'one'; n: number } | { kind: 'all' } | null>(null);
  const toast = (m: string) => {
    setMsg(m);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setMsg(''), 3500);
  };
  return (
    <SimUi.Provider value={{ toast, sendOne: (n) => setModal({ kind: 'one', n }), sendAll: () => setModal({ kind: 'all' }) }}>
      {children}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4 sim-page" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="glass !bg-[#0b0f17]/95 w-full max-w-3xl max-h-[90vh] flex flex-col" role="dialog" aria-modal="true">
            {modal.kind === 'one' ? <SendOne n={modal.n} close={() => setModal(null)} toast={toast} /> : <SendAll close={() => setModal(null)} toast={toast} />}
          </div>
        </div>
      )}
      <div
        role="status"
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl bg-white text-slate-900 text-sm font-semibold shadow-xl transition-all duration-300 ${msg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
      >
        {msg}
      </div>
    </SimUi.Provider>
  );
}

function Head({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={close} aria-label="Close">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ResultLine({ r }: { r: SendResult }) {
  return r.sent ? (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2 bg-emerald-500/10 ring-1 ring-emerald-400/30 text-emerald-200 text-sm">
      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {r.detail} Check the inbox (and the Spam folder the first time).
    </div>
  ) : (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2 bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200 text-sm">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Not sent: {r.detail}
    </div>
  );
}

function SendOne({ n, close, toast }: { n: number; close: () => void; toast: (m: string) => void }) {
  const { sim, status } = useSim();
  const mail = useMailStatus();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SendResult | null>(null);
  const t = byAlert(sim, n)!;
  const st = status[n] ?? 'new';
  const { subject, body } = emailFor(sim, t, st);
  const sendNow = async () => {
    setBusy(true);
    const r = await sendAlert(sim, t, st);
    setRes(r);
    setBusy(false);
    toast(r.sent ? `Alert #${n} emailed to ${r.to}.` : 'The email was not sent. See the message in the window.');
  };
  const draft = async (kind: 'gmail' | 'mailto') => toast(await openDraft(kind, subject, body));
  return (
    <>
      <Head title={`Email Alert #${n}`} close={close} />
      <div className="px-5 py-4 overflow-auto scroll-thin space-y-3">
        <EmailSetupNotice {...mail} />
        {res && <ResultLine r={res} />}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-white/50">To</dt>
          <dd>{mail.status?.to ?? EMAIL_TO}</dd>
          <dt className="text-white/50">Subject</dt>
          <dd className="font-semibold">{subject}</dd>
        </dl>
        <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-white/[0.04] rounded-xl p-3 max-h-[38vh] overflow-auto font-mono text-white/80 scroll-thin">{body}</pre>
      </div>
      <div className="px-5 py-3 border-t border-white/10 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={sendNow}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {busy ? 'Sending…' : 'Send now'}
        </button>
        <span className="text-xs text-white/40 mx-1">or write it yourself:</span>
        <button className="btn btn-ghost !text-xs" onClick={() => draft('gmail')}>
          Gmail draft
        </button>
        <button className="btn btn-ghost !text-xs" onClick={() => draft('mailto')}>
          Email app draft
        </button>
        <button className="btn btn-ghost !text-xs" onClick={async () => toast((await copyText(`Subject: ${subject}\n\n${body}`)) ? 'Email text copied.' : 'Could not copy.')}>
          Copy text
        </button>
      </div>
    </>
  );
}

function SendAll({ close, toast }: { close: () => void; toast: (m: string) => void }) {
  const { sim, status, emailed } = useSim();
  const mail = useMailStatus();
  const list = alertsOf(sim);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<number, SendResult>>({});
  const unsent = list.filter((t) => !emailed[t.alertNo!]);

  const sendList = async (items: Tx[]) => {
    setBusy(true);
    for (const t of items) {
      const r = await sendAlert(sim, t, status[t.alertNo!] ?? 'new');
      setDone((d) => ({ ...d, [t.alertNo!]: r }));
      if (!r.sent) {
        toast('Sending stopped: ' + r.detail);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    toast(`${items.length} alert email${items.length === 1 ? '' : 's'} sent.`);
  };

  return (
    <>
      <Head title="Send all alerts by email" close={close} />
      <div className="px-5 py-4 overflow-auto scroll-thin space-y-3">
        <EmailSetupNotice {...mail} />
        <p className="text-sm text-white/70">
          Each alert is sent as its own email to <b className="text-white">{mail.status?.to ?? EMAIL_TO}</b>, with the full explanation and incident report.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy || !unsent.length} onClick={() => sendList(unsent)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {unsent.length ? `Send ${unsent.length} unsent alert${unsent.length === 1 ? '' : 's'}` : 'All alerts already sent'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => sendList(list)}>
            Send all {list.length} again
          </button>
        </div>
        <div className="divide-y divide-white/10">
          {list.map((t) => {
            const r = done[t.alertNo!];
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  <b>#{t.alertNo}</b> · {inr(t.amount)} · {first(t.from)} → {nm(t.to)} · score {t.score}
                </span>
                <span className="text-xs">
                  {r ? (r.sent ? <span className="text-emerald-300">Sent ✓</span> : <span className="text-rose-300">Not sent</span>) : emailed[t.alertNo!] ? <span className="text-emerald-300/70">Sent earlier</span> : <span className="text-white/40">Not sent yet</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function Section({ id, n, title, children }: { id?: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass p-5 md:p-7 scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-bold bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-900 shadow-[0_0_20px_-4px_rgba(34,211,238,0.6)]">{n}</span>
        <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

