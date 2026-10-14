/**
 * The proxy gate is deny-by-default: every provider asks for the person's AI permission except the ones named
 * in CONSENT_EXEMPT (today only Brave, which gets a text search query and nothing personal). The provider lists
 * are read out of the sources, so a provider added to the Edge Function or to the client union later cannot slip
 * through without the permission check.
 */
import fs from 'fs';
import path from 'path';

const mockEnsureAiConsent = jest.fn();
jest.mock('../../src/services/aiConsent', () => ({
  ensureAiConsent: (...args: unknown[]) => mockEnsureAiConsent(...args),
  AI_CONSENT_ERROR: 'ai_consent_required',
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' }, access_token: 'tok' } }, error: null }) } },
}));

import { AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import { callAiProxy, type AIProvider } from '../../src/services/aiProxy';

const root = path.join(__dirname, '..', '..');
const proxySource = fs.readFileSync(path.join(root, 'supabase', 'functions', 'ai-proxy', 'index.ts'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'services', 'aiProxy.ts'), 'utf8');

/** The provider names the Edge Function accepts (the keys of PROVIDER_LIMITS). */
const serverProviders = (): string[] => {
  const start = proxySource.indexOf('const PROVIDER_LIMITS');
  expect(start).toBeGreaterThan(-1);
  const block = proxySource.slice(start, proxySource.indexOf('};', start));
  return Array.from(block.matchAll(/^\s*"([a-z0-9-]+)"\s*:/gm), m => m[1]);
};

/** The names in the client's AIProvider union. */
const clientProviders = (): string[] => {
  const decl = clientSource.match(/export type AIProvider =([^;]*);/);
  expect(decl).not.toBeNull();
  return Array.from(decl![1].matchAll(/'([a-z0-9-]+)'/g), m => m[1]);
};

/** The names in CONSENT_EXEMPT. */
const exemptProviders = (): string[] => {
  const decl = clientSource.match(/CONSENT_EXEMPT[^=]*=\s*new Set<AIProvider>\(\[([^\]]*)\]\)/);
  expect(decl).not.toBeNull();
  return Array.from(decl![1].matchAll(/'([a-z0-9-]+)'/g), m => m[1]);
};

const mockFetch = jest.fn();
beforeEach(() => {
  mockEnsureAiConsent.mockReset();
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }), text: async () => '' });
  (global as any).fetch = mockFetch;
});

describe('the lists this test reads', () => {
  it('finds the providers on both sides', () => {
    expect(serverProviders()).toEqual(expect.arrayContaining(['vision', 'openai-vision', 'brave']));
    expect(clientProviders()).toEqual(expect.arrayContaining(['vision', 'openai-vision', 'openai-tag', 'brave']));
  });

  it('knows on the client every provider the server accepts', () => {
    const client = clientProviders();
    for (const key of serverProviders()) expect(client).toContain(key);
  });

  it('exempts nothing but Brave', () => {
    expect(exemptProviders()).toEqual(['brave']);
  });
});

describe('callAiProxy permission gate', () => {
  const needPermission = Array.from(new Set([...serverProviders(), ...clientProviders()])).filter(p => p !== 'brave');

  it.each(needPermission)('%s asks, and sends nothing when permission is refused', async provider => {
    mockEnsureAiConsent.mockResolvedValue(false);
    await expect(callAiProxy(provider as AIProvider, { x: 1 })).rejects.toThrow(AI_CONSENT_ERROR);
    expect(mockEnsureAiConsent).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(needPermission)('%s sends once permission is given', async provider => {
    mockEnsureAiConsent.mockResolvedValue(true);
    await callAiProxy(provider as AIProvider, { x: 1 });
    expect(mockEnsureAiConsent).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ provider, payload: { x: 1 } });
  });

  it('asks about photos for the photo providers', async () => {
    mockEnsureAiConsent.mockResolvedValue(true);
    await callAiProxy('vision', {});
    await callAiProxy('openai-vision', {});
    expect(mockEnsureAiConsent.mock.calls.map(call => call[0])).toEqual([undefined, undefined]);
  });

  it('asks the tag-text question for openai-tag', async () => {
    mockEnsureAiConsent.mockResolvedValue(true);
    await callAiProxy('openai-tag', { text: 'x' });
    expect(mockEnsureAiConsent).toHaveBeenCalledTimes(1);
    expect(mockEnsureAiConsent).toHaveBeenCalledWith({ feature: 'tag_text' });
    // the same, read from the source: this must not depend on a route existing on the server
    expect(clientSource).toMatch(/provider === 'openai-tag' \? \{ feature: 'tag_text' \} : undefined/);
  });

  it('refuses openai-tag without the tag-text permission even when photos are allowed', async () => {
    mockEnsureAiConsent.mockImplementation(async (opts?: { feature?: string }) => opts?.feature !== 'tag_text');
    await expect(callAiProxy('openai-tag', { text: 'x' })).rejects.toThrow(AI_CONSENT_ERROR);
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(callAiProxy('vision', {})).resolves.toBeDefined();
  });

  it('never asks for a plain search query', async () => {
    await callAiProxy('brave', { q: 'white tee' });
    expect(mockEnsureAiConsent).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('asks for a provider it has never heard of (deny by default)', async () => {
    mockEnsureAiConsent.mockResolvedValue(false);
    await expect(callAiProxy('some-future-provider' as AIProvider, {})).rejects.toThrow(AI_CONSENT_ERROR);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
