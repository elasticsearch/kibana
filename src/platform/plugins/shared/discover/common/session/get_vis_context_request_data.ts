/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_SPEC_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { ESQL_TYPE } from '@kbn/data-view-utils';
import { get, isUndefined, omitBy } from 'lodash';
import type { DiscoverSessionApiTab } from '@kbn/as-code-discover-schema';

/** Rebuilds the chart fingerprint from its ES|QL attributes, falling back to available tab fields. */
export const getVisContextRequestData = (tab: DiscoverSessionApiTab) => {
  const breakdownField = tab.breakdown_field || undefined;
  const esqlFingerprint = tab.vis_context
    ? extractEsqlFingerprint(tab.vis_context.attributes)
    : undefined;

  // A classic tab can still hold an ES|QL chart after switching modes.
  if (esqlFingerprint) {
    // ES|QL charts do not use Discover's chart interval in their fingerprint.
    return omitBy({ ...esqlFingerprint, breakdownField }, isUndefined);
  }

  const { data_source: dataSource } = tab;
  const dataViewId = 'ref_id' in dataSource ? dataSource.ref_id : undefined;
  const timeField =
    dataSource.type === AS_CODE_DATA_VIEW_SPEC_TYPE ? dataSource.time_field : undefined;
  const timeInterval =
    dataSource.type === AS_CODE_ESQL_DATA_SOURCE_TYPE ? undefined : tab.chart_interval;

  return omitBy({ dataViewId, timeField, timeInterval, breakdownField }, isUndefined);
};

/** Reads the ES|QL data view ID and time field from a chart with one referenced data view. */
const extractEsqlFingerprint = (
  attributes: Record<string, unknown>
): { dataViewId: string; timeField?: string } | undefined => {
  const layers = get(attributes, 'state.datasourceStates.textBased.layers');
  if (!isRecord(layers)) {
    return undefined;
  }

  const referencedDataViewIds = new Set<string>();

  for (const layer of Object.values(layers)) {
    if (isRecord(layer) && typeof layer.index === 'string' && layer.index.length > 0) {
      referencedDataViewIds.add(layer.index);
    }
  }

  // Multiple layers can share a data view, but different data views cannot give us one fingerprint.
  if (referencedDataViewIds.size !== 1) {
    return undefined;
  }

  const [dataViewId] = referencedDataViewIds;
  const adHocDataViews = get(attributes, 'state.adHocDataViews');
  if (!isRecord(adHocDataViews)) {
    return undefined;
  }

  const lensDataViewSpec = adHocDataViews[dataViewId];
  if (!isRecord(lensDataViewSpec) || lensDataViewSpec.type !== ESQL_TYPE) {
    return undefined;
  }

  const { timeFieldName } = lensDataViewSpec;
  if (typeof timeFieldName !== 'string' || timeFieldName === '') {
    return { dataViewId };
  }

  return { dataViewId, timeField: timeFieldName };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
