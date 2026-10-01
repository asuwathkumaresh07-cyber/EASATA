import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { Card, ErrorBox, Loading, Status, money, num, when } from '@/components/ui';

export default function CaseDetail() {
  const { id } = useParams();
  const { data: v, error, setData } = useApi<any>(`/api/ops/cases/${id}`);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!v) return <Loading />;
  const c = v.case;

  const act = async (path: string, body: any) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api(`/api/ops/cases/${id}/${path}`, { body });
      setData(r.case ? r : await api(`/api/ops/cases/${id}`));
      setNote('');
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/cases" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Cases
      </Link>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Case #{c.case_id}</h1>
        <Status s={c.status} />
        <Status s={v.account?.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Deadlines">
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-white/45">Zero liability</div>
              <div className={v.sla.zero_liability ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>{v.sla.zero_liability ? 'Yes: reported within 3 working days' : 'No'}</div>
            </div>
            <div>
              <div className="text-xs text-white/45">Shadow credit due</div>
              <div className={v.sla.shadow_credit_overdue ? 'text-rose-300' : ''}>{when(v.sla.shadow_credit_due)}</div>
              {v.sla.hours_to_shadow_credit_due != null && (
                <div className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> {v.sla.shadow_credit_overdue ? 'overdue' : `${Math.round(v.sla.hours_to_shadow_credit_due)} h left`}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-white/45">Resolution due</div>
              <div className={v.sla.resolution_overdue ? 'text-rose-300' : ''}>{when(v.sla.resolution_due)}</div>
              {v.sla.days_to_resolution_due != null && <div className="text-xs text-white/50">{v.sla.resolution_overdue ? 'overdue' : `${Math.round(v.sla.days_to_resolution_due)} days left`}</div>}
            </div>
            <p className="text-[11px] text-white/35">{v.sla.basis}</p>
          </div>
        </Card>

        <Card title="Disputed payment">
          {v.transaction && (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-white/45">Transaction</dt>
              <dd className="text-right"><Link className="text-cyan-300 hover:underline" to={`/alerts/${v.transaction.transaction_id}`}>{v.transaction.transaction_id}</Link></dd>
              <dt className="text-white/45">Customer</dt>
              <dd className="text-right"><Link className="hover:underline" to={`/customers/${c.customer_id}`}>{c.customer_id}</Link></dd>
              <dt className="text-white/45">Amount</dt>
              <dd className="text-right">{money(v.transaction.transaction_amount)}</dd>
              <dt className="text-white/45">Merchant</dt>
              <dd className="text-right">{v.transaction.merchant_category}</dd>
              <dt className="text-white/45">Time</dt>
              <dd className="text-right">{v.transaction.ts}</dd>
              <dt className="text-white/45">Score</dt>
              <dd className="text-right">{num(v.transaction.score)}</dd>
              <dt className="text-white/45">Notified / reported</dt>
              <dd className="text-right text-xs">{when(c.notified_at)} / {when(c.reported_at)}</dd>
            </dl>
          )}
          {c.resolution && <p className="text-sm mt-3">Resolution: {c.resolution}</p>}
        </Card>

        <Card title="Actions">
          <textarea className="field w-full h-20 resize-none" placeholder="Note (required when resolving)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2 mt-3">
            {v.allowed_transitions?.map((to: string) => (
              <button key={to} className={`btn ${to.startsWith('RESOLVED_REJECTED') ? 'btn-ghost' : 'btn-primary'} !text-xs`} disabled={busy} onClick={() => act('transition', { to, note })}>
                → {to.replace(/_/g, ' ')}
              </button>
            ))}
            <button className="btn btn-ghost !text-xs" disabled={busy || !note.trim()} onClick={() => act('notes', { note })}>
              Add note
            </button>
          </div>
          {v.allowed_transitions?.length === 0 && <p className="text-xs text-white/40 mt-2">Case closed: no further transitions.</p>}
          <div className="mt-3"><ErrorBox error={err} /></div>
        </Card>
      </div>

      <Card title="Timeline" className="mt-4">
        <ol className="relative border-l border-white/10 ml-2 space-y-5">
          {v.actions.map((a: any, i: number) => (
            <li key={i} className="ml-5">
              <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-black" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{a.action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-white/40">{a.actor} · {when(a.created_at)}</span>
              </div>
              {a.note && <p className="text-sm text-white/60 mt-0.5">{a.note}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
