import { useEffect, useState } from 'react';
import { apiJson } from '@/api/http';
const integer = value => Number(value || 0).toLocaleString();
const money = value => `¥${Number(value || 0).toFixed(6)}`;
export default function AccountUsage({ userId }) {
  const [report, setReport] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError('');
    apiJson('/api/membership', { action: 'usage' }, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setReport(value); }).catch(issue => { if (!controller.signal.aborted) setError(issue.message); });
    return () => controller.abort();
  }, [userId, revision]);
  return <section className="membership-usage" aria-label="Actual token usage"><h2>Your actual token usage</h2><p className="learning-muted">Current calendar month · provider receipts, not a prepaid balance.</p>
    <button onClick={() => setRevision(value => value + 1)}>Refresh token usage</button>
    {error ? <p role="alert">{error}</p> : !report ? <p role="status">Loading token receipts…</p> : <>
      <dl className="plan-allowances"><div><dt>Input / output tokens</dt><dd>{integer(report.total.inputTokens)} / {integer(report.total.outputTokens)}</dd></div><div><dt>Cached / uncached input</dt><dd>{integer(report.total.cacheHitTokens)} / {integer(report.total.cacheMissTokens)}</dd></div><div><dt>Usage receipts / provider calls</dt><dd>{report.total.reportedCalls} / {report.total.providerRequests}</dd></div><div><dt>Estimated model cost</dt><dd>{report.total.reportedCalls ? `${money(report.total.estimatedCnyLow)}–${money(report.total.estimatedCnyHigh)}` : 'No receipts yet'}</dd></div></dl>
      <p>{report.basis}</p><p>{report.total.missingUsageCalls} calls without receipts · {report.total.unpricedCalls} unpriced calls · {report.total.unknownCacheInputTokens} input tokens without a cache split · {report.fixturesExcluded} fixture runs excluded.</p>
      <details><summary>Models and calculation</summary>{Object.entries(report.models).map(([model, row]) => <p key={model}><strong>{model}</strong> · {integer(row.inputTokens)} input + {integer(row.outputTokens)} output · {money(row.estimatedCnyLow)}–{money(row.estimatedCnyHigh)} (priced portion)</p>)}<p>Cost = (cached input × cache-hit rate + uncached input × cache-miss rate + output × output rate) / 1,000,000. Missing cache splits produce a wider range. Failed calls with receipts still incur model cost; replaying a cached result does not create a new provider receipt.</p><p><a href={report.prices.deepseekSource} target="_blank" rel="noreferrer">DeepSeek rates</a> checked {report.prices.checkedAt}; peak/off-peak range, not a billing statement. {report.undatedOperations} historical operations have no usable date.</p></details>
    </>}
  </section>;
}
