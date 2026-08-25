import Head from 'next/head';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Halaman ini yang dituju QR code / NFC, contoh: reviu.id/RV0001
// getServerSideProps jalan di server SETIAP kali ada yang buka link ini,
// jadi selalu ambil data terbaru dari database (real-time, tanpa perlu rebuild/redeploy)

export async function getServerSideProps({ params }) {
  const { code } = params;

  const { data, error } = await supabaseAdmin.from('links').select('*').eq('code', code).single();

  // Kalau kode tidak ditemukan di database
  if (error || !data) {
    return { props: { status: 'not_found', code } };
  }

  // Kalau ketemu tapi belum diaktivasi (belum ada target_url)
  if (!data.is_active || !data.target_url) {
    return { props: { status: 'inactive', code } };
  }

  // Aktif -> catat jumlah klik secara atomic (aman walau banyak scan bersamaan), lalu redirect
  await supabaseAdmin.rpc('increment_clicks', { p_code: code });

  return { redirect: { destination: data.target_url, permanent: false } };
}

// Ini cuma tampil kalau status BUKAN aktif (karena kalau aktif langsung redirect di server)
export default function CodePage({ status, code }) {
  const isNotFound = status === 'not_found';
  const title = isNotFound ? 'Kode tidak ditemukan' : 'Belum aktif';
  const message = isNotFound
    ? `Kode "${code}" tidak terdaftar di sistem kami.`
    : `Kode "${code}" belum diaktivasi. Hubungi penyedia layanan.`;

  return (
    <>
      <Head>
        <title>{title} | Reviu</title>
      </Head>
      <div className='center-page'>
        <div className='card' style={{ maxWidth: 420, width: '100%' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: isNotFound ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
              color: isNotFound ? 'var(--color-danger)' : 'var(--color-warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 16px',
              fontWeight: 700,
            }}
          >
            {isNotFound ? '!' : '✕'}
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>{title}</h1>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>{message}</p>
        </div>
      </div>
    </>
  );
}
