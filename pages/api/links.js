import { randomInt } from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { checkAuth } from '../../lib/checkAuth';
import { logSecurityEvent } from '../../lib/securityLog';

const PREFIX_RE = /^[A-Z0-9]{1,10}$/;

// Charset buat kode acak (tanpa huruf/angka yang gampang ketuker: I, O, 0, 1)
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Pakai crypto.randomInt (secure) bukan Math.random, biar kode nggak bisa ditebak.
function randomCode(len = 8) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARSET[randomInt(CODE_CHARSET.length)];
  }
  return out;
}

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

  // POST (mode "cafe") -> buat satu kode dari hasil pencarian Google Maps.
  // body: { type: "cafe", business_name, target_url, place_id, website }
  // Kode dibuat aktif langsung (target_url sudah diisi), dan nantinya bisa di-edit
  // (dipindah ke cafe lain) tanpa perlu cetak ulang QR akrilik.
  if (req.method === 'POST' && (req.body || {}).type === 'cafe') {
    const body = req.body || {};

    if (body.website) {
      await logSecurityEvent({ req, triggeredBy: 'honeypot_field', path: '/api/links' });
      return res.status(400).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }

    const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
    const targetUrl = typeof body.target_url === 'string' ? body.target_url.trim() : '';
    const placeId = typeof body.place_id === 'string' ? body.place_id.trim() : '';

    if (!businessName || !targetUrl || !placeId) {
      return res.status(400).json({ error: 'Nama, Place ID, dan link review wajib diisi.' });
    }
    if (!/^https:\/\/search\.google\.com\/local\/writereview\?placeid=/.test(targetUrl)) {
      return res.status(400).json({ error: 'Link review tidak valid.' });
    }

    // Auto-generate kode unik. Kalau kebetulan bentrok (sangat jarang), coba kode lain.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const { data, error } = await supabaseAdmin
        .from('links')
        .insert({ code, business_name: businessName, target_url: targetUrl, place_id: placeId, is_active: true })
        .select();

      if (!error) {
        return res.status(201).json(data[0]);
      }
      if (error.code !== '23505') {
        return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
      }
      // 23505 = unique violation -> kode bentrok, ulangi dengan kode lain
    }
    return res.status(500).json({ error: 'Gagal membuat kode unik. Coba lagi.' });
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
