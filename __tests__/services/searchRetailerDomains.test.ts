/**
 * Which kind of site a search result is on: shop, second-hand, marketplace,
 * social/news, or unknown. Matching is on the registrable domain.
 */
import {
  DOMAIN_LISTS,
  RESALE_QUERY_EXCLUSIONS,
  brandFromHost,
  classifyHost,
  classifyUrl,
  hostnameOf,
  isKidsOnlyHost,
  registrableDomain,
  sourceBadge,
  sourceKindOf,
  sourceTier,
} from '../../src/services/retailerDomains';

describe('registrableDomain', () => {
  it.each([
    ['www.nordstrom.com', 'nordstrom', 'com', 'nordstrom.com'],
    ['us.gucci.com', 'gucci', 'com', 'gucci.com'],
    ['shop.gap.com', 'gap', 'com', 'gap.com'],
    ['www.zara.co.uk', 'zara', 'co.uk', 'zara.co.uk'],
    ['m.ebay.com.au', 'ebay', 'com.au', 'ebay.com.au'],
    ['nike.com', 'nike', 'com', 'nike.com'],
    ['ONE.Two.Three.mango.es', 'mango', 'es', 'mango.es'],
  ])('%s', (host, name, suffix, domain) => {
    expect(registrableDomain(host)).toEqual({ name, suffix, domain });
  });

  it.each(['', 'localhost', 'a..b.com', 'bad host.com', '.', 'ex ample.com'])('rejects %j', host => {
    expect(registrableDomain(host)).toBeNull();
  });
});

describe('hostnameOf', () => {
  it('lower-cases and drops www', () => {
    expect(hostnameOf('https://WWW.Nordstrom.com/s/x')).toBe('nordstrom.com');
    expect(hostnameOf('http://us.gucci.com:8080/p')).toBe('us.gucci.com');
  });
  it('is empty for junk', () => {
    expect(hostnameOf('not a url')).toBe('');
    expect(hostnameOf('')).toBe('');
  });
});

describe('classifyHost: shops', () => {
  // Every retailer the product owner named, plus the usual department stores and brand sites.
  const RETAILERS = [
    'nordstrom.com', 'saksfifthavenue.com', 'neimanmarcus.com', 'bloomingdales.com', 'macys.com',
    'net-a-porter.com', 'mytheresa.com', 'farfetch.com', 'ssense.com', 'revolve.com', 'shopbop.com',
    'asos.com', 'zara.com', 'hm.com', 'mango.com', 'cos.com', 'arket.com', 'uniqlo.com', 'gap.com',
    'oldnavy.com', 'jcrew.com', 'madewell.com', 'anthropologie.com', 'freepeople.com',
    'urbanoutfitters.com', 'nike.com', 'adidas.com', 'newbalance.com', 'levi.com', 'patagonia.com',
    'lululemon.com', 'aritzia.com', 'everlane.com', 'reformation.com', 'abercrombie.com', 'aerie.com',
    'target.com', 'walmart.com', 'amazon.com', 'zappos.com', 'dsw.com', 'footlocker.com',
    'bottegaveneta.com', 'gucci.com', 'prada.com', 'chanel.com', 'dior.com', 'louisvuitton.com',
    'hermes.com', 'saintlaurent.com', 'balenciaga.com', 'celine.com', 'burberry.com', 'coach.com',
    'katespade.com', 'toryburch.com', 'ralphlauren.com', 'calvinklein.com', 'tommyhilfiger.com',
    'stevemadden.com', 'allsaints.com', 'ganni.com', 'ugg.com', 'sorel.com', 'drmartens.com',
  ];

  it('knows at least 60 well-known retailers', () => {
    expect(RETAILERS.length).toBeGreaterThanOrEqual(60);
  });

  it.each(RETAILERS)('%s is retail', domain => {
    expect(classifyHost(domain)).toBe('retail');
    expect(classifyHost(`www.${domain}`)).toBe('retail');
    expect(classifyUrl(`https://www.${domain}/some/product-p1.html`)).toBe('retail');
  });

  it('keeps a long list: well over 150 retail domains', () => {
    expect(DOMAIN_LISTS.retail.length).toBeGreaterThan(150);
  });

  it('classifies subdomains and country domains like the main site', () => {
    expect(classifyHost('us.gucci.com')).toBe('retail');
    expect(classifyHost('shop.gap.com')).toBe('retail');
    expect(classifyHost('www2.hm.com')).toBe('retail');
    expect(classifyHost('zara.co.uk')).toBe('retail');
    expect(classifyHost('www.zara.fr')).toBe('retail');
    expect(classifyHost('www.amazon.co.uk')).toBe('retail');
    expect(classifyHost('nike.com.br')).toBe('retail');
    expect(classifyHost('www.next.co.uk')).toBe('retail');
  });

  it('does not match look-alike hosts', () => {
    expect(classifyHost('notnordstrom.com')).toBe('unknown');
    expect(classifyHost('nordstrom.com.evil.example')).toBe('unknown');
    expect(classifyHost('gucci-outlet-sale.net')).toBe('unknown');
    expect(classifyHost('mygap.com')).toBe('unknown');
    // An ordinary word registered elsewhere is not the retailer: gap.cn is not in the list.
    expect(classifyHost('gap.cn')).toBe('unknown');
    expect(classifyHost('target.org')).toBe('unknown');
  });

  it('treats a host that is the detected brand as retail, but only with that brand', () => {
    expect(classifyHost('smallbrandstudio.com')).toBe('unknown');
    expect(classifyHost('smallbrandstudio.com', { brand: 'Small Brand Studio' })).toBe('retail');
    expect(classifyHost('us.bottegaveneta.com', { brand: 'Bottega Veneta' })).toBe('retail');
    expect(classifyHost('shop-acme.com', { brand: 'Acme' })).toBe('retail');
    expect(classifyHost('acmeoutlet.com', { brand: 'Acme' })).toBe('retail');
    expect(classifyHost('acmeusa.com', { brand: ['Other', 'Acme'] })).toBe('retail');
    expect(classifyHost('unrelated.com', { brand: 'Acme' })).toBe('unknown');
    // Too short to be a safe match.
    expect(classifyHost('ab.com', { brand: 'AB' })).toBe('unknown');
  });

  it('never upgrades a resale or social host because of a brand', () => {
    expect(classifyHost('ebay.com', { brand: 'ebay' })).toBe('resale');
    expect(classifyHost('pinterest.com', { brand: 'pinterest' })).toBe('social');
  });
});

describe('classifyHost: resale, marketplaces, social', () => {
  it.each([
    'ebay.com', 'ebay.co.uk', 'm.ebay.com.au', 'poshmark.com', 'poshmark.ca', 'depop.com', 'mercari.com',
    'thredup.com', 'therealreal.com', 'vestiairecollective.com', 'vinted.com', 'vinted.fr', 'grailed.com',
    'etsy.com', 'offerup.com', 'whatnot.com', 'kidizen.com', 'tradesy.com', 'fashionphile.com',
    'rebag.com', 'stockx.com', 'goat.com',
  ])('%s is resale', host => {
    expect(classifyHost(host)).toBe('resale');
  });

  it.each([
    'aliexpress.com', 'aliexpress.us', 'temu.com', 'wish.com', 'dhgate.com', 'alibaba.com', 'shein.com',
    'us.shein.com', 'shein.co.uk', 'romwe.com',
  ])('%s is a marketplace', host => {
    expect(classifyHost(host)).toBe('marketplace');
  });

  it.each([
    'pinterest.com', 'pinterest.co.uk', 'in.pinterest.com', 'instagram.com', 'facebook.com',
    'm.facebook.com', 'reddit.com', 'old.reddit.com', 'tiktok.com', 'youtube.com', 'youtu.be',
    'someone.blogspot.com', 'blogspot.co.uk', 'x.wordpress.com', 'vogue.com', 'google.com', 'google.co.uk',
  ])('%s is social/other', host => {
    expect(classifyHost(host)).toBe('social');
  });

  // A picture of boots is not boots for sale: stock libraries and image hosts are never shops.
  it.each([
    'shutterstock.com', 'www.alamy.com', 'dreamstime.com', 'freepik.com', 'depositphotos.com',
    'istockphoto.com', 'gettyimages.com', 'gettyimages.co.uk', 'www.gettyimages.de', '123rf.com',
    'pngtree.com', 'flickr.com', 'imgur.com', 'i.imgur.com', 'deviantart.com', 'pixabay.com',
    'unsplash.com', 'images.unsplash.com', 'pexels.com', 'vecteezy.com', 'adobestock.com',
    'stock.adobe.com',
  ])('%s is a stock-photo site, not a shop', host => {
    expect(classifyHost(host)).toBe('social');
  });

  // A match on a picture links to the file. Even the second-hand sites' image servers are not
  // resale pages, and an unlisted host would count as a shop.
  it.each([
    'i.ebayimg.com', 'ebayimg.com', 'p.ebaystatic.com', 'i.etsystatic.com', 'img.mercdn.net',
    'images.vinted.net', 'm.media-amazon.com', 'images-na.ssl-images-amazon.com', 'encrypted-tbn0.gstatic.com',
    'lh3.googleusercontent.com',
  ])('%s is an image host, not a shop or a listing', host => {
    expect(classifyHost(host)).toBe('social');
  });

  it('keeps the pages of the sites whose image hosts are excluded', () => {
    expect(classifyHost('www.ebay.com')).toBe('resale');
    expect(classifyHost('www.etsy.com')).toBe('resale');
    expect(classifyHost('www.vinted.com')).toBe('resale');
    expect(classifyHost('www.mercari.com')).toBe('resale');
    expect(classifyHost('www.amazon.com')).toBe('retail');
  });

  it('is unknown for anything else, and for junk', () => {
    expect(classifyHost('boutique-on-main-street.com')).toBe('unknown');
    expect(classifyHost('')).toBe('unknown');
    expect(classifyHost('localhost')).toBe('unknown');
  });

  it('does not mistake look-alikes for resale', () => {
    expect(classifyHost('notebay.com')).toBe('unknown');
    expect(classifyHost('ebay.example.com')).toBe('unknown');
    expect(classifyHost('poshmarket.com')).toBe('unknown');
  });

  it('classifies a url by its host', () => {
    expect(classifyUrl('https://www.ebay.com/itm/123')).toBe('resale');
    expect(classifyUrl('https://www.nordstrom.com/s/x/1')).toBe('retail');
    expect(classifyUrl('not a url')).toBe('unknown');
  });

  it('has no domain in two shop/other lists that would make the answer depend on order', () => {
    const exact = (list: readonly string[]) => new Set(list.filter(d => !d.endsWith('.*')));
    const retail = exact(DOMAIN_LISTS.retail);
    for (const other of [DOMAIN_LISTS.resale, DOMAIN_LISTS.marketplace, DOMAIN_LISTS.social]) {
      for (const d of other) expect(retail.has(d)).toBe(false);
    }
  });
});

describe('tiers and badges', () => {
  it('orders retail, unknown, marketplace, resale, and last what is not a shop at all', () => {
    expect(sourceTier('retail')).toBeLessThan(sourceTier('unknown'));
    expect(sourceTier('unknown')).toBeLessThan(sourceTier('marketplace'));
    expect(sourceTier('marketplace')).toBeLessThan(sourceTier('resale'));
    expect(sourceTier('resale')).toBeLessThan(sourceTier('social'));
  });

  it('labels only what is true', () => {
    expect(sourceBadge('retail')).toBe('Retail');
    expect(sourceBadge('resale')).toBe('Resale');
    expect(sourceBadge('marketplace')).toBe('Marketplace');
    expect(sourceBadge('unknown')).toBeNull();
    expect(sourceBadge('social')).toBeNull();
  });

  it('uses the kind stamped on a result, else works it out from the host', () => {
    expect(sourceKindOf({ source: 'ebay.com' })).toBe('resale');
    expect(sourceKindOf({ source: 'ebay.com', sourceKind: 'retail' })).toBe('retail');
    expect(sourceKindOf({ source: 'smallshop.com' })).toBe('unknown');
  });
});

describe('brandFromHost', () => {
  it('names the brand for a brand site', () => {
    expect(brandFromHost('zara.com')).toBe('Zara');
    expect(brandFromHost('www.bottegaveneta.com')).toBe('Bottega Veneta');
    expect(brandFromHost('us.ralphlauren.com')).toBe('Ralph Lauren');
    expect(brandFromHost('hm.com')).toBe('H&M');
    expect(brandFromHost('www.zara.co.uk')).toBe('Zara');
    expect(brandFromHost('shop.gap.com')).toBe('Gap');
  });

  // Written from the host text these came out glued or wrong: Aldoshoes, Goldengoose, Rag-bone...
  it.each([
    ['aldoshoes.com', 'Aldo'],
    ['goldengoose.com', 'Golden Goose'],
    ['kurtgeiger.com', 'Kurt Geiger'],
    ['hugoboss.com', 'Hugo Boss'],
    ['allsaints.com', 'AllSaints'],
    ['tedbaker.com', 'Ted Baker'],
    ['rag-bone.com', 'Rag & Bone'],
    ['cos.com', 'COS'],
    ['jcrew.com', 'J.Crew'],
    ['oldnavy.gap.com', 'Gap'],
    ['sweatybetty.com', 'Sweaty Betty'],
    ['thenorthface.com', 'The North Face'],
  ])('%s is %s', (host, brand) => {
    expect(brandFromHost(host)).toBe(brand);
  });

  it('knows a written-out brand name for every brand site in the list', () => {
    const sites = Object.entries(DOMAIN_LISTS.brandSites);
    expect(sites.length).toBeGreaterThan(150);
    for (const [entry, brand] of sites) {
      // `zara.*` stands for zara on any domain ending.
      const host = entry.endsWith('.*') ? `${entry.slice(0, -2)}.com` : entry;
      expect(classifyHost(host)).toBe('retail');
      expect(brandFromHost(host)).toBe(brand);
      expect(brand).toMatch(/^[A-Z0-9&]/);
    }
  });

  it('says nothing for second-hand sites, department stores, marketplaces or social', () => {
    for (const host of ['ebay.com', 'poshmark.com', 'nordstrom.com', 'amazon.com', 'aliexpress.com', 'pinterest.com']) {
      expect(brandFromHost(host)).toBeUndefined();
    }
  });

  it('says nothing for a shop that is in no list: the shop is not the brand', () => {
    for (const host of ['bootbarn.com', 'thursdayboots.com', 'shoes.com', 'boutique-on-main-street.com', 'www.smallshop.co.uk']) {
      expect(brandFromHost(host)).toBeUndefined();
    }
  });

  it('says nothing for stock-photo sites, image hosts or a look-alike of a brand site', () => {
    for (const host of ['shutterstock.com', 'i.ebayimg.com', 'notgucci.com', 'gucci.example.com']) {
      expect(brandFromHost(host)).toBeUndefined();
    }
  });

  it('says nothing for junk', () => {
    expect(brandFromHost('')).toBeUndefined();
    expect(brandFromHost('localhost')).toBeUndefined();
  });
});

describe('children-only sites', () => {
  it('flags them', () => {
    expect(isKidsOnlyHost('www.carters.com')).toBe(true);
    expect(isKidsOnlyHost('childrensplace.com')).toBe(true);
    expect(isKidsOnlyHost('nordstrom.com')).toBe(false);
    expect(isKidsOnlyHost('')).toBe(false);
  });
});

describe('RESALE_QUERY_EXCLUSIONS', () => {
  it('lists only hosts that really classify as second-hand or bulk marketplaces, most common first', () => {
    for (const host of RESALE_QUERY_EXCLUSIONS) {
      expect(['resale', 'marketplace']).toContain(classifyHost(host));
    }
    expect(RESALE_QUERY_EXCLUSIONS.slice(0, 3)).toEqual(['ebay.com', 'poshmark.com', 'depop.com']);
  });
});
