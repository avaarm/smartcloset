import { parseMoney } from '../../src/utils/money';

describe('parseMoney', () => {
  it.each([
    ['12', 12],
    ['12.50', 12.5],
    ['$1,299', 1299],
    ['1,299.99', 1299.99],
    ['12,50', 12.5],
    ['1.299,00', 1299],
    ['  45 ', 45],
    ['0', 0],
  ])('reads %s as %d', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each([[''], ['abc'], ['$'], [',']])('rejects %p', input => {
    expect(parseMoney(input)).toBeNaN();
  });

  it('rejects a number with two decimal points instead of guessing', () => {
    expect(parseMoney('1.2.3')).toBeNaN();
  });
});
