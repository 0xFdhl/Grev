import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { checkAuth } from '../../../lib/checkAuth';
import { logSecurityEvent } from '../../../lib/securityLog';

const MAX_BUSINESS_NAME = 200;
const MAX_TARGET_URL = 2048;

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TARGET_URL) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch (_) {
    return false;
  }
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(404).json({ error: 'Kode tidak ditemukan.' });
  }

  if (req.method === 'PUT') {
    const body = req.body || {};

    if (body.website) {
      await logSecurityEvent({ req, triggeredBy: 'honeypot_field', path: `/api/links/${id}` });
      return res.status(400).json({ error: 'Terjadi kesalahan. Coba lagi.' });
    }

    const { business_name, target_url, is_active } = body;

    if (business_name !== undefined) {
      if (typeof business_name !== 'string' || business_name.length > MAX_BUSINESS_NAME) {
        return res.status(400).json({ error: `Nama bisnis maksimal ${MAX_BUSINESS_NAME} karakter.` });
      }
    }

    if (target_url !== undefined && target_url !== '' && !isValidHttpUrl(target_url)) {
      return res.status(400).json({
        error: 'Link tujuan harus diawali http:// atau https:// dan berupa URL yang valid.',
      });
    }

    if (is_active === true && !isValidHttpUrl(target_url)) {
      return res.status(400).json({
        error:
          'Link tujuan wajib diisi dan diawali http:// atau https:// sebelum kode bisa diaktifkan.',
      });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (business_name !== undefined) updates.business_name = business_name.trim();
    if (target_url !== undefined) updates.target_url = target_url;
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('links')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Kode tidak ditemukan.' });
    }
    return res.status(200).json(data[0]);
  }

  if (req.method === 'DELETE') {
    const { data, error } = await supabaseAdmin
      .from('links')
      .delete()
      .eq('id', id)
      .select();

    if (error) return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Kode tidak ditemukan.' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
