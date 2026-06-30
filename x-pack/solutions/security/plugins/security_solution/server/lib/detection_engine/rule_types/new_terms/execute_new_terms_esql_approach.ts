/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk, sum } from 'lodash';
import { performance } from 'perf_hooks';

import type { estypes } from '@elastic/elasticsearch';
import { esql } from '@elastic/esql';

import type { NewTermsRuleParams } from '../../rule_schema';
import type { SecurityExecutorOptions, SignalSource } from '../types';
import { ALERT_CHUNK_MULTIPLIER, parseDateString, validateHistoryWindowStart } from './utils';
import {
  createSearchAfterReturnType,
  getUnprocessedExceptionsWarnings,
  addToSearchAfterReturn,
  getMaxSignalsWarning,
  getSuppressionMaxSignalsWarning,
  makeFloatString,
} from '../utils/utils';
import { getFilter } from '../utils/get_filter';
import { buildEsqlSearchRequest } from '../esql/build_esql_search_request';
import { performEsqlRequest } from '../esql/esql_request';
import { logClusterShardFailuresEsql } from '../utils/log_cluster_shard_failures_esql';
import { buildEventsSearchQuery } from '../utils/build_events_query';
import { wrapNewTermsAlerts } from './wrap_new_terms_alerts';
import { bulkCreateSuppressedNewTermsAlertsInMemory } from './bulk_create_suppressed_alerts_in_memory';
import type { EventsAndTerms } from './types';
import { bulkCreate } from '../factories';
import type { GenericBulkCreateResponse } from '../utils/bulk_create_with_suppression';
import {
  getIsAlertSuppressionActive,
  alertSuppressionTypeGuard,
} from '../utils/get_is_alert_suppression_active';
import type { NewTermsAlertLatest } from '../../../../../common/api/detection_engine/model/alerts';
import type { RulePreviewLoggedRequest } from '../../../../../common/api/detection_engine/rule_preview/rule_preview.gen';
import type { EsqlTable } from '../esql/esql_request';

type NewTermsExecutorOptions = SecurityExecutorOptions<
  NewTermsRuleParams,
  { isLoggedRequestsEnabled?: boolean }
>;

type NewTermsCombination = Record<string, string | number | boolean>;

interface BuildNewTermsEsqlQueryParams {
  inputIndex: string[];
  newTermsFields: string[];
  aggregatableTimestampField: string;
  primaryTimestamp: string;
  secondaryTimestamp: string | undefined;
  ruleIntervalFrom: string;
}

const buildNewTermsEsqlQuery = ({
  inputIndex,
  newTermsFields,
  aggregatableTimestampField,
  primaryTimestamp,
  secondaryTimestamp,
  ruleIntervalFrom,
}: BuildNewTermsEsqlQueryParams): string => {
  let query = esql.from(inputIndex);

  // Timestamp override: synthesize a combined timestamp from primary/secondary
  if (aggregatableTimestampField === 'kibana.combined_timestamp' && secondaryTimestamp) {
    query = query.pipe`EVAL ${esql.col(aggregatableTimestampField)} = CASE(${esql.col(
      primaryTimestamp
    )} IS NOT NULL, ${esql.col(primaryTimestamp)}, ${esql.col(secondaryTimestamp)})`;
  }

  // Null filters: exclude documents where any new terms field is null.
  // We chain individual WHERE commands (ES|QL treats consecutive WHERE as AND).
  for (const field of newTermsFields) {
    query = query.where`${esql.col(field)} IS NOT NULL`;
  }

  // MV_EXPAND each field to handle multi-valued fields
  for (const field of newTermsFields) {
    query = query.mv_expand(field);
  }

  // Aggregate: compute first_seen per unique terms combination
  const byColumns = newTermsFields.map((f) => esql.col(f));
  query = query.pipe`STATS first_seen = MIN(${esql.col(
    aggregatableTimestampField
  )}) BY ${byColumns}`;

  // Keep only combinations first seen after the rule interval start (genuinely new)
  query = query.pipe`WHERE first_seen > ${ruleIntervalFrom}`;

  return query.print('basic');
};

const parseNewTermsCombinationsFromEsqlResponse = (
  esqlResponse: EsqlTable,
  newTermsFields: string[]
): NewTermsCombination[] => {
  const columnNames = esqlResponse.columns.map((col) => col.name);
  const newTermsFieldIndices = newTermsFields.map((field) => columnNames.indexOf(field));
  const newTermsCombinations: NewTermsCombination[] = [];

  for (const row of esqlResponse.values) {
    const combination: NewTermsCombination = {};
    for (let i = 0; i < newTermsFields.length; i++) {
      const fieldIndex = newTermsFieldIndices[i];
      const fieldValue = fieldIndex >= 0 ? row[fieldIndex] : null;
      if (fieldValue != null) {
        combination[newTermsFields[i]] = fieldValue as string | number | boolean;
      }
    }
    if (Object.keys(combination).length === newTermsFields.length) {
      newTermsCombinations.push(combination);
    }
  }

  return newTermsCombinations;
};

interface BuildMsearchSearchesParams {
  batch: NewTermsCombination[];
  newTermsFields: string[];
  inputIndex: string[];
  tupleFrom: string;
  tupleTo: string;
  esFilter: estypes.QueryDslQueryContainer | undefined;
  runtimeMappings: estypes.MappingRuntimeFields | undefined;
  primaryTimestamp: string;
  secondaryTimestamp: string | undefined;
}

const buildMsearchSearchesForCombinationBatch = ({
  batch,
  newTermsFields,
  inputIndex,
  tupleFrom,
  tupleTo,
  esFilter,
  runtimeMappings,
  primaryTimestamp,
  secondaryTimestamp,
}: BuildMsearchSearchesParams): estypes.MsearchRequestItem[] => {
  const searches: estypes.MsearchRequestItem[] = [];

  for (const combination of batch) {
    const combinationFilter: estypes.QueryDslQueryContainer = {
      bool: {
        must: newTermsFields.map((field) => ({
          term: { [field]: combination[field] },
        })),
      },
    };

    const searchQuery = buildEventsSearchQuery({
      aggregations: undefined,
      runtimeMappings,
      searchAfterSortIds: undefined,
      index: inputIndex,
      from: tupleFrom,
      to: tupleTo,
      filter: esFilter,
      additionalFilters: [combinationFilter],
      size: 1,
      primaryTimestamp,
      secondaryTimestamp,
    });

    const {
      index: _index,
      allow_no_indices: allowNoIndices,
      ignore_unavailable: ignoreUnavailable,
      ...searchBody
    } = searchQuery;

    searches.push({
      index: inputIndex,
      ignore_unavailable: ignoreUnavailable ?? true,
      allow_no_indices: allowNoIndices ?? true,
    });
    searches.push(searchBody);
  }

  return searches;
};

const processMsearchResponsesToEventsAndTerms = ({
  batch,
  responses,
  newTermsFields,
  result,
  ruleExecutionLogger,
}: {
  batch: NewTermsCombination[];
  responses: estypes.MsearchResponseItem<SignalSource>[];
  newTermsFields: string[];
  result: ReturnType<typeof createSearchAfterReturnType>;
  ruleExecutionLogger: NewTermsExecutorOptions['sharedParams']['ruleExecutionLogger'];
}): EventsAndTerms[] => {
  const eventsAndTerms: EventsAndTerms[] = [];

  for (let i = 0; i < batch.length; i++) {
    const response = responses[i];
    if ('error' in response) {
      const errorMsg = `Failed to fetch document for new term combination ${JSON.stringify(
        batch[i]
      )}: ${JSON.stringify(response.error)}`;
      result.errors.push(errorMsg);
      ruleExecutionLogger.warn(errorMsg);
    } else if ('hits' in response && response.hits?.hits?.length > 0) {
      const hit = response.hits.hits[0] as estypes.SearchHit<SignalSource>;
      const combination = batch[i];
      const newTerms = newTermsFields.map((field) => combination[field]);
      eventsAndTerms.push({
        event: hit,
        newTerms,
      });
    }
  }

  return eventsAndTerms;
};

type NewTermsExecutorSharedParams = NewTermsExecutorOptions['sharedParams'];

interface CreateAlertsFromEventsParams {
  eventsAndTerms: EventsAndTerms[];
  sharedParams: NewTermsExecutorSharedParams;
  params: NewTermsRuleParams;
  services: NewTermsExecutorOptions['services'];
  result: ReturnType<typeof createSearchAfterReturnType>;
  isAlertSuppressionActive: boolean;
}

const createAlertsFromEventsAndTerms = async ({
  eventsAndTerms,
  sharedParams,
  params,
  services,
  result,
  isAlertSuppressionActive,
}: CreateAlertsFromEventsParams): Promise<{ alertsWereTruncated: boolean }> => {
  const eventAndTermsChunks = chunk(eventsAndTerms, ALERT_CHUNK_MULTIPLIER * params.maxSignals);
  let bulkCreateResult: Omit<
    GenericBulkCreateResponse<NewTermsAlertLatest>,
    'suppressedItemsCount'
  > = {
    errors: [],
    success: true,
    enrichmentDuration: '0',
    bulkCreateDuration: '0',
    createdItemsCount: 0,
    createdItems: [],
    alertsWereTruncated: false,
  };

  for (let i = 0; i < eventAndTermsChunks.length; i++) {
    const eventAndTermsChunk = eventAndTermsChunks[i];

    if (isAlertSuppressionActive && alertSuppressionTypeGuard(params.alertSuppression)) {
      bulkCreateResult = await bulkCreateSuppressedNewTermsAlertsInMemory({
        sharedParams,
        eventsAndTerms: eventAndTermsChunk,
        toReturn: result,
        services,
        alertSuppression: params.alertSuppression,
      });
    } else {
      const wrappedAlerts = wrapNewTermsAlerts({
        sharedParams,
        eventsAndTerms: eventAndTermsChunk,
      });

      bulkCreateResult = await bulkCreate({
        wrappedAlerts,
        services,
        sharedParams,
        maxAlerts: params.maxSignals - result.createdSignalsCount,
      });

      addToSearchAfterReturn({ current: result, next: bulkCreateResult });
    }

    if (bulkCreateResult.alertsWereTruncated) {
      result.warningMessages.push(
        isAlertSuppressionActive ? getSuppressionMaxSignalsWarning() : getMaxSignalsWarning()
      );
      break;
    }
  }

  return { alertsWereTruncated: bulkCreateResult.alertsWereTruncated };
};

// Process new term combinations in batches to avoid issuing too many concurrent searches in a single _msearch
const BATCH_SIZE = 500;

/**
 * New (ES|QL + _msearch based) New Terms implementation. Available on all license tiers for
 * local indices; cross-cluster search requires an Enterprise license (enforced by Elasticsearch).
 * Falls back to the aggregation approach when cross-cluster indices are detected without an
 * Enterprise license.
 *
 * It collapses the first two phases of the aggregation approach into a single ES|QL aggregation that
 * computes the `first_seen` timestamp per terms combination over the history window, and keeps only the
 * combinations whose `first_seen` falls inside the rule interval (i.e. the new ones). It then fetches
 * the source document for each new combination via a single batched `_msearch`.
 */
export const executeNewTermsEsqlApproach = async (execOptions: NewTermsExecutorOptions) => {
  const { sharedParams, services, params, state } = execOptions;

  const {
    ruleExecutionLogger,
    completeRule,
    tuple,
    aggregatableTimestampField,
    primaryTimestamp,
    secondaryTimestamp,
    inputIndex,
    exceptionFilter,
    unprocessedExceptions,
    scheduleNotificationResponseActionsService,
    runtimeMappings,
  } = sharedParams;

  const result = createSearchAfterReturnType();

  const exceptionsWarning = getUnprocessedExceptionsWarnings(unprocessedExceptions);
  if (exceptionsWarning) {
    result.warningMessages.push(exceptionsWarning);
  }

  // Validate history window
  validateHistoryWindowStart({
    historyWindowStart: params.historyWindowStart,
    from: params.from,
  });

  // Parse history window start date
  const parsedHistoryWindowStart = parseDateString({
    date: params.historyWindowStart,
    forceNow: tuple.to.toDate(),
    name: 'historyWindowStart',
  });

  const esFilter = await getFilter({
    filters: params.filters,
    index: inputIndex,
    language: params.language,
    savedId: undefined,
    services,
    type: params.type,
    query: params.query,
    exceptionFilter,
    loadFields: true,
  });

  const isLoggedRequestsEnabled = Boolean(state?.isLoggedRequestsEnabled);
  const loggedRequests: RulePreviewLoggedRequest[] = [];
  const isAlertSuppressionActive = await getIsAlertSuppressionActive({
    alertSuppression: params.alertSuppression,
    licensing: sharedParams.licensing,
  });

  const newTermsFields = params.newTermsFields;

  // ============================================
  // STEP 1: ES|QL QUERY TO GET BUCKETS
  // ============================================
  // This replaces Phase 1 (composite aggregation) and Phase 2 (terms aggregation)
  // Query structure matches the example pattern:
  // FROM -> WHERE null filters -> MV_EXPAND -> STATS -> WHERE first_seen filter
  const esqlQuery = buildNewTermsEsqlQuery({
    inputIndex,
    newTermsFields,
    aggregatableTimestampField,
    primaryTimestamp,
    secondaryTimestamp,
    ruleIntervalFrom: tuple.from.toISOString(),
  });

  ruleExecutionLogger.debug(`New Terms ES|QL query: ${esqlQuery}`);

  // Execute ES|QL query to get buckets
  const esqlRequest = buildEsqlSearchRequest({
    query: esqlQuery,
    from: parsedHistoryWindowStart.toISOString(),
    to: tuple.to.toISOString(),
    size: 10000, // ES|QL limit
    filters: esFilter ? [esFilter] : [],
    primaryTimestamp,
    secondaryTimestamp,
    exceptionFilter,
    excludedDocuments: {},
    ruleExecutionTimeout: undefined,
  });

  let esqlResponse;
  try {
    esqlResponse = await performEsqlRequest({
      esClient: services.scopedClusterClient.asCurrentUser,
      requestBody: esqlRequest,
      requestQueryParams: {
        drop_null_columns: true,
      },
      ruleExecutionLogger,
      shouldStopExecution: services.shouldStopExecution,
      loggedRequests: isLoggedRequestsEnabled ? loggedRequests : undefined,
    });
  } catch (error) {
    // A failed ES|QL query (e.g. unsupported field types producing an "Unknown column"
    // verification_exception) must degrade to a rule-level error. Letting it propagate
    // turns into an unhandled promise rejection that crashes the Kibana process.
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`ES|QL request to find new terms failed: ${message}`);
    result.success = false;

    scheduleNotificationResponseActionsService({
      signals: result.createdSignals,
      signalsCount: result.createdSignalsCount,
      responseActions: completeRule.ruleParams.responseActions,
    });

    return { ...result, state, ...(isLoggedRequestsEnabled ? { loggedRequests } : {}) };
  }

  logClusterShardFailuresEsql({ response: esqlResponse, result });

  const newTermsCombinations = parseNewTermsCombinationsFromEsqlResponse(
    esqlResponse,
    newTermsFields
  );

  if (newTermsCombinations.length >= 10000) {
    result.warningMessages.push(
      'ES|QL new terms query returned the maximum 10,000 term combinations. Additional new terms may exist but were not evaluated in this execution.'
    );
  }

  if (newTermsCombinations.length === 0) {
    scheduleNotificationResponseActionsService({
      signals: result.createdSignals,
      signalsCount: result.createdSignalsCount,
      responseActions: completeRule.ruleParams.responseActions,
    });
    return { ...result, state, ...(isLoggedRequestsEnabled ? { loggedRequests } : {}) };
  }

  // ============================================
  // STEP 2: FETCH SOURCE DOCUMENTS (Phase 2) - Use msearch
  // ============================================
  // For each combination, create a search query to find the first document in the rule execution
  // interval that contains it. Use msearch to execute all queries in parallel.
  let combinationIndex = 0;
  let alertsCandidateCount: number | undefined;

  while (
    combinationIndex < newTermsCombinations.length &&
    result.createdSignalsCount < params.maxSignals
  ) {
    const batch = newTermsCombinations.slice(combinationIndex, combinationIndex + BATCH_SIZE);
    combinationIndex += BATCH_SIZE;

    const searches = buildMsearchSearchesForCombinationBatch({
      batch,
      newTermsFields,
      inputIndex,
      tupleFrom: tuple.from.toISOString(),
      tupleTo: tuple.to.toISOString(),
      esFilter,
      runtimeMappings,
      primaryTimestamp,
      secondaryTimestamp,
    });

    const startTime = performance.now();

    // Log msearch request if enabled
    // msearch format is newline-delimited JSON: header1\nbody1\nheader2\nbody2\n...
    if (isLoggedRequestsEnabled) {
      const msearchLines: string[] = [];
      for (let i = 0; i < searches.length; i += 2) {
        const header = searches[i];
        const body = searches[i + 1];
        msearchLines.push(JSON.stringify(header));
        msearchLines.push(JSON.stringify(body));
      }
      const msearchRequestString = `POST /_msearch\n${msearchLines.join('\n')}`;
      loggedRequests.push({
        request: msearchRequestString,
        description: `Find documents for ${batch.length} new term combinations`,
      });
    }

    let msearchResponse;
    try {
      msearchResponse = await services.scopedClusterClient.asCurrentUser.msearch<SignalSource>({
        searches,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`_msearch request to fetch new terms documents failed: ${message}`);
      result.success = false;
      break;
    }

    const searchDuration = makeFloatString(performance.now() - startTime);
    result.searchAfterTimes.push(searchDuration);

    // Update duration in loggedRequests if enabled
    if (isLoggedRequestsEnabled && loggedRequests.length > 0) {
      const lastRequest = loggedRequests[loggedRequests.length - 1];
      if (lastRequest && lastRequest.description?.includes('new term combinations')) {
        lastRequest.duration = Math.round(performance.now() - startTime);
      }
    }

    const eventsAndTerms = processMsearchResponsesToEventsAndTerms({
      batch,
      responses: msearchResponse.responses,
      newTermsFields,
      result,
      ruleExecutionLogger,
    });

    // Collect rule execution metrics: each found document for a new terms combination is a
    // candidate alert (before suppression / maxSignals truncation).
    alertsCandidateCount = sum([alertsCandidateCount, eventsAndTerms.length]);

    // Create alerts from eventsAndTerms
    if (eventsAndTerms.length > 0) {
      const { alertsWereTruncated } = await createAlertsFromEventsAndTerms({
        eventsAndTerms,
        sharedParams,
        params,
        services,
        result,
        isAlertSuppressionActive,
      });

      if (alertsWereTruncated || result.createdSignalsCount >= params.maxSignals) {
        break;
      }
    }
  }

  scheduleNotificationResponseActionsService({
    signals: result.createdSignals,
    signalsCount: result.createdSignalsCount,
    responseActions: completeRule.ruleParams.responseActions,
  });

  return {
    ...result,
    state,
    alertsCandidateCount,
    ...(isLoggedRequestsEnabled ? { loggedRequests } : {}),
  };
};
