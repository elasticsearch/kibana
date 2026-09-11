/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Filter } from '@kbn/es-query';
import type { State } from '../../common/store/types';
import type { DataProvider } from '../components/timeline/data_providers/data_provider';
import { selectDataInTimeline } from './selectors';

const timelineId = 'timeline-1';

const buildState = (timeline: Record<string, unknown>): State =>
  ({
    timeline: {
      timelineById: {
        [timelineId]: timeline,
      },
    },
  } as unknown as State);

const enabledFilter = {
  meta: { disabled: false },
  query: { match_phrase: { 'host.name': 'host-a' } },
} as Filter;

const disabledFilter = {
  meta: { disabled: true },
  query: { match_phrase: { 'host.name': 'host-a' } },
} as Filter;

describe('selectDataInTimeline', () => {
  it('returns false when the timeline has no dataProviders, kqlQuery expression, or filters', () => {
    const state = buildState({
      dataProviders: [],
      kqlQuery: { filterQuery: null },
      filters: [],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(false);
  });

  it('returns true when the timeline has dataProviders', () => {
    const state = buildState({
      dataProviders: [{ id: 'provider-1' }] as unknown as DataProvider[],
      kqlQuery: { filterQuery: null },
      filters: [],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(true);
  });

  it('returns true when the timeline has a kqlQuery filterQuery expression', () => {
    const state = buildState({
      dataProviders: [],
      kqlQuery: {
        filterQuery: { kuery: { kind: 'kuery', expression: 'host.name: "host-a"' } },
      },
      filters: [],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(true);
  });

  it('returns true when the timeline has at least one enabled filter (bulk Investigate in Timeline case)', () => {
    const state = buildState({
      dataProviders: [],
      kqlQuery: { filterQuery: null },
      filters: [enabledFilter],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(true);
  });

  it('returns false when the timeline only has disabled filters', () => {
    const state = buildState({
      dataProviders: [],
      kqlQuery: { filterQuery: null },
      filters: [disabledFilter],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(false);
  });

  it('returns true when at least one filter is enabled among a mix of enabled and disabled filters', () => {
    const state = buildState({
      dataProviders: [],
      kqlQuery: { filterQuery: null },
      filters: [disabledFilter, enabledFilter],
    });

    expect(selectDataInTimeline(state, timelineId)).toBe(true);
  });
});
