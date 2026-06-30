/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TabItem } from '@kbn/unified-tabs';
import { TabInitializationStatus, type TabState } from './types';

export const DEFAULT_EXPANDED_DOC_OWNER = 'discover_main_grid';

export const DEFAULT_TAB_STATE: Omit<TabState, keyof TabItem> = {
  initializationState: { initializationStatus: TabInitializationStatus.NotStarted },
  globalState: {},
  appState: {},
  previousAppState: {},
  forceFetchOnSelect: false,
  isDataViewLoading: false,
  dataRequestParams: {
    timeRangeAbsolute: undefined,
    timeRangeRelative: undefined,
    searchSessionId: undefined,
    isSearchSessionRestored: false,
  },
  attributes: {
    visContext: undefined,
    controlGroupState: undefined,
    timeRestore: false,
  },
  overriddenVisContextAfterInvalidation: undefined,
  cascadedDocumentsState: {
    availableCascadeGroups: [],
    selectedCascadeGroups: [],
    columnsMeta: {},
    cascadedDocumentsMap: {},
  },
  esqlVariables: [],
  defaultProfileState: {
    resetId: '',
    fieldsToReset: 'none',
    snapshotsByProfileId: {},
  },
  profileState: {},
  expandedDoc: undefined,
  expandedDocOwner: undefined,
  renderDocumentViewMeta: undefined,
  uiState: {},
};
