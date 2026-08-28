// Rate limiter in-memory (sliding window per key).
// Catatan: di lingkungan serverless (misal Vercel), state ini per-instance.
// Untuk multi-instance/produksi skala besar, ganti dengan @upstash/ratelimit.

const buckets = new Map();

const CLEANUP_THRESHOLD = 10000;

function cleanup(now) {
  for (const [key, entry] of buckets) {
    if (now - entry.start >= entry.windowMs) buckets.delete(key);
  }
}

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  if (buckets.size > CLEANUP_THRESHOLD) cleanup(now);

  const entry = buckets.get(key);
  if (!entry || now - entry.start >= windowMs) {
    buckets.set(key, { start: now, count: 1, windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}
