export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1>Reviu App</h1>
      <p>Sistem redirect QR/NFC untuk Google Review.</p>
      <a href="/admin">Masuk ke Dashboard Admin →</a>
    </div>
  );
}
