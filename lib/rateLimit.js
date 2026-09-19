// Rate limiter dengan dua mode:
// 1. Upstash Redis (shared antar instance serverless) -> dipakai di produksi/Vercel
//    selama UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN terisi.
// 2. Fallback in-memory (sliding window per key) -> dev lokal, atau saat Redis
//    tidak terkonfigurasi / error. Di serverless multi-instance fallback ini
// hanya best-effort.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const CLEANUP_THRESHOLD = 10000;
const FETCH_TIMEOUT_MS = 2000;

// ---------- Fallback in-memory ----------
const buckets = new Map();

function cleanup(now) {
  for (const [key, entry] of buckets) {
    if (now - entry.start >= entry.windowMs) buckets.delete(key);
  }
}

function rateLimitMemory(key, limit, windowMs) {
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

// ---------- Upstash ----------
let redis = null;
let redisReady = false;
let redisFailedLogged = false;
const limiters = new Map();

function getRedis() {
  if (redisReady) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    redis = new Redis({
      url,
      token,
      // Abort request yang lambat supaya redirect tidak pernah menggantung gara-gara Redis.
      fetch: (input, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
      },
    });
  } catch (_) {
    redis = null;
  }
  redisReady = true;
  return redis;
}

function toDuration(ms) {
  if (ms >= 3600000 && ms % 3600000 === 0) return `${ms / 3600000} h`;
  if (ms >= 60000 && ms % 60000 === 0) return `${ms / 60000} m`;
  if (ms >= 1000 && ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

function getLimiter(limit, windowMs) {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, toDuration(windowMs)),
      prefix: 'reviu-rl',
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Return true jika request boleh lewat, false jika melewati batas.
 * `key` sebaiknya mengandung konteks + IP, misal `login:1.2.3.4`.
 */
export async function rateLimit(key, limit, windowMs) {
  const client = getRedis();
  if (!client) return rateLimitMemory(key, limit, windowMs);

  try {
    const { success } = await getLimiter(limit, windowMs).limit(key);
    return success;
  } catch (err) {
    if (!redisFailedLogged) {
      redisFailedLogged = true;
      console.error('[rateLimit] Upstash gagal, fallback ke in-memory:', err?.message || err);
    }
    return rateLimitMemory(key, limit, windowMs);
  }
}
