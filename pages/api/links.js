import { randomInt, createHash } from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { checkAuth } from '../../lib/checkAuth';
import { logSecurityEvent } from '../../lib/securityLog';
import { nextStockNumber, createStockCodes } from '../../lib/stockCodes';

const PREFIX_RE = /^[A-Z0-9]{1,10}$/;
const MAX_BUSINESS_NAME = 200;
const MAX_TARGET_URL = 2048;
const MAX_PLACE_ID = 200;

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
  res.setHeader('Cache-Control', 'private, no-store');
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET ?nextfor=RV -> nomor urut berikutnya untuk prefix tsb.
  // Penting: dihitung dari SEMUA kode (termasuk yang ada di Sampah), supaya
  // generate pre-cetak tidak bentrok dengan kode lama yang sudah di-trash.
  if (req.method === 'GET' && typeof req.query.nextfor === 'string') {
    const prefix = req.query.nextfor.trim().toUpperCase();
    if (!PREFIX_RE.test(prefix)) {
      return res.status(400).json({ error: 'Prefix harus 1-10 karakter huruf/angka.' });
    }

    try {
      return res.status(200).json({ next: await nextStockNumber(supabaseAdmin, prefix) });
    } catch (_) {
      return res.status(503).json({ error: 'Nomor stok belum bisa dimuat. Coba lagi.' });
    }
  }

  // GET -> ambil data links. Default: yang BELUM dihapus (soft-delete).
  // ?trash=1 -> khusus daftar sampah (yang deleted_at terisi), urut terbaru dihapus.
  if (req.method === 'GET') {
    const wantTrash = req.query.trash === '1' || req.query.trash === 'true';
    const rows = [];
    let cursor;
    try {
      // Keyset pagination avoids database row caps and shifting offsets.
      while (true) {
        let query = supabaseAdmin.from('links').select('*').order('id', { ascending: true }).limit(500);
        query = wantTrash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
        if (cursor) query = query.gt('id', cursor);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        cursor = data[data.length - 1].id;
      }
      const field = wantTrash ? 'deleted_at' : 'created_at';
      rows.sort((a, b) => String(b[field]).localeCompare(String(a[field])));
      return res.status(200).json(rows);
    } catch (_) {
      return res.status(503).json({ error: 'Daftar belum bisa dimuat lengkap. Coba lagi.' });
    }
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
    const placeId = typeof body.place_id === 'string' ? body.place_id.trim() : '';
    const targetUrl = placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : '';
    const requestId = body.request_id;
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))) {
      return res.status(400).json({ error: 'ID permintaan tidak valid.' });
    }

    if (!businessName || !targetUrl || !placeId) {
      return res.status(400).json({ error: 'Nama, Place ID, dan link review wajib diisi.' });
    }
    if (businessName.length > MAX_BUSINESS_NAME) {
      return res.status(400).json({ error: `Nama bisnis maksimal ${MAX_BUSINESS_NAME} karakter.` });
    }
    if (targetUrl.length > MAX_TARGET_URL) {
      return res.status(400).json({ error: `Link review maksimal ${MAX_TARGET_URL} karakter.` });
    }
    if (placeId.length > MAX_PLACE_ID) {
      return res.status(400).json({ error: `Place ID maksimal ${MAX_PLACE_ID} karakter.` });
    }
    if (!/^https:\/\/search\.google\.com\/local\/writereview\?placeid=/.test(targetUrl)) {
      return res.status(400).json({ error: 'Link review tidak valid.' });
    }

    // Auto-generate kode unik. Kalau kebetulan bentrok (sangat jarang), coba kode lain.
    for (let attempt = 0; attempt < 5; attempt++) {
      // A retry uses the same unique code, without a migration or overwriting rows.
      const code = requestId
        ? createHash('sha256').update(`cafe:${requestId.toLowerCase()}`).digest('hex').slice(0, 20).toUpperCase()
        : randomCode();
      const { data, error } = await supabaseAdmin
        .from('links')
        .insert({ code, business_name: businessName, target_url: targetUrl, place_id: placeId, is_active: true })
        .select();

      if (!error) {
        return res.status(201).json(data[0]);
      }
      if (requestId && error.code === '23505') {
        const existing = await supabaseAdmin.from('links').select('*').eq('code', code).maybeSingle();
        if (existing.error) return res.status(503).json({ error: 'Belum bisa memastikan hasil simpan. Coba lagi.' });
        const row = existing.data;
        if (row && !row.deleted_at && row.is_active && row.place_id === placeId &&
            row.business_name === businessName && row.target_url === targetUrl) {
          return res.status(200).json(row);
        }
        return res.status(409).json({ error: 'Permintaan ini sudah digunakan dan datanya berubah. Periksa daftar QR.' });
      }
      if (error.code !== '23505') {
        return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
      }
      // 23505 = unique violation -> kode bentrok, ulangi dengan kode lain
    }
    return res.status(500).json({ error: 'Gagal membuat kode unik. Coba lagi.' });
  }

  // POST -> generate banyak kode sekaligus (buat pre-cetak QR sebelum ada pelanggan)
  // body: { prefix: "RV", count: 20 }. Server owns allocation, not the preview.
  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.website) {
      await logSecurityEvent({ req, triggeredBy: 'honeypot_field', path: '/api/links' });
      return res.status(400).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }

    const prefix = typeof body.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
    const count = Number(body.count);

    if (!PREFIX_RE.test(prefix)) {
      return res.status(400).json({ error: 'Prefix harus 1-10 karakter huruf/angka.' });
    }
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      return res.status(400).json({ error: 'Jumlah kode harus angka bulat 1-500.' });
    }
    try {
      const { data, error } = await createStockCodes(supabaseAdmin, prefix, count);
      if (error?.code === 'STOCK_LIMIT') {
        return res.status(400).json({ error: 'Nomor stok sudah penuh. Gunakan prefix baru.' });
      }
      if (error?.code === 'STOCK_BUSY') {
        return res.status(409).json({ error: 'Stok sedang dibuat di tab lain. Coba lagi.' });
      }
      if (error) return res.status(503).json({ error: 'Gagal menyimpan stok. Coba lagi.' });
      return res.status(201).json(data);
    } catch (_) {
      return res.status(503).json({ error: 'Gagal memuat nomor stok. Coba lagi.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
