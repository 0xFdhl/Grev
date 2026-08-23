import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validasi password dengan mencoba hit API links (yang butuh auth)
    const res = await fetch('/api/links', {
      headers: { Authorization: `Bearer ${password}` },
    });

    if (res.ok) {
      // Simpan di sessionStorage browser (hilang kalau tab ditutup, cukup aman utk personal use)
      sessionStorage.setItem('reviu_admin_token', password);
      router.push('/admin');
    } else if (res.status === 401) {
      setError('Password salah.');
    } else {
      // Bukan soal password -> tampilkan pesan asli dari server (misal Supabase bermasalah)
      const data = await res.json().catch(() => null);
      setError((data && data.error) || 'Terjadi kesalahan di server. Coba lagi nanti.');
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h1 style={{ marginBottom: 20 }}>Login Admin</h1>
        <input
          type="password"
          placeholder="Password admin"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          autoFocus
        />
        <button type="submit" style={styles.button}>
          Masuk
        </button>
        {error && <p style={{ color: 'red', marginTop: 10 }}>{error}</p>}
      </form>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    height: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
    background: '#f5f5f5',
  },
  form: {
    background: 'white',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    width: 320,
  },
  input: {
    width: '100%',
    padding: 10,
    fontSize: 16,
    border: '1px solid #ddd',
    borderRadius: 8,
    marginBottom: 12,
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: 10,
    fontSize: 16,
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
