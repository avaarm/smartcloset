/**
 * Shelf pages (departments, categories, "shop" fronts) are dropped from a search,
 * but a retailer's real product page is not, even when it lives in the same
 * folder as a shelf: Anthropologie's /shop/<name>, Gap's /browse/product.do,
 * J.Crew's /categories/.../<name>/<id>. Every URL here has the shape the retailer uses.
 */
import {
  isNonProductTitle,
  isNonProductUrl,
  passesRelevance,
  relevanceContext,
} from '../../src/services/searchRanking';
import { classifyUrl } from '../../src/services/retailerDomains';

const PRODUCT_PAGES: Array<[string, string]> = [
  ['Gap', 'https://www.gap.com/browse/product.do?pid=7981310020002'],
  ['Gap with a category', 'https://www.gap.com/browse/product.do?cid=1127938&pcid=1127938&vid=1&pid=798131002'],
  ['Old Navy', 'https://oldnavy.gap.com/browse/product.do?pid=6543210030015&cid=1011761'],
  ['Banana Republic', 'https://bananarepublic.gap.com/browse/product.do?pid=8123450020001'],
  ['Athleta', 'https://athleta.gap.com/browse/product.do?pid=7712340010001'],
  ['J.Crew', 'https://www.jcrew.com/p/womens/categories/shoes/boots/piper-suede-boot/AB123'],
  ['J.Crew with options', 'https://www.jcrew.com/p/womens/categories/shoes/boots/piper-suede-boot/BE123?display=standard&fit=Classic&colorProductCode=BE123'],
  ['Anthropologie', 'https://www.anthropologie.com/shop/pilcro-lucy-boots'],
  ['Anthropologie with options', 'https://www.anthropologie.com/shop/pilcro-lucy-boots?category=boots&color=012&type=STANDARD'],
  ['Free People', 'https://www.freepeople.com/shop/we-the-free-jessie-western-boot/'],
  ['Urban Outfitters', 'https://www.urbanoutfitters.com/shop/uo-sloane-suede-boot'],
  ['Urban Outfitters, short name', 'https://www.urbanoutfitters.com/shop/suede-boot'],
  ['Macy\'s', 'https://www.macys.com/shop/product/steve-madden-womens-mari-boots?ID=12345678&CategoryID=13247'],
  ['Net-a-Porter', 'https://www.net-a-porter.com/en-us/shop/product/the-row/shoes/ankle-boots/ridley-suede-ankle-boots/1647597'],
  ['Nordstrom', 'https://www.nordstrom.com/s/sam-edelman-mari-boot-women/7890123'],
  ['Zappos', 'https://www.zappos.com/p/sam-edelman-mari-tan/product/9876543/color/123'],
  ['Target', 'https://www.target.com/p/women-s-lucy-boots/-/A-12345678'],
  ['a product called all-weather', 'https://example.com/products/all-weather-tan-boot'],
  ['Shopify product', 'https://store.com/collections/boots/products/tan-boot'],
];

const SHELF_PAGES: Array<[string, string]> = [
  ['Gap category', 'https://www.gap.com/browse/category.do?cid=1127938'],
  ['Old Navy category', 'https://oldnavy.gap.com/browse/category.do?cid=1011761'],
  ['Banana Republic division', 'https://bananarepublic.gap.com/browse/division.do?cid=1007898'],
  ['J.Crew shelf', 'https://www.jcrew.com/plp/womens/categories/shoes/boots'],
  ['J.Crew older shelf', 'https://www.jcrew.com/r/womens/categories/shoes/boots'],
  ['Nordstrom shelf', 'https://www.nordstrom.com/browse/women/shoes/boots'],
  ['Anthropologie shelf', 'https://www.anthropologie.com/shop/womens-boots'],
  ['Anthropologie new arrivals', 'https://www.anthropologie.com/shop/new-arrivals'],
  ['Anthropologie shoes and boots', 'https://www.anthropologie.com/shop/shoes-boots'],
  ['Free People shelf', 'https://www.freepeople.com/shop/womens-boots/'],
  ['Free People sale', 'https://www.freepeople.com/shop/sale/'],
  ['Urban Outfitters shelf', 'https://www.urbanoutfitters.com/shop/womens-boots'],
  ['Urban Outfitters new', 'https://www.urbanoutfitters.com/shop/new-arrivals'],
  ['Macy\'s shelf', 'https://www.macys.com/shop/womens-clothing/boots'],
  ['Macy\'s shelf with filters', 'https://www.macys.com/shop/shoes/womens-boots/Boot_style,Color_normal/Ankle%20Boots,Brown?id=13247'],
  ['Net-a-Porter shelf', 'https://www.net-a-porter.com/en-us/shop/shoes/boots'],
  ['Net-a-Porter clutches', 'https://www.net-a-porter.com/en-us/shop/clutches/'],
  ['a shop front', 'https://example.com/shop/'],
  ['Zappos shelf', 'https://www.zappos.com/c/womens-boots'],
  ['Revolve shelf', 'https://www.revolve.com/category/boots'],
  ['Target shelf', 'https://www.target.com/c/women-s-boots-shoes/-/N-5xtd6'],
  ['an all- shelf', 'https://store.com/all-boots'],
  ['an all- shelf under a locale', 'https://store.com/us/en/all-womens-boots'],
  ['Shopify shelf', 'https://store.com/collections/boots'],
];

describe('retailer product pages are kept', () => {
  it.each(PRODUCT_PAGES)('%s', (_name, url) => {
    expect(isNonProductUrl(url)).toBe(false);
  });

  it('and pass the relevance filter for a boot search', () => {
    const ctx = relevanceContext({ text: 'suede boots', category: 'shoes' });
    for (const [, url] of PRODUCT_PAGES) {
      expect(passesRelevance({ title: 'Suede ankle boots', source: 'x.com', url }, ctx)).toBe(true);
    }
  });

  it('on sites the app lists as retail', () => {
    for (const host of ['gap.com', 'oldnavy.gap.com', 'jcrew.com', 'anthropologie.com', 'freepeople.com', 'urbanoutfitters.com']) {
      expect(classifyUrl(`https://www.${host}/x`)).toBe('retail');
    }
  });
});

describe('shelf pages are dropped', () => {
  it.each(SHELF_PAGES)('%s', (_name, url) => {
    expect(isNonProductUrl(url)).toBe(true);
  });

  it('and fail the relevance filter whatever their title says', () => {
    const ctx = relevanceContext({ text: 'suede boots', category: 'shoes' });
    for (const [, url] of SHELF_PAGES) {
      expect(passesRelevance({ title: 'Suede ankle boots', source: 'x.com', url }, ctx)).toBe(false);
    }
  });
});

describe('picture files and front pages', () => {
  it.each([
    'https://i.ebayimg.com/images/g/abc/s-l1600.jpg',
    'https://static.zara.net/photos/2024/boot.JPEG?ts=1700000000',
    'https://cdn.shop.com/a/b/boot.png',
    'https://cdn.shop.com/a/b/boot.webp?width=800',
  ])('%s is a picture, not a page', url => {
    expect(isNonProductUrl(url)).toBe(true);
  });

  it('keeps a page whose name merely looks like a file extension', () => {
    expect(isNonProductUrl('https://www.zara.com/us/en/suede-boots-p12345.html')).toBe(false);
  });
});

describe('titles', () => {
  it.each([
    'Ralph Lauren Collection Suede Knee High Boots',
    'Michael Kors Collection Women\'s Leather Knee High Boot',
    'Frye Collection Tan Suede Boot',
    'The Row Collection Ridley Ankle Boots',
  ])('%j is a product from a brand line', title => {
    expect(isNonProductTitle(title)).toBe(false);
  });

  it.each([
    'Fall Collection 2026',
    'Boots Collection | Zappos',
    'Women\'s Boots Collection - Nordstrom',
    'Boots Collection',
    'Collection',
    'Collections: boots',
    'Shop the Boots Collection',
  ])('%j is a shelf', title => {
    expect(isNonProductTitle(title)).toBe(true);
  });
});
