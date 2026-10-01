import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert, ShieldCheck, Snowflake } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ErrorBox, Loading, money, when } from '@/components/ui';
import { Logo } from '@/components/Logo';

// Customer page opened from the "Was this you?" email.
// Loading it never changes anything (email scanners pre-open links): only button clicks POST.
export default function Respond() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'choose' | 'otp' | 'done_me' | 'done_notme'>('choose');
  const [otpInfo, setOtpInfo] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    api('/api/respond/info', { body: { token } }).then(setInfo).catch(setErr);
  }, [token]);

  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const notMe = () =>
    call(async () => {
      setResult(await api('/api/respond/not-me', { body: { token } }));
      setStep('done_notme');
    });
  const wasMeStart = () =>
    call(async () => {
      setOtpInfo(await api('/api/respond/was-me/start', { body: { token } }));
      setStep('otp');
    });
  const wasMeConfirm = () =>
    call(async () => {
      const r = await api<any>('/api/respond/was-me/confirm', { body: { token, otp: otp.trim() } });
      if (r.confirmed) {
        setResult(r);
        setStep('done_me');
      } else {
        throw new Error(`Wrong code. ${r.attempts_left} attempt(s) left.`);
      }
    });

  const t = info?.transaction;
  const unusable = info && !info.link_usable;
  const fatal = err instanceof ApiError && ['invalid_token', 'link_used', 'link_expired', 'alert_already_resolved'].includes(err.code);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-black text-white flex flex-col items-center px-4 py-10">
      <div className="flex items-center gap-2.5 mb-8">
        <Logo className="w-7 h-7" /> <span className="font-bold tracking-wider">EASATA</span> <span className="text-xs text-white/40">Bank security</span>
      </div>
      <div className="panel w-full max-w-lg p-6 md:p-8">
        {!token && <p className="text-white/70">This page needs the link from your email.</p>}
        {token && !info && !err && <Loading />}
        {(fatal || (!info && err)) && (
          <div className="space-y-4">
            <ErrorBox error={err} />
            <p className="text-sm text-white/60">For your safety, contact the bank through its official app or the number on your card.</p>
          </div>
        )}

        {info && step === 'choose' && (
          <>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-orange-300" /> Was this you?
            </h1>
            <p className="text-sm text-white/70 mt-3">{info.message}</p>
            {t && (
              <dl className="grid grid-cols-2 gap-y-2 text-sm mt-5 bg-white/[0.03] rounded-xl p-4">
                <dt className="text-white/45">Amount</dt>
                <dd className="text-right font-semibold">{money(t.transaction_amount)}</dd>
                <dt className="text-white/45">Merchant</dt>
                <dd className="text-right">{t.merchant_category}</dd>
                <dt className="text-white/45">Where</dt>
                <dd className="text-right">{t.city}, {t.country}</dd>
                <dt className="text-white/45">When</dt>
                <dd className="text-right">{t.ts}</dd>
              </dl>
            )}
            {unusable ? (
              <div className="mt-6 text-sm text-amber-200 bg-amber-500/10 ring-1 ring-amber-400/30 rounded-xl p-4">
                This link {info.expired ? 'has expired' : info.used ? 'has already been used' : 'can no longer be used'} (status: {info.alert_status}).
                Please contact the bank through its official app.
                {info.case && <div className="mt-2 text-white/70">Case #{info.case.case_id} is {info.case.status}.</div>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button className="btn btn-danger justify-center !py-3" disabled={busy} onClick={notMe}>
                    Not me
                  </button>
                  <button className="btn btn-ghost justify-center !py-3" disabled={busy} onClick={wasMeStart}>
                    It was me
                  </button>
                </div>
                <p className="text-[11px] text-white/40 mt-3">
                  "Not me" freezes your account at once. "It was me" needs a code sent to your phone. We will never ask for your password, PIN or card number.
                </p>
                <p className="text-[11px] text-white/30 mt-1">Link expires {when(info.expires_at)}.</p>
              </>
            )}
            {err && !fatal && <div className="mt-4"><ErrorBox error={err} /></div>}
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="text-xl font-semibold">Enter the code from your phone</h1>
            <p className="text-sm text-white/60 mt-2">
              We sent a 6-digit code by {otpInfo?.channel?.toUpperCase()} to {otpInfo?.to}. It expires {when(otpInfo?.expires_at)}.
            </p>
            <input
              className="field w-full text-center text-2xl tracking-[0.5em] mt-5 !py-3"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn btn-primary w-full justify-center mt-4 !py-3" disabled={busy || otp.length !== 6} onClick={wasMeConfirm}>
              Confirm
            </button>
            <p className="text-[11px] text-white/40 mt-3">
              Demo: the SMS is in the <Link to="/inbox" className="underline" target="_blank">demo inbox</Link>.
            </p>
            {err && <div className="mt-4"><ErrorBox error={err} /></div>}
          </>
        )}

        {step === 'done_me' && (
          <>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-300" /> Thanks, payment confirmed
            </h1>
            {result?.trusted_pattern && (
              <p className="text-sm text-white/70 mt-3">
                We'll remember this kind of payment ({result.trusted_pattern.description}) until {when(result.trusted_pattern.expires_at)}. {result.trusted_pattern.effect}
              </p>
            )}
          </>
        )}

        {step === 'done_notme' && result && (
          <>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Snowflake className="w-5 h-5 text-cyan-300" /> Your account is frozen (simulated)
            </h1>
            <p className="text-sm text-white/70 mt-3">
              We blocked outgoing payments, signed out all sessions and opened case <b>#{result.case?.case_id}</b>. You'll need to reset your credentials.
            </p>
            {result.sla && (
              <ul className="text-sm text-white/70 mt-4 space-y-1.5">
                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300 mt-0.5" /> {result.sla.zero_liability ? 'Reported in time: zero liability applies.' : 'Reported after the zero-liability window.'}</li>
                <li>Temporary (shadow) credit by {when(result.sla.shadow_credit_due)}</li>
                <li>Resolution by {when(result.sla.resolution_due)}</li>
              </ul>
            )}
            {result.idempotent_replay && <p className="text-xs text-white/40 mt-3">(Already reported: nothing was done twice.)</p>}
          </>
        )}
      </div>
      <p className="text-[11px] text-white/30 mt-6 max-w-lg text-center">Synthetic data. All outcomes are simulated.</p>
    </div>
  );
}
