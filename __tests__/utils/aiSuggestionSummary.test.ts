import { buildAiSuggestionRows, type AiSuggestionForm } from '../../src/utils/aiSuggestionSummary';
import type { RecognitionResult } from '../../src/services/imageRecognition';

const form = (over: Partial<AiSuggestionForm> = {}): AiSuggestionForm => ({
  category: 'shoes',
  color: 'Tan',
  material: '',
  occasion: null,
  brand: '',
  ...over,
});

const real = (over: Partial<RecognitionResult> = {}): RecognitionResult => ({
  isReal: true,
  confidence: {},
  ...over,
});

const texts = (rows: ReturnType<typeof buildAiSuggestionRows>) => rows.map(r => `${r.label}: ${r.text}`);

describe('buildAiSuggestionRows', () => {
  it('words a row as "Shoes (92% confidence)": a human label, a space before the bracket', () => {
    const rows = buildAiSuggestionRows(
      real({ category: 'shoes', confidence: { category: 0.92 } }),
      form(),
    );
    expect(texts(rows)).toEqual(['Category: Shoes (92% confidence)']);
  });

  it('shows every field the AI is confident about, in a fixed order', () => {
    const rows = buildAiSuggestionRows(
      real({
        category: 'bags',
        color: 'brown',
        material: 'leather',
        occasion: 'casual',
        confidence: { category: 0.97, color: 0.88, material: 0.84, occasion: 0.76 },
      }),
      form({ category: 'bags', color: 'Brown', material: 'leather', occasion: 'casual' }),
    );
    expect(texts(rows)).toEqual([
      'Category: Bags (97% confidence)',
      'Color: Brown (88% confidence)',
      'Material: Leather (84% confidence)',
      'Occasion: Casual (76% confidence)',
    ]);
  });

  it('uses the human label for every category, including the new ones', () => {
    const labelFor = (category: any) =>
      buildAiSuggestionRows(real({ category, confidence: { category: 0.9 } }), form({ category }))[0].text;
    expect(labelFor('jewelry')).toBe('Jewelry (90% confidence)');
    expect(labelFor('hats')).toBe('Hats (90% confidence)');
    expect(labelFor('activewear')).toBe('Activewear (90% confidence)');
  });

  it('hides rows the AI is not confident about, or has no value for', () => {
    const rows = buildAiSuggestionRows(
      real({
        category: 'tops',
        color: 'red',
        material: 'cotton',
        confidence: { category: 0.49, color: 0.5, material: undefined },
      }),
      form({ category: 'tops', color: 'Red' }),
    );
    expect(texts(rows)).toEqual(['Color: Red (50% confidence)']);
  });

  it('is empty when the analysis was not real (guest, AI off, offline)', () => {
    const fake = real({ isReal: false, category: 'tops', confidence: { category: 0.99 } });
    expect(buildAiSuggestionRows(fake, form())).toEqual([]);
    expect(buildAiSuggestionRows(null, form())).toEqual([]);
    expect(buildAiSuggestionRows(undefined, form())).toEqual([]);
  });

  it('is empty when nothing is confident enough, so no box with only a title appears', () => {
    const rows = buildAiSuggestionRows(
      real({ category: 'tops', color: 'red', confidence: { category: 0.3, color: 0.2 } }),
      form(),
    );
    expect(rows).toEqual([]);
  });

  it('does not contradict the form: a value that differs says what the form is set to', () => {
    const rows = buildAiSuggestionRows(
      real({
        category: 'accessories',
        color: 'brown',
        occasion: 'casual',
        confidence: { category: 0.97, color: 0.88, occasion: 0.76 },
      }),
      form({ category: 'shoes', color: 'Tan', occasion: 'formal' }),
    );
    expect(texts(rows)).toEqual([
      'Category: Accessories (97% confidence) · set to Shoes',
      'Color: Brown (88% confidence) · set to Tan',
      'Occasion: Casual (76% confidence) · set to Formal',
    ]);
  });

  it('notes "Any occasion" when the AI suggested one and the form says any', () => {
    const rows = buildAiSuggestionRows(
      real({ occasion: 'party', confidence: { occasion: 0.8 } }),
      form({ occasion: null }),
    );
    expect(texts(rows)).toEqual(['Occasion: Party (80% confidence) · set to Any occasion']);
  });

  it('does not mention a choice for a field the user left blank', () => {
    const rows = buildAiSuggestionRows(
      real({ color: 'green', brand: 'Zara', confidence: { color: 0.9, brand: 0.7 } }),
      form({ color: '', brand: '' }),
    );
    expect(texts(rows)).toEqual(['Color: Green (90% confidence)', 'Brand: Zara (70% confidence)']);
  });

  it('compares the primary material the form holds, ignoring case', () => {
    const same = buildAiSuggestionRows(
      real({ material: 'Leather', confidence: { material: 0.8 } }),
      form({ material: 'leather' }),
    );
    expect(texts(same)).toEqual(['Material: Leather (80% confidence)']);

    const other = buildAiSuggestionRows(
      real({ material: 'leather', confidence: { material: 0.8 } }),
      form({ material: 'suede' }),
    );
    expect(texts(other)).toEqual(['Material: Leather (80% confidence) · set to Suede']);
  });

  it('does not offer a category that is not one of the eleven', () => {
    const rows = buildAiSuggestionRows(
      real({ category: 'footwear' as any, confidence: { category: 0.95 } }),
      form(),
    );
    expect(rows).toEqual([]);
  });

  it('skips an occasion the form has no chip for rather than offering it', () => {
    const rows = buildAiSuggestionRows(
      real({ occasion: 'date night', confidence: { occasion: 0.9 } }),
      form(),
    );
    expect(rows).toEqual([]);
  });

  it('leaves out plain patterns but keeps a real one', () => {
    expect(buildAiSuggestionRows(real({ pattern: 'solid', confidence: { pattern: 0.9 } }), form())).toEqual([]);
    expect(buildAiSuggestionRows(real({ pattern: 'other', confidence: { pattern: 0.9 } }), form())).toEqual([]);
    expect(texts(buildAiSuggestionRows(real({ pattern: 'polka_dot', confidence: { pattern: 0.9 } }), form()))).toEqual([
      'Pattern: Polka dot (90% confidence)',
    ]);
  });

  it('keeps the percentage between 0 and 100', () => {
    const rows = buildAiSuggestionRows(real({ color: 'red', confidence: { color: 1.4 } }), form({ color: '' }));
    expect(rows[0].text).toBe('Red (100% confidence)');
  });
});
