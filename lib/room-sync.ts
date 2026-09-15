export type RoomConnection = 'connecting' | 'synced' | 'retrying' | 'offline' | 'paused';
type Environment = { online: () => boolean; visible: () => boolean; later: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; cancel: (id: ReturnType<typeof setTimeout>) => void };
export function createRoomSync<T>(options: { fetch: (signal: AbortSignal) => Promise<T>; receive: (data: T) => void; status: (status: RoomConnection) => void; error: (error: unknown) => void; history?: boolean }, environment?: Environment) {
  const env: Environment = environment ?? { online: () => navigator.onLine, visible: () => document.visibilityState !== 'hidden', later: (fn, ms) => setTimeout(fn, ms), cancel: id => clearTimeout(id) };
  let stopped = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  const clear = () => { if (timer !== undefined) env.cancel(timer); timer = undefined; };
  const run = (): Promise<void> => {
    clear(); if (stopped) return Promise.resolve();
    if (!env.online() || !env.visible()) { options.status(!env.online() ? 'offline' : 'paused'); return Promise.resolve(); }
    if (pending) return pending;
    controller = new AbortController(); const current = controller;
    options.status(failures ? 'retrying' : 'connecting');
    const timeout = env.later(() => current.abort(), 15000);
    pending = Promise.resolve().then(() => options.fetch(current.signal)).then(data => {
      if (stopped) return;
      failures = 0; options.receive(data); options.status('synced');
    }).catch(error => {
      if (stopped) return;
      failures++; options.error(error); options.status(env.online() ? 'retrying' : 'offline');
    }).finally(() => {
      env.cancel(timeout); pending = undefined;
      if (!stopped && env.online() && env.visible() && (!options.history || failures))
        timer = env.later(() => { void run(); }, failures ? Math.min(60000, 4000 * 2 ** Math.min(failures, 4)) : 4000);
    });
    return pending;
  };
  return { refresh: run, resume: run, stop: () => { stopped = true; clear(); controller?.abort(); } };
}
