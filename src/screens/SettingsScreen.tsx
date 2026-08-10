import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { env } from '../config/env';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  saveAndShareBackup,
  getBackupStats,
  createAutoBackup,
  clearAllData,
} from '../services/backupService';
import { reseedAllDemoData } from '../services/seedDemoData';
import { resetStorage } from '../services/storage';
import {
  getContributionHistory,
  type ProductContribution,
} from '../services/productContributions';
import { supabase } from '../config/supabase';
import { signOut } from '../services/authService';
import {
  getCurrentMode,
  getAvailableModes,
  setCurrentMode,
  getModeName,
  getModeIcon,
  getModeDescription,
} from '../services/accountService';
import { AccountType } from '../types/stylist';
import { useAccountMode } from '../context/AccountModeContext';

// ─── Luxury palette (matches StylistDashboard / SignIn) ───────────────────────
const GOLD = '#C4975A';
const GOLD_SUBTLE = 'rgba(196,151,90,0.10)';
const GOLD_BORDER = 'rgba(196,151,90,0.35)';
const INK = '#100E0B';
const IVORY = '#FDFAF5';
const WARM_MUTED = '#F7F3EC';
const BORDER = '#EDE5D8';
const CHARCOAL = '#0F0D0A';
const CREAM_HEADER = '#F5EDE0';
const MUTED_HEADER = 'rgba(245,237,224,0.50)';
const TEXT_MUTED = '#6B5F52';
const TEXT_SUBTLE = '#A8987E';
// ──────────────────────────────────────────────────────────────────────────────

const SettingsScreen = () => {
  const [backupStats, setBackupStats] = useState<{
    itemsCount: number;
    outfitsCount: number;
    lastBackup?: string;
    storageSize: number;
  }>({
    itemsCount: 0,
    outfitsCount: 0,
    storageSize: 0,
  });
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { currentMode, switchMode } = useAccountMode();
  const [availableModes, setAvailableModesState] = useState<AccountType[]>(['user']);
  const [contributions, setContributions] = useState<ProductContribution[]>([]);

  useEffect(() => {
    loadBackupStats();
    loadAccountInfo();
    getContributionHistory().then(setContributions).catch(() => {});
  }, []);

  const loadAccountInfo = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setIsAuthenticated(true);
      const meta = session.user.user_metadata;
      setUserName(meta?.name || meta?.full_name || session.user.email?.split('@')[0] || 'User');
      setUserEmail(session.user.email || null);
    } else {
      setIsAuthenticated(false);
      setUserName(null);
      setUserEmail(null);
    }
    await getCurrentMode();
    if (session?.user) {
      setAvailableModesState(['user', 'stylist', 'client']);
    } else {
      const modes = await getAvailableModes();
      setAvailableModesState(modes);
    }
  };

  const handleModeSwitch = async (mode: AccountType) => {
    await switchMode(mode);
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to sign out');
          }
        },
      },
    ]);
  };

  const loadBackupStats = async () => {
    const stats = await getBackupStats();
    setBackupStats(stats);
  };

  const handleExportData = async () => {
    try {
      setLoading(true);
      await saveAndShareBackup();
      await createAutoBackup();
      await loadBackupStats();
      Alert.alert('Success', 'Your data has been exported successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllData();
      await loadBackupStats();
      Alert.alert('Success', 'All data has been cleared.');
    } catch (error) {
      if (error instanceof Error && error.message !== 'User cancelled') {
        Alert.alert('Error', 'Failed to clear data.');
      }
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, all clothing items, outfits, body profile, stylist data, and any uploaded images. This cannot be undone.\n\nTo confirm, you\'ll be asked to type DELETE.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Type DELETE to confirm',
              'Once confirmed, your account is gone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: async (input?: string) => {
                    if (input !== 'DELETE') {
                      Alert.alert('Not deleted', 'You must type DELETE in caps to confirm.');
                      return;
                    }
                    try {
                      setLoading(true);
                      const { error } = await supabase.rpc('delete_user_account');
                      if (error) throw error;
                      await clearAllData();
                      await supabase.auth.signOut();
                      Alert.alert('Account deleted', 'Your account and data have been removed.');
                    } catch (e: any) {
                      console.error('[SettingsScreen] account delete failed:', e);
                      Alert.alert(
                        'Could not delete account',
                        e?.message || 'Please try again, or contact support.',
                      );
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ],
              'plain-text',
            );
          },
        },
      ],
    );
  };

  const handleReseedDemoData = async () => {
    Alert.alert(
      'Reset Demo Data',
      'This will replace your current wardrobe and sample data with a fresh seed — wishlist, outfits, body profile, stylist clients, appointments, recommendations, booking requests, and outfit history will all be regenerated. Your account and login are preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await resetStorage();
              await reseedAllDemoData();
              await loadBackupStats();
              Alert.alert(
                'Demo Data Reset',
                'Fresh demo data loaded. Pull to refresh any open screens to see the new content.',
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to reset demo data.');
              console.error('[SettingsScreen] reseed failed:', error);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const toggleAutoBackup = async (value: boolean) => {
    setAutoBackupEnabled(value);
    if (value) {
      await createAutoBackup();
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatStorageSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={CHARCOAL} />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>Profile</Text>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerDivider} />
        </View>

        {/* ── Account ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>

          {isAuthenticated ? (
            <>
              {/* Profile card */}
              <View style={styles.profileCard}>
                <View style={styles.avatarRing}>
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{userName}</Text>
                  <Text style={styles.profileEmail}>{userEmail}</Text>
                  <View style={styles.modePill}>
                    <Icon name={getModeIcon(currentMode)} size={11} color={GOLD} />
                    <Text style={styles.modePillText}>{getModeName(currentMode)}</Text>
                  </View>
                </View>
              </View>

              {/* Mode switcher */}
              <Text style={styles.subsectionLabel}>Account Mode</Text>
              {availableModes.map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeCard, currentMode === mode && styles.modeCardActive]}
                  onPress={() => handleModeSwitch(mode)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.modeIconWrap, currentMode === mode && { backgroundColor: GOLD_SUBTLE }]}>
                    <Icon
                      name={getModeIcon(mode)}
                      size={18}
                      color={currentMode === mode ? GOLD : TEXT_SUBTLE}
                    />
                  </View>
                  <View style={styles.modeTextWrap}>
                    <Text style={[styles.modeName, currentMode === mode && { color: GOLD }]}>
                      {getModeName(mode)}
                    </Text>
                    <Text style={styles.modeDesc}>{getModeDescription(mode)}</Text>
                  </View>
                  {currentMode === mode && (
                    <Icon name="checkmark-circle" size={20} color={GOLD} />
                  )}
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
                <Icon name="log-out-outline" size={18} color="#C0392B" />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.guestCard}>
              <View style={styles.guestAvatarRing}>
                <Icon name="person-outline" size={28} color={TEXT_SUBTLE} />
              </View>
              <Text style={styles.guestHeading}>Browsing as Guest</Text>
              <Text style={styles.guestBody}>Sign in to sync your wardrobe across devices and unlock all features.</Text>
              <View style={styles.goldDivider} />
            </View>
          )}
        </View>

        {/* ── Community Knowledge Base ────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Community</Text>
          <View style={styles.kbCard}>
            <View style={styles.kbTop}>
              <View style={styles.kbIconWrap}>
                <Icon name="people-outline" size={20} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kbCount}>{contributions.length}</Text>
                <Text style={styles.kbLabel}>
                  {contributions.length === 1 ? 'item taught' : 'items taught'}
                </Text>
              </View>
            </View>
            <Text style={styles.kbBody}>
              Every clothing item you add trains the recognition model. Your contributions help other members auto-fill their wardrobes.
            </Text>
            {contributions.length > 0 && (
              <View style={styles.kbBadgeRow}>
                {[
                  { label: `${contributions.filter(c => c.source === 'lens_match').length} web`, key: 'web' },
                  { label: `${contributions.filter(c => c.source === 'kb_match').length} community`, key: 'kb' },
                  { label: `${contributions.filter(c => c.source === 'manual').length} manual`, key: 'manual' },
                ].map(b => (
                  <View key={b.key} style={styles.kbBadge}>
                    <Text style={styles.kbBadgeText}>{b.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Data & Backup ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Data & Backup</Text>

          <View style={styles.statsTable}>
            {[
              { icon: 'shirt-outline', label: 'Clothing Items', value: String(backupStats.itemsCount) },
              { icon: 'albums-outline', label: 'Saved Outfits', value: String(backupStats.outfitsCount) },
              { icon: 'server-outline', label: 'Storage Used', value: formatStorageSize(backupStats.storageSize) },
              { icon: 'time-outline', label: 'Last Backup', value: formatDate(backupStats.lastBackup) },
            ].map((row, i) => (
              <View key={row.label} style={[styles.tableRow, i === 3 && { borderBottomWidth: 0 }]}>
                <View style={styles.tableIconWrap}>
                  <Icon name={row.icon} size={16} color={GOLD} />
                </View>
                <Text style={styles.tableLabel}>{row.label}</Text>
                <Text style={styles.tableValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.goldButton}
            onPress={handleExportData}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Icon name="download-outline" size={18} color={INK} />
            <Text style={styles.goldButtonText}>{loading ? 'Exporting…' : 'Export Data'}</Text>
          </TouchableOpacity>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={styles.toggleLabel}>Auto Backup</Text>
              <Text style={styles.toggleDesc}>Backup automatically when changes are made</Text>
            </View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={toggleAutoBackup}
              trackColor={{ false: BORDER, true: GOLD }}
              thumbColor={IVORY}
            />
          </View>
        </View>

        {/* ── About ───────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.statsTable}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Version</Text>
              <Text style={styles.tableValue}>{env.APP_VERSION}</Text>
            </View>
            <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.tableLabel}>Platform</Text>
              <Text style={styles.tableValue}>
                {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Danger Zone ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.dangerSectionLabel}>Danger Zone</Text>

          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: GOLD_BORDER, backgroundColor: GOLD_SUBTLE }]}
            onPress={handleReseedDemoData}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Icon name="refresh-outline" size={18} color={GOLD} />
            <Text style={[styles.dangerButtonText, { color: GOLD }]}>Reset Demo Data</Text>
          </TouchableOpacity>
          <Text style={styles.dangerNote}>
            Replaces all data with a fresh sample set — wardrobe, outfits, stylist & client content. Useful for testing from a known state.
          </Text>

          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleClearData}
            activeOpacity={0.7}
          >
            <Icon name="trash-outline" size={18} color="#C0392B" />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
          <Text style={styles.dangerNote}>
            Wipes everything stored locally on this device. Your account stays.
          </Text>

          <TouchableOpacity
            style={[styles.dangerButton, { marginTop: 8, borderColor: '#922B21' }]}
            onPress={handleDeleteAccount}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Icon name="alert-circle-outline" size={18} color="#922B21" />
            <Text style={[styles.dangerButtonText, { color: '#922B21' }]}>Delete Account</Text>
          </TouchableOpacity>
          <Text style={styles.dangerNote}>
            Permanently deletes your account, wardrobe, body profile, and all uploaded images. Cannot be undone.
          </Text>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>Smart Closet · Est. 2024</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CHARCOAL,
  },
  container: {
    flex: 1,
    backgroundColor: IVORY,
  },

  // Header (dark charcoal band)
  header: {
    backgroundColor: CHARCOAL,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 28,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '300',
    color: CREAM_HEADER,
    letterSpacing: -0.5,
  },
  headerDivider: {
    width: 32,
    height: 1,
    backgroundColor: GOLD,
    marginTop: 16,
  },

  // Sections
  section: {
    backgroundColor: IVORY,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_SUBTLE,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  dangerSectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#C0392B',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 18,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_MUTED,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 24,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: GOLD_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 1,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '500',
    color: INK,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 8,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOLD_SUBTLE,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 2,
    gap: 5,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 0.3,
  },

  subsectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_SUBTLE,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Mode cards
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    padding: 14,
    marginBottom: 8,
    backgroundColor: IVORY,
    gap: 12,
  },
  modeCardActive: {
    borderColor: GOLD_BORDER,
    backgroundColor: GOLD_SUBTLE,
  },
  modeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WARM_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTextWrap: {
    flex: 1,
  },
  modeName: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
    marginBottom: 2,
  },
  modeDesc: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },

  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.04)',
    gap: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#C0392B',
    letterSpacing: 0.2,
  },

  // Guest state
  guestCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 24,
  },
  guestAvatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_MUTED,
    marginBottom: 16,
  },
  guestHeading: {
    fontSize: 17,
    fontWeight: '500',
    color: INK,
    marginBottom: 6,
  },
  guestBody: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  goldDivider: {
    width: 32,
    height: 1,
    backgroundColor: GOLD,
    marginTop: 24,
  },

  // Community KB
  kbCard: {
    backgroundColor: '#FBF4E8',
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 4,
    padding: 18,
    marginBottom: 8,
  },
  kbTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 14,
  },
  kbIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GOLD_SUBTLE,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kbCount: {
    fontSize: 28,
    fontWeight: '300',
    color: GOLD,
    lineHeight: 32,
  },
  kbLabel: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  kbBody: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 19,
    marginBottom: 12,
  },
  kbBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  kbBadge: {
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: IVORY,
  },
  kbBadgeText: {
    fontSize: 11,
    color: GOLD,
    fontWeight: '500',
  },

  // Stats table
  statsTable: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    backgroundColor: IVORY,
    marginBottom: 18,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  tableIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  tableLabel: {
    flex: 1,
    fontSize: 14,
    color: INK,
  },
  tableValue: {
    fontSize: 14,
    fontWeight: '500',
    color: GOLD,
  },

  goldButton: {
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 2,
    marginBottom: 16,
    gap: 8,
  },
  goldButtonText: {
    color: INK,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
    marginBottom: 3,
  },
  toggleDesc: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },

  // Danger zone
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.04)',
    marginBottom: 8,
    gap: 8,
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#C0392B',
    letterSpacing: 0.2,
  },
  dangerNote: {
    fontSize: 12,
    color: TEXT_SUBTLE,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  footer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  footerDivider: {
    width: 24,
    height: 1,
    backgroundColor: BORDER,
    marginBottom: 16,
  },
  footerText: {
    fontSize: 12,
    color: TEXT_SUBTLE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default SettingsScreen;
