// Ollama reports sizes in decimal units, so we match it — a reader comparing
// the table against `ollama ps` should see the same number, not a GiB variant.
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';

  const exponent = Math.min(
    Math.floor(Math.log10(Math.abs(bytes)) / 3),
    UNITS.length - 1
  );
  if (exponent === 0) return `${bytes} B`;

  return `${(bytes / 1000 ** exponent).toFixed(1)} ${UNITS[exponent]}`;
}

export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${Math.round(value)}%`;
}

export function formatBar(value, width) {
  const pct = value === null || value === undefined || Number.isNaN(value) ? 0 : value;
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
