/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isOfAggregateQueryType } from '@kbn/es-query';
import { DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH } from '@kbn/unified-doc-viewer';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { DiscoverServices } from '../../../../build_services';
import type { DiscoverAppState } from '../redux';
import { migrateLegacyQuery } from '../../../../utils/migrate_legacy_query';
import { getMaxAllowedSampleSize } from '../../../../utils/get_allowed_sample_size';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../../common/data_sources';
import { APP_STATE_URL_KEY } from '../../../../../common';

export interface AppStateUrl extends Omit<DiscoverAppState, 'sort'> {
  /**
   * Necessary to take care of legacy links [fieldName,direction]
   */
  sort?: string[][] | [string, string];
  /**
   * Legacy data view ID prop
   */
  index?: string;
  /**
   * Legacy ESQL approximate
   */
  isApproximate?: boolean;
}

/**
 * Takes care of the given url state, migrates legacy props and cleans up empty props
 * @param appStateFromUrl
 * @param uiSettings
 */
export function cleanupUrlState(
  appStateFromUrl: AppStateUrl | null | undefined,
  uiSettings: IUiSettingsClient
): DiscoverAppState | undefined {
  if (!appStateFromUrl) {
    return;
  }

  const query = appStateFromUrl.query;
  const isEsqlQuery = isOfAggregateQueryType(query);

  if (!isEsqlQuery && query && !query.language) {
    appStateFromUrl.query = migrateLegacyQuery(query);
  }

  if (typeof appStateFromUrl.sort?.[0] === 'string') {
    if (appStateFromUrl.sort?.[1] === 'asc' || appStateFromUrl.sort[1] === 'desc') {
      // handling sort props like this[fieldName,direction]
      appStateFromUrl.sort = [[appStateFromUrl.sort[0], appStateFromUrl.sort[1]]];
    } else {
      delete appStateFromUrl.sort;
    }
  }

  if (appStateFromUrl.sort && !appStateFromUrl.sort.length) {
    // If there's an empty array given in the URL, the sort prop should be removed
    // This allows the sort prop to be overwritten with the default sorting
    delete appStateFromUrl.sort;
  }

  if (
    appStateFromUrl.rowsPerPage &&
    !(typeof appStateFromUrl.rowsPerPage === 'number' && appStateFromUrl.rowsPerPage > 0)
  ) {
    // remove the param if it's invalid
    delete appStateFromUrl.rowsPerPage;
  }

  if (
    appStateFromUrl.sampleSize &&
    (isEsqlQuery || // not supported yet for ES|QL
      !(
        typeof appStateFromUrl.sampleSize === 'number' &&
        appStateFromUrl.sampleSize > 0 &&
        appStateFromUrl.sampleSize <= getMaxAllowedSampleSize(uiSettings)
      ))
  ) {
    // remove the param if it's invalid
    delete appStateFromUrl.sampleSize;
  }

  let migratedDataViewId: string | undefined;

  // Migrate legacy index parameter
  if (appStateFromUrl.index) {
    migratedDataViewId = appStateFromUrl.index;
    delete appStateFromUrl.index;
  }

  if (!appStateFromUrl.dataSource) {
    if (isEsqlQuery) {
      // Use ES|QL data source for ES|QL queries
      appStateFromUrl.dataSource = createEsqlDataSource();
    } else if (migratedDataViewId) {
      // Use data view data source for migrated data view IDs
      appStateFromUrl.dataSource = createDataViewDataSource({ dataViewId: migratedDataViewId });
    }
  }

  // Migrate legacy isApproximate
  if (
    typeof appStateFromUrl.esqlApproximation !== 'boolean' &&
    typeof appStateFromUrl.isApproximate === 'boolean'
  ) {
    appStateFromUrl.esqlApproximation = appStateFromUrl.isApproximate;
  }
  delete appStateFromUrl.isApproximate;

  // Drop shareable doc viewer state that isn't a plain object or exceeds the size budget, guarding
  // against unbounded URL input. Per-tab slices are validated later against each tab's schema.
  const { docViewerState } = appStateFromUrl;
  if (
    docViewerState &&
    (typeof docViewerState !== 'object' ||
      JSON.stringify(docViewerState).length > DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH)
  ) {
    delete appStateFromUrl.docViewerState;
  }

  return appStateFromUrl as DiscoverAppState;
}

export function getCurrentUrlState(stateStorage: IKbnUrlStateStorage, services: DiscoverServices) {
  return (
    cleanupUrlState(stateStorage.get<AppStateUrl>(APP_STATE_URL_KEY) ?? {}, services.uiSettings) ??
    {}
  );
}
