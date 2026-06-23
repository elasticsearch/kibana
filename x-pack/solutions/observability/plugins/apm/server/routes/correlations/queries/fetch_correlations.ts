/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash';
import { termQuery } from '@kbn/observability-plugin/server';
import { EVENT_OUTCOME } from '../../../../common/es_fields/apm';
import { EventOutcome } from '../../../../common/event_outcome';
import type {
  CorrelationsResponse,
  UnifiedCorrelation,
  CommonCorrelationsQueryParams,
  EntityType,
  FieldValuePair,
  Metric,
} from '../../../../common/correlations/types';
import { getPrioritizedFieldValuePairs } from '../../../../common/correlations/utils';
import { DEFAULT_PERCENTILE_THRESHOLD } from '../../../../common/correlations/constants';
import { getOverallLatencyDistribution } from '../../latency_distribution/get_overall_latency_distribution';
import { fetchDurationFieldCandidates } from './fetch_duration_field_candidates';
import { fetchInfraFieldCandidates } from './fetch_infra_field_candidates';
import { fetchFieldValuePairs } from './fetch_field_value_pairs';
import { fetchSignificantCorrelations } from './fetch_significant_correlations';
import { fetchPValues } from './fetch_p_values';
import { fetchThroughputCorrelations } from './fetch_throughput_correlations';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getEventTypeFromEntityType } from '../utils';

const CHUNK_SIZE = 10;

/** Scope of correlation analysis: transactions (incoming) or exit spans (outgoing to dependencies) */
export type CorrelationsScope = 'transactions' | 'exitSpans';

interface FetchCorrelationsParams extends CommonCorrelationsQueryParams {
  apmEventClient: APMEventClient;
  metric: Metric;
  /** When 'exitSpans', analysis runs on raw exit span documents (span.destination.service.resource exists). Default 'transactions'. */
  scope?: CorrelationsScope;
  fieldCandidates?: string[];
  percentileThreshold?: number;
  durationMin?: number;
  durationMax?: number;
  includeHistogram?: boolean;
  correlationType?: 'significant' | 'p-value';
  config?: {
    apm: {
      searchAggregatedTransactions?: boolean;
    };
  };
}

function scopeToEntityType(scope: CorrelationsScope): EntityType {
  return scope === 'exitSpans' ? 'exit_span' : 'transaction';
}

export async function fetchCorrelations({
  apmEventClient,
  metric,
  scope = 'transactions',
  fieldCandidates: providedFieldCandidates,
  start,
  end,
  environment,
  kuery,
  query,
  percentileThreshold = DEFAULT_PERCENTILE_THRESHOLD,
  durationMin: providedDurationMin,
  durationMax: providedDurationMax,
  includeHistogram = false,
  config,
}: FetchCorrelationsParams): Promise<CorrelationsResponse> {
  const isFailureRateMetric = metric === 'failure_rate';
  const isThroughputMetric = metric === 'throughput';
  const isInfraMetric = metric === 'infra_metrics';
  const entityType = scopeToEntityType(scope);
  const eventType = getEventTypeFromEntityType(entityType);

  // Get overall distribution
  const overallDistribution = await getOverallLatencyDistribution({
    entityType,
    apmEventClient,
    start,
    end,
    environment,
    kuery,
    query,
    percentileThreshold,
    durationMinOverride: providedDurationMin,
    durationMaxOverride: providedDurationMax,
  });

  const durationMin = providedDurationMin ?? overallDistribution.durationMin ?? 0;
  const durationMax = providedDurationMax ?? overallDistribution.durationMax ?? 0;
  const totalDocCount = overallDistribution.totalDocCount ?? 0;

  // For error_rate, also get error histogram
  let errorHistogram: CorrelationsResponse['errorHistogram'];
  if (includeHistogram && isFailureRateMetric) {
    const errorDistribution = await getOverallLatencyDistribution({
      entityType,
      apmEventClient,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [query, ...termQuery(EVENT_OUTCOME, EventOutcome.failure)],
        },
      },
      percentileThreshold,
      durationMinOverride: durationMin,
      durationMaxOverride: durationMax,
    });
    errorHistogram = errorDistribution.overallHistogram;
  }

  // Get field candidates (if not provided)
  let fieldCandidates: string[];
  if (providedFieldCandidates && providedFieldCandidates.length > 0) {
    fieldCandidates = providedFieldCandidates;
  } else if (isInfraMetric) {
    const candidatesResponse = await fetchInfraFieldCandidates({
      apmEventClient,
      eventType,
      start,
      end,
      environment,
      kuery,
      query,
    });
    fieldCandidates = candidatesResponse.fieldCandidates;
  } else {
    const candidatesResponse = await fetchDurationFieldCandidates({
      apmEventClient,
      eventType,
      start,
      end,
      environment,
      kuery,
      query,
    });
    fieldCandidates = candidatesResponse.fieldCandidates;

    // For error_rate, filter out EVENT_OUTCOME
    if (isFailureRateMetric) {
      fieldCandidates = fieldCandidates.filter((field) => field !== EVENT_OUTCOME);
    }
  }

  // Get field value pairs (with internal chunking)
  // Note: For error_rate, we skip this step and process field candidates directly
  const fieldValuePairs: FieldValuePair[] = [];

  // Get correlations (with internal chunking)
  let correlations: UnifiedCorrelation[] = [];
  let ccsWarning = false;
  let fallbackResult: UnifiedCorrelation | undefined;

  if (isFailureRateMetric) {
    // For error_rate, use p-values approach
    // Process field candidates directly (not field value pairs) to match legacy behavior
    const fieldCandidateChunks = chunk(fieldCandidates, CHUNK_SIZE);

    const allFailedCorrelations: UnifiedCorrelation[] = [];
    let bestFallback: UnifiedCorrelation | undefined;

    for (const fieldCandidatesChunk of fieldCandidateChunks) {
      const pValuesResponse = await fetchPValues({
        apmEventClient,
        start,
        end,
        environment,
        kuery,
        query,
        durationMin,
        durationMax,
        fieldCandidates: fieldCandidatesChunk,
        entityType,
        includeHistogram,
      });

      if (pValuesResponse.failedTransactionsCorrelations.length > 0) {
        allFailedCorrelations.push(...pValuesResponse.failedTransactionsCorrelations);
      }

      if (pValuesResponse.fallbackResult) {
        if (!bestFallback) {
          bestFallback = pValuesResponse.fallbackResult;
        } else if (
          pValuesResponse.fallbackResult.normalizedScore !== undefined &&
          bestFallback.normalizedScore !== undefined &&
          pValuesResponse.fallbackResult.normalizedScore > bestFallback.normalizedScore
        ) {
          bestFallback = pValuesResponse.fallbackResult;
        }
      }

      if (pValuesResponse.ccsWarning) {
        ccsWarning = true;
      }
    }

    correlations = allFailedCorrelations.sort((a, b) => {
      const aScore = a.normalizedScore ?? 0;
      const bScore = b.normalizedScore ?? 0;
      if (bScore !== aScore) {
        return bScore - aScore;
      }
      const aP = a.pValue;
      const bP = b.pValue;
      if (typeof aP === 'number' && typeof bP === 'number' && aP !== bP) {
        return aP - bP;
      }
      if (typeof aP === 'number' && typeof bP !== 'number') {
        return -1;
      }
      if (typeof aP !== 'number' && typeof bP === 'number') {
        return 1;
      }
      if (a.fieldName !== b.fieldName) {
        return a.fieldName.localeCompare(b.fieldName);
      }
      return String(a.fieldValue).localeCompare(String(b.fieldValue));
    });
    fallbackResult = bestFallback;
  } else if (isThroughputMetric) {
    // For throughput, fetch field value pairs then compute Pearson correlation on RPM timeseries
    const fieldCandidateChunks = chunk(fieldCandidates, CHUNK_SIZE);

    for (const fieldCandidateChunk of fieldCandidateChunks) {
      const fieldValuePairResponse = await fetchFieldValuePairs({
        apmEventClient,
        eventType,
        start,
        end,
        environment,
        kuery,
        query,
        fieldCandidates: fieldCandidateChunk,
      });

      if (fieldValuePairResponse.fieldValuePairs.length > 0) {
        fieldValuePairs.push(...fieldValuePairResponse.fieldValuePairs);
      }
    }

    const prioritizedFieldValuePairs = getPrioritizedFieldValuePairs(fieldValuePairs);

    const throughputResponse = await fetchThroughputCorrelations({
      apmEventClient,
      entityType,
      start,
      end,
      environment,
      kuery,
      query,
      fieldValuePairs: prioritizedFieldValuePairs,
    });

    correlations.push(...throughputResponse.throughputCorrelations);
    if (throughputResponse.ccsWarning) ccsWarning = true;
    if (throughputResponse.fallbackResult) fallbackResult = throughputResponse.fallbackResult;
  } else {
    // For transaction_duration, use significant correlations approach
    // Get field value pairs (with internal chunking)
    const fieldCandidateChunks = chunk(fieldCandidates, CHUNK_SIZE);

    for (const fieldCandidateChunk of fieldCandidateChunks) {
      const fieldValuePairResponse = await fetchFieldValuePairs({
        apmEventClient,
        eventType,
        start,
        end,
        environment,
        kuery,
        query,
        fieldCandidates: fieldCandidateChunk,
      });

      if (fieldValuePairResponse.fieldValuePairs.length > 0) {
        fieldValuePairs.push(...fieldValuePairResponse.fieldValuePairs);
      }
    }

    const prioritizedFieldValuePairs = getPrioritizedFieldValuePairs(fieldValuePairs);
    const fieldValuePairChunks = chunk(prioritizedFieldValuePairs, CHUNK_SIZE);

    const allLatencyCorrelations: UnifiedCorrelation[] = [];
    let bestFallback: UnifiedCorrelation | undefined;

    for (const fieldValuePairChunk of fieldValuePairChunks) {
      const significantCorrelationsResponse = await fetchSignificantCorrelations({
        apmEventClient,
        start,
        end,
        environment,
        kuery,
        query,
        durationMinOverride: durationMin,
        durationMaxOverride: durationMax,
        fieldValuePairs: fieldValuePairChunk,
        entityType,
        includeHistogram,
      });

      if (significantCorrelationsResponse.latencyCorrelations.length > 0) {
        allLatencyCorrelations.push(...significantCorrelationsResponse.latencyCorrelations);
      }

      if (significantCorrelationsResponse.fallbackResult) {
        if (!bestFallback) {
          bestFallback = significantCorrelationsResponse.fallbackResult;
        } else {
          const current = significantCorrelationsResponse.fallbackResult;
          if (
            current.correlation !== undefined &&
            current.ksTest !== undefined &&
            bestFallback.correlation !== undefined &&
            bestFallback.ksTest !== undefined &&
            current.correlation > 0 &&
            current.ksTest > bestFallback.ksTest &&
            current.correlation > bestFallback.correlation
          ) {
            bestFallback = current;
          }
        }
      }

      if (significantCorrelationsResponse.ccsWarning) {
        ccsWarning = true;
      }
    }

    // Deduplicate by fieldName + fieldValue combination
    const correlationMap = new Map<string, UnifiedCorrelation>();
    for (const correlation of allLatencyCorrelations) {
      if (
        correlation.correlation !== undefined &&
        correlation.ksTest !== undefined &&
        (includeHistogram ? correlation.histogram !== undefined : true)
      ) {
        const key = `${correlation.fieldName}:${correlation.fieldValue}`;
        const existing = correlationMap.get(key);
        if (!existing || (correlation.correlation ?? 0) > (existing.correlation ?? 0)) {
          correlationMap.set(key, correlation);
        }
      }
    }

    // Sort by correlation descending, then by fieldName, then by fieldValue
    correlations = Array.from(correlationMap.values()).sort((a, b) => {
      const aCorr = a.correlation ?? 0;
      const bCorr = b.correlation ?? 0;
      if (bCorr !== aCorr) {
        return bCorr - aCorr;
      }
      if (a.fieldName !== b.fieldName) {
        return a.fieldName.localeCompare(b.fieldName);
      }
      const aVal = String(a.fieldValue);
      const bVal = String(b.fieldValue);
      return aVal.localeCompare(bVal);
    });
    fallbackResult = bestFallback;
  }

  const response: CorrelationsResponse = {
    totalDocCount,
    durationMin,
    durationMax,
    fieldCandidates,
    correlations,
    ccsWarning,
    fallbackResult,
  };

  if (includeHistogram) {
    response.overallHistogram = overallDistribution.overallHistogram;
    response.percentileThresholdValue = overallDistribution.percentileThresholdValue;

    if (isFailureRateMetric) {
      response.errorHistogram = errorHistogram;
    }
  }

  return response;
}
