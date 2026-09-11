/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  FIND_THREAT_REPORTS_DEFAULT_PAGE_SIZE,
  FIND_THREAT_REPORTS_MAX_PAGE_SIZE,
  THREAT_REPORTS_INDEX_PATTERN,
  type FindThreatReportsQuery,
  type FindThreatReportsResponse,
  type ThreatReportSort,
  type ThreatReportSummary,
} from '../../../common/threat_intel';
import { truncate } from './report_content';
import { HIDDEN_INDEX_SEARCH_OPTIONS } from '../lib/es_options';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import { decodeCursor, encodeCursor, InvalidCursorError } from '../lib/report_cursor';

const BODY_TEXT_SUMMARY_MAX = 280;
const IOC_SUMMARY_MAX = 25;

/** Long enough for a caller to turn a page; the PIT expires on its own if abandoned. */
const PIT_KEEP_ALIVE = '2m';

interface EsErrorCause {
  type?: string;
  caused_by?: EsErrorCause;
  reason?: EsErrorCause;
  failed_shards?: Array<{ reason?: EsErrorCause }>;
}

/**
 * True when a search failed because its point-in-time is gone (expired or
 * closed). ES reports this as an HTTP 404 whose top-level type is
 * `search_phase_execution_exception`; the real cause,
 * `search_context_missing_exception`, only appears in the per-shard reason (and
 * sometimes `caused_by`), so check all three rather than the top-level type.
 */
const isSearchContextMissing = (err: unknown): boolean => {
  const error = (err as { body?: { error?: EsErrorCause } })?.body?.error;
  if (!error) return false;
  const types = [
    error.type,
    error.caused_by?.type,
    ...(error.failed_shards ?? []).map((shard) => shard?.reason?.type),
  ];
  return types.includes('search_context_missing_exception');
};

/**
 * Usable bar: title or body text, nested IOCs, severity.level, and revision.
 * `extracted.iocs` is nested, so exists on the parent path matches nothing.
 */
export const USABLE_REPORT_FILTER: estypes.QueryDslQueryContainer = {
  bool: {
    filter: [
      {
        bool: {
          should: [
            { exists: { field: 'content.title' } },
            { exists: { field: 'content.body_text' } },
          ],
          minimum_should_match: 1,
        },
      },
      {
        nested: {
          path: 'extracted.iocs',
          query: {
            exists: { field: 'extracted.iocs.value' },
          },
        },
      },
      { exists: { field: 'severity.level' } },
      { exists: { field: 'revision' } },
    ],
  },
};

const toStringArray = (value: string | string[] | undefined): string[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

export const buildFindReportFilters = ({
  spaceId,
  source,
  severity,
  category,
  from,
  to,
  usableOnly,
}: {
  spaceId: string;
  source?: string;
  severity?: string | string[];
  category?: string | string[];
  from?: string;
  to?: string;
  usableOnly?: boolean;
}): estypes.QueryDslQueryContainer[] => {
  const filters: estypes.QueryDslQueryContainer[] = [buildSpaceFilterTerms(spaceId)];

  if (source) {
    filters.push({ term: { 'source.name': source } });
  }

  const severities = toStringArray(severity);
  if (severities.length > 0) {
    filters.push({ terms: { 'severity.level': severities } });
  }

  const categories = toStringArray(category);
  if (categories.length > 0) {
    filters.push({ terms: { 'extracted.categories': categories } });
  }

  if (from || to) {
    filters.push({
      range: {
        '@timestamp': {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
    });
  }

  if (usableOnly) {
    filters.push(USABLE_REPORT_FILTER);
  }

  return filters;
};

/**
 * `_shard_doc` is the `search_after` tiebreak, not `_id`: sorting on `_id` needs
 * fielddata, which is disabled by default (`indices.id_field_data.enabled`), so it
 * throws `Fielddata access on the _id field is disallowed` on every request.
 * `_shard_doc` is stable and globally unique but only exists inside a point-in-time,
 * which is why the search runs against a PIT. Matches the report scan in
 * `tasks/promote_threat_indicators.ts`.
 */
const buildSort = (sort: ThreatReportSort): estypes.Sort => {
  switch (sort) {
    case 'rank':
      return [
        { rank_score: { order: 'desc', missing: '_last' } },
        { _shard_doc: { order: 'asc' } },
      ];
    case 'updated_at':
      return [
        { 'lineage.extracted_at': { order: 'desc', missing: '_last' } },
        { _shard_doc: { order: 'asc' } },
      ];
    case 'relevance':
    default:
      return [
        { 'extracted.relevance': { order: 'desc', missing: '_last' } },
        { _shard_doc: { order: 'asc' } },
      ];
  }
};

interface ReportSourceDoc {
  revision?: number;
  content?: {
    title?: string;
    body_text?: string;
  };
  severity?: {
    level?: string;
    score?: number;
  };
  extracted?: {
    iocs?: Array<{ type?: string; value?: string }>;
    diamond?: {
      signal_count?: number;
      suitable?: boolean;
    };
  };
}

const mapHitToSummary = (hit: estypes.SearchHit<ReportSourceDoc>): ThreatReportSummary => {
  const source = hit._source ?? {};
  const title = source.content?.title;
  const bodyText = source.content?.body_text;
  const iocs = (source.extracted?.iocs ?? [])
    .filter(
      (ioc): ioc is { type: string; value: string } =>
        typeof ioc?.type === 'string' && typeof ioc?.value === 'string'
    )
    .slice(0, IOC_SUMMARY_MAX)
    .map((ioc) => ({ type: ioc.type, value: ioc.value }));

  const diamond = source.extracted?.diamond;
  const summary: ThreatReportSummary = {
    reportId: hit._id ?? '',
    revision: typeof source.revision === 'number' ? source.revision : 0,
    iocs,
  };

  if (typeof title === 'string' && title.length > 0) {
    summary.title = title;
  }
  if (typeof bodyText === 'string' && bodyText.length > 0) {
    summary.bodyText = truncate(bodyText, BODY_TEXT_SUMMARY_MAX);
  }
  if (source.severity?.level) {
    summary.severity = {
      level: source.severity.level,
      ...(typeof source.severity.score === 'number' ? { score: source.severity.score } : {}),
    };
  }
  if (
    diamond &&
    (typeof diamond.signal_count === 'number' || typeof diamond.suitable === 'boolean')
  ) {
    summary.diamond = {
      ...(typeof diamond.signal_count === 'number' ? { signalCount: diamond.signal_count } : {}),
      ...(typeof diamond.suitable === 'boolean' ? { suitable: diamond.suitable } : {}),
    };
  }

  return summary;
};

export interface FindThreatReportsParams extends FindThreatReportsQuery {
  spaceId: string;
}

export const findThreatReports = async (
  esClient: ElasticsearchClient,
  params: FindThreatReportsParams
): Promise<FindThreatReportsResponse> => {
  const {
    spaceId,
    cursor,
    pageSize: requestedPageSize,
    source,
    severity,
    category,
    from,
    to,
    usableOnly,
    sort = 'relevance',
  } = params;

  const pageSize = Math.min(
    requestedPageSize ?? FIND_THREAT_REPORTS_DEFAULT_PAGE_SIZE,
    FIND_THREAT_REPORTS_MAX_PAGE_SIZE
  );

  const filters = buildFindReportFilters({
    spaceId,
    source,
    severity,
    category,
    from,
    to,
    usableOnly,
  });

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: filters,
    },
  };

  // Resolve the cursor before opening anything so a sort mismatch or a malformed
  // token fails fast (and, on the first page, so we know whether to open a PIT).
  let pitId: string | undefined;
  let searchAfter: [number | string | null, number] | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded.sort !== sort) {
      throw new InvalidCursorError(
        `Invalid cursor: created for sort='${decoded.sort}', not '${sort}'`
      );
    }
    pitId = decoded.pitId;
    searchAfter = decoded.sortValues;
  }

  // A PIT opened on this call (rather than carried in the cursor) is ours to
  // release if the search then fails; one carried in the cursor belongs to the
  // caller's paging session and must not be closed out from under a retry.
  let openedPit = false;
  if (!pitId) {
    try {
      const pit = await esClient.openPointInTime({
        index: THREAT_REPORTS_INDEX_PATTERN,
        keep_alive: PIT_KEEP_ALIVE,
        // Reports live in a hidden index, which a wildcard skips by default.
        ...HIDDEN_INDEX_SEARCH_OPTIONS,
      });
      pitId = pit.id;
      openedPit = true;
    } catch (err) {
      // Reports index not created yet (pre-bootstrap or a fresh deployment). No
      // data to page rather than a 500.
      if ((err as { statusCode?: number }).statusCode === 404) {
        return { items: [], nextCursor: null };
      }
      throw err;
    }
  }

  const searchRequest: estypes.SearchRequest = {
    // `pit` replaces `index`: the point-in-time already pins the target indices
    // and their wildcard resolution, and enables the `_shard_doc` tiebreak.
    pit: { id: pitId, keep_alive: PIT_KEEP_ALIVE },
    size: pageSize + 1,
    track_total_hits: false,
    sort: buildSort(sort),
    query,
    _source: [
      'revision',
      'content.title',
      'content.body_text',
      'severity',
      'extracted.iocs.type',
      'extracted.iocs.value',
      'extracted.diamond.signal_count',
      'extracted.diamond.suitable',
    ],
    ...(searchAfter ? { search_after: searchAfter } : {}),
  };

  let response;
  try {
    response = await esClient.search<ReportSourceDoc>(searchRequest);
  } catch (err) {
    // Release a PIT we opened on this call so a failed first page does not leak
    // it for the keep-alive window.
    if (openedPit && pitId) {
      await esClient.closePointInTime({ id: pitId }).catch(() => {});
    }
    // An expired or unknown PIT means the cursor is spent; tell the caller to
    // restart rather than surfacing it as an internal error.
    if (isSearchContextMissing(err)) {
      throw new InvalidCursorError('Invalid cursor: the pagination context has expired');
    }
    throw err;
  }

  // ES can hand back a refreshed PIT id; carry it into the next cursor.
  const nextPitId = response.pit_id ?? pitId;
  const hits = response.hits.hits ?? [];
  const hasMore = hits.length > pageSize;
  const pageHits = hasMore ? hits.slice(0, pageSize) : hits;
  const items = pageHits.map(mapHitToSummary);

  let nextCursor: string | null = null;
  if (hasMore && pageHits.length > 0) {
    const last = pageHits[pageHits.length - 1];
    const primary = last.sort?.[0];
    const shardDoc = last.sort?.[1];
    // Date sorts may surface as epoch millis (number) or an ISO string depending
    // on the cluster/format; both are valid `search_after` values. Refusing to
    // encode here used to close the PIT and return `nextCursor: null`, which
    // silently truncated the catalog mid-page.
    const primaryOk =
      primary === null || typeof primary === 'number' || typeof primary === 'string';
    if (primaryOk && typeof shardDoc === 'number') {
      nextCursor = encodeCursor({
        version: 2,
        pitId: nextPitId,
        sort,
        sortValues: [primary, shardDoc],
      });
    } else {
      await esClient.closePointInTime({ id: nextPitId }).catch(() => {});
      throw new Error('Unable to encode threat report pagination cursor from search sort values');
    }
  }

  // No further pages: release the point-in-time now instead of waiting for the
  // keep-alive to lapse. Best-effort — a failed close just expires on its own.
  if (!nextCursor) {
    await esClient.closePointInTime({ id: nextPitId }).catch(() => {});
  }

  return {
    items,
    nextCursor,
  };
};
