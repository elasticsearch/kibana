/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import { isCombinedFilter, BooleanRelation } from '@kbn/es-query';
import type { CombinedFilter } from '@kbn/es-query';
import type { ColumnHeaderOptions } from '../../../../common/types/timeline';
import type { DataProvider } from '../../../../common/types';
import type { TimelineModel } from '../../store/model';
import { timelineDefaults } from '../../store/defaults';
import {
  buildSuperTimelineModel,
  SUPER_TIMELINE_TITLE,
  SUPER_TIMELINE_QUERY_ALIAS,
} from './build_super_timeline_model';

const mockDataView = createStubDataView({ spec: { id: 'mock-data-view' } });
const mockBrowserFields = {};
const mockEsQueryConfig = { allowLeadingWildcards: true, queryStringOptions: {} };

const deps = {
  dataView: mockDataView,
  browserFields: mockBrowserFields,
  esQueryConfig: mockEsQueryConfig,
};

/** Builds a minimal TimelineModel for testing */
const makeTimeline = (overrides: Partial<TimelineModel>): TimelineModel => ({
  ...(timelineDefaults as unknown as TimelineModel),
  id: 'timeline-1',
  savedObjectId: 'saved-obj-1',
  title: 'Timeline 1',
  pinnedEventIds: {},
  pinnedEventsSaveObject: {},
  noteIds: [],
  eventIdToNoteIds: {},
  dataProviders: [],
  kqlQuery: { filterQuery: null },
  filters: [],
  dateRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' },
  columns: [],
  defaultColumns: timelineDefaults.defaultColumns,
  indexNames: ['logs-*'],
  eqlOptions: {
    eventCategoryField: 'event.category',
    timestampField: '@timestamp',
    query: '',
    size: 100,
  },
  savedSearchId: null,
  savedSearch: null,
  ...overrides,
});

describe('buildSuperTimelineModel', () => {
  describe('basic structure', () => {
    it('returns a model with isSuperTimeline: true and SUPER_TIMELINE_TITLE', () => {
      const { model } = buildSuperTimelineModel([makeTimeline({})], deps);
      expect(model.isSuperTimeline).toBe(true);
      expect(model.title).toBe(SUPER_TIMELINE_TITLE);
    });

    it('carries the source savedObjectIds in superTimelineSourceIds', () => {
      const t1 = makeTimeline({ savedObjectId: 'id-a' });
      const t2 = makeTimeline({ savedObjectId: 'id-b' });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      expect(model.superTimelineSourceIds).toEqual(['id-a', 'id-b']);
    });

    it('sets savedObjectId to null (transient, never persisted)', () => {
      const { model } = buildSuperTimelineModel([makeTimeline({})], deps);
      expect(model.savedObjectId).toBeNull();
    });

    it('clears dataProviders and kqlQuery (query lives in CombinedFilter)', () => {
      const dataProvider: DataProvider = {
        id: 'dp-1',
        name: 'host',
        enabled: true,
        excluded: false,
        kqlQuery: '',
        queryMatch: { field: 'host.name', value: 'foo', operator: ':' },
        and: [],
      };
      const t = makeTimeline({
        dataProviders: [dataProvider],
        kqlQuery: {
          filterQuery: {
            kuery: { kind: 'kuery', expression: 'host.name: foo' },
            serializedQuery: '',
          },
        },
      });
      const { model } = buildSuperTimelineModel([t], deps);
      expect(model.dataProviders).toEqual([]);
      expect(model.kqlQuery.filterQuery).toBeNull();
    });

    it('returns an empty model when no timelines are provided', () => {
      const { model, skippedQueryTimelines } = buildSuperTimelineModel([], deps);
      expect(model.isSuperTimeline).toBe(true);
      expect(model.superTimelineSourceIds).toEqual([]);
      expect(skippedQueryTimelines).toEqual([]);
    });
  });

  describe('pinned event union', () => {
    it('unions pinned events across timelines', () => {
      const t1 = makeTimeline({ pinnedEventIds: { 'event-a': true, 'event-b': true } });
      const t2 = makeTimeline({ pinnedEventIds: { 'event-c': true } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      expect(model.pinnedEventIds).toEqual({
        'event-a': true,
        'event-b': true,
        'event-c': true,
      });
    });

    it('deduplicates overlapping pinned events without duplicating the entry', () => {
      const t1 = makeTimeline({ pinnedEventIds: { 'event-shared': true } });
      const t2 = makeTimeline({ pinnedEventIds: { 'event-shared': true } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      // Record deduplication: key exists once
      expect(Object.keys(model.pinnedEventIds)).toHaveLength(1);
      expect(model.pinnedEventIds['event-shared']).toBe(true);
    });
  });

  describe('note union (reference-only, no duplication)', () => {
    it('unions noteIds across timelines without duplicating shared notes', () => {
      const t1 = makeTimeline({ noteIds: ['note-1', 'note-shared'] });
      const t2 = makeTimeline({ noteIds: ['note-2', 'note-shared'] });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      // note-shared appears once
      expect(model.noteIds).toEqual(['note-1', 'note-shared', 'note-2']);
    });

    it('merges eventIdToNoteIds without duplicating note references on shared events', () => {
      const t1 = makeTimeline({ eventIdToNoteIds: { 'event-x': ['note-1', 'note-shared'] } });
      const t2 = makeTimeline({ eventIdToNoteIds: { 'event-x': ['note-2', 'note-shared'] } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      const notes = model.eventIdToNoteIds['event-x'];
      expect(notes).toContain('note-1');
      expect(notes).toContain('note-2');
      expect(notes).toContain('note-shared');
      // note-shared must appear only once
      expect(notes.filter((n) => n === 'note-shared')).toHaveLength(1);
    });

    it('combines eventIdToNoteIds from separate events', () => {
      const t1 = makeTimeline({ eventIdToNoteIds: { 'event-a': ['note-1'] } });
      const t2 = makeTimeline({ eventIdToNoteIds: { 'event-b': ['note-2'] } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      expect(model.eventIdToNoteIds['event-a']).toEqual(['note-1']);
      expect(model.eventIdToNoteIds['event-b']).toEqual(['note-2']);
    });
  });

  describe('date range union', () => {
    it('sets the earliest start and latest end across all timelines', () => {
      const t1 = makeTimeline({
        dateRange: { start: '2024-01-03T00:00:00.000Z', end: '2024-01-05T00:00:00.000Z' },
      });
      const t2 = makeTimeline({
        dateRange: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-07T00:00:00.000Z' },
      });
      const t3 = makeTimeline({
        dateRange: { start: '2024-01-02T00:00:00.000Z', end: '2024-01-06T00:00:00.000Z' },
      });
      const { model } = buildSuperTimelineModel([t1, t2, t3], deps);
      expect(model.dateRange.start).toBe('2024-01-01T00:00:00.000Z');
      expect(model.dateRange.end).toBe('2024-01-07T00:00:00.000Z');
    });

    it('correctly unions relative date strings (now-7d is earlier than now-24h)', () => {
      // Lexicographic comparison gets this wrong: '7' > '2', so 'now-7d' < 'now-24h' is
      // false by char code, but now-7d is actually an earlier point in time than now-24h.
      const t1 = makeTimeline({ dateRange: { start: 'now-24h', end: 'now' } });
      const t2 = makeTimeline({ dateRange: { start: 'now-7d', end: 'now' } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      // now-7d is earlier, so it should win as the start
      expect(model.dateRange.start).toBe('now-7d');
      expect(model.dateRange.end).toBe('now');
    });

    it('unions mixed ISO and relative date strings correctly', () => {
      // ISO 2020-01-01 is always earlier than now-7d; ISO end 2021-01-01 is always earlier
      // than now. Verifies that ISO and relative strings can be compared across types.
      const t1 = makeTimeline({
        dateRange: { start: '2020-01-01T00:00:00.000Z', end: '2021-01-01T00:00:00.000Z' },
      });
      const t2 = makeTimeline({ dateRange: { start: 'now-7d', end: 'now' } });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      expect(model.dateRange.start).toBe('2020-01-01T00:00:00.000Z');
      expect(model.dateRange.end).toBe('now');
    });
  });

  describe('column union', () => {
    const col = (id: string): ColumnHeaderOptions => ({
      id,
      columnHeaderType: 'not-filtered',
      initialWidth: 100,
    });

    it('unions columns in first-seen order without duplicates', () => {
      const t1 = makeTimeline({ columns: [col('@timestamp'), col('host.name')] });
      const t2 = makeTimeline({ columns: [col('host.name'), col('user.name')] });
      const { model } = buildSuperTimelineModel([t1, t2], deps);
      expect(model.columns.map((c) => c.id)).toEqual(['@timestamp', 'host.name', 'user.name']);
    });

    it('falls back to defaultColumns when all source timelines have no columns', () => {
      const t1 = makeTimeline({ columns: [] });
      const { model } = buildSuperTimelineModel([t1], deps);
      expect(model.columns).toEqual(timelineDefaults.defaultColumns);
    });
  });

  describe('query merging — CombinedFilter', () => {
    it('produces one CombinedFilter with OR relation when timelines have KQL queries', () => {
      // Timelines with only filters (no KQL expression, no data providers) — combineQueries
      // returns a result when filters are non-empty
      const t1 = makeTimeline({
        title: 'Timeline A',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'host.name',
              params: { query: 'foo' },
            },
            query: { match_phrase: { 'host.name': 'foo' } },
          },
        ],
      });
      const t2 = makeTimeline({
        title: 'Timeline B',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'host.name',
              params: { query: 'bar' },
            },
            query: { match_phrase: { 'host.name': 'bar' } },
          },
        ],
      });

      const { model, skippedQueryTimelines } = buildSuperTimelineModel([t1, t2], deps);

      expect(skippedQueryTimelines).toHaveLength(0);
      expect(model.filters).toHaveLength(1);
      const combinedRaw = model.filters![0];
      expect(isCombinedFilter(combinedRaw)).toBe(true);
      const combined = combinedRaw as CombinedFilter;
      expect(combined.meta.relation).toBe(BooleanRelation.OR);
      expect(combined.meta.alias).toBe(SUPER_TIMELINE_QUERY_ALIAS);
      // One sub-filter per source timeline
      expect(combined.meta.params).toHaveLength(2);
    });

    it('produces the correct number of sub-filters for each source timeline', () => {
      // Note: buildCombinedFilter calls cleanUpFilter on each sub-filter, which strips meta.alias.
      // Individual sub-filters are identifiable by their DSL content, not by alias. The top-level
      // CombinedFilter pill is labelled via SUPER_TIMELINE_QUERY_ALIAS (tested above).
      const t1 = makeTimeline({
        title: 'Endpoint Investigation',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'process.name',
              params: { query: 'cmd.exe' },
            },
            query: { match_phrase: { 'process.name': 'cmd.exe' } },
          },
        ],
      });
      const t2 = makeTimeline({
        title: 'Network Investigation',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'network.direction',
              params: { query: 'egress' },
            },
            query: { match_phrase: { 'network.direction': 'egress' } },
          },
        ],
      });

      const { model } = buildSuperTimelineModel([t1, t2], deps);

      const combined = model.filters![0];
      // One sub-filter per source timeline
      expect(combined.meta.params).toHaveLength(2);
    });

    it('produces no filters when all timelines have empty queries', () => {
      const t1 = makeTimeline({ dataProviders: [], kqlQuery: { filterQuery: null }, filters: [] });
      const { model, skippedQueryTimelines } = buildSuperTimelineModel([t1], deps);
      expect(model.filters).toHaveLength(0);
      expect(skippedQueryTimelines).toHaveLength(0);
    });
  });

  describe('EQL / ESQL handling', () => {
    it('reports an EQL-only timeline in skippedQueryTimelines and still aggregates its pins/notes', () => {
      const eqlTimeline = makeTimeline({
        savedObjectId: 'eql-timeline',
        title: 'EQL Investigation',
        eqlOptions: {
          eventCategoryField: 'event.category',
          timestampField: '@timestamp',
          query: 'process where process.name == "cmd.exe"',
          size: 100,
        },
        dataProviders: [],
        kqlQuery: { filterQuery: null },
        filters: [],
        pinnedEventIds: { 'pinned-from-eql': true },
        noteIds: ['note-from-eql'],
      });

      const { model, skippedQueryTimelines } = buildSuperTimelineModel([eqlTimeline], deps);

      expect(skippedQueryTimelines).toHaveLength(1);
      expect(skippedQueryTimelines[0]).toMatchObject({
        id: 'eql-timeline',
        title: 'EQL Investigation',
        reason: 'eql',
      });
      // Pinned events and notes still aggregate
      expect(model.pinnedEventIds['pinned-from-eql']).toBe(true);
      expect(model.noteIds).toContain('note-from-eql');
      // But no query filter from this timeline
      expect(model.filters).toHaveLength(0);
    });

    it('reports an ESQL-only timeline in skippedQueryTimelines and still aggregates its pins/notes', () => {
      const esqlTimeline = makeTimeline({
        savedObjectId: 'esql-timeline',
        title: 'ESQL Investigation',
        savedSearchId: 'some-saved-search-id',
        eqlOptions: {
          eventCategoryField: 'event.category',
          timestampField: '@timestamp',
          query: '',
          size: 100,
        },
        dataProviders: [],
        kqlQuery: { filterQuery: null },
        filters: [],
        pinnedEventIds: { 'pinned-from-esql': true },
        noteIds: ['note-from-esql'],
      });

      const { model, skippedQueryTimelines } = buildSuperTimelineModel([esqlTimeline], deps);

      expect(skippedQueryTimelines).toHaveLength(1);
      expect(skippedQueryTimelines[0]).toMatchObject({
        id: 'esql-timeline',
        title: 'ESQL Investigation',
        reason: 'esql',
      });
      expect(model.pinnedEventIds['pinned-from-esql']).toBe(true);
      expect(model.noteIds).toContain('note-from-esql');
      expect(model.filters).toHaveLength(0);
    });

    it('merges KQL timelines and skips EQL/ESQL timelines in one call', () => {
      const kqlTimeline = makeTimeline({
        savedObjectId: 'kql-tl',
        title: 'KQL Timeline',
        filters: [
          {
            meta: {
              alias: null,
              negate: false,
              disabled: false,
              type: 'phrase',
              key: 'host.name',
              params: { query: 'web' },
            },
            query: { match_phrase: { 'host.name': 'web' } },
          },
        ],
      });
      const eqlTimeline = makeTimeline({
        savedObjectId: 'eql-tl',
        title: 'EQL Timeline',
        eqlOptions: {
          eventCategoryField: 'event.category',
          timestampField: '@timestamp',
          query: 'any where true',
          size: 100,
        },
        dataProviders: [],
        kqlQuery: { filterQuery: null },
        filters: [],
      });

      const { model, skippedQueryTimelines } = buildSuperTimelineModel(
        [kqlTimeline, eqlTimeline],
        deps
      );

      // KQL timeline contributes a sub-filter
      expect(model.filters).toHaveLength(1);
      expect(isCombinedFilter(model.filters![0])).toBe(true);
      expect((model.filters![0].meta.params as unknown[]).length).toBe(1);
      // EQL timeline is skipped
      expect(skippedQueryTimelines).toHaveLength(1);
      expect(skippedQueryTimelines[0].title).toBe('EQL Timeline');
    });

    it('skips an EQL timeline that has stale KQL filters from a prior query-tab visit', () => {
      // Detection keys off eqlOptions.query (persisted), not activeTab (runtime-only).
      // A timeline saved in EQL mode may still carry KQL filters from when the user
      // previously visited the Query tab. Stale filters must not be merged.
      const eqlWithStaleFilters = makeTimeline({
        savedObjectId: 'eql-stale',
        title: 'EQL with stale filters',
        eqlOptions: {
          eventCategoryField: 'event.category',
          timestampField: '@timestamp',
          query: 'process where process.name == "cmd.exe"',
          size: 100,
        },
        filters: [
          {
            meta: { alias: null, negate: false, disabled: false, type: 'phrase', key: 'host.name' },
            query: { match_phrase: { 'host.name': 'stale-host' } },
          },
        ],
      });

      const { model, skippedQueryTimelines } = buildSuperTimelineModel([eqlWithStaleFilters], deps);

      // Must be reported as skipped — stale filters must not be merged
      expect(skippedQueryTimelines).toHaveLength(1);
      expect(skippedQueryTimelines[0].reason).toBe('eql');
      expect(model.filters).toHaveLength(0);
    });

    it('does NOT skip a timeline that has activeTab=eql but an empty eqlOptions.query', () => {
      // activeTab is runtime-only and resets to TimelineTabs.query after formatTimelineResponseToModel.
      // A timeline that was opened in EQL mode but has no saved eqlOptions.query should be treated
      // as a KQL timeline (fall through to the query merge path).
      const kqlTimeline = makeTimeline({
        savedObjectId: 'kql-was-eql-tab',
        title: 'KQL (no EQL query saved)',
        eqlOptions: {
          eventCategoryField: 'event.category',
          timestampField: '@timestamp',
          query: '',
          size: 100,
        },
        filters: [
          {
            meta: { alias: null, negate: false, disabled: false, type: 'phrase', key: 'host.name' },
            query: { match_phrase: { 'host.name': 'some-host' } },
          },
        ],
      });

      const { skippedQueryTimelines } = buildSuperTimelineModel([kqlTimeline], deps);
      expect(skippedQueryTimelines).toHaveLength(0);
    });
  });
});
