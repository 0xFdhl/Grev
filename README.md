# Reviu App

Panduan lengkap arsitektur, operasi, batasan, dan rilis aman:
[PANDUAN-PROJECT.md](PANDUAN-PROJECT.md).

## Update aplikasi tanpa mengubah data lama

Perbaikan alur QR/NFC ini tidak memerlukan migrasi database atau menjalankan
ulang `supabase-schema.sql`. Deploy hanya kode aplikasi. Pertahankan project
Supabase dan environment variables hosting yang sama; jangan reset/seed database.
Kode, tujuan, nama bisnis, hitungan akses, dan data Sampah lama tidak ditulis ulang
oleh proses build/deploy. QR dan NFC lama tetap memakai route `/{code}` yang sama.

- Link salin/QR baru memakai `NEXT_PUBLIC_SITE_URL`, dengan default
  `https://bebetterdevelo.online`, bukan domain preview atau localhost.
  Ubah hanya setelah domain baru terhubung, lalu rebuild/deploy.
- Pembuatan stok hanya melakukan INSERT; tidak memakai UPSERT atau mengganti row
  lama. Nomor dari Sampah tetap dicadangkan. Konflik antar-tab ditangani dengan
  retry setelah penolakan constraint `UNIQUE(code)` yang sudah ada.
- Penghapusan menyimpan `deleted_at` langsung. Tombol Urungkan melakukan restore;
  baris tidak dihapus permanen dan kode/tujuan/statistik tetap dipertahankan.
- Batas redirect default 1200 akses/IP/menit agar Wi-Fi bersama lebih toleran.
  Opsional: `REDIRECT_RATE_LIMIT_PER_MINUTE`. Batas login tidak berubah.
  Pembatasan scan mengembalikan 429, kegagalan database 503, dan kode tidak
  tersedia 404. Upstash tetap diperlukan untuk batas bersama antar-instance.
- Jalankan `npm run test:logic` dan `npm run build` sebelum deploy. Tes logika
  menggunakan database simulasi dan tidak mengakses data hosting.

Pemeriksaan browser lokal: jalankan server di port 3100, lalu
`node scripts/ui-smoke.cjs` dengan Playwright tersedia (atau atur
`PLAYWRIGHT_PATH` ke modul Playwright). Semua API dalam tes browser disimulasikan.
Jalankan juga `node scripts/business-ui-regression.cjs` untuk tes pemilihan bisnis
dan percobaan ulang setelah respons simpan terputus.

---

Sistem redirect QR/NFC untuk Google Review. Alurnya:

```
Tap NFC / scan QR → reviu-kamu.com/RV0001 → cek database → redirect ke Google Review bisnis
```

Kamu bisa pre-generate ratusan kode (RV0001, RV0002, dst) sebelum ada pelanggan,
lalu aktivasi belakangan lewat dashboard admin tanpa perlu cetak ulang QR/acrylic.

---

## 1. Setup Supabase (hanya untuk instalasi baru)

Jika project Supabase sudah berjalan, lewati bagian ini. Jangan reset database
atau menjalankan ulang skema untuk update aplikasi ini.

1. Daftar di [supabase.com](https://supabase.com) (bisa pakai akun GitHub/Google)
2. Klik **New Project** → kasih nama bebas → pilih region **Southeast Asia (Singapore)** biar lebih cepat dari Indonesia
3. Tunggu project selesai dibuat (~2 menit)
4. Buka menu **SQL Editor** (sidebar kiri) → **New query**
5. Copy-paste isi file `supabase-schema.sql` dari project ini → klik **Run**
6. Buka menu **Settings → API** (sidebar kiri bawah), catat 3 hal ini:
   - **Project URL** → nanti jadi `SUPABASE_URL`
   - **anon public key** → nanti jadi `SUPABASE_ANON_KEY` (saat ini tidak dipakai client)
   - **service_role key** (klik "reveal") → nanti jadi `SUPABASE_SERVICE_ROLE_KEY`
   ⚠️ **service_role key JANGAN pernah dibagikan ke siapa pun atau ditaruh di kode frontend** —
   key ini punya akses penuh ke database.

## 2. Setup project di komputer kamu

```bash
# masuk ke folder project
cd reviu-app

# install dependencies
npm install

# copy file environment variable
cp .env.example .env.local
```

Buka file `.env.local`, isi dengan data dari Supabase tadi:

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxxxxxxx
ADMIN_PASSWORD=\$2b\$12\$isi_dengan_hash_bcrypt
SESSION_SECRET=isi_dengan_secret_acak_minimal_32_karakter
NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY=isi_dengan_demo_key_dari_developers.google.com/maps/demo-key
UPSTASH_REDIS_REST_URL=https://xxxxxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxxxxxxxxx
```

Buat hash password dengan perintah berikut:

```bash
node -e "require('bcryptjs').hash('passwordkamu', 12).then(console.log)"
```

Test dulu di lokal:

```bash
npm run dev
```

Buka `http://localhost:3000/admin` → login pakai password asli yang digunakan saat
membuat hash, bukan teks hash `ADMIN_PASSWORD`. Gunakan database pengujian untuk percobaan.

## 3. Push ke GitHub

```bash
git init
git add .
git commit -m "initial commit"
```

Buat repo baru di [github.com/new](https://github.com/new) (bisa **private**), lalu:

```bash
git remote add origin https://github.com/USERNAME/reviu-app.git
git branch -M main
git push -u origin main
```

## 4. Deploy ke hosting Next.js (contoh: Vercel)

Periksa syarat paket dan biaya penyedia untuk penggunaan komersial sebelum memilihnya.

1. Daftar di [vercel.com](https://vercel.com) pakai akun GitHub
2. Klik **Add New → Project** → pilih repo `reviu-app` yang barusan di-push
3. Di bagian **Environment Variables**, masukkan variable yang sama seperti di `.env.local`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `NEXT_PUBLIC_SITE_URL` (opsional, origin HTTPS untuk link QR/NFC)
   - `REDIRECT_RATE_LIMIT_PER_MINUTE` (opsional, default 1200)
4. Klik **Deploy** → tunggu ~1-2 menit
5. Vercel kasih kamu URL sementara, misal `reviu-app.vercel.app` — coba buka `/admin` untuk pastikan jalan

## 5. Hubungkan domain sendiri

1. Pilih domain berdasarkan total biaya awal dan perpanjangan, bukan promo awal saja
2. Di dashboard Vercel project kamu → **Settings → Domains** → masukkan domain kamu (misal `reviu.id`)
3. Vercel kasih instruksi DNS (biasanya berupa **A record** atau **CNAME**) yang harus kamu masukkan
4. Masuk ke panel domain kamu (di tempat kamu beli domain) → cari menu **DNS Management/Zone Editor**
   → tambahkan record sesuai instruksi Vercel
5. Tunggu propagasi DNS (biasanya 5 menit - 24 jam) → domain kamu otomatis aktif dan terhubung ke Vercel
6. Setelah HTTPS dan route kode bekerja, isi `NEXT_PUBLIC_SITE_URL` dengan origin
   domain tersebut, kemudian build/deploy ulang. Cetak ulang QR/tulis ulang NFC
   yang masih menggunakan domain lain. Mengganti env tidak mengubah cetakan fisik.

## 6. Cara pakai sehari-hari

**Generate kode banyak sekaligus (sebelum ada pelanggan):**
- Buka `/admin` → isi prefix (misal `RV`) dan jumlah → klik Generate
- Kode baru muncul di tabel dengan status "Belum aktif"
- Generate QR code dari URL `https://domainkamu.com/RV0001` (pakai generator QR gratis manapun)
  → cetak ke acrylic

**Aktivasi saat ada pelanggan baru (closing deal):**
- Ambil satu kode yang belum aktif dari tabel (yang fisiknya masih nganggur di stok)
- Klik **Aktivasi** → isi nama bisnis + link Google Review mereka → **Simpan**
- Kode langsung aktif, QR yang sudah tercetak otomatis jalan tanpa perlu cetak ulang

**Kalau pelanggan berhenti pakai:**
- Klik **Nonaktifkan** → kode itu bisa dipasangkan lagi ke pelanggan baru nanti (asal fisik acrylic dari kode tsb masih ada)

## Cara ambil link Google Review bisnis

1. Buka Google Maps, cari nama bisnis
2. Gunakan link permintaan ulasan milik bisnis, atau hasil pencarian bisnis di aplikasi
3. Tes link tersebut sampai membuka form ulasan. Link berbagi tempat belum tentu
   langsung membuka form ulasan.

## Generate QR review langsung dari Google Maps

Selain pre-generate kode pendek, ada form di `/admin` yang bikin QR code review langsung
dari pencarian tempat di Google Maps:

1. Buka `/admin` → kartu **"Generate QR review dari Google Maps"**
2. Ketik nama cafe di kolom pencarian (autocomplete dari Google Maps)
3. Pilih cafe yang benar dari dropdown → sistem ambil **Place ID** + koordinat otomatis
   (lokasi cafe ditampilkan di peta, bisa di-fullscreen di HP/desktop)
4. Klik **Simpan & buat QR** → sistem bikin kode unik, lalu QR digenerate dari short link
   `https://domainkamu.com/{KODE}` yang redirect ke link review
5. QR muncul → bisa **Download PNG**

Kode baru otomatis masuk ke **Daftar Kode** (status aktif). Karena QR-nya nunjuk ke short
link (bukan langsung ke Google), kamu bisa **mengubah link tujuan kapan aja** — misal kalau
owner cafe nolak, kode + akrilik yang sama tinggal dipindah ke cafe lain tanpa cetak ulang.
Data disimpan ke tabel `links` (kolom `place_id` dipakai sebagai referensi Place ID Google Maps).

**Cara dapetin Maps Demo Key:**

1. Buka [developers.google.com/maps/demo-key](https://developers.google.com/maps/demo-key)
2. Login akun Google → klik **"Get a Demo Key"** (gratis, tanpa kartu kredit)
3. Copy key-nya ke `NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY` di `.env.local`

> ⚠️ Demo key ini cuma untuk testing/prototyping. Untuk produksi, gunakan key produksi
> dengan konfigurasi billing dan pembatasan domain/API yang sesuai, dan pastikan domain
> kamu stabil — kalau domain ganti, QR akrilik yang sudah tercetak tidak akan jalan lagi.

## Load test lokal/staging

Runner berikut mensimulasikan 5.000 request yang tersebar selama 3 detik. Jalankan
terhadap staging, bukan production:

```bash
npm run load-test -- --url https://staging.example.com/ --requests 5000 --duration-ms 3000
```

Output mencatat status HTTP, network error, throughput, serta latency p50/p95/p99.
Gunakan URL `/` untuk halaman statis dan URL kode untuk menguji jalur redirect yang
bergantung pada Supabase.

## Rate limit produksi (Upstash)

Rate limit (login & redirect) secara default berjalan di memori per-instance — di lokal
itu cukup, tapi di Vercel setiap instance serverless punya memori sendiri sehingga limit
login brute-force bisa bocor. Supaya konsisten antar instance, pakai Upstash Redis:

1. Daftar gratis di [upstash.com](https://upstash.com) (login GitHub/Google)
2. **Create database** → pilih region yang sesuai dan cek kuota/harga paket saat mendaftar
3. Di halaman database, copy **REST URL** dan **Write/Read Token** (kalau token tidak
   terlihat, pilih "Rotate Token" atau cek tab REST API)
4. Isi `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` di `.env.local`
   dan Environment Variables di Vercel

Jika env itu kosong atau Redis sedang error, app fallback ke in-memory
(best-effort, tidak dibagi antar-instance). Request Redis memakai abort 2 detik
tanpa retry SDK. Login tetap memerlukan password; fallback bukan pengganti
proteksi brute-force terdistribusi. Ketersediaan hosting/database tetap diperlukan.

## Catatan keamanan

- Password admin ini proteksi dasar, cocok untuk pemakaian personal/kecil.
- Kalau nanti timnya lebih dari 1 orang atau butuh log siapa yang aktivasi apa,
  pertimbangkan upgrade ke Supabase Auth (sistem login proper dengan email/password per user).
