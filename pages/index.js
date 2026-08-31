import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>Reviu App</title>
        <meta name='description' content='Sistem redirect QR/NFC untuk Google Review.' />
      </Head>
      <div className='center-page'>
        <div className='card' style={{ maxWidth: 420, width: '100%' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Reviu App</h1>
          <p style={{ margin: '0 0 20px', color: 'var(--color-muted)' }}>
            Sistem redirect QR/NFC untuk Google Review. Cepat, jelas, dan responsif di ponsel.
          </p>
          <Link href='/login' className='btn' style={{ width: '100%', textDecoration: 'none' }}>
            Masuk ke Dashboard Admin
          </Link>
        </div>
      </div>
    </>
  );
}
