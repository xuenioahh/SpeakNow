import { apiFetch } from "@/api/http";
import { useEffect, useState } from 'react';

export default function ExpressionConnection() {
  const [service, setService] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    apiFetch('/api/expression-service', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(value => { if (typeof value.available === 'boolean') setService(value); else setService({ unknown: true }); })
      .catch(() => { if (!controller.signal.aborted) setService({ unknown: true }); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);
  return <div className="expression-connection"><span className="expression-connection-dot" /><p className="expression-small">Movement review runs on your device. {service?.available
    ? `Optional reflection: ${service.providers?.map(p => p.provider).join(' → ')} configured; connection is checked when you request questions.`
    : service?.available === false ? 'AI reflection is not connected yet. You can still record, review and practise.'
      : 'AI reflection availability will be checked when you request questions.'}</p></div>;
}
