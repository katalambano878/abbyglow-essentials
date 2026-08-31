import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveRestActor } from "@/lib/db/rest-auth";
import { authorizeRestTable, type RestMethod } from "@/lib/db/rest-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
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

  const { decision } = await gate(req, table, "GET");
  if (!decision.allow) return jsonError(decision.message, decision.status);

  const client = createClient();
  let qb: any = client.from(table);
  const select = req.nextUrl.searchParams.get("select") || "*";
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

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  // Prevent privilege escalation on profile create / order user_id spoofing for non-staff
  let payload = body;
  if (!actor.isStaff && !actor.isServiceRole && table === "orders") {
    const rows = Array.isArray(body) ? body : [body];
    // Never trust client-supplied user_id / payment_status / totals for anon/customer inserts.
    // Authenticated users bind to their session; guests get null (not a spoofed UUID).
    payload = rows.map((row: Record<string, unknown>) => {
      const {
        user_id: _ignoreUserId,
        payment_status: _ignorePay,
        total: _ignoreTotal,
        subtotal: _ignoreSub,
        ...safe
      } = row;
      return {
        ...safe,
        user_id: actor.userId || null,
        payment_status: "pending",
        status: typeof row.status === "string" ? row.status : "pending",
      };
    });
    if (!Array.isArray(body)) payload = payload[0];
  }
  if (!actor.isStaff && !actor.isServiceRole && table === "profiles" && actor.userId) {
    if (Array.isArray(body)) {
      payload = body.map((row: Record<string, unknown>) => ({
        ...row,
        id: actor.userId,
        role: "customer",
      }));
    } else {
      payload = { ...body, id: actor.userId, role: "customer" };
    }
  }

  const client = createClient();
  let qb: any = client.from(table).insert(payload);
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

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");

  let patch = { ...body } as Record<string, unknown>;
  if (!actor.isStaff && !actor.isServiceRole) {
    delete patch.role;
    delete patch.payment_status;
    delete patch.total;
    delete patch.user_id;
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
