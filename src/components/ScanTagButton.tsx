/**
 * ScanTagButton: the "Scan tag" button, and the whole scan behind it (consent, coaching, camera or library,
 * reading, review). `renderTrigger` swaps the button for another way to start the same scan (the card at the top of
 * Add/Edit item). ScanTagLink is the small "Scan the tag" link on Item Details, which sends the person to Edit
 * item with the scanner already open: there is no second copy of the scanner.
 *
 * Both are flag wrappers (design 6.1): with TAG_SCAN_ENABLED off they render nothing and no hook, effect or
 * request runs. The pure rules for what a scan changes in the form are in tagApply.ts and exported from here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { TagRead, TagReadFailure } from '../types/tag';
import { tagScanActive } from '../config/ratingFlags';
import { discardTempImage } from '../platform/fileSystem';
import { ensureAiConsent } from '../services/aiConsent';
import { getAuthUserId } from '../services/authUser';
import { MAX_TAG_PHOTOS, pickTagPhoto, readTag, type ReadTagPrior } from '../services/tagReader';
import theme from '../styles/theme';
import TagReviewSheet, { type TagReviewPhase } from './TagReviewSheet';
import type { TagApplyChoice, TagCurrentValues } from './tagApply';

export { applyTagRead } from './tagApply';
export type { TagApplyChoice, TagCurrentValues, TagTicks } from './tagApply';

/** What a custom trigger needs to start the scan: the same start the default button uses. */
export interface ScanTagTrigger {
  start: () => void;
  /** True for a guest or a disabled button: starting does nothing. */
  blocked: boolean;
}

export interface ScanTagButtonProps {
  onApply: (choice: TagApplyChoice) => void;
  current: TagCurrentValues;
  category?: string;
  disabled?: boolean;
  guest?: boolean;
  /** Start the scan as soon as the button appears (Item Details sends the person here to rescan). */
  autoOpen?: boolean;
  /**
   * Draws the thing that starts the scan in place of the default button and its helper line (the card at the top of
   * Add/Edit item). The scan and its one review sheet are the same either way.
   */
  renderTrigger?: (trigger: ScanTagTrigger) => React.ReactNode;
}

export const SCAN_HELPER = 'Fill in materials, care and country from the tag.';
export const GUEST_SCAN_MESSAGE = 'Sign in to scan tags.';
export const CAMERA_DENIED_NOTICE = 'Camera access is off. Choose a photo from your library, or turn the camera on in Settings.';
export const CAMERA_UNAVAILABLE_NOTICE = 'We couldn’t open the camera. Try again, or choose a photo from your library.';

// ─── The button ─────────────────────────────────────────────────────────────

function ScanTagButtonInner({ onApply, current, category, disabled, guest, autoOpen, renderTrigger }: ScanTagButtonProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<TagReviewPhase>('coach');
  const [read, setRead] = useState<TagRead | null>(null);
  const [failure, setFailure] = useState<TagReadFailure | null>(null);
  const [transcription, setTranscription] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<'reading' | 'structuring'>('reading');
  const [notice, setNotice] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  // A scan belongs to the session it started in: closing the sheet ends the session, and a late answer is dropped.
  const session = useRef(0);
  const prior = useRef<ReadTagPrior | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  const picking = useRef(false);
  const autoOpened = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      session.current += 1;
    };
  }, []);

  const blocked = !!disabled || !!guest;

  const start = useCallback(async () => {
    if (blocked || starting.current) return;
    starting.current = true;
    const mine = ++session.current;
    try {
      // The one-time permission to send photos to the AI services comes before anything else.
      let allowed = false;
      try {
        allowed = await ensureAiConsent();
      } catch {
        allowed = false;
      }
      if (!mounted.current || mine !== session.current) return;
      prior.current = null;
      picking.current = false;
      setRead(null);
      setTranscription(undefined);
      setNotice(null);
      setPhotoCount(0);
      setStep('reading');
      if (allowed) {
        setFailure(null);
        setPhase('coach');
      } else {
        setFailure('consent');
        setPhase('failed');
      }
      setOpen(true);
    } finally {
      starting.current = false;
    }
  }, [blocked]);

  // Coming from Item Details the screen is still sliding in, so the scan waits for that to finish.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    if (!autoOpen || blocked || autoOpened.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      if (autoOpened.current) return;
      autoOpened.current = true;
      startRef.current();
    });
    return () => task.cancel();
  }, [autoOpen, blocked]);

  const close = useCallback(() => {
    session.current += 1;
    prior.current = null;
    picking.current = false;
    setOpen(false);
  }, []);

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      if (picking.current) return;
      picking.current = true;
      const mine = session.current;
      const live = () => mounted.current && mine === session.current;
      try {
        setNotice(null);
        const photo = await pickTagPhoto(source);
        if (photo.status === 'ok' && !live()) {
          // The sheet was closed while the camera was open: the photo is not going to be read.
          await discardTempImage(photo.uri);
          return;
        }
        if (!live()) return;
        if (photo.status === 'denied') {
          setNotice(CAMERA_DENIED_NOTICE);
          return;
        }
        if (photo.status === 'unavailable') {
          setNotice(CAMERA_UNAVAILABLE_NOTICE);
          return;
        }
        if (photo.status !== 'ok') return; // cancelled: back to the coaching
        setStep('reading');
        setPhase('reading');
        const result = await readTag([photo.uri], {
          category,
          prior: prior.current ?? undefined,
          onProgress: next => {
            if (live()) setStep(next);
          },
        });
        if (!live()) return;
        if (result.ok) {
          prior.current = {
            text: result.read.transcription,
            photos: (prior.current?.photos ?? 0) + 1,
            lowLegibility: result.read.flags.includes('low_legibility'),
          };
          setPhotoCount(prior.current.photos);
          setFailure(null);
          setRead(result.read);
          setTranscription(result.read.transcription);
          setPhase('result');
        } else {
          // An earlier photo's read stays, so "Back to results" can still get to it.
          setFailure(result.reason);
          setTranscription(result.transcription);
          setPhase('failed');
        }
      } catch {
        if (live()) {
          setFailure('failed');
          setTranscription(undefined);
          setPhase('failed');
        }
      } finally {
        if (mine === session.current) picking.current = false;
      }
    },
    [category],
  );

  const apply = useCallback(
    (choice: TagApplyChoice) => {
      onApply(choice);
      close();
    },
    [onApply, close],
  );

  const scanAnother = useCallback(() => {
    setNotice(null);
    setPhase('coach');
  }, []);

  // After a next photo fails or is cancelled, the earlier read is still the result to review.
  const backToResults = useCallback(() => {
    if (!read) return;
    setNotice(null);
    setFailure(null);
    setTranscription(read.transcription);
    setPhase('result');
  }, [read]);

  return (
    <View>
      {renderTrigger ? (
        renderTrigger({
          start: () => {
            start().catch(() => {});
          },
          blocked,
        })
      ) : (
        <>
          <Pressable
            onPress={start}
            disabled={blocked}
            accessibilityRole="button"
            accessibilityLabel="Scan tag"
            accessibilityState={{ disabled: blocked }}
            style={({ pressed }) => [styles.button, blocked && styles.buttonDisabled, pressed && styles.pressed]}
          >
            <Icon name="scan-outline" size={20} color={blocked ? theme.colors.textMuted : '#7A5A22'} />
            <Text style={[styles.buttonText, blocked && styles.buttonTextDisabled]}>Scan tag</Text>
          </Pressable>
          <Text style={styles.helper}>{guest ? GUEST_SCAN_MESSAGE : SCAN_HELPER}</Text>
        </>
      )}
      <TagReviewSheet
        visible={open}
        phase={phase}
        read={read}
        failure={failure}
        transcription={transcription}
        current={current}
        step={step}
        notice={notice}
        canScanAnother={photoCount < MAX_TAG_PHOTOS}
        onTake={() => pick('camera')}
        onChoose={() => pick('library')}
        onTypeInstead={close}
        onScanAnother={scanAnother}
        onApply={apply}
        onClose={close}
        onBack={read && photoCount > 0 ? backToResults : undefined}
      />
    </View>
  );
}

const ScanTagButton: React.FC<ScanTagButtonProps> = props => (tagScanActive() ? <ScanTagButtonInner {...props} /> : null);
export default ScanTagButton;
export { ScanTagButton };

// ─── The link on Item Details ───────────────────────────────────────────────

function ScanTagLinkInner({ hasTag, onPress }: ScanTagLinkProps) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuthUserId()
      .then(id => {
        if (!cancelled) setSignedIn(!!id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  const label = hasTag ? 'Rescan the tag' : 'Scan the tag';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.link}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export interface ScanTagLinkProps {
  hasTag: boolean;
  onPress: () => void;
}

/** Renders nothing for guests or with the flag off. */
export const ScanTagLink: React.FC<ScanTagLinkProps> = props => (tagScanActive() ? <ScanTagLinkInner {...props} /> : null);

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSubtle,
  },
  buttonDisabled: { borderColor: theme.colors.border, backgroundColor: theme.colors.mutedBackground },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#7A5A22' },
  buttonTextDisabled: { color: theme.colors.textMuted },
  pressed: { opacity: 0.85 },
  helper: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6, marginLeft: 4 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
  linkText: { fontSize: 15, fontWeight: '600', color: '#7A5A22' },
});
