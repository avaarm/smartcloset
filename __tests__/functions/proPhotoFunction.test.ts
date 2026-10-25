/**
 * The pro-photo function is Deno code, so these tests read it as text (the way swapMediaFunction.test.ts reads
 * swap-media) and pin the rules that keep a client's photos from reaching anyone but the stylist they are shared
 * with, and that keep the client's account id out of every answer. proPhotoBehaviour.test.ts runs the handler.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', 'supabase');
const src = fs.readFileSync(path.join(root, 'functions', 'pro-photo', 'index.ts'), 'utf8');
const toml = fs.readFileSync(path.join(root, 'config.toml'), 'utf8');
const handle = src.slice(src.indexOf('const handle = async'), src.indexOf('Deno.serve('));
// The handler without its comments, so a sentence cannot satisfy or break a pin.
const code = handle.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

describe('pro-photo: the request', () => {
  it('answers GET and the browser preflight only, and reads no request body', () => {
    expect(handle).toContain('req.method === "OPTIONS"');
    expect(handle).toContain('req.method !== "GET"');
    expect(code).not.toMatch(/req\.(json|text|formData|arrayBuffer|blob)\(/);
  });

  it('matches both parameters, exactly once each, against the strict uuid pattern, and answers a bare 404', () => {
    expect(src).toContain('const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;');
    expect(handle).toContain('params.getAll("c")');
    expect(handle).toContain('params.getAll("i")');
    expect(handle).toContain('connections.length !== 1 || items.length !== 1');
    expect(handle).toContain('UUID.test(connections[0])');
    expect(handle).toContain('UUID.test(items[0])');
    const invalid = handle.slice(handle.indexOf('connections.length !== 1'), handle.indexOf('const url = Deno.env.get'));
    expect(invalid).toContain('return bare(404)');
  });

  it('reads no query parameter but the two ids', () => {
    const names = [...code.matchAll(/params\.get(?:All)?\("(\w+)"\)/g)].map(m => m[1]);
    expect(names.sort()).toEqual(['c', 'i']);
    expect(code).not.toMatch(/searchParams\.(get|getAll|has|entries|keys|values)/);
    expect(code).not.toMatch(/req\.headers\.get\("(?!Authorization")/);
  });

  it('wants a bearer token before it does anything else, and takes nothing else for one', () => {
    expect(handle).toContain('const token = /^Bearer\\s+(\\S+)$/i.exec((req.headers.get("Authorization") || "").trim())?.[1] ?? ""');
    expect(handle.indexOf('if (!token) return bare(401)')).toBeGreaterThan(-1);
    expect(handle.indexOf('if (!token) return bare(401)')).toBeLessThan(handle.indexOf('params.getAll("c")'));
  });
});

describe('pro-photo: who is asking, and who decides', () => {
  it('takes the user id from the verified token and from nothing else', () => {
    expect(code).toContain('userClient.auth.getUser(token)');
    expect(code).toContain('if (authErr || !user) return bare(401)');
    expect(code.match(/p_uid:/g) ?? []).toHaveLength(1);
    expect(code).toContain('p_uid: user.id');
    // The identity client is used for nothing but the token check.
    const uses = [...code.matchAll(/userClient\.[\w.]+/g)].map(m => m[0]);
    expect(uses).toEqual(['userClient.auth.getUser']);
    expect(code).toContain('createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })');
  });

  it('asks the database with the service key, by the argument names the function declares', () => {
    expect(code).toContain('createClient(url, serviceKey)');
    expect(code).toContain('admin.rpc("pro_photo_source", {');
    expect(code).toMatch(/p_uid: user\.id, p_connection: connections\[0\]\.toLowerCase\(\), p_item: items\[0\]\.toLowerCase\(\)/);
    expect(code.match(/\.rpc\(/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/userClient\.rpc/);
  });

  it('asks the database before it touches any photo, and cleans before it answers', () => {
    const at = (needle: string) => code.indexOf(needle);
    expect(at('auth.getUser(token)')).toBeGreaterThan(-1);
    expect(at('auth.getUser(token)')).toBeLessThan(at('admin.rpc("pro_photo_source"'));
    expect(at('admin.rpc("pro_photo_source"')).toBeLessThan(at('.download('));
    expect(at('.download(')).toBeLessThan(at('stripPngMetadata(original)'));
    expect(at('stripPngMetadata(original)')).toBeLessThan(at('new Response(cleaned.bytes'));
  });

  it('turns every refusal into the same bare 404, and a rate limit into 429', () => {
    expect(src).toContain('if (message.includes("pro_rate_limited")) return bare(429);');
    expect(src).toContain('if (REFUSED.some(code => message.includes(code))) return bare(404);');
    for (const refusal of ['pro_unavailable', 'pro_disabled', 'pro_suspended', 'closet_not_shared', 'connection_ended']) {
      expect(src).toContain(`"${refusal}"`);
    }
    expect(code).toContain('if (typeof source !== "string" || !SOURCE_PATH.test(source)) return bare(404)');
  });
});

describe('pro-photo: the photo', () => {
  it('takes the object from the database answer, in the private closet bucket, never from the request', () => {
    expect(src).toContain('const SOURCE_BUCKET = "wardrobe-images"');
    expect(code).toContain('admin.storage.from(SOURCE_BUCKET).download(source)');
    expect(code.match(/\.download\(/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/params\.get(All)?\("(path|name|file|url|bucket)"\)/);
  });

  it('checks the shape of the path it was given before it uses it', () => {
    expect(src).toContain('const SOURCE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/i;');
    expect(code.indexOf('SOURCE_PATH.test(source)')).toBeLessThan(code.indexOf('.download('));
  });

  it('keeps the path out of every answer: it is only tested, and used to download', () => {
    const uses = code.split('\n').filter(line => /\bsource\b/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/data: source,|typeof source !== "string" \|\| !SOURCE_PATH\.test\(source\)|\.download\(source\)/);
    }
  });

  it('removes the metadata with the shared strippers (imported, not copied), before it answers', () => {
    expect(src).toContain('import { stripJpegMetadata } from "../_shared/jpegMetadata.ts";');
    expect(src).toContain('import { isPng, stripPngMetadata } from "../_shared/pngMetadata.ts";');
    expect(code).toContain('const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original)');
    expect(code).toContain('new Response(cleaned.bytes');
    expect(src).not.toMatch(/(const|function) (strip|clean|remove)\w*(Metadata|Exif|Gps)/i);
  });

  it('tells a PNG from a JPEG by its first bytes, never by a name', () => {
    expect(code).toContain('const png = isPng(original)');
    expect(code).toContain('"Content-Type": png ? "image/png" : "image/jpeg"');
    expect(code).not.toMatch(/\.(endsWith|includes|match|test)\(["'`/]\.?(png|jpe?g)/i);
  });

  it('refuses more than 5 MB with 413, and anything that is not a clean PNG or JPEG with 415', () => {
    expect(src).toContain('const MAX_BYTES = 5 * 1024 * 1024');
    expect(code).toContain('blob.size > MAX_BYTES');
    expect(code).toContain('original.length > MAX_BYTES');
    expect(code.indexOf('original.length > MAX_BYTES')).toBeLessThan(code.indexOf('isPng(original)'));
    expect(code).toContain('return bare(413)');
    const unsupported = code.slice(code.indexOf('if (!cleaned.ok)'));
    expect(unsupported).toContain('return bare(415)');
  });

  it('treats a photo that cannot be fetched as one more refusal', () => {
    const fetched = code.slice(code.indexOf('.download('), code.indexOf('const tooLarge'));
    expect(fetched).toContain('return bare(404)');
  });
});

describe('pro-photo: what is sent back', () => {
  it('sends the cleaned bytes only, typed, never stored and never sniffed', () => {
    const responses = code.match(/new Response\([^,]*/g) ?? [];
    expect(responses).toEqual(['new Response(null', 'new Response(cleaned.bytes']);
    expect(src).toContain('"Cache-Control": "private, no-store"');
    expect(src).toContain('"X-Content-Type-Options": "nosniff"');
    expect(code).toMatch(/headers: \{ \.\.\.guard, "Content-Type": png \? "image\/png" : "image\/jpeg" \}/);
  });

  it('puts the same no-store headers on every answer, errors included', () => {
    expect(src).toMatch(/const bare = \(status: number, extra: Record<string, string> = \{\}\) =>\s*new Response\(null, \{ status, headers: \{ \.\.\.guard, \.\.\.extra \} \}\)/);
    expect(src).toMatch(/const guard = \{\s*\.\.\.cors,\s*"Cache-Control": "private, no-store",\s*"X-Content-Type-Options": "nosniff",\s*\}/);
  });

  it('gives no file name, no validators, and nothing that names the object', () => {
    expect(src).not.toMatch(/Content-Disposition|filename|ETag|Last-Modified|Content-Location|Location["']|X-[A-Za-z-]*(Path|Id|Name)/i);
    expect(src).not.toMatch(/Set-Cookie/i);
  });
});

describe('pro-photo: what it never does', () => {
  it('reads one object and writes, signs and lists nothing', () => {
    expect(src).not.toMatch(/\.(upload|remove|move|copy|list|createSignedUrls?|createSignedUploadUrl|getPublicUrl|update|empty)\(/);
    const storage = [...code.matchAll(/\.storage\.from\([^)]*\)\.(\w+)\(/g)].map(m => m[1]);
    expect(storage).toEqual(['download']);
  });

  it('reads no table, calls no outside service and touches no file', () => {
    expect(code).not.toMatch(/\.from\("[a-z_]+"\)\.(select|insert|update|delete|upsert)/);
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|Deno\.(readFile|writeFile|open|run|Command)/);
    expect(src).not.toMatch(/https?:\/\/(?!esm\.sh\/@supabase\/supabase-js@2\.45\.4)/);
  });

  it('never logs an id, a path, a token, a key, the request or image bytes', () => {
    const logs = src.match(/console\.\w+\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const call of logs) expect(call).toMatch(/^console\.error\("\[pro-photo\] [a-z ]+"\)$/);
    expect(src).not.toMatch(/console\.(log|warn|info|debug|trace)/);
  });

  it('does not catch an error to say what it was', () => {
    expect(src).toContain('} catch {');
    expect(src).not.toMatch(/catch \((e|err|error)\)/);
  });
});

describe('supabase/config.toml', () => {
  it('turns JWT verification on for pro-photo, so the platform checks every token before this code runs', () => {
    expect(toml).toMatch(/\[functions\.pro-photo\]\s*\nverify_jwt = true/);
  });

  it('holds nothing but that setting in the pro-photo block, and leaves the other blocks as they were', () => {
    const blocks = toml.split(/^\[/m).slice(1).map(b => `[${b}`.trim());
    for (const name of ['ai-proxy', 'delete-account', 'swap-media', 'pro-photo']) {
      expect(blocks).toContain(`[functions.${name}]\nverify_jwt = true`);
    }
    expect(blocks.filter(b => b.startsWith('[functions.pro-photo]'))).toHaveLength(1);
  });
});
