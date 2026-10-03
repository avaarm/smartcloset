// Supabase Edge Function: ai-proxy
//
// Proxies Google Vision / OpenAI / Brave Search so secret API keys never ship
// to the client. The Supabase JWT of the calling user is verified by the
// platform (set verify_jwt = true in config.toml).
//
// This is NOT a generic relay: every route validates its payload against what
// the app actually sends, caps request sizes, and counts against a persistent
// per-user daily quota (public.ai_usage via ai_usage_check()). Signups are
// open, so these limits are the guard on the upstream bills.
//
// Deploy: supabase functions deploy ai-proxy
// Secrets: supabase secrets set GOOGLE_VISION_API_KEY=... OPENAI_API_KEY=... BRAVE_API_KEY=...
//
// Request shape:
//   POST /functions/v1/ai-proxy
//   Headers: Authorization: Bearer <supabase-access-token>
//   Body: { provider: "vision" | "openai-vision" | "brave", payload: {...} }

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

// Per-provider limits: in-memory per-minute burst cap (per instance) and a
// persistent per-user daily quota enforced in Postgres.
const PROVIDER_LIMITS: Record<string, { perMin: number; perDay: number }> = {
  "vision": { perMin: 30, perDay: 1000 },
  "openai-vision": { perMin: 10, perDay: 200 },
  "brave": { perMin: 20, perDay: 400 },
};
const PROVIDER_BUCKET = new Map<string, { count: number; resetAt: number }>();

const checkProviderBurst = (userId: string, provider: string): { ok: boolean; retryAfter?: number } => {
  const limit = PROVIDER_LIMITS[provider].perMin;
  const k = `${userId}:${provider}`;
  const now = Date.now();
  const b = PROVIDER_BUCKET.get(k);
  if (!b || now > b.resetAt) {
    PROVIDER_BUCKET.set(k, { count: 1, resetAt: now + 60_000 });
    return { ok: true };
  }
  b.count += 1;
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) } : { ok: true };
};

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB — a base64 phone photo is well under this
const MAX_IMAGE_B64_CHARS = 8 * 1024 * 1024;

// Feature types the app actually requests (see src/services/*Vision*, lensSearchService,
// imageRecognition, bodyAnalysisService). Anything else is refused.
const ALLOWED_VISION_FEATURES = new Set([
  "LABEL_DETECTION", "OBJECT_LOCALIZATION", "IMAGE_PROPERTIES", "WEB_DETECTION",
  "LOGO_DETECTION", "TEXT_DETECTION", "FACE_DETECTION", "CROP_HINTS",
]);
// What the app really sends is one image with up to 7 distinct features, so
// that is all we accept: each call maps to at most 7 billable units.
const MAX_VISION_FEATURES = 7;
const MAX_VISION_RESULTS = 30;

// Validates the payload and returns a clean upstream body rebuilt from only the
// checked fields (nothing else the caller sent is forwarded to Google).
const buildVisionBody = (payload: any): { body?: any; error?: string } => {
  const reqs = payload?.requests;
  if (!Array.isArray(reqs) || reqs.length !== 1) return { error: "exactly 1 request required" };
  const r = reqs[0];
  if (!r || typeof r !== "object") return { error: "invalid request item" };
  for (const k of Object.keys(r)) {
    if (k !== "image" && k !== "features") return { error: `unsupported field: ${k}` };
  }
  const content = r.image?.content;
  if (typeof content !== "string" || content.length === 0) return { error: "image.content required" };
  if (Object.keys(r.image).some((k) => k !== "content")) return { error: "only image.content is supported" };
  if (content.length > MAX_IMAGE_B64_CHARS) return { error: "image too large" };

  if (!Array.isArray(r.features) || r.features.length < 1 || r.features.length > MAX_VISION_FEATURES) {
    return { error: `features required (1-${MAX_VISION_FEATURES})` };
  }
  const seen = new Set<string>();
  const features: { type: string; maxResults?: number }[] = [];
  for (const f of r.features) {
    if (!f || typeof f.type !== "string" || !ALLOWED_VISION_FEATURES.has(f.type)) {
      return { error: `feature not allowed: ${String(f?.type).slice(0, 40)}` };
    }
    if (seen.has(f.type)) return { error: `duplicate feature: ${f.type}` };
    seen.add(f.type);
    for (const k of Object.keys(f)) {
      if (k !== "type" && k !== "maxResults") return { error: `unsupported feature field: ${k}` };
    }
    const out: { type: string; maxResults?: number } = { type: f.type };
    if (f.maxResults !== undefined) {
      if (!(Number.isInteger(f.maxResults) && f.maxResults >= 1 && f.maxResults <= MAX_VISION_RESULTS)) {
        return { error: `maxResults must be 1-${MAX_VISION_RESULTS}` };
      }
      out.maxResults = f.maxResults;
    }
    features.push(out);
  }
  return { body: { requests: [{ image: { content }, features }] } };
};

const callVision = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!key) return json({ error: "GOOGLE_VISION_API_KEY not configured" }, 503);
  const built = buildVisionBody(payload);
  if (built.error) return json({ error: `invalid vision payload: ${built.error}` }, 400);
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    },
  );
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
  if (typeof imageBase64 !== "string" || !imageBase64) return json({ error: "imageBase64 required" }, 400);
  if (imageBase64.length > MAX_IMAGE_B64_CHARS) return json({ error: "image too large" }, 413);

  const mime = (mimeType as string) || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return json({ error: "unsupported mimeType" }, 400);
  }

  // Inject any Vision API context so GPT-4 can resolve ambiguities Google
  // already solved (logo detection, web-entity brand name, etc.). Capped so it
  // can't be used to smuggle arbitrary instructions into the prompt.
  const ctxJson = visionContext ? JSON.stringify(visionContext) : "";
  if (ctxJson.length > 4000) return json({ error: "visionContext too large" }, 400);
  const ctxHint = ctxJson ? `\n\nHints from Google Vision: ${ctxJson}` : "";

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

// Brave Search — replaces Google Custom Search JSON API, which Google closed
// to any project/key created after 2026-01-20 (hard 403 regardless of
// billing/enablement status — confirmed against this project's own key).
// Expects { q, num?, safe? }; uses the Image Search endpoint since callers
// want product photos, not web page results.
const callBrave = async (payload: any): Promise<Response> => {
  const key = Deno.env.get("BRAVE_API_KEY");
  if (!key) return json({ error: "BRAVE_API_KEY not configured" }, 503);

  const { q, num } = payload ?? {};
  if (typeof q !== "string" || !q.trim()) return json({ error: "q required" }, 400);
  if (q.length > 200) return json({ error: "q too long" }, 400);

  // Safe-search is always strict; clients cannot turn it off.
  const params = new URLSearchParams({
    q,
    count: String(Math.min(Number(num) || 10, 20)),
    safesearch: "strict",
  });

  const resp = await fetch(
    `https://api.search.brave.com/res/v1/images/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
    },
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

  const declaredLen = Number(req.headers.get("content-length") || 0);
  if (declaredLen > MAX_BODY_BYTES) return json({ error: "request too large" }, 413);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const { provider, payload } = body || {};
  if (!provider || !payload) return json({ error: "provider and payload required" }, 400);
  if (typeof provider !== "string" || !Object.prototype.hasOwnProperty.call(PROVIDER_LIMITS, provider)) {
    return json({ error: "unknown provider" }, 400);
  }

  const burst = checkProviderBurst(user.id, provider);
  if (!burst.ok) {
    return new Response(
      JSON.stringify({ error: "rate limited", retryAfter: burst.retryAfter }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(burst.retryAfter ?? 60) } },
    );
  }

  // Persistent per-user daily quota (fails closed: no quota check, no upstream call).
  const { data: withinQuota, error: quotaErr } = await supabase.rpc("ai_usage_check", {
    p_provider: provider,
    p_daily_limit: PROVIDER_LIMITS[provider].perDay,
  });
  if (quotaErr) {
    console.error("[ai-proxy] quota check failed:", quotaErr.message);
    return json({ error: "quota service unavailable" }, 503);
  }
  if (!withinQuota) return json({ error: "daily limit reached for this feature, try again tomorrow" }, 429);

  try {
    switch (provider) {
      case "vision":        return await callVision(payload);
      case "openai-vision": return await callOpenAIVision(payload);
      case "brave":         return await callBrave(payload);
      default:              return json({ error: `unknown provider: ${provider}` }, 400);
    }
  } catch (e: any) {
    console.error("[ai-proxy] upstream error:", e?.message ?? e);
    return json({ error: "upstream failed", detail: e?.message ?? String(e) }, 502);
  }
});
