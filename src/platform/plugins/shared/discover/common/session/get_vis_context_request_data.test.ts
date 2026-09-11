/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { UnifiedHistogramSuggestionType } from '@kbn/discover-session-constants';
import type { DiscoverSessionApiEsqlTab } from '@kbn/as-code-discover-schema';
import { getVisContextRequestData } from './get_vis_context_request_data';

describe('getVisContextRequestData', () => {
  it('extracts the data view ID and time field from an ES|QL chart', () => {
    const attributes = createAttributes({
      layers: { 'layer-1': { index: 'esql-dv' } },
      dataViews: { 'esql-dv': { type: 'esql', timeFieldName: '@timestamp' } },
    });

    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({
      dataViewId: 'esql-dv',
      timeField: '@timestamp',
    });
  });

  it('uses the data view shared by the layers and ignores unused specs', () => {
    const attributes = createAttributes({
      layers: { 'layer-1': { index: 'esql-dv' }, 'layer-2': { index: 'esql-dv' } },
      dataViews: {
        'unused-esql-dv': { type: 'esql', timeFieldName: 'event.ingested' },
        'esql-dv': { type: 'esql', timeFieldName: '@timestamp' },
      },
    });

    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({
      dataViewId: 'esql-dv',
      timeField: '@timestamp',
    });
  });

  it('returns an empty fingerprint when layers refer to different data views', () => {
    const attributes = createAttributes({
      layers: { 'layer-1': { index: 'esql-dv-a' }, 'layer-2': { index: 'esql-dv-b' } },
      dataViews: {
        'esql-dv-a': { type: 'esql', timeFieldName: '@timestamp' },
        'esql-dv-b': { type: 'esql', timeFieldName: '@timestamp' },
      },
    });

    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({});
  });

  it.each([undefined, ''])('omits an absent or empty time field (%s)', (timeFieldName) => {
    const attributes = createAttributes({
      layers: { 'layer-1': { index: 'esql-dv' } },
      dataViews: { 'esql-dv': { type: 'esql', timeFieldName } },
    });

    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({
      dataViewId: 'esql-dv',
    });
  });

  it.each([
    { name: 'missing layers', attributes: {} },
    {
      name: 'non-object layers',
      attributes: { state: { datasourceStates: { textBased: { layers: [] } } } },
    },
    {
      name: 'missing data view specs',
      attributes: {
        state: { datasourceStates: { textBased: { layers: { 'layer-1': { index: 'esql-dv' } } } } },
      },
    },
  ])('returns an empty fingerprint for $name', ({ attributes }) => {
    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({});
  });

  it.each<{ name: string } & Parameters<typeof createAttributes>[0]>([
    {
      name: 'no referenced data view',
      layers: { 'layer-1': { index: '' } },
      dataViews: {},
    },
    {
      name: 'missing referenced spec',
      layers: { 'layer-1': { index: 'esql-dv' } },
      dataViews: {},
    },
    {
      name: 'non-ES|QL data view',
      layers: { 'layer-1': { index: 'a-persisted-dv' } },
      dataViews: { 'a-persisted-dv': { type: 'index-pattern' } },
    },
  ])('returns an empty fingerprint for $name', ({ layers, dataViews }) => {
    const attributes = createAttributes({ layers, dataViews });
    expect(getVisContextRequestData(createTab(attributes))).toStrictEqual({});
  });
});

const createTab = (attributes: Record<string, unknown>): DiscoverSessionApiEsqlTab => ({
  id: 'esql-tab',
  label: 'ES|QL',
  type: 'default',
  data_source: { type: 'esql', query: 'FROM logs-*' },
  sort: [],
  hide_chart: false,
  hide_table: false,
  vis_context: {
    suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
    attributes,
  },
});

const createAttributes = ({
  layers,
  dataViews,
}: {
  layers: Record<string, { index: string }>;
  dataViews: Record<string, { type: string; timeFieldName?: string }>;
}) => ({
  state: {
    datasourceStates: { textBased: { layers } },
    adHocDataViews: dataViews,
  },
});
