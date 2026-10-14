import { FunctionsFetchError, FunctionsRelayError } from '@supabase/functions-js';
import { SwapError, swapErrorMessage, toSwapError, toSwapErrorFromFunction } from '../../src/services/swapErrors';

describe('toSwapError', () => {
  it('reads the code out of what PostgREST puts in `message`, keeping DETAIL and HINT', () => {
    const e = toSwapError({ message: 'text_not_allowed', code: '22023', details: 'message', hint: 'contact' });
    expect(e).toBeInstanceOf(SwapError);
    expect([e.code, e.detail, e.hint]).toEqual(['text_not_allowed', 'message', 'contact']);
  });

  it('knows the rate limit bucket', () => {
    const e = toSwapError({ message: 'swap_rate_limited', code: '54000', details: 'message_min' });
    expect([e.code, e.detail]).toEqual(['swap_rate_limited', 'message_min']);
  });

  it.each([
    [{ message: 'not_authenticated' }, 'not_authenticated'],
    [{ message: 'swap_unavailable' }, 'swap_unavailable'],
    [{ message: 'Could not find the function public.get_swap_settings without parameters', code: 'PGRST202' }, 'not_deployed'],
    [{ message: 'function public.get_swap_badge() does not exist', code: '42883' }, 'not_deployed'],
    [{ message: 'report_rate_limited', code: '54000' }, 'report_rate_limited'],
    [{ message: 'Network request failed' }, 'offline'],
    [{ message: 'something else entirely' }, 'unknown'],
  ])('maps %j to %s', (input, code) => {
    expect(toSwapError(input).code).toBe(code);
  });

  it('passes a SwapError through', () => {
    const e = new SwapError('swap_not_open');
    expect(toSwapError(e)).toBe(e);
  });

  // What supabase-js really throws when the connection to an edge function drops: the message never mentions the network.
  it('treats a dropped connection to an edge function as offline', () => {
    const e = new FunctionsFetchError(new TypeError('Network request failed'));
    expect(e.message).toBe('Failed to send a request to the Edge Function');
    expect(toSwapError(e).code).toBe('offline');
    expect(swapErrorMessage(e, 'fallback')).toMatch(/offline/);
  });

  it('does not treat a relay problem as offline', () => {
    const relay = new FunctionsRelayError({ status: 502, json: async () => ({}) });
    expect(toSwapError(relay).code).toBe('unknown');
    expect(swapErrorMessage(relay, 'fallback')).toBe('fallback');
  });

  it('reads a missing edge function (404) as not deployed', () => {
    const relay = new FunctionsRelayError({ status: 404, json: async () => ({}) });
    expect(toSwapError(relay).code).toBe('not_deployed');
  });
});

describe('toSwapErrorFromFunction', () => {
  const failing = (body: unknown) => ({ context: { status: 422, json: async () => body } });

  it('reads the code and reason from the function answer', async () => {
    const e = await toSwapErrorFromFunction(failing({ error: 'photo_rejected', reason: 'people' }));
    expect([e.code, e.hint]).toEqual(['photo_rejected', 'people']);
  });

  it('falls back to the generic mapping when the answer has no readable body: a dropped connection is offline', async () => {
    const e = await toSwapErrorFromFunction(new FunctionsFetchError(new TypeError('Network request failed')));
    expect(e.code).toBe('offline');
  });

  it('keeps a relay error unknown, or not deployed for a 404', async () => {
    expect((await toSwapErrorFromFunction(new FunctionsRelayError({ status: 502, json: async () => ({}) }))).code).toBe('unknown');
    expect((await toSwapErrorFromFunction(new FunctionsRelayError({ status: 404, json: async () => ({}) }))).code).toBe('not_deployed');
  });
});

describe('swapErrorMessage', () => {
  const msg = (message: string, extra: object = {}) => swapErrorMessage({ message, ...extra }, 'fallback');

  it('is plain and never mentions blocks, reports or technical codes', () => {
    for (const code of ['swap_unavailable', 'swap_not_open', 'item_not_found', 'swap_suspended', 'swap_cooldown']) {
      expect(msg(code)).not.toMatch(/block|report|swap_|_/i);
    }
  });

  it('explains rejected text by reason', () => {
    expect(msg('text_not_allowed', { hint: 'payment' })).toMatch(/item for item/);
    expect(msg('text_not_allowed', { hint: 'contact', details: 'message' })).toMatch(/contact details/);
    expect(msg('text_not_allowed', { hint: 'content', details: 'note' })).toMatch(/note/);
  });

  it('says plainly when a piece cannot be listed, and how to replace a photo that cannot be used', () => {
    expect(toSwapError({ message: 'listing_held', code: '42501' }).code).toBe('listing_held');
    expect(msg('listing_held')).toMatch(/can’t be listed right now.*Email support/);
    expect(msg('listing_held')).not.toMatch(/block|report|held|review|removed/i);
    expect(msg('unsupported_image')).toMatch(/Replace the photo/);
    expect(msg('text_not_allowed', { hint: 'content', details: 'details' })).toMatch(/item details/);
  });

  it('lists what a listing is missing', () => {
    expect(msg('listing_incomplete', { details: 'size,condition' })).toBe('Add a size and condition first.');
  });

  it('distinguishes the rate limits', () => {
    expect(msg('swap_rate_limited', { details: 'browse_day' })).toMatch(/tomorrow/);
    expect(msg('swap_rate_limited', { details: 'message_min' })).toMatch(/moment/);
  });

  it('uses the fallback for anything unexpected', () => {
    expect(msg('no idea')).toBe('fallback');
  });

  it('has a sentence for a server without swaps and for being offline', () => {
    expect(msg('x', { code: 'PGRST202' })).toMatch(/aren’t available yet/);
    expect(swapErrorMessage({ message: 'Network request failed' }, 'fallback')).toMatch(/offline/);
  });
});
