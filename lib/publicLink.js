// One permanent origin for printed QR codes and programmed NFC tags.
const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://bebetterdevelo.online';
const parsedOrigin = new URL(configuredOrigin);
if (parsedOrigin.protocol !== 'https:' || parsedOrigin.username || parsedOrigin.password ||
    parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
  throw new Error('NEXT_PUBLIC_SITE_URL harus berupa origin HTTPS tanpa path, query, atau password.');
}
const PUBLIC_ORIGIN = parsedOrigin.origin;

export function publicLink(code) {
  return `${PUBLIC_ORIGIN}/${encodeURIComponent(code)}`;
}
