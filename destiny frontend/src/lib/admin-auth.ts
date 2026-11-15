export const ADMIN_COOKIE_NAME = 'destiny_admin_token';

export function getAdminSecretKey(): string {
  return process.env.ADMIN_SECRET_KEY || 'destiny-staff-secret-key-2026';
}

export interface AdminAuthRequestLike {
  cookies: {
    get(name: string): { value?: string } | undefined;
  };
  headers: {
    get(name: string): string | null;
  };
}

export function verifyAdminAuth(request: AdminAuthRequestLike): boolean {
  const secret = getAdminSecretKey();

  // 1. Check Bearer Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === secret) return true;
  }

  // 2. Check Cookie
  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (cookie && cookie === secret) {
    return true;
  }

  return false;
}
