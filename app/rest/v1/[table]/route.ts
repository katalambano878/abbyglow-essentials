import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { query } from "@/lib/db/pool";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { resolveRestActor } from "@/lib/db/rest-auth";
import {
  authorizeEmbeds,
  authorizeRestTable,
  sanitizeWriteRow,
  type RestMethod,
} from "@/lib/db/rest-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
    // supabase-js reads the row count from Content-Range on cross-origin dev hosts
    "Access-Control-Expose-Headers": "content-range, x-cache",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation") || prefer.includes("resolution=");
}

function preferUpsert(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { message, code: "PGRST", details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

function applyForceEq(qb: any, forceEq?: Record<string, string>) {
  if (!forceEq) return qb;
  let next = qb;
  for (const [col, val] of Object.entries(forceEq)) {
    next = next.eq(col, val);
  }
  return next;
}

async function hasPurchased(userId: string, productId: string): Promise<boolean> {
  try {
    const { rows } = await query(
      `SELECT 1
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1 AND oi.product_id = $2
          AND o.payment_status IN ('paid', 'partially_paid')
        LIMIT 1`,
      [userId, productId]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function ownsOrder(actor: { userId: string | null; email: string | null }, orderId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return false;
  try {
    const { rows } = await query<{ user_id: string | null; email: string | null }>(
      `SELECT user_id, email FROM orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const o = rows[0];
    if (!o) return false;
    if (actor.userId && o.user_id === actor.userId) return true;
    if (actor.email && o.email && o.email.toLowerCase() === actor.email.toLowerCase()) return true;
    return false;
  } catch {
    return false;
  }
}

async function ownsReturnRequest(actor: { userId: string | null }, requestId: string): Promise<boolean> {
  if (!actor.userId || !/^[0-9a-f-]{36}$/i.test(requestId)) return false;
  try {
    const { rows } = await query(
      `SELECT 1 FROM return_requests WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [requestId, actor.userId]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function gate(req: NextRequest, table: string, method: RestMethod) {
  const actor = await resolveRestActor(req);
  const decision = authorizeRestTable(actor, table, method);
  return { actor, decision };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const { actor, decision } = await gate(req, table, "GET");
  if (!decision.allow) return jsonError(decision.message, decision.status);

  const select = req.nextUrl.searchParams.get("select") || "*";
  const embedDecision = authorizeEmbeds(actor, table, select);
  if (!embedDecision.allow) return jsonError(embedDecision.message, embedDecision.status);

  const client = createClient();
  let qb: any = client.from(table);
  if (preferCount(req)) {
    qb = qb.select(select, {
      count: "exact",
      head: req.headers.get("prefer")?.includes("head=true"),
    });
  } else {
    qb = qb.select(select);
  }
  qb = applyForceEq(qb, decision.forceEq);

  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete("select");
  // Strip client attempts to override ownership filters
  if (decision.forceEq) {
    for (const col of Object.keys(decision.forceEq)) {
      params.delete(col);
    }
  }
  // Cap page size for non-staff callers so the catalog cannot be bulk-scraped
  // in one request and a bad client cannot pin the pool with huge scans.
  if (!actor.isStaff && !actor.isServiceRole) {
    const requested = Number(params.get("limit") || 0);
    if (!Number.isFinite(requested) || requested <= 0 || requested > 500) {
      params.set("limit", "500");
    }
  }
  applyPostgrestParams(qb, params, {
    preferSingle: preferSingle(req),
  });

  const result = await qb;
  if (result.error) {
    return jsonError(result.error.message || "Query failed", 400);
  }

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    headers.set(
      "Content-Range",
      `0-${Math.max((Array.isArray(result.data) ? result.data.length : 1) - 1, 0)}/${result.count}`
    );
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const { actor, decision } = await gate(req, table, "POST");
  if (!decision.allow) return jsonError(decision.message, decision.status);

  if (!actor.isStaff && !actor.isServiceRole) {
    const rl = checkRateLimit(`rest-write:${getClientIdentifier(req)}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rl.success) return jsonError("Too many requests. Please try again later.", 429);
  }

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  const upsert = preferUpsert(req);
  if (upsert && !actor.isStaff && !actor.isServiceRole) {
    return jsonError("Upsert requires admin access", 403);
  }

  // Non-staff callers may not set ownership / moderation / money columns.
  let payload: unknown = body;
  if (!actor.isStaff && !actor.isServiceRole) {
    if (Array.isArray(body)) {
      if (body.length > 50) return jsonError("Too many rows");
      payload = body.map((row: Record<string, unknown>) =>
        sanitizeWriteRow(actor, table, row && typeof row === "object" ? row : {}, "POST")
      );
    } else if (typeof body === "object") {
      payload = sanitizeWriteRow(actor, table, body as Record<string, unknown>, "POST");
    } else {
      return jsonError("Invalid JSON body");
    }
  }

  // Server-derived facts for customer-created rows.
  if (!actor.isStaff && !actor.isServiceRole) {
    const rows = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
    const t = table.toLowerCase();
    if (t === "reviews") {
      for (const row of rows) {
        const rating = Number(row.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonError("Rating must be 1-5");
        if (typeof row.product_id !== "string") return jsonError("product_id is required");
        row.verified_purchase = await hasPurchased(actor.userId!, row.product_id);
      }
    }
    if (t === "return_requests") {
      for (const row of rows) {
        if (typeof row.order_id !== "string" || !(await ownsOrder(actor, row.order_id))) {
          return jsonError("You can only request a return for your own orders", 403);
        }
      }
    }
    if (t === "return_items") {
      for (const row of rows) {
        if (typeof row.return_request_id !== "string" || !(await ownsReturnRequest(actor, row.return_request_id))) {
          return jsonError("Return request not found", 403);
        }
      }
    }
  }

  const client = createClient();
  const onConflict = req.nextUrl.searchParams.get("on_conflict") || "id";
  if (upsert && !/^[a-z_][a-z0-9_,]*$/i.test(onConflict)) return jsonError("Invalid on_conflict");
  let qb: any = upsert
    ? client.from(table).upsert(payload as any, { onConflict })
    : client.from(table).insert(payload as any);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*");
  }
  if (preferSingle(req)) qb = qb.single();

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Insert failed", 400);

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const { actor, decision } = await gate(req, table, "PATCH");
  if (!decision.allow) return jsonError(decision.message, decision.status);

  if (!actor.isStaff && !actor.isServiceRole) {
    const rl = checkRateLimit(`rest-write:${getClientIdentifier(req)}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rl.success) return jsonError("Too many requests. Please try again later.", 429);
  }

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");

  let patch = { ...body } as Record<string, unknown>;
  if (!actor.isStaff && !actor.isServiceRole) {
    patch = sanitizeWriteRow(actor, table, patch, "PATCH");
    if (table.toLowerCase() === "support_tickets") {
      // Customers can only close their own ticket or edit its description.
      const next: Record<string, unknown> = {};
      if (typeof patch.description === "string") next.description = patch.description;
      if (body.status === "closed") next.status = "closed";
      patch = next;
    }
    if (Object.keys(patch).length === 0) return jsonError("Nothing to update");
  }

  const client = createClient();
  let qb: any = applyForceEq(client.from(table).update(patch), decision.forceEq);
  const params = new URLSearchParams(req.nextUrl.searchParams);
  if (decision.forceEq) {
    for (const col of Object.keys(decision.forceEq)) params.delete(col);
  }
  applyPostgrestParams(qb, params);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*");
  }
  if (preferSingle(req)) qb = qb.single();

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Update failed", 400);

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const { decision } = await gate(req, table, "DELETE");
  if (!decision.allow) return jsonError(decision.message, decision.status);

  const client = createClient();
  let qb: any = applyForceEq(client.from(table).delete(), decision.forceEq);
  const params = new URLSearchParams(req.nextUrl.searchParams);
  if (decision.forceEq) {
    for (const col of Object.keys(decision.forceEq)) params.delete(col);
  }
  applyPostgrestParams(qb, params);
  if (preferReturn(req)) {
    qb = qb.select("*");
  }

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Delete failed", 400);

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}
