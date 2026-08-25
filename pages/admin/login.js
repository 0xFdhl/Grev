import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Login() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/links', {
        headers: { Authorization: `Bearer ${password}` },
      });

      if (res.ok) {
        sessionStorage.setItem('reviu_admin_token', password);
        router.push('/admin');
      } else if (res.status === 401) {
        setError('Password salah.');
        setLoading(false);
      } else {
        const data = await res.json().catch(() => null);
        setError((data && data.error) || 'Terjadi kesalahan di server. Coba lagi nanti.');
        setLoading(false);
      }
    } catch (err) {
      setError('Tidak bisa terhubung ke server.');
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Login Admin | Reviu</title>
      </Head>
      <div className="center-page" style={{ background: '#f3f4f6' }}>
        <form
          onSubmit={handleSubmit}
          className="card"
          style={{ width: '100%', maxWidth: 360, padding: 32 }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Login Admin</h1>
          <p style={{ margin: '0 0 20px', color: 'var(--color-muted)', fontSize: 14 }}>
            Masukkan password untuk mengelola kode QR.
          </p>
          <input
            type="password"
            placeholder="Password admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            style={{ marginBottom: 14 }}
            autoFocus
            required
          />
          <button type="submit" className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Memeriksa...' : 'Masuk'}
          </button>
          {error && (
            <div className="alert alert--error" style={{ marginTop: 14, marginBottom: 0 }}>
              {error}
            </div>
          )}
        </form>
      </div>
    </>
  );
}
