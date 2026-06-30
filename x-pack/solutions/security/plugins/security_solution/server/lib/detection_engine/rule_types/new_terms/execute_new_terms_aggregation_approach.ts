/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isObject, chunk, sum } from 'lodash';

import type { NewTermsRuleParams } from '../../rule_schema';
import type { SecurityExecutorOptions } from '../types';
import { singleSearchAfter } from '../utils/single_search_after';
import { buildEventsSearchQuery } from '../utils/build_events_query';
import { getFilter } from '../utils/get_filter';
import { wrapNewTermsAlerts } from './wrap_new_terms_alerts';
import { bulkCreateSuppressedNewTermsAlertsInMemory } from './bulk_create_suppressed_alerts_in_memory';
import type { EventsAndTerms } from './types';
import type { CreateAlertsHook } from './build_new_terms_aggregation';
import type { NewTermsAlertLatest } from '../../../../../common/api/detection_engine/model/alerts';
import {
  buildRecentTermsAgg,
  buildNewTermsAgg,
  buildDocFetchAgg,
} from './build_new_terms_aggregation';
import {
  ALERT_CHUNK_MULTIPLIER,
  parseDateString,
  validateHistoryWindowStart,
  transformBucketsToValues,
} from './utils';
import {
  addToSearchAfterReturn,
  createSearchAfterReturnType,
  getUnprocessedExceptionsWarnings,
  getMaxSignalsWarning,
  getSuppressionMaxSignalsWarning,
  stringifyAfterKey,
} from '../utils/utils';
import {
  alertSuppressionTypeGuard,
  getIsAlertSuppressionActive,
} from '../utils/get_is_alert_suppression_active';
import { multiTermsComposite } from './multi_terms_composite';
import type { GenericBulkCreateResponse } from '../utils/bulk_create_with_suppression';
import type { RulePreviewLoggedRequest } from '../../../../../common/api/detection_engine/rule_preview/rule_preview.gen';
import * as i18n from '../translations';
import { bulkCreate } from '../factories';

type NewTermsExecutorOptions = SecurityExecutorOptions<
  NewTermsRuleParams,
  { isLoggedRequestsEnabled?: boolean }
>;

/**
 * Current (aggregation based) New Terms implementation.
 *
 * It runs the rule in up to 3 phases of `_search` aggregations:
 * - Phase 1: composite aggregation paging through all terms seen in the rule interval
 * - Phase 2: terms aggregation to find which of those terms are actually new (not present in the history window)
 * - Phase 3: fetch the oldest document containing each new term to build the alert from
 *
 * This is the implementation available to all license tiers.
 */
export const executeNewTermsAggregationApproach = async (execOptions: NewTermsExecutorOptions) => {
  const { sharedParams, services, params, state, logger } = execOptions;

  const {
    ruleExecutionLogger,
    completeRule,
    tuple,
    inputIndex,
    runtimeMappings,
    primaryTimestamp,
    secondaryTimestamp,
    aggregatableTimestampField,
    exceptionFilter,
    unprocessedExceptions,
    licensing,
    scheduleNotificationResponseActionsService,
  } = sharedParams;

  const isLoggedRequestsEnabled = Boolean(state?.isLoggedRequestsEnabled);
  const loggedRequests: RulePreviewLoggedRequest[] = [];

  // Validate the history window size compared to `from` at runtime as well as in the `validate`
  // function because rule preview does not use the `validate` function defined on the rule type
  validateHistoryWindowStart({
    historyWindowStart: params.historyWindowStart,
    from: params.from,
  });

  const filterArgs = {
    filters: params.filters,
    index: inputIndex,
    language: params.language,
    savedId: undefined,
    services,
    type: params.type,
    query: params.query,
    exceptionFilter,
    loadFields: true,
  };
  const esFilter = await getFilter(filterArgs);

  const parsedHistoryWindowSize = parseDateString({
    date: params.historyWindowStart,
    forceNow: tuple.to.toDate(),
    name: 'historyWindowStart',
  });

  const isAlertSuppressionActive = await getIsAlertSuppressionActive({
    alertSuppression: params.alertSuppression,
    licensing,
  });
  let afterKey: Record<string, string | number | null> | undefined;

  const result = createSearchAfterReturnType();

  const exceptionsWarning = getUnprocessedExceptionsWarnings(unprocessedExceptions);
  if (exceptionsWarning) {
    result.warningMessages.push(exceptionsWarning);
  }
  let pageNumber = 0;
  let alertsCandidateCount: number | undefined;

  // There are 2 conditions that mean we're finished: either there were still too many alerts to create
  // after deduplication and the array of alerts was truncated before being submitted to ES, or there were
  // exactly enough new alerts to hit maxSignals without truncating the array of alerts. We check both because
  // it's possible for the array to be truncated but alert documents could fail to be created for other reasons,
  // in which case createdSignalsCount would still be less than maxSignals. Since valid alerts were truncated from
  // the array in that case, we stop and report the errors.
  while (result.createdSignalsCount <= params.maxSignals) {
    pageNumber++;
    // PHASE 1: Fetch a page of terms using a composite aggregation. This will collect a page from
    // all of the terms seen over the last rule interval. In the next phase we'll determine which
    // ones are new.
    const searchRequest = buildEventsSearchQuery({
      aggregations: buildRecentTermsAgg({
        fields: params.newTermsFields,
        after: afterKey,
      }),
      searchAfterSortIds: undefined,
      index: inputIndex,
      // The time range for the initial composite aggregation is the rule interval, `from` and `to`
      from: tuple.from.toISOString(),
      to: tuple.to.toISOString(),
      filter: esFilter,
      size: 0,
      primaryTimestamp,
      secondaryTimestamp,
      runtimeMappings,
    });

    const {
      searchResult,
      searchDuration,
      searchErrors,
      loggedRequests: firstPhaseLoggedRequests = [],
    } = await singleSearchAfter({
      searchRequest,
      services,
      ruleExecutionLogger,
      loggedRequestsConfig: isLoggedRequestsEnabled
        ? {
            type: 'findAllTerms',
            description: i18n.FIND_ALL_NEW_TERMS_FIELDS_DESCRIPTION(stringifyAfterKey(afterKey)),
            skipRequestQuery: pageNumber > 2,
          }
        : undefined,
    });
    loggedRequests.push(...firstPhaseLoggedRequests);
    if (!searchResult.aggregations) {
      throw new Error('Aggregations were missing on recent terms search result');
    }
    logger.debug(`Time spent on composite agg: ${searchDuration}`);

    result.searchAfterTimes.push(searchDuration);
    result.errors.push(...searchErrors);

    // If the aggregation returns no after_key it signals that we've paged through all results
    // and the current page is empty so we can immediately break.
    if (searchResult.aggregations.new_terms.after_key == null) {
      break;
    }
    const bucketsForField = searchResult.aggregations.new_terms.buckets;

    const createAlertsHook: CreateAlertsHook = async (aggResult) => {
      const eventsAndTerms: EventsAndTerms[] = (
        aggResult?.aggregations?.new_terms.buckets ?? []
      ).map((bucket) => {
        const newTerms = isObject(bucket.key) ? Object.values(bucket.key) : [bucket.key];
        return {
          event: bucket.docs.hits.hits[0],
          newTerms,
        };
      });

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

      // wrap and create alerts by chunks
      // large number of matches, processed in possibly 10,000 size of events and terms
      // can significantly affect Kibana performance
      const eventAndTermsChunks = chunk(eventsAndTerms, ALERT_CHUNK_MULTIPLIER * params.maxSignals);

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
          break;
        }
      }

      return bulkCreateResult;
    };

    // separate route for multiple new terms
    // it uses paging through composite aggregation
    if (params.newTermsFields.length > 1) {
      const bulkCreateResult = await multiTermsComposite({
        sharedParams,
        filterArgs,
        buckets: bucketsForField,
        params,
        aggregatableTimestampField,
        parsedHistoryWindowSize,
        services,
        result,
        logger,
        afterKey,
        createAlertsHook,
        isAlertSuppressionActive,
        isLoggedRequestsEnabled,
      });
      loggedRequests.push(...(bulkCreateResult?.loggedRequests ?? []));

      if (bulkCreateResult && 'alertsWereTruncated' in bulkCreateResult) {
        break;
      }
    } else {
      // PHASE 2: Take the page of results from Phase 1 and determine if each term exists in the history window.
      // The aggregation filters out buckets for terms that exist prior to `tuple.from`, so the buckets in the
      // response correspond to each new term.
      const includeValues = transformBucketsToValues(params.newTermsFields, bucketsForField);
      const pageSearchRequest = buildEventsSearchQuery({
        aggregations: buildNewTermsAgg({
          newValueWindowStart: tuple.from,
          timestampField: aggregatableTimestampField,
          field: params.newTermsFields[0],
          include: includeValues,
        }),
        runtimeMappings,
        searchAfterSortIds: undefined,
        index: inputIndex,
        // For Phase 2, we expand the time range to aggregate over the history window
        // in addition to the rule interval
        from: parsedHistoryWindowSize.toISOString(),
        to: tuple.to.toISOString(),
        filter: esFilter,
        size: 0,
        primaryTimestamp,
        secondaryTimestamp,
      });
      const {
        searchResult: pageSearchResult,
        searchDuration: pageSearchDuration,
        searchErrors: pageSearchErrors,
        loggedRequests: pageSearchLoggedRequests = [],
      } = await singleSearchAfter({
        searchRequest: pageSearchRequest,
        services,
        ruleExecutionLogger,
        loggedRequestsConfig: isLoggedRequestsEnabled
          ? {
              type: 'findNewTerms',
              description: i18n.FIND_NEW_TERMS_VALUES_DESCRIPTION(stringifyAfterKey(afterKey)),
              skipRequestQuery: pageNumber > 2,
            }
          : undefined,
      });
      result.searchAfterTimes.push(pageSearchDuration);
      result.errors.push(...pageSearchErrors);
      loggedRequests.push(...pageSearchLoggedRequests);

      logger.debug(`Time spent on phase 2 terms agg: ${pageSearchDuration}`);

      if (!pageSearchResult.aggregations) {
        throw new Error('Aggregations were missing on new terms search result');
      }

      // PHASE 3: For each term that is not in the history window, fetch the oldest document in
      // the rule interval for that term. This is the first document to contain the new term, and will
      // become the basis of the resulting alert.
      // One document could become multiple alerts if the document contains an array with multiple new terms.
      if (pageSearchResult.aggregations.new_terms.buckets.length > 0) {
        const actualNewTerms = pageSearchResult.aggregations.new_terms.buckets.map(
          (bucket) => bucket.key
        );

        const docFetchSearchRequest = buildEventsSearchQuery({
          aggregations: buildDocFetchAgg({
            timestampField: aggregatableTimestampField,
            field: params.newTermsFields[0],
            include: actualNewTerms,
          }),
          runtimeMappings,
          searchAfterSortIds: undefined,
          index: inputIndex,
          // For phase 3, we go back to aggregating only over the rule interval - excluding the history window
          from: tuple.from.toISOString(),
          to: tuple.to.toISOString(),
          filter: esFilter,
          size: 0,
          primaryTimestamp,
          secondaryTimestamp,
        });
        const {
          searchResult: docFetchSearchResult,
          searchDuration: docFetchSearchDuration,
          searchErrors: docFetchSearchErrors,
          loggedRequests: docFetchLoggedRequests = [],
        } = await singleSearchAfter({
          searchRequest: docFetchSearchRequest,
          services,
          ruleExecutionLogger,
          loggedRequestsConfig: isLoggedRequestsEnabled
            ? {
                type: 'findDocuments',
                description: i18n.FIND_NEW_TERMS_EVENTS_DESCRIPTION(stringifyAfterKey(afterKey)),
                skipRequestQuery: pageNumber > 2,
              }
            : undefined,
        });
        result.searchAfterTimes.push(docFetchSearchDuration);
        result.errors.push(...docFetchSearchErrors);
        loggedRequests.push(...docFetchLoggedRequests);

        if (!docFetchSearchResult.aggregations) {
          throw new Error('Aggregations were missing on document fetch search result');
        }

        // Collect rule execution metrics
        alertsCandidateCount = sum([
          alertsCandidateCount,
          docFetchSearchResult.aggregations.new_terms.buckets.length,
        ]);

        const bulkCreateResult = await createAlertsHook(docFetchSearchResult);

        if (bulkCreateResult.alertsWereTruncated) {
          result.warningMessages.push(
            isAlertSuppressionActive ? getSuppressionMaxSignalsWarning() : getMaxSignalsWarning()
          );
          break;
        }
      }
    }

    afterKey = searchResult.aggregations.new_terms.after_key;
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
