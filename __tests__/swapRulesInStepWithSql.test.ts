import fs from 'fs';
import path from 'path';
import { SWAP_ALIAS_PATTERN, SWAP_LIMITS, SWAP_REPORT_REASONS, SWAP_TERMS_VERSION } from '../src/config/swapRules';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const foundation = sql('20261015000100_swap_foundation.sql');
const listings = sql('20261015000200_swap_listings.sql');
const moderation = sql('20261015000400_swap_moderation.sql');

const limitsInSql = (): Record<string, number> => {
  const start = foundation.indexOf('create or replace function public.swap_limit');
  const body = foundation.slice(start, foundation.indexOf('$$;', foundation.indexOf('$$', start) + 2));
  return Object.fromEntries([...body.matchAll(/when '(\w+)'\s+then (\d+)/g)].map(m => [m[1], Number(m[2])]));
};

describe('swapRules.ts and the migrations say the same thing', () => {
  it('has the same limits', () => {
    const fromSql = limitsInSql();
    const textLengths = ['note_max', 'proposal_note_max', 'message_max'];     // enforced by column checks, not swap_limit
    const fromTs = Object.fromEntries(Object.entries(SWAP_LIMITS).filter(([k]) => !textLengths.includes(k)));
    expect(fromTs).toEqual(fromSql);
  });

  it('has the same text lengths as the column checks', () => {
    expect(foundation).toContain(`char_length(note) <= ${SWAP_LIMITS.note_max}`);
    expect(foundation).toContain(`char_length(body) between 1 and ${SWAP_LIMITS.message_max}`);
    expect(sql('20261015000300_swap_lifecycle.sql')).toContain(`char_length(clean) > ${SWAP_LIMITS.proposal_note_max}`);
    // The listing note is capped in the table, when it is edited, and again when the listing is built.
    expect(listings).toContain(`char_length(clean) > ${SWAP_LIMITS.note_max}`);
    expect(listings).toContain(`char_length(clean_note) > ${SWAP_LIMITS.note_max}`);
  });

  it('asks for the terms version the database holds', () => {
    expect(foundation).toContain(`('terms_version',         '"${SWAP_TERMS_VERSION}"'::jsonb)`);
  });

  it('offers the report reasons the database accepts', () => {
    const accepted = [...moderation.match(/check \(reason in \(([^)]*)\)\)/)![1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    expect(SWAP_REPORT_REASONS.map(r => r.value).sort()).toEqual(accepted.sort());
  });

  it('checks aliases the same way', () => {
    const regex = foundation.match(/alias ~ '(\^[^']+\$)'/)![1];
    expect(regex).toBe(SWAP_ALIAS_PATTERN.source);
  });
});
