export type FieldStatus = 'verified' | 'check' | 'missing';       // shown as Read / Check / Not found
export type TagPart = 'shell' | 'lining' | 'fill' | 'trim' | 'upper' | 'sole' | 'hardware' | 'other';
export type TagFlag =
  | 'no_text' | 'low_legibility' | 'partial' | 'symbols_only'
  | 'multiple_labels' | 'set_of_garments' | 'composition_elsewhere' | 'multiple_sizes';

export interface TagFibre {
  fibre: string;                     // canonical lowercase fibre (FIBRES in materialNames.ts) or the printed word when unknown
  printed: string;                   // as printed, at most 40 characters
  percent: number | null;            // 0 to 100, decimals allowed until the group is rounded
  qualifier: 'organic' | 'recycled' | null;
  evidence: string;                  // the exact snippet of the OCR text, at most 80 characters
  grounded: boolean;                 // every number and the printed word were found in the OCR text (set by the client, never trusted from a model)
}
export interface TagGroup {
  part: TagPart;
  label: string | null;              // the header as printed, at most 30 characters
  fibres: TagFibre[];
  sum: number | null;                // sum of percents when every fibre has one
  status: FieldStatus;
  issues: string[];                  // short English reasons, shown under the group ("Adds up to 101")
}
export interface TagRead {
  readable: boolean;
  flags: TagFlag[];
  groups: TagGroup[];
  care: { items: string[]; status: FieldStatus };                                   // phrases from CARE_PHRASES
  origin: { country: string | null; known: boolean; status: FieldStatus };
  size: { value: string | null; status: FieldStatus };
  brand: { name: string | null; whereSeen: 'neck_label' | 'care_tag' | 'hang_tag' | null; confidence: number; status: FieldStatus };
  ids: { rn?: string; ca?: string; wpl?: string };                                  // kept in the transcription only
  languages: string[];                                                              // ISO 639-1
  transcription: string;                                                            // already sanitised (7.9)
  source: 'local' | 'model' | 'merged';
}
export type TagReadFailure = 'signed_out' | 'consent' | 'no_text' | 'too_small' | 'offline' | 'daily_limit' | 'failed';
export type TagReadResult =
  | { ok: true; read: TagRead }
  | { ok: false; reason: TagReadFailure; transcription?: string };

/** The answer of the optional model step, after the proxy has rebuilt it (7.14). Everything in it is still untrusted until grounded. */
export interface ModelTagRead {
  readable: boolean;
  composition: { part: TagPart; part_label: string | null;
                 fibers: { fiber: string; as_printed: string; percent: number | null; qualifier: 'organic' | 'recycled' | null; evidence: string }[] }[];
  care: string[];
  origin: string | null;
  size: { primary: string | null; all: string[] } | null;
  brand: { name: string | null; where_seen: 'neck_label' | 'care_tag' | 'hang_tag' | null } | null;
  languages: string[];
  flags: TagFlag[];
}

/** What the OCR step hands to the parser. */
export interface TagOcr {
  text: string;
  wordHeights: number[];             // pixel heights of word boxes, empty when the response has none
  meanConfidence: number | null;     // mean symbol confidence 0 to 1, null when absent
  locale?: string;
}
