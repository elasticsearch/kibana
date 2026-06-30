/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type {
  GetViewInAppRelativeUrlFnOpts,
  ActionGroupIdsOf,
  AlertInstanceContext as AlertContext,
  AlertInstanceState as AlertState,
  RuleTypeState,
  RuleExecutorOptions,
} from '@kbn/alerting-plugin/server';
import { AlertsClientError } from '@kbn/alerting-plugin/server';
import type { KibanaRequest } from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import datemath from '@kbn/datemath';
import type { ESSearchResponse } from '@kbn/es-types';
import {
  getAlertDetailsUrl,
  observabilityFeatureId,
  observabilityPaths,
  ProcessorEvent,
} from '@kbn/observability-plugin/common';
import { termQuery, termsQuery } from '@kbn/observability-plugin/server';
import {
  ALERT_EVALUATION_THRESHOLD,
  ALERT_EVALUATION_VALUE,
  ALERT_REASON,
  ALERT_SEVERITY,
  ApmRuleType,
} from '@kbn/rule-data-utils';
import type { ObservabilityApmAlert } from '@kbn/alerts-as-data-utils';
import { addSpaceIdToPath } from '@kbn/core-spaces-common';
import { asyncForEach } from '@kbn/std';
import { compact } from 'lodash';
import { anomalyParamsSchema } from '@kbn/response-ops-rule-params/apm_anomaly';
import { getSeverity } from '../../../../../common/anomaly_detection';
import {
  ANOMALY_DETECTOR_TYPE,
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_TYPE,
} from '../../../../../common/es_fields/apm';
import {
  getEnvironmentEsField,
  getEnvironmentLabel,
} from '../../../../../common/environment_filter_values';
import type {
  THRESHOLD_MET_GROUP,
  ApmRuleParamsType,
  AdditionalContext,
} from '../../../../../common/rules/apm_rule_types';
import {
  ANOMALY_ALERT_SEVERITY_TYPES,
  APM_SERVER_FEATURE_ID,
  formatAnomalyReason,
  RULE_TYPES_CONFIG,
} from '../../../../../common/rules/apm_rule_types';
import { asMutableArray } from '../../../../../common/utils/as_mutable_array';
import { getAlertUrlTransaction } from '../../../../../common/utils/formatters';
import { getMLJobs } from '../../../service_map/get_service_anomalies';
import { apmActionVariables } from '../../action_variables';
import type { RegisterRuleDependencies } from '../../register_apm_rule_types';
import { ApmRuleTypeAlertDefinition } from '../../register_apm_rule_types';
import { getServiceGroupFieldsForAnomaly } from './get_service_group_fields_for_anomaly';
import {
  getAnomalyDetectorIndex,
  getAnomalyDetectorType,
} from '../../../../../common/anomaly_detection/apm_ml_detectors';

const ruleTypeConfig = RULE_TYPES_CONFIG[ApmRuleType.Anomaly];

type AnomalyRuleTypeParams = ApmRuleParamsType[ApmRuleType.Anomaly];
type AnomalyActionGroups = ActionGroupIdsOf<typeof THRESHOLD_MET_GROUP>;
type AnomalyRuleTypeState = RuleTypeState;
type AnomalyAlertState = AlertState;
type AnomalyAlertContext = AlertContext;
type AnomalyAlert = ObservabilityApmAlert;

export function registerAnomalyRuleType({
  alerting,
  alertsLocator,
  getApmIndices,
  basePath,
  logger,
  ml,
  ruleDataClient,
}: RegisterRuleDependencies) {
  if (!alerting) {
    throw new Error('Cannot register anomaly rule type. The alerting plugin needs to be enabled.');
  }

  alerting.registerType({
    id: ApmRuleType.Anomaly,
    name: ruleTypeConfig.name,
    actionGroups: ruleTypeConfig.actionGroups,
    doesSetRecoveryContext: true,
    defaultActionGroupId: ruleTypeConfig.defaultActionGroupId,
    validate: { params: anomalyParamsSchema },
    schemas: {
      params: {
        type: 'config-schema',
        schema: anomalyParamsSchema,
      },
    },
    actionVariables: {
      context: [
        apmActionVariables.alertDetailsUrl,
        apmActionVariables.environment,
        apmActionVariables.reason,
        apmActionVariables.serviceName,
        apmActionVariables.threshold,
        apmActionVariables.transactionType,
        apmActionVariables.triggerValue,
        apmActionVariables.viewInAppUrl,
      ],
    },
    category: DEFAULT_APP_CATEGORIES.observability.id,
    producer: APM_SERVER_FEATURE_ID,
    solution: observabilityFeatureId,
    minimumLicenseRequired: 'basic',
    isExportable: true,
    executor: async (
      options: RuleExecutorOptions<
        AnomalyRuleTypeParams,
        AnomalyRuleTypeState,
        AnomalyAlertState,
        AnomalyAlertContext,
        AnomalyActionGroups,
        AnomalyAlert
      >
    ) => {
      if (!ml) {
        return { state: {} };
      }

      const { params, services, spaceId, getTimeRange, previousStartedAt } = options;
      const { alertsClient, savedObjectsClient, scopedClusterClient, uiSettingsClient } = services;
      if (!alertsClient) {
        throw new AlertsClientError();
      }

      const apmIndices = await getApmIndices(savedObjectsClient);

      const ruleParams = params;
      const request = {} as KibanaRequest;
      const { mlAnomalySearch } = ml.mlSystemProvider(request, savedObjectsClient);
      const anomalyDetectors = ml.anomalyDetectorsProvider(request, savedObjectsClient);

      const mlJobs = await getMLJobs(anomalyDetectors, ruleParams.environment);

      const selectedOption = ANOMALY_ALERT_SEVERITY_TYPES.find(
        (option) => option.type === ruleParams.anomalySeverityType
      );

      if (!selectedOption) {
        throw new Error(
          `Anomaly alert severity type ${ruleParams.anomalySeverityType} is not supported.`
        );
      }

      const threshold = selectedOption.threshold;

      if (mlJobs.length === 0) {
        return { state: {} };
      }

      // Lookback window must be at least 30m to support rules created before this change where default was 15m
      const minimumWindow = '30m';
      const requestedWindow = `${ruleParams.windowSize}${ruleParams.windowUnit}`;

      const window =
        datemath.parse(`now-${minimumWindow}`)!.valueOf() <
        datemath.parse(`now-${requestedWindow}`)!.valueOf()
          ? minimumWindow
          : requestedWindow;

      const { dateStart } = getTimeRange(window);

      // Match docs ingested since the previous run so each is alerted on once. First run falls back to dateStart.
      const lastRunTime = previousStartedAt ? previousStartedAt.toISOString() : dateStart;

      const jobIds = mlJobs.map((job) => job.jobId);
      const anomalySearchParams = {
        track_total_hits: false,
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { result_type: 'record' } },
              { terms: { job_id: jobIds } },
              { term: { is_interim: false } },
              {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    {
                      bool: {
                        filter: [
                          { exists: { field: 'event.ingested' } },
                          { range: { 'event.ingested': { gte: lastRunTime } } },
                        ],
                      },
                    },
                    {
                      bool: {
                        must_not: { exists: { field: 'event.ingested' } },
                        filter: [{ range: { timestamp: { gte: dateStart } } }],
                      },
                    },
                  ],
                },
              },
              ...termQuery('partition_field_value', ruleParams.serviceName, {
                queryEmptyString: false,
              }),
              ...termQuery('by_field_value', ruleParams.transactionType, {
                queryEmptyString: false,
              }),
              ...termsQuery(
                'detector_index',
                ...(ruleParams.anomalyDetectorTypes?.map((type) => getAnomalyDetectorIndex(type)) ??
                  [])
              ),
            ] as QueryDslQueryContainer[],
          },
        },
        aggs: {
          anomaly_groups: {
            multi_terms: {
              terms: [
                { field: 'partition_field_value' },
                { field: 'by_field_value' },
                { field: 'job_id' },
                { field: 'detector_index' },
              ],
              size: 1000,
              order: { 'latest_score.record_score': 'desc' as const },
            },
            aggs: {
              latest_score: {
                top_metrics: {
                  metrics: asMutableArray([
                    { field: 'record_score' },
                    { field: 'partition_field_value' },
                    { field: 'by_field_value' },
                    { field: 'job_id' },
                    { field: 'timestamp' },
                    { field: 'bucket_span' },
                    { field: 'detector_index' },
                  ] as const),
                  sort: {
                    timestamp: 'desc' as const,
                  },
                },
              },
            },
          },
        },
      };

      const response: ESSearchResponse<unknown, typeof anomalySearchParams> =
        (await mlAnomalySearch(anomalySearchParams, [])) as any;

      const anomalies =
        response.aggregations?.anomaly_groups.buckets
          .map((bucket) => {
            const latest = bucket.latest_score.top[0].metrics;

            const job = mlJobs.find((j) => j.jobId === latest.job_id);

            if (!job) {
              logger.debug(`Could not find matching job for job id ${latest.job_id}`);
              return undefined;
            }

            return {
              serviceName: latest.partition_field_value as string,
              transactionType: latest.by_field_value as string,
              environment: job.environment,
              score: latest.record_score as number,
              detectorType: getAnomalyDetectorType(latest.detector_index as number),
              timestamp: Date.parse(latest.timestamp as string),
              bucketSpan: latest.bucket_span as number,
              bucketKey: bucket.key,
            };
          })
          .filter((anomaly) => (anomaly ? anomaly.score >= threshold : false)) ?? [];

      await asyncForEach(compact(anomalies), async (anomaly) => {
        const {
          serviceName,
          environment,
          transactionType,
          score,
          detectorType,
          timestamp,
          bucketSpan,
          bucketKey,
        } = anomaly;

        const eventSourceFields = await getServiceGroupFieldsForAnomaly({
          apmIndices,
          scopedClusterClient,
          savedObjectsClient,
          uiSettingsClient,
          serviceName,
          environment,
          transactionType,
          timestamp,
          bucketSpan,
        });

        const severityLevel = getSeverity(score);
        const reasonMessage = formatAnomalyReason({
          anomalyScore: score,
          serviceName,
          severityLevel,
          windowSize: params.windowSize,
          windowUnit: params.windowUnit,
          detectorType,
        });

        const alertId = bucketKey.join('_');

        const { uuid } = alertsClient.report({
          id: alertId,
          actionGroup: ruleTypeConfig.defaultActionGroupId,
        });

        const relativeViewInAppUrl = getAlertUrlTransaction(
          serviceName,
          getEnvironmentEsField(environment)?.[SERVICE_ENVIRONMENT],
          transactionType
        );
        const viewInAppUrl = addSpaceIdToPath(
          basePath.publicBaseUrl,
          spaceId,
          relativeViewInAppUrl
        );
        const alertDetailsUrl = await getAlertDetailsUrl(basePath, spaceId, uuid);

        const payload = {
          [ANOMALY_DETECTOR_TYPE]: detectorType,
          [SERVICE_NAME]: serviceName,
          ...getEnvironmentEsField(environment),
          [TRANSACTION_TYPE]: transactionType,
          [PROCESSOR_EVENT]: ProcessorEvent.transaction,
          [ALERT_SEVERITY]: severityLevel,
          [ALERT_EVALUATION_VALUE]: score,
          [ALERT_EVALUATION_THRESHOLD]: threshold,
          [ALERT_REASON]: reasonMessage,
          ...eventSourceFields,
        };

        const context = {
          alertDetailsUrl,
          environment: getEnvironmentLabel(environment),
          reason: reasonMessage,
          serviceName,
          threshold: selectedOption?.label,
          transactionType,
          triggerValue: severityLevel,
          viewInAppUrl,
        };

        alertsClient.setAlertData({
          id: alertId,
          payload,
          context,
        });
      });
      // Handle recovered alerts context
      const recoveredAlerts = alertsClient.getRecoveredAlerts() ?? [];
      for (const recoveredAlert of recoveredAlerts) {
        const alertHits = recoveredAlert.hit as AdditionalContext;
        const recoveredAlertId = recoveredAlert.alert.getId();
        const alertUuid = recoveredAlert.alert.getUuid();
        const alertDetailsUrl = await getAlertDetailsUrl(basePath, spaceId, alertUuid);

        const environment = alertHits?.[SERVICE_ENVIRONMENT];
        const serviceName = alertHits?.[SERVICE_NAME];
        const transactionType = alertHits?.[TRANSACTION_TYPE];
        const severityLevel = alertHits?.[ALERT_SEVERITY];
        const reasonMessage = alertHits?.[ALERT_REASON];

        const relativeViewInAppUrl = getAlertUrlTransaction(
          serviceName,
          environment,
          transactionType
        );
        const viewInAppUrl = addSpaceIdToPath(
          basePath.publicBaseUrl,
          spaceId,
          relativeViewInAppUrl
        );
        const recoveredContext = {
          alertDetailsUrl,
          environment: getEnvironmentLabel(environment),
          reason: reasonMessage,
          serviceName,
          threshold: selectedOption?.label,
          transactionType,
          triggerValue: severityLevel,
          viewInAppUrl,
        };
        alertsClient.setAlertData({
          id: recoveredAlertId,
          context: recoveredContext,
        });
      }

      return { state: {} };
    },
    alerts: ApmRuleTypeAlertDefinition,
    getViewInAppRelativeUrl: ({ rule }: GetViewInAppRelativeUrlFnOpts<{}>) =>
      observabilityPaths.ruleDetails(rule.id),
  });
}
