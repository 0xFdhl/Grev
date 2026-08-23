import { createClient } from '@supabase/supabase-js';

// PENTING: file ini hanya boleh dipakai di server (API routes / getServerSideProps)
// JANGAN pernah import ini di komponen yang jalan di browser, karena pakai service role key
// yang punya akses penuh ke database (bypass Row Level Security).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Env Supabase belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local, lalu restart dev server.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
