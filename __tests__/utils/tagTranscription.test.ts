import { extractIds, sanitizeTranscription } from '../../src/utils/tagTranscription';

describe('sanitizeTranscription', () => {
  it('drops the lines a phone number, an email, a web address or a long digit run is on, and keeps the rest', () => {
    const text = ['100% COTTON', '+1 (555) 123-4567', 'CALL 555.123.4567 TODAY', 'a@b.co', 'info@acme.example.com', 'www.x.com', 'https://acme.example/care',
      'acme.com/returns', 'acme.net', '1234567890', 'BARCODE 12345678', 'MADE IN ITALY'].join('\n');
    expect(sanitizeTranscription(text).split('\n')).toEqual(['100% COTTON', 'MADE IN ITALY']);
  });

  it('keeps short RN, CA and WPL numbers of five to seven digits', () => {
    expect(sanitizeTranscription('RN 12345\nCA 123456\nWPL 1234567').split('\n')).toEqual(['RN 12345', 'CA 123456', 'WPL 1234567']);
    expect(sanitizeTranscription('RN 12345678')).toBe('');
  });

  it('keeps ordinary numbers, percentages, sizes and washing temperatures', () => {
    const text = '60% COTTON 40% POLYESTER\nSIZE 38 / 10 / M\nWASH AT 30';
    expect(sanitizeTranscription(text)).toBe(text);
  });

  it('cuts every line to 120 characters', () => {
    const out = sanitizeTranscription(`${'A'.repeat(300)}\nB`);
    expect(out.split('\n')).toEqual(['A'.repeat(120), 'B']);
  });

  it('keeps at most 60 lines', () => {
    const out = sanitizeTranscription(Array.from({ length: 100 }, (_, i) => `L${i}`).join('\n'));
    expect(out.split('\n')).toHaveLength(60);
    expect(out.split('\n')[59]).toBe('L59');
  });

  it('cuts at a line boundary so the whole is at most 2000 characters, whatever the input', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `${String(i).padStart(2, '0')} ${'x'.repeat(100)}`);
    const out = sanitizeTranscription(lines.join('\n'));
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.split('\n').every(l => l.length === 103)).toBe(true);
    expect(sanitizeTranscription('y'.repeat(2400)).length).toBeLessThanOrEqual(2000);
  });

  it('drops empty lines, trims and collapses spaces, and removes control characters', () => {
    expect(sanitizeTranscription('  A   B \n\n\t\n C\u0000D ')).toBe('A B\nC D');
    expect(sanitizeTranscription('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('is empty for nothing or for something that is not text', () => {
    expect(sanitizeTranscription('')).toBe('');
    expect(sanitizeTranscription(undefined as unknown as string)).toBe('');
    expect(sanitizeTranscription(null as unknown as string)).toBe('');
    expect(sanitizeTranscription(5 as unknown as string)).toBe('');
  });

  it('drops a phone number or an email written with fullwidth, Arabic-Indic or typographic characters', () => {
    for (const line of [
      'お問い合わせ ０３－１２３４－５６７８', // fullwidth digits and hyphen
      'Call (555) 123–4567', // en dash
      'Tel 555—123—4567', // em dash
      'Tel 555\u2011123\u20114567', // non-breaking hyphen
      'Tel 0049/30/1234567',
      'هاتف ٠١٢٣٤٥٦٧٨٩', // Arabic-Indic digits
      'फोन ०१२३४५६७८९', // Devanagari digits
      '555·123·4567',
      '555_123_4567',
      'info＠example.co.uk',
    ]) {
      expect({ line, kept: sanitizeTranscription(`100% COTTON\n${line}`) }).toEqual({ line, kept: '100% COTTON' });
    }
  });

  it('drops a phone number or an email that the tag wraps over two lines', () => {
    for (const wrapped of ['Tel 1-800-555-\n1234', 'Tel 1-800-555-\n1234567', 'jane.doe@\nexample.com', 'info@\nacme.co.uk']) {
      expect({ wrapped, kept: sanitizeTranscription(`100% COTTON\n${wrapped}\nMADE IN ITALY`) }).toEqual({ wrapped, kept: '100% COTTON\nMADE IN ITALY' });
    }
  });

  it('keeps real neighbouring lines that only add up to a phone number when joined', () => {
    for (const text of ['RN 123456\n100% COTTON', 'WPL 1234567\n100% COTTON', 'RN 12345\n100% COTTON', '60% COTTON-\n40% POLYESTER', 'SIZE 38 / 10 / M\nWASH AT 30']) {
      expect(sanitizeTranscription(text)).toBe(text);
    }
  });

  it('keeps the text of a dropped-looking line it is not: short dashed numbers and sizes', () => {
    expect(sanitizeTranscription('(555) 123\nRN 12345\nSIZE 38 / 10 / M')).toBe('(555) 123\nRN 12345\nSIZE 38 / 10 / M');
  });

  it('rejects a long run of at signs in well under a second', () => {
    for (const text of ['@'.repeat(8000), 'a@'.repeat(4000), '@@'.repeat(4000), `${'x'.repeat(50000)}@${'y'.repeat(50000)}`, 'x'.repeat(100000)]) {
      const started = Date.now();
      sanitizeTranscription(text);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  it('still drops a real email next to at signs, and keeps text that only looks like one', () => {
    expect(sanitizeTranscription('jane.doe@example.com\na@b.co\na@b')).toBe('a@b');
    expect(sanitizeTranscription('@b.co\na@.co\na@b.\n@@@')).toBe('@b.co\na@.co\na@b.\n@@@');
    expect(sanitizeTranscription('a@@b.co\nx@@y.co')).toBe('');
    expect(sanitizeTranscription('mail: a@b.co now')).toBe('');
  });

  it('keeps letters of other scripts', () => {
    expect(sanitizeTranscription('表地 綿100%\n裏地 ポリエステル100%')).toBe('表地 綿100%\n裏地 ポリエステル100%');
  });
});

describe('extractIds', () => {
  it('reads RN, CA and WPL numbers of five to seven digits from folded text', () => {
    expect(extractIds('rn 12345\nca 54321\nwpl 1234567')).toEqual({ rn: '12345', ca: '54321', wpl: '1234567' });
    expect(extractIds('rn# 98765')).toEqual({ rn: '98765' });
    expect(extractIds('rn: 98765')).toEqual({ rn: '98765' });
  });

  it('ignores numbers that are too short or too long, and words that only contain the letters', () => {
    expect(extractIds('rn 1234\nca 12345678')).toEqual({});
    expect(extractIds('born 12345 cargo 12345')).toEqual({});
    expect(extractIds('')).toEqual({});
  });
});
