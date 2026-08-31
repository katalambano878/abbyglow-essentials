import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveRestActor } from "@/lib/db/rest-auth";
import { authorizeRpc } from "@/lib/db/rest-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ fn: string }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ message: "DATABASE_URL not set" }, { status: 503 });
  }
  const { fn } = await ctx.params;
  if (!PG_IDENT.test(fn)) {
    return NextResponse.json({ message: "Invalid function name" }, { status: 400 });
  }

  const actor = await resolveRestActor(req);
  const decision = authorizeRpc(actor, fn);
  if (!decision.allow) {
    return NextResponse.json(
      { message: decision.message, code: "PGRST301" },
      { status: decision.status, headers: cors }
    );
  }

  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Prevent spoofing user_id on public customer upsert
  if (fn === "upsert_customer_from_order" && !actor.isStaff && !actor.isServiceRole) {
    if (actor.userId) {
      args.p_user_id = actor.userId;
    } else {
      args.p_user_id = null;
    }
  }

  const client = createClient();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return NextResponse.json(
      { message: error.message, code: "PGRST202" },
      { status: 400, headers: cors }
    );
  }
  return NextResponse.json(data, { headers: cors });
}
