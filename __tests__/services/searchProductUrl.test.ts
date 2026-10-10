/**
 * A pasted product link becomes a match with a clean name and the kind of site
 * it is on (so a resale link is labelled as resale).
 */
import { fetchProductMetadata } from '../../src/services/productUrlService';

const page = (title: string, image = 'https://img.example.com/p.jpg') =>
  `<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="${image}"></head></html>`;

const serve = (html: string, ok = true) => {
  (global as any).fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => html }));
};

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('fetchProductMetadata', () => {
  it('marks a shop page as retail and drops the site name from the title', async () => {
    serve(page('Andiamo Large Shopper Bag | Bottega Veneta US'));
    const res = await fetchProductMetadata('https://www.bottegaveneta.com/us/en/andiamo-p1.html');
    expect(res?.sourceKind).toBe('retail');
    expect(res?.title).toBe('Andiamo Large Shopper Bag');
    expect(res?.source).toBe('bottegaveneta.com');
  });

  it('marks a second-hand listing as resale and removes the gallery counter', async () => {
    serve(page('Bottega Veneta - Women - Andiamo Large shopper bag - Brown - Picture 4 of 6'));
    const res = await fetchProductMetadata('https://www.ebay.com/itm/1234567890');
    expect(res?.sourceKind).toBe('resale');
    expect(res?.title).toBe('Bottega Veneta - Women - Andiamo Large shopper bag - Brown');
  });

  it('leaves a site it does not know unclassified, adds https when it is missing', async () => {
    serve(page('Tan boots'));
    const res = await fetchProductMetadata('smallboutique.example/products/tan-boots');
    expect(res?.sourceKind).toBe('unknown');
    expect(res?.url).toBe('https://smallboutique.example/products/tan-boots');
    expect((global as any).fetch).toHaveBeenCalledWith('https://smallboutique.example/products/tan-boots', expect.anything());
  });

  it('upgrades a plain-http picture to https at the source, since iOS blocks it', async () => {
    serve(page('Tan boots', 'http://img.example.com/p.jpg?w=800&h=800'));
    const res = await fetchProductMetadata('https://www.zara.com/us/en/tan-boots-p1.html');
    expect(res?.imageUrl).toBe('https://img.example.com/p.jpg?w=800&h=800');
  });

  it('keeps an https picture, and has no picture for one that is not a web link', async () => {
    serve(page('Tan boots', 'https://img.example.com/p.jpg'));
    expect((await fetchProductMetadata('https://www.zara.com/p1'))?.imageUrl).toBe('https://img.example.com/p.jpg');
    for (const image of ['data:image/png;base64,AAAA', '/images/p.jpg', '//img.example.com/p.jpg', 'javascript:alert(1)']) {
      serve(page('Tan boots', image));
      expect((await fetchProductMetadata('https://www.zara.com/p1'))?.imageUrl).toBe('');
    }
  });

  it('is null when the page cannot be read', async () => {
    serve('', false);
    expect(await fetchProductMetadata('https://www.zara.com/p1')).toBeNull();
    serve('<html><body>nothing</body></html>');
    expect(await fetchProductMetadata('https://www.zara.com/p1')).toBeNull();
  });
});
