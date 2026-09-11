/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializedTimeRange, SerializedTitles } from '@kbn/presentation-publishing';
import type { SerializedDrilldowns } from '@kbn/embeddable-plugin/server';
import type {
  SavedSearchAttributes,
  SavedSearchByValueAttributes,
} from '@kbn/saved-search-plugin/common';
import type { DiscoverSessionEmbeddableState } from '../../server';
import type { EDITABLE_SAVED_SEARCH_KEYS } from './constants';

// These are options that are not persisted in the saved object, but can be used by solutions
// when utilising the SavedSearchComponent package outside of dashboard contexts.
export interface NonPersistedDisplayOptions {
  solutionNavIdOverride?: 'oblt' | 'security' | 'search';
  enableDocumentViewer?: boolean;
  enableFilters?: boolean;
  documentViewerFlyoutType?: 'push' | 'overlay';
  /**
   * When true and stored columns are empty, apply Discover profile/ES|QL column defaults
   * for display only. Matching profile widths stay display-only after column edits.
   * Dashboard hosts should leave this unset.
   */
  autoApplyDiscoverColumnDefaults?: boolean;
  /**
   * When false, keep the document table toolbar on one line. Defaults to wrapping.
   * Dashboard hosts should leave this unset.
   */
  wrapToolbar?: boolean;
  /**
   * When false, hide the keyboard shortcuts toolbar control. Defaults to showing it.
   * Dashboard hosts should leave this unset.
   */
  showKeyboardShortcuts?: boolean;
  /**
   * When false, hide the Sort toolbar control. Column-header sorting stays available.
   * Dashboard hosts should leave this unset.
   */
  showSortSelector?: boolean;
}

export type EditableSavedSearchAttributes = Partial<
  Pick<SavedSearchAttributes, (typeof EDITABLE_SAVED_SEARCH_KEYS)[number]>
>;

export type SearchEmbeddableBaseState = SerializedTitles &
  SerializedTimeRange &
  SerializedDrilldowns &
  EditableSavedSearchAttributes & {
    nonPersistedDisplayOptions?: NonPersistedDisplayOptions;
  };

export type SearchEmbeddableByValueState = SearchEmbeddableBaseState & {
  attributes: SavedSearchByValueAttributes;
};

export type SearchEmbeddableByReferenceState = SearchEmbeddableBaseState & {
  savedObjectId: string;
  selectedTabId?: string;
};

export type SearchEmbeddableState = SearchEmbeddableByValueState | SearchEmbeddableByReferenceState;

export type SearchEmbeddablePanelApiState = DiscoverSessionEmbeddableState | SearchEmbeddableState;

export type StoredSearchEmbeddableByValueState = SearchEmbeddableByValueState;

export type StoredSearchEmbeddableByReferenceState = Omit<
  SearchEmbeddableByReferenceState,
  'nonPersistedDisplayOptions' | 'savedObjectId'
>;

export type StoredSearchEmbeddableState =
  | StoredSearchEmbeddableByValueState
  | StoredSearchEmbeddableByReferenceState;
