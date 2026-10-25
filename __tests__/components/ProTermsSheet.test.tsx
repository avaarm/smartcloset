import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';

// No navigation container anywhere in this file: the sheet must work without one (it can sit inside Settings).
const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));
jest.mock('../../src/services/proService', () => ({
  ...jest.requireActual('../../src/services/proService'),
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
}));

import ProTermsSheet from '../../src/components/ProTermsSheet';
import {
  PRO_CLIENT_TERMS,
  PRO_CLIENT_TERMS_VERSION,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_SERVER_BEHIND_MESSAGE,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS,
  PRO_STYLIST_TERMS_VERSION,
  PRO_SUSPENDED_MESSAGE,
  PRO_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';
import type { ProStatus } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProTermsSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: false,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: null,
  client: { termsCurrent: false, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, role: 'client', needsAdult: true, onAccepted: jest.fn(), onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProTermsSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProTermsSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const button = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const hasButton = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = button(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const switches = () => tree.root.findAllByType(Switch);
  const setAdult = async (on: boolean) => {
    await act(async () => {
      switches()[0].props.onValueChange(on);
    });
  };
  return { tree, text, press, button, hasButton, switches, setAdult, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('ProTermsSheet, the text', () => {
  it('shows the client terms with every section', async () => {
    const { text } = await render({ role: 'client' });
    expect(text()).toContain('Client terms');
    expect(PRO_CLIENT_TERMS.sections).toHaveLength(8);
    for (const section of PRO_CLIENT_TERMS.sections) {
      expect(text()).toContain(section.heading);
      expect(text()).toContain(section.body);
    }
  });

  it('shows the stylist terms with every section', async () => {
    mockStatus.mockResolvedValue(status());
    const { text } = await render({ role: 'stylist' });
    expect(text()).toContain('Stylist terms');
    expect(PRO_STYLIST_TERMS.sections).toHaveLength(8);
    for (const section of PRO_STYLIST_TERMS.sections) {
      expect(text()).toContain(section.heading);
      expect(text()).toContain(section.body);
    }
    expect(text()).not.toContain('Client terms');
  });

  it('shows nothing while it is closed', async () => {
    const { text } = await render({ visible: false });
    expect(text()).toBe('');
  });
});

describe('ProTermsSheet, agreeing', () => {
  it('waits for the answer about the person before "I agree" can be used', async () => {
    const pending = deferred();
    mockStatus.mockReturnValue(pending.promise);
    const { button, press } = await render();
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);
    await press('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(status()); });
  });

  it('needs the 18+ switch on when the person has not confirmed their age', async () => {
    const { button, switches, setAdult } = await render({ needsAdult: true });
    expect(switches()).toHaveLength(1);
    expect(switches()[0].props.accessibilityLabel).toBe('I am 18 or older');
    expect(switches()[0].props.value).toBe(false);
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);
    await setAdult(true);
    expect(button('I agree').props.accessibilityState.disabled).toBe(false);
    await setAdult(false);
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);
  });

  it('records the agreement with the role and the age answer, then tells the screen', async () => {
    const { press, setAdult, props } = await render({ role: 'client' });
    await setAdult(true);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    // The service sends the build's version of the terms; the sheet has no version to pass.
    expect(mockAccept).toHaveBeenCalledWith('client', true);
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('records the stylist terms for a person who has no profile yet', async () => {
    mockStatus.mockResolvedValue(status({ stylist: null, adultConfirmed: false }));
    const { press, setAdult, props } = await render({ role: 'stylist' });
    await setAdult(true);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledWith('stylist', true);
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('shows no switch when the age is already confirmed', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: true }));
    const { switches, button, press, props } = await render({ needsAdult: false });
    expect(switches()).toHaveLength(0);
    expect(button('I agree').props.accessibilityState.disabled).toBe(false);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledWith('client', true);
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('shows the switch anyway when its own read says the age is not on record', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }));
    const { switches } = await render({ needsAdult: false });
    expect(switches()).toHaveLength(1);
  });

  it('does not record anything for "Not now"', async () => {
    const { press, props } = await render();
    await press('Not now');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(props.onAccepted).not.toHaveBeenCalled();
  });

  it('does not record twice while a request is in flight', async () => {
    const pending = deferred();
    mockAccept.mockReturnValue(pending.promise);
    const { press, setAdult, props } = await render();
    await setAdult(true);
    await press('I agree');
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('says the terms were updated when the server changed under it, and stops offering to agree', async () => {
    mockAccept.mockRejectedValue(new ProError('terms_version_mismatch'));
    const { text, press, button, setAdult, props } = await render();
    await setAdult(true);
    await press('I agree');
    expect(text()).toContain('The terms were updated. Please reopen.');
    expect(props.onAccepted).not.toHaveBeenCalled();
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it('shows other failures in plain words and lets the person try again', async () => {
    mockAccept.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press, setAdult, props } = await render();
    await setAdult(true);
    await press('I agree');
    expect(text()).toContain('You seem to be offline. Please try again.');
    expect(props.onAccepted).not.toHaveBeenCalled();

    mockAccept.mockRejectedValueOnce(new Error('permission denied for table pro_members'));
    await press('I agree');
    expect(text()).toContain("Couldn't save your agreement. Please try again.");
    expect(text()).not.toContain('permission denied');

    await press('I agree');
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain("Couldn't save your agreement");
  });

  it('ignores an answer that arrives after the sheet was closed', async () => {
    const pending = deferred();
    mockAccept.mockReturnValue(pending.promise);
    const { press, setAdult, update, props } = await render();
    await setAdult(true);
    await press('I agree');
    await update({ visible: false });
    await act(async () => { pending.resolve(); });
    expect(props.onAccepted).not.toHaveBeenCalled();
  });

  it('starts clean when reopened, and reads the person again', async () => {
    mockAccept.mockRejectedValueOnce(new ProError('terms_version_mismatch'));
    const { text, press, button, setAdult, switches, update } = await render();
    expect(mockStatus).toHaveBeenCalledTimes(1);
    await setAdult(true);
    await press('I agree');
    await update({ visible: false });
    await update({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain('The terms were updated');
    expect(switches()[0].props.value).toBe(false);
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);
  });

  it('reads the person once, not twice, when it is mounted already open', async () => {
    await render({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('reads nothing while it is closed, and the person once when it opens', async () => {
    const { update } = await render({ visible: false });
    expect(mockStatus).not.toHaveBeenCalled();                  // a closed sheet costs no status read on the screen that hosts it
    await update({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(1);
    await update({ visible: false });
    expect(mockStatus).toHaveBeenCalledTimes(1);
    await update({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(2);                // and once more each time it opens
  });

  it('reads the person once when it is mounted open', async () => {
    await render({ visible: true });
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('has nothing to record when another screen already got the agreement', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: true, client: { termsCurrent: true, connections: 0, connectionLimit: 5 } }));
    const { press, switches, props } = await render({ needsAdult: true });
    expect(switches()).toHaveLength(0);
    await press('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('ProTermsSheet, when it cannot record anything', () => {
  const agreeDisabled = (r: { button: (l: string) => any }) => r.button('I agree').props.accessibilityState.disabled;

  it('says to update, and records nothing, when the server has newer terms', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: PRO_SHARE_TEXT_VERSION } }));
    const r = await render();
    expect(r.text()).toContain(PRO_UPDATE_REQUIRED_MESSAGE);
    expect(agreeDisabled(r)).toBe(true);
    await r.press('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(r.props.onAccepted).not.toHaveBeenCalled();
  });

  it('says the server is behind when this build has the newer terms', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2026-09', clientTerms: '2026-09', shareText: PRO_SHARE_TEXT_VERSION } }));
    const r = await render();
    expect(r.text()).toContain(PRO_SERVER_BEHIND_MESSAGE);
    expect(agreeDisabled(r)).toBe(true);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('says features are paused, and records nothing', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const r = await render();
    expect(r.text()).toContain(PRO_PAUSED_MESSAGE);
    expect(agreeDisabled(r)).toBe(true);
  });

  it('says the account is paused, and records nothing', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    const r = await render();
    expect(r.text()).toContain(PRO_SUSPENDED_MESSAGE);
    expect(agreeDisabled(r)).toBe(true);
  });

  it('says it is not available yet on a server without the functions', async () => {
    mockStatus.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function public.get_pro_status' });
    const r = await render();
    expect(r.text()).toContain(PRO_NOT_DEPLOYED_MESSAGE);
    expect(agreeDisabled(r)).toBe(true);
  });

  it('asks a guest to sign in, and records nothing', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const r = await render();
    expect(r.text()).toContain('Sign in to work with a stylist.');
    expect(agreeDisabled(r)).toBe(true);
  });

  it('offers Try again when the read failed, and agrees after it works', async () => {
    mockStatus.mockRejectedValueOnce({ message: 'Network request failed' });
    const r = await render();
    expect(r.text()).toContain('You seem to be offline');
    expect(r.hasButton('I agree')).toBe(false);
    mockStatus.mockResolvedValue(status());
    await r.press('Try again');
    expect(r.hasButton('I agree')).toBe(true);
    expect(r.text()).not.toContain('You seem to be offline');
  });

  it('can always be closed', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const r = await render();
    await r.press('Not now');
    expect(r.props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ProTermsSheet, with the real service behind it', () => {
  beforeEach(() => {
    mockAccept.mockImplementation(jest.requireActual('../../src/services/proService').acceptProTerms);
  });

  it('sends the version of the text on screen, and only that', async () => {
    const { press, setAdult, props } = await render({ role: 'client' });
    await setAdult(true);
    await press('I agree');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('accept_pro_terms', {
      p_role: 'client',
      p_version: PRO_CLIENT_TERMS_VERSION,
      p_adult: true,
    });
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('sends the stylist version for the stylist terms', async () => {
    const { press, setAdult } = await render({ role: 'stylist' });
    await setAdult(true);
    await press('I agree');
    expect(mockRpc).toHaveBeenCalledWith('accept_pro_terms', {
      p_role: 'stylist',
      p_version: PRO_STYLIST_TERMS_VERSION,
      p_adult: true,
    });
  });

  it('turns the server refusing a different version into the "terms were updated" message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'terms_version_mismatch', code: '22023' } });
    const { text, press, setAdult, props } = await render();
    await setAdult(true);
    await press('I agree');
    expect(text()).toContain('The terms were updated. Please reopen.');
    expect(props.onAccepted).not.toHaveBeenCalled();
  });
});

describe('ProTermsSheet, how it is built', () => {
  const code = fs
    .readFileSync(path.resolve(__dirname, '../../src/components/ProTermsSheet.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('takes and sends no version of its own', () => {
    expect(code).not.toMatch(/TERMS_VERSION|p_version|acceptProTerms|versions\./);
    expect(code).toMatch(/acceptTerms\(/);
  });

  it('uses the mount form of the access hook, so it needs no navigation context', () => {
    expect(code).toMatch(/useProAccess\(\{ refreshOn: 'mount', lazy: true \}\)/);
    expect(code).not.toMatch(/useNavigation|useFocusEffect|navigate\(/);
  });

  it('has no text field, and so no keyboard bar to check', () => {
    expect(code).not.toMatch(/TextInput|<Input\b/);
  });
});
