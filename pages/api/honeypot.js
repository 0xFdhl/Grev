import { logSecurityEvent } from '../../lib/securityLog';

// Honeypot endpoint: path-path ini hanya diakses scanner/bot.
// Catat aktivitasnya, lalu balas 200 generik agar attacker tidak sadar.
export default async function handler(req, res) {
  await logSecurityEvent({ req, triggeredBy: 'honeypot_endpoint' });
  res.status(200).json({ status: 'ok' });
}
