import { NextRequest, NextResponse } from "next/server";
import {
  signInWithPassword,
  signUpWithPassword,
  refreshSession,
  verifyAccessToken,
  getUserById,
  updateUserPassword,
  updateUserMetadata,
  createRecoveryToken,
  consumeRecoveryToken,
} from "@/lib/db/auth";
import { isPlainPostgres } from "@/lib/db/mode";
import { checkRateLimit, getClientIdentifier, resetRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { escapeHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  };
}

function gotrueError(message: string, status = 400, code = "invalid_request") {
  return NextResponse.json(
    { error: code, error_description: message, msg: message, message },
    { status, headers: cors() }
  );
}

function sessionResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: unknown;
}) {
  return NextResponse.json(
    {
      access_token: session.access_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: session.user,
    },
    { status: 200, headers: cors() }
  );
}

/**
 * reCAPTCHA is enforced server-side when both keys are configured. supabase-js
 * forwards `options.captchaToken` as `gotrue_meta_security.captcha_token`, which
 * is exactly where GoTrue expects it.
 */
async function captchaOk(body: Record<string, any>, actions: string[]): Promise<string | null> {
  if (!process.env.RECAPTCHA_SECRET_KEY || !process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null;
  const token = body?.gotrue_meta_security?.captcha_token;
  if (!token || typeof token !== "string") {
    return "Security verification is required. Please refresh the page and try again.";
  }
  const result = await verifyRecaptcha(token);
  if (!result.success) return "Security verification failed. Please try again.";
  void actions; // v3 actions are advisory; the score threshold is enforced in verifyRecaptcha
  return null;
}

function appUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug === "user") {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return gotrueError("No authorization header", 401, "no_authorization");
    const verified = await verifyAccessToken(token);
    if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");
    const user = await getUserById(verified.userId);
    if (!user) return gotrueError("User not found", 401, "user_not_found");
    return NextResponse.json(user, { headers: cors() });
  }

  if (slug === "settings" || slug === "health") {
    return NextResponse.json({ external: {}, disable_signup: false }, { headers: cors() });
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");
  const url = req.nextUrl;
  const contentType = req.headers.get("content-type") || "";
  const clientId = getClientIdentifier(req);

  let body: Record<string, any> = {};
  if (contentType.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, any>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  }

  // /auth/v1/token?grant_type=password|refresh_token
  if (slug === "token") {
    const grant =
      url.searchParams.get("grant_type") ||
      body.grant_type ||
      "password";

    if (grant === "password") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) {
        return gotrueError("Email and password are required", 400, "invalid_grant");
      }

      const ipLimit = checkRateLimit(`auth-login-ip:${clientId}`, RATE_LIMITS.authLoginIp);
      const accountKey = `auth-login-account:${email}`;
      const accountLimit = checkRateLimit(accountKey, RATE_LIMITS.authLoginAccount);
      if (!ipLimit.success || !accountLimit.success) {
        return gotrueError(
          "Too many sign-in attempts. Please wait a few minutes and try again.",
          429,
          "over_request_rate_limit"
        );
      }

      const captchaError = await captchaOk(body, ["login", "admin_login"]);
      if (captchaError) return gotrueError(captchaError, 400, "captcha_failed");

      const { session, error } = await signInWithPassword(email, password);
      if (error || !session) {
        return gotrueError(error || "Invalid login credentials", 400, "invalid_grant");
      }
      resetRateLimit(accountKey);
      return sessionResponse(session);
    }

    if (grant === "refresh_token") {
      const refresh = String(body.refresh_token || "");
      const { session, error } = await refreshSession(refresh);
      if (error || !session) {
        return gotrueError(error || "Invalid refresh token", 400, "invalid_grant");
      }
      return sessionResponse(session);
    }

    return gotrueError(`Unsupported grant_type: ${grant}`);
  }

  if (slug === "signup") {
    const limit = checkRateLimit(`auth-signup:${clientId}`, RATE_LIMITS.authSignup);
    if (!limit.success) {
      return gotrueError("Too many accounts created from this network. Please try again later.", 429, "over_request_rate_limit");
    }
    const captchaError = await captchaOk(body, ["signup"]);
    if (captchaError) return gotrueError(captchaError, 400, "captcha_failed");

    const rawMeta = body.data || body.user_metadata || {};
    const meta: Record<string, unknown> = {};
    // Only keep plain profile fields from the client; never trust role-like keys.
    for (const key of ["first_name", "last_name", "full_name", "phone", "newsletter"]) {
      if (rawMeta[key] !== undefined) meta[key] = rawMeta[key];
    }

    const { session, error } = await signUpWithPassword({
      email: String(body.email || ""),
      password: String(body.password || ""),
      data: meta,
    });
    if (error || !session) {
      return gotrueError(error || "Signup failed", 400);
    }

    // Welcome message is sent from the server so the public notifications API
    // does not need to accept it from anonymous callers.
    try {
      const { sendWelcomeMessage } = await import("@/lib/notifications");
      const firstName =
        (typeof meta.first_name === "string" && meta.first_name.trim()) ||
        (typeof meta.full_name === "string" && meta.full_name.trim().split(" ")[0]) ||
        "there";
      void sendWelcomeMessage({
        email: session.user.email,
        firstName,
        phone: typeof meta.phone === "string" ? meta.phone : undefined,
      }).catch((err: unknown) => console.error("[auth] welcome message failed:", err));
    } catch (err) {
      console.error("[auth] welcome message failed:", err);
    }

    return sessionResponse(session);
  }

  if (slug === "logout") {
    // Sessions are stateless JWTs; the client discards its tokens. A JSON body
    // on a 204 throws in the Response constructor, so answer with no body.
    return new NextResponse(null, { status: 204, headers: cors() });
  }

  if (slug === "recover") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return gotrueError("Email is required");

    const ipLimit = checkRateLimit(`auth-recover-ip:${clientId}`, RATE_LIMITS.authRecoverIp);
    const accountLimit = checkRateLimit(`auth-recover-account:${email}`, RATE_LIMITS.authRecoverAccount);
    if (!ipLimit.success || !accountLimit.success) {
      return gotrueError("Too many reset requests. Please try again later.", 429, "over_request_rate_limit");
    }
    const captchaError = await captchaOk(body, ["forgot_password"]);
    if (captchaError) return gotrueError(captchaError, 400, "captcha_failed");

    try {
      const recovery = await createRecoveryToken(email);
      if (recovery) {
        const { sendEmail, emailLayout } = await import("@/lib/notifications");
        const link = `${appUrl(req)}/auth/reset-password?token=${recovery.token}`;
        const name = escapeHtml(recovery.fullName || "there");
        await sendEmail({
          to: recovery.email,
          subject: "Reset your AbbyGlow Essentials password",
          html: emailLayout(
            `
<div style="text-align:center;margin-bottom:24px;">
  <h2 style="margin:0 0 4px;color:#111827;font-size:22px;">Reset your password</h2>
  <p style="margin:0;color:#6b7280;font-size:14px;">Hi ${name}, we received a request to reset your password.</p>
</div>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Click the button below to choose a new password. This link is valid for 1 hour and can be used once.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr>
<td style="background-color:#0A0A0A;border-radius:8px;"><a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Choose a new password</a></td>
</tr></table>
<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Or copy this link: <a href="${link}" style="color:#0A0A0A;">${link}</a></p>
<p style="color:#9ca3af;font-size:12px;text-align:center;margin:16px 0 0;">If you did not ask for this, you can ignore this email — your password will not change.</p>
`,
            "Reset your password"
          ),
        });
      }
    } catch (err) {
      console.error("[auth] recover failed:", err);
    }
    // Always 200 so account existence cannot be probed.
    return NextResponse.json({}, { status: 200, headers: cors() });
  }

  if (slug === "verify") {
    const type = String(body.type || url.searchParams.get("type") || "");
    const token = String(body.token_hash || body.token || url.searchParams.get("token") || "");
    if (type !== "recovery") return gotrueError(`Unsupported verification type: ${type || "none"}`);
    const limit = checkRateLimit(`auth-verify:${clientId}`, RATE_LIMITS.authRecoverIp);
    if (!limit.success) {
      return gotrueError("Too many attempts. Please try again later.", 429, "over_request_rate_limit");
    }
    const { session, error } = await consumeRecoveryToken(token);
    if (error || !session) return gotrueError(error || "Invalid or expired reset link", 403, "otp_expired");
    return sessionResponse(session);
  }

  return gotrueError(`Unknown auth path: ${slug}`, 404);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isPlainPostgres()) return gotrueError("DATABASE_URL not set", 503);

  const { path } = await ctx.params;
  const slug = path.join("/");

  if (slug !== "user") {
    return gotrueError(`Unknown auth path: ${slug}`, 404);
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return gotrueError("No authorization header", 401, "no_authorization");
  const verified = await verifyAccessToken(token);
  if (!verified) return gotrueError("Invalid JWT", 401, "invalid_token");

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;

  if (body.password) {
    const { user, error } = await updateUserPassword(verified.userId, String(body.password));
    if (error || !user) return gotrueError(error || "Update failed");
    return NextResponse.json(user, { headers: cors() });
  }

  if (body.data || body.user_metadata) {
    const raw = body.data || body.user_metadata || {};
    const data: Record<string, unknown> = {};
    for (const key of ["first_name", "last_name", "full_name", "phone", "newsletter", "avatar_url"]) {
      if (raw[key] !== undefined) data[key] = raw[key];
    }
    const { user, error } = await updateUserMetadata(verified.userId, data);
    if (error || !user) return gotrueError(error || "Update failed");
    return NextResponse.json(user, { headers: cors() });
  }

  const user = await getUserById(verified.userId);
  return NextResponse.json(user, { headers: cors() });
}
