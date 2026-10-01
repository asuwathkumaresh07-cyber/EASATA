import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { qs } from '@/lib/api';
import { Card, ErrorBox, Loading, PageHeader, when } from '@/components/ui';

// Turn the absolute /respond link in an email into an in-app link, whatever host PUBLIC_URL points at.
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+\/respond\?token=[\w-]+)/g);
  return (
    <p className="text-sm text-white/75 whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        const m = p.match(/\/respond\?token=([\w-]+)/);
        return m ? (
          <Link key={i} to={`/respond?token=${m[1]}`} className="text-cyan-300 underline break-all">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

export default function Inbox() {
  const [params, setParams] = useSearchParams();
  const [channel, setChannel] = useState<string>('');
  const customer = params.get('customer_id') ?? '';
  const { data, error, loading, reload } = useApi<any>(`/api/demo/inbox${qs({ channel, customer_id: customer, limit: 100 })}`);

  return (
    <>
      <PageHeader
        title="Demo inbox"
        sub="Every email and SMS the system sent. A real bank has no such page: this lets the demo run without a phone or mail server."
        right={
          <button className="btn btn-ghost" onClick={reload}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {[
          ['', 'All'],
          ['email', 'Email'],
          ['sms', 'SMS'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setChannel(v)} className={`px-3 py-1 rounded-full text-xs ${channel === v ? 'bg-white text-slate-900 font-semibold' : 'bg-white/5 text-white/60'}`}>
            {l}
          </button>
        ))}
        {customer && (
          <button className="px-3 py-1 rounded-full text-xs bg-cyan-500/15 text-cyan-200" onClick={() => setParams({})}>
            {customer} ✕
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {!data && loading && <Loading />}
      {data && data.items.length === 0 && (
        <Card>
          <p className="text-sm text-white/50">
            Nothing sent yet. Open an alert and press <b>Send "Was this you?"</b>, or commit a risky payment in <Link className="underline" to="/simulate">Simulate</Link>.
          </p>
        </Card>
      )}
      <div className="space-y-3">
        {data?.items.map((m: any) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50 mb-2">
              {m.channel === 'email' ? <Mail className="w-4 h-4 text-cyan-300" /> : <MessageSquare className="w-4 h-4 text-emerald-300" />}
              <span className="uppercase tracking-wide">{m.channel}</span>
              <span>to {m.recipient}</span>
              {m.customer_id && <Link className="hover:underline" to={`/customers/${m.customer_id}`}>{m.customer_id}</Link>}
              <span>· {m.delivery}</span>
              <span className="ml-auto">{when(m.created_at)}</span>
            </div>
            {m.subject && <div className="font-semibold mb-2">{m.subject}</div>}
            <Body text={m.body} />
          </Card>
        ))}
      </div>
    </>
  );
}
