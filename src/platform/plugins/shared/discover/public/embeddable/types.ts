/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DefaultEmbeddableApi, HasDrilldowns } from '@kbn/embeddable-plugin/public';
import type { HasInspectorAdapters } from '@kbn/inspector-plugin/public';
import type {
  CanCancelRequests,
  EmbeddableApiContext,
  CanOverrideHoverActions,
  HasEditCapabilities,
  HasLibraryTransforms,
  HasSupportedTriggers,
  PublishesBlockingError,
  PublishesDataLoading,
  PublishesDescription,
  PublishesEsql,
  PublishesProjectRoutingOverrides,
  PublishesSavedObjectId,
  PublishesWritableTitle,
  PublishesWritableUnifiedSearch,
  PublishingSubject,
  SerializedTimeRange,
  SerializedTitles,
} from '@kbn/presentation-publishing';
import type {
  DiscoverSessionTab,
  SavedSearch,
  SerializableSavedSearch,
} from '@kbn/saved-search-plugin/common/types';
import type { DataTableColumnsMeta } from '@kbn/unified-data-table';
import type { BehaviorSubject } from 'rxjs';
import type { PublishesWritableDataViews } from '@kbn/presentation-publishing/interfaces/publishes_data_views';
import type { SerializedDrilldowns } from '@kbn/embeddable-plugin/server';
import type {
  NonPersistedDisplayOptions,
  SearchEmbeddablePanelApiState,
} from '../../common/embeddable/types';

export type { SearchEmbeddablePanelApiState };

/**
 * Input state accepted by the search embeddable factory.
 */
export type SearchEmbeddableInputState = SearchEmbeddablePanelApiState & {
  nonPersistedDisplayOptions?: NonPersistedDisplayOptions;
};

export type SearchEmbeddablePublicState = Pick<
  SerializableSavedSearch,
  | 'rowHeight'
  | 'rowsPerPage'
  | 'headerRowHeight'
  | 'columns'
  | 'sort'
  | 'sampleSize'
  | 'viewMode'
  | 'grid'
  | 'density'
  | 'documentsDisplayMode'
  | 'jsonModeSettings'
> & {
  rows: DataTableRecord[];
  columnsMeta: DataTableColumnsMeta | undefined;
  totalHitCount: number | undefined;
  inspectorAdapters: Record<string, unknown>;
};

export type SearchEmbeddableStateManager = {
  [key in keyof Required<SearchEmbeddablePublicState>]: BehaviorSubject<
    SearchEmbeddablePublicState[key]
  >;
};

export type SearchEmbeddableSerializedAttributes = Omit<
  SearchEmbeddablePublicState,
  'rows' | 'columnsMeta' | 'totalHitCount' | 'searchSource' | 'inspectorAdapters'
> &
  Pick<SerializableSavedSearch, 'serializedSearchSource'>;

export type SearchEmbeddableRuntimeState = SearchEmbeddableSerializedAttributes &
  SerializedTitles &
  SerializedTimeRange &
  SerializedDrilldowns & {
    savedObjectTitle?: string;
    savedObjectId?: string;
    savedObjectDescription?: string;
    nonPersistedDisplayOptions?: NonPersistedDisplayOptions;
    selectedTabId?: string;
    tabs?: DiscoverSessionTab[];
  };

export type SearchEmbeddableApi = DefaultEmbeddableApi<SearchEmbeddablePanelApiState> &
  PublishesSavedObjectId &
  PublishesDataLoading &
  PublishesBlockingError &
  Required<PublishesWritableTitle> &
  Required<PublishesDescription> &
  PublishesWritableSavedSearch &
  PublishesWritableDataViews &
  PublishesWritableUnifiedSearch &
  PublishesProjectRoutingOverrides &
  PublishesEsql &
  HasLibraryTransforms &
  HasTimeRange &
  HasInspectorAdapters &
  PublishesSelectedTabId &
  CanCancelRequests &
  Partial<HasEditCapabilities & PublishesSavedObjectId> &
  Partial<CanOverrideHoverActions> &
  HasDrilldowns &
  HasSupportedTriggers;

export interface PublishesSavedSearch {
  savedSearch$: PublishingSubject<SavedSearch>;
}

export interface PublishesWritableSavedSearch extends PublishesSavedSearch {
  setColumns: (columns: string[] | undefined) => void;
}

export const apiPublishesSavedSearch = (
  api: EmbeddableApiContext['embeddable']
): api is PublishesSavedSearch => {
  const embeddable = api as PublishesSavedSearch;
  return Boolean(embeddable.savedSearch$);
};

/**
 * Interface for publishing the selected tab ID
 * @interface PublishesSelectedTabId
 * @property {() => string | undefined} getSelectedTabId - Returns the ID of the selected tab
 */
export interface PublishesSelectedTabId {
  getSelectedTabId: () => string | undefined;
}

export interface HasTimeRange {
  hasTimeRange(): boolean;
}
