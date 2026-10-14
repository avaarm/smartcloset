/**
 * The swap-media function is Deno code, so these tests read it as text (the way
 * recognitionProxyPrompt.test.ts reads ai-proxy) and pin the rules that keep photos safe.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'swap-media', 'index.ts'), 'utf8');
const publish = src.slice(src.indexOf('const publish = async'), src.indexOf('Deno.serve('));

describe('swap-media', () => {
  it('only accepts the documented request fields', () => {
    expect(publish).toContain('["action", "itemId", "audience", "note"]');
    expect(publish).toMatch(/UUID\.test\(body\.itemId\)/);
    expect(publish).toMatch(/body\.audience !== "friends" && body\.audience !== "community"/);
  });

  it('takes the photo path from the database, never from the request', () => {
    expect(publish).toContain('const sourcePath: string = pre.sourcePath');
    expect(publish).toContain('download(sourcePath)');
    expect(publish).not.toMatch(/body\.(path|photo|sourcePath|url)/);
  });

  it('asks the database to check the member before it touches any photo', () => {
    expect(publish.indexOf('swap_publish_precheck')).toBeGreaterThan(-1);
    expect(publish.indexOf('swap_publish_precheck')).toBeLessThan(publish.indexOf('.download('));
    expect(publish.indexOf('.download(')).toBeLessThan(publish.indexOf('.upload('));
    expect(publish.indexOf('.upload(')).toBeLessThan(publish.indexOf('swap_publish_commit'));
  });

  it('removes the metadata before storing, and stores under the listing id', () => {
    expect(publish).toContain('const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original)');
    expect(publish).toContain('upload(objectName, cleaned.bytes');
    expect(publish).toContain('const objectName = `${listingId}.jpg`');
  });

  it('tells a PNG from a JPEG by its first bytes, and stores each with its own content type', () => {
    expect(publish).toContain('const png = isPng(original)');
    expect(publish).toContain('contentType: png ? "image/png" : "image/jpeg"');
    expect(publish).not.toMatch(/\.(endsWith|includes)\(["'`]\.(png|jpe?g)/);   // never decided by a file name
    expect(src).toContain('"../_shared/pngMetadata.ts"');
  });

  it('sends only community photos to Google, and fails closed when it cannot', () => {
    const calls = publish.match(/vision\.googleapis\.com/g) ?? [];
    expect(calls).toHaveLength(1);
    const inCommunity = publish.slice(publish.indexOf('if (body.audience === "community") {'), publish.indexOf('// 4. Store the copy'));
    expect(inCommunity).toContain('vision.googleapis.com');
    expect(inCommunity).toContain('SAFE_SEARCH_DETECTION');
    expect(inCommunity).toContain('FACE_DETECTION');
    expect((inCommunity.match(/moderation_unavailable/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(inCommunity).toContain('decideSwapPhoto(annotation, cleaned.width, cleaned.height)');
  });

  it('marks the photo checked only for the community', () => {
    expect(publish).toContain('p_photo_state: body.audience === "community" ? "checked" : "stripped"');
  });

  it('removes the stored photo if the listing could not be created', () => {
    const afterCommit = publish.slice(publish.indexOf('swap_publish_commit'));
    expect(afterCommit.indexOf('remove([objectName])')).toBeGreaterThan(-1);
    expect(afterCommit.indexOf('remove([objectName])')).toBeLessThan(afterCommit.indexOf('databaseError(commitErr)'));
  });

  it('keeps the sweep for the service key only, compared as a secret and not read as a token', () => {
    expect(src).toMatch(/sameSecret\(token, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\) \? await sweep\(admin\) : json\(\{ error: "forbidden" \}, 403\)/);
    expect(src).toContain('from "../_shared/sameSecret.ts"');
    // The old check decoded the token and believed its "role" claim: anyone can write such a token.
    expect(src).not.toMatch(/atob\(|roleOf|\.role\b|service_role"/);
  });

  it('maps a held or removed piece to a refusal the app understands', () => {
    expect(src).toMatch(/listing_held: 403/);
  });

  it('never logs a request, a note, an id, a path or image bytes', () => {
    const logs = src.match(/console\.(log|error|warn|info)\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const call of logs) expect(call).toMatch(/^console\.\w+\("\[swap-media\] [a-z ]+"\)$/);
    expect(src).not.toMatch(/console\.\w+\([^)]*(body|note|path|itemId|listingId|bytes)/);
  });
});
