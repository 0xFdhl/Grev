import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { checkAuth } from '../../lib/checkAuth';
import { logSecurityEvent } from '../../lib/securityLog';

const PREFIX_RE = /^[A-Z0-9]{1,10}$/;

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET -> ambil semua data links
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    return res.status(200).json(data);
  }

  // POST -> generate banyak kode sekaligus (buat pre-cetak QR sebelum ada pelanggan)
  // body: { prefix: "RV", count: 20, startFrom: 1 }
  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.website) {
      await logSecurityEvent({ req, triggeredBy: 'honeypot_field', path: '/api/links' });
      return res.status(400).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }

    const prefix = typeof body.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
    const count = Number(body.count);
    const startFrom = Number(body.startFrom ?? 1);

    if (!PREFIX_RE.test(prefix)) {
      return res.status(400).json({ error: 'Prefix harus 1-10 karakter huruf/angka.' });
    }
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      return res.status(400).json({ error: 'Jumlah kode harus angka bulat 1-500.' });
    }
    if (!Number.isInteger(startFrom) || startFrom < 1) {
      return res.status(400).json({ error: 'Nomor awal (startFrom) harus angka bulat >= 1.' });
    }

    const rows = [];
    for (let i = 0; i < count; i++) {
      const number = String(startFrom + i).padStart(4, '0');
      rows.push({ code: `${prefix}${number}`, is_active: false });
    }

    const { data, error } = await supabaseAdmin
      .from('links')
      .insert(rows)
      .select();

    if (error) {
      // 23505 = unique violation -> kode sudah pernah dibuat
      if (error.code === '23505') {
        return res
          .status(409)
          .json({ error: 'Ada kode yang sudah terdaftar. Naikkan nomor awal atau ganti prefix.' });
      }
      return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    }
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
