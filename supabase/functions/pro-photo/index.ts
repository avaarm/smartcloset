// Supabase Edge Function: pro-photo
//
// The only way a stylist sees a client's photo. GET /functions/v1/pro-photo?c=<connection id>&i=<piece id>
// answers with the cover photo of one shared piece, or with a bare 404.
//
//   1. Who is asking comes from the verified token (auth.getUser) and from nothing else in the request.
//   2. The database decides (pro_photo_source, service role only): the caller must be the stylist of that live
//      connection, the client's closet grant must be on and unexpired, the piece must be in it, and it must have a
//      cover photo. Every refusal is the same bare 404 (no grant, revoked, expired, ended, blocked, suspended,
//      switched off, wrong piece, wishlist piece, no photo, not the caller's connection), so nothing can be probed.
//      The storage path it returns is <client account id>/<file>: it never leaves this function.
//   3. The object is read from the private wardrobe-images bucket with the service key, refused over 5 MB (413),
//      told apart by its first bytes (a PNG or a JPEG; anything else is 415), cleaned of location, camera data,
//      thumbnails, comments and trailing bytes by the code swap-media uses, and sent with no-store.
//
// Reads only: nothing is written to storage and no link is signed, so nothing outlives the grant. Never logs ids,
// paths or image bytes: only short fixed lines.
//
// Deploy: supabase functions deploy pro-photo   (after the database push)
// Secrets: none of its own. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// config.toml: [functions.pro-photo] verify_jwt = true. Keep it on: the platform then checks the signature of every
// token before this code runs; auth.getUser below also refuses a session that has been signed out.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stripJpegMetadata } from "../_shared/jpegMetadata.ts";
import { isPng, stripPngMetadata } from "../_shared/pngMetadata.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
// On every answer, errors included: a refusal must not be kept and replayed after a grant is switched on again.
const guard = {
  ...cors,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const bare = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { ...guard, ...extra } });

const SOURCE_BUCKET = "wardrobe-images";
const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// <account id>/<file>, as pro_photo_path builds it; a file name cannot start with a dot.
const SOURCE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/i;

// pro_photo_source answers null for every refusal. If it ever raised one of these instead, the answer must still be
// the same bare 404, or a stylist could tell "switched off" from "no such piece".
const REFUSED = [
  "pro_unavailable", "pro_disabled", "pro_suspended", "closet_not_shared", "connection_ended",
  "pro_terms_required", "adult_required", "stylist_profile_required", "not_authenticated",
];

const databaseError = (e: any) => {
  const message = String(e?.message ?? "");
  if (message.includes("pro_rate_limited")) return bare(429);
  if (REFUSED.some(code => message.includes(code))) return bare(404);
  console.error("[pro-photo] database error");
  return bare(500);
};

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return bare(405, { Allow: "GET, OPTIONS" });

  // Only "Bearer <token>" is a token. Anything else (no header, another scheme, a bare "Bearer") is turned away here.
  const token = /^Bearer\s+(\S+)$/i.exec((req.headers.get("Authorization") || "").trim())?.[1] ?? "";
  if (!token) return bare(401);

  // Both ids, exactly once each, in the strict uuid shape. Nothing else in the request is read: no path, no name.
  const params = new URL(req.url).searchParams;
  const connections = params.getAll("c");
  const items = params.getAll("i");
  if (connections.length !== 1 || items.length !== 1 || !UUID.test(connections[0]) || !UUID.test(items[0])) {
    return bare(404);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("[pro-photo] not configured");
    return bare(500);
  }

  try {
    // 1. The caller, from the verified token.
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error: authErr } = await userClient.auth.getUser(token);
    const user = auth?.user;
    if (authErr || !user) return bare(401);

    // 2. The database decides, before any photo is touched, and names the object.
    const admin = createClient(url, serviceKey);
    const { data: source, error: sourceErr } = await admin.rpc("pro_photo_source", {
      p_uid: user.id, p_connection: connections[0].toLowerCase(), p_item: items[0].toLowerCase(),
    });
    if (sourceErr) return databaseError(sourceErr);
    if (typeof source !== "string" || !SOURCE_PATH.test(source)) return bare(404);   // null: the one answer for every refusal

    // 3. Fetch the photo. An object that is gone looks like every other refusal.
    const { data: blob, error: downloadErr } = await admin.storage.from(SOURCE_BUCKET).download(source);
    if (downloadErr || !blob) {
      console.error("[pro-photo] download failed");
      return bare(404);
    }
    const tooLarge = () => {
      console.error("[pro-photo] photo too large");
      return bare(413);
    };
    if (typeof blob.size === "number" && blob.size > MAX_BYTES) return tooLarge();
    const original = new Uint8Array(await blob.arrayBuffer());
    if (original.length > MAX_BYTES) return tooLarge();

    // 4. Clean it. A PNG or a JPEG is decided by the first bytes, never by the file name or the type it was uploaded as;
    //    anything else, or anything malformed, fails closed.
    const png = isPng(original);
    const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original);
    if (!cleaned.ok) {
      console.error("[pro-photo] unsupported image");
      return bare(415);
    }

    // 5. The cleaned bytes only: no file name, no length of the original, nothing that names the object.
    return new Response(cleaned.bytes, {
      status: 200,
      headers: { ...guard, "Content-Type": png ? "image/png" : "image/jpeg" },
    });
  } catch {
    console.error("[pro-photo] unexpected error");
    return bare(500);
  }
};

Deno.serve(handle);
