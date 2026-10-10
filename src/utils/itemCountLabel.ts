/**
 * "1 item" or "12 items"; with `shown` (a search or filter is hiding some),
 * "3 of 12 items". The noun follows the total, so "0 of 1 item" reads right.
 */
export const itemCountLabel = (total: number, shown?: number): string => {
  const noun = total === 1 ? 'item' : 'items';
  return shown === undefined ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
};
