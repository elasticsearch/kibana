/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DataGridDensity } from '@kbn/discover-utils';
import type { TimeRange } from '@kbn/es-query';
import { omit } from 'lodash';
import { toSearchEmbeddableByValueState } from '../../common/agent_builder/to_search_embeddable_by_value_state';
import { NEW_TAB_ID } from '../../common/constants';
import type { DiscoverAppLocatorParams } from '../../common';
import type {
  DiscoverSessionApiData,
  DiscoverSessionApiEsqlTab,
  DiscoverSessionApiTab,
  DiscoverSessionEmbeddableByValueState,
} from '../../server';
import type { SearchEmbeddableInputState } from '../embeddable/types';

export const DEFAULT_DISCOVER_SESSION_TIME_RANGE: TimeRange = { from: 'now-24h', to: 'now' };

const isEsqlTab = (tab: DiscoverSessionApiTab): tab is DiscoverSessionApiEsqlTab =>
  tab.data_source.type === AS_CODE_ESQL_DATA_SOURCE_TYPE;

export const getDiscoverSessionSeedTimeRange = ({
  mappedTimeRange,
  screenContextTimeRange,
}: {
  mappedTimeRange?: TimeRange;
  screenContextTimeRange?: TimeRange;
}): TimeRange => mappedTimeRange ?? screenContextTimeRange ?? DEFAULT_DISCOVER_SESSION_TIME_RANGE;

export const buildDiscoverSessionEmbeddableInput = (
  data: DiscoverSessionApiData,
  timeRange: TimeRange
): DiscoverSessionEmbeddableByValueState &
  Pick<SearchEmbeddableInputState, 'nonPersistedDisplayOptions'> => {
  const mappedState = toSearchEmbeddableByValueState(data);
  const [tab] = mappedState.tabs;

  return {
    ...mappedState,
    tabs: [
      {
        ...tab,
        density: tab.density ?? DataGridDensity.COMPACT,
        header_row_height: tab.header_row_height ?? 1,
        row_height: tab.row_height ?? 1,
      },
    ],
    time_range: timeRange,
    nonPersistedDisplayOptions: {
      enableDocumentViewer: true,
      enableFilters: false,
      documentViewerFlyoutType: 'overlay',
      autoApplyDiscoverColumnDefaults: true,
      wrapToolbar: false,
      showKeyboardShortcuts: false,
      showSortSelector: false,
    },
  };
};

export const getDiscoverSessionLocatorParams = ({
  data,
  timeRange,
}: {
  data: DiscoverSessionApiData;
  timeRange: TimeRange;
}): DiscoverAppLocatorParams => {
  const [tab] = data.tabs;
  const params: DiscoverAppLocatorParams = {
    timeRange,
    hideChart: true,
    columns: tab.column_order,
    sort: tab.sort?.map((entry) => [entry.name, entry.direction]),
    tab: { id: NEW_TAB_ID, label: data.title },
  };

  if (isEsqlTab(tab)) {
    params.query = { esql: tab.data_source.query };
    return params;
  }

  if (tab.data_source.type === AS_CODE_DATA_VIEW_REFERENCE_TYPE) {
    params.dataViewId = tab.data_source.ref_id;
  }

  if (tab.query) {
    params.query = {
      query: tab.query.expression,
      language: tab.query.language === 'kql' ? 'kuery' : tab.query.language,
    };
  }

  return params;
};

export const isDiscoverSessionByValueState = (
  state: unknown
): state is DiscoverSessionEmbeddableByValueState =>
  typeof state === 'object' &&
  state !== null &&
  'tabs' in state &&
  Array.isArray((state as { tabs: unknown }).tabs);

export const buildDiscoverSessionDashboardSaveState = ({
  liveState,
  visibleColumns,
  title,
  description,
}: {
  liveState: DiscoverSessionEmbeddableByValueState;
  visibleColumns?: string[];
  title: string;
  description?: string;
}): DiscoverSessionEmbeddableByValueState => {
  const rest = omit(liveState, ['time_range', 'nonPersistedDisplayOptions']) as Omit<
    DiscoverSessionEmbeddableByValueState,
    'time_range'
  >;
  const [tab, ...otherTabs] = rest.tabs;

  return {
    ...rest,
    title,
    description,
    tabs: [
      {
        ...tab,
        ...(visibleColumns !== undefined ? { column_order: visibleColumns } : {}),
      },
      ...otherTabs,
    ],
  };
};
