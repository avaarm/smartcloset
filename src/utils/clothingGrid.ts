/**
 * Two-column grid geometry shared by the ClothingItem card and the screens that
 * lay it out (Wardrobe, Wishlist). The card width is derived from these numbers,
 * so a screen must use the same GRID_SIDE_PADDING for its list content or the
 * second column runs off the screen.
 */

export const GRID_COLUMNS = 2;

/** Padding on each side of the list content. */
export const GRID_SIDE_PADDING = 12;

/** Margin around every card; neighbouring cards sit twice this far apart. */
export const CARD_MARGIN = 8;

/**
 * Width of one card in a list that is `containerWidth` wide. Floored because a
 * fractional share can make the columns add up to a hair more than the row, and
 * the row does not wrap: the last column would be pushed past the edge.
 */
export const gridCardWidth = (containerWidth: number): number =>
  Math.floor((containerWidth - 2 * GRID_SIDE_PADDING) / GRID_COLUMNS) - 2 * CARD_MARGIN;
