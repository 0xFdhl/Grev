# Reviu App

Sistem redirect QR/NFC untuk Google Review. Alurnya:

```
Tap NFC / scan QR → reviu-kamu.com/RV0001 → cek database → redirect ke Google Review bisnis
```

Kamu bisa pre-generate ratusan kode (RV0001, RV0002, dst) sebelum ada pelanggan,
lalu aktivasi belakangan lewat dashboard admin tanpa perlu cetak ulang QR/acrylic.

---

## 1. Setup Supabase (database, gratis)

1. Daftar di [supabase.com](https://supabase.com) (bisa pakai akun GitHub/Google)
2. Klik **New Project** → kasih nama bebas → pilih region **Southeast Asia (Singapore)** biar lebih cepat dari Indonesia
3. Tunggu project selesai dibuat (~2 menit)
4. Buka menu **SQL Editor** (sidebar kiri) → **New query**
5. Copy-paste isi file `supabase-schema.sql` dari project ini → klik **Run**
6. Buka menu **Settings → API** (sidebar kiri bawah), catat 3 hal ini:
   - **Project URL** → nanti jadi `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → nanti jadi `NEXT_PUBLIC_SUPABASE_ANON_KEY`
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
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxxxxxxx
ADMIN_PASSWORD=buatpasswordkuatdisini
```

Test dulu di lokal:

```bash
npm run dev
```

Buka `http://localhost:3000/admin` → login pakai `ADMIN_PASSWORD` yang kamu set → coba generate kode.

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

## 4. Deploy ke Vercel (gratis)

1. Daftar di [vercel.com](https://vercel.com) pakai akun GitHub
2. Klik **Add New → Project** → pilih repo `reviu-app` yang barusan di-push
3. Di bagian **Environment Variables**, masukkan 4 variable yang sama seperti di `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
4. Klik **Deploy** → tunggu ~1-2 menit
5. Vercel kasih kamu URL sementara, misal `reviu-app.vercel.app` — coba buka `/admin` untuk pastikan jalan

## 5. Hubungkan domain sendiri

1. Beli domain (misal di Niagahoster/Rumahweb/Namecheap) — kalau belum, `.my.id` atau `.xyz` paling murah
2. Di dashboard Vercel project kamu → **Settings → Domains** → masukkan domain kamu (misal `reviu.id`)
3. Vercel kasih instruksi DNS (biasanya berupa **A record** atau **CNAME**) yang harus kamu masukkan
4. Masuk ke panel domain kamu (di tempat kamu beli domain) → cari menu **DNS Management/Zone Editor**
   → tambahkan record sesuai instruksi Vercel
5. Tunggu propagasi DNS (biasanya 5 menit - 24 jam) → domain kamu otomatis aktif dan terhubung ke Vercel

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
2. Klik "Tulis ulasan" atau share tempat itu
3. Copy link yang muncul — ini yang dimasukkan ke field "Link Tujuan" di dashboard

## Catatan keamanan

- Password admin ini proteksi dasar, cocok untuk pemakaian personal/kecil.
- Kalau nanti timnya lebih dari 1 orang atau butuh log siapa yang aktivasi apa,
  pertimbangkan upgrade ke Supabase Auth (sistem login proper dengan email/password per user).
