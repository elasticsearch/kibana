/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DATA_VIEW_SAVED_OBJECT_TYPE } from '@kbn/data-views-plugin/common';
import { fieldStatsTableEmbeddableSchema } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';
import type { FieldStatsTableEmbeddableState } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';
import { FIELD_STATS_DATA_VIEW_REF_NAME } from './constants';
import { transformIn } from './transform_in';
import { transformOut } from './transform_out';
import type { RawFieldStatsState } from './normalize_legacy_state';
import type { StoredFieldStatisticsTableEmbeddableState } from './types';

const dataViewReference = {
  id: 'data-view-id',
  name: FIELD_STATS_DATA_VIEW_REF_NAME,
  type: DATA_VIEW_SAVED_OBJECT_TYPE,
};

const dataViewState: FieldStatsTableEmbeddableState = {
  title: 'Field stats',
  view_type: 'dataview',
  data_view_id: 'data-view-id',
  show_distributions: true,
};

const esqlState: FieldStatsTableEmbeddableState = {
  title: 'Field stats ES|QL',
  view_type: 'esql',
  query: { esql: 'FROM logs-* | LIMIT 10' },
  show_distributions: false,
};

describe('field statistics embeddable transforms', () => {
  it('extracts the data view reference for data view state', () => {
    expect(transformIn(dataViewState)).toEqual({
      state: {
        title: 'Field stats',
        view_type: 'dataview',
        show_distributions: true,
      },
      references: [dataViewReference],
    });
  });

  it('does not extract references for ES|QL state', () => {
    expect(transformIn(esqlState)).toEqual({
      state: esqlState,
      references: [],
    });
  });

  it('resolves the data view reference into the data view branch', () => {
    const storedState: StoredFieldStatisticsTableEmbeddableState = {
      title: 'Field stats',
      view_type: 'dataview',
      show_distributions: true,
    };

    expect(transformOut(storedState, [dataViewReference])).toEqual(dataViewState);
  });

  it('keeps ES|QL state on the ES|QL branch without data_view_id', () => {
    const result = transformOut(esqlState, [dataViewReference]);

    expect(result).toEqual(esqlState);
    expect('data_view_id' in result).toBe(false);
  });

  it('normalizes and strips legacy camelCase fields', () => {
    const legacyStoredState = {
      title: 'Legacy field stats',
      timeRange: { from: 'now-7d', to: 'now' },
      hidePanelTitles: true,
      viewType: 'dataview',
      showDistributions: true,
    } as RawFieldStatsState;

    expect(transformOut(legacyStoredState, [dataViewReference])).toEqual({
      title: 'Legacy field stats',
      time_range: { from: 'now-7d', to: 'now' },
      hide_title: true,
      view_type: 'dataview',
      data_view_id: 'data-view-id',
      show_distributions: true,
    });
  });

  it('derives legacy state without viewType from query presence', () => {
    const legacyEsqlStoredState = {
      query: { esql: 'FROM logs-* | LIMIT 10' },
      showDistributions: true,
    } satisfies RawFieldStatsState;

    expect(transformOut(legacyEsqlStoredState)).toEqual({
      view_type: 'esql',
      query: { esql: 'FROM logs-* | LIMIT 10' },
      show_distributions: true,
    });

    const legacyDataViewStoredState = {
      showDistributions: false,
    } satisfies RawFieldStatsState;

    expect(transformOut(legacyDataViewStoredState, [dataViewReference])).toEqual({
      view_type: 'dataview',
      data_view_id: 'data-view-id',
      show_distributions: false,
    });
  });

  it('round-trips both branches through stored state', () => {
    const dataViewStored = transformIn(dataViewState);
    expect(transformOut(dataViewStored.state, dataViewStored.references)).toEqual(dataViewState);

    const esqlStored = transformIn(esqlState);
    expect(transformOut(esqlStored.state, esqlStored.references)).toEqual(esqlState);
  });

  it('validates representative current and legacy panels against the schema', () => {
    const currentDataViewStored = transformIn(dataViewState);
    const currentEsqlStored = transformIn(esqlState);
    const legacyDataViewStoredState = {
      viewType: 'dataview',
      showDistributions: true,
    } satisfies RawFieldStatsState;
    const legacyEsqlStoredState = {
      query: { esql: 'FROM logs-* | LIMIT 10' },
      showDistributions: false,
    } satisfies RawFieldStatsState;

    expect(() =>
      fieldStatsTableEmbeddableSchema.validate(
        transformOut(currentDataViewStored.state, currentDataViewStored.references)
      )
    ).not.toThrow();
    expect(() =>
      fieldStatsTableEmbeddableSchema.validate(
        transformOut(currentEsqlStored.state, currentEsqlStored.references)
      )
    ).not.toThrow();
    expect(() =>
      fieldStatsTableEmbeddableSchema.validate(
        transformOut(legacyDataViewStoredState, [dataViewReference])
      )
    ).not.toThrow();
    expect(() =>
      fieldStatsTableEmbeddableSchema.validate(transformOut(legacyEsqlStoredState))
    ).not.toThrow();
  });
});
