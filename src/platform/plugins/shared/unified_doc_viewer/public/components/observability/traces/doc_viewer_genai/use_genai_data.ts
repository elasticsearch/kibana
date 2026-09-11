/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  GEN_AI_LONG_MESSAGE_FIELDS,
  getFieldFromSource,
  getGenAiFields,
  hasGenAiData,
  type GenAiFields,
} from '@kbn/apm-ui-shared';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useAbortableAsync } from '@kbn/react-hooks';
import { castArray } from 'lodash';
import { useMemo } from 'react';
import { lastValueFrom } from 'rxjs';
import { getUnifiedDocViewerServices } from '../../../../plugin';
import { getGenAiRecoveryTarget } from './get_recovery_target';

export interface UseGenAiDataResult {
  /** Parsed GenAI fields, or undefined when the document has no gen_ai data. */
  genAi: GenAiFields | undefined;
  /** True when the document carries any gen_ai attribute. */
  isGenAiSpan: boolean;
  /** True while long message values are being fetched from `_source`. */
  loading: boolean;
  /**
   * True when message values are absent and cannot be recovered because the
   * record has no usable document key (`_id` or `span.id`) or no index target.
   */
  unrecoverableLongFields: boolean;
}

/**
 * Derives GenAI fields from a doc viewer record, restoring long message values
 * that `ignore_above: 1024` dropped from the index but left in `_source`.
 *
 * Values are read from `hit.raw._source` when the record carries it, otherwise
 * refetched by `_id` when available, or by `span.id` + `trace.id` when `_id`
 * is absent (e.g. ES|QL without `METADATA _id, _index`).  Arming that refetch
 * differs by data source: in DSL `_ignored` is authoritative, while ES|QL rows
 * carry it only with `METADATA _ignored`.
 *
 * @param indexPattern - The ES|QL `FROM` index pattern from the data view, used
 *   as a fallback search target when `_index` is not present on the row.  Pass
 *   `dataView.getIndexPattern()` from the component.
 */
export function useGenAiData({
  hit,
  isEsqlMode = false,
  indexPattern,
}: {
  hit: DataTableRecord;
  isEsqlMode?: boolean;
  /** ES|QL fallback index target — set to `dataView.getIndexPattern()`. */
  indexPattern?: string;
}): UseGenAiDataResult {
  const { metadata, missingLongFields } = useMemo(() => {
    const merged: Record<string, unknown> = { ...hit.flattened };
    // castArray because ES|QL returns a single-valued `_ignored` column as a
    // bare string, which would break the `.some()` below.
    const ignoredList = castArray(hit.raw._ignored ?? []);
    const missing: string[] = [];

    const isIgnored = (fieldName: string) =>
      ignoredList.includes(fieldName) ||
      // Container-level entry, e.g. `['attributes']` for `attributes.gen_ai.*`.
      ignoredList.some((ancestor) => fieldName.startsWith(`${ancestor}.`));

    // ES|QL rows carry every requested column as a key, so a present-but-empty
    // `_ignored` proves nothing was dropped; only its absence is inconclusive.
    const ignoredUnknown = isEsqlMode && !('_ignored' in hit.raw);

    for (const fieldName of GEN_AI_LONG_MESSAGE_FIELDS) {
      // `ignoredUnknown` also enters here for a present value: these fields are
      // multi-valued and `ignore_above` drops only the over-long elements, so
      // without `_ignored` a non-null array cannot be assumed complete.
      if (merged[fieldName] == null || isIgnored(fieldName) || ignoredUnknown) {
        const sourceValue = getFieldFromSource(hit.raw._source, fieldName);
        if (sourceValue != null) {
          merged[fieldName] = castArray(sourceValue);
        } else if (isIgnored(fieldName) || ignoredUnknown) {
          missing.push(fieldName);
        }
      }
    }

    return { metadata: merged, missingLongFields: missing };
  }, [hit, isEsqlMode]);

  const isGenAiSpan = useMemo(() => hasGenAiData(metadata), [metadata]);

  const hasMissing = isGenAiSpan && missingLongFields.length > 0;

  // Extracted to plain variables so the react-hooks/exhaustive-deps rule can
  // statically verify them: computed-key accesses like `flattened['span.id']`
  // are flagged as "complex expressions" when placed directly in dep arrays.
  const flattenedSpanId = hit.flattened['span.id'];
  const flattenedTraceId = hit.flattened['trace.id'];

  // Resolve a search target (index + query) from the best available key:
  // `_id`, then `span.id` / `span_id`, with `_index` or `indexPattern` as the
  // index.  Returns undefined when nothing can be resolved.
  const target = useMemo(
    () => (hasMissing ? getGenAiRecoveryTarget({ hit, indexPattern }) : undefined),
    // Depend on primitives only — Discover hands over a fresh `hit` object each
    // render, so object identity is not stable. The cacheKey encodes all relevant
    // values so the fetch is not re-triggered when nothing actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      hasMissing,
      hit.raw._id,
      hit.raw._index,
      flattenedSpanId,
      hit.flattened.span_id,
      flattenedTraceId,
      hit.flattened.trace_id,
      indexPattern,
    ]
  );

  const unrecoverableLongFields = hasMissing && !target;

  const { value: fetchedSource, loading } = useAbortableAsync(
    async ({ signal }) => {
      if (!target) {
        return undefined;
      }

      const { data } = getUnifiedDocViewerServices();
      const result = await lastValueFrom(
        data.search.search(
          {
            params: {
              index: target.index,
              size: 1,
              track_total_hits: false,
              query: target.query,
              _source: [...GEN_AI_LONG_MESSAGE_FIELDS],
            },
          },
          { abortSignal: signal }
        )
      );

      return result.rawResponse.hits.hits[0]?._source as Record<string, unknown> | undefined;
    },
    // Use the stable cacheKey string rather than the target object so the dep is
    // a primitive and React can compare it cheaply.
    [target?.cacheKey]
  );

  const genAi = useMemo(() => {
    if (!isGenAiSpan) {
      return undefined;
    }

    const merged = { ...metadata };
    if (fetchedSource) {
      for (const fieldName of missingLongFields) {
        const sourceValue = getFieldFromSource(fetchedSource, fieldName);
        if (sourceValue != null) {
          // Replaces the whole field: synthetic `_source` returns multi-valued
          // keywords sorted and de-duplicated, so elements cannot be aligned
          // with the partially-indexed value.
          merged[fieldName] = castArray(sourceValue);
        }
      }
    }

    return getGenAiFields(merged);
  }, [isGenAiSpan, metadata, fetchedSource, missingLongFields]);

  return { genAi, isGenAiSpan, loading: !!target && loading, unrecoverableLongFields };
}
