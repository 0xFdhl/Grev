import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE_NAME = 'reviu_session';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // maksimal 2 jam

function isSecureRequest(req) {
  const forwardedProto = req?.headers?.['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0].trim()
    : '';
  return protocol === 'https' || Boolean(req?.socket?.encrypted || req?.connection?.encrypted);
}

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('SESSION_SECRET (atau ADMIN_PASSWORD) belum diisi di .env.local');
  }
  return secret;
}

export function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length === 0) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expiresAt = Number(payload);
  if (!Number.isInteger(expiresAt) || Date.now() > expiresAt) return false;

  const expected = createHmac('sha256', getSecret()).update(payload).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}

export function setSessionCookie(res, req) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${createSessionToken()}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`
  );
}
