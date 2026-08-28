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


drop function if exists increment_clicks(text);

create or replace function increment_clicks(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update links set clicks = clicks + 1, updated_at = now() where code = p_code;
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
