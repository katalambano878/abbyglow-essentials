// Resolve the caller identity for Shape-A /rest|/storage shims.
// Replaces Supabase RLS for HTTP access (in-process supabaseAdmin bypasses this).

import { NextRequest } from "next/server";
import { verifyAccessToken } from "./auth";
import { query } from "./pool";

export type RestRole = "anon" | "authenticated" | "staff" | "admin" | "service_role";

export interface RestActor {
  role: RestRole;
  userId: string | null;
  email: string | null;
  isServiceRole: boolean;
  isStaff: boolean;
}

function headerKey(req: NextRequest): string | null {
  const apikey = req.headers.get("apikey") || req.headers.get("x-api-key");
  if (apikey) return apikey.trim();
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

// Staff/admin claims live in the JWT, which is valid for hours. Re-check the
// profile role against the database (briefly cached) so a demoted or deleted
// staff account loses privileged data access immediately, not at token expiry.
const ROLE_CACHE_TTL_MS = 60_000;
const roleCache = new Map<string, { role: string | null; until: number }>();

async function currentRole(userId: string): Promise<string | null> {
  const now = Date.now();
  const cached = roleCache.get(userId);
  if (cached && cached.until > now) return cached.role;
  let role: string | null = null;
  try {
    const { rows } = await query<{ role: string | null }>(
      `SELECT p.role::text AS role
         FROM profiles p
         JOIN auth.users u ON u.id = p.id
        WHERE p.id = $1 AND u.deleted_at IS NULL
        LIMIT 1`,
      [userId]
    );
    role = rows[0]?.role ?? null;
  } catch {
    role = null;
  }
  if (roleCache.size > 5000) roleCache.clear();
  roleCache.set(userId, { role, until: now + ROLE_CACHE_TTL_MS });
  return role;
}

/** Drop a cached role (call after changing a profile's role). */
export function invalidateRoleCache(userId?: string): void {
  if (userId) roleCache.delete(userId);
  else roleCache.clear();
}

export async function resolveRestActor(req: NextRequest): Promise<RestActor> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const key = headerKey(req);
  const token = bearerToken(req);

  if (serviceKey && serviceKey.length >= 16 && (key === serviceKey || token === serviceKey)) {
    return {
      role: "service_role",
      userId: null,
      email: null,
      isServiceRole: true,
      isStaff: true,
    };
  }

  // Prefer JWT when present (supabase-js sends both apikey=anon and Authorization=Bearer jwt)
  if (token && token !== anonKey && (!serviceKey || token !== serviceKey)) {
    const verified = await verifyAccessToken(token);
    if (verified) {
      const email = typeof verified.payload.email === "string" ? verified.payload.email : null;
      const appMeta = (verified.payload.app_metadata || {}) as { role?: string };
      const claimed = appMeta.role;
      if (claimed === "admin" || claimed === "staff") {
        const live = await currentRole(verified.userId);
        const effective = live === "admin" || live === "staff" ? live : null;
        if (effective) {
          return {
            role: effective,
            userId: verified.userId,
            email,
            isServiceRole: false,
            isStaff: true,
          };
        }
      }
      return {
        role: "authenticated",
        userId: verified.userId,
        email,
        isServiceRole: false,
        isStaff: false,
      };
    }
  }

  return {
    role: "anon",
    userId: null,
    email: null,
    isServiceRole: false,
    isStaff: false,
  };
}
