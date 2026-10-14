import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import SwapStatusBadge from '../../src/components/SwapStatusBadge';

const flatten = (node: any): string => (!node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children));
const text = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(el); });
  return flatten(tree.toJSON());
};

describe('SwapStatusBadge', () => {
  it('words the status from the member’s side', async () => {
    expect(await text(<SwapStatusBadge status="proposed" role="recipient" />)).toContain('Waiting for your answer');
    expect(await text(<SwapStatusBadge status="cancelled" closedReason="cancelled_by_proposer" role="recipient" />)).toContain('They cancelled');
    expect(await text(<SwapStatusBadge status="completed" role="proposer" />)).toContain('Swapped');
  });

  it('shows "No longer available" for every unexplained ending', async () => {
    expect(await text(<SwapStatusBadge status="cancelled" closedReason="unavailable" role="proposer" />)).toContain('No longer available');
  });
});
