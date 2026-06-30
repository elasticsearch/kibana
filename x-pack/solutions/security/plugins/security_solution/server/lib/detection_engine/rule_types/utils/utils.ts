/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import agent from 'elastic-apm-node';
import { createHash } from 'crypto';
import { get, invert, isArray, isEmpty, merge, sum } from 'lodash';
import moment from 'moment';
import objectHash from 'object-hash';

import dateMath from '@kbn/datemath';
import type { estypes, TransportResult } from '@elastic/elasticsearch';
import { addSpanLabels } from '@kbn/apm-utils';
import {
  ALERT_UUID,
  ALERT_RULE_UUID,
  ALERT_RULE_PARAMETERS,
  TIMESTAMP,
  ALERT_INSTANCE_ID,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_TERMS,
} from '@kbn/rule-data-utils';
import type {
  ListArray,
  ExceptionListItemSchema,
  FoundExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';

import type { ElasticsearchClient } from '@kbn/core/server';
import { ENDPOINT_ARTIFACT_LIST_IDS } from '@kbn/securitysolution-list-constants';
import type { AlertingServerSetup } from '@kbn/alerting-plugin/server';
import { parseDuration } from '@kbn/alerting-plugin/server';
import type { ExceptionListClient } from '@kbn/lists-plugin/server';
import type { SanitizedRuleAction, GapReason } from '@kbn/alerting-plugin/common';
import { gapReasonType } from '@kbn/alerting-plugin/common';
import type { SuppressionFieldsLatest } from '@kbn/rule-registry-plugin/common/schemas';
import type { TimestampOverride } from '../../../../../common/api/detection_engine/model/rule_schema';
import type { Privilege } from '../../../../../common/api/detection_engine';
import type {
  SearchAfterAndBulkCreateReturnType,
  SignalSearchResponse,
  WrappedSignalHit,
  RuleRangeTuple,
  BaseSignalHit,
  SimpleHit,
  WrappedEventHit,
  SecuritySharedParams,
} from '../types';
import type { ShardError } from '../../../types';
import type {
  EqlRuleParams,
  EsqlRuleParams,
  MachineLearningRuleParams,
  QueryRuleParams,
  RuleParams,
  ThreatRuleParams,
  ThresholdRuleParams,
} from '../../rule_schema';
import type { BaseHit, SearchTypes } from '../../../../../common/detection_engine/types';
import type { IRuleExecutionLogForExecutors } from '../../rule_monitoring';
import { withSecuritySpan } from '../../../../utils/with_security_span';
import type {
  DetectionAlertLatest,
  DetectionAlert,
  EqlBuildingBlockAlertLatest,
  EqlShellAlertLatest,
  WrappedAlert,
} from '../../../../../common/api/detection_engine/model/alerts';
import type { GenericBulkCreateResponse } from '../factories';
import type {
  ExtraFieldsForShellAlert,
  WrappedEqlShellOptionalSubAlertsType,
} from '../eql/build_alert_group_from_sequence';
import type { BuildReasonMessage } from './reason_formatters';
import { getSuppressionTerms } from './suppression_utils';
import { robustGet } from './source_fields_merging/utils/robust_field_access';
import { SECURITY_NUM_EXCEPTION_ITEMS, SECURITY_QUERY_SPAN_S } from './apm_field_names';
import { buildTimeRangeFilter } from './build_events_query';
export const MAX_RULE_GAP_RATIO = 4;

export const hasTimestampFields = async (args: {
  timestampField: string;
  timestampFieldCapsResponse: TransportResult<estypes.FieldCapsResponse, unknown>;
  ruleExecutionLogger: IRuleExecutionLogForExecutors;
}): Promise<{
  foundNoIndices: boolean;
  warningMessage: string | undefined;
}> => {
  const { timestampField, timestampFieldCapsResponse, ruleExecutionLogger } = args;

  if (
    isEmpty(timestampFieldCapsResponse.body.fields) ||
    timestampFieldCapsResponse.body.fields[timestampField] == null ||
    timestampFieldCapsResponse.body.fields[timestampField]?.unmapped?.indices != null
  ) {
    // if there is a timestamp override and the unmapped array for the timestamp override key is not empty,
    // warning
    const errorString = `The following indices are missing the ${
      timestampField === '@timestamp'
        ? 'timestamp field "@timestamp"'
        : `timestamp override field "${timestampField}"`
    }: ${JSON.stringify(
      isEmpty(timestampFieldCapsResponse.body.fields) ||
        isEmpty(timestampFieldCapsResponse.body.fields[timestampField])
        ? timestampFieldCapsResponse.body.indices
        : timestampFieldCapsResponse.body.fields[timestampField]?.unmapped?.indices
    )}`;

    ruleExecutionLogger.warn(errorString);

    return { foundNoIndices: false, warningMessage: errorString };
  }

  return { foundNoIndices: false, warningMessage: undefined };
};

/**
 * Identifies frozen indices from the provided input indices.
 * If any of the input indices resolve to frozen indices within the specified time range, they are returned by this function.
 * @param {string[]} params.inputIndices - The list of input index patterns or indices to check.
 * @param {ElasticsearchClient} params.internalEsClient - A client to be used to query the elasticsearch cluster on behalf of the internal Kibana user.
 * @param {ElasticsearchClient} params.currentUserEsClient - A client to be used to query the elasticsearch cluster on behalf of the user that initiated the request to the Kibana server.
 * @param {string} params.to - The end of the time range for the query (e.g., "now").
 * @param {string} params.from - The start of the time range for the query (e.g., "now-1d").
 * @param {string} params.primaryTimestamp - The primary timestamp field used for filtering.
 * @param {string | undefined} params.secondaryTimestamp - The secondary timestamp field used for filtering, if applicable.
 * @returns {Promise<string[]>} A promise that resolves to a list of frozen indices.
 */
export const checkForFrozenIndices = async ({
  inputIndices,
  internalEsClient,
  currentUserEsClient,
  to,
  from,
  primaryTimestamp,
  secondaryTimestamp,
}: {
  inputIndices: string[];
  internalEsClient: ElasticsearchClient;
  currentUserEsClient: ElasticsearchClient;
  to: string;
  from: string;
  primaryTimestamp: string;
  secondaryTimestamp: string | undefined;
}): Promise<string[]> => {
  const fieldCapsResponse = await currentUserEsClient.fieldCaps({
    index: inputIndices,
    fields: ['_id'],
    ignore_unavailable: true,
    index_filter: buildTimeRangeFilter({
      to,
      from,
      primaryTimestamp,
      secondaryTimestamp,
    }),
  });

  const resolvedQueryIndices = isArray(fieldCapsResponse.indices)
    ? fieldCapsResponse.indices
    : [fieldCapsResponse.indices];

  // Frozen indices start with `partial-`, but it's possible
  // for some regular hot/warm index to start with that prefix as well by coincidence. If we find indices with that naming pattern,
  // we fetch information about the index using ilm explain to verify that they are actually frozen indices.
  const partialIndices = resolvedQueryIndices.filter((index) => index.startsWith('partial-'));
  if (partialIndices.length <= 0) {
    return [];
  }

  const explainResponse = await internalEsClient.ilm.explainLifecycle({
    // Use the original index patterns again instead of just the concrete names of the indices:
    // the list of concrete indices could be huge and make the request URL too large, but we know the list of index patterns works
    index: inputIndices.join(','),
    filter_path: 'indices.*.phase,indices.*.managed',
  });

  return partialIndices.filter((index) => {
    const indexResponse = explainResponse.indices[index];
    return indexResponse !== undefined && indexResponse.managed && indexResponse.phase === 'frozen';
  });
};

export const checkPrivilegesFromEsClient = async (
  esClient: ElasticsearchClient,
  indices: string[]
): Promise<Privilege> =>
  withSecuritySpan(
    'checkPrivilegesFromEsClient',
    async () =>
      (await esClient.transport.request({
        path: '/_security/user/_has_privileges',
        method: 'POST',
        body: {
          index: [
            {
              names: indices ?? [],
              allow_restricted_indices: true,
              privileges: ['read'],
            },
          ],
        },
      })) as Privilege
  );

export const getNumCatchupIntervals = ({
  gap,
  intervalDuration,
}: {
  gap: moment.Duration;
  intervalDuration: moment.Duration;
}): number => {
  if (gap.asMilliseconds() <= 0 || intervalDuration.asMilliseconds() <= 0) {
    return 0;
  }
  const ratio = Math.ceil(gap.asMilliseconds() / intervalDuration.asMilliseconds());
  // maxCatchup is to ensure we are not trying to catch up too far back.
  // This allows for a maximum of 4 consecutive rule execution misses
  // to be included in the number of signals generated.
  return ratio < MAX_RULE_GAP_RATIO ? ratio : MAX_RULE_GAP_RATIO;
};

export const getExceptions = async ({
  client,
  lists,
  shouldFilterOutEndpointExceptions,
}: {
  client: ExceptionListClient;
  lists: ListArray;
  shouldFilterOutEndpointExceptions: boolean;
}): Promise<ExceptionListItemSchema[]> => {
  return withSecuritySpan('getExceptions', async () => {
    const filteredLists = shouldFilterOutEndpointExceptions
      ? lists.filter(
          ({ list_id: listId }) =>
            !(ENDPOINT_ARTIFACT_LIST_IDS as readonly string[]).includes(listId)
        )
      : lists;

    if (filteredLists.length > 0) {
      try {
        const listIds = filteredLists.map(({ list_id: listId }) => listId);
        const namespaceTypes = filteredLists.map(
          ({ namespace_type: namespaceType }) => namespaceType
        );

        // Stream the results from the Point In Time (PIT) finder into this array
        let items: ExceptionListItemSchema[] = [];
        const executeFunctionOnStream = (response: FoundExceptionListItemSchema): void => {
          items = [...items, ...response.data];
        };

        await client.findExceptionListItemsPointInTimeFinder({
          executeFunctionOnStream,
          listId: listIds,
          namespaceType: namespaceTypes,
          perPage: 1_000, // See https://github.com/elastic/kibana/issues/93770 for choice of 1k
          filter: [],
          maxSize: undefined, // NOTE: This is unbounded when it is "undefined"
          sortOrder: undefined,
          sortField: undefined,
        });
        agent.setCustomContext({ [SECURITY_NUM_EXCEPTION_ITEMS]: items.length });
        return items;
      } catch (e) {
        throw new Error(
          `unable to fetch exception list items, message: "${e.message}" full error: "${e}"`
        );
      }
    } else {
      return [];
    }
  });
};

export const generateId = (
  docIndex: string,
  docId: string,
  version: string,
  ruleId: string
): string => createHash('sha256').update(docIndex.concat(docId, version, ruleId)).digest('hex');

export const parseInterval = (intervalString: string): moment.Duration | null => {
  try {
    return moment.duration(parseDuration(intervalString));
  } catch (err) {
    return null;
  }
};

export const getGapBetweenRuns = ({
  previousStartedAt,
  originalFrom,
  originalTo,
  startedAt,
}: {
  previousStartedAt: Date | undefined | null;
  originalFrom: moment.Moment;
  originalTo: moment.Moment;
  startedAt: Date;
}): moment.Duration => {
  if (previousStartedAt == null) {
    return moment.duration(0);
  }
  const driftTolerance = moment.duration(originalTo.diff(originalFrom));
  addSpanLabels({ [SECURITY_QUERY_SPAN_S]: driftTolerance.asSeconds() }, { isString: false });
  const currentDuration = moment.duration(moment(startedAt).diff(previousStartedAt));
  return currentDuration.subtract(driftTolerance);
};

export { type GapReason } from '@kbn/alerting-plugin/common';

/**
 * Determines why a gap occurred between rule executions.
 *
 * Returns `rule_disabled` only when the rule was re-enabled during the gap
 * and fired promptly after (within the lookback window). Defaults to
 * `rule_did_not_run` in all other cases (outages, missing data, etc).
 *
 * Known limitation: a brief toggle during an unrelated outage can be
 * misclassified as rule_disabled.
 */
export const getGapReason = ({
  previousStartedAt,
  startedAt,
  lastEnabledAt,
  originalFrom,
  originalTo,
}: {
  previousStartedAt: Date | null | undefined;
  startedAt: Date;
  lastEnabledAt: Date | null | undefined;
  originalFrom: moment.Moment;
  originalTo: moment.Moment;
}): GapReason => {
  if (previousStartedAt == null || lastEnabledAt == null) {
    return { type: gapReasonType.RULE_DID_NOT_RUN };
  }

  const lastEnabledAtMs = lastEnabledAt.getTime();
  const previousStartedAtMs = previousStartedAt.getTime();
  const startedAtMs = startedAt.getTime();

  const isInGapWindow = lastEnabledAtMs > previousStartedAtMs && lastEnabledAtMs <= startedAtMs;

  if (!isInGapWindow) {
    return { type: gapReasonType.RULE_DID_NOT_RUN };
  }

  const driftToleranceMs = originalTo.diff(originalFrom);
  const postEnableDelayMs = startedAtMs - lastEnabledAtMs;

  if (postEnableDelayMs <= driftToleranceMs) {
    return { type: gapReasonType.RULE_DISABLED };
  }

  return { type: gapReasonType.RULE_DID_NOT_RUN };
};

export const makeFloatString = (num: number): string => Number(num).toFixed(2);

export const getRuleRangeTuples = async ({
  startedAt,
  previousStartedAt,
  from,
  to,
  interval,
  maxSignals,
  ruleExecutionLogger,
  alerting,
  lastEnabledAt,
}: {
  startedAt: Date;
  previousStartedAt: Date | null | undefined;
  from: string;
  to: string;
  interval: string;
  maxSignals: number;
  ruleExecutionLogger: IRuleExecutionLogForExecutors;
  alerting: AlertingServerSetup;
  lastEnabledAt: Date | null | undefined;
}) => {
  const originalFrom = dateMath.parse(from, { forceNow: startedAt });
  const originalTo = dateMath.parse(to, { forceNow: startedAt });
  let warningStatusMessage;
  if (originalFrom == null || originalTo == null) {
    throw new Error('Failed to parse date math of rule.from or rule.to');
  }

  const maxAlertsAllowed = alerting.getConfig().run.alerts.max;
  let maxSignalsToUse = maxSignals;
  if (maxSignals > maxAlertsAllowed) {
    maxSignalsToUse = maxAlertsAllowed;
    warningStatusMessage = `The rule's max alerts per run setting (${maxSignals}) is greater than the Kibana alerting limit (${maxAlertsAllowed}). The rule will only write a maximum of ${maxAlertsAllowed} alerts per rule run.`;
    ruleExecutionLogger.warn(warningStatusMessage);
  }

  const tuples = [
    {
      to: originalTo,
      from: originalFrom,
      maxSignals: maxSignalsToUse,
    },
  ];

  const intervalDuration = parseInterval(interval);
  if (intervalDuration == null) {
    ruleExecutionLogger.error(
      `Error computing gap between rule runs\nError: could not parse rule interval "${JSON.stringify(
        interval
      )}"`
    );
    return {
      tuples,
      remainingGap: moment.duration(0),
      warningStatusMessage,
      originalFrom,
      originalTo,
    };
  }

  const gap = getGapBetweenRuns({
    previousStartedAt,
    originalTo,
    originalFrom,
    startedAt,
  });
  const catchup = getNumCatchupIntervals({
    gap,
    intervalDuration,
  });
  const catchupTuples = getCatchupTuples({
    originalTo,
    originalFrom,
    ruleParamsMaxSignals: maxSignalsToUse,
    catchup,
    intervalDuration,
  });

  tuples.push(...catchupTuples);

  // Each extra tuple adds one extra intervalDuration to the time range this rule will cover.
  const remainingGapMilliseconds = Math.max(
    gap.asMilliseconds() - catchup * intervalDuration.asMilliseconds(),
    0
  );

  let gapRange;
  let detectedGapReason: GapReason | undefined;
  if (remainingGapMilliseconds > 0 && previousStartedAt != null) {
    gapRange = {
      gte: previousStartedAt.toISOString(),
      lte: moment(previousStartedAt).add(remainingGapMilliseconds).toDate().toISOString(),
    };
    detectedGapReason = getGapReason({
      previousStartedAt,
      startedAt,
      lastEnabledAt,
      originalFrom,
      originalTo,
    });
  }

  return {
    tuples: tuples.reverse(),
    remainingGap: moment.duration(remainingGapMilliseconds),
    warningStatusMessage,
    gap: gapRange,
    gapReason: detectedGapReason,
    originalFrom,
    originalTo,
  };
};

/**
 * Creates rule range tuples needed to cover gaps since the last rule run.
 * @param to moment.Moment representing the rules 'to' property
 * @param from moment.Moment representing the rules 'from' property
 * @param ruleParamsMaxSignals int representing the maxSignals property on the rule (usually unmodified at 100)
 * @param catchup number the number of additional rule run intervals to add
 * @param intervalDuration moment.Duration the interval which the rule runs
 */
export const getCatchupTuples = ({
  originalTo,
  originalFrom,
  ruleParamsMaxSignals,
  catchup,
  intervalDuration,
}: {
  originalTo: moment.Moment;
  originalFrom: moment.Moment;
  ruleParamsMaxSignals: number;
  catchup: number;
  intervalDuration: moment.Duration;
}): RuleRangeTuple[] => {
  const catchupTuples: RuleRangeTuple[] = [];
  const intervalInMilliseconds = intervalDuration.asMilliseconds();
  let currentTo = originalTo;
  let currentFrom = originalFrom;
  // This loop will create tuples with overlapping time ranges, the same way rule runs have overlapping time
  // ranges due to the additional lookback. We could choose to create tuples that don't overlap here by using the
  // "from" value from one tuple as "to" in the next one, however, the overlap matters for rule types like EQL and
  // threshold rules that look for sets of documents within the query. Thus we keep the overlap so that these
  // extra tuples behave as similarly to the regular rule runs as possible.
  while (catchupTuples.length < catchup) {
    const nextTo = currentTo.clone().subtract(intervalInMilliseconds);
    const nextFrom = currentFrom.clone().subtract(intervalInMilliseconds);
    catchupTuples.push({
      to: nextTo,
      from: nextFrom,
      maxSignals: ruleParamsMaxSignals,
    });
    currentTo = nextTo;
    currentFrom = nextFrom;
  }
  return catchupTuples;
};

/**
 * Takes the rule schedule fields `interval` and `lookback` and uses them to calculate the `from` value for a rule
 *
 * @param interval string representing the interval on which the rule runs
 * @param lookback string representing the rule's additional lookback
 * @returns string representing the rule's 'from' property
 */
export const calculateFromValue = (interval: string, lookback: string) => {
  const parsedInterval = parseInterval(interval) ?? moment.duration(0);
  const parsedFrom = parseInterval(lookback) ?? moment.duration(0);
  const duration = parsedFrom.asSeconds() + parsedInterval.asSeconds();
  return `now-${duration}s`;
};

/**
 * Given errors from a search query this will return an array of strings derived from the errors.
 * @param errors The errors to derive the strings from
 */
export const createErrorsFromShard = ({ errors }: { errors: ShardError[] }): string[] => {
  return errors.map((error) => {
    const {
      index,
      reason: {
        reason,
        type,
        caused_by: { reason: causedByReason, type: causedByType } = {
          reason: undefined,
          type: undefined,
        },
      } = {},
    } = error;

    return [
      ...(index != null ? [`index: "${index}"`] : []),
      ...(reason != null ? [`reason: "${reason}"`] : []),
      ...(type != null ? [`type: "${type}"`] : []),
      ...(causedByReason != null ? [`caused by reason: "${causedByReason}"`] : []),
      ...(causedByType != null ? [`caused by type: "${causedByType}"`] : []),
    ].join(' ');
  });
};

/**
 * Given a search hit this will return a valid last date if it can find one, otherwise it
 * will return undefined. This tries the "fields" first to get a formatted date time if it can, but if
 * it cannot it will resort to using the "_source" fields second which can be problematic if the date time
 * is not correctly ISO8601 or epoch milliseconds formatted.
 * @param searchResult The result to try and parse out the timestamp.
 * @param primaryTimestamp The primary timestamp to use.
 */
export const getValidDateFromDoc = ({
  doc,
  primaryTimestamp,
}: {
  doc: BaseSignalHit;
  primaryTimestamp: TimestampOverride;
}): Date | undefined => {
  const timestampValue =
    doc.fields != null && doc.fields[primaryTimestamp] != null
      ? doc.fields[primaryTimestamp][0]
      : doc._source != null
      ? (doc._source as { [key: string]: unknown })[primaryTimestamp]
      : undefined;
  const lastTimestamp =
    typeof timestampValue === 'string' || typeof timestampValue === 'number'
      ? timestampValue
      : undefined;
  if (lastTimestamp != null) {
    const tempMoment = moment(lastTimestamp);
    if (tempMoment.isValid()) {
      return tempMoment.toDate();
    } else if (typeof timestampValue === 'string') {
      // worst case we have a string from fields API or other areas of Elasticsearch that have given us a number as a string,
      // so we try one last time to parse this best we can by converting from string to a number
      const maybeDate = moment(+lastTimestamp);
      if (maybeDate.isValid()) {
        return maybeDate.toDate();
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
};

export const createSearchAfterReturnTypeFromResponse = <
  TAggregations = Record<estypes.AggregateName, estypes.AggregationsAggregate>
>({
  searchResult,
  primaryTimestamp,
}: {
  searchResult: SignalSearchResponse<TAggregations>;
  primaryTimestamp: TimestampOverride;
}): SearchAfterAndBulkCreateReturnType => {
  return createSearchAfterReturnType({
    success:
      searchResult._shards.failed === 0 ||
      searchResult._shards.failures?.every((failure) => {
        return (
          failure.reason?.reason?.includes(
            'No mapping found for [@timestamp] in order to sort on'
          ) ||
          failure.reason?.reason?.includes(
            `No mapping found for [${primaryTimestamp}] in order to sort on`
          )
        );
      }),
    alertsCandidateCount: searchResult.hits.hits.length,
  });
};

export const createSearchAfterReturnType = ({
  success,
  warning,
  searchAfterTimes,
  enrichmentTimes,
  bulkCreateTimes,
  alertsCandidateCount,
  createdSignalsCount,
  createdSignals,
  errors,
  warningMessages,
  suppressedAlertsCount,
  totalEventsFound,
}: {
  success?: boolean | undefined;
  warning?: boolean;
  searchAfterTimes?: string[] | undefined;
  enrichmentTimes?: string[] | undefined;
  bulkCreateTimes?: string[] | undefined;
  alertsCandidateCount?: number | undefined;
  createdSignalsCount?: number | undefined;
  createdSignals?: unknown[] | undefined;
  errors?: string[] | undefined;
  warningMessages?: string[] | undefined;
  suppressedAlertsCount?: number | undefined;
  totalEventsFound?: number | undefined;
} = {}): SearchAfterAndBulkCreateReturnType => {
  return {
    success: success ?? true,
    warning: warning ?? false,
    searchAfterTimes: searchAfterTimes ?? [],
    enrichmentTimes: enrichmentTimes ?? [],
    bulkCreateTimes: bulkCreateTimes ?? [],
    alertsCandidateCount,
    createdSignalsCount: createdSignalsCount ?? 0,
    createdSignals: createdSignals ?? [],
    errors: errors ?? [],
    warningMessages: warningMessages ?? [],
    suppressedAlertsCount: suppressedAlertsCount ?? 0,
  };
};

/**
 * Merges the return values from bulk creating alerts into the appropriate fields in the combined return object.
 */
export const addToSearchAfterReturn = ({
  current,
  next,
}: {
  current: SearchAfterAndBulkCreateReturnType;
  next: Omit<GenericBulkCreateResponse<DetectionAlertLatest>, 'alertsWereTruncated'>;
}) => {
  current.success = current.success && next.success;
  current.createdSignalsCount += next.createdItemsCount;
  current.createdSignals.push(...next.createdItems);
  current.bulkCreateTimes.push(next.bulkCreateDuration);
  current.enrichmentTimes.push(next.enrichmentDuration);
  current.errors = [...new Set([...current.errors, ...next.errors])];
  if (next.suppressedItemsCount != null) {
    current.suppressedAlertsCount =
      (current.suppressedAlertsCount ?? 0) + next.suppressedItemsCount;
  }
};

export const mergeReturns = (
  searchAfters: SearchAfterAndBulkCreateReturnType[]
): SearchAfterAndBulkCreateReturnType => {
  return searchAfters.reduce((prev, next) => {
    const {
      success: existingSuccess,
      warning: existingWarning,
      searchAfterTimes: existingSearchAfterTimes,
      bulkCreateTimes: existingBulkCreateTimes,
      enrichmentTimes: existingEnrichmentTimes,
      alertsCandidateCount: existingAlertsCandidateCount,
      createdSignalsCount: existingCreatedSignalsCount,
      createdSignals: existingCreatedSignals,
      errors: existingErrors,
      warningMessages: existingWarningMessages,
      suppressedAlertsCount: existingSuppressedAlertsCount,
      totalEventsFound: existingTotalEventsFound,
    }: SearchAfterAndBulkCreateReturnType = prev;

    const {
      success: newSuccess,
      warning: newWarning,
      searchAfterTimes: newSearchAfterTimes,
      enrichmentTimes: newEnrichmentTimes,
      bulkCreateTimes: newBulkCreateTimes,
      alertsCandidateCount: newAlertsCandidateCount,
      createdSignalsCount: newCreatedSignalsCount,
      createdSignals: newCreatedSignals,
      errors: newErrors,
      warningMessages: newWarningMessages,
      suppressedAlertsCount: newSuppressedAlertsCount,
      totalEventsFound: newTotalEventsFound,
    }: SearchAfterAndBulkCreateReturnType = next;

    return {
      success: existingSuccess && newSuccess,
      warning: existingWarning || newWarning,
      searchAfterTimes: [...existingSearchAfterTimes, ...newSearchAfterTimes],
      enrichmentTimes: [...existingEnrichmentTimes, ...newEnrichmentTimes],
      bulkCreateTimes: [...existingBulkCreateTimes, ...newBulkCreateTimes],
      alertsCandidateCount: sum([existingAlertsCandidateCount, newAlertsCandidateCount]),
      createdSignalsCount: existingCreatedSignalsCount + newCreatedSignalsCount,
      createdSignals: [...existingCreatedSignals, ...newCreatedSignals],
      errors: [...new Set([...existingErrors, ...newErrors])],
      warningMessages: [...existingWarningMessages, ...newWarningMessages],
      suppressedAlertsCount: (existingSuppressedAlertsCount ?? 0) + (newSuppressedAlertsCount ?? 0),
      totalEventsFound: (existingTotalEventsFound ?? 0) + (newTotalEventsFound ?? 0),
    };
  });
};

export const getTotalHitsValue = (totalHits: number | { value: number } | undefined): number =>
  typeof totalHits === 'undefined'
    ? -1
    : typeof totalHits === 'number'
    ? totalHits
    : totalHits.value;

export const calculateTotal = (
  prevTotal: number | { value: number } | undefined,
  nextTotal: number | { value: number } | undefined
): number => {
  const prevTotalHits = getTotalHitsValue(prevTotal);
  const nextTotalHits = getTotalHitsValue(nextTotal);
  if (prevTotalHits === -1 || nextTotalHits === -1) {
    return -1;
  }
  return prevTotalHits + nextTotalHits;
};

export const isEqlParams = (params: RuleParams): params is EqlRuleParams => params.type === 'eql';
export const isEsqlParams = (params: RuleParams): params is EsqlRuleParams =>
  params.type === 'esql';
export const isThresholdParams = (params: RuleParams): params is ThresholdRuleParams =>
  params.type === 'threshold';
export const isQueryParams = (params: RuleParams): params is QueryRuleParams =>
  params.type === 'query';
export const isThreatParams = (params: RuleParams): params is ThreatRuleParams =>
  params.type === 'threat_match';
export const isMachineLearningParams = (params: RuleParams): params is MachineLearningRuleParams =>
  params.type === 'machine_learning';

/**
 * Prevent javascript from returning Number.MAX_SAFE_INTEGER when Elasticsearch expects
 * Java's Long.MAX_VALUE. This happens when sorting fields by date which are
 * unmapped in the provided index
 *
 * Ref: https://github.com/elastic/elasticsearch/issues/28806#issuecomment-369303620
 *
 * return stringified Long.MAX_VALUE if we receive Number.MAX_SAFE_INTEGER
 * @param sortIds estypes.SortResults | undefined
 * @returns SortResults
 */
export const getSafeSortIds = (sortIds: estypes.SortResults | undefined) => {
  return sortIds?.map((sortId) => {
    // haven't determined when we would receive a null value for a sort id
    // but in case we do, default to sending the stringified Java max_int
    if (sortId == null || sortId === '' || Number(sortId) >= Number.MAX_SAFE_INTEGER) {
      return '9223372036854775807';
    }
    return sortId;
  });
};

export const isWrappedEventHit = (event: SimpleHit): event is WrappedEventHit => {
  return !isWrappedSignalHit(event) && !isWrappedDetectionAlert(event);
};

export const isWrappedSignalHit = (event: SimpleHit): event is WrappedSignalHit => {
  return (event as WrappedSignalHit)?._source?.signal != null;
};

export const isWrappedDetectionAlert = (event: SimpleHit): event is BaseHit<DetectionAlert> => {
  return (event as BaseHit<DetectionAlert>)?._source?.[ALERT_UUID] != null;
};

export const isDetectionAlert = (event: unknown): event is DetectionAlert => {
  return get(event, ALERT_UUID) != null;
};

export const racFieldMappings: Record<string, string> = {
  'signal.rule.id': ALERT_RULE_UUID,
  'signal.rule.description': `${ALERT_RULE_PARAMETERS}.description`,
  'signal.rule.filters': `${ALERT_RULE_PARAMETERS}.filters`,
  'signal.rule.language': `${ALERT_RULE_PARAMETERS}.language`,
  'signal.rule.query': `${ALERT_RULE_PARAMETERS}.query`,
  'signal.rule.risk_score': `${ALERT_RULE_PARAMETERS}.riskScore`,
  'signal.rule.severity': `${ALERT_RULE_PARAMETERS}.severity`,
  'signal.rule.building_block_type': `${ALERT_RULE_PARAMETERS}.buildingBlockType`,
  'signal.rule.namespace': `${ALERT_RULE_PARAMETERS}.namespace`,
  'signal.rule.note': `${ALERT_RULE_PARAMETERS}.note`,
  'signal.rule.license': `${ALERT_RULE_PARAMETERS}.license`,
  'signal.rule.output_index': `${ALERT_RULE_PARAMETERS}.outputIndex`,
  'signal.rule.timeline_id': `${ALERT_RULE_PARAMETERS}.timelineId`,
  'signal.rule.timeline_title': `${ALERT_RULE_PARAMETERS}.timelineTitle`,
  'signal.rule.meta': `${ALERT_RULE_PARAMETERS}.meta`,
  'signal.rule.rule_name_override': `${ALERT_RULE_PARAMETERS}.ruleNameOverride`,
  'signal.rule.timestamp_override': `${ALERT_RULE_PARAMETERS}.timestampOverride`,
  'signal.rule.author': `${ALERT_RULE_PARAMETERS}.author`,
  'signal.rule.false_positives': `${ALERT_RULE_PARAMETERS}.falsePositives`,
  'signal.rule.from': `${ALERT_RULE_PARAMETERS}.from`,
  'signal.rule.rule_id': `${ALERT_RULE_PARAMETERS}.ruleId`,
  'signal.rule.max_signals': `${ALERT_RULE_PARAMETERS}.maxSignals`,
  'signal.rule.risk_score_mapping': `${ALERT_RULE_PARAMETERS}.riskScoreMapping`,
  'signal.rule.severity_mapping': `${ALERT_RULE_PARAMETERS}.severityMapping`,
  'signal.rule.threat': `${ALERT_RULE_PARAMETERS}.threat`,
  'signal.rule.to': `${ALERT_RULE_PARAMETERS}.to`,
  'signal.rule.references': `${ALERT_RULE_PARAMETERS}.references`,
  'signal.rule.version': `${ALERT_RULE_PARAMETERS}.version`,
  'signal.rule.exceptions_list': `${ALERT_RULE_PARAMETERS}.exceptionsList`,
  'signal.rule.immutable': `${ALERT_RULE_PARAMETERS}.immutable`,
};

export const getField = (event: SimpleHit, field: string): SearchTypes | undefined => {
  if (isWrappedDetectionAlert(event)) {
    const mappedField = racFieldMappings[field] ?? field.replace('signal', 'kibana.alert');
    const parts = mappedField.split('.');
    if (mappedField.includes(ALERT_RULE_PARAMETERS) && parts[parts.length - 1] !== 'parameters') {
      const params = get(event._source, ALERT_RULE_PARAMETERS);
      return get(params, parts[parts.length - 1]);
    }
    return get(event._source, mappedField) as SearchTypes | undefined;
  } else if (isWrappedSignalHit(event)) {
    const mappedField = invert(racFieldMappings)[field] ?? field.replace('kibana.alert', 'signal');
    return get(event._source, mappedField) as SearchTypes | undefined;
  } else if (isWrappedEventHit(event)) {
    return get(event._source, field) as SearchTypes | undefined;
  }
};

export const getUnprocessedExceptionsWarnings = (
  unprocessedExceptions: ExceptionListItemSchema[]
): string | undefined => {
  if (unprocessedExceptions.length > 0) {
    const exceptionNames = unprocessedExceptions.map((exception) => exception.name);
    return `The following exceptions won't be applied to rule execution: ${exceptionNames.join(
      ', '
    )}`;
  }
};

export const getMaxSignalsWarning = (): string => {
  return `This rule reached the maximum alert limit for the rule execution. Some alerts were not created.`;
};

export const getSuppressionMaxSignalsWarning = (): string => {
  return `This rule reached the maximum alert limit for the rule execution. Some alerts were not created or suppressed.`;
};

export const getMissingIdFieldWarning = (): string => {
  return `ES|QL query does not return _id metadata field for a non-aggregating query. This may result in duplicate alerts. Consider adding "METADATA _id" to the FROM command and make sure _id is not excluded by KEEP or DROP commands.`;
};

export const getMetadataIdInjectionFailedWarning = (reason: string): string => {
  return `Failed to automatically inject METADATA _id into ES|QL query: ${reason}. This may result in duplicate alerts. Try manually adding "METADATA _id" to the FROM command and ensure _id is returned in the query results.`;
};

export const getDisabledActionsWarningText = ({
  alertsCreated,
  disabledActions,
}: {
  alertsCreated: boolean;
  disabledActions: SanitizedRuleAction[];
}) => {
  const uniqueActionTypes = new Set(disabledActions.map((action) => action.actionTypeId));

  const actionTypesJoined = [...uniqueActionTypes].join(', ');

  // This rule generated alerts but did not send external notifications because rule action connectors ${actionTypes} aren't enabled. To send notifications, you need a higher Security Analytics tier.
  const alertsGeneratedText = alertsCreated
    ? 'This rule generated alerts but did not send external notifications because rule action'
    : 'Rule action';

  if (uniqueActionTypes.size > 1) {
    return `${alertsGeneratedText} connectors ${actionTypesJoined} are not enabled. To send notifications, you need a higher Security Analytics license / tier`;
  } else {
    return `${alertsGeneratedText} connector ${actionTypesJoined} is not enabled. To send notifications, you need a higher Security Analytics license / tier`;
  }
};

export type RuleWithInMemorySuppression =
  | ThreatRuleParams
  | EqlRuleParams
  | MachineLearningRuleParams;

export interface SequenceSuppressionTermsAndFieldsParams {
  sharedParams: SecuritySharedParams<EqlRuleParams>;
  shellAlert: WrappedAlert<EqlShellAlertLatest>;
  buildingBlockAlerts: Array<WrappedAlert<EqlBuildingBlockAlertLatest>>;
}

export type SequenceSuppressionTermsAndFieldsFactory = (
  shellAlert: WrappedEqlShellOptionalSubAlertsType,
  buildingBlockAlerts: Array<WrappedAlert<EqlBuildingBlockAlertLatest>>,
  buildReasonMessage: BuildReasonMessage
) => WrappedAlert<EqlShellAlertLatest & SuppressionFieldsLatest> & {
  subAlerts: Array<WrappedAlert<EqlBuildingBlockAlertLatest>>;
};

/**
 * converts ES after_key object into string
 * for example: { "agent.name": "test" } would become `agent.name: test`
 */
export const stringifyAfterKey = (afterKey: Record<string, string | number | null> | undefined) => {
  if (!afterKey) {
    return;
  }

  return Object.entries(afterKey)
    .map((entry) => entry.join(': '))
    .join(', ');
};

export const buildShellAlertSuppressionTermsAndFields = ({
  sharedParams,
  shellAlert,
  buildingBlockAlerts,
}: SequenceSuppressionTermsAndFieldsParams): WrappedAlert<
  EqlShellAlertLatest & SuppressionFieldsLatest
> & {
  subAlerts: Array<WrappedAlert<EqlBuildingBlockAlertLatest>>;
} => {
  const { alertTimestampOverride, primaryTimestamp, secondaryTimestamp, completeRule, spaceId } =
    sharedParams;
  const suppressionTerms = getSuppressionTerms({
    alertSuppression: completeRule?.ruleParams?.alertSuppression,
    input: shellAlert._source,
  });
  const instanceId = objectHash([suppressionTerms, completeRule.alertId, spaceId]);

  const primarySuppressionTime = robustGet({
    key: primaryTimestamp,
    document: shellAlert._source,
  }) as string | undefined;

  const secondarySuppressionTime =
    secondaryTimestamp &&
    (robustGet({
      key: secondaryTimestamp,
      document: shellAlert._source,
    }) as string | undefined);

  const suppressionTime = new Date(
    primarySuppressionTime ??
      secondarySuppressionTime ??
      alertTimestampOverride ??
      shellAlert._source[TIMESTAMP]
  );

  const suppressionFields: ExtraFieldsForShellAlert = {
    [ALERT_INSTANCE_ID]: instanceId,
    [ALERT_SUPPRESSION_TERMS]: suppressionTerms,
    [ALERT_SUPPRESSION_START]: suppressionTime,
    [ALERT_SUPPRESSION_END]: suppressionTime,
    [ALERT_SUPPRESSION_DOCS_COUNT]: 0,
  };

  merge<EqlShellAlertLatest, SuppressionFieldsLatest>(shellAlert._source, suppressionFields);

  return {
    _id: shellAlert._id,
    _index: shellAlert._index,
    _source: shellAlert._source as EqlShellAlertLatest & SuppressionFieldsLatest,
    subAlerts: buildingBlockAlerts,
  };
};
