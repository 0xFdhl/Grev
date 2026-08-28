import { clearSessionCookie } from '../../lib/session';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearSessionCookie(res, req);
  return res.status(200).json({ success: true });
}
