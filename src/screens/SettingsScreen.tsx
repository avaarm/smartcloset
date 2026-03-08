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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  saveAndShareBackup,
  getBackupStats,
  createAutoBackup,
  clearAllData,
} from '../services/backupService';
import theme from '../styles/theme';

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

  useEffect(() => {
    loadBackupStats();
  }, []);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Manage your SmartCloset</Text>
        </View>

        {/* Data & Backup Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Backup</Text>

          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <Icon name="shirt-outline" size={24} color={theme.colors.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Clothing Items</Text>
                <Text style={styles.statValue}>{backupStats.itemsCount}</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Icon name="albums-outline" size={24} color={theme.colors.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Saved Outfits</Text>
                <Text style={styles.statValue}>{backupStats.outfitsCount}</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Icon name="server-outline" size={24} color={theme.colors.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Storage Used</Text>
                <Text style={styles.statValue}>
                  {formatStorageSize(backupStats.storageSize)}
                </Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Icon name="time-outline" size={24} color={theme.colors.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Last Backup</Text>
                <Text style={styles.statValue}>
                  {formatDate(backupStats.lastBackup)}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleExportData}
            disabled={loading}
          >
            <Icon name="download-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              {loading ? 'Exporting...' : 'Export Data'}
            </Text>
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto Backup</Text>
              <Text style={styles.settingDescription}>
                Automatically backup data when changes are made
              </Text>
            </View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={toggleAutoBackup}
              trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
              thumbColor={autoBackupEnabled ? theme.colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* App Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>52</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Platform</Text>
              <Text style={styles.infoValue}>iOS</Text>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.dangerSectionTitle}>Danger Zone</Text>

          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleClearData}
          >
            <Icon name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>

          <Text style={styles.dangerWarning}>
            This will permanently delete all your clothing items, outfits, and settings.
            This action cannot be undone.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with 💜 for fashion lovers</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F7FF',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 16,
  },
  dangerSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: '#F8F7FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statContent: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  infoCard: {
    backgroundColor: '#F8F7FF',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  infoLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  dangerButton: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 12,
    gap: 8,
  },
  dangerButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerWarning: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});

export default SettingsScreen;
