/**
 * fetchProductImages reads a product page for its pictures: the schema.org Product `image`, every og:image,
 * twitter:image. Relative links are resolved, http becomes https, junk is dropped, repeats are dropped, and it
 * never throws. Same fetch harness as searchProductUrl.test.ts.
 */
import { fetchProductImages, fetchProductMetadata, MAX_PRODUCT_IMAGES } from '../../src/services/productUrlService';

const PAGE = 'https://www.shop.example/p/linen-shirt';

const serve = (html: string, ok = true) => {
  (global as any).fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => html }));
};
const ld = (json: unknown) => `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
const og = (content: string, prop = 'og:image') => `<meta property="${prop}" content="${content}">`;
const page = (...head: string[]) => `<html><head>${head.join('\n')}</head><body></body></html>`;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('fetchProductImages: a page with schema.org data', () => {
  it('takes the Product image whether it is a link, a list, or ImageObjects', async () => {
    serve(page(ld({ '@type': 'Product', name: 'Shirt', image: 'https://img.example/a.jpg' })));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg']);

    serve(page(ld({ '@type': 'Product', image: ['https://img.example/a.jpg', 'https://img.example/b.jpg'] })));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg']);

    serve(page(ld({
      '@type': 'Product',
      image: [{ '@type': 'ImageObject', url: 'https://img.example/a.jpg' }, { '@type': 'ImageObject', contentUrl: 'https://img.example/b.jpg' }, 'https://img.example/c.jpg'],
    })));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg', 'https://img.example/c.jpg']);

    serve(page(ld({ '@type': 'Product', image: { '@type': 'ImageObject', url: 'https://img.example/solo.jpg' } })));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/solo.jpg']);
  });

  it('finds the Product inside a @graph, an array of blocks, or a type list, and skips other nodes', async () => {
    serve(page(ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', image: 'https://img.example/site.jpg' },
        { '@type': ['Product', 'Thing'], image: ['https://img.example/a.jpg'] },
      ],
    })));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg']);

    serve(page(ld([{ '@type': 'BreadcrumbList' }, { '@type': 'Product', image: 'https://img.example/b.jpg' }])));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/b.jpg']);
  });

  it('ignores a JSON-LD block that is not valid JSON and reads the next one', async () => {
    serve(page(
      '<script type="application/ld+json">{ not json </script>',
      ld({ '@type': 'Product', image: 'https://img.example/a.jpg' }),
    ));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg']);
  });

  it('lists the schema.org pictures first, then the og:image ones, then twitter:image, without repeats', async () => {
    serve(page(
      og('https://img.example/main.jpg'),
      og('https://img.example/side.jpg'),
      og('https://img.example/main.jpg', 'og:image:secure_url'),
      '<meta name="twitter:image" content="https://img.example/tw.jpg">',
      ld({ '@type': 'Product', image: ['https://img.example/main.jpg', 'https://img.example/back.jpg'] }),
    ));
    expect(await fetchProductImages(PAGE)).toEqual([
      'https://img.example/main.jpg',
      'https://img.example/back.jpg',
      'https://img.example/side.jpg',
      'https://img.example/tw.jpg',
    ]);
  });
});

describe('fetchProductImages: a page with only Open Graph tags', () => {
  it('reads every og:image, og:image:secure_url and twitter:image, in page order', async () => {
    serve(page(
      og('https://img.example/1.jpg'),
      og('https://img.example/2.jpg'),
      og('https://img.example/3.jpg', 'og:image:secure_url'),
      '<meta name="twitter:image" content="https://img.example/4.jpg">',
    ));
    expect(await fetchProductImages(PAGE)).toEqual([
      'https://img.example/1.jpg',
      'https://img.example/2.jpg',
      'https://img.example/3.jpg',
      'https://img.example/4.jpg',
    ]);
  });

  it('copes with content before property, other attributes, single quotes and &amp; in the link', async () => {
    serve(page(
      `<meta content="https://img.example/a.jpg?w=800&amp;h=800" property="og:image">`,
      `<meta data-react-helmet="true" property='og:image' content='https://img.example/b.jpg'/>`,
    ));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg?w=800&h=800', 'https://img.example/b.jpg']);
  });

  it('is empty for a page with no pictures at all', async () => {
    serve(page('<title>Nothing here</title>'));
    expect(await fetchProductImages(PAGE)).toEqual([]);
  });
});

describe('fetchProductImages: links are made usable', () => {
  it('resolves relative and protocol-relative links against the page', async () => {
    serve(page(
      og('/media/a.jpg'),
      og('//cdn.shop.example/b.jpg'),
      og('../up/c.jpg'),
      og('d.jpg'),
    ));
    expect(await fetchProductImages('https://www.shop.example/p/linen-shirt')).toEqual([
      'https://www.shop.example/media/a.jpg',
      'https://cdn.shop.example/b.jpg',
      'https://www.shop.example/up/c.jpg',
      'https://www.shop.example/p/d.jpg',
    ]);
  });

  it('upgrades plain http to https, and treats the http and https forms as one picture', async () => {
    serve(page(og('http://img.example/a.jpg'), og('https://img.example/a.jpg'), og('http://img.example/b.jpg')));
    expect(await fetchProductImages(PAGE)).toEqual(['https://img.example/a.jpg', 'https://img.example/b.jpg']);
  });

  it('adds https to a page address pasted without one', async () => {
    serve(page(og('/a.jpg')));
    expect(await fetchProductImages('shop.example/p/shirt')).toEqual(['https://shop.example/a.jpg']);
    expect((global as any).fetch).toHaveBeenCalledWith('https://shop.example/p/shirt', expect.anything());
  });

  it('keeps at most six', async () => {
    expect(MAX_PRODUCT_IMAGES).toBe(6);
    serve(page(...Array.from({ length: 10 }, (_, i) => og(`https://img.example/${i}.jpg`))));
    const found = await fetchProductImages(PAGE);
    expect(found).toHaveLength(6);
    expect(found[0]).toBe('https://img.example/0.jpg');
    expect(found[5]).toBe('https://img.example/5.jpg');
  });
});

describe('fetchProductImages: pictures that are not of the product', () => {
  it('drops logos, favicons, sprites, icons, placeholders, tracking pixels, svg and data: links', async () => {
    serve(page(
      og('https://img.example/brand-logo.png'),
      og('https://img.example/Logo.jpg'),
      og('https://img.example/favicon.ico'),
      og('https://img.example/sprites/main.png'),
      og('https://img.example/apple-touch-icon.png'),
      og('https://img.example/img/placeholder.jpg'),
      og('https://img.example/pixel.gif'),
      og('https://img.example/t/1x1.gif'),
      og('https://img.example/track.gif?w=1&h=1'),
      og('https://img.example/shape.svg'),
      og('https://img.example/shape.svg?v=2'),
      og('data:image/png;base64,AAAA'),
      og('javascript:alert(1)'),
      og('https://img.example/shirt-front.jpg'),
      og('https://img.example/shirt-back.jpg'),
    ));
    expect(await fetchProductImages(PAGE)).toEqual([
      'https://img.example/shirt-front.jpg',
      'https://img.example/shirt-back.jpg',
    ]);
  });

  it('keeps a product picture whose name only resembles one of those words (iconic, a brand called Blank)', async () => {
    serve(page(og('https://img.example/catalog/iconic-dress.jpg'), og('https://img.example/blank-tee.jpg')));
    expect(await fetchProductImages(PAGE)).toEqual([
      'https://img.example/catalog/iconic-dress.jpg',
      'https://img.example/blank-tee.jpg',
    ]);
  });

  it('does not let junk use up the six', async () => {
    serve(page(
      ...Array.from({ length: 4 }, (_, i) => og(`https://img.example/logo-${i}.png`)),
      ...Array.from({ length: 7 }, (_, i) => og(`https://img.example/p${i}.jpg`)),
    ));
    const found = await fetchProductImages(PAGE);
    expect(found).toHaveLength(6);
    expect(found.every(u => /\/p\d\.jpg$/.test(u))).toBe(true);
  });
});

describe('fetchProductImages never throws', () => {
  it.each([
    ['the request fails', () => { (global as any).fetch = jest.fn(async () => { throw new Error('offline'); }); }],
    ['fetch itself throws at once', () => { (global as any).fetch = jest.fn(() => { throw new TypeError('Network request failed'); }); }],
    ['the site answers with an error status', () => serve(page(og('https://img.example/a.jpg')), false)],
    ['the body cannot be read', () => { (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => { throw new Error('aborted'); } })); }],
    ['the page is empty', () => serve('')],
    ['the page is not HTML', () => serve('{"a":1}')],
  ])('gives [] when %s', async (_label, setup) => {
    setup();
    await expect(fetchProductImages(PAGE)).resolves.toEqual([]);
  });

  it('gives [] for an address that is not usable', async () => {
    serve(page(og('https://img.example/a.jpg')));
    await expect(fetchProductImages('')).resolves.toEqual([]);
    await expect(fetchProductImages('   ')).resolves.toEqual([]);
    await expect(fetchProductImages(undefined as any)).resolves.toEqual([]);
  });

  it('shares the page request with fetchProductMetadata (same address, same browser-like headers)', async () => {
    serve(page(og('https://img.example/a.jpg'), '<meta property="og:title" content="Linen shirt">'));
    await fetchProductImages(PAGE);
    await fetchProductMetadata(PAGE);
    const [first, second] = (global as any).fetch.mock.calls;
    expect(first).toEqual(second);
    expect(first[1].headers['User-Agent']).toMatch(/iPhone/);
  });
});
