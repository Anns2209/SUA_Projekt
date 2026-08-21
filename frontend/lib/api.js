// Centralno mesto za URL-je vseh mikrostoritev.
// V brskalniku (client-side) kličemo storitve preko localhost portov,
// ki so v docker-compose.yml mapirani na gostiteljski stroj.

export const LOGIN_SERVICE_URL =
  process.env.NEXT_PUBLIC_LOGIN_SERVICE_URL || 'http://localhost:5001';
export const MENU_SERVICE_URL =
  process.env.NEXT_PUBLIC_MENU_SERVICE_URL || 'http://localhost:5002';
export const ORDER_SERVICE_URL =
  process.env.NEXT_PUBLIC_ORDER_SERVICE_URL || 'http://localhost:5003';
export const SHIPPING_SERVICE_URL =
  process.env.NEXT_PUBLIC_SHIPPING_SERVICE_URL || 'http://localhost:5004';

export function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}