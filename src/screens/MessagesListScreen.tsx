import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import { getThreads, markThreadAsRead } from '../services/messagingService';
import { getCurrentClientAccount } from '../services/marketplaceService';
import { getStylistProfile } from '../services/stylistService';
import { MessageThread } from '../types/stylist';

interface ThreadWithContact extends MessageThread {
  contactName: string;
  contactImage?: string;
}

const MessagesListScreen = ({ navigation, route }: any) => {
  const [threads, setThreads] = useState<ThreadWithContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<'stylist' | 'client'>('client');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    initializeAndLoadThreads();
  }, []);

  const initializeAndLoadThreads = async () => {
    try {
      // Determine user type and ID
      const clientAccount = await getCurrentClientAccount();
      if (clientAccount) {
        setUserType('client');
        setUserId(clientAccount.id);
        await loadThreads(clientAccount.id, 'client');
      } else {
        const stylistProfile = await getStylistProfile();
        if (stylistProfile) {
          setUserType('stylist');
          setUserId(stylistProfile.id);
          await loadThreads(stylistProfile.id, 'stylist');
        }
      }
    } catch (error) {
      console.error('Error initializing threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadThreads = async (uid: string, uType: 'stylist' | 'client') => {
    try {
      const threadList = await getThreads(uid, uType);
      
      // Enhance threads with contact information
      const enhancedThreads: ThreadWithContact[] = threadList.map(thread => ({
        ...thread,
        contactName: uType === 'stylist' ? 'Client' : 'Stylist',
        contactImage: undefined,
      }));

      setThreads(enhancedThreads);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (userId) {
      loadThreads(userId, userType);
    }
  };

  const handleThreadPress = async (thread: ThreadWithContact) => {
    // Mark thread as read
    await markThreadAsRead(thread.id, userType);
    
    // Navigate to chat
    navigation.navigate('Chat', {
      threadId: thread.id,
      contactName: thread.contactName,
      stylistId: thread.stylistId,
      clientId: thread.clientId,
    });

    // Refresh threads to update unread count
    if (userId) {
      loadThreads(userId, userType);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredThreads = threads.filter(thread =>
    thread.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderThread = ({ item }: { item: ThreadWithContact }) => {
    const unreadCount = item.unreadCount[userType];
    const hasUnread = unreadCount > 0;

    return (
      <TouchableOpacity
        style={[styles.threadCard, hasUnread && styles.threadCardUnread]}
        onPress={() => handleThreadPress(item)}
      >
        <View style={styles.avatarContainer}>
          {item.contactImage ? (
            <Image source={{ uri: item.contactImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Icon name="person" size={24} color="#fff" />
            </View>
          )}
          {hasUnread && <View style={styles.onlineIndicator} />}
        </View>

        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text style={[styles.contactName, hasUnread && styles.contactNameUnread]}>
              {item.contactName}
            </Text>
            {item.lastMessageAt && (
              <Text style={styles.timestamp}>
                {formatTimestamp(item.lastMessageAt)}
              </Text>
            )}
          </View>

          <View style={styles.messagePreview}>
            <Text
              style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
              numberOfLines={2}
            >
              {item.lastMessage || 'No messages yet'}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Threads List */}
      <FlatList
        data={filteredThreads}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="chatbubbles-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              {userType === 'stylist'
                ? 'Your client conversations will appear here'
                : 'Start a conversation with your stylist'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={threads.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: theme.colors.text,
  },
  threadCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  threadCardUnread: {
    backgroundColor: '#f9f9ff',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  threadContent: {
    flex: 1,
    justifyContent: 'center',
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  contactNameUnread: {
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  lastMessageUnread: {
    color: theme.colors.text,
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  unreadCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default MessagesListScreen;
