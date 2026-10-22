// Serialize the existing read operation and suppress obsolete/unmounted results.
// No API, stored data or sort/filter semantics are added here.
export function createLatestResource({ load, onStart = () => {}, onValue, onError = (_error) => {}, onEnd = () => {} }) {
  let disposed = false, pending = null, queued = false, version = 0;
  async function refresh() {
    if (disposed) return;
    if (pending) { queued = true; version++; return pending; }
    const generation = ++version;
    onStart();
    let finish = () => {};
    pending = new Promise(resolve => { finish = () => resolve(undefined); });
    const operation = pending;
    try {
      const value = await load();
      if (!disposed && generation === version) onValue(value);
    } catch (error) {
      if (!disposed && generation === version) onError(error);
    } finally {
      pending = null;
      if (!disposed && queued) { queued = false; void refresh(); }
      else if (!disposed) onEnd();
      finish();
    }
    return operation;
  }
  return { refresh, dispose() { disposed = true; queued = false; version++; } };
}
