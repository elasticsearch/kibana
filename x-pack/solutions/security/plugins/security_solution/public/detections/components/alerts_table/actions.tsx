/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import { isEmpty } from 'lodash/fp';
import moment from 'moment';

import dateMath from '@kbn/datemath';
import type { estypes } from '@elastic/elasticsearch';

import type { Filter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';

import {
  ALERT_RULE_FROM,
  ALERT_RULE_TYPE,
  ALERT_RULE_NOTE,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_CREATED_BY,
  ALERT_SUPPRESSION_START,
  ALERT_SUPPRESSION_END,
  ALERT_SUPPRESSION_DOCS_COUNT,
  ALERT_SUPPRESSION_TERMS,
  TIMESTAMP,
} from '@kbn/rule-data-utils';

import type { Type as RuleType } from '@kbn/securitysolution-io-ts-alerting-types';
import { lastValueFrom } from 'rxjs';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import type { DataTableModel } from '@kbn/securitysolution-data-table';
import type { TimelineEventsDetailsRequestOptionsInput } from '@kbn/timelines-plugin/common';
import {
  ALERT_ORIGINAL_TIME,
  ALERT_GROUP_ID,
  ALERT_RULE_TIMELINE_ID,
  ALERT_THRESHOLD_RESULT,
  ALERT_NEW_TERMS,
  ALERT_RULE_INDICES,
} from '../../../../common/field_maps/field_names';
import {
  isEqlRule,
  isEsqlRule,
  isMlRule,
  isNewTermsRule,
  isThresholdRule,
} from '../../../../common/detection_engine/utils';
import { TimelineId } from '../../../../common/types/timeline';
import { TimelineStatusEnum, TimelineTypeEnum } from '../../../../common/api/timeline';
import type {
  SendAlertToTimelineActionProps,
  ThresholdAggregationData,
  UpdateAlertStatusActionProps,
  CreateTimelineProps,
  GetExceptionFilter,
  CreateTimeline,
} from './types';
import type {
  TimelineEventsDetailsItem,
  TimelineEventsDetailsStrategyResponse,
} from '../../../../common/search_strategy/timeline';
import { TimelineEventsQueries } from '../../../../common/search_strategy/timeline';
import { timelineDefaults } from '../../../timelines/store/defaults';
import { formatTimelineResponseToModel } from '../../../timelines/components/open_timeline/helpers';
import { convertKueryToElasticSearchQuery } from '../../../common/lib/kuery';
import { getField, getFieldKey } from '../../../helpers';
import {
  replaceTemplateFieldFromQuery,
  replaceTemplateFieldFromMatchFilters,
  replaceTemplateFieldFromDataProviders,
} from './helpers';
import type {
  DataProvider,
  QueryOperator,
} from '../../../timelines/components/timeline/data_providers/data_provider';
import { getTimelineTemplate } from '../../../timelines/containers/api';
import { KibanaServices } from '../../../common/lib/kibana';
import { DETECTION_ENGINE_QUERY_SIGNALS_URL } from '../../../../common/constants';
import { buildAlertsQuery, formatAlertToEcsSignal } from '../../../common/utils/alerts';
import {
  DEFAULT_FROM_MOMENT,
  DEFAULT_TO_MOMENT,
} from '../../../common/utils/default_date_settings';
import { updateAlertStatus } from '../../../common/components/toolbar/bulk_actions/update_alerts';

export const updateAlertStatusAction = async ({
  query,
  alertIds,
  selectedStatus,
  setEventsLoading,
  setEventsDeleted,
  onAlertStatusUpdateSuccess,
  onAlertStatusUpdateFailure,
}: UpdateAlertStatusActionProps) => {
  try {
    setEventsLoading({ eventIds: alertIds, isLoading: true });

    const response = await updateAlertStatus({
      query: query && JSON.parse(query),
      status: selectedStatus,
      signalIds: alertIds,
    });

    setEventsDeleted({ eventIds: alertIds, isDeleted: true });

    if (response.version_conflicts && alertIds.length === 1) {
      throw new Error(
        i18n.translate(
          'xpack.securitySolution.detectionEngine.alerts.updateAlertStatusFailedSingleAlert',
          {
            defaultMessage: 'Failed to update alert because it was already being modified.',
          }
        )
      );
    }

    onAlertStatusUpdateSuccess(
      response.updated ?? 0,
      response.version_conflicts ?? 0,
      selectedStatus
    );
  } catch (error) {
    onAlertStatusUpdateFailure(selectedStatus, error);
  } finally {
    setEventsLoading({ eventIds: alertIds, isLoading: false });
  }
};

export const determineToAndFrom = ({ ecs }: { ecs: Ecs[] | Ecs }) => {
  if (Array.isArray(ecs)) {
    const timestamps = ecs.reduce<number[]>((acc, item) => {
      const dateTimestamp = item.timestamp ? new Date(item.timestamp) : new Date();
      if (!acc.includes(dateTimestamp.valueOf())) {
        return [...acc, dateTimestamp.valueOf()];
      }
      return acc;
    }, []);
    return {
      from: new Date(Math.min(...timestamps)).toISOString(),
      to: new Date(Math.max(...timestamps)).toISOString(),
    };
  }
  const ecsData = ecs as Ecs;
  const ruleFrom = getField(ecsData, ALERT_RULE_FROM);
  const elapsedTimeRule = moment.duration(
    moment().diff(dateMath.parse(ruleFrom != null ? ruleFrom[0] : 'now-1d'))
  );

  const alertTimestampEcsValue = getField(ecsData, TIMESTAMP);
  const alertTimestamp = Array.isArray(alertTimestampEcsValue)
    ? alertTimestampEcsValue[0]
    : alertTimestampEcsValue;
  const to = moment(alertTimestamp ?? new Date()).toISOString();
  const from = moment(to).subtract(elapsedTimeRule).toISOString();

  return { to, from };
};

const calculateFromTimeFallback = (thresholdData: Ecs, originalTime: moment.Moment) => {
  // relative time that the rule's time range starts at (e.g. now-1h)

  const ruleFromValue = getField(thresholdData, ALERT_RULE_FROM);
  const normalizedRuleFromValue = Array.isArray(ruleFromValue) ? ruleFromValue[0] : ruleFromValue;
  const ruleFrom = dateMath.parse(normalizedRuleFromValue);

  // get the absolute (moment.duration) interval by subtracting `ruleFrom` from `now`
  const now = moment();
  const ruleInterval = moment.duration(now.diff(ruleFrom));

  // subtract the rule interval from the time the alert was generated... this will
  // overshoot and potentially contain false positives in the timeline results
  return originalTime.clone().subtract(ruleInterval);
};

export const getThresholdAggregationData = (ecsData: Ecs | Ecs[]): ThresholdAggregationData => {
  const thresholdEcsData: Ecs[] = Array.isArray(ecsData) ? ecsData : [ecsData];
  return thresholdEcsData.reduce<ThresholdAggregationData>(
    (outerAcc, thresholdData) => {
      const threshold =
        getField(thresholdData, `${ALERT_RULE_PARAMETERS}.threshold`) ??
        thresholdData.signal?.rule?.threshold;

      const thresholdResult: {
        terms: Array<{
          field: string;
          value: string;
        }>;
        count: number;
        from: string;
      } = getField(thresholdData, ALERT_THRESHOLD_RESULT);

      // timestamp representing when the alert was generated
      const originalTimeValue = getField(thresholdData, ALERT_ORIGINAL_TIME);
      const normalizedOriginalTimeValue = Array.isArray(originalTimeValue)
        ? originalTimeValue[0]
        : originalTimeValue;
      const originalTime = moment(normalizedOriginalTimeValue);

      /*
       * Compute the fallback interval when `threshold_result.from` is not available
       * (for pre-7.12 backcompat)
       */
      const fromOriginalTime = calculateFromTimeFallback(thresholdData, originalTime);

      const aggregationFields: string[] = Array.isArray(threshold.field)
        ? threshold.field
        : [threshold.field];

      return {
        thresholdFrom: thresholdResult.from ?? fromOriginalTime.toISOString(),
        thresholdTo: originalTime.toISOString(),
        dataProviders: [
          ...outerAcc.dataProviders,
          ...aggregationFields.reduce<DataProvider[]>((acc, aggregationField, i) => {
            const aggregationValue = thresholdResult.terms.filter(
              (term) => term.field === aggregationField
            )[0].value;
            const dataProviderValue = Array.isArray(aggregationValue)
              ? aggregationValue[0]
              : aggregationValue;

            if (!dataProviderValue) {
              return acc;
            }

            const aggregationFieldId = aggregationField.replace('.', '-');
            const dataProviderPartial = {
              id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-${TimelineId.active}-${aggregationFieldId}-${dataProviderValue}`,
              name: aggregationField,
              enabled: true,
              excluded: false,
              kqlQuery: '',
              queryMatch: {
                field: aggregationField,
                value: dataProviderValue,
                operator: ':' as QueryOperator,
              },
            };

            if (i === 0) {
              return [
                ...acc,
                {
                  ...dataProviderPartial,
                  and: [],
                },
              ];
            } else {
              acc[0].and.push(dataProviderPartial);
              return acc;
            }
          }, []),
        ],
      };
    },
    { dataProviders: [], thresholdFrom: '', thresholdTo: '' } as ThresholdAggregationData
  );
};

export const isEqlAlertWithGroupId = (ecsData: Ecs): boolean => {
  const ruleType = getField(ecsData, ALERT_RULE_TYPE);
  const groupId = getField(ecsData, ALERT_GROUP_ID);
  const isEql = ruleType === 'eql' || (Array.isArray(ruleType) && ruleType[0] === 'eql');
  return isEql && groupId?.length > 0;
};

const getRuleType = (ecsData: Ecs): RuleType | undefined => {
  const ruleType = getField(ecsData, ALERT_RULE_TYPE);
  return Array.isArray(ruleType) ? ruleType[0] : ruleType;
};

const isNewTermsAlert = (ecsData: Ecs): boolean => isNewTermsRule(getRuleType(ecsData));
const isEsqlAlert = (ecsData: Ecs): boolean => isEsqlRule(getRuleType(ecsData));
const isEqlAlert = (ecsData: Ecs): boolean => isEqlRule(getRuleType(ecsData));
const isThresholdAlert = (ecsData: Ecs): boolean => isThresholdRule(getRuleType(ecsData));
const isMlAlert = (ecsData: Ecs): boolean => isMlRule(getRuleType(ecsData));

const isSuppressedAlert = (ecsData: Ecs): boolean => {
  return getField(ecsData, ALERT_SUPPRESSION_DOCS_COUNT) != null;
};

export const buildAlertsKqlFilter = (
  key: '_id' | 'signal.group.id' | 'kibana.alert.group.id',
  alertIds: string[],
  label: string = 'Alert Ids'
): Filter[] => {
  const singleId = alertIds.length === 1;
  if (singleId) {
    return [
      {
        meta: {
          alias: null,
          negate: false,
          disabled: false,
          type: 'phrase',
          key,
          params: {
            query: alertIds[0],
          },
        },
        query: {
          match_phrase: {
            _id: alertIds[0],
          },
        },
        $state: {
          store: FilterStateStore.APP_STATE,
        },
      },
    ];
  }

  return [
    {
      query: {
        bool: {
          filter: {
            ids: {
              values: alertIds,
            },
          },
        },
      },
      meta: {
        alias: label,
        negate: false,
        disabled: false,
        type: 'phrases',
        key,
        value: alertIds.join(),
        params: alertIds,
      },
      $state: {
        store: FilterStateStore.APP_STATE,
      },
    },
  ];
};

const buildEventsDataProviderById = (
  key: '_id' | 'signal.group.id' | 'kibana.alert.group.id',
  eventIds: string[]
): DataProvider[] => {
  const singleId = eventIds.length === 1;
  return [
    {
      and: [],
      id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-${
        TimelineId.active
      }-alert-id-${eventIds.join(',')}`,
      name: eventIds.join(','),
      enabled: true,
      excluded: false,
      kqlQuery: '',
      queryMatch: {
        field: key,
        // @ts-ignore till https://github.com/elastic/kibana/pull/142436 is merged
        value: singleId ? eventIds[0] : eventIds,
        // @ts-ignore till https://github.com/elastic/kibana/pull/142436 is merged
        operator: singleId ? ':' : 'includes',
      },
    },
  ];
};

const buildTimelineDataProviderOrFilter = (
  alertIds: string[],
  prefer: 'dataProvider' | 'KqlFilter',
  label?: string
): { filters: Filter[]; dataProviders: DataProvider[] } => {
  return {
    filters: prefer === 'KqlFilter' ? buildAlertsKqlFilter('_id', alertIds, label) : [],
    dataProviders: prefer === 'dataProvider' ? buildEventsDataProviderById('_id', alertIds) : [],
  };
};

const buildEqlDataProviderOrFilter = (
  alertIds: string[],
  ecs: Ecs[] | Ecs
): { filters: Filter[]; dataProviders: DataProvider[] } => {
  if (!isEmpty(alertIds) && Array.isArray(ecs) && ecs.length > 1) {
    return {
      dataProviders: [],
      filters: buildAlertsKqlFilter(
        ALERT_GROUP_ID,
        ecs.reduce<string[]>((acc, ecsData) => {
          const alertGroupIdField = getField(ecsData, ALERT_GROUP_ID);
          const alertGroupId = Array.isArray(alertGroupIdField)
            ? alertGroupIdField[0]
            : alertGroupIdField;
          if (!acc.includes(alertGroupId)) {
            return [...acc, alertGroupId];
          }
          return acc;
        }, [])
      ),
    };
  } else if (!Array.isArray(ecs) || ecs.length === 1) {
    const ecsData = Array.isArray(ecs) ? ecs[0] : ecs;
    const alertGroupIdField = getField(ecsData, ALERT_GROUP_ID);
    const queryMatchField = getFieldKey(ecsData, ALERT_GROUP_ID);
    const alertGroupId = Array.isArray(alertGroupIdField)
      ? alertGroupIdField[0]
      : alertGroupIdField;
    return {
      dataProviders: [
        {
          and: [],
          id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-${TimelineId.active}-alert-id-${alertGroupId}`,
          name: ecsData._id,
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: queryMatchField,
            value: alertGroupId,
            operator: ':' as const,
          },
        },
      ],
      filters: [],
    };
  }
  return { filters: [], dataProviders: [] };
};

interface MightHaveFilters {
  filters?: Filter[];
}

const createThresholdTimeline = async (
  ecsData: Ecs,
  createTimeline: ({ from, timeline, to }: CreateTimelineProps) => void,
  noteContent: string,
  templateValues: {
    filters?: Filter[];
    query?: string;
    dataProviders?: DataProvider[];
    columns?: DataTableModel['columns'];
  },
  getExceptionFilter: GetExceptionFilter
) => {
  try {
    const alertResponse = await KibanaServices.get().http.fetch<
      estypes.SearchResponse<{ '@timestamp': string; [key: string]: unknown }>
    >(DETECTION_ENGINE_QUERY_SIGNALS_URL, {
      version: '2023-10-31',
      method: 'POST',
      body: JSON.stringify(buildAlertsQuery([ecsData._id])),
    });
    const formattedAlertData =
      alertResponse?.hits.hits.reduce<Ecs[]>((acc, { _id, _index, _source = {} }) => {
        return [
          ...acc,
          {
            ...formatAlertToEcsSignal(_source),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _id: _id!,
            _index,
            timestamp: _source['@timestamp'],
          },
        ];
      }, []) ?? [];

    const alertDoc = formattedAlertData[0];
    const params = getField(alertDoc, ALERT_RULE_PARAMETERS);
    const ruleAuthor = getField(alertDoc, ALERT_RULE_CREATED_BY);
    const filters: Filter[] =
      (params as MightHaveFilters).filters ??
      (alertDoc.signal?.rule as MightHaveFilters)?.filters ??
      [];
    // https://github.com/elastic/kibana/issues/126574 - if the provided filter has no `meta` field
    // we expect an empty object to be inserted before calling `createTimeline`
    const augmentedFilters = filters.map((filter) => {
      return filter.meta != null ? filter : { ...filter, meta: {} };
    });
    const language = params.language ?? alertDoc.signal?.rule?.language ?? 'kuery';
    const query = params.query ?? alertDoc.signal?.rule?.query ?? '';
    const indexNames = getField(alertDoc, ALERT_RULE_INDICES) ?? alertDoc.signal?.rule?.index ?? [];

    const { thresholdFrom, thresholdTo, dataProviders } = getThresholdAggregationData(alertDoc);
    const exceptionsFilter = await getExceptionFilter(ecsData);

    const allFilters = (templateValues.filters ?? augmentedFilters).concat(
      !exceptionsFilter ? [] : [exceptionsFilter]
    );

    return createTimeline({
      from: thresholdFrom,
      notes: null,
      timeline: {
        ...timelineDefaults,
        excludedRowRendererIds: [],
        columns: templateValues.columns ?? timelineDefaults.columns,
        description: `_id: ${alertDoc._id}`,
        filters: allFilters,
        dataProviders: templateValues.dataProviders ?? dataProviders,
        id: TimelineId.active,
        indexNames,
        dateRange: {
          start: thresholdFrom,
          end: thresholdTo,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: language,
              expression: templateValues.query ?? query,
            },
            serializedQuery: templateValues.query ?? query,
          },
        },
      },
      to: thresholdTo,
      ruleNote: noteContent,
      ruleAuthor,
    });
  } catch (error) {
    const { toasts } = KibanaServices.get().notifications;
    toasts.addError(error, {
      toastMessage: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createThresholdTimelineFailure',
        {
          defaultMessage: 'Failed to create Timeline for document _id: {id}',
          values: { id: ecsData._id },
        }
      ),
      title: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createThresholdTimelineFailureTitle',
        {
          defaultMessage: 'Failed to create threshold alert Timeline',
        }
      ),
    });
    const from = DEFAULT_FROM_MOMENT.toISOString();
    const to = DEFAULT_TO_MOMENT.toISOString();
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        id: TimelineId.active,
        indexNames: [],
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
      },
      to,
    });
  }
};

export const getNewTermsData = (ecsData: Ecs | Ecs[]) => {
  const normalizedEcsData: Ecs = Array.isArray(ecsData) ? ecsData[0] : ecsData;
  const originalTimeValue = getField(normalizedEcsData, ALERT_ORIGINAL_TIME);
  const newTermsFields: string[] =
    getField(normalizedEcsData, `${ALERT_RULE_PARAMETERS}.new_terms_fields`) ?? [];

  const dataProviderPartials = newTermsFields.map((newTermsField, index) => {
    const newTermsFieldId = newTermsField.replace('.', '-');
    const newTermsValue = getField(normalizedEcsData, ALERT_NEW_TERMS)[index];
    return {
      id: `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-${TimelineId.active}-${newTermsFieldId}-${newTermsValue}`,
      name: newTermsField,
      enabled: true,
      excluded: false,
      kqlQuery: '',
      queryMatch: {
        field: newTermsField,
        value: newTermsValue,
        operator: ':' as const,
      },
      and: [],
    };
  });

  const dataProviders = dataProviderPartials.length
    ? [{ ...dataProviderPartials[0], and: dataProviderPartials.slice(1) }]
    : [];

  return {
    from: originalTimeValue,
    to: moment().toISOString(),
    dataProviders,
  };
};

const createNewTermsTimeline = async (
  ecsData: Ecs,
  createTimeline: ({ from, timeline, to }: CreateTimelineProps) => void,
  noteContent: string,
  templateValues: {
    filters?: Filter[];
    query?: string;
    dataProviders?: DataProvider[];
    columns?: DataTableModel['columns'];
  },
  getExceptionFilter: GetExceptionFilter
) => {
  try {
    const alertResponse = await KibanaServices.get().http.fetch<
      estypes.SearchResponse<{ '@timestamp': string; [key: string]: unknown }>
    >(DETECTION_ENGINE_QUERY_SIGNALS_URL, {
      version: '2023-10-31',
      method: 'POST',
      body: JSON.stringify(buildAlertsQuery([ecsData._id])),
    });
    const formattedAlertData =
      alertResponse?.hits.hits.reduce<Ecs[]>((acc, { _id, _index, _source = {} }) => {
        return [
          ...acc,
          {
            ...formatAlertToEcsSignal(_source),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _id: _id!,
            _index,
            timestamp: _source['@timestamp'],
          },
        ];
      }, []) ?? [];

    const alertDoc = formattedAlertData[0];
    const params = getField(alertDoc, ALERT_RULE_PARAMETERS);
    const filters: Filter[] =
      (params as MightHaveFilters).filters ??
      (alertDoc.signal?.rule as MightHaveFilters)?.filters ??
      [];
    // https://github.com/elastic/kibana/issues/126574 - if the provided filter has no `meta` field
    // we expect an empty object to be inserted before calling `createTimeline`
    const augmentedFilters = filters.map((filter) => {
      return filter.meta != null ? filter : { ...filter, meta: {} };
    });
    const language = params.language ?? alertDoc.signal?.rule?.language ?? 'kuery';
    const query = params.query ?? alertDoc.signal?.rule?.query ?? '';
    const indexNames = getField(alertDoc, ALERT_RULE_INDICES) ?? alertDoc.signal?.rule?.index ?? [];

    const { from, to, dataProviders } = getNewTermsData(alertDoc);
    const filter = await getExceptionFilter(ecsData);

    const allFilters = (templateValues.filters ?? augmentedFilters).concat(!filter ? [] : [filter]);
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        columns: templateValues.columns ?? timelineDefaults.columns,
        excludedRowRendererIds: [],
        description: `_id: ${alertDoc._id}`,
        filters: allFilters,
        dataProviders: templateValues.dataProviders ?? dataProviders,
        id: TimelineId.active,
        indexNames,
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: language,
              expression: templateValues.query ?? query,
            },
            serializedQuery: templateValues.query ?? query,
          },
        },
      },
      to,
      ruleNote: noteContent,
    });
  } catch (error) {
    const { toasts } = KibanaServices.get().notifications;
    toasts.addError(error, {
      toastMessage: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createNewTermsTimelineFailure',
        {
          defaultMessage: 'Failed to create Timeline for document _id: {id}',
          values: { id: ecsData._id },
        }
      ),
      title: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createNewTermsTimelineFailureTitle',
        {
          defaultMessage: 'Failed to create new terms alert Timeline',
        }
      ),
    });
    const from = DEFAULT_FROM_MOMENT.toISOString();
    const to = DEFAULT_TO_MOMENT.toISOString();
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        id: TimelineId.active,
        indexNames: [],
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
      },
      to,
    });
  }
};

const getSuppressedAlertData = (ecsData: Ecs | Ecs[]) => {
  const normalizedEcsData: Ecs = Array.isArray(ecsData) ? ecsData[0] : ecsData;
  const from = getField(normalizedEcsData, ALERT_SUPPRESSION_START);
  const to = getField(normalizedEcsData, ALERT_SUPPRESSION_END);
  const terms: Array<{ field: string; value: string | number }> = getField(
    normalizedEcsData,
    ALERT_SUPPRESSION_TERMS
  );
  const dataProviderPartials = terms.map((term) => {
    const fieldId = term.field.replace('.', '-');
    const id = `send-alert-to-timeline-action-default-draggable-event-details-value-formatted-field-value-${TimelineId.active}-${fieldId}-${term.value}`;
    return term.value == null
      ? {
          id,
          name: fieldId,
          enabled: true,
          excluded: true,
          kqlQuery: '',
          queryMatch: {
            field: term.field,
            value: '',
            operator: ':*' as const,
          },
        }
      : {
          id,
          name: fieldId,
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: term.field,
            value: term.value,
            operator: ':' as const,
          },
        };
  });
  const dataProvider = {
    ...dataProviderPartials[0],
    and: dataProviderPartials.slice(1),
  };
  return {
    from,
    to,
    dataProviders: [dataProvider],
  };
};

const createSuppressedTimeline = async (
  ecsData: Ecs,
  createTimeline: ({ from, timeline, to }: CreateTimelineProps) => void,
  noteContent: string,
  templateValues: {
    filters?: Filter[];
    query?: string;
    dataProviders?: DataProvider[];
    columns?: DataTableModel['columns'];
  },
  getExceptionFilter: GetExceptionFilter
) => {
  try {
    const alertResponse = await KibanaServices.get().http.fetch<
      estypes.SearchResponse<{ '@timestamp': string; [key: string]: unknown }>
    >(DETECTION_ENGINE_QUERY_SIGNALS_URL, {
      version: '2023-10-31',
      method: 'POST',
      body: JSON.stringify(buildAlertsQuery([ecsData._id])),
    });
    const formattedAlertData =
      alertResponse?.hits.hits.reduce<Ecs[]>((acc, { _id, _index, _source = {} }) => {
        return [
          ...acc,
          {
            ...formatAlertToEcsSignal(_source),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _id: _id!,
            _index,
            timestamp: _source['@timestamp'],
          },
        ];
      }, []) ?? [];

    const alertDoc = formattedAlertData[0];
    const params = getField(alertDoc, ALERT_RULE_PARAMETERS);
    const filters: Filter[] =
      (params as MightHaveFilters).filters ??
      (alertDoc.signal?.rule as MightHaveFilters)?.filters ??
      [];
    // https://github.com/elastic/kibana/issues/126574 - if the provided filter has no `meta` field
    // we expect an empty object to be inserted before calling `createTimeline`
    const augmentedFilters = filters.map((filter) => {
      return filter.meta != null ? filter : { ...filter, meta: {} };
    });
    const language = params.language ?? alertDoc.signal?.rule?.language ?? 'kuery';
    const query = params.query ?? alertDoc.signal?.rule?.query ?? '';
    const indexNames = getField(alertDoc, ALERT_RULE_INDICES) ?? alertDoc.signal?.rule?.index ?? [];

    const { from, to, dataProviders } = getSuppressedAlertData(alertDoc);
    const exceptionsFilter = await getExceptionFilter(alertDoc);

    const allFilters = (templateValues.filters ?? augmentedFilters).concat(
      !exceptionsFilter ? [] : [exceptionsFilter]
    );

    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        excludedRowRendererIds: [],
        columns: templateValues.columns ?? timelineDefaults.columns,
        description: `_id: ${alertDoc._id}`,
        filters: allFilters,
        dataProviders: templateValues.dataProviders ?? dataProviders,
        id: TimelineId.active,
        indexNames,
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: language,
              expression: templateValues.query ?? query,
            },
            serializedQuery: templateValues.query ?? query,
          },
        },
      },
      to,
      ruleNote: noteContent,
    });
  } catch (error) {
    const { toasts } = KibanaServices.get().notifications;
    toasts.addError(error, {
      toastMessage: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createSuppressedTimelineFailure',
        {
          defaultMessage: 'Failed to create Timeline for document _id: {id}',
          values: { id: ecsData._id },
        }
      ),
      title: i18n.translate(
        'xpack.securitySolution.detectionEngine.alerts.createSuppressedTimelineFailureTitle',
        {
          defaultMessage: 'Failed to create suppressed alert Timeline',
        }
      ),
    });
    const from = DEFAULT_FROM_MOMENT.toISOString();
    const to = DEFAULT_TO_MOMENT.toISOString();
    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        id: TimelineId.active,
        indexNames: [],
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
      },
      to,
    });
  }
};

export const sendBulkEventsToTimelineAction = async (
  createTimeline: CreateTimeline,
  ecs: Ecs[],
  prefer: 'dataProvider' | 'KqlFilter' = 'dataProvider',
  label?: string
) => {
  const eventIds = Array.isArray(ecs) ? ecs.map((d) => d._id) : [];

  const { to, from } = determineToAndFrom({ ecs });

  const { dataProviders, filters } = buildTimelineDataProviderOrFilter(
    eventIds,
    prefer,
    label || `${ecs.length} event IDs`
  );

  await createTimeline({
    from,
    notes: null,
    timeline: {
      ...timelineDefaults,
      excludedRowRendererIds: [],
      dataProviders,
      id: TimelineId.active,
      indexNames: [],
      dateRange: {
        start: from,
        end: to,
      },
      eventType: 'all',
      filters,
      kqlQuery: {
        filterQuery: {
          kuery: {
            kind: 'kuery',
            expression: '',
          },
          serializedQuery: '',
        },
      },
    },
    to,
  });
};

export const sendAlertToTimelineAction = async ({
  createTimeline,
  ecsData: ecs,
  searchStrategyClient,
  getExceptionFilter,
}: SendAlertToTimelineActionProps) => {
  /* FUTURE DEVELOPER
   * We are making an assumption here that if you have an array of ecs data they are all coming from the same rule
   * but we still want to determine the filter for each alerts
   *
   *  New Update: Wherever we need to add multiple alerts/events to the timeline, new function `sendBulkEventsToTimelineAction`
   *  should be invoked
   */

  const ecsData: Ecs = Array.isArray(ecs) ? ecs[0] : ecs;
  const ruleNote = getField(ecsData, ALERT_RULE_NOTE);
  const ruleAuthor = getField(ecsData, ALERT_RULE_CREATED_BY);
  const noteContent = Array.isArray(ruleNote) && ruleNote.length > 0 ? ruleNote[0] : '';
  const ruleTimelineId = getField(ecsData, ALERT_RULE_TIMELINE_ID);
  const timelineId = !isEmpty(ruleTimelineId)
    ? Array.isArray(ruleTimelineId)
      ? ruleTimelineId[0]
      : ruleTimelineId
    : '';
  const { to, from } = determineToAndFrom({ ecs });
  // For now we do not want to populate the template timeline if we have alertIds
  if (!isEmpty(timelineId)) {
    try {
      const [responseTimeline, eventDataResp] = await Promise.all([
        getTimelineTemplate(timelineId),
        lastValueFrom(
          searchStrategyClient.search<
            TimelineEventsDetailsRequestOptionsInput,
            TimelineEventsDetailsStrategyResponse
          >(
            {
              defaultIndex: [],
              indexName: ecsData._index ?? '',
              eventId: ecsData._id,
              factoryQueryType: TimelineEventsQueries.details,
            },
            {
              strategy: 'timelineSearchStrategy',
            }
          )
        ),
      ]);
      const eventData: TimelineEventsDetailsItem[] = eventDataResp.data ?? [];
      if (!isEmpty(responseTimeline)) {
        const timelineTemplate = responseTimeline;
        const { timeline, notes } = formatTimelineResponseToModel(
          timelineTemplate,
          true,
          timelineTemplate.timelineType ?? TimelineTypeEnum.default
        );
        const query = replaceTemplateFieldFromQuery(
          timeline.kqlQuery?.filterQuery?.kuery?.expression ?? '',
          eventData,
          timeline.timelineType
        );
        const filters = replaceTemplateFieldFromMatchFilters(timeline.filters ?? [], eventData);
        const dataProviders = replaceTemplateFieldFromDataProviders(
          timeline.dataProviders ?? [],
          eventData,
          timeline.timelineType
        );
        // threshold with template
        if (isThresholdAlert(ecsData)) {
          return createThresholdTimeline(
            ecsData,
            createTimeline,
            noteContent,
            {
              filters,
              query,
              dataProviders,
              columns: timeline.columns,
            },
            getExceptionFilter
          );
        } else if (isNewTermsAlert(ecsData)) {
          return createNewTermsTimeline(
            ecsData,
            createTimeline,
            noteContent,
            {
              filters,
              query,
              dataProviders,
              columns: timeline.columns,
            },
            getExceptionFilter
          );
          // The Query field should remain unpopulated with the suppressed EQL/ES|QL alert.
        } else if (
          isSuppressedAlert(ecsData) &&
          !isEqlAlert(ecsData) &&
          !isEsqlAlert(ecsData) &&
          !isMlAlert(ecsData)
        ) {
          return createSuppressedTimeline(
            ecsData,
            createTimeline,
            noteContent,
            {
              filters,
              query,
              dataProviders,
              columns: timeline.columns,
            },
            getExceptionFilter
          );
        } else {
          return createTimeline({
            from,
            timeline: {
              ...timeline,
              excludedRowRendererIds: [],
              title: '',
              timelineType: TimelineTypeEnum.default,
              templateTimelineId: null,
              status: TimelineStatusEnum.draft,
              dataProviders,
              eventType: 'all',
              filters,
              dateRange: {
                start: from,
                end: to,
              },
              kqlQuery: {
                filterQuery: {
                  kuery: {
                    kind: timeline.kqlQuery?.filterQuery?.kuery?.kind ?? 'kuery',
                    expression: query,
                  },
                  serializedQuery: convertKueryToElasticSearchQuery(query),
                },
              },
              noteIds: notes?.map((n) => n.noteId) ?? [],
              show: true,
            },
            to,
            ruleNote: noteContent,
            ruleAuthor,
            notes: notes ?? null,
          });
        }
      }
    } catch (error) {
      /* eslint-disable-next-line no-console */
      console.error(error);
      return createTimeline({
        from,
        notes: null,
        timeline: {
          ...timelineDefaults,
          id: TimelineId.active,
          indexNames: [],
          dateRange: {
            start: from,
            end: to,
          },
          eventType: 'all',
        },
        to,
      });
    }
  } else if (isThresholdAlert(ecsData)) {
    return createThresholdTimeline(ecsData, createTimeline, noteContent, {}, getExceptionFilter);
  } else if (isNewTermsAlert(ecsData)) {
    return createNewTermsTimeline(ecsData, createTimeline, noteContent, {}, getExceptionFilter);
    // The Query field should remain unpopulated with the suppressed EQL/ES|QL alert.
  } else if (
    isSuppressedAlert(ecsData) &&
    !isEqlAlert(ecsData) &&
    !isEsqlAlert(ecsData) &&
    !isMlAlert(ecsData)
  ) {
    return createSuppressedTimeline(ecsData, createTimeline, noteContent, {}, getExceptionFilter);
  } else {
    let { dataProviders, filters } = buildTimelineDataProviderOrFilter(
      [ecsData._id],
      'dataProvider'
    );
    if (isEqlAlertWithGroupId(ecsData)) {
      const tempEql = buildEqlDataProviderOrFilter([ecsData._id], ecs);
      dataProviders = tempEql.dataProviders;
      filters = tempEql.filters;
    }

    return createTimeline({
      from,
      notes: null,
      timeline: {
        ...timelineDefaults,
        excludedRowRendererIds: [],
        dataProviders,
        id: TimelineId.active,
        indexNames: [],
        dateRange: {
          start: from,
          end: to,
        },
        eventType: 'all',
        filters,
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: 'kuery',
              expression: '',
            },
            serializedQuery: '',
          },
        },
      },
      to,
      ruleNote: noteContent,
      ruleAuthor,
    });
  }
};
