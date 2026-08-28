import { supabaseAdmin } from './supabaseAdmin';
import { getClientIp } from './ip';

// Jangan pernah melempar error ke caller hanya gara-gara gagal mencatat log.
export async function logSecurityEvent({ req, triggeredBy, path }) {
  try {
    await supabaseAdmin.from('security_logs').insert({
      ip: getClientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      path: String(path || req.url || '').slice(0, 500),
      method: String(req.method || '').slice(0, 10),
      triggered_by: triggeredBy,
    });
  } catch (_) {
    // abaikan: tabel security_logs mungkin belum dibuat di Supabase
  }
}
