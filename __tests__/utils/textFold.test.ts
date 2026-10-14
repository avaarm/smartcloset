import { foldText, normalizeLines, normalizeText } from '../../src/utils/textFold';

describe('foldText', () => {
  it('folds accents to ASCII and lowercases', () => {
    expect(foldText('FABRIQUÉ EN FRANCE')).toBe('fabrique en france');
    expect(foldText('Élasthanne')).toBe('elasthanne');
    expect(foldText('Algodón')).toBe('algodon');
    expect(foldText('Obermaterial: Füllung')).toBe('obermaterial: fullung');
    expect(foldText('Türkiye ÇIKTI Şİ')).toBe('turkiye cikti si');
    expect(foldText('Łódź Đurđevac Ørsted Åre')).toBe('lodz durdevac orsted are');
  });

  it('folds every accented letter of the table to its base letter, in both cases', () => {
    const pairs: Array<[string, string]> = [
      ['àáâãäåāăą', 'a'], ['çćč', 'c'], ['ďđð', 'd'], ['èéêëēėęě', 'e'], ['ğ', 'g'], ['ìíîïīįı', 'i'], ['ł', 'l'], ['ñńň', 'n'],
      ['òóôõöøōő', 'o'], ['ŕř', 'r'], ['śšşș', 's'], ['ťţț', 't'], ['ùúûüūůűų', 'u'], ['ýÿ', 'y'], ['źżž', 'z'],
    ];
    for (const [letters, base] of pairs) {
      for (const ch of Array.from(letters)) {
        expect(foldText(ch)).toBe(base);
        expect(foldText(ch.toUpperCase())).toBe(base);
      }
    }
  });

  it('expands the ligatures and the sharp s', () => {
    expect(foldText('Größe')).toBe('grosse');
    expect(foldText('Œuvre Æsir Þór')).toBe('oeuvre aesir thor');
  });

  it('does not use String.normalize, which Hermes does not have everywhere', () => {
    const spy = jest.spyOn(String.prototype, 'normalize');
    foldText('Élasthanne Café ñ');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('drops combining accents that are left over from decomposed text', () => {
    expect(foldText('cafe\u0301')).toBe('cafe');
    expect(foldText('n\u0303')).toBe('n');
  });

  it('turns fullwidth digits, letters and percent signs into ASCII', () => {
    expect(foldText('１００％ ＣＯＴＴＯＮ')).toBe('100% cotton');
    expect(foldText('綿１００％')).toBe('綿100%');
    expect(foldText('٪٧٠')).toBe('%٧٠'); // Arabic percent sign becomes %; the Arabic digits are left as they are
    expect(foldText('60﹪')).toBe('60%');
  });

  it('removes trademark signs and reads typographic apostrophes as a plain one', () => {
    expect(foldText('TENCEL™ LYOCELL')).toBe('tencel lyocell');
    expect(foldText('LYCRA® Cotton©')).toBe('lycra cotton');
    expect(foldText('lamb’s wool ‘x’')).toBe("lamb's wool 'x'");
  });

  it('keeps letters of other scripts, and maps odd spaces to a plain one', () => {
    expect(foldText('表地 ポリエステル')).toBe('表地 ポリエステル');
    expect(foldText('ХЛОПОК')).toBe('хлопок');
    expect(foldText('a\u00a0b\u3000c\u200bd')).toBe('a b cd');
  });

  it('keeps line breaks and survives non-strings', () => {
    expect(foldText('A\nB')).toBe('a\nb');
    expect(foldText('')).toBe('');
    expect(foldText(undefined as unknown as string)).toBe('');
    expect(foldText(12 as unknown as string)).toBe('');
  });
});

describe('normalizeLines', () => {
  it('reads a decimal comma between digits as a point', () => {
    expect(normalizeLines('97,5% COTTON')).toEqual(['97.5% cotton']);
    expect(normalizeLines('60%, 40%')).toEqual(['60%, 40%']);
    expect(normalizeLines('cotton,polyester 40')).toEqual(['cotton,polyester 40']);
  });

  it('collapses runs of spaces, trims every line and drops the empty ones', () => {
    expect(normalizeLines('  100%   COTTON \r\n\r\n\t  MADE   IN ITALY  \n')).toEqual(['100% cotton', 'made in italy']);
    expect(normalizeLines('a\u2028b\u2029c')).toEqual(['a', 'b', 'c']);
  });

  it('normalizeText joins the lines with newlines', () => {
    expect(normalizeText('A,5\n\n  B')).toBe('a,5\nb');
    expect(normalizeText('')).toBe('');
  });
});
