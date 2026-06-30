/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext } from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import {
  ENTITY_ANALYTICS_TABLE_ID,
  ENTITY_ANALYTICS_LOCAL_STORAGE_COLUMNS_KEY,
  LOCAL_STORAGE_COLUMNS_SETTINGS_KEY,
  LOCAL_STORAGE_GROUPING_KEY,
} from './constants';

export interface DataViewContextValue {
  dataView: DataView;
  dataViewRefetch?: () => void;
  dataViewIsLoading?: boolean;
  dataViewIsRefetching?: boolean;
}

export const DataViewContext = createContext<DataViewContextValue>({} as DataViewContextValue);

/**
 * Per-instance identifiers/keys for an `EntitiesTableSection` mount.
 *
 * Defaulted to the entity analytics home page values when omitted. Other
 * consumers (e.g. the case attachments accordion) supply their own values so
 * that column visibility/widths and global-time inspect ribbon registration
 * don't collide between independent mounts.
 */
export interface EntitiesTableConfig {
  /** Registered as the global-time query id, flyout `contextID`/`scopeId`, and the inspect button id. */
  tableId: string;
  /** localStorage key for the visible column list (`useColumns`). */
  columnsLocalStorageKey: string;
  /** localStorage key for column widths/settings (`UnifiedDataTable` settings). */
  columnsSettingsLocalStorageKey: string;
  /** `@kbn/grouping` id used to persist the active grouping selection. */
  groupingLocalStorageKey: string;
}

export const DEFAULT_ENTITIES_TABLE_CONFIG: EntitiesTableConfig = {
  tableId: ENTITY_ANALYTICS_TABLE_ID,
  columnsLocalStorageKey: ENTITY_ANALYTICS_LOCAL_STORAGE_COLUMNS_KEY,
  columnsSettingsLocalStorageKey: LOCAL_STORAGE_COLUMNS_SETTINGS_KEY,
  groupingLocalStorageKey: LOCAL_STORAGE_GROUPING_KEY,
};

export { EntitiesTableSection } from './entities_table_section';
export {
  useEntityURLState,
  DEFAULT_ENTITIES_TABLE_SORT,
  type EntityURLStateResult,
  type EntitiesBaseURLQuery,
  type URLQuery,
} from './hooks/use_entity_url_state';
