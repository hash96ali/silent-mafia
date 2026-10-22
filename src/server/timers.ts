// Keyed one-shot timers, so rescheduling a key always replaces the old timer.
// Keys look like "phase:ABCD" or "host:ABCD".

const timers = new Map<string, NodeJS.Timeout>();

export function scheduleAt(key: string, at: number, fn: () => void): void {
  cancel(key);
  const t = setTimeout(
    () => {
      timers.delete(key);
      fn();
    },
    Math.max(0, at - Date.now()),
  );
  timers.set(key, t);
}

export function cancel(key: string): void {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
}

export function cancelRoom(code: string): void {
  for (const key of [...timers.keys()]) if (key.endsWith(`:${code}`)) cancel(key);
}
