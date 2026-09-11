/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fromStoredDataView } from '@kbn/as-code-data-views-transforms';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { SerializedSearchSourceFields } from '@kbn/data-plugin/common';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { Filter } from '@kbn/es-query';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { stableStringify } from '@kbn/std';
import { v4 as uuidv4 } from 'uuid';
import type { TabState } from '../redux/types';

/** Fills missing inline IDs using matching local views, with the incoming link first for its tab. */
export const assignSessionDataViewIds = (
  session: DiscoverSession,
  tabs: TabState[],
  navigation?: { tabId: string | undefined; dataViewSpec: DataViewSpec | undefined }
) => {
  // An inline API spec describes the view itself, not a saved reference, so its runtime ID stays local.
  const needsInlineIds = session.tabs.some((tab) => {
    const dataView = getInlineDataView(tab.serializedSearchSource);
    return dataView !== undefined && dataView.id === undefined;
  });
  if (!needsInlineIds) {
    // Legacy sessions already have IDs. Returning them unchanged preserves that behavior without a flag.
    return session;
  }

  const restoredDataViews = new Map<string, DataViewSpec>();
  const inlineDataViewIds = new Map<string, string>();
  for (const tab of tabs) {
    const dataView = getInlineDataView(tab.initialInternalState?.serializedSearchSource);
    if (dataView?.id) {
      restoredDataViews.set(tab.id, dataView);
      inlineDataViewIds.set(getDataViewSpecKey(dataView), dataView.id);
    }
  }

  const locationDataView = getInlineDataView({ index: navigation?.dataViewSpec });
  const targetTab = session.tabs.find((tab) => tab.id === navigation?.tabId);
  const targetDataView = getInlineDataView(targetTab?.serializedSearchSource);
  if (targetTab && targetDataView && locationDataView?.id) {
    const specKey = getDataViewSpecKey(locationDataView);
    if (specKey === getDataViewSpecKey(targetDataView)) {
      // Loading gives the link precedence over storage. Reuse its ID only for an unchanged view.
      restoredDataViews.set(targetTab.id, locationDataView);
      inlineDataViewIds.set(specKey, locationDataView.id);
    }
  }

  const sessionTabs = session.tabs.map((tab) => {
    const searchSource = assignInlineDataViewId(
      tab.serializedSearchSource,
      restoredDataViews.get(tab.id),
      inlineDataViewIds
    );
    if (searchSource === tab.serializedSearchSource) {
      return tab;
    }
    return { ...tab, serializedSearchSource: searchSource };
  });

  return {
    ...session,
    tabs: sessionTabs,
  };
};

/** Assigns an ID only when absent; an unchanged restored view takes precedence over deduplication. */
const assignInlineDataViewId = (
  searchSource: SerializedSearchSourceFields,
  restoredDataView: DataViewSpec | undefined,
  inlineDataViewIds: Map<string, string>
) => {
  const dataView = getInlineDataView(searchSource);
  if (!dataView || dataView.id !== undefined) {
    return searchSource;
  }

  const specKey = getDataViewSpecKey(dataView);
  let dataViewId = inlineDataViewIds.get(specKey);
  if (restoredDataView?.id && getDataViewSpecKey(restoredDataView) === specKey) {
    dataViewId = restoredDataView.id;
  }
  dataViewId ??= uuidv4();
  inlineDataViewIds.set(specKey, dataViewId);

  return {
    ...searchSource,
    index: { ...dataView, id: dataViewId },
    filter: assignFilterDataViewId(searchSource.filter, dataViewId),
  };
};

/** Finds classic inline specs without treating ES|QL's generated Data Views as classic ones. */
const getInlineDataView = (searchSource: SerializedSearchSourceFields | undefined) => {
  if (isOfAggregateQueryType(searchSource?.query)) {
    return undefined;
  }
  const index = searchSource?.index;
  if (!index || typeof index === 'string' || !index.title) {
    return undefined;
  }
  return index;
};

/** Compares saved and local specs in the API format, excluding local-only fields such as the ID. */
const getDataViewSpecKey = (dataView: DataViewSpec) =>
  stableStringify(
    fromStoredDataView({
      ...dataView,
      // DataView.toMinimalSpec() includes this default even when the API document omits it.
      allowHidden: dataView.allowHidden ?? false,
    })
  );

/** Binds filters without an explicit Data View, keeping references to other Data Views unchanged. */
const assignFilterDataViewId = (filters: Filter[] | undefined, dataViewId: string) =>
  filters?.map((filter) => {
    if (filter.meta.index !== undefined) {
      return filter;
    }
    return { ...filter, meta: { ...filter.meta, index: dataViewId } };
  });
