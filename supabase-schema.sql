-- Jalankan ini di Supabase: Dashboard > SQL Editor > New Query > paste > Run

create table if not exists links (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,        -- ini yang muncul di URL, misal "RV0001"
  business_name text,               -- nama bisnis (boleh kosong kalau belum diaktivasi)
  target_url text,                  -- link Google Review tujuan (boleh kosong kalau belum diaktivasi)
  is_active boolean default false,  -- true = aktif, false = belum diaktivasi
  clicks integer default 0,         -- jumlah kali di-scan/tap
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_links_code on links(code);


alter table links enable row level security;

-- PENTING: RLS aktif TANPA policy = deny-all untuk anon & authenticated role.
-- Semua akses database hanya lewat service_role key di server (API routes).
-- JANGAN menambahkan policy USING (true) ke tabel ini — data akan langsung
-- bisa dibaca/diubah oleh siapa pun yang memegang anon key.
-- Jika suatu saat butuh akses langsung dari client, buat policy yang
-- membatasi hanya kode aktif, misal:
--   create policy "public_read_active" on links
--     for select using (is_active = true);


-- Kolom Place ID buat kode yang dibuat lewat form "Generate QR review dari Google Maps".
-- Dipakai cuma sebagai metadata (referensi), jadi tidak unique — cafe yang sama boleh
-- punya lebih dari satu kode/akrilik.
alter table links add column if not exists place_id text;


-- Soft-delete: "Hapus" di dashboard tinggal set deleted_at, baris TIDAK dihapus fisik.
-- Semua row lama otomatis dapat NULL -> tetap masuk daftar aktif, tidak dianggap sampah.
-- (Operasi additive + nullable default null = ringan, aman untuk tabel produksi.)
alter table links add column if not exists deleted_at timestamp with time zone default null;
create index if not exists idx_links_deleted_at on links(deleted_at);
create index if not exists idx_links_is_active  on links(is_active);


drop function if exists increment_clicks(text);

create or replace function increment_clicks(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  -- Hanya hitung klik untuk kode aktif DAN yang belum masuk sampah.
  update links set clicks = clicks + 1, updated_at = now()
  where code = p_code and deleted_at is null and is_active = true;
$$;

-- Hanya service_role yang boleh memanggil (anon/authenticated ditolak eksplisit)
revoke execute on function increment_clicks(text) from public, anon, authenticated;
grant execute on function increment_clicks(text) to service_role;


-- Tabel log keamanan (honeypot endpoint & field).
-- RLS aktif tanpa policy = hanya bisa dibaca/ditulis via service_role di server.
create table if not exists security_logs (
  id bigint generated always as identity primary key,
  ip text,
  user_agent text,
  path text,
  method text,
  triggered_by text check (triggered_by in ('honeypot_endpoint', 'honeypot_field')),
  created_at timestamp with time zone default now()
);

create index if not exists idx_security_logs_created_at on security_logs(created_at desc);

alter table security_logs enable row level security;


-- ============================================================================
-- AUTO-PURGE SAMPAH (OPSIONAL - JANGAN JALANKAN OTOMATIS)
-- ----------------------------------------------------------------------------
-- Ini DESTRUCTIVE: hapus permanen kode yang sudah >30 hari di sampah.
-- Kode existing aman: deleted_at mereka NULL, jadi TIDAK AKAN PERNAH kena purge
-- kecuali kamu buang ke sampah lewat dashboard dulu.
--
-- Prasyarat: aktifkan ekstensi pg_cron via Dashboard > Database > Extensions
-- (perintah `create extension` di SQL editor sering ditolak, jadi tidak dicantum).
--
-- Catatan zona waktu: pg_cron jalan dalam UTC.
--   '0 3 * * *'  = 03:00 UTC ~ 10:00 WIB
--   '0 20 * * *' = 20:00 UTC ~ 03:00 WIB (kalau mau "jam 3 pagi" waktu lokal)
--
-- Jalankan sendiri, sadar-sadar, setelah yakin + sudah uji di staging:
--
-- select cron.schedule(
--   'bersihkan-sampah-qr',
--   '0 3 * * *',
--   $$ delete from links
--      where deleted_at is not null
--        and deleted_at < now() - interval '30 days'; $$
-- );
-- ============================================================================
