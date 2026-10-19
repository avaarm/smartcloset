/**
 * useProductSearch — the searching "Add from the web" and "Search a look" share:
 * a search by words, a search by photo, and a search by words that refines the
 * photo's answer (the photo's best guess plus what the person typed).
 *
 * The photo's own answer is kept while its refined results are on screen, so
 * "Back to photo results" shows it again without searching again. Only the most
 * recent search may write state (searchSeq), so a slow earlier answer can never
 * replace a newer one. Including resale filters a photo's answer on screen, and
 * repeats a text or refined search with the new setting, as resale is left out
 * at the source for those.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { pickImageFromLibrary } from '../platform/imagePicker';
import {
  buildRefinedSearch,
  searchByImage,
  searchProductsByText,
  type LensSearchResponse,
  type TextSearchOptions,
} from '../services/lensSearchService';
import { mergeRefineWords, refineSuggestions, selectVisibleResults } from '../services/searchRanking';

export const SEARCH_FAILED_MESSAGE = "Couldn't search right now. Check your connection and try again.";

// Resale is already kept whenever shops are scarce, so "include resale" never fixes an empty list.
export const EMPTY_TEXT_RESULTS_MESSAGE = 'No results for that. Try different or fewer words.';
export const EMPTY_PHOTO_RESULTS_MESSAGE = 'No matches found. Try a clearer photo or a different angle.';

/** Which search the answer on screen came from; its empty-state advice has to fit that search. */
export type SearchKind = 'text' | 'photo' | 'refined';

type WordSearch = {
  query: string;
  options: TextSearchOptions;
  kind: 'text' | 'refined';
  /** For a refined search, the words typed (the query is the photo's best guess with them). */
  words?: string;
};

const failedResponse = (query: string): LensSearchResponse => ({
  query,
  bestGuessLabels: [],
  results: [],
  error: SEARCH_FAILED_MESSAGE,
});

export const useProductSearch = () => {
  // The words in the search box and in the refine box: kept here so flipping between tabs
  // (or a photo and back) never loses them.
  const [query, setQuery] = useState('');
  const [refineText, setRefineText] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [response, setResponse] = useState<LensSearchResponse | null>(null);
  const [photoAnswer, setPhotoAnswerState] = useState<LensSearchResponse | null>(null);
  const [kind, setKind] = useState<SearchKind>('text');
  // Kept while the screen stays mounted, so closing and reopening a modal does not turn resale back off.
  const [includeResale, setIncludeResaleState] = useState(false);

  // A search that was started later (or a reset) makes an earlier one's answer stale.
  const searchSeq = useRef(0);
  // The words search whose results are on screen, so flipping "Include resale" can repeat it.
  // Null for a photo's answer, which already holds the resale listings and only needs filtering.
  const shown = useRef<WordSearch | null>(null);
  const photoAnswerRef = useRef<LensSearchResponse | null>(null);
  const resaleRef = useRef(false);

  const setPhotoAnswer = useCallback((answer: LensSearchResponse | null) => {
    photoAnswerRef.current = answer;
    setPhotoAnswerState(answer);
  }, []);

  const runWordSearch = useCallback(async (search: WordSearch, resale: boolean) => {
    const seq = ++searchSeq.current;
    shown.current = search;
    setKind(search.kind);
    setLoading(true);
    setResponse(null);
    try {
      const result = await searchProductsByText(search.query, { ...search.options, includeResale: resale });
      if (seq === searchSeq.current) setResponse(result);
    } catch {
      if (seq === searchSeq.current) setResponse(failedResponse(search.query));
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  /** Search the web for these words; an empty box does nothing. */
  const searchText = useCallback(
    (text: string) => {
      setQuery(text);
      const trimmed = text.trim();
      if (!trimmed) return;
      runWordSearch({ query: trimmed, options: {}, kind: 'text' }, resaleRef.current);
    },
    [runWordSearch],
  );

  /** Pick a photo and search for it. */
  const searchPhoto = useCallback(async () => {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    const seq = ++searchSeq.current;
    shown.current = null;
    setKind('photo');
    setPhotoUri(picked.uri);
    setPhotoAnswer(null);
    setRefineText('');
    setLoading(true);
    setResponse(null);
    try {
      const result = await searchByImage(picked.uri);
      if (seq === searchSeq.current) {
        setResponse(result);
        setPhotoAnswer(result);
      }
    } catch {
      if (seq === searchSeq.current) {
        const failed = failedResponse('');
        setResponse(failed);
        setPhotoAnswer(failed);
      }
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, [setPhotoAnswer]);

  /**
   * Search the photo's best guess plus these words, in place of the photo's results. An empty box
   * does nothing, and so does a refine before any photo has been answered.
   */
  const refine = useCallback(
    (words: string) => {
      setRefineText(words);
      const photo = photoAnswerRef.current;
      const request = photo ? buildRefinedSearch(photo, words) : null;
      if (!request) return;
      runWordSearch({ ...request, kind: 'refined', words }, resaleRef.current);
    },
    [runWordSearch],
  );

  /** Show the photo's own answer again. A refined search still running is dropped. */
  const backToPhoto = useCallback(() => {
    const photo = photoAnswerRef.current;
    if (!photo) return;
    searchSeq.current += 1;
    shown.current = null;
    setKind('photo');
    setResponse(photo);
    setLoading(false);
  }, []);

  const setIncludeResale = useCallback(
    (value: boolean) => {
      resaleRef.current = value;
      setIncludeResaleState(value);
      if (shown.current) runWordSearch(shown.current, value);
    },
    [runWordSearch],
  );

  /**
   * Add one word to the search on screen (a suggestion chip): to the words searched for, or to the
   * photo's refine words. Nothing to add it to, nothing happens.
   */
  const addWord = useCallback(
    (word: string) => {
      const current = shown.current;
      if (current?.kind === 'text') searchText(mergeRefineWords(current.query, word));
      else if (current?.kind === 'refined') refine(mergeRefineWords(current.words ?? '', word));
      else if (photoAnswerRef.current) refine(word);
    },
    [refine, searchText],
  );

  /** Back to the start: no photo, no results, empty boxes. The resale setting stays. */
  const reset = useCallback(() => {
    searchSeq.current += 1;
    shown.current = null;
    setPhotoAnswer(null);
    setPhotoUri(null);
    setResponse(null);
    setQuery('');
    setRefineText('');
    setKind('text');
    setLoading(false);
  }, [setPhotoAnswer]);

  // A text search has already left resale out (or in); a photo's answer holds everything, so the
  // same rule is applied here to both.
  const results = useMemo(
    () => (response ? selectVisibleResults(response.results, includeResale) : []),
    [response, includeResale],
  );

  // Words the results share, to narrow them with one tap (see addWord).
  const suggestions = useMemo(
    () => refineSuggestions(results.map(r => r.title), response?.query ?? ''),
    [results, response],
  );

  return {
    query,
    setQuery,
    refineText,
    setRefineText,
    loading,
    photoUri,
    response,
    results,
    suggestions,
    /** The photo's own answer, kept (even with no results or an error) while refined results are shown. */
    photoAnswer,
    kind,
    includeResale,
    setIncludeResale,
    searchText,
    searchPhoto,
    refine,
    backToPhoto,
    addWord,
    reset,
  };
};
