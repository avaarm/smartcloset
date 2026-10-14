/**
 * RateItemSheet (documentation/design/quality-ratings.md, 3.3, 6.2 and 6.5): the overall rating is required, a
 * group of words holds four at most, how it is holding up needs a few wears, the brand-insights row has its
 * states, and every save sends every field it has with an explicit `contribute`. The note has its own keyboard
 * bar, never the shared one.
 */
import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import {
  Alert,
  Dimensions,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

let mockInsightsOn = true;
jest.mock('../../src/config/ratingFlags', () => ({
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: true,
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => true,
  brandInsightsActive: () => mockInsightsOn,
  tagScanActive: () => false,
}));

jest.mock('../../src/services/ratingService', () => ({
  saveItemRating: jest.fn(),
  deleteItemRating: jest.fn(),
}));

import RateItemSheet, {
  ADD_TO_INSIGHTS_LABEL,
  BLOCKED_LINES,
  RATE_NOTE_ACCESSORY_ID,
  REMOVE_MESSAGE,
  REMOVE_TITLE,
  SHARE_DISABLED_CAPTION,
  SHARE_LABEL,
  SHARE_ON_CAPTION,
  type RateItemSheetProps,
} from '../../src/components/RateItemSheet';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { scaleStepLabel } from '../../src/components/RatingScale';
import { NOTE_MAX_LENGTH, type Score } from '../../src/config/ratingVocabulary';
import * as ratingService from '../../src/services/ratingService';
import type { ContributionBlocked, ItemRating } from '../../src/types/rating';

const saveItemRating = ratingService.saveItemRating as jest.Mock;
const deleteItemRating = ratingService.deleteItemRating as jest.Mock;

const ITEM = { id: 'item-1', name: 'Linen shirt', brand: 'Zara', size: 'M' };

const rating = (over: Partial<ItemRating> = {}): ItemRating => ({
  itemId: ITEM.id,
  overall: 4,
  touch: null,
  touchTags: [],
  comfort: null,
  comfortTags: [],
  holdsUp: null,
  holdsUpTags: [],
  fit: null,
  wouldBuyAgain: null,
  note: null,
  contributed: false,
  wearsAtRating: 5,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

const flatten = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join(' ');
  }
  return flatten(node.children);
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
const trees: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockInsightsOn = true;
  saveItemRating.mockReset().mockResolvedValue({ contributed: false, blocked: null, updatedAt: '2026-10-13T00:00:00Z' });
  deleteItemRating.mockReset().mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop()!;
    act(() => tree.unmount());
  }
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const baseProps = (over: Partial<RateItemSheetProps> = {}): RateItemSheetProps => ({
  visible: true,
  item: ITEM,
  wearCount: 5,
  initial: null,
  consentGranted: true,
  onRequestConsent: jest.fn(async () => true),
  onClose: jest.fn(),
  onSaved: jest.fn(),
  onRemoved: jest.fn(),
  ...over,
});

const mount = async (over: Partial<RateItemSheetProps> = {}) => {
  const props = baseProps(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<RateItemSheet {...props} />);
  });
  trees.push(tree);
  const pressables = (label: string): ReactTestInstance[] =>
    tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  const one = (label: string): ReactTestInstance => {
    const found = pressables(label);
    if (found.length !== 1) {throw new Error(`expected one "${label}", found ${found.length}`);}
    return found[0];
  };
  const press = async (label: string) => {
    const node = one(label);
    await act(async () => {
      await node.props.onPress();
    });
  };
  const star = (n: Score) => press(scaleStepLabel('Overall rating', n));
  const switches = (label: string) => tree.root.findAllByType(Switch).filter(n => n.props.accessibilityLabel === label);
  const note = () => tree.root.findByType(TextInput);
  const text = () => flatten(tree.toJSON());
  const rerender = async (next: Partial<RateItemSheetProps>) => {
    await act(async () => {
      tree.update(<RateItemSheet {...props} {...next} />);
    });
  };
  return { tree, props, pressables, one, press, star, switches, note, text, rerender };
};

/** The input of the last save. */
const lastSave = () => saveItemRating.mock.calls[saveItemRating.mock.calls.length - 1][1];

describe('RateItemSheet', () => {
  describe('opening and closing', () => {
    it('holds no field and no content while closed', async () => {
      const { tree, text } = await mount({ visible: false });
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
      expect(text()).toBe('');
    });

    it('is a page sheet that slides up, titled for the piece', async () => {
      const { tree, text } = await mount();
      const modal = tree.root.findByType(Modal);
      expect(modal.props.presentationStyle).toBe('pageSheet');
      expect(modal.props.animationType).toBe('slide');
      expect(modal.props.visible).toBe(true);
      expect(text()).toContain('Rate this piece');
      expect(text()).toContain('Linen shirt · Zara');
    });

    it('asks to close from the system close gesture', async () => {
      const { tree, props } = await mount();
      act(() => tree.root.findByType(Modal).props.onRequestClose());
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('Cancel closes without saving', async () => {
      const { press, props } = await mount();
      await press('Cancel');
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(saveItemRating).not.toHaveBeenCalled();
    });

    it('starts again from the stored rating each time it opens', async () => {
      const stored = rating({ touch: 4, note: 'Soft after washing' });
      const { rerender, note, star, text } = await mount({ initial: stored });
      expect(note().props.value).toBe('Soft after washing');
      await act(async () => note().props.onChangeText('changed'));
      await star(1);

      await rerender({ visible: false });
      await rerender({ visible: true });
      expect(note().props.value).toBe('Soft after washing');
      expect(text()).toContain('Good');
    });
  });

  describe('overall rating', () => {
    it('is required: Save stays off until a star is chosen', async () => {
      const { one, star } = await mount();
      expect(one('Save').props.disabled).toBe(true);
      await act(async () => one('Save').props.onPress());
      expect(saveItemRating).not.toHaveBeenCalled();

      await star(4);
      expect(one('Save').props.disabled).toBe(false);
    });

    it('starts on the star already chosen when there is no stored rating', async () => {
      const { one, text } = await mount({ initialOverall: 3 });
      expect(one('Save').props.disabled).toBe(false);
      expect(text()).toContain('Okay');
    });

    it('prefers the stored rating over initialOverall', async () => {
      const { text } = await mount({ initial: rating({ overall: 5 }), initialOverall: 2 });
      expect(text()).toContain('Excellent');
      expect(text()).not.toContain('Fair');
    });
  });

  describe('words for touch, wear and holding up', () => {
    const chip = (m: Awaited<ReturnType<typeof mount>>, label: string) => m.one(label);

    it('holds four words in a group at most and switches off the rest', async () => {
      const m = await mount();
      for (const label of ['Soft', 'Silky', 'Buttery', 'Smooth']) {
        await m.press(label);
      }
      expect(chip(m, 'Crisp').props.disabled).toBe(true);
      await m.press('Crisp');
      await m.star(4);
      await m.press('Save');
      expect(lastSave().touchTags).toEqual(['soft', 'silky', 'buttery', 'smooth']);
      expect(m.text()).toContain('Up to four');
    });

    it('frees a place when a chosen word is tapped again', async () => {
      const m = await mount();
      for (const label of ['Soft', 'Silky', 'Buttery', 'Smooth']) {
        await m.press(label);
      }
      await m.press('Silky');
      expect(chip(m, 'Crisp').props.disabled).toBe(false);
      await m.press('Crisp');
      await m.star(4);
      await m.press('Save');
      expect(lastSave().touchTags).toEqual(['soft', 'buttery', 'smooth', 'crisp']);
    });

    it('counts each group on its own', async () => {
      const m = await mount({ wearCount: 5 });
      for (const label of ['Soft', 'Silky', 'Buttery', 'Smooth']) {
        await m.press(label);
      }
      await m.press('Breathable');
      await m.press('Washes well');
      await m.star(4);
      await m.press('Save');
      expect(lastSave().comfortTags).toEqual(['breathable']);
      expect(lastSave().holdsUpTags).toEqual(['washes_well']);
    });

    it('sets and clears the optional scales with a second tap', async () => {
      const m = await mount();
      await m.press(scaleStepLabel('How it feels to touch', 4));
      await m.press(scaleStepLabel('How it wears', 2));
      await m.star(5);
      await m.press('Save');
      expect(lastSave()).toMatchObject({ touch: 4, comfort: 2 });

      await m.press(scaleStepLabel('How it feels to touch', 4));
      await m.press('Save');
      expect(lastSave()).toMatchObject({ touch: null, comfort: 2 });
    });

    it('labels the ends of each scale', async () => {
      const { text } = await mount({ wearCount: 5 });
      for (const end of ['Rough', 'Lovely to touch', 'Uncomfortable', 'Comfortable all day', 'Fell apart', 'Like new']) {
        expect(text()).toContain(end);
      }
    });
  });

  describe('how it is holding up', () => {
    it('is offered from three wears', async () => {
      expect((await mount({ wearCount: 2 })).text()).not.toContain('How it’s holding up');
      expect((await mount({ wearCount: 3 })).text()).toContain('How it’s holding up');
      expect((await mount({ wearCount: 12 })).text()).toContain('How it’s holding up');
    });

    it('is not offered, or sent, below three wears', async () => {
      const m = await mount({
        wearCount: 1,
        initial: rating({ holdsUp: 4, holdsUpTags: ['washes_well'] }),
      });
      expect(m.pressables('Washes well')).toHaveLength(0);
      await m.press('Save');
      expect(lastSave()).toMatchObject({ holdsUp: null, holdsUpTags: [] });
    });

    it('is sent once chosen', async () => {
      const m = await mount({ wearCount: 4 });
      await m.press(scaleStepLabel('How it’s holding up', 5));
      await m.press('Seams hold');
      await m.star(4);
      await m.press('Save');
      expect(lastSave()).toMatchObject({ holdsUp: 5, holdsUpTags: ['seams_hold'] });
    });
  });

  describe('fit and buying again', () => {
    it('shows the size of the piece beside the fit question', async () => {
      expect((await mount()).text()).toContain('Size M');
      expect((await mount({ item: { ...ITEM, size: undefined } })).text()).not.toContain('Size');
    });

    it('takes one fit answer and clears it on a second tap', async () => {
      const m = await mount();
      await m.press('Fit: Runs small');
      await m.press('Fit: True to size');
      await m.star(3);
      await m.press('Save');
      expect(lastSave().fit).toBe('true_to_size');

      await m.press('Fit: True to size');
      await m.press('Save');
      expect(lastSave().fit).toBeNull();
    });

    it('takes one answer to buying again and clears it on a second tap', async () => {
      const m = await mount();
      await m.press('Would buy again: Maybe');
      await m.star(3);
      await m.press('Save');
      expect(lastSave().wouldBuyAgain).toBe('maybe');

      await m.press('Would buy again: Maybe');
      await m.press('Save');
      expect(lastSave().wouldBuyAgain).toBeNull();
    });
  });

  describe('the private note', () => {
    it('is private, limited to 500 characters and counted', async () => {
      const m = await mount();
      expect(m.text()).toContain('Just for you. Never shown to anyone.');
      expect(m.note().props.maxLength).toBe(NOTE_MAX_LENGTH);
      expect(m.note().props.multiline).toBe(true);
      expect(m.note().props.accessibilityLabel).toBe('Private note');
      await act(async () => m.note().props.onChangeText('Runs warm'));
      expect(m.text()).toContain('9/500');
    });

    it('is sent trimmed, and as null when empty', async () => {
      const m = await mount({ initialOverall: 4 });
      await act(async () => m.note().props.onChangeText('  Good for travel  '));
      await m.press('Save');
      expect(lastSave().note).toBe('Good for travel');

      await act(async () => m.note().props.onChangeText('   '));
      await m.press('Save');
      expect(lastSave().note).toBeNull();
    });
  });

  describe('the brand insights row', () => {
    it('shows an on switch with its promise for a member who agreed, a brand and a worn piece', async () => {
      const m = await mount({ consentGranted: true, wearCount: 3 });
      const [sw] = m.switches(SHARE_LABEL);
      expect(sw.props.value).toBe(true);
      expect(sw.props.disabled).toBeFalsy();
      expect(m.text()).toContain(SHARE_ON_CAPTION);
      expect(m.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(0);

      await m.star(4);
      await m.press('Save');
      expect(lastSave().contribute).toBe(true);
    });

    it('sends false when the switch is turned off', async () => {
      const m = await mount({ consentGranted: true });
      await act(async () => m.switches(SHARE_LABEL)[0].props.onValueChange(false));
      expect(m.switches(SHARE_LABEL)[0].props.value).toBe(false);
      await m.star(4);
      await m.press('Save');
      expect(lastSave().contribute).toBe(false);
    });

    it('starts an existing private rating off, and an existing counting one on', async () => {
      const privateOne = await mount({ initial: rating({ contributed: false }) });
      expect(privateOne.switches(SHARE_LABEL)[0].props.value).toBe(false);
      await privateOne.press('Save');
      expect(lastSave().contribute).toBe(false);

      const counting = await mount({ initial: rating({ contributed: true }) });
      expect(counting.switches(SHARE_LABEL)[0].props.value).toBe(true);
      await counting.press('Save');
      expect(lastSave().contribute).toBe(true);
    });

    it('offers "Add to brand insights..." to a member who has not agreed, and sends false until they do', async () => {
      const m = await mount({ consentGranted: false });
      expect(m.switches(SHARE_LABEL)).toHaveLength(0);
      expect(m.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(1);
      await m.star(4);
      await m.press('Save');
      expect(lastSave().contribute).toBe(false);
    });

    it('opens the agreement from that row and turns into an on switch after a yes', async () => {
      const onRequestConsent = jest.fn(async () => true);
      const m = await mount({ consentGranted: false, onRequestConsent });
      await m.press(ADD_TO_INSIGHTS_LABEL);
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
      expect(m.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(0);
      expect(m.switches(SHARE_LABEL)[0].props.value).toBe(true);
      await m.star(4);
      await m.press('Save');
      expect(lastSave().contribute).toBe(true);
    });

    it('stays as it was after a no, and when the agreement cannot be asked', async () => {
      const declined = await mount({ consentGranted: false, onRequestConsent: jest.fn(async () => false) });
      await declined.press(ADD_TO_INSIGHTS_LABEL);
      expect(declined.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(1);

      const broken = await mount({
        consentGranted: false,
        onRequestConsent: jest.fn(async () => {
          throw new Error('offline');
        }),
      });
      await broken.press(ADD_TO_INSIGHTS_LABEL);
      expect(broken.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('treats an agreement to older wording like no agreement: the same row is offered again', async () => {
      // useRatingConsent reports granted false when needsReconsent is true, so the sheet sees false.
      const m = await mount({ consentGranted: false, initial: rating({ contributed: true }) });
      expect(m.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(1);
      expect(m.switches(SHARE_LABEL)).toHaveLength(0);
    });

    it('disables the switch for a piece with no brand', async () => {
      for (const brand of [undefined, '', '   ']) {
        const m = await mount({ item: { ...ITEM, brand }, consentGranted: true, initial: rating({ contributed: true }) });
        const [sw] = m.switches(SHARE_LABEL);
        expect(sw.props.disabled).toBe(true);
        expect(sw.props.value).toBe(false);
        expect(m.text()).toContain(SHARE_DISABLED_CAPTION);
        await m.press('Save');
        expect(lastSave().contribute).toBe(false);
      }
    });

    it('disables the switch for a piece that has never been worn', async () => {
      const m = await mount({ wearCount: 0, consentGranted: true });
      expect(m.switches(SHARE_LABEL)[0].props.disabled).toBe(true);
      expect(m.text()).toContain(SHARE_DISABLED_CAPTION);
      await m.star(4);
      await m.press('Save');
      expect(lastSave().contribute).toBe(false);
    });

    it('explains the limit before offering the agreement for a piece that cannot count yet', async () => {
      const m = await mount({ wearCount: 0, consentGranted: false });
      expect(m.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(0);
      expect(m.switches(SHARE_LABEL)[0].props.disabled).toBe(true);
    });

    it('shows no row while the answer is not known, and repeats what is stored', async () => {
      const fresh = await mount({ consentGranted: null });
      expect(fresh.switches(SHARE_LABEL)).toHaveLength(0);
      expect(fresh.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(0);
      await fresh.star(4);
      await fresh.press('Save');
      expect(lastSave().contribute).toBe(false);

      const counting = await mount({ consentGranted: null, initial: rating({ contributed: true }) });
      await counting.press('Save');
      expect(lastSave().contribute).toBe(true);
    });

    it('shows no row while brand insights are off, and repeats what is stored', async () => {
      mockInsightsOn = false;
      const fresh = await mount({ consentGranted: true });
      expect(fresh.switches(SHARE_LABEL)).toHaveLength(0);
      expect(fresh.pressables(ADD_TO_INSIGHTS_LABEL)).toHaveLength(0);
      expect(fresh.text()).not.toContain('insights');
      await fresh.star(4);
      await fresh.press('Save');
      expect(lastSave().contribute).toBe(false);

      const counting = await mount({ consentGranted: true, initial: rating({ contributed: true }) });
      await counting.press('Save');
      expect(lastSave().contribute).toBe(true);
    });
  });

  describe('saving', () => {
    it('sends every field it has and an explicit contribute, never createOnly', async () => {
      const m = await mount({ wearCount: 6 });
      await m.star(5);
      await m.press(scaleStepLabel('How it feels to touch', 5));
      await m.press('Soft');
      await m.press(scaleStepLabel('How it wears', 4));
      await m.press('Breathable');
      await m.press(scaleStepLabel('How it’s holding up', 3));
      await m.press('Keeps shape');
      await m.press('Fit: Runs large');
      await m.press('Would buy again: Yes');
      await act(async () => m.note().props.onChangeText('Nice'));
      await m.press('Save');

      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating).toHaveBeenCalledWith('item-1', {
        overall: 5,
        touch: 5,
        touchTags: ['soft'],
        comfort: 4,
        comfortTags: ['breathable'],
        holdsUp: 3,
        holdsUpTags: ['keeps_shape'],
        fit: 'runs_large',
        wouldBuyAgain: 'yes',
        note: 'Nice',
        contribute: true,
      });
      expect(lastSave()).not.toHaveProperty('createOnly');
    });

    it('sends empty answers as null and empty lists, not as missing', async () => {
      const m = await mount({ consentGranted: false });
      await m.star(2);
      await m.press('Save');
      const input = lastSave();
      expect(Object.keys(input).sort()).toEqual(
        [
          'comfort',
          'comfortTags',
          'contribute',
          'fit',
          'holdsUp',
          'holdsUpTags',
          'note',
          'overall',
          'touch',
          'touchTags',
          'wouldBuyAgain',
        ].sort(),
      );
      expect(input).toMatchObject({
        overall: 2,
        touch: null,
        touchTags: [],
        comfort: null,
        comfortTags: [],
        holdsUp: null,
        holdsUpTags: [],
        fit: null,
        wouldBuyAgain: null,
        note: null,
        contribute: false,
      });
      expect(typeof input.contribute).toBe('boolean');
    });

    it('opens an edit with every stored value filled in and sends them back unchanged', async () => {
      const stored = rating({
        overall: 4,
        touch: 4,
        touchTags: ['soft', 'smooth'],
        comfort: 3,
        comfortTags: ['cozy'],
        holdsUp: 5,
        holdsUpTags: ['color_stays'],
        fit: 'true_to_size',
        wouldBuyAgain: 'yes',
        note: 'Keeper',
        contributed: true,
      });
      const m = await mount({ initial: stored, wearCount: 8 });
      expect(m.note().props.value).toBe('Keeper');
      await m.press('Save');
      expect(saveItemRating).toHaveBeenCalledWith('item-1', {
        overall: 4,
        touch: 4,
        touchTags: ['soft', 'smooth'],
        comfort: 3,
        comfortTags: ['cozy'],
        holdsUp: 5,
        holdsUpTags: ['color_stays'],
        fit: 'true_to_size',
        wouldBuyAgain: 'yes',
        note: 'Keeper',
        contribute: true,
      });
    });

    it('reports the result and closes when the rating was saved as asked', async () => {
      const result = { contributed: true, blocked: null, updatedAt: '2026-10-13T00:00:00Z' };
      saveItemRating.mockResolvedValue(result);
      const m = await mount();
      await m.star(4);
      await m.press('Save');
      expect(m.props.onSaved).toHaveBeenCalledWith(result);
      expect(m.props.onClose).toHaveBeenCalledTimes(1);
      expect(m.text()).not.toContain('Saved privately');
    });

    it('ignores a second tap while saving and blocks closing', async () => {
      let finish!: (value: unknown) => void;
      saveItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const m = await mount({ initialOverall: 3 });
      await act(async () => {
        m.one('Save').props.onPress();
      });
      await act(async () => {
        m.one('Save').props.onPress();
      });
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(m.text()).toContain('Saving…');
      expect(m.one('Cancel').props.disabled).toBe(true);
      act(() => m.tree.root.findByType(Modal).props.onRequestClose());
      expect(m.props.onClose).not.toHaveBeenCalled();

      await act(async () => finish({ contributed: false, blocked: null, updatedAt: '' }));
      expect(m.props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the server cannot count the rating', () => {
    const cases: Array<[ContributionBlocked, string]> = [
      ['not_worn', 'Saved privately. Brand insights count worn pieces that have a brand.'],
      ['no_brand', 'Saved privately. Brand insights count worn pieces that have a brand.'],
      ['no_consent', 'Saved privately. Agree to brand insights first to add it.'],
    ];

    it.each(cases)('says so for %s, keeps the sheet open and offers Done', async (blocked, line) => {
      expect(BLOCKED_LINES[blocked]).toBe(line);
      saveItemRating.mockResolvedValue({ contributed: false, blocked, updatedAt: '2026-10-13T00:00:00Z' });
      const m = await mount();
      await m.star(4);
      await m.press('Save');

      expect(m.text()).toContain(line);
      expect(m.props.onSaved).toHaveBeenCalledWith({ contributed: false, blocked, updatedAt: '2026-10-13T00:00:00Z' });
      expect(m.props.onClose).not.toHaveBeenCalled();
      // The rating is saved, so there is nothing left to save, cancel or remove.
      expect(m.pressables('Save')).toHaveLength(0);
      expect(m.pressables('Cancel')).toHaveLength(0);
      expect(m.pressables('Remove rating')).toHaveLength(0);

      await m.press('Done');
      expect(m.props.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not show the line for a save that went through', async () => {
      const m = await mount();
      await m.star(4);
      await m.press('Save');
      expect(m.text()).not.toContain('Saved privately');
    });
  });

  describe('when saving fails', () => {
    it('shows the reason, keeps everything typed and lets the person try again', async () => {
      saveItemRating.mockRejectedValueOnce(new Error('You’ve rated a lot today. Please come back tomorrow.'));
      const m = await mount({ wearCount: 5 });
      await m.star(3);
      await m.press('Soft');
      await m.press('Fit: Runs small');
      await act(async () => m.note().props.onChangeText('Still here'));
      await m.press('Save');

      expect(m.text()).toContain('You’ve rated a lot today. Please come back tomorrow.');
      expect(m.props.onClose).not.toHaveBeenCalled();
      expect(m.props.onSaved).not.toHaveBeenCalled();
      expect(m.note().props.value).toBe('Still here');
      expect(m.one('Soft').props.accessibilityState.selected).toBe(true);
      expect(m.one('Fit: Runs small').props.accessibilityState.selected).toBe(true);
      expect(m.one('Save').props.disabled).toBe(false);

      await m.press('Save');
      expect(saveItemRating).toHaveBeenCalledTimes(2);
      expect(m.props.onClose).toHaveBeenCalledTimes(1);
      expect(m.text()).not.toContain('rated a lot');
    });

    it('falls back to a plain sentence when the failure carries no message', async () => {
      saveItemRating.mockRejectedValueOnce('boom');
      const m = await mount({ initialOverall: 3 });
      await m.press('Save');
      expect(m.text()).toContain('Couldn’t save your rating. Check your connection and try again.');
    });
  });

  describe('removing the rating', () => {
    it('is offered only for a rating that exists', async () => {
      expect((await mount({ initial: null })).pressables('Remove rating')).toHaveLength(0);
      expect((await mount({ initial: rating() })).pressables('Remove rating')).toHaveLength(1);
    });

    it('asks first, and does nothing if the person backs out', async () => {
      const m = await mount({ initial: rating() });
      await m.press('Remove rating');
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Remove your rating?');
      expect(title).toBe(REMOVE_TITLE);
      expect(message).toBe('This deletes your rating of this item.');
      expect(message).toBe(REMOVE_MESSAGE);
      expect((buttons as Array<{ text: string }>).map(b => b.text)).toEqual(['Cancel', 'Remove rating']);
      expect(deleteItemRating).not.toHaveBeenCalled();
      expect(m.props.onRemoved).not.toHaveBeenCalled();
    });

    it('deletes, reports and closes once confirmed', async () => {
      const m = await mount({ initial: rating() });
      await m.press('Remove rating');
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; style?: string; onPress?: () => unknown }>;
      const confirm = buttons.find(b => b.text === 'Remove rating')!;
      expect(confirm.style).toBe('destructive');
      await act(async () => {
        await confirm.onPress?.();
      });
      expect(deleteItemRating).toHaveBeenCalledWith('item-1');
      expect(m.props.onRemoved).toHaveBeenCalledTimes(1);
      expect(m.props.onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the sheet and says what happened when the removal fails', async () => {
      deleteItemRating.mockRejectedValueOnce(new Error('Couldn’t remove that. Check your connection and try again.'));
      const m = await mount({ initial: rating() });
      await m.press('Remove rating');
      const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => unknown }>;
      await act(async () => {
        await buttons.find(b => b.text === 'Remove rating')!.onPress?.();
      });
      expect(m.text()).toContain('Couldn’t remove that.');
      expect(m.props.onRemoved).not.toHaveBeenCalled();
      expect(m.props.onClose).not.toHaveBeenCalled();
      expect(m.pressables('Remove rating')).toHaveLength(1);
    });
  });

  describe('keyboard', () => {
    it('has exactly one text field, the note, pointed at its own bar', async () => {
      const { tree, note } = await mount();
      expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
      expect(note().props.multiline).toBe(true);
      expect(note().props.inputAccessoryViewID).toBe(RATE_NOTE_ACCESSORY_ID);
      expect(RATE_NOTE_ACCESSORY_ID).toBe('smartcloset-rate-note-done');
      expect(note().props.inputAccessoryViewID).not.toBe(KEYBOARD_DONE_ID);
    });

    it('renders exactly one accessory view, with the note’s id and not the shared one', async () => {
      const { tree, note } = await mount();
      const bars = tree.root.findAllByType(InputAccessoryView);
      expect(bars).toHaveLength(1);
      expect(bars[0].props.nativeID).toBe(note().props.inputAccessoryViewID);
      expect(bars[0].props.nativeID).toBe(RATE_NOTE_ACCESSORY_ID);
      expect(bars[0].props.nativeID).not.toBe(KEYBOARD_DONE_ID);
    });

    it('closes the keyboard from its Done bar', async () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
      const { tree } = await mount();
      const bar = tree.root.findByType(InputAccessoryView);
      const done = bar.findAllByType(Pressable).concat(bar.findAll(n => typeof n.props.onPress === 'function'))[0];
      expect(done.props.accessibilityLabel).toBe('Done');
      act(() => done.props.onPress());
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('lifts the note with the keyboard through a plain scroll view', async () => {
      const { note } = await mount();
      const above: ReactTestInstance[] = [];
      for (let n = note().parent; n; n = n.parent) {
        above.push(n);
      }
      const lifter = above.find(a => a.type === KeyboardAvoidingView);
      expect(lifter?.props.behavior).toBe('padding');
      const scroll = above.find(a => a.type === ScrollView);
      expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
      expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBeFalsy();
    });

    describe('under a page sheet', () => {
      // The sheet starts below the top of the screen but the keyboard is measured from the top of it, so the
      // lifter is told how far down the sheet sits. Jest never lays anything out, so each test sends the layout.
      const SHEET_TOP = 55;
      const windowHeight = () => Dimensions.get('window').height;
      const lifter = (tree: renderer.ReactTestRenderer) => tree.root.findByType(KeyboardAvoidingView);
      const layOut = (tree: renderer.ReactTestRenderer, height: number) =>
        act(() => {
          lifter(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
        });

      it('starts with no offset, before the sheet has been laid out', async () => {
        const { tree } = await mount();
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(0);
      });

      it('offsets the keyboard by the gap above the sheet', async () => {
        const { tree } = await mount();
        layOut(tree, windowHeight() - SHEET_TOP);
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(SHEET_TOP);
        expect(lifter(tree).props.behavior).toBe('padding');
      });

      it('corrects itself when the first layout was the whole screen', async () => {
        const { tree } = await mount();
        layOut(tree, windowHeight());
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(0);
        layOut(tree, windowHeight() - 30);
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(30);
      });

      it('never goes below zero and rounds to whole points', async () => {
        const { tree } = await mount();
        layOut(tree, windowHeight() + 20);
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(0);
        layOut(tree, windowHeight() - 54.6);
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(55);
      });

      it('keeps no offset on Android, which lifts the window itself', async () => {
        const original = Platform.OS;
        try {
          (Platform as { OS: string }).OS = 'android';
          const { tree } = await mount();
          layOut(tree, windowHeight() - SHEET_TOP);
          expect(lifter(tree).props.keyboardVerticalOffset).toBe(0);
        } finally {
          (Platform as { OS: string }).OS = original;
        }
      });

      it('keeps no offset on an iPad, where the sheet floats instead of reaching the bottom', async () => {
        jest.spyOn(Platform as { isPad: boolean }, 'isPad', 'get').mockReturnValue(true);
        const { tree } = await mount();
        layOut(tree, windowHeight() - SHEET_TOP);
        expect(lifter(tree).props.keyboardVerticalOffset).toBe(0);
      });

      it('keeps the note, its buttons and its bar in the one lifted view', async () => {
        const { tree, note, one } = await mount();
        layOut(tree, windowHeight() - SHEET_TOP);
        const box = lifter(tree);
        expect(box.findAll(n => n === note())).toHaveLength(1);
        expect(box.findAll(n => n === one('Save'))).toHaveLength(1);
        expect(box.findAll(n => n === one('Cancel'))).toHaveLength(1);
        expect(box.findAllByType(InputAccessoryView)).toHaveLength(1);
      });
    });

    it('keeps its Save and Cancel buttons outside the scroll view, in reach with the keyboard up', async () => {
      const { tree, one } = await mount();
      const scroll = tree.root.findByType(ScrollView);
      expect(scroll.findAll(n => n === one('Save'))).toHaveLength(0);
      expect(scroll.findAll(n => n === one('Cancel'))).toHaveLength(0);
    });

    it('follows the file rules: one action bar, none of the shared bar, no shared id', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/RateItemSheet.tsx'), 'utf8');
      expect(source.match(/<KeyboardActionBar\b/g)).toHaveLength(1);
      expect(source).toMatch(/<KeyboardActionBar nativeID=\{RATE_NOTE_ACCESSORY_ID\} label="Done"/);
      expect(source).not.toMatch(/<KeyboardDoneBar/);
      expect(source).not.toContain('keyboardDoneProps');
      expect(source).not.toContain('KEYBOARD_DONE_ID');
      expect(source).not.toContain('automaticallyAdjustKeyboardInsets');
      expect(source.match(/<TextInput\b/g)).toHaveLength(1);
    });
  });

  describe('nested sheets', () => {
    it('renders the consent sheet it is handed inside its own modal', async () => {
      const { tree } = await mount({ consentSheet: <View accessibilityLabel="consent sheet" /> });
      const inside = tree.root.findAll(n => n.props.accessibilityLabel === 'consent sheet');
      expect(inside.length).toBeGreaterThan(0);
      const modal = tree.root.findByType(Modal);
      expect(modal.findAll(n => n.props.accessibilityLabel === 'consent sheet').length).toBeGreaterThan(0);
    });

    it('renders nothing extra while closed', async () => {
      const { tree } = await mount({ visible: false, consentSheet: <View accessibilityLabel="consent sheet" /> });
      expect(tree.root.findAll(n => n.props.accessibilityLabel === 'consent sheet')).toHaveLength(0);
    });
  });

  describe('words on screen', () => {
    it('never starts with "From " or uses the strings the Add Item tests forbid', async () => {
      for (const over of [
        {},
        { initial: rating({ contributed: true, note: 'x' }), wearCount: 10 },
        { consentGranted: false },
        { wearCount: 0 },
      ] as Array<Partial<RateItemSheetProps>>) {
        const { tree } = await mount(over);
        const strings = tree.root
          .findAllByType(Text)
          .map(t => flatten(t.props.children).trim())
          .filter(Boolean);
        expect(strings.length).toBeGreaterThan(10);
        for (const s of strings) {
          expect(s.startsWith('From ')).toBe(false);
          expect(s).not.toContain('Brand:');
          expect(s).not.toContain('Color: ');
          expect(s).not.toContain('Material: ');
        }
      }
    });

    it('labels every button, switch and field', async () => {
      const { tree } = await mount({ wearCount: 5, initial: rating({ contributed: true }) });
      for (const node of [...tree.root.findAllByType(Pressable), ...tree.root.findAllByType(Switch), ...tree.root.findAllByType(TextInput)]) {
        expect(typeof node.props.accessibilityLabel).toBe('string');
        expect(node.props.accessibilityLabel.length).toBeGreaterThan(0);
      }
    });

    it('uses typographic apostrophes', async () => {
      const m = await mount({ wearCount: 5 });
      expect(m.text()).toContain('How it’s holding up');
      expect(m.text()).not.toContain("How it's holding up");
    });
  });
});
