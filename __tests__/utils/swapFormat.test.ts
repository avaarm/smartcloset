import { closedExplanation, listingFacts, newClientRef, ownerLine, statusLabel, swapTitle, systemLineText } from '../../src/utils/swapFormat';

describe('swap wording', () => {
  it('makes a fresh uuid for each attempt', () => {
    expect(newClientRef()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRef()).not.toBe(newClientRef());
  });

  it('words each status from the member’s side', () => {
    expect(statusLabel({ status: 'proposed', role: 'recipient' })).toBe('Waiting for your answer');
    expect(statusLabel({ status: 'proposed', role: 'proposer' })).toBe('Waiting for their answer');
    expect(statusLabel({ status: 'declined', role: 'recipient' })).toBe('You declined');
    expect(statusLabel({ status: 'cancelled', closedReason: 'cancelled_by_recipient', role: 'proposer' })).toBe('They cancelled');
    expect(statusLabel({ status: 'completed', role: 'proposer' })).toBe('Swapped');
  });

  it('never says why a swap became unavailable', () => {
    const s = { status: 'cancelled' as const, closedReason: 'unavailable' as const, role: 'proposer' as const };
    expect(statusLabel(s)).toBe('No longer available');
    expect(closedExplanation(s)).not.toMatch(/block|report|suspend|unfriend|deleted their/i);
  });

  it('tells a member who already tapped what a cancellation by the other person means', () => {
    const s = { status: 'cancelled' as const, closedReason: 'cancelled_by_recipient' as const, role: 'proposer' as const };
    expect(closedExplanation(s)).toBe('They cancelled this swap.');
    expect(closedExplanation({ ...s, iDone: true })).toMatch(/after you tapped.*stays in your closet.*report/);
    expect(closedExplanation({ ...s, role: 'recipient', iDone: true })).toBe('You cancelled this swap.');
  });

  it('has nothing to explain while a swap is open', () => {
    expect(closedExplanation({ status: 'accepted', role: 'proposer' })).toBeNull();
    expect(closedExplanation({ status: 'proposed', role: 'recipient' })).toBeNull();
  });

  it('words the grey lines in a thread', () => {
    expect(systemLineText('proposed')).toBe('Offer sent');
    expect(systemLineText('unavailable')).toBe('No longer available');
    expect(systemLineText('nonsense')).toBe('');
  });

  it('lists only the facts that exist, in a fixed order', () => {
    const facts = listingFacts({ brand: 'Zara', size: 'M', condition: 'good', color: 'blue', materials: [{ name: 'wool', percentage: 80 }, { name: 'nylon' }], careInstructions: ['Dry clean only'], originCountry: 'Italy', season: ['winter'] });
    expect(facts.map(f => f.label)).toEqual(['Brand', 'Size', 'Condition', 'Colour', 'Materials', 'Care', 'Made in', 'Season']);
    expect(facts.find(f => f.label === 'Materials')?.value).toBe('80% wool, nylon');
    expect(listingFacts({})).toEqual([]);
  });

  it('names who and what', () => {
    expect(ownerLine({ ownerLabel: 'Ann', ownerKind: 'friend' })).toBe('Ann · Friend');
    expect(ownerLine({ ownerLabel: 'Velvet Otter', ownerKind: 'member' })).toBe('Velvet Otter · Member');
    expect(swapTitle(['Blazer'], ['Shirt', 'Hat'])).toBe('Blazer for Shirt and 1 more');
  });
});
