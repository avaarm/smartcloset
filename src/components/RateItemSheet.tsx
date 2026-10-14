/**
 * RateItemSheet: the full rating of one piece (documentation/design/quality-ratings.md, 3.3 and 6.2). A page
 * sheet with the overall stars (required), how it feels to touch, how it wears, how it is holding up (once it
 * has been worn a few times), fit, whether the person would buy it again, a private note, and the choice to
 * count the rating toward brand insights.
 *
 * It saves and removes through ratingService itself. A save always sends every field the sheet has and an explicit
 * `contribute`, so editing a rating can never change whether it counts without the person seeing the switch. A
 * request to count that the server cannot honour still saves the rating, privately, and the sheet says why.
 *
 * Keyboard: the note is the only text field. The item screen already shows the shared Done bar for its value
 * editor, so this sheet has its own bar with its own id; two bars with one id on screen could take the value
 * editor's bar away when the sheet closes. A page sheet also starts below the top of the screen while the
 * keyboard is measured from the top, so the form is told how far down the sheet sits (see `sheetTop`).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { brandInsightsActive } from '../config/ratingFlags';
import {
  BUY_AGAIN,
  BUY_AGAIN_LABELS,
  COMFORT_LABELS,
  COMFORT_TAGS,
  FIT_LABELS,
  FIT_VERDICTS,
  HOLDS_UP_LABELS,
  HOLDS_UP_TAGS,
  MAX_TAGS_PER_GROUP,
  MIN_WEARS_FOR_HOLDS_UP,
  NOTE_MAX_LENGTH,
  OVERALL_LABELS,
  TAG_LABELS,
  TOUCH_LABELS,
  TOUCH_TAGS,
  type BuyAgain,
  type ComfortTag,
  type FitVerdict,
  type HoldsUpTag,
  type Score,
  type TouchTag,
} from '../config/ratingVocabulary';
import { deleteItemRating, saveItemRating } from '../services/ratingService';
import theme from '../styles/theme';
import type { ContributionBlocked, ItemRating, SaveRatingResult } from '../types/rating';
import { KeyboardActionBar, KeyboardSafeView } from './KeyboardSafe';
import RatingScale from './RatingScale';

/** The note's own accessory id (not the shared one; see the file header). */
export const RATE_NOTE_ACCESSORY_ID = 'smartcloset-rate-note-done';

export const SHEET_TITLE = 'Rate this piece';
export const SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';
export const REMOVE_FAILED = 'Couldn’t remove that. Check your connection and try again.';
export const REMOVE_TITLE = 'Remove your rating?';
export const REMOVE_MESSAGE = 'This deletes your rating of this item.';
export const SHARE_LABEL = 'Count toward brand insights';
export const SHARE_ON_CAPTION = 'Shared without your name, photos or notes.';
export const SHARE_DISABLED_CAPTION = 'Brand insights count worn pieces that have a brand.';
export const ADD_TO_INSIGHTS_LABEL = 'Add to brand insights...';
export const ADD_TO_INSIGHTS_CAPTION = 'Your rating stays private unless you add it.';

/** The quiet line after a save that asked to count but could not. The rating itself is always saved. */
export const BLOCKED_LINES: Record<ContributionBlocked, string> = {
  not_worn: 'Saved privately. Brand insights count worn pieces that have a brand.',
  no_brand: 'Saved privately. Brand insights count worn pieces that have a brand.',
  no_consent: 'Saved privately. Agree to brand insights first to add it.',
};

export interface RateItemSheetProps {
  visible: boolean;
  item: { id: string; name: string; brand?: string; size?: string };
  wearCount: number;
  /** The stored rating when editing; every field of the sheet starts from it. */
  initial: ItemRating | null;
  /** The star already chosen when there is no stored rating yet. */
  initialOverall?: Score;
  /** null while unknown (loading, offline, not available). false also covers an agreement to older wording. */
  consentGranted: boolean | null;
  onRequestConsent: () => Promise<boolean>;
  /** Close the sheet. Also called by the sheet itself after a save or a removal that needs no further word. */
  onClose: () => void;
  /** A rating was saved. The sheet stays open when the result carries a note for the person, so do not close here. */
  onSaved: (result: SaveRatingResult) => void;
  onRemoved: () => void;
  /**
   * The consent sheet of useRatingConsent. A modal opened from inside this one must be mounted inside it, or iOS
   * has nowhere to present it, so the host hands it over to be rendered here.
   */
  consentSheet?: React.ReactNode;
}

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const toggle = <T extends string>(list: readonly T[], tag: T): T[] =>
  list.includes(tag) ? list.filter(t => t !== tag) : list.length >= MAX_TAGS_PER_GROUP ? [...list] : [...list, tag];

// ─── Small parts ────────────────────────────────────────────────────────────

const SectionTitle = ({ children, aside }: { children: string; aside?: string }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
    {aside ? <Text style={styles.aside}>{aside}</Text> : null}
  </View>
);

const Chip = ({
  label,
  accessibilityLabel,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected, disabled: !!disabled }}
    hitSlop={{ top: 4, bottom: 4 }}
    style={[styles.chip, selected && styles.chipOn, disabled && styles.chipOff]}
  >
    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
  </Pressable>
);

function TagChips<T extends keyof typeof TAG_LABELS>({
  options,
  selected,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (tag: T) => void;
}) {
  const full = selected.length >= MAX_TAGS_PER_GROUP;
  return (
    <View>
      <View style={styles.chips}>
        {options.map(tag => (
          <Chip
            key={tag}
            label={TAG_LABELS[tag]}
            selected={selected.includes(tag)}
            disabled={full && !selected.includes(tag)}
            onPress={() => onToggle(tag)}
          />
        ))}
      </View>
      {full ? <Text style={styles.hint}>Up to four. Tap a chosen word to remove it.</Text> : null}
    </View>
  );
}

// ─── The form (mounted while the sheet is open) ─────────────────────────────

type FormProps = Omit<RateItemSheetProps, 'visible'> & {
  /** Owned by the sheet so the system close gesture can see that a save is running. */
  busyRef: React.MutableRefObject<boolean>;
};

function RateForm({
  item,
  wearCount,
  initial,
  initialOverall,
  consentGranted,
  onRequestConsent,
  onClose,
  onSaved,
  onRemoved,
  consentSheet,
  busyRef,
}: FormProps) {
  const [overall, setOverall] = useState<Score | null>(initial?.overall ?? initialOverall ?? null);
  const [touch, setTouch] = useState<Score | null>(initial?.touch ?? null);
  const [touchTags, setTouchTags] = useState<TouchTag[]>(initial?.touchTags ?? []);
  const [comfort, setComfort] = useState<Score | null>(initial?.comfort ?? null);
  const [comfortTags, setComfortTags] = useState<ComfortTag[]>(initial?.comfortTags ?? []);
  const [holdsUp, setHoldsUp] = useState<Score | null>(initial?.holdsUp ?? null);
  const [holdsUpTags, setHoldsUpTags] = useState<HoldsUpTag[]>(initial?.holdsUpTags ?? []);
  const [fit, setFit] = useState<FitVerdict | null>(initial?.fit ?? null);
  const [buyAgain, setBuyAgain] = useState<BuyAgain | null>(initial?.wouldBuyAgain ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  // On for a new rating (the person agreed to add ratings); an existing rating starts as it is stored.
  const [share, setShare] = useState(initial ? initial.contributed : true);
  const [agreedHere, setAgreedHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mounted = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The modal sizes this form to the sheet, not the screen, but the keyboard's position is given from the top
  // of the screen. Without the gap above the sheet the keyboard lifts the form too little, and the buttons
  // and the end of the note stay behind the keyboard and its Done bar. On a phone the sheet's bottom is the
  // screen's bottom, so the gap is the screen height minus the sheet height. Android lifts the window itself,
  // and on an iPad the sheet floats, so both keep no offset.
  const { height: windowHeight } = useWindowDimensions();
  const [sheetTop, setSheetTop] = useState(0);
  const measureSheet = (event: LayoutChangeEvent) => {
    const phone = Platform.OS === 'ios' && !Platform.isPad;
    setSheetTop(phone ? Math.max(0, Math.round(windowHeight - event.nativeEvent.layout.height)) : 0);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      busyRef.current = false;
      if (scrollTimer.current) {
        clearTimeout(scrollTimer.current);
      }
    };
  }, [busyRef]);

  const insightsOn = brandInsightsActive();
  const hasBrand = !!item.brand && item.brand.trim() !== '';
  const worn = wearCount >= 1;
  const canCount = hasBrand && worn;
  const agreed = consentGranted === true || agreedHere;
  const showHoldsUp = wearCount >= MIN_WEARS_FOR_HOLDS_UP;
  const done = notice !== null;

  /**
   * What the save asks for. Never left out. Where the sheet cannot show a choice (insights off, the answer not
   * known yet) the stored choice is repeated so an edit does not change it.
   */
  const contribute = ((): boolean => {
    if (!insightsOn) {
      return initial?.contributed ?? false;
    }
    if (!canCount) {
      return false;
    }
    if (consentGranted === null && !agreedHere) {
      return initial?.contributed ?? false;
    }
    if (!agreed) {
      return false;
    }
    return share;
  })();

  const requestClose = () => {
    if (!busyRef.current) {
      onClose();
    }
  };

  const save = async () => {
    if (busyRef.current || overall === null) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await saveItemRating(item.id, {
        overall,
        touch,
        touchTags,
        comfort,
        comfortTags,
        holdsUp: showHoldsUp ? holdsUp : null,
        holdsUpTags: showHoldsUp ? holdsUpTags : [],
        fit,
        wouldBuyAgain: buyAgain,
        note: note.trim() === '' ? null : note.trim(),
        contribute,
      });
      busyRef.current = false;
      if (!mounted.current) {
        return;
      }
      setBusy(false);
      onSaved(result);
      if (result.blocked) {
        setNotice(BLOCKED_LINES[result.blocked]);
      } else {
        onClose();
      }
    } catch (thrown) {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setError(messageOf(thrown, SAVE_FAILED));
      }
    }
  };

  const remove = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteItemRating(item.id);
      busyRef.current = false;
      if (!mounted.current) {
        return;
      }
      setBusy(false);
      onRemoved();
      onClose();
    } catch (thrown) {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setError(messageOf(thrown, REMOVE_FAILED));
      }
    }
  };

  const confirmRemove = () => {
    Alert.alert(REMOVE_TITLE, REMOVE_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove rating',
        style: 'destructive',
        onPress: () => {
          remove().catch(() => {});
        },
      },
    ]);
  };

  const addToInsights = async () => {
    let agreedNow = false;
    try {
      agreedNow = await onRequestConsent();
    } catch {
      agreedNow = false;
    }
    if (mounted.current && agreedNow) {
      setAgreedHere(true);
      setShare(true);
    }
  };

  // The note sits near the bottom: once the keyboard has lifted the sheet, bring the end of the form into view.
  const showEnd = () => {
    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
    }
    scrollTimer.current = setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 200);
  };

  const shareRow = (() => {
    if (!insightsOn) {
      return null;
    }
    if (!canCount) {
      return (
        <View style={styles.shareRow}>
          <View style={styles.shareText}>
            <Text style={styles.shareLabel}>{SHARE_LABEL}</Text>
            <Text style={styles.hint}>{SHARE_DISABLED_CAPTION}</Text>
          </View>
          <Switch
            value={false}
            disabled
            accessibilityLabel={SHARE_LABEL}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      );
    }
    if (agreed) {
      return (
        <View style={styles.shareRow}>
          <View style={styles.shareText}>
            <Text style={styles.shareLabel}>{SHARE_LABEL}</Text>
            <Text style={styles.hint}>{SHARE_ON_CAPTION}</Text>
          </View>
          <Switch
            value={share}
            onValueChange={setShare}
            disabled={busy || done}
            accessibilityLabel={SHARE_LABEL}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      );
    }
    if (consentGranted === false) {
      return (
        <Pressable
          onPress={() => {
            addToInsights().catch(() => {});
          }}
          disabled={busy || done}
          accessibilityRole="button"
          accessibilityLabel={ADD_TO_INSIGHTS_LABEL}
          style={styles.shareRow}
        >
          <View style={styles.shareText}>
            <Text style={styles.shareLink}>{ADD_TO_INSIGHTS_LABEL}</Text>
            <Text style={styles.hint}>{ADD_TO_INSIGHTS_CAPTION}</Text>
          </View>
        </Pressable>
      );
    }
    return null;
  })();

  const itemLine = [item.name, item.brand?.trim()].filter(Boolean).join(' · ');

  return (
    <>
      <KeyboardSafeView style={styles.container} onLayout={measureSheet} keyboardVerticalOffset={sheetTop}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {SHEET_TITLE}
          </Text>
          {itemLine ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {itemLine}
            </Text>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <SectionTitle aside="Required">Overall</SectionTitle>
          <RatingScale
            value={overall}
            onChange={setOverall}
            size="lg"
            accessibilityLabel="Overall rating"
            valueLabels={OVERALL_LABELS}
          />

          <SectionTitle>How it feels to touch</SectionTitle>
          <RatingScale
            variant="dots"
            value={touch}
            onChange={setTouch}
            onClear={() => setTouch(null)}
            allowClear
            accessibilityLabel="How it feels to touch"
            endLabels={[TOUCH_LABELS[1], TOUCH_LABELS[5]]}
            valueLabels={TOUCH_LABELS}
          />
          <TagChips options={TOUCH_TAGS} selected={touchTags} onToggle={tag => setTouchTags(list => toggle(list, tag))} />

          <SectionTitle>How it wears</SectionTitle>
          <RatingScale
            variant="dots"
            value={comfort}
            onChange={setComfort}
            onClear={() => setComfort(null)}
            allowClear
            accessibilityLabel="How it wears"
            endLabels={[COMFORT_LABELS[1], COMFORT_LABELS[5]]}
            valueLabels={COMFORT_LABELS}
          />
          <TagChips
            options={COMFORT_TAGS}
            selected={comfortTags}
            onToggle={tag => setComfortTags(list => toggle(list, tag))}
          />

          {showHoldsUp ? (
            <>
              <SectionTitle>How it’s holding up</SectionTitle>
              <RatingScale
                variant="dots"
                value={holdsUp}
                onChange={setHoldsUp}
                onClear={() => setHoldsUp(null)}
                allowClear
                accessibilityLabel="How it’s holding up"
                endLabels={[HOLDS_UP_LABELS[1], HOLDS_UP_LABELS[5]]}
                valueLabels={HOLDS_UP_LABELS}
              />
              <TagChips
                options={HOLDS_UP_TAGS}
                selected={holdsUpTags}
                onToggle={tag => setHoldsUpTags(list => toggle(list, tag))}
              />
            </>
          ) : null}

          <SectionTitle aside={item.size?.trim() ? `Size ${item.size.trim()}` : undefined}>
            Fit compared with the label
          </SectionTitle>
          <View style={styles.chips}>
            {FIT_VERDICTS.map(verdict => (
              <Chip
                key={verdict}
                label={FIT_LABELS[verdict]}
                accessibilityLabel={`Fit: ${FIT_LABELS[verdict]}`}
                selected={fit === verdict}
                onPress={() => setFit(current => (current === verdict ? null : verdict))}
              />
            ))}
          </View>

          <SectionTitle>Would you buy it again</SectionTitle>
          <View style={styles.chips}>
            {BUY_AGAIN.map(answer => (
              <Chip
                key={answer}
                label={BUY_AGAIN_LABELS[answer]}
                accessibilityLabel={`Would buy again: ${BUY_AGAIN_LABELS[answer]}`}
                selected={buyAgain === answer}
                onPress={() => setBuyAgain(current => (current === answer ? null : answer))}
              />
            ))}
          </View>

          <SectionTitle>Private note</SectionTitle>
          <Text style={styles.hint}>Just for you. Never shown to anyone.</Text>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            onFocus={showEnd}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Anything you want to remember about it"
            placeholderTextColor={theme.colors.textSubtle}
            accessibilityLabel="Private note"
            inputAccessoryViewID={RATE_NOTE_ACCESSORY_ID}
          />
          {note.length > 0 ? (
            <Text style={styles.counter}>{`${note.length}/${NOTE_MAX_LENGTH}`}</Text>
          ) : null}

          {shareRow}

          {initial && !done ? (
            <Pressable
              onPress={confirmRemove}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Remove rating"
              hitSlop={{ top: 8, bottom: 8 }}
              style={styles.removeButton}
            >
              <Text style={styles.removeText}>Remove rating</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          {done ? (
            <View style={styles.buttonRow}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Done"
                style={[styles.button, styles.buttonPrimary]}
              >
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <Pressable
                onPress={requestClose}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={[styles.button, styles.buttonSecondary, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  save().catch(() => {});
                }}
                disabled={busy || overall === null}
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityState={{ disabled: busy || overall === null, busy }}
                style={[styles.button, styles.buttonPrimary, (busy || overall === null) && styles.buttonDisabled]}
              >
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <KeyboardActionBar nativeID={RATE_NOTE_ACCESSORY_ID} label="Done" onPress={() => Keyboard.dismiss()} />
      </KeyboardSafeView>
      {consentSheet}
    </>
  );
}

// ─── The sheet ──────────────────────────────────────────────────────────────

const RateItemSheet: React.FC<RateItemSheetProps> = ({ visible, onClose, ...rest }) => {
  const busyRef = useRef(false);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        // A swipe down or the Android back button must not walk away from a save in progress.
        if (!busyRef.current) {
          onClose();
        }
      }}
    >
      {/* Mounted only while open: every opening starts from the stored rating, and a closed sheet holds no field. */}
      {visible ? <RateForm {...rest} onClose={onClose} busyRef={busyRef} /> : null}
    </Modal>
  );
};

export default RateItemSheet;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3 },
  subtitle: { marginTop: 2, fontSize: 14, color: theme.colors.textMuted },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  sectionTitle: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: theme.colors.text },
  aside: { fontSize: 13, color: theme.colors.textMuted },
  hint: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted, marginTop: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipOff: { opacity: 0.4 },
  chipText: { fontSize: 14, color: theme.colors.text },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },

  note: {
    marginTop: 8,
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#FFFFFF',
  },
  counter: { alignSelf: 'flex-end', marginTop: 4, fontSize: 12, color: theme.colors.textMuted },

  shareRow: {
    minHeight: 56,
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  shareText: { flex: 1, marginRight: 12 },
  shareLabel: { fontSize: 16, fontWeight: '500', color: theme.colors.text },
  shareLink: { fontSize: 16, fontWeight: '600', color: '#7A5A22' },

  removeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  removeText: { fontSize: 16, fontWeight: '600', color: '#B91C1C' },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
  },
  error: { fontSize: 14, lineHeight: 20, color: '#B91C1C', marginBottom: 8 },
  notice: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted, marginBottom: 8 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonPrimary: { backgroundColor: theme.colors.accent },
  buttonSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.borderStrong },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  buttonTextPrimary: { color: '#FFFFFF' },
});
