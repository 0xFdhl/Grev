import { logSecurityEvent } from '../../lib/securityLog';

export default async function handler(req, res) {
  await logSecurityEvent({ req, triggeredBy: 'honeypot_endpoint' });
  res.status(200).json({ status: 'ok' });
}
