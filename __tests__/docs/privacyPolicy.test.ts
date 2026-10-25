/**
 * The privacy page is edited once, by one stream, for both the quality ratings and the clothing swaps, and is
 * published before either build is submitted (documentation/design/swap.md 10.1, quality-ratings.md 8.2).
 * These checks read docs/privacy.html as text. They assert the combined wording by landmark and the
 * statements that must follow the state of the code (the legacy friends policy, the optional model step).
 * Swap's manifest and storage-claim checks are in __tests__/privacyManifest.test.ts. The professional accounts
 * wording (documentation/design/pro-accounts.md 6.8) is checked here by landmark and, in detail, in
 * __tests__/docs/proPolicy.test.ts.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('docs', 'privacy.html');
const moderation = read('docs', 'MODERATION.md');
const flags = read('src', 'config', 'ratingFlags.ts');
const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'));

const decode = (s: string) => s.replace(/&amp;/g, '&');
const visible = (s: string) => decode(s.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const text = visible(html);
const headings = [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map(m => decode(m[1]));
const rows = [...html.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)]
  .map(m => ({ category: decode(m[1]), what: visible(m[2]).trim(), why: visible(m[3]).trim() }));
const row = (prefix: string) => rows.find(r => r.category.startsWith(prefix));

// Words the repository keeps out of every file, built from pieces so this file does not contain them.
const FORBIDDEN = [['cl', 'aude'], ['anthr', 'opic'], ['co-auth', 'ored-by']].map(p => p.join(''));

describe('docs/privacy.html', () => {
  it('carries the publish date and not the old one', () => {
    expect(text).toMatch(/Last updated (January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/);
    expect(html).not.toContain('October 4, 2026');
  });

  it('is well formed enough to render the same everywhere', () => {
    for (const tag of ['table', 'tr', 'td', 'th', 'ul', 'li', 'p', 'h2', 'strong', 'a']) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      expect(`${tag}: ${open}`).toBe(`${tag}: ${close}`);
    }
    for (const r of rows) expect(r.what.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it('has no placeholder left in it', () => {
    expect(html).not.toMatch(/class="placeholder"|TODO|TBD|FIXME|lorem ipsum|\[[A-Za-z ]+\]/i);
  });

  it('keeps the sections in the agreed order', () => {
    const order = [
      'Information we collect',
      'How we use AI features',
      'Shared product database (optional)',
      'Quality ratings and brand insights (optional)',
      'Clothing swaps (optional)',
      'Working with a stylist (optional)',
      'How long we keep it',
      'Where your data is stored',
      'Community & safety',
      'Your choices',
      "Children's privacy",
      'Changes to this policy',
      'Contact',
    ];
    expect(headings).toEqual(order);
  });

  it('adds the swap sentence to the introduction', () => {
    expect(text).toContain('optionally connect with a personal stylist or friends and swap pieces of clothing with them');
  });

  it('lists the wardrobe fields the foundation migration added, without calling friend-readable notes private', () => {
    const wardrobe = row('Wardrobe content');
    expect(wardrobe).toBeDefined();
    expect(wardrobe!.what).toBe('Photos of clothing; brand, color, material, price, size, condition, care instructions and country of origin you enter or scan; the text of a tag you scan; your notes');
  });

  it('adds the new rows after Friends, in the agreed order, and no crash-report row', () => {
    const names = rows.map(r => r.category.replace(/ \(.*\)$/, ''));
    const at = names.indexOf('Friends');
    expect(at).toBeGreaterThan(-1);
    expect(names.slice(at + 1, at + 6)).toEqual(['Label scans', 'Quality ratings', 'Your agreement', 'Clothing swaps', 'Working with a stylist']);
    expect(names).toContain('Shared product details');
    expect(names).not.toContain('Social & marketplace');
    expect(text).not.toMatch(/crash/i);
    expect(names).not.toContain('Usage & diagnostics');
  });

  it('has no marketplace claim: stylists are reached by invite code only', () => {
    expect(text).not.toMatch(/marketplace|directory/i);
    expect(text).toContain('You connect only through a one-time invite code that the stylist gives you');
    expect(text).toContain('stylists are not listed anywhere in the app');
  });

  it('adds the stylist row to the table, and the section where people look for it', () => {
    const stylist = row('Working with a stylist');
    expect(stylist).toBeDefined();
    expect(stylist!.what).toContain('If you become a stylist: your professional profile');
    expect(stylist!.what).toContain('If you work with a stylist: the name you choose to show them, the pieces of your closet you choose to share and when');
    expect(stylist!.what).toContain('that you confirmed you are 18 or over and when');
    expect(stylist!.why).toBe('Letting you work with a stylist you choose');
    expect(row('Friends')!.what).not.toMatch(/appointment|stylist/i);
    const section = text.slice(text.indexOf('Working with a stylist (optional)', text.indexOf('Clothing swaps (optional)', text.indexOf('Shared product database'))));
    expect(section).toContain('Independent professionals.');
    expect(section).toContain('Who can see what.');
    expect(section).toContain('Your control.');
    expect(section).toContain('Messages and sessions.');
    expect(section).toContain('Age.');
    expect(section).toContain('If you delete your account');
  });

  it('names limited stylist actions in the usage limits row', () => {
    const usage = row('Usage limits');
    expect(usage).toBeDefined();
    expect(usage!.what).toContain('took limited swap actions or took limited stylist actions');
    expect(usage!.what).toContain('Numbers only, never the content');
  });

  it('describes label scans in the words that match the state of the friends policy', () => {
    const scans = row('Label scans');
    expect(scans).toBeDefined();
    expect(scans!.what).toContain('The photo is not kept');
    // "visible only to you" is true only once the legacy table policy is gone: its drop is held in
    // supabase/held and is released by moving it into supabase/migrations (quality-ratings.md 4.1, 8.2).
    const dropReleased = migrations.some(f => /^\d{14}_drop_legacy_friend_wardrobe_policy\.sql$/.test(f));
    if (dropReleased) {
      expect(scans!.what).toContain('visible only to you');
    } else {
      expect(scans!.what).toContain('visible to you and to friends you have accepted');
      expect(text).not.toContain('visible only to you');
    }
  });

  it('describes quality ratings as private by default and brand insights as optional and conditional', () => {
    expect(row('Quality ratings')).toBeDefined();
    expect(row('Your agreement')!.what).toContain('18 or older');
    const section = text.slice(text.indexOf('Quality ratings and brand insights (optional)'), text.indexOf('Clothing swaps (optional)', text.indexOf('Quality ratings and brand insights (optional)')));
    expect(section).toContain('Your ratings are private to your account by default');
    expect(section).toContain('a rating of an item is deleted when you delete the item');
    expect(section).toContain('off by default');
    expect(section).toContain('only if you are 18 or older');
    expect(section).toContain('at least 10 different members');
    expect(section).toContain('at least 10 of them have had their account for more than a month');
    expect(section).toContain('your version of the app may not offer them yet');
    expect(section).toContain('up to 24 hours');
    expect(section).toContain('We do not sell this data and we do not share it with brands or retailers');
    expect(section).toContain("Scores are members' opinions and are not verified");
  });

  it('keeps the shared Google bullet and the AI paragraph in the combined wording', () => {
    expect(text).toContain('It also reads the text on a clothing tag you photograph, and checks photos you list for community swaps for unsafe content and people (see Clothing swaps below); the swap check happens even if you turned off AI photo analysis');
    expect(text).toContain('If you scan a clothing tag, the photo of the tag is sent to Google Cloud Vision to read its text. The photo is not kept.');
    // "If you say no, nothing is sent" has exactly one exception, and the page names it.
    expect(text).toContain('If you say no, nothing is sent and you can add items by entering the details yourself. The one exception is the safety check on photos you list for community swaps');
  });

  it('says OpenAI receives tag text only when the optional model step is switched on', () => {
    const modelStepOn = /export const TAG_MODEL_FALLBACK_ENABLED = true/.test(flags);
    expect(flags).toMatch(/export const TAG_MODEL_FALLBACK_ENABLED = (true|false)/);
    // Sentences are taken block by block, so a list item that has no full stop does not run into the next one.
    const sentences = html.split(/<\/(?:li|p|td|th|h2)>/).flatMap(block => visible(block).split(/(?<=[.!?])\s+/));
    const mentionsTagToOpenAi = sentences.some(s => /OpenAI/.test(s) && /\b(tag|fabric lines)\b/i.test(s));
    expect(mentionsTagToOpenAi).toBe(modelStepOn);
    if (modelStepOn) expect(text).toContain('may be sent to OpenAI');
  });

  it('puts the swap section where people look for it, with its own retention table', () => {
    const section = text.slice(text.indexOf('Clothing swaps (optional)', text.indexOf('Shared product database')));
    expect(section).toContain('SmartCloset never handles money and is not a party to a swap');
    expect(section).toContain('Deleted about 30 days after the swap ends');
    expect(section).toContain('Deleted about 90 days after the swap ends');
    expect(section).toContain('Counters that limit spam 2 days');
    expect(section).toContain('If you delete your account, your listings and messages are deleted');
  });

  it('points the general retention section at the swap table', () => {
    const start = text.indexOf('How long we keep it', text.indexOf('Clothing swaps (optional)') + 200);
    const section = text.slice(start, text.indexOf('Where your data is stored'));
    expect(section).toContain('see the table under Clothing swaps');
    expect(section).toContain('until you delete them, delete the item, or delete your account');
    expect(section).toContain('copies in routine backups are overwritten on their normal schedule');
  });

  it('says who sees photos without calling the storage private', () => {
    expect(text).toContain("for pieces you open to swap, to the audience you chose under Clothing swaps. A photo's web address is not a password");
    expect(text).toContain('Your ratings and notes are never visible to friends.');
  });

  it('adds the swap copy and the brand-score report to Community & safety', () => {
    expect(text).toContain('or from a swap listing or conversation');
    expect(text).toContain('also keeps a copy of that listing or of the last 30 messages');
    expect(text).toContain('you can report one that looks wrong or manipulated from the brand page');
    expect(text).toContain('Reports and blocks are deleted along with either account');
  });

  it('adds the stylist and client reports, their evidence copy and the one shared block list to Community & safety', () => {
    expect(text).toContain('stylists and clients can also report or block each other from a profile (including before connecting), a message, a look or a session');
    expect(text).toContain('A report about a stylist or a client keeps a copy of the profile, of the last 30 messages, or of the look or session you reported');
    expect(text).toContain('blocking ends any friend request, friendship or stylist connection between you');
    expect(text).toContain('A block you make in Friends, Swaps or Stylists applies to all three');
  });

  it('lists what deleting the account removes, without "immediately"', () => {
    expect(text).toContain('(wardrobe items, outfits, ratings, style profile, friend connections, swap listings, offers and messages, and, if you used the stylist features, your stylist profile, invites, connections, shared-closet settings, looks, sessions and messages) from our systems. Copies in routine backups are overwritten on their normal schedule.');
    expect(text).not.toMatch(/immediately/i);
  });

  it('says where a person can change their mind about ratings, label scans and their export', () => {
    expect(text).toContain('Settings → Community lets you delete all your ratings');
    expect(text).toContain('Settings → Export Data includes your ratings');
    expect(text).toContain('clear the stored tag text on the item\'s page (Label, then Tag text, then Clear tag text)');
    expect(text).toContain('Settings → Export Data includes your swap listings, your offers and your own messages');
    expect(text).toContain('Settings → Export Data includes your stylist profile, your invites, your connections with their looks, sessions and sharing history, and your own messages, never the other person\'s messages');
  });

  it('keeps the age lines for all three features', () => {
    expect(text).toContain('Community swaps are for people 18 and over. Adding ratings to brand insights is for people 18 or older. Working with a stylist is for people 18 and over.');
  });

  it('points the general retention list at the stylist table and counts the stylist counters', () => {
    expect(text).toContain('Working with a stylist — see the table under Working with a stylist.');
    expect(text).toContain('Swap and stylist counters are deleted after 2 days');
  });

  it('says where a stylist can and cannot reach a photo, next to the friends statement', () => {
    expect(text).toContain('A stylist can see a client\'s closet pieces only while the client has switched sharing on; each photo is fetched through our server, which checks that sharing is still on and removes location and camera details before sending it.');
    // The friends exception is no longer "the one exception": the page says "except what you choose to share".
    expect(text).not.toContain('with one exception: if you add a friend');
  });

  it('keeps the contact address', () => {
    expect(html).toContain('mailto:emavanesem@gmail.com');
  });

  it('never names an AI assistant or its maker', () => {
    for (const word of FORBIDDEN) expect(html.toLowerCase()).not.toContain(word);
  });
});

describe('docs/MODERATION.md', () => {
  it('has the sections a reviewer on call needs', () => {
    for (const heading of ['# Swap moderation', '## Being told', '## The queue', '## Actions', '## Switches', '## The term list', '## What cannot be seen']) {
      expect(moderation).toContain(`${heading}\n`);
    }
  });

  it('tells the reviewer how to act, with the functions the database defines', () => {
    for (const fn of ['swap_admin_hold_listing', 'swap_admin_release_listing', 'swap_admin_remove_listing', 'swap_admin_suspend', 'swap_admin_unsuspend', 'swap_set_enabled', 'swap_set_community_enabled']) {
      expect(moderation).toContain(`select ${fn}(`);
    }
    expect(moderation).toContain('select * from swap_moderation_queue;');
    expect(moderation).toContain('swap_report_webhook');
  });

  it('only promises 24 hours while someone is told when reports are waiting', () => {
    expect(moderation).toContain('That is only true while someone is told when reports are waiting');
  });

  it('keeps the community switch behind a reviewed term list', () => {
    expect(moderation).toContain('Turning the community on again refuses until at least 50 terms are in `swap_blocked_terms`.');
  });

  it('holds no secret, link or address to post to', () => {
    expect(moderation).not.toMatch(/https?:\/\//);
    expect(moderation).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(moderation).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
    expect(moderation).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it('never names an AI assistant or its maker', () => {
    for (const word of FORBIDDEN) expect(moderation.toLowerCase()).not.toContain(word);
  });
});
