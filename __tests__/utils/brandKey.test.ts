/**
 * brandKeyRaw must stay identical to the SQL brand_key_raw(). Both are checked against the same pairs in
 * __tests__/fixtures/brandKeys.json (the SQL side by supabase/checks/brand_key_parity.sql).
 */
import fs from 'fs';
import path from 'path';
import { brandKeyRaw } from '../../src/utils/brandKey';
import pairs from '../fixtures/brandKeys.json';

describe('brandKeyRaw', () => {
  it.each(pairs as [string, string | null][])('%j becomes %j', (input, expected) => {
    expect(brandKeyRaw(input)).toBe(expected);
  });

  it('covers every pair in the shared fixture', () => {
    expect(pairs).toHaveLength(49);
  });

  it('keeps 40 characters at most', () => {
    expect(brandKeyRaw('x'.repeat(60))).toBe('x'.repeat(40));
    expect(brandKeyRaw('x'.repeat(40))).toHaveLength(40);
    expect(brandKeyRaw('x'.repeat(41))).toHaveLength(40);
    // the cap counts the key, not the typed text: punctuation and spaces do not use it up
    expect(brandKeyRaw(`${'- '.repeat(30)}${'a'.repeat(45)}`)).toBe('a'.repeat(40));
  });

  it('is null for nothing, spaces or symbols only', () => {
    expect(brandKeyRaw('')).toBeNull();
    expect(brandKeyRaw('   ')).toBeNull();
    expect(brandKeyRaw('---')).toBeNull();
    expect(brandKeyRaw('!?*')).toBeNull();
    expect(brandKeyRaw('日本')).toBeNull();
    expect(brandKeyRaw(null)).toBeNull();
    expect(brandKeyRaw(undefined)).toBeNull();
  });

  it('gives one key to spellings of one brand', () => {
    for (const same of [['Zara', 'ZARA', ' zara '], ['H&M', 'h & m', 'H and M'], ['Hermès', 'Hermes', 'HERMÈS'], ['Levi’s', "Levi's", 'Levis']]) {
      expect(new Set(same.map(s => brandKeyRaw(s))).size).toBe(1);
    }
  });

  it('keeps different brands apart', () => {
    expect(brandKeyRaw('Coach')).not.toBe(brandKeyRaw('Coachella'));
    expect(brandKeyRaw('Bottega')).not.toBe(brandKeyRaw('Bottega Veneta'));
  });

  it('never returns anything outside a-z and 0-9', () => {
    const samples = ['Ångström & Söner', 'Æsop', 'ß', 'Łódź', 'Zażółć gęślą jaźń', 'İzmir', 'Ünlü', 'Ørsted', 'Œuvre', 'Þórr', 'ǅ', '12 Rue 7'];
    for (const sample of samples) {
      const key = brandKeyRaw(sample);
      if (key !== null) expect(key).toMatch(/^[a-z0-9]{1,40}$/);
    }
  });

  it('has a fold table whose two halves line up', () => {
    // The fold is two strings read in step; if they ever differ in length every later letter folds to the wrong one.
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'utils', 'brandKey.ts'), 'utf8');
    const from = source.match(/const FOLD_FROM = '([^']*)'/)![1];
    const to = source.match(/const FOLD_TO = '([^']*)'/)![1];
    expect(Array.from(from)).toHaveLength(Array.from(to).length);
    // and each pair is a letter and its plain form
    Array.from(from).forEach((ch, i) => {
      const folded = brandKeyRaw(ch);
      expect(folded).toBe(Array.from(to)[i].toLowerCase());
    });
  });
});
