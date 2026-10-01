import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Snowflake, Trash2 } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Card, ErrorBox, Loading, Notice, PageHeader, Stat, Status, money, num, when } from '@/components/ui';

export default function Customer() {
  const { id } = useParams();
  const { data: d, error, reload } = useApi<any>(`/api/customers/${id}`);
  const [otpSent, setOtpSent] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [msg, setMsg] = useState('');

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const p = d.profile;

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <>
      <PageHeader title={d.customer_id} sub={<span className="flex items-center gap-2">Account <Status s={d.account.status} /> {d.account.frozen_reason && <span>· {d.account.frozen_reason}</span>}</span>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Age" value={p.customer_age} />
        <Stat label="Credit score" value={p.credit_score} />
        <Stat label="Account age" value={`${p.account_age_years} y`} />
        <Stat label="Balance" value={money(p.account_balance)} />
        <Stat label="Txns / month" value={p.transaction_freq_monthly} />
      </div>

      <div className="space-y-3 mt-4">
        <ErrorBox error={err} />
        {msg && <Notice>{msg}</Notice>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {d.account.status === 'frozen' && (
          <Card title={<span className="flex items-center gap-2"><Snowflake className="w-4 h-4 text-cyan-300" /> Unfreeze (customer, needs OTP)</span>}>
            <p className="text-sm text-white/60">Frozen {when(d.account.frozen_at)}. Unfreezing needs a code sent to the registered phone.</p>
            {!otpSent ? (
              <button className="btn btn-primary mt-4" onClick={() => run(async () => setOtpSent(await api(`/api/customers/${id}/unfreeze/start`, { method: 'POST' })))}>
                Send code
              </button>
            ) : (
              <div className="flex gap-2 mt-4">
                <input className="field w-40 tracking-[0.3em] text-center" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
                <button
                  className="btn btn-primary"
                  disabled={otp.length !== 6}
                  onClick={() =>
                    run(async () => {
                      await api(`/api/customers/${id}/unfreeze/confirm`, { body: { otp } });
                      setOtpSent(null);
                      setOtp('');
                      setMsg('Account unfrozen (simulated).');
                      reload();
                    })
                  }
                >
                  Unfreeze
                </button>
                <Link className="btn btn-ghost" to={`/inbox?customer_id=${id}`}>SMS inbox</Link>
              </div>
            )}
          </Card>
        )}

        <Card title="Trusted patterns">
          {d.trusted_patterns.length === 0 ? (
            <p className="text-sm text-white/50">None. They are created when the customer confirms "It was me" with an OTP.</p>
          ) : (
            <ul className="space-y-2">
              {d.trusted_patterns.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {t.description} <span className="text-xs text-white/40">until {when(t.expires_at)}</span>
                  </span>
                  <button
                    className="btn btn-ghost !py-1 !px-2"
                    title="Revoke"
                    onClick={() =>
                      run(async () => {
                        await api(`/api/customers/${id}/trusted-patterns/${t.id}`, { method: 'DELETE' });
                        setMsg('Pattern revoked.');
                        reload();
                      })
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Cases & feedback">
          {d.cases.length === 0 && d.feedback.length === 0 && <p className="text-sm text-white/50">None.</p>}
          {d.cases.map((c: any) => (
            <div key={c.case_id} className="text-sm flex gap-2 items-center mb-1.5">
              <Link to={`/cases/${c.case_id}`} className="text-cyan-300">#{c.case_id}</Link> <Status s={c.status} /> <span className="text-white/50">{c.transaction_id}</span>
            </div>
          ))}
          {d.feedback.map((f: any, i: number) => (
            <div key={i} className="text-xs text-white/50">
              feedback: {f.label ?? f.kind ?? JSON.stringify(f)} · {f.transaction_id} · {when(f.created_at)}
            </div>
          ))}
        </Card>
      </div>

      <Card title="History" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Time</th>
                <th>Merchant</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Score</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.history.transactions.map((t: any) => (
                <tr key={t.transaction_id}>
                  <td><Link className="text-cyan-300 hover:underline" to={`/alerts/${t.transaction_id}`}>{t.transaction_id}</Link></td>
                  <td className="text-white/50">{t.ts}</td>
                  <td>{t.merchant_category}</td>
                  <td className="text-right">{money(t.transaction_amount)}</td>
                  <td className={`text-right ${t.alert ? 'text-orange-300' : ''}`}>{num(t.score)}</td>
                  <td className="text-white/50">{t.source}</td>
                  <td className="text-white/50">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
