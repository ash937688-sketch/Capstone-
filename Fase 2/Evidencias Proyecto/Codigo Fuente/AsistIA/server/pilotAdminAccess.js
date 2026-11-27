export const PILOT_ADMIN_SCOPE = 'enrolamiento-piloto';
export const PILOT_ADMIN_EMAILS = ['usuario10@example.com'];
export function isPilotAdministrator(user) {
  return user?.role === 'Administradora' && user?.scope === PILOT_ADMIN_SCOPE && PILOT_ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
}
export function pilotAdminPathAllowed(path) {
  const pathname = new URL(path, 'http://localhost').pathname;
  return pathname.startsWith('/api/enrolamiento/') || pathname === '/api/auth/logout';
}
