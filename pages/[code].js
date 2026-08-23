import { supabaseAdmin } from '../lib/supabaseAdmin';

// Halaman ini yang dituju QR code / NFC, contoh: reviu.id/RV0001
// getServerSideProps jalan di server SETIAP kali ada yang buka link ini,
// jadi selalu ambil data terbaru dari database (real-time, tanpa perlu rebuild/redeploy)

export async function getServerSideProps({ params }) {
  const { code } = params;

  const { data, error } = await supabaseAdmin
    .from('links')
    .select('*')
    .eq('code', code)
    .single();

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
  if (status === 'not_found') {
    return (
      <Wrapper>
        <h1>Kode tidak ditemukan</h1>
        <p>Kode &quot;{code}&quot; tidak terdaftar di sistem kami.</p>
      </Wrapper>
    );
  }

  if (status === 'inactive') {
    return (
      <Wrapper>
        <h1>Belum aktif</h1>
        <p>Kode &quot;{code}&quot; belum diaktivasi. Hubungi penyedia layanan.</p>
      </Wrapper>
    );
  }

  return null;
}

function Wrapper({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        padding: '0 20px',
        color: '#333',
      }}
    >
      {children}
    </div>
  );
}
