import bcrypt from 'bcryptjs';
import { rateLimit } from '../../lib/rateLimit';
import { setSessionCookie } from '../../lib/session';
import { getClientIp } from '../../lib/ip';
import { logSecurityEvent } from '../../lib/securityLog';

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;
let configErrorLogged = false;

async function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string' || password.length === 0) {
    return false;
  }

  if (!BCRYPT_RE.test(expected)) {
    if (!configErrorLogged) {
      configErrorLogged = true;
      console.error(
        '[login] ADMIN_PASSWORD belum berupa hash bcrypt — generate dengan:\n' +
          '  node -e "require(\'bcryptjs\').hash(\'passwordkamu\', 12).then(console.log)"\n' +
          'lalu set hasilnya di ADMIN_PASSWORD (.env.local / env Vercel).'
      );
    }
    return false;
  }

  return bcrypt.compare(password, expected);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (!(await rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS))) {
    return res.status(429).json({
      error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
    });
  }

  const body = req.body || {};

  // Honeypot: bot biasanya mengisi semua field termasuk yang tersembunyi.
  if (body.website) {
    await logSecurityEvent({ req, triggeredBy: 'honeypot_field', path: '/api/login' });
    return res.status(401).json({ error: 'Password salah.' });
  }

  const ok = await verifyPassword(body.password);
  if (!ok) {
    return res.status(401).json({ error: 'Password salah.' });
  }

  setSessionCookie(res, req);
  return res.status(200).json({ success: true });
}
