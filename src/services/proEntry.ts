/**
 * What a person chose on the first-run prompt, held in memory until Home picks it up (7.3). Nothing is stored:
 * a person who closes the app before Home reads it simply sees the prompt's result as "no role", and can start
 * again from Settings > Professional. The intent never says anything the server must believe; it only decides
 * which sheet ProHome opens.
 */

export type ProEntryIntent = 'stylist' | 'client';

let pending: ProEntryIntent | null = null;

export const setProEntry = (intent: ProEntryIntent): void => {
  if (intent === 'stylist' || intent === 'client') pending = intent;
};

/** Reads the intent and clears it, so it is acted on once. */
export const takeProEntry = (): ProEntryIntent | null => {
  const intent = pending;
  pending = null;
  return intent;
};

/** Call on sign-out and after account deletion. */
export const resetProEntry = (): void => {
  pending = null;
};
