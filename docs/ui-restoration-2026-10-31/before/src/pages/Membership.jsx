import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '@/api/http';
import { useAuth } from '@/lib/AuthContext';
import BottomNav from '@/components/BottomNav';
import { loadQuestionCatalogue } from '@/lib/bankAccess';
import '@/learning.css';
const usageLabels = [['toefl', 'TOEFL practices'], ['ielts', 'Full IELTS mocks'], ['ieltsQuick', 'IELTS question practices'], ['daily', 'Daily Conversation minutes'], ['ai', 'AI feedback & replies']];
const amount = (key, value) => value == null ? 'Unavailable' : key === 'daily' ? Math.round(value / 60 * 10) / 10 : value;
export default function Membership() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [note, setNote] = useState('');
  const lock = useRef(false);
  useEffect(() => { let active = true; setStatus(null); setError(''); apiJson('/api/membership', { action: 'status' }).then(value => active && setStatus(value)).catch(e => active && setError(e.message)); return () => { active = false; }; }, [user?.id, revision]);
  async function manage(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const value = await apiJson('/api/membership', { action, ...(action === 'request-upgrade' ? { note } : {}) });
      setStatus(value);
      if (action === 'trial') { await loadQuestionCatalogue(); setNotice('Your 7-day VIP trial is active. Your account benefits are ready.'); }
      else setNotice('Your request is saved. Its status will appear here after review.');
    } catch (error) { setError(error.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const vip = status?.effectivePlan === 'vip', expiry = status?.membership?.expiresAt || status?.membership?.currentPeriodEnd;
  return <main className="learning-page membership-page"><header><Link to="/">← Home</Link><Link to="/progress">My Progress</Link></header><p className="learning-kicker">Membership</p><h1>More time to speak.</h1><p className="learning-muted">Choose the room you need for TOEFL, IELTS and everyday conversations.</p>
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh membership</button></p>}
    {notice && <p role="status" className="membership-notice">{notice}</p>}
    {!status && !error && <p role="status">Loading your allowance…</p>}
    {status && <section className="membership-status"><h2>{vip ? status.membership.origin === 'trial' ? 'VIP trial active' : 'VIP active' : 'Free membership'}</h2><p>{vip ? `Available through ${new Date(expiry).toLocaleString()}. After expiry, your account returns to Free and your saved practice stays available.` : status.trialUsedAt ? 'Your VIP trial has been used. You can request VIP access below.' : 'Start with free practice or try VIP for 7 days.'}</p>{status.upgradeRequest && <p>VIP request: <strong>{status.upgradeRequest.status}</strong> · {new Date(status.upgradeRequest.createdAt).toLocaleDateString()}</p>}</section>}
    <div className="membership-plans">{['free', 'vip'].map(plan => <article key={plan} className={plan === 'vip' ? 'vip-plan' : ''}><p className="learning-kicker">{plan === 'vip' ? 'VIP' : 'Free'}</p><h2>{plan === 'vip' ? 'Build your speaking routine.' : 'Start speaking.'}</h2><ul><li>TOEFL, IELTS and Daily Conversation</li><li>Recording checks and saved practice</li><li>AI language feedback and speech analysis when available</li><li>{plan === 'vip' ? 'Extended practice allowances and learning insights' : 'Introductory monthly practice allowances'}</li></ul>
      {status && <dl className="plan-allowances">{usageLabels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{amount(key, status.plans[plan].monthlyLimits[key])} / month</dd></div>)}</dl>}
      <p className="plan-status">{status?.effectivePlan === plan ? 'Your current plan' : plan === 'vip' ? '7-day trial · no payment required' : 'Free practice'}</p>
      {plan === 'vip' && !vip && (user ? <button className="primary" disabled={busy || !status?.trialAvailable} onClick={() => manage('trial')}>{busy ? 'Updating…' : status?.trialUsedAt ? 'Trial already used' : 'Start 7-day VIP trial'}</button> : <Link className="learning-button primary" to="/auth?returnTo=%2Fmembership">Sign in to try VIP</Link>)}
    </article>)}</div>
    {status && <section className="membership-usage"><h2>Your monthly practice</h2><p className="learning-muted">Resets {new Date(status.billingPeriod.end).toLocaleString()}.{!status.paywallEnabled && ' Usage is tracked in preview; monthly limits are not currently enforced.'}</p><div className="usage-list">{usageLabels.map(([key, label]) => { const limit = status.plans[status.effectivePlan].monthlyLimits[key], used = status.usage[key] || 0; return <div key={key}><strong>{label}</strong><span>{amount(key, used)} used · {amount(key, Math.max(0, (limit || 0) - used))} remaining</span><progress aria-label={`${label} used`} max={limit || 1} value={Math.min(used, limit || 1)} /></div>; })}</div></section>}
    {user && !vip && <section className="membership-request"><h2>Request VIP access</h2><p>Request access from the site administrator. Your request stays in your account; online payments are not yet available.</p><label>Optional note<textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label><button disabled={busy || !status || status.upgradeRequest?.status === 'pending'} onClick={() => manage('request-upgrade')}>{status?.upgradeRequest?.status === 'pending' ? 'Request pending' : 'Send VIP request'}</button></section>}
    {status?.membershipHistory?.length > 0 && <details className="membership-history"><summary>Membership history</summary>{status.membershipHistory.map(event => <p key={event.id}>{event.type.replaceAll('-', ' ')} · {new Date(event.at).toLocaleString()}</p>)}</details>}
    <details className="membership-faq"><summary>Membership questions</summary><h3>Will a trial charge me?</h3><p>No. It expires after 7 days without renewal or a charge.</p><h3>Do recordings need VIP?</h3><p>Recording checks and basic feedback are available to both plans. Pronunciation assessment requires the site's speech service to be configured.</p><h3>Which question banks are included?</h3><p>VIP includes available licensed banks. Private uploaded source banks remain restricted to their owner.</p><h3>What happens when a service fails?</h3><p>Your recordings and answers stay saved. Retry feedback without starting a new practice. Your membership history and allowances remain visible here.</p></details>
    <div className="learning-actions"><Link className="learning-button primary" to="/exam">Start exam practice</Link><Link className="learning-button" to="/voice">Daily Conversation</Link></div><BottomNav />
  </main>;
}
