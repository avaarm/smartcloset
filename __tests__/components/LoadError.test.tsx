import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LoadError from '../../src/components/LoadError';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const retryButton = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(
    n => n.props.accessibilityLabel === 'Try again to load your wardrobe' && !!n.props.onPress,
  );

const render = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  return tree;
};

describe('LoadError', () => {
  it('says what failed and offers a labelled retry button', async () => {
    const tree = await render(<LoadError what="wardrobe" onRetry={() => {}} />);
    const text = flatten(tree.toJSON());
    expect(text).toContain("Couldn't load your wardrobe");
    expect(text).toContain('Check your connection and try again.');
    expect(text).toContain('Try again');

    const host = tree.root.find(
      n =>
        typeof n.type === 'string' &&
        n.props.accessibilityLabel === 'Try again to load your wardrobe',
    );
    expect(host.props.accessibilityRole).toBe('button');
  });

  it('fires onRetry when "Try again" is pressed', async () => {
    const onRetry = jest.fn();
    const tree = await render(<LoadError what="wardrobe" onRetry={onRetry} />);
    await act(async () => {
      retryButton(tree).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('ignores extra taps while a retry is still running, then re-arms', async () => {
    let finish!: () => void;
    const onRetry = jest.fn(() => new Promise<void>(res => (finish = res)));
    const tree = await render(<LoadError what="wardrobe" onRetry={onRetry} />);

    await act(async () => {
      retryButton(tree).props.onPress();
    });
    await act(async () => {
      retryButton(tree).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
    });
    await act(async () => {
      retryButton(tree).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('banner variant uses a custom title and still retries', async () => {
    const onRetry = jest.fn();
    const tree = await render(
      <LoadError
        variant="banner"
        what="wardrobe"
        title="Couldn't refresh your wardrobe"
        onRetry={onRetry}
      />,
    );
    expect(flatten(tree.toJSON())).toContain("Couldn't refresh your wardrobe");
    await act(async () => {
      retryButton(tree).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
