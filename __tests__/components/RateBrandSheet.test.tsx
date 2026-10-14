/**
 * The brand rating sheet (documentation/design/quality-ratings.md, 3.4 and 6.2): four scales with only Overall
 * required, the contribution row in each of its states, one rating per brand that can be changed or removed,
 * and a save that is never refused because of the request to count. RatingScale belongs to another stream and is
 * replaced here by a stand-in that exposes the documented props.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Modal, Platform, Switch, TextInput } from 'react-native';

let mockRatingsOn = true;
jest.mock('../../src/config/ratingFlags', () => ({
  get RATINGS_ENABLED() {
    return mockRatingsOn;
  },
  get BRAND_INSIGHTS_ENABLED() {
    return mockRatingsOn;
  },
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => mockRatingsOn,
  brandInsightsActive: () => mockRatingsOn,
  tagScanActive: () => false,
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../../src/services/ratingService', () => ({
  saveBrandRating: jest.fn(),
  deleteBrandRating: jest.fn(),
}));

// A stand-in with the documented props: the host element carries them so a test can read and call them.
jest.mock(
  '../../src/components/RatingScale',
  () => {
    const mockReact = require('react');
    return {
      __esModule: true,
      default: (props: Record<string, unknown>) => mockReact.createElement('MockRatingScale', props),
    };
  },
);

import RateBrandSheet, { blockedLine } from '../../src/components/RateBrandSheet';
import { BRAND_SCALE_ENDS } from '../../src/config/ratingVocabulary';
import * as ratingService from '../../src/services/ratingService';
import type { BrandRating } from '../../src/types/rating';

const saveBrandRating = ratingService.saveBrandRating as jest.Mock;
const deleteBrandRating = ratingService.deleteBrandRating as jest.Mock;

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

const stored = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Zara',
  overall: 4,
  quality: 3,
  fitConsistency: null,
  value: 5,
  contributed: false,
  updatedAt: '2026-10-14T10:00:00Z',
  ...over,
});

type SheetProps = React.ComponentProps<typeof RateBrandSheet>;

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
const realOS = Platform.OS;

beforeEach(() => {
  mockRatingsOn = true;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  saveBrandRating.mockReset().mockResolvedValue({ contributed: false, blocked: null });
  deleteBrandRating.mockReset().mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = realOS;
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  alertSpy.mockRestore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const mount = async (over: Partial<SheetProps> = {}) => {
  const props: SheetProps = {
    visible: true,
    brand: 'Zara',
    initial: null,
    consentGranted: true,
    onRequestConsent: jest.fn().mockResolvedValue(true),
    onClose: jest.fn(),
    onSaved: jest.fn(),
    onRemoved: jest.fn(),
    ...over,
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<RateBrandSheet {...props} />);
  });
  const rerender = async (next: Partial<SheetProps>) => {
    Object.assign(props, next);
    await act(async () => {
      tree.update(<RateBrandSheet {...props} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const modal = () => tree.root.findByType(Modal);
  const scale = (label: string) => {
    const found = tree.root.findAll(n => (n.type as unknown) === 'MockRatingScale' && n.props.accessibilityLabel === label);
    if (found.length !== 1) {
      throw new Error(`expected one scale labelled ${label}, found ${found.length}`);
    }
    return found[0];
  };
  const button = (label: string) => {
    const found = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    if (found.length === 0) {
      throw new Error(`no button labelled ${label}`);
    }
    return found[0];
  };
  const hasButton = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    await act(async () => {
      button(label).props.onPress();
    });
  };
  const choose = async (label: string, value: number | null) => {
    await act(async () => {
      if (value === null) {
        scale(label).props.onClear();
      } else {
        scale(label).props.onChange(value);
      }
    });
  };
  const switches = () => tree.root.findAllByType(Switch);
  return { tree, props, rerender, text, modal, scale, button, hasButton, press, choose, switches };
};

describe('blockedLine', () => {
  it('says why a request to count was kept private', () => {
    expect(blockedLine('not_worn')).toBe('Saved privately. Brand insights count brands you have worn something from.');
    expect(blockedLine('no_brand')).toBe('Saved privately. Brand insights count brands you have worn something from.');
    expect(blockedLine('no_consent')).toBe('Saved privately. Agree to brand insights first to add it.');
  });

  it('has nothing to say when nothing was blocked', () => {
    expect(blockedLine(null)).toBeNull();
    expect(blockedLine(undefined)).toBeNull();
  });
});

describe('RateBrandSheet', () => {
  describe('with ratings off', () => {
    it('renders null and touches neither the session, the network, the service nor the console', async () => {
      mockRatingsOn = false;
      const { tree } = await mount();
      expect(tree.toJSON()).toBeNull();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(saveBrandRating).not.toHaveBeenCalled();
      expect(deleteBrandRating).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('when closed', () => {
    it('hands the modal an explicit visible={false} and shows nothing', async () => {
      const { tree, modal } = await mount({ visible: false });
      expect(modal().props.visible).toBe(false);
      expect(tree.toJSON()).toBeNull();
    });
  });

  describe('the form', () => {
    it('is a page sheet titled with the brand', async () => {
      const { modal, text } = await mount({ brand: '  Zara ' });
      expect(modal().props.visible).toBe(true);
      expect(modal().props.presentationStyle).toBe('pageSheet');
      expect(text()).toContain('Rate Zara');
    });

    it('has four scales as five dots with their end labels', async () => {
      const { scale, text } = await mount();
      const overall = scale('Overall rating');
      const quality = scale('Quality');
      const sizes = scale('Size consistency');
      const value = scale('Value');
      for (const found of [overall, quality, sizes, value]) {
        expect(found.props.variant).toBe('dots');
        expect(found.props.value).toBeNull();
      }
      expect(overall.props.endLabels).toEqual(BRAND_SCALE_ENDS.overall);
      expect(quality.props.endLabels).toEqual(BRAND_SCALE_ENDS.quality);
      expect(sizes.props.endLabels).toEqual(BRAND_SCALE_ENDS.fitConsistency);
      expect(value.props.endLabels).toEqual(BRAND_SCALE_ENDS.value);
      const shown = text();
      for (const title of ['Overall', 'Quality', 'Size consistency', 'Value']) {
        expect(shown).toContain(title);
      }
    });

    it('lets the three optional scales be cleared and not the overall one', async () => {
      const { scale } = await mount();
      expect(scale('Overall rating').props.allowClear).toBeFalsy();
      expect(scale('Overall rating').props.onClear).toBeUndefined();
      for (const label of ['Quality', 'Size consistency', 'Value']) {
        expect(scale(label).props.allowClear).toBe(true);
        expect(typeof scale(label).props.onClear).toBe('function');
      }
    });

    it('has no text field', async () => {
      const { tree } = await mount();
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('keeps Save off until Overall has an answer', async () => {
      const { button, press, choose } = await mount();
      expect(button('Save').props.disabled).toBe(true);
      await press('Save');
      expect(saveBrandRating).not.toHaveBeenCalled();
      await choose('Quality', 4);
      expect(button('Save').props.disabled).toBe(true);
      await choose('Overall rating', 3);
      expect(button('Save').props.disabled).toBe(false);
    });

    it('allows Save at once for a stored rating, which already has its overall answer', async () => {
      const { button } = await mount({ initial: stored(), consentGranted: null });
      expect(button('Save').props.disabled).toBe(false);
    });

    it('has no Remove button for a first rating', async () => {
      const { hasButton } = await mount();
      expect(hasButton('Remove rating')).toBe(false);
    });
  });

  describe('saving', () => {
    it('sends every answer, with the switch on by default, and reports the outcome', async () => {
      saveBrandRating.mockResolvedValue({ contributed: true, blocked: null });
      const { props, press, choose } = await mount();
      await choose('Overall rating', 4);
      await choose('Quality', 3);
      await choose('Size consistency', 2);
      await choose('Value', 5);
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledTimes(1);
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', {
        overall: 4,
        quality: 3,
        fitConsistency: 2,
        value: 5,
        contribute: true,
      });
      expect(props.onSaved).toHaveBeenCalledWith({ contributed: true, blocked: null });
    });

    it('sends nothing for the scales left alone', async () => {
      const { choose, press } = await mount({ consentGranted: null });
      await choose('Overall rating', 2);
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', { overall: 2, quality: null, fitConsistency: null, value: null });
    });

    it('saves the brand by name without stray spaces, and reports a request that could not count', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'not_worn' });
      const { props, press, choose } = await mount({ brand: '  Mango ' });
      await choose('Overall rating', 5);
      await press('Save');
      expect(saveBrandRating.mock.calls[0][0]).toBe('Mango');
      expect(props.onSaved).toHaveBeenCalledWith({ contributed: false, blocked: 'not_worn' });
    });

    it('passes the no-agreement outcome on as well', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'no_consent' });
      const { props, press, choose } = await mount();
      await choose('Overall rating', 5);
      await press('Save');
      expect(props.onSaved).toHaveBeenCalledWith({ contributed: false, blocked: 'no_consent' });
    });

    it('sends the answers as they were changed, including a changed mind', async () => {
      const { choose, press } = await mount({ consentGranted: null });
      await choose('Overall rating', 2);
      await choose('Overall rating', 4);
      await choose('Quality', 5);
      await choose('Quality', 1);
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', { overall: 4, quality: 1, fitConsistency: null, value: null });
    });

    it('clears an optional scale when its value is chosen again', async () => {
      const { choose, press, scale } = await mount({ consentGranted: null });
      await choose('Overall rating', 4);
      await choose('Value', 3);
      expect(scale('Value').props.value).toBe(3);
      await choose('Value', 3);
      expect(scale('Value').props.value).toBeNull();
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', { overall: 4, quality: null, fitConsistency: null, value: null });
    });

    it('clears an optional scale through onClear', async () => {
      const { choose, press, scale } = await mount({ consentGranted: null });
      await choose('Overall rating', 4);
      await choose('Quality', 3);
      await choose('Quality', null);
      expect(scale('Quality').props.value).toBeNull();
      await press('Save');
      expect(saveBrandRating.mock.calls[0][1].quality).toBeNull();
    });

    it('saves once when Save is pressed twice', async () => {
      let finish!: (value: unknown) => void;
      saveBrandRating.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { choose, press, props, button } = await mount();
      await choose('Overall rating', 4);
      await press('Save');
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledTimes(1);
      expect(button('Save').props.loading).toBe(true);
      await act(async () => {
        finish({ contributed: false, blocked: null });
      });
      expect(props.onSaved).toHaveBeenCalledTimes(1);
    });

    it('locks the scales and Cancel while the save is on its way', async () => {
      let finish!: (value: unknown) => void;
      saveBrandRating.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { choose, press, props, button, scale, modal } = await mount();
      await choose('Overall rating', 4);
      await press('Save');
      expect(scale('Overall rating').props.onChange).toBeUndefined();
      expect(button('Cancel').props.disabled).toBe(true);
      await act(async () => {
        modal().props.onRequestClose();
      });
      expect(props.onClose).not.toHaveBeenCalled();
      await act(async () => {
        finish({ contributed: false, blocked: null });
      });
      expect(scale('Overall rating').props.onChange).toBeDefined();
    });

    it('shows the reason inline and keeps the form when the save fails', async () => {
      saveBrandRating.mockRejectedValue(new Error('You can rate a brand once you own something from it.'));
      const { choose, press, props, text, scale, button } = await mount();
      await choose('Overall rating', 4);
      await choose('Value', 2);
      await press('Save');
      expect(text()).toContain('You can rate a brand once you own something from it.');
      expect(props.onSaved).not.toHaveBeenCalled();
      expect(scale('Overall rating').props.value).toBe(4);
      expect(scale('Value').props.value).toBe(2);
      expect(button('Save').props.disabled).toBe(false);
      expect(button('Save').props.loading).toBe(false);
    });

    it('uses its own words when the failure has none', async () => {
      saveBrandRating.mockRejectedValue('nothing readable');
      const { choose, press, text } = await mount();
      await choose('Overall rating', 4);
      await press('Save');
      expect(text()).toContain('Couldn’t save your rating. Check your connection and try again.');
    });

    it('clears the error on the next try', async () => {
      saveBrandRating.mockRejectedValueOnce(new Error('Try later')).mockResolvedValue({ contributed: false, blocked: null });
      const { choose, press, text, props } = await mount();
      await choose('Overall rating', 4);
      await press('Save');
      expect(text()).toContain('Try later');
      await press('Save');
      expect(text()).not.toContain('Try later');
      expect(props.onSaved).toHaveBeenCalledTimes(1);
    });

    it('does not blame the save for a host callback that throws', async () => {
      const onSaved = jest.fn(() => {
        throw new Error('host bug');
      });
      const { choose, press, text } = await mount({ onSaved });
      await choose('Overall rating', 4);
      await press('Save');
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(text()).not.toContain('Couldn’t save');
    });

    it('does not report a save that finishes after it was unmounted', async () => {
      let finish!: (value: unknown) => void;
      saveBrandRating.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { choose, press, props, tree } = await mount();
      await choose('Overall rating', 4);
      await press('Save');
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        finish({ contributed: false, blocked: null });
      });
      expect(props.onSaved).not.toHaveBeenCalled();
    });
  });

  describe('Cancel', () => {
    it('closes without saving', async () => {
      const { choose, press, props } = await mount();
      await choose('Overall rating', 4);
      await press('Cancel');
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(saveBrandRating).not.toHaveBeenCalled();
    });

    it('closes from the system back gesture as well', async () => {
      const { modal, props } = await mount();
      await act(async () => {
        modal().props.onRequestClose();
      });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('a rating that already exists', () => {
    it('opens with the stored answers', async () => {
      const { scale } = await mount({ initial: stored(), consentGranted: null });
      expect(scale('Overall rating').props.value).toBe(4);
      expect(scale('Quality').props.value).toBe(3);
      expect(scale('Size consistency').props.value).toBeNull();
      expect(scale('Value').props.value).toBe(5);
    });

    it('saves a full replace of what is on the sheet', async () => {
      const { choose, press } = await mount({ initial: stored(), consentGranted: null });
      await choose('Size consistency', 1);
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', { overall: 4, quality: 3, fitConsistency: 1, value: 5 });
    });

    it('starts from the stored values at every opening, not from earlier edits', async () => {
      const { choose, rerender, scale } = await mount({ initial: stored(), consentGranted: null });
      await choose('Overall rating', 1);
      await choose('Quality', null);
      await rerender({ visible: false });
      await rerender({ visible: true });
      expect(scale('Overall rating').props.value).toBe(4);
      expect(scale('Quality').props.value).toBe(3);
    });

    it('starts empty again for a first rating of the next brand', async () => {
      const { choose, rerender, scale } = await mount({ initial: null, consentGranted: null });
      await choose('Overall rating', 5);
      await rerender({ visible: false });
      await rerender({ visible: true, brand: 'Mango' });
      expect(scale('Overall rating').props.value).toBeNull();
    });

    it('keeps edits when the stored rating is reloaded behind an open sheet', async () => {
      const { choose, rerender, scale } = await mount({ initial: stored(), consentGranted: null });
      await choose('Overall rating', 2);
      await rerender({ initial: stored({ overall: 5 }) });
      expect(scale('Overall rating').props.value).toBe(2);
    });

    it('removes it after a confirmation', async () => {
      const { press, props } = await mount({ initial: stored(), brand: ' Zara ' });
      await press('Remove rating');
      expect(deleteBrandRating).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe('Remove your rating?');
      expect(message).toBe('This deletes your rating of Zara.');
      expect(buttons.map((b: any) => b.text)).toEqual(['Cancel', 'Remove']);
      await act(async () => {
        buttons[1].onPress();
      });
      expect(deleteBrandRating).toHaveBeenCalledWith('Zara');
      expect(props.onRemoved).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const { press, props } = await mount({ initial: stored() });
      await press('Remove rating');
      const buttons = alertSpy.mock.calls[0][2];
      expect(buttons[0].style).toBe('cancel');
      expect(buttons[0].onPress).toBeUndefined();
      expect(deleteBrandRating).not.toHaveBeenCalled();
      expect(props.onRemoved).not.toHaveBeenCalled();
    });

    it('shows why a removal failed and stays open', async () => {
      deleteBrandRating.mockRejectedValue(new Error('Couldn’t remove that. Check your connection and try again.'));
      const { press, props, text } = await mount({ initial: stored() });
      await press('Remove rating');
      await act(async () => {
        alertSpy.mock.calls[0][2][1].onPress();
      });
      expect(text()).toContain('Couldn’t remove that. Check your connection and try again.');
      expect(props.onRemoved).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  describe('the contribution row', () => {
    it('is a switch, on for a new rating, once the person has agreed', async () => {
      const { switches, text } = await mount({ consentGranted: true });
      expect(switches()).toHaveLength(1);
      expect(switches()[0].props.value).toBe(true);
      expect(switches()[0].props.disabled).toBe(false);
      expect(switches()[0].props.accessibilityLabel).toBe('Count toward brand insights');
      expect(text()).toContain('Count toward brand insights');
      expect(text()).toContain('Shared without your name, photos or notes.');
    });

    it('sends false when the person turns it off, and true when they leave it on', async () => {
      const first = await mount({ consentGranted: true });
      await first.choose('Overall rating', 3);
      await act(async () => {
        first.switches()[0].props.onValueChange(false);
      });
      await first.press('Save');
      expect(saveBrandRating.mock.calls[0][1].contribute).toBe(false);

      saveBrandRating.mockClear();
      const second = await mount({ consentGranted: true });
      await second.choose('Overall rating', 3);
      await second.press('Save');
      expect(saveBrandRating.mock.calls[0][1].contribute).toBe(true);
    });

    it('opens as the stored rating chose', async () => {
      const off = await mount({ initial: stored({ contributed: false }), consentGranted: true });
      expect(off.switches()[0].props.value).toBe(false);
      const on = await mount({ initial: stored({ contributed: true }), consentGranted: true });
      expect(on.switches()[0].props.value).toBe(true);
      await on.press('Save');
      expect(saveBrandRating.mock.calls[0][1].contribute).toBe(true);
    });

    it('is disabled, off and explained when nothing of the brand has been worn', async () => {
      const { switches, text, choose, press } = await mount({ consentGranted: true, hasWornPiece: false });
      expect(switches()).toHaveLength(1);
      expect(switches()[0].props.disabled).toBe(true);
      expect(switches()[0].props.value).toBe(false);
      expect(text()).toContain('Brand insights count brands you have worn something from.');
      await choose('Overall rating', 4);
      await press('Save');
      // The person had no choice to make, so the stored choice is left alone.
      expect('contribute' in saveBrandRating.mock.calls[0][1]).toBe(false);
    });

    it('treats an unknown wear state as allowed and lets the server decide', async () => {
      const { switches } = await mount({ consentGranted: true, hasWornPiece: undefined });
      expect(switches()[0].props.disabled).toBe(false);
    });

    it('is a plain "Add to brand insights..." row when the person has not agreed', async () => {
      const { switches, hasButton, text, choose, press } = await mount({ consentGranted: false });
      expect(switches()).toHaveLength(0);
      expect(hasButton('Add to brand insights')).toBe(true);
      expect(text()).toContain('Add to brand insights...');
      await choose('Overall rating', 4);
      await press('Save');
      // Not agreed: the stored choice is kept, and a first save is private.
      expect('contribute' in saveBrandRating.mock.calls[0][1]).toBe(false);
    });

    it('is not shown at all while the agreement is unknown', async () => {
      const { switches, hasButton, text, choose, press } = await mount({ consentGranted: null });
      expect(switches()).toHaveLength(0);
      expect(hasButton('Add to brand insights')).toBe(false);
      expect(text()).not.toContain('brand insights');
      await choose('Overall rating', 4);
      await press('Save');
      expect('contribute' in saveBrandRating.mock.calls[0][1]).toBe(false);
    });

    it('turns into the switch, on, once the person agrees from the sheet (Android)', async () => {
      Platform.OS = 'android';
      const onRequestConsent = jest.fn().mockResolvedValue(true);
      const { switches, hasButton, press, choose, modal } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
      expect(modal().props.visible).toBe(true);
      expect(hasButton('Add to brand insights')).toBe(false);
      expect(switches()).toHaveLength(1);
      expect(switches()[0].props.value).toBe(true);
      await choose('Overall rating', 4);
      await press('Save');
      expect(saveBrandRating.mock.calls[0][1].contribute).toBe(true);
    });

    it('keeps the row when the person does not agree', async () => {
      Platform.OS = 'android';
      const onRequestConsent = jest.fn().mockResolvedValue(false);
      const { switches, hasButton, press, modal } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
      expect(switches()).toHaveLength(0);
      expect(hasButton('Add to brand insights')).toBe(true);
      expect(modal().props.visible).toBe(true);
    });

    it('treats a consent request that fails as a no, without a console error', async () => {
      Platform.OS = 'android';
      const onRequestConsent = jest.fn().mockRejectedValue(new Error('boom'));
      const { hasButton, press, modal } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      expect(hasButton('Add to brand insights')).toBe(true);
      expect(modal().props.visible).toBe(true);
    });

    it('steps aside while the consent sheet is up, and does not let anything close it meanwhile', async () => {
      Platform.OS = 'android';
      let answer!: (agreed: boolean) => void;
      const onRequestConsent = jest.fn(() => new Promise<boolean>(resolve => { answer = resolve; }));
      const { press, modal, props, choose } = await mount({ consentGranted: false, onRequestConsent });
      await choose('Overall rating', 4);
      await press('Add to brand insights');
      expect(modal().props.visible).toBe(false);
      await act(async () => {
        modal().props.onRequestClose();
      });
      expect(props.onClose).not.toHaveBeenCalled();
      await act(async () => {
        answer(false);
      });
      expect(modal().props.visible).toBe(true);
    });

    it('keeps what was entered while the consent sheet is up', async () => {
      Platform.OS = 'android';
      let answer!: (agreed: boolean) => void;
      const onRequestConsent = jest.fn(() => new Promise<boolean>(resolve => { answer = resolve; }));
      const { press, choose, scale } = await mount({ consentGranted: false, onRequestConsent });
      await choose('Overall rating', 4);
      await choose('Value', 2);
      await press('Add to brand insights');
      await act(async () => {
        answer(true);
      });
      expect(scale('Overall rating').props.value).toBe(4);
      expect(scale('Value').props.value).toBe(2);
    });

    it('asks only once when the row is pressed twice', async () => {
      Platform.OS = 'android';
      const onRequestConsent = jest.fn(() => new Promise<boolean>(() => {}));
      const { press } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
    });

    describe('on iOS, which shows one modal at a time', () => {
      it('asks once this sheet has finished leaving, and comes back once the consent sheet has settled', async () => {
        jest.useFakeTimers();
        Platform.OS = 'ios';
        const onRequestConsent = jest.fn().mockResolvedValue(true);
        const { press, modal, switches } = await mount({ consentGranted: false, onRequestConsent });
        await press('Add to brand insights');
        expect(modal().props.visible).toBe(false);
        expect(onRequestConsent).not.toHaveBeenCalled();
        await act(async () => {
          modal().props.onDismiss();
        });
        expect(onRequestConsent).toHaveBeenCalledTimes(1);
        // The consent sheet has answered but is still sliding away: this one stays out of its way.
        expect(modal().props.visible).toBe(false);
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
        expect(modal().props.visible).toBe(true);
        expect(switches()).toHaveLength(1);
      });

      it('asks anyway if the sheet never reports that it left', async () => {
        jest.useFakeTimers();
        Platform.OS = 'ios';
        const onRequestConsent = jest.fn().mockResolvedValue(false);
        const { press, modal } = await mount({ consentGranted: false, onRequestConsent });
        await press('Add to brand insights');
        expect(onRequestConsent).not.toHaveBeenCalled();
        await act(async () => {
          jest.advanceTimersByTime(1200);
        });
        expect(onRequestConsent).toHaveBeenCalledTimes(1);
        expect(modal().props.visible).toBe(false);
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
        expect(modal().props.visible).toBe(true);
      });

      it('keeps the sheet hidden, and not closable, until the settle delay has passed, whatever the answer', async () => {
        jest.useFakeTimers();
        Platform.OS = 'ios';
        const onRequestConsent = jest.fn().mockResolvedValue(false);
        const { press, modal, props, hasButton } = await mount({ consentGranted: false, onRequestConsent });
        await press('Add to brand insights');
        await act(async () => {
          modal().props.onDismiss();
        });
        expect(onRequestConsent).toHaveBeenCalledTimes(1);
        await act(async () => {
          jest.advanceTimersByTime(599);
        });
        expect(modal().props.visible).toBe(false);
        await act(async () => {
          modal().props.onRequestClose();
        });
        expect(props.onClose).not.toHaveBeenCalled();
        await act(async () => {
          jest.advanceTimersByTime(1);
        });
        expect(modal().props.visible).toBe(true);
        // "Not now": the row is still there, and a close works again.
        expect(hasButton('Add to brand insights')).toBe(true);
        await act(async () => {
          modal().props.onRequestClose();
        });
        expect(props.onClose).toHaveBeenCalledTimes(1);
      });

      it('is not cut short by a dismiss event that arrives during the settle wait', async () => {
        jest.useFakeTimers();
        Platform.OS = 'ios';
        const { press, modal } = await mount({ consentGranted: false });
        await press('Add to brand insights');
        await act(async () => {
          modal().props.onDismiss();
        });
        await act(async () => {
          modal().props.onDismiss();
        });
        expect(modal().props.visible).toBe(false);
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
        expect(modal().props.visible).toBe(true);
      });

      it('comes back at once on Android, with no settle delay', async () => {
        jest.useFakeTimers();
        Platform.OS = 'android';
        const { press, modal, switches } = await mount({ consentGranted: false });
        await press('Add to brand insights');
        expect(modal().props.visible).toBe(true);
        expect(switches()).toHaveLength(1);
        expect(jest.getTimerCount()).toBe(0);
      });

      it('does not mistake the sheet closing for the wait being over', async () => {
        Platform.OS = 'ios';
        const { modal, rerender, props } = await mount({ consentGranted: false });
        await act(async () => {
          modal().props.onDismiss();
        });
        await rerender({ visible: false });
        expect(props.onRequestConsent).not.toHaveBeenCalled();
      });
    });
  });

  describe('lifetime', () => {
    it('does not set state after an unmount that happens during the consent step', async () => {
      Platform.OS = 'android';
      let answer!: (agreed: boolean) => void;
      const onRequestConsent = jest.fn(() => new Promise<boolean>(resolve => { answer = resolve; }));
      const { press, tree } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        answer(true);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('clears the settle timer when it unmounts during the wait to come back (iOS)', async () => {
      jest.useFakeTimers();
      Platform.OS = 'ios';
      const onRequestConsent = jest.fn().mockResolvedValue(true);
      const { press, tree, modal } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      await act(async () => {
        modal().props.onDismiss();
      });
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(1);
      await act(async () => {
        tree.unmount();
      });
      expect(jest.getTimerCount()).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(onRequestConsent).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not ask for consent when it unmounts while waiting for the sheet to leave (iOS)', async () => {
      jest.useFakeTimers();
      Platform.OS = 'ios';
      const onRequestConsent = jest.fn().mockResolvedValue(true);
      const { press, tree } = await mount({ consentGranted: false, onRequestConsent });
      await press('Add to brand insights');
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(onRequestConsent).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not report a removal that finishes after it was unmounted', async () => {
      let finish!: (value: unknown) => void;
      deleteBrandRating.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { press, tree, props } = await mount({ initial: stored() });
      await press('Remove rating');
      await act(async () => {
        alertSpy.mock.calls[0][2][1].onPress();
      });
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        finish(undefined);
      });
      expect(props.onRemoved).not.toHaveBeenCalled();
    });
  });
});
