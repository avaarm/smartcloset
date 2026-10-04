/**
 * FriendsScreen — add friends by email, manage requests, and jump into a
 * friend's shared wardrobe.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Avatar, Badge, Button, Card, EmptyState, Input, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { Friend, FriendRequest } from '../types/friends';
import { CLOSET_SHARING_NOTICE, GUIDELINES_NOTICE, ReportContext } from '../config/communityGuidelines';
import BlockedUsersSheet from '../components/BlockedUsersSheet';
import CommunityGuidelinesSheet from '../components/CommunityGuidelinesSheet';
import LoadError from '../components/LoadError';
import UserSafetySheet from '../components/UserSafetySheet';
import {
  acceptFriendRequest,
  getFriends,
  getPendingRequests,
  removeFriendRequest,
  sendFriendRequest,
} from '../services/friendService';

type SafetyTarget = {
  userId: string;
  name: string;
  context: ReportContext;
  /** Set for an existing friend, so the menu can offer "Remove friend". */
  friendRequestId?: string;
};

const FriendsScreen = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The target is kept after the sheet closes so it can slide out with its content.
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);

  const load = useCallback(async () => {
    try {
      const [friendsList, pending] = await Promise.all([getFriends(), getPendingRequests()]);
      setFriends(friendsList);
      setIncoming(pending.incoming);
      setOutgoing(pending.outgoing);
      setLoadFailed(false);
    } catch (error) {
      console.error('Error loading friends:', error);
      // Keep whatever is on screen; the empty friends list becomes an error state instead.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openSafety = (target: SafetyTarget) => {
    setSafetyTarget(target);
    setSafetyOpen(true);
  };

  const handleSend = () => {
    const address = email.trim();
    if (!address) return;
    Alert.alert('Send friend request?', `${CLOSET_SHARING_NOTICE}\n\n${GUIDELINES_NOTICE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Read guidelines', onPress: () => setShowGuidelines(true) },
      { text: 'Send request', onPress: () => sendRequest(address) },
    ]);
  };

  const sendRequest = async (address: string) => {
    setSending(true);
    try {
      const result = await sendFriendRequest(address);
      switch (result) {
        case 'sent':
          setEmail('');
          Alert.alert('Request sent', 'They’ll see your request next time they open Smart Closet.');
          break;
        case 'already_friends':
          Alert.alert('Already friends', 'You’re already connected with this person.');
          break;
        case 'already_pending':
          Alert.alert('Already pending', 'A request between you two is already pending.');
          break;
        case 'self':
          Alert.alert('That’s you', 'You can’t add yourself as a friend.');
          break;
        case 'not_found':
          Alert.alert('No account found', 'No Smart Closet account uses that email.');
          break;
        case 'you_blocked':
          Alert.alert('You blocked this person', 'Unblock them from “Blocked users” below if you want to send a request.');
          break;
      }
      await load();
    } catch (error: any) {
      Alert.alert('Something went wrong', error?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await acceptFriendRequest(request.id);
      await load();
    } catch (error: any) {
      Alert.alert('Something went wrong', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = (request: FriendRequest) => {
    Alert.alert(`Accept ${request.requesterName}?`, `${CLOSET_SHARING_NOTICE}\n\n${GUIDELINES_NOTICE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Read guidelines', onPress: () => setShowGuidelines(true) },
      { text: 'Accept', onPress: () => acceptRequest(request) },
    ]);
  };

  const handleDecline = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await removeFriendRequest(request.id);
      await load();
    } catch (error: any) {
      Alert.alert('Something went wrong', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Friends</Text>
    </View>
  );

  if (loading) {
    return (
      <Screen scrollable padded header={header}>
        <View style={{ alignItems: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable padded header={header}>
      <Card style={{ marginBottom: 20 }}>
        <Text variant="label" color="muted" style={{ marginBottom: 10 }}>ADD A FRIEND</Text>
        <Input
          placeholder="friend@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Button
          label="Send Request"
          onPress={handleSend}
          loading={sending}
          disabled={!email.trim()}
          fullWidth
          style={{ marginTop: 12 }}
        />
      </Card>

      {incoming.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>REQUESTS</Text>
          {incoming.map(request => (
            <Card key={request.id} style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Avatar name={request.requesterName} size="md" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="body" weight="600">{request.requesterName}</Text>
                  <Text variant="caption" color="muted">wants to be your friend</Text>
                </View>
                <Pressable
                  onPress={() =>
                    openSafety({ userId: request.requesterId, name: request.requesterName, context: 'friend_request' })
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Report or block ${request.requesterName}`}
                >
                  <Icon name="ellipsis-horizontal" size={20} color={theme.colors.textSubtle} />
                </Pressable>
              </View>
              <View style={[styles.row, { marginTop: 12, gap: 8 }]}>
                <Button
                  label="Accept"
                  size="sm"
                  onPress={() => handleAccept(request)}
                  loading={busyId === request.id}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Decline"
                  size="sm"
                  variant="secondary"
                  onPress={() => handleDecline(request)}
                  disabled={busyId === request.id}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {outgoing.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>SENT</Text>
          {outgoing.map(request => (
            <Card key={request.id} style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Avatar name={request.recipientName} size="md" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="body" weight="600">{request.recipientName}</Text>
                  <Badge label="Pending" tone="warning" style={{ marginTop: 4 }} />
                </View>
                <Pressable
                  onPress={() => handleDecline(request)}
                  disabled={busyId === request.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel request to ${request.recipientName}`}
                >
                  <Icon name="close-circle-outline" size={22} color={theme.colors.textSubtle} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>YOUR FRIENDS</Text>
      {friends.length === 0 && loadFailed ? (
        <LoadError what="friends" onRetry={load} />
      ) : friends.length === 0 ? (
        <EmptyState
          icon={<Icon name="people-outline" size={32} color={theme.colors.textSubtle} />}
          title="No friends yet"
          body="Add a friend by email above to start sharing your closet."
        />
      ) : (
        friends.map(friend => (
          <Card key={friend.requestId} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              {/* The row's main target and its menu are siblings, not nested: a nested
                  button inside an accessible parent can't be reached by VoiceOver. */}
              <Pressable
                style={[styles.row, { flex: 1 }]}
                onPress={() => navigation.navigate('FriendCloset', { friendId: friend.userId, friendName: friend.name })}
                accessibilityRole="button"
                accessibilityLabel={`View ${friend.name}'s closet`}
              >
                <Avatar name={friend.name} size="md" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="body" weight="600">{friend.name}</Text>
                  <Text variant="caption" color="muted">Tap to view their closet</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() =>
                  openSafety({
                    userId: friend.userId,
                    name: friend.name,
                    context: 'friend_closet',
                    friendRequestId: friend.requestId,
                  })
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove, report or block ${friend.name}`}
              >
                <Icon name="ellipsis-horizontal" size={20} color={theme.colors.textSubtle} />
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <Text variant="overline" color="muted" style={{ marginTop: 24, marginBottom: 10 }}>SAFETY</Text>
      <Card padding={0}>
        <Pressable
          onPress={() => setShowGuidelines(true)}
          style={[styles.linkRow, { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
          accessibilityRole="button"
          accessibilityLabel="Community guidelines"
        >
          <Icon name="shield-checkmark-outline" size={20} color={theme.colors.text} />
          <Text variant="body" style={{ flex: 1, marginLeft: 12 }}>Community guidelines</Text>
          <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </Pressable>
        <Pressable
          onPress={() => setShowBlocked(true)}
          style={styles.linkRow}
          accessibilityRole="button"
          accessibilityLabel="Blocked users"
        >
          <Icon name="ban-outline" size={20} color={theme.colors.text} />
          <Text variant="body" style={{ flex: 1, marginLeft: 12 }}>Blocked users</Text>
          <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
        </Pressable>
      </Card>

      {safetyTarget ? (
        <UserSafetySheet
          visible={safetyOpen}
          userId={safetyTarget.userId}
          userName={safetyTarget.name}
          context={safetyTarget.context}
          onClose={() => setSafetyOpen(false)}
          onBlocked={() => {
            setSafetyOpen(false);
            load();
          }}
          onRemoveFriend={
            safetyTarget.friendRequestId
              ? async () => {
                  await removeFriendRequest(safetyTarget.friendRequestId!);
                  await load();
                }
              : undefined
          }
        />
      ) : null}
      <BlockedUsersSheet visible={showBlocked} onClose={() => setShowBlocked(false)} />
      <CommunityGuidelinesSheet visible={showGuidelines} onClose={() => setShowGuidelines(false)} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});

export default FriendsScreen;
