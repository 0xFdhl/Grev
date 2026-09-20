import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import PlaceQRForm from '../../components/PlaceQRForm';
import QRModal from '../../components/QRModal';
import { publicLink } from '../../lib/publicLink';

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
  const [nextNumber, setNextNumber] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [copiedCode, setCopiedCode] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [createMode, setCreateMode] = useState(null);

  const [genHoneypot, setGenHoneypot] = useState('');
  const [editHoneypot, setEditHoneypot] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  const [view, setView] = useState('aktif');
  const [trash, setTrash] = useState([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [toast, setToast] = useState(null);
  const pendingChangesRef = useRef(new Set());
  const [pendingIds, setPendingIds] = useState([]);

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

  const loadTrash = useCallback(async () => {
    setLoadingTrash(true);
    try {
      const res = await fetch('/api/links?trash=1', { credentials: 'same-origin' });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || `Gagal memuat sampah (HTTP ${res.status})`);
      }
      setTrash(data || []);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoadingTrash(false);
    }
  }, [router]);

  const stats = useMemo(() => {
    const total = links.length;
    const active = links.filter((l) => l.is_active).length;
    const inactive = total - active;
    const clicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
    return { total, active, inactive, clicks };
  }, [links]);

  // Nomor berikutnya dihitung DI SERVER dari SEMUA kode (aktif + Sampah),
  // supaya generate tidak bentrok dengan kode lama yang sudah di-trash.
  const loadNextNumber = useCallback(async (prefix) => {
    try {
      const res = await fetch(`/api/links?nextfor=${encodeURIComponent(prefix)}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && Number.isInteger(data.next)) setNextNumber(data.next);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadNextNumber(genPrefix);
  }, [loadNextNumber, genPrefix, links]);

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

  async function removeCode(link) {
    const id = link.id;
    if (pendingChangesRef.current.has(id)) return;
    if (
      link.clicks > 0 &&
      !confirm(
        `Kode ${link.code} sudah discan ${link.clicks}x di lapangan. Yakin buang ke Sampah?`
      )
    ) {
      return;
    }

    pendingChangesRef.current.add(id);
    setPendingIds([...pendingChangesRef.current]);
    try {
      // Persist first; only report success once the server confirms soft-delete.
      await callApi(`/api/links/${id}`, { method: 'DELETE' });
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setTrash((prev) => prev.some((l) => l.id === id) ? prev : [{ ...link, deleted_at: new Date().toISOString() }, ...prev]);
      setToast({ id, text: `"${link.code}" dipindahkan ke Sampah.`, actionLabel: 'Urungkan', onAction: () => restoreCode(link) });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      pendingChangesRef.current.delete(id);
      setPendingIds([...pendingChangesRef.current]);
    }
  }

  async function restoreCode(link) {
    const id = link.id;
    if (pendingChangesRef.current.has(id)) return;
    pendingChangesRef.current.add(id);
    setPendingIds([...pendingChangesRef.current]);
    try {
      const updated = await callApi(`/api/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      setTrash((prev) => prev.filter((l) => l.id !== id));
      setLinks((prev) => [updated, ...prev.filter((l) => l.id !== id)]);
      setToast((current) => current?.id === id ? null : current);
      setMsg({ type: 'ok', text: `"${link.code}" dipulihkan.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      pendingChangesRef.current.delete(id);
      setPendingIds([...pendingChangesRef.current]);
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_) {}
    router.replace('/login');
  }

  async function copyLink(code) {
    const url = publicLink(code);
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

      <header className='app-bar'><a className='brand' href='/admin'><span className='brand-mark' aria-hidden='true'>r.</span>reviu<span className='brand-caption'>WORKSPACE</span></a><button onClick={logout} className='btn btn--secondary btn--small'>Keluar</button></header>
      <main className='container dashboard'>
        <div className='dashboard-heading'>
          <div>
            <p className='eyebrow'>RUANG KERJA ANDA</p>
            <h1>Setiap scan, lebih dekat.</h1>
            <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 14 }}>
              Kelola QR bisnis dan bagikan pengalaman terbaiknya.
            </p>
          </div>
          <button onClick={() => { setView('aktif'); setCreateMode(createMode ? null : 'business'); }} className='btn' aria-expanded={Boolean(createMode)} aria-controls='create-panel'>
            {createMode ? 'Tutup form' : '+ Tambah QR'}
          </button>
        </div>

        {msg && <div role='status' className={`alert alert--${msg.type}`}>{msg.text}</div>}

        {/* Statistik */}
        <div className='stats-grid'>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>TOTAL KODE</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>AKTIF</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>{stats.active}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>TIDAK AKTIF</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-warning)' }}>{stats.inactive}</div>
          </div>
          <div className='card' style={{ flex: '1 1 140px', minWidth: 120 }}>
            <div title='Jumlah akses, bukan jumlah orang unik atau ulasan.' style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>TOTAL AKSES</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.clicks}</div>
          </div>
        </div>

        {/* Tab: Daftar Kode vs Sampah */}
        <div className='section-tabs'>
          <button
            onClick={() => setView('aktif')}
            aria-pressed={view === 'aktif'}
            className={`btn btn--small ${view === 'aktif' ? '' : 'btn--secondary'}`}
          >
            Daftar QR <span className='tab-count'>{stats.total}</span>
          </button>
          <button
            onClick={() => {
              setView('sampah');
              loadTrash();
            }}
            aria-pressed={view === 'sampah'}
            className={`btn btn--small ${view === 'sampah' ? '' : 'btn--secondary'}`}
          >
            Sampah{view === 'sampah' ? ` (${trash.length})` : ''}
          </button>
        </div>

        {view === 'aktif' && (
          <>
        {createMode && <section className='create-panel' id='create-panel'>
          <div className='create-intro'><div><p className='eyebrow'>MULAI DARI SINI</p><h2>Satu QR, banyak kemungkinan.</h2><p>Hubungkan bisnis sekarang, atau siapkan kode untuk akrilik berikutnya.</p></div></div>
          <div className='mode-switch' aria-label='Jenis QR'>
            <button className='btn btn--secondary' aria-pressed={createMode === 'business'} onClick={() => setCreateMode('business')}>Untuk bisnis</button>
            <button className='btn btn--secondary' aria-pressed={createMode === 'stock'} onClick={() => setCreateMode('stock')}>Buat stok kode</button>
          </div>
        {/* Generate QR review langsung dari Google Maps */}
        {createMode === 'business' && <div className='card'>
          <h3 style={{ margin: '0 0 4px' }}>Temukan bisnis di Google Maps</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 14 }}>
            Cari nama bisnis, pilih tempat yang benar, QR code review otomatis dibuat dan bisa disimpan.
          </p>
          <PlaceQRForm onCreated={() => loadLinks()} />
        </div>}

        {/* Generate */}
        {createMode === 'stock' && <div className='card stock-form'>
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
          <h3 style={{ margin: '0 0 12px' }}>Siapkan stok akrilik</h3>
          <p className='muted'>Cetak QR sekarang. Pasangkan dengan bisnis kapan saja.</p>
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
                aria-label='Prefix kode'
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
                aria-label='Jumlah kode'
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
                Perkiraan kode berikutnya:{' '}
                <strong>
                  {genPrefix}
                  {String(nextNumber).padStart(4, '0')}
                </strong>
              </p>
            </div>
            <button onClick={handleGenerate} disabled={generating} className='btn'>
              {generating ? 'Membuat...' : 'Buat kode'}
            </button>
          </div>
        </div>}
        </section>}

        {/* Filter */}
        <div className='card filter-card'>
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
                aria-label='Cari bisnis atau kode QR'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Cari nama bisnis atau kode QR...'
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
                aria-label='Filter status QR'
                onChange={(e) => setStatusFilter(e.target.value)}
                className='input'
                style={{ width: 150, cursor: 'pointer' }}
              >
                <option value='all'>Semua</option>
                <option value='active'>Aktif</option>
                <option value='inactive'>Tidak aktif</option>
              </select>
            </div>
          </div>
        </div>

        {/* Daftar kode */}
        <div className='card qr-list'>
          <div className='row row--between' style={{ marginBottom: 14, alignItems: 'center' }}>
            <div><h2 className='list-title'>QR bisnis Anda <span className='tab-count'>{filteredLinks.length}</span></h2><p className='list-caption'>Siap ditampilkan, dibagikan, dan dipakai lagi.</p></div>
            <button onClick={() => loadLinks()} className='btn btn--secondary btn--small' disabled={loading}>
              {loading ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p>Memuat...</p>
          ) : filteredLinks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-muted)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{links.length ? 'Belum ada hasil yang cocok.' : 'QR pertama Anda dimulai di sini.'}</p>
              <p style={{ margin: '4px 0 16px', fontSize: 14 }}>{links.length ? 'Coba nama lain atau tampilkan semua status.' : 'Tambahkan bisnis atau buat stok kode untuk akrilik Anda.'}</p>
              <button className='btn btn--secondary' onClick={() => { if (links.length) { setSearch(''); setStatusFilter('all'); } else { setCreateMode('business'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>{links.length ? 'Reset pencarian' : '+ Tambah QR'}</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className='data-table'>
                <thead>
                  <tr>
                    <th>Bisnis / kode</th>
                    <th>Status</th>
                    <th>Link Tujuan</th>
                    <th>Akses</th>
                    <th style={{ minWidth: 180 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinks.map((link) => (
                    <tr key={link.id}>
                      {editingId === link.id ? (
                        <>
                          <td colSpan={2} data-label='Bisnis' className='editing-business'>
                            <code style={{ fontSize: 14, fontWeight: 600 }}>{link.code}</code>
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
                              aria-label='Nama bisnis'
                              onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })}
                              placeholder='Nama bisnis'
                              style={{ minWidth: 140, textAlign: 'left' }}
                            />
                          </td>
                          <td data-label='Link Tujuan'>
                            <input
                              className='input'
                              value={editForm.target_url}
                              aria-label='Link tujuan'
                              onChange={(e) => setEditForm({ ...editForm, target_url: e.target.value })}
                              placeholder='https://...'
                              style={{ minWidth: 180, textAlign: 'left' }}
                            />
                          </td>
                          <td data-label='Akses'>{link.clicks || 0}</td>
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
                            <div className='business-identity'>
                              <strong>{link.business_name || 'Belum dipasangkan'}</strong>
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
                              <span className='badge badge--inactive'>{link.target_url ? 'Dinonaktifkan' : 'Belum dipasang'}</span>
                            )}
                          </td>
                          <td data-label='Link Tujuan'>
                            {link.target_url ? (
                              <a
                                href={link.target_url}
                                target='_blank'
                                rel='noreferrer'
                                style={{ color: '#2563eb', wordBreak: 'break-all' }}
                              >
                                Buka tujuan ↗
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td data-label='Akses' style={{ fontWeight: 600 }}>
                            {link.clicks || 0}
                          </td>
                          <td data-label='Aksi'>
                            <div className='row' style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => link.is_active ? setQrCode(link) : startEdit(link)} className='btn btn--small'>
                                {link.is_active ? 'Lihat QR' : 'Aktivasi'}
                              </button>
                              <details className='action-menu'><summary className='btn btn--secondary btn--small' aria-label={`Opsi untuk ${link.code}`}>•••</summary><div className='action-menu-items'>
                              <button onClick={() => startEdit(link)} className='btn btn--small'>
                                Edit
                              </button>
                              {!link.is_active && <button onClick={() => setQrCode(link)} className='btn btn--secondary btn--small'>Lihat QR</button>}
                              {link.is_active && (
                                <button
                                  onClick={() => deactivate(link.id)}
                                  className='btn btn--warning btn--small'
                                >
                                  Nonaktifkan
                                </button>
                              )}
                              <button onClick={() => removeCode(link)} disabled={pendingIds.includes(link.id)} className='btn btn--danger btn--small'>
                                {pendingIds.includes(link.id) ? 'Menyimpan...' : 'Ke Sampah'}
                              </button>
                              </div></details>
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
          </>
        )}

        {view === 'sampah' && (
          <div className='card'>
            <div className='row row--between' style={{ marginBottom: 14, alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Sampah ({trash.length})</h3>
              <button onClick={() => loadTrash()} className='btn btn--secondary btn--small' disabled={loadingTrash}>
                {loadingTrash ? 'Memuat...' : 'Refresh'}
              </button>
            </div>
            <p style={{ margin: '0 0 8px', color: 'var(--color-muted)', fontSize: 13 }}>
              Kode yang masih ada di sini bisa dipulihkan. Setelah dipulihkan, QR kembali mengikuti status sebelumnya.
            </p>

            {loadingTrash ? (
              <p>Memuat...</p>
            ) : trash.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-muted)' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Sampah kosong.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className='data-table'>
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama Bisnis</th>
                      <th>Klik</th>
                      <th>Dihapus</th>
                      <th style={{ minWidth: 120 }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trash.map((link) => (
                      <tr key={link.id}>
                        <td data-label='Kode'>
                          <code style={{ fontSize: 14, fontWeight: 600 }}>{link.code}</code>
                        </td>
                        <td data-label='Nama Bisnis' style={{ fontWeight: 500 }}>
                          {link.business_name || '-'}
                        </td>
                        <td data-label='Klik' style={{ fontWeight: 600 }}>
                          {link.clicks || 0}
                        </td>
                        <td data-label='Dihapus'>
                          {link.deleted_at ? new Date(link.deleted_at).toLocaleString('id-ID') : '-'}
                        </td>
                        <td data-label='Aksi'>
                          <div className='row' style={{ justifyContent: 'flex-end' }}>
                            <button onClick={() => restoreCode(link)} disabled={pendingIds.includes(link.id)} className='btn btn--success btn--small'>
                              Pulihkan
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {toast && (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 24,
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: '#111827',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,.25)',
              maxWidth: '92vw',
            }}
          >
            <span style={{ fontSize: 14 }}>{toast.text}</span>
            {toast.actionLabel && (
              <button
                onClick={toast.onAction}
                disabled={pendingIds.includes(toast.id)}
                className='btn btn--small'
                style={{ background: '#374151', color: '#fff' }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button onClick={() => setToast(null)} className='btn btn--small' aria-label='Tutup notifikasi'>×</button>
          </div>
        )}

        <p className='dashboard-footnote'>QR tetap sama, tujuan bisa berubah. Total akses bukan jumlah pengunjung unik atau ulasan.</p>
        {qrCode && <QRModal code={qrCode.code} businessName={qrCode.business_name} isActive={qrCode.is_active} onClose={() => setQrCode(null)} />}
      </main>
    </>
  );
}
