/**
 * FriendClosetScreen — read-only view of a friend's shared wardrobe.
 */

import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EmptyState, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { ClothingItem } from '../types';
import { getFriendCloset } from '../services/friendService';
import ClothingCard from '../components/ClothingCard';
import UserSafetySheet from '../components/UserSafetySheet';

type RouteParams = {
  friendId: string;
  friendName: string;
};

const FriendClosetScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { friendId, friendName } = (route.params || {}) as RouteParams;
  const { theme } = useTheme();

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [safetyOpen, setSafetyOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        try {
          const closet = await getFriendCloset(friendId);
          if (active) setItems(closet);
        } catch (error) {
          console.error('Error loading friend closet:', error);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [friendId])
  );

  const header = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={24} color={theme.colors.text} />
      </Pressable>
      <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
        {friendName ? `${friendName}’s Closet` : 'Closet'}
      </Text>
      <Pressable
        onPress={() => setSafetyOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Report or block ${friendName || 'this person'}`}
      >
        <Icon name="ellipsis-horizontal" size={22} color={theme.colors.text} />
      </Pressable>
    </View>
  );

  return (
    <Screen padded={false} header={header}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={{ padding: 8, flexGrow: 1 }}
        refreshing={loading}
        renderItem={({ item }) => (
          <View style={{ width: '50%' }}>
            <ClothingCard item={item} />
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
              title="Nothing shared yet"
              body={`${friendName || 'This friend'} hasn’t added any wardrobe items yet.`}
            />
          ) : null
        }
      />
      <UserSafetySheet
        visible={safetyOpen}
        userId={friendId}
        userName={friendName || 'this person'}
        context="friend_closet"
        onClose={() => setSafetyOpen(false)}
        onBlocked={() => {
          setSafetyOpen(false);
          navigation.goBack();
        }}
      />
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
});

export default FriendClosetScreen;
