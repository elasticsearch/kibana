/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dateMath from '@kbn/datemath';
import type { DataView } from '@kbn/data-plugin/common';
import type { EsQueryConfig } from '@kbn/es-query';
import { buildCombinedFilter, BooleanRelation, FilterStateStore } from '@kbn/es-query';
import type { BrowserFields } from '../../../../common/search_strategy';
import type { ColumnHeaderOptions } from '../../../../common/types/timeline';
import type { TimelineModel } from '../../store/model';
import { timelineDefaults } from '../../store/defaults';
import { combineQueries } from '../../../common/lib/kuery';

export const SUPER_TIMELINE_TITLE = 'Super Timeline';
export const SUPER_TIMELINE_QUERY_ALIAS = 'Super Timeline Sources';

export type SkippedQueryReason = 'eql' | 'esql';

export interface SkippedQueryTimeline {
  id: string;
  title: string;
  reason: SkippedQueryReason;
}

export interface BuildSuperTimelineModelDeps {
  dataView: DataView;
  browserFields: BrowserFields;
  esQueryConfig: EsQueryConfig;
}

export interface BuildSuperTimelineModelResult {
  model: TimelineModel;
  /** Source timelines whose query type (EQL/ESQL) couldn't be merged. Their pins and notes still aggregate. */
  skippedQueryTimelines: SkippedQueryTimeline[];
}

/**
 * Merges N fully-resolved TimelineModels into a single transient Super Timeline model.
 *
 * What this does:
 * - Unions pinnedEventIds (deduped by key)
 * - Unions eventIdToNoteIds + noteIds (references only — no note objects are cloned)
 * - Combines all KQL/filter queries into a single OR CombinedFilter (one labelled sub-filter per
 *   source timeline). Timelines with EQL-only or ESQL-only queries contribute no sub-filter but
 *   are reported in `skippedQueryTimelines` so the caller can warn the user.
 * - Sets dateRange to the union of all source ranges (earliest start → latest end).
 * - Unions the column sets (first-seen order, falling back to defaultColumns).
 *
 * The returned model has `isSuperTimeline: true` and `superTimelineSourceIds` set.
 * It is NOT persisted — the persist path (`convertTimelineAsInput`) is an allow-list and neither
 * field is included, matching the existing pattern for runtime-only fields like `savedSearch` and
 * `changed`.
 */
export const buildSuperTimelineModel = (
  timelines: TimelineModel[],
  deps: BuildSuperTimelineModelDeps
): BuildSuperTimelineModelResult => {
  const { dataView, browserFields, esQueryConfig } = deps;
  const skippedQueryTimelines: SkippedQueryTimeline[] = [];

  if (timelines.length === 0) {
    return {
      model: {
        ...timelineDefaults,
        id: '',
        title: SUPER_TIMELINE_TITLE,
        isSuperTimeline: true,
        superTimelineSourceIds: [],
      } as TimelineModel,
      skippedQueryTimelines,
    };
  }

  // ── Pinned events ────────────────────────────────────────────────────────────
  const pinnedEventIds: Record<string, boolean> = {};
  const pinnedEventsSaveObject: TimelineModel['pinnedEventsSaveObject'] = {};

  for (const timeline of timelines) {
    Object.assign(pinnedEventIds, timeline.pinnedEventIds);
    Object.assign(pinnedEventsSaveObject, timeline.pinnedEventsSaveObject);
  }

  // ── Notes (reference union — no duplication) ─────────────────────────────────
  const noteIds: string[] = [];
  const seenNoteIds = new Set<string>();
  const eventIdToNoteIds: Record<string, string[]> = {};

  for (const timeline of timelines) {
    for (const noteId of timeline.noteIds) {
      if (!seenNoteIds.has(noteId)) {
        seenNoteIds.add(noteId);
        noteIds.push(noteId);
      }
    }
    for (const [eventId, ids] of Object.entries(timeline.eventIdToNoteIds)) {
      const existing = eventIdToNoteIds[eventId] ?? [];
      const merged = [...existing];
      for (const id of ids) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      eventIdToNoteIds[eventId] = merged;
    }
  }

  // ── Query merging: one CombinedFilter with OR semantics ──────────────────────
  const subFilters: Array<{ meta: object; query: object }> = [];

  for (const timeline of timelines) {
    const title = timeline.title || timeline.savedObjectId || 'Untitled Timeline';
    const id = timeline.savedObjectId ?? '';

    // Use persisted fields to identify the primary query mode — NOT activeTab, which
    // is runtime-only and always resets to TimelineTabs.query after formatTimelineResponseToModel.
    // savedSearchId is the canonical ESQL indicator (persisted). eqlOptions.query is the
    // canonical EQL indicator (persisted). Both survive a resolveTimeline → model round-trip.
    const isEsqlTimeline = !!timeline.savedSearchId;
    const isEqlTimeline = !isEsqlTimeline && !!timeline.eqlOptions?.query?.trim();

    if (isEqlTimeline || isEsqlTimeline) {
      skippedQueryTimelines.push({
        id,
        title,
        reason: isEsqlTimeline ? 'esql' : 'eql',
      });
    } else {
      const kqlQuery = {
        query: timeline.kqlQuery?.filterQuery?.kuery?.expression ?? '',
        language: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
      };

      const combined = combineQueries({
        config: esQueryConfig,
        dataProviders: timeline.dataProviders ?? [],
        dataView,
        browserFields,
        filters: timeline.filters ?? [],
        kqlQuery,
        kqlMode: timeline.kqlMode ?? 'filter',
      });

      if (combined?.filterQuery) {
        subFilters.push({
          meta: {
            alias: title,
            type: 'custom',
            disabled: false,
            negate: false,
            key: 'query',
          },
          query: JSON.parse(combined.filterQuery),
        });
      }
    }
  }

  const mergedFilters =
    subFilters.length > 0
      ? [
          buildCombinedFilter(
            BooleanRelation.OR,
            subFilters as Parameters<typeof buildCombinedFilter>[1],
            { id: dataView.id },
            false,
            false,
            SUPER_TIMELINE_QUERY_ALIAS,
            FilterStateStore.APP_STATE
          ),
        ]
      : [];

  // ── Date range: earliest start → latest end ──────────────────────────────────
  // dateRange strings can be relative (e.g. "now-7d") or absolute ISO. Parse to
  // milliseconds before comparing so relative strings sort correctly.
  const dateRange = timelines.reduce(
    (acc, timeline) => {
      const startMs = dateMath.parse(timeline.dateRange.start)?.valueOf() ?? Infinity;
      const endMs =
        dateMath.parse(timeline.dateRange.end, { roundUp: true })?.valueOf() ?? -Infinity;
      const accStartMs = acc.start ? dateMath.parse(acc.start)?.valueOf() ?? Infinity : Infinity;
      const accEndMs = acc.end
        ? dateMath.parse(acc.end, { roundUp: true })?.valueOf() ?? -Infinity
        : -Infinity;
      return {
        start: startMs < accStartMs ? timeline.dateRange.start : acc.start,
        end: endMs > accEndMs ? timeline.dateRange.end : acc.end,
      };
    },
    { start: '', end: '' }
  );

  // ── Columns: union in first-seen order ───────────────────────────────────────
  const seenColumnIds = new Set<string>();
  const columns: ColumnHeaderOptions[] = [];

  for (const timeline of timelines) {
    for (const col of timeline.columns) {
      if (!seenColumnIds.has(col.id)) {
        seenColumnIds.add(col.id);
        columns.push(col);
      }
    }
  }
  const finalColumns = columns.length > 0 ? columns : timelineDefaults.defaultColumns;

  // ── Index names / data view: union ───────────────────────────────────────────
  const seenIndexNames = new Set<string>();
  for (const timeline of timelines) {
    for (const name of timeline.indexNames) {
      seenIndexNames.add(name);
    }
  }
  const indexNames = Array.from(seenIndexNames);

  // ── Source ids ───────────────────────────────────────────────────────────────
  const superTimelineSourceIds = timelines
    .map((t) => t.savedObjectId)
    .filter((id): id is string => id !== null);

  const model: TimelineModel = {
    ...timelineDefaults,
    id: '',
    title: SUPER_TIMELINE_TITLE,
    pinnedEventIds,
    pinnedEventsSaveObject,
    noteIds,
    eventIdToNoteIds,
    filters: mergedFilters,
    // Clear KQL / data providers — queries live entirely in the CombinedFilter above
    dataProviders: [],
    kqlQuery: { filterQuery: null },
    dateRange,
    columns: finalColumns,
    defaultColumns: finalColumns,
    indexNames,
    // savedObjectId null: this timeline is never persisted
    savedObjectId: null,
    // isSuperTimeline gates all read-only behaviour (CTA hiding, notes multi-fetch, etc.)
    // runtime-only, not persisted (not in convertTimelineAsInput allow-list)
    isSuperTimeline: true,
    // runtime-only, not persisted
    superTimelineSourceIds,
  };

  return { model, skippedQueryTimelines };
};
