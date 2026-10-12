/**
 * Women's or men's: reading who a listing is for (from its title and its link), keeping
 * and preferring the right ones when the wardrobe is for one gender, and asking for them
 * in the web query. For "both" or no answer nothing changes.
 */
import {
  BRAVE_QUERY_MAX,
  BRAVE_QUERY_MAX_WORDS,
  COMPACT_QUERY_MAX,
  GENDER_BOOST,
  asShopFor,
  buildBraveQuery,
  genderBoost,
  genderFit,
  hasKidsWords,
  listingGender,
  listingUrlGender,
  namesGender,
  passesRelevance,
  relevanceContext,
} from '../../src/services/searchRanking';
import { RESALE_QUERY_EXCLUSIONS } from '../../src/services/retailerDomains';

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('listingGender: who the words say it is for', () => {
  it.each([
    ["Women's Suede Ankle Boot", 'women'],
    ['Womens suede ankle boot', 'women'],
    ['WOMEN’S SUEDE ANKLE BOOT', 'women'],
    ["Women`s boot", 'women'],
    ["Womens' boot", 'women'],
    ['Woman leather boots', 'women'],
    ['Ladies leather boots', 'women'],
    ["Lady's leather boots", 'women'],
    ['Female hiking boot', 'women'],
    ['Womenswear ankle boot', 'women'],
    ['Women&#39;s Ankle Boot', 'women'],
    ["Men's Suede Chelsea Boot", 'men'],
    ['Mens suede chelsea boot', 'men'],
    ['Mens Chelsea Boot', 'men'],
    ['MEN’S CHELSEA BOOT', 'men'],
    ['Man leather boots', 'men'],
    ["Man's leather boots", 'men'],
    ['Male hiking boot', 'men'],
    ['Gents leather boots', 'men'],
    ['Menswear chelsea boot', 'men'],
    ['Men chelsea boot', 'men'],
    ['Women ankle boot', 'women'],
  ])('%j is for %s', (text, expected) => {
    expect(listingGender(text)).toBe(expected);
  });

  it('never reads "women\'s" as "men\'s" (or "womens" as "mens")', () => {
    for (const t of ["Women's", 'Womens', 'WOMEN', 'women', "women's boots", 'womens boots', 'Boots (Womens)']) {
      expect(listingGender(t)).toBe('women');
    }
    for (const t of ["Men's", 'Mens', 'MEN', 'men', "men's boots", 'mens boots', 'Boots (Mens)']) {
      expect(listingGender(t)).toBe('men');
    }
  });

  it('says nothing for a title that does not name who it is for', () => {
    for (const t of [
      '',
      '   ',
      'Suede ankle boot',
      'Chelsea Boot - Zara United States',
      'Boyfriend jeans',
      'Girlfriend collective leggings',
      'Boy shorts',
      'Mother of pearl earrings',
      'Doberman leather bag',
      'Hermanos boot',
      'Mentor boot',
      'Humane leather',
      'Stuart Weitzman 5050 boot',
    ]) {
      expect(listingGender(t)).toBeUndefined();
    }
  });

  it('says nothing for a title that names both, or says unisex', () => {
    for (const t of [
      "Men's and Women's Chelsea Boot",
      "Men's & Women's Chelsea Boot",
      'Men/Women Chelsea Boot',
      "Women's 8 / Men's 6.5 sneaker",
      'Mens Womens Unisex boot',
      'Unisex Chelsea Boot',
      "Men's Unisex Chelsea Boot",
      'Women unisex boots',
      'Gender-neutral boot',
      'Gender neutral boot',
      'Boot for all genders',
      'Genderless boot',
    ]) {
      expect(listingGender(t)).toBeUndefined();
    }
  });

  it('is not fooled by punctuation, accents or case around the word', () => {
    expect(listingGender('Boots — Women’s, Tan')).toBe('women');
    expect(listingGender('(WOMEN) Ankle boots')).toBe('women');
    expect(listingGender('Ankle boots|Men')).toBe('men');
    expect(listingGender('Ankle-boots/Mens/Tan')).toBe('men');
    expect(listingGender('Ankle boots: “Womens”')).toBe('women');
    expect(listingGender('MÉN’S Bóot')).toBe('men');
    expect(listingGender('Ñandú Women’s Bóot')).toBe('women');
    expect(listingGender('Women’s Ankle Boot')).toBe('women');
  });

  it('does not take "man" or "woman" from inside a name or a material', () => {
    expect(listingGender('Man-made leather ankle boot')).toBeUndefined();
    expect(listingGender('Ankle boot, man-made upper')).toBeUndefined();
    expect(listingGender('Spider-Man graphic tee')).toBeUndefined();
    expect(listingGender('He-Man tee')).toBeUndefined();
    // Standing alone they are what shops write.
    expect(listingGender('Zara Man ankle boot')).toBe('men');
    expect(listingGender('Zara Woman ankle boot')).toBe('women');
    // The material does not hide a real signal.
    expect(listingGender("Women's man-made leather boot")).toBe('women');
  });

  it('reads the words of a children\'s listing without touching how children\'s items are told apart', () => {
    // Kids words alone name no gender; the children's filter has its own words.
    for (const t of ['Kids suede boot', 'Toddler chelsea boot', 'Infant bootie', 'Youth size 3 boot', 'Baby boots']) {
      expect(listingGender(t)).toBeUndefined();
    }
    expect(hasKidsWords('Kids suede boot')).toBe(true);
    // "Girls" and "boys" do say who it is for.
    expect(listingGender("Girls' ankle boot")).toBe('women');
    expect(listingGender("Boys' chelsea boot")).toBe('men');
    expect(listingGender("Boys' and girls' boot")).toBeUndefined();
    expect(hasKidsWords("Girls' ankle boot")).toBe(true);
    expect(hasKidsWords("Boys' chelsea boot")).toBe(true);
  });
});

describe('namesGender: whether the words say who it is for in any way', () => {
  it('is true for either gender, for both and for unisex', () => {
    for (const t of ["women's boots", "men's boots", "men's and women's boots", 'unisex boots', 'gender neutral boots', 'boots for ladies']) {
      expect(namesGender(t)).toBe(true);
    }
  });

  it('is false when the words name neither', () => {
    for (const t of ['ankle boots', 'tan suede chelsea boot', 'man-made boots', 'boyfriend jeans', '']) {
      expect(namesGender(t)).toBe(false);
    }
  });
});

describe('listingUrlGender: who the link says it is for', () => {
  it.each([
    ['https://www.nike.com/w/mens-shoes-nik1zy7ok', 'men'],
    ['https://www.nike.com/w/womens-shoes-5e1x6zy7ok', 'women'],
    ['https://www.nike.com/t/air-max-90-mens-shoes-abc123/DM0029-100', 'men'],
    ['https://www.nike.com/t/air-max-90-womens-shoes-abc123/DM0029-100', 'women'],
    ['https://www.zara.com/us/en/woman-shoes-boots-l1234.html', 'women'],
    ['https://www.zara.com/us/en/man-shoes-boots-l1234.html', 'men'],
    ['https://www.hm.com/en_us/men/shoes/boots.html', 'men'],
    ['https://www2.hm.com/en_us/ladies/shoes/boots.html', 'women'],
    ['https://www.nordstrom.com/browse/women/shoes/boots', 'women'],
    ['https://www.asos.com/us/men/shoes/cat/?cid=4209', 'men'],
    ['https://www.uniqlo.com/us/en/women/outerwear', 'women'],
    ['https://www.zappos.com/p/womens-sorel-joan-of-arctic/product/9187654/color/1', 'women'],
    ['https://www.zappos.com/p/mens-timberland-6-premium/product/1234567', 'men'],
    ['https://www.amazon.com/Dr-Martens-Mens-1460-Boot/dp/B000ABC123', 'men'],
    ['https://www.amazon.com/Dr-Martens-Womens-1460-Boot/dp/B000ABC123', 'women'],
    ['https://www.macys.com/shop/product/womens-chelsea-boot?ID=123', 'women'],
    ['https://example.com/women-s-boots/suede-boot-1', 'women'],
    ['https://example.com/men_s-boots/suede-boot-1', 'men'],
    ['https://example.com/p/Women%27s-Suede-Boot/1', 'women'],
    ['https://example.com/WOMEN/Boots/Suede', 'women'],
    ['https://example.com/products/lady-dior-bag', 'women'],
    ['https://example.com/shop/boots?gender=women', 'women'],
    ['https://example.com/shop/boots?gender=mens', 'men'],
    ['https://example.com/shop/boots?Gender=Male', 'men'],
    ['https://example.com/shop/boots?department=womens&color=tan', 'women'],
    ['https://example.com/shop/boots?filterByGender=women', 'women'],
    ['https://example.com/shop/boots?sex=female', 'women'],
    ['https://example.com/products/boot?genders[]=men', 'men'],
  ])('%s is for %s', (url, expected) => {
    expect(listingUrlGender(url)).toBe(expected);
  });

  it('keeps "mens-" and "womens-" apart', () => {
    expect(listingUrlGender('https://example.com/womens-shoes/boot')).toBe('women');
    expect(listingUrlGender('https://example.com/mens-shoes/boot')).toBe('men');
    expect(listingUrlGender('https://example.com/p/womens-sorel-boot')).toBe('women');
    expect(listingUrlGender('https://example.com/p/mens-sorel-boot')).toBe('men');
  });

  it('says nothing when the link does not say, says both, or says unisex', () => {
    for (const url of [
      'https://www.zara.com/us/en/leather-ankle-boots-p12345.html',
      'https://www2.hm.com/en_us/productpage.1234567001.html',
      'https://www.nordstrom.com/s/suede-knee-high-boot/7777',
      'https://www.amazon.com/dp/B000ABC123',
      'https://example.com/',
      'https://example.com/shop/boots?gender=women,men',
      'https://example.com/shop/boots?gender=1',
      'https://example.com/shop/boots?q=womens+boots',
      'https://example.com/men/boots/unisex-chelsea',
      'https://example.com/unisex-boot',
      'https://example.com/women/boots/mens-style-boot',
      'https://example.com/p/spider-man-boot',
      'https://example.com/p/tan-man-made-boot',
      'https://example.com/man-made-leather-boot',
      'https://example.com/p/ben-sherman-boot',
      'https://example.com/p/mentor-boot',
      'https://example.com/p/dr-martens-1460',
      'not a url',
      '',
    ]) {
      expect(listingUrlGender(url)).toBeUndefined();
    }
  });

  it('reads a malformed escape without throwing', () => {
    expect(() => listingUrlGender('https://example.com/p/100%/womens-boot')).not.toThrow();
    expect(listingUrlGender('https://example.com/p/100%/womens-boot')).toBe('women');
  });
});

describe('genderFit and genderBoost', () => {
  const l = (title: string, url = 'https://www.zara.com/us/en/boot-p1.html') => ({ title, url });

  it('is wanted / opposite / unmarked from the title or the link', () => {
    expect(genderFit(l("Women's Suede Boot"), 'women')).toBe('wanted');
    expect(genderFit(l("Women's Suede Boot"), 'men')).toBe('opposite');
    expect(genderFit(l('Suede Boot', 'https://www.nike.com/t/boot-mens-shoes-abc/1'), 'men')).toBe('wanted');
    expect(genderFit(l('Suede Boot', 'https://www.nike.com/t/boot-mens-shoes-abc/1'), 'women')).toBe('opposite');
    expect(genderFit(l('Suede Boot'), 'women')).toBe('unmarked');
    expect(genderFit(l('Suede Boot'), 'men')).toBe('unmarked');
  });

  it('counts conflicting or both-gender signals as unmarked', () => {
    expect(genderFit(l("Women's Suede Boot", 'https://example.com/men/boots/suede-1'), 'women')).toBe('unmarked');
    expect(genderFit(l("Women's Suede Boot", 'https://example.com/men/boots/suede-1'), 'men')).toBe('unmarked');
    expect(genderFit(l("Men's and Women's Suede Boot"), 'women')).toBe('unmarked');
    expect(genderFit(l('Unisex Suede Boot'), 'men')).toBe('unmarked');
  });

  it('boosts only a listing that clearly names the wanted gender', () => {
    expect(GENDER_BOOST).toBeGreaterThan(0);
    expect(genderBoost(l("Women's Suede Boot"), 'women')).toBe(GENDER_BOOST);
    expect(genderBoost(l("Women's Suede Boot"), 'men')).toBe(0);
    expect(genderBoost(l('Suede Boot'), 'women')).toBe(0);
    expect(genderBoost(l('Suede Boot', 'https://example.com/womens/boot-1'), 'women')).toBe(GENDER_BOOST);
    expect(genderBoost(l("Women's Suede Boot"), undefined)).toBe(0);
  });

  it('is smaller than one missing search word, so the words still lead', () => {
    // Search score is 6 x (share of search words found) + 2 x similarity: a missing word of three is 2.
    expect(GENDER_BOOST).toBeLessThan(6 / 3);
  });
});

describe('asShopFor', () => {
  it('keeps women and men and drops everything else', () => {
    expect(asShopFor('women')).toBe('women');
    expect(asShopFor('men')).toBe('men');
    for (const v of ['both', null, undefined, '', 'Women', 'kids', 42, {}]) expect(asShopFor(v)).toBeUndefined();
  });
});

describe('passesRelevance with shopFor', () => {
  const url = 'https://www.nordstrom.com/s/ankle-boot/1234';
  const listing = (title: string, link = url, source = 'nordstrom.com') => ({ title, url: link, source });
  const forWomen = relevanceContext({ subtype: 'ankle boots', category: 'shoes', shopFor: 'women' });
  const forMen = relevanceContext({ subtype: 'ankle boots', category: 'shoes', shopFor: 'men' });
  const noAnswer = relevanceContext({ subtype: 'ankle boots', category: 'shoes' });

  it('drops a listing whose title names the other gender, keeps matching and unmarked ones', () => {
    expect(passesRelevance(listing("Men's Suede Ankle Boot"), forWomen)).toBe(false);
    expect(passesRelevance(listing('Mens Suede Ankle Boot'), forWomen)).toBe(false);
    expect(passesRelevance(listing("Women's Suede Ankle Boot"), forWomen)).toBe(true);
    expect(passesRelevance(listing('Suede Ankle Boot'), forWomen)).toBe(true);

    expect(passesRelevance(listing("Women's Suede Ankle Boot"), forMen)).toBe(false);
    expect(passesRelevance(listing('Womens Suede Ankle Boot'), forMen)).toBe(false);
    expect(passesRelevance(listing("Men's Suede Ankle Boot"), forMen)).toBe(true);
    expect(passesRelevance(listing('Suede Ankle Boot'), forMen)).toBe(true);
  });

  it('drops a listing whose link names the other gender when the title says nothing', () => {
    expect(passesRelevance(listing('Suede Ankle Boot', 'https://www.nike.com/t/ankle-boot-mens-shoes-abc/1'), forWomen)).toBe(false);
    expect(passesRelevance(listing('Suede Ankle Boot', 'https://www.zara.com/us/en/man/ankle-boot-p1.html'), forWomen)).toBe(false);
    expect(passesRelevance(listing('Suede Ankle Boot', 'https://www.hm.com/en_us/ladies/ankle-boot/1'), forMen)).toBe(false);
    expect(passesRelevance(listing('Suede Ankle Boot', 'https://example.com/boot/1?gender=women'), forMen)).toBe(false);
    expect(passesRelevance(listing('Suede Ankle Boot', 'https://www.nike.com/t/ankle-boot-womens-shoes-abc/1'), forWomen)).toBe(true);
  });

  it('keeps a listing that names both, unisex, or contradicts itself', () => {
    expect(passesRelevance(listing("Men's and Women's Ankle Boot"), forWomen)).toBe(true);
    expect(passesRelevance(listing("Men's and Women's Ankle Boot"), forMen)).toBe(true);
    expect(passesRelevance(listing('Unisex Ankle Boot'), forWomen)).toBe(true);
    expect(passesRelevance(listing("Men's Unisex Ankle Boot"), forWomen)).toBe(true);
    // The title says what is wanted, the link says the other: not clear, so it stays.
    expect(passesRelevance(listing("Women's Ankle Boot", 'https://example.com/men/boots/ankle-boot-1'), forWomen)).toBe(true);
    // Women's sizes in a men's listing: the title names both.
    expect(passesRelevance(listing("Men's 7 / Women's 8.5 Ankle Boot"), forWomen)).toBe(true);
  });

  it('changes nothing without a gender, whatever the listings say', () => {
    const both = relevanceContext({ subtype: 'ankle boots', category: 'shoes', shopFor: 'both' as any });
    const nothing = relevanceContext({ subtype: 'ankle boots', category: 'shoes', shopFor: null as any });
    for (const ctx of [noAnswer, both, nothing]) {
      expect(ctx.shopFor).toBeUndefined();
      expect(passesRelevance(listing("Men's Suede Ankle Boot"), ctx)).toBe(true);
      expect(passesRelevance(listing("Women's Suede Ankle Boot"), ctx)).toBe(true);
      expect(passesRelevance(listing('Suede Ankle Boot', 'https://example.com/mens/boot-1'), ctx)).toBe(true);
    }
  });

  it('still applies the other rules', () => {
    // Right gender, wrong product type, children's, and a category page are dropped as before.
    expect(passesRelevance(listing("Women's Leather Sneakers"), forWomen)).toBe(false);
    expect(passesRelevance(listing("Women's Toddler Ankle Boot"), forWomen)).toBe(false);
    expect(passesRelevance(listing("Women's Ankle Boots", 'https://www.nordstrom.com/browse/women/shoes/boots'), forWomen)).toBe(false);
  });

  it('is off for a children\'s search', () => {
    const kids = relevanceContext({ text: 'toddler boots', shopFor: 'women' });
    expect(kids.audience).toBe('kids');
    expect(kids.shopFor).toBeUndefined();
    expect(relevanceContext({ audience: 'kids', subtype: 'boots', shopFor: 'men' }).shopFor).toBeUndefined();
    // Even a hand-built context cannot apply it to a children's search.
    expect(
      passesRelevance(listing("Boys' Chelsea Boot"), { audience: 'kids', head: 'boots', shopFor: 'women' }),
    ).toBe(true);
  });

  it('is off when the person\'s own words name a gender: they said what they want', () => {
    const typedMens = relevanceContext({ text: "men's chelsea boots", shopFor: 'women' });
    expect(typedMens.shopFor).toBeUndefined();
    expect(passesRelevance(listing("Men's Chelsea Boot"), typedMens)).toBe(true);
    expect(relevanceContext({ text: 'womens chelsea boots', shopFor: 'men' }).shopFor).toBeUndefined();
    expect(relevanceContext({ text: 'unisex sneakers', shopFor: 'women' }).shopFor).toBeUndefined();
    expect(relevanceContext({ subtype: "women's ankle boots", shopFor: 'women' }).shopFor).toBeUndefined();
    expect(relevanceContext({ text: 'ankle boots', shopFor: 'women' }).shopFor).toBe('women');
  });
});

describe('buildBraveQuery with shopFor', () => {
  const sites = (q: string) => words(q).filter(w => w.startsWith('-site:'));

  it('adds "womens" or "mens" once, right after the words', () => {
    expect(buildBraveQuery('ankle boots', { shopFor: 'women' }).q).toBe('ankle boots womens');
    expect(buildBraveQuery('ankle boots', { shopFor: 'men' }).q).toBe('ankle boots mens');
    const q = buildBraveQuery('  tan   suede ankle boots ', { shopFor: 'women', excludeResale: true }).q;
    expect(q.startsWith('tan suede ankle boots womens -site:ebay.com')).toBe(true);
    expect(words(q).filter(w => w === 'womens')).toHaveLength(1);
  });

  it('puts the word before the -site: exclusions and keeps the exclusions after it', () => {
    const built = buildBraveQuery('ankle boots', { shopFor: 'men', excludeResale: true });
    expect(built.q).toBe(['ankle boots mens', ...built.excluded.map(h => `-site:${h}`)].join(' '));
    expect(built.q.indexOf('mens')).toBeLessThan(built.q.indexOf('-site:'));
    expect(built.excluded.length).toBeGreaterThan(8);
  });

  it('leaves the words and the exclusions list as they are without a gender', () => {
    for (const shopFor of [undefined, 'both' as any, null as any]) {
      expect(buildBraveQuery('ankle boots', { shopFor })).toEqual(buildBraveQuery('ankle boots'));
      expect(buildBraveQuery('ankle boots', { shopFor, excludeResale: true })).toEqual(
        buildBraveQuery('ankle boots', { excludeResale: true }),
      );
    }
    expect(buildBraveQuery('ankle boots').q).toBe('ankle boots');
  });

  it('does not add it when the words already name a gender, either one', () => {
    for (const text of [
      "women's ankle boots",
      'womens ankle boots',
      'Women ankle boots',
      "men's chelsea boots",
      'mens chelsea boots',
      "men's and women's boots",
      'unisex sneakers',
      'gender neutral sneakers',
      'ladies boots',
      'male hiking boots',
    ]) {
      for (const shopFor of ['women', 'men'] as const) {
        const built = buildBraveQuery(text, { shopFor, excludeResale: true });
        expect(built.q).toBe(buildBraveQuery(text, { excludeResale: true }).q);
        const typed = words(text.toLowerCase().replace(/['’]/g, ''));
        // Nothing the person did not type.
        expect(words(built.q.toLowerCase().replace(/['’]/g, '')).filter(w => !w.startsWith('-site:'))).toEqual(typed);
      }
    }
  });

  it('does not add it to a children\'s search', () => {
    expect(buildBraveQuery('toddler boots', { shopFor: 'women' }).q).toBe('toddler boots');
    expect(buildBraveQuery('kids rain boots', { shopFor: 'men' }).q).toBe('kids rain boots');
    expect(buildBraveQuery('baby booties', { shopFor: 'women' }).q).toBe('baby booties');
  });

  it('treats man-made and boyfriend as plain words, not as a gender', () => {
    expect(buildBraveQuery('man-made leather boots', { shopFor: 'women' }).q).toBe('man-made leather boots womens');
    expect(buildBraveQuery('boyfriend jeans', { shopFor: 'women' }).q).toBe('boyfriend jeans womens');
  });

  it('counts the category noun as part of the words, and adds the gender after it', () => {
    expect(buildBraveQuery('bottega', { category: 'bags', shopFor: 'women' }).q).toBe('bottega bag womens');
    expect(buildBraveQuery('tan', { category: 'shoes', shopFor: 'men' }).q).toBe('tan shoes mens');
    expect(buildBraveQuery('bottega', { category: 'bags', shopFor: 'women' }).text).toBe('bottega bag');
  });

  it('adds nothing to an empty query', () => {
    expect(buildBraveQuery('', { shopFor: 'women', excludeResale: true }).q).toBe('');
    expect(buildBraveQuery(' :: ', { shopFor: 'men', excludeResale: true }).q).toBe('');
  });

  it('stays under the length cap and the word cap, for the full and the compact limit', () => {
    const texts = [
      Array.from({ length: 20 }, (_, i) => `longword${i}`).join(' '),
      'tan suede ankle boots',
      'x'.repeat(500),
    ];
    for (const max of [BRAVE_QUERY_MAX, COMPACT_QUERY_MAX]) {
      for (const text of texts) {
        for (const shopFor of ['women', 'men'] as const) {
          const built = buildBraveQuery(text, { excludeResale: true, maxLength: max, shopFor });
          expect(built.q.length).toBeLessThanOrEqual(max);
          expect(words(built.q).length).toBeLessThanOrEqual(BRAVE_QUERY_MAX_WORDS);
          // Whatever fits is whole hosts, never half of one.
          for (const site of sites(built.q)) expect(RESALE_QUERY_EXCLUSIONS).toContain(site.slice('-site:'.length));
        }
      }
    }
  });

  it('fits the word in ahead of the exclusions, dropping the least common exclusions when space is short', () => {
    const plain = buildBraveQuery('tan suede ankle boots', { excludeResale: true, maxLength: COMPACT_QUERY_MAX });
    const gendered = buildBraveQuery('tan suede ankle boots', { excludeResale: true, maxLength: COMPACT_QUERY_MAX, shopFor: 'women' });
    expect(gendered.q.startsWith('tan suede ankle boots womens -site:ebay.com -site:poshmark.com -site:depop.com')).toBe(true);
    expect(gendered.excluded.length).toBeLessThanOrEqual(plain.excluded.length);
    expect(gendered.excluded).toEqual(plain.excluded.slice(0, gendered.excluded.length));
    expect(gendered.q.length).toBeLessThanOrEqual(COMPACT_QUERY_MAX);
  });

  it('does not add the word when it would not fit: the person\'s words win', () => {
    const built = buildBraveQuery('ankle boots', { shopFor: 'women', maxLength: 'ankle boots'.length + 3 });
    expect(built.q).toBe('ankle boots');
  });

  it('an ordinary search keeps every default exclusion in the full limit with the word added', () => {
    const built = buildBraveQuery('burgundy leather clutch', { excludeResale: true, shopFor: 'women' });
    expect(built.q.startsWith('burgundy leather clutch womens -site:')).toBe(true);
    expect(built.excluded).toEqual([...RESALE_QUERY_EXCLUSIONS]);
    expect(built.q.length).toBeLessThanOrEqual(BRAVE_QUERY_MAX);
  });
});
