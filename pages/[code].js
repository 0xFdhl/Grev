import Head from 'next/head';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { rateLimit } from '../lib/rateLimit';
import { getClientIp } from '../lib/ip';

const CODE_RE = /^[A-Za-z0-9]{1,20}$/;

export async function getServerSideProps({ params, req, res }) {
  const { code } = params;

  const ip = getClientIp(req);
  if (!rateLimit(`redirect:${ip}`, 60, 60 * 1000)) {
    res.statusCode = 404;
    return { props: { status: 'invalid' } };
  }

  if (typeof code !== 'string' || !CODE_RE.test(code)) {
    res.statusCode = 404;
    return { props: { status: 'invalid' } };
  }

  const { data, error } = await supabaseAdmin
    .from('links')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  // Pesan sengaja tidak membedakan "tidak ada" vs "belum aktif"
  // supaya attacker tidak bisa enumeration kode yang terdaftar.
  if (error || !data || !data.is_active || !data.target_url) {
    res.statusCode = 404;
    return { props: { status: 'invalid', code } };
  }

  await supabaseAdmin.rpc('increment_clicks', { p_code: data.code });

  return { redirect: { destination: data.target_url, permanent: false } };
}

export default function CodePage({ code }) {
  return (
    <>
      <Head>
        <title>Kode tidak tersedia | Reviu</title>
      </Head>
      <div className='center-page'>
        <div className='card' style={{ maxWidth: 420, width: '100%' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--color-danger-bg)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 16px',
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Kode tidak tersedia</h1>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            Kode{code ? ` "${code}"` : ''} tidak ditemukan atau belum diaktivasi. Hubungi
            penyedia layanan.
          </p>
        </div>
      </div>
    </>
  );
}
