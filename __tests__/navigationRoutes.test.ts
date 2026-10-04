/**
 * Static consistency check between App.tsx's navigators and the navigate()
 * calls in the screens.
 *
 * React Navigation only lets an action bubble UP (stack -> tab -> container); a
 * screen can't reach a route that isn't registered in its own stack or named by
 * an ancestor tab. In a release build an unhandled navigate() is silent, so the
 * button just does nothing. This walks every screen reachable from each tab set
 * and fails on any navigate() target that its navigator can't resolve.
 *
 * It reads source text, so it only understands literal targets:
 *   navigate('X'), navigate({ name: 'X' }), navigate('Tab', { screen: 'X' }) and
 *   data tables of the form { nav: 'X' } / { screen: 'X' }.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');

const appSource = read('App.tsx');

// import XScreen from './src/screens/XScreen'  ->  { XScreen: 'src/screens/XScreen.tsx' }
const componentFiles: Record<string, string> = {};
for (const m of appSource.matchAll(/import (\w+) from '\.\/(src\/(?:screens|components)\/\w+)';/g)) {
  componentFiles[m[1]] = `${m[2]}.tsx`;
}

type Route = { name: string; component: string };

const stacks: Record<string, Route[]> = {};
for (const m of appSource.matchAll(/const (\w+Stack) = \(\) => \{([\s\S]*?)\n\};/g)) {
  stacks[m[1]] = [...m[2].matchAll(/<Stack\.Screen\s+name="(\w+)"\s+component=\{(\w+)/g)].map(r => ({
    name: r[1],
    component: r[2],
  }));
}

const tabSets: Record<string, Route[]> = {};
for (const m of appSource.matchAll(/<Tab\.Navigator key="(\w+)"([\s\S]*?)<\/Tab\.Navigator>/g)) {
  tabSets[m[1]] = [...m[2].matchAll(/<Tab\.Screen\s+name="(\w+)"\s+component=\{(\w+)\}/g)].map(r => ({
    name: r[1],
    component: r[2],
  }));
}

type Target = { name: string; nested?: string };

// A screen's own file plus the shared components it imports (e.g. OutfitCard
// navigates on behalf of OutfitScreen).
const sourceFor = (component: string): string | null => {
  const file = componentFiles[component];
  if (!file) return null;
  const own = stripComments(read(file));
  const shared = [...own.matchAll(/from '\.\.\/components\/(\w+)'/g)].map(m =>
    stripComments(read(`src/components/${m[1]}.tsx`)),
  );
  return [own, ...shared].join('\n');
};

const targetsIn = (source: string): Target[] => {
  const found: Target[] = [];
  let rest = source.replace(
    /\.navigate\(\s*'(\w+)'\s*,\s*\{\s*screen:\s*'(\w+)'[^}]*\}/g,
    (_all, tab: string, screen: string) => {
      found.push({ name: tab, nested: screen });
      return '';
    },
  );
  for (const m of rest.matchAll(/\.navigate\(\s*'(\w+)'/g)) found.push({ name: m[1] });
  for (const m of rest.matchAll(/\.navigate\(\s*\{\s*name:\s*'(\w+)'/g)) found.push({ name: m[1] });
  for (const m of rest.matchAll(/\b(?:nav|screen):\s*'(\w+)'/g)) found.push({ name: m[1] });
  return found;
};

// Navigators a screen declares itself (e.g. OutfitScreen's Suggestions/Saved tabs).
const ownRoutes = (source: string) => [...source.matchAll(/<\w+\.Screen\s+name="(\w+)"/g)].map(m => m[1]);

/**
 * navigate() calls that can fail to resolve in a given stack but are never made
 * there. Each entry says why.
 */
const GUARDED = new Set([
  // ItemDetails hides "Create Outfit" for wishlist items (they can't be in outfits).
  'WishlistStack/ItemDetails->CreateOutfit',
]);

type Problem = string;

const audit = (mode: string): { problems: Problem[]; visited: string[] } => {
  const tabs = tabSets[mode];
  const problems: Problem[] = [];
  const visited = new Set<string>();
  const queue: { stack: string | null; screen: string; component: string }[] = [];

  const enqueueTab = (tab: Route, screen?: string) => {
    const stack = stacks[tab.component];
    if (!stack) {
      queue.push({ stack: null, screen: tab.name, component: tab.component });
    } else {
      const route = screen ? stack.find(r => r.name === screen) : stack[0];
      if (route) queue.push({ stack: tab.component, screen: route.name, component: route.component });
    }
  };
  tabs.forEach(tab => enqueueTab(tab));

  while (queue.length) {
    const node = queue.shift()!;
    const id = `${mode}/${node.stack ?? 'tab'}/${node.screen}`;
    if (visited.has(id)) continue;
    visited.add(id);

    const source = sourceFor(node.component);
    if (!source) continue;
    const own = ownRoutes(source);
    const routes = node.stack ? stacks[node.stack] : [];

    for (const target of targetsIn(source)) {
      const label = `${node.stack ?? 'tab'}/${node.screen}->${target.name}`;
      if (GUARDED.has(label)) continue;

      const inStack = routes.find(r => r.name === target.name);
      const tab = tabs.find(t => t.name === target.name);

      if (inStack && !target.nested) {
        queue.push({ stack: node.stack, screen: inStack.name, component: inStack.component });
      } else if (tab) {
        const stack = stacks[tab.component];
        if (target.nested && !stack?.some(r => r.name === target.nested)) {
          problems.push(`${mode}: ${label} (nested '${target.nested}' is not in ${tab.component})`);
        } else {
          enqueueTab(tab, target.nested);
        }
      } else if (!own.includes(target.name)) {
        problems.push(`${mode}: ${label} is not registered in ${node.stack ?? 'the tab navigator'} or any ancestor`);
      }
    }
  }
  return { problems, visited: [...visited] };
};

describe('navigator registrations', () => {
  it('parses every navigator out of App.tsx', () => {
    expect(Object.keys(tabSets).sort()).toEqual(['client', 'stylist', 'user']);
    expect(tabSets.user.map(t => t.name)).toEqual(['Home', 'Wardrobe', 'Outfits', 'Wishlist', 'Settings']);
    for (const name of ['HomeStack', 'WardrobeStack', 'OutfitStack', 'WishlistStack']) {
      expect(stacks[name]?.length).toBeGreaterThan(1);
    }
  });

  it('registers AddClothing in the Home stack (ItemDetails edit pencil)', () => {
    expect(stacks.HomeStack.map(r => r.name)).toContain('AddClothing');
  });

  it.each(['user', 'stylist', 'client'])('every navigate() reachable in %s mode resolves', mode => {
    const { problems, visited } = audit(mode);
    // The walk really covered screens, not just the tab roots.
    expect(visited.length).toBeGreaterThan(tabSets[mode].length);
    expect(problems).toEqual([]);
  });

  it('walks user mode through the screens the tabs lead to', () => {
    const { visited } = audit('user');
    expect(visited).toEqual(
      expect.arrayContaining([
        'user/HomeStack/ItemDetails',
        'user/HomeStack/AddClothing',
        'user/WardrobeStack/AddClothing',
        'user/WishlistStack/ItemDetails',
        'user/OutfitStack/OutfitDetails',
      ]),
    );
  });
});
