import { NextRequest, NextResponse } from "next/server";
import { createStorageClient } from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveRestActor } from "@/lib/db/rest-auth";
import { authorizeStorageWrite } from "@/lib/db/rest-acl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function guessContentTypeFromPath(objectPath: string): string {
  const ext = objectPath.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Supabase Storage upload:
 *   POST /storage/v1/object/{bucket}/{path}
 *   body = raw file bytes OR multipart/form-data (supabase-js)
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }

  const actor = await resolveRestActor(req);
  const decision = authorizeStorageWrite(actor);
  if (!decision.allow) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const upsert = (req.headers.get("x-upsert") || "").toLowerCase() === "true";
  const headerCt = req.headers.get("content-type") || "application/octet-stream";

  // supabase-js uploads as multipart/form-data (file + cacheControl fields).
  // Older shims saved the raw multipart body, which browsers cannot display.
  // Parse FormData when needed and persist only the file bytes + real MIME type.
  let buf: Buffer;
  let contentType = headerCt.split(";")[0].trim() || "application/octet-stream";
  if (headerCt.toLowerCase().includes("multipart/form-data")) {
    const form = await req.formData();
    let file: File | null = null;
    for (const value of form.values()) {
      if (value instanceof File && value.size > 0) {
        file = value;
        break;
      }
    }
    if (!file) {
      return NextResponse.json(
        { error: "No file found in multipart upload" },
        { status: 400 }
      );
    }
    buf = Buffer.from(await file.arrayBuffer());
    contentType =
      (file.type && file.type.split(";")[0].trim()) ||
      guessContentTypeFromPath(objectPath);
  } else {
    buf = Buffer.from(await req.arrayBuffer());
  }

  const storage = createStorageClient();
  const { data, error } = await storage.from(bucket).upload(objectPath, buf, {
    contentType,
    upsert,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: pub } = storage.from(bucket).getPublicUrl(objectPath);
  return NextResponse.json({
    Key: `${bucket}/${objectPath}`,
    Id: data?.path,
    ...data,
    publicUrl: pub.publicUrl,
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }

  const actor = await resolveRestActor(req);
  const decision = authorizeStorageWrite(actor);
  if (!decision.allow) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const { bucket, path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({});
}
