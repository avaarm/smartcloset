/**
 * The pure rules of product search: which results are real products for the
 * right kind of item and the right age group, how repeats are removed, and
 * how results are put in order (shops first, second-hand last).
 */
import {
  brandCandidates,
  cleanResultTitle,
  countShopResults,
  dedupeResults,
  hasKidsWords,
  headFamily,
  isNonProductTitle,
  isNonProductUrl,
  MIN_SHOP_RESULTS,
  normalizeTitle,
  passesRelevance,
  productFamilies,
  relevanceContext,
  selectVisibleResults,
  sortByTier,
  titleCoverage,
  queryTokens,
  tokenize,
} from '../../src/services/searchRanking';
import type { SourceKind } from '../../src/services/retailerDomains';

const adultBoots = relevanceContext({ subtype: 'knee-high boots', category: 'shoes' });

const listing = (title: string, url: string, source = 'nordstrom.com') => ({ title, url, source });

describe('children\'s and adult listings', () => {
  it.each([
    "Toddler Boys' Brown Chelsea Boot",
    'Kids suede boots',
    "Girls' Tan Western Boot (Little Kid)",
    'Baby first walker boots',
    'Infant leather bootie',
    'Youth size 3 boot',
    'Boys boot size 2T',
    'Brown boot 18 months',
    "Children's Place boot",
    'Little Girls Ankle Boot',
    'Newborn bootie set',
  ])('%j is a children\'s item', title => {
    expect(hasKidsWords(title)).toBe(true);
  });

  it.each([
    "Women's Tan Suede Knee High Boot",
    'Kid suede ankle boot',
    'Kid leather loafers',
    'Baby blue suede boots',
    'Babydoll dress',
    'Baby alpaca scarf',
    'Boyfriend jeans',
    'Girlfriend collective leggings',
    'Tall boot size 9',
  ])('%j is not', title => {
    expect(hasKidsWords(title)).toBe(false);
  });

  it('drops children\'s results for an adult search, from the title, the url path or the site', () => {
    const url = 'https://www.nordstrom.com/s/knee-high-boot/1';
    expect(passesRelevance(listing('Women\'s Suede Knee High Boot', url), adultBoots)).toBe(true);
    expect(passesRelevance(listing("Toddler Boys' Brown Chelsea Boot", url), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Brown Chelsea Boot', 'https://www.zappos.com/kids/brown-boot/9'), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Brown Chelsea Boot', 'https://www.zappos.com/p/little-kids-boot/product/9'), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Brown Chelsea Boot', 'https://www.carters.com/p/brown-boot/1', 'carters.com'), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Brown Chelsea Boot', 'https://kids.example.com/p/brown-boot/1', 'kids.example.com'), adultBoots)).toBe(false);
  });

  it('treats kid leather and kid suede as materials, not as a child\'s item', () => {
    const ctx = relevanceContext({ subtype: 'ankle boots' });
    expect(passesRelevance(listing('Kid suede ankle boot', 'https://www.zara.com/p/kid-suede-ankle-boot-p1'), ctx)).toBe(true);
  });

  it('keeps only children\'s listings (and drops grown-ups\') for a children\'s search', () => {
    const kids = relevanceContext({ subtype: 'toddler boots' });
    expect(kids.audience).toBe('kids');
    const url = 'https://www.nordstrom.com/s/boot/1';
    expect(passesRelevance(listing("Toddler Boys' Brown Chelsea Boot", url), kids)).toBe(true);
    expect(passesRelevance(listing("Women's Brown Chelsea Boot", url), kids)).toBe(false);
  });

  it('assumes an adult search unless the words or the caller say otherwise', () => {
    expect(relevanceContext({ text: 'tan boots' }).audience).toBe('adult');
    expect(relevanceContext({ text: 'kids rain boots' }).audience).toBe('kids');
    expect(relevanceContext({ text: 'kids rain boots', audience: 'adult' }).audience).toBe('adult');
  });
});

describe('product types', () => {
  it('finds the product nouns in the order they appear and the head noun last', () => {
    expect(productFamilies('Block heel ankle boots')).toEqual(['heels', 'boots']);
    expect(headFamily('Block heel ankle boots')).toBe('boots');
    expect(headFamily('knee-high boots')).toBe('boots');
    expect(headFamily('Andiamo Large shopper bag')).toBe('bags');
    expect(headFamily('tan jacket')).toBe('outerwear');
    expect(headFamily('red')).toBeUndefined();
  });

  it('does not read a dress shoe or a boot cut as a dress or a boot', () => {
    expect(productFamilies('Black dress shoes')).toEqual([]);
    expect(headFamily('Boot cut jeans')).toBe('pants');
  });

  it('a boot search does not return sneakers, sandals or a bag', () => {
    const url = (slug: string) => `https://www.zara.com/us/en/${slug}-p1.html`;
    expect(passesRelevance(listing('Tan suede boots', url('tan-boots')), adultBoots)).toBe(true);
    expect(passesRelevance(listing('Chelsea Boot', url('chelsea')), adultBoots)).toBe(true);
    expect(passesRelevance(listing('Tan leather sneakers', url('tan-sneakers')), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Tan suede sandals', url('tan-sandals')), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Tan suede bag', url('tan-bag')), adultBoots)).toBe(false);
    // Names no product: could be the item, so it stays.
    expect(passesRelevance(listing('Suede footwear', url('suede')), adultBoots)).toBe(true);
  });

  it('with no product type, falls back to the wardrobe category, except for catch-all categories', () => {
    const shoes = relevanceContext({ category: 'shoes' });
    const url = 'https://www.zara.com/us/en/thing-p1.html';
    expect(passesRelevance(listing('Tan boots', url), shoes)).toBe(true);
    expect(passesRelevance(listing('Tan sneakers', url), shoes)).toBe(true);
    expect(passesRelevance(listing('Tan handbag', url), shoes)).toBe(false);
    const accessories = relevanceContext({ category: 'accessories' });
    expect(passesRelevance(listing('Tan handbag', url), accessories)).toBe(true);
    expect(passesRelevance(listing('Tan boots', url), accessories)).toBe(true);
  });

  it('a bag search returns bags and not shoes', () => {
    const bags = relevanceContext({ text: 'burgundy clutch' });
    const url = 'https://www.zara.com/p1';
    expect(passesRelevance(listing('Burgundy leather clutch', url), bags)).toBe(true);
    expect(passesRelevance(listing('Burgundy leather pumps', url), bags)).toBe(false);
  });
});

describe('real products only', () => {
  it.each([
    'https://www.nordstrom.com/browse/women/shoes/boots',
    'https://www.macys.com/shop/womens-clothing/boots',
    'https://www.zappos.com/c/womens-boots',
    'https://www.amazon.com/s?k=tan+boots',
    'https://www.ebay.com/sch/i.html?_nkw=tan+boots',
    'https://www.etsy.com/market/tan_boots',
    'https://www.revolve.com/category/boots',
    'https://store.com/collections/boots',
    'https://store.com/all-boots',
    'https://www.zara.com/us/en/',
    'https://www.zara.com/',
    'https://www.asos.com/search/?q=boots',
    'https://www.vogue.com/news/best-boots',
    'https://shop.com/blog/how-to-style-boots',
    'https://shop.com/brands/gucci',
  ])('%s is not a product page', url => {
    expect(isNonProductUrl(url)).toBe(true);
  });

  it.each([
    'https://www.nordstrom.com/s/suede-knee-high-boot/7777',
    'https://www.zara.com/us/en/suede-boots-p12345.html',
    'https://www.ebay.com/itm/1234567890',
    'https://poshmark.com/listing/Tan-suede-boots-5f1',
    'https://store.com/collections/boots/products/tan-boot',
    'https://www.amazon.com/dp/B000000000',
    'not a url',
  ])('%s is', url => {
    expect(isNonProductUrl(url)).toBe(false);
  });

  it.each([
    'Boots Shop All',
    'Shop by category: boots',
    'Shop Women\'s Boots',
    'All boots',
    'Browse boots',
    'Search results for boots',
    'Fall Collection 2026',
    '10 Best Boots for Fall',
    'How to wear tan boots',
    'Boot style guide',
    'New arrivals',
  ])('%j is not a product title', title => {
    expect(isNonProductTitle(title)).toBe(true);
  });

  it.each([
    'Tan Suede Knee High Boot',
    'AllSaints Leather Boot',
    'All Saints Leather Boot',
    'Shopper Tote Bag',
    'Bottega Veneta Andiamo Large shopper bag',
  ])('%j is a product title', title => {
    expect(isNonProductTitle(title)).toBe(false);
  });

  it('a result that is not a product page never passes', () => {
    expect(passesRelevance(listing('Tan boots', 'https://www.zara.com/us/en/'), adultBoots)).toBe(false);
    expect(passesRelevance(listing('Shop all boots', 'https://www.zara.com/p1'), adultBoots)).toBe(false);
  });
});

describe('titles', () => {
  it('decodes entities and removes gallery counters and the trailing site name', () => {
    expect(
      cleanResultTitle('Bottega Veneta - Women - Andiamo Large shopper bag - Brown - Picture 4 of 6', 'ebay.com'),
    ).toBe('Bottega Veneta - Women - Andiamo Large shopper bag - Brown');
    expect(cleanResultTitle('Suede boots | eBay', 'ebay.com')).toBe('Suede boots');
    expect(cleanResultTitle('Suede boots - Zara United States', 'zara.com')).toBe('Suede boots');
    expect(cleanResultTitle('Women&#39;s boots &amp; booties', 'zara.com')).toBe("Women's boots & booties");
    expect(cleanResultTitle('', 'zara.com')).toBe('zara.com');
  });

  it('never strips the whole title down to nothing', () => {
    expect(cleanResultTitle('Zara', 'zara.com')).toBe('Zara');
  });

  it('cuts a long title at a word', () => {
    const long = 'Tan suede knee high boots with a block heel and a side zip fastening in soft Italian leather';
    const out = cleanResultTitle(long, 'zara.com', 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(long.startsWith(out)).toBe(true);
    expect(out.endsWith(' ')).toBe(false);
  });

  it('tokenizes with accents, punctuation and plurals removed', () => {
    expect(tokenize("Women's Chelsea Boots, Café-Brown")).toEqual(['women', 'chelsea', 'boot', 'cafe', 'brown']);
    expect(titleCoverage('Tan Suede Boots', queryTokens('tan suede boot'))).toBe(1);
    expect(titleCoverage('Black sneakers', queryTokens('tan suede boot'))).toBe(0);
    expect(titleCoverage('anything', [])).toBe(1);
  });
});

describe('removing repeats', () => {
  const r = (title: string, imageUrl: string, source = 'zara.com') => ({ title, source, imageUrl });

  it('drops the same picture, even with a different size parameter', () => {
    const out = dedupeResults([
      r('Tan boots', 'https://img.com/a.jpg?w=200'),
      r('Another name', 'https://img.com/a.jpg?w=800', 'hm.com'),
      r('Third thing', 'https://img.com/b.jpg'),
    ]);
    expect(out.map(x => x.title)).toEqual(['Tan boots', 'Third thing']);
  });

  it('drops the same product title on one site, keeping the first', () => {
    const out = dedupeResults([
      r('Tan suede boots', 'https://img.com/1.jpg'),
      r('Tan Suede Boots | Zara', 'https://img.com/2.jpg'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].imageUrl).toBe('https://img.com/1.jpg');
  });

  it('drops a long, specific title listed on two sites but not a short generic one', () => {
    const long = 'Tan suede knee high boots block heel side zip';
    expect(
      dedupeResults([r(long, 'https://a.com/1.jpg', 'zara.com'), r(long, 'https://b.com/2.jpg', 'hm.com')]),
    ).toHaveLength(1);
    expect(
      dedupeResults([r('Tan boots', 'https://a.com/1.jpg', 'zara.com'), r('Tan boots', 'https://b.com/2.jpg', 'hm.com')]),
    ).toHaveLength(2);
  });

  it('keeps results with no picture apart when their titles differ', () => {
    expect(dedupeResults([r('Tan boots', ''), r('Black boots', '')])).toHaveLength(2);
  });

  it('normalizes a title the same way regardless of site suffix and punctuation', () => {
    expect(normalizeTitle('Tan Suede Boots - Zara', 'zara.com')).toBe(normalizeTitle('tan suede boots', 'zara.com'));
  });
});

describe('ordering', () => {
  type Item = { id: string; source: string; sourceKind?: SourceKind; score?: number };
  const resaleOnly: Item[] = [
    { id: 'ebay', source: 'ebay.com' },
    { id: 'posh', source: 'poshmark.com' },
  ];
  const items: Item[] = [
    { id: 'ebay1', source: 'ebay.com', score: 9 },
    { id: 'posh1', source: 'poshmark.com', score: 8 },
    { id: 'small', source: 'smallshop.com', score: 5 },
    { id: 'aliexpress', source: 'aliexpress.com', score: 7 },
    { id: 'nord', source: 'nordstrom.com', score: 1 },
    { id: 'zara', source: 'zara.com', score: 3 },
    { id: 'etsy', source: 'etsy.com', score: 10 },
  ];

  it('puts retail first, then unknown, then marketplaces, then resale, best score first within each', () => {
    const out = sortByTier(items, i => i.score ?? 0).map(i => i.id);
    expect(out).toEqual(['zara', 'nord', 'small', 'aliexpress', 'etsy', 'ebay1', 'posh1']);
  });

  it('keeps the incoming order for equal scores', () => {
    const out = sortByTier(
      [
        { id: 'a', source: 'zara.com' },
        { id: 'b', source: 'hm.com' },
        { id: 'c', source: 'mango.com' },
      ],
    ).map(i => i.id);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('trusts the kind stamped on a result over its host', () => {
    const out = sortByTier([
      { id: 'resale', source: 'brandshop.com', sourceKind: 'resale' as SourceKind },
      { id: 'retail', source: 'brandshop.com', sourceKind: 'retail' as SourceKind },
    ]).map(i => i.id);
    expect(out).toEqual(['retail', 'resale']);
  });

  it('counts retail and unknown results as shop results', () => {
    expect(countShopResults(items)).toBe(3);
    expect(countShopResults([])).toBe(0);
  });

  it('puts what is not a shop at all (stock photos, image hosts, social) after resale, and never counts it as a shop', () => {
    const notShops: Item[] = [
      { id: 'shutterstock', source: 'shutterstock.com', score: 99 },
      { id: 'alamy', source: 'alamy.com', score: 98 },
      { id: 'ebayimg', source: 'i.ebayimg.com', score: 97 },
      { id: 'pinterest', source: 'pinterest.com', score: 96 },
    ];
    const out = sortByTier([...notShops, ...items], i => i.score ?? 0).map(i => i.id);
    expect(out).toEqual(['zara', 'nord', 'small', 'aliexpress', 'etsy', 'ebay1', 'posh1', 'shutterstock', 'alamy', 'ebayimg', 'pinterest']);
    expect(countShopResults(notShops)).toBe(0);
    // Six of them would otherwise be "enough shops" and hide every resale listing.
    const sixStock: Item[] = ['shutterstock.com', 'alamy.com', 'dreamstime.com', 'freepik.com', 'depositphotos.com', 'istockphoto.com']
      .map(source => ({ id: source, source }));
    expect(countShopResults(sixStock)).toBe(0);
    expect(selectVisibleResults([...sixStock, ...resaleOnly], false)).toEqual([...sixStock, ...resaleOnly]);
  });

  describe('resale visibility', () => {
    const shops = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `shop${i}`, source: 'zara.com' }));
    const resale: Item[] = [
      { id: 'ebay', source: 'ebay.com' },
      { id: 'posh', source: 'poshmark.com' },
    ];

    it('demotes resale rather than deleting it while there are few shop results', () => {
      const all = [...shops(MIN_SHOP_RESULTS - 1), ...resale];
      expect(selectVisibleResults(all, false)).toEqual(all);
    });

    it('drops resale entirely once there are enough shop results', () => {
      const all = [...shops(MIN_SHOP_RESULTS), ...resale];
      expect(selectVisibleResults(all, false).map(i => i.id)).toEqual(shops(MIN_SHOP_RESULTS).map(i => i.id));
    });

    it('counts unknown sites as shop results', () => {
      const all = [...shops(3), ...Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, source: `shop${i}.example` })), ...resale];
      expect(selectVisibleResults(all, false).some(i => i.id === 'ebay')).toBe(false);
    });

    it('keeps resale when the person asks for it', () => {
      const all = [...shops(MIN_SHOP_RESULTS + 4), ...resale];
      expect(selectVisibleResults(all, true)).toEqual(all);
    });

    it('does not drop marketplaces, which are demoted but not resale', () => {
      const all = [...shops(MIN_SHOP_RESULTS), { id: 'ali', source: 'aliexpress.com' }];
      expect(selectVisibleResults(all, false).map(i => i.id)).toContain('ali');
    });
  });
});

describe('colour names are not brand names', () => {
  // Every colour the app can detect (utils/colorNames) ends in one of these words.
  it.each(['brown', 'gray', 'terracotta', 'peach', 'lime', 'mint', 'plum', 'mauve', 'sage', 'taupe', 'teal'])(
    '%s is a colour, so a search for "%s boots" does not look for a brand called that',
    color => {
      expect(brandCandidates(`${color} boots`)).not.toContain(color);
    },
  );

  it('still offers a word that is not a colour as a brand to look for', () => {
    expect(brandCandidates('mauve stuart boots')).toContain('stuart');
  });
});
