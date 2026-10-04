import 'react-native';
import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockService = {
  getFriends: jest.fn(),
  getPendingRequests: jest.fn(),
  getBlockedUsers: jest.fn(),
  acceptFriendRequest: jest.fn(),
  removeFriendRequest: jest.fn(),
  sendFriendRequest: jest.fn(),
  unblockUser: jest.fn(),
  blockUser: jest.fn(),
  reportUser: jest.fn(),
};
jest.mock('../../src/services/friendService', () => ({
  getFriends: (...a: any[]) => mockService.getFriends(...a),
  getPendingRequests: (...a: any[]) => mockService.getPendingRequests(...a),
  getBlockedUsers: (...a: any[]) => mockService.getBlockedUsers(...a),
  acceptFriendRequest: (...a: any[]) => mockService.acceptFriendRequest(...a),
  removeFriendRequest: (...a: any[]) => mockService.removeFriendRequest(...a),
  sendFriendRequest: (...a: any[]) => mockService.sendFriendRequest(...a),
  unblockUser: (...a: any[]) => mockService.unblockUser(...a),
  blockUser: (...a: any[]) => mockService.blockUser(...a),
  reportUser: (...a: any[]) => mockService.reportUser(...a),
}));

import FriendsScreen from '../../src/screens/FriendsScreen';
import { CLOSET_SHARING_NOTICE, GUIDELINES_NOTICE } from '../../src/config/communityGuidelines';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const incoming = {
  id: 'req1', requesterId: 'u9', recipientId: 'me', requesterName: 'Bob', recipientName: 'Me',
  status: 'pending', createdAt: '2026-10-01',
};

let alertSpy: jest.SpyInstance;

const renderScreen = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<FriendsScreen />);
  });
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, press, text: () => flatten(tree.toJSON()) };
};

beforeEach(() => {
  Object.values(mockService).forEach(fn => fn.mockReset());
  mockService.getFriends.mockResolvedValue([]);
  mockService.getPendingRequests.mockResolvedValue({ incoming: [incoming], outgoing: [] });
  mockService.getBlockedUsers.mockResolvedValue([{ userId: 'u7', name: 'Cat', blockedAt: '2026-10-01' }]);
  mockService.acceptFriendRequest.mockResolvedValue(undefined);
  mockService.sendFriendRequest.mockResolvedValue('sent');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FriendsScreen safety', () => {
  it('links to the community guidelines and blocked users', async () => {
    const { text, press } = await renderScreen();
    expect(text()).toContain('Community guidelines');
    expect(text()).toContain('Blocked users');

    await press('Community guidelines');
    expect(text()).toContain('Email support');
    expect(text()).toContain('emavanesem@gmail.com');

    await press('Blocked users');
    expect(text()).toContain('Cat');
    expect(text()).toContain('Unblock');
  });

  it('offers Report and Block on an incoming request', async () => {
    const { text, press } = await renderScreen();
    await press('Report or block Bob');
    expect(text()).toContain('Report');
    expect(text()).toContain('Block');
  });

  it('asks before accepting, saying the closet becomes visible, and accepts only on confirm', async () => {
    const { press } = await renderScreen();
    await press('Accept');

    expect(alertSpy).toHaveBeenCalledWith('Accept Bob?', `${CLOSET_SHARING_NOTICE}\n\n${GUIDELINES_NOTICE}`, expect.any(Array));
    expect(mockService.acceptFriendRequest).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as any[];
    await act(async () => {
      await buttons.find(b => b.text === 'Accept').onPress();
    });
    expect(mockService.acceptFriendRequest).toHaveBeenCalledWith('req1');
  });

  it('asks before sending a request and sends only on confirm', async () => {
    const { tree } = await renderScreen();
    const input = tree.root.find(n => n.props.placeholder === 'friend@email.com' && n.props.onChangeText);
    await act(async () => {
      input.props.onChangeText('  bob@example.com ');
    });
    await act(async () => {
      input.props.onSubmitEditing();
    });

    expect(alertSpy).toHaveBeenCalledWith('Send friend request?', `${CLOSET_SHARING_NOTICE}\n\n${GUIDELINES_NOTICE}`, expect.any(Array));
    // The same prompt offers the rules before anything is sent.
    expect((alertSpy.mock.calls[0][2] as any[]).map(b => b.text)).toEqual(['Cancel', 'Read guidelines', 'Send request']);
    expect(mockService.sendFriendRequest).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as any[];
    await act(async () => {
      await buttons.find(b => b.text === 'Send request').onPress();
    });
    expect(mockService.sendFriendRequest).toHaveBeenCalledWith('bob@example.com');
  });
});
