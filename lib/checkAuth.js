import { verifySessionToken, SESSION_COOKIE_NAME } from './session';

// Session admin diverifikasi dari cookie httpOnly yang ditandatangani HMAC.
// Cookie hanya bisa di-set lewat /api/login setelah password cocok.

export function checkAuth(req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  return verifySessionToken(token);
}
