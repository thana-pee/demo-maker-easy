import {
  extractBearerToken,
  getServerBillingConfig,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from './serverWallet';

export interface AdminAuthResult {
  authorized: boolean;
  authMethod?: 'admin-key' | 'google-admin';
  viewerEmail?: string;
  status: number;
  code?: string;
  error?: string;
}

export function parseAdminEmails(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const clean = part.trim().toLowerCase();
    if (clean && clean.includes('@')) {
      seen.add(clean);
    }
  }
  return Array.from(seen);
}

export function isStaticKeyAuthorized(
  request: Request,
  adminKey: string,
  serviceRoleKey: string
): boolean {
  const expectedKey = adminKey || serviceRoleKey;
  if (!expectedKey) return false;

  const headerKey = request.headers.get('x-analytics-key')?.trim() || '';
  const bearerKey = extractBearerToken(request) || '';
  return (Boolean(headerKey) && headerKey === expectedKey) || (Boolean(bearerKey) && bearerKey === expectedKey);
}

export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export async function verifyAdminRequest(
  request: Request,
  options?: {
    adminKey?: string;
    adminEmails?: string;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
  }
): Promise<AdminAuthResult> {
  const config = options?.config ?? getServerBillingConfig();
  const adminKey = (options?.adminKey ?? process.env.ANALYTICS_ADMIN_KEY ?? '').trim();
  const adminEmails = parseAdminEmails(
    options?.adminEmails ?? process.env.ANALYTICS_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS
  );

  if (isStaticKeyAuthorized(request, adminKey, config.serviceRoleKey)) {
    return {
      authorized: true,
      authMethod: 'admin-key',
      status: 200,
    };
  }

  const bearerToken = extractBearerToken(request) || '';
  if (bearerToken && looksLikeJwt(bearerToken)) {
    const auth = await verifySupabaseUserFromRequest(request, {
      config,
      fetchFn: options?.fetchFn,
    });
    if (auth.ok) {
      const viewerEmail = auth.user.email;
      const normalizedEmail = auth.user.email?.trim().toLowerCase() || '';
      if (adminEmails.length === 0) {
        return {
          authorized: false,
          status: 403,
          code: 'ADMIN_EMAILS_NOT_CONFIGURED',
          error:
            'ยังไม่ได้ตั้งค่า ANALYTICS_ADMIN_EMAILS บนเซิร์ฟเวอร์ (เพิ่มอีเมลของคุณใน Vercel หรือกรอก ANALYTICS_ADMIN_KEY)',
          ...(viewerEmail ? { viewerEmail } : {}),
        };
      }
      if (!normalizedEmail || !adminEmails.includes(normalizedEmail)) {
        return {
          authorized: false,
          status: 403,
          code: 'ANALYTICS_FORBIDDEN',
          error: 'บัญชี Google นี้ไม่ได้อยู่ในรายชื่อผู้ดูแลระบบ (ANALYTICS_ADMIN_EMAILS)',
          ...(viewerEmail ? { viewerEmail } : {}),
        };
      }
      return {
        authorized: true,
        authMethod: 'google-admin',
        viewerEmail,
        status: 200,
      };
    }
  }

  return {
    authorized: false,
    status: 401,
    code: 'ANALYTICS_UNAUTHORIZED',
    error: 'Unauthorized: provide x-analytics-key or sign in with an authorized Google admin email',
  };
}
