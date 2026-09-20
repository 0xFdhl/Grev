# Panduan Reviu: QR/NFC untuk Google Review

## 1. Fungsi produk

Reviu adalah layanan perantara milik Anda, bukan aplikasi penghasil ulasan.
Pelanggan memindai QR atau menempelkan ponsel ke NFC. URL yang dibuka berisi
domain Anda dan kode tetap. Server mengambil tujuan kode dari database, mengecek
statusnya, lalu mengarahkan pengunjung ke Google Review.

Keuntungan utamanya: tujuan dapat diperbarui tanpa mengubah kode QR/NFC, selama
domain yang tertulis pada produk tetap aktif dan tersambung ke aplikasi.
Pengunjung tidak perlu login ke Reviu; Google dapat meminta login untuk menulis ulasan.
Aplikasi tidak membaca kata sandi Google dan tidak membuat ulasan otomatis.

## 2. Fitur yang tersedia

- Login admin dengan hash password bcrypt dan cookie sesi bertanda tangan, masa berlaku 2 jam.
- Dashboard desktop/mobile dengan pencarian, filter, status, dan jumlah akses.
- Pencarian bisnis Google Maps, pembuatan link review dari Place ID di server.
- Pembuatan stok kode berurutan sebelum ada pelanggan, maksimal 500 per permintaan.
- Aktivasi, perubahan tujuan/nama, nonaktifkan, hapus ke Sampah, dan pulihkan.
- Salin link untuk NFC; unduh PNG QR 960 px dan mode presentasi.
- Font Creato Display lokal. Tidak perlu mengambil font utama dari layanan eksternal.

Satu kode dapat dipakai pada QR dan NFC di unit yang sama. Aplikasi tidak menulis
chip NFC secara langsung: salin URL lalu gunakan perangkat/aplikasi penulis NFC.
Jangan kunci chip sebelum URL dan pemindaian selesai diuji.

## 3. Susunan teknis

- Next.js Pages Router + React: antarmuka dan API dalam satu aplikasi.
- `pages/admin/index.js`: pengelolaan daftar, stok, aktivasi, dan Sampah.
- `components/PlaceQRForm.js`: pilih bisnis, simpan, dan hasil QR.
- `components/QRModal.js`: gambar QR, unduh, salin, presentasi.
- `pages/api/links.js`: daftar dan pembuatan kode; semua memerlukan sesi admin.
- `pages/api/links/[id].js`: update, soft-delete, dan restore; memerlukan sesi admin.
- `pages/[code].js`: endpoint publik untuk scan/tap dan redirect sementara (307).
- `lib/publicLink.js`: satu sumber origin publik untuk seluruh link baru.
- `lib/stockCodes.js`: alokasi stok, termasuk nomor yang berada di Sampah.
- Supabase/PostgreSQL: penyimpanan tetap; Redis/Upstash: pembatas akses antar-instance.

Database `links` menyimpan ID, kode unik, nama bisnis, URL tujuan, status aktif,
Place ID, jumlah akses, waktu pembuatan/perubahan, dan waktu penghapusan sementara.
`security_logs` menyimpan kejadian honeypot termasuk IP dan user-agent.
Database tidak berada di folder build aplikasi.

## 4. Perbaikan pada update ini

### Pemilihan bisnis tidak tertukar

Hanya respons pilihan terakhir yang boleh memperbarui form. Data pilihan sebelumnya
dikosongkan saat pencarian baru dimulai. Simpan diblokir selama detail belum selesai,
dan pergantian bisnis diblokir selama penyimpanan.

### Simpan bisnis dapat diulang dengan aman

Form membuat UUID untuk satu upaya pembuatan. Server menurunkannya menjadi kode
20 karakter dan memakai constraint unik database untuk menolak INSERT ganda.
Permintaan yang sama dengan data yang sama mengembalikan baris sebelumnya,
bukan mengubah atau menambahnya. Data yang sudah diedit/nonaktif/dihapus menghasilkan
409 dan tidak dipulihkan otomatis. Tujuan Google dibangun server dari Place ID,
bukan mempercayai URL kiriman browser.

Identitas upaya simpan yang belum selesai disimpan di sessionStorage tab tersebut.
Jika respons hilang, muat ulang, pilih bisnis yang sama, lalu coba lagi. Jika penyimpanan
browser diblokir, proteksi percobaan ulang masih berlaku selama form yang sama terbuka,
tetapi tidak dijamin setelah reload. Form baru di tab lain adalah permintaan baru;
bisnis yang sama memang boleh memiliki lebih dari satu produk/kode.
Klien lama tanpa `request_id` tetap diterima untuk kompatibilitas dan tidak mendapat
proteksi pengulangan ini. Pembuatan stok batch juga belum idempoten: setelah respons
batch terputus, periksa daftar dahulu sebelum menekan buat stok lagi.

### Redirect tidak menunggu statistik tanpa batas

Request Redis memakai signal pembatalan 2 detik dan tanpa retry SDK; kegagalan masuk
ke pembatas memori lokal. Pencatatan akses diberi signal pembatalan 400 ms. Jika gagal
atau melampaui batas, tujuan tetap dibuka. Ini best-effort: statistik dapat kurang
tercatat ketika database lambat; pembatalan juga tidak menjamin transaksi yang sudah
diterima server dibatalkan. Tidak ada retry penghitung yang dapat menggandakan klik.

400 ms bukan jaminan total waktu redirect: pencarian database, DNS, jaringan, cold
start, dan pemuatan halaman Google tetap menambah waktu. Tidak ada klaim kapasitas
1.000 pengunjung/menit berdasarkan tes unit saja.

### Daftar tidak terpotong oleh batas baris database

Server membaca halaman dengan cursor ID sampai selesai, termasuk jika batas baris
database lebih kecil dari 500. Hasil diurutkan kembali berdasarkan waktu. Kegagalan
salah satu halaman ditampilkan sebagai error, bukan daftar parsial yang terlihat lengkap.
Untuk skala sangat besar, perlu pagination/filter/statistik di server agar seluruh
dataset tidak harus dikirim ke browser. Pembacaan beberapa halaman bukan snapshot
transaksi: perubahan bersamaan mungkin baru terlihat setelah muat ulang.

## 5. Keamanan dan batas produk

- Password disimpan sebagai bcrypt hash; rahasia Supabase hanya digunakan di server.
- Cookie HttpOnly dan SameSite Strict; Secure ketika request terdeteksi HTTPS.
- Login dibatasi 5 percobaan/IP/15 menit; redirect default 1.200/IP/menit.
- Redis perlu terkonfigurasi untuk batas konsisten antar-instance. Fallback memori
  tidak menggantikan proteksi terdistribusi. Hosting harus menyediakan header IP/protokol
  tepercaya; bila memakai reverse proxy sendiri, jangan teruskan header palsu dari klien.
- Skema menyediakan RLS dan pembatasan pemanggilan penghitung; pastikan konfigurasi
  tersebut benar-benar terpasang di database produksi. Audit lokal tidak membuktikannya.
- Edit tujuan manual masih menerima HTTP/HTTPS umum untuk kompatibilitas, bukan
  whitelist Google. Admin harus mengecek tujuan sebelum menyerahkan produk.
- Belum ada akun terpisah per anggota, 2FA dalam aplikasi, audit perubahan per pengguna,
  pembayaran, atau masa aktif pelanggan otomatis. Jangan membagikan satu password sembarangan.
- Jumlah akses bukan jumlah orang unik, bukan jumlah ulasan, dan bukan bukti ulasan terkirim.
- Penghapusan di UI adalah soft-delete. Jangan menjalankan contoh auto-purge opsional
  dalam skema bila kode harus terus dicadangkan.

## 6. Konfigurasi dan domain

Lihat `.env.example` untuk daftar variabel tanpa rahasia. Yang utama:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: project database yang sudah digunakan.
- `ADMIN_PASSWORD`: hash bcrypt, bukan password polos. Login memakai password aslinya.
- `SESSION_SECRET`: gunakan secret acak panjang, terpisah dari password.
- `NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY`: nama variabel kompatibilitas lama; untuk produksi
  isi dengan key produksi yang sesuai dan batasi pemakaian berdasarkan domain/API.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: pembatas bersama.
- `REDIRECT_RATE_LIMIT_PER_MINUTE`: opsional, default 1200.
- `NEXT_PUBLIC_SITE_URL`: origin HTTPS tanpa path/query, default domain lama
  `https://bebetterdevelo.online`. Konfigurasi tidak valid menggagalkan build.

Untuk pindah ke `.my.id`: beli nama pilihan Anda, hubungkan DNS dan HTTPS ke aplikasi,
uji route kode pada domain baru, atur `NEXT_PUBLIC_SITE_URL`, lalu build/deploy ulang.
Variabel NEXT_PUBLIC dibekukan saat build. Mengubah variabel saja tidak memperbarui
bundle yang telah di-deploy. Jangan isi domain yang belum dimiliki/terhubung.

Domain lama tidak otomatis berhenti diperlukan. QR tercetak dan NFC yang berisi
alamat lama harus diganti/ditulis ulang, atau domain lama tetap dipertahankan.
Mengubah domain tidak perlu mengganti project Supabase atau mengubah kode database.

## 7. Deploy tanpa menimpa data lama

1. Buat backup database produksi dan pastikan cara pemulihannya diketahui.
2. Simpan referensi deployment lama agar rollback kode bisa dilakukan.
3. Pertahankan project Supabase, secrets, domain, dan konfigurasi hosting yang sesuai.
4. Jalankan tes dan build pada kode baru. Jangan menjalankan reset, seed, atau skema SQL.
5. Deploy kode aplikasi saja. Update ini tidak memerlukan migrasi database.
6. Cek login dan daftar kode lama. Bandingkan beberapa kode, tujuan, status, dan Sampah.
7. Tes satu URL lama; scan dapat menambah jumlah akses. Lakukan aktivasi/edit percobaan
   pada kode khusus pengujian, bukan kode pelanggan.
8. Jika ada masalah, rollback deployment kode tanpa memulihkan database sembarangan.

Build dan deploy tidak menulis ulang data. Namun jaminan tidak kehilangan data tetap
bergantung pada backup, database yang benar, dan tidak melakukan operasi destruktif.
Tidak ada deployment atau perubahan DNS/database produksi yang dilakukan oleh update lokal ini.

## 8. Pemeriksaan dan cara menjalankan

Gunakan Node.js yang memenuhi persyaratan Next.js terpasang, lalu `npm install`.
`npm run dev` untuk pengembangan; `npm run build` kemudian `npm start` untuk produksi.
Gunakan database uji untuk pengembangan yang memerlukan operasi tulis.

- `npm run test:logic`: tes fungsi sumber dengan dependensi simulasi, tanpa koneksi produksi.
- `npm run build`: pemeriksaan kompilasi produksi.
- Server lokal port 3100 + `node scripts/ui-smoke.cjs`: dashboard/login pada 4 lebar layar.
- `node scripts/business-ui-regression.cjs`: pilihan bisnis bersaing dan retry setelah reload.
- Tes browser memerlukan Playwright + Edge; `PLAYWRIGHT_PATH` dapat menunjuk modulnya.

Tes browser mengganti respons API dan Google Maps dengan simulasi, sehingga tidak
membuktikan key Maps, DNS, RLS, konfigurasi Redis, atau kapasitas hosting produksi.
Tes beban hanya dilakukan di staging yang diizinkan, bukan otomatis ke layanan aktif.

## 9. Checklist sebelum menjual satu unit

1. Pastikan domain final aktif dan masa layanan pelanggan jelas.
2. Cocokkan nama serta lokasi bisnis; buka tujuan dan pastikan form ulasan benar.
3. Salin URL kode yang sama untuk QR dan NFC pada unit tersebut.
4. Cetak sampel dan uji dengan beberapa ponsel, baik scan maupun tap.
5. Pastikan kode aktif, tidak di Sampah, dan HTTPS berfungsi.
6. Catat kode yang diserahkan kepada pelanggan agar tidak dialokasikan ulang.
7. Jangan menjanjikan layanan selamanya; siapkan biaya domain, hosting, dan dukungan.

## 10. Hasil verifikasi update lokal, 20 September 2026

- 18 tes logika lulus: kode lama, konflik stok, hapus/pulihkan, status redirect,
  origin domain, signal Redis, fallback, batas tunggu statistik, respons bisnis
  bersaing, pagination, idempotensi bisnis, akses tanpa login, dan tanda tangan sesi.
- Build produksi Next.js berhasil.
- Tes browser dashboard berhasil pada lebar 1440, 768, 390, dan 320 px.
- Tes browser form bisnis berhasil pada 1440 dan 390 px, termasuk respons simpan
  yang hilang, reload, retry dengan ID sama, dan PNG beresolusi 960 px.
- Pemeriksaan whitespace diff lulus; skema SQL tidak diubah.
- Server lokal pengujian dihentikan setelah selesai. Belum deploy ke hosting.

Hasil ini bukan sertifikasi keamanan atau pengujian beban produksi. Semua database
dan API pada pengujian disimulasikan; integrasi nyata perlu diverifikasi di staging
atau melalui pemeriksaan produksi yang disetujui sebelum menyerahkan produk.
