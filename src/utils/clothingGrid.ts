/**
 * Grid geometry shared by the ClothingItem card and the screens that lay it out
 * (Wardrobe, Wishlist). The card width is derived from these numbers, so a
 * screen must use the same side padding (and column count) for its list content
 * as the card was sized for, or the last column runs off the screen.
 *
 * Two layouts: 'default' (two tall cards across, the Wishlist) and 'compact'
 * (three small cards across, the Wardrobe, where the point is seeing many pieces).
 */

export const GRID_COLUMNS = 2;

/** Padding on each side of the list content. */
export const GRID_SIDE_PADDING = 12;

/** Margin around every card; neighbouring cards sit twice this far apart. */
export const CARD_MARGIN = 8;

export type GridVariant = 'default' | 'compact';

export interface GridLayout {
  columns: number;
  /** Padding on each side of the list content. */
  sidePadding: number;
  /** Margin around every card; neighbouring cards sit twice this far apart. */
  margin: number;
}

export const GRID_LAYOUTS: Record<GridVariant, GridLayout> = {
  default: { columns: GRID_COLUMNS, sidePadding: GRID_SIDE_PADDING, margin: CARD_MARGIN },
  // 16 + 4 puts the outer cards 20pt from the screen edge, in line with the header text.
  compact: { columns: 3, sidePadding: 16, margin: 4 },
};

/**
 * Width of one card in a list that is `containerWidth` wide, for any number of
 * columns. Floored because a fractional share can make the columns add up to a
 * hair more than the row, and the row does not wrap: the last column would be
 * pushed past the edge. What the floor leaves over is less than one pixel per column.
 */
export const cardWidthFor = (containerWidth: number, { columns, sidePadding, margin }: GridLayout): number =>
  Math.floor((containerWidth - 2 * sidePadding) / columns) - 2 * margin;

export const gridCardWidth = (containerWidth: number, variant: GridVariant = 'default'): number =>
  cardWidthFor(containerWidth, GRID_LAYOUTS[variant]);

/**
 * The compact card's text block: a name line and a category/brand line. The
 * card styles read these numbers, so the row height below is the real one
 * (at the default text size; larger text only makes a row taller).
 */
export const COMPACT_DETAILS = { padding: 6, nameLine: 16, metaLine: 14, gap: 1 } as const;

const COMPACT_DETAILS_HEIGHT =
  2 * COMPACT_DETAILS.padding + COMPACT_DETAILS.nameLine + COMPACT_DETAILS.gap + COMPACT_DETAILS.metaLine;

/** Height of one row of compact cards: a square photo, the text block and the card margins. */
export const compactRowHeight = (containerWidth: number): number =>
  gridCardWidth(containerWidth, 'compact') + COMPACT_DETAILS_HEIGHT + 2 * GRID_LAYOUTS.compact.margin;

/** Compact cards seen whole in a list `listHeight` tall (a row cut off by the edge does not count). */
export const compactCardsInView = (containerWidth: number, listHeight: number): number =>
  Math.floor(listHeight / compactRowHeight(containerWidth)) * GRID_LAYOUTS.compact.columns;
