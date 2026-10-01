import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { useMode } from '@/lib/mode';
import { BAND_PLAIN } from '@/lib/labels';
import { BAND_COLOR, Band, Card, ErrorBox, Loading, PageHeader, Pager, Status, money, num } from '@/components/ui';

const STATUSES = ['ALL', 'NEW', 'NOTIFIED', 'CONFIRMED_NOT_ME', 'CONFIRMED_LEGIT'];
const SORTS = [
  ['expected_loss', 'Expected loss'],
  ['score', 'Score'],
  ['amount', 'Amount'],
  ['ts', 'Time'],
];

export default function Alerts() {
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('expected_loss');
  const [page, setPage] = useState(1);
  const [lookup, setLookup] = useState('');
  const nav = useNavigate();
  const plain = useMode().mode === 'plain';
  const size = 25;
  const { data, error, loading } = useApi<any>(`/api/alerts${qs({ status, sort, page, size })}`);

  return (
    <>
      <PageHeader
        title={plain ? 'Suspicious payments to review' : 'Alerts queue'}
        sub={plain ? 'The ones with the most money at risk are at the top.' : 'Sorted by expected loss (probability × amount) so the costliest risks come first.'}
        right={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = lookup.trim().toUpperCase();
              if (v.startsWith('CUST')) nav(`/customers/${v}`);
              else if (v) nav(`/alerts/${v}`);
            }}
          >
            <input className="field w-60" placeholder="TXN… or CUST… id" value={lookup} onChange={(e) => setLookup(e.target.value)} />
            <button className="btn btn-ghost">Open</button>
          </form>
        }
      />
      <Card
        title={
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${status === s ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/60 hover:text-white'}`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        }
        right={
          <select className="field !py-1 text-xs" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>Sort: {l}</option>
            ))}
          </select>
        }
      >
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          data && (
            <>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Customer</th>
                      <th>Time</th>
                      <th>Merchant</th>
                      <th>Where</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">{plain ? 'Fraud chance' : 'Score'}</th>
                      <th className="text-right">{plain ? 'Unusual (/100)' : 'Anomaly %ile'}</th>
                      <th className="text-right">{plain ? 'Money at risk' : 'Exp. loss'}</th>
                      <th>{plain ? 'Action' : 'Band'}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className={loading ? 'opacity-50' : ''}>
                    {data.items.map((a: any) => (
                      <tr key={a.transaction_id} className="cursor-pointer" onClick={() => nav(`/alerts/${a.transaction_id}`)}>
                        <td className="text-cyan-300">{a.transaction_id}</td>
                        <td>
                          <Link onClick={(e) => e.stopPropagation()} className="hover:underline text-white/80" to={`/customers/${a.customer_id}`}>
                            {a.customer_id}
                          </Link>
                          {a.account_status === 'frozen' && <span className="ml-1.5"><Status s="frozen" /></span>}
                        </td>
                        <td className="text-white/50">{a.ts}</td>
                        <td>{a.merchant_category}</td>
                        <td className="text-white/60">{a.city}, {a.country}</td>
                        <td className="text-right">{money(a.transaction_amount)}</td>
                        <td className="text-right">{plain ? `${Math.round(a.score * 100)}%` : num(a.score)}</td>
                        <td className="text-right text-white/60">{a.anomaly_pct?.toFixed(0)}</td>
                        <td className="text-right font-medium">{money(a.expected_loss)}</td>
                        <td>{plain ? <span className="text-xs font-medium" style={{ color: BAND_COLOR[a.band] }}>{BAND_PLAIN[a.band].title}</span> : <Band band={a.band} />}</td>
                        <td><Status s={a.alert_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} size={size} total={data.total} onPage={setPage} />
            </>
          )
        )}
      </Card>
    </>
  );
}
