import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { checkAuth } from '../../../lib/checkAuth';

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  // PUT -> aktivasi / update data (nama bisnis + link tujuan)
  // body: { business_name, target_url, is_active }
  if (req.method === 'PUT') {
    const body = req.body || {};
    const { business_name, target_url, is_active } = body;

    // Kode tidak boleh aktif kalau link tujuannya kosong/tidak valid,
    // biar tidak terjadi "Aktif" di dashboard tapi halaman bilang belum aktif
    if (
      is_active === true &&
      (!target_url || !/^https?:\/\/.+/i.test(target_url))
    ) {
      return res.status(400).json({
        error:
          'Link tujuan wajib diisi dan diawali http:// atau https:// sebelum kode bisa diaktifkan.',
      });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (business_name !== undefined) updates.business_name = business_name;
    if (target_url !== undefined) updates.target_url = target_url;
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('links')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Kode tidak ditemukan.' });
    }
    return res.status(200).json(data[0]);
  }

  // DELETE -> hapus kode (misal salah generate)
  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin.from('links').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
