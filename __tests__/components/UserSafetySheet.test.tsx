import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockReportUser = jest.fn();
const mockBlockUser = jest.fn();
jest.mock('../../src/services/friendService', () => ({
  reportUser: (...a: any[]) => mockReportUser(...a),
  blockUser: (...a: any[]) => mockBlockUser(...a),
}));

import UserSafetySheet from '../../src/components/UserSafetySheet';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (props: Partial<React.ComponentProps<typeof UserSafetySheet>> = {}) => {
  const onClose = jest.fn();
  const onBlocked = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <UserSafetySheet
        visible
        userId="u1"
        userName="Bob"
        context="friend_request"
        onClose={onClose}
        onBlocked={onBlocked}
        {...props}
      />,
    );
  });
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, press, onClose, onBlocked };
};

beforeEach(() => {
  mockReportUser.mockReset().mockResolvedValue(undefined);
  mockBlockUser.mockReset().mockResolvedValue(undefined);
});

describe('UserSafetySheet', () => {
  it('offers Report and Block, and only offers Remove when the person is a friend', async () => {
    const { text } = await render();
    expect(text()).toContain('Report');
    expect(text()).toContain('Block');
    expect(text()).not.toContain('Remove friend');

    const friend = await render({ onRemoveFriend: async () => {} });
    expect(friend.text()).toContain('Remove friend');
  });

  it('walks reason -> details -> thanks and sends the report', async () => {
    const { tree, text, press } = await render();
    await press('Report');
    expect(text()).toContain('Harassment or bullying');
    expect(text()).toContain('Pretending to be someone else');

    await press('Harassment or bullying');
    const input = tree.root.find(n => n.props.accessibilityLabel === 'Report details' && n.props.onChangeText);
    await act(async () => {
      input.props.onChangeText('Sent me insults');
    });
    await press('Submit report');

    expect(mockReportUser).toHaveBeenCalledWith('u1', 'friend_request', 'harassment', 'Sent me insults');
    expect(text()).toContain('Thanks for letting us know');
  });

  it('shows the failure and stays on the details step when the report cannot be sent', async () => {
    mockReportUser.mockRejectedValue(new Error('You’ve sent a lot of reports today. Please try again tomorrow.'));
    const { text, press } = await render();
    await press('Report');
    await press('Spam or unwanted requests');
    await press('Submit report');
    expect(text()).toContain('You’ve sent a lot of reports today');
    expect(text()).not.toContain('Thanks for letting us know');
  });

  it('asks before blocking, then blocks and tells the screen', async () => {
    const { text, press, onBlocked } = await render();
    await press('Block');
    expect(text()).toContain('Block Bob?');
    expect(mockBlockUser).not.toHaveBeenCalled();

    await press('Block');
    expect(mockBlockUser).toHaveBeenCalledWith('u1');
    expect(onBlocked).toHaveBeenCalled();
  });

  it('keeps the sheet open and explains when blocking fails', async () => {
    mockBlockUser.mockRejectedValue(new Error('Couldn’t block this person. Please try again.'));
    const { text, press, onBlocked } = await render();
    await press('Block');
    await press('Block');
    expect(text()).toContain('Couldn’t block this person');
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('removes a friend only after confirming', async () => {
    const onRemoveFriend = jest.fn().mockResolvedValue(undefined);
    const { text, press, onClose } = await render({ onRemoveFriend });
    await press('Remove friend');
    expect(text()).toContain('Remove Bob?');
    expect(onRemoveFriend).not.toHaveBeenCalled();

    await press('Remove');
    expect(onRemoveFriend).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
