import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Message,
  MessageThread,
  Notification,
  StylistClientRelationship,
} from '../types/stylist';

const STORAGE_KEYS = {
  THREADS: '@smartcloset_message_threads',
  MESSAGES: '@smartcloset_messages',
  NOTIFICATIONS: '@smartcloset_notifications',
  RELATIONSHIPS: '@smartcloset_relationships',
};

// ==================== Message Threads ====================

export const getThreads = async (userId: string, userType: 'stylist' | 'client'): Promise<MessageThread[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.THREADS);
    if (!data) return [];
    
    const threads: MessageThread[] = JSON.parse(data);
    return threads.filter(t => 
      userType === 'stylist' ? t.stylistId === userId : t.clientId === userId
    );
  } catch (error) {
    console.error('Error getting threads:', error);
    return [];
  }
};

export const getThread = async (threadId: string): Promise<MessageThread | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.THREADS);
    if (!data) return null;
    
    const threads: MessageThread[] = JSON.parse(data);
    return threads.find(t => t.id === threadId) || null;
  } catch (error) {
    console.error('Error getting thread:', error);
    return null;
  }
};

export const getOrCreateThread = async (
  stylistId: string,
  clientId: string
): Promise<MessageThread> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.THREADS);
    const threads: MessageThread[] = data ? JSON.parse(data) : [];
    
    // Check if thread exists
    let thread = threads.find(t => t.stylistId === stylistId && t.clientId === clientId);
    
    if (!thread) {
      // Create new thread
      thread = {
        id: `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        stylistId,
        clientId,
        unreadCount: {
          stylist: 0,
          client: 0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      threads.push(thread);
      await AsyncStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
    }
    
    return thread;
  } catch (error) {
    console.error('Error getting or creating thread:', error);
    throw error;
  }
};

export const updateThread = async (threadId: string, updates: Partial<MessageThread>): Promise<MessageThread | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.THREADS);
    if (!data) return null;
    
    const threads: MessageThread[] = JSON.parse(data);
    const index = threads.findIndex(t => t.id === threadId);
    
    if (index === -1) return null;
    
    threads[index] = {
      ...threads[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
    return threads[index];
  } catch (error) {
    console.error('Error updating thread:', error);
    return null;
  }
};

// ==================== Messages ====================

export const getMessages = async (threadId: string): Promise<Message[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!data) return [];
    
    const messages: Message[] = JSON.parse(data);
    return messages
      .filter(m => m.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
};

export const sendMessage = async (
  threadId: string,
  stylistId: string,
  clientId: string,
  senderId: string,
  senderType: 'stylist' | 'client',
  content: string,
  attachments?: Message['attachments']
): Promise<Message> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
    const messages: Message[] = data ? JSON.parse(data) : [];
    
    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      threadId,
      stylistId,
      clientId,
      senderId,
      senderType,
      content,
      attachments,
      read: false,
      createdAt: new Date().toISOString(),
    };
    
    messages.push(newMessage);
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    
    // Update thread
    await updateThread(threadId, {
      lastMessage: content,
      lastMessageAt: newMessage.createdAt,
      unreadCount: {
        stylist: senderType === 'client' ? 1 : 0,
        client: senderType === 'stylist' ? 1 : 0,
      },
    });
    
    // Create notification for recipient
    const recipientId = senderType === 'stylist' ? clientId : stylistId;
    const recipientType = senderType === 'stylist' ? 'client' : 'stylist';
    
    await createNotification({
      userId: recipientId,
      userType: recipientType,
      type: 'message',
      title: 'New Message',
      message: content.substring(0, 100),
      relatedId: threadId,
    });
    
    return newMessage;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export const markMessageAsRead = async (messageId: string): Promise<void> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!data) return;
    
    const messages: Message[] = JSON.parse(data);
    const index = messages.findIndex(m => m.id === messageId);
    
    if (index !== -1) {
      messages[index].read = true;
      messages[index].readAt = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    }
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
};

export const markThreadAsRead = async (threadId: string, userType: 'stylist' | 'client'): Promise<void> => {
  try {
    // Mark all messages as read
    const messages = await getMessages(threadId);
    const unreadMessages = messages.filter(m => !m.read && m.senderType !== userType);
    
    for (const message of unreadMessages) {
      await markMessageAsRead(message.id);
    }
    
    // Update thread unread count
    const thread = await getThread(threadId);
    if (thread) {
      await updateThread(threadId, {
        unreadCount: {
          ...thread.unreadCount,
          [userType]: 0,
        },
      });
    }
  } catch (error) {
    console.error('Error marking thread as read:', error);
  }
};

export const getUnreadMessageCount = async (userId: string, userType: 'stylist' | 'client'): Promise<number> => {
  try {
    const threads = await getThreads(userId, userType);
    return threads.reduce((total, thread) => total + thread.unreadCount[userType], 0);
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

// ==================== Notifications ====================

export const getNotifications = async (userId: string, userType: 'stylist' | 'client'): Promise<Notification[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!data) return [];
    
    const notifications: Notification[] = JSON.parse(data);
    return notifications
      .filter(n => n.userId === userId && n.userType === userType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
};

export const createNotification = async (
  notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<Notification> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const notifications: Notification[] = data ? JSON.parse(data) : [];
    
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    
    notifications.push(newNotification);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    
    return newNotification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!data) return;
    
    const notifications: Notification[] = JSON.parse(data);
    const index = notifications.findIndex(n => n.id === notificationId);
    
    if (index !== -1) {
      notifications[index].read = true;
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

export const markAllNotificationsAsRead = async (userId: string, userType: 'stylist' | 'client'): Promise<void> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!data) return;
    
    const notifications: Notification[] = JSON.parse(data);
    const updated = notifications.map(n => 
      n.userId === userId && n.userType === userType ? { ...n, read: true } : n
    );
    
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
};

export const getUnreadNotificationCount = async (userId: string, userType: 'stylist' | 'client'): Promise<number> => {
  try {
    const notifications = await getNotifications(userId, userType);
    return notifications.filter(n => !n.read).length;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
};

// ==================== Relationships ====================

export const getRelationship = async (stylistId: string, clientId: string): Promise<StylistClientRelationship | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RELATIONSHIPS);
    if (!data) return null;
    
    const relationships: StylistClientRelationship[] = JSON.parse(data);
    return relationships.find(r => r.stylistId === stylistId && r.clientId === clientId) || null;
  } catch (error) {
    console.error('Error getting relationship:', error);
    return null;
  }
};

export const createRelationship = async (
  relationship: Omit<StylistClientRelationship, 'id'>
): Promise<StylistClientRelationship> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RELATIONSHIPS);
    const relationships: StylistClientRelationship[] = data ? JSON.parse(data) : [];
    
    const newRelationship: StylistClientRelationship = {
      ...relationship,
      id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    
    relationships.push(newRelationship);
    await AsyncStorage.setItem(STORAGE_KEYS.RELATIONSHIPS, JSON.stringify(relationships));
    
    return newRelationship;
  } catch (error) {
    console.error('Error creating relationship:', error);
    throw error;
  }
};

export const updateRelationship = async (
  relationshipId: string,
  updates: Partial<StylistClientRelationship>
): Promise<StylistClientRelationship | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.RELATIONSHIPS);
    if (!data) return null;
    
    const relationships: StylistClientRelationship[] = JSON.parse(data);
    const index = relationships.findIndex(r => r.id === relationshipId);
    
    if (index === -1) return null;
    
    relationships[index] = {
      ...relationships[index],
      ...updates,
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.RELATIONSHIPS, JSON.stringify(relationships));
    return relationships[index];
  } catch (error) {
    console.error('Error updating relationship:', error);
    return null;
  }
};

// ==================== Sample Data ====================

export const loadSampleMessagingData = async (): Promise<void> => {
  try {
    // Create sample threads
    const sampleThreads: MessageThread[] = [
      {
        id: 'thread_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        lastMessage: 'Looking forward to our session tomorrow!',
        lastMessageAt: new Date().toISOString(),
        unreadCount: { stylist: 0, client: 1 },
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'thread_002',
        stylistId: 'stylist_sample_001',
        clientId: 'client_002',
        lastMessage: 'Thank you for the recommendations!',
        lastMessageAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        unreadCount: { stylist: 1, client: 0 },
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    
    // Create sample messages
    const sampleMessages: Message[] = [
      {
        id: 'msg_001',
        threadId: 'thread_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        senderId: 'client_001',
        senderType: 'client',
        content: 'Hi Emma! I have a job interview next week and need help putting together a professional outfit.',
        read: true,
        readAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg_002',
        threadId: 'thread_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        senderId: 'stylist_sample_001',
        senderType: 'stylist',
        content: 'Congratulations on the interview! I\'d love to help. Let\'s schedule a virtual session to go through your wardrobe options.',
        read: true,
        readAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg_003',
        threadId: 'thread_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        senderId: 'stylist_sample_001',
        senderType: 'stylist',
        content: 'Looking forward to our session tomorrow!',
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];
    
    // Create sample relationships
    const sampleRelationships: StylistClientRelationship[] = [
      {
        id: 'rel_001',
        stylistId: 'stylist_sample_001',
        clientId: 'client_001',
        status: 'active',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        totalSessions: 3,
        totalSpent: 650,
        wardrobeAccessGranted: true,
        communicationPreference: 'in-app',
      },
      {
        id: 'rel_002',
        stylistId: 'stylist_sample_001',
        clientId: 'client_002',
        status: 'active',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        totalSessions: 5,
        totalSpent: 1200,
        wardrobeAccessGranted: true,
        communicationPreference: 'all',
      },
    ];
    
    await AsyncStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(sampleThreads));
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(sampleMessages));
    await AsyncStorage.setItem(STORAGE_KEYS.RELATIONSHIPS, JSON.stringify(sampleRelationships));
    
    console.log('Sample messaging data loaded successfully');
  } catch (error) {
    console.error('Error loading sample messaging data:', error);
    throw error;
  }
};

export const clearMessagingData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.THREADS,
      STORAGE_KEYS.MESSAGES,
      STORAGE_KEYS.NOTIFICATIONS,
      STORAGE_KEYS.RELATIONSHIPS,
    ]);
  } catch (error) {
    console.error('Error clearing messaging data:', error);
    throw error;
  }
};
