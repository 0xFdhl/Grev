'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Modal buat lihat/download QR code dari short link {origin}/{code}.
// Dipakai dari dashboard admin (tombol "QR" di tiap baris Daftar Kode).
export default function QRModal({ code, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = `${window.location.origin}/${code}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Kunci scroll di belakang modal
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className='card' style={{ maxWidth: 360, width: '100%', margin: 0, textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px' }}>QR Code {code}</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--color-muted)', fontSize: 13, wordBreak: 'break-all' }}>
          {url}
        </p>
        {dataUrl ? (
          <img src={dataUrl} alt={`QR ${code}`} style={{ width: 220, height: 220 }} />
        ) : (
          <p style={{ color: 'var(--color-muted)' }}>Membuat QR...</p>
        )}
        <div className='row' style={{ justifyContent: 'center', marginTop: 16 }}>
          {dataUrl && (
            <a href={dataUrl} download={`${code}-qr.png`} className='btn'>
              Download PNG
            </a>
          )}
          <button onClick={onClose} className='btn btn--secondary'>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
