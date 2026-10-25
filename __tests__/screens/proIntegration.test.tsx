/**
 * Professional accounts, integration pass INT-MODE (documentation/design/pro-accounts.md 7.2, 7.10): the navigators in
 * App.tsx and the shared files around them. Reads the source as text, as navigationRoutes.test.ts does, so a route
 * that is registered twice, on two lines, in the wrong stack or out of order is caught before a phone finds it.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const app = read('App.tsx');

const block = (name: string): string => {
  const m = app.match(new RegExp(`const ${name} = \\(\\) => \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`no ${name} in App.tsx`);
  return m[1];
};

/** The route lines of a stack, in order: `name="X" component={YScreen}` pairs, whatever the layout. */
const routes = (stack: string) =>
  [...block(stack).matchAll(/<Stack\.Screen\s+name="(\w+)"\s+component=\{(\w+)\}/g)].map(m => ({ name: m[1], component: m[2] }));

const oneLine = (name: string, component: string) =>
  `<Stack.Screen name="${name}" component={${component}} options={{ headerShown: false }} />`;

const SWAP = ['SwapBoard', 'SwapListing', 'MySwaps', 'SwapThread'];
const HOME_PRO = ['ProHome', 'ProConnection', 'ProShare', 'ProRecommendation', 'ProThread'];
const STYLIST_STACKS: Record<string, string[]> = {
  ProClientsStack: ['ProClients', 'ProClientDetail', 'ProClientCloset', 'ProLookEditor', 'ProRecommendation', 'ProThread'],
  ProScheduleStack: ['ProSchedule', 'ProThread'],
  ProInboxStack: ['ProInbox', 'ProThread'],
};
const ROUTE_SCREENS = [
  'ProHome', 'ProConnection', 'ProShare', 'ProRecommendation', 'ProThread',
  'ProClients', 'ProClientDetail', 'ProClientCloset', 'ProLookEditor', 'ProSchedule', 'ProInbox',
];

describe('Home stack', () => {
  const home = block('HomeStack');
  const lines = home.split('\n').map(l => l.trim());

  it('registers the five professional routes once each, on one line each, directly after SwapThread', () => {
    const at = lines.indexOf(oneLine('SwapThread', 'SwapThreadScreen'));
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 1 + HOME_PRO.length)).toEqual(HOME_PRO.map(r => oneLine(r, `${r}Screen`)));
    for (const route of HOME_PRO) expect(home.match(new RegExp(`name="${route}"`, 'g'))).toHaveLength(1);
  });

  it('keeps the four swap routes first, in order, after FriendCloset', () => {
    const names = routes('HomeStack').map(r => r.name);
    const friend = names.indexOf('FriendCloset');
    expect(names.slice(friend + 1, friend + 1 + SWAP.length)).toEqual(SWAP);
    expect(names.slice(friend + 1 + SWAP.length, friend + 1 + SWAP.length + HOME_PRO.length)).toEqual(HOME_PRO);
  });

  it('registers the professional routes in no other personal stack', () => {
    for (const stack of ['WardrobeStack', 'OutfitStack', 'WishlistStack']) {
      for (const route of ROUTE_SCREENS) expect(block(stack)).not.toContain(`name="${route}"`);
    }
  });

  it('still reaches AddClothing from exactly three stacks (ProShare navigates to it from Home)', () => {
    const stacks = [...app.matchAll(/const (\w+Stack) = \(\) => \{([\s\S]*?)\n\};/g)]
      .filter(m => m[2].includes('name="AddClothing"'))
      .map(m => m[1])
      .sort();
    expect(stacks).toEqual(['HomeStack', 'WardrobeStack', 'WishlistStack']);
  });
});

describe('Stylist workspace', () => {
  it.each(Object.entries(STYLIST_STACKS))('%s registers its routes in order, one line each', (stack, names) => {
    expect(routes(stack).map(r => r.name)).toEqual(names);
    const lines = block(stack).split('\n').map(l => l.trim());
    for (const r of routes(stack)) expect(lines).toContain(oneLine(r.name, r.component));
    expect(routes(stack).every(r => r.component === `${r.name}Screen`)).toBe(true);
  });

  it('has exactly the three stylist stacks, and no other stack carries a Pro route', () => {
    const stacks = [...app.matchAll(/const (\w+Stack) = \(\) => \{/g)].map(m => m[1]);
    expect(stacks.filter(s => s.startsWith('Pro')).sort()).toEqual(Object.keys(STYLIST_STACKS).sort());
  });

  it('matches the route types of proRoutes.ts, stack by stack', () => {
    const types = read('src/types/proRoutes.ts');
    const keysOf = (typeName: string): string[] => {
      const body = types.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`));
      if (!body) throw new Error(`no ${typeName}`);
      return [...body[1].matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
    };
    expect(routes('HomeStack').map(r => r.name).filter(n => n.startsWith('Pro'))).toEqual(keysOf('ProHomeStackParamList'));
    expect(routes('ProClientsStack').map(r => r.name)).toEqual(keysOf('ProClientsStackParamList'));
    expect(routes('ProScheduleStack').map(r => r.name)).toEqual(keysOf('ProScheduleStackParamList'));
    expect(routes('ProInboxStack').map(r => r.name)).toEqual(keysOf('ProInboxStackParamList'));
  });

  it('builds the stylist tab set from the three stacks and Settings, with no client tab set', () => {
    expect([...app.matchAll(/<Tab\.Navigator key="(\w+)"/g)].map(m => m[1]).sort()).toEqual(['stylist', 'user']);

    const stylist = app.match(/<Tab\.Navigator key="stylist"([\s\S]*?)<\/Tab\.Navigator>/)![1];
    const tabs = [...stylist.matchAll(/<Tab\.Screen\s+name="(\w+)"\s+component=\{(\w+)\}([\s\S]*?)\/>\s*(?=<Tab\.Screen|$)/g)];
    expect(tabs.map(t => [t[1], t[2]])).toEqual([
      ['Clients', 'ProClientsStack'],
      ['Schedule', 'ProScheduleStack'],
      ['Messages', 'ProInboxStack'],
      ['Settings', 'SettingsScreen'],
    ]);
    const labels = [...stylist.matchAll(/tabBarLabel: '([^']+)'/g)].map(m => m[1]);
    expect(labels).toEqual(['Clients', 'Schedule', 'Messages', 'Settings']);
    const icons = [...stylist.matchAll(/<Icon name="([\w-]+)"/g)].map(m => m[1]);
    expect(icons).toEqual(['people-outline', 'calendar-outline', 'chatbubbles-outline', 'person-outline']);
    expect(stylist.match(/headerShown: false/g)).toHaveLength(4);
  });

  it('keeps the build switch in front of the saved mode', () => {
    expect(app).toContain("const currentMode = PRO_MODES_ENABLED ? savedMode : 'user';");
  });
});

describe('imports', () => {
  it('imports the eleven route screens and the prompt in the exact form the route audit reads, after the swap screens', () => {
    const swapThread = app.indexOf("import SwapThreadScreen from './src/screens/SwapThreadScreen';");
    expect(swapThread).toBeGreaterThan(-1);
    let last = swapThread;
    for (const name of [...ROUTE_SCREENS.map(r => `${r}Screen`), 'ProOnboardingScreen']) {
      const line = `import ${name} from './src/screens/${name}';`;
      const at = app.indexOf(line);
      expect(at).toBeGreaterThan(last);
      expect(app.split(line)).toHaveLength(2);
      expect(fs.existsSync(path.join(ROOT, `src/screens/${name}.tsx`))).toBe(true);
      last = at;
    }
  });

  it('imports nothing from the legacy stylist and client world', () => {
    const legacyScreens = [
      'AddClient', 'AppointmentDetails', 'BookStylist', 'Chat', 'ClientAppointments', 'ClientDashboard', 'ClientDetails',
      'ClientRecommendations', 'ClientsList', 'CreateAppointment', 'CreateRecommendation', 'MessagesList', 'MyStylist',
      'RecommendationDetails', 'Recommendations', 'StylistDashboard', 'StylistMarketplace', 'StylistProfileView',
      'AccountTypeOnboarding',
    ].map(n => `${n}Screen`);
    const mentions = (name: string) => new RegExp(`\\b${name}\\b`).test(app);
    for (const name of legacyScreens) expect(mentions(name)).toBe(false);
    for (const name of ['StylistDashboardStack', 'ClientsStack', 'StylistMessagesStack', 'StylistRecommendationsStack',
      'ClientDashboardStack', 'MyStylistStack', 'ClientMessagesStack', 'ClientAppointmentsStack',
      'ClientRecommendationsStack', 'ClientMyStylistStack']) {
      expect(mentions(name)).toBe(false);
    }
    for (const route of ['StylistMarketplace', 'StylistProfileView', 'BookStylist', 'Dashboard', 'MyStylist', 'Recs', 'Appointments']) {
      expect(app).not.toContain(`name="${route}"`);
    }
    expect(app).not.toContain('types/stylist');
  });

  it('parks the three own-closet tools: kept, registered nowhere', () => {
    for (const name of ['WardrobeEditScreen', 'LookbookScreen', 'CapsuleWardrobeScreen']) {
      expect(app).not.toContain(name);
      expect(fs.existsSync(path.join(ROOT, `src/screens/${name}.tsx`))).toBe(true);
    }
  });

  it('deletes the old first-run prompt with its import', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/screens/AccountTypeOnboardingScreen.tsx'))).toBe(false);
  });
});

describe('launch', () => {
  it('purges the retired device stores from one effect that runs once', () => {
    expect(app.match(/purgeLegacyProData\(\)/g)).toHaveLength(1);
    expect(app).toMatch(/useEffect\(\(\) => \{\s*purgeLegacyProData\(\);\s*\}, \[\]\);/);
    expect(app).toContain("import { purgeLegacyProData } from './src/services/localData';");
  });

  it('shows the new prompt, which reports the choice, and keeps the intent in memory only for a stylist or a client', () => {
    expect(app).toContain('<ProOnboardingScreen');
    expect(app).toContain("if (choice === 'stylist' || choice === 'client') setProEntry(choice);");
    expect(app).toContain("import { setProEntry } from './src/services/proEntry';");
    expect(app).not.toMatch(/AsyncStorage/);
  });
});

describe('shared files this pass changes', () => {
  const settings = read('src/screens/SettingsScreen.tsx');

  it('Settings gets the Professional section after the swap one, behind both gates, and navigates nowhere', () => {
    expect(settings).toContain(
      '{isAuthenticated && <SwapSettingsSection />}\n          {isAuthenticated && PRO_MODES_ENABLED && <ProSettingsSection />}',
    );
    expect(settings).toContain("import ProSettingsSection from '../components/ProSettingsSection';");
    expect(settings).not.toMatch(/navigate\(|useNavigation/);
  });

  it('Settings loses the account-mode switcher, the mode pill and the legacy types', () => {
    for (const gone of ['Account Mode', 'handleModeSwitch', 'availableModes', 'getModeName', 'getModeIcon', 'getModeDescription',
      'modePill', 'modeCard', 'useAccountMode', 'types/stylist', 'accountService']) {
      expect(settings).not.toContain(gone);
    }
  });

  it('Settings names the new data in the delete-account text and the Danger Zone note, and the dev reset drops the old words', () => {
    expect(settings).toContain('ratings, body profile, stylist and client data, swap listings, offers and messages, and any uploaded images');
    expect(settings).toContain('swap listings and messages, stylist connections, and all uploaded images');
    for (const gone of ['stylist clients, appointments, recommendations, booking requests', 'stylist & client content']) {
      expect(settings).not.toContain(gone);
    }
  });

  it('the account service, the mode context and the flag no longer touch the legacy stylist types', () => {
    for (const file of ['src/services/accountService.ts', 'src/context/AccountModeContext.tsx', 'src/config/features.ts']) {
      expect(read(file)).not.toContain('types/stylist');
    }
  });

  it('the flag keeps its path and name, and its comment describes this feature and not a simulation', () => {
    // Its value is asserted in accountMode.test.ts, the one place the release commit changes.
    const features = read('src/config/features.ts');
    expect(features).toMatch(/export const PRO_MODES_ENABLED = (true|false);/);
    expect(features).toContain('pro_enabled');
    expect(features).not.toMatch(/simulation/i);
  });
});
