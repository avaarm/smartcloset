/**
 * Static guard for the keyboard rules, so a new screen can't bring the old bugs
 * back: number pads and multi-line fields have no Return key (they need the Done
 * bar), every other field needs a Return key that does something, and the tab
 * bar must get out of the way of the keyboard.
 *
 * It reads the source with the TypeScript parser rather than rendering, so it
 * covers screens that no render test reaches.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');

// MaterialsEditor points its fields at the Done bar but the Add Item screen that hosts it
// renders the single bar, so the 'one bar per file' rule does not apply to it.
const OTHER_WORKSTREAMS = new Set(['src/components/MaterialsEditor.tsx']);

const NO_RETURN_KEY_TYPES = new Set(['decimal-pad', 'number-pad', 'phone-pad', 'numeric']);

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return rel.endsWith('.tsx') ? [rel] : [];
  });

type Field = {
  file: string;
  line: number;
  tag: string;
  props: Map<string, string | true>;
  spreads: string[];
};

const stringOf = (init: ts.JsxAttribute['initializer']): string | true => {
  if (!init) return true; // `multiline` on its own
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    return ts.isStringLiteralLike(init.expression) ? init.expression.text : init.expression.getText();
  }
  return '';
};

/** Every <TextInput> and <Input> in a file, with the props written on it. */
const fieldsIn = (file: string): Field[] => {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fields: Field[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText();
      if (tag === 'TextInput' || tag === 'Input') {
        const props = new Map<string, string | true>();
        const spreads: string[] = [];
        node.attributes.properties.forEach(attr => {
          if (ts.isJsxSpreadAttribute(attr)) spreads.push(attr.expression.getText());
          else props.set(attr.name.getText(), stringOf(attr.initializer));
        });
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        fields.push({ file, line: line + 1, tag, props, spreads });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return fields;
};

const describeField = (f: Field) => `${f.file}:${f.line} <${f.tag}>`;
const spreadsInclude = (f: Field, name: string) => f.spreads.some(s => s.includes(name));

const SCANNED = [...sourceFiles('src/screens'), ...sourceFiles('src/components')].filter(
  file => !OTHER_WORKSTREAMS.has(file),
);
const FIELDS = SCANNED.flatMap(fieldsIn);

const needsDoneBar = (f: Field) =>
  f.props.has('multiline') || NO_RETURN_KEY_TYPES.has(String(f.props.get('keyboardType')));

describe('keyboard guard', () => {
  it('scans real fields (the guard itself is not vacuous)', () => {
    expect(FIELDS.length).toBeGreaterThan(30);
    expect(FIELDS.some(needsDoneBar)).toBe(true);
    for (const file of OTHER_WORKSTREAMS) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  it('gives every number pad and multi-line field the Done bar', () => {
    const missing = FIELDS.filter(needsDoneBar)
      .filter(f => !spreadsInclude(f, 'keyboardDoneProps') && !f.props.has('inputAccessoryViewID'))
      .map(describeField);
    expect(missing).toEqual([]);
  });

  it('renders the Done bar once in every file that points a field at it', () => {
    const wrong = SCANNED.filter(file => FIELDS.some(f => f.file === file && spreadsInclude(f, 'keyboardDoneProps')))
      .map(file => {
        const bars = (fs.readFileSync(path.join(ROOT, file), 'utf8').match(/<KeyboardDoneBar\b/g) ?? []).length;
        return { file, bars };
      })
      .filter(({ bars }) => bars !== 1);
    expect(wrong).toEqual([]);
  });

  it('gives every other field a Return key', () => {
    const missing = FIELDS.filter(f => !needsDoneBar(f))
      .filter(f => !f.props.has('returnKeyType') && !spreadsInclude(f, 'singleLineDoneProps'))
      .map(describeField);
    expect(missing).toEqual([]);
  });

  it('hides the tab bar while typing on Android only, on every bottom-tab navigator', () => {
    const app = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
    const options = app.match(/const tabScreenOptions = \{[\s\S]*?\n\};/);
    expect(options).not.toBeNull();
    // On iOS hiding it leaves the last fields covered (the scroll view measures the keyboard
    // before the tab bar goes away), so it is Android-only.
    expect(options![0]).toMatch(/tabBarHideOnKeyboard:\s*Platform\.OS === 'android'/);

    const navigators = app.match(/<Tab\.Navigator\b[^>]*>/g) ?? [];
    expect(navigators.length).toBeGreaterThanOrEqual(3);
    for (const navigator of navigators) {
      expect(navigator).toContain('screenOptions={tabScreenOptions}');
    }
  });
});
