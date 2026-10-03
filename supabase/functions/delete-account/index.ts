// Supabase Edge Function: delete-account
//
// Deletes the signed-in user's account in the safe order:
//   1. database rows + the auth user (delete_user_account(), runs as the user), then
//   2. their uploaded photos (Storage can only be emptied through the Storage API).
// Doing the data first means a failure can never leave a live account whose
// photos were already deleted. A failure while removing photos is reported but
// does not undo the (already complete) account deletion.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "wardrobe-images";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing auth" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: "invalid auth" }, 401);

  // 1. Data + auth user.
  const { error: rpcErr } = await userClient.rpc("delete_user_account");
  if (rpcErr) {
    console.error("[delete-account] delete_user_account failed:", rpcErr.message);
    return json({ error: "could not delete account" }, 500);
  }

  // 2. Photos (service role: the user's own session no longer exists).
  let removed = 0;
  try {
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    for (let page = 0; page < 500; page++) {
      const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(user.id, { limit: 100 });
      if (listErr) throw listErr;
      const names = (files ?? []).filter((f: any) => f.id && f.name).map((f: any) => `${user.id}/${f.name}`);
      if (names.length === 0) break;
      const { data: gone, error: rmErr } = await admin.storage.from(BUCKET).remove(names);
      if (rmErr) throw rmErr;
      if (!gone || gone.length === 0) throw new Error("storage returned no removed files");
      removed += gone.length;
    }
  } catch (e: any) {
    console.error("[delete-account] photo cleanup incomplete:", e?.message ?? e);
    return json({ ok: true, photosRemoved: removed, photosIncomplete: true });
  }

  return json({ ok: true, photosRemoved: removed });
});
