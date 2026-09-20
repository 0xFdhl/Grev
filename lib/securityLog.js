import { supabaseAdmin } from './supabaseAdmin';
import { getClientIp } from './ip';
import { rateLimit } from './rateLimit';

// Jangan pernah melempar error ke caller hanya gara-gara gagal mencatat log.
export async function logSecurityEvent({ req, triggeredBy, path }) {
  try {
    const ip = getClientIp(req);
    // Batasi pencatatan per IP supaya tabel ini tidak bisa di-flood
    // (honeypot endpoint bisa dihit tanpa auth dari luar).
    if (!(await rateLimit(`seclog:${ip}`, 20, 60 * 60 * 1000))) return;

    await supabaseAdmin.from('security_logs').insert({
      ip: ip,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      path: String(path || req.url || '').slice(0, 500),
      method: String(req.method || '').slice(0, 10),
      triggered_by: triggeredBy,
    });
  } catch (_) {
    // abaikan: tabel security_logs mungkin belum dibuat di Supabase
  }
}
