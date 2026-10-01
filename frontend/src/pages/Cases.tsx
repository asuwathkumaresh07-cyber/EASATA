import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { Card, ErrorBox, Loading, PageHeader, Pager, Status, when } from '@/components/ui';

const STATUSES = ['', 'OPEN', 'INVESTIGATING', 'SHADOW_CREDITED', 'RESOLVED_REFUNDED', 'RESOLVED_REJECTED'];

export default function Cases() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const nav = useNavigate();
  const { data, error, loading } = useApi<any>(`/api/ops/cases${qs({ status, page, size: 25 })}`);
  const audit = useApi<any>('/api/ops/audit?limit=30');

  const exportCsv = async () => {
    const res = await fetch('/api/ops/feedback.csv', { headers: localStorage.getItem('opsKey') ? { 'X-Ops-Key': localStorage.getItem('opsKey')! } : {} });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedback.csv';
    a.click();
  };

  return (
    <>
      <PageHeader
        title="Cases"
        sub="Disputes opened by 'Not me'. Deadlines follow the structure of the RBI framework (weekends skipped, bank holidays not)."
        right={
          <button className="btn btn-ghost" onClick={exportCsv}>
            <Download className="w-4 h-4" /> Feedback CSV
          </button>
        }
      />
      <Card
        title={
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`px-3 py-1 rounded-full text-xs ${status === s ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/60'}`}>
                {s ? s.replace(/_/g, ' ') : 'ALL'}
              </button>
            ))}
          </div>
        }
      >
        <ErrorBox error={error} />
        {loading && !data && <Loading />}
        {data && data.items.length === 0 && <p className="text-sm text-white/50">No cases yet. A customer pressing "Not me" on a "Was this you?" link opens one.</p>}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Status</th>
                    <th>Customer</th>
                    <th>Transaction</th>
                    <th>Reported</th>
                    <th>Zero liability</th>
                    <th>Shadow credit due</th>
                    <th>Resolution due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c: any) => (
                    <tr key={c.case_id} className="cursor-pointer" onClick={() => nav(`/cases/${c.case_id}`)}>
                      <td className="text-cyan-300">#{c.case_id}</td>
                      <td><Status s={c.status} /></td>
                      <td>{c.customer_id} {c.account_status === 'frozen' && <Status s="frozen" />}</td>
                      <td>{c.transaction_id}</td>
                      <td className="text-white/60">{when(c.reported_at)}</td>
                      <td>{c.sla?.zero_liability ? <span className="text-emerald-300">yes</span> : <span className="text-white/50">no</span>}</td>
                      <td className={c.sla?.shadow_credit_overdue ? 'text-rose-300' : ''}>{when(c.sla?.shadow_credit_due)}{c.sla?.shadow_credit_overdue && ' · overdue'}</td>
                      <td className={c.sla?.resolution_overdue ? 'text-rose-300' : ''}>{when(c.sla?.resolution_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={25} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Card title="Audit log (append-only)" className="mt-4">
        {audit.data?.items?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Case</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((a: any) => (
                  <tr key={a.id}>
                    <td className="text-white/50">{when(a.created_at)}</td>
                    <td><Link className="text-cyan-300" to={`/cases/${a.case_id}`}>#{a.case_id}</Link></td>
                    <td>{a.action}</td>
                    <td className="text-white/60">{a.actor}</td>
                    <td className="text-white/60 whitespace-normal">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-white/50">{audit.error ? (audit.error as Error).message : 'Empty.'}</p>
        )}
      </Card>
    </>
  );
}

