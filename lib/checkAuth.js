import { createHash, timingSafeEqual } from 'crypto';

// Cek header Authorization sederhana berdasarkan ADMIN_PASSWORD di .env
// Ini proteksi dasar, cukup buat penggunaan personal/small-scale.
// Untuk skala lebih besar/tim, sebaiknya upgrade ke Supabase Auth.

export function checkAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || !token) return false;

  // Hash dulu supaya panjangnya seragam, lalu bandingkan timing-safe
  // (mencegah kebocoran password byte-per-byte lewat perbedaan waktu respon)
  const tokenHash = createHash('sha256').update(token).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(tokenHash, expectedHash);
}
