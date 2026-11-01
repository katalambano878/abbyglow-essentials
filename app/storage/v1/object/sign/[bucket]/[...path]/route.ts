import { readObject, verifyObjectToken, parseObjectPath } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  const objectPath = parseObjectPath(path);
  if (!objectPath || !/^[a-z0-9][a-z0-9-_]{0,62}$/.test(bucket)) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const exp = Number(url.searchParams.get("exp") || 0);

  if (!verifyObjectToken(bucket, objectPath, exp, token)) {
    return new Response(JSON.stringify({ error: "Invalid or expired signature" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const obj = await readObject(bucket, objectPath);
  if (!obj) {
    return new Response(JSON.stringify({ error: "Object not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(new Uint8Array(obj.bytes), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.bytes.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
