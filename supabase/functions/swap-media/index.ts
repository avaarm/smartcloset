// Supabase Edge Function: swap-media
//
// The only code that puts a photo in front of other members. Two actions:
//
//   publish  { action: "publish", itemId, audience: "friends" | "community", note? }
//            Called by the signed-in member. Checks the piece and its photo (database),
//            copies the photo (a JPEG or a PNG, whichever the app stored) into the private
//            swap-photos bucket with its metadata removed (location, camera, thumbnails,
//            comments), for the community also has Google Cloud Vision check it for unsafe
//            content and people, then creates the listing.
//   sweep    { action: "sweep" }   the service key only (scheduled)
//            Runs the database upkeep, deletes the photos of deleted listings, and removes
//            photos nothing refers to any more.
//
// Never logs request bodies, notes, ids, paths or image bytes: only short error codes.
//
// Deploy: supabase functions deploy swap-media
// Secrets: GOOGLE_VISION_API_KEY (already set for ai-proxy). SUPABASE_URL, SUPABASE_ANON_KEY and
//          SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// config.toml: [functions.swap-media] verify_jwt = true. Keep it on: the platform then checks the signature of
// every token before this code runs. The sweep does not rely on that alone (see the end of this file): it
// compares the bearer token with SUPABASE_SERVICE_ROLE_KEY itself, so it stays safe if verify_jwt is ever
// switched off (which Supabase's newer secret keys require).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stripJpegMetadata } from "../_shared/jpegMetadata.ts";
import { isPng, stripPngMetadata } from "../_shared/pngMetadata.ts";
import { sameSecret } from "../_shared/sameSecret.ts";
import { decideSwapPhoto } from "../_shared/swapModeration.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SOURCE_BUCKET = "wardrobe-images";
const PHOTO_BUCKET = "swap-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errors the database raises that the app understands, with the HTTP status to answer.
const STATUS: Record<string, number> = {
  not_authenticated: 401,
  swaps_disabled: 403, swap_terms_required: 403, swap_suspended: 403,
  community_unavailable: 403, community_not_joined: 403, account_too_new: 403,
  item_not_found: 422, listing_incomplete: 422, invalid_swap: 422, invalid_note: 422, text_not_allowed: 422,
  listing_held: 403,
  item_reserved: 409, swap_rate_limited: 429, swap_listing_limit: 429,
};

const databaseError = (e: any) => {
  const message = String(e?.message ?? "");
  const code = Object.keys(STATUS).find(c => message.includes(c));
  if (!code) {
    console.error("[swap-media] database error");
    return json({ error: "server_error" }, 500);
  }
  return json({ error: code, detail: e?.details ?? undefined, reason: e?.hint ?? undefined }, STATUS[code]);
};

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Deletes up to n queued photos from swap-photos. Returns how many were removed. */
const drainQueue = async (admin: any, n: number): Promise<number> => {
  const { data } = await admin.from("swap_photo_gc").select("path").order("queued_at").limit(n);
  const paths: string[] = (data ?? []).map((r: any) => r.path);
  if (paths.length === 0) return 0;
  const { error } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) return 0;                                   // try again next time
  await admin.from("swap_photo_gc").delete().in("path", paths);
  return paths.length;
};

const sweep = async (admin: any) => {
  await admin.rpc("swap_janitor", { p_force: true });
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const n = await drainQueue(admin, 200);
    removed += n;
    if (n === 0) break;
  }
  // Photos no listing refers to (a publish that died half way), older than an hour. Only a clear answer from
  // the database lets a photo go: if it cannot answer, nothing is deleted and the run says it did not finish.
  let orphans = 0;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const { data: objects, error } = await admin.storage.from(PHOTO_BUCKET).list("", { limit: 1000, offset });
    if (error || !objects || objects.length === 0) break;
    let stayed = objects.length;
    const old = objects.filter((o: any) => o.name && Date.now() - new Date(o.created_at ?? 0).getTime() > 3600_000);
    if (old.length > 0) {
      const names: string[] = old.map((o: any) => o.name);
      const { data: known, error: knownErr } = await admin.rpc("swap_known_photo_paths", { p_paths: names });
      if (knownErr || !Array.isArray(known)) {
        console.error("[swap-media] sweep incomplete");
        return json({ ok: false, error: "sweep_incomplete", removed, orphans }, 500);
      }
      const keep = new Set<string>(known);
      const gone = names.filter(n => !keep.has(n));
      if (gone.length > 0) {
        const { error: rmErr } = await admin.storage.from(PHOTO_BUCKET).remove(gone);
        if (!rmErr) { orphans += gone.length; stayed -= gone.length; }
      }
    }
    if (objects.length < 1000) break;
    offset += stayed;          // removed objects leave the listing, so the next page starts after those that stayed
  }
  return json({ ok: true, removed, orphans });
};

const publish = async (req: any, body: any, token: string, authHeader: string, admin: any) => {
  const keys = Object.keys(body);
  if (!keys.every(k => ["action", "itemId", "audience", "note"].includes(k))
      || typeof body.itemId !== "string" || !UUID.test(body.itemId)
      || (body.audience !== "friends" && body.audience !== "community")
      || (body.note != null && (typeof body.note !== "string" || body.note.length > 200))) {
    return json({ error: "invalid_request" }, 400);
  }
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: "not_authenticated" }, 401);

  // 1. The database decides whether this member may list this piece, and names its photo.
  const { data: pre, error: preErr } = await admin.rpc("swap_publish_precheck", {
    p_user: user.id, p_item: body.itemId, p_audience: body.audience, p_note: body.note ?? null,
  });
  if (preErr) return databaseError(preErr);
  const listingId: string = pre.listingId;
  const sourcePath: string = pre.sourcePath;           // derived from the item row, never from the request

  // 2. Fetch and clean the photo.
  const { data: blob, error: dlErr } = await admin.storage.from(SOURCE_BUCKET).download(sourcePath);
  if (dlErr || !blob) return json({ error: "listing_incomplete", detail: "photo" }, 422);
  const original = new Uint8Array(await blob.arrayBuffer());
  if (original.length > MAX_BYTES) return json({ error: "photo_too_large" }, 422);
  // The photo is whatever the app stored: usually a JPEG, but a screenshot or other PNG source stays a PNG.
  // Decided by the first bytes, never by the file name or the type it was uploaded as.
  const png = isPng(original);
  const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original);
  if (!cleaned.ok) return json({ error: "unsupported_image" }, 415);

  // 3. Community photos are checked for unsafe content and people. Friends-only photos never leave Supabase.
  if (body.audience === "community") {
    const key = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!key) return json({ error: "moderation_unavailable" }, 503);
    let annotation: any;
    try {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{
          image: { content: toBase64(cleaned.bytes) },
          features: [{ type: "SAFE_SEARCH_DETECTION" }, { type: "FACE_DETECTION", maxResults: 10 }],
        }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return json({ error: "moderation_unavailable" }, 503);
      annotation = (await res.json())?.responses?.[0];
    } catch {
      return json({ error: "moderation_unavailable" }, 503);
    }
    const decision = decideSwapPhoto(annotation, cleaned.width, cleaned.height);
    if (!decision.ok) {
      return decision.reason === "unreadable"
        ? json({ error: "moderation_unavailable" }, 503)
        : json({ error: "photo_rejected", reason: decision.reason }, 422);
    }
  }

  // 4. Store the copy under the listing id (no user id in the name), then create the listing. The name always
  //    ends in .jpg, a PNG included: it is an opaque id (the app's own uploads already store PNG bytes as .jpg),
  //    and the content type tells a viewer what the bytes are.
  const objectName = `${listingId}.jpg`;
  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(objectName, cleaned.bytes, {
    contentType: png ? "image/png" : "image/jpeg", upsert: false,
  });
  if (upErr) return json({ error: "server_error" }, 500);

  const { error: commitErr } = await admin.rpc("swap_publish_commit", {
    p_user: user.id, p_listing: listingId, p_item: body.itemId, p_audience: body.audience,
    p_note: body.note ?? null, p_photo_state: body.audience === "community" ? "checked" : "stripped",
  });
  if (commitErr) {
    await admin.storage.from(PHOTO_BUCKET).remove([objectName]);   // nothing may be left behind
    return databaseError(commitErr);
  }

  // Housekeeping after the answer is on its way.
  const later = drainQueue(admin, 25).catch(() => 0);
  (globalThis as any).EdgeRuntime?.waitUntil?.(later);
  return json({ listingId });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "not_authenticated" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.action !== "string") return json({ error: "invalid_request" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (body.action === "sweep") {
      // Only the service key itself. The token is compared with the key in constant time; its contents are
      // never read, so a hand-made token that merely claims to be the service role is refused.
      return sameSecret(token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ? await sweep(admin) : json({ error: "forbidden" }, 403);
    }
    if (body.action === "publish") return await publish(req, body, token, authHeader, admin);
    return json({ error: "invalid_request" }, 400);
  } catch {
    console.error("[swap-media] unexpected error");
    return json({ error: "server_error" }, 500);
  }
});
