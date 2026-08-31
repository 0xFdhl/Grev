import { useEffect, useMemo, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import PlaceQRForm from '../../components/PlaceQRForm';
import QRModal from '../../components/QRModal';

const QUICK_COUNTS = [10, 25, 50, 100];

export default function AdminDashboard() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ business_name: '', target_url: '' });

  const [genPrefix, setGenPrefix] = useState('RV');
  const [genCount, setGenCount] = useState(10);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [copiedCode, setCopiedCode] = useState(null);
  const [qrCode, setQrCode] = useState(null);

  const [genHoneypot, setGenHoneypot] = useState('');
  const [editHoneypot, setEditHoneypot] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [msg]);

  function handleUnauthorized() {
    router.replace('/login');
  }

  async function callApi(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error('Sesi berakhir. Silakan login kembali.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      throw new Error((data && data.error) || `Request gagal (HTTP ${res.status})`);
    }
    return data;
  }

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/links', { credentials: 'same-origin' });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || `Gagal memuat data (HTTP ${res.status})`);
      }
      setLinks(data || []);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const stats = useMemo(() => {
    const total = links.length;
    const active = links.filter((l) => l.is_active).length;
    const inactive = total - active;
    const clicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
    return { total, active, inactive, clicks };
  }, [links]);

  const nextNumber = useMemo(() => {
    const nums = links
      .filter((l) => l.code.startsWith(genPrefix))
      .map((l) => parseInt(l.code.slice(genPrefix.length), 10) || 0);
    return nums.length > 0 ? Math.max(...nums) + 1 : 1;
  }, [links, genPrefix]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter((l) => {
      const matchesSearch =
        !q ||
        l.code.toLowerCase().includes(q) ||
        (l.business_name && l.business_name.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && l.is_active) ||
        (statusFilter === 'inactive' && !l.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [links, search, statusFilter]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await callApi('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: genPrefix,
          count: Number(genCount),
          startFrom: nextNumber,
          website: genHoneypot,
        }),
      });
      setMsg({ type: 'ok', text: `${genCount} kode ${genPrefix} berhasil dibuat.` });
      await loadLinks();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setGenerating(false);
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
        body: JSON.stringify({ ...editForm, is_active: true, website: editHoneypot }),
      });
      setMsg({ type: 'ok', text: 'Kode berhasil diaktivasi.' });
      setEditingId(null);
      await loadLinks();
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
      await loadLinks();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function removeCode(id) {
    if (!confirm('Yakin hapus kode ini?')) return;
    try {
      await callApi(`/api/links/${id}`, { method: 'DELETE' });
      setMsg({ type: 'ok', text: 'Kode dihapus.' });
      await loadLinks();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_) {}
    router.replace('/login');
  }

  async function copyLink(code) {
    const url = `${window.location.origin}/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch (_) {
      setMsg({ type: 'error', text: 'Gagal menyalin link.' });
    }
  }

  if (!authChecked) {
    return (
      <>
        <Head>
          <title>Dashboard Admin | Reviu</title>
        </Head>
        <div className='center-page'>
          <div className='card' style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <p style={{ margin: 0, color: 'var(--color-muted)' }}>Memeriksa sesi...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard Admin | Reviu</title>
      </Head>

      <div className='container'>
        <div className='row row--between' style={{ marginBottom: 20, alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 26 }}>Dashboard Reviu</h1>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 14 }}>
              Kelola kode QR/NFC untuk Google Review.
            </p>
          </div>
          <button onClick={logout} className='btn btn--secondary btn--small'>
            Keluar
          </button>
        </div>

        {msg && <div className={`alert alert--${msg.type}`}>{msg.text}</div>}

        {/* Statistik */}
        <div className='row'>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>TOTAL KODE</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>AKTIF</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>{stats.active}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>BELUM AKTIF</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-warning)' }}>{stats.inactive}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>TOTAL KLIK</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.clicks}</div>
          </div>
        </div>

        {/* Generate QR review langsung dari Google Maps */}
        <div className='card'>
          <h3 style={{ margin: '0 0 4px' }}>Generate QR review dari Google Maps</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 14 }}>
            Cari nama cafe, pilih tempat yang benar, QR code review otomatis dibuat dan bisa disimpan.
          </p>
          <PlaceQRForm />
        </div>

        {/* Generate */}
        <div className='card'>
          <input
            type='text'
            name='website'
            value={genHoneypot}
            onChange={(e) => setGenHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete='off'
            aria-hidden='true'
            style={{ display: 'none' }}
          />
          <h3 style={{ margin: '0 0 12px' }}>Generate kode baru (pre-cetak QR)</h3>
          <div className='row' style={{ alignItems: 'flex-end' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  marginBottom: 6,
                }}
              >
                PREFIX
              </label>
              <input
                value={genPrefix}
                onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                className='input'
                style={{ width: 90, textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  marginBottom: 6,
                }}
              >
                JUMLAH
              </label>
              <input
                type='number'
                min={1}
                max={500}
                value={genCount}
                onChange={(e) => setGenCount(e.target.value)}
                className='input'
                style={{ width: 90 }}
              />
            </div>
            <div className='grow'>
              <div className='row' style={{ marginBottom: 6 }}>
                {QUICK_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setGenCount(n)}
                    className='btn btn--secondary btn--small'
                    style={{ padding: '6px 10px' }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)' }}>
                Kode berikutnya:{' '}
                <strong>
                  {genPrefix}
                  {String(nextNumber).padStart(4, '0')}
                </strong>
              </p>
            </div>
            <button onClick={handleGenerate} disabled={generating} className='btn'>
              {generating ? 'Membuat...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className='card'>
          <div className='row' style={{ alignItems: 'flex-end' }}>
            <div className='grow'>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  marginBottom: 6,
                }}
              >
                CARI KODE / NAMA BISNIS
              </label>
              <input
                type='text'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Ketik RV0001 atau nama bisnis...'
                className='input'
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-muted)',
                  marginBottom: 6,
                }}
              >
                STATUS
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className='input'
                style={{ width: 150, cursor: 'pointer' }}
              >
                <option value='all'>Semua</option>
                <option value='active'>Aktif</option>
                <option value='inactive'>Belum aktif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Daftar kode */}
        <div className='card'>
          <div className='row row--between' style={{ marginBottom: 14, alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Daftar Kode ({filteredLinks.length})</h3>
            <button onClick={() => loadLinks()} className='btn btn--secondary btn--small' disabled={loading}>
              {loading ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p>Memuat...</p>
          ) : filteredLinks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-muted)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Tidak ada kode yang cocok.</p>
              <p style={{ margin: '4px 0 0', fontSize: 14 }}>Coba ubah pencarian atau filter status.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className='data-table'>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Status</th>
                    <th>Nama Bisnis</th>
                    <th>Link Tujuan</th>
                    <th>Klik</th>
                    <th style={{ minWidth: 180 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinks.map((link) => (
                    <tr key={link.id}>
                      {editingId === link.id ? (
                        <>
                          <td data-label='Kode'>
                            <code style={{ fontSize: 14, fontWeight: 600 }}>{link.code}</code>
                          </td>
                          <td data-label='Status'>
                            <span className='badge badge--inactive'>Mengedit</span>
                          </td>
                          <td data-label='Nama Bisnis'>
                            <input
                              type='text'
                              name='website'
                              value={editHoneypot}
                              onChange={(e) => setEditHoneypot(e.target.value)}
                              tabIndex={-1}
                              autoComplete='off'
                              aria-hidden='true'
                              style={{ display: 'none' }}
                            />
                            <input
                              className='input'
                              value={editForm.business_name}
                              onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })}
                              placeholder='Nama bisnis'
                              style={{ minWidth: 140, textAlign: 'left' }}
                            />
                          </td>
                          <td data-label='Link Tujuan'>
                            <input
                              className='input'
                              value={editForm.target_url}
                              onChange={(e) => setEditForm({ ...editForm, target_url: e.target.value })}
                              placeholder='https://...'
                              style={{ minWidth: 180, textAlign: 'left' }}
                            />
                          </td>
                          <td data-label='Klik'>{link.clicks || 0}</td>
                          <td data-label='Aksi'>
                            <div className='row' style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => saveActivation(link.id)} className='btn btn--success btn--small'>
                                Simpan
                              </button>
                              <button onClick={() => setEditingId(null)} className='btn btn--secondary btn--small'>
                                Batal
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td data-label='Kode'>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <code style={{ fontSize: 14, fontWeight: 600 }}>{link.code}</code>
                              <button
                                onClick={() => copyLink(link.code)}
                                className='btn btn--secondary btn--small'
                                style={{ padding: '4px 8px', minHeight: 28, fontSize: 12 }}
                              >
                                {copiedCode === link.code ? 'Disalin!' : 'Salin link'}
                              </button>
                            </div>
                          </td>
                          <td data-label='Status'>
                            {link.is_active ? (
                              <span className='badge badge--active'>Aktif</span>
                            ) : (
                              <span className='badge badge--inactive'>Belum aktif</span>
                            )}
                          </td>
                          <td data-label='Nama Bisnis' style={{ fontWeight: 500 }}>
                            {link.business_name || '-'}
                          </td>
                          <td data-label='Link Tujuan'>
                            {link.target_url ? (
                              <a
                                href={link.target_url}
                                target='_blank'
                                rel='noreferrer'
                                style={{ color: '#2563eb', wordBreak: 'break-all' }}
                              >
                                {link.target_url.length > 32
                                  ? `${link.target_url.slice(0, 32)}...`
                                  : link.target_url}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td data-label='Klik' style={{ fontWeight: 600 }}>
                            {link.clicks || 0}
                          </td>
                          <td data-label='Aksi'>
                            <div className='row' style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => setQrCode(link.code)} className='btn btn--secondary btn--small'>
                                QR
                              </button>
                              <button onClick={() => startEdit(link)} className='btn btn--small'>
                                {link.is_active ? 'Edit' : 'Aktivasi'}
                              </button>
                              {link.is_active && (
                                <button
                                  onClick={() => deactivate(link.id)}
                                  className='btn btn--warning btn--small'
                                >
                                  Nonaktifkan
                                </button>
                              )}
                              <button onClick={() => removeCode(link.id)} className='btn btn--danger btn--small'>
                                Hapus
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {qrCode && <QRModal code={qrCode} onClose={() => setQrCode(null)} />}
      </div>
    </>
  );
}
