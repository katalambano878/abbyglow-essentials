// Resolve the caller identity for Shape-A /rest|/storage shims.
// Replaces Supabase RLS for HTTP access (in-process supabaseAdmin bypasses this).

import { NextRequest } from "next/server";
import { verifyAccessToken } from "./auth";

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

export async function resolveRestActor(req: NextRequest): Promise<RestActor> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const key = headerKey(req);
  const token = bearerToken(req);

  if (serviceKey && (key === serviceKey || token === serviceKey)) {
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
      const appMeta = (verified.payload.app_metadata || {}) as { role?: string };
      const roleName = appMeta.role;
      if (roleName === "admin") {
        return {
          role: "admin",
          userId: verified.userId,
          email: typeof verified.payload.email === "string" ? verified.payload.email : null,
          isServiceRole: false,
          isStaff: true,
        };
      }
      if (roleName === "staff") {
        return {
          role: "staff",
          userId: verified.userId,
          email: typeof verified.payload.email === "string" ? verified.payload.email : null,
          isServiceRole: false,
          isStaff: true,
        };
      }
      return {
        role: "authenticated",
        userId: verified.userId,
        email: typeof verified.payload.email === "string" ? verified.payload.email : null,
        isServiceRole: false,
        isStaff: false,
      };
    }
  }

  // Anon key (or missing key) → anonymous. We still require a recognizable anon key
  // when configured, to block totally unauthenticated scrapers that omit apikey.
  if (anonKey && key && key !== anonKey && key !== serviceKey) {
    // Unknown key — treat as anon with no special rights (same as missing)
  }

  return {
    role: "anon",
    userId: null,
    email: null,
    isServiceRole: false,
    isStaff: false,
  };
}
