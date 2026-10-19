/**
 * RatingBreakdown: one labelled line per question, in the words the person chose. A question with nothing chosen
 * is left out; Overall is always there.
 */
import 'react-native';
import React from 'react';
import { Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import RatingBreakdown, { breakdownLines } from '../../src/components/RatingBreakdown';
import type { ItemRating } from '../../src/types/rating';

const rating = (over: Partial<ItemRating> = {}): ItemRating => ({
  itemId: 'item-1',
  overall: 4,
  touch: null,
  touchTags: [],
  comfort: null,
  comfortTags: [],
  holdsUp: null,
  holdsUpTags: [],
  fit: null,
  wouldBuyAgain: null,
  note: 'private words that are not shown here',
  contributed: false,
  wearsAtRating: 2,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('breakdownLines', () => {
  it('has Overall and nothing else for a bare star rating', () => {
    expect(breakdownLines(rating({ overall: 5 }))).toEqual([{ label: 'Overall', text: 'Excellent' }]);
  });

  it('names every question in order with the words chosen', () => {
    const lines = breakdownLines(
      rating({
        overall: 4,
        touch: 5,
        touchTags: ['silky', 'buttery'],
        comfort: 4,
        comfortTags: ['cozy', 'warm'],
        holdsUp: 3,
        holdsUpTags: ['washes_well'],
        fit: 'runs_small',
        wouldBuyAgain: 'maybe',
      }),
    );
    expect(lines).toEqual([
      { label: 'Overall', text: 'Good' },
      { label: 'Hand feel', text: 'Lovely to touch, Silky, Buttery' },
      { label: 'Comfort', text: 'Comfortable, Cozy, Warm' },
      { label: 'Holds up', text: 'Holding up okay, Washes well' },
      { label: 'Fit', text: 'Runs small' },
      { label: 'Would buy again', text: 'Maybe' },
    ]);
  });

  it('does not say the same word twice', () => {
    // The 4 on the hand feel scale is already "Soft".
    expect(breakdownLines(rating({ touch: 4, touchTags: ['soft', 'silky'] }))[1]).toEqual({
      label: 'Hand feel',
      text: 'Soft, Silky',
    });
  });

  it('shows words picked without a scale, and a scale without words', () => {
    const lines = breakdownLines(rating({ touchTags: ['crisp'], comfort: 2 }));
    expect(lines.find(l => l.label === 'Hand feel')?.text).toBe('Crisp');
    expect(lines.find(l => l.label === 'Comfort')?.text).toBe('Not very comfortable');
  });
});

describe('RatingBreakdown', () => {
  it('renders a labelled, readable row per line and never the private note', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<RatingBreakdown rating={rating({ fit: 'true_to_size', wouldBuyAgain: 'yes' })} />);
    });
    const rows = tree.root.findAllByType(View).filter(n => n.props.accessible === true).map(n => n.props.accessibilityLabel);
    expect(rows).toEqual(['Overall: Good', 'Fit: True to size', 'Would buy again: Yes']);
    const words = tree.root.findAllByType(Text).map(t => t.props.children);
    expect(words).not.toContain('private words that are not shown here');
  });
});
