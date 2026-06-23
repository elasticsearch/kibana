/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ViewToggleId } from '../constants';
import { VIEW_TOGGLE_LIST_ID, VIEW_TOGGLE_TABLE_ID } from '../constants';

import { LOCAL_STORAGE_KEYS } from '../../../../../common/constants';
import { useCasesLocalStorage } from '../../../../common/use_cases_local_storage';

export function useViewMode() {
  const [storedViewMode, setViewMode] = useCasesLocalStorage<ViewToggleId>(
    LOCAL_STORAGE_KEYS.casesViewMode,
    VIEW_TOGGLE_LIST_ID
  );

  const viewMode =
    storedViewMode === VIEW_TOGGLE_LIST_ID || storedViewMode === VIEW_TOGGLE_TABLE_ID
      ? storedViewMode
      : VIEW_TOGGLE_LIST_ID;

  return {
    viewMode,
    setViewMode,
  };
}
