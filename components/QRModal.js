import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { publicLink } from '../lib/publicLink';

// Modal buat lihat/download QR code dari domain publik tetap.
// Dipakai dari dashboard admin (tombol "QR" di tiap baris Daftar Kode).
export default function QRModal({ code, businessName, isActive, onClose }) {
  const dialogRef = useRef(null);
  const [dataUrl, setDataUrl] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const link = publicLink(code);
    setUrl(link);
    QRCode.toDataURL(link, { width: 960, margin: 4, errorCorrectionLevel: 'M' }).then((d) => {
      if (!cancelled) setDataUrl(d);
    }).catch(() => { if (!cancelled) setError('QR belum berhasil dibuat. Tutup dan coba kembali.'); });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Kunci scroll di belakang modal
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialogRef.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setError('Tidak bisa menyalin otomatis. Salin alamat yang ditampilkan di bawah QR.'); }
  }

  return (
    <dialog ref={dialogRef} className={`qr-dialog ${presenting ? 'qr-dialog--presenting' : ''}`} aria-labelledby='qr-title' onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className='qr-dialog-toolbar'>
        <span className='brand'>reviu<span className='brand-dot'>.</span></span>
        <button className='btn btn--secondary btn--small' onClick={onClose} autoFocus>Tutup ×</button>
      </div>
      <div className='qr-presentation'>
        <p className='eyebrow'>{isActive ? 'PENGALAMAN ANDA BERARTI' : 'SIAP UNTUK DIPASANGKAN'}</p>
        <h2 id='qr-title'>{businessName || 'QR bisnis Anda'}</h2>
        <p className='muted'>{isActive ? 'Scan QR ini untuk berbagi ulasan Anda.' : 'Aktifkan kode ini sebelum dibagikan kepada pelanggan.'}</p>
        <div className='qr-image-frame'>
          {dataUrl ? <img src={dataUrl} alt={`QR ${businessName || code}`} width='320' height='320' /> : <p role='status'>{error || 'Menyiapkan QR...'}</p>}
        </div>
        <code className='qr-code-label'>{code}</code>
        <p className='qr-url'>{url}</p>
        {isActive && <p className='qr-instruction'>Buka kamera · Arahkan ke QR · Tulis ulasan</p>}
      </div>
      {error && <p role='alert' className='alert alert--error'>{error}</p>}
      <div className='qr-dialog-actions'>
        {dataUrl && <a className='btn' href={dataUrl} download={`${code}-qr.png`}>Unduh PNG</a>}
        <button className='btn btn--secondary' onClick={copy}>{copied ? 'Link disalin' : 'Salin link'}</button>
        <button className='btn btn--secondary' onClick={() => setPresenting(!presenting)} aria-pressed={presenting}>{presenting ? 'Tampilan ringkas' : 'Mode presentasi'}</button>
        {isActive && <a className='qr-test-link' href={url} target='_blank' rel='noreferrer'>Tes QR ↗</a>}
      </div>
    </dialog>
  );
}
