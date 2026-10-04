import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useLoadable } from '../../src/hooks/useLoadable';

let api: ReturnType<typeof useLoadable<string[], void>>;
const Probe = ({ load }: { load: () => Promise<string[]> }) => {
  api = useLoadable<string[], void>(load, []);
  return null;
};

describe('useLoadable.update', () => {
  it('is not undone by a reload that was already running (a deleted row stays deleted)', async () => {
    let finish!: (rows: string[]) => void;
    const load = jest.fn(
      () => new Promise<string[]>(resolve => { finish = resolve; }),
    );
    await act(async () => { TestRenderer.create(<Probe load={load} />); });

    // A (slow) reload is in flight when the user deletes a row they already see.
    await act(async () => { api.reload(); });
    await act(async () => { api.update(() => ['b']); });
    await act(async () => { finish(['a', 'b']); });

    expect(api.data).toEqual(['b']);
  });
});
