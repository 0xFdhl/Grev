'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import QRCode from 'qrcode';

// Kunci Maps dibaca dari environment variable (JANGAN di-hardcode).
// Cara dapetinnya: buka https://developers.google.com/maps/demo-key, login akun Google,
// klik "Get a Demo Key". Gratis & tanpa kartu kredit.
//
// PERHATIAN: ini adalah "Maps Demo Key" khusus untuk testing/prototyping.
// - Ada limit pemakaian harian, jadi cocok cuma buat pengembangan/coba-coba.
// - JANGAN dipakai di production.
// - Kalau nanti traffic-nya sudah besar, upgrade ke API key berbayar dengan
//   billing account, lalu taruh key-nya di environment variable yang sama.
const MAPS_DEMO_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY;

// Flag module-level biar script Maps JS API cuma di-inject sekali,
// walau effect dipanggil ulang (misalnya React StrictMode di mode dev).
let mapsScriptPromise = null;

function loadMapsScript() {
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    // Kalau script sudah pernah dimuat (misal hot reload), langsung lanjut
    if (window.google && window.google.maps && window.google.maps.importLibrary) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-maps-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Gagal memuat Google Maps JS API.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_DEMO_KEY}&v=weekly`;
    script.async = true;
    script.dataset.mapsLoader = 'true';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Gagal memuat Google Maps JS API.')));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

function sanitizeFilename(value) {
  return (value || 'cafe').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'cafe';
}

export default function PlaceQRForm() {
  const router = useRouter();
  const autocompleteRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [reviewLink, setReviewLink] = useState('');
  const [location, setLocation] = useState(null); // { lat, lng }

  // Hasil setelah disimpan ke server (kode + short link + QR)
  const [code, setCode] = useState('');
  const [shortLink, setShortLink] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [msg, setMsg] = useState(null);

  // 1) Load Maps JS API secara dinamis (hanya di browser), lalu import library "places"
  //    (untuk <gmp-place-autocomplete>) dan "maps" (untuk peta + marker lokasi cafe).
  useEffect(() => {
    if (!MAPS_DEMO_KEY) {
      setLoadError('NEXT_PUBLIC_GOOGLE_MAPS_DEMO_KEY belum diisi di .env.local.');
      return;
    }

    let cancelled = false;
    loadMapsScript()
      .then(() =>
        Promise.all([google.maps.importLibrary('places'), google.maps.importLibrary('maps')])
      )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat Google Maps.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) <gmp-place-autocomplete> adalah custom element, BUKAN komponen React biasa.
  //    Jadi event "gmp-select" dipasang lewat ref + addEventListener di useEffect,
  //    bukan lewat prop JSX (misal onSelect) karena custom element tidak punya prop itu.
  useEffect(() => {
    const el = autocompleteRef.current;
    if (!ready || !el) return;

    async function handleSelect(event) {
      const { placePrediction } = event;
      if (!placePrediction) return;

      setFetching(true);
      setMsg(null);
      try {
        // Ambil detail place: nama + Place ID + koordinat (buat ditampilkan di peta)
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'id', 'location'] });

        const displayName = place.displayName || '';
        const id = place.id || '';

        if (!id) {
          setMsg({ type: 'error', text: 'Place ID tidak ditemukan. Coba pilih tempat lain.' });
          return;
        }

        const lat = place.location ? place.location.lat() : null;
        const lng = place.location ? place.location.lng() : null;

        // Generate link review dari Place ID
        const link = `https://search.google.com/local/writereview?placeid=${id}`;

        // Reset hasil simpan sebelumnya, simpan data tempat terpilih
        setName(displayName);
        setPlaceId(id);
        setReviewLink(link);
        setLocation(lat != null && lng != null ? { lat, lng } : null);
        setCode('');
        setShortLink('');
        setQrDataUrl('');
        setIsFullscreen(false);
      } catch (err) {
        setMsg({ type: 'error', text: err.message || 'Gagal mengambil data tempat.' });
      } finally {
        setFetching(false);
      }
    }

    el.addEventListener('gmp-select', handleSelect);
    return () => el.removeEventListener('gmp-select', handleSelect);
  }, [ready]);

  // 3) Buat peta + marker begitu cafe terpilih (ada koordinat). Dipakai legacy Marker
  //    karena tidak butuh Map ID, jadi cocok untuk Maps Demo Key (tanpa billing).
  useEffect(() => {
    if (!ready || !location) return;
    const div = mapDivRef.current;
    if (!div) return;

    const map = new google.maps.Map(div, {
      center: location,
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
    });
    mapInstanceRef.current = map;
    new google.maps.Marker({ map, position: location, title: name });

    return () => {
      mapInstanceRef.current = null;
      // Kosongkan div biar peta bisa dibuat ulang bersih (aman di React StrictMode).
      div.replaceChildren();
    };
  }, [ready, location, name]);

  // 4) Saat masuk/keluar fullscreen, ukuran container peta berubah -> trigger resize.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const timer = setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
      if (location) map.setCenter(location);
    }, 60);

    return () => clearTimeout(timer);
  }, [isFullscreen, location]);

  // 5) Kunci scroll halaman di belakang overlay saat fullscreen.
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isFullscreen]);

  // Simpan cafe ke tabel links (kode auto-generated di server), lalu buat QR dari
  // short link {origin}/{code} supaya klik terhitung & bisa di-repoint ke cafe lain
  // tanpa cetak ulang akrilik. Auth pakai cookie session (bukan token manual).
  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cafe',
          business_name: name,
          target_url: reviewLink,
          place_id: placeId,
          website: honeypot,
        }),
      });

      if (res.status === 401) {
        router.replace('/admin/login');
        throw new Error('Sesi berakhir. Silakan login kembali.');
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || `Gagal menyimpan (HTTP ${res.status})`);
      }

      const newCode = data.code;
      const link = `${window.location.origin}/${newCode}`;
      const dataUrl = await QRCode.toDataURL(link);

      setCode(newCode);
      setShortLink(link);
      setQrDataUrl(dataUrl);
      setMsg({ type: 'ok', text: `Kode ${newCode} dibuat. QR siap diunduh.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {loadError && <div className='alert alert--error'>{loadError}</div>}

      {!ready && !loadError && (
        <p style={{ color: 'var(--color-muted)' }}>Memuat Google Maps...</p>
      )}

      {ready && (
        <gmp-place-autocomplete ref={autocompleteRef} placeholder='Cari nama cafe...' />
      )}

      {/* Honeypot anti-bot (konsisten dengan form lain di dashboard) */}
      <input
        type='text'
        name='website'
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete='off'
        aria-hidden='true'
        style={{ display: 'none' }}
      />

      {fetching && (
        <p style={{ color: 'var(--color-muted)', marginTop: 10 }}>Memuat data tempat...</p>
      )}

      {name && (
        <div className='stack' style={{ marginTop: 16 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{name}</p>
          <a
            href={reviewLink}
            target='_blank'
            rel='noreferrer'
            style={{ color: '#2563eb', wordBreak: 'break-all' }}
          >
            {reviewLink}
          </a>

          {location && (
            <div
              style={
                isFullscreen
                  ? {
                      position: 'fixed',
                      inset: 0,
                      zIndex: 1000,
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                    }
                  : { marginTop: 4 }
              }
            >
              {isFullscreen && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: 12,
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </div>
                  <button onClick={() => setIsFullscreen(false)} className='btn btn--small'>
                    Tutup
                  </button>
                </div>
              )}

              <div style={isFullscreen ? { flex: 1, minHeight: 0 } : { position: 'relative' }}>
                <div
                  ref={mapDivRef}
                  style={{
                    width: '100%',
                    height: isFullscreen ? '100%' : 240,
                    borderRadius: isFullscreen ? 0 : 8,
                    border: isFullscreen ? 'none' : '1px solid var(--color-border)',
                  }}
                />
              </div>

              {!isFullscreen && (
                <div className='row' style={{ marginTop: 10 }}>
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className='btn btn--secondary btn--small'
                  >
                    Fullscreen
                  </button>
                </div>
              )}
            </div>
          )}

          {qrDataUrl ? (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                Kode: <code style={{ fontWeight: 700 }}>{code}</code>
              </p>
              <a
                href={shortLink}
                target='_blank'
                rel='noreferrer'
                style={{ color: '#2563eb', wordBreak: 'break-all' }}
              >
                {shortLink}
              </a>
              <img
                src={qrDataUrl}
                alt={`QR code review ${name}`}
                style={{ width: 200, height: 200, border: '1px solid var(--color-border)', borderRadius: 8 }}
              />
              <div className='row'>
                <a href={qrDataUrl} download={`${sanitizeFilename(name)}-qr.png`} className='btn'>
                  Download PNG
                </a>
              </div>
            </>
          ) : (
            <div className='row'>
              <button onClick={handleSave} disabled={saving} className='btn btn--success'>
                {saving ? 'Menyimpan...' : 'Simpan & buat QR'}
              </button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <div className={`alert alert--${msg.type}`} style={{ marginTop: 14, marginBottom: 0 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
