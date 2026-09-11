/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useLayoutEffect } from 'react';
import { EuiCallOut, EuiFlexGroup, EuiLink } from '@elastic/eui';
import { COMPARATORS } from '@kbn/alerting-comparators';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { formatAlertEvaluationValue, Threshold } from '@kbn/observability-plugin/public';
import { useChartThemes } from '@kbn/observability-shared-plugin/public';
import { getPaddedAlertTimeRange } from '@kbn/observability-get-padded-alert-time-range-util';
import {
  ALERT_END,
  ALERT_EVALUATION_THRESHOLD,
  ALERT_EVALUATION_VALUE,
  ALERT_RULE_TYPE_ID,
  ALERT_SEVERITY,
  ALERT_START,
} from '@kbn/rule-data-utils';
import type { ApmRuleType } from '@kbn/rule-data-utils';
import type { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import type { CoreStart } from '@kbn/core/public';
import type { AnomalyDetectorType } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import {
  ANOMALY_DETECTOR_TYPE,
  ERROR_GROUP_ID,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../../../common/es_fields/apm';
import { getAlertUrlErrorDetails } from '../../../../../common/utils/formatters';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { TimeRangeMetadataContextProvider } from '../../../../context/time_range_metadata/time_range_metadata_context';
import { getComparisonChartTheme } from '../../../shared/time_comparison/get_comparison_chart_theme';
import { createCallApmApi } from '../../../../services/rest/create_call_apm_api';
import {
  isAnomalyRuleType,
  isErrorCountRuleType,
  getAlertDetailsRangeStart,
  getAnomalyTimestamp,
} from './helpers';
import { CHART_LAYOUTS, DEFAULT_LAYOUT } from './types';
import type { AlertDetailsAppSectionProps } from './types';
import { AlertDetailsCharts } from './alert_details_charts';
import { AlertDetailsServiceMapSection } from '../alert_details_service_map_section';
import { AnomalyAlertCallout } from './anomaly_alert_callout';
import type { AnomalyChartInfo } from './anomaly_severity_badge';

export function AlertDetailsAppSection({
  rule,
  alert,
  timeZone,
  setSources,
}: AlertDetailsAppSectionProps) {
  const { services } = useKibana();
  createCallApmApi(services as CoreStart);

  const alertRuleTypeId = alert.fields[ALERT_RULE_TYPE_ID] as ApmRuleType;
  const alertEvaluationValue = alert.fields[ALERT_EVALUATION_VALUE];
  const alertEvaluationThreshold = alert.fields[ALERT_EVALUATION_THRESHOLD];
  const alertSeverity = alert.fields[ALERT_SEVERITY] as ML_ANOMALY_SEVERITY | undefined;
  const detectorType = alert.fields[ANOMALY_DETECTOR_TYPE] as AnomalyDetectorType | undefined;
  const isAnomaly = isAnomalyRuleType(alertRuleTypeId);
  const chartLayout = CHART_LAYOUTS[detectorType ?? alertRuleTypeId] ?? DEFAULT_LAYOUT;

  const environment = alert.fields[SERVICE_ENVIRONMENT];
  const serviceName = String(alert.fields[SERVICE_NAME]);
  const transactionName = alert.fields[TRANSACTION_NAME];
  const transactionType = alert.fields[TRANSACTION_TYPE];
  const errorGroupingKey = alert.fields[ERROR_GROUP_ID];

  const anomalyTimestamp = useMemo(() => getAnomalyTimestamp(alert), [alert]);

  // For anomaly alerts, anchor the padded time range on the anomaly timestamp when it
  // precedes the alert start (ML detection delay can push ALERT_START past the anomaly).
  const alertStart = alert.fields[ALERT_START]!;
  const rangeStart = getAlertDetailsRangeStart({
    alertStart,
    isAnomaly,
    anomalyTimestamp,
  });
  const timeRange = getPaddedAlertTimeRange(rangeStart, alert.fields[ALERT_END]);
  const comparisonChartTheme = getComparisonChartTheme();
  const chartThemes = useChartThemes();

  const thresholdComponent = useMemo(() => {
    if (isAnomaly) {
      return undefined;
    }

    if (!alertEvaluationValue || !alertEvaluationThreshold) return undefined;

    return (
      <Threshold
        chartProps={chartThemes}
        id={`${chartLayout.primary}-threshold`}
        threshold={[alertEvaluationThreshold]}
        value={alertEvaluationValue}
        valueFormatter={(d: number) => String(formatAlertEvaluationValue(alertRuleTypeId, d))}
        title={i18n.translate('xpack.apm.alertDetails.thresholdTitle', {
          defaultMessage: 'Threshold breached',
        })}
        comparator={COMPARATORS.GREATER_THAN}
      />
    );
  }, [
    isAnomaly,
    alertEvaluationValue,
    alertEvaluationThreshold,
    chartThemes,
    chartLayout.primary,
    alertRuleTypeId,
  ]);

  const anomaly = useMemo<AnomalyChartInfo | undefined>(() => {
    if (!isAnomaly || !alertSeverity || alertEvaluationValue == null) {
      return undefined;
    }

    return {
      severity: alertSeverity,
      score: Number(alertEvaluationValue),
      ...(anomalyTimestamp !== undefined ? { timestamp: anomalyTimestamp } : {}),
    };
  }, [alertEvaluationValue, alertSeverity, anomalyTimestamp, isAnomaly]);

  useLayoutEffect(() => {
    if (!isErrorCountRuleType(alertRuleTypeId) || !errorGroupingKey) {
      setSources([]);
      return;
    }

    const errorDetailsHref = services.http?.basePath.prepend(
      getAlertUrlErrorDetails(serviceName, errorGroupingKey, environment)
    );

    setSources([
      {
        label: ERROR_GROUP_ID,
        value: (
          <EuiLink
            data-test-subj="apmAlertDetailsErrorGroupKeyLink"
            data-ebt-action="openInApm"
            data-ebt-element="alertDetailsSources"
            data-ebt-detail={alertRuleTypeId}
            href={errorDetailsHref}
          >
            {errorGroupingKey}
          </EuiLink>
        ),
      },
    ]);
  }, [
    alertRuleTypeId,
    environment,
    errorGroupingKey,
    serviceName,
    services.http?.basePath,
    setSources,
  ]);

  const { from, to } = timeRange;

  if (!from || !to) {
    return (
      <EuiCallOut
        announceOnMount
        title={
          <FormattedMessage
            id="xpack.apm.alertDetails.error.toastTitle"
            defaultMessage="An error occurred when identifying the alert time range."
          />
        }
        color="danger"
        iconType="error"
      >
        <p>
          <FormattedMessage
            id="xpack.apm.alertDetails.error.toastDescription"
            defaultMessage="Unable to load the alert details page's charts. Please try to refresh the page if the alert is newly created"
          />
        </p>
      </EuiCallOut>
    );
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      {isAnomaly && alertSeverity && detectorType && alertEvaluationThreshold != null && (
        <AnomalyAlertCallout
          severity={alertSeverity}
          detectorType={detectorType}
          alertEvaluationThreshold={Number(alertEvaluationThreshold)}
        />
      )}
      <TimeRangeMetadataContextProvider
        start={from}
        end={to}
        kuery=""
        useSpanName={false}
        uiSettings={services.uiSettings!}
      >
        <ChartPointerEventContextProvider>
          <AlertDetailsCharts
            alert={alert}
            alertRuleTypeId={alertRuleTypeId}
            chartLayout={chartLayout}
            serviceName={serviceName}
            environment={environment}
            transactionName={transactionName}
            transactionType={transactionType}
            errorGroupingKey={errorGroupingKey}
            ruleAggregationType={rule.params.aggregationType}
            comparisonChartTheme={comparisonChartTheme}
            timeZone={timeZone}
            from={from}
            to={to}
            thresholdComponent={thresholdComponent}
            anomaly={anomaly}
          />
        </ChartPointerEventContextProvider>
      </TimeRangeMetadataContextProvider>
      <AlertDetailsServiceMapSection
        alert={alert}
        rule={rule}
        timeZone={timeZone}
        setSources={setSources}
      />
    </EuiFlexGroup>
  );
}

// eslint-disable-next-line import/no-default-export
export default AlertDetailsAppSection;
