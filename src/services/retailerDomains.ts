/**
 * retailerDomains — what kind of site a search result came from.
 *
 * Search for a product and the web hands back mostly second-hand listings
 * (eBay, Poshmark, Etsy...) because they have the most product photos. The app
 * wants shops first, so every result's host is classified and ranked by kind:
 *
 *   retail      brand and department-store sites (Nordstrom, Zara, Gucci...)
 *   unknown     anything we have no opinion on (small brand sites, boutiques)
 *   marketplace cross-border bulk marketplaces (AliExpress, Temu, Shein...)
 *   social      social, video, news, blog, search, stock-photo and image-host pages:
 *               never a product page
 *   resale      second-hand marketplaces (eBay, Poshmark, Depop, Etsy...)
 *
 * Matching is on the registrable domain, so subdomains (`us.gucci.com`,
 * `m.ebay.com`) and country domains (`zara.co.uk`, `ebay.com.au`) classify like
 * the main site, and look-alikes (`notebay.com`, `ebay.example.com`) do not.
 *
 * The lists below are maintained by hand. An entry is either an exact
 * registrable domain (`nordstrom.com`) or `name.*`, meaning that name on any
 * domain ending (`zara.*` covers zara.com, zara.co.uk, zara.fr). Use `name.*`
 * only for names that are not ordinary words; `gap.com` must not match `gap.cn`
 * run by someone else, and `express.com` is not `express.co.uk`.
 */

export type SourceKind = 'retail' | 'resale' | 'marketplace' | 'social' | 'unknown';

// ─── Domain lists ───────────────────────────────────────────────────────────

/** Department stores and multi-label retailers: the retailer is not the brand. */
const MULTI_BRAND_RETAIL = [
  'amazon.*', 'walmart.*', 'target.com', 'costco.com', 'zulily.com', 'overstock.com',
  'nordstrom.com', 'nordstromrack.com', 'macys.com', 'bloomingdales.com',
  'saksfifthavenue.com', 'saksoff5th.com', 'neimanmarcus.com', 'bergdorfgoodman.com',
  'kohls.com', 'jcpenney.com', 'dillards.com', 'belk.com', 'tjmaxx.com', 'marshalls.com',
  'rossstores.com', 'burlington.com', 'lordandtaylor.com', 'thebay.com', 'holtrenfrew.com',
  'gilt.com', 'bluefly.com',
  'zappos.com', '6pm.com', 'dsw.com', 'famousfootwear.com', 'footlocker.*', 'finishline.com',
  'jdsports.*', 'journeys.com', 'shoecarnival.com', 'hibbett.com', 'dickssportinggoods.com',
  'sportsdirect.com', 'rei.com', 'sunglasshut.com',
  'zalando.*', 'aboutyou.*', 'asos.com', 'revolve.com', 'shopbop.com', 'fwrd.com',
  'intermixonline.com', 'net-a-porter.com', 'mrporter.com', 'theoutnet.com', 'yoox.com',
  'farfetch.com', 'ssense.com', 'mytheresa.com', 'matchesfashion.com', 'brownsfashion.com',
  'luisaviaroma.com', '24s.com', 'cettire.com', 'modaoperandi.com', 'endclothing.com',
  'ounass.com', 'lanecrawford.com', 'bestsecret.com', 'lyst.com', 'stitchfix.com',
  'selfridges.com', 'harrods.com', 'harveynichols.com', 'johnlewis.com',
  'marksandspencer.com', 'next.co.uk', 'nextdirect.com', 'debenhams.com',
  'houseoffraser.co.uk', 'very.co.uk',
] as const;

/**
 * Single-brand sites: the host is the brand. Each entry is the site and the
 * brand's name as it is written, so a brand is never guessed from the host text.
 */
const BRAND_SITES: Readonly<Record<string, string>> = {
  // High street and fast fashion
  'zara.*': 'Zara', 'hm.com': 'H&M', 'mango.*': 'Mango', 'cos.com': 'COS', 'arket.com': 'Arket',
  'stories.com': '& Other Stories', 'weekday.com': 'Weekday', 'monki.com': 'Monki',
  'uniqlo.*': 'Uniqlo', 'muji.com': 'Muji', 'gu-global.com': 'GU', 'massimodutti.com': 'Massimo Dutti',
  'pullandbear.com': 'Pull&Bear', 'bershka.com': 'Bershka', 'stradivarius.com': 'Stradivarius',
  'oysho.com': 'Oysho', 'primark.com': 'Primark', 'topshop.com': 'Topshop', 'topman.com': 'Topman',
  'riverisland.com': 'River Island', 'newlook.com': 'New Look', 'boohoo.com': 'Boohoo',
  'prettylittlething.com': 'PrettyLittleThing', 'fashionnova.com': 'Fashion Nova',
  'princesspolly.com': 'Princess Polly', 'princess-polly.com': 'Princess Polly',
  'missguided.com': 'Missguided', 'nastygal.com': 'Nasty Gal', 'lulus.com': 'Lulus',
  'whitefoxboutique.com': 'White Fox', 'showpo.com': 'Showpo', 'forever21.com': 'Forever 21',
  'express.com': 'Express', 'gap.com': 'Gap', 'oldnavy.com': 'Old Navy',
  'bananarepublic.com': 'Banana Republic', 'jcrew.com': 'J.Crew', 'madewell.com': 'Madewell',
  'anthropologie.com': 'Anthropologie', 'freepeople.com': 'Free People',
  'urbanoutfitters.com': 'Urban Outfitters', 'abercrombie.com': 'Abercrombie & Fitch',
  'aerie.com': 'Aerie', 'ae.com': 'American Eagle', 'hollisterco.com': 'Hollister', 'loft.com': 'Loft',
  'anntaylor.com': 'Ann Taylor', 'chicos.com': "Chico's",
  'whitehouseblackmarket.com': 'White House Black Market', 'talbots.com': 'Talbots',
  'lanebryant.com': 'Lane Bryant', 'torrid.com': 'Torrid', 'eloquii.com': 'Eloquii',
  'victoriassecret.com': "Victoria's Secret", 'boden.com': 'Boden',
  // Contemporary
  'everlane.com': 'Everlane', 'reformation.com': 'Reformation', 'thereformation.com': 'Reformation',
  'aritzia.com': 'Aritzia', 'theory.com': 'Theory', 'vince.com': 'Vince', 'allsaints.com': 'AllSaints',
  'reiss.com': 'Reiss', 'whistles.com': 'Whistles', 'tedbaker.com': 'Ted Baker', 'sezane.com': 'Sezane',
  'ba-sh.com': 'Ba&sh', 'maje.com': 'Maje', 'sandro-paris.com': 'Sandro', 'ganni.com': 'Ganni',
  'acnestudios.com': 'Acne Studios', 'toteme-studio.com': 'Toteme', 'rag-bone.com': 'Rag & Bone',
  'staud.clothing': 'Staud', 'khaite.com': 'Khaite', 'therow.com': 'The Row', 'cuyana.com': 'Cuyana',
  'bonobos.com': 'Bonobos', 'suitsupply.com': 'Suitsupply', 'brooksbrothers.com': 'Brooks Brothers',
  // Designer and luxury
  'gucci.com': 'Gucci', 'prada.com': 'Prada', 'chanel.com': 'Chanel', 'dior.com': 'Dior',
  'louisvuitton.com': 'Louis Vuitton', 'hermes.com': 'Hermes', 'saintlaurent.com': 'Saint Laurent',
  'balenciaga.com': 'Balenciaga', 'bottegaveneta.com': 'Bottega Veneta', 'celine.com': 'Celine',
  'loewe.com': 'Loewe', 'fendi.com': 'Fendi', 'burberry.com': 'Burberry', 'givenchy.com': 'Givenchy',
  'valentino.com': 'Valentino', 'versace.com': 'Versace', 'miumiu.com': 'Miu Miu',
  'moncler.com': 'Moncler', 'maxmara.com': 'Max Mara', 'stellamccartney.com': 'Stella McCartney',
  'isabelmarant.com': 'Isabel Marant', 'jilsander.com': 'Jil Sander', 'marni.com': 'Marni',
  'tomford.com': 'Tom Ford', 'alexanderwang.com': 'Alexander Wang', 'armani.com': 'Armani',
  'zegna.com': 'Zegna', 'hugoboss.com': 'Hugo Boss', 'diesel.com': 'Diesel',
  'jimmychoo.com': 'Jimmy Choo', 'manoloblahnik.com': 'Manolo Blahnik',
  'christianlouboutin.com': 'Christian Louboutin', 'stuartweitzman.com': 'Stuart Weitzman',
  // Bags
  'coach.com': 'Coach', 'katespade.com': 'Kate Spade', 'toryburch.com': 'Tory Burch',
  'michaelkors.com': 'Michael Kors', 'marcjacobs.com': 'Marc Jacobs',
  'rebeccaminkoff.com': 'Rebecca Minkoff', 'longchamp.com': 'Longchamp', 'mulberry.com': 'Mulberry',
  'furla.com': 'Furla', 'strathberry.com': 'Strathberry', 'polene-paris.com': 'Polene',
  'mansurgavriel.com': 'Mansur Gavriel', 'herschel.com': 'Herschel', 'away.com': 'Away',
  // American classics and denim
  'ralphlauren.com': 'Ralph Lauren', 'polo.com': 'Polo Ralph Lauren', 'calvinklein.com': 'Calvin Klein',
  'tommyhilfiger.com': 'Tommy Hilfiger', 'lacoste.*': 'Lacoste', 'levi.com': "Levi's",
  'levis.com': "Levi's", 'wrangler.com': 'Wrangler', 'lee.com': 'Lee', 'dockers.com': 'Dockers',
  'guess.com': 'Guess',
  // Athletic and outdoor
  'nike.*': 'Nike', 'adidas.*': 'Adidas', 'puma.*': 'Puma', 'reebok.com': 'Reebok',
  'underarmour.com': 'Under Armour', 'newbalance.com': 'New Balance', 'asics.com': 'Asics',
  'brooksrunning.com': 'Brooks', 'hoka.com': 'Hoka', 'on-running.com': 'On', 'saucony.com': 'Saucony',
  'lululemon.com': 'Lululemon', 'aloyoga.com': 'Alo Yoga', 'alo.com': 'Alo Yoga',
  'athleta.com': 'Athleta', 'gymshark.com': 'Gymshark', 'outdoorvoices.com': 'Outdoor Voices',
  'vuoriclothing.com': 'Vuori', 'fabletics.com': 'Fabletics', 'sweatybetty.com': 'Sweaty Betty',
  'beyondyoga.com': 'Beyond Yoga', 'patagonia.com': 'Patagonia', 'thenorthface.com': 'The North Face',
  'columbia.com': 'Columbia', 'arcteryx.com': "Arc'teryx", 'canadagoose.com': 'Canada Goose',
  'llbean.com': 'L.L.Bean', 'eddiebauer.com': 'Eddie Bauer', 'carhartt.com': 'Carhartt',
  'filson.com': 'Filson', 'woolrich.com': 'Woolrich', 'barbour.com': 'Barbour',
  'fjallraven.com': 'Fjallraven', 'marmot.com': 'Marmot',
  // Shoes
  'converse.com': 'Converse', 'vans.com': 'Vans', 'crocs.com': 'Crocs', 'skechers.com': 'Skechers',
  'birkenstock.com': 'Birkenstock', 'drmartens.com': 'Dr. Martens', 'ugg.com': 'UGG',
  'timberland.com': 'Timberland', 'sorel.com': 'Sorel', 'clarks.com': 'Clarks',
  'stevemadden.com': 'Steve Madden', 'aldoshoes.com': 'Aldo', 'ninewest.com': 'Nine West',
  'samedelman.com': 'Sam Edelman', 'blundstone.com': 'Blundstone', 'allbirds.com': 'Allbirds',
  'commonprojects.com': 'Common Projects', 'goldengoose.com': 'Golden Goose', 'tecovas.com': 'Tecovas',
  'kurtgeiger.com': 'Kurt Geiger', 'charleskeith.com': 'Charles & Keith', 'ecco.com': 'ECCO',
  'toms.com': 'TOMS', 'keds.com': 'Keds', 'sperry.com': 'Sperry', 'rothys.com': "Rothy's",
  // Jewelry, watches, eyewear
  'tiffany.com': 'Tiffany & Co.', 'cartier.com': 'Cartier', 'bulgari.com': 'Bulgari',
  'vancleefarpels.com': 'Van Cleef & Arpels', 'mejuri.com': 'Mejuri', 'swarovski.com': 'Swarovski',
  'pandora.net': 'Pandora', 'kendrascott.com': 'Kendra Scott', 'jennybird.com': 'Jenny Bird',
  'gorjana.com': 'Gorjana', 'missoma.com': 'Missoma', 'monicavinader.com': 'Monica Vinader',
  'davidyurman.com': 'David Yurman', 'fossil.com': 'Fossil', 'timex.com': 'Timex',
  'danielwellington.com': 'Daniel Wellington', 'warbyparker.com': 'Warby Parker',
  'ray-ban.com': 'Ray-Ban', 'oakley.com': 'Oakley',
  // Hats
  'lackofcolor.com': 'Lack of Color', 'brixton.com': 'Brixton', 'goorin.com': 'Goorin Bros.',
};

const BRAND_RETAIL = Object.keys(BRAND_SITES);

/** Second-hand marketplaces. */
const RESALE = [
  'ebay.*', 'poshmark.*', 'depop.com', 'mercari.*', 'thredup.com', 'therealreal.com',
  'realreal.com', 'vestiairecollective.*', 'vinted.*', 'grailed.com', 'etsy.com',
  'offerup.com', 'whatnot.com', 'kidizen.com', 'tradesy.com', 'fashionphile.com',
  'rebag.com', 'stockx.com', 'goat.com', 'stadiumgoods.com', 'swap.com', 'curtsy.com',
  'hardlyeverwornit.com', 'luxurypromise.com', 'shopgoodwill.com', '1stdibs.com',
  'rubylane.com', 'gumtree.com', 'craigslist.org', 'carousell.*', 'olx.*', 'wallapop.com',
  'sellpy.*', 'tise.com', 'kleinanzeigen.de', 'rebelle.com',
] as const;

/** Cross-border bulk marketplaces. */
const MARKETPLACE = [
  'aliexpress.*', 'alibaba.com', '1688.com', 'taobao.com', 'tmall.com', 'temu.com',
  'wish.com', 'dhgate.com', 'shein.*', 'sheinside.com', 'romwe.com', 'zaful.com',
  'banggood.com', 'lightinthebox.com', 'miniinthebox.com', 'joom.com', 'jollychic.com',
  'newchic.com', 'rosegal.com', 'dresslily.com', 'made-in-china.com', 'globalsources.com',
  'shopee.*', 'lazada.*', 'mercadolibre.*', 'rakuten.*', 'flipkart.com', 'myntra.com',
  'ajio.com', 'jumia.*',
] as const;

/**
 * Never a product page: video, social, news, magazines, blogs, search engines,
 * stock-photo libraries and the hosts that only serve pictures.
 */
const SOCIAL = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com', 'dailymotion.com',
  'twitch.tv', 'tiktok.com',
  'instagram.com', 'pinterest.*', 'pinimg.com', 'facebook.com', 'fb.com', 'fbsbx.com',
  'fbcdn.net', 'twitter.com', 'x.com', 't.co', 'reddit.com', 'redd.it', 'tumblr.com',
  'snapchat.com', 'threads.net', 'bsky.app', 'linkedin.com',
  'medium.com', 'substack.com', 'wikipedia.org', 'wikimedia.org', 'quora.com',
  'blogspot.*', 'blogger.com', 'wordpress.com', 'squarespace.com', 'wixsite.com',
  'weebly.com', 'tripod.com', 'archive.org', 'wikihow.com', 'yelp.com',
  'nytimes.com', 'wsj.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'theguardian.com',
  'huffpost.com', 'buzzfeed.com',
  'vogue.com', 'elle.com', 'harpersbazaar.com', 'gq.com', 'refinery29.com',
  'whowhatwear.com', 'instyle.com', 'cosmopolitan.com', 'glamour.com', 'popsugar.com',
  'thecut.com', 'nylon.com', 'marieclaire.com', 'stylecaster.com', 'lookbook.nu',
  'shopstyle.com', 'shopltk.com', 'liketoknow.it', 'rstyle.me',
  'google.*', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  // Stock-photo and image libraries: a picture of boots, not boots for sale (stock.adobe.com is adobe.com).
  'shutterstock.com', 'alamy.com', 'dreamstime.com', 'freepik.com', 'depositphotos.com',
  'istockphoto.com', 'gettyimages.*', '123rf.com', 'pngtree.com', 'flickr.com', 'flic.kr',
  'imgur.com', 'deviantart.com', 'pixabay.com', 'unsplash.com', 'pexels.com', 'vecteezy.com',
  'adobestock.com', 'adobe.com', 'bigstockphoto.com', 'canstockphoto.com', 'vectorstock.com',
  'rawpixel.com', 'lovepik.com', 'pngwing.com', 'pngegg.com', 'cleanpng.com', 'photobucket.com',
  '500px.com', 'behance.net', 'dribbble.com', 'giphy.com',
  // Image hosts: a picture match links to the file, not to a listing, so even the
  // second-hand sites' own image servers are not resale pages.
  'ebayimg.com', 'ebaystatic.com', 'etsystatic.com', 'mercdn.net', 'vinted.net',
  'media-amazon.com', 'ssl-images-amazon.com', 'images-amazon.com', 'gstatic.com',
  'googleusercontent.com', 'ytimg.com', 'twimg.com', 'cdninstagram.com', 'staticflickr.com',
] as const;

/** Sites that sell only children's clothes. */
const KIDS_ONLY = [
  'carters.com', 'oshkosh.com', 'childrensplace.com', 'gymboree.com', 'janieandjack.com',
  'hannaandersson.com', 'crazy8.com', 'justice.com', 'potterybarnkids.com', 'kidizen.com',
] as const;

// ─── Matching ───────────────────────────────────────────────────────────────

export type RegistrableDomain = {
  /** The registered label, e.g. `zara` for `www.zara.co.uk`. */
  name: string;
  /** Everything after it, e.g. `co.uk`. */
  suffix: string;
  /** `name.suffix`. */
  domain: string;
};

// Country domains that register under a second level (`.co.uk`), so the
// registrable domain has three labels. Not the full public suffix list: just
// the ones shoppers actually meet.
const SECOND_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'co.nz',
  'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'co.in', 'co.za', 'co.il', 'co.id', 'co.th',
  'com.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.cn', 'com.hk', 'com.sg',
  'com.tw', 'com.tr', 'com.my', 'com.ph', 'com.vn', 'com.pl', 'com.ua', 'com.eg',
  'com.sa', 'com.pk', 'com.ng',
]);

/** Lower-cased host without `www.`, or '' when the URL has none. */
export const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

export const registrableDomain = (host: string): RegistrableDomain | null => {
  const h = host.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!h || !/^[a-z0-9.-]+$/.test(h)) return null;
  const labels = h.split('.');
  if (labels.length < 2 || labels.some(l => !l)) return null;
  const lastTwo = labels.slice(-2).join('.');
  if (labels.length >= 3 && SECOND_LEVEL_SUFFIXES.has(lastTwo)) {
    return {
      name: labels[labels.length - 3],
      suffix: lastTwo,
      domain: labels.slice(-3).join('.'),
    };
  }
  return { name: labels[labels.length - 2], suffix: labels[labels.length - 1], domain: lastTwo };
};

const makeMatcher = (...lists: ReadonlyArray<readonly string[]>) => {
  const exact = new Set<string>();
  const names = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      if (entry.endsWith('.*')) names.add(entry.slice(0, -2));
      else exact.add(entry);
    }
  }
  return (d: RegistrableDomain): boolean => exact.has(d.domain) || names.has(d.name);
};

// The brand name of a single-brand site, found the same way makeMatcher finds a site.
const makeBrandLookup = (sites: Readonly<Record<string, string>>) => {
  const exact = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const [entry, brand] of Object.entries(sites)) {
    if (entry.endsWith('.*')) byName.set(entry.slice(0, -2), brand);
    else exact.set(entry, brand);
  }
  return (d: RegistrableDomain): string | undefined => exact.get(d.domain) ?? byName.get(d.name);
};

const isRetailDomain = makeMatcher(MULTI_BRAND_RETAIL, BRAND_RETAIL);
const brandOfDomain = makeBrandLookup(BRAND_SITES);
const isResaleDomain = makeMatcher(RESALE);
const isMarketplaceDomain = makeMatcher(MARKETPLACE);
const isSocialDomain = makeMatcher(SOCIAL);
const isKidsOnlyDomain = makeMatcher(KIDS_ONLY);

/** The domain lists, for tests and anything that needs to show what is covered. */
export const DOMAIN_LISTS = {
  retail: [...MULTI_BRAND_RETAIL, ...BRAND_RETAIL] as readonly string[],
  /** The single-brand sites among `retail`, with the brand name each stands for. */
  brandSites: BRAND_SITES,
  resale: RESALE as readonly string[],
  marketplace: MARKETPLACE as readonly string[],
  social: SOCIAL as readonly string[],
  kidsOnly: KIDS_ONLY as readonly string[],
};

const compact = (s: string): string =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

// A brand's own store is often written `shop<brand>`, `<brand>outlet`, `<brand>usa`...
const BRAND_HOST_PREFIXES = ['', 'the', 'shop', 'wear', 'get', 'buy'];
const BRAND_HOST_SUFFIXES = [
  '', 'official', 'outlet', 'shop', 'store', 'usa', 'us', 'uk', 'eu', 'online', 'clothing',
  'fashion', 'co', 'brand',
];

/** True when the host is the brand's own site, e.g. `us.bottegaveneta.com` for "Bottega Veneta". */
const hostIsBrandSite = (d: RegistrableDomain, brands: readonly string[]): boolean => {
  const label = compact(d.name);
  for (const brand of brands) {
    const key = compact(brand);
    if (key.length < 3) continue;
    for (const p of BRAND_HOST_PREFIXES) {
      for (const s of BRAND_HOST_SUFFIXES) {
        if (label === `${p}${key}${s}`) return true;
      }
    }
  }
  return false;
};

export type ClassifyOptions = {
  /** The brand (or brand-like words) the user is looking for: a host that is that brand's own site counts as retail. */
  brand?: string | readonly string[];
};

export const classifyHost = (host: string, opts: ClassifyOptions = {}): SourceKind => {
  const d = registrableDomain(host);
  if (!d) return 'unknown';
  if (isSocialDomain(d)) return 'social';
  if (isResaleDomain(d)) return 'resale';
  if (isMarketplaceDomain(d)) return 'marketplace';
  if (isRetailDomain(d)) return 'retail';
  const brands = typeof opts.brand === 'string' ? [opts.brand] : opts.brand ?? [];
  if (brands.length > 0 && hostIsBrandSite(d, brands)) return 'retail';
  return 'unknown';
};

export const classifyUrl = (url: string, opts: ClassifyOptions = {}): SourceKind =>
  classifyHost(hostnameOf(url), opts);

/** The kind of a result: what the search stamped on it, else worked out from its host. */
export const sourceKindOf = (r: { source: string; sourceKind?: SourceKind }): SourceKind =>
  r.sourceKind ?? classifyHost(r.source);

/** Display order: lower comes first. Retail, unknown, marketplace, resale, and last what is not a shop at all. */
export const sourceTier = (kind: SourceKind): number => {
  switch (kind) {
    case 'retail': return 0;
    case 'unknown': return 1;
    case 'marketplace': return 2;
    case 'resale': return 3;
    case 'social': return 4;
  }
};

/** The small label on a result card, or null when we have nothing true to say about the site. */
export const sourceBadge = (kind: SourceKind): string | null => {
  switch (kind) {
    case 'retail': return 'Retail';
    case 'resale': return 'Resale';
    case 'marketplace': return 'Marketplace';
    default: return null;
  }
};

/** Resale hosts excluded at the source with `-site:`, most common first (a long list does not fit one query). */
export const RESALE_QUERY_EXCLUSIONS: readonly string[] = [
  'ebay.com', 'poshmark.com', 'depop.com', 'mercari.com', 'thredup.com', 'etsy.com',
  'therealreal.com', 'vinted.com', 'grailed.com', 'aliexpress.com', 'vestiairecollective.com',
  'temu.com', 'offerup.com', 'whatnot.com', 'dhgate.com', 'alibaba.com',
];

/** True for sites that sell only children's clothes. */
export const isKidsOnlyHost = (host: string): boolean => {
  const d = registrableDomain(host);
  return !!d && isKidsOnlyDomain(d);
};

/**
 * The brand a product from this host has, but only for a brand's own site. A
 * second-hand marketplace sells every brand, a department store is the retailer
 * and not the brand, and a shop we do not know has a name that is not a brand
 * ("bootbarn.com" is not a brand called Bootbarn), so those all give undefined.
 */
export const brandFromHost = (host: string): string | undefined => {
  const d = registrableDomain(host);
  return d ? brandOfDomain(d) : undefined;
};
