import { env } from '../env';

let offsetMs = 0;

export async function initServerTime(): Promise<void> {
  try {
    const base = (env.supabaseUrl || '').replace(/\/+$/, '');
    if (!base) return;
    const res = await fetch(`${base}/rest/v1/`, { method: 'HEAD' });
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverMs = Date.parse(dateHeader);
      if (Number.isFinite(serverMs)) offsetMs = serverMs - Date.now();
    }
  } catch {
    offsetMs = 0;
  }
}

export function refreshServerTime(): Promise<void> {
  return initServerTime();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}
