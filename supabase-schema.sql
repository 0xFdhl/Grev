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


create or replace function increment_clicks(p_code text)
returns void
language sql
as $$
  update links set clicks = clicks + 1, updated_at = now() where code = p_code;
$$;
