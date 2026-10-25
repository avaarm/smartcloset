/**
 * ProStylistCard — a stylist as a client sees them: name, headline, bio, services, languages and the rates the
 * stylist wrote, with the two lines that must go with them (the app takes no payment; stylists are independent).
 * There is no photo, rating, badge or "approved" mark of any kind: SmartCloset does not check or rank anyone.
 *
 * `compact` is the collapsed form (a client's second visit to a connection): name, headline and the independent
 * line only. Rates are not shown in it, so neither is the payment line, which goes wherever rates appear.
 * It is plain text only, so nothing a stylist typed can be tapped.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Card, Text } from '../ui';
import {
  PRO_INDEPENDENT_LINE,
  PRO_LANGUAGES,
  PRO_NO_PAYMENT_LINE,
  PRO_SERVICES,
} from '../config/proRules';
import type { InvitePreview } from '../types/pro';

export type ProStylistCardProps = {
  stylist: InvitePreview['stylist'];
  compact?: boolean;
};

/** The words for the ids the server stored. An id this build does not know is left out rather than shown as a code. */
const labelsFor = (ids: readonly string[], table: ReadonlyArray<{ id?: string; code?: string; label: string }>): string[] =>
  ids
    .map(id => table.find(row => row.id === id || row.code === id)?.label)
    .filter((label): label is string => Boolean(label));

export const ProStylistCard: React.FC<ProStylistCardProps> = ({ stylist, compact = false }) => {
  const services = labelsFor(stylist.services, PRO_SERVICES);
  const languages = labelsFor(stylist.languages, PRO_LANGUAGES);
  const rates = stylist.ratesText.trim();

  return (
    <Card bordered padding={16}>
      <Text variant="h3" numberOfLines={compact ? 1 : undefined}>{stylist.name}</Text>
      {stylist.headline ? (
        <Text variant="body" color="muted" numberOfLines={compact ? 2 : undefined} style={styles.headline}>
          {stylist.headline}
        </Text>
      ) : null}

      {compact ? null : (
        <>
          {stylist.bio ? <Text variant="body" style={styles.block}>{stylist.bio}</Text> : null}

          {services.length > 0 ? (
            <View style={styles.chips} accessible accessibilityLabel={`Services: ${services.join(', ')}`}>
              {services.map(label => (
                <Badge key={label} label={label} tone="neutral" />
              ))}
            </View>
          ) : null}

          {languages.length > 0 ? (
            <Text variant="bodySmall" color="muted" style={styles.block}>
              {`Languages: ${languages.join(', ')}`}
            </Text>
          ) : null}

          {rates ? (
            <View style={styles.block}>
              <Text variant="label" color="muted">Rates (set by the stylist)</Text>
              <Text variant="body" style={styles.rates}>{rates}</Text>
            </View>
          ) : null}

          <Text variant="caption" color="muted" style={styles.block}>{PRO_NO_PAYMENT_LINE}</Text>
        </>
      )}

      <Text variant="caption" color="muted" style={styles.block}>{PRO_INDEPENDENT_LINE}</Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  headline: { marginTop: 2 },
  block: { marginTop: 12 },
  rates: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
});

export default ProStylistCard;
