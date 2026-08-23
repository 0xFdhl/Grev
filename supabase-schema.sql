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

-- index biar pencarian by code cepat
create index if not exists idx_links_code on links(code);

-- Row Level Security: matikan akses publik langsung, semua akses lewat API route kita
alter table links enable row level security;

-- Tidak ada policy publik yang dibuat, jadi hanya service_role key (dipakai di server)
-- yang bisa akses. Frontend/browser tidak bisa baca/tulis langsung ke tabel ini.

-- Increment jumlah klik secara atomic (aman dari race condition saat beberapa
-- orang membuka link bersamaan). Dipanggil dari pages/[code].js lewat:
--   supabaseAdmin.rpc('increment_clicks', { p_code: 'RV0001' })
create or replace function increment_clicks(p_code text)
returns void
language sql
as $$
  update links set clicks = clicks + 1, updated_at = now() where code = p_code;
$$;
