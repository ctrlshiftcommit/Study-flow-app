export const dayMs = 86_400_000;

export function startOfDay(date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(date = new Date()): number {
  return startOfDay(date) + dayMs - 1;
}

export function startOfWeek(date = new Date()): number {
  const d = new Date(startOfDay(date));
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function dateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(timestamp: number | string | Date): string {
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatDateTime(timestamp: number | string | Date): string {
  const d = new Date(timestamp);
  const hours = d.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${formatDate(d)}, ${hour12}:${minutes}:${seconds} ${suffix}`;
}
