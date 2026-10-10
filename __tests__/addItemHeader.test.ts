/**
 * Add Item draws its own header. A second one from the navigators above it (the
 * stack's, or the bottom tab's "My Wardrobe" bar) shows as a doubled header with
 * a blank band between, so every layer above AddClothing must have its own off.
 *
 * Reads App.tsx as text, like navigationRoutes.test.ts.
 */
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8');

/** Each `<X.Screen` element's source, up to the next one (so options after an inline icon still count). */
const screens = (source: string, tag: 'Stack.Screen' | 'Tab.Screen') => source.split(`<${tag}`).slice(1);

const stacks: Record<string, string> = {};
for (const m of appSource.matchAll(/const (\w+Stack) = \(\) => \{([\s\S]*?)\n\};/g)) stacks[m[1]] = m[2];

const stacksWithAddClothing = Object.keys(stacks).filter(name => stacks[name].includes('name="AddClothing"'));

// Only the personal-mode tab set: the stylist and client sets have no wardrobe stack.
const userTabs = appSource.slice(appSource.indexOf('<Tab.Navigator key="user"'));

describe('Add Item header', () => {
  it('is registered in the stacks that open it', () => {
    expect(stacksWithAddClothing.sort()).toEqual(['HomeStack', 'WardrobeStack', 'WishlistStack']);
  });

  it.each(['HomeStack', 'WardrobeStack', 'WishlistStack'])('%s hides its own stack header over it', name => {
    const screen = screens(stacks[name], 'Stack.Screen').find(s => s.includes('name="AddClothing"'))!;
    expect(screen).toMatch(/headerShown:\s*false/);
  });

  it.each(stacksWithAddClothing)('the tab that hosts %s hides the tab header too', stack => {
    const tab = screens(userTabs, 'Tab.Screen').find(s => s.includes(`component={${stack}}`));
    expect(tab).toBeDefined();
    expect(tab).toMatch(/headerShown:\s*false/);
  });
});
