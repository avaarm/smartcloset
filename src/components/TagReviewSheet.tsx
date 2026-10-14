/**
 * TagReviewSheet: the one sheet of a tag scan. It coaches before the photo, shows the reading, and then the
 * result, row by row, with what was read as Read (ticked) or Check (waiting for a tap). It has no text fields:
 * numbers are corrected afterwards in the Materials editor of the form, and nothing is applied until "Use these".
 *
 * The sheet only shows; ScanTagButton runs the camera and the reading, and the form decides what to do with the
 * choice it hands back.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { FieldStatus, TagFibre, TagGroup, TagPart, TagRead, TagReadFailure } from '../types/tag';
import { toMaterialComponents } from '../utils/tagGrounding';
import theme from '../styles/theme';
import {
  applyTagRead,
  brandOffered,
  CHECK_ROW_MESSAGE,
  defaultTicks,
  describeMaterials,
  fabricState,
  FABRIC_UNRELIABLE_MESSAGE,
  isReplaceableMaterials,
  sizeUsable,
  SYMBOLS_ONLY_MESSAGE,
  type TagApplyChoice,
  type TagCurrentValues,
  type TagTicks,
} from './tagApply';

export type TagReviewPhase = 'coach' | 'reading' | 'result' | 'failed';

export interface TagReviewSheetProps {
  visible: boolean;
  phase: TagReviewPhase;
  read: TagRead | null;
  failure: TagReadFailure | null;
  /** What was read when a scan failed after finding some words. */
  transcription?: string;
  current: TagCurrentValues;
  onTake: () => void;
  onChoose: () => void;
  onTypeInstead: () => void;
  onScanAnother: () => void;
  onApply: (choice: TagApplyChoice) => void;
  onClose: () => void;
  /** Set when an earlier photo was read: a next photo that fails or is cancelled can still go back to that result. */
  onBack?: () => void;
  /** False once the third photo has been read. Default true. */
  canScanAnother?: boolean;
  /** Which step the reading is on; the second only happens when the optional model step is on. */
  step?: 'reading' | 'structuring';
  /** A line under the coaching, for example when the camera could not be opened. */
  notice?: string | null;
}

export const FAILURE_MESSAGES: Record<TagReadFailure, string> = {
  no_text: 'We couldn’t find any text. Move closer, flatten the tag and add light.',
  too_small: 'The tag looks small or blurry. Fill the frame and try again.',
  offline: 'No connection. You can type the details instead.',
  signed_out: 'Sign in to scan tags.',
  consent: 'AI reading is turned off. You can type the details instead, or turn it on in Settings.',
  daily_limit: 'You’ve scanned a lot today. Type it in, or try again tomorrow.',
  failed: 'We couldn’t read that one. Try again, or type it in.',
};

/** Failures where taking another photo can help; the others end in "Type it instead" only. */
const RETAKE_REASONS: ReadonlySet<TagReadFailure> = new Set<TagReadFailure>(['no_text', 'too_small', 'offline', 'failed']);
/** Failures a better photo can fix. */
const PHOTO_HINT_REASONS: ReadonlySet<TagReadFailure> = new Set<TagReadFailure>(['no_text', 'too_small', 'failed']);

export const COACH_TEXT =
  'Flatten the tag, fill the frame, use good light and avoid glare. Care and fabric details are often on different tags, so you can scan up to 3.';
export const RETAKE_HINT = 'Press it flat on a table. Dark satin? Try side light, no flash.';
export const FLIP_HINT = 'Flip it over and scan the other side. Fabric and care are often on different tags.';
const HARD_TO_READ = 'The tag was hard to read, so nothing is ticked for you. Check each row.';

const REVEAL_STEP_MS = 60;
const ROW_COUNT = 5;

const PART_TITLES: Record<TagPart, string> = {
  shell: 'Shell',
  lining: 'Lining',
  fill: 'Fill',
  trim: 'Trim',
  upper: 'Upper',
  sole: 'Sole',
  hardware: 'Hardware',
  other: 'Other',
};

const STATUS_LABELS: Record<FieldStatus, string> = { verified: 'Read', check: 'Check', missing: 'Not found' };

const capitalise = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const groupTitle = (group: TagGroup): string =>
  group.part === 'other' && group.label ? `Other (${group.label})` : PART_TITLES[group.part];

/** A fibre the way the tag printed it: "98% Cotton", "Organic cotton". */
const fibreLine = (f: TagFibre): string => {
  const word = (f.printed || f.fibre || '').toLowerCase();
  const qualified = f.qualifier && !word.startsWith(f.qualifier) ? `${f.qualifier} ${word}` : word;
  return `${f.percent !== null ? `${f.percent}% ` : ''}${capitalise(qualified)}`.trim();
};

// ─── Small parts ────────────────────────────────────────────────────────────

const StatusChip = ({ status }: { status: FieldStatus }) => (
  <View style={[styles.chip, status === 'verified' && styles.chipRead, status === 'check' && styles.chipCheck]}>
    <Text style={[styles.chipText, status === 'verified' && styles.chipReadText, status === 'check' && styles.chipCheckText]}>
      {STATUS_LABELS[status]}
    </Text>
  </View>
);

const ActionButton = ({
  label,
  onPress,
  primary,
  icon,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  icon?: string;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary, pressed && styles.pressed]}
  >
    {icon ? <Icon name={icon} size={20} color={primary ? '#FFFFFF' : theme.colors.text} style={styles.buttonIcon} /> : null}
    <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
  </Pressable>
);

const TextLink = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
    style={styles.link}
  >
    <Text style={styles.linkText}>{label}</Text>
  </Pressable>
);

/** The words as read, in a box that opens and closes. Plain text: nothing here can be typed into. */
const AsReadBox = ({ text, initiallyOpen }: { text: string; initiallyOpen?: boolean }) => {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={styles.asRead}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityLabel="As read"
        accessibilityState={{ expanded: open }}
        style={styles.asReadHeader}
        hitSlop={{ top: 6, bottom: 6 }}
      >
        <Text style={styles.asReadTitle}>As read</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </Pressable>
      {open ? (
        <Text style={styles.asReadText} selectable>
          {text.trim() !== '' ? text : 'Nothing was read.'}
        </Text>
      ) : null}
    </View>
  );
};

/** A drawn good and bad framing, with Views only (no image to ship). */
const FramingDiagram = () => (
  <View style={styles.diagram} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={styles.diagramCell}>
      <View style={[styles.frame, styles.frameGood]}>
        <View style={styles.tagFull}>
          <View style={styles.tagLine} />
          <View style={[styles.tagLine, styles.tagLineShort]} />
          <View style={styles.tagLine} />
        </View>
      </View>
      <Text style={styles.diagramCaption}>Fill the frame</Text>
    </View>
    <View style={styles.diagramCell}>
      <View style={[styles.frame, styles.frameBad]}>
        <View style={styles.tagTiny}>
          <View style={styles.tagLine} />
          <View style={[styles.tagLine, styles.tagLineShort]} />
        </View>
      </View>
      <Text style={styles.diagramCaption}>Too far away</Text>
    </View>
  </View>
);

// ─── Coach, reading, failed ─────────────────────────────────────────────────

const CoachBody = ({
  notice,
  onTake,
  onChoose,
  onTypeInstead,
  onBack,
}: Pick<TagReviewSheetProps, 'onTake' | 'onChoose' | 'onTypeInstead' | 'notice' | 'onBack'>) => (
  <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <Text style={styles.paragraph}>{COACH_TEXT}</Text>
    <FramingDiagram />
    {notice ? (
      <Text style={styles.notice} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    ) : null}
    <ActionButton label="Take photo" onPress={onTake} primary icon="camera-outline" />
    <ActionButton label="Choose from library" onPress={onChoose} icon="images-outline" />
    {onBack ? <TextLink label="Back to results" onPress={onBack} /> : null}
    <TextLink label="Type it instead" onPress={onTypeInstead} />
  </ScrollView>
);

const ReadingBody = ({ step, onClose }: { step: 'reading' | 'structuring'; onClose: () => void }) => (
  <View style={[styles.body, styles.centered]}>
    <ActivityIndicator color={theme.colors.accent} />
    <Text style={styles.readingText} accessibilityLiveRegion="polite">
      {step === 'structuring' ? 'Sorting out the fabric lines...' : 'Reading the tag...'}
    </Text>
    <TextLink label="Cancel" onPress={onClose} />
  </View>
);

const FailedBody = ({
  failure,
  transcription,
  onTake,
  onChoose,
  onTypeInstead,
  onBack,
}: Pick<TagReviewSheetProps, 'onTake' | 'onChoose' | 'onTypeInstead' | 'transcription' | 'onBack'> & { failure: TagReadFailure }) => (
  <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <Text style={styles.paragraph} accessibilityLiveRegion="polite">
      {FAILURE_MESSAGES[failure]}
    </Text>
    {PHOTO_HINT_REASONS.has(failure) ? <Text style={styles.hint}>{RETAKE_HINT}</Text> : null}
    {transcription ? <AsReadBox text={transcription} initiallyOpen /> : null}
    {RETAKE_REASONS.has(failure) ? (
      <>
        <ActionButton label="Take photo" onPress={onTake} primary icon="camera-outline" />
        <ActionButton label="Choose from library" onPress={onChoose} icon="images-outline" />
      </>
    ) : null}
    {onBack ? <TextLink label="Back to results" onPress={onBack} /> : null}
    <TextLink label="Type it instead" onPress={onTypeInstead} />
  </ScrollView>
);

// ─── Result ─────────────────────────────────────────────────────────────────

const RevealRow = ({ shown, children }: { shown: boolean; children: React.ReactNode }) => (
  <View
    style={[styles.row, !shown && styles.rowHidden]}
    accessibilityElementsHidden={!shown}
    importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
  >
    {children}
  </View>
);

const RowHeader = ({
  name,
  title,
  status,
  checked,
  disabled,
  onToggle,
}: {
  name: string;
  title: string;
  status: FieldStatus;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => (
  <Pressable
    onPress={onToggle}
    disabled={disabled}
    accessibilityRole="checkbox"
    accessibilityLabel={`Use ${name}`}
    accessibilityState={{ checked, disabled }}
    accessibilityValue={{ text: STATUS_LABELS[status] }}
    hitSlop={{ top: 6, bottom: 6 }}
    style={styles.rowHeader}
  >
    <Icon
      name={checked ? 'checkbox' : 'square-outline'}
      size={26}
      color={disabled ? theme.colors.borderStrong : checked ? theme.colors.accent : theme.colors.textMuted}
    />
    <Text style={[styles.rowTitle, disabled && styles.rowTitleDisabled]}>{title}</Text>
    <StatusChip status={status} />
  </Pressable>
);

const ResultBody = ({
  read,
  current,
  transcription,
  canScanAnother,
  onApply,
  onScanAnother,
  onClose,
}: {
  read: TagRead;
  current: TagCurrentValues;
  transcription?: string;
  canScanAnother: boolean;
  onApply: (choice: TagApplyChoice) => void;
  onScanAnother: () => void;
  onClose: () => void;
}) => {
  const [picked, setPicked] = useState<Partial<TagTicks>>({});
  const [replace, setReplace] = useState(false);
  const [removedCare, setRemovedCare] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(0);

  // Rows appear one after another, 60 ms apart, unless the person asked for less motion.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (reduceMotion: boolean) => {
      if (cancelled) return;
      if (reduceMotion) {
        setRevealed(ROW_COUNT);
        return;
      }
      let shown = 0;
      const next = () => {
        if (cancelled) return;
        shown += 1;
        setRevealed(shown);
        if (shown < ROW_COUNT) timer = setTimeout(next, REVEAL_STEP_MS);
      };
      next();
    };
    let reduce: Promise<boolean>;
    try {
      reduce = Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(value => value === true);
    } catch {
      reduce = Promise.resolve(false);
    }
    reduce.catch(() => false).then(show);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const fabric = fabricState(read);
  const unreliable = fabric.disabledReason === FABRIC_UNRELIABLE_MESSAGE;
  const defaults = defaultTicks(read, current);
  const ticks: TagTicks = {
    fabric: picked.fabric ?? defaults.fabric,
    care: picked.care ?? defaults.care,
    origin: picked.origin ?? defaults.origin,
    size: picked.size ?? defaults.size,
    brand: picked.brand ?? defaults.brand,
  };
  const toggle = (key: keyof TagTicks) => setPicked(p => ({ ...p, [key]: !ticks[key] }));

  const careKept = read.care.items.filter(item => !removedCare.includes(item));
  const readForApply: TagRead = removedCare.length > 0 ? { ...read, care: { ...read.care, items: careKept } } : read;

  const canReplace = fabric.usable && !isReplaceableMaterials(current.materials);
  const scanned = toMaterialComponents(fabric.groups);
  const sizeOk = sizeUsable(read, current);
  const brandOk = brandOffered(read, current);

  const careStatus: FieldStatus = read.care.items.length > 0 ? read.care.status : 'missing';
  const originStatus: FieldStatus = read.origin.country ? read.origin.status : 'missing';
  const sizeStatus: FieldStatus = read.size.value ? read.size.status : 'missing';
  const brandStatus: FieldStatus = read.brand.name ? 'check' : 'missing';
  const originIssues = (read.origin as { issues?: string[] }).issues ?? [];

  const flipHint = canScanAnother && (fabric.status === 'missing' || careStatus === 'missing');
  const unreadable = read.flags.includes('low_legibility');

  const apply = () => onApply(applyTagRead(readForApply, ticks, current, { replaceMaterials: replace }));

  return (
    <>
      <ScrollView contentContainerStyle={styles.resultScroll} keyboardShouldPersistTaps="handled">
        {read.flags.includes('symbols_only') ? <Text style={styles.paragraph}>{SYMBOLS_ONLY_MESSAGE}</Text> : null}
        {unreadable ? <Text style={styles.hint}>{HARD_TO_READ}</Text> : null}

        <RevealRow shown={revealed > 0}>
          <RowHeader
            name="fabric"
            title="Fabric"
            status={fabric.status}
            checked={ticks.fabric && fabric.usable}
            disabled={!fabric.usable}
            onToggle={() => toggle('fabric')}
          />
          {fabric.disabledReason ? <Text style={styles.rowNote}>{fabric.disabledReason}</Text> : null}
          {/* A scrambled read (design 7.15) shows only the words, in As read: the numbers can't be trusted. */}
          {unreliable
            ? null
            : fabric.groups.map((group, index) => (
                <View key={`${group.part}-${index}`} style={styles.group}>
                  <Text style={styles.groupTitle}>{groupTitle(group)}</Text>
                  {group.fibres.map((fibre, i) => (
                    <Text key={`${fibre.printed}-${i}`} style={styles.fibre}>
                      {fibreLine(fibre)}
                    </Text>
                  ))}
                  {group.sum !== null ? <Text style={styles.sumLine}>{`Adds up to ${Math.round(group.sum * 10) / 10}`}</Text> : null}
                  {group.issues
                    .filter(issue => !issue.startsWith('Adds up to'))
                    .map(issue => (
                      <Text key={issue} style={styles.issue}>
                        {issue}
                      </Text>
                    ))}
                </View>
              ))}
          {fabric.usable && fabric.status === 'check' ? <Text style={styles.rowNote}>{CHECK_ROW_MESSAGE}</Text> : null}
          {canReplace ? (
            <View style={styles.replaceBox}>
              <Text style={styles.rowNote}>{`You have: ${describeMaterials(current.materials)}. Tag says: ${describeMaterials(scanned)}.`}</Text>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => setReplace(true)}
                  accessibilityRole="radio"
                  accessibilityLabel="Replace"
                  accessibilityState={{ selected: replace }}
                  style={[styles.choice, replace && styles.choiceOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.choiceText, replace && styles.choiceTextOn]}>Replace</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReplace(false)}
                  accessibilityRole="radio"
                  accessibilityLabel="Keep mine"
                  accessibilityState={{ selected: !replace }}
                  style={[styles.choice, !replace && styles.choiceOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.choiceText, !replace && styles.choiceTextOn]}>Keep mine</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </RevealRow>

        <RevealRow shown={revealed > 1}>
          <RowHeader
            name="care"
            title="Care"
            status={careStatus}
            checked={ticks.care && careKept.length > 0}
            disabled={careKept.length === 0}
            onToggle={() => toggle('care')}
          />
          {read.care.items.length > 0 ? (
            <View style={styles.chipRow}>
              {careKept.map(item => (
                <Pressable
                  key={item}
                  onPress={() => setRemovedCare(list => [...list, item])}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item}`}
                  style={styles.careChip}
                  hitSlop={4}
                >
                  <Text style={styles.careChipText}>{item}</Text>
                  <Icon name="close" size={14} color={theme.colors.textMuted} style={styles.careChipIcon} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {careStatus === 'check' ? <Text style={styles.rowNote}>{CHECK_ROW_MESSAGE}</Text> : null}
        </RevealRow>

        <RevealRow shown={revealed > 2}>
          <RowHeader
            name="made in"
            title="Made in"
            status={originStatus}
            checked={ticks.origin && !!read.origin.country}
            disabled={!read.origin.country}
            onToggle={() => toggle('origin')}
          />
          {read.origin.country ? <Text style={styles.value}>{read.origin.country}</Text> : null}
          {originIssues.map(issue => (
            <Text key={issue} style={styles.issue}>
              {issue}
            </Text>
          ))}
          {originStatus === 'check' ? <Text style={styles.rowNote}>{CHECK_ROW_MESSAGE}</Text> : null}
        </RevealRow>

        <RevealRow shown={revealed > 3}>
          <RowHeader
            name="size"
            title="Size"
            status={sizeStatus}
            checked={ticks.size && sizeOk}
            disabled={!sizeOk}
            onToggle={() => toggle('size')}
          />
          {read.size.value ? <Text style={styles.value}>{read.size.value}</Text> : null}
          {read.size.value && !sizeOk ? <Text style={styles.rowNote}>{`Your size stays as ${current.size.trim()}.`}</Text> : null}
          {sizeOk && sizeStatus === 'check' ? <Text style={styles.rowNote}>{CHECK_ROW_MESSAGE}</Text> : null}
        </RevealRow>

        <RevealRow shown={revealed > 4}>
          <RowHeader
            name="brand"
            title="Brand"
            status={brandStatus}
            checked={ticks.brand && brandOk}
            disabled={!brandOk}
            onToggle={() => toggle('brand')}
          />
          {read.brand.name ? (
            <Text style={styles.value}>{brandOk ? `Looks like ${read.brand.name}. Use it?` : read.brand.name}</Text>
          ) : null}
          {read.brand.name && current.brand.trim() !== '' ? (
            <Text style={styles.rowNote}>{`Your brand stays as ${current.brand.trim()}.`}</Text>
          ) : null}
          {brandOk ? <Text style={styles.rowNote}>{CHECK_ROW_MESSAGE}</Text> : null}
        </RevealRow>

        {flipHint ? <Text style={styles.hint}>{FLIP_HINT}</Text> : null}

        <AsReadBox text={transcription ?? read.transcription} initiallyOpen={unreliable} />
      </ScrollView>

      <View style={styles.footer}>
        <ActionButton label="Use these" onPress={apply} primary />
        {canScanAnother ? <ActionButton label="Scan another side" onPress={onScanAnother} icon="camera-outline" /> : null}
        <TextLink label="Cancel" onPress={onClose} />
      </View>
    </>
  );
};

// ─── The sheet ──────────────────────────────────────────────────────────────

const TITLES: Record<TagReviewPhase, string> = {
  coach: 'Scan the tag',
  reading: 'Scan the tag',
  result: 'What the tag says',
  failed: 'Scan the tag',
};

const TagReviewSheet: React.FC<TagReviewSheetProps> = props => {
  const { visible, phase, read, failure, transcription, current, onClose } = props;

  // A new read starts a new set of ticks: the result body is rebuilt for it.
  const readKey = useRef<{ read: TagRead | null; id: number }>({ read: null, id: 0 });
  if (readKey.current.read !== read) readKey.current = { read, id: readKey.current.id + 1 };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {TITLES[phase]}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.close}
          >
            <Icon name="close" size={24} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        {phase === 'coach' ? (
          <CoachBody
            notice={props.notice}
            onTake={props.onTake}
            onChoose={props.onChoose}
            onTypeInstead={props.onTypeInstead}
            onBack={props.onBack}
          />
        ) : null}
        {phase === 'reading' ? <ReadingBody step={props.step ?? 'reading'} onClose={onClose} /> : null}
        {phase === 'failed' ? (
          <FailedBody
            failure={failure ?? 'failed'}
            transcription={transcription}
            onTake={props.onTake}
            onChoose={props.onChoose}
            onTypeInstead={props.onTypeInstead}
            onBack={props.onBack}
          />
        ) : null}
        {phase === 'result' && read ? (
          <ResultBody
            key={readKey.current.id}
            read={read}
            current={current}
            transcription={transcription}
            canScanAnother={props.canScanAnother !== false}
            onApply={props.onApply}
            onScanAnother={props.onScanAnother}
            onClose={onClose}
          />
        ) : null}
      </View>
    </Modal>
  );
};

export default TagReviewSheet;

const BORDER = theme.colors.border;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  body: { padding: 20, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resultScroll: { padding: 20, paddingBottom: 8, gap: 12 },
  paragraph: { fontSize: 16, lineHeight: 23, color: theme.colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  notice: { fontSize: 14, lineHeight: 20, color: '#92400E' },
  readingText: { fontSize: 16, color: theme.colors.text, marginTop: 12 },

  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: theme.colors.accent },
  buttonSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: theme.colors.borderStrong },
  buttonIcon: { marginRight: 8 },
  buttonText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  buttonTextPrimary: { color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 16, fontWeight: '600', color: '#7A5A22' },

  diagram: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  diagramCell: { alignItems: 'center', gap: 6 },
  frame: {
    width: 120,
    height: 84,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.mutedBackground,
  },
  frameGood: { borderColor: '#166534' },
  frameBad: { borderColor: '#B91C1C' },
  tagFull: { width: 104, height: 68, borderRadius: 6, backgroundColor: '#FFFFFF', padding: 8, gap: 6, justifyContent: 'center' },
  tagTiny: { width: 36, height: 24, borderRadius: 3, backgroundColor: '#FFFFFF', padding: 4, gap: 3, justifyContent: 'center' },
  tagLine: { height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong },
  tagLineShort: { width: '60%' },
  diagramCaption: { fontSize: 13, color: theme.colors.textMuted },

  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 8,
  },
  rowHidden: { opacity: 0 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.text },
  rowTitleDisabled: { color: theme.colors.textMuted },
  rowNote: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  value: { fontSize: 16, color: theme.colors.text },
  issue: { fontSize: 13, color: '#92400E' },
  group: { paddingLeft: 36, gap: 2 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  fibre: { fontSize: 16, color: theme.colors.text },
  sumLine: { fontSize: 13, color: theme.colors.textMuted },

  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#EEEAE3' },
  chipRead: { backgroundColor: '#DCFCE7' },
  chipCheck: { backgroundColor: '#FEF3C7' },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  chipReadText: { color: '#166534' },
  chipCheckText: { color: '#92400E' },

  replaceBox: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E6E3',
    backgroundColor: '#FFFFFF',
  },
  choiceOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  choiceText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  choiceTextOn: { color: '#FFFFFF', fontWeight: '600' },
  careChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.mutedBackground,
  },
  careChipText: { fontSize: 14, color: theme.colors.text },
  careChipIcon: { marginLeft: 6 },

  asRead: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 8 },
  asReadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  asReadTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  asReadText: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: '#FFFFFF',
  },
});
