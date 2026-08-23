import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

export default function AdminDashboard() {
  const [token, setToken] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ business_name: '', target_url: '' });
  const [genCount, setGenCount] = useState(10);
  const [genPrefix, setGenPrefix] = useState('RV');
  const router = useRouter();

  useEffect(() => {
    const t = sessionStorage.getItem('reviu_admin_token');
    if (!t) {
      router.push('/admin/login');
    } else {
      setToken(t);
    }
  }, [router]);

  async function callApi(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // body bukan JSON (misal error HTML dari server)
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `Request gagal (HTTP ${res.status})`);
    }
    return data;
  }

  const loadLinks = useCallback(async (authToken) => {
    setLoading(true);
    try {
      const res = await fetch('/api/links', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || `Gagal memuat data (HTTP ${res.status})`);
      }
      setLinks(data || []);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadLinks(token);
  }, [token, loadLinks]);

  async function handleGenerate() {
    // Lanjutkan nomor hanya dari prefix yang sama, biar prefix berbeda
    // tidak saling mengganggu penomoran
    const nums = links
      .filter((l) => l.code.startsWith(genPrefix))
      .map((l) => parseInt(l.code.slice(genPrefix.length), 10) || 0);
    const startFrom = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    try {
      await callApi('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: genPrefix, count: Number(genCount), startFrom }),
      });
      setMsg({ type: 'ok', text: `${genCount} kode ${genPrefix} berhasil dibuat.` });
      await loadLinks(token);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  function startEdit(link) {
    setEditingId(link.id);
    setEditForm({ business_name: link.business_name || '', target_url: link.target_url || '' });
  }

  async function saveActivation(id) {
    try {
      await callApi(`/api/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, is_active: true }),
      });
      setMsg({ type: 'ok', text: 'Kode berhasil diaktivasi.' });
      setEditingId(null);
      await loadLinks(token);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function deactivate(id) {
    try {
      await callApi(`/api/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      setMsg({ type: 'ok', text: 'Kode dinonaktifkan.' });
      await loadLinks(token);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function removeCode(id) {
    if (!confirm('Yakin hapus kode ini?')) return;
    try {
      await callApi(`/api/links/${id}`, { method: 'DELETE' });
      setMsg({ type: 'ok', text: 'Kode dihapus.' });
      await loadLinks(token);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  if (!token) return null;

  return (
    <div style={styles.page}>
      <h1>Dashboard Reviu</h1>

      {msg && (
        <div style={{ ...styles.msg, ...(msg.type === 'error' ? styles.msgError : styles.msgOk) }}>
          {msg.text}
        </div>
      )}

      <div style={styles.card}>
        <h3>Generate kode baru (pre-cetak QR)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Prefix:{' '}
            <input
              value={genPrefix}
              onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
              style={{ ...styles.input, width: 80 }}
            />
          </label>
          <label>
            Jumlah:{' '}
            <input
              type="number"
              value={genCount}
              onChange={(e) => setGenCount(e.target.value)}
              style={{ ...styles.input, width: 80 }}
            />
          </label>
          <button onClick={handleGenerate} style={styles.button}>
            Generate
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
          Kode baru otomatis lanjut dari nomor terakhir dengan prefix yang sama. Generate dulu
          sebelum ada pelanggan, baru aktivasi belakangan.
        </p>
      </div>

      <div style={styles.card}>
        <h3>Daftar Kode ({links.length})</h3>
        {loading ? (
          <p>Memuat...</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Kode</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Nama Bisnis</th>
                <th style={styles.th}>Link Tujuan</th>
                <th style={styles.th}>Klik</th>
                <th style={styles.th}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td style={styles.td}>
                    <code>{link.code}</code>
                  </td>
                  <td style={styles.td}>
                    {link.is_active ? (
                      <span style={{ color: 'green', fontWeight: 600 }}>Aktif</span>
                    ) : (
                      <span style={{ color: '#999' }}>Belum aktif</span>
                    )}
                  </td>
                  {editingId === link.id ? (
                    <>
                      <td style={styles.td}>
                        <input
                          style={styles.input}
                          value={editForm.business_name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, business_name: e.target.value })
                          }
                          placeholder="Nama bisnis"
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          style={{ ...styles.input, width: 220 }}
                          value={editForm.target_url}
                          onChange={(e) =>
                            setEditForm({ ...editForm, target_url: e.target.value })
                          }
                          placeholder="Link Google Review"
                        />
                      </td>
                      <td style={styles.td}>{link.clicks || 0}</td>
                      <td style={styles.td}>
                        <button onClick={() => saveActivation(link.id)} style={styles.buttonSmall}>
                          Simpan
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ ...styles.buttonSmall, background: '#999' }}
                        >
                          Batal
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>{link.business_name || '-'}</td>
                      <td style={styles.td}>
                        {link.target_url ? (
                          <a href={link.target_url} target="_blank" rel="noreferrer">
                            {link.target_url.slice(0, 30)}...
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={styles.td}>{link.clicks || 0}</td>
                      <td style={styles.td}>
                        <button onClick={() => startEdit(link)} style={styles.buttonSmall}>
                          {link.is_active ? 'Edit' : 'Aktivasi'}
                        </button>
                        {link.is_active && (
                          <button
                            onClick={() => deactivate(link.id)}
                            style={{ ...styles.buttonSmall, background: '#e67e22' }}
                          >
                            Nonaktifkan
                          </button>
                        )}
                        <button
                          onClick={() => removeCode(link.id)}
                          style={{ ...styles.buttonSmall, background: '#c0392b' }}
                        >
                          Hapus
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 1000,
    margin: '0 auto',
    padding: 24,
  },
  card: {
    background: 'white',
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
  },
  msg: {
    padding: '10px 14px',
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: 500,
  },
  msgOk: {
    background: '#e8f7ee',
    color: '#1a7f4b',
    border: '1px solid #bfe8cf',
  },
  msgError: {
    background: '#fdecea',
    color: '#a93226',
    border: '1px solid #f5c6c0',
  },
  input: {
    padding: 8,
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14,
  },
  button: {
    padding: '8px 16px',
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  buttonSmall: {
    padding: '6px 10px',
    marginRight: 6,
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    borderBottom: '2px solid #eee',
    padding: '8px 6px',
  },
  td: {
    borderBottom: '1px solid #f2f2f2',
    padding: '8px 6px',
    verticalAlign: 'top',
  },
};
