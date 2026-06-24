// Supabase Edge Function: ai-proxy
//
// Proxies Google Vision / OpenAI / Google CSE so secret API keys never ship
// to the client. The Supabase JWT of the calling user is verified by the
// platform (set verify_jwt = true in config.toml); we only accept signed-in
// users to keep abuse low.
//
// Deploy: supabase functions deploy ai-proxy
// Secrets: supabase secrets set GOOGLE_VISION_API_KEY=... OPENAI_API_KEY=... GOOGLE_CSE_API_KEY=... GOOGLE_CSE_ID=...
//
// Request shape:
//   POST /functions/v1/ai-proxy
//   Headers: Authorization: Bearer <supabase-access-token>
//   Body: { provider: "vision" | "openai" | "cse", payload: {...} }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// Per-user-per-minute rate limit. Crude in-memory counter (resets on cold
// start) — good enough to catch a runaway client. Real rate limiting belongs
// in upstash/postgres if abuse becomes an issue.
const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MIN = 60;

const checkRateLimit = (userId: string): { ok: boolean; retryAfter?: number } => {
  const now = Date.now();
  const bucket = RATE_BUCKET.get(userId);
  if (!bucket || now > bucket.resetAt) {
    RATE_BUCKET.set(userId, { count: 1, resetAt: now + 60_000 });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
};

const callVision = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!key) return json({ error: "GOOGLE_VISION_API_KEY not configured" }, 503);
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
};

const callOpenAI = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY not configured" }, 503);
  // payload.endpoint optional — defaults to /v1/chat/completions
  const endpoint = (payload.endpoint as string) || "/v1/chat/completions";
  const body = payload.body ?? payload;
  const resp = await fetch(`https://api.openai.com${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
};

// Dedicated vision route: embeds the fashion-analysis prompt server-side so
// (a) the prompt never ships in the client bundle, and (b) we can tune it
// independently of app releases. Expects { imageBase64, mimeType?, visionContext? }.
const callOpenAIVision = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY not configured" }, 503);

  const { imageBase64, mimeType, visionContext } = payload;
  if (!imageBase64) return json({ error: "imageBase64 required" }, 400);

  const mime = (mimeType as string) || "image/jpeg";

  // Inject any Vision API context so GPT-4 can resolve ambiguities Google
  // already solved (logo detection, web-entity brand name, etc.).
  const ctxHint = visionContext
    ? `\n\nHints from Google Vision: ${JSON.stringify(visionContext)}`
    : "";

  const prompt =
    `You are an expert fashion identification AI. Analyze the clothing item in this image and return ONLY a JSON object — no markdown, no prose — with these exact keys:
{
  "category": "tops" | "bottoms" | "dresses" | "outerwear" | "shoes" | "accessories",
  "subcategory": "<specific type, e.g. 'crew-neck t-shirt', 'wide-leg jeans', 'ankle boots', 'structured tote'>",
  "brand": "<visible or identifiable brand, or null>",
  "colors": ["<primary color>", "<secondary color if present>"],
  "pattern": "solid" | "striped" | "plaid" | "floral" | "polka_dot" | "graphic" | "other",
  "material": "<primary material, e.g. cotton, leather, denim, wool, silk>",
  "season": ["spring" | "summer" | "fall" | "winter"],
  "occasion": "casual" | "formal" | "business" | "sports" | "party" | "everyday",
  "style": ["<1-3 style descriptors, e.g. minimalist, streetwear, classic, boho, preppy, edgy>"],
  "gender": "men" | "women" | "unisex",
  "description": "<one natural-language sentence>",
  "confidence": <float 0.0–1.0>
}${ctxHint}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${imageBase64}`,
                detail: "high",
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
};

const callCSE = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("GOOGLE_CSE_API_KEY");
  const cx = Deno.env.get("GOOGLE_CSE_ID");
  if (!key || !cx) return json({ error: "Google CSE not configured" }, 503);
  const params = new URLSearchParams({ key, cx, ...payload });
  const resp = await fetch(
    `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
  );
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Verify the caller is signed in. Supabase platform also verifies the JWT
  // before invoking us when verify_jwt = true; this is a belt-and-suspenders
  // check that also gives us the user_id for rate limiting.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing auth" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "invalid auth" }, 401);

  const rl = checkRateLimit(user.id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate limited", retryAfter: rl.retryAfter }),
      {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const { provider, payload } = body || {};
  if (!provider || !payload) return json({ error: "provider and payload required" }, 400);

  try {
    switch (provider) {
      case "vision":        return await callVision(payload);
      case "openai":        return await callOpenAI(payload);
      case "openai-vision": return await callOpenAIVision(payload);
      case "cse":           return await callCSE(payload);
      default:       return json({ error: `unknown provider: ${provider}` }, 400);
    }
  } catch (e: any) {
    console.error("[ai-proxy] upstream error:", e?.message ?? e);
    return json({ error: "upstream failed", detail: e?.message ?? String(e) }, 502);
  }
});
