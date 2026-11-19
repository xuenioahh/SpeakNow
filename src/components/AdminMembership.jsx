import { useEffect, useState } from 'react';
import { proTerms } from '../../shared/proTerms';
import { apiJson } from '@/api/http';
export default function AdminMembership({ userId }) {
  const [value, setValue] = useState(null), [days, setDays] = useState(30), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setValue(null); setError('');
    apiJson('/api/membership', { action: 'admin-status', userId }, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setValue(result); setDays(result.upgradeRequest?.status === 'pending' ? result.upgradeRequest.termDays || 30 : 30); } }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [userId]);
  async function act(action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await apiJson('/api/membership', { action, userId, days, ...(value?.upgradeRequest?.status === 'pending' ? { requestId: value.upgradeRequest.id } : {}) }); setValue(await apiJson('/api/membership', { action: 'admin-status', userId })); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-membership"><h3>VIP membership</h3>
    {error && <p role="alert">{error}</p>}
    {value ? <><p>{value.membership?.planType === 'vip' && Date.parse(value.membership.expiresAt) > Date.now() ? `VIP until ${new Date(value.membership.expiresAt).toLocaleString()}` : 'Free membership'}</p>
      {value.upgradeRequest && <p>Request: {value.upgradeRequest.status} · {value.upgradeRequest.requestType || 'vip-access'} · {value.upgradeRequest.paymentStatus || 'no payment record'} {value.upgradeRequest.termDays && `· ${value.upgradeRequest.termDays} days · ¥${value.upgradeRequest.priceCny}`} {value.upgradeRequest.note && `· ${value.upgradeRequest.note}`}</p>}
      <label>Add VIP days (preserves remaining active days) <select disabled={Boolean(value.upgradeRequest?.status === 'pending' && value.upgradeRequest.termDays)} value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7 days</option>{proTerms.map(term => <option key={term.days} value={term.days}>{term.days} days · ¥{term.priceCny}</option>)}</select></label>
      <div className="learning-actions"><button disabled={busy} onClick={() => act('admin-grant')}>Grant VIP access</button><button disabled={busy} onClick={() => act('admin-revoke')}>Return to Free</button>{value.upgradeRequest?.status === 'pending' && <button disabled={busy} onClick={() => act('admin-decline')}>Decline request</button>}</div>
      <details><summary>Membership audit history</summary>{value.history.map(event => <p key={event.id}>{event.type} · {new Date(event.at).toLocaleString()}</p>)}</details></> : !error && <p role="status">Loading membership…</p>}
  </section>;
}
