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
import {
  acceptFriendRequest,
  getFriends,
  getPendingRequests,
  removeFriendRequest,
  sendFriendRequest,
} from '../services/friendService';

const FriendsScreen = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [friendsList, pending] = await Promise.all([getFriends(), getPendingRequests()]);
      setFriends(friendsList);
      setIncoming(pending.incoming);
      setOutgoing(pending.outgoing);
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      const result = await sendFriendRequest(email);
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
      }
      await load();
    } catch (error: any) {
      Alert.alert('Something went wrong', error?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (request: FriendRequest) => {
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

  const handleRemoveFriend = (friend: Friend) => {
    Alert.alert(
      'Remove friend',
      `Remove ${friend.name} from your friends? They’ll lose access to your wardrobe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(friend.requestId);
            try {
              await removeFriendRequest(friend.requestId);
              await load();
            } catch (error: any) {
              Alert.alert('Something went wrong', error?.message || 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
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
      {friends.length === 0 ? (
        <EmptyState
          icon={<Icon name="people-outline" size={32} color={theme.colors.textSubtle} />}
          title="No friends yet"
          body="Add a friend by email above to start sharing your closet."
        />
      ) : (
        friends.map(friend => (
          <Pressable
            key={friend.requestId}
            onPress={() => navigation.navigate('FriendCloset', { friendId: friend.userId, friendName: friend.name })}
            accessibilityRole="button"
            accessibilityLabel={`View ${friend.name}'s closet`}
          >
            <Card style={{ marginBottom: 10 }}>
              <View style={styles.row}>
                <Avatar name={friend.name} size="md" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="body" weight="600">{friend.name}</Text>
                  <Text variant="caption" color="muted">Tap to view their closet</Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveFriend(friend)}
                  disabled={busyId === friend.requestId}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${friend.name} as a friend`}
                >
                  <Icon name="ellipsis-horizontal" size={20} color={theme.colors.textSubtle} />
                </Pressable>
              </View>
            </Card>
          </Pressable>
        ))
      )}
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
});

export default FriendsScreen;
