import Head from 'next/head';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { rateLimit } from '../lib/rateLimit';
import { getClientIp } from '../lib/ip';

const CODE_RE = /^[A-Za-z0-9]{1,20}$/;
const configuredLimit = Number(process.env.REDIRECT_RATE_LIMIT_PER_MINUTE);
const REDIRECT_LIMIT = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 1200;

export async function getServerSideProps({ params, req, res }) {
  const { code } = params;
  res.setHeader('Cache-Control', 'private, no-store');

  if (typeof code !== 'string' || !CODE_RE.test(code)) {
    res.statusCode = 404;
    return { props: { status: 'invalid' } };
  }

  const ip = getClientIp(req);
  if (!(await rateLimit(`redirect:${ip}`, REDIRECT_LIMIT, 60 * 1000))) {
    res.statusCode = 429;
    res.setHeader('Retry-After', '60');
    return { props: { status: 'limited' } };
  }

  let data;
  try {
    const result = await supabaseAdmin.from('links').select('*')
      .eq('code', code.toUpperCase()).is('deleted_at', null).maybeSingle();
    if (result.error) throw result.error;
    data = result.data;
  } catch (_) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '30');
    return { props: { status: 'unavailable' } };
  }

  // Pesan sengaja tidak membedakan "tidak ada" vs "belum aktif"
  // supaya attacker tidak bisa enumeration kode yang terdaftar.
  if (!data || !data.is_active || !data.target_url) {
    res.statusCode = 404;
    return { props: { status: 'invalid', code } };
  }

  try {
    // Best-effort statistics: never wait indefinitely before opening the review.
    const { error } = await supabaseAdmin.rpc('increment_clicks', { p_code: data.code })
      .abortSignal(AbortSignal.timeout(400));
    if (error) console.error('[redirect] Pencatatan akses gagal.');
  } catch (_) {
    console.error('[redirect] Pencatatan akses gagal.');
  }

  return { redirect: { destination: data.target_url, permanent: false } };
}

export default function CodePage({ code, status = 'invalid' }) {
  const messages = {
    limited: { title: 'Terlalu banyak akses', text: 'Jaringan ini sedang ramai. Tunggu satu menit, lalu coba lagi.' },
    unavailable: { title: 'Layanan sementara terganggu', text: 'Kami belum bisa membuka link tujuan. Coba lagi beberapa saat lagi.' },
    invalid: { title: 'Kode tidak tersedia', text: `Kode${code ? ` "${code}"` : ''} tidak ditemukan atau belum diaktivasi. Hubungi penyedia layanan.` },
  };
  const message = messages[status] || messages.invalid;
  return (
    <>
      <Head>
        <title>{message.title} | Reviu</title>
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
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>{message.title}</h1>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            {message.text}
          </p>
          {status !== 'invalid' && <button className='btn' style={{ marginTop: 20 }} onClick={() => window.location.reload()}>Coba lagi</button>}
        </div>
      </div>
    </>
  );
}
